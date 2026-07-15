/**
 * Signals — 9 стратегий · Solana + Robinhood Chain
 *
 * Реальные токены с DexScreener (300+ источников), фильтрация по параметрам
 * каждой стратегии. Ручная торговля — пользователь сам решает покупать или нет.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  RefreshCw, ExternalLink, TrendingUp, TrendingDown,
  AlertTriangle, Loader2, Zap, Shield,
} from "lucide-react";
import Header from "@/components/Header";
import {
  STRATEGIES,
  tokenMatchesStrategy,
  scoreTokenForStrategy,
  type Strategy,
  type ScanResult,
} from "@/lib/tradingEngine";

// ── Constants ─────────────────────────────────────────────────────────────────

const RISK_COLOR: Record<Strategy["riskLevel"], string> = {
  "low":       "#4ADE80",
  "medium":    "#C9A84C",
  "high":      "#FB923C",
  "very-high": "#FF4D5E",
};

const RISK_LABEL: Record<Strategy["riskLevel"], string> = {
  "low":       "Низкий",
  "medium":    "Средний",
  "high":      "Высокий",
  "very-high": "Очень высокий",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format how long ago a PumpFun→PumpSwap migration happened */
function fmtMigratedAgo(pairCreatedAt: number | null): string {
  if (!pairCreatedAt) return "";
  const diffMs = Date.now() - pairCreatedAt;
  if (diffMs < 0) return "";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1)   return "только что";
  if (mins < 60)  return `${mins}м назад`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}ч назад`;
  const days = Math.floor(hrs / 24);
  return `${days}д назад`;
}

function fmtNum(n: number): string {
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(v: number): string {
  if (!isFinite(v)) return "—";
  const s = v > 0 ? "+" : "";
  if (Math.abs(v) >= 10_000) return `${s}${(v / 1000).toFixed(0)}K%`;
  if (Math.abs(v) >= 1_000)  return `${s}${(v / 1000).toFixed(1)}K%`;
  if (Math.abs(v) >= 100)    return `${s}${v.toFixed(0)}%`;
  return `${s}${v.toFixed(2)}%`;
}
function pctColor(v: number) {
  return v > 2 ? "#4ADE80" : v < -2 ? "#FF4D5E" : "rgba(255,255,255,0.45)";
}

// Compute AI score inline (same formula as tradingEngine)
function computeScore(t: Pick<ScanResult, "change5m"|"change1h"|"change24h"|"volSpikeMultiplier">): { score: number; signal: "BUY"|"SELL"|"HOLD" } {
  let score = 50;
  const { change5m: c5, change1h: c1, change24h: c24, volSpikeMultiplier: spike } = t;
  if      (c1 > 8)  score += 18; else if (c1 > 3)  score += 10;
  else if (c1 > 1)  score += 5;  else if (c1 < -5) score -= 18; else if (c1 < -2) score -= 10;
  if      (c24 > 20) score += 10; else if (c24 > 8)  score += 5;
  else if (c24 < -20) score -= 10; else if (c24 < -8) score -= 5;
  if (c5 > 2) score += 8; else if (c5 < -2) score -= 8;
  if      (spike > 5) score += 18; else if (spike > 3) score += 12; else if (spike > 2) score += 6;
  score = Math.max(0, Math.min(100, score));
  // Threshold 55 (not 62) — allows moderate momentum tokens through requireBuyAiSignal
  const signal: "BUY"|"SELL"|"HOLD" = score >= 55 ? "BUY" : score <= 38 ? "SELL" : "HOLD";
  return { score, signal };
}

// ── API fetch ─────────────────────────────────────────────────────────────────

type Network = "solana" | "robinhood";

/**
 * Build a DexScreener screener URL for a given strategy + network.
 * All strategies use their own mcapMin + liquidityMin as the screener's
 * min filters; mcapMax and other signal filters are applied client-side
 * by tokenMatchesStrategy().
 *
 * NOTE: profile=0 avoids Cloudflare bot detection on some chains (e.g. Robinhood).
 * Robinhood uses ONE shared URL (no min filters) — all 80 tokens fetched once,
 * then filtered per-strategy client-side by tokenMatchesStrategy().
 */

// Two Solana screener pools + one Robinhood pool (3 unique URLs = 3 browser launches max).
// NOTE: DexScreener ignores maxPairAge URL param — age filtering is done client-side only.
// All 3 pools return ~99 trending tokens; pool differences drive different MCap floors.
//   LARGE  (minMcap=150K, H6 trending): ultra-safe, safe-migration, balanced, smart-money
//   SMALL  (minMcap=20K,  H6 trending): early-migration, volume-spike, degen, hype, dip-recovery
const SOL_LARGE_URL =
  `https://dexscreener.com/?rankBy=trendingScoreH6&order=desc&chainIds=solana&dexIds=pumpswap&minLiq=10000&minMarketCap=150000&profile=0`;
