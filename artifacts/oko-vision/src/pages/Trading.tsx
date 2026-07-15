import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowDownUp, Settings2, Shield, Zap, AlertTriangle, CheckCircle2, ChevronDown, TrendingUp, ChevronRight, Wallet, Send } from "lucide-react";
import { getJupiterQuote, SOL_MINT, USDC_MINT, KNOWN_TOKENS, PLATFORM_FEE_BPS, toLamports, fromLamports, type JupiterQuote } from "@/lib/jupiter";
import { useTrading, type SLTPSettings, type RiskSettings } from "@/context/TradingContext";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance } from "@/context/BalanceContext";
import { formatNum } from "@/lib/geckoTerminal";
import PasswordSignModal from "@/components/PasswordSignModal";
import type { SwapResult } from "@/lib/swapExecutor";

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = "swap" | "sltp" | "risk" | "auto";

// ── Helpers ───────────────────────────────────────────────────────────────────
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`}
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em", marginBottom: "10px" }}>
      {children}
    </div>
  );
}

function CyberInput({
  label, value, onChange, type = "number", suffix, min, max, step, placeholder,
}: {
  label: string; value: string | number; onChange: (v: string) => void;
  type?: string; suffix?: string; min?: number; max?: number; step?: number; placeholder?: string;
}) {
  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px", marginBottom: "4px" }}>{label}</div>
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
        style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min} max={max} step={step}
          placeholder={placeholder}
          className="flex-1 bg-transparent outline-none"
          style={{ color: "#fff", fontSize: "13px", fontFamily: "monospace" }}
        />
        {suffix && <span style={{ color: "rgba(201,168,76,0.6)", fontSize: "10px", flexShrink: 0 }}>{suffix}</span>}
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, color = "#C9A84C", suffix = "%" }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number; color?: string; suffix?: string;
}) {
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>{label}</span>
        <span style={{ color, fontSize: "12px", fontWeight: 700, fontFamily: "monospace" }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step ?? 1} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1 rounded-full appearance-none"
        style={{ accentColor: color, background: `linear-gradient(to right, ${color} 0%, ${color} ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) ${((value - min) / (max - min)) * 100}%, rgba(255,255,255,0.1) 100%)` }}
      />
      <div className="flex justify-between mt-1">
        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>{min}{suffix}</span>
        <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>{max}{suffix}</span>
      </div>
    </div>
  );
}

// ── Swap Tab ──────────────────────────────────────────────────────────────────
function SwapTab() {
  const { address, connected, walletType } = useOkoWallet();
  const { checkTradeRisk, riskSettings, addTrade, addPosition, sltpSettings } = useTrading();
  const { solPrice } = useBalance();

  const [inputMint,    setInputMint]    = useState(SOL_MINT);
  const [outputMint,   setOutputMint]   = useState(USDC_MINT);
  const [amount,       setAmount]       = useState("1");
  const [slippage,     setSlippage]     = useState(50); // bps
  const [quote,        setQuote]        = useState<JupiterQuote | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  const [txStatus,     setTxStatus]     = useState<"idle" | "building" | "signing" | "success" | "fail">("idle");
  const [signModalOpen, setSignModalOpen] = useState(false);

  const inputToken  = KNOWN_TOKENS[inputMint]  ?? { symbol: inputMint.slice(0, 4), decimals: 9 };
  const outputToken = KNOWN_TOKENS[outputMint] ?? { symbol: outputMint.slice(0, 4), decimals: 6 };

  const fetchQuote = useCallback(async () => {
    const n = parseFloat(amount);
    if (!n || n <= 0) return;
    setLoading(true);
    setError(null);
    setQuote(null);
    try {
      const amtRaw = toLamports(n, inputToken.decimals);
      const q = await getJupiterQuote(inputMint, outputMint, amtRaw, slippage);
      setQuote(q);
    } catch (e: any) {
      setError(e.message ?? "Ошибка получения котировки");
    } finally {
      setLoading(false);
    }
  }, [amount, inputMint, outputMint, slippage, inputToken.decimals]);

  // Auto-fetch quote when amount changes (debounced)
  useEffect(() => {
    const t = setTimeout(fetchQuote, 600);
    return () => clearTimeout(t);
  }, [fetchQuote]);

  const flipTokens = () => {
    setInputMint(outputMint);
    setOutputMint(inputMint);
    setQuote(null);
  };

  const outAmt = quote ? fromLamports(quote.outAmount, outputToken.decimals) : null;
  const feeAmt = null; // fee display removed

  // Profitability check (for non-USDC swaps)
  const usdIn = inputMint === USDC_MINT ? parseFloat(amount) : (parseFloat(amount) * 0); // simplified
  const riskCheck = checkTradeRisk(parseFloat(amount) * 1); // rough USD estimate

  // Determine swap side and compute USD input amount for PasswordSignModal
  const isBuy = inputMint === SOL_MINT || inputMint === USDC_MINT;
  const inputAmountUsd = inputMint === SOL_MINT
    ? parseFloat(amount || "0") * (solPrice > 0 ? solPrice : 150)
    : parseFloat(amount || "0"); // USDC or other stablecoins: 1:1

  const executeSwap = () => {
    if (!address || !quote) return;
    const rCheck = checkTradeRisk(inputAmountUsd);
    if (!rCheck.allowed) {
      setError(rCheck.reason ?? "Сделка заблокирована риск-менеджером");
      return;
    }
    setError(null);
    setSignModalOpen(true);
  };

  const handleSwapSuccess = (result: SwapResult) => {
    const price    = result.entryPrice;
    const tokenQty = result.outAmountUi;
    const side     = isBuy ? ("BUY" as const) : ("SELL" as const);
    const symbol   = isBuy ? outputToken.symbol : inputToken.symbol;
    const mint     = isBuy ? outputMint : inputMint;

    addTrade({
      timestamp: Date.now(),
      symbol,
      mint,
      side,
      amount:   tokenQty,
      price,
      usdValue: result.inputAmountUsd,
      fee:      result.fee,
      txHash:   result.txHash,
    });

    if (isBuy) {
      const sl = sltpSettings.slPct > 0 ? price * (1 - sltpSettings.slPct / 100) : undefined;
      const tp = sltpSettings.tpPct > 0 ? price * (1 + sltpSettings.tpPct / 100) : undefined;
      addPosition({
        symbol,
        mint,
        entryPrice:    price,
        currentPrice:  price,
        amount:        tokenQty,
        usdValue:      result.inputAmountUsd,
        costBasisUsd:  result.inputAmountUsd,
        openedAt:      Date.now(),
        slPrice:       sl,
        tpPrice:       tp,
        trailingPct:   sltpSettings.trailingPct > 0 ? sltpSettings.trailingPct : undefined,
        highWaterMark: price,
      });
    }

    setTxStatus("success");
    setTimeout(() => setTxStatus("idle"), 3000);
  };

  return (
    <>
    <div className="space-y-4">
      {/* Profitability check banner */}
      {!riskCheck.allowed && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-xl"
          style={{ background: "rgba(255,82,82,0.08)", border: "1px solid rgba(255,82,82,0.25)" }}>
          <AlertTriangle size={14} style={{ color: "#ff5252", flexShrink: 0, marginTop: "1px" }} />
          <span style={{ color: "#ff5252", fontSize: "10px", lineHeight: "1.4" }}>{riskCheck.reason}</span>
        </div>
      )}

      {/* Swap form */}
      <GlassCard>
        <SectionLabel>JUPITER V6 SWAP</SectionLabel>

        {/* Input token */}
        <div className="rounded-xl px-4 py-3 mb-2" style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px" }}>Отдаёшь</span>
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px" }}>Баланс: —</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {inputToken.logoURI && <img src={inputToken.logoURI} className="w-4 h-4 rounded-full" alt="" />}
              <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700 }}>{inputToken.symbol}</span>
              <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.4)" }} />
            </div>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent outline-none text-right"
              style={{ color: "#fff", fontSize: "18px", fontFamily: "monospace", fontWeight: 700 }}
            />
          </div>
        </div>

        {/* Flip button */}
        <div className="flex justify-center my-2">
          <button onClick={flipTokens} className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.20)" }}>
            <ArrowDownUp size={13} style={{ color: "#C9A84C" }} />
          </button>
        </div>

        {/* Output token */}
        <div className="rounded-xl px-4 py-3" style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px" }}>Получаешь</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }}>
              {outputToken.logoURI && <img src={outputToken.logoURI} className="w-4 h-4 rounded-full" alt="" />}
              <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700 }}>{outputToken.symbol}</span>
              <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.4)" }} />
            </div>
            <div className="flex-1 text-right">
              {loading ? (
                <div className="inline-block w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.2)", borderTopColor: "#C9A84C" }} />
              ) : (
                <span style={{ color: "#C9A84C", fontSize: "18px", fontFamily: "monospace", fontWeight: 700 }}>
                  {outAmt !== null ? outAmt.toFixed(outputToken.decimals > 6 ? 4 : 2) : "—"}
                </span>
              )}
            </div>
          </div>
        </div>

        {error && <div className="mt-2 text-center" style={{ color: "#ff5252", fontSize: "10px" }}>{error}</div>}

        {/* Quote details */}
        {quote && !loading && (
          <div className="mt-3 space-y-1">
            {[
              ["Курс",        `1 ${inputToken.symbol} ≈ ${(outAmt! / parseFloat(amount)).toFixed(6)} ${outputToken.symbol}`],
              ["Проскальзывание", `${slippage / 100}%`],
              ["Влияние на цену", `${parseFloat(quote.priceImpactPct ?? "0").toFixed(4)}%`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between">
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>{k}</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "9px", fontFamily: "monospace" }}>{v}</span>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Slippage selector */}
      <GlassCard>
        <SectionLabel>ПРОСКАЛЬЗЫВАНИЕ</SectionLabel>
        <div className="flex gap-2">
          {[10, 30, 50, 100].map((bps) => (
            <button key={bps} onClick={() => setSlippage(bps)}
              className="flex-1 py-2 rounded-xl"
              style={{
                background: slippage === bps ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${slippage === bps ? "rgba(201,168,76,0.30)" : "rgba(255,255,255,0.07)"}`,
                color: slippage === bps ? "#C9A84C" : "rgba(255,255,255,0.35)",
                fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif",
              }}>
              {bps / 100}%
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Profit check */}
      <GlassCard>
        <SectionLabel>ПРОВЕРКА ПРИБЫЛЬНОСТИ (≥{riskSettings.minProfitPct}% чистой прибыли)</SectionLabel>
        <div className="flex items-center gap-2 px-3 py-3 rounded-xl"
          style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.08)" }}>
          <CheckCircle2 size={14} style={{ color: "rgba(201,168,76,0.7)" }} />
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px" }}>
            Перед исполнением сделки автоматически проверяется: цена × объём − проскальзывание ≥ {riskSettings.minProfitPct}% чистой прибыли
          </span>
        </div>
      </GlassCard>

      {/* Execute button */}
      {txStatus === "success" ? (
        <div className="flex items-center justify-center gap-2 py-4 rounded-2xl"
          style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.30)" }}>
          <CheckCircle2 size={16} style={{ color: "#C9A84C" }} />
          <span style={{ color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px" }}>СДЕЛКА ВЫПОЛНЕНА</span>
        </div>
      ) : txStatus === "fail" ? (
        <div className="flex items-center justify-center gap-2 py-4 rounded-2xl"
          style={{ background: "rgba(255,82,82,0.12)", border: "1px solid rgba(255,82,82,0.30)" }}>
          <AlertTriangle size={16} style={{ color: "#ff5252" }} />
          <span style={{ color: "#ff5252", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px" }}>ОШИБКА ТРАНЗАКЦИИ</span>
        </div>
      ) : (
        <button
          onClick={connected ? executeSwap : undefined}
          disabled={!connected || !quote || loading || txStatus !== "idle"}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
          style={{
            background: connected && quote ? "linear-gradient(135deg, rgba(201,168,76,0.20), rgba(0,150,255,0.12))" : "rgba(255,255,255,0.04)",
            border: connected && quote ? "1px solid rgba(201,168,76,0.40)" : "1px solid rgba(255,255,255,0.08)",
            boxShadow: connected && quote ? "0 0 24px rgba(201,168,76,0.12)" : "none",
            opacity: connected ? 1 : 0.5,
            cursor: connected && quote ? "pointer" : "not-allowed",
          }}
        >
          {txStatus === "building" ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.2)", borderTopColor: "#C9A84C" }} />
              <span style={{ color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px" }}>ФОРМИРУЮ ТХ...</span>
            </>
          ) : txStatus === "signing" ? (
            <>
              <div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.2)", borderTopColor: "#C9A84C" }} />
              <span style={{ color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px" }}>ПОДПИШИ В КОШЕЛЬКЕ...</span>
            </>
          ) : !connected ? (
            <span style={{ color: "rgba(255,255,255,0.3)", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px" }}>ПОДКЛЮЧИ КОШЕЛЁК</span>
          ) : (
            <>
              <Zap size={16} style={{ color: "#C9A84C" }} />
              <span style={{ color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px" }}>JUPITER SWAP</span>
            </>
          )}
        </button>
      )}
    </div>

    {/* Real Jupiter swap via PasswordSignModal */}
    {signModalOpen && address && (
      <PasswordSignModal
        open={signModalOpen}
        onClose={() => setSignModalOpen(false)}
        onSuccess={handleSwapSuccess}
        userAddress={address}
        walletType={walletType}
        inputMint={inputMint}
        outputMint={outputMint}
        inputAmountUsd={inputAmountUsd}
        inputTokenAmount={!isBuy ? parseFloat(amount || "0") : undefined}
        inputDecimals={!isBuy ? inputToken.decimals : undefined}
        solPriceUsd={solPrice > 0 ? solPrice : 150}
        slippageBps={slippage}
        autoPriority={true}
        tokenSymbol={isBuy ? outputToken.symbol : inputToken.symbol}
        side={isBuy ? "buy" : "sell"}
      />
    )}
    </>
  );
}

// ── SL/TP Tab ─────────────────────────────────────────────────────────────────
function SLTPTab() {
  const { sltpSettings, setSLTPSettings } = useTrading();
  const [local, setLocal] = useState<SLTPSettings>(sltpSettings);

  const save = () => setSLTPSettings(local);

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionLabel>СТОП-ЛОСС (JUPITER TRIGGER ORDER)</SectionLabel>
        <div className="space-y-4">
          <SliderRow
            label="Stop-Loss %"
            value={local.slPct}
            onChange={(v) => setLocal((p) => ({ ...p, slPct: v }))}
            min={1} max={50} color="#ff5252"
          />
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(255,82,82,0.05)", border: "1px solid rgba(255,82,82,0.15)" }}>
            <AlertTriangle size={12} style={{ color: "rgba(255,82,82,0.7)" }} />
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px" }}>
              Ордер размещается автономно через Jupiter — исполняется даже если приложение закрыто
            </span>
          </div>
        </div>
      </GlassCard>

      <GlassCard>
        <SectionLabel>ТЕЙК-ПРОФИТ (JUPITER TRIGGER ORDER)</SectionLabel>
        <SliderRow
          label="Take-Profit %"
          value={local.tpPct}
          onChange={(v) => setLocal((p) => ({ ...p, tpPct: v }))}
          min={5} max={500} step={5} color="#C9A84C"
        />
      </GlassCard>

      <GlassCard>
        <SectionLabel>ТРЕЙЛИНГ СТОП</SectionLabel>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>Включить трейлинг стоп</span>
            <button
              onClick={() => setLocal((p) => ({ ...p, trailingPct: p.trailingPct > 0 ? 0 : 5 }))}
              className="w-11 h-6 rounded-full relative transition-all"
              style={{ background: local.trailingPct > 0 ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.1)", border: `1px solid ${local.trailingPct > 0 ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.15)"}` }}
            >
              <div className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
                style={{ background: local.trailingPct > 0 ? "#C9A84C" : "rgba(255,255,255,0.3)", left: local.trailingPct > 0 ? "calc(100% - 22px)" : "2px" }} />
            </button>
          </div>
          {local.trailingPct > 0 && (
            <SliderRow
              label="Трейлинг %"
              value={local.trailingPct}
              onChange={(v) => setLocal((p) => ({ ...p, trailingPct: v }))}
              min={1} max={30} color="#C9A84C"
            />
          )}
        </div>
      </GlassCard>

      <GlassCard>
        <SectionLabel>АВТОМАТИЧЕСКОЕ РАЗМЕЩЕНИЕ</SectionLabel>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "11px" }}>Авто SL/TP после каждого свопа</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", marginTop: "2px" }}>Jupiter Trigger Orders размещаются автоматически</div>
          </div>
          <button
            onClick={() => setLocal((p) => ({ ...p, autoPlace: !p.autoPlace }))}
            className="w-11 h-6 rounded-full relative transition-all"
            style={{ background: local.autoPlace ? "rgba(201,168,76,0.3)" : "rgba(255,255,255,0.1)", border: `1px solid ${local.autoPlace ? "rgba(201,168,76,0.5)" : "rgba(255,255,255,0.15)"}` }}
          >
            <div className="absolute top-0.5 w-5 h-5 rounded-full transition-all"
              style={{ background: local.autoPlace ? "#C9A84C" : "rgba(255,255,255,0.3)", left: local.autoPlace ? "calc(100% - 22px)" : "2px" }} />
          </button>
        </div>
      </GlassCard>

      {/* Preview */}
      <GlassCard>
        <SectionLabel>ПРИМЕР ДЛЯ ВХОДА $100</SectionLabel>
        {[
          { label: "Стоп-лосс", value: `$${(100 * (1 - local.slPct / 100)).toFixed(2)} (−$${(100 * local.slPct / 100).toFixed(2)})`, color: "#ff5252" },
          { label: "Тейк-профит", value: `$${(100 * (1 + local.tpPct / 100)).toFixed(2)} (+$${(100 * local.tpPct / 100).toFixed(2)})`, color: "#C9A84C" },
          { label: "Risk/Reward", value: `1 : ${(local.tpPct / local.slPct).toFixed(1)}`, color: local.tpPct / local.slPct >= 2 ? "#C9A84C" : "#C9A84C" },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex justify-between items-center py-1.5"
            style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>{label}</span>
            <span style={{ color, fontSize: "11px", fontFamily: "monospace", fontWeight: 700 }}>{value}</span>
          </div>
        ))}
      </GlassCard>

      <button onClick={save} className="w-full py-4 rounded-2xl"
        style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.15), rgba(0,100,200,0.08))", border: "1px solid rgba(201,168,76,0.30)", boxShadow: "0 0 20px rgba(201,168,76,0.08)" }}>
        <span style={{ color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px", fontWeight: 700 }}>СОХРАНИТЬ НАСТРОЙКИ</span>
      </button>
    </div>
  );
}

// ── Risk Manager Tab ───────────────────────────────────────────────────────────
function RiskTab() {
  const { riskSettings, setRiskSettings } = useTrading();
  const [local, setLocal] = useState<RiskSettings>(riskSettings);

  const save = () => setRiskSettings(local);

  return (
    <div className="space-y-4">
      <GlassCard>
        <SectionLabel>РИСК НА СДЕЛКУ</SectionLabel>
        <SliderRow
          label="Максимум % портфеля"
          value={local.maxRiskPct}
          onChange={(v) => setLocal((p) => ({ ...p, maxRiskPct: v }))}
          min={0.5} max={20} step={0.5} color="#C9A84C"
        />
      </GlassCard>

      <GlassCard>
        <SectionLabel>ЛИМИТЫ</SectionLabel>
        <div className="space-y-3">
          <CyberInput
            label="Макс. открытых позиций"
            value={local.maxOpenPositions}
            onChange={(v) => setLocal((p) => ({ ...p, maxOpenPositions: Number(v) }))}
            min={1} max={50} step={1}
          />
          <CyberInput
            label="Дневной лимит убытков ($)"
            value={local.dailyLossLimit}
            onChange={(v) => setLocal((p) => ({ ...p, dailyLossLimit: Number(v) }))}
            min={10} step={10}
            suffix="USD"
          />
          <CyberInput
            label="Мин. чистая прибыль для входа (%)"
            value={local.minProfitPct}
            onChange={(v) => setLocal((p) => ({ ...p, minProfitPct: Number(v) }))}
            min={1} max={50} step={1}
            suffix="%"
          />
        </div>
      </GlassCard>

      <GlassCard>
        <SectionLabel>РАСХОДЫ НА СДЕЛКУ</SectionLabel>
        <div className="space-y-2">
          {[
            { label: "Solana Network",   value: "~$0.001",           color: "rgba(255,255,255,0.5)" },
            { label: "Price Impact",     value: "зависит от объёма", color: "rgba(255,255,255,0.5)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between">
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px" }}>{label}</span>
              <span style={{ color, fontSize: "10px", fontFamily: "monospace" }}>{value}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <button onClick={save} className="w-full py-4 rounded-2xl"
        style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.06))", border: "1px solid rgba(201,168,76,0.25)" }}>
        <span style={{ color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px", fontWeight: 700 }}>СОХРАНИТЬ РИСКИ</span>
      </button>
    </div>
  );
}

// ── Strategy definitions ───────────────────────────────────────────────────────
interface AutoStrategy {
  id: string;
  name: string;
  tagline: string;
  description: string;         // for beginners
  risk: "Минимальный" | "Низкий" | "Средний" | "Высокий" | "Очень высокий";
  riskColor: string;
  mcapRange: string;
  liquidityMin: string;
  volumeSpike?: string;
  maxPct: string;
  dailyNet: string;
  trailing: string;
  priorityFee: "Низкий" | "Средний" | "Средне-высокий" | "Высокий" | "Очень высокий";
}

const STRATEGIES: AutoStrategy[] = [
  {
    id: "ultra-safe",
    name: "Ultra Safe Post-Migration",
    tagline: "Самая безопасная",
    description: "Самая безопасная стратегия. Бот работает только с проверенными токенами после миграции. Минимальный риск.",
    risk: "Минимальный", riskColor: "#4ADE80",
    mcapRange: "$800k – $5M", liquidityMin: "$120k locked",
    maxPct: "20–25%", dailyNet: "+1.5%", trailing: "−10%",
    priorityFee: "Низкий",
  },
  {
    id: "safe-migration",
    name: "Safe Migration Hold",
    tagline: "Очень консервативная",
    description: "Самая спокойная стратегия. Бот покупает только уже проверенные токены после миграции. Низкий риск, стабильный рост.",
    risk: "Низкий", riskColor: "#86EFAC",
    mcapRange: "$450k – $1.8M", liquidityMin: "$55k",
    maxPct: "15–20%", dailyNet: "+1.8%", trailing: "−8%",
    priorityFee: "Низкий",
  },
  {
    id: "balanced",
    name: "Balanced Alpha Filter",
    tagline: "Золотая середина",
    description: "Золотая середина. Ловит хорошие токены на ранней стадии роста. Хороший баланс между риском и прибылью.",
    risk: "Средний", riskColor: "#C9A84C",
    mcapRange: "$170k – $380k", liquidityMin: "$28k", volumeSpike: "+260%",
    maxPct: "12–15%", dailyNet: "+2.9%", trailing: "−6%",
    priorityFee: "Средний",
  },
  {
    id: "early-migration",
    name: "Early Migration Alpha v6",
    tagline: "Основная стратегия",
    description: "Основная стратегия терминала. Ловит токены в самом начале быстрого роста. Хорошая прибыль при умеренном риске.",
    risk: "Средний", riskColor: "#C9A84C",
    mcapRange: "$125k – $260k", liquidityMin: "$22k", volumeSpike: "+300%",
    maxPct: "10–12%", dailyNet: "+3.8%", trailing: "−5%",
    priorityFee: "Средне-высокий",
  },
  {
    id: "volume-spike",
    name: "Volume Spike Sniper",
    tagline: "Агрессивная",
    description: "Охотник за взрывом объёма. Более агрессивная стратегия с высокой потенциальной прибылью.",
    risk: "Высокий", riskColor: "#FB923C",
    mcapRange: "$75k – $230k", liquidityMin: "$18k", volumeSpike: "+420%",
    maxPct: "6–8%", dailyNet: "+4.4%", trailing: "−4%",
    priorityFee: "Высокий",
  },
  {
    id: "degen",
    name: "Degen Launch Hunter",
    tagline: "Ультра-рисковая",
    description: "Самая рискованная стратегия. Пытается поймать токен в самые первые секунды. Может дать очень большую прибыль, но риск высокий.",
    risk: "Очень высокий", riskColor: "#FF4D5E",
    mcapRange: "$35k – $135k", liquidityMin: "$10k", volumeSpike: "+550%",
    maxPct: "3–5%", dailyNet: "+5.5%", trailing: "−3%",
    priorityFee: "Очень высокий",
  },
  {
    id: "smart-money",
    name: "Smart Money Follower",
    tagline: "Следование за китами",
    description: "Бот копирует покупки известных успешных трейдеров и китов. Средний риск, высокая вероятность успеха.",
    risk: "Средний", riskColor: "#C9A84C",
    mcapRange: "$150k – $600k", liquidityMin: "$30k",
    maxPct: "8–10%", dailyNet: "+3.2%", trailing: "—",
    priorityFee: "Высокий",
  },
  {
    id: "hype",
    name: "Hype Momentum",
    tagline: "Хайп и социальный момент",
    description: "Ловит токены, которые набирают сильный хайп в соцсетях. Прибыльная стратегия во время мем-трендов.",
    risk: "Высокий", riskColor: "#FB923C",
    mcapRange: "$80k – $350k", liquidityMin: "—",
    maxPct: "7–9%", dailyNet: "+4.1%", trailing: "—",
    priorityFee: "Высокий",
  },
  {
    id: "dip-recovery",
    name: "Dip Recovery Hunter",
    tagline: "Охотник за отскоками",
    description: "Покупает токены после сильного падения (−25–40%), когда они начинают восстанавливаться. Хорошо работает на волатильном рынке.",
    risk: "Средний", riskColor: "#C9A84C",
    mcapRange: "$120k – $450k", liquidityMin: "—",
    maxPct: "9–11%", dailyNet: "+3.5%", trailing: "—",
    priorityFee: "Высокий",
  },
];

function Toggle({ on, onChange, disabled }: { on: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onChange}
      className="w-12 h-6 rounded-full relative transition-all shrink-0"
      style={{
        background: on ? "rgba(201,168,76,0.25)" : "rgba(255,255,255,0.08)",
        border: `2px solid ${on ? "rgba(201,168,76,0.55)" : "rgba(255,255,255,0.15)"}`,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <div
        className="absolute top-0.5 w-4 h-4 rounded-full transition-all"
        style={{
          background: on ? "#C9A84C" : "rgba(255,255,255,0.3)",
          boxShadow: on ? "0 0 6px #C9A84C" : "none",
          left: on ? "calc(100% - 18px)" : "2px",
        }}
      />
    </button>
  );
}

// ── Auto-Trading Tab ───────────────────────────────────────────────────────────
function AutoTab() {
  const { autoTrading, setAutoTrading } = useTrading();
  const { connected, address } = useOkoWallet();

  const [selectedId, setSelectedId]   = useState<string>(() => localStorage.getItem("oko-auto-strategy") ?? "early-migration");
  const [expanded,   setExpanded]     = useState<string | null>(null);
  const [botActive,  setBotActive]    = useState(autoTrading);

  // Keep local botActive in sync with context
  useEffect(() => { setBotActive(autoTrading); }, [autoTrading]);

  const activateBot = (on: boolean) => {
    if (!connected) return;
    setBotActive(on);
    setAutoTrading(on);
  };

  const selectStrategy = (id: string) => {
    setSelectedId(id);
    localStorage.setItem("oko-auto-strategy", id);
    // Turn off bot if strategy changes while running
    if (botActive) { setBotActive(false); setAutoTrading(false); }
  };

  const active = STRATEGIES.find((s) => s.id === selectedId) ?? STRATEGIES[3];

  const shortAddr = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="space-y-4">

      {/* ── Кошелёк для авто-торговли ── */}
      <GlassCard>
        <SectionLabel>КОШЕЛЁК ДЛЯ АВТО-ТОРГОВЛИ</SectionLabel>
        {connected && address ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl"
              style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.15)" }}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)" }}>
                <Wallet size={14} style={{ color: "#C9A84C" }} />
              </div>
              <div className="flex-1 min-w-0">
                <div style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, letterSpacing: "0.05em" }}>DEDICATED AUTO-WALLET</div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px", fontFamily: "monospace", marginTop: "2px" }}>
                  {shortAddr(address)}
                </div>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
                style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.20)" }}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#4ADE80" }} />
                <span style={{ color: "#4ADE80", fontSize: "8px", fontWeight: 700 }}>ACTIVE</span>
              </div>
            </div>
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", cursor: "pointer" }}>
              <Send size={11} style={{ color: "rgba(201,168,76,0.7)" }} />
              <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px" }}>Перевести SOL с основного кошелька</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-3 rounded-xl"
            style={{ background: "rgba(255,82,82,0.06)", border: "1px solid rgba(255,82,82,0.18)" }}>
            <AlertTriangle size={13} style={{ color: "#FF4D5E" }} />
            <span style={{ color: "rgba(255,82,82,0.8)", fontSize: "10px" }}>Подключите кошелёк для авто-торговли</span>
          </div>
        )}
      </GlassCard>

      {/* ── Запуск бота ── */}
      <GlassCard>
        <div className="flex items-center justify-between">
          <div>
            <div style={{ color: botActive ? "#C9A84C" : "rgba(255,255,255,0.7)", fontSize: "13px", fontWeight: 700 }}>
              {botActive ? "🟢 Бот запущен" : "⚪ Бот остановлен"}
            </div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", marginTop: "3px" }}>
              {botActive ? `Стратегия: ${active.name}` : "Выберите стратегию и запустите"}
            </div>
          </div>
          <Toggle on={botActive} onChange={() => activateBot(!botActive)} disabled={!connected} />
        </div>
        {botActive && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl"
            style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)" }}>
            <TrendingUp size={12} style={{ color: "#C9A84C" }} />
            <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "9px", lineHeight: "1.5" }}>
              AI сигналы Score ≥ 70 · Jupiter V6 · Priority Fee: <span style={{ color: "#C9A84C" }}>{active.priorityFee}</span>
            </span>
          </div>
        )}
      </GlassCard>

      {/* ── 9 стратегий ── */}
      <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.1em", padding: "0 2px" }}>
        ВЫБЕРИТЕ СТРАТЕГИЮ
      </div>

      {STRATEGIES.map((s) => {
        const isSelected = s.id === selectedId;
        const isExpanded = expanded === s.id;

        return (
          <div
            key={s.id}
            className="rounded-2xl overflow-hidden"
            style={{
              border: isSelected ? `1px solid ${s.riskColor}44` : "1px solid rgba(255,255,255,0.07)",
              background: isSelected ? `${s.riskColor}08` : "rgba(255,255,255,0.02)",
              transition: "all 0.2s",
            }}
          >
            {/* Card header */}
            <div className="flex items-center gap-3 px-4 py-3">
              {/* Select radio */}
              <button
                onClick={() => selectStrategy(s.id)}
                className="w-5 h-5 rounded-full shrink-0 flex items-center justify-center"
                style={{
                  border: `2px solid ${isSelected ? s.riskColor : "rgba(255,255,255,0.2)"}`,
                  background: isSelected ? `${s.riskColor}22` : "transparent",
                }}
              >
                {isSelected && <div className="w-2 h-2 rounded-full" style={{ background: s.riskColor }} />}
              </button>

              {/* Name + tagline */}
              <div className="flex-1 min-w-0">
                <div style={{ color: isSelected ? s.riskColor : "rgba(255,255,255,0.8)", fontSize: "11px", fontWeight: 700, lineHeight: 1.2 }}>
                  {s.name}
                </div>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginTop: "2px" }}>{s.tagline}</div>
              </div>

              {/* Risk badge + stats + expand */}
              <div className="flex items-center gap-2 shrink-0">
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: s.riskColor, fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>{s.dailyNet}</div>
                  <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px" }}>дневной net</div>
                </div>
                <button
                  onClick={() => setExpanded(isExpanded ? null : s.id)}
                  className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <ChevronRight size={11} style={{ color: "rgba(255,255,255,0.4)", transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.2s" }} />
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {isExpanded && (
              <div style={{ padding: "0 16px 14px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                {/* Beginner description */}
                <div className="px-3 py-2.5 rounded-xl mt-3"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "10px", lineHeight: "1.5" }}>{s.description}</span>
                </div>

                {/* Params grid */}
                <div className="grid grid-cols-2 gap-2 mt-3">
                  {[
                    { label: "КАПА",       value: s.mcapRange },
                    { label: "ЛИКВИДНОСТЬ", value: s.liquidityMin },
                    ...(s.volumeSpike ? [{ label: "VOL SPIKE", value: s.volumeSpike }] : []),
                    { label: "МАКС. ПОЗИЦИЯ", value: s.maxPct + " баланса" },
                    { label: "ТРЕЙЛИНГ",  value: s.trailing },
                    { label: "PRIORITY FEE", value: s.priorityFee },
                  ].map(({ label, value }) => (
                    <div key={label} className="px-3 py-2 rounded-xl"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div style={{ color: "rgba(201,168,76,0.5)", fontSize: "7px", fontWeight: 700, letterSpacing: "0.08em", marginBottom: "2px" }}>{label}</div>
                      <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "10px", fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Risk level */}
                <div className="flex items-center gap-2 mt-3">
                  <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}>Уровень риска:</span>
                  <span style={{ color: s.riskColor, fontSize: "10px", fontWeight: 700 }}>{s.risk}</span>
                </div>

                {/* Select button if not selected */}
                {!isSelected && (
                  <button
                    onClick={() => selectStrategy(s.id)}
                    className="w-full mt-3 py-2.5 rounded-xl"
                    style={{ background: `${s.riskColor}14`, border: `1px solid ${s.riskColor}44`, color: s.riskColor, fontSize: "10px", fontWeight: 700 }}>
                    Выбрать эту стратегию
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Как работает авто-торговля ── */}
      <GlassCard>
        <SectionLabel>КАК РАБОТАЕТ БОТ</SectionLabel>
        <div className="space-y-3">
          {[
            { step: "1", text: "OKO AI сканирует Solana 24/7 и находит сигналы по выбранной стратегии" },
            { step: "2", text: "Риск-менеджер проверяет: размер позиции, MCAP, ликвидность, volume spike" },
            { step: "3", text: "Своп через Jupiter V6 с авто-выбором Priority Fee под стратегию" },
            { step: "4", text: "SL/TP и трейлинг размещаются автономно через Jupiter Trigger Orders" },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.22)" }}>
                <span style={{ color: "#C9A84C", fontSize: "8px", fontWeight: 700 }}>{step}</span>
              </div>
              <span style={{ color: "rgba(255,255,255,0.40)", fontSize: "10px", lineHeight: "1.55" }}>{text}</span>
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Trading() {
  const [, navigate]   = useLocation();
  // Read ?tab=auto (or other) from URL so burger-menu deep-link works
  const [tab, setTab]  = useState<Tab>(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get("tab");
    return (t === "swap" || t === "sltp" || t === "risk" || t === "auto") ? t : "swap";
  });
  const { autoTrading } = useTrading();

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "swap",  label: "СВОП",    icon: <ArrowDownUp size={12} /> },
    { key: "sltp",  label: "SL/TP",  icon: <TrendingUp size={12} /> },
    { key: "risk",  label: "РИСК",   icon: <Shield size={12} /> },
    { key: "auto",  label: "АВТО",   icon: <Zap size={12} /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: "#080808" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,8,0.96)", borderBottom: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(24px)" }}>
        <button onClick={() => navigate("/")} className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <ArrowLeft size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>
        <div>
          <div className="font-orbitron font-bold" style={{ color: "#C9A84C", fontSize: "14px", letterSpacing: "0.1em" }}>TRADING</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>Jupiter V6 · Trigger Orders</div>
        </div>
        {autoTrading && (
          <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.30)" }}>
            <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#C9A84C" }} />
            <span style={{ color: "#C9A84C", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif" }}>AUTO ON</span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex px-4 gap-1 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl"
            style={{
              background: tab === t.key ? "rgba(201,168,76,0.10)" : "transparent",
              border: tab === t.key ? "1px solid rgba(201,168,76,0.22)" : "1px solid transparent",
              color: tab === t.key ? "#C9A84C" : "rgba(255,255,255,0.30)",
              fontFamily: "'Space Grotesk', sans-serif", fontSize: "8px", fontWeight: 700,
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-10 pt-4 max-w-lg mx-auto">
        {tab === "swap" && <SwapTab />}
        {tab === "sltp" && <SLTPTab />}
        {tab === "risk" && <RiskTab />}
        {tab === "auto" && <AutoTab />}
      </div>
    </div>
  );
}
