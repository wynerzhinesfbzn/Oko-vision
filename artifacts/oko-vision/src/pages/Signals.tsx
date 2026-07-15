/**
 * Signals — 9 Strategy Signal Feed
 *
 * Each tab = one strategy. Tokens are fetched from DexScreener via /api/scan,
 * filtered through tokenMatchesStrategy, scored and sorted. User decides manually
 * whether to buy — no auto-execution here.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import {
  RefreshCw, ExternalLink, TrendingUp, TrendingDown,
  Zap, AlertTriangle, Loader2, ChevronRight,
} from "lucide-react";
import Header from "@/components/Header";
import {
  STRATEGIES,
  fetchScanResults,
  tokenMatchesStrategy,
  scoreTokenForStrategy,
  type Strategy,
  type ScanResult,
} from "@/lib/tradingEngine";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(v: number): string {
  const s = v > 0 ? "+" : "";
  if (Math.abs(v) >= 1000) return `${s}${(v / 1000).toFixed(1)}K%`;
  if (Math.abs(v) >= 100)  return `${s}${v.toFixed(0)}%`;
  return `${s}${v.toFixed(2)}%`;
}
function pctColor(v: number) {
  return v > 0 ? "#4ADE80" : v < 0 ? "#FF4D5E" : "rgba(255,255,255,0.4)";
}

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

// ── Signal Card ───────────────────────────────────────────────────────────────

function SignalCard({
  token,
  strategy,
  onBuy,
}: {
  token:    ScanResult;
  strategy: Strategy;
  onBuy:    (t: ScanResult) => void;
}) {
  const score     = scoreTokenForStrategy(token, strategy);
  const scoreNorm = Math.min(100, Math.round(score));

  // score bar colour
  const barColor  = scoreNorm >= 75 ? "#4ADE80"
    : scoreNorm >= 55 ? "#C9A84C"
    : "#FB923C";

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,255,255,0.09)",
        borderRadius: 20,
        overflow: "hidden",
        transition: "border-color 0.2s",
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${RISK_COLOR[strategy.riskLevel]}44`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
    >
      {/* top score bar */}
      <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
        <div style={{ height: "100%", width: `${scoreNorm}%`, background: barColor, transition: "width 0.4s" }} />
      </div>

      <div style={{ padding: "14px 14px 12px" }}>
        {/* Header row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {/* Logo */}
          {token.imageUrl ? (
            <img
              src={token.imageUrl}
              alt={token.symbol}
              style={{ width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, objectFit: "cover" }}
              onError={e => { (e.target as HTMLImageElement).src = ""; (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <div style={{
              width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
              background: `${barColor}18`, border: `1px solid ${barColor}30`,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 800, color: barColor,
            }}>
              {token.symbol.slice(0, 2)}
            </div>
          )}

          {/* Symbol + name */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: "#F0EBE0", fontSize: 14, fontWeight: 800, fontFamily: "'Orbitron', sans-serif", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {token.symbol}
            </div>
            <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 10, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {token.name}
            </div>
          </div>

          {/* AI Score badge */}
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            background: `${barColor}12`, border: `1px solid ${barColor}30`,
            borderRadius: 10, padding: "4px 8px", flexShrink: 0,
          }}>
            <span style={{ color: barColor, fontSize: 16, fontWeight: 800, fontFamily: "monospace", lineHeight: 1 }}>{scoreNorm}</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 8, letterSpacing: "0.05em" }}>SCORE</span>
          </div>
        </div>

        {/* Metrics grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
          {[
            { label: "MCAP",        value: fmtNum(token.marketCap),              color: undefined },
            { label: "ЛИКВИДНОСТЬ", value: fmtNum(token.liquidity),              color: undefined },
            { label: "VOL 24H",     value: fmtNum(token.volume24h),              color: undefined },
            { label: "VOL SPIKE",   value: token.volSpikeMultiplier > 0 ? `${token.volSpikeMultiplier.toFixed(1)}×` : "—", color: token.volSpikeMultiplier >= strategy.volSpikeMin && strategy.volSpikeMin > 0 ? "#4ADE80" : undefined },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 10, padding: "6px 10px",
            }}>
              <div style={{ color: "rgba(201,168,76,0.5)", fontSize: 7, fontWeight: 700, letterSpacing: "0.08em", marginBottom: 2 }}>{label}</div>
              <div style={{ color: color ?? "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Price changes */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr",
          background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)",
          borderRadius: 10, overflow: "hidden", marginBottom: 12,
        }}>
          {[
            { label: "5M",  value: token.change5m },
            { label: "1H",  value: token.change1h },
            { label: "24H", value: token.change24h },
          ].map(({ label, value }, i) => (
            <div key={label} style={{
              padding: "7px 4px", textAlign: "center",
              borderLeft: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 7, marginBottom: 3 }}>{label}</div>
              <div style={{ color: pctColor(value), fontSize: 10, fontWeight: 700, fontFamily: "monospace" }}>
                {fmtPct(value)}
              </div>
            </div>
          ))}
        </div>

        {/* Signal badge */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "4px 10px", borderRadius: 8,
            background: token.aiSignal === "BUY" ? "rgba(74,222,128,0.12)" : token.aiSignal === "SELL" ? "rgba(255,77,94,0.12)" : "rgba(255,255,255,0.05)",
            border: `1px solid ${token.aiSignal === "BUY" ? "rgba(74,222,128,0.3)" : token.aiSignal === "SELL" ? "rgba(255,77,94,0.3)" : "rgba(255,255,255,0.1)"}`,
          }}>
            {token.aiSignal === "BUY"  && <TrendingUp   size={10} color="#4ADE80" />}
            {token.aiSignal === "SELL" && <TrendingDown size={10} color="#FF4D5E" />}
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: "0.05em",
              color: token.aiSignal === "BUY" ? "#4ADE80" : token.aiSignal === "SELL" ? "#FF4D5E" : "rgba(255,255,255,0.4)",
            }}>
              AI: {token.aiSignal} · {token.aiScore}
            </span>
          </div>
          <div style={{ flex: 1 }} />
          {/* DexScreener */}
          {token.dexScreenerUrl && (
            <a
              href={token.dexScreenerUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 8px", borderRadius: 8,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(255,255,255,0.4)", fontSize: 9, fontWeight: 700,
                textDecoration: "none",
              }}
              onClick={e => e.stopPropagation()}
            >
              <ExternalLink size={9} /> DEX
            </a>
          )}
        </div>

        {/* BUY button */}
        <button
          onClick={() => onBuy(token)}
          style={{
            width: "100%", padding: "11px 0",
            background: "rgba(201,168,76,0.10)",
            border: "1px solid rgba(201,168,76,0.35)",
            borderRadius: 12,
            color: "#C9A84C", fontSize: 13, fontWeight: 800,
            fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.05em",
            cursor: "pointer", transition: "all 0.18s",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,168,76,0.22)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,168,76,0.6)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "rgba(201,168,76,0.10)";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(201,168,76,0.35)";
          }}
        >
          <TrendingUp size={14} />
          КУПИТЬ ВРУЧНУЮ
        </button>
      </div>
    </div>
  );
}