const SOL_SMALL_URL =
  `https://dexscreener.com/?rankBy=trendingScoreH6&order=desc&chainIds=solana&dexIds=pumpswap&minLiq=5000&minMarketCap=20000&profile=0`;
const RH_SCREENER_URL =
  `https://dexscreener.com/?rankBy=trendingScoreH6&order=desc&chainIds=robinhood&profile=0`;

// Strategy IDs that belong to the large-cap pool
const LARGE_CAP_STRATEGIES = new Set(["ultra-safe", "safe-migration", "balanced", "smart-money"]);

// Max pair age (ms) for client-side display filter.
// "Early" strategies show only recently-created pairs; others have no age constraint.
//   degen:           ≤72h — "new launches" (must be freshly migrated)
//   early-migration: ≤96h — "ранний вход в миграцию" (within first 4 days of migration)
const MAX_PAIR_AGE_MS: Partial<Record<string, number>> = {
  "degen":           72 * 60 * 60 * 1000,
  "early-migration": 96 * 60 * 60 * 1000,
};

// Strategies where tokens are sorted newest-first (pairCreatedAt desc) instead of AI score.
const SORT_BY_NEWEST = new Set(["degen", "early-migration"]);

function getScreenerUrl(strategy: Strategy, network: Network): string {
  if (network === "robinhood") return RH_SCREENER_URL;
  return LARGE_CAP_STRATEGIES.has(strategy.id) ? SOL_LARGE_URL : SOL_SMALL_URL;
}

/** Parse raw DexScreener pair objects (returned by /api/screener) into ScanResult[] */
function parsePairs(pairs: any[], defaultDex: string): ScanResult[] {
  return pairs
    .filter((p) => p.mint && p.price > 0 && p.liquidity > 0)
    .map((p): ScanResult => {
      const { score, signal } = computeScore({
        change5m:           Number(p.change5m  ?? 0),
        change1h:           Number(p.change1h  ?? 0),
        change24h:          Number(p.change24h ?? 0),
        volSpikeMultiplier: Number(p.volSpikeMultiplier ?? 0),
      });
      return {
        mint:               p.mint,
        symbol:             p.symbol    ?? "?",
        name:               p.name      ?? "?",
        imageUrl:           p.imageUrl  ?? "",
        poolAddress:        p.poolAddress ?? "",
        price:              Number(p.price),
        marketCap:          Number(p.marketCap ?? 0),
        liquidity:          Number(p.liquidity),
        volume24h:          Number(p.volume24h ?? 0),
        volume1h:           Number(p.volume1h  ?? 0),
        volSpikeMultiplier: Number(p.volSpikeMultiplier ?? 0),
        change5m:  Number(p.change5m  ?? 0),
        change1h:  Number(p.change1h  ?? 0),
        change24h: Number(p.change24h ?? 0),
        aiScore:   score,
        aiSignal:  signal,
        dexScreenerUrl: p.dexScreenerUrl ?? "",
        pairCreatedAt:  p.pairCreatedAt ? Number(p.pairCreatedAt) : null,
        dexId:          p.dexId ?? defaultDex,
      };
    });
}

