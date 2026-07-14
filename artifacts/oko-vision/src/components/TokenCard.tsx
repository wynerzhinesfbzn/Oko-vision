/**
 * TokenCard — glassmorphism card for a single PoolSignal.
 *
 * Risk data is fetched inside the card (lazy, after 800 ms).
 * • OUTSIDE (always visible): compact risk badge showing score + level + emoji
 * • INSIDE  (on tap):         full inline risk detail panel (no extra card wrapper)
 */
import { useState, useEffect, useCallback } from "react";
import type { PoolSignal } from "@/lib/geckoTerminal";
import { formatNum } from "@/lib/geckoTerminal";
import {
  BarChart2, TrendingUp, TrendingDown, Minus,
  SlidersHorizontal, ChevronDown, ChevronUp, ExternalLink,
} from "lucide-react";
import { fetchRiskData, type RiskData } from "@/lib/riskAnalysis";
import RiskPanel, { ScorePill, scoreColor } from "@/components/RiskPanel";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtPct(v: number): string {
  const abs  = Math.abs(v);
  const sign = v > 0 ? "+" : v < 0 ? "-" : "";
  if (abs >= 10_000) return `${sign}${(abs / 1000).toFixed(0)}K%`;
  if (abs >= 1_000)  return `${sign}${(abs / 1000).toFixed(1)}K%`;
  if (abs >= 100)    return `${sign}${abs.toFixed(0)}%`;
  return `${sign}${abs.toFixed(2)}%`;
}

function PctBadge({ value, label }: { value: number; label: string }) {
  const pos = value > 0;
  const neg = value < 0;
  return (
    <div className="flex flex-col items-center gap-0.5 min-w-0">
      <span style={{ color: "rgba(255,255,255,0.28)", fontSize: "7px", letterSpacing: "0.04em" }}>{label}</span>
      <span
        className="w-full text-center"
        style={{
          fontSize: "9px", fontWeight: 700,
          color: pos ? "#C9A84C" : neg ? "#ff5252" : "rgba(255,255,255,0.45)",
          fontFamily: "monospace", whiteSpace: "nowrap",
          overflow: "hidden", textOverflow: "ellipsis",
        }}
      >
        {fmtPct(value)}
      </span>
    </div>
  );
}

