import { useState, useCallback } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance } from "@/context/BalanceContext";
import {
  isValidAddress, shortAddr, TokenBalance,
} from "@/lib/solana";
import {
  Copy, Check, RefreshCw, ArrowDownToLine, ArrowUpFromLine,
  Shuffle, Link2, ChevronLeft, ExternalLink, QrCode, X,
  AlertCircle, Loader2, TrendingUp, TrendingDown, Minus,
  LogOut, Key, ChevronDown, BarChart3, Zap, AlertTriangle, Layers, ChevronRight,
} from "lucide-react";
import { useLocation } from "wouter";
import SeedPhraseModal from "@/components/SeedPhraseModal";
import WalletSelectorSheet from "@/components/WalletSelectorSheet";
import CreateWalletModal from "@/components/CreateWalletModal";
import QuickSellModal from "@/components/QuickSellModal";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(2)}K`;
  return `$${n.toFixed(d)}`;
}
function fmtAmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(2)}K`;
  if (n < 0.0001 && n > 0) return n.toExponential(2);
  return n.toFixed(n < 1 ? 6 : 4);
}

// ─── QR Modal ───────────────────────────────────────────────────────────────

function QRModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${address}&size=200x200&bgcolor=0a0a1f&color=00f7ff&margin=12`;

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 pb-10"
        style={{ background: "linear-gradient(160deg, #080808 0%, #080808 100%)", border: "1px solid rgba(201,168,76,0.18)", borderBottom: "none" }}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="font-orbitron font-bold text-sm" style={{ color: "#C9A84C", letterSpacing: "0.08em", textTransform: "uppercase" }}>Пополнить кошелёк</span>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        {/* QR Code */}
        <div className="flex justify-center mb-5">
          <div className="p-3 rounded-2xl" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.20)" }}>
            <img src={qrUrl} alt="QR" width={180} height={180} className="rounded-xl" style={{ imageRendering: "pixelated" }} />
          </div>
        </div>

        {/* Network badge */}
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full" style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.18)" }}>
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#C9A84C", boxShadow: "0 0 6px #C9A84C" }} />
            <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "9px", fontWeight: 700, color: "#C9A84C", letterSpacing: "0.08em" }}>SOLANA NETWORK</span>
          </div>
        </div>

        {/* Address */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", marginBottom: 6 }}>ВАШ АДРЕС</p>
          <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "12px", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.7 }}>{address}</p>
        </div>

        <button
          onClick={copy}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5"
          style={{
            background: copied ? "rgba(201,168,76,0.15)" : "rgba(201,168,76,0.12)",
            border: `1px solid ${copied ? "rgba(201,168,76,0.40)" : "rgba(201,168,76,0.35)"}`,
            color: copied ? "#C9A84C" : "#C9A84C",
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "11px",
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            transition: "all 0.25s ease",
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Скопировано!" : "Копировать адрес"}
        </button>

        <p style={{ color: "rgba(255,255,255,0.22)", fontSize: "10px", textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>
          Отправляйте только SOL и токены Solana SPL.<br />Другие сети не поддерживаются.
        </p>
      </div>
    </div>
  );
}

// ─── Send Modal ──────────────────────────────────────────────────────────────

function SendModal({
  tokens, solBalance, solPrice, address, onClose,
  sendTransaction,
}: {
  tokens: TokenBalance[];
  solBalance: number;
  solPrice: number;
  address: string;
  onClose: () => void;
  sendTransaction?: ReturnType<typeof useWallet>["sendTransaction"];
}) {
  const { connection } = useConnection();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [selectedToken, setSelectedToken] = useState("SOL");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [txSig, setTxSig] = useState("");
  const [errMsg, setErrMsg] = useState("");

  const allTokens = [
    { symbol: "SOL", name: "Solana", amount: solBalance, usdValue: solBalance * solPrice, logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png" },
    ...tokens,
  ];
  const token = allTokens.find(t => t.symbol === selectedToken) ?? allTokens[0];
  const usdEst = selectedToken === "SOL" ? parseFloat(amount || "0") * solPrice : 0;
  const toValid = isValidAddress(to);
  const amtValid = parseFloat(amount) > 0 && parseFloat(amount) <= (token?.amount ?? 0);
  const canSend = toValid && amtValid && status !== "loading";

  const handleSend = async () => {
    if (!canSend || !sendTransaction) return;
    setStatus("loading");
    setErrMsg("");
    try {
      const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: new PublicKey(address),
          toPubkey:   new PublicKey(to),
          lamports,
        }),
      );
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = new PublicKey(address);
      const sig = await sendTransaction(tx, connection);
      setTxSig(sig);
      setStatus("success");
    } catch (e: unknown) {
      setStatus("error");
      setErrMsg(e instanceof Error ? e.message : "Ошибка транзакции");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}>
      <div
        className="w-full max-w-sm rounded-t-3xl p-6 pb-10"
        style={{ background: "linear-gradient(160deg, #080808 0%, #080808 100%)", border: "1px solid rgba(201,168,76,0.18)", borderBottom: "none" }}
      >
        <div className="flex items-center justify-between mb-6">
          <span className="font-orbitron font-bold text-sm" style={{ color: "#C9A84C", letterSpacing: "0.08em", textTransform: "uppercase" }}>Отправить</span>
          <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        {status === "success" ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.35)" }}>
              <Check size={28} style={{ color: "#C9A84C" }} />
            </div>
            <p className="font-orbitron font-bold mb-2" style={{ color: "#C9A84C", fontSize: "15px" }}>Отправлено!</p>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", marginBottom: 16 }}>Транзакция подтверждена</p>
            <a
              href={`https://solscan.io/tx/${txSig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl"
              style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)", color: "#C9A84C", fontSize: "11px", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Посмотреть на Solscan <ExternalLink size={11} />
            </a>
            <button onClick={onClose} className="w-full mt-4 py-3 rounded-2xl font-orbitron font-bold text-xs" style={{ background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)" }}>
              Закрыть
            </button>
          </div>
        ) : (
          <>
            {/* Token select */}
            <div className="mb-4">
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", marginBottom: 8 }}>ТОКЕН</p>
              <div className="flex gap-2 flex-wrap">
                {allTokens.map(t => (
                  <button
                    key={t.symbol}
                    onClick={() => setSelectedToken(t.symbol)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
                    style={{
                      background: selectedToken === t.symbol ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${selectedToken === t.symbol ? "rgba(201,168,76,0.40)" : "rgba(255,255,255,0.08)"}`,
                      color: selectedToken === t.symbol ? "#C9A84C" : "rgba(255,255,255,0.5)",
                      fontSize: "11px",
                      fontFamily: "'Space Grotesk', sans-serif",
                      fontWeight: 700,
                    }}
                  >
                    {t.logoURI && <img src={t.logoURI} alt="" width={14} height={14} className="rounded-full" />}
                    {t.symbol}
                  </button>
                ))}
              </div>
              <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", marginTop: 6 }}>
                Баланс: {fmtAmt(token?.amount ?? 0)} {selectedToken}
              </p>
            </div>

            {/* Recipient */}
            <div className="mb-4">
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", marginBottom: 8 }}>АДРЕС ПОЛУЧАТЕЛЯ</p>
              <div className="relative">
                <input
                  value={to}
                  onChange={e => setTo(e.target.value)}
                  placeholder="Solana адрес (32-44 символа)"
                  className="w-full px-4 py-3.5 rounded-2xl text-sm font-mono"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${to && !toValid ? "rgba(255,80,80,0.5)" : to && toValid ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.10)"}`,
                    color: "rgba(255,255,255,0.75)",
                    outline: "none",
                    fontSize: "12px",
                  }}
                />
                {to && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {toValid
                      ? <Check size={14} style={{ color: "#C9A84C" }} />
                      : <AlertCircle size={14} style={{ color: "rgba(255,80,80,0.8)" }} />}
                  </div>
                )}
              </div>
            </div>

            {/* Amount */}
            <div className="mb-5">
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", marginBottom: 8 }}>СУММА</p>
              <div className="relative">
                <input
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  type="number"
                  min="0"
                  step="any"
                  className="w-full px-4 py-3.5 rounded-2xl"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    color: "rgba(255,255,255,0.75)",
                    outline: "none",
                    fontSize: "18px",
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                  }}
                />
                <button
                  onClick={() => setAmount(String((token?.amount ?? 0) * 0.999))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-1 rounded-lg"
                  style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)", color: "#C9A84C", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}
                >
                  MAX
                </button>
              </div>
              {usdEst > 0 && (
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginTop: 5 }}>≈ {fmt(usdEst)}</p>
              )}
            </div>

            {!sendTransaction && (
              <div className="mb-4 px-4 py-3 rounded-2xl flex items-start gap-2.5" style={{ background: "rgba(255,150,0,0.08)", border: "1px solid rgba(255,150,0,0.22)" }}>
                <AlertCircle size={14} style={{ color: "#ff9600", marginTop: 1, flexShrink: 0 }} />
                <p style={{ color: "rgba(255,150,0,0.85)", fontSize: "11px", lineHeight: 1.6 }}>
                  Для подписи транзакций подключи кошелёк Phantom, Solflare или другой через кнопку CONNECT.
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="mb-4 px-4 py-3 rounded-2xl flex items-start gap-2.5" style={{ background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.22)" }}>
                <AlertCircle size={14} style={{ color: "#ff5050", marginTop: 1, flexShrink: 0 }} />
                <p style={{ color: "rgba(255,80,80,0.85)", fontSize: "11px", lineHeight: 1.6 }}>{errMsg}</p>
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={!canSend}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5"
              style={{
                background: canSend ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${canSend ? "rgba(201,168,76,0.40)" : "rgba(255,255,255,0.08)"}`,
                color: canSend ? "#C9A84C" : "rgba(255,255,255,0.2)",
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "12px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: canSend ? "pointer" : "not-allowed",
                transition: "all 0.25s ease",
              }}
            >
              {status === "loading"
                ? <><Loader2 size={16} className="animate-spin" /> Подтверждение...</>
                : <><ArrowUpFromLine size={15} /> Отправить {selectedToken}</>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Token Row ───────────────────────────────────────────────────────────────

function TokenRow({ token }: { token: TokenBalance & { name: string; logoURI?: string } }) {
  const change      = token.change24h ?? 0;
  const ChangeIcon  = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const changeColor = change > 0 ? "#4ADE80" : change < 0 ? "#FF4D5E" : "rgba(255,255,255,0.3)";
  const usdPrice    = token.amount > 0 && token.usdValue > 0 ? token.usdValue / token.amount : 0;

  const [sellOpen, setSellOpen] = useState(false);

  return (
    <>
      <div
        className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        {/* Logo */}
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.10)" }}>
          {token.logoURI
            ? <img src={token.logoURI} alt={token.symbol} width={40} height={40} style={{ objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            : <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{token.symbol.slice(0, 2)}</span>}
        </div>

        {/* Name */}
        <div className="flex-1 min-w-0">
          <p style={{ color: "rgba(255,255,255,0.90)", fontSize: "14px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{token.symbol}</p>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", marginTop: 1 }} className="truncate">{token.name}</p>
        </div>

        {/* Amount + USD */}
        <div className="text-right mr-1">
          <p style={{ color: "rgba(255,255,255,0.90)", fontSize: "14px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{token.usdValue > 0 ? fmt(token.usdValue) : fmtAmt(token.amount)}</p>
          {token.usdValue > 0 && change !== 0 && (
            <div className="flex items-center justify-end gap-0.5 mt-0.5" style={{ color: changeColor }}>
              <ChangeIcon size={10} />
              <span style={{ fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{Math.abs(change).toFixed(1)}%</span>
            </div>
          )}
        </div>

        {/* Sell button */}
        <button
          onClick={() => setSellOpen(true)}
          style={{
            flexShrink: 0, padding: "8px 12px", borderRadius: 10, cursor: "pointer",
            background: "rgba(255,77,94,0.10)", border: "1px solid rgba(255,77,94,0.30)",
            color: "#FF4D5E", fontSize: "11px", fontWeight: 700,
            fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.04em",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <TrendingDown size={12} />
          ПРОДАТЬ
        </button>
      </div>

      <QuickSellModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        mint={token.mint}
        symbol={token.symbol}
        logoURI={token.logoURI}
        amount={token.amount}
        decimals={token.decimals}
        usdValue={token.usdValue}
        usdPrice={usdPrice}
      />
    </>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────────

export default function WalletDashboard() {
  const [, navigate] = useLocation();
  const { address, wallets, disconnectWallet, switchWallet, setConnected, removeWallet } = useOkoWallet();
  const { sendTransaction } = useWallet();

  const {
    solBalance, solPrice, tokens: rawTokens, totalUsd,
    loading, lastUpdated, refresh: load, error: balanceError,
  } = useBalance();
  const [copied, setCopied]         = useState(false);
  const lastRefresh = lastUpdated ? new Date(lastUpdated) : null;

  // Convert BalanceContext tokens to legacy TokenBalance shape
  const tokens: TokenBalance[] = rawTokens.map(t => ({
    mint:     t.mint,
    symbol:   t.symbol,
    name:     t.name,
    decimals: t.decimals,
    amount:   t.amount,
    usdValue: t.usdValue,
    logoURI:  t.logoURI,
  }));

  const [modal, setModal]             = useState<"deposit" | "send" | "bridge" | null>(null);
  const [showSeedPhrase, setShowSeedPhrase] = useState(false);
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  const [showCreateWallet, setShowCreateWallet]     = useState(false);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);

  const activeWalletInfo = wallets.find(w => w.address === address);
  // Check keystore directly — works even if wallets list is empty (e.g. after page reload)
  const isGenerated = activeWalletInfo?.type === "generated" || (() => {
    if (!address) return false;
    try {
      const ks = localStorage.getItem(`oko-wallet-${address}`);
      return ks ? JSON.parse(ks).type === "generated" : false;
    } catch { return false; }
  })();

  const copy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const allTokensList: (TokenBalance & { name: string; logoURI?: string })[] = [
    {
      mint: "SOL",
      symbol: "SOL",
      name: "Solana",
      decimals: 9,
      amount: solBalance,
      usdValue: solBalance * solPrice,
      logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
    },
    ...tokens,
  ];

  if (!address) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "linear-gradient(135deg, #080808 0%, #080808 100%)" }}>
        <div className="text-center">
          <p className="font-orbitron font-bold mb-3" style={{ color: "#C9A84C", fontSize: "16px" }}>Кошелёк не подключён</p>
          <button onClick={() => navigate("/wallet")} className="px-6 py-3 rounded-2xl font-orbitron font-bold text-sm" style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.35)", color: "#C9A84C" }}>
            Подключить кошелёк
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Disconnect Confirm ─────────────────────────────────────────────── */}
      {showDisconnectConfirm && (
        <div className="fixed inset-0 z-[350] flex items-center justify-center px-6"
          style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(14px)" }}>
          <div className="w-full max-w-xs rounded-3xl p-6"
            style={{ background: "linear-gradient(160deg, #0D120D, #080808)", border: "1px solid rgba(255,80,80,0.25)", boxShadow: "0 0 60px rgba(255,40,40,0.10)" }}>
            <div className="flex justify-center mb-4">
              <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,60,60,0.10)", border: "1.5px solid rgba(255,60,60,0.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LogOut size={26} style={{ color: "#ff5050" }} />
              </div>
            </div>
            <h3 className="font-orbitron font-bold text-center mb-2" style={{ fontSize: "14px", color: "#ff6060", letterSpacing: "0.04em" }}>Выйти из кошелька?</h3>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px", lineHeight: 1.7, textAlign: "center", marginBottom: 20 }}>
              Ваш кошелёк останется в списке. Вы сможете войти снова, выбрав его в панели кошельков.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDisconnectConfirm(false)} className="flex-1 py-3 rounded-2xl font-orbitron font-bold"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.50)", fontSize: "11px" }}>
                Отмена
              </button>
              <button onClick={() => { disconnectWallet(); navigate("/"); }} className="flex-1 py-3 rounded-2xl font-orbitron font-bold"
                style={{ background: "rgba(255,60,60,0.14)", border: "1px solid rgba(255,60,60,0.35)", color: "#ff6060", fontSize: "11px", letterSpacing: "0.06em" }}>
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="min-h-screen min-h-dvh relative"
        style={{ background: "#080808" }}
      >
        <div className="relative z-10 px-4 pb-28 pt-4 max-w-sm mx-auto">

          {/* ── Top bar: back + wallet name + actions ── */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1 px-3 py-2 rounded-xl shrink-0"
              style={{ color: "rgba(201,168,76,0.55)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}
            >
              <ChevronLeft size={13} />
            </button>

            {/* Wallet selector pill */}
            <button
              onClick={() => setShowWalletSelector(true)}
              className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl"
              style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)", minWidth: 0 }}
            >
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg, #C9A84C, #C9A84C)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <span style={{ fontSize: "9px", fontWeight: 700, color: "#fff", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {(activeWalletInfo?.name ?? "W").slice(0, 1).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ color: "rgba(255,255,255,0.75)", fontSize: "11px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeWalletInfo?.name ?? "Кошелёк"}
                </p>
              </div>
              <ChevronDown size={12} style={{ color: "rgba(201,168,76,0.45)", flexShrink: 0 }} />
            </button>

            {/* Disconnect */}
            <button
              onClick={() => setShowDisconnectConfirm(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,60,60,0.06)", border: "1px solid rgba(255,60,60,0.18)" }}
              title="Выйти"
            >
              <LogOut size={14} style={{ color: "rgba(255,80,80,0.70)" }} />
            </button>
          </div>

          {/* ── Quick nav to Markets/Trading ── */}
          <div className="grid grid-cols-2 gap-2.5 mb-4">
            <button
              onClick={() => navigate("/markets")}
              className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
              style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.14)", transition: "all 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.10)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.05)"; }}
            >
              <BarChart3 size={16} style={{ color: "#C9A84C" }} />
              <span style={{ color: "rgba(240,235,224,0.80)", fontSize: "10.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>РЫНКИ</span>
            </button>
            <button
              onClick={() => navigate("/trading")}
              className="flex items-center gap-2.5 px-4 py-3 rounded-2xl"
              style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.14)", transition: "all 0.2s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.10)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.05)"; }}
            >
              <Zap size={16} style={{ color: "#C9A84C" }} />
              <span style={{ color: "rgba(201,168,76,0.80)", fontSize: "10.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>ТОРГОВЛЯ</span>
            </button>
          </div>

          {/* ── Total balance card ── */}
          <div
            className="rounded-3xl p-6 mb-4 relative overflow-hidden"
            style={{
              background: "#111111",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >

            <div className="flex items-start justify-between mb-1">
              <p style={{ color: "rgba(201,168,76,0.6)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                ОБЩИЙ БАЛАНС
              </p>
              <button onClick={load} disabled={loading} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.18)" }}>
                <RefreshCw size={12} style={{ color: "#C9A84C", ...(loading ? { animation: "spin 1s linear infinite" } : {}) }} />
              </button>
            </div>

            {balanceError && !loading && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2 cursor-pointer"
                style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.22)" }}
                onClick={() => load()}
              >
                <AlertCircle size={12} style={{ color: "#ff6060", flexShrink: 0 }} />
                <span style={{ color: "#ff9090", fontSize: "11px", fontFamily: "'Space Grotesk',sans-serif", flex: 1 }}>
                  Не удалось загрузить баланс
                </span>
                <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700 }}>
                  Обновить
                </span>
              </div>
            )}

            {loading ? (
              <div className="flex items-center gap-2 py-4">
                <Loader2 size={20} style={{ color: "#C9A84C" }} className="animate-spin" />
                <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "13px" }}>Загрузка баланса...</span>
              </div>
            ) : (
              <p className="font-orbitron font-bold mt-2 mb-1" style={{ fontSize: "clamp(28px, 9vw, 38px)", color: "#F0EBE0", letterSpacing: "-0.01em" }}>
                {fmt(totalUsd)}
              </p>
            )}

            {/* Address row */}
            <button onClick={copy} className="flex items-center gap-2 mt-3 group">
              <div className="w-4 h-4 rounded-full" style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.30)" }}>
                <div className="w-full h-full rounded-full pulse-dot" style={{ background: "rgba(201,168,76,0.5)" }} />
              </div>
              <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", fontFamily: "monospace" }}>{shortAddr(address, 6)}</span>
              {copied ? <Check size={11} style={{ color: "#C9A84C" }} /> : <Copy size={11} style={{ color: "rgba(255,255,255,0.2)" }} />}
            </button>

            {lastRefresh && (
              <p style={{ color: "rgba(255,255,255,0.18)", fontSize: "9px", marginTop: 8 }}>
                Обновлено: {lastRefresh.toLocaleTimeString("ru-RU")}
              </p>
            )}
          </div>

          {/* ── SOL detail strip ── */}
          <div
            className="rounded-2xl px-5 py-4 mb-4 flex items-center gap-4"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <img src="https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png" alt="SOL" width={36} height={36} className="rounded-full" style={{ border: "1px solid rgba(255,255,255,0.12)" }} />
            <div className="flex-1">
              <p style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>
                {loading ? "—" : `${solBalance.toFixed(4)} SOL`}
              </p>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>
                {loading ? "..." : fmt(solBalance * solPrice)} · SOL ${solPrice.toFixed(0)}
              </p>
            </div>
            <a
              href={`https://solscan.io/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(240,235,224,0.50)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}
            >
              Solscan <ExternalLink size={9} />
            </a>
          </div>

          {/* ── Action buttons ── */}
          <div className="grid grid-cols-4 gap-2.5 mb-5">
            {[
              { icon: ArrowDownToLine, label: "Пополнить", action: () => setModal("deposit") },
              { icon: ArrowUpFromLine, label: "Отправить", action: () => setModal("send") },
              { icon: Link2,           label: "Бридж",     action: () => navigate("/bridge") },
              { icon: Shuffle,         label: "Своп",      action: () => navigate("/trading") },
            ].map(({ icon: Icon, label, action }) => (
              <button
                key={label}
                onClick={action}
                className="flex flex-col items-center gap-2 py-4 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", transition: "all 0.2s ease" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.03)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
                  <Icon size={17} style={{ color: "rgba(240,235,224,0.60)" }} />
                </div>
                <span style={{ color: "rgba(240,235,224,0.38)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</span>
              </button>
            ))}
          </div>

          {/* ── Multi-chain (OKO wallets only) ── */}
          {isGenerated && (
            <button
              onClick={() => navigate("/multichain")}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl mb-5"
              style={{
                background: "linear-gradient(135deg, rgba(98,126,234,0.08), rgba(130,71,229,0.08))",
                border: "1px solid rgba(98,126,234,0.22)",
              }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(98,126,234,0.14)", border: "1px solid rgba(98,126,234,0.28)" }}>
                <Layers size={17} style={{ color: "#627EEA" }} />
              </div>
              <div className="text-left flex-1 min-w-0">
                <div style={{ color: "#fff", fontSize: "12px", fontWeight: 700 }}>Мультичейн кошелёк</div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>
                  ETH · BNB · Base · Arbitrum · Polygon · Tron
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full shrink-0"
                style={{ background: "rgba(98,126,234,0.12)", border: "1px solid rgba(98,126,234,0.25)" }}>
                <span style={{ color: "#627EEA", fontSize: "8px", fontWeight: 700 }}>ВСЕ СЕТИ</span>
                <ChevronRight size={10} style={{ color: "#627EEA" }} />
              </div>
            </button>
          )}

          {/* ── Token list ── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Токены ({allTokensList.length})
              </p>
              <button
                onClick={() => window.open(`https://solscan.io/account/${address}#splTransfer`, "_blank")}
                className="flex items-center gap-1"
                style={{ color: "rgba(201,168,76,0.45)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                История <ExternalLink size={9} />
              </button>
            </div>

            {loading ? (
              <div className="flex flex-col gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                ))}
              </div>
            ) : allTokensList.length === 0 ? (
              <div className="text-center py-10 rounded-2xl" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                <QrCode size={28} style={{ color: "rgba(255,255,255,0.15)", margin: "0 auto 10px" }} />
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "12px", fontFamily: "'Space Grotesk', sans-serif" }}>Кошелёк пустой</p>
                <p style={{ color: "rgba(255,255,255,0.15)", fontSize: "11px", marginTop: 6 }}>Пополни кошелёк через кнопку ПОПОЛНИТЬ</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {allTokensList.map(t => <TokenRow key={t.mint} token={t} />)}
              </div>
            )}
          </div>

          {/* ── Seed phrase + security panel ── */}
          <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Управление кошельком</p>
            <div className="flex flex-col gap-2">
              {isGenerated && (
                <button
                  onClick={() => setShowSeedPhrase(true)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: "rgba(255,80,0,0.05)", border: "1px solid rgba(255,80,0,0.18)", transition: "all 0.2s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,80,0,0.10)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,80,0,0.05)"; }}
                >
                  <Key size={14} style={{ color: "rgba(255,130,50,0.75)" }} />
                  <div className="flex-1 text-left">
                    <p style={{ color: "rgba(255,150,80,0.85)", fontSize: "12px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>Экспорт сид-фразы</p>
                    <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", marginTop: 1 }}>12 слов для импорта в Phantom / Solflare</p>
                  </div>
                  <AlertTriangle size={12} style={{ color: "rgba(255,100,30,0.55)", flexShrink: 0 }} />
                </button>
              )}

              <button
                onClick={() => setShowDisconnectConfirm(true)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: "rgba(255,60,60,0.04)", border: "1px solid rgba(255,60,60,0.14)", transition: "all 0.2s" }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,60,60,0.09)"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,60,60,0.04)"; }}
              >
                <LogOut size={14} style={{ color: "rgba(255,90,90,0.70)" }} />
                <p style={{ color: "rgba(255,100,100,0.75)", fontSize: "12px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>Выйти из кошелька</p>
              </button>
            </div>
          </div>

          {/* ── Quick links ── */}
          <div className="mt-4 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>Полезные ссылки</p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: "Solscan",    url: `https://solscan.io/account/${address}` },
                { label: "SolanaFM",   url: `https://solana.fm/address/${address}` },
                { label: "Phantom",    url: "https://phantom.app" },
                { label: "Jupiter",    url: "https://jup.ag" },
              ].map(l => (
                <a
                  key={l.label}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", textDecoration: "none" }}
                >
                  {l.label} <ExternalLink size={8} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {modal === "deposit" && <QRModal address={address} onClose={() => setModal(null)} />}
      {modal === "send"    && (
        <SendModal
          tokens={tokens}
          solBalance={solBalance}
          solPrice={solPrice}
          address={address}
          onClose={() => setModal(null)}
          sendTransaction={sendTransaction}
        />
      )}

      {showSeedPhrase && (
        <SeedPhraseModal address={address} onClose={() => setShowSeedPhrase(false)} />
      )}

      {showWalletSelector && (
        <WalletSelectorSheet
          wallets={wallets}
          activeAddress={address}
          onSelect={addr => switchWallet(addr)}
          onAddWallet={() => setShowCreateWallet(true)}
          onDeleteWallet={addr => removeWallet(addr)}
          onClose={() => setShowWalletSelector(false)}
        />
      )}

      {showCreateWallet && (
        <CreateWalletModal
          open={showCreateWallet}
          onClose={() => setShowCreateWallet(false)}
          onCreated={addr => { setConnected("generated", addr); setShowCreateWallet(false); }}
        />
      )}
    </>
  );
}