/**
 * Fetch tokens via DexScreener screener for any network.
 * URL is built from strategy parameters (mcapMin + liquidityMin).
 * profile=0 avoids Cloudflare bot-detection on smaller chains (e.g. Robinhood).
 */
/**
 * Poll /api/screener until data is ready (fire-and-forget server returns 202 while loading).
 * Retries every 3s for up to 5 minutes. Returns [] on timeout.
 */
async function fetchScreenerTokens(screenerUrl: string): Promise<ScanResult[]> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const apiUrl = `${origin}/api/screener?url=${encodeURIComponent(screenerUrl)}`;
  const MAX_ATTEMPTS = 100; // 100 × 3s = 5 min max

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Screener API ${res.status}`);

    const data: { pairs?: any[]; status?: string } = await res.json();

    // 202: server is still scraping — wait and retry
    if (res.status === 202 || data.status === "loading") {
      await new Promise<void>((r) => setTimeout(r, 3_000));
      continue;
    }

    // 200 with data
    return parsePairs(data.pairs ?? [], "unknown");
  }
  return []; // timed out
}

// ── Signal Card ───────────────────────────────────────────────────────────────

function SignalCard({ token, strategy, onBuy }: {
  token: ScanResult; strategy: Strategy; onBuy: (t: ScanResult) => void;
}) {
  const raw     = scoreTokenForStrategy(token, strategy);
  const score   = Math.min(100, Math.max(0, Math.round(raw)));
  const barColor = score >= 72 ? "#4ADE80" : score >= 52 ? "#C9A84C" : "#FB923C";
  const rc = RISK_COLOR[strategy.riskLevel];
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? "rgba(255,255,255,0.035)" : "rgba(255,255,255,0.02)",
        border: `1px solid ${hov ? `${rc}35` : "rgba(255,255,255,0.08)"}`,
        borderRadius: 18, overflow: "hidden",
        transition: "all 0.2s ease",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? `0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px ${rc}15` : "none",
      }}
    >
      {/* Score bar */}
      <div style={{ height: 3, background: "rgba(255,255,255,0.05)" }}>
        <div style={{ height: "100%", width: `${score}%`, background: `linear-gradient(90deg, ${barColor}88, ${barColor})`, transition: "width 0.5s ease" }} />
      </div>

      <div style={{ padding: "12px 14px 14px" }}>
        {/* Header */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 10 }}>
          {token.imageUrl ? (
            <img src={token.imageUrl} alt={token.symbol}
              style={{ width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, objectFit: "cover" }}
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0, background: `${barColor}18`, border: `1px solid ${barColor}28`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: barColor, fontSize: 13 }}>
              {token.symbol.slice(0, 2)}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#F0EBE0", fontSize: 13, fontWeight: 800, fontFamily: "'Orbitron', sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {token.symbol}
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {token.name}
            </div>
          </div>
          {/* Score badge */}
          <div style={{ flexShrink: 0, textAlign: "center", background: `${barColor}10`, border: `1px solid ${barColor}28`, borderRadius: 10, padding: "4px 9px" }}>
            <div style={{ color: barColor, fontSize: 18, fontWeight: 800, fontFamily: "monospace", lineHeight: 1 }}>{score}</div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 7, letterSpacing: "0.06em" }}>SCORE</div>
          </div>
        </div>

        {/* PumpFun → PumpSwap migration badge (Solana only) */}
        {token.dexId === "pumpswap" && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              padding: "3px 8px", borderRadius: 7,
              background: "rgba(153,69,255,0.10)",
              border: "1px solid rgba(153,69,255,0.30)",
            }}>
              <span style={{ fontSize: 8, fontWeight: 800, color: "#9945FF", letterSpacing: "0.05em" }}>
                🔄 PumpFun → PumpSwap
              </span>
            </div>
            {token.pairCreatedAt && (
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>
                {fmtMigratedAgo(token.pairCreatedAt)}
              </span>
            )}
          </div>
        )}

        {/* Metrics 2×2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 5, marginBottom: 8 }}>
          {[
            { label: "MCAP",        value: fmtNum(token.marketCap) },
            { label: "ЛИКВИДНОСТЬ", value: fmtNum(token.liquidity) },
            { label: "VOL 24H",     value: fmtNum(token.volume24h) },
            {
              label: "VOL SPIKE",
              value: token.volSpikeMultiplier > 0 ? `${token.volSpikeMultiplier.toFixed(1)}×` : "—",
              accent: token.volSpikeMultiplier >= strategy.volSpikeMin && strategy.volSpikeMin > 0,
            },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, padding: "5px 9px" }}>
              <div style={{ color: "rgba(201,168,76,0.45)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 1 }}>{label}</div>
              <div style={{ color: accent ? "#4ADE80" : "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* % Changes */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
          {([["5M", token.change5m], ["1H", token.change1h], ["24H", token.change24h]] as const).map(([label, val], i) => (
            <div key={label} style={{ padding: "6px 4px", textAlign: "center", borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 7, marginBottom: 2 }}>{label}</div>
              <div style={{ color: pctColor(Number(val)), fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>{fmtPct(Number(val))}</div>
            </div>
          ))}
        </div>

        {/* AI signal + price */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 9px", borderRadius: 7,
            background: token.aiSignal === "BUY" ? "rgba(74,222,128,0.10)" : token.aiSignal === "SELL" ? "rgba(255,77,94,0.10)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${token.aiSignal === "BUY" ? "rgba(74,222,128,0.28)" : token.aiSignal === "SELL" ? "rgba(255,77,94,0.28)" : "rgba(255,255,255,0.1)"}`,
          }}>
            {token.aiSignal === "BUY"  && <TrendingUp   size={9} color="#4ADE80" />}
            {token.aiSignal === "SELL" && <TrendingDown size={9} color="#FF4D5E" />}
            <span style={{ fontSize: 8, fontWeight: 800, color: token.aiSignal === "BUY" ? "#4ADE80" : token.aiSignal === "SELL" ? "#FF4D5E" : "rgba(255,255,255,0.4)" }}>
              AI: {token.aiSignal} · {token.aiScore}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace" }}>
            ${token.price < 0.001 ? token.price.toExponential(2) : token.price.toFixed(token.price < 1 ? 6 : 4)}
          </span>
          {token.dexScreenerUrl && (
            <a href={token.dexScreenerUrl} target="_blank" rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "3px 7px", borderRadius: 7, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", fontSize: 8, fontWeight: 700, textDecoration: "none" }}>
              <ExternalLink size={8} /> DEX
            </a>
          )}
        </div>

        {/* BUY button */}
        <button
          onClick={() => onBuy(token)}
          style={{ width: "100%", padding: "10px 0", background: "rgba(201,168,76,0.09)", border: "1px solid rgba(201,168,76,0.32)", borderRadius: 11, color: "#C9A84C", fontSize: 12, fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.05em", cursor: "pointer", transition: "all 0.18s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,168,76,0.20)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,168,76,0.55)"; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,168,76,0.09)"; (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,168,76,0.32)"; }}
        >
          <TrendingUp size={13} /> КУПИТЬ ВРУЧНУЮ
        </button>
      </div>
    </div>
  );
}

