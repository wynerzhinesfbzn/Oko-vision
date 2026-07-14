import { useState } from "react";
import { TrendingUp, TrendingDown, ChevronRight, Wallet, ExternalLink, Copy, Check, LogOut } from "lucide-react";
import { useOkoWallet } from "@/context/WalletContext";
import { useLocation } from "wouter";

const chartData = [42, 55, 48, 62, 71, 58, 80, 75, 88, 92, 85, 96, 89, 102, 98, 115];

const trades = [
  { pair: "BTC/USD", type: "BUY", pnl: "+$1,284", pct: "+3.2%", up: true, time: "2m ago" },
  { pair: "ETH/USD", type: "BUY", pnl: "+$342", pct: "+2.1%", up: true, time: "8m ago" },
  { pair: "XAU/USD", type: "SELL", pnl: "-$87", pct: "-0.8%", up: false, time: "14m ago" },
  { pair: "EUR/USD", type: "BUY", pnl: "+$214", pct: "+1.4%", up: true, time: "31m ago" },
];

function MiniChart({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 100;
  const h = 40;

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  const areaPoints = [
    `0,${h}`,
    ...data.map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    }),
    `${w},${h}`,
  ];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 48 }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={areaPoints.join(" ")}
        fill={`url(#grad-${color.replace("#", "")})`}
      />
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 3px ${color})` }}
      />
      <circle
        cx={(data.length - 1) / (data.length - 1) * w}
        cy={h - ((data[data.length - 1] - min) / range) * h}
        r="2.5"
        fill={color}
        style={{ filter: `drop-shadow(0 0 4px ${color})` }}
      />
    </svg>
  );
}

export default function DashboardPanel() {
  const [activeTab, setActiveTab] = useState<"portfolio" | "trades">("portfolio");
  const [copied, setCopied] = useState(false);
  const { connected, address, shortAddress, walletType, disconnectWallet } = useOkoWallet();
  const [, navigate] = useLocation();

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const solscanUrl = address ? `https://solscan.io/account/${address}` : "#";

  return (
    <section className="px-4 pb-6 max-w-lg mx-auto">
      {/* Section label */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-4 h-px" style={{ background: "rgba(201,168,76,0.4)" }} />
        <span
          className="font-orbitron text-xs tracking-widest uppercase"
          style={{ color: "rgba(201,168,76,0.5)", fontSize: "9px", letterSpacing: "0.15em" }}
        >
          Live Dashboard
        </span>
        <div className="flex-1 h-px" style={{ background: "rgba(201,168,76,0.08)" }} />
        <div className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#C9A84C", boxShadow: "0 0 6px #C9A84C" }} />
      </div>

      {/* Wallet connected card */}
      {connected && address ? (
        <div
          className="relative rounded-2xl p-4 mb-3 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(201,168,76,0.07) 0%, rgba(0,180,80,0.04) 100%)",
            border: "1px solid rgba(201,168,76,0.22)",
            boxShadow: "0 0 20px rgba(201,168,76,0.06)",
          }}
        >
          {/* Glow */}
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-15" style={{ background: "radial-gradient(circle, #C9A84C, transparent)" }} />

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.25)" }}>
                <Wallet size={16} style={{ color: "#C9A84C" }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#C9A84C", boxShadow: "0 0 5px #C9A84C" }} />
                  <span style={{ color: "#C9A84C", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.08em" }}>
                    WALLET CONNECTED
                  </span>
                </div>
                <p style={{ color: "rgba(255,255,255,0.55)", fontSize: "10px", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shortAddress}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopy}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.18)" }}
                title="Copy address"
              >
                {copied ? <Check size={12} style={{ color: "#C9A84C" }} /> : <Copy size={12} style={{ color: "rgba(201,168,76,0.6)" }} />}
              </button>
              <a
                href={solscanUrl}
                target="_blank"
                rel="noreferrer"
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.18)" }}
                title="View on Solscan"
              >
                <ExternalLink size={12} style={{ color: "rgba(201,168,76,0.6)" }} />
              </a>
              <button
                onClick={() => { disconnectWallet(); navigate("/wallet"); }}
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(255,82,82,0.07)", border: "1px solid rgba(255,82,82,0.18)" }}
                title="Disconnect"
              >
                <LogOut size={12} style={{ color: "rgba(255,82,82,0.55)" }} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => navigate("/wallet")}
          className="flex items-center gap-3 w-full rounded-2xl p-4 mb-3 text-left"
          style={{
            background: "rgba(201,168,76,0.03)",
            border: "1px dashed rgba(201,168,76,0.15)",
            transition: "all 0.2s ease",
          }}
        >
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.12)" }}>
            <Wallet size={16} style={{ color: "rgba(201,168,76,0.4)" }} />
          </div>
          <div>
            <p style={{ color: "rgba(201,168,76,0.6)", fontSize: "11px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.06em" }}>
              CONNECT WALLET
            </p>
            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>
              Create or connect a Solana wallet
            </p>
          </div>
          <ChevronRight size={14} style={{ color: "rgba(201,168,76,0.25)", marginLeft: "auto" }} />
        </button>
      )}

      {/* Portfolio value card */}
      <div
        className="glass-card p-4 mb-3 relative overflow-hidden"
        style={{ borderColor: "rgba(255,255,255,0.08)", background: "#111111" }}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <p style={{ color: "rgba(240,235,224,0.28)", fontSize: "9px", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif", marginBottom: 4 }}>
              Portfolio Value
            </p>
            <div className="font-orbitron font-bold" style={{ color: "#F0EBE0", fontSize: "24px", lineHeight: 1 }}>
              $284,391
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <TrendingUp size={10} style={{ color: "#C9A84C" }} />
              <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 600 }}>+$12,847</span>
              <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}>(+4.73%)</span>
            </div>
          </div>
          <div
            style={{
              background: "rgba(201,168,76,0.07)",
              border: "1px solid rgba(201,168,76,0.18)",
              color: "#C9A84C",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "8px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              padding: "3px 8px",
              borderRadius: 6,
            }}
          >
            LIVE
          </div>
        </div>

        {/* Chart */}
        <MiniChart data={chartData} color="#C9A84C" />

        {/* Time axis */}
        <div className="flex justify-between mt-1">
          {["7d", "", "", "", "", "", "1d", "", "Now"].map((t, i) => (
            <span key={i} style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", fontFamily: "monospace" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 mb-3 p-1 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        {(["portfolio", "trades"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-lg transition-all"
            style={{
              background: activeTab === tab ? "rgba(201,168,76,0.1)" : "transparent",
              border: activeTab === tab ? "1px solid rgba(201,168,76,0.2)" : "1px solid transparent",
              color: activeTab === tab ? "#C9A84C" : "rgba(255,255,255,0.35)",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "9px",
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === "trades" ? (
        <div className="flex flex-col gap-2">
          {trades.map((trade, i) => (
            <div
              key={i}
              className="glass-card p-3.5 flex items-center justify-between"
              style={{ borderColor: trade.up ? "rgba(201,168,76,0.08)" : "rgba(255,68,102,0.08)" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: trade.up ? "rgba(201,168,76,0.08)" : "rgba(255,68,102,0.08)",
                    border: `1px solid ${trade.up ? "rgba(201,168,76,0.2)" : "rgba(255,68,102,0.2)"}`,
                  }}
                >
                  {trade.up ? (
                    <TrendingUp size={12} style={{ color: "#C9A84C" }} />
                  ) : (
                    <TrendingDown size={12} style={{ color: "#ff4466" }} />
                  )}
                </div>
                <div>
                  <div className="font-orbitron text-xs font-bold" style={{ color: "rgba(255,255,255,0.8)", fontSize: "11px" }}>
                    {trade.pair}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className="px-1.5 py-0.5 rounded text-xs"
                      style={{
                        background: trade.type === "BUY" ? "rgba(201,168,76,0.08)" : "rgba(255,68,102,0.08)",
                        color: trade.type === "BUY" ? "#C9A84C" : "#ff4466",
                        fontSize: "8px",
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        fontFamily: "'Space Grotesk', sans-serif",
                      }}
                    >
                      {trade.type}
                    </span>
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px" }}>{trade.time}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div
                  className="font-orbitron text-sm font-bold"
                  style={{ color: trade.up ? "#C9A84C" : "#ff4466", fontSize: "12px" }}
                >
                  {trade.pnl}
                </div>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>{trade.pct}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {[
            { label: "Crypto",      value: "$142,800", pct: "50.2%", color: "#C9A84C" },
            { label: "Forex",       value: "$78,400",  pct: "27.6%", color: "rgba(240,235,224,0.65)" },
            { label: "Commodities", value: "$41,200",  pct: "14.5%", color: "rgba(240,235,224,0.40)" },
            { label: "Indices",     value: "$21,991",  pct: "7.7%",  color: "rgba(240,235,224,0.22)" },
          ].map((item, i) => (
            <div key={i} className="glass-card p-3.5 flex items-center justify-between" style={{ borderColor: `${item.color}15` }}>
              <div className="flex items-center gap-3 flex-1">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color, boxShadow: `0 0 8px ${item.color}` }} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: 500 }}>{item.label}</span>
                    <span className="font-orbitron" style={{ color: item.color, fontSize: "11px", fontWeight: 600 }}>{item.value}</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: item.pct,
                        background: `linear-gradient(90deg, ${item.color}, ${item.color}88)`,
                        boxShadow: `0 0 8px ${item.color}60`,
                      }}
                    />
                  </div>
                </div>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", marginLeft: "8px" }}>{item.pct}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* View all */}
      <button
        className="w-full mt-3 py-3 rounded-xl flex items-center justify-center gap-2 transition-all"
        style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.3)",
          fontSize: "10px",
          fontFamily: "'Space Grotesk', sans-serif",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        View Full Report
        <ChevronRight size={12} />
      </button>
    </section>
  );
}
