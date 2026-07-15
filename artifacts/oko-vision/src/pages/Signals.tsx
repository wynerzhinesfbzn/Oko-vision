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
  const signal: "BUY"|"SELL"|"HOLD" = score >= 62 ? "BUY" : score <= 38 ? "SELL" : "HOLD";
  return { score, signal };
}

// ── API fetch ─────────────────────────────────────────────────────────────────

async function fetchTokens(chain: "solana" | "robinhood"): Promise<ScanResult[]> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const res = await fetch(`${origin}/api/scan?chain=${chain}&type=all`, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  const pairs: any[] = data.pairs ?? [];
  return pairs
    .filter((p) => p.mint && p.price > 0 && p.liquidity > 0)
    .map((p): ScanResult => {
      const { score, signal } = computeScore({
        change5m: Number(p.change5m ?? 0),
        change1h: Number(p.change1h ?? 0),
        change24h: Number(p.change24h ?? 0),
        volSpikeMultiplier: Number(p.volSpikeMultiplier ?? 0),
      });
      return {
        mint:               p.mint,
        symbol:             p.symbol  ?? "?",
        name:               p.name    ?? "?",
        imageUrl:           p.imageUrl ?? "",
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
      };
    });
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
  const matched = tokens
    .filter(t => tokenMatchesStrategy(t, strategy))
    .sort((a, b) => scoreTokenForStrategy(b, strategy) - scoreTokenForStrategy(a, strategy))
    .slice(0, 30);
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
            {matched.length} СИГНАЛ{matched.length === 1 ? "" : matched.length < 5 ? "А" : "ОВ"} · СОРТИРОВКА: SCORE ↓
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

type Network = "solana" | "robinhood";

const NETWORK_LABEL: Record<Network, { name: string; icon: string; color: string; desc: string }> = {
  solana:    { name: "Solana",         icon: "◎", color: "#9945FF", desc: "9 стратегий · DexScreener · Jupiter V6" },
  robinhood: { name: "Robinhood Chain",icon: "🔥", color: "#00c853", desc: "EVM · Chain ID 4663 · DEX токены" },
};

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Signals() {
  const [, navigate] = useLocation();

  // Network
  const [network, setNetwork] = useState<Network>("solana");
  // Strategy tab
  const [stratIdx, setStratIdx] = useState(0);
  // Tokens per network
  const [solTokens, setSolTokens]     = useState<ScanResult[]>([]);
  const [rhTokens,  setRhTokens]      = useState<ScanResult[]>([]);
  const [loadingSol, setLoadingSol]   = useState(true);
  const [loadingRh,  setLoadingRh]    = useState(false); // lazy
  const [errorSol,  setErrorSol]      = useState<string | null>(null);
  const [errorRh,   setErrorRh]       = useState<string | null>(null);
  const [lastUpdate, setLastUpdate]   = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadSolana = useCallback(async (silent = false) => {
    if (!silent) setLoadingSol(true);
    setErrorSol(null);
    try {
      const t = await fetchTokens("solana");
      setSolTokens(t);
      setLastUpdate(new Date());
    } catch (e: any) {
      setErrorSol(e.message ?? "Ошибка загрузки");
    } finally {
      setLoadingSol(false);
    }
  }, []);

  const loadRobinhood = useCallback(async (silent = false) => {
    if (!silent) setLoadingRh(true);
    setErrorRh(null);
    try {
      const t = await fetchTokens("robinhood");
      setRhTokens(t);
    } catch (e: any) {
      setErrorRh(e.message ?? "Ошибка загрузки");
    } finally {
      setLoadingRh(false);
    }
  }, []);

  // Initial load: Solana eagerly, Robinhood lazily when tab opened
  useEffect(() => {
    loadSolana();
    timerRef.current = setInterval(() => loadSolana(true), 45_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [loadSolana]);

  // Load Robinhood when first selected
  const rhLoadedRef = useRef(false);
  useEffect(() => {
    if (network === "robinhood" && !rhLoadedRef.current) {
      rhLoadedRef.current = true;
      loadRobinhood();
    }
  }, [network, loadRobinhood]);

  const tokens  = network === "solana" ? solTokens : rhTokens;
  const loading = network === "solana" ? loadingSol : loadingRh;
  const error   = network === "solana" ? errorSol  : errorRh;
  const reload  = network === "solana" ? loadSolana : loadRobinhood;

  const handleBuy = (token: ScanResult) => {
    navigate(`/trading?mint=${token.mint}&symbol=${encodeURIComponent(token.symbol)}&price=${token.price}`);
  };

  const activeStrategy = STRATEGIES[stratIdx];

  // Count matches per strategy for current network tokens
  const matchCounts = STRATEGIES.map(s =>
    tokens.filter(t => tokenMatchesStrategy(t, s)).length
  );
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
              Реальные токены · DexScreener · 300+ источников · Ручной вход
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {lastUpdate && (
              <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 9 }}>
                {lastUpdate.toLocaleTimeString("ru-RU")}
              </span>
            )}
            {!loading && totalSignals > 0 && (
              <div style={{ padding: "4px 10px", borderRadius: 20, background: "rgba(74,222,128,0.10)", border: "1px solid rgba(74,222,128,0.25)", color: "#4ADE80", fontSize: 10, fontWeight: 700 }}>
                {totalSignals} сигналов
              </div>
            )}
            <button
              onClick={() => reload()}
              disabled={loading}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 12, background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)", color: "#C9A84C", fontSize: 11, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1 }}
            >
              <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              Обновить
            </button>
          </div>
        </div>

        {/* ── Network selector ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["solana", "robinhood"] as Network[]).map(net => {
            const info = NETWORK_LABEL[net];
            const active = net === network;
            return (
              <button
                key={net}
                onClick={() => setNetwork(net)}
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
                {active && net === "solana" && !loading && (
                  <div style={{ marginLeft: 6, background: info.color, color: "#000", borderRadius: 20, padding: "1px 7px", fontSize: 9, fontWeight: 800 }}>
                    {solTokens.length}
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
            const rc = RISK_COLOR[s.riskLevel];
            const cnt = matchCounts[i];
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
                ) : loading ? (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.12)", display: "inline-block" }} />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{ maxWidth: 1300, margin: "0 auto", padding: "12px 16px 60px" }}>

        {/* Robinhood Chain — special info bar */}
        {network === "robinhood" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", marginBottom: 16, background: "rgba(0,200,83,0.05)", border: "1px solid rgba(0,200,83,0.18)", borderRadius: 14 }}>
            <Shield size={16} color="#00c853" />
            <div>
              <span style={{ color: "#00c853", fontSize: 12, fontWeight: 700 }}>Robinhood Chain · Chain ID 4663 · EVM</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 10, marginLeft: 10 }}>
                {loadingRh ? "Сканирование DEX…" : rhTokens.length > 0 ? `${rhTokens.length} токенов найдено` : "Поиск токенов на DexScreener…"}
              </span>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <Zap size={14} color="rgba(0,200,83,0.5)" />
            </div>
          </div>
        )}

        {/* Error state */}
        {error ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "60px 16px", background: "rgba(255,77,94,0.04)", border: "1px solid rgba(255,77,94,0.2)", borderRadius: 16 }}>
            <AlertTriangle size={30} color="#FF4D5E" />
            <span style={{ color: "#FF4D5E", fontSize: 14, fontWeight: 700 }}>Ошибка загрузки данных</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{error}</span>
            <button onClick={() => reload()} style={{ marginTop: 8, padding: "9px 22px", borderRadius: 11, background: "rgba(255,77,94,0.10)", border: "1px solid rgba(255,77,94,0.28)", color: "#FF4D5E", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Повторить
            </button>
          </div>
        ) : (
          <StrategyPanel
            key={`${network}-${activeStrategy.id}`}
            strategy={activeStrategy}
            tokens={tokens}
            loading={loading}
            onBuy={handleBuy}
          />
        )}
      </div>
    </div>
  );
}