// ── Strategy Panel ────────────────────────────────────────────────────────────

function StrategyPanel({ strategy, tokens, loading, onBuy }: {
  strategy: Strategy; tokens: ScanResult[]; loading: boolean; onBuy: (t: ScanResult) => void;
}) {
  // Loose filter: mcap range + liq + change1h/24h bands only.
  // Does NOT gate on aiScore / volSpikeMin / requireBuyAiSignal — those are
  // for auto-trading. Here we show everything in the strategy's market range,
  // sorted by AI score so the best candidates appear first.
  const maxPairAge  = MAX_PAIR_AGE_MS[strategy.id];
  const sortNewest  = SORT_BY_NEWEST.has(strategy.id);
  const now         = Date.now();
  const matched = tokens
    .filter(t => {
      const mcap = t.marketCap;
      if (!mcap || mcap < strategy.mcapMin || mcap > strategy.mcapMax) return false;
      if (t.liquidity < strategy.liquidityMin) return false;
      if (t.change1h < strategy.change1hMin || t.change1h > strategy.change1hMax) return false;
      if (t.change24h < strategy.change24hMin || t.change24h > strategy.change24hMax) return false;
      if (maxPairAge !== undefined) {
        if (!t.pairCreatedAt) return false;
        if (now - t.pairCreatedAt > maxPairAge) return false;
      }
      return true;
    })
    .sort((a, b) =>
      sortNewest
        ? (b.pairCreatedAt ?? 0) - (a.pairCreatedAt ?? 0)   // newest migration first
        : scoreTokenForStrategy(b, strategy) - scoreTokenForStrategy(a, strategy)
    )
    .slice(0, 50);
  const buyCount = matched.filter(t => tokenMatchesStrategy(t, strategy)).length;
  const rc = RISK_COLOR[strategy.riskLevel];

  return (
    <div>
      {/* Strategy info */}
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
          <span style={{ fontSize: 24, lineHeight: 1 }}>{strategy.emoji}</span>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#F0EBE0", fontSize: 14, fontWeight: 800 }}>{strategy.name}</div>
            <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 10, marginTop: 3 }}>{strategy.description}</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ color: rc, fontSize: 11, fontWeight: 700 }}>{RISK_LABEL[strategy.riskLevel]}</div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9 }}>риск</div>
          </div>
        </div>

        {/* Filter params */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {[
            { k: "MCAP",    v: `${fmtNum(strategy.mcapMin)} – ${fmtNum(strategy.mcapMax)}` },
            { k: "LIQ",     v: `≥ ${fmtNum(strategy.liquidityMin)}` },
            ...(strategy.volSpikeMin > 0 ? [{ k: "VOL×", v: `≥ ${strategy.volSpikeMin}×` }] : []),
            { k: "1H",      v: `≥ ${strategy.change1hMin}%` },
            ...(strategy.dipRecovery   ? [{ k: "24H",  v: `${strategy.change24hMin}%…${strategy.change24hMax}%` }] : []),
            { k: "TP",      v: `+${strategy.tpPct}%` },
            { k: "SL",      v: `-${strategy.slPct}%` },
            { k: "AI MIN",  v: `${strategy.aiScoreMin}` },
          ].map(({ k, v }) => (
            <div key={k} style={{ background: `${rc}0a`, border: `1px solid ${rc}22`, borderRadius: 7, padding: "2px 8px", display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ color: rc, fontSize: 7, fontWeight: 700, letterSpacing: "0.08em" }}>{k}</span>
              <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 9, fontFamily: "monospace", fontWeight: 700 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 0" }}>
          <Loader2 size={30} color="#C9A84C" style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Сканирование DexScreener…</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : matched.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 16px", background: "rgba(255,255,255,0.012)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16 }}>
          <AlertTriangle size={26} color="rgba(255,255,255,0.18)" />
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 600 }}>Совпадений нет</span>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center", maxWidth: 280, lineHeight: 1.6 }}>
            Текущие рыночные условия не совпадают с параметрами этой стратегии.
            Страница обновляется автоматически каждые 45 секунд.
          </span>
        </div>
      ) : (
        <>
          <div style={{ color: "rgba(255,255,255,0.22)", fontSize: 9, letterSpacing: "0.08em", marginBottom: 12 }}>
            {matched.length} ТОКЕН{matched.length === 1 ? "" : matched.length < 5 ? "А" : "ОВ"} В ДИАПАЗОНЕ · SCORE ↓
            {buyCount > 0 && (
              <span style={{ color: "#4ADE80", marginLeft: 8 }}>· {buyCount} BUY сигнал{buyCount === 1 ? "" : buyCount < 5 ? "а" : "ов"}</span>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 12 }}>
            {matched.map(t => (
              <SignalCard key={t.mint} token={t} strategy={strategy} onBuy={onBuy} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Network tabs ──────────────────────────────────────────────────────────────

const NETWORK_LABEL: Record<Network, { name: string; icon: string; color: string; desc: string }> = {
  solana:    { name: "Solana",         icon: "◎", color: "#9945FF", desc: "9 стратегий · DexScreener Screener · Jupiter V6" },
  robinhood: { name: "Robinhood Chain",icon: "🔥", color: "#00c853", desc: "EVM · Chain ID 4663 · DexScreener Screener" },
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Signals() {
  const [, navigate] = useLocation();

  // Network + strategy
  const [network,  setNetwork]  = useState<Network>("solana");
  const [stratIdx, setStratIdx] = useState(0);

  // Per-URL screener cache — key is the full screener URL (unique per strategy+network)
  const [screenerCache,   setScreenerCache]   = useState<Record<string, ScanResult[]>>({});
  const [screenerLoading, setScreenerLoading] = useState<Record<string, boolean>>({});
  const [screenerError,   setScreenerError]   = useState<Record<string, string | null>>({});
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeStrategy = STRATEGIES[stratIdx];
  const currentKey     = getScreenerUrl(activeStrategy, network);
  const currentTokens  = screenerCache[currentKey]   ?? [];
  const currentLoading = screenerLoading[currentKey] ?? false;
  const currentError   = screenerError[currentKey]   ?? null;

  /** Load screener for a URL; skips if already in-flight */
  const loadData = useCallback(async (url: string) => {
    setScreenerLoading(prev => ({ ...prev, [url]: true }));
    setScreenerError(prev => ({ ...prev, [url]: null }));
    try {
      const t = await fetchScreenerTokens(url);
      setScreenerCache(prev => ({ ...prev, [url]: t }));
      setLastUpdate(new Date());
    } catch (e: any) {
      console.warn("[signals]", e.message);
      setScreenerError(prev => ({ ...prev, [url]: e.message ?? "Ошибка" }));
    } finally {
      setScreenerLoading(prev => ({ ...prev, [url]: false }));
    }
  }, []);

  // On strategy or network change: load screener if not already cached + 90s auto-refresh
  useEffect(() => {
    const url = getScreenerUrl(activeStrategy, network);
    // For Robinhood all strategies share one URL — skip fetch if already cached
    if (!screenerCache[url]) loadData(url);

    if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    refreshTimerRef.current = setInterval(() => loadData(url), 90_000);
    return () => { if (refreshTimerRef.current) clearInterval(refreshTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stratIdx, network]);

  const handleBuy = (token: ScanResult) => {
    navigate(`/trading?mint=${token.mint}&symbol=${encodeURIComponent(token.symbol)}&price=${token.price}`);
  };

  // Loose display filter: mcap range + liq + change1h/24h bands.
  // Does NOT gate on aiScore / volSpikeMin / requireBuyAiSignal (auto-trade only).
  // For "early" strategies (degen, early-migration): also enforces MAX_PAIR_AGE_MS.
  function tokenInStrategyRange(t: ScanResult, s: typeof STRATEGIES[0]): boolean {
    const mcap = t.marketCap;
    if (!mcap || mcap < s.mcapMin || mcap > s.mcapMax) return false;
    if (t.liquidity < s.liquidityMin) return false;
    if (t.change1h < s.change1hMin || t.change1h > s.change1hMax) return false;
    if (t.change24h < s.change24hMin || t.change24h > s.change24hMax) return false;
    const maxAge = MAX_PAIR_AGE_MS[s.id];
    if (maxAge !== undefined) {
      if (!t.pairCreatedAt) return false;
      if (Date.now() - t.pairCreatedAt > maxAge) return false;
    }
    return true;
  }

  // Match counts per strategy — each strategy has its own screener cache entry
  const matchCounts = STRATEGIES.map((s) => {
    const url  = getScreenerUrl(s, network);
    const pool = screenerCache[url] ?? [];
    return pool.filter(t => tokenInStrategyRange(t, s)).length;
  });
  const totalSignals = matchCounts.reduce((a, b) => a + b, 0);

  return (
    <div style={{ minHeight: "100dvh", background: "#080808", color: "#fff" }}>
      <Header />

      {/* ── Page header ── */}
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "22px 16px 0" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: "'Orbitron', sans-serif", color: "#F0EBE0", letterSpacing: "-0.01em" }}>
              ⚡ Сигналы по стратегиям
            </h1>
            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.28)", fontSize: 11 }}>
              {network === "solana"
                ? "🔄 Только PumpFun → PumpSwap миграции · DexScreener Screener · Ручной вход"
                : "🔥 Robinhood Chain · DexScreener Screener · Ручной вход"}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {lastUpdate && (
              <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 9 }}>
                {lastUpdate.toLocaleTimeString("ru-RU")}
              </span>
            )}
            {!currentLoading && totalSignals > 0 && (
              <div style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ADE80", fontSize: 10, fontWeight: 700 }}>
                {totalSignals} токенов
              </div>
            )}
            <button
              onClick={() => loadData(currentKey)}
              disabled={currentLoading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 12, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)", color: "#C9A84C", fontSize: 11, fontWeight: 700, cursor: currentLoading ? "not-allowed" : "pointer", opacity: currentLoading ? 0.5 : 1 }}
            >
              <RefreshCw size={12} style={{ animation: currentLoading ? "spin 1s linear infinite" : "none" }} />
              Обновить
            </button>
          </div>
        </div>

        {/* ── Network selector ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["solana", "robinhood"] as Network[]).map(net => {
            const info = NETWORK_LABEL[net];
            const active = net === network;
            // Show total cached tokens count for the active network across all strategies
            const networkTokenCount = active
              ? STRATEGIES.reduce((sum, s) => {
                  const url = getScreenerUrl(s, net);
                  return sum + (screenerCache[url]?.length ?? 0);
                }, 0)
              : 0;
            return (
              <button
                key={net}
                onClick={() => { setNetwork(net); setStratIdx(0); }}
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  padding: "11px 18px", borderRadius: 14,
                  background: active ? `${info.color}12` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${active ? `${info.color}40` : "rgba(255,255,255,0.08)"}`,
                  color: active ? info.color : "rgba(255,255,255,0.4)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.18s",
                }}
              >
                <span style={{ fontSize: 18 }}>{info.icon}</span>
                <div style={{ textAlign: "left" }}>
                  <div>{info.name}</div>
                  <div style={{ fontSize: 9, fontWeight: 400, color: active ? `${info.color}99` : "rgba(255,255,255,0.2)", marginTop: 1 }}>{info.desc}</div>
                </div>
                {active && networkTokenCount > 0 && (
                  <div style={{ marginLeft: 6, background: info.color, color: "#000", borderRadius: 20, padding: "1px 7px", fontSize: 9, fontWeight: 800 }}>
                    {networkTokenCount}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Strategy tabs ── */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "none" }}>
          <style>{`div::-webkit-scrollbar{display:none} @keyframes spin{to{transform:rotate(360deg)}}`}</style>
          {STRATEGIES.map((s, i) => {
            const active = i === stratIdx;
            const rc     = RISK_COLOR[s.riskLevel];
            const cnt    = matchCounts[i];
            const url    = getScreenerUrl(s, network);
            const isLoading = screenerLoading[url] ?? false;
            return (
              <button
                key={s.id}
                onClick={() => setStratIdx(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "8px 13px",
                  borderRadius: 13, flexShrink: 0,
                  background: active ? `${rc}12` : "rgba(255,255,255,0.025)",
                  border: `1px solid ${active ? `${rc}40` : "rgba(255,255,255,0.07)"}`,
                  color: active ? rc : "rgba(255,255,255,0.4)",
                  fontSize: 11, fontWeight: 700, cursor: "pointer", transition: "all 0.18s", outline: "none",
                }}
              >
                <span style={{ fontSize: 14 }}>{s.emoji}</span>
                <span style={{ whiteSpace: "nowrap" }}>{s.name}</span>
                {cnt > 0 ? (
                  <span style={{ background: active ? rc : "rgba(255,255,255,0.1)", color: active ? "#000" : "rgba(255,255,255,0.5)", borderRadius: 20, padding: "1px 6px", fontSize: 9, fontWeight: 800 }}>
                    {cnt}
                  </span>
                ) : isLoading ? (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: rc, opacity: 0.4, display: "inline-block", animation: "pulse 1s ease-in-out infinite" }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "12px 16px 60px" }}>

        {/* Screener info bar — shown for every strategy */}
        {(() => {
          const rc = RISK_COLOR[activeStrategy.riskLevel];
          const tokenCount = currentTokens.length;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 14, background: `${rc}08`, border: `1px solid ${rc}28`, borderRadius: 12 }}>
              <Zap size={14} color={rc} />
              <div style={{ flex: 1 }}>
                <span style={{ color: rc, fontSize: 11, fontWeight: 700 }}>DexScreener Screener · прямой источник</span>
                <span style={{ color: "rgba(255,255,255,0.28)", fontSize: 10, marginLeft: 10 }}>
                  {currentLoading
                    ? "Загрузка через браузер (~20с)…"
                    : network === "robinhood"
                      ? `${tokenCount} токенов · общий пул · фильтр на клиенте · обновление каждые 90с`
                      : `${tokenCount} токенов · liq≥${fmtNum(activeStrategy.liquidityMin)} · mcap≥${fmtNum(activeStrategy.mcapMin)} · обновление каждые 90с`}
                </span>
              </div>
              <button
                onClick={() => loadData(currentKey)}
                disabled={currentLoading}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 9, background: `${rc}10`, border: `1px solid ${rc}30`, color: rc, fontSize: 10, fontWeight: 700, cursor: currentLoading ? "not-allowed" : "pointer", opacity: currentLoading ? 0.5 : 1 }}
              >
                <RefreshCw size={10} style={{ animation: currentLoading ? "spin 1s linear infinite" : "none" }} />
                Refresh
              </button>
            </div>
          );
        })()}

        {/* Error state */}
        {currentError && currentTokens.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 16px", background: "rgba(255,77,94,0.04)", border: "1px solid rgba(255,77,94,0.2)", borderRadius: 16 }}>
            <AlertTriangle size={30} color="#FF4D5E" />
            <span style={{ color: "#FF4D5E", fontSize: 14, fontWeight: 700 }}>Ошибка загрузки данных</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{currentError}</span>
            <button onClick={() => loadData(currentKey)} style={{ marginTop: 8, padding: "9px 22px", borderRadius: 11, background: "rgba(255,77,94,0.10)", border: "1px solid rgba(255,77,94,0.28)", color: "#FF4D5E", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Повторить
            </button>
          </div>
        ) : (
          <StrategyPanel
            key={`${network}-${activeStrategy.id}`}
            strategy={activeStrategy}
            tokens={currentTokens}
            loading={currentLoading}
            onBuy={handleBuy}
          />
        )}
      </div>
    </div>
  );
}
