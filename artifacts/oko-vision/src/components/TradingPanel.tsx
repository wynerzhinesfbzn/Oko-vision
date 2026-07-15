/**
 * TradingPanel — встроенная панель торговли, открывается под карточкой токена.
 * BUY / SELL с TP, SL, Trailing Stop, Auto-Buy on Dip.
 */
import React, { useState, useEffect, useCallback } from "react";
import {
  X, TrendingUp, TrendingDown, Zap, Target, Bell,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle,
  ArrowDownRight, ArrowUpRight, RefreshCw, Info, Settings2, Shield,
  Flame, Gauge, RotateCcw, Clock, Repeat2, StopCircle,
} from "lucide-react";
import type { PoolSignal } from "@/lib/geckoTerminal";
import { formatNum } from "@/lib/geckoTerminal";
import { getJupiterQuote, SOL_MINT, USDC_MINT, PLATFORM_FEE_BPS, QUOTE_TOKENS } from "@/lib/jupiter";
import { useTrading } from "@/context/TradingContext";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance } from "@/context/BalanceContext";
import PasswordSignModal from "@/components/PasswordSignModal";
import type { SwapResult } from "@/lib/swapExecutor";
import { savePurchase, recordSale } from "@/lib/portfolioData";

// ─── helpers ────────────────────────────────────────────────────────────────

const USD_PRESETS  = [10, 25, 50, 100, 500];
const BUY_TP_PRESETS  = [10, 25, 50, 100, 200];
const DIP_PRESETS     = [5, 10, 20, 30];
const TRAIL_STEPS     = [3, 5, 10, 15, 20];
const SELL_TP_PRESETS = [10, 25, 50, 100];
const SELL_SL_PRESETS = [5, 10, 20, 30];

const DCA_INTERVALS: { label: string; sublabel: string; ms: number }[] = [
  { label: "1 МИН",   sublabel: "каждую минуту",  ms: 60_000          },
  { label: "1 ЧАС",   sublabel: "каждый час",      ms: 3_600_000       },
  { label: "6 ЧАСОВ", sublabel: "каждые 6 часов",  ms: 21_600_000      },
  { label: "1 ДЕНЬ",  sublabel: "каждый день",     ms: 86_400_000      },
  { label: "1 НЕД",   sublabel: "каждую неделю",   ms: 604_800_000     },
  { label: "1 МЕС",   sublabel: "каждый месяц",    ms: 2_592_000_000   },
];

