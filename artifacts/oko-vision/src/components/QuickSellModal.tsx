/**
 * QuickSellModal — продажа токена.
 * Вкладка "СЕЙЧАС": % от баланса → мгновенный своп.
 * Вкладка "ПО УСЛОВИЮ": ТП%, СЛ%, или по рыночной капитализации.
 */
import React, { useState, useEffect, useRef } from "react";
import { X, TrendingDown, TrendingUp, Clock, Trash2, CheckCircle2, Bell, Gauge, Zap, Flame, Settings2, RefreshCw, Shield } from "lucide-react";
import PasswordSignModal from "@/components/PasswordSignModal";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance } from "@/context/BalanceContext";
import { useTrading, type ConditionalOrder } from "@/context/TradingContext";
import { getInvested } from "@/lib/portfolioData";
import type { SwapResult } from "@/lib/swapExecutor";

type PriorityMode = "normal" | "fast" | "degen" | "custom";
const PRIORITY_MODES: { id: PriorityMode; label: string; sol: string; icon: React.ReactElement; color: string }[] = [
  { id: "normal", label: "Обычный", sol: "0.001",  icon: <Gauge size={10} />,    color: "rgba(240,235,224,0.65)" },
  { id: "fast",   label: "Быстрый", sol: "0.005",  icon: <Zap size={10} />,      color: "#C9A84C" },
  { id: "degen",  label: "Деген",   sol: "0.01",   icon: <Flame size={10} />,    color: "#ff6b00" },
  { id: "custom", label: "Польз.",  sol: "",        icon: <Settings2 size={10} />, color: "#C9A84C" },
];

