import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft, Copy, Check, ExternalLink, RefreshCw,
  Loader2, Eye, EyeOff, Lock, Shield, AlertCircle,
  Wallet, ChevronRight,
} from "lucide-react";
import { useOkoWallet } from "@/context/WalletContext";
import {
  CHAINS, deriveEvmAddress, deriveTronAddress,
  fetchChainBalance, fetchChainPrices, type ChainConfig,
} from "@/lib/multichain";
import { getDecryptedMnemonic } from "@/lib/walletKeystore";

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtBalance(bal: number): string {
  if (bal === 0) return "0";
  if (bal < 0.000001) return bal.toExponential(2);
  if (bal < 0.001) return bal.toFixed(6);
  if (bal < 1) return bal.toFixed(4);
  if (bal < 1000) return bal.toFixed(3);
  return bal.toFixed(2);
}

// ── Chain Row ─────────────────────────────────────────────────────────────────

interface ChainRowProps {
  chain: ChainConfig;
  evmAddress: string;
  tronAddress: string;
  prices: Record<string, number>;
}

function ChainRow({ chain, evmAddress, tronAddress, prices }: ChainRowProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const address = chain.type === "tron" ? tronAddress : evmAddress;
  const price = prices[chain.id] ?? 0;
  const usdValue = balance !== null ? balance * price : null;

  const load = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(false);
    try {
      const bal = await fetchChainBalance(chain, address);
      setBalance(bal);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [address, chain]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl p-4"
      style={{
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${chain.color}22`,
      }}>
      {/* Header row */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-lg"
          style={{ background: `${chain.color}18`, border: `1px solid ${chain.color}35` }}>
          {chain.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{chain.name}</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>
            {shortAddr(address)}
          </div>
        </div>
        {/* Balance */}
        <div className="text-right shrink-0">
          {loading ? (
            <Loader2 size={14} style={{ color: chain.color }} className="animate-spin" />
          ) : error ? (
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px" }}>—</span>
          ) : (
            <>
              <div style={{ color: chain.color, fontSize: "13px", fontWeight: 700, fontFamily: "monospace" }}>
                {fmtBalance(balance ?? 0)} {chain.symbol}
              </div>
              {usdValue !== null && usdValue > 0 && (
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}>
                  ≈ ${usdValue.toFixed(2)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Address + actions */}
      <div className="flex gap-2">
        {/* Full address (truncated) */}
        <div className="flex-1 px-3 py-2 rounded-xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", fontFamily: "monospace", wordBreak: "break-all" }}>
            {address}
          </span>
        </div>

        {/* Copy */}
        <button onClick={copy}
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: copied ? `${chain.color}20` : "rgba(255,255,255,0.05)",
            border: `1px solid ${copied ? chain.color + "40" : "rgba(255,255,255,0.10)"}`,
          }}>
          {copied
            ? <Check size={13} style={{ color: chain.color }} />
            : <Copy size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
          }
        </button>

        {/* Explorer */}
        <a href={chain.explorer + address} target="_blank" rel="noopener noreferrer"
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <ExternalLink size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
        </a>

        {/* Refresh */}
        <button onClick={load}
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <RefreshCw size={13} style={{ color: "rgba(255,255,255,0.4)" }} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
    </div>
  );
}

// ── Password Gate ─────────────────────────────────────────────────────────────

function PasswordGate({ address, onUnlock }: { address: string; onUnlock: (mnemonic: string) => void }) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const unlock = async () => {
    if (!password) return;
    setLoading(true);
    setError("");
    try {
      const mnemonic = await getDecryptedMnemonic(address, password);
      onUnlock(mnemonic);
    } catch (e: any) {
      setError(e?.message ?? "Неверный пароль");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-5 px-4 pt-8">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center"
        style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.22)", boxShadow: "0 0 40px rgba(201,168,76,0.12)" }}>
        <Lock size={32} style={{ color: "#C9A84C", filter: "drop-shadow(0 0 8px #C9A84C)" }} />
      </div>

      <div className="text-center">
        <div className="font-orbitron font-bold mb-1" style={{ color: "#C9A84C", fontSize: "14px", letterSpacing: "0.08em" }}>
          МУЛЬТИЧЕЙН КОШЕЛЁК
        </div>
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>
          Введите пароль для получения адресов на других блокчейнах
        </div>
      </div>

      {/* Chain badges */}
      <div className="flex flex-wrap justify-center gap-2">
        {CHAINS.map((c) => (
          <div key={c.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{ background: `${c.color}14`, border: `1px solid ${c.color}30` }}>
            <span style={{ fontSize: "11px" }}>{c.icon}</span>
            <span style={{ color: c.color, fontSize: "9px", fontWeight: 700 }}>{c.name}</span>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="w-full max-w-xs px-4 py-3 rounded-2xl"
        style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}>
        <div className="flex items-start gap-2">
          <Shield size={12} style={{ color: "#C9A84C", flexShrink: 0, marginTop: 2 }} />
          <p style={{ color: "rgba(240,235,224,0.5)", fontSize: "10px", lineHeight: 1.6 }}>
            Все адреса деривируются из вашей BIP39 seed-фразы. Один кошелёк — все блокчейны.
            Приватный ключ не покидает устройство.
          </p>
        </div>
      </div>

      {/* Password input */}
      <div className="w-full max-w-xs relative">
        <input
          type={showPw ? "text" : "password"}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          onKeyDown={(e) => e.key === "Enter" && unlock()}
          placeholder="Пароль от кошелька"
          className="w-full px-4 py-3.5 rounded-2xl pr-12 outline-none"
          style={{
            background: "rgba(201,168,76,0.05)",
            border: `1px solid ${error ? "rgba(255,80,80,0.35)" : "rgba(201,168,76,0.20)"}`,
            color: "rgba(255,255,255,0.85)",
            fontSize: "14px",
            caretColor: "#C9A84C",
          }}
        />
        <button type="button" onClick={() => setShowPw(!showPw)}
          className="absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: "rgba(255,255,255,0.3)" }}>
          {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>

      {error && (
        <div className="w-full max-w-xs flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.20)" }}>
          <AlertCircle size={12} style={{ color: "#ff6060", flexShrink: 0 }} />
          <span style={{ color: "rgba(255,150,150,0.9)", fontSize: "11px" }}>{error}</span>
        </div>
      )}

      <button
        onClick={unlock}
        disabled={loading || !password}
        className="w-full max-w-xs py-4 rounded-2xl flex items-center justify-center gap-2 font-orbitron font-bold"
        style={{
          background: "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.09))",
          border: "1px solid rgba(201,168,76,0.38)",
          boxShadow: "0 0 28px rgba(201,168,76,0.18)",
          color: loading || !password ? "rgba(201,168,76,0.3)" : "#C9A84C",
          fontSize: "11px",
          letterSpacing: "0.10em",
          cursor: loading || !password ? "not-allowed" : "pointer",
        }}>
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> Расшифровка…</>
          : <>Открыть кошельки <ChevronRight size={14} /></>
        }
      </button>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function MultiChainWallet() {
  const [, navigate] = useLocation();
  const { address, walletType } = useOkoWallet();

  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [evmAddress, setEvmAddress] = useState("");
  const [tronAddress, setTronAddress] = useState("");
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [deriving, setDeriving] = useState(false);

  const isGenerated = walletType === "generated";

  // After unlocking, derive addresses
  const handleUnlock = useCallback(async (mn: string) => {
    setMnemonic(mn);
    setDeriving(true);
    try {
      const [evm, tron, px] = await Promise.all([
        Promise.resolve(deriveEvmAddress(mn)),
        deriveTronAddress(mn),
        fetchChainPrices(),
      ]);
      setEvmAddress(evm);
      setTronAddress(tron);
      setPrices(px);
    } finally {
      setDeriving(false);
    }
  }, []);

  // Refresh prices
  const refreshPrices = useCallback(async () => {
    const px = await fetchChainPrices();
    setPrices(px);
  }, []);

  return (
    <div className="min-h-screen pb-10" style={{ background: "#080808" }}>
      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-4 py-3"
        style={{ background: "rgba(8,8,8,0.95)", borderBottom: "1px solid rgba(201,168,76,0.08)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/wallet-dashboard")}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <ArrowLeft size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>
        <div>
          <div className="font-orbitron font-bold" style={{ color: "#C9A84C", fontSize: "14px", letterSpacing: "0.1em" }}>
            МУЛЬТИЧЕЙН
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>
            ETH · BNB · Base · Arbitrum · Polygon · Tron
          </div>
        </div>
        {mnemonic && (
          <button onClick={refreshPrices} className="ml-auto w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
            <RefreshCw size={13} style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        )}
      </div>

      {/* Not a generated wallet */}
      {!isGenerated && (
        <div className="flex flex-col items-center justify-center gap-4 px-6 pt-16">
          <Wallet size={40} style={{ color: "rgba(201,168,76,0.25)" }} />
          <div className="text-center">
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", marginBottom: 8 }}>
              Мультичейн доступен только для OKO-кошельков
            </div>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", maxWidth: 240 }}>
              Для Phantom-кошелька используйте приложение Phantom для управления другими сетями
            </div>
          </div>
        </div>
      )}

      {/* Password gate */}
      {isGenerated && !mnemonic && (
        <PasswordGate address={address ?? ""} onUnlock={handleUnlock} />
      )}

      {/* Deriving... */}
      {isGenerated && mnemonic && deriving && (
        <div className="flex flex-col items-center justify-center gap-4 pt-16">
          <Loader2 size={32} style={{ color: "#C9A84C" }} className="animate-spin" />
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px" }}>
            Деривация адресов…
          </div>
        </div>
      )}

      {/* Chains */}
      {isGenerated && mnemonic && !deriving && evmAddress && (
        <div className="px-4 pt-5 space-y-3 max-w-lg mx-auto">

          {/* EVM note */}
          <div className="px-4 py-2.5 rounded-xl flex items-center gap-2"
            style={{ background: "rgba(98,126,234,0.06)", border: "1px solid rgba(98,126,234,0.18)" }}>
            <Shield size={12} style={{ color: "#627EEA" }} />
            <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}>
              ETH · BNB Chain · Base · Arbitrum · Polygon — один адрес для всех EVM сетей
            </span>
          </div>

          {CHAINS.map((chain) => (
            <ChainRow
              key={chain.id}
              chain={chain}
              evmAddress={evmAddress}
              tronAddress={tronAddress}
              prices={prices}
            />
          ))}

          {/* Note about USDS / wETH */}
          <div className="px-4 py-3 rounded-2xl mt-2"
            style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", lineHeight: 1.6 }}>
              💡 Для покупки ETH-мемкоинов пополните ваш Ethereum адрес через раздел Bridge.
              Для торговли wETH / USDS на Solana используйте вкладку Markets.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
