import { useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOkoWallet } from "@/context/WalletContext";
import { ethers } from "ethers";

/* Lazily load the full wallet-select page for import flow */
const WalletSelect = lazy(() => import("@/pages/WalletSelect"));

export default function ConnectScreen() {
  const [showImport, setShowImport] = useState(false);

  if (showImport) {
    return (
      <Suspense fallback={<Loader />}>
        <WalletSelect />
      </Suspense>
    );
  }

  return (
    <div style={{
      minHeight: "100dvh", background: "#0a0a0a",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: 24, gap: 0,
    }}>
      {/* Logo */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 22 }}
        style={{ textAlign: "center", marginBottom: 48 }}
      >
        <div style={{
          width: 72, height: 72, borderRadius: 22,
          background: "linear-gradient(135deg,#ff6b35,#ff1744)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36, margin: "0 auto 16px",
          boxShadow: "0 0 40px rgba(255,100,0,0.3)",
        }}>🔥</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
          HoFire <span style={{ color: "#2962ff" }}>Wallet</span>
        </div>
        <div style={{ fontSize: 13, color: "#555", marginTop: 6, letterSpacing: "0.08em" }}>
          ROBINHOOD CHAIN · SOLANA
        </div>
      </motion.div>

      {/* Actions */}
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.35 }}
        style={{ width: "100%", maxWidth: 360, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <button
          onClick={() => setShowImport(true)}
          style={{
            width: "100%", padding: "16px 0",
            background: "#2962ff", border: "none", borderRadius: 16,
            color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer",
            letterSpacing: "0.01em",
            boxShadow: "0 4px 20px rgba(41,98,255,0.35)",
          }}
        >
          Создать / Подключить кошелёк
        </button>

        <div style={{
          textAlign: "center", fontSize: 12, color: "#444", padding: "8px 0",
        }}>
          🔒 Ключи хранятся только на вашем устройстве
        </div>
      </motion.div>

      {/* Features */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        style={{
          marginTop: 48, display: "flex", flexDirection: "column", gap: 14,
          width: "100%", maxWidth: 360,
        }}
      >
        {[
          { icon: "◎", label: "Solana — мгновенные транзакции" },
          { icon: "⇄", label: "DEX-обмен через Jupiter v6" },
          { icon: "🔗", label: "Мост LI.FI — 8+ сетей" },
        ].map(f => (
          <div key={f.label} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "12px 16px",
            background: "#111", borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.05)",
          }}>
            <span style={{ fontSize: 20 }}>{f.icon}</span>
            <span style={{ fontSize: 13, color: "#888" }}>{f.label}</span>
          </div>
        ))}
      </motion.div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{
      minHeight: "100dvh", background: "#0a0a0a",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: "50%",
        border: "2px solid rgba(41,98,255,0.15)",
        borderTopColor: "#2962ff",
        animation: "spin 0.7s linear infinite",
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