function fmtMcap(v: number | null | undefined): string {
  if (!v || v <= 0) return "—";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

async function fetchMcapFromDex(mint: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/tokens/v1/solana/${mint}`);
    if (!r.ok) return null;
    const data = await r.json();
    const pairs = Array.isArray(data) ? data : data?.pairs ?? [];
    if (!pairs.length) return null;
    const best = pairs.reduce((a: any, b: any) => (b.volume?.h24 ?? 0) > (a.volume?.h24 ?? 0) ? b : a, pairs[0]);
    return best?.marketCap ?? best?.fdv ?? null;
  } catch { return null; }
}

const SOL_MINT  = "So11111111111111111111111111111111111111112";
const PCT_PRESETS  = [25, 50, 75, 100];
const TP_PRESETS   = [25, 50, 100, 200, 500];
const SL_PRESETS   = [10, 20, 30, 50];
const MCAP_PRESETS = [1, 5, 10, 50, 100]; // in millions

type Mode = "now" | "condition";
type CondType = "tp" | "sl" | "mcap";

interface QuickSellModalProps {
  open:         boolean;
  onClose:      () => void;
  mint:         string;
  symbol:       string;
  logoURI?:     string;
  amount:       number;
  decimals?:    number;
  usdValue:     number;
  usdPrice:     number;
  currentMcap?: number;   // live mcap passed from parent (optional)
  buyMcapUsd?:  number;   // mcap at time of purchase
}

function fmtAmt(n: number) {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (n >= 1_000_000)     return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)         return (n / 1_000).toFixed(2) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function fmtPrice(p: number) {
  if (p === 0) return "—";
  if (p < 0.000001) return p.toExponential(3);
  if (p < 0.001)    return "$" + p.toFixed(8);
  if (p < 1)        return "$" + p.toFixed(6);
  return "$" + p.toFixed(4);
}

// ── Conditional Order Row ─────────────────────────────────────────────────────

function OrderRow({ order, onRemove, onTrigger }: {
  order: ConditionalOrder;
  onRemove: (id: string) => void;
  onTrigger: (order: ConditionalOrder) => void;
}) {
  const isTriggered = order.status === "triggered";
  const color = order.triggerType === "tp" ? "#4ADE80"
    : order.triggerType === "sl" ? "#FF4D5E" : "#C9A84C";

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 12px", borderRadius: 12,
      background: isTriggered ? "rgba(74,222,128,0.08)" : "rgba(255,255,255,0.03)",
      border: `1px solid ${isTriggered ? "rgba(74,222,128,0.25)" : "rgba(255,255,255,0.08)"}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {isTriggered
          ? <CheckCircle2 size={14} style={{ color: "#4ADE80" }} />
          : <Clock size={14} style={{ color }} />
        }
        <div>
          <div style={{ color: isTriggered ? "#4ADE80" : "#F0EBE0", fontSize: 12, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>
            {order.triggerLabel}
          </div>
          <div style={{ color: "rgba(240,235,224,0.38)", fontSize: 10, marginTop: 1 }}>
            {order.sellPct}% позиции · {isTriggered ? "🔔 СРАБОТАЛ" : "ожидание"}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {isTriggered && (
          <button
            onClick={() => onTrigger(order)}
            style={{
              padding: "5px 10px", borderRadius: 8, cursor: "pointer",
              background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.35)",
              color: "#4ADE80", fontSize: 10, fontWeight: 700,
            }}
          >ПРОДАТЬ</button>
        )}
        <button
          onClick={() => onRemove(order.id)}
          style={{
            width: 26, height: 26, borderRadius: "50%", cursor: "pointer",
            background: "rgba(255,77,94,0.08)", border: "1px solid rgba(255,77,94,0.18)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <Trash2 size={11} style={{ color: "#FF4D5E" }} />
        </button>
      </div>
    </div>
  );
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function QuickSellModal({
  open, onClose, mint, symbol, logoURI,
  amount, decimals, usdValue, usdPrice, currentMcap, buyMcapUsd,
}: QuickSellModalProps) {
  const { address, walletType } = useOkoWallet();
  const { solPrice, refresh }   = useBalance();
  const { addTrade, addConditionalOrder, removeConditionalOrder, getConditionalOrdersForMint } = useTrading();

  // ── "Сейчас" state
  const [sellPct,     setSellPct]    = useState(100);
  const [signOpen,    setSignOpen]   = useState(false);
  const [priority,    setPriority]   = useState<PriorityMode>("fast");
  const [customSolFee,setCustomSolFee]= useState("0.0003");
  const [mevProtect,  setMevProtect] = useState(true);

  const effectiveSolFee = priority === "custom"
    ? (parseFloat(customSolFee) || 0)
    : parseFloat(PRIORITY_MODES.find(m => m.id === priority)?.sol ?? "0.005");
  const priorityCfg = PRIORITY_MODES.find(m => m.id === priority)!;

  // ── Live market cap from DexScreener
  const [liveMcap,   setLiveMcap]   = useState<number | null>(currentMcap ?? null);
  const [mcapLoading,setMcapLoading]= useState(false);
  const mcapTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fetch live mcap whenever modal opens
  useEffect(() => {
    if (!open || !mint) return;
    let cancelled = false;
    const fetch = async () => {
      setMcapLoading(true);
      const v = await fetchMcapFromDex(mint);
      if (!cancelled) { setLiveMcap(v ?? currentMcap ?? null); setMcapLoading(false); }
    };
    fetch();
    mcapTimerRef.current = setInterval(fetch, 8000); // refresh every 8s
    return () => { cancelled = true; if (mcapTimerRef.current) clearInterval(mcapTimerRef.current); };
  }, [open, mint]);

  // ── "По условию" state
  const [mode,       setMode]       = useState<Mode>("now");
  const [condType,   setCondType]   = useState<CondType>("tp");
  const [condPct,    setCondPct]    = useState<number | null>(null);
  const [condCustom, setCondCustom] = useState("");
  const [condSellPct,setCondSellPct]= useState(100);
  const [mcapTarget, setMcapTarget] = useState("");
  const [triggerSell, setTriggerSell] = useState<ConditionalOrder | null>(null);

  const existingOrders = getConditionalOrdersForMint(mint);

  // Calculated values for "now"
  const tokensToSell = amount * sellPct / 100;
  const usdEstimate  = usdValue > 0 ? usdValue * sellPct / 100 : tokensToSell * usdPrice;

  // Calculated target price for conditional
  const effectivePct = condPct ?? (condCustom ? parseFloat(condCustom) : null);
  const targetPrice  = effectivePct !== null && usdPrice > 0
    ? condType === "tp"
      ? usdPrice * (1 + effectivePct / 100)
      : usdPrice * (1 - effectivePct / 100)
    : null;
  const targetMcapUsd = mcapTarget ? parseFloat(mcapTarget) * 1_000_000 : null;

  const canCreate = condType === "mcap"
    ? targetMcapUsd !== null && targetMcapUsd > 0
    : targetPrice !== null && targetPrice > 0;

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const onSellSuccess = (result: SwapResult) => {
    // Compute USD sold — fallback to local estimate
    const soldUsd = result.inputAmountUsd > 0 ? result.inputAmountUsd : usdEstimate;

    // Compute PnL% (non-critical — wrap so it can't block addTrade)
    let pnlPct: number | undefined;
    try {
      const costBasisFull    = getInvested(mint, symbol);
      const costBasisPortion = costBasisFull != null && costBasisFull > 0 && amount > 0
        ? costBasisFull * (tokensToSell / amount)
        : undefined;
      pnlPct = costBasisPortion && costBasisPortion > 0
        ? ((soldUsd - costBasisPortion) / costBasisPortion) * 100
        : undefined;
    } catch {}

    // Record trade — this MUST succeed; call it first, before any modal state changes
    addTrade({
      symbol, mint, side: "SELL",
      amount: tokensToSell, price: usdPrice,
      usdValue: soldUsd,
      fee: result.fee ?? soldUsd * 0.01,
      txHash: result.txHash,
      pnlPct,
      timestamp: Date.now(),
    });

    // Close modals after trade is recorded
    try { refresh(); } catch {}
    setSignOpen(false);
    onClose();
  };

  const onTriggerSellSuccess = (_result: SwapResult) => {
    if (triggerSell) {
      removeConditionalOrder(triggerSell.id);
      addTrade({ symbol, side: "SELL", amount: amount * triggerSell.sellPct / 100, price: usdPrice, usdValue: usdValue * triggerSell.sellPct / 100, fee: usdEstimate * 0.01, timestamp: Date.now() });
      refresh();
    }
    setTriggerSell(null);
    onClose();
  };

  const createConditionalOrder = () => {
    if (!canCreate) return;
    let label = "";
    if (condType === "tp" && effectivePct !== null) label = `+${effectivePct}% TP`;
    else if (condType === "sl" && effectivePct !== null) label = `-${effectivePct}% SL`;
    else if (condType === "mcap") label = `Капа $${mcapTarget}M`;

    addConditionalOrder({
      mint, symbol, logoURI,
      sellPct:      condSellPct,
      triggerType:  condType,
      triggerPct:   effectivePct ?? undefined,
      targetPrice:  condType !== "mcap" ? targetPrice ?? undefined : undefined,
      targetMcap:   condType === "mcap" ? targetMcapUsd ?? undefined : undefined,
      entryPrice:   usdPrice,
      triggerLabel: label,
    });

    // Reset
    setCondPct(null);
    setCondCustom("");
    setMcapTarget("");
    setCondSellPct(100);
    setMode("now");
  };

  if (!open) return null;

  // Accent color per condition type
  const accent = condType === "tp" ? "#4ADE80" : condType === "sl" ? "#FF4D5E" : "#C9A84C";

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }} />

      {/* Sheet */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 9001,
        maxWidth: 480, margin: "0 auto",
        background: "#0D0D0D",
        borderRadius: "24px 24px 0 0",
        padding: "20px 18px 48px",
        border: "1px solid rgba(255,255,255,0.07)",
        borderBottom: "none",
        maxHeight: "90vh",
        overflowY: "auto",
      }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {logoURI
              ? <img src={logoURI} alt={symbol} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              : <div style={{ width: 38, height: 38, borderRadius: "50%", background: "rgba(255,77,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center", color: "#FF4D5E", fontSize: 13, fontWeight: 800 }}>{symbol.slice(0, 2)}</div>
            }
            <div>
              <div style={{ color: "#F0EBE0", fontSize: 16, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{symbol}</div>
              <div style={{ color: "rgba(240,235,224,0.38)", fontSize: 10, marginTop: 1 }}>{fmtAmt(amount)} · {usdValue > 0 ? `$${usdValue.toFixed(2)}` : "—"}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: "50%", cursor: "pointer", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={13} style={{ color: "rgba(240,235,224,0.45)" }} />
          </button>
        </div>

        {/* ── Mode Tabs ── */}
        <div style={{ display: "flex", gap: 0, marginBottom: 18, background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: 3 }}>
          {([["now", "ПРОДАТЬ СЕЙЧАС"], ["condition", "ПО УСЛОВИЮ"]] as [Mode, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer", fontWeight: 700,
              fontFamily: "'Space Grotesk',sans-serif", fontSize: 11, letterSpacing: "0.04em",
              background: mode === m ? (m === "now" ? "rgba(255,77,94,0.18)" : "rgba(201,168,76,0.14)") : "transparent",
              border: mode === m ? `1px solid ${m === "now" ? "rgba(255,77,94,0.4)" : "rgba(201,168,76,0.3)"}` : "1px solid transparent",
              color: mode === m ? (m === "now" ? "#FF4D5E" : "#C9A84C") : "rgba(240,235,224,0.35)",
              transition: "all 0.15s",
            }}>{label}</button>
          ))}
        </div>

        {/* ════════════════════════ СЕЙЧАС ════════════════════════ */}
        {mode === "now" && (
          <>
            {/* ── Market cap strip ── */}
            {(buyMcapUsd || liveMcap) && (
              <div style={{
                display: "flex", gap: 8, marginBottom: 14,
                padding: "10px 14px", borderRadius: 12,
                background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
              }}>
                {buyMcapUsd && (
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ color: "rgba(240,235,224,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", fontFamily: "'Space Grotesk',sans-serif", marginBottom: 3 }}>КУПЛЕНО ПРИ КАПЕ</div>
                    <div style={{ color: "rgba(240,235,224,0.70)", fontSize: 13, fontWeight: 700 }}>{fmtMcap(buyMcapUsd)}</div>
                  </div>
                )}
                {buyMcapUsd && liveMcap && (
                  <div style={{ width: 1, background: "rgba(255,255,255,0.08)", alignSelf: "stretch" }}/>
                )}
                {liveMcap !== null && (
                  <div style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, marginBottom: 3 }}>
                      <span style={{ color: "rgba(240,235,224,0.35)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", fontFamily: "'Space Grotesk',sans-serif" }}>ТЕКУЩАЯ КАПА</span>
                      {mcapLoading && <RefreshCw size={8} className="animate-spin" style={{ color: "rgba(240,235,224,0.25)" }}/>}
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 800,
                      color: buyMcapUsd
                        ? (liveMcap > buyMcapUsd ? "#4ADE80" : "#FF4D5E")
                        : "#F0EBE0",
                    }}>
                      {fmtMcap(liveMcap)}
                      {buyMcapUsd && liveMcap > 0 && (
                        <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.8 }}>
                          ({liveMcap > buyMcapUsd ? "+" : ""}{(((liveMcap - buyMcapUsd) / buyMcapUsd) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div style={{ color: "rgba(255,77,94,0.55)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>СКОЛЬКО ПРОДАТЬ</div>
            <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
              {PCT_PRESETS.map(p => (
                <button key={p} onClick={() => setSellPct(p)} style={{
                  flex: 1, padding: "13px 0", borderRadius: 11, cursor: "pointer",
                  fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14,
                  background: sellPct === p ? "rgba(255,77,94,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${sellPct === p ? "rgba(255,77,94,0.45)" : "rgba(255,255,255,0.08)"}`,
                  color: sellPct === p ? "#FF4D5E" : "rgba(240,235,224,0.4)",
                  transition: "all 0.15s",
                }}>{p}%</button>
              ))}
            </div>

            {/* ── Priority fee selector ── */}
            <div style={{ marginBottom: 14 }}>
              <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>РЕЖИМ ПРИОРИТЕТА</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 5 }}>
                {PRIORITY_MODES.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setPriority(m.id)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                      padding: "8px 4px", borderRadius: 11, cursor: "pointer",
                      background: priority === m.id ? `${m.color}18` : "rgba(255,255,255,0.03)",
                      border: `1px solid ${priority === m.id ? m.color + "45" : "rgba(255,255,255,0.07)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ color: priority === m.id ? m.color : "rgba(255,255,255,0.30)" }}>{m.icon}</span>
                    <span style={{ color: priority === m.id ? m.color : "rgba(255,255,255,0.30)", fontSize: 8, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif" }}>{m.label}</span>
                    {m.id !== "custom" && (
                      <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 7, fontFamily: "monospace" }}>{m.sol}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Custom SOL input */}
              {priority === "custom" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(201,168,76,0.20)" }}>
                  <span style={{ color: "#C9A84C", fontSize: 13, fontFamily: "monospace", fontWeight: 700 }}>SOL</span>
                  <input
                    type="number"
                    value={customSolFee}
                    onChange={e => setCustomSolFee(e.target.value)}
                    step="0.0001"
                    min="0"
                    placeholder="0.0003"
                    style={{
                      flex: 1, background: "transparent", border: "none", outline: "none",
                      color: "#F0EBE0", fontSize: 15, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif",
                    }}
                  />
                </div>
              )}

              {priority === "degen" && (
                <p style={{ color: "#ff6b00", fontSize: 9, marginTop: 5, fontFamily: "'Space Grotesk',sans-serif" }}>
                  🔥 Деген — максимальная скорость, высокая комиссия майнера
                </p>
              )}
            </div>

            {/* ── MEV Protection ── */}
            <div style={{
              display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
              padding: "11px 13px", borderRadius: 13, marginBottom: 14,
              background: mevProtect ? "rgba(201,168,76,0.05)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${mevProtect ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.06)"}`,
              transition: "all 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                <Shield size={13} style={{ color: mevProtect ? "#C9A84C" : "rgba(255,255,255,0.25)", flexShrink: 0, marginTop: 1 }}/>
                <div>
                  <p style={{ color: mevProtect ? "#C9A84C" : "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.04em" }}>
                    Защита от MEV
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.28)", fontSize: 9, lineHeight: 1.5, marginTop: 2 }}>
                    Защита от MEV-атак, таких как фронтраннинг и сэндвич-атаки
                  </p>
                </div>
              </div>
              {/* Toggle */}
              <button
                onClick={() => setMevProtect(p => !p)}
                style={{
                  flexShrink: 0, width: 38, height: 21, borderRadius: 999, border: "none", cursor: "pointer",
                  background: mevProtect ? "#C9A84C" : "rgba(255,255,255,0.12)",
                  position: "relative", transition: "background 0.2s",
                }}
              >
                <span style={{
                  position: "absolute", top: 2.5, borderRadius: "50%", width: 16, height: 16,
                  background: "#fff", transition: "left 0.2s",
                  left: mevProtect ? 19 : 3,
                }}/>
              </button>
            </div>

            {/* Summary */}
            <div style={{ padding: "11px 14px", marginBottom: 16, background: "rgba(255,77,94,0.04)", border: "1px solid rgba(255,77,94,0.13)", borderRadius: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(240,235,224,0.4)", fontSize: 12 }}>Продаём</span>
                <span style={{ color: "#F0EBE0", fontSize: 12, fontWeight: 700 }}>{fmtAmt(tokensToSell)} {symbol}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(240,235,224,0.4)", fontSize: 12 }}>Получаем ≈</span>
                <span style={{ color: "#4ADE80", fontSize: 12, fontWeight: 700 }}>${usdEstimate.toFixed(2)} в SOL</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "rgba(240,235,224,0.28)", fontSize: 11 }}>Комиссия сети</span>
                <span style={{ color: "rgba(240,235,224,0.45)", fontSize: 11 }}>
                  {effectiveSolFee.toFixed(4)} SOL · {priorityCfg.label}
                </span>
              </div>
            </div>

            <button onClick={() => setSignOpen(true)} style={{
              width: "100%", padding: "15px 0", borderRadius: 15, cursor: "pointer",
              background: "linear-gradient(135deg, rgba(255,77,94,0.22), rgba(200,40,40,0.15))",
              border: "1px solid rgba(255,77,94,0.52)", color: "#FF4D5E",
              fontSize: 14, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.10em",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              <TrendingDown size={16} /> ПРОДАТЬ · ${usdEstimate.toFixed(2)}
            </button>
          </>
        )}

        {/* ════════════════════════ ПО УСЛОВИЮ ════════════════════════ */}
        {mode === "condition" && (
          <>
            {/* Condition type selector */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {([
                ["tp",   "РОСТ %",   TrendingUp,   "#4ADE80"],
                ["sl",   "ПАДЕНИЕ %",TrendingDown, "#FF4D5E"],
                ["mcap", "ПО КАПЕ",  Bell,         "#C9A84C"],
              ] as [CondType, string, React.ElementType, string][]).map(([type, label, Icon, color]) => (
                <button key={type} onClick={() => { setCondType(type); setCondPct(null); setCondCustom(""); }} style={{
                  flex: 1, padding: "10px 4px", borderRadius: 12, cursor: "pointer",
                  background: condType === type ? `${color}18` : "rgba(255,255,255,0.04)",
                  border: `1px solid ${condType === type ? color + "45" : "rgba(255,255,255,0.08)"}`,
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                  transition: "all 0.15s",
                }}>
                  <Icon size={14} style={{ color: condType === type ? color : "rgba(240,235,224,0.3)" }} />
                  <span style={{ color: condType === type ? color : "rgba(240,235,224,0.35)", fontSize: 9, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.06em" }}>{label}</span>
                </button>
              ))}
            </div>

            {/* TP / SL % input */}
            {(condType === "tp" || condType === "sl") && (
              <>
                <div style={{ color: `${accent}55`, fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>
                  {condType === "tp" ? "ПРОДАТЬ КОГДА ВЫРАСТЕТ НА" : "ПРОДАТЬ КОГДА УПАДЁТ НА"}
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                  {(condType === "tp" ? TP_PRESETS : SL_PRESETS).map(p => (
                    <button key={p} onClick={() => { setCondPct(p); setCondCustom(""); }} style={{
                      flex: 1, padding: "11px 0", borderRadius: 10, cursor: "pointer",
                      fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 13,
                      background: condPct === p ? `${accent}18` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${condPct === p ? accent + "45" : "rgba(255,255,255,0.08)"}`,
                      color: condPct === p ? accent : "rgba(240,235,224,0.4)",
                      transition: "all 0.15s",
                    }}>{condType === "tp" ? "+" : "-"}{p}%</button>
                  ))}
                </div>
                {/* Custom input */}
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: `${accent}70`, fontSize: 13, fontWeight: 700 }}>
                    {condType === "tp" ? "+" : "-"}
                  </span>
                  <input
                    type="number" placeholder="Своё значение..." value={condCustom}
                    onChange={e => { setCondCustom(e.target.value); setCondPct(null); }}
                    style={{
                      width: "100%", paddingLeft: 28, paddingRight: 36, paddingTop: 10, paddingBottom: 10,
                      background: "rgba(255,255,255,0.05)", border: `1px solid ${accent}22`,
                      borderRadius: 11, color: "#F0EBE0", fontSize: 14, fontWeight: 700,
                      fontFamily: "'Space Grotesk',sans-serif", outline: "none",
                    }}
                  />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: `${accent}70`, fontSize: 13, fontWeight: 700 }}>%</span>
                </div>

                {/* Position value preview when triggered */}
                {effectivePct !== null && usdValue > 0 && (
                  <div style={{ padding: "9px 12px", marginBottom: 12, background: `${accent}08`, border: `1px solid ${accent}20`, borderRadius: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(240,235,224,0.45)", fontSize: 11 }}>Позиция сейчас</span>
                      <span style={{ color: "#F0EBE0", fontSize: 11, fontWeight: 700 }}>${usdValue.toFixed(2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                      <span style={{ color: "rgba(240,235,224,0.45)", fontSize: 11 }}>При {condType === "tp" ? "+" : "-"}{effectivePct}%</span>
                      <span style={{ color: accent, fontSize: 11, fontWeight: 700 }}>
                        ${(usdValue * (condType === "tp" ? 1 + effectivePct / 100 : 1 - effectivePct / 100)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Market Cap input */}
            {condType === "mcap" && (
              <>
                <div style={{ color: "rgba(201,168,76,0.55)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>
                  ПРОДАТЬ КОГДА КАПИТАЛИЗАЦИЯ ДОСТИГНЕТ
                </div>
                <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                  {MCAP_PRESETS.map(m => (
                    <button key={m} onClick={() => setMcapTarget(String(m))} style={{
                      padding: "8px 12px", borderRadius: 10, cursor: "pointer",
                      fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 12,
                      background: mcapTarget === String(m) ? "rgba(201,168,76,0.14)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${mcapTarget === String(m) ? "rgba(201,168,76,0.40)" : "rgba(255,255,255,0.08)"}`,
                      color: mcapTarget === String(m) ? "#C9A84C" : "rgba(240,235,224,0.4)",
                    }}>${m}M</button>
                  ))}
                </div>
                <div style={{ position: "relative", marginBottom: 12 }}>
                  <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(201,168,76,0.6)", fontSize: 13, fontWeight: 700 }}>$</span>
                  <input
                    type="number" placeholder="Целевая капа в млн..." value={mcapTarget}
                    onChange={e => setMcapTarget(e.target.value)}
                    style={{
                      width: "100%", paddingLeft: 24, paddingRight: 36, paddingTop: 10, paddingBottom: 10,
                      background: "rgba(255,255,255,0.05)", border: "1px solid rgba(201,168,76,0.20)",
                      borderRadius: 11, color: "#F0EBE0", fontSize: 14, fontWeight: 700,
                      fontFamily: "'Space Grotesk',sans-serif", outline: "none",
                    }}
                  />
                  <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(201,168,76,0.6)", fontSize: 11, fontWeight: 700 }}>M</span>
                </div>
                {currentMcap && targetMcapUsd && (
                  <div style={{ padding: "9px 12px", marginBottom: 12, background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)", borderRadius: 11 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "rgba(240,235,224,0.45)", fontSize: 11 }}>Текущая капа</span>
                      <span style={{ color: "#F0EBE0", fontSize: 11, fontWeight: 700 }}>${(currentMcap / 1_000_000).toFixed(2)}M</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                      <span style={{ color: "rgba(240,235,224,0.45)", fontSize: 11 }}>Целевая ({targetMcapUsd > currentMcap ? "+" : ""}{((targetMcapUsd - currentMcap) / currentMcap * 100).toFixed(0)}%)</span>
                      <span style={{ color: "#C9A84C", fontSize: 11, fontWeight: 700 }}>${mcapTarget}M</span>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* % to sell */}
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>ПРОДАТЬ % ОТ ПОЗИЦИИ</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {PCT_PRESETS.map(p => (
                <button key={p} onClick={() => setCondSellPct(p)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, cursor: "pointer",
                  fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 12,
                  background: condSellPct === p ? `${accent}10` : "rgba(255,255,255,0.03)",
                  border: `1px solid ${condSellPct === p ? accent + "35" : "rgba(255,255,255,0.07)"}`,
                  color: condSellPct === p ? accent : "rgba(240,235,224,0.35)",
                }}>{p}%</button>
              ))}
            </div>

            {/* Create order button */}
            <button
              onClick={createConditionalOrder}
              disabled={!canCreate}
              style={{
                width: "100%", padding: "14px 0", borderRadius: 14, cursor: canCreate ? "pointer" : "not-allowed",
                background: canCreate ? `${accent}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${canCreate ? accent + "45" : "rgba(255,255,255,0.08)"}`,
                color: canCreate ? accent : "rgba(240,235,224,0.25)",
                fontSize: 13, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.08em",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <Bell size={14} />
              {condType === "tp" && `СОЗДАТЬ TP +${effectivePct ?? "?"}%`}
              {condType === "sl" && `СОЗДАТЬ SL -${effectivePct ?? "?"}%`}
              {condType === "mcap" && `СОЗДАТЬ ОРДЕР $${mcapTarget || "?"}M`}
              {canCreate && ` · ${condSellPct}% позиции`}
            </button>
          </>
        )}

        {/* ── Existing conditional orders for this token ── */}
        {existingOrders.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div style={{ color: "rgba(240,235,224,0.25)", fontSize: 9, fontWeight: 700, letterSpacing: "0.10em", marginBottom: 8, fontFamily: "'Space Grotesk',sans-serif" }}>
              АКТИВНЫЕ УСЛОВИЯ
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {existingOrders.map(o => (
                <OrderRow
                  key={o.id} order={o}
                  onRemove={removeConditionalOrder}
                  onTrigger={(ord) => setTriggerSell(ord)}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Swap modal for instant sell ── */}
      <PasswordSignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        onSuccess={onSellSuccess}
        userAddress={address ?? ""}
        walletType={walletType as "generated" | "adapter" | null}
        inputMint={mint}
        outputMint={SOL_MINT}
        inputAmountUsd={usdEstimate}
        inputTokenAmount={tokensToSell}
        inputDecimals={decimals ?? 6}
        solPriceUsd={solPrice > 0 ? solPrice : 170}
        slippageBps={100}
        priorityMode={priority === "custom" ? "normal" : priority}
        priorityFeeSol={effectiveSolFee}
        tokenSymbol={symbol}
        side="sell"
      />

      {/* ── Swap modal for triggered conditional sell ── */}
      {triggerSell && (
        <PasswordSignModal
          open={!!triggerSell}
          onClose={() => setTriggerSell(null)}
          onSuccess={onTriggerSellSuccess}
          userAddress={address ?? ""}
          walletType={walletType as "generated" | "adapter" | null}
          inputMint={mint}
          outputMint={SOL_MINT}
          inputAmountUsd={usdValue * triggerSell.sellPct / 100}
          inputTokenAmount={amount * triggerSell.sellPct / 100}
          inputDecimals={decimals ?? 6}
          solPriceUsd={solPrice > 0 ? solPrice : 170}
          slippageBps={100}
          priorityMode={priority === "custom" ? "normal" : priority}
          priorityFeeSol={effectiveSolFee}
          tokenSymbol={symbol}
          side="sell"
        />
      )}
    </>
  );
}
