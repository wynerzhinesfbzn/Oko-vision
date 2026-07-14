import { useState, useEffect } from "react";
import {
  Menu, X, Bell, BellOff, Home, Wallet, Grid3X3, Zap,
  Gift, ArrowDownUp, LineChart, Radio, BarChart3,
  Settings, LogOut, ChevronRight, Shield, Users,
} from "lucide-react";
import { useLocation } from "wouter";
import { useOkoWallet } from "@/context/WalletContext";
import { useTrading } from "@/context/TradingContext";
import VoiceCommands from "@/components/VoiceCommands";
import ThemeSwitcher from "@/components/ThemeSwitcher";

// ── Nav config ────────────────────────────────────────────────────────────────

interface NavItem {
  label:    string;
  sublabel: string;
  path:     string | null;
  icon:     React.ReactNode;
  badge?:   string;
  badgeColor?: string;
  danger?:  boolean;
  action?:  () => void;
}

// ── Notification Bell ─────────────────────────────────────────────────────────

function NotificationBell() {
  const [perm, setPerm] = useState<NotificationPermission>("default");

  useEffect(() => {
    if ("Notification" in window) setPerm(Notification.permission);
  }, []);

  const request = async () => {
    if (!("Notification" in window)) return;
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result === "granted") {
      const reg = await navigator.serviceWorker?.getRegistration();
      reg?.active?.postMessage({
        type: "SHOW_NOTIFICATION",
        title: "OKO Vision 🚀",
        body: "Уведомления включены!",
        tag: "oko-welcome",
        url: "/",
      });
    }
  };

  const granted = perm === "granted";
  const denied  = perm === "denied";

  return (
    <button onClick={denied ? undefined : request}
      className="relative w-8 h-8 rounded-lg flex items-center justify-center"
      style={{
        background: granted ? "rgba(201,168,76,0.08)" : "rgba(201,168,76,0.06)",
        border: granted ? "1px solid rgba(201,168,76,0.22)" : "1px solid rgba(201,168,76,0.12)",
        cursor: denied ? "not-allowed" : "pointer",
        opacity: denied ? 0.5 : 1,
      }}>
      {denied
        ? <BellOff size={13} style={{ color: "rgba(255,82,82,0.6)" }} />
        : <Bell size={14} style={{ color: granted ? "#C9A84C" : "rgba(201,168,76,0.7)" }} />
      }
      {!granted && !denied && (
        <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
          style={{ background: "#ffcc00", boxShadow: "0 0 4px #ffcc00" }} />
      )}
    </button>
  );
}

// ── Full-screen Slide Menu ────────────────────────────────────────────────────

interface SlideMenuProps {
  open: boolean;
  onClose: () => void;
  onNav: (path: string | null, action?: () => void) => void;
  location: string;
}

