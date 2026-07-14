import { useOkoWallet } from "@/context/WalletContext";
import { useBalance }   from "@/context/BalanceContext";

const GREEN = "#00c853";
const RED   = "#ff1744";
const BLUE  = "#2962ff";

export default function SettingsTab() {
  const { address, shortAddress, disconnectWallet, connected, wallets } = useOkoWallet();
  const { refresh } = useBalance();

  return (
    <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* header */}
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>Профиль</div>
        <div style={{ fontSize: 13, color: "#555", marginTop: 2 }}>Настройки и безопасность</div>
      </div>

      {/* wallet card */}
      <Section>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 16,
            background: "linear-gradient(135deg,#ff6b35,#ff1744)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 24,
          }}>🔥</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>HoFire Wallet</div>
            <div style={{ fontSize: 12, color: "#555", fontFamily: "monospace" }}>
              {shortAddress ?? "Не подключён"}
            </div>
          </div>
        </div>

        {address && (
          <div style={{
            background: "#1a1a1a", borderRadius: 12, padding: "12px 14px",
            fontSize: 11, fontFamily: "monospace", color: "#555",
            wordBreak: "break-all", lineHeight: 1.6,
          }}>
            {address}
          </div>
        )}
      </Section>

      {/* network */}
      <Section title="Сеть">
        <Row label="Robinhood Chain" value="ID 4663" dot={GREEN} />
        <Row label="Solana" value="Mainnet-beta" dot={GREEN} />
        <Row label="Статус RPC" value="Активен" dot={GREEN} />
      </Section>

      {/* security */}
      <Section title="Безопасность">
        <Row label="Хранение ключей" value="Только локально" />
        <Row label="Сессия" value="localStorage" />
        <Row label="Сеть" value="Без регистрации" />
      </Section>

      {/* wallets list */}
      {wallets.length > 1 && (
        <Section title={`Кошельки (${wallets.length})`}>
          {wallets.map((w, i) => (
            <Row key={i} label={w.name || shortAddr(w.address)} value={w.type} />
          ))}
        </Section>
      )}

      {/* actions */}
      <Section title="Действия">
        <button
          onClick={refresh}
          style={actionBtn("#1a1a1a", "#888")}
        >
          ↺ Обновить балансы
        </button>
        <button
          onClick={disconnectWallet}
          style={{ ...actionBtn("rgba(255,23,68,0.08)", RED), marginTop: 10 }}
        >
          ⎋ Отключить кошелёк
        </button>
      </Section>

      {/* footer */}
      <div style={{ textAlign: "center", fontSize: 11, color: "#333", lineHeight: 1.8 }}>
        HoFire Wallet · v1.0<br />
        Powered by Robinhood Chain & Solana
      </div>
    </div>
  );
}

/* ── helpers ─────────────────────────────────────────────────── */
function shortAddr(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div>
      {title && (
        <div style={{
          fontSize: 11, fontWeight: 600, color: "#444",
          textTransform: "uppercase", letterSpacing: "0.1em",
          marginBottom: 10, paddingLeft: 4,
        }}>
          {title}
        </div>
      )}
      <div style={{
        background: "#111", borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.06)",
        padding: "4px 0",
      }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "13px 16px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
    }}>
      <span style={{ fontSize: 13, color: "#888" }}>{label}</span>
      <span style={{ fontSize: 13, color: "#555", display: "flex", alignItems: "center", gap: 6 }}>
        {dot && (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot, display: "inline-block" }} />
        )}
        {value}
      </span>
    </div>
  );
}

function actionBtn(bg: string, color: string): React.CSSProperties {
  return {
    width: "100%", padding: "14px 0", margin: 0,
    background: bg, border: "none", borderRadius: 14,
    color, fontSize: 14, fontWeight: 600, cursor: "pointer",
    display: "block",
  };
}
