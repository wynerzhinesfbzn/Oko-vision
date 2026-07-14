import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, TrendingUp, TrendingDown, DollarSign, Activity, ShoppingCart,
  Shield, Copy, Trash2, X, AlertTriangle, LineChart, BarChart2,
  Wallet, Layers, ChevronRight, Share2, Repeat2, StopCircle,
  RefreshCw, ExternalLink, ArrowUpDown, Check,
} from "lucide-react";
import PNLShareModal from "@/components/PNLShareModal";
import QuickSellModal from "@/components/QuickSellModal";
import {
  AreaChart, Area, BarChart, Bar, Cell, LabelList,
  ResponsiveContainer, XAxis, YAxis, Tooltip,
  ReferenceLine, CartesianGrid,
} from "recharts";
import { useTrading, type Position, type PortfolioSnapshot, type TradeRecord, type DCAOrder } from "@/context/TradingContext";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance } from "@/context/BalanceContext";
import { getInvested, rebuildStore, clearAll as clearPortfolioData, migrateFromLegacyStores, getAllEntries, fillFromChainTokens } from "@/lib/portfolioData";
import { addSnapshot, getSnapshots, type Snapshot } from "@/lib/portfolioSnapshots";

// ── DCA Intervals (shared) ─────────────────────────────────────────────────────
const DCA_INTERVALS: { label: string; sublabel: string; ms: number }[] = [
  { label: "1 МИН",   sublabel: "каждую минуту",  ms: 60_000        },
  { label: "1 ЧАС",   sublabel: "каждый час",      ms: 3_600_000     },
  { label: "6 ЧАСОВ", sublabel: "каждые 6 часов",  ms: 21_600_000    },
  { label: "1 ДЕНЬ",  sublabel: "каждый день",     ms: 86_400_000    },
  { label: "1 НЕД",   sublabel: "каждую неделю",   ms: 604_800_000   },
  { label: "1 МЕС",   sublabel: "каждый месяц",    ms: 2_592_000_000 },
];

// ── Design tokens ─────────────────────────────────────────────────────────────
const BG       = "#080808";
const SURFACE  = "rgba(255,255,255,0.03)";
const SURFACE2 = "rgba(255,255,255,0.055)";
const CREAM    = "#F0EBE0";
const CREAM55  = "rgba(240,235,224,0.55)";
const CREAM28  = "rgba(240,235,224,0.28)";
const CREAM18  = "rgba(240,235,224,0.18)";
const CREAM08  = "rgba(240,235,224,0.08)";
const GOLD     = "#C9A84C";
const GOLDA    = "rgba(201,168,76,";
const RED      = "#FF4D5E";
const REDA     = "rgba(255,77,94,";
const BORDER   = "rgba(201,168,76,0.10)";
const BORDER_S = "rgba(240,235,224,0.07)";

// ── Types ─────────────────────────────────────────────────────────────────────

type Period    = "1H" | "24H" | "7D" | "30D" | "ALL";
type ChartType = "line" | "bar";

// ── Helpers ───────────────────────────────────────────────────────────────────

function holdTime(openedAt: number): string {
  const ms = Date.now() - openedAt;
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  if (d > 0) return `${d}д ${h % 24}ч`;
  if (h > 0) return `${h}ч ${m % 60}м`;
  return `${m}м`;
}

/** Format a USD market cap / large value with M/K suffix */
function fmtMcap(v: number): string {
  if (!v || v <= 0) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(3)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

/** Format a large token amount with K/M suffix */
function fmtTokenAmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(2)}K`;
  return n.toFixed(2);
}

function periodCutoff(period: Period): number {
  const now = Date.now();
  return {
    "1H":  now - 3_600_000,
    "24H": now - 86_400_000,
    "7D":  now - 7 * 86_400_000,
    "30D": now - 30 * 86_400_000,
    "ALL": 0,
  }[period];
}

function formatXTick(ts: number, period: Period): string {
  const d = new Date(ts);
  if (period === "1H" || period === "24H")
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${d.toLocaleDateString("ru", { month: "short" }).replace(".", "")}`;
}

function formatBarLabel(ts: number, period: Period): string {
  const d = new Date(ts);
  if (period === "1H" || period === "24H")
    return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
  return `${d.getDate()} ${d.toLocaleDateString("ru", { month: "short" }).replace(".", "")}`;
}

function getPeriodPnl(
  period: Period,
  history: PortfolioSnapshot[],
  trades: TradeRecord[],
  currentUsd: number,
  openPositions: Position[],
): { pnlUsd: number; pnlPct: number; startUsd: number } {
  const cutoff = periodCutoff(period);
  const before = history.filter((s) => s.timestamp <= cutoff);
  const startSnap = before.length > 0 ? before[before.length - 1] : history[0];
  const startUsd  = startSnap?.totalUsd ?? currentUsd;

  // Realized PNL from closed SELL trades in the period.
  // usdValue = sale proceeds; pnlPct = (sellPrice-entryPrice)/entryPrice*100
  // Real pnlUsd = saleProceeds - costBasis = saleProceeds * pnlPct / (100 + pnlPct)
  const realizedFromTrades = trades
    .filter((t) => t.timestamp >= cutoff && t.side === "SELL" && (t.pnlPct != null))
    .reduce((s, t) => {
      const pct = t.pnlPct ?? 0;
      const divisor = 100 + pct;
      if (Math.abs(divisor) < 0.001) return s;
      return s + t.usdValue * pct / divisor;
    }, 0);

  // Unrealized PNL from open positions (current - invested)
  const unrealized = openPositions.reduce((s, p) => s + p.pnlUsd, 0);

  // If we have snapshot history: compare current vs start + add any realized
  // If no meaningful history: rely purely on position PNL
  const pnlUsd = history.length > 1
    ? (currentUsd - startUsd) + realizedFromTrades
    : unrealized + realizedFromTrades;

  const base = history.length > 1
    ? startUsd
    : openPositions.reduce((s, p) => s + (p.costBasisUsd ?? 0), 0);

  const pnlPct = base > 0 ? (pnlUsd / base) * 100 : 0;
  return { pnlUsd, pnlPct, startUsd };
}

