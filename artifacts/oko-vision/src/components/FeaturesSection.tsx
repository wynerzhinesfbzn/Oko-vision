import { Shield, Zap, Globe, BarChart2, Lock, Eye } from "lucide-react";

const features = [
  {
    icon: <Eye size={14} />,
    title: "OKO Intelligence",
    desc: "AI market scanning with real-time pattern recognition across 500+ instruments.",
  },
  {
    icon: <Shield size={14} />,
    title: "Fortress Security",
    desc: "Military-grade encryption. Funds protected 24/7 with multi-sig vaults.",
  },
  {
    icon: <Zap size={14} />,
    title: "Ultra-Low Latency",
    desc: "Execute trades in under 0.3ms via co-located servers across 12 global hubs.",
  },
  {
    icon: <Globe size={14} />,
    title: "Global Markets",
    desc: "Access 10,000+ assets across Crypto, Forex, Commodities and Indices.",
  },
  {
    icon: <BarChart2 size={14} />,
    title: "Pro Analytics",
    desc: "Advanced charting, sentiment analysis, institutional-grade data.",
  },
  {
    icon: <Lock size={14} />,
    title: "Trust Protocol",
    desc: "Fully regulated. Licensed in 28 countries. Trust is our foundation.",
  },
];

export default function FeaturesSection() {
  return (
    <section className="px-4 pb-6 max-w-lg mx-auto">
      {/* Section label */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-3 h-px" style={{ background: "rgba(255,255,255,0.14)" }} />
        <span style={{
          fontFamily:    "'Space Grotesk', sans-serif",
          fontSize:      "8.5px",
          fontWeight:    600,
          letterSpacing: "0.18em",
          color:         "rgba(240,235,224,0.24)",
          textTransform: "uppercase",
        }}>
          Core Features
        </span>
        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {features.map((f, i) => (
          <div
            key={i}
            className="feature-card flex flex-col gap-2 p-3 rounded-2xl"
            style={{
              background: "#111111",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <div
              className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: "rgba(255,255,255,0.04)",
                border:     "1px solid rgba(255,255,255,0.07)",
                color:      "rgba(240,235,224,0.40)",
              }}
            >
              {f.icon}
            </div>
            <div>
              <p style={{
                fontFamily:    "'Space Grotesk', sans-serif",
                fontSize:      "11px",
                fontWeight:    700,
                color:         "rgba(240,235,224,0.80)",
                marginBottom:  3,
                lineHeight:    1.2,
              }}>
                {f.title}
              </p>
              <p style={{
                fontSize:   "9.5px",
                lineHeight: 1.45,
                color:      "rgba(240,235,224,0.24)",
                fontFamily: "'Inter', sans-serif",
              }}>
                {f.desc}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
