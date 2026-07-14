import { useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ExternalLink, ArrowRight, Shuffle, Shield, Zap, Star } from "lucide-react";
import { useOkoWallet } from "@/context/WalletContext";
import { shortAddr } from "@/lib/solana";

interface BridgeService {
  name: string;
  tagline: string;
  desc: string;
  color: string;
  logo: string;
  url: string;
  badge?: string;
  badgeColor?: string;
  chains: string[];
  tokens: string[];
  featured?: boolean;
}

const BRIDGES: BridgeService[] = [
  {
    name: "Mayan Finance",
    tagline: "Самый быстрый бридж на Solana",
    desc: "Кросс-чейн свопы за секунды. Лучший курс через Wormhole и CCTP.",
    color: "#C9A84C",
    logo: "🔀",
    url: "https://swap.mayan.finance",
    badge: "⚡ Быстрый",
    badgeColor: "#C9A84C",
    chains: ["Solana", "Ethereum", "Polygon", "BNB", "Arbitrum", "Avalanche", "Base"],
    tokens: ["SOL", "USDC", "USDT", "ETH", "WETH", "MATIC", "BNB"],
    featured: true,
  },
  {
    name: "Portal Bridge",
    tagline: "Wormhole — 20+ сетей",
    desc: "Официальный бридж Wormhole. Поддерживает NFT, токены, нативные активы.",
    color: "#C9A84C",
    logo: "🌀",
    url: "https://portalbridge.com/#/transfer",
    badge: "🔒 Надёжный",
    badgeColor: "#C9A84C",
    chains: ["Solana", "Ethereum", "BSC", "Polygon", "Avalanche", "Fantom", "Celo", "Klaytn"],
    tokens: ["SOL", "USDC", "USDT", "ETH", "BNB", "MATIC", "AVAX"],
    featured: true,
  },
  {
    name: "Allbridge Core",
    tagline: "Стейблкоины без обёртки",
    desc: "Лучший выбор для USDC и USDT. Нативные переводы без wrapped токенов.",
    color: "#C9A84C",
    logo: "🌉",
    url: "https://core.allbridge.io",
    badge: "💰 Стейблы",
    badgeColor: "#C9A84C",
    chains: ["Solana", "Ethereum", "BSC", "Polygon", "Arbitrum", "Tron", "Stellar"],
    tokens: ["USDC", "USDT", "USDС (native)"],
  },
  {
    name: "deBridge / DLN",
    tagline: "Нулевой slippage через DLN",
    desc: "Протокол DLN — кросс-чейн без пулов ликвидности. Лучший курс на крупных суммах.",
    color: "#C9A84C",
    logo: "⚡",
    url: "https://app.debridge.finance",
    badge: "📈 Крупные суммы",
    badgeColor: "#C9A84C",
    chains: ["Solana", "Ethereum", "Arbitrum", "BNB", "Polygon", "Linea", "Base"],
    tokens: ["SOL", "ETH", "USDC", "USDT", "WBTC", "ARB"],
  },
  {
    name: "Stargate Finance",
    tagline: "LayerZero — нативный USDC",
    desc: "Протокол LayerZero. Нативные USDC переводы без wrapped версий.",
    color: "#ff6b00",
    logo: "⭐",
    url: "https://stargate.finance/transfer",
    badge: "🌐 LayerZero",
    badgeColor: "#ff6b00",
    chains: ["Solana", "Ethereum", "Arbitrum", "BNB", "Base", "Optimism", "Polygon"],
    tokens: ["USDC", "ETH", "STG"],
  },
  {
    name: "Rango Exchange",
    tagline: "Агрегатор 90+ бриджей",
    desc: "Автоматически находит лучший маршрут через 90+ протоколов. Для любых токенов.",
    color: "#ff3d9a",
    logo: "🔄",
    url: "https://app.rango.exchange/swap/solana.SOL--/",
    badge: "🏆 Лучший курс",
    badgeColor: "#ff3d9a",
    chains: ["50+ сетей"],
    tokens: ["Любые токены"],
    featured: true,
  },
  {
    name: "Jupiter Bridge",
    tagline: "Встроенный бридж Jupiter",
    desc: "Бридж прямо в Jupiter DEX. Лучшая интеграция для Solana-first пользователей.",
    color: "#7c5cbf",
    logo: "🪐",
    url: "https://jup.ag/bridge",
    chains: ["Solana", "Ethereum", "Arbitrum", "BNB"],
    tokens: ["SOL", "USDC", "ETH"],
  },
  {
    name: "Across Protocol",
    tagline: "UMA — быстрые EVM-бриджи",
    desc: "Самый быстрый бридж между EVM-сетями через Solana. Минимальные комиссии.",
    color: "#00bcd4",
    logo: "🌊",
    url: "https://across.to",
    chains: ["Ethereum", "Arbitrum", "Optimism", "Base", "Polygon"],
    tokens: ["ETH", "USDC", "USDT", "WBTC"],
  },
];

const TABS = ["Все", "Рекомендуемые", "Стейблы", "EVM"];

function filterBridges(bridges: BridgeService[], tab: string): BridgeService[] {
  if (tab === "Рекомендуемые") return bridges.filter(b => b.featured);
  if (tab === "Стейблы") return bridges.filter(b => b.tokens.some(t => ["USDC", "USDT"].includes(t)));
  if (tab === "EVM") return bridges.filter(b => b.chains.some(c => ["Ethereum", "Arbitrum", "Base", "Optimism"].includes(c)));
  return bridges;
}