function buildChartData(period: Period, history: PortfolioSnapshot[], currentUsd: number) {
  const cutoff   = periodCutoff(period);
  const filtered = history.filter((s) => s.timestamp >= cutoff);
  const slice    = filtered.length > 0 ? filtered : history.slice(-7);
  const withCurrent = [...slice, { timestamp: Date.now(), totalUsd: currentUsd }];
  const startVal = withCurrent[0].totalUsd;
  return withCurrent.map((s, i, arr) => ({
    ts:     s.timestamp,
    label:  formatBarLabel(s.timestamp, period),
    value:  s.totalUsd,
    pnl:    s.totalUsd - startVal,
    pnlPct: startVal > 0 ? ((s.totalUsd - startVal) / startVal) * 100 : 0,
    barPnl: i === 0 ? 0 : s.totalUsd - arr[i - 1].totalUsd,
  }));
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, period }: any) {
  if (!active || !payload?.length) return null;
  const d    = payload[0].payload;
  const pos  = d.pnl >= 0;
  const bPos = d.barPnl >= 0;
  return (
    <div style={{
      background: "rgba(8,8,8,0.97)",
      border: `1px solid ${GOLDA}0.22)`,
      borderRadius: "12px", padding: "10px 14px", minWidth: "140px",
      boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
    }}>
      <div style={{ color: CREAM18, fontSize: "9px", fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.08em", marginBottom: "6px" }}>
        {formatXTick(d.ts, period)}
      </div>
      <div style={{ color: CREAM, fontSize: "13px", fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>
        ${d.value.toFixed(2)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px" }}>
        <span style={{ color: pos ? GOLD : RED, fontSize: "11px", fontFamily: "'Space Grotesk',sans-serif" }}>
          {pos ? "+" : ""}${Math.abs(d.pnl).toFixed(2)}
        </span>
        <span style={{
          background: pos ? `${GOLDA}0.10)` : `${REDA}0.10)`,
          border: `1px solid ${pos ? `${GOLDA}0.25)` : `${REDA}0.25)`}`,
          color: pos ? GOLD : RED,
          fontSize: "9px", padding: "1px 6px", borderRadius: "6px",
        }}>
          {pos ? "+" : ""}{d.pnlPct.toFixed(2)}%
        </span>
      </div>
      {d.barPnl !== 0 && (
        <div style={{ color: bPos ? `${GOLDA}0.5)` : `${REDA}0.5)`, fontSize: "9px", marginTop: "2px" }}>
          день: {bPos ? "+" : ""}${Math.abs(d.barPnl).toFixed(2)}
        </div>
      )}
    </div>
  );
}

// ── Line Chart ─────────────────────────────────────────────────────────────────

function LineChartView({ data, color, startVal, period }: {
  data: ReturnType<typeof buildChartData>;
  color: string;
  startVal: number;
  period: Period;
}) {
  const tickStep = Math.max(1, Math.floor(data.length / 6));
  const ticks = data.filter((_, i) => i % tickStep === 0).map((d) => d.ts);
  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.14}/>
            <stop offset="100%" stopColor={color} stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CREAM08} horizontal={true} vertical={false}/>
        <XAxis
          dataKey="ts" type="number" domain={["dataMin","dataMax"]}
          ticks={ticks} tickFormatter={(v) => formatXTick(v, period)}
          tick={{ fill: CREAM28, fontSize: 8, fontFamily: "'Space Grotesk',sans-serif" }}
          axisLine={false} tickLine={false} interval="preserveStartEnd"
        />
        <YAxis
          domain={["auto","auto"]}
          tick={{ fill: CREAM28, fontSize: 8, fontFamily: "'Space Grotesk',sans-serif" }}
          tickFormatter={(v) => Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${Math.round(v)}`}
          axisLine={false} tickLine={false} width={42}
        />
        <Tooltip content={(p) => <ChartTooltip {...p} period={period}/>} cursor={{ stroke: CREAM18, strokeWidth: 1, strokeDasharray: "4 4" }}/>
        <ReferenceLine y={startVal} stroke={CREAM18} strokeDasharray="4 4" strokeWidth={1}/>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill="url(#lineGrad)" dot={false} activeDot={{ r: 3, fill: color, strokeWidth: 0 }}/>
      </AreaChart>
    </ResponsiveContainer>
  );
}

// ── Bar Chart ──────────────────────────────────────────────────────────────────

function BarChartView({ data, period }: { data: ReturnType<typeof buildChartData>; period: Period }) {
  const barData = data.slice(1);
  const n = barData.length;
  if (n === 0) {
    return (
      <div style={{ height: 210, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: CREAM28, fontSize: "11px" }}>Недостаточно данных</p>
      </div>
    );
  }
  const barSize      = n <= 5 ? 40 : n <= 10 ? 28 : n <= 20 ? 16 : n <= 30 ? 10 : 7;
  const showLabels   = n <= 20;
  const tickInterval = n <= 10 ? 0 : n <= 20 ? 1 : Math.floor(n / 10);
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={barData} margin={{ top: showLabels ? 22 : 8, right: 6, left: -20, bottom: 0 }} barSize={barSize} barCategoryGap="20%">
        <CartesianGrid strokeDasharray="4 4" stroke={CREAM08} horizontal vertical={false}/>
        <XAxis dataKey="label" tick={{ fill: CREAM28, fontSize: 8, fontFamily: "'Space Grotesk',sans-serif" }} axisLine={false} tickLine={false} interval={tickInterval}/>
        <YAxis tick={{ fill: CREAM28, fontSize: 8, fontFamily: "'Space Grotesk',sans-serif" }} tickFormatter={(v) => (Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}k` : `$${Math.round(v)}`)} axisLine={false} tickLine={false} width={42}/>
        <Tooltip content={(p) => <ChartTooltip {...p} period={period}/>} cursor={{ fill: CREAM08, radius: 4 }}/>
        <ReferenceLine y={0} stroke={CREAM18} strokeWidth={1}/>
        <Bar dataKey="barPnl" radius={[4, 4, 0, 0]} isAnimationActive={false}>
          {showLabels && (
            <LabelList dataKey="barPnl" position="top"
              formatter={(v: number) => v === 0 ? "" : (v > 0 ? "+" : "") + "$" + Math.abs(Math.round(v))}
              style={{ fill: CREAM28, fontSize: 7, fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600 }}
            />
          )}
          {barData.map((entry, i) => (
            <Cell key={i} fill={entry.barPnl >= 0 ? `${GOLDA}0.7)` : `${REDA}0.75)`}/>
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Luxury Label ──────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      color: `${GOLDA}0.45)`, fontSize: "8px",
      fontFamily: "'Space Grotesk',sans-serif",
      fontWeight: 700, letterSpacing: "0.14em",
      marginBottom: "6px",
    }}>
      {children}
    </div>
  );
}

// ── Luxury Card ───────────────────────────────────────────────────────────────

function LuxCard({ children, style, accentLeft = false, gold = false }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  accentLeft?: boolean;
  gold?: boolean;
}) {
  return (
    <div style={{
      background: SURFACE,
      border: `1px solid ${gold ? BORDER : BORDER_S}`,
      borderRadius: "16px",
      overflow: "hidden",
      position: "relative",
      ...style,
    }}>
      {accentLeft && (
        <div style={{
          position: "absolute", left: 0, top: "20%", bottom: "20%",
          width: 2, borderRadius: "0 2px 2px 0",
          background: `linear-gradient(180deg, transparent, ${GOLDA}0.7), transparent)`,
        }}/>
      )}
      {children}
    </div>
  );
}

// ── Position Card — Alpha One style ───────────────────────────────────────────

