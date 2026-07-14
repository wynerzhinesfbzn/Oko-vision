import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance }   from "@/context/BalanceContext";

const BLUE  = "#2962ff";
const GREEN = "#00c853";
const RED   = "#ff1744";

type Panel = "send" | "receive";

export default function MoveTab() {
  const [panel, setPanel] = useState<Panel>("send");
  const [copied, setCopied] = useState(false);
  const { address, shortAddress, connected } = useOkoWallet();
  const { solBalance } = useBalance();

  /* send state */
  const [to,      setTo]      = useState("");
  const [amount,  setAmount]  = useState("");
  const [status,  setStatus]  = useState<"idle"|"sending"|"done"|"error">("idle");
  const [txHash,  setTxHash]  = useState("");
  const [errMsg,  setErrMsg]  = useState("");

  const copyAddress = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!to.trim() || !amount || +amount <= 0) return;
    setStatus("sending"); setErrMsg("");
    /* Simulate: in real flow you'd sign with the stored keypair */
    await new Promise(r => setTimeout(r, 1200));
    setStatus("done");
    setTxHash("simulated_tx_" + Date.now());
  };

  return (
    <div style={{ padding: "20px 16px 32px" }}>

      {/* title */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Перевод</div>
        <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>Отправить или принять</div>
      </div>

      {/* panel switcher */}
      <div style={{
        display: "flex", gap: 4, padding: 4,
        background: "#111", borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.06)",
        marginBottom: 20,
      }}>
        {(["send","receive"] as Panel[]).map(p => (
          <button
            key={p}
            onClick={() => { setPanel(p); setStatus("idle"); setTxHash(""); }}
            style={{
              flex: 1, padding: "11px 0",
              background: panel === p ? BLUE : "none",
              border: "none", borderRadius: 12,
              color: panel === p ? "#fff" : "#555",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              transition: "background 0.15s, color 0.15s",
              boxShadow: panel === p ? `0 2px 12px rgba(41,98,255,0.3)` : "none",
            }}
          >
            {p === "send" ? "↑ Отправить" : "↓ Принять"}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {panel === "send" ? (
          <motion.div key="send"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.18 }}
          >
            {status === "done" ? (
              <div style={{
                background: "#111", borderRadius: 20,
                border: "1px solid rgba(0,200,83,0.2)",
                padding: 28, textAlign: "center",
              }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
                  Отправлено!
                </div>
                <div style={{ fontSize: 12, color: "#444", fontFamily: "monospace", wordBreak: "break-all" }}>
                  {txHash}
                </div>
                <button
                  onClick={() => { setStatus("idle"); setTo(""); setAmount(""); setTxHash(""); }}
                  style={{
                    marginTop: 20, padding: "12px 28px",
                    background: BLUE, border: "none", borderRadius: 12,
                    color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  Ещё перевод
                </button>
              </div>
            ) : (
              <div style={{
                background: "#111", borderRadius: 20,
                border: "1px solid rgba(255,255,255,0.06)",
                padding: 20, display: "flex", flexDirection: "column", gap: 14,
              }}>
                {/* Available */}
                <div style={{
                  display: "flex", justifyContent: "space-between",
                  fontSize: 12, color: "#555",
                }}>
                  <span>Доступно</span>
                  <span style={{ color: "#888" }}>{solBalance.toFixed(4)} SOL</span>
                </div>

                {/* To address */}
                <div>
                  <label style={{ fontSize: 11, color: "#555", marginBottom: 6, display: "block" }}>
                    Адрес получателя
                  </label>
                  <input
                    value={to}
                    onChange={e => setTo(e.target.value)}
                    placeholder="Solana адрес..."
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: "#1a1a1a",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12, padding: "13px 14px",
                      color: "#fff", fontSize: 13, fontFamily: "monospace",
                      outline: "none",
                    }}
                  />
                </div>

                {/* Amount */}
                <div>
                  <label style={{ fontSize: 11, color: "#555", marginBottom: 6, display: "block" }}>
                    Сумма (SOL)
                  </label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="number"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      placeholder="0.00"
                      style={{
                        width: "100%", boxSizing: "border-box",
                        background: "#1a1a1a",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: 12, padding: "13px 60px 13px 14px",
                        color: "#fff", fontSize: 20, fontWeight: 300,
                        outline: "none",
                      }}
                    />
                    <button
                      onClick={() => setAmount(String(Math.max(0, solBalance - 0.001).toFixed(4)))}
                      style={{
                        position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
                        background: "rgba(41,98,255,0.15)", border: "none", borderRadius: 8,
                        color: BLUE, fontSize: 11, fontWeight: 700, padding: "4px 8px",
                        cursor: "pointer",
                      }}
                    >
                      MAX
                    </button>
                  </div>
                </div>

                {errMsg && (
                  <div style={{ fontSize: 13, color: RED }}>{errMsg}</div>
                )}

                <button
                  onClick={handleSend}
                  disabled={status === "sending" || !to.trim() || !amount || !connected}
                  style={{
                    width: "100%", padding: "16px 0",
                    background: (!to || !amount || status === "sending") ? "#1a1a1a" : BLUE,
                    border: "none", borderRadius: 14,
                    color: (!to || !amount || status === "sending") ? "#333" : "#fff",
                    fontSize: 15, fontWeight: 700, cursor: "pointer",
                    boxShadow: (to && amount) ? `0 4px 16px rgba(41,98,255,0.3)` : "none",
                    transition: "all 0.2s",
                  }}
                >
                  {status === "sending" ? "Отправка…" : !connected ? "Подключите кошелёк" : "Отправить SOL"}
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div key="receive"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
          >
            <div style={{
              background: "#111", borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.06)",
              padding: 24, display: "flex", flexDirection: "column",
              alignItems: "center", gap: 20,
            }}>
              {/* QR placeholder */}
              <div style={{
                width: 160, height: 160,
                background: "#fff", borderRadius: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexDirection: "column", gap: 6,
              }}>
                <div style={{ fontSize: 48 }}>◎</div>
                <div style={{ fontSize: 9, color: "#333", fontFamily: "monospace", textAlign: "center", padding: "0 8px" }}>
                  {address?.slice(0, 16)}…
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, color: "#555", textAlign: "center", marginBottom: 8 }}>
                  Ваш Solana-адрес
                </div>
                <div style={{
                  background: "#1a1a1a", borderRadius: 12, padding: "12px 16px",
                  fontSize: 12, fontFamily: "monospace", color: "#888",
                  wordBreak: "break-all", textAlign: "center", lineHeight: 1.6,
                }}>
                  {address ?? "Нет адреса"}
                </div>
              </div>

              <button
                onClick={copyAddress}
                style={{
                  width: "100%", padding: "14px 0",
                  background: copied ? "rgba(0,200,83,0.12)" : "rgba(41,98,255,0.12)",
                  border: `1px solid ${copied ? "rgba(0,200,83,0.25)" : "rgba(41,98,255,0.25)"}`,
                  borderRadius: 14,
                  color: copied ? GREEN : BLUE,
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                {copied ? "✓ Скопировано!" : "Скопировать адрес"}
              </button>

              <div style={{ fontSize: 11, color: "#444", textAlign: "center", lineHeight: 1.6 }}>
                Принимайте SOL и SPL-токены<br />
                только в сети Solana
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
