import { useBalance }    from "@/context/BalanceContext";
import { useOkoWallet }  from "@/context/WalletContext";
import { useTrading }    from "@/context/TradingContext";
import { motion }        from "framer-motion";

/* ── helpers ─────────────────────────────────────────────────── */
function fmt(n: number, decimals = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const GREEN = "#00c853";
const RED   = "#ff1744";
const BLUE  = "#2962ff";

/* ── component ───────────────────────────────────────────────── */
export default function HomeTab() {
  const { address, shortAddress } = useOkoWallet();
  const { solBalance, solPrice, solUsd, tokens, totalUsd, loading, refresh } = useBalance();
  const { totalPnlUsd, totalPnlPct, positions } = useTrading();

  const pnlPos = totalPnlUsd >= 0;

  return (
    <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Balance hero ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          background: "#111", borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.06)",
          padding: "24px 20px 20px",
        }}
      >
        <div style={{ fontSize: 12, color: "#555", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
          Общий баланс
        </div>
        <div style={{ fontSize: 38, fontWeight: 300, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
          ${fmt(totalUsd)}
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginTop: 8,
          fontSize: 13, fontWeight: 600,
          color: pnlPos ? GREEN : RED,
        }}>
          <span>{pnlPos ? "▲" : "▼"}</span>
          <span>{pnlPos ? "+" : ""}{fmt(totalPnlUsd)} ({totalPnlPct.toFixed(2)}%)</span>
        </div>

        {shortAddress && (
          <div style={{
            marginTop: 14, paddingTop: 14,
            borderTop: "1px solid rgba(255,255,255,0.06)",
            fontSize: 11, color: "#444", fontFamily: "monospace",
          }}>
            {shortAddress}
          </div>
        )}
      </motion.div>

      {/* ── Quick actions ─────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { label: "Обновить", icon: "↺", action: refresh },
          { label: "Принять",  icon: "⬇",  action: undefined },
          { label: "Отправить",icon: "↑",  action: undefined },
        ].map(({ label, icon, action }) => (
          <button
            key={label}
            onClick={action}
            style={{
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 6, padding: "14px 0",
              background: "#111",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16, cursor: "pointer",
              color: "#888", transition: "background 0.15s, color 0.15s",
            }}
          >
            <span style={{ fontSize: 22 }}>{icon}</span>
            <span style={{ fontSize: 11, fontWeight: 500 }}>{label}</span>
          </button>
        ))}
      </div>

      {/* ── Asset list ───────────────────────────────────────────── */}
      <div>
        <SectionHeader label="Активы" />
        <div style={{
          background: "#111", borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.06)",
          overflow: "hidden",
        }}>

          {/* SOL */}
          <AssetRow
            symbol="SOL"
            name="Solana"
            color="#9945ff"
            icon="◎"
            amount={`${solBalance.toFixed(4)} SOL`}
            usd={`$${fmt(solUsd)}`}
            price={`$${fmt(solPrice)}`}
          />

          {tokens.length === 0 && !loading && (
            <div style={{ padding: "20px 16px", fontSize: 13, color: "#444", textAlign: "center" }}>
              Токены не найдены
            </div>
          )}

          {loading && (
            <div style={{ padding: "16px", fontSize: 13, color: "#444", textAlign: "center" }}>
              Загрузка…
            </div>
          )}

          {(tokens as any[]).slice(0, 8).map((tok, i) => (
            <AssetRow
              key={i}
              symbol={tok.symbol ?? "—"}
              name={tok.name ?? tok.symbol ?? "Token"}
              color={BLUE}
              icon={tok.logo ? undefined : tok.symbol?.slice(0, 2) ?? "?"}
              logoUrl={tok.logo}
              amount={Number(tok.amount ?? 0).toLocaleString()}
              usd={`$${fmt(Number(tok.usdValue ?? 0))}`}
              price={tok.price ? `$${fmt(Number(tok.price))}` : undefined}
            />
          ))}
        </div>
      </div>

      {/* ── Open positions ────────────────────────────────────────── */}
      {positions.length > 0 && (
        <div>
          <SectionHeader label={`Позиции (${positions.length})`} />
          <div style={{
            background: "#111", borderRadius: 20,
            border: "1px solid rgba(255,255,255,0.06)",
            overflow: "hidden",
          }}>
            {(positions as any[]).map((pos, i) => {
              const pnl = pos.pnlUsd ?? 0;
              const pos2 = pnl >= 0;
              return (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "14px 16px",
                  borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{pos.symbol ?? pos.mint?.slice(0, 8)}</div>
                    <div style={{ fontSize: 12, color: "#555" }}>{pos.side ?? "long"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: pos2 ? GREEN : RED }}>
                      {pos2 ? "+" : ""}{fmt(pnl)}
                    </div>
                    <div style={{ fontSize: 11, color: "#444" }}>${fmt(pos.usdValue ?? 0)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Network badge ─────────────────────────────────────────── */}
      <div style={{
        display: "flex", justifyContent: "center", gap: 8,
        fontSize: 11, color: "#444",
      }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "#111", borderRadius: 20,
          border: "1px solid rgba(255,255,255,0.05)",
          padding: "6px 12px",
        }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: GREEN, boxShadow: `0 0 6px ${GREEN}`, display: "inline-block" }} />
          Robinhood Chain · ID 4663
        </span>
      </div>
    </div>
  );
}

/* ── sub-components ──────────────────────────────────────────── */
function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 600, color: "#444",
      textTransform: "uppercase", letterSpacing: "0.1em",
      marginBottom: 10, paddingLeft: 4,
    }}>
      {label}
    </div>
  );
}

function AssetRow({ symbol, name, color, icon, logoUrl, amount, usd, price }: {
  symbol: string; name: string; color: string;
  icon?: React.ReactNode; logoUrl?: string;
  amount: string; usd: string; price?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 16px",
      borderTop: `1px solid rgba(255,255,255,0.04)`,
      cursor: "pointer",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: "50%",
          background: color + "20",
          border: `1px solid ${color}30`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: logoUrl ? 0 : 15, color, overflow: "hidden", flexShrink: 0,
        }}>
          {logoUrl
            ? <img src={logoUrl} alt={symbol} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : icon ?? symbol.slice(0, 2)
          }
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", lineHeight: 1.2 }}>{name}</div>
          <div style={{ fontSize: 11, color: "#555", lineHeight: 1.2, marginTop: 2 }}>{symbol}{price ? ` · ${price}` : ""}</div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{usd}</div>
        <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>{amount}</div>
      </div>
    </div>
  );
}
