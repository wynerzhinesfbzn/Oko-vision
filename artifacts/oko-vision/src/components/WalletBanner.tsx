import { useState, useEffect } from "react";
import { Wallet, X, Copy, Check, ChevronRight } from "lucide-react";
import { useOkoWallet } from "@/context/WalletContext";
import { useLocation } from "wouter";

export default function WalletBanner() {
  const { connected, shortAddress, address } = useOkoWallet();
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [visible, setVisible]     = useState(false);
  const [, navigate]              = useLocation();

  useEffect(() => {
    if (connected && !dismissed) setTimeout(() => setVisible(true), 100);
    else setVisible(false);
  }, [connected, dismissed]);

  useEffect(() => { setDismissed(false); }, [address]);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!connected || dismissed) return null;

  return (
    <div style={{
      transform: visible ? "translateY(0)" : "translateY(-100%)",
      opacity: visible ? 1 : 0,
      transition: "all 0.35s cubic-bezier(0.34,1.56,0.64,1)",
      background: "#111111",
      borderBottom: "1px solid rgba(201,168,76,0.15)",
    }}>
      <div className="flex items-center gap-3 px-4 py-2.5 max-w-lg mx-auto">
        {/* Icon */}
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.18)" }}>
          <Wallet size={13} style={{ color: "#C9A84C" }} />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full shrink-0 pulse-dot"
              style={{ background: "#C9A84C" }} />
            <span style={{
              color: "#C9A84C",
              fontSize: "9px",
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 700,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}>
              Кошелёк подключён
            </span>
          </div>
          <button onClick={handleCopy} className="flex items-center gap-1 mt-0.5">
            <span style={{ color: "rgba(240,235,224,0.40)", fontSize: "10px", fontFamily: "monospace" }}>
              {shortAddress}
            </span>
            {copied
              ? <Check size={10} style={{ color: "#C9A84C" }} />
              : <Copy size={10} style={{ color: "rgba(240,235,224,0.20)" }} />}
          </button>
        </div>

        {/* Action */}
        <button onClick={() => navigate("/wallet")}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg shrink-0"
          style={{
            background: "rgba(240,235,224,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "rgba(240,235,224,0.60)",
            fontSize: "9px",
            fontFamily: "'Space Grotesk', sans-serif",
            fontWeight: 700,
            letterSpacing: "0.06em",
          }}>
          Детали
          <ChevronRight size={10} />
        </button>

        {/* Dismiss */}
        <button
          onClick={() => { setVisible(false); setTimeout(() => setDismissed(true), 350); }}
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <X size={11} style={{ color: "rgba(240,235,224,0.25)" }} />
        </button>
      </div>
    </div>
  );
}