function PresetBtn({
  label, active, onClick, color = "#C9A84C",
}: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-xl shrink-0"
      style={{
        background: active ? `${color}20` : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? color + "55" : "rgba(255,255,255,0.08)"}`,
        color: active ? color : "rgba(255,255,255,0.45)",
        fontSize: "10px",
        fontFamily: "'Space Grotesk', sans-serif",
        fontWeight: 700,
        letterSpacing: "0.02em",
        transition: "all 0.15s ease",
      }}
    >
      {label}
    </button>
  );
}

function Toggle({ on, onChange, color = "#C9A84C" }: { on: boolean; onChange: (v: boolean) => void; color?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="relative w-10 h-5 rounded-full shrink-0"
      style={{ background: on ? `${color}35` : "rgba(255,255,255,0.08)", border: `1px solid ${on ? color + "60" : "rgba(255,255,255,0.12)"}`, transition: "all 0.25s ease" }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full"
        style={{
          background: on ? color : "rgba(255,255,255,0.3)",
          left: on ? "calc(100% - 18px)" : "2px",
          boxShadow: on ? `0 0 8px ${color}` : "none",
          transition: "all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      />
    </button>
  );
}

function InfoRow({ label, value, color = "rgba(255,255,255,0.6)" }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>{label}</span>
      <span style={{ color, fontSize: "10px", fontFamily: "monospace", fontWeight: 600 }}>{value}</span>
    </div>
  );
}

// ─── Status banner ───────────────────────────────────────────────────────────

type OrderStatus = "idle" | "loading" | "success" | "error";

function StatusBanner({ status, msg }: { status: OrderStatus; msg?: string }) {
  if (status === "idle") return null;
  const cfg = {
    loading: { bg: "rgba(201,168,76,0.08)", border: "rgba(201,168,76,0.25)", color: "#C9A84C", icon: <RefreshCw size={13} className="animate-spin" />, text: "Отправка ордера..." },
    success: { bg: "rgba(201,168,76,0.10)", border: "rgba(201,168,76,0.30)", color: "#C9A84C", icon: <CheckCircle2 size={13} />, text: msg ?? "Ордер размещён!" },
    error:   { bg: "rgba(255,80,80,0.08)", border: "rgba(255,80,80,0.25)", color: "#ff5050", icon: <AlertCircle size={13} />, text: msg ?? "Ошибка — попробуй снова" },
  }[status];
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-3" style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
      <span style={{ color: cfg.color }}>{cfg.icon}</span>
      <span style={{ color: cfg.color, fontSize: "11px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{cfg.text}</span>
    </div>
  );
}

// ─── Explain tooltip ─────────────────────────────────────────────────────────

function Tip({ text }: { text: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative inline-block">
      <button onClick={() => setShow(!show)}>
        <Info size={11} style={{ color: "rgba(201,168,76,0.4)" }} />
      </button>
      {show && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 p-2.5 rounded-xl z-50"
          style={{ background: "rgba(8,8,8,0.97)", border: "1px solid rgba(201,168,76,0.25)", boxShadow: "0 10px 30px rgba(0,0,0,0.6)" }}
        >
          <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "10px", lineHeight: 1.65 }}>{text}</p>
        </div>
      )}
    </div>
  );
}

// ─── Order Settings ──────────────────────────────────────────────────────────

type PriorityMode = "normal" | "fast" | "degen" | "custom";

const SLIPPAGE_PRESETS = [0.5, 1, 3, 5];
const PRIORITY_MODES: { id: PriorityMode; label: string; sol: string; icon: React.ReactElement; color: string }[] = [
  { id: "normal", label: "Обычный", sol: "0.001",  icon: <Gauge size={10} />,   color: "rgba(240,235,224,0.65)" },
  { id: "fast",   label: "Быстрый", sol: "0.005",  icon: <Zap size={10} />,     color: "#C9A84C" },
  { id: "degen",  label: "Деген",   sol: "0.01",   icon: <Flame size={10} />,   color: "#ff6b00" },
  { id: "custom", label: "Польз.",  sol: "",        icon: <Settings2 size={10} />, color: "#C9A84C" },
];

// ─── Order Settings Hook ──────────────────────────────────────────────────────

const PRESET_FEE_SOL: Record<string, number> = { normal: 0.001, fast: 0.005, degen: 0.01 };

function useOrderSettings() {
  const [slippage,     setSlippage]     = useState<number | null>(1);
  const [slipCustom,   setSlipCustom]   = useState("");
  const [priority,     setPriority]     = useState<PriorityMode>("normal");
  const [customSol,    setCustomSol]    = useState("0.0003");
  const [mevProtect,   setMevProtect]   = useState(true);
  const [autoPriority, setAutoPriority] = useState(false);

  const effectiveSlip           = slippage ?? (slipCustom ? parseFloat(slipCustom) : 1);
  const effectiveSlipBps        = Math.round(effectiveSlip * 100);
  const effectivePriorityFeeSol = priority === "custom"
    ? (parseFloat(customSol) || 0.0003)
    : (PRESET_FEE_SOL[priority] ?? 0.001);
  const priorityCfg = PRIORITY_MODES.find(m => m.id === priority)!;

  const reset = () => {
    setSlippage(1); setSlipCustom("");
    setPriority("normal"); setCustomSol("0.0003");
    setMevProtect(true); setAutoPriority(false);
  };

  return {
    slippage, setSlippage,
    slipCustom, setSlipCustom,
    priority, setPriority,
    customSol, setCustomSol,
    mevProtect, setMevProtect,
    autoPriority, setAutoPriority,
    effectiveSlip, effectiveSlipBps, effectivePriorityFeeSol,
    priorityCfg, reset,
  };
}

// ─── Order Settings Panel (controlled) ───────────────────────────────────────

interface OrderSettingsPanelProps {
  defaultOpen?: boolean;
  accentColor?: string;
  slippage: number | null;
  setSlippage: (v: number | null) => void;
  slipCustom: string;
  setSlipCustom: (v: string) => void;
  priority: PriorityMode;
  setPriority: (v: PriorityMode) => void;
  customSol: string;
  setCustomSol: (v: string) => void;
  mevProtect: boolean;
  setMevProtect: (v: boolean) => void;
  autoPriority: boolean;
  setAutoPriority: (v: boolean) => void;
  effectiveSlip: number;
  priorityCfg: typeof PRIORITY_MODES[0];
  onReset: () => void;
}

function OrderSettingsPanel({
  defaultOpen = false,
  accentColor = "#C9A84C",
  slippage, setSlippage,
  slipCustom, setSlipCustom,
  priority, setPriority,
  customSol, setCustomSol,
  mevProtect, setMevProtect,
  autoPriority, setAutoPriority,
  effectiveSlip, priorityCfg,
  onReset,
}: OrderSettingsPanelProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: open ? "rgba(255,255,255,0.025)" : "transparent",
        border: open ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(255,255,255,0.06)",
        transition: "all 0.2s ease",
      }}
    >
      {/* Header toggle */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-3.5 py-3"
      >
        <div className="flex items-center gap-2">
          <Settings2 size={12} style={{ color: accentColor }} />
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.06em" }}>
            НАСТРОЙКИ ОРДЕРА
          </span>
          {/* Quick badges when collapsed */}
          {!open && (
            <div className="flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.35)", fontSize: "8px", fontFamily: "monospace" }}>
                {effectiveSlip}%
              </span>
              <span className="px-1.5 py-0.5 rounded" style={{ background: `${priorityCfg.color}12`, border: `1px solid ${priorityCfg.color}28`, color: priorityCfg.color, fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>
                {priorityCfg.label}
              </span>
              {mevProtect && (
                <span className="px-1.5 py-0.5 rounded" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.22)", color: "#C9A84C", fontSize: "8px" }}>
                  🛡
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <button
              onClick={(e) => { e.stopPropagation(); onReset(); }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg"
              style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.18)", color: "#C9A84C", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <RotateCcw size={8} />
              Сбросить
            </button>
          )}
          {open
            ? <ChevronUp size={13} style={{ color: "rgba(255,255,255,0.3)" }} />
            : <ChevronDown size={13} style={{ color: "rgba(255,255,255,0.3)" }} />}
        </div>
      </button>

      {/* Body */}
      {open && (
        <div className="px-3.5 pb-4 flex flex-col gap-4">

          {/* Slippage */}
          <div>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", marginBottom: 8 }}>СЛИППЕДЖ</p>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {SLIPPAGE_PRESETS.map(v => (
                <button
                  key={v}
                  onClick={() => { setSlippage(slippage === v ? null : v); setSlipCustom(""); }}
                  className="px-3 py-1.5 rounded-xl"
                  style={{
                    background: slippage === v ? `${accentColor}18` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${slippage === v ? accentColor + "45" : "rgba(255,255,255,0.08)"}`,
                    color: slippage === v ? accentColor : "rgba(255,255,255,0.45)",
                    fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, transition: "all 0.15s",
                  }}
                >
                  {v}%
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={slipCustom}
                onChange={e => { setSlipCustom(e.target.value); setSlippage(null); }}
                placeholder="Свой %"
                className="flex-1 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
              />
              <span style={{ color: "rgba(255,255,255,0.4)", fontFamily: "monospace", fontSize: "13px" }}>%</span>
            </div>
            {effectiveSlip > 3 && (
              <p style={{ color: "#C9A84C", fontSize: "9px", marginTop: 4 }}>⚠ Высокий слиппедж — риск плохой цены исполнения</p>
            )}
          </div>

          {/* Priority mode */}
          <div style={{ opacity: autoPriority ? 0.35 : 1, pointerEvents: autoPriority ? "none" : "auto", transition: "opacity 0.2s" }}>
            <div className="flex items-center justify-between mb-2">
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em" }}>РЕЖИМ ПРИОРИТЕТА</p>
              {autoPriority && (
                <span style={{ color: "rgba(255,255,255,0.28)", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>управляется авто</span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1">
              {PRIORITY_MODES.map(m => (
                <button
                  key={m.id}
                  onClick={() => setPriority(m.id)}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl"
                  style={{
                    background: priority === m.id ? `${m.color}15` : "rgba(255,255,255,0.03)",
                    border: `1px solid ${priority === m.id ? m.color + "45" : "rgba(255,255,255,0.08)"}`,
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ color: priority === m.id ? m.color : "rgba(255,255,255,0.35)" }}>{m.icon}</span>
                  <span style={{ color: priority === m.id ? m.color : "rgba(255,255,255,0.35)", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>
                    {m.label}
                  </span>
                  {m.id !== "custom" && (
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "7px", fontFamily: "monospace" }}>
                      {m.sol} SOL
                    </span>
                  )}
                </button>
              ))}
            </div>
            {priority === "custom" && (
              <div className="flex items-center gap-2 mt-2">
                <span style={{ color: "#C9A84C", fontSize: "12px", fontFamily: "monospace" }}>◎</span>
                <input
                  type="number"
                  value={customSol}
                  onChange={e => setCustomSol(e.target.value)}
                  step="0.001"
                  className="flex-1 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(191,128,255,0.05)", border: "1px solid rgba(191,128,255,0.22)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
                />
                <span style={{ color: "rgba(191,128,255,0.5)", fontSize: "11px", fontFamily: "monospace" }}>SOL</span>
              </div>
            )}
            {priority === "degen" && !autoPriority && (
              <p style={{ color: "#ff6b00", fontSize: "9px", marginTop: 4 }}>🔥 Деген — максимальная скорость, высокая комиссия майнера</p>
            )}
          </div>

          {/* Auto Priority Fee toggle */}
          <div
            className="flex items-start justify-between gap-3 p-3 rounded-2xl"
            style={{
              background: autoPriority ? "rgba(74,222,128,0.06)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${autoPriority ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.06)"}`,
              transition: "all 0.2s",
            }}
          >
            <div className="flex items-start gap-2 min-w-0">
              <span style={{ fontSize: "13px", flexShrink: 0, marginTop: 1 }}>⚡</span>
              <div className="min-w-0">
                <p style={{ color: autoPriority ? "#4ADE80" : "rgba(255,255,255,0.45)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.04em" }}>
                  Авто Priority Fee
                </p>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: "9px", lineHeight: 1.5, marginTop: 2 }}>
                  Автоматически подбирает минимальную комиссию для быстрой и выгодной транзакции. Рекомендуется включать при быстром движении цены.
                </p>
                {autoPriority && (
                  <p style={{ color: "#4ADE80", fontSize: "8px", marginTop: 4, fontFamily: "'Space Grotesk', sans-serif" }}>
                    ≈ 0.0001–0.003 SOL · подбирается в момент отправки
                  </p>
                )}
              </div>
            </div>
            <Toggle on={autoPriority} onChange={setAutoPriority} color="#4ADE80" />
          </div>

          {/* MEV Protection */}
          <div
            className="flex items-start justify-between gap-3 p-3 rounded-2xl"
            style={{ background: mevProtect ? "rgba(201,168,76,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${mevProtect ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.06)"}`, transition: "all 0.2s" }}
          >
            <div className="flex items-start gap-2 min-w-0">
              <Shield size={13} style={{ color: mevProtect ? "#C9A84C" : "rgba(255,255,255,0.25)", flexShrink: 0, marginTop: 1 }} />
              <div className="min-w-0">
                <p style={{ color: mevProtect ? "#C9A84C" : "rgba(255,255,255,0.45)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.04em" }}>
                  Защита от MEV
                </p>
                <p style={{ color: "rgba(255,255,255,0.28)", fontSize: "9px", lineHeight: 1.5, marginTop: 2 }}>
                  Защита от фронтраннинга и сэндвич-атак через приватный мемпул
                </p>
              </div>
            </div>
            <Toggle on={mevProtect} onChange={setMevProtect} color="#C9A84C" />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BUY tab ─────────────────────────────────────────────────────────────────

function BuyTab({ token, onClose }: { token: PoolSignal; onClose: () => void }) {
  const { addPosition, addTrade, addDCAOrder, removeDCAOrder, getDCAForMint } = useTrading();
  const { address, walletType } = useOkoWallet();
  const { solPrice, solBalance, refresh: refreshBalance } = useBalance();
  const price   = token.price;
  const symbol  = token.baseToken.symbol;
  const mint    = token.baseToken.id ?? "";

  // Amount
  const [usdAmt, setUsdAmt] = useState("50");
  const tokenQty = price > 0 ? parseFloat(usdAmt || "0") / price : 0;

  // Order settings (slippage + priority fee)
  const orderSettings = useOrderSettings();

  // Take-profit
  const [tpPct, setTpPct]         = useState<number | null>(null);
  const [tpCustom, setTpCustom]   = useState("");
  const effectiveTp = tpPct ?? (tpCustom ? parseFloat(tpCustom) : null);

  // Trailing sell (follows price up, sells on pullback)
  const [trailingOn, setTrailingOn]   = useState(false);
  const [trailStep, setTrailStep]     = useState(5);
  const [trailCustom, setTrailCustom] = useState("");
  const effectiveTrail = trailCustom ? parseFloat(trailCustom) : trailStep;

  // Auto-buy on dip
  const [dipOn, setDipOn]           = useState(false);
  const [dipPct, setDipPct]         = useState<number | null>(null);
  const [dipCustom, setDipCustom]   = useState("");
  const [dipAmt, setDipAmt]         = useState(""); // leave empty = same as main buy amount
  const effectiveDip = dipPct ?? (dipCustom ? parseFloat(dipCustom) : null);

  // DCA — Dollar Cost Averaging
  const existingDCA = getDCAForMint(mint);
  const [dcaOn,       setDcaOn]       = useState(false);
  const [dcaAmt,      setDcaAmt]      = useState("25");
  const [dcaInterval, setDcaInterval] = useState(DCA_INTERVALS[1]);

  // Input currency selection (SOL, USDC, USDT, USDS, wETH)
  const [inputToken, setInputToken] = useState(QUOTE_TOKENS[0]); // default SOL

  // Quote
  const [quote, setQuote]     = useState<{ out: number } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [status, setStatus]   = useState<OrderStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");

  // Password sign modal for real swap
  const [signOpen,   setSignOpen]   = useState(false);
  const [dcaSignOpen, setDcaSignOpen] = useState(false);

  // Fetch Jupiter quote for USD amount
  const fetchQuote = useCallback(async () => {
    const amt = parseFloat(usdAmt);
    if (!amt || amt <= 0) return;
    setQuoting(true);
    try {
      const sp = solPrice > 0 ? solPrice : 170;
      // Convert USD to input token raw units
      let rawAmt: number;
      if (inputToken.mint === SOL_MINT) {
        rawAmt = Math.round((amt / sp) * 1e9);
      } else {
        // For stablecoins (6 decimals) and wETH (8 decimals)
        rawAmt = Math.round(amt * Math.pow(10, inputToken.decimals));
      }
      const q = await getJupiterQuote(inputToken.mint, token.baseToken.id || USDC_MINT, rawAmt, 50);
      if (q) {
        const outDecimals = 6; // most meme tokens use 6 dec; adjust if needed
        const outAmt = parseInt(q.outAmount) / Math.pow(10, outDecimals);
        setQuote({ out: outAmt });
      }
    } catch { /* ignore */ }
    setQuoting(false);
  }, [usdAmt, token, solPrice, inputToken]);

  useEffect(() => {
    const t = setTimeout(fetchQuote, 600);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  // Real buy — opens password modal which executes the swap
  const handleBuy = async () => {
    const amt = parseFloat(usdAmt);
    if (!amt || amt <= 0 || !address) return;

    // Pre-check SOL balance using fresh on-chain data (avoids stale session cache)
    if (inputToken.mint === SOL_MINT) {
      try {
        const { fetchSolBalance } = await import("../lib/swapExecutor");
        const freshSol = await fetchSolBalance(address);
        const sp = solPrice > 0 ? solPrice : 170;
        // Needed: swap amount + 1% platform fee + priority fee + network gas (~0.0002 SOL)
        const prioritySol = orderSettings.autoPriority ? 0.001 : (orderSettings.effectivePriorityFeeSol ?? 0.001);
        const neededSol = amt / sp * 1.01 + prioritySol + 0.0002;
        if (freshSol > 0 && freshSol < neededSol) {
          const userUsd  = (freshSol  * sp).toFixed(2);
          const needUsd  = (neededSol * sp).toFixed(2);
          const shortUsd = ((neededSol - freshSol) * sp).toFixed(2);
          setStatus("error");
          setStatusMsg(`Недостаточно SOL. Нужно ~$${needUsd}, у вас $${userUsd}. Пополни на $${shortUsd}.`);
          refreshBalance(); // update UI balance display
          return;
        }
        refreshBalance(); // sync displayed balance with fresh value
      } catch {
        // If fetch fails — let the swap attempt proceed; it will fail with a clear error
      }
    }

    setSignOpen(true);
  };

  // Called by PasswordSignModal on successful swap
  const onSwapSuccess = (result: SwapResult) => {
    const ep = result.entryPrice > 0 ? result.entryPrice : price;
    // ── CRITICAL: savePurchase MUST be called FIRST, before any React state updates.
    // Portfolio reads portfolioData at render time — if we write after addPosition,
    // Portfolio re-renders before the cost basis is saved and shows "-" instead of $.
    savePurchase(mint, symbol, result.inputAmountUsd);
    const mainAmt = parseFloat(usdAmt);
    addPosition({
      symbol,
      mint,
      entryPrice: ep,
      currentPrice: price,
      amount: result.outAmountUi,
      usdValue: result.inputAmountUsd,
      openedAt: Date.now(),
      buyMcapUsd: token.marketCap ?? undefined,
      tpPrice: effectiveTp ? price * (1 + effectiveTp / 100) : undefined,
      trailingPct: trailingOn ? effectiveTrail : undefined,
      dipPct: dipOn && effectiveDip ? effectiveDip : undefined,
      dipAmountUsd: dipOn && effectiveDip
        ? (dipAmt && parseFloat(dipAmt) > 0 ? parseFloat(dipAmt) : mainAmt)
        : undefined,
    });
    addTrade({
      timestamp: Date.now(),
      symbol,
      mint,
      side: "BUY",
      amount: result.outAmountUi,
      price: ep,
      usdValue: result.inputAmountUsd,
      fee: result.fee,
      txHash: result.txHash,
    });
    refreshBalance();
    setStatus("success");
    setStatusMsg(`Куплено ${result.outAmountUi.toFixed(4)} ${symbol} · tx: ${result.txHash.slice(0, 12)}…`);
    setTimeout(() => { setStatus("idle"); onClose(); }, 3000);
  };

  // DCA — first buy is real, then register recurring orders
  const handleStartDCA = () => {
    const amt = parseFloat(dcaAmt);
    if (!amt || amt <= 0 || !address) return;
    setDcaSignOpen(true);
  };

  const onDcaSwapSuccess = (result: SwapResult) => {
    const amt      = parseFloat(dcaAmt);
    const spentUsd = result.inputAmountUsd > 0 ? result.inputAmountUsd : amt;
    const ep       = result.entryPrice > 0 ? result.entryPrice : price;

    savePurchase(mint, symbol, spentUsd);

    addPosition({
      symbol, mint,
      entryPrice:   ep,
      currentPrice: price,
      amount:       result.outAmountUi,
      usdValue:     spentUsd,
      openedAt:     Date.now(),
    });

    // Record the first DCA buy in trade history (subsequent buys are recorded by PositionMonitor)
    addTrade({
      timestamp: Date.now(),
      symbol,
      mint,
      side:     "BUY",
      amount:   result.outAmountUi,
      price:    ep,
      usdValue: spentUsd,
      fee:      result.fee,
      txHash:   result.txHash,
    });

    addDCAOrder({ symbol, mint, price, amountUsd: amt, intervalMs: dcaInterval.ms });
    refreshBalance();
    setStatus("success");
    setStatusMsg(`DCA запущен · ${amt} ${dcaInterval.sublabel} · 1-я покупка подтверждена · tx: ${result.txHash.slice(0, 10)}…`);
    setTimeout(() => { setStatus("idle"); onClose(); }, 3000);
  };

  return (
    <div className="flex flex-col gap-4">
      <StatusBanner status={status} msg={statusMsg} />

      {/* Amount in USD */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em" }}>СУММА ПОКУПКИ (USD)</span>
          {token.marketCap && token.marketCap > 0 && (
            <span style={{ color: "rgba(201,168,76,0.55)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}>
              Капа: {token.marketCap >= 1_000_000 ? `$${(token.marketCap / 1_000_000).toFixed(2)}M` : token.marketCap >= 1_000 ? `$${(token.marketCap / 1_000).toFixed(0)}K` : `$${token.marketCap.toFixed(0)}`}
            </span>
          )}
        </div>
        <div className="relative mb-2">
          <span className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "#C9A84C", fontSize: "18px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>$</span>
          <input
            type="number"
            value={usdAmt}
            onChange={e => setUsdAmt(e.target.value)}
            className="w-full pl-8 pr-4 py-4 rounded-2xl"
            style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.25)", color: "#fff", fontSize: "22px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, outline: "none" }}
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {USD_PRESETS.map(v => (
            <PresetBtn key={v} label={`$${v}`} active={usdAmt === String(v)} onClick={() => setUsdAmt(String(v))} color="#C9A84C" />
          ))}
        </div>
      </div>

      {/* Input currency selector */}
      <div>
        <div className="mb-2" style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em" }}>
          ПЛАТИТЬ ЧЕРЕЗ
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {QUOTE_TOKENS.map(qt => {
            const active = inputToken.mint === qt.mint;
            return (
              <button
                key={qt.mint}
                onClick={() => setInputToken(qt)}
                className="px-2.5 py-1.5 rounded-xl"
                style={{
                  background: active ? "rgba(201,168,76,0.14)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${active ? "rgba(201,168,76,0.45)" : "rgba(255,255,255,0.08)"}`,
                  color: active ? "#C9A84C" : "rgba(255,255,255,0.4)",
                  fontSize: "10px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  transition: "all 0.15s ease",
                }}>
                {qt.symbol}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quote summary */}
      {(quote || quoting) && (
        <div className="rounded-xl px-3 py-2" style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.12)" }}>
          {quoting
            ? <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>Расчёт маршрута...</p>
            : quote && <>
                <InfoRow label="Получите" value={`~${formatNum(quote.out)} ${symbol}`} color="#C9A84C" />
                {token.marketCap && token.marketCap > 0 && (
                  <InfoRow label="Капитализация" value={token.marketCap >= 1_000_000 ? `$${(token.marketCap / 1_000_000).toFixed(2)}M` : `$${(token.marketCap / 1_000).toFixed(1)}K`} color="rgba(201,168,76,0.65)" />
                )}
              </>}
        </div>
      )}

      {/* Take Profit */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Target size={12} style={{ color: "#C9A84C" }} />
          <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.06em" }}>ТЕЙК-ПРОФИТ</span>
          <Tip text="При достижении указанного % роста — автоматическая продажа. Если включён трейлинг, продажа откладывается до отката." />
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {BUY_TP_PRESETS.map(v => (
            <PresetBtn key={v} label={`+${v}%`} active={tpPct === v} onClick={() => { setTpPct(tpPct === v ? null : v); setTpCustom(""); }} color="#C9A84C" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "rgba(201,168,76,0.5)", fontSize: "12px" }}>+</span>
          <input
            type="number" value={tpCustom} onChange={e => { setTpCustom(e.target.value); setTpPct(null); }}
            placeholder="свой %"
            className="flex-1 px-3 py-2 rounded-xl"
            style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.18)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
          />
          <span style={{ color: "rgba(201,168,76,0.5)", fontSize: "12px" }}>%</span>
        </div>
        {effectiveTp && (
          <p style={{ color: "rgba(201,168,76,0.6)", fontSize: "9px", marginTop: 4 }}>
            Продажа при росте капитализации на +{effectiveTp}%
          </p>
        )}
      </div>

      {/* Trailing Stop (sell on pullback from peak) */}
      <div className="rounded-2xl p-3.5" style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Zap size={12} style={{ color: "#C9A84C" }} />
            <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>ТРЕЙЛИНГ-СТОП</span>
            <Tip text="Если токен вырос выше ТП — продажа не случится сразу. Ждём дальнейшего роста. Продаём только когда цена откатится на указанный % от максимума." />
          </div>
          <Toggle on={trailingOn} onChange={setTrailingOn} color="#C9A84C" />
        </div>

        {trailingOn && (
          <div className="mt-3">
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginBottom: 8 }}>ОТКАТ ОТ ПИКА ДЛЯ ПРОДАЖИ</p>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {TRAIL_STEPS.map(v => (
                <PresetBtn key={v} label={`-${v}%`} active={trailStep === v && !trailCustom} onClick={() => { setTrailStep(v); setTrailCustom(""); }} color="#C9A84C" />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number" value={trailCustom} onChange={e => setTrailCustom(e.target.value)}
                placeholder="свой %"
                className="flex-1 px-3 py-2 rounded-xl"
                style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.15)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
              />
              <span style={{ color: "rgba(201,168,76,0.5)", fontSize: "12px" }}>%</span>
            </div>
            <div className="mt-2 p-2.5 rounded-xl" style={{ background: "rgba(201,168,76,0.04)" }}>
              <p style={{ color: "rgba(201,168,76,0.6)", fontSize: "9px", lineHeight: 1.7 }}>
                📌 Пример: ТП +{effectiveTp ?? 50}%, трейлинг -{effectiveTrail}%.<br />
                Токен взлетел +100% → продажа не срабатывает.<br />
                Откат -{effectiveTrail}% от пика → <span style={{ color: "#C9A84C", fontWeight: 700 }}>продаём</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Auto-Buy on Dip */}
      <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,100,0,0.04)", border: "1px solid rgba(255,100,0,0.15)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <ArrowDownRight size={12} style={{ color: "#ff9600" }} />
            <span style={{ color: "#ff9600", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>АВТОПОКУПКА НА ПАДЕНИИ</span>
            <Tip text="Если токен упадёт на указанный %, автоматически докупить на ту же сумму." />
          </div>
          <Toggle on={dipOn} onChange={setDipOn} color="#ff9600" />
        </div>

        {dipOn && (
          <div className="mt-3 flex flex-col gap-3">
            {/* Dip threshold */}
            <div>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginBottom: 8 }}>КУПИТЬ КОГДА ЦЕНА ПАДЁТ НА</p>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {DIP_PRESETS.map(v => (
                  <PresetBtn key={v} label={`-${v}%`} active={dipPct === v} onClick={() => { setDipPct(dipPct === v ? null : v); setDipCustom(""); }} color="#ff9600" />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span style={{ color: "rgba(255,150,0,0.5)", fontSize: "12px" }}>-</span>
                <input
                  type="number" value={dipCustom} onChange={e => { setDipCustom(e.target.value); setDipPct(null); }}
                  placeholder="свой %"
                  className="flex-1 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(255,150,0,0.05)", border: "1px solid rgba(255,150,0,0.18)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
                />
                <span style={{ color: "rgba(255,150,0,0.5)", fontSize: "12px" }}>%</span>
              </div>
            </div>

            {/* Dip buy amount */}
            <div>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginBottom: 8 }}>СУММА ДОКУПКИ</p>
              <div className="flex gap-1.5 flex-wrap mb-2">
                {[50, 100, 150, 200].map(pct => {
                  const mainV = parseFloat(usdAmt) || 0;
                  const val = (mainV * pct / 100).toFixed(0);
                  const active = dipAmt === val;
                  return (
                    <PresetBtn key={pct} label={`${pct}%`} active={active}
                      onClick={() => setDipAmt(active ? "" : val)} color="#ff9600" />
                  );
                })}
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#ff9600", fontSize: "14px", fontWeight: 700 }}>$</span>
                <input
                  type="number"
                  value={dipAmt}
                  onChange={e => setDipAmt(e.target.value)}
                  placeholder={`${parseFloat(usdAmt) || 0} (как основная)`}
                  className="w-full pl-8 pr-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,150,0,0.05)", border: "1px solid rgba(255,150,0,0.18)", color: "rgba(255,255,255,0.7)", fontSize: "13px", outline: "none" }}
                />
              </div>
            </div>

            {effectiveDip && (
              <div className="px-2.5 py-2 rounded-xl" style={{ background: "rgba(255,150,0,0.06)" }}>
                <p style={{ color: "rgba(255,150,0,0.8)", fontSize: "9px", lineHeight: 1.7 }}>
                  📌 При падении -{effectiveDip}% от цены входа →
                  авто-докупка на <span style={{ fontWeight: 700, color: "#ff9600" }}>${dipAmt && parseFloat(dipAmt) > 0 ? parseFloat(dipAmt).toFixed(2) : (parseFloat(usdAmt) || 0).toFixed(2)}</span>
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DCA — Интервальная покупка ─────────────────────────────────────── */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: dcaOn ? "rgba(100,160,255,0.05)" : "rgba(100,160,255,0.02)",
          border: `1px solid ${dcaOn ? "rgba(100,160,255,0.22)" : "rgba(100,160,255,0.10)"}`,
          transition: "all 0.25s ease",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 py-3">
          <div className="flex items-center gap-2">
            <Repeat2 size={13} style={{ color: dcaOn ? "#6AADFF" : "rgba(106,173,255,0.4)" }} />
            <div>
              <span style={{ color: dcaOn ? "#6AADFF" : "rgba(106,173,255,0.55)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.06em" }}>
                ИНТЕРВАЛЬНАЯ ПОКУПКА (DCA)
              </span>
              {!dcaOn && (
                <p style={{ color: "rgba(255,255,255,0.22)", fontSize: "8px", marginTop: "1px" }}>
                  Автодокупка через заданный интервал
                </p>
              )}
            </div>
          </div>
          <Toggle on={dcaOn} onChange={setDcaOn} color="#6AADFF" />
        </div>

        {/* Existing DCA badge */}
        {existingDCA && !dcaOn && (
          <div className="mx-3.5 mb-3 flex items-center justify-between px-3 py-2 rounded-xl"
            style={{ background: "rgba(106,173,255,0.08)", border: "1px solid rgba(106,173,255,0.20)" }}>
            <div>
              <p style={{ color: "#6AADFF", fontSize: "10px", fontWeight: 700 }}>DCA активен</p>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginTop: "1px" }}>
                ${existingDCA.amountUsd} · {DCA_INTERVALS.find(i => i.ms === existingDCA.intervalMs)?.sublabel ?? "интервал"} · {existingDCA.buysExecuted} покупок · ${existingDCA.totalSpent.toFixed(0)} потрачено
              </p>
            </div>
            <button
              onClick={() => removeDCAOrder(existingDCA.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg"
              style={{ background: "rgba(255,80,80,0.10)", border: "1px solid rgba(255,80,80,0.22)", color: "#ff5050", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              <StopCircle size={10} />
              Стоп
            </button>
          </div>
        )}

        {/* DCA Controls */}
        {dcaOn && (
          <div className="px-3.5 pb-4 flex flex-col gap-3">

            {/* Amount per buy */}
            <div>
              <p style={{ color: "rgba(106,173,255,0.5)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", marginBottom: "8px" }}>
                СУММА ДОКУПКИ (USD)
              </p>
              <div className="relative mb-2">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "#6AADFF", fontSize: "16px", fontWeight: 700 }}>$</span>
                <input
                  type="number"
                  value={dcaAmt}
                  onChange={e => setDcaAmt(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 rounded-xl"
                  style={{ background: "rgba(106,173,255,0.06)", border: "1px solid rgba(106,173,255,0.22)", color: "#fff", fontSize: "18px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, outline: "none" }}
                />
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[10, 25, 50, 100, 250].map(v => (
                  <PresetBtn key={v} label={`$${v}`} active={dcaAmt === String(v)} onClick={() => setDcaAmt(String(v))} color="#6AADFF" />
                ))}
              </div>
            </div>

            {/* Interval */}
            <div>
              <p style={{ color: "rgba(106,173,255,0.5)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", marginBottom: "8px" }}>
                ИНТЕРВАЛ ПОКУПКИ
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {DCA_INTERVALS.map(iv => (
                  <button
                    key={iv.ms}
                    onClick={() => setDcaInterval(iv)}
                    className="flex flex-col items-center gap-0.5 py-2.5 px-2 rounded-xl"
                    style={{
                      background: dcaInterval.ms === iv.ms ? "rgba(106,173,255,0.14)" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${dcaInterval.ms === iv.ms ? "rgba(106,173,255,0.40)" : "rgba(255,255,255,0.08)"}`,
                      transition: "all 0.15s",
                    }}
                  >
                    <span style={{ color: dcaInterval.ms === iv.ms ? "#6AADFF" : "rgba(255,255,255,0.4)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>
                      {iv.label}
                    </span>
                    <span style={{ color: dcaInterval.ms === iv.ms ? "rgba(106,173,255,0.55)" : "rgba(255,255,255,0.2)", fontSize: "7px" }}>
                      {iv.sublabel}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(106,173,255,0.05)", border: "1px solid rgba(106,173,255,0.12)" }}>
              <InfoRow label="Первая покупка"   value={`сейчас · $${parseFloat(dcaAmt || "0").toFixed(2)}`} color="#6AADFF" />
              <InfoRow label="Следующая"         value={dcaInterval.sublabel} color="rgba(106,173,255,0.55)" />
              <InfoRow label="Снимается с баланса" value={`$${parseFloat(dcaAmt || "0").toFixed(2)} за раз`} />
            </div>

            {/* START DCA button */}
            <button
              onClick={handleStartDCA}
              disabled={status === "loading" || !parseFloat(dcaAmt)}
              className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2.5 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(106,173,255,0.20) 0%, rgba(60,120,220,0.16) 100%)",
                border: "1px solid rgba(106,173,255,0.45)",
                boxShadow: "0 0 24px rgba(106,173,255,0.12)",
                color: "#6AADFF",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "13px", fontWeight: 700, letterSpacing: "0.12em",
                cursor: status === "loading" ? "not-allowed" : "pointer",
                opacity: status === "loading" ? 0.7 : 1,
                transition: "all 0.2s",
              }}
            >
              <Repeat2 size={15} strokeWidth={2.5} />
              ЗАПУСТИТЬ DCA · ${parseFloat(dcaAmt || "0").toFixed(0)} {dcaInterval.label}
            </button>
          </div>
        )}
      </div>

      {/* Order Settings */}
      {!dcaOn && (
        <OrderSettingsPanel
          accentColor="#C9A84C"
          slippage={orderSettings.slippage}
          setSlippage={orderSettings.setSlippage}
          slipCustom={orderSettings.slipCustom}
          setSlipCustom={orderSettings.setSlipCustom}
          priority={orderSettings.priority}
          setPriority={orderSettings.setPriority}
          customSol={orderSettings.customSol}
          setCustomSol={orderSettings.setCustomSol}
          mevProtect={orderSettings.mevProtect}
          setMevProtect={orderSettings.setMevProtect}
          autoPriority={orderSettings.autoPriority}
          setAutoPriority={orderSettings.setAutoPriority}
          effectiveSlip={orderSettings.effectiveSlip}
          priorityCfg={orderSettings.priorityCfg}
          onReset={orderSettings.reset}
        />
      )}

      {/* Summary */}
      {!dcaOn && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <InfoRow label="Потратишь"       value={`$${parseFloat(usdAmt || "0").toFixed(2)}`} />
          {effectiveTp && <InfoRow label={`ТП (продажа при +${effectiveTp}%)`} value={`$${formatNum(parseFloat(usdAmt || "0") * (1 + effectiveTp / 100))}`} color="#C9A84C" />}
          {trailingOn   && <InfoRow label="Трейлинг-стоп"  value={`-${effectiveTrail}% от пика`} color="#C9A84C" />}
          {dipOn && effectiveDip && <InfoRow label="Авто-докупка"  value={`при -${effectiveDip}%`} color="#ff9600" />}
        </div>
      )}

      {/* BUY button — only shown when DCA is off */}
      {!dcaOn && (
        <button
          onClick={handleBuy}
          disabled={!parseFloat(usdAmt)}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(201,168,76,0.22) 0%, rgba(0,180,90,0.18) 100%)",
            border: "1px solid rgba(201,168,76,0.50)",
            boxShadow: "0 0 30px rgba(201,168,76,0.15), inset 0 0 20px rgba(201,168,76,0.05)",
            color: "#C9A84C",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "14px",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            cursor: "pointer",
            transition: "all 0.2s ease",
          }}
        >
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(105deg,transparent 30%,rgba(201,168,76,0.08) 50%,transparent 70%)", backgroundSize: "200% 100%", animation: "shimmer 2s linear infinite" }} />
          <TrendingUp size={17} strokeWidth={2.5} />
          КУПИТЬ {symbol}
        </button>
      )}

      {/* Real swap modals */}
      <PasswordSignModal
        open={signOpen}
        onClose={() => setSignOpen(false)}
        onSuccess={onSwapSuccess}
        userAddress={address ?? ""}
        walletType={walletType as "generated" | "adapter" | null}
        inputMint={inputToken.mint}
        outputMint={mint || USDC_MINT}
        inputAmountUsd={parseFloat(usdAmt) || 0}
        solPriceUsd={solPrice > 0 ? solPrice : 170}
        slippageBps={orderSettings.effectiveSlipBps}
        priorityMode={orderSettings.priority === "custom" ? "normal" : orderSettings.priority}
        priorityFeeSol={orderSettings.effectivePriorityFeeSol}
        autoPriority={orderSettings.autoPriority}
        tokenSymbol={symbol}
        side="buy"
      />
      <PasswordSignModal
        open={dcaSignOpen}
        onClose={() => setDcaSignOpen(false)}
        onSuccess={onDcaSwapSuccess}
        userAddress={address ?? ""}
        walletType={walletType as "generated" | "adapter" | null}
        inputMint={inputToken.mint}
        outputMint={mint || USDC_MINT}
        inputAmountUsd={parseFloat(dcaAmt) || 0}
        solPriceUsd={solPrice > 0 ? solPrice : 170}
        slippageBps={orderSettings.effectiveSlipBps}
        priorityMode={orderSettings.priority === "custom" ? "normal" : orderSettings.priority}
        priorityFeeSol={orderSettings.effectivePriorityFeeSol}
        autoPriority={orderSettings.autoPriority}
        tokenSymbol={symbol}
        side="buy"
      />
    </div>
  );
}

// ─── SELL tab ────────────────────────────────────────────────────────────────

function SellTab({ token, onClose }: { token: PoolSignal; onClose: () => void }) {
  const { address, walletType } = useOkoWallet();
  const { solPrice, refresh: refreshBalance } = useBalance();
  const { positions, removePosition, addPosition, addTrade } = useTrading();

  const price  = token.price;
  const symbol = token.baseToken.symbol;
  const mint   = token.baseToken.id ?? "";

  // Order settings (slippage + priority fee)
  const orderSettings = useOrderSettings();

  const [sellPct, setSellPct]       = useState("100"); // % of position to sell
  const [tpPct, setTpPct]           = useState<number | null>(50);
  const [tpCustom, setTpCustom]     = useState("");
  const [slPct, setSlPct]           = useState<number | null>(10);
  const [slCustom, setSlCustom]     = useState("");
  const [trailSlOn, setTrailSlOn]   = useState(false);
  const [trailSlPct, setTrailSlPct] = useState(10);
  const [trailSlCustom, setTrailSlCustom] = useState("");
  const [status, setStatus]         = useState<OrderStatus>("idle");
  const [statusMsg, setStatusMsg]   = useState("");
  const [sellSignOpen, setSellSignOpen] = useState(false);

  const effectiveTp       = tpPct ?? (tpCustom ? parseFloat(tpCustom) : null);
  const effectiveSl       = slPct ?? (slCustom ? parseFloat(slCustom) : null);
  const effectiveTrailSl  = trailSlCustom ? parseFloat(trailSlCustom) : trailSlPct;

  // Find matching position to know how many tokens we have
  const position = positions.find(p => p.mint === mint);
  const tokenBalance = position?.amount ?? 0;
  const pctToSell    = parseFloat(sellPct) / 100;
  const tokensToSell = tokenBalance * pctToSell;
  // For UI: USD estimate
  const usdEstimate  = tokensToSell * price;

  const handleSell = () => {
    if (!address) return;
    setSellSignOpen(true);
  };

  const onSellSwapSuccess = (result: SwapResult) => {
    const soldUsd = result.inputAmountUsd > 0 ? result.inputAmountUsd : tokensToSell * price;
    const pnlPct  = position && position.entryPrice > 0
      ? ((price - position.entryPrice) / position.entryPrice) * 100
      : undefined;

    // Record in trade history with real txHash from swap
    addTrade({
      timestamp: Date.now(),
      symbol,
      mint,
      side:     "SELL",
      amount:   tokensToSell,
      price,
      usdValue: soldUsd,
      fee:      result.fee,
      pnlPct,
      txHash:   result.txHash,
    });

    // Remove or reduce tracked position
    if (position) {
      if (pctToSell >= 1) {
        // Full sell — remove position entirely
        removePosition(position.id);
      } else {
        // Partial sell — re-add remaining position with:
        //   • current price for usdValue (not entry price — avoids stale P&L)
        //   • NEW TP/SL/trailing settings from the user's current SellTab configuration
        const remainingAmt = position.amount - tokensToSell;
        const remainingUsd = remainingAmt * price; // current price, not entry price

        // Compute new SL/TP prices from user's settings (fallback to existing ones)
        const newTpPrice     = effectiveTp
          ? price * (1 + effectiveTp / 100)
          : position.tpPrice;
        const newSlPrice     = effectiveSl
          ? price * (1 - effectiveSl / 100)
          : position.slPrice;
        const newTrailingPct = trailSlOn
          ? effectiveTrailSl
          : position.trailingPct;

        removePosition(position.id);
        addPosition({
          symbol,
          mint,
          logoURI:      position.logoURI,
          entryPrice:   position.entryPrice,
          currentPrice: price,
          amount:       remainingAmt,
          usdValue:     remainingUsd,
          costBasisUsd: position.costBasisUsd != null
            ? position.costBasisUsd * (1 - pctToSell)
            : undefined,
          openedAt:     position.openedAt,
          buyMcapUsd:   position.buyMcapUsd,
          tpPrice:      newTpPrice,
          slPrice:      newSlPrice,
          trailingPct:  newTrailingPct,
          highWaterMark: position.highWaterMark,
          strategyId:   position.strategyId,
        });
      }
    }

    // Reduce cost basis proportionally
    recordSale(mint, symbol, pctToSell);
    refreshBalance();
    setStatus("success");
    setStatusMsg(`Продано ${tokensToSell.toFixed(4)} ${symbol} · получено ${result.outAmountUi.toFixed(4)} SOL · tx: ${result.txHash.slice(0, 10)}…`);
    setTimeout(() => { setStatus("idle"); onClose(); }, 3000);
  };

  const tpPrice = effectiveTp ? price * (1 + effectiveTp / 100) : null;
  const slPrice = effectiveSl ? price * (1 - effectiveSl / 100) : null;

  return (
    <div className="flex flex-col gap-4">
      <StatusBanner status={status} msg={statusMsg} />

      {/* % position to sell */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em" }}>ПРОДАТЬ % ПОЗИЦИИ</span>
        </div>
        <div className="relative mb-2">
          <input
            type="number" value={sellPct} onChange={e => setSellPct(e.target.value)}
            className="w-full px-4 pr-10 py-4 rounded-2xl"
            style={{ background: "rgba(255,80,80,0.06)", border: "1px solid rgba(255,80,80,0.25)", color: "#fff", fontSize: "22px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, outline: "none" }}
          />
          <span className="absolute right-4 top-1/2 -translate-y-1/2" style={{ color: "#ff5050", fontSize: "18px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>%</span>
        </div>
        <div className="flex gap-1.5">
          {[25, 50, 75, 100].map(v => (
            <PresetBtn key={v} label={`${v}%`} active={sellPct === String(v)} onClick={() => setSellPct(String(v))} color="#ff5050" />
          ))}
        </div>
      </div>

      {/* Take Profit */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ArrowUpRight size={13} style={{ color: "#C9A84C" }} />
          <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>ПРОДАТЬ ПРИ РОСТЕ (+TP)</span>
          <Tip text="Продать позицию когда цена вырастет на указанный %." />
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {SELL_TP_PRESETS.map(v => (
            <PresetBtn key={v} label={`+${v}%`} active={tpPct === v} onClick={() => { setTpPct(tpPct === v ? null : v); setTpCustom(""); }} color="#C9A84C" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "rgba(201,168,76,0.5)", fontSize: "12px" }}>+</span>
          <input type="number" value={tpCustom} onChange={e => { setTpCustom(e.target.value); setTpPct(null); }} placeholder="свой %"
            className="flex-1 px-3 py-2 rounded-xl"
            style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.18)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
          />
          <span style={{ color: "rgba(201,168,76,0.5)", fontSize: "12px" }}>%</span>
        </div>
        {tpPrice && <p style={{ color: "rgba(201,168,76,0.6)", fontSize: "9px", marginTop: 5 }}>Продажа при цене ≥ ${formatNum(tpPrice)}</p>}
      </div>

      {/* Stop Loss */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <ArrowDownRight size={13} style={{ color: "#ff5050" }} />
          <span style={{ color: "#ff5050", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>СТОП-ЛОСС (-SL)</span>
          <Tip text="Защитная продажа при падении на указанный %. Трейлинг-SL двигается за ценой вверх." />
        </div>
        <div className="flex gap-1.5 flex-wrap mb-2">
          {SELL_SL_PRESETS.map(v => (
            <PresetBtn key={v} label={`-${v}%`} active={slPct === v} onClick={() => { setSlPct(slPct === v ? null : v); setSlCustom(""); }} color="#ff5050" />
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "rgba(255,80,80,0.5)", fontSize: "12px" }}>-</span>
          <input type="number" value={slCustom} onChange={e => { setSlCustom(e.target.value); setSlPct(null); }} placeholder="свой %"
            className="flex-1 px-3 py-2 rounded-xl"
            style={{ background: "rgba(255,80,80,0.05)", border: "1px solid rgba(255,80,80,0.18)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
          />
          <span style={{ color: "rgba(255,80,80,0.5)", fontSize: "12px" }}>%</span>
        </div>
        {slPrice && <p style={{ color: "rgba(255,80,80,0.6)", fontSize: "9px", marginTop: 5 }}>Стоп при падении до ${formatNum(slPrice)}</p>}
      </div>

      {/* Trailing SL */}
      <div className="rounded-2xl p-3.5" style={{ background: "rgba(255,80,80,0.04)", border: "1px solid rgba(255,80,80,0.14)" }}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Zap size={12} style={{ color: "#ff5050" }} />
            <span style={{ color: "#ff5050", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>ТРЕЙЛИНГ СТОП-ЛОСС</span>
            <Tip text="SL движется вверх вместе с ценой. Если купили на $100k кап, токен вырос до $400k — SL автоматически переходит на $400k × (1 - SL%). Вы всегда в плюсе." />
          </div>
          <Toggle on={trailSlOn} onChange={setTrailSlOn} color="#ff5050" />
        </div>

        {trailSlOn && (
          <div className="mt-3">
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginBottom: 8 }}>ОТСТУП ОТ ТЕКУЩЕГО МАКСИМУМА</p>
            <div className="flex gap-1.5 flex-wrap mb-2">
              {[5, 10, 15, 20, 30].map(v => (
                <PresetBtn key={v} label={`${v}%`} active={trailSlPct === v && !trailSlCustom} onClick={() => { setTrailSlPct(v); setTrailSlCustom(""); }} color="#ff5050" />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input type="number" value={trailSlCustom} onChange={e => setTrailSlCustom(e.target.value)} placeholder="свой %"
                className="flex-1 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,80,80,0.05)", border: "1px solid rgba(255,80,80,0.18)", color: "rgba(255,255,255,0.7)", fontSize: "12px", outline: "none" }}
              />
              <span style={{ color: "rgba(255,80,80,0.5)", fontSize: "12px" }}>%</span>
            </div>
            <div className="p-2.5 rounded-xl" style={{ background: "rgba(255,80,80,0.05)" }}>
              <p style={{ color: "rgba(255,80,80,0.7)", fontSize: "9px", lineHeight: 1.7 }}>
                📌 Пример: Купил на 100k кап.<br />
                Вырос до 400k → SL передвинулся на {formatNum(400000 * (1 - effectiveTrailSl / 100))}k.<br />
                <span style={{ color: "#ff5050", fontWeight: 700 }}>Ты всегда в плюсе, даже если не продал вовремя.</span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Order Settings */}
      <OrderSettingsPanel
        defaultOpen={true}
        accentColor="#ff5050"
        slippage={orderSettings.slippage}
        setSlippage={orderSettings.setSlippage}
        slipCustom={orderSettings.slipCustom}
        setSlipCustom={orderSettings.setSlipCustom}
        priority={orderSettings.priority}
        setPriority={orderSettings.setPriority}
        customSol={orderSettings.customSol}
        setCustomSol={orderSettings.setCustomSol}
        mevProtect={orderSettings.mevProtect}
        setMevProtect={orderSettings.setMevProtect}
        autoPriority={orderSettings.autoPriority}
        setAutoPriority={orderSettings.setAutoPriority}
        effectiveSlip={orderSettings.effectiveSlip}
        priorityCfg={orderSettings.priorityCfg}
        onReset={orderSettings.reset}
      />

      {/* Summary */}
      <div className="rounded-xl px-3 py-2.5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <InfoRow label="Продать"         value={`${sellPct}% позиции`} />
        {effectiveTp && <InfoRow label={`ТП`} value={`+${effectiveTp}% от входа`} color="#C9A84C" />}
        {effectiveSl && <InfoRow label={`SL`} value={`-${effectiveSl}% от входа`} color="#ff5050" />}
        {trailSlOn   && <InfoRow label="Трейлинг SL" value={`-${effectiveTrailSl}% от пика`} color="#ff7070" />}
      </div>

      {/* SELL button */}
      <button
        onClick={handleSell}
        className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(255,80,80,0.20) 0%, rgba(200,40,40,0.16) 100%)",
          border: "1px solid rgba(255,80,80,0.50)",
          boxShadow: "0 0 30px rgba(255,80,80,0.12), inset 0 0 20px rgba(255,80,80,0.04)",
          color: "#ff5050",
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "14px",
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(105deg,transparent 30%,rgba(255,80,80,0.07) 50%,transparent 70%)", backgroundSize: "200% 100%", animation: "shimmer 2s linear infinite" }} />
        <TrendingDown size={17} strokeWidth={2.5} />
        ПРОДАТЬ {symbol}
        {usdEstimate > 0 && <span style={{ fontSize: "11px", opacity: 0.7, marginLeft: 4 }}>≈ ${usdEstimate.toFixed(2)}</span>}
      </button>

      {/* Real sell swap modal */}
      <PasswordSignModal
        open={sellSignOpen}
        onClose={() => setSellSignOpen(false)}
        onSuccess={onSellSwapSuccess}
        userAddress={address ?? ""}
        walletType={walletType as "generated" | "adapter" | null}
        inputMint={mint}
        outputMint="So11111111111111111111111111111111111111112"
        inputAmountUsd={usdEstimate}
        inputTokenAmount={tokensToSell}
        solPriceUsd={solPrice > 0 ? solPrice : 170}
        slippageBps={orderSettings.effectiveSlipBps}
        priorityMode={orderSettings.priority === "custom" ? "normal" : orderSettings.priority}
        priorityFeeSol={orderSettings.effectivePriorityFeeSol}
        autoPriority={orderSettings.autoPriority}
        tokenSymbol={symbol}
        side="sell"
      />
    </div>
  );
}

// ─── Main TradingPanel ───────────────────────────────────────────────────────

interface TradingPanelProps {
  token: PoolSignal;
  initialTab?: "buy" | "sell";
  onClose: () => void;
}

export default function TradingPanel({ token, initialTab = "buy", onClose }: TradingPanelProps) {
  const [tab, setTab] = useState<"buy" | "sell">(initialTab);
  const price  = token.price;
  const mcap   = token.marketCap;
  const ch24   = token.change24h ?? 0;
  const symbol = token.baseToken.symbol;

  return (
    <div
      className="rounded-3xl overflow-hidden"
      style={{
        background: "linear-gradient(160deg, #080808 0%, #080808 100%)",
        border: "1px solid rgba(201,168,76,0.16)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(201,168,76,0.05)",
      }}
    >
      {/* Token header */}
      <div
        className="px-5 pt-4 pb-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(201,168,76,0.03)" }}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-orbitron font-bold" style={{ color: "#C9A84C", fontSize: "16px", letterSpacing: "0.04em" }}>{symbol}</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>{token.baseToken.name}</span>
              <div
                className="px-2 py-0.5 rounded-full"
                style={{ background: ch24 >= 0 ? "rgba(201,168,76,0.12)" : "rgba(255,80,80,0.12)", border: `1px solid ${ch24 >= 0 ? "rgba(201,168,76,0.30)" : "rgba(255,80,80,0.30)"}` }}
              >
                <span style={{ color: ch24 >= 0 ? "#C9A84C" : "#ff5050", fontSize: "10px", fontFamily: "monospace", fontWeight: 700 }}>
                  {ch24 >= 0 ? "+" : ""}{ch24.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {mcap != null && mcap > 0 ? (
                <div>
                  <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em" }}>КАПИТАЛИЗАЦИЯ</p>
                  <p style={{ color: "#C9A84C", fontSize: "14px", fontFamily: "monospace", fontWeight: 700 }}>${formatNum(mcap)}</p>
                </div>
              ) : null}
              <div>
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em" }}>VOL 24H</p>
                <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "14px", fontFamily: "monospace", fontWeight: 700 }}>${formatNum(token.volume24h)}</p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <X size={14} style={{ color: "rgba(255,255,255,0.45)" }} />
          </button>
        </div>
      </div>

      {/* BUY / SELL tabs */}
      <div className="flex px-5 pt-4 gap-3 mb-1">
        {(["buy", "sell"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-3 rounded-2xl flex items-center justify-center gap-2"
            style={{
              background: tab === t
                ? t === "buy" ? "rgba(201,168,76,0.18)" : "rgba(255,80,80,0.18)"
                : "rgba(255,255,255,0.04)",
              border: `1px solid ${tab === t ? (t === "buy" ? "rgba(201,168,76,0.50)" : "rgba(255,80,80,0.50)") : "rgba(255,255,255,0.08)"}`,
              color: tab === t ? (t === "buy" ? "#C9A84C" : "#ff5050") : "rgba(255,255,255,0.35)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              transition: "all 0.2s ease",
              boxShadow: tab === t ? `0 0 20px ${t === "buy" ? "rgba(201,168,76,0.15)" : "rgba(255,80,80,0.12)"}` : "none",
            }}
          >
            {t === "buy" ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {t === "buy" ? "КУПИТЬ" : "ПРОДАТЬ"}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="px-5 py-4">
        {tab === "buy"
          ? <BuyTab  token={token} onClose={onClose} />
          : <SellTab token={token} onClose={onClose} />}
      </div>
    </div>
  );
}
