import { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { X, ExternalLink, AlertCircle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const WALLET_ICONS: Record<string, string> = {
  Phantom:
    "https://raw.githubusercontent.com/phantom-labs/phantom-wallet/main/src/assets/img/phantom-icon.png",
  Solflare:
    "https://raw.githubusercontent.com/solflare-wallet/solflare-react/master/assets/icon.png",
  Torus:
    "https://app.tor.us/v1.18.5/img/icons/favicon-16x16.png",
  Ledger:
    "https://cdn.worldvectorlogo.com/logos/ledger-2.svg",
};

const WALLET_COLORS: Record<string, string> = {
  Phantom: "#ab9ff2",
  Solflare: "#fc8f28",
  Torus: "#0364ff",
  Ledger: "#ffffff",
};

const WALLET_DESCRIPTIONS: Record<string, string> = {
  Phantom: "Most popular Solana wallet",
  Solflare: "Feature-rich Solana wallet",
  Torus: "Social login wallet",
  Ledger: "Hardware wallet (secure key)",
};

export default function WalletPickerModal({ open, onClose }: Props) {
  const { wallets, select, connect, connecting, wallet: selectedWallet } = useWallet();
  const [visible, setVisible] = useState(false);
  const [connectingName, setConnectingName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => setVisible(true), 30);
      setError(null);
      setConnectingName(null);
    } else {
      setVisible(false);
    }
  }, [open]);

  // Sort: installed first, then detected, then loadable
  const sorted = [...wallets].sort((a, b) => {
    const order = [WalletReadyState.Installed, WalletReadyState.Loadable, WalletReadyState.NotDetected];
    return order.indexOf(a.readyState) - order.indexOf(b.readyState);
  });

  const handleSelect = async (walletName: string) => {
    setError(null);
    setConnectingName(walletName);
    try {
      select(walletName as any);
      // Small delay so select() updates state before connect()
      await new Promise((r) => setTimeout(r, 80));
      await connect();
      onClose();
    } catch (err: any) {
      console.error("Wallet connect error:", err);
      if (err?.name === "WalletNotReadyError") {
        setError(`${walletName} extension not found. Please install it first.`);
      } else if (err?.name === "WalletConnectionError") {
        setError("Connection rejected. Please try again.");
      } else {
        setError(err?.message || "Connection failed. Please try again.");
      }
    } finally {
      setConnectingName(null);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(8,8,8,0.80)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.25s ease",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0D120D 0%, #080808 100%)",
          border: "1px solid rgba(201,168,76,0.16)",
          boxShadow: "0 0 60px rgba(201,168,76,0.10), 0 -8px 60px rgba(0,0,0,0.6)",
          transform: visible ? "translateY(0)" : "translateY(20px)",
          transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        {/* Handle bar (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-4">
          <div>
            <h3
              className="font-orbitron font-bold"
              style={{
                fontSize: "14px",
                color: "#C9A84C",
                textShadow: "0 0 12px rgba(201,168,76,0.6)",
                letterSpacing: "0.06em",
              }}
            >
              SELECT WALLET
            </h3>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginTop: "2px" }}>
              Choose your Solana wallet to connect
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
          >
            <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div
            className="mx-4 mb-3 px-3 py-2.5 rounded-xl flex items-start gap-2"
            style={{ background: "rgba(255,60,60,0.10)", border: "1px solid rgba(255,60,60,0.25)" }}
          >
            <AlertCircle size={14} style={{ color: "#ff6060", marginTop: "1px", flexShrink: 0 }} />
            <span style={{ color: "rgba(255,150,150,0.9)", fontSize: "12px", lineHeight: 1.5 }}>{error}</span>
          </div>
        )}

        {/* Wallet list */}
        <div className="px-4 pb-5 flex flex-col gap-2">
          {sorted.map((adapter) => {
            const isInstalled = adapter.readyState === WalletReadyState.Installed;
            const isLoadable = adapter.readyState === WalletReadyState.Loadable;
            const isLoading = connectingName === adapter.adapter.name;
            const color = WALLET_COLORS[adapter.adapter.name] || "#C9A84C";
            const desc = WALLET_DESCRIPTIONS[adapter.adapter.name] || "Solana wallet";

            return (
              <button
                key={adapter.adapter.name}
                onClick={() => handleSelect(adapter.adapter.name)}
                disabled={!!connectingName}
                className="flex items-center gap-3 p-3.5 rounded-2xl text-left w-full"
                style={{
                  background: isInstalled
                    ? `${color}09`
                    : "rgba(255,255,255,0.025)",
                  border: isInstalled
                    ? `1px solid ${color}28`
                    : "1px solid rgba(255,255,255,0.07)",
                  opacity: connectingName && !isLoading ? 0.45 : 1,
                  transition: "all 0.2s ease",
                  cursor: connectingName ? "not-allowed" : "pointer",
                }}
              >
                {/* Icon */}
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                  style={{
                    background: `${color}12`,
                    border: `1px solid ${color}20`,
                    boxShadow: isInstalled ? `0 0 16px ${color}18` : "none",
                  }}
                >
                  {adapter.adapter.icon ? (
                    <img
                      src={adapter.adapter.icon}
                      alt={adapter.adapter.name}
                      className="w-7 h-7 object-contain"
                    />
                  ) : (
                    <span style={{ color, fontSize: "18px", fontWeight: "bold" }}>
                      {adapter.adapter.name[0]}
                    </span>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      style={{
                        color: isInstalled ? color : "rgba(255,255,255,0.65)",
                        fontWeight: 600,
                        fontSize: "14px",
                      }}
                    >
                      {adapter.adapter.name}
                    </span>
                    {isInstalled && (
                      <span
                        className="px-1.5 py-0.5 rounded text-center"
                        style={{
                          background: `${color}18`,
                          border: `1px solid ${color}30`,
                          color,
                          fontSize: "8px",
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                        }}
                      >
                        Detected
                      </span>
                    )}
                    {!isInstalled && !isLoadable && (
                      <a
                        href={adapter.adapter.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-0.5"
                        style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}
                      >
                        Install <ExternalLink size={9} />
                      </a>
                    )}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginTop: "2px" }}>
                    {desc}
                  </div>
                </div>

                {/* Right side */}
                <div className="shrink-0">
                  {isLoading ? (
                    <div
                      className="w-5 h-5 rounded-full border-2 animate-spin"
                      style={{ borderColor: `${color}40`, borderTopColor: color }}
                    />
                  ) : (
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{
                        background: isInstalled ? `${color}15` : "rgba(255,255,255,0.04)",
                        border: `1px solid ${isInstalled ? color + "35" : "rgba(255,255,255,0.10)"}`,
                      }}
                    >
                      <span style={{ color: isInstalled ? color : "rgba(255,255,255,0.2)", fontSize: "12px" }}>
                        →
                      </span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer note */}
        <div className="px-5 pb-5 text-center">
          <p style={{ color: "rgba(255,255,255,0.18)", fontSize: "10px", lineHeight: 1.6 }}>
            Don't have a wallet? Use <span style={{ color: "rgba(201,168,76,0.5)" }}>Create New Wallet</span> above to get one instantly.
          </p>
        </div>
      </div>
    </div>
  );
}
