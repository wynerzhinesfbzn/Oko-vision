import { useState } from "react";
import { X, Check, Plus, Trash2, AlertTriangle } from "lucide-react";
import { StoredWalletInfo } from "@/context/WalletContext";

interface Props {
  wallets:          StoredWalletInfo[];
  activeAddress:    string | null;
  onSelect:         (address: string) => void;
  onAddWallet:      () => void;
  onDeleteWallet:   (address: string) => void;
  onClose:          () => void;
}

type Chain = "ALL" | "SOLANA" | "EVM";

const CHAIN_TABS: { id: Chain; label: string; emoji: string }[] = [
  { id: "ALL",    label: "Все",    emoji: "🌐" },
  { id: "SOLANA", label: "Solana", emoji: "◎" },
  { id: "EVM",    label: "EVM",    emoji: "⟠" },
];

function shortAddr(addr: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function ConfirmDeleteSheet({
  wallet,
  onConfirm,
  onCancel,
}: {
  wallet: StoredWalletInfo;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(14px)" }}
      onClick={e => e.target === e.currentTarget && onCancel()}
    >
      <div className="w-full max-w-sm rounded-t-3xl px-5 pt-4 pb-8"
        style={{
          background: "linear-gradient(160deg, #0f0d0d 0%, #080808 100%)",
          border: "1px solid rgba(255,80,80,0.22)", borderBottom: "none",
          boxShadow: "0 -4px 60px rgba(255,50,50,0.10)",
        }}
      >
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div style={{
            width: 60, height: 60, borderRadius: 18,
            background: "rgba(255,60,60,0.10)", border: "1px solid rgba(255,60,60,0.28)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Trash2 size={26} style={{ color: "#ff5050" }} />
          </div>
        </div>

        <h3 className="font-orbitron font-bold text-center mb-2" style={{ fontSize: "14px", color: "#ff5050", letterSpacing: "0.04em" }}>
          УДАЛИТЬ КОШЕЛЁК?
        </h3>

        <div className="rounded-2xl px-4 py-3 mb-5" style={{ background: "rgba(255,60,60,0.06)", border: "1px solid rgba(255,60,60,0.16)" }}>
          <p style={{ color: "rgba(255,255,255,0.60)", fontSize: "12px", textAlign: "center", fontFamily: "'Space Grotesk', sans-serif", lineHeight: 1.6 }}>
            {wallet.name}
          </p>
          <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "11px", textAlign: "center", fontFamily: "monospace" }}>
            {shortAddr(wallet.address)}
          </p>
        </div>

        <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl mb-5"
          style={{ background: "rgba(255,165,0,0.06)", border: "1px solid rgba(255,165,0,0.16)" }}>
          <AlertTriangle size={13} style={{ color: "rgba(255,165,0,0.80)", flexShrink: 0, marginTop: 1 }} />
          <p style={{ color: "rgba(255,200,100,0.75)", fontSize: "10.5px", lineHeight: 1.6 }}>
            Кошелёк удалится из списка. Если у тебя нет сид-фразы или приватного ключа — доступ к средствам будет потерян.
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-2xl"
            style={{
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.50)", fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "12px", fontWeight: 700,
            }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3.5 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(255,60,60,0.20), rgba(255,60,60,0.12))",
              border: "1px solid rgba(255,60,60,0.42)",
              color: "#ff5050", fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em",
            }}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