function SlideMenu({ open, onClose, onNav, location }: SlideMenuProps) {
  const { connected, shortAddress, address, disconnectWallet } = useOkoWallet();
  const { autoTrading, totalUsd, totalPnlUsd, totalPnlPct } = useTrading();

  // Lock body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const NAV_MAIN: NavItem[] = [
    {
      label: "Главная", sublabel: "Dashboard",
      path: "/", icon: <Home size={18} />,
    },
    {
      label: "Сигналы", sublabel: "Рынки и токены",
      path: "/markets", icon: <Radio size={18} />,
      badge: "LIVE", badgeColor: "#C9A84C",
    },
    {
      label: "Портфель", sublabel: "Позиции и P&L",
      path: "/portfolio", icon: <Grid3X3 size={18} />,
    },
    {
      label: "Рефералы", sublabel: "Зарабатывай с друзьями",
      path: "/referral", icon: <Gift size={18} />,
    },
    {
      label: "Analytics", sublabel: "Бэктест стратегий",
      path: "/backtesting", icon: <BarChart3 size={18} />,
      badge: "NEW", badgeColor: "#ffab00",
    },
  ];

  const NAV_SECONDARY: NavItem[] = [
    {
      label: "🔥 RH Chain Wallet", sublabel: "EVM-кошелёк · Robinhood Chain",
      path: "/robinhood", icon: <span style={{ fontSize: 18 }}>🔥</span>,
      badge: "REAL", badgeColor: "#00c853",
    },
    {
      label: "Настройки", sublabel: "Кошелёк и параметры",
      path: "/wallet", icon: <Settings size={18} />,
    },
    {
      label: "Leaderboard", sublabel: "Копи-трейдинг",
      path: "/leaderboard", icon: <Users size={18} />,
    },
    {
      label: "Bridge", sublabel: "Мост между сетями",
      path: "/bridge", icon: <ArrowDownUp size={18} />,
    },
  ];

  const NAV_DANGER: NavItem[] = [
    {
      label: "Выход", sublabel: "Отключить кошелёк",
      path: null, icon: <LogOut size={18} />,
      danger: true,
      action: () => { disconnectWallet?.(); onClose(); },
    },
  ];

  const pnlPos = totalPnlUsd >= 0;

  const renderItem = (item: NavItem) => {
    const active = item.path && location === item.path;
    return (
      <button
        key={item.label}
        onClick={() => item.action ? item.action() : onNav(item.path)}
        className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-left transition-all"
        style={{
          background: active
            ? "rgba(201,168,76,0.08)"
            : item.danger
            ? "rgba(255,82,82,0.04)"
            : "rgba(255,255,255,0.025)",
          border: active
            ? "1px solid rgba(201,168,76,0.2)"
            : item.danger
            ? "1px solid rgba(255,82,82,0.12)"
            : "1px solid rgba(255,255,255,0.05)",
        }}
      >
        {/* Icon box */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: active
              ? "rgba(201,168,76,0.12)"
              : item.danger
              ? "rgba(255,82,82,0.08)"
              : "rgba(255,255,255,0.05)",
            border: active
              ? "1px solid rgba(201,168,76,0.25)"
              : "1px solid rgba(255,255,255,0.06)",
          }}>
          <span style={{
            color: active ? "#C9A84C" : item.danger ? "#ff5252" : "rgba(255,255,255,0.4)",
          }}>
            {item.icon}
          </span>
        </div>

        {/* Label */}
        <div style={{ flex: 1 }}>
          <div className="flex items-center gap-2">
            <span style={{
              color: active ? "#C9A84C" : item.danger ? "#ff5252" : "rgba(255,255,255,0.75)",
              fontSize: "13px", fontWeight: 600,
            }}>
              {item.label}
            </span>
            {item.badge && (
              <span style={{
                background: `${item.badgeColor}18`,
                border: `1px solid ${item.badgeColor}40`,
                color: item.badgeColor,
                fontSize: "7px", padding: "1px 6px", borderRadius: "20px",
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
              }}>
                {item.badge}
              </span>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px", marginTop: "1px" }}>
            {item.sublabel}
          </div>
        </div>

        {/* Right side */}
        {item.path === "/portfolio" && totalUsd > 0 ? (
          <div className="text-right shrink-0">
            <div style={{ color: "#C9A84C", fontSize: "11px", fontFamily: "monospace", fontWeight: 700 }}>
              ${totalUsd.toFixed(0)}
            </div>
            <div style={{ color: pnlPos ? "#C9A84C" : "#ff5252", fontSize: "9px", fontFamily: "monospace" }}>
              {pnlPos ? "+" : ""}{totalPnlPct.toFixed(1)}%
            </div>
          </div>
        ) : (
          <ChevronRight size={14} style={{ color: item.danger ? "rgba(255,82,82,0.4)" : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
        )}
      </button>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 60,
          background: "rgba(0,0,0,0.7)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity 0.3s ease",
        }}
      />

      {/* Slide panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width: "min(85vw, 340px)",
          zIndex: 70,
          background: "#0D0D0D",
          borderLeft: "1px solid rgba(255,255,255,0.07)",
          boxShadow: "-20px 0 60px rgba(0,0,0,0.6)",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.32s cubic-bezier(0.32,0,0.18,1)",
          display: "flex", flexDirection: "column",
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-4 pt-5 pb-4 shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "#171717", border: "1px solid rgba(201,168,76,0.25)" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="#C9A84C" strokeWidth="1.5" opacity="0.35"/>
                <circle cx="12" cy="12" r="5" stroke="#C9A84C" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="2.5" fill="#C9A84C" opacity="0.9"/>
                <circle cx="12" cy="12" r="1" fill="#F0EBE0"/>
              </svg>
            </div>
            <div>
              <span className="font-orbitron font-black" style={{ color: "#F0EBE0", fontSize: "13px", letterSpacing: "0.1em" }}>OKO</span>
              <span className="font-orbitron ml-1" style={{ color: "rgba(240,235,224,0.30)", fontSize: "13px", letterSpacing: "0.1em" }}>VISION</span>
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            <X size={15} style={{ color: "rgba(255,255,255,0.6)" }} />
          </button>
        </div>

        {/* ── Wallet card ── */}
        <div className="mx-4 mt-4 mb-2 rounded-2xl p-3.5 shrink-0"
          style={{
            background: connected
              ? "linear-gradient(135deg,rgba(201,168,76,0.07),rgba(201,168,76,0.03))"
              : "rgba(255,255,255,0.03)",
            border: connected
              ? "1px solid rgba(201,168,76,0.2)"
              : "1px solid rgba(255,255,255,0.07)",
          }}>
          {connected && shortAddress ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(201,168,76,0.1)", border: "1px solid rgba(201,168,76,0.25)" }}>
                <Shield size={16} style={{ color: "#C9A84C" }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#C9A84C", boxShadow: "0 0 4px #C9A84C", flexShrink: 0 }} />
                  <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk',monospace", fontWeight: 700 }}>
                    ПОДКЛЮЧЁН
                  </span>
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", fontFamily: "monospace", marginTop: "1px",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {address ? `${address.slice(0,6)}...${address.slice(-4)}` : shortAddress}
                </div>
              </div>
              {totalUsd > 0 && (
                <div className="text-right shrink-0">
                  <div style={{ color: "#C9A84C", fontSize: "13px", fontFamily: "monospace", fontWeight: 700 }}>
                    ${totalUsd.toFixed(0)}
                  </div>
                  <div style={{ color: pnlPos ? "#C9A84C" : "#ff5252", fontSize: "9px", fontFamily: "monospace" }}>
                    {pnlPos ? "+" : ""}{totalPnlPct.toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => onNav("/wallet")}
              className="w-full flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.15)" }}>
                <Wallet size={16} style={{ color: "rgba(201,168,76,0.6)" }} />
              </div>
              <div>
                <div style={{ color: "rgba(255,255,255,0.55)", fontSize: "12px", fontWeight: 600 }}>
                  Подключить кошелёк
                </div>
                <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "10px" }}>
                  Phantom, Solflare, OKX…
                </div>
              </div>
              <ChevronRight size={14} style={{ color: "rgba(255,255,255,0.2)", marginLeft: "auto" }} />
            </button>
          )}
        </div>

        {/* ── Main nav ── */}
        <div className="px-4 pt-2 pb-1 shrink-0">
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", fontFamily: "'Space Grotesk',monospace",
            letterSpacing: "0.12em", marginBottom: "8px", paddingLeft: "4px" }}>
            НАВИГАЦИЯ
          </div>
          <div className="flex flex-col gap-1.5">
            {NAV_MAIN.map(renderItem)}
          </div>
        </div>

        {/* ── Secondary nav ── */}
        <div className="px-4 pt-3 pb-1 shrink-0">
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", fontFamily: "'Space Grotesk',monospace",
            letterSpacing: "0.12em", marginBottom: "8px", paddingLeft: "4px" }}>
            ПРОЧЕЕ
          </div>
          <div className="flex flex-col gap-1.5">
            {NAV_SECONDARY.map(renderItem)}
          </div>
        </div>

        {/* ── Danger zone ── */}
        {connected && (
          <div className="px-4 pt-3 pb-1 shrink-0">
            <div className="flex flex-col gap-1.5">
              {NAV_DANGER.map(renderItem)}
            </div>
          </div>
        )}

        {/* ── Footer tools ── */}
        <div className="mt-auto px-4 pt-4 pb-6 shrink-0"
          style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", fontFamily: "'Space Grotesk',monospace",
            letterSpacing: "0.12em", marginBottom: "10px" }}>
            ИНСТРУМЕНТЫ
          </div>
          <div className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>Тема</span>
              <div className="ml-auto"><ThemeSwitcher /></div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <VoiceCommands />
            </div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.12)", fontSize: "8px", textAlign: "center", marginTop: "12px",
            fontFamily: "monospace" }}>
            OKO Vision Terminal v3.2.1
          </div>
        </div>
      </div>
    </>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