// ── Strategy Tab Panel ────────────────────────────────────────────────────────

function StrategyPanel({
  strategy,
  allTokens,
  loading,
  onBuy,
}: {
  strategy:  Strategy;
  allTokens: ScanResult[];
  loading:   boolean;
  onBuy:     (t: ScanResult) => void;
}) {
  const matched = allTokens
    .filter(t => tokenMatchesStrategy(t, strategy))
    .sort((a, b) => scoreTokenForStrategy(b, strategy) - scoreTokenForStrategy(a, strategy))
    .slice(0, 20);

  const riskColor = RISK_COLOR[strategy.riskLevel];

  return (
    <div>
      {/* Strategy info bar */}
      <div style={{
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "12px 16px", marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <span style={{ fontSize: 22 }}>{strategy.emoji}</span>
          <div>
            <div style={{ color: "#F0EBE0", fontSize: 13, fontWeight: 800 }}>{strategy.name}</div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, marginTop: 2 }}>{strategy.description}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div style={{ color: riskColor, fontSize: 11, fontWeight: 700 }}>{RISK_LABEL[strategy.riskLevel]}</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9 }}>риск</div>
          </div>
        </div>

        {/* Filter params */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {[
            { label: "MCAP", value: `${fmtNum(strategy.mcapMin)} – ${fmtNum(strategy.mcapMax)}` },
            { label: "LIQ",  value: `≥ ${fmtNum(strategy.liquidityMin)}` },
            ...(strategy.volSpikeMin > 0 ? [{ label: "VOL×", value: `≥ ${strategy.volSpikeMin}×` }] : []),
            { label: "1H",   value: `≥ ${strategy.change1hMin}%` },
            { label: "TP",   value: `+${strategy.tpPct}%` },
            { label: "SL",   value: `-${strategy.slPct}%` },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: `${riskColor}0a`, border: `1px solid ${riskColor}25`,
              borderRadius: 8, padding: "3px 8px",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ color: riskColor, fontSize: 7, fontWeight: 700, letterSpacing: "0.08em" }}>{label}</span>
              <span style={{ color: "rgba(255,255,255,0.65)", fontSize: 9, fontFamily: "monospace", fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tokens */}
      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 0" }}>
          <Loader2 size={28} color="#C9A84C" style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 12 }}>Сканирование DexScreener…</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : matched.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 16px",
          background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16,
        }}>
          <AlertTriangle size={28} color="rgba(255,255,255,0.2)" />
          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: 600 }}>Подходящих токенов не найдено</span>
          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, textAlign: "center", maxWidth: 260, lineHeight: 1.5 }}>
            Рынок не соответствует параметрам стратегии прямо сейчас. Обновится автоматически через 60 секунд.
          </span>
        </div>
      ) : (
        <>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em", marginBottom: 12 }}>
            {matched.length} СИГНАЛ{matched.length === 1 ? "" : matched.length < 5 ? "А" : "ОВ"} · СОРТИРОВКА ПО SCORE
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
            {matched.map(t => (
              <SignalCard key={t.mint} token={t} strategy={strategy} onBuy={onBuy} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Signals() {
  const [, navigate]        = useLocation();
  const [activeIdx, setActiveIdx] = useState(0);
  const [tokens, setTokens]       = useState<ScanResult[]>([]);
  const [loading, setLoading]     = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      // Fetch all 3 sources in parallel, merge & deduplicate by mint
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fetchType = async (type: string): Promise<ScanResult[]> => {
        try {
          const res = await fetch(`${origin}/api/scan?chain=solana&type=${type}`, {
            signal: AbortSignal.timeout(15_000),
          });
          if (!res.ok) return [];
          const data = await res.json();
          return (data.pairs ?? []).filter((p: any) => p.mint && p.price > 0 && p.liquidity > 0).map((p: any) => {
            let score = 50;
            const c1h = Number(p.change1h ?? 0), c24h = Number(p.change24h ?? 0), c5m = Number(p.change5m ?? 0), spike = Number(p.volSpikeMultiplier ?? 0);
            if (c1h > 8) score += 18; else if (c1h > 3) score += 10; else if (c1h > 1) score += 5; else if (c1h < -5) score -= 18; else if (c1h < -2) score -= 10;
            if (c24h > 20) score += 10; else if (c24h > 8) score += 5; else if (c24h < -20) score -= 10; else if (c24h < -8) score -= 5;
            if (c5m > 2) score += 8; else if (c5m < -2) score -= 8;
            if (spike > 5) score += 18; else if (spike > 3) score += 12; else if (spike > 2) score += 6;
            score = Math.max(0, Math.min(100, score));
            const aiSignal: "BUY" | "SELL" | "HOLD" = score >= 62 ? "BUY" : score <= 38 ? "SELL" : "HOLD";
            return { mint: p.mint, symbol: p.symbol ?? "?", name: p.name ?? "?", imageUrl: p.imageUrl ?? "", poolAddress: p.poolAddress ?? "", price: Number(p.price), marketCap: Number(p.marketCap ?? 0), liquidity: Number(p.liquidity), volume24h: Number(p.volume24h ?? 0), volume1h: Number(p.volume1h ?? 0), volSpikeMultiplier: Number(p.volSpikeMultiplier ?? 0), change5m: c5m, change1h: c1h, change24h: c24h, aiScore: score, aiSignal, dexScreenerUrl: p.dexScreenerUrl ?? "" } as ScanResult;
          });
        } catch { return []; }
      };
      const [boosted, latest, trending] = await Promise.all([
        fetchType("boosted"), fetchType("latest"), fetchType("trending"),
      ]);
      const seen = new Set<string>();
      const merged: ScanResult[] = [];
      for (const t of [...boosted, ...latest, ...trending]) {
        if (!seen.has(t.mint)) { seen.add(t.mint); merged.push(t); }
      }
      setTokens(merged);
      setLastUpdate(new Date());
    } catch (e: any) {
      setError(e.message ?? "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(() => load(true), 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const handleBuy = (token: ScanResult) => {
    // Navigate to trading page with pre-filled token info via query params
    navigate(`/trading?mint=${token.mint}&symbol=${encodeURIComponent(token.symbol)}&price=${token.price}`);
  };

  const activeStrategy = STRATEGIES[activeIdx];

  return (
    <div style={{ minHeight: "100dvh", background: "#080808", color: "#fff" }}>
      <Header />

      {/* ── Page header ── */}
      <div style={{ padding: "24px 16px 0", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: "'Orbitron', sans-serif", color: "#F0EBE0", margin: 0, letterSpacing: "-0.01em" }}>
              ⚡ Сигналы
            </h1>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 4 }}>
              Реальные токены с DexScreener, отфильтрованные по 9 стратегиям
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {lastUpdate && (
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: 9 }}>
                {lastUpdate.toLocaleTimeString("ru-RU")}
              </span>
            )}
            <button
              onClick={() => load()}
              disabled={loading}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: 12,
                background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.25)",
                color: "#C9A84C", fontSize: 11, fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.5 : 1,
              }}
            >
              <RefreshCw size={12} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              Обновить
            </button>
          </div>
        </div>

        {/* ── Strategy tabs ── */}
        <div style={{
          display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, marginTop: 20,
          scrollbarWidth: "none",
        }}>
          <style>{`div::-webkit-scrollbar{display:none}`}</style>
          {STRATEGIES.map((s, i) => {
            const active = i === activeIdx;
            const rc = RISK_COLOR[s.riskLevel];
            // count matching tokens for badge
            const count = tokens.filter(t => tokenMatchesStrategy(t, s)).length;
            return (
              <button
                key={s.id}
                onClick={() => setActiveIdx(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 14px", borderRadius: 14, flexShrink: 0,
                  background: active ? `${rc}14` : "rgba(255,255,255,0.03)",
                  border: active ? `1px solid ${rc}45` : "1px solid rgba(255,255,255,0.08)",
                  color: active ? rc : "rgba(255,255,255,0.5)",
                  fontSize: 11, fontWeight: 700,
                  cursor: "pointer", transition: "all 0.18s",
                  outline: "none",
                }}
              >
                <span style={{ fontSize: 15 }}>{s.emoji}</span>
                <span style={{ whiteSpace: "nowrap" }}>{s.name}</span>
                {count > 0 && (
                  <span style={{
                    background: active ? rc : "rgba(255,255,255,0.1)",
                    color: active ? "#000" : "rgba(255,255,255,0.5)",
                    borderRadius: 20, padding: "1px 6px", fontSize: 9, fontWeight: 800,
                    minWidth: 18, textAlign: "center",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ padding: "16px 16px 48px", maxWidth: 1200, margin: "0 auto" }}>
        {error ? (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "48px 16px",
            background: "rgba(255,77,94,0.05)", border: "1px solid rgba(255,77,94,0.2)", borderRadius: 16,
          }}>
            <AlertTriangle size={28} color="#FF4D5E" />
            <span style={{ color: "#FF4D5E", fontSize: 13, fontWeight: 700 }}>Ошибка загрузки</span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>{error}</span>
            <button
              onClick={() => load()}
              style={{ marginTop: 8, padding: "8px 20px", borderRadius: 10, background: "rgba(255,77,94,0.1)", border: "1px solid rgba(255,77,94,0.3)", color: "#FF4D5E", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Повторить
            </button>
          </div>
        ) : (
          <StrategyPanel
            key={activeStrategy.id}
            strategy={activeStrategy}
            allTokens={tokens}
            loading={loading}
            onBuy={handleBuy}
          />
        )}
      </div>
    </div>
  );
}