function BridgeCard({ b }: { b: BridgeService }) {
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={b.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="rounded-2xl p-4 relative overflow-hidden"
        style={{
          background: hovered
            ? `linear-gradient(145deg, ${b.color}12 0%, rgba(17,17,17,0.95) 100%)`
            : "rgba(255,255,255,0.025)",
          border: `1px solid ${hovered ? b.color + "35" : "rgba(255,255,255,0.07)"}`,
          boxShadow: hovered ? `0 0 30px ${b.color}15` : "none",
          transition: "all 0.25s ease",
          transform: hovered ? "translateY(-2px)" : "translateY(0)",
        }}
      >
        {b.featured && (
          <div
            className="absolute top-3 right-3 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{ background: `${b.color}15`, border: `1px solid ${b.color}30` }}
          >
            <Star size={8} style={{ color: b.color }} />
            <span style={{ color: b.color, fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>ТОП</span>
          </div>
        )}

        <div className="flex items-start gap-3">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${b.color}12`, border: `1px solid ${b.color}25`, fontSize: "22px" }}
          >
            {b.logo}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="font-orbitron font-bold" style={{ color: b.color, fontSize: "13px", letterSpacing: "0.03em" }}>{b.name}</span>
            </div>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", marginBottom: 6 }}>{b.tagline}</p>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", lineHeight: 1.55 }}>{b.desc}</p>
          </div>
        </div>

        {/* Chains */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {b.chains.slice(0, 5).map(c => (
            <span
              key={c}
              className="px-2 py-0.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.35)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}
            >
              {c}
            </span>
          ))}
          {b.chains.length > 5 && (
            <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", padding: "2px 0" }}>+{b.chains.length - 5}</span>
          )}
        </div>

        {/* Tokens */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {b.tokens.slice(0, 5).map(t => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-full"
              style={{ background: `${b.color}08`, border: `1px solid ${b.color}20`, color: b.color, fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}
            >
              {t}
            </span>
          ))}
        </div>

        {/* CTA row */}
        <div className="mt-3 flex items-center justify-between">
          {b.badge && (
            <div
              className="flex items-center gap-1 px-2 py-1 rounded-full"
              style={{ background: `${b.badgeColor}10`, border: `1px solid ${b.badgeColor}25` }}
            >
              <span style={{ color: b.badgeColor, fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{b.badge}</span>
            </div>
          )}
          <div
            className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-xl"
            style={{ background: `${b.color}12`, border: `1px solid ${b.color}30`, color: b.color, fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}
          >
            Открыть <ExternalLink size={10} />
          </div>
        </div>
      </div>
    </a>
  );
}

export default function Bridge() {
  const [, navigate] = useLocation();
  const { address } = useOkoWallet();
  const [activeTab, setActiveTab] = useState("Все");

  const filtered = filterBridges(BRIDGES, activeTab);

  return (
    <div
      className="min-h-screen min-h-dvh relative"
      style={{ background: "#080808" }}
    >
      
      

      <div className="relative z-10 px-4 pt-4 pb-28 max-w-sm mx-auto">

        {/* Back */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl mb-5"
          style={{ color: "rgba(201,168,76,0.55)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}
        >
          <ChevronLeft size={13} /> Назад
        </button>

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.30)", fontSize: "20px" }}>
              🌉
            </div>
            <div>
              <h1 className="font-orbitron font-bold" style={{ color: "#C9A84C", fontSize: "20px", letterSpacing: "0.04em", textShadow: "0 0 20px rgba(201,168,76,0.5)" }}>
                BRIDGE
              </h1>
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>Кросс-чейн переводы активов</p>
            </div>
          </div>

          {/* Info strip */}
          <div
            className="rounded-2xl p-3.5 flex items-start gap-3"
            style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)" }}
          >
            <Shield size={14} style={{ color: "#C9A84C", flexShrink: 0, marginTop: 1 }} />
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", lineHeight: 1.65 }}>
              Бридж позволяет перевести активы между разными блокчейнами. Все сервисы ниже — проверенные протоколы.
              {address && (
                <> Ваш адрес: <span style={{ color: "rgba(201,168,76,0.7)", fontFamily: "monospace" }}>{shortAddr(address)}</span></>
              )}
            </p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          {[
            { icon: Zap, label: "Скорость", val: "< 30 сек", color: "#C9A84C" },
            { icon: Shuffle, label: "Протоколов", val: "8+", color: "#C9A84C" },
            { icon: ArrowRight, label: "Сетей", val: "50+", color: "#C9A84C" },
          ].map(({ icon: Icon, label, val, color }) => (
            <div key={label} className="rounded-2xl p-3 text-center" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Icon size={14} style={{ color, margin: "0 auto 4px" }} />
              <p style={{ color, fontSize: "13px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>{val}</p>
              <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px", marginTop: 2, fontFamily: "'Space Grotesk', sans-serif" }}>{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="shrink-0 px-3.5 py-2 rounded-xl"
              style={{
                background: activeTab === tab ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${activeTab === tab ? "rgba(201,168,76,0.35)" : "rgba(255,255,255,0.08)"}`,
                color: activeTab === tab ? "#C9A84C" : "rgba(255,255,255,0.35)",
                fontSize: "10px",
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 700,
                letterSpacing: "0.05em",
                transition: "all 0.2s ease",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Bridge list */}
        <div className="flex flex-col gap-3">
          {filtered.map(b => <BridgeCard key={b.name} b={b} />)}
        </div>

        {/* Disclaimer */}
        <div className="mt-5 rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", textAlign: "center", lineHeight: 1.7, fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.03em", textTransform: "uppercase" }}>
            Бриджи — сторонние сервисы.<br />OKO Vision не несёт ответственности за их работу.<br />Всегда проверяйте адрес получателя перед отправкой.
          </p>
        </div>
      </div>
    </div>
  );
}
