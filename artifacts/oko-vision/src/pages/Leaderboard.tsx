import { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Trophy, Users, Copy, TrendingUp, TrendingDown, CheckCircle2, Activity } from "lucide-react";
import { useTrading, type CopyTrader } from "@/context/TradingContext";

function CopyTraderCard({ trader }: { trader: CopyTrader }) {
  const { toggleCopyTrader, setCopyAllocation } = useTrading();

  return (
    <div className="rounded-2xl p-4" style={{
      background: trader.isCopying ? "rgba(201,168,76,0.04)" : "rgba(255,255,255,0.02)",
      border: `1px solid ${trader.isCopying ? "rgba(201,168,76,0.20)" : "rgba(255,255,255,0.07)"}`,
      transition: "all 0.2s",
    }}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-orbitron font-bold"
          style={{ background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.20)", color: "#C9A84C", fontSize: "12px" }}>
          {trader.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ color: "#fff", fontSize: "12px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {trader.name}
            </span>
            {trader.isCopying && (
              <span className="flex items-center gap-1" style={{ color: "#C9A84C", fontSize: "8px", flexShrink: 0 }}>
                <CheckCircle2 size={10} />Копирую
              </span>
            )}
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>{trader.shortAddress}</div>
        </div>
        <div className="text-right shrink-0">
          <div style={{ color: "#C9A84C", fontSize: "14px", fontWeight: 700, fontFamily: "monospace" }}>+{trader.pnl30d.toFixed(1)}%</div>
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px" }}>30 дней</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: "Win Rate",  value: `${trader.winRate.toFixed(1)}%`,  color: "#C9A84C" },
          { label: "PnL 30д",  value: `+${trader.pnl30d.toFixed(1)}%`, color: "#C9A84C" },
          { label: "Followers", value: String(trader.followers),          color: "rgba(255,255,255,0.6)" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg px-2 py-1.5 text-center" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div style={{ color, fontSize: "11px", fontWeight: 700, fontFamily: "monospace" }}>{value}</div>
            <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "7px", marginTop: "1px" }}>{label}</div>
          </div>
        ))}
      </div>

      {trader.isCopying && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1.5">
            <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px" }}>Аллокация портфеля</span>
            <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "monospace" }}>{trader.allocation}%</span>
          </div>
          <input type="range" min={1} max={20} value={trader.allocation}
            onChange={(e) => setCopyAllocation(trader.id, Number(e.target.value))}
            className="w-full h-1 rounded-full appearance-none"
            style={{ accentColor: "#C9A84C" }}
          />
        </div>
      )}

      <button onClick={() => toggleCopyTrader(trader.id)}
        className="w-full py-2.5 rounded-xl flex items-center justify-center gap-2"
        style={{
          background: trader.isCopying ? "rgba(255,82,82,0.08)" : "rgba(201,168,76,0.08)",
          border: `1px solid ${trader.isCopying ? "rgba(255,82,82,0.25)" : "rgba(201,168,76,0.22)"}`,
        }}>
        <Copy size={12} style={{ color: trader.isCopying ? "#ff5252" : "#C9A84C" }} />
        <span style={{ color: trader.isCopying ? "#ff5252" : "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>
          {trader.isCopying ? "ОСТАНОВИТЬ" : "КОПИРОВАТЬ"}
        </span>
      </button>
    </div>
  );
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const { copyTraders, tradeHistory } = useTrading();
  const [tab, setTab] = useState<"leaderboard" | "social" | "copy">("leaderboard");
  const copyingCount = copyTraders.filter((t) => t.isCopying).length;

  // Real feed: last 20 trades from this user's trade history
  const realFeed = tradeHistory.slice(0, 20);

  function timeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}д назад`;
    if (h > 0) return `${h}ч назад`;
    if (m > 0) return `${m}м назад`;
    return "только что";
  }

  return (
    <div className="min-h-screen" style={{ background: "#080808" }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center gap-3"
        style={{ background: "rgba(8,8,8,0.95)", borderBottom: "1px solid rgba(201,168,76,0.08)", backdropFilter: "blur(20px)" }}>
        <button onClick={() => navigate("/")} className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
          <ArrowLeft size={14} style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>
        <div>
          <div className="font-orbitron font-bold" style={{ color: "#C9A84C", fontSize: "14px", letterSpacing: "0.1em" }}>LEADERBOARD</div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>
            Топ трейдеры · Копирую: {copyingCount}
          </div>
        </div>
        {copyingCount > 0 && (
          <div className="ml-auto px-2.5 py-1 rounded-full"
            style={{ background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.25)" }}>
            <span style={{ color: "#C9A84C", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}>×{copyingCount}</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-1 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        {([
          { key: "leaderboard" as const, label: "ТОП",        icon: <Trophy size={11} /> },
          { key: "social"      as const, label: "МОИ СДЕЛКИ", icon: <Activity size={11} /> },
          { key: "copy"        as const, label: "КОПИРОВАТЬ",  icon: <Copy size={11} /> },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl"
            style={{
              background: tab === t.key ? "rgba(201,168,76,0.10)" : "transparent",
              border: tab === t.key ? "1px solid rgba(201,168,76,0.22)" : "1px solid transparent",
              color: tab === t.key ? "#C9A84C" : "rgba(255,255,255,0.30)",
              fontFamily: "'Space Grotesk', sans-serif", fontSize: "8px", fontWeight: 700,
            }}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="px-4 pb-10 pt-4 max-w-lg mx-auto space-y-3">

        {/* Leaderboard tab */}
        {tab === "leaderboard" && (
          <>
            {copyTraders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Trophy size={40} style={{ color: "rgba(201,168,76,0.20)" }} />
                <div className="text-center">
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", marginBottom: "6px" }}>
                    Данные загружаются
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>
                    Топ-трейдеры появятся после первых сделок в сети
                  </div>
                </div>
              </div>
            ) : (
              copyTraders.map((trader, idx) => (
                <div key={trader.id} className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                  style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${idx === 0 ? "rgba(201,168,76,0.20)" : idx === 1 ? "rgba(192,192,192,0.15)" : idx === 2 ? "rgba(205,127,50,0.15)" : "rgba(255,255,255,0.07)"}` }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: idx === 0 ? "rgba(201,168,76,0.2)" : idx === 1 ? "rgba(192,192,192,0.15)" : idx === 2 ? "rgba(205,127,50,0.15)" : "rgba(255,255,255,0.06)" }}>
                    {idx < 3
                      ? <Trophy size={12} style={{ color: idx === 0 ? "#C9A84C" : idx === 1 ? "#c0c0c0" : "#cd7f32" }} />
                      : <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", fontWeight: 700 }}>{idx + 1}</span>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div style={{ color: "#fff", fontSize: "11px", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {trader.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px" }}>Win {trader.winRate.toFixed(0)}%</span>
                      <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>·</span>
                      <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px" }}>{trader.followers} followers</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div style={{ color: "#C9A84C", fontSize: "13px", fontWeight: 700, fontFamily: "monospace" }}>+{trader.pnl30d.toFixed(1)}%</div>
                    <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px" }}>30д</div>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {/* Real Trade Feed tab */}
        {tab === "social" && (
          <>
            <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", fontFamily: "monospace", textAlign: "center", paddingBottom: "4px" }}>
              Ваши реальные сделки · {realFeed.length} записей
            </div>
            {realFeed.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Activity size={40} style={{ color: "rgba(201,168,76,0.20)" }} />
                <div className="text-center">
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", marginBottom: "6px" }}>
                    Сделок пока нет
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px" }}>
                    Совершите первую сделку — она появится здесь
                  </div>
                </div>
              </div>
            ) : (
              realFeed.map((item) => {
                const isBuy = item.side === "BUY";
                const hasPnl = item.pnlPct !== undefined && item.pnlPct !== 0;
                return (
                  <div key={item.id} className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 font-bold"
                      style={{
                        background: isBuy ? "rgba(201,168,76,0.12)" : "rgba(255,82,82,0.12)",
                        color: isBuy ? "#C9A84C" : "#ff5252",
                        fontSize: "9px",
                      }}>
                      {isBuy ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700 }}>Вы</span>
                        <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>{isBuy ? "КУПИЛИ" : "ПРОДАЛИ"}</span>
                        <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700 }}>{item.symbol}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", fontFamily: "monospace" }}>
                          ${item.usdValue.toFixed(2)}
                        </span>
                        {hasPnl && (
                          <span style={{
                            color: (item.pnlPct ?? 0) >= 0 ? "#C9A84C" : "#ff5252",
                            fontSize: "9px", fontWeight: 700, fontFamily: "monospace",
                          }}>
                            {(item.pnlPct ?? 0) >= 0 ? "+" : ""}{(item.pnlPct ?? 0).toFixed(1)}%
                          </span>
                        )}
                        {item.txHash && (
                          <a
                            href={`https://solscan.io/tx/${item.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "rgba(201,168,76,0.5)", fontSize: "8px", fontFamily: "monospace" }}
                          >
                            ↗ tx
                          </a>
                        )}
                      </div>
                    </div>
                    <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "8px", flexShrink: 0 }}>
                      {timeAgo(item.timestamp)}
                    </span>
                  </div>
                );
              })
            )}
          </>
        )}

        {/* Copy Trading tab */}
        {tab === "copy" && (
          <>
            {copyingCount > 0 && (
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl mb-1"
                style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.18)" }}>
                <CheckCircle2 size={13} style={{ color: "#C9A84C" }} />
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px" }}>
                  Копирую {copyingCount} трейдера(ов). Сделки исполняются пропорционально аллокации.
                </span>
              </div>
            )}
            {copyTraders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4">
                <Copy size={40} style={{ color: "rgba(201,168,76,0.20)" }} />
                <div className="text-center">
                  <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", marginBottom: "6px" }}>
                    Copy Trading — скоро
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.2)", fontSize: "10px", maxWidth: "220px" }}>
                    Функция требует интеграции с on-chain данными трейдеров. В разработке.
                  </div>
                </div>
              </div>
            ) : (
              copyTraders.map((trader) => (
                <CopyTraderCard key={trader.id} trader={trader} />
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}
