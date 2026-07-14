import { TrendingUp, TrendingDown, Activity, DollarSign } from "lucide-react";

const metrics = [
  { label: "Total Volume",   value: "$4.2B",  change: "+12.4%", up: true,  icon: <DollarSign size={12} /> },
  { label: "Active Traders", value: "284K",   change: "+5.8%",  up: true,  icon: <Activity   size={12} /> },
  { label: "Win Rate",       value: "72.3%",  change: "+1.2%",  up: true,  icon: <TrendingUp  size={12} /> },
  { label: "Avg Return",     value: "34.7%",  change: "-0.4%",  up: false, icon: <TrendingDown size={12} /> },
];

export default function MetricsBar() {
  return (
    <section className="px-4 pb-4 max-w-lg mx-auto">
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m, i) => (
          <div
            key={i}
            className="metric-card p-3 rounded-2xl"
            style={{
              background: "#111111",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <div
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(240,235,224,0.40)",
                }}
              >
                {m.icon}
              </div>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 600,
                  color: m.up ? "#C9A84C" : "#FF4D5E",
                  background: m.up ? "rgba(201,168,76,0.07)" : "rgba(255,77,94,0.07)",
                  padding: "1.5px 6px",
                  borderRadius: 5,
                  fontFamily: "'Space Grotesk', sans-serif",
                }}
              >
                {m.change}
              </span>
            </div>

            <div
              className="font-orbitron font-bold"
              style={{ color: "#F0EBE0", fontSize: "16px", letterSpacing: "0.01em", lineHeight: 1, marginBottom: 2 }}
            >
              {m.value}
            </div>

            <div style={{ color: "rgba(240,235,224,0.28)", fontSize: "9px", letterSpacing: "0.03em", marginBottom: 8 }}>
              {m.label}
            </div>

            <div className="h-px rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: m.up ? "70%" : "42%",
                  background: m.up ? "#C9A84C" : "#FF4D5E",
                  opacity: 0.5,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
