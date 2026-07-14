import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useWallet } from "@solana/wallet-adapter-react";
import { useOkoWallet } from "@/context/WalletContext";
import WalletPickerModal from "@/components/WalletPickerModal";
import CreateWalletModal from "@/components/CreateWalletModal";
import ImportWalletModal from "@/components/ImportWalletModal";
import { ArrowRight, Wallet, Zap, Shield, ChevronLeft, Check, FileInput } from "lucide-react";

// ── Single clean option card ───────────────────────────────────────────────

function OptionCard({
  icon,
  label,
  title,
  desc,
  features,
  btnLabel,
  btnPrimary = false,
  sub,
  loading = false,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  desc: string;
  features: string[];
  btnLabel: string;
  btnPrimary?: boolean;
  sub: string;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        background: "#111111",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "20px 20px 16px",
        transition: "border-color 0.2s ease",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.14)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "rgba(255,255,255,0.08)"; }}
    >
      {/* Top row */}
      <div className="flex items-center gap-3 mb-3">
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(240,235,224,0.55)",
          flexShrink: 0,
        }}>
          {icon}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "7.5px", fontWeight: 600,
            letterSpacing: "0.14em",
            color: "rgba(201,168,76,0.60)",
            textTransform: "uppercase",
            marginBottom: 3,
          }}>
            {label}
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: "14px", fontWeight: 700,
            color: "#F0EBE0", letterSpacing: "0.02em",
          }}>
            {title}
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{
        fontSize: "12px", lineHeight: 1.65,
        color: "rgba(240,235,224,0.35)",
        margin: "0 0 14px",
      }}>
        {desc}
      </p>

      {/* Feature list */}
      <div className="flex flex-col gap-2 mb-5">
        {features.map((f, i) => (
          <div key={i} className="flex items-center gap-2.5">
            <div style={{
              width: 14, height: 14, borderRadius: "50%",
              background: "rgba(201,168,76,0.10)",
              border: "1px solid rgba(201,168,76,0.22)",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <Check size={8} style={{ color: "#C9A84C" }} />
            </div>
            <span style={{ fontSize: "11.5px", color: "rgba(240,235,224,0.40)" }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Button */}
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          width: "100%",
          height: 48,
          borderRadius: 12,
          background: btnPrimary ? "#F0EBE0" : "transparent",
          border: btnPrimary ? "none" : "1px solid rgba(255,255,255,0.14)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: "11px", fontWeight: 700,
          letterSpacing: "0.10em",
          color: btnPrimary ? "#080808" : "rgba(240,235,224,0.60)",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
          transition: "all 0.2s ease",
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement;
          if (btnPrimary) { el.style.background = "#FFFFFF"; }
          else { el.style.borderColor = "rgba(255,255,255,0.25)"; el.style.color = "rgba(240,235,224,0.85)"; }
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement;
          if (btnPrimary) { el.style.background = "#F0EBE0"; }
          else { el.style.borderColor = "rgba(255,255,255,0.14)"; el.style.color = "rgba(240,235,224,0.60)"; }
        }}
      >
        {loading ? (
          <>
            <div className="w-4 h-4 rounded-full border-2 animate-spin"
              style={{ borderColor: "rgba(8,8,8,0.3)", borderTopColor: "#080808" }} />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <span>{btnLabel}</span>
            <ArrowRight size={14} strokeWidth={2.5} />
          </>
        )}
      </button>

      <p style={{
        color: "rgba(240,235,224,0.18)",
        fontSize: "10px",
        textAlign: "center",
        marginTop: 10,
        letterSpacing: "0.02em",
      }}>
        {sub}
      </p>
    </div>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
      <span style={{ color: "rgba(240,235,224,0.18)", fontSize: "11px" }}>or</span>
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function WalletSelect() {
  const { t } = useTranslation();
  const [, navigate]              = useLocation();
  const { setConnected }          = useOkoWallet();
  const { connected, publicKey }  = useWallet();

  const [mounted,           setMounted]           = useState(false);
  const [walletPickerOpen,  setWalletPickerOpen]  = useState(false);
  const [createWalletOpen,  setCreateWalletOpen]  = useState(false);
  const [importWalletOpen,  setImportWalletOpen]  = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  useEffect(() => {
    if (connected && publicKey) {
      setConnected("adapter", publicKey.toBase58());
      setWalletPickerOpen(false);
      setTimeout(() => navigate("/markets"), 500);
    }
  }, [connected, publicKey]);

  const anim = (delay: string) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? "translateY(0)" : "translateY(20px)",
    transition: `opacity 0.5s ease ${delay}, transform 0.5s ease ${delay}`,
  });

  return (
    <div
      className="min-h-screen min-h-dvh"
      style={{ background: "#080808" }}
    >
      <div className="min-h-screen flex flex-col px-4 pb-10 max-w-sm mx-auto">

        {/* Back */}
        <div style={anim("0ms")} className="pt-5 pb-2">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl"
            style={{
              color: "rgba(240,235,224,0.40)",
              fontSize: "11px",
              fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <ChevronLeft size={13} />
            Back
          </button>
        </div>

        {/* Page header */}
        <div className="pt-6 pb-8" style={anim("60ms")}>
          {/* Secure pill */}
          <div className="flex items-center gap-2 mb-5">
            <span className="w-1.5 h-1.5 rounded-full pulse-dot" style={{ background: "#C9A84C", display: "inline-block" }} />
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "9px", fontWeight: 600,
              letterSpacing: "0.14em",
              color: "#C9A84C",
              textTransform: "uppercase",
            }}>
              Secure Connection
            </span>
          </div>

          <h1
            className="font-orbitron font-bold mb-2"
            style={{
              fontSize: "clamp(24px, 7vw, 30px)",
              letterSpacing: "0.02em",
              color: "#F0EBE0",
              margin: "0 0 8px",
            }}
          >
            {t("wallet.title")}
          </h1>
          <p style={{ color: "rgba(240,235,224,0.35)", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
            {t("wallet.subtitle")}
          </p>
        </div>

        {/* Option cards */}
        <div className="flex flex-col gap-3 w-full" style={anim("140ms")}>

          {/* Create Wallet — primary */}
          <OptionCard
            icon={<Zap size={20} strokeWidth={1.8} />}
            label="Instant · No Account"
            title={t("wallet.create_title")}
            desc="Generate a real Solana keypair instantly. Protected by your password. Your keys stay on your device."
            features={[
              "Real Ed25519 Solana keypair",
              "AES-256 encrypted with your password",
              "Keys stored locally on your device",
              "Ready to receive SOL & tokens",
            ]}
            btnLabel={t("wallet.create_btn")}
            btnPrimary
            sub="Ed25519 · AES-256 · Local storage only"
            onClick={() => setCreateWalletOpen(true)}
          />

          <Divider />

          {/* Import by seed */}
          <OptionCard
            icon={<FileInput size={20} strokeWidth={1.8} />}
            label="Restore Wallet"
            title="Импорт по сид-фразе"
            desc="Уже есть кошелёк Solana? Войдите с 12-словной сид-фразой. Совместимо с Phantom, Solflare, Trust Wallet."
            features={[
              "Совместимо с Phantom, Solflare, Trust",
              "Деривация BIP44 m/44'/501'/0'/0'",
              "AES-256 шифрование паролем",
              "Ключи хранятся только на устройстве",
            ]}
            btnLabel="Войти по сид-фразе"
            sub="12-словная BIP39 · AES-256"
            onClick={() => setImportWalletOpen(true)}
          />

          <Divider />

          {/* Connect existing wallet */}
          <OptionCard
            icon={<Wallet size={20} strokeWidth={1.8} />}
            label={t("wallet.connect_badge")}
            title={t("wallet.connect_title")}
            desc={t("wallet.connect_desc")}
            features={[
              "Phantom, Solflare, Torus, Ledger",
              "Full self-custody control",
              "Hardware wallet support",
              "Backpack & more via Wallet Standard",
            ]}
            btnLabel={t("wallet.connect_btn")}
            sub={t("wallet.connect_sub")}
            onClick={() => setWalletPickerOpen(true)}
          />
        </div>

        {/* Security note */}
        <div className="mt-6 flex justify-center" style={anim("220ms")}>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <Shield size={11} style={{ color: "rgba(201,168,76,0.45)" }} />
            <span style={{ color: "rgba(240,235,224,0.20)", fontSize: "10px", letterSpacing: "0.03em" }}>
              {t("wallet.secure_note")}
            </span>
          </div>
        </div>
      </div>

      <WalletPickerModal
        open={walletPickerOpen}
        onClose={() => setWalletPickerOpen(false)}
      />
      <CreateWalletModal
        open={createWalletOpen}
        onClose={() => setCreateWalletOpen(false)}
        onCreated={(addr) => { setConnected("generated", addr); navigate("/markets"); }}
      />
      <ImportWalletModal
        open={importWalletOpen}
        onClose={() => setImportWalletOpen(false)}
        onImported={(addr) => { setConnected("generated", addr); navigate("/markets"); }}
      />
    </div>
  );
}
