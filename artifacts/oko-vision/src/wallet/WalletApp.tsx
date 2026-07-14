import { useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOkoWallet } from "@/context/WalletContext";
import ConnectScreen from "@/wallet/ConnectScreen";
import HomeTab    from "@/wallet/tabs/HomeTab";
import SwapTab    from "@/wallet/tabs/SwapTab";
import MoveTab    from "@/wallet/tabs/MoveTab";
import HistoryTab from "@/wallet/tabs/HistoryTab";
import SettingsTab from "@/wallet/tabs/SettingsTab";

/* ── tab config ─────────────────────────────────────────────── */
const TABS = [
  { id: "home",     label: "Главная",  emoji: "◎" },
  { id: "swap",     label: "Обмен",    emoji: "⇄" },
  { id: "move",     label: "Перевод",  emoji: "↗" },
  { id: "history",  label: "История",  emoji: "≡" },
  { id: "settings", label: "Профиль",  emoji: "⊙" },
] as const;

type TabId = typeof TABS[number]["id"];

const TAB_MAP: Record<TabId, React.ReactElement> = {
  home:     <HomeTab />,
  swap:     <SwapTab />,
  move:     <MoveTab />,
  history:  <HistoryTab />,
  settings: <SettingsTab />,
};

/* ── slide variants ─────────────────────────────────────────── */
function variants(dir: number) {
  return {
    enter:  { x: dir * 320, opacity: 0 },
    center: { x: 0,         opacity: 1 },
    exit:   { x: dir * -320, opacity: 0 },
  };
}

/* ── shell ──────────────────────────────────────────────────── */
export default function WalletApp() {
  const { connected } = useOkoWallet();
  const [active, setActive] = useState<TabId>("home");
  const prevIdx  = useRef(0);
  const activeIdx = TABS.findIndex(t => t.id === active);
  const dir = activeIdx > prevIdx.current ? 1 : -1;

  function goTo(id: TabId) {
    prevIdx.current = TABS.findIndex(t => t.id === active);
    setActive(id);
  }

  /* swipe gesture on content --------------------------------- */
  const dragStart = useRef(0);
  function onDragStart(_: any, info: any) { dragStart.current = info.point.x; }
  function onDragEnd(_: any, info: any) {
    const dx = info.offset.x;
    const vx = info.velocity.x;
    if (dx < -60 || vx < -400) {
      const next = TABS[Math.min(activeIdx + 1, TABS.length - 1)];
      if (next) goTo(next.id);
    } else if (dx > 60 || vx > 400) {
      const prev = TABS[Math.max(activeIdx - 1, 0)];
      if (prev) goTo(prev.id);
    }
  }

  if (!connected) return <ConnectScreen />;

  return (
    <div
      className="hofire-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: "#0a0a0a",
        color: "#fff",
        maxWidth: 480,
        margin: "0 auto",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── header ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: "linear-gradient(135deg,#ff6b35,#ff1744)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>🔥</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.01em", color: "#fff" }}>HoFire</div>
            <div style={{ fontSize: 10, color: "#555", letterSpacing: "0.12em", textTransform: "uppercase" }}>Wallet</div>
          </div>
        </div>
        <div style={{
          fontSize: 11, color: "#2962ff",
          background: "rgba(41,98,255,0.12)",
          border: "1px solid rgba(41,98,255,0.25)",
          borderRadius: 20, padding: "3px 10px",
          fontWeight: 600,
        }}>
          Robinhood Chain
        </div>
      </header>

      {/* ── tab content (swipeable) ── */}
      <div
        style={{ flex: 1, overflow: "hidden", position: "relative" }}
      >
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.div
            key={active}
            custom={dir}
            variants={{
              enter:  (d: number) => ({ x: d * 340, opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit:   (d: number) => ({ x: d * -340, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 380, damping: 36, mass: 0.8 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.15}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            style={{
              position: "absolute", inset: 0,
              overflowY: "auto", overflowX: "hidden",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {TAB_MAP[active]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── bottom nav ── */}
      <nav style={{
        display: "flex", justifyContent: "space-around",
        padding: "8px 0 max(8px, env(safe-area-inset-bottom))",
        borderTop: "1px solid rgba(255,255,255,0.05)",
        background: "rgba(10,10,10,0.96)",
        backdropFilter: "blur(20px)",
        flexShrink: 0,
      }}>
        {TABS.map((tab) => {
          const isActive = active === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => goTo(tab.id)}
              style={{
                display: "flex", flexDirection: "column",
                alignItems: "center", gap: 3,
                padding: "6px 16px",
                background: "none", border: "none", cursor: "pointer",
                color: isActive ? "#fff" : "#444",
                transition: "color 0.15s",
                position: "relative",
              }}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  style={{
                    position: "absolute", top: 0, left: "50%",
                    width: 32, height: 2, marginLeft: -16,
                    background: "#2962ff",
                    borderRadius: "0 0 4px 4px",
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.emoji}</span>
              <span style={{
                fontSize: 10, fontWeight: 500, letterSpacing: "0.03em",
                color: isActive ? "#fff" : "#444",
              }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
