/**
 * PasswordSignModal — подтверждение сделки.
 * Если rawPrivKey доступен — подписывает мгновенно без пароля.
 * Если только encPrivKey (старый кошелёк) — одноразовый ввод пароля, потом сохраняет rawPrivKey.
 */
import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Eye, EyeOff, AlertCircle, RefreshCw, X, Zap, Lock, ArrowUpRight, ExternalLink } from "lucide-react";
import { getKeypairDirect, unlockAndSaveKeypair } from "@/lib/walletKeystore";
import { executeSwap, type SwapResult } from "@/lib/swapExecutor";
import { reportTrade } from "@/lib/referral";

/** Convert raw Solana / Jupiter error messages into readable Russian text */
function humanizeSwapError(raw: string, solPriceUsd: number): string {
  // Insufficient lamports
  const lamportMatch = raw.match(/insufficient lamports (\d+),\s*need (\d+)/i);
  if (lamportMatch) {
    const have = parseInt(lamportMatch[1]) / 1e9;
    const need = parseInt(lamportMatch[2]) / 1e9;
    const haveUsd = (have * solPriceUsd).toFixed(2);
    const needUsd = (need  * solPriceUsd).toFixed(2);
    return `Недостаточно SOL: у вас ${have.toFixed(4)} SOL (~$${haveUsd}), нужно ≥ ${need.toFixed(4)} SOL (~$${needUsd}) с учётом комиссий. Пополни кошелёк.`;
  }
  // Slippage / price impact
  if (/slippage/i.test(raw)) {
    return "Проскальзывание слишком высокое. Попробуй снизить сумму или подождать стабилизации цены.";
  }
  // No route
  if (/no route|route not found/i.test(raw)) {
    return "Jupiter не нашёл маршрут для этой пары. Токен может не иметь ликвидности.";
  }
  // Simulation failed
  if (/simulation failed/i.test(raw)) {
    return "Симуляция транзакции не прошла. Проверь баланс SOL или попробуй позже.";
  }
  // Network / timeout
  if (/fetch|network|503|timeout/i.test(raw)) {
    return "Нет подключения к Solana. Проверь интернет или попробуй позже.";
  }
  // Transaction rejected
  if (/отклонена|rejected|failed/i.test(raw)) {
    return "Транзакция отклонена блокчейном. Попробуй ещё раз.";
  }
  // Fallback — trim the raw message if it's too long
  return raw.length > 120 ? raw.slice(0, 120) + "…" : raw;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: (result: SwapResult) => void;

  userAddress: string;
  walletType: "generated" | "adapter" | null;
  inputMint: string;
  outputMint: string;
  inputAmountUsd: number;
  inputTokenAmount?: number;
  inputDecimals?: number;
  solPriceUsd: number;
  slippageBps?: number;
  priorityMode?: "normal" | "fast" | "degen";
  priorityFeeSol?: number;   // direct SOL override; takes precedence over priorityMode
  autoPriority?: boolean;    // auto-select optimal fee from RPC
  tokenSymbol: string;
  side: "buy" | "sell";
}

/**
 * Fetch optimal priority fee from Solana network.
 * Algorithm: measure real network congestion → slide fee from min to max accordingly.
 *
 * Congestion = % of recent slots with non-zero priority fee:
 *   0–20%   → minimal (0.0001 SOL) — network idle
 *   20–40%  → low     (0.0003 SOL) — light traffic
 *   40–60%  → medium  (0.0008 SOL) — moderate traffic
 *   60–80%  → high    (0.0015 SOL) — busy network
 *   80–100% → max     (P90 of non-zero fees, capped 0.003 SOL) — congested
 */