function AISignalBadge({ signal, score }: { signal: "BUY" | "SELL" | "HOLD"; score: number }) {
  const cfg = {
    BUY:  { color: "#C9A84C", bg: "rgba(201,168,76,0.10)", border: "rgba(201,168,76,0.25)" },
    SELL: { color: "#ff5252", bg: "rgba(255,82,82,0.10)",  border: "rgba(255,82,82,0.25)"  },
    HOLD: { color: "#C9A84C", bg: "rgba(201,168,76,0.10)",  border: "rgba(201,168,76,0.22)"  },
  }[signal];

  return (
    <div
      className="flex items-center gap-0.5 px-1.5 py-0.5 rounded shrink-0"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      {signal === "BUY"  && <TrendingUp   size={8} style={{ color: cfg.color, flexShrink: 0 }} />}
      {signal === "SELL" && <TrendingDown size={8} style={{ color: cfg.color, flexShrink: 0 }} />}
      {signal === "HOLD" && <Minus        size={8} style={{ color: cfg.color, flexShrink: 0 }} />}
      <span style={{ color: cfg.color, fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.04em" }}>
        {signal}
      </span>
      <span style={{ color: cfg.color, fontSize: "7px", fontFamily: "monospace", opacity: 0.75 }}>
        {score}
      </span>
    </div>
  );
}

// ─── Risk mini-badge (always visible on card footer) ─────────────────────────

function RiskBadge({
  riskData, loading, expanded, onToggle,
}: {
  riskData: RiskData | null;
  loading:  boolean;
  expanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-1.5 px-2 py-1 rounded-xl"
      style={{
        background: expanded
          ? riskData ? `${scoreColor(riskData.riskScore)}0f` : "rgba(240,235,224,0.07)"
          : "rgba(255,255,255,0.025)",
        border: expanded
          ? riskData ? `1px solid ${scoreColor(riskData.riskScore)}30` : "1px solid rgba(240,235,224,0.22)"
          : "1px solid rgba(255,255,255,0.07)",
        transition: "all 0.18s ease",
        minHeight: 26,
      }}
    >
      {/* Left: shield label */}
      <span style={{
        fontSize: "7.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
        letterSpacing: "0.05em",
        color: expanded
          ? riskData ? scoreColor(riskData.riskScore) : "rgba(240,235,224,0.65)"
          : "rgba(255,255,255,0.28)",
      }}>
        🛡 РИСК
      </span>

      {/* Middle: score pill or spinner */}
      {loading && !riskData && (
        <span style={{ color: "rgba(255,255,255,0.22)", fontSize: "7px", fontFamily: "monospace" }}>
          сканирование…
        </span>
      )}
      {riskData && (
        <ScorePill score={riskData.riskScore} level={riskData.riskLevel} />
      )}

      {/* Right: emoji + chevron */}
      <div className="flex items-center gap-0.5 shrink-0">
        {riskData && (
          <span style={{ fontSize: "11px", lineHeight: 1 }}>{riskData.verdictEmoji}</span>
        )}
        {expanded
          ? <ChevronUp   size={10} style={{ color: "rgba(255,255,255,0.28)" }} />
          : <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.18)" }} />
        }
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  token:       PoolSignal;
  onOpenChart: (token: PoolSignal) => void;
  onTrade?:    (token: PoolSignal, side: "buy" | "sell") => void;
  tradingOpen?: boolean;
  loadDelay?:  number;   // ms delay before risk fetch (stagger cards)
}

export default function TokenCard({ token, onOpenChart, onTrade, tradingOpen, loadDelay = 400 }: Props) {
  const [hovered,     setHovered]     = useState(false);
  const [showRisk,    setShowRisk]    = useState(false);
  const [riskData,    setRiskData]    = useState<RiskData | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);

  const mintAddress = token.baseToken.id ?? "";

  const loadRisk = useCallback(async () => {
    if (!mintAddress) return;
    setRiskLoading(true);
    try {
      const d = await fetchRiskData(mintAddress);
      setRiskData(d);
    } finally {
      setRiskLoading(false);
    }
  }, [mintAddress]);

  // Lazy-load risk after a short delay so the card renders first
  useEffect(() => {
    const t = setTimeout(loadRisk, loadDelay);
    return () => clearTimeout(t);
  }, [loadRisk, loadDelay]);

  const mainColor = token.aiSignal === "BUY"
    ? "#C9A84C" : token.aiSignal === "SELL" ? "#ff5252" : "#C9A84C";

  return (
    <div
      className="relative flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: "#111111",
        border: hovered
          ? `1px solid ${mainColor}40`
          : "1px solid rgba(255,255,255,0.09)",
        boxShadow: hovered
          ? `0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px ${mainColor}18, 0 20px 60px rgba(0,0,0,0.35)`
          : "0 4px 24px rgba(0,0,0,0.55), 0 1px 0 rgba(255,255,255,0.04), 0 16px 48px rgba(0,0,0,0.30)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        transition: "all 0.22s ease",
        outline: "1px solid rgba(255,255,255,0.03)",
        outlineOffset: "-1px",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent strip */}
      <div
        className="h-px w-full"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${mainColor}70 50%, transparent 100%)`,
          opacity: hovered ? 1 : 0.35,
          transition: "opacity 0.22s",
        }}
      />

      <div className="p-2.5 flex flex-col gap-2">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {token.baseToken.imageUrl ? (
              <img
                src={token.baseToken.imageUrl}
                alt={token.baseToken.symbol}
                className="rounded-full shrink-0"
                style={{ width: 28, height: 28, border: "1px solid rgba(255,255,255,0.10)", objectFit: "cover" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div
                className="rounded-full flex items-center justify-center shrink-0"
                style={{ width: 28, height: 28, background: `${mainColor}18`, border: `1px solid ${mainColor}28` }}
              >
                <span style={{ color: mainColor, fontSize: "10px", fontWeight: "bold" }}>
                  {token.baseToken.symbol.slice(0, 2)}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <div
                className="font-orbitron font-bold truncate"
                style={{ color: "#F0EBE0", fontSize: "10.5px", maxWidth: "72px", lineHeight: 1.2 }}
                title={token.baseToken.symbol}
              >
                {token.baseToken.symbol}
              </div>
              <div
                className="truncate"
                style={{ color: "rgba(255,255,255,0.28)", fontSize: "8px", lineHeight: 1.2 }}
                title={token.baseToken.name}
              >
                {token.baseToken.name}
              </div>
            </div>
          </div>
          <AISignalBadge signal={token.aiSignal} score={token.aiScore} />
        </div>

        {/* ── Market Cap ── */}
        <div>
          <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "7.5px", letterSpacing: "0.05em", marginBottom: "1px" }}>
            КАПИТАЛИЗАЦИЯ
          </p>
          <p
            className="font-orbitron font-bold truncate"
            style={{ color: "#F0EBE0", fontSize: "13px", lineHeight: 1.15 }}
          >
            {token.marketCap ? formatNum(token.marketCap) : "—"}
          </p>
        </div>

        {/* ── % Changes ── */}
        <div
          className="grid grid-cols-3 rounded-xl overflow-hidden"
          style={{ background: "rgba(0,0,0,0.28)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="py-1.5 px-1 text-center">
            <PctBadge value={token.change5m}  label="5M" />
          </div>
          <div className="py-1.5 px-1 text-center" style={{ borderLeft: "1px solid rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.05)" }}>
            <PctBadge value={token.change1h}  label="1H" />
          </div>
          <div className="py-1.5 px-1 text-center">
            <PctBadge value={token.change24h} label="24H" />
          </div>
        </div>

        {/* ── Stats ── */}
        <div
          className="rounded-xl px-2 py-1.5 grid grid-cols-2 gap-x-1 gap-y-1"
          style={{ background: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.04)" }}
        >
          {[
            { label: "Vol 24H", value: formatNum(token.volume24h) },
            { label: "Liq",     value: formatNum(token.liquidity)  },
            { label: "DEX",     value: token.dex.slice(0, 9)       },
            { label: "Сеть",    value: token.network.toUpperCase().slice(0, 6) },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-1 min-w-0">
              <span style={{ color: "rgba(255,255,255,0.22)", fontSize: "7.5px", letterSpacing: "0.04em", flexShrink: 0 }}>
                {s.label}
              </span>
              <span className="truncate" style={{ color: "rgba(255,255,255,0.60)", fontSize: "8.5px", fontFamily: "monospace" }}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* ── Action buttons — 2 rows ── */}
        <div className="flex flex-col gap-1 pt-0.5">
          {/* Row 1: BUY + SELL */}
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onTrade?.(token, "buy"); }}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl overflow-hidden"
              style={{
                height: 28,
                background: tradingOpen ? "rgba(201,168,76,0.22)" : "rgba(201,168,76,0.07)",
                border: tradingOpen ? "1px solid rgba(201,168,76,0.48)" : "1px solid rgba(201,168,76,0.22)",
                color: "#C9A84C", transition: "all 0.18s ease",
                boxShadow: tradingOpen ? "0 0 10px rgba(201,168,76,0.18)" : "none",
              }}
            >
              <TrendingUp size={10} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "8.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                КУПИТЬ
              </span>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onTrade?.(token, "sell"); }}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl overflow-hidden"
              style={{
                height: 28,
                background: "rgba(255,70,70,0.07)",
                border: "1px solid rgba(255,70,70,0.22)",
                color: "#ff5050", transition: "all 0.18s ease",
              }}
            >
              <TrendingDown size={10} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "8.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                ПРОДАТЬ
              </span>
            </button>
          </div>

          {/* Row 2: Chart + SL/TP + DEX↗ */}
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onOpenChart(token); }}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl overflow-hidden"
              style={{
                height: 26,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(240,235,224,0.50)",
              }}
            >
              <BarChart2 size={10} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "7.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
                ГРАФИК
              </span>
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onTrade?.(token, "buy"); }}
              className="flex-1 flex items-center justify-center gap-1 rounded-xl overflow-hidden"
              style={{
                height: 26,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(240,235,224,0.50)",
              }}
            >
              <SlidersHorizontal size={9} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "7.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
                SL/TP
              </span>
            </button>

            {/* DEX Screener link */}
            <a
              href={token.dexScreenerUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-0.5 rounded-xl overflow-hidden"
              style={{
                height: 26,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                color: "rgba(240,235,224,0.50)",
                textDecoration: "none",
                transition: "all 0.18s ease",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.08)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)";
              }}
            >
              <ExternalLink size={9} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: "7.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>
                DEX
              </span>
            </a>
          </div>

          {/* ── Risk badge (always visible) ── */}
          <RiskBadge
            riskData={riskData}
            loading={riskLoading}
            expanded={showRisk}
            onToggle={(e) => { e.stopPropagation(); setShowRisk(p => !p); }}
          />
        </div>

        {/* ── Risk detail panel (expanded inline — no extra card) ── */}
        {showRisk && riskData && (
          <RiskPanel
            data={riskData}
            mintAddress={mintAddress}
            loading={riskLoading}
            onRefresh={loadRisk}
          />
        )}

        {/* Loading state while detail is open but data not yet ready */}
        {showRisk && !riskData && riskLoading && (
          <div className="flex items-center justify-center gap-2 py-4">
            <div className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(240,235,224,0.12)", borderTopColor: "rgba(240,235,224,0.65)" }} />
            <span style={{ color: "rgba(255,255,255,0.28)", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>
              СКАНИРОВАНИЕ...
            </span>
          </div>
        )}

      </div>
    </div>
  );
}