function PositionCard({ pos, totalUsd, onClose, onShare }: {
  pos: Position; totalUsd: number; onClose: () => void; onShare: (p: Position) => void;
}) {
  const { addDCAOrder, removeDCAOrder, getDCAForMint } = useTrading();
  // Show PnL only when we have a real cost basis (bought through the app or manually set).
  // Chain-only tokens without cost basis show "—" in the PnL slot.
  const hasPnl   = (pos.costBasisUsd != null && pos.costBasisUsd > 0) && pos.currentPrice > 0;
  const pnlPos   = pos.pnlUsd >= 0;
  const pnlColor = pnlPos ? "#4ADE80" : RED;

  const existingDCA = getDCAForMint(pos.mint);
  const [expanded,    setExpanded]    = useState(false);
  const [sellOpen,    setSellOpen]    = useState(false);
  const [dcaOpen,     setDcaOpen]     = useState(false);
  const [dcaAmt,      setDcaAmt]      = useState("25");
  const [dcaInterval, setDcaInterval] = useState(DCA_INTERVALS[1]);

  // Format token amount like Alpha One: "1M Baby", "745K BullWhale"
  const amtLabel = `${fmtTokenAmt(pos.amount)} ${pos.symbol}`;

  // PnL line: "+173$ • 155%" or "-67.83$ • 51.48%"
  const pnlLine = `${pnlPos ? "+" : ""}${pos.pnlUsd.toFixed(2)}$ • ${Math.abs(pos.pnlPct).toFixed(2)}%`;

  return (
    <div>
      {/* ── Main row (Alpha One style) ── */}
      <div
        style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 16px", cursor: "pointer" }}
        onClick={() => setExpanded(p => !p)}
      >
        {/* Logo */}
        <div style={{ flexShrink: 0, position: "relative" }}>
          {pos.logoURI
            ? <img
                src={pos.logoURI} alt={pos.symbol}
                style={{ width: 46, height: 46, borderRadius: "50%", display: "block", objectFit: "cover" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.removeAttribute("style"); }}
              />
            : null
          }
          <div style={{
            width: 46, height: 46, borderRadius: "50%",
            background: "rgba(201,168,76,0.12)",
            border: "1.5px solid rgba(201,168,76,0.25)",
            display: pos.logoURI ? "none" : "flex",
            alignItems: "center", justifyContent: "center",
            color: GOLD, fontSize: "14px", fontWeight: 800,
          }}>
            {pos.symbol.slice(0, 2).toUpperCase()}
          </div>
        </div>

        {/* Left: name + amount */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: CREAM, fontSize: "16px", fontWeight: 700,
            fontFamily: "'Space Grotesk',sans-serif",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {pos.symbol}
          </div>
          <div style={{
            color: "rgba(240,235,224,0.45)", fontSize: "12px",
            fontFamily: "'Space Grotesk',sans-serif", marginTop: "2px",
          }}>
            {amtLabel}
          </div>
        </div>

        {/* Right: value + PnL */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            color: CREAM, fontSize: "16px", fontWeight: 700,
            fontFamily: "'Space Grotesk',sans-serif",
          }}>
            {pos.usdValue > 0 ? `$${pos.usdValue.toFixed(2)}` : "—"}
          </div>
          {hasPnl && (
            <div style={{
              color: pnlColor, fontSize: "12px",
              fontFamily: "'Space Grotesk',sans-serif", marginTop: "2px", fontWeight: 600,
            }}>
              {pnlLine}
            </div>
          )}
        </div>

        {/* Close button */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            flexShrink: 0, width: 28, height: 28, borderRadius: "50%",
            background: "rgba(255,77,94,0.08)", border: "1px solid rgba(255,77,94,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          <X size={12} style={{ color: RED }}/>
        </button>
      </div>

      {/* ── Expanded details ── */}
      {expanded && (
        <div style={{ padding: "0 16px 14px", display: "flex", flexDirection: "column", gap: "10px" }}>

          {/* Stats grid: cost basis / current value / hold time */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "6px" }}>
            {[
              {
                label: "ВЛОЖЕНО",
                value: (() => {
                  // Fall back to entryPrice × amount if costBasisUsd not explicitly set
                  const invested = pos.costBasisUsd ?? (pos.entryPrice > 0 ? pos.entryPrice * pos.amount : 0);
                  return invested > 0 ? `${invested.toFixed(2)}` : "—";
                })(),
              },
              {
                label: "СЕЙЧАС",
                value: pos.usdValue > 0 ? fmtMcap(pos.usdValue) : "—",
              },
              {
                label: "ДЕРЖИМ",
                value: holdTime(pos.openedAt),
              },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: "rgba(240,235,224,0.04)", borderRadius: "10px", padding: "8px 10px" }}>
                <div style={{ color: "rgba(201,168,76,0.45)", fontSize: "7px", fontWeight: 700, letterSpacing: "0.1em", marginBottom: "3px" }}>{label}</div>
                <div style={{ color: CREAM, fontSize: "11px", fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* SL / TP chips — displayed as % change from entry */}
          {(pos.slPrice || pos.tpPrice || pos.trailingPct) && (
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {pos.slPrice && pos.entryPrice > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "8px",
                  background: "rgba(255,77,94,0.07)", border: "1px solid rgba(255,77,94,0.20)" }}>
                  <span style={{ color: "rgba(255,77,94,0.6)", fontSize: "8px", fontWeight: 700 }}>СЛ</span>
                  <span style={{ color: RED, fontSize: "10px", fontWeight: 700 }}>
                    {((pos.slPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              {pos.tpPrice && pos.entryPrice > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "8px",
                  background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.20)" }}>
                  <span style={{ color: "rgba(74,222,128,0.6)", fontSize: "8px", fontWeight: 700 }}>ТП</span>
                  <span style={{ color: "#4ADE80", fontSize: "10px", fontWeight: 700 }}>
                    +{((pos.tpPrice - pos.entryPrice) / pos.entryPrice * 100).toFixed(0)}%
                  </span>
                </div>
              )}
              {pos.trailingPct && (
                <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "8px",
                  background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.20)" }}>
                  <span style={{ color: "rgba(201,168,76,0.6)", fontSize: "8px", fontWeight: 700 }}>ТРЕЙЛ</span>
                  <span style={{ color: GOLD, fontSize: "10px", fontWeight: 700 }}>{pos.trailingPct}%</span>
                </div>
              )}
            </div>
          )}

          {/* Action buttons row */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setSellOpen(true)}
              style={{
                flex: 1, padding: "11px 0", borderRadius: "12px", cursor: "pointer",
                background: "rgba(255,77,94,0.10)", border: "1px solid rgba(255,77,94,0.35)",
                color: "#FF4D5E", fontSize: "12px", fontWeight: 700, display: "flex",
                alignItems: "center", justifyContent: "center", gap: "6px",
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              <TrendingDown size={13}/> ПРОДАТЬ
            </button>
            <button
              onClick={() => onShare(pos)}
              style={{
                flex: 1, padding: "11px 0", borderRadius: "12px", cursor: "pointer",
                background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)",
                color: GOLD, fontSize: "12px", fontWeight: 700, display: "flex",
                alignItems: "center", justifyContent: "center", gap: "6px",
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              <Share2 size={13}/> ШАРИТЬ
            </button>
            <button
              onClick={() => setDcaOpen(p => !p)}
              style={{
                flex: 1, padding: "11px 0", borderRadius: "12px", cursor: "pointer",
                background: (dcaOpen || existingDCA) ? "rgba(106,173,255,0.12)" : "rgba(106,173,255,0.05)",
                border: `1px solid ${(dcaOpen || existingDCA) ? "rgba(106,173,255,0.40)" : "rgba(106,173,255,0.18)"}`,
                color: (dcaOpen || existingDCA) ? "#6AADFF" : "rgba(106,173,255,0.55)",
                fontSize: "12px", fontWeight: 700, display: "flex",
                alignItems: "center", justifyContent: "center", gap: "6px",
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              <Repeat2 size={13}/>
              {existingDCA ? "DCA ✓" : "DCA"}
            </button>
          </div>

          {/* DCA form */}
          {dcaOpen && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px",
              padding: "12px", borderRadius: "12px",
              background: "rgba(106,173,255,0.05)", border: "1px solid rgba(106,173,255,0.16)" }}>
              <p style={{ color: "rgba(106,173,255,0.5)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em" }}>АВТО-ДОКУПКА (USD)</p>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#6AADFF", fontSize: "14px", fontWeight: 700 }}>$</span>
                <input
                  type="number" value={dcaAmt} onChange={e => setDcaAmt(e.target.value)}
                  style={{ width: "100%", paddingLeft: "26px", paddingRight: "10px", paddingTop: "9px", paddingBottom: "9px",
                    background: "rgba(106,173,255,0.08)", border: "1px solid rgba(106,173,255,0.25)",
                    borderRadius: "10px", color: "#fff", fontSize: "15px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, outline: "none" }}
                />
              </div>
              <div style={{ display: "flex", gap: "5px" }}>
                {[10, 25, 50, 100].map(v => (
                  <button key={v} onClick={() => setDcaAmt(String(v))} style={{
                    flex: 1, padding: "4px 0", borderRadius: "8px", fontSize: "10px", cursor: "pointer",
                    background: dcaAmt === String(v) ? "rgba(106,173,255,0.16)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${dcaAmt === String(v) ? "rgba(106,173,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                    color: dcaAmt === String(v) ? "#6AADFF" : "rgba(255,255,255,0.35)",
                  }}>${v}</button>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "5px" }}>
                {DCA_INTERVALS.map(iv => (
                  <button key={iv.ms} onClick={() => setDcaInterval(iv)} style={{
                    padding: "7px 4px", borderRadius: "10px", cursor: "pointer",
                    background: dcaInterval.ms === iv.ms ? "rgba(106,173,255,0.14)" : "rgba(255,255,255,0.03)",
                    border: `1px solid ${dcaInterval.ms === iv.ms ? "rgba(106,173,255,0.38)" : "rgba(255,255,255,0.07)"}`,
                    color: dcaInterval.ms === iv.ms ? "#6AADFF" : "rgba(255,255,255,0.35)",
                    fontSize: "9px", fontWeight: 700,
                  }}>{iv.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {existingDCA && (
                  <button onClick={() => { removeDCAOrder(existingDCA.id); setDcaOpen(false); }} style={{
                    flex: 1, padding: "9px 0", borderRadius: "11px", cursor: "pointer",
                    background: "rgba(255,77,94,0.07)", border: "1px solid rgba(255,77,94,0.25)",
                    color: RED, fontSize: "11px", fontWeight: 700,
                  }}>СТОП</button>
                )}
                <button
                  onClick={() => {
                    const amt = parseFloat(dcaAmt);
                    if (!amt) return;
                    addDCAOrder({ symbol: pos.symbol, mint: pos.mint, price: pos.currentPrice, amountUsd: amt, intervalMs: dcaInterval.ms });
                    setDcaOpen(false);
                  }}
                  style={{
                    flex: 2, padding: "9px 0", borderRadius: "11px", cursor: "pointer",
                    background: "linear-gradient(135deg, rgba(106,173,255,0.20), rgba(60,120,220,0.14))",
                    border: "1px solid rgba(106,173,255,0.42)",
                    color: "#6AADFF", fontSize: "11px", fontWeight: 700,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                  }}
                >
                  <Repeat2 size={12}/>ЗАПУСТИТЬ · ${parseFloat(dcaAmt || "0").toFixed(0)} {dcaInterval.label}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Quick sell modal */}
      <QuickSellModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        mint={pos.mint}
        symbol={pos.symbol}
        logoURI={pos.logoURI}
        amount={pos.amount}
        usdValue={pos.usdValue}
        usdPrice={pos.currentPrice}
        buyMcapUsd={pos.buyMcapUsd}
      />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

const PERIODS: Period[] = ["1H", "24H", "7D", "30D", "ALL"];

export default function Portfolio() {
  const [, navigate] = useLocation();
  const { connected, address: walletAddress } = useOkoWallet();
  const {
    positions, removePosition, clearAllPositions,
    totalUsd,
    portfolioHistory, tradeHistory,
    autoTrading, riskSettings,
  } = useTrading();

  // Real on-chain balance
  const { solBalance, solPrice: realSolPrice, totalUsd: realTotalUsd, tokens: chainTokens, loading: balanceLoading, refresh: refreshBalance } = useBalance();

  type SortKey = "default" | "created_desc" | "created_asc" | "balance_desc" | "balance_asc" | "pnl_desc" | "pnl_asc";

  const [period,        setPeriod]        = useState<Period>("30D");
  const [chartType,     setChartType]     = useState<ChartType>("line");
  const [tab,           setTab]           = useState<"positions" | "history" | "stats">("positions");
  const [sharePos,      setSharePos]      = useState<Position | null>(null);
  const [confirmClose,  setConfirmClose]  = useState(false);
  const [sortKey,       setSortKey]       = useState<SortKey>("balance_desc");
  const [showSortSheet, setShowSortSheet] = useState(false);

  // Incrementing this forces mergedPositions to re-read from localStorage.
  const [storeTick, setStoreTick] = useState(0);

  // On mount: migrate from all legacy stores + rebuild from trade history.
  useEffect(() => {
    migrateFromLegacyStores();
    rebuildStore(tradeHistory, positions, false); // fill gaps, don't overwrite
    setStoreTick((t) => t + 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount only

  // Snapshot real on-chain portfolio value for PnL chart.
  // Uses BalanceContext's totalUsd (real SOL + tokens), not tracked positions.
  // Throttled internally to 30-min intervals unless value changes significantly.
  useEffect(() => {
    if (realTotalUsd > 0) {
      addSnapshot(realTotalUsd);
    }
  }, [realTotalUsd]);

  // Merge real on-chain snapshots with trade-based snapshots for chart data.
  const mergedHistory = useMemo((): Snapshot[] => {
    const real = getSnapshots(); // on-chain snapshots (most accurate)
    // Also include TradingContext snapshots as additional data points
    const trading = portfolioHistory.map((s) => ({ timestamp: s.timestamp, totalUsd: s.totalUsd }));
    // Merge and deduplicate by timestamp bucket (keep the latest per 5-min bucket)
    const all = [...real, ...trading].sort((a, b) => a.timestamp - b.timestamp);
    const bucketMs = 5 * 60 * 1000;
    const deduped: Snapshot[] = [];
    for (const s of all) {
      const last = deduped[deduped.length - 1];
      if (!last || s.timestamp - last.timestamp >= bucketMs) {
        deduped.push(s);
      } else {
        // Replace with most recent
        deduped[deduped.length - 1] = s;
      }
    }
    return deduped;
  }, [portfolioHistory, realTotalUsd, storeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Merge on-chain tokens with locally tracked positions ───────────────────
  // storeTick changes force a re-read after reset or migration.
  // MUST come before periodPnl/quickStats so they can use real position PnL.
  const mergedPositions: Position[] = useMemo(() => {
    const byMint   = new Map<string, typeof positions[0]>();
    const bySymbol = new Map<string, typeof positions[0]>();
    for (const p of [...positions].reverse()) {
      byMint.set(p.mint, p);
      bySymbol.set(p.symbol.toUpperCase().trim(), p);
    }

    const onChain = chainTokens.filter((t) => t.amount > 0);

    const source = onChain.length > 0
      ? onChain
      : positions.map((p) => ({
          mint:     p.mint,
          symbol:   p.symbol,
          amount:   p.amount,
          usdPrice: p.currentPrice,
          usdValue: p.usdValue,
          logoURI:  p.logoURI,
        }));

    if (!source.length) return [];

    return source.map((token) => {
      const symUp    = token.symbol.toUpperCase().trim();
      const tracked  = byMint.get(token.mint) ?? bySymbol.get(symUp);

      const currentPrice  = Number(token.usdPrice) > 0 ? Number(token.usdPrice) : (tracked?.currentPrice ?? 0);
      const currentUsdVal = Number(token.usdValue) > 0 ? Number(token.usdValue) : token.amount * currentPrice;

      const fromStorage  = getInvested(token.mint, token.symbol);
      const fromTracked  = tracked && Number(tracked.usdValue) > 0 ? Number(tracked.usdValue) : undefined;
      const costBasisUsd: number | undefined = fromStorage ?? fromTracked;

      const entryPrice: number =
        (tracked && Number(tracked.entryPrice) > 0 ? Number(tracked.entryPrice) : 0) ||
        (costBasisUsd && token.amount > 0 ? costBasisUsd / token.amount : 0);

      const hasBasis   = costBasisUsd != null && costBasisUsd > 0;
      const hasCurrent = currentUsdVal > 0;
      const pnlUsd     = hasBasis && hasCurrent ? currentUsdVal - costBasisUsd! : 0;
      const pnlPct     = hasBasis && hasCurrent ? (pnlUsd / costBasisUsd!) * 100 : 0;

      return {
        id:          tracked?.id ?? `chain-${token.mint}`,
        symbol:      token.symbol,
        mint:        token.mint,
        logoURI:     (token.logoURI as string | undefined) ?? tracked?.logoURI,
        entryPrice,
        currentPrice,
        amount:      token.amount,
        usdValue:    currentUsdVal,
        costBasisUsd,
        pnlUsd,
        pnlPct,
        openedAt:    tracked?.openedAt ?? Date.now(),
        slPrice:     tracked?.slPrice,
        tpPrice:     tracked?.tpPrice,
        trailingPct: tracked?.trailingPct,
      };
    });
  }, [chainTokens, positions, storeTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Global PNL from mergedPositions (unrealized) + realized from trades ────
  const investedCap     = mergedPositions.reduce((s, p) => s + (p.costBasisUsd ?? 0), 0);
  const unrealizedPnlUsd = mergedPositions.reduce((s, p) => s + p.pnlUsd, 0);
  // Realized PNL from all SELL trades ever: sale_proceeds * pnlPct / (100 + pnlPct)
  const realizedPnlUsd  = tradeHistory
    .filter((t) => t.side === "SELL" && t.pnlPct != null)
    .reduce((s, t) => {
      const pct = t.pnlPct ?? 0;
      const divisor = 100 + pct;
      if (Math.abs(divisor) < 0.001) return s;
      return s + t.usdValue * pct / divisor;
    }, 0);
  const totalCostBasis   = investedCap + tradeHistory
    .filter((t) => t.side === "SELL")
    .reduce((s, t) => {
      const pct = t.pnlPct ?? 0;
      const divisor = 100 + pct;
      if (Math.abs(divisor) < 0.001) return s + t.usdValue;
      return s + t.usdValue * 100 / divisor;
    }, 0);
  const computedTotalPnlUsd = unrealizedPnlUsd + realizedPnlUsd;
  const computedTotalPnlPct = totalCostBasis > 0 ? (computedTotalPnlUsd / totalCostBasis) * 100 : 0;

  const periodPnl = useMemo(() =>
    getPeriodPnl(period, mergedHistory, tradeHistory, realTotalUsd || totalUsd, mergedPositions),
    [period, mergedHistory, tradeHistory, realTotalUsd, totalUsd, mergedPositions],
  );

  const chartData = useMemo(() =>
    buildChartData(period, mergedHistory, realTotalUsd || totalUsd),
    [period, mergedHistory, realTotalUsd, totalUsd],
  );

  const quickStats = useMemo(() => (
    (["24H","7D","30D","ALL"] as Period[]).map((p) => ({
      label: p,
      ...getPeriodPnl(p, mergedHistory, tradeHistory, realTotalUsd || totalUsd, mergedPositions),
    }))
  ), [mergedHistory, tradeHistory, realTotalUsd, totalUsd, mergedPositions]);

  // ── Trade statistics ───────────────────────────────────────────────────────
  // All confirmed trades (buys + sells)
  const totalTradeCount = tradeHistory.length;
  // Closed sells with PNL data
  const closedSells  = tradeHistory.filter((t) => t.side === "SELL" && t.pnlPct != null);
  // "Win" = closed sell with pnlPct > 0
  const winTrades    = closedSells.filter((t) => (t.pnlPct ?? 0) > 0).length;
  const winRate      = closedSells.length > 0 ? (winTrades / closedSells.length) * 100 : 0;
  const totalFees    = tradeHistory.reduce((s, t) => s + (t.fee ?? 0), 0);
  // Realized total for sub-stat display (uses correct formula)
  const realizedTotal = realizedPnlUsd;

  // ── Best / Worst: merge open positions + closed sells ─────────────────────
  // Combine pnlPct from open positions and closed sells into one pool
  type PnlEntry = { symbol: string; pnlPct: number; pnlUsd: number; open: boolean };
  const openPnlEntries: PnlEntry[]   = mergedPositions
    .filter((p) => p.pnlPct !== 0 || (p.costBasisUsd ?? 0) > 0)
    .map((p) => ({ symbol: p.symbol, pnlPct: p.pnlPct, pnlUsd: p.pnlUsd, open: true }));
  const closedPnlEntries: PnlEntry[] = closedSells.map((t) => {
    const pct = t.pnlPct ?? 0;
    const divisor = 100 + pct;
    const pnlUsd = Math.abs(divisor) > 0.001 ? t.usdValue * pct / divisor : 0;
    return { symbol: t.symbol, pnlPct: pct, pnlUsd, open: false };
  });
  const allPnlEntries = [...openPnlEntries, ...closedPnlEntries];
  const bestEntry  = allPnlEntries.length > 0 ? allPnlEntries.reduce((a, b) => a.pnlPct > b.pnlPct ? a : b) : null;
  const worstEntry = allPnlEntries.length > 0 ? allPnlEntries.reduce((a, b) => a.pnlPct < b.pnlPct ? a : b) : null;
  // Keep bestPos/worstPos for the mini-card (open positions only)
  const bestPos  = mergedPositions.length > 0 ? mergedPositions.reduce((a, b) => a.pnlPct > b.pnlPct ? a : b) : null;
  const worstPos = mergedPositions.length > 0 ? mergedPositions.reduce((a, b) => a.pnlPct < b.pnlPct ? a : b) : null;

  // Use real on-chain balance if available, fall back to calculated from positions
  const displayTotalUsd = realTotalUsd > 0 ? realTotalUsd : totalUsd;

  const pnlPos      = periodPnl.pnlUsd >= 0;
  const chartColor  = pnlPos ? GOLD : RED;
  const totalPnlPos = computedTotalPnlUsd >= 0;
  const tAccent     = totalPnlPos ? GOLD : RED;
  const tAccentA    = totalPnlPos ? GOLDA : REDA;

  // Sorted positions for display
  const sortedPositions: Position[] = useMemo(() => {
    const arr = [...mergedPositions];
    switch (sortKey) {
      case "created_desc": return arr.sort((a, b) => b.openedAt - a.openedAt);
      case "created_asc":  return arr.sort((a, b) => a.openedAt - b.openedAt);
      case "balance_desc": return arr.sort((a, b) => b.usdValue - a.usdValue);
      case "balance_asc":  return arr.sort((a, b) => a.usdValue - b.usdValue);
      case "pnl_desc":     return arr.sort((a, b) => b.pnlPct - a.pnlPct);
      case "pnl_asc":      return arr.sort((a, b) => a.pnlPct - b.pnlPct);
      default: return arr;
    }
  }, [mergedPositions, sortKey]);

  return (
    <div style={{ minHeight: "100vh", background: BG, paddingBottom: "48px", fontFamily: "'Space Grotesk',sans-serif" }}>

      {/* ── Sticky header ── */}
      <div style={{
        position: "sticky", top: 0, zIndex: 20,
        display: "flex", alignItems: "center", gap: "12px",
        padding: "12px 16px",
        background: "rgba(8,8,8,0.97)",
        borderBottom: `1px solid ${GOLDA}0.10)`,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}>
        <button onClick={() => navigate("/")} style={{
          width: 34, height: 34, borderRadius: "10px",
          background: CREAM08, border: `1px solid ${BORDER_S}`,
          display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
        }}>
          <ArrowLeft size={14} style={{ color: CREAM55 }}/>
        </button>
        <div>
          <div style={{ color: GOLD, fontSize: "13px", fontWeight: 900, letterSpacing: "0.14em" }}>
            PORTFOLIO
          </div>
          <div style={{ color: CREAM28, fontSize: "9px", letterSpacing: "0.06em", marginTop: "1px" }}>
            {mergedPositions.length} позиций · реал-тайм PNL
          </div>
        </div>
        {autoTrading && (
          <div style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: "5px",
            padding: "4px 10px", borderRadius: "20px",
            background: `${GOLDA}0.08)`, border: `1px solid ${GOLDA}0.22)`,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: GOLD, boxShadow: `0 0 5px ${GOLD}` }}/>
            <span style={{ color: GOLD, fontSize: "8px", fontWeight: 800, letterSpacing: "0.1em" }}>AUTO</span>
          </div>
        )}
      </div>

      <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 16px 0" }}>

        {/* ── Hero Balance ── */}
        <div style={{
          borderRadius: "20px", padding: "22px 20px",
          background: SURFACE,
          border: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${GOLDA}0.55)`,
          marginBottom: "12px",
          position: "relative", overflow: "hidden",
        }}>
          {/* Subtle gold glow top-right */}
          <div style={{
            position: "absolute", top: -40, right: -40,
            width: 120, height: 120, borderRadius: "50%",
            background: `radial-gradient(circle, ${GOLDA}0.06) 0%, transparent 70%)`,
            pointerEvents: "none",
          }}/>

          <Label>TOTAL PORTFOLIO VALUE</Label>

          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
            <div>
              <div style={{ color: CREAM, fontSize: "34px", fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1 }}>
                ${displayTotalUsd.toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "5px", marginTop: "6px" }}>
                <Wallet size={10} style={{ color: CREAM28 }}/>
                <span style={{ color: CREAM28, fontSize: "10px" }}>
                  {balanceLoading ? "обновление..." : `${solBalance.toFixed(4)} SOL · реальный баланс`}
                </span>
                <button
                  onClick={() => refreshBalance()}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", opacity: balanceLoading ? 0.4 : 0.7 }}
                  title="Обновить балансы"
                >
                  <RefreshCw size={10} style={{ color: CREAM28 }}/>
                </button>
              </div>
              {walletAddress && (
                <a
                  href={`https://solscan.io/account/${walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "4px", textDecoration: "none" }}
                >
                  <span style={{ color: "rgba(201,168,76,0.4)", fontSize: "9px", fontFamily: "monospace" }}>
                    {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                  </span>
                  <ExternalLink size={8} style={{ color: "rgba(201,168,76,0.4)" }}/>
                </a>
              )}
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: tAccent, fontSize: "20px", fontWeight: 800 }}>
                {totalPnlPos ? "+" : ""}${Math.abs(computedTotalPnlUsd).toFixed(2)}
              </div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                padding: "3px 9px", borderRadius: "7px", marginTop: "4px",
                background: `${tAccentA}0.10)`, border: `1px solid ${tAccentA}0.22)`,
              }}>
                {totalPnlPos
                  ? <TrendingUp  size={10} style={{ color: tAccent }}/>
                  : <TrendingDown size={10} style={{ color: tAccent }}/>}
                <span style={{ color: tAccent, fontSize: "11px", fontWeight: 800 }}>
                  {totalPnlPos ? "+" : ""}{computedTotalPnlPct.toFixed(2)}%
                </span>
              </div>
              <div style={{ color: CREAM18, fontSize: "8px", marginTop: "3px", letterSpacing: "0.06em" }}>ЗА ВСЁ ВРЕМЯ</div>
            </div>
          </div>

          {/* Sub-stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px", marginTop: "18px" }}>
            {[
              { label: "ВЛОЖЕНО",     value: `$${investedCap.toFixed(2)}`,  color: CREAM55 },
              { label: "РЕАЛИЗОВАНО", value: `${realizedTotal >= 0 ? "+" : ""}$${Math.abs(realizedTotal).toFixed(2)}`, color: realizedTotal >= 0 ? GOLD : RED },
              { label: "ПОЗИЦИЙ",     value: String(mergedPositions.length),       color: GOLD },
            ].map(({ label, value, color }) => (
              <div key={label} style={{
                background: CREAM08, borderRadius: "12px", padding: "10px",
                textAlign: "center", borderTop: `1px solid ${GOLDA}0.08)`,
              }}>
                <div style={{ color, fontSize: "13px", fontWeight: 800 }}>{value}</div>
                <div style={{ color: CREAM18, fontSize: "7px", marginTop: "3px", letterSpacing: "0.1em", fontWeight: 700 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Chart card ── */}
        <LuxCard gold style={{ marginBottom: "12px" }}>
          {/* Chart header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "14px 16px 10px",
            borderBottom: `1px solid ${BORDER_S}`,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ color: pnlPos ? GOLD : RED, fontSize: "22px", fontWeight: 900 }}>
                  {pnlPos ? "+" : ""}${Math.abs(periodPnl.pnlUsd).toFixed(2)}
                </span>
                <span style={{ color: pnlPos ? GOLD : RED, fontSize: "12px", opacity: 0.7, fontWeight: 700 }}>
                  {pnlPos ? "+" : ""}{periodPnl.pnlPct.toFixed(2)}%
                </span>
              </div>
              <div style={{ color: CREAM28, fontSize: "8px", marginTop: "2px", letterSpacing: "0.08em", fontWeight: 700 }}>
                PNL · {period}
              </div>
            </div>
            {/* Chart type toggle */}
            <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "10px", background: CREAM08 }}>
              {([
                { t: "line" as ChartType, icon: <LineChart size={12}/> },
                { t: "bar"  as ChartType, icon: <BarChart2 size={12}/> },
              ]).map(({ t, icon }) => (
                <button key={t} onClick={() => setChartType(t)} style={{
                  width: 30, height: 26, borderRadius: "7px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: chartType === t ? `${GOLDA}0.14)` : "transparent",
                  border:     chartType === t ? `1px solid ${GOLDA}0.25)` : "1px solid transparent",
                  color:      chartType === t ? GOLD : CREAM28,
                  transition: "all 0.15s",
                }}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Period tabs */}
          <div style={{ display: "flex", borderBottom: `1px solid ${BORDER_S}` }}>
            {PERIODS.map((p) => (
              <button key={p} onClick={() => setPeriod(p)} style={{
                flex: 1, padding: "8px 0", cursor: "pointer",
                background: "transparent", border: "none",
                color: period === p ? GOLD : CREAM28,
                fontSize: "10px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800,
                borderBottom: period === p ? `2px solid ${GOLD}` : "2px solid transparent",
                transition: "all 0.15s", letterSpacing: "0.06em",
              }}>
                {p}
              </button>
            ))}
          </div>

          <div style={{ padding: "12px 8px 8px 0" }}>
            {chartType === "line"
              ? <LineChartView data={chartData} color={chartColor} startVal={periodPnl.startUsd} period={period}/>
              : <BarChartView  data={chartData} period={period}/>}
          </div>
        </LuxCard>

        {/* ── Period breakdown ── */}
        <LuxCard style={{ marginBottom: "12px" }}>
          <div style={{ padding: "10px 16px 8px", borderBottom: `1px solid ${BORDER_S}` }}>
            <Label>PNL ПО ПЕРИОДАМ</Label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr" }}>
            {quickStats.map(({ label, pnlUsd, pnlPct }, i) => {
              const pos = pnlUsd >= 0;
              return (
                <div key={label} style={{
                  padding: "12px 8px", textAlign: "center",
                  borderRight: i < 3 ? `1px solid ${BORDER_S}` : "none",
                }}>
                  <div style={{ color: `${GOLDA}0.35)`, fontSize: "7px", fontWeight: 800, letterSpacing: "0.12em", marginBottom: "6px" }}>
                    {label}
                  </div>
                  <div style={{ color: pos ? GOLD : RED, fontSize: "13px", fontWeight: 800 }}>
                    {pos ? "+" : ""}{pnlPct.toFixed(1)}%
                  </div>
                  <div style={{ color: pos ? `${GOLDA}0.5)` : `${REDA}0.5)`, fontSize: "9px", marginTop: "2px", fontWeight: 700 }}>
                    {pos ? "+" : ""}${Math.abs(pnlUsd).toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>
        </LuxCard>

        {/* ── Win rate + Best/Worst ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
          {/* Win rate */}
          <div style={{
            borderRadius: "16px", padding: "14px",
            background: SURFACE, border: `1px solid ${BORDER_S}`,
            borderLeft: `3px solid ${GOLDA}0.4)`,
          }}>
            <Label>WIN RATE</Label>
            <div style={{ color: winRate >= 50 ? GOLD : RED, fontSize: "26px", fontWeight: 900, lineHeight: 1 }}>
              {winRate.toFixed(0)}%
            </div>
            <div style={{ height: 2, borderRadius: 2, background: CREAM08, marginTop: "10px" }}>
              <div style={{
                height: 2, borderRadius: 2, width: `${winRate}%`,
                background: winRate >= 50 ? `${GOLDA}0.7)` : `${REDA}0.7)`,
                transition: "width 0.3s",
              }}/>
            </div>
            <div style={{ color: CREAM28, fontSize: "8px", marginTop: "5px" }}>
              {winTrades}/{tradeHistory.length} сделок
            </div>
          </div>

          {/* Best / Worst */}
          <div style={{
            borderRadius: "16px", padding: "14px",
            background: SURFACE, border: `1px solid ${BORDER_S}`,
          }}>
            <Label>ПОЗИЦИИ</Label>
            {bestPos ? (
              <div style={{ marginBottom: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: CREAM28, fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em" }}>ЛУЧШАЯ</span>
                  <span style={{ color: GOLD, fontSize: "12px", fontWeight: 800 }}>+{bestPos.pnlPct.toFixed(1)}%</span>
                </div>
                <div style={{ color: CREAM, fontSize: "13px", fontWeight: 800, marginTop: "2px" }}>{bestPos.symbol}</div>
              </div>
            ) : <div style={{ color: CREAM28, fontSize: "10px" }}>—</div>}
            {worstPos && worstPos.id !== bestPos?.id ? (
              <div style={{ paddingTop: "8px", borderTop: `1px solid ${BORDER_S}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: CREAM28, fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em" }}>ХУДШАЯ</span>
                  <span style={{ color: RED, fontSize: "12px", fontWeight: 800 }}>{worstPos.pnlPct.toFixed(1)}%</span>
                </div>
                <div style={{ color: CREAM, fontSize: "13px", fontWeight: 800, marginTop: "2px" }}>{worstPos.symbol}</div>
              </div>
            ) : null}
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "8px" }}>
          <button onClick={() => navigate("/trading")} style={{
            padding: "14px 0", borderRadius: "14px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            background: `${GOLDA}0.09)`, border: `1px solid ${GOLDA}0.24)`,
          }}>
            <Activity size={13} style={{ color: GOLD }}/>
            <span style={{ color: GOLD, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em" }}>ТОРГОВЛЯ</span>
          </button>
          <button onClick={() => navigate("/leaderboard")} style={{
            padding: "14px 0", borderRadius: "14px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
            background: CREAM08, border: `1px solid ${BORDER_S}`,
          }}>
            <Copy size={13} style={{ color: CREAM55 }}/>
            <span style={{ color: CREAM55, fontSize: "11px", fontWeight: 700, letterSpacing: "0.1em" }}>COPY TRADE</span>
          </button>
        </div>

        {/* ── Reset & Recalculate button ── */}
        {(() => {
          const entries = getAllEntries();
          return (
            <div style={{ marginBottom: "14px" }}>
              <button
                onClick={() => {
                  clearPortfolioData();
                  // 1. Rebuild from trade history (most accurate)
                  rebuildStore(tradeHistory, positions, true);
                  // 2. Fill remaining gaps from on-chain current values (last resort for old buys)
                  fillFromChainTokens(chainTokens);
                  // 3. Force re-render with new store data
                  setStoreTick((t) => t + 1);
                  // 4. Refresh on-chain balances for up-to-date prices
                  refreshBalance();
                }}
                style={{
                  width: "100%", padding: "10px 0", borderRadius: "12px", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: "7px",
                  background: "rgba(255,77,94,0.06)", border: "1px solid rgba(255,77,94,0.18)",
                }}
                title="Очищает сохранённые данные ВЛОЖЕНО и пересчитывает из истории сделок"
              >
                <RefreshCw size={11} style={{ color: RED }}/>
                <span style={{ color: RED, fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em" }}>
                  ПЕРЕСЧИТАТЬ ВЛОЖЕНО / PNL
                </span>
              </button>
              {/* Debug: show what's in the store */}
              {entries.length > 0 ? (
                <div style={{ marginTop: "6px", padding: "8px 12px", borderRadius: "8px", background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.12)" }}>
                  <div style={{ color: "rgba(74,222,128,0.5)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "4px" }}>
                    СОХРАНЕНО В ХРАНИЛИЩЕ ({entries.length} токенов)
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    {entries.map((e) => (
                      <div key={e.mint} style={{ padding: "2px 8px", borderRadius: "6px", background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.15)" }}>
                        <span style={{ color: "rgba(240,235,224,0.6)", fontSize: "9px", fontWeight: 700 }}>{e.symbol}</span>
                        <span style={{ color: "rgba(74,222,128,0.7)", fontSize: "9px", fontWeight: 700 }}> ${e.usdCostBasis.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: "6px", padding: "6px 12px", borderRadius: "8px", background: "rgba(255,77,94,0.04)", border: "1px solid rgba(255,77,94,0.12)", textAlign: "center" }}>
                  <span style={{ color: "rgba(255,77,94,0.5)", fontSize: "8px", fontWeight: 700, letterSpacing: "0.06em" }}>
                    ХРАНИЛИЩЕ ПУСТО — нажми кнопку выше для пересчёта
                  </span>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: "4px", padding: "4px", borderRadius: "14px", background: CREAM08, marginBottom: "12px" }}>
          {(["positions","history","stats"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: "9px 0", borderRadius: "10px", cursor: "pointer",
              background: tab === t ? `${GOLDA}0.12)` : "transparent",
              border:     tab === t ? `1px solid ${GOLDA}0.22)` : "1px solid transparent",
              color:      tab === t ? GOLD : CREAM28,
              fontSize:   "9px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800,
              letterSpacing: "0.08em",
              transition: "all 0.15s",
            }}>
              {t === "positions" ? `ПОЗИЦИИ (${mergedPositions.length})` : t === "history" ? "ИСТОРИЯ" : "СТАТИСТИКА"}
            </button>
          ))}
        </div>

        {/* ── Tab: Positions ── */}
        {tab === "positions" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {mergedPositions.length === 0 ? (
              <div style={{
                textAlign: "center", padding: "48px 0",
                borderRadius: "16px", background: SURFACE, border: `1px solid ${BORDER_S}`,
              }}>
                <Layers size={28} style={{ color: `${GOLDA}0.2)`, margin: "0 auto 12px" }}/>
                <p style={{ color: CREAM28, fontSize: "12px", marginBottom: "16px" }}>Нет открытых позиций</p>
                <button onClick={() => navigate("/trading")} style={{
                  padding: "9px 22px", borderRadius: "10px", cursor: "pointer",
                  background: `${GOLDA}0.09)`, border: `1px solid ${GOLDA}0.22)`,
                  color: GOLD, fontSize: "11px", fontWeight: 800, letterSpacing: "0.08em",
                }}>ОТКРЫТЬ ПЕРВУЮ СДЕЛКУ</button>
              </div>
            ) : (
              <>
                {/* Sort + Close row */}
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => setShowSortSheet(true)}
                    style={{
                      flex: 1, padding: "10px 14px", borderRadius: "12px", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      background: CREAM08, border: `1px solid ${BORDER_S}`,
                    }}
                  >
                    <ArrowUpDown size={12} style={{ color: CREAM55 }}/>
                    <span style={{ color: CREAM55, fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>
                      {{
                        default:      "По умолчанию",
                        created_desc: "Создано ↓",
                        created_asc:  "Создано ↑",
                        balance_desc: "Баланс ↓",
                        balance_asc:  "Баланс ↑",
                        pnl_desc:     "PNL ↓",
                        pnl_asc:      "PNL ↑",
                      }[sortKey]}
                    </span>
                  </button>
                  {!confirmClose ? (
                    <button onClick={() => setConfirmClose(true)} style={{
                      padding: "10px 14px", borderRadius: "12px", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                      background: `${REDA}0.05)`, border: `1px solid ${REDA}0.18)`,
                    }}>
                      <Trash2 size={12} style={{ color: RED }}/>
                      <span style={{ color: RED, fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em" }}>
                        Закрыть ({mergedPositions.length})
                      </span>
                    </button>
                  ) : (
                    <button onClick={() => setConfirmClose(false)} style={{
                      padding: "10px 14px", borderRadius: "12px", cursor: "pointer",
                      background: CREAM08, border: `1px solid ${BORDER_S}`,
                      color: CREAM55, fontSize: "10px", fontWeight: 700,
                    }}>
                      Отмена
                    </button>
                  )}
                </div>

                {confirmClose && (
                  <div style={{ borderRadius: "14px", padding: "16px", background: `${REDA}0.06)`, border: `1px solid ${REDA}0.28)` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                      <AlertTriangle size={14} style={{ color: RED }}/>
                      <span style={{ color: RED, fontSize: "12px", fontWeight: 800 }}>Закрыть {mergedPositions.length} позиций?</span>
                    </div>
                    <p style={{ color: CREAM28, fontSize: "10px", marginBottom: "12px" }}>
                      Все позиции закроются по текущей цене. Действие необратимо.
                    </p>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button onClick={() => setConfirmClose(false)} style={{
                        flex: 1, padding: "10px 0", borderRadius: "10px", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        background: CREAM08, border: `1px solid ${BORDER_S}`,
                        color: CREAM55, fontSize: "11px", fontWeight: 700,
                      }}>
                        <X size={11}/> Отмена
                      </button>
                      <button onClick={() => { clearAllPositions(); setConfirmClose(false); }} style={{
                        flex: 1, padding: "10px 0", borderRadius: "10px", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                        background: `${REDA}0.16)`, border: `1px solid ${REDA}0.38)`,
                        color: RED, fontSize: "11px", fontWeight: 800,
                      }}>
                        <Trash2 size={11}/> Закрыть всё
                      </button>
                    </div>
                  </div>
                )}

                <div style={{ borderRadius: "16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(240,235,224,0.06)", overflow: "hidden" }}>
                  {sortedPositions.map((pos, idx) => (
                    <div key={pos.id} style={{ borderTop: idx > 0 ? "1px solid rgba(240,235,224,0.06)" : "none" }}>
                      <PositionCard pos={pos} totalUsd={displayTotalUsd} onClose={() => removePosition(pos.id)} onShare={setSharePos}/>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Tab: History ── */}
        {tab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {tradeHistory.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: CREAM28, fontSize: "12px" }}>
                История сделок пуста
              </div>
            ) : tradeHistory.map((t) => {
              const isBuy    = t.side === "BUY";
              const hasPnl   = t.pnlPct !== undefined;
              const pnlPos   = (t.pnlPct ?? 0) >= 0;
              const pnlColor = pnlPos ? "#4ADE80" : RED;
              const sideColor  = isBuy ? GOLD : (hasPnl ? (pnlPos ? "#4ADE80" : RED) : RED);
              const sideColorA = isBuy ? GOLDA : (hasPnl ? (pnlPos ? "rgba(74,222,128," : REDA) : REDA);
              return (
                <div key={t.id} style={{
                  borderRadius: "14px",
                  background: SURFACE, border: `1px solid ${BORDER_S}`,
                  overflow: "hidden",
                }}>
                  {/* Main row */}
                  <div style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "12px 14px",
                    borderLeft: `3px solid ${sideColorA}0.5)`,
                  }}>
                    {/* Side circle badge */}
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                      background: `${sideColorA}0.10)`, border: `1.5px solid ${sideColorA}0.28)`,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: "7px", fontWeight: 900, color: sideColor, letterSpacing: "0.04em" }}>
                        {isBuy ? "BUY" : "SELL"}
                      </span>
                    </div>

                    {/* Symbol + CA + date */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: CREAM, fontSize: "15px", fontWeight: 800, lineHeight: 1.2,
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.symbol}
                      </div>
                      {t.mint && (
                        <div style={{ color: CREAM28, fontSize: "9px", fontFamily: "monospace", marginTop: "1px",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          CA: {t.mint.slice(0, 6)}…{t.mint.slice(-4)}
                        </div>
                      )}
                      <div style={{ color: CREAM18, fontSize: "9px", marginTop: "2px" }}>
                        {new Date(t.timestamp).toLocaleString("ru", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    {/* Right: USD + PnL% badge */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ color: CREAM, fontSize: "15px", fontWeight: 800 }}>
                        ${t.usdValue.toFixed(2)}
                      </div>
                      {hasPnl ? (
                        <div style={{
                          display: "inline-block", marginTop: "4px",
                          padding: "3px 10px", borderRadius: "20px",
                          background: `${pnlPos ? "rgba(74,222,128," : REDA}0.12)`,
                          border: `1px solid ${pnlPos ? "rgba(74,222,128," : REDA}0.30)`,
                          color: pnlColor, fontSize: "12px", fontWeight: 800,
                        }}>
                          {pnlPos ? "+" : ""}{(t.pnlPct!).toFixed(1)}%
                        </div>
                      ) : isBuy ? (
                        <div style={{ color: `${GOLDA}0.45)`, fontSize: "9px", marginTop: "4px", fontWeight: 600 }}>
                          куплено
                        </div>
                      ) : (
                        <div style={{ color: CREAM28, fontSize: "9px", marginTop: "4px" }}>продано</div>
                      )}
                    </div>
                  </div>

                  {/* txHash link if available */}
                  {t.txHash && (
                    <a
                      href={`https://solscan.io/tx/${t.txHash}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "4px",
                        padding: "6px 0", borderTop: `1px solid ${BORDER_S}`,
                        textDecoration: "none",
                      }}
                    >
                      <ExternalLink size={9} style={{ color: CREAM18 }}/>
                      <span style={{ color: CREAM18, fontSize: "8px", fontFamily: "monospace" }}>
                        {t.txHash.slice(0, 8)}…{t.txHash.slice(-6)}
                      </span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tab: Stats ── */}
        {tab === "stats" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {(() => {
              const bestVal  = bestEntry ? `${bestEntry.pnlPct >= 0 ? "+" : ""}${bestEntry.pnlPct.toFixed(2)}% ${bestEntry.symbol}` : "—";
              const worstVal = worstEntry && worstEntry !== bestEntry ? `${worstEntry.pnlPct.toFixed(2)}% ${worstEntry.symbol}` : "—";
              const bestColor  = bestEntry && bestEntry.pnlPct >= 0 ? GOLD : RED;
              const worstColor = worstEntry && worstEntry.pnlPct < 0 ? RED : GOLD;
              return [
                { label: "Всего сделок",          value: String(totalTradeCount),                                                                                                        icon: <Activity    size={13} style={{ color: GOLD }}/>,  valueColor: CREAM },
                { label: "Лучшая сделка",         value: bestVal,                                                                                                                        icon: <TrendingUp  size={13} style={{ color: GOLD }}/>,  valueColor: bestColor },
                { label: "Худшая сделка",         value: worstVal,                                                                                                                       icon: <TrendingDown size={13} style={{ color: RED }}/>,  valueColor: worstColor },
                { label: "Нереализованный PNL",   value: `${unrealizedPnlUsd >= 0 ? "+" : ""}$${Math.abs(unrealizedPnlUsd).toFixed(2)}`,                                                icon: <Activity    size={13} style={{ color: GOLD }}/>,  valueColor: unrealizedPnlUsd >= 0 ? GOLD : RED },
                { label: "Реализованный PNL",     value: `${realizedPnlUsd >= 0 ? "+" : ""}$${Math.abs(realizedPnlUsd).toFixed(2)}`,                                                   icon: <TrendingUp  size={13} style={{ color: GOLD }}/>,  valueColor: realizedPnlUsd >= 0 ? GOLD : RED },
                { label: "Торговые расходы",      value: `$${totalFees.toFixed(2)}`,                                                                                                     icon: <DollarSign  size={13} style={{ color: `${GOLDA}0.6)` }}/>, valueColor: CREAM },
                { label: "Вложенный капитал",     value: `$${investedCap.toFixed(2)}`,                                                                                                   icon: <Layers      size={13} style={{ color: GOLD }}/>,  valueColor: CREAM },
                { label: "Макс. риск/сделку",     value: `${riskSettings.maxRiskPct}%`,                                                                                                  icon: <Shield      size={13} style={{ color: "#7EB8D4" }}/>, valueColor: CREAM },
                { label: "Дневной лимит убытков", value: `$${riskSettings.dailyLossLimit}`,                                                                                              icon: <Shield      size={13} style={{ color: RED }}/>,   valueColor: CREAM },
              ];
            })().map(({ label, value, icon, valueColor }) => (
              <div key={label} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "13px 14px", borderRadius: "12px",
                background: SURFACE, border: `1px solid ${BORDER_S}`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  {icon}
                  <span style={{ color: CREAM55, fontSize: "11px" }}>{label}</span>
                </div>
                <span style={{ color: valueColor ?? CREAM, fontSize: "13px", fontWeight: 800 }}>{value}</span>
              </div>
            ))}
            <button onClick={() => navigate("/trading")} style={{
              width: "100%", padding: "13px 0", borderRadius: "12px", cursor: "pointer", marginTop: "4px",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              background: CREAM08, border: `1px solid ${BORDER_S}`,
            }}>
              <span style={{ color: CREAM28, fontSize: "10px", fontWeight: 800, letterSpacing: "0.1em" }}>НАСТРОЙКИ РИСКА</span>
              <ChevronRight size={12} style={{ color: CREAM18 }}/>
            </button>
          </div>
        )}
      </div>

      {/* ── Sort Sheet (Alpha One style) ── */}
      {showSortSheet && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 500,
            background: "rgba(5,5,15,0.85)", backdropFilter: "blur(12px)",
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
          onClick={() => setShowSortSheet(false)}
        >
          <div
            style={{
              width: "100%", maxWidth: 480,
              background: "linear-gradient(160deg,#111111 0%,#080808 100%)",
              border: `1px solid ${BORDER_S}`,
              borderBottom: "none",
              borderRadius: "24px 24px 0 0",
              padding: "20px 0 32px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div style={{ width: 36, height: 3, borderRadius: 2, background: CREAM18, margin: "0 auto 20px" }}/>

            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "0 20px", marginBottom: "12px",
            }}>
              <span style={{ color: CREAM55, fontSize: "11px", fontWeight: 800, letterSpacing: "0.1em" }}>СОРТИРОВКА</span>
              <button onClick={() => setShowSortSheet(false)} style={{
                background: "none", border: "none", cursor: "pointer", padding: "4px",
              }}>
                <X size={16} style={{ color: CREAM28 }}/>
              </button>
            </div>

            {([
              { key: "default",      label: "По умолчанию" },
              { key: "created_desc", label: "Создано ↓" },
              { key: "created_asc",  label: "Создано ↑" },
              { key: "balance_desc", label: "Баланс: ↓" },
              { key: "balance_asc",  label: "Баланс: ↑" },
              { key: "pnl_desc",     label: "PNL ↓" },
              { key: "pnl_asc",      label: "PNL ↑" },
            ] as { key: typeof sortKey; label: string }[]).map(({ key, label }) => {
              const active = sortKey === key;
              return (
                <button
                  key={key}
                  onClick={() => { setSortKey(key); setShowSortSheet(false); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 24px", background: "none", border: "none",
                    cursor: "pointer",
                    borderBottom: `1px solid ${CREAM08}`,
                  }}
                >
                  <span style={{
                    color: active ? CREAM : CREAM55,
                    fontSize: "15px", fontWeight: active ? 700 : 400,
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}>
                    {label}
                  </span>
                  <div style={{
                    width: 22, height: 22, borderRadius: "50%",
                    border: `2px solid ${active ? "#4ADE80" : CREAM18}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: active ? "rgba(74,222,128,0.12)" : "transparent",
                  }}>
                    {active && <Check size={11} style={{ color: "#4ADE80" }}/>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <PNLShareModal pos={sharePos} onClose={() => setSharePos(null)}/>
    </div>
  );
}