async function fetchOptimalPriorityFee(): Promise<number> {
  const TIERS = [
    { maxCongestion: 0.20, fee: 0.0001 },
    { maxCongestion: 0.40, fee: 0.0003 },
    { maxCongestion: 0.60, fee: 0.0008 },
    { maxCongestion: 0.80, fee: 0.0015 },
  ] as const;
  const MAX_FEE = 0.003;

  try {
    const res = await fetch("/api/rpc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [] }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const raw: { prioritizationFee: number }[] = data.result ?? [];
    if (!raw.length) return TIERS[0].fee;

    const allFees = raw.map((f) => f.prioritizationFee ?? 0);
    const nonZero = allFees.filter((f) => f > 0);

    // Congestion = share of slots that paid non-zero priority fee
    const congestion = nonZero.length / allFees.length;

    // Find tier by congestion level
    const tier = TIERS.find((t) => congestion <= t.maxCongestion);
    if (tier) {
      console.log(`[AutoFee] congestion=${(congestion * 100).toFixed(0)}% → tier ${tier.fee} SOL`);
      return tier.fee;
    }

    // High congestion (>80%): use P90 of non-zero fees
    nonZero.sort((a, b) => a - b);
    const p90 = nonZero[Math.floor(nonZero.length * 0.9)];
    // microlamports/CU × 200k CU / 1e6 (→lamports) / 1e9 (→SOL)
    const solFee = (p90 * 200_000) / 1_000_000 / 1_000_000_000;
    const clamped = Math.min(MAX_FEE, Math.max(0.0015, solFee));
    console.log(`[AutoFee] congestion=${(congestion * 100).toFixed(0)}% p90=${p90} µlam → ${clamped.toFixed(6)} SOL`);
    return clamped;
  } catch (e) {
    console.warn("[AutoFee] fetch failed:", e);
    return TIERS[0].fee;
  }
}

export default function PasswordSignModal({
  open, onClose, onSuccess,
  userAddress, walletType,
  inputMint, outputMint, inputAmountUsd, inputTokenAmount, inputDecimals,
  solPriceUsd, slippageBps = 100, priorityMode = "normal", priorityFeeSol,
  autoPriority = false,
  tokenSymbol, side,
}: Props) {
  const [password,     setPassword]     = useState("");
  const [showPw,       setShowPw]       = useState(false);
  const [status,       setStatus]       = useState<"idle" | "loading" | "error" | "success">("idle");
  const [errorMsg,     setErrorMsg]     = useState("");
  const [txHash,       setTxHash]       = useState("");
  const [autoFeePhase, setAutoFeePhase] = useState<"idle" | "optimizing" | "ready">("idle");
  const [computedFee,  setComputedFee]  = useState<number | null>(null);

  const { signTransaction: adapterSignTx } = useWallet();

  // Check keystore directly
  const keystoreData = (() => {
    try {
      const ks = localStorage.getItem(`oko-wallet-${userAddress}`);
      return ks ? JSON.parse(ks) : null;
    } catch { return null; }
  })();

  const isGenerated  = keystoreData?.type === "generated";
  const hasRaw       = isGenerated && !!keystoreData?.rawPrivKey;
  const needsUnlock  = isGenerated && !hasRaw && !!keystoreData?.encPrivKey;
  const isAdapter    = !isGenerated && (walletType === "adapter" || !!adapterSignTx);

  // Auto-execute on open when rawPrivKey is ready (no password needed)
  useEffect(() => {
    if (open && hasRaw && status === "idle") {
      handleSign();
    }
  }, [open, hasRaw]);

  if (!open) return null;

  const isBuy  = side === "buy";
  const accent = isBuy ? "#C9A84C" : "#ff5050";
  const accentAlpha = isBuy ? "rgba(201,168,76," : "rgba(255,80,80,";

  const handleSign = async () => {
    setStatus("loading"); setErrorMsg("");
    try {
      // ── Auto Priority Fee: fetch optimal fee from Solana RPC ──────────────────
      let resolvedPriorityFeeSol = priorityFeeSol;
      if (autoPriority) {
        setAutoFeePhase("optimizing");
        const [fee] = await Promise.all([
          fetchOptimalPriorityFee(),
          new Promise(r => setTimeout(r, 2500)), // show animation for at least 2.5s
        ]);
        resolvedPriorityFeeSol = fee;
        setComputedFee(fee);
        setAutoFeePhase("ready");
      }

      let keypair;
      let signTransactionFn: ((tx: VersionedTransaction) => Promise<VersionedTransaction>) | undefined;

      if (isGenerated) {
        // Try direct (no password) first
        const direct = getKeypairDirect(userAddress);
        if (direct) {
          keypair = direct;
        } else if (needsUnlock && password) {
          // One-time unlock — saves rawPrivKey for future
          keypair = await unlockAndSaveKeypair(userAddress, password);
        } else if (needsUnlock && !password) {
          setStatus("idle");
          setErrorMsg("Введите пароль чтобы разблокировать кошелёк один раз");
          return;
        } else {
          throw new Error("Кошелёк не найден");
        }
      } else if (isAdapter) {
        if (!adapterSignTx) throw new Error("Кошелёк не поддерживает подпись");
        signTransactionFn = async (tx: VersionedTransaction) => {
          const signed = await adapterSignTx(tx);
          return signed as VersionedTransaction;
        };
      } else {
        throw new Error("Кошелёк не найден. Создайте или подключите кошелёк.");
      }

      const result = await executeSwap({
        userAddress, keypair, signTransaction: signTransactionFn,
        inputMint, outputMint, inputAmountUsd, inputTokenAmount, inputDecimals,
        solPriceUsd, slippageBps, priorityMode, priorityFeeSol: resolvedPriorityFeeSol,
      });

      setTxHash(result.txHash);
      setStatus("success");
      reportTrade(userAddress, result.inputAmountUsd, result.txHash).catch(() => {});
      // Call onSuccess immediately so trade is recorded even if user closes modal early.
      // The UI stays open for 2200ms to show confirmation, but data is saved right away.
      onSuccess(result);
      setTimeout(() => { onClose(); }, 2200);
    } catch (e: any) {
      setErrorMsg(humanizeSwapError(e?.message ?? "", solPriceUsd));
      setStatus("error");
    }
  };

  const canSubmit = status !== "loading" && (hasRaw || isAdapter || (needsUnlock && !!password));

  // ── Full-screen success overlay ──────────────────────────────────────────────
  if (status === "success") {
    return (
      <div
        className="fixed inset-0 z-[300] flex flex-col items-center justify-center"
        style={{
          background: "rgba(5,5,15,0.97)",
          backdropFilter: "blur(20px)",
          animation: "fadeIn 0.3s ease",
        }}
        onClick={onClose}
      >
        <style>{`
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes scaleIn { from { transform: scale(0.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
          @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
          @keyframes pulse-ring {
            0% { transform: scale(0.85); opacity: 1 }
            70% { transform: scale(1.25); opacity: 0 }
            100% { transform: scale(0.85); opacity: 0 }
          }
        `}</style>

        {/* Pulsing ring behind icon */}
        <div style={{ position: "relative", width: 100, height: 100, marginBottom: 28 }}>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            border: `2px solid ${isBuy ? "rgba(201,168,76,0.5)" : "rgba(74,222,128,0.5)"}`,
            animation: "pulse-ring 1.6s ease-out infinite",
          }}/>
          <div style={{
            position: "absolute", inset: 0, borderRadius: "50%",
            background: isBuy ? "rgba(201,168,76,0.08)" : "rgba(74,222,128,0.08)",
            border: `1.5px solid ${isBuy ? "rgba(201,168,76,0.30)" : "rgba(74,222,128,0.30)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            animation: "scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1)",
          }}>
            <svg viewBox="0 0 24 24" fill="none" width={44} height={44}>
              <polyline
                points="20 6 9 17 4 12"
                stroke={isBuy ? "#C9A84C" : "#4ADE80"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  strokeDasharray: 30,
                  strokeDashoffset: 0,
                  animation: "drawCheck 0.5s ease 0.15s both",
                }}
              />
            </svg>
          </div>
        </div>

        {/* Text */}
        <div style={{ textAlign: "center", animation: "slideUp 0.4s ease 0.1s both" }}>
          <p style={{
            fontFamily: "'Space Grotesk',sans-serif",
            fontSize: "22px", fontWeight: 800, letterSpacing: "0.06em",
            color: isBuy ? "#C9A84C" : "#4ADE80",
            marginBottom: 8,
          }}>
            {isBuy ? "КУПЛЕНО!" : "ПРОДАНО!"}
          </p>
          <p style={{ color: "rgba(240,235,224,0.85)", fontSize: "15px", fontWeight: 700, marginBottom: 4 }}>
            {isBuy
              ? `${tokenSymbol} · $${inputAmountUsd.toFixed(2)}`
              : `${tokenSymbol} продан успешно`}
          </p>
          <p style={{ color: "rgba(240,235,224,0.35)", fontSize: "12px", marginBottom: 24 }}>
            Транзакция подтверждена в блокчейне
          </p>

          {/* Solscan link */}
          {txHash && (
            <a
              href={`https://solscan.io/tx/${txHash}`}
              target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "10px 20px", borderRadius: 40,
                background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
                textDecoration: "none", marginBottom: 32,
              }}
            >
              <span style={{ color: "rgba(240,235,224,0.45)", fontSize: "11px", fontFamily: "monospace" }}>
                {txHash.slice(0, 14)}…{txHash.slice(-6)}
              </span>
              <ExternalLink size={10} style={{ color: "rgba(240,235,224,0.30)" }}/>
            </a>
          )}
        </div>

        <p style={{ color: "rgba(240,235,224,0.18)", fontSize: "11px", animation: "slideUp 0.4s ease 0.25s both" }}>
          Нажми чтобы закрыть
        </p>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(5,5,15,0.90)", backdropFilter: "blur(16px)" }}
      onClick={(e) => e.target === e.currentTarget && status !== "loading" && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0E0E0E 0%, #080808 100%)",
          border: `1px solid ${accentAlpha}0.22)`,
          boxShadow: `0 0 60px ${accentAlpha}0.08), 0 -8px 60px rgba(0,0,0,0.7)`,
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
        </div>

        <div className="px-5 pt-2 pb-7">

          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 style={{ color: accent, fontSize: "14px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 900, letterSpacing: "0.08em" }}>
                {isBuy ? "ПОДТВЕРДИТЬ ПОКУПКУ" : "ПОДТВЕРДИТЬ ПРОДАЖУ"}
              </h3>
              <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "11px", marginTop: 2 }}>
                {hasRaw ? "Отправка мгновенно..." : isAdapter ? "Подтверди в кошельке" : "Нужна разблокировка один раз"}
              </p>
            </div>
            {status !== "loading" && (
              <button onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            )}
          </div>

          {/* Trade summary */}
          <div className="rounded-2xl p-4 mb-4" style={{ background: `${accentAlpha}0.05)`, border: `1px solid ${accentAlpha}0.16)` }}>
            <div className="flex items-center justify-between mb-2">
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.08em" }}>
                {isBuy ? "ПОКУПАЮ" : "ПРОДАЮ"}
              </span>
              <span style={{ color: accent, fontSize: "16px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800 }}>
                {isBuy ? `$${inputAmountUsd.toFixed(2)}` : tokenSymbol}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.08em" }}>ТОКЕН</span>
              <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "13px", fontFamily: "monospace", fontWeight: 700 }}>{tokenSymbol}</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.08em" }}>СЕТЬ</span>
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px" }}>Solana Mainnet</span>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.08em" }}>МАРШРУТ</span>
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: "11px" }}>Jupiter V6</span>
            </div>
          </div>

          {/* One-time password unlock (only for old wallets without rawPrivKey) */}
          {needsUnlock && status !== "success" && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2 px-3 py-2 rounded-xl"
                style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.14)" }}>
                <Lock size={11} style={{ color: "#C9A84C", flexShrink: 0 }} />
                <span style={{ color: "rgba(240,235,224,0.50)", fontSize: "10px", lineHeight: 1.5 }}>
                  Введи пароль один раз — после этого покупки и продажи будут мгновенными
                </span>
              </div>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setErrorMsg(""); }}
                  onKeyDown={(e) => e.key === "Enter" && password && handleSign()}
                  placeholder="Пароль кошелька..."
                  autoFocus
                  className="w-full px-4 py-3 rounded-xl pr-12 outline-none"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${errorMsg ? "rgba(255,80,80,0.4)" : "rgba(201,168,76,0.22)"}`,
                    color: "rgba(255,255,255,0.85)", fontSize: "14px",
                    fontFamily: "'Space Grotesk',sans-serif", caretColor: "#C9A84C",
                  }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: "rgba(255,255,255,0.3)" }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {errorMsg && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl mb-4"
              style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.22)" }}>
              <AlertCircle size={13} style={{ color: "#ff5050", flexShrink: 0 }} />
              <span style={{ color: "#ff8080", fontSize: "12px", fontFamily: "'Space Grotesk',sans-serif" }}>{errorMsg}</span>
            </div>
          )}

          {/* Success is handled by the full-screen overlay above — nothing to render here */}

          {/* Auto-fee optimization animation */}
          {status === "loading" && autoFeePhase === "optimizing" && (
            <div className="mb-4 rounded-2xl p-4" style={{ background: "rgba(74,222,128,0.06)", border: "1px solid rgba(74,222,128,0.18)" }}>
              <style>{`
                @keyframes autofee-pulse {
                  0%, 100% { opacity: 1 }
                  50% { opacity: 0.4 }
                }
                @keyframes autofee-bar {
                  0% { width: 0% }
                  100% { width: 100% }
                }
              `}</style>
              <div className="flex items-center gap-3 mb-3">
                <span style={{ fontSize: "18px", animation: "autofee-pulse 1.2s ease infinite" }}>⚡</span>
                <div>
                  <p style={{ color: "#4ADE80", fontSize: "11px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, letterSpacing: "0.05em" }}>
                    Оптимизируем комиссию...
                  </p>
                  <p style={{ color: "rgba(74,222,128,0.5)", fontSize: "9px", marginTop: 2 }}>
                    Анализ текущей загрузки сети Solana
                  </p>
                </div>
              </div>
              {/* Progress bar */}
              <div style={{ height: 3, background: "rgba(74,222,128,0.12)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  background: "linear-gradient(90deg, #4ADE80, #22c55e)",
                  borderRadius: 99,
                  animation: "autofee-bar 2.5s ease forwards",
                }} />
              </div>
              <div className="flex justify-between mt-2">
                <span style={{ color: "rgba(74,222,128,0.4)", fontSize: "8px", fontFamily: "monospace" }}>0.0001 SOL</span>
                <span style={{ color: "rgba(74,222,128,0.4)", fontSize: "8px", fontFamily: "monospace" }}>макс. 0.003 SOL</span>
              </div>
            </div>
          )}

          {/* Show computed fee after optimization */}
          {autoPriority && computedFee !== null && autoFeePhase !== "optimizing" && status === "loading" && (
            <div className="mb-3 px-3 py-2 rounded-xl flex items-center gap-2" style={{ background: "rgba(74,222,128,0.05)", border: "1px solid rgba(74,222,128,0.15)" }}>
              <span style={{ fontSize: "12px" }}>⚡</span>
              <span style={{ color: "rgba(74,222,128,0.7)", fontSize: "10px", fontFamily: "'Space Grotesk',sans-serif" }}>
                Комиссия оптимизирована: <strong style={{ color: "#4ADE80" }}>{computedFee.toFixed(4)} SOL</strong>
              </span>
            </div>
          )}

          {/* Action button */}
          {status !== "success" && (
            <button
              onClick={handleSign}
              disabled={!canSubmit}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5"
              style={{
                background: status === "loading"
                  ? `${accentAlpha}0.10)`
                  : `linear-gradient(135deg, ${accentAlpha}0.22) 0%, ${accentAlpha}0.14) 100%)`,
                border: `1px solid ${accentAlpha}${status === "loading" ? "0.25" : "0.50"})`,
                color: accent,
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: "13px", fontWeight: 700, letterSpacing: "0.12em",
                opacity: !canSubmit ? 0.4 : 1,
                cursor: !canSubmit ? "not-allowed" : "pointer",
                transition: "all 0.2s",
              }}
            >
              {status === "loading" ? (
                autoFeePhase === "optimizing"
                  ? <><span style={{ animation: "autofee-pulse 1.2s ease infinite", display: "inline-block" }}>⚡</span> Оптимизируем комиссию...</>
                  : <><RefreshCw size={15} className="animate-spin" /> Отправка в блокчейн...</>
              ) : (
                <><Zap size={15} />{isBuy ? `КУПИТЬ ${tokenSymbol} — $${inputAmountUsd.toFixed(2)}` : `ПРОДАТЬ ${tokenSymbol}`}</>
              )}
            </button>
          )}

          <p style={{ color: "rgba(255,255,255,0.18)", fontSize: "9px", textAlign: "center", marginTop: 10, fontFamily: "'Space Grotesk',sans-serif" }}>
            Транзакция необратима. Средства поступят мгновенно после подтверждения блокчейна.
          </p>
        </div>
      </div>
    </div>
  );
}