export default function Header() {
  const [menuOpen, setMenuOpen]     = useState(false);
  const [location, navigate]        = useLocation();
  const { connected, shortAddress } = useOkoWallet();
  const { autoTrading, totalUsd }   = useTrading();

  const handleNav = (path: string | null, action?: () => void) => {
    setMenuOpen(false);
    if (action) { action(); return; }
    if (path) navigate(path);
  };

  return (
    <>
      <header className="sticky top-0 z-50 w-full"
        style={{
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          background: "rgba(8,8,8,0.94)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
        }}>
        <div className="px-4 py-3 flex items-center gap-2 max-w-lg mx-auto">

          {/* Logo */}
          <button className="flex items-center gap-2 mr-auto" onClick={() => navigate("/")}>
            <div className="relative">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "#111111", border: "1px solid rgba(201,168,76,0.30)" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="#C9A84C" strokeWidth="1.5" opacity="0.35"/>
                  <circle cx="12" cy="12" r="5" stroke="#C9A84C" strokeWidth="1.5"/>
                  <circle cx="12" cy="12" r="2.5" fill="#C9A84C" opacity="0.9"/>
                  <circle cx="12" cy="12" r="1" fill="#F0EBE0"/>
                </svg>
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full pulse-dot"
                style={{ background: "#C9A84C" }}/>
            </div>
            <div>
              <span className="font-orbitron text-sm font-black" style={{ color: "#F0EBE0", letterSpacing: "0.08em" }}>OKO</span>
              <span className="font-orbitron text-sm ml-1" style={{ color: "rgba(240,235,224,0.35)", letterSpacing: "0.08em" }}>VISION</span>
            </div>
          </button>

          {/* Wallet chip */}
          {connected && shortAddress ? (
            <button onClick={() => navigate("/wallet")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
              style={{ background: "#111111", border: "1px solid rgba(201,168,76,0.25)" }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#C9A84C" }}/>
              <span style={{ color: "#C9A84C", fontSize: "9px", fontFamily: "'Space Grotesk',monospace", fontWeight: 700 }}>
                {shortAddress}
              </span>
            </button>
          ) : (
            <button onClick={() => navigate("/wallet")}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
              style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.10)" }}>
              <Wallet size={11} style={{ color: "rgba(240,235,224,0.40)" }}/>
              <span style={{ color: "rgba(240,235,224,0.40)", fontSize: "9px", fontFamily: "'Space Grotesk',monospace", fontWeight: 700 }}>
                CONNECT
              </span>
            </button>
          )}

          <NotificationBell />

          {/* Burger */}
          <button
            onClick={() => setMenuOpen(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: "#111111", border: "1px solid rgba(255,255,255,0.10)" }}>
            <Menu size={16} style={{ color: "rgba(240,235,224,0.60)" }} />
          </button>
        </div>
      </header>

      {/* Slide menu */}
      <SlideMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onNav={handleNav}
        location={location}
      />
    </>
  );
}