function WalletRow({
  wallet, active, onSelect, onDelete,
}: {
  wallet: StoredWalletInfo;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const initials = wallet.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const isGenerated = wallet.type === "generated";

  const gradient = active
    ? "linear-gradient(135deg, #C9A84C, #0066ff)"
    : "linear-gradient(135deg, #2a2a5a, #1a1a3a)";

  return (
    <div className="flex items-center gap-2">
      {/* Main row button */}
      <button
        onClick={onSelect}
        className="flex-1 flex items-center gap-3 px-4 py-3.5 rounded-2xl min-w-0"
        style={{
          background: active ? "rgba(201,168,76,0.06)" : "rgba(255,255,255,0.02)",
          border: `1px solid ${active ? "rgba(201,168,76,0.22)" : "rgba(255,255,255,0.07)"}`,
          transition: "all 0.18s ease",
        }}
      >
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: "50%", background: gradient,
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          border: active ? "1.5px solid rgba(201,168,76,0.40)" : "1.5px solid rgba(255,255,255,0.08)",
          boxShadow: active ? "0 0 12px rgba(201,168,76,0.25)" : "none",
        }}>
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "12px", fontWeight: 700, color: active ? "#fff" : "rgba(255,255,255,0.45)" }}>
            {initials}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <p style={{
              color: active ? "#C9A84C" : "rgba(255,255,255,0.78)",
              fontSize: "13px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {wallet.name}
            </p>
            {isGenerated && (
              <span style={{
                fontSize: "8px", background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.22)",
                color: "rgba(240,235,224,0.65)", padding: "1px 6px", borderRadius: 4,
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, flexShrink: 0,
              }}>
                OKO
              </span>
            )}
          </div>
          <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "11px", fontFamily: "monospace", marginTop: 2 }}>
            {shortAddr(wallet.address)}
          </p>
        </div>

        {/* Chain badge + active check */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div style={{
            fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
            color: "rgba(201,168,76,0.70)",
            background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.20)",
            padding: "2px 7px", borderRadius: 5,
          }}>
            SOL
          </div>
          {active && <Check size={16} style={{ color: "#C9A84C" }} />}
        </div>
      </button>

      {/* Delete button */}
      <button
        onClick={e => { e.stopPropagation(); onDelete(); }}
        className="flex items-center justify-center rounded-2xl flex-shrink-0"
        style={{
          width: 44, height: 60,
          background: "rgba(255,60,60,0.06)",
          border: "1px solid rgba(255,60,60,0.16)",
          transition: "all 0.18s ease",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,60,60,0.14)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,60,60,0.35)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(255,60,60,0.06)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,60,60,0.16)"; }}
      >
        <Trash2 size={15} style={{ color: "rgba(255,80,80,0.65)" }} />
      </button>
    </div>
  );
}

export default function WalletSelectorSheet({ wallets, activeAddress, onSelect, onAddWallet, onDeleteWallet, onClose }: Props) {
  const [chain, setChain]           = useState<Chain>("ALL");
  const [deleteTarget, setDeleteTarget] = useState<StoredWalletInfo | null>(null);

  const filtered = wallets.filter(() => chain === "ALL" || chain === "SOLANA");

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;
    onDeleteWallet(deleteTarget.address);
    setDeleteTarget(null);
    // Close list if no wallets left
    if (wallets.length <= 1) onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[250] flex items-end justify-center"
        style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(12px)" }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <div
          className="w-full max-w-sm rounded-t-3xl"
          style={{
            background: "linear-gradient(160deg, #0d0f35 0%, #09091e 100%)",
            border: "1px solid rgba(201,168,76,0.16)", borderBottom: "none",
            boxShadow: "0 -4px 60px rgba(0,0,0,0.7)",
            maxHeight: "80vh", display: "flex", flexDirection: "column",
          }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.15)" }} />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-5 mb-4">
            <h3 className="font-orbitron font-bold" style={{ fontSize: "14px", color: "#C9A84C", letterSpacing: "0.06em" }}>
              КОШЕЛЬКИ
            </h3>
            <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)" }}>
              <X size={14} style={{ color: "rgba(255,255,255,0.45)" }} />
            </button>
          </div>

          {/* Chain filter */}
          <div className="flex gap-2 px-5 mb-4">
            {CHAIN_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setChain(tab.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
                style={{
                  background: chain === tab.id ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${chain === tab.id ? "rgba(201,168,76,0.35)" : "rgba(255,255,255,0.07)"}`,
                  color: chain === tab.id ? "#C9A84C" : "rgba(255,255,255,0.40)",
                  fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
                  transition: "all 0.18s ease",
                }}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Wallet list */}
          <div className="flex-1 overflow-y-auto px-5 pb-2">
            {filtered.length === 0 ? (
              <div className="text-center py-8">
                <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "12px" }}>Нет кошельков для этой сети</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {filtered.map(w => (
                  <WalletRow
                    key={w.address}
                    wallet={w}
                    active={w.address === activeAddress}
                    onSelect={() => { onSelect(w.address); onClose(); }}
                    onDelete={() => setDeleteTarget(w)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Add wallet */}
          <div className="px-5 pt-3 pb-8">
            <button
              onClick={() => { onAddWallet(); onClose(); }}
              className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2"
              style={{
                background: "rgba(201,168,76,0.05)", border: "1px dashed rgba(201,168,76,0.22)",
                color: "rgba(240,235,224,0.65)", fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.08em",
                transition: "all 0.18s ease",
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.09)"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "rgba(201,168,76,0.05)"; }}
            >
              <Plus size={14} />
              Добавить кошелёк
            </button>
          </div>
        </div>
      </div>

      {/* Confirm delete sheet */}
      {deleteTarget && (
        <ConfirmDeleteSheet
          wallet={deleteTarget}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
