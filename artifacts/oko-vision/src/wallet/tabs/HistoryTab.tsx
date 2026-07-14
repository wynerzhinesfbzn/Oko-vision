import { useTrading } from "@/context/TradingContext";
import { motion } from "framer-motion";

const GREEN = "#00c853";
const RED   = "#ff1744";
const BLUE  = "#2962ff";

export default function HistoryTab() {
  const { tradeHistory } = useTrading();

  return (
    <div style={{ padding: "20px 16px 32px" }}>
      <div style={{ marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>История</div>
          <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>Все сделки и транзакции</div>
        </div>
        {tradeHistory.length > 0 && (
          <div style={{
            fontSize: 11, color: "#555",
            background: "#111", borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.05)",
            padding: "4px 10px",
          }}>
            {tradeHistory.length} записей
          </div>
        )}
      </div>

      {tradeHistory.length === 0 ? (
        <div style={{
          background: "#111", borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "48px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: "#888", marginBottom: 6 }}>
            Нет истории
          </div>
          <div style={{ fontSize: 13, color: "#444" }}>
            Сделки появятся здесь после первого обмена
          </div>
        </div>
      ) : (
        <div style={{
          background: "#111", borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}>
          {(tradeHistory as any[]).map((trade, i) => {
            const pnl = trade.pnlUsd ?? trade.pnl ?? 0;
            const pos = pnl >= 0;
            const date = trade.timestamp
              ? new Date(trade.timestamp).toLocaleString("ru-RU", {
                  day: "2-digit", month: "2-digit",
                  hour: "2-digit", minute: "2-digit",
                })
              : "—";

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 16px",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {/* icon */}
                  <div style={{
                    width: 36, height: 36, borderRadius: "50%",
                    background: pos ? "rgba(0,200,83,0.12)" : "rgba(255,23,68,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, flexShrink: 0,
                  }}>
                    {pos ? "▲" : "▼"}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>
                      {trade.symbol ?? trade.mint?.slice(0, 8) ?? "Unknown"}
                    </div>
                    <div style={{ fontSize: 11, color: "#555", lineHeight: 1.2, marginTop: 2 }}>
                      {trade.side ?? trade.type ?? "Trade"} · {date}
                    </div>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: pos ? GREEN : RED }}>
                    {pos ? "+" : ""}{pnl.toFixed(2)}
                  </div>
                  {trade.usdValue != null && (
                    <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>
                      ${Number(trade.usdValue).toFixed(2)}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
