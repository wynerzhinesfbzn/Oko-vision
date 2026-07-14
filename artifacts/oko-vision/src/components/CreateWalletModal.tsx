import { useState, useEffect } from "react";
import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import {
  X, Eye, EyeOff, Copy, Check, AlertTriangle, Lock,
  ShieldAlert, EyeIcon, EyeOffIcon,
} from "lucide-react";

// ── Crypto helpers ──────────────────────────────────────────────────────────

async function encryptData(data: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const km = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(data));
  const buf = new Uint8Array([...salt, ...iv, ...new Uint8Array(ct)]);
  return btoa(String.fromCharCode(...buf));
}

function mnemonicToKeypair(mnemonic: string): Keypair {
  const seed = bip39.mnemonicToSeedSync(mnemonic);
  const { key } = derivePath("m/44'/501'/0'/0'", Buffer.from(seed).toString("hex"));
  return Keypair.fromSeed(key);
}

// ── Security Warning ────────────────────────────────────────────────────────

function SecurityWarning({ onAccept }: { onAccept: () => void }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="px-5 pt-4 pb-6">
      <div className="flex justify-center mb-4">
        <div style={{
          width: 72, height: 72, borderRadius: "50%",
          background: "rgba(255,80,0,0.10)", border: "1.5px solid rgba(255,80,0,0.35)",
          boxShadow: "0 0 30px rgba(255,80,0,0.18)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ShieldAlert size={32} style={{ color: "#ff6020", filter: "drop-shadow(0 0 8px #ff6020)" }} />
        </div>
      </div>

      <h3 className="font-orbitron font-bold text-center mb-2" style={{ fontSize: "15px", color: "#ff8040", letterSpacing: "0.04em" }}>
        ⚠️ ВАЖНОЕ ПРЕДУПРЕЖДЕНИЕ
      </h3>
      <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "11.5px", lineHeight: 1.75, textAlign: "center", marginBottom: 18 }}>
        Сид-фраза — это полный доступ к вашему кошельку.
      </p>

      <div className="flex flex-col gap-2.5 mb-5">
        {[
          { icon: "🚫", text: "Никогда не давайте сид-фразу другим людям, даже поддержке" },
          { icon: "📵", text: "Не делайте скриншот и не сохраняйте в заметках или облаке" },
          { icon: "👀", text: "Убедитесь, что рядом нет посторонних, которые могут увидеть экран" },
          { icon: "🔐", text: "Кто знает сид-фразу — тот контролирует все средства кошелька" },
        ].map((item, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
            style={{ background: "rgba(255,80,0,0.06)", border: "1px solid rgba(255,80,0,0.14)" }}>
            <span style={{ fontSize: "14px", flexShrink: 0 }}>{item.icon}</span>
            <span style={{ color: "rgba(255,200,160,0.80)", fontSize: "11px", lineHeight: 1.6 }}>{item.text}</span>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-3 px-3 py-3 rounded-xl mb-4 cursor-pointer"
        style={{ background: agreed ? "rgba(201,168,76,0.05)" : "rgba(255,255,255,0.02)", border: `1px solid ${agreed ? "rgba(201,168,76,0.20)" : "rgba(255,255,255,0.08)"}` }}>
        <div
          onClick={() => setAgreed(!agreed)}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, cursor: "pointer",
            background: agreed ? "rgba(201,168,76,0.20)" : "rgba(255,255,255,0.06)",
            border: `1.5px solid ${agreed ? "rgba(201,168,76,0.50)" : "rgba(255,255,255,0.15)"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "all 0.2s ease",
          }}
        >
          {agreed && <Check size={12} style={{ color: "#C9A84C" }} />}
        </div>
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px", lineHeight: 1.5 }}>
          Я понимаю, что сид-фраза даёт полный доступ к кошельку, и беру ответственность за её сохранность
        </span>
      </label>

      <button
        onClick={onAccept}
        disabled={!agreed}
        className="w-full py-4 rounded-2xl font-orbitron font-bold"
        style={{
          background: agreed ? "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.10))" : "rgba(255,255,255,0.04)",
          border: `1px solid ${agreed ? "rgba(201,168,76,0.38)" : "rgba(255,255,255,0.08)"}`,
          color: agreed ? "#C9A84C" : "rgba(255,255,255,0.2)",
          fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase",
          cursor: agreed ? "pointer" : "not-allowed", transition: "all 0.25s ease",
        }}
      >
        Понял, показать сид-фразу →
      </button>
    </div>
  );
}

// ── Seed phrase grid ─────────────────────────────────────────────────────────

function SeedGrid({ words, showAll }: { words: string[]; showAll: boolean }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (showAll) setRevealed(new Set(words.map((_, i) => i)));
    else setRevealed(new Set());
  }, [showAll, words]);

  const toggle = (i: number) => setRevealed(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  return (
    <div className="grid grid-cols-2 gap-2">
      {words.map((word, i) => {
        const show = revealed.has(i);
        return (
          <button
            key={i}
            onClick={() => toggle(i)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left"
            style={{
              background: show ? "rgba(201,168,76,0.07)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${show ? "rgba(201,168,76,0.22)" : "rgba(255,255,255,0.08)"}`,
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ color: "rgba(201,168,76,0.40)", fontSize: "9.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, minWidth: 14 }}>
              {i + 1}
            </span>
            <span style={{
              fontFamily: show ? "monospace" : "monospace",
              fontSize: "12px",
              fontWeight: 600,
              color: show ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.25)",
              letterSpacing: show ? "0.03em" : "0.15em",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {show ? word : "••••••"}
            </span>
            {show
              ? <EyeOffIcon size={9} style={{ color: "rgba(201,168,76,0.30)", flexShrink: 0 }} />
              : <EyeIcon    size={9} style={{ color: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
            }
          </button>
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

interface Props { open: boolean; onClose: () => void; onCreated: (address: string) => void; }
type Step = "password" | "warning" | "reveal" | "done";

export default function CreateWalletModal({ open, onClose, onCreated }: Props) {
  const [step, setStep]       = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [copied, setCopied]   = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setStep("password"); setPassword(""); setConfirm(""); setError("");
      setMnemonic(""); setPublicKey(""); setShowAll(false); setCopied(false);
      setTimeout(() => setVisible(true), 30);
    } else { setVisible(false); }
  }, [open]);

  const handleCreate = async () => {
    if (password.length < 8) { setError("Пароль должен содержать минимум 8 символов"); return; }
    if (password !== confirm) { setError("Пароли не совпадают"); return; }
    setError(""); setLoading(true);
    try {
      // Generate real BIP39 mnemonic (12 words = 128 bits entropy)
      const mn  = bip39.generateMnemonic(128);
      const kp  = mnemonicToKeypair(mn);
      const addr = kp.publicKey.toBase58();

      // Encrypt mnemonic and private key
      const [encMnemonic, encPrivKey] = await Promise.all([
        encryptData(mn, password),
        encryptData(Buffer.from(kp.secretKey).toString("hex"), password),
      ]);

      localStorage.setItem(`oko-wallet-${addr}`, JSON.stringify({
        type: "generated", publicKey: addr,
        rawMnemonic: mn,
        rawPrivKey: Buffer.from(kp.secretKey).toString("hex"),
        encMnemonic, encPrivKey, createdAt: Date.now(),
      }));
      localStorage.setItem("oko-active-wallet", addr);

      setMnemonic(mn); setPublicKey(addr); setStep("warning");
    } catch (e: any) {
      setError("Ошибка создания кошелька: " + (e?.message ?? e));
    } finally { setLoading(false); }
  };

  const words = mnemonic ? mnemonic.split(" ") : [];

  const copyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  const pwStrength = password.length >= 16 ? 4 : password.length >= 12 ? 3 : password.length >= 8 ? 2 : password.length > 0 ? 1 : 0;
  const strengthColors = ["", "#ff4444", "#C9A84C", "#C9A84C", "#C9A84C"];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(5,5,20,0.88)", backdropFilter: "blur(14px)",
        opacity: visible ? 1 : 0, transition: "opacity 0.25s ease",
      }}
      onClick={e => e.target === e.currentTarget && step === "password" && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0D120D 0%, #080808 100%)",
          border: "1px solid rgba(201,168,76,0.18)",
          boxShadow: "0 0 60px rgba(201,168,76,0.12), 0 -8px 60px rgba(0,0,0,0.7)",
          transform: visible ? "translateY(0)" : "translateY(24px)",
          transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1)",
          maxHeight: "92vh", overflowY: "auto",
        }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
        </div>

        {/* ── STEP 1: Password ───────────────────────────────────────────── */}
        {step === "password" && (
          <div className="px-5 pt-2 pb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-orbitron font-bold" style={{ fontSize: "14px", color: "#C9A84C", letterSpacing: "0.06em" }}>
                  СОЗДАТЬ КОШЕЛЁК
                </h3>
                <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "11px", marginTop: 2 }}>
                  Настоящий Solana-кошелёк с BIP39 сид-фразой
                </p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>

            <div className="flex justify-center mb-5">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.22)", boxShadow: "0 0 30px rgba(201,168,76,0.12)" }}>
                <Lock size={28} style={{ color: "#C9A84C", filter: "drop-shadow(0 0 8px #C9A84C)" }} />
              </div>
            </div>

            {/* Info row */}
            <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}>
              <span style={{ fontSize: "13px" }}>🔑</span>
              <p style={{ color: "rgba(240,235,224,0.65)", fontSize: "11px", lineHeight: 1.55 }}>
                Будет сгенерирована настоящая 12-словная BIP39 сид-фраза, совместимая с Phantom, Solflare и другими кошельками
              </p>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Пароль для шифрования
                </label>
                <div className="relative mt-1.5">
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(""); }}
                    placeholder="Минимум 8 символов"
                    className="w-full px-4 py-3 rounded-xl pr-12 outline-none"
                    style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.18)", color: "rgba(255,255,255,0.85)", fontSize: "14px", caretColor: "#C9A84C" }}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: "rgba(255,255,255,0.3)" }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {password.length > 0 && (
                <div className="flex gap-1">
                  {[1,2,3,4].map(l => (
                    <div key={l} className="flex-1 h-1 rounded-full" style={{
                      background: pwStrength >= l ? strengthColors[l] : "rgba(255,255,255,0.07)",
                      transition: "background 0.2s ease",
                    }} />
                  ))}
                </div>
              )}

              <div>
                <label style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Подтвердить пароль
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(""); }}
                  placeholder="Повторите пароль"
                  className="w-full mt-1.5 px-4 py-3 rounded-xl outline-none"
                  style={{
                    background: "rgba(201,168,76,0.04)",
                    border: `1px solid ${confirm && confirm !== password ? "rgba(255,80,80,0.35)" : "rgba(201,168,76,0.18)"}`,
                    color: "rgba(255,255,255,0.85)", fontSize: "14px", caretColor: "#C9A84C",
                  }}
                  autoComplete="new-password"
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.20)" }}>
                <AlertTriangle size={12} style={{ color: "#ff6060", flexShrink: 0 }} />
                <span style={{ color: "rgba(255,150,150,0.9)", fontSize: "12px" }}>{error}</span>
              </div>
            )}

            <div className="flex items-start gap-2 mb-4 px-3 py-2.5 rounded-xl"
              style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.14)" }}>
              <AlertTriangle size={12} style={{ color: "#C9A84C", marginTop: 2, flexShrink: 0 }} />
              <p style={{ color: "rgba(201,168,76,0.60)", fontSize: "11px", lineHeight: 1.55 }}>
                Запомните пароль — он шифрует вашу сид-фразу. Восстановить его невозможно.
              </p>
            </div>

            <button
              onClick={handleCreate}
              disabled={loading || !password || !confirm}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.09))",
                border: "1px solid rgba(201,168,76,0.38)",
                boxShadow: "0 0 28px rgba(201,168,76,0.18)",
                color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
                opacity: loading || !password || !confirm ? 0.5 : 1,
                cursor: loading || !password || !confirm ? "not-allowed" : "pointer",
              }}
            >
              {loading ? (
                <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} /><span>Генерация...</span></>
              ) : <span>Создать кошелёк →</span>}
            </button>
          </div>
        )}

        {/* ── STEP 2: Security warning ───────────────────────────────────── */}
        {step === "warning" && (
          <>
            <div className="flex items-center justify-between px-5 pt-2 mb-1">
              <h3 className="font-orbitron font-bold" style={{ fontSize: "13px", color: "#ff8040", letterSpacing: "0.06em" }}>БЕЗОПАСНОСТЬ</h3>
            </div>
            <SecurityWarning onAccept={() => setStep("reveal")} />
          </>
        )}

        {/* ── STEP 3: Reveal seed phrase ─────────────────────────────────── */}
        {step === "reveal" && (
          <div className="px-5 pt-2 pb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-orbitron font-bold" style={{ fontSize: "13px", color: "#C9A84C", letterSpacing: "0.06em" }}>
                  КОШЕЛЁК СОЗДАН
                </h3>
                <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "11px", marginTop: 2 }}>Сохраните вашу сид-фразу</p>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-full"
                style={{ background: "rgba(201,168,76,0.10)", border: "1px solid rgba(201,168,76,0.25)" }}>
                <Check size={10} style={{ color: "#C9A84C" }} />
                <span style={{ color: "#C9A84C", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>READY</span>
              </div>
            </div>

            {/* Address */}
            <div className="mb-4 px-3.5 py-3 rounded-xl"
              style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.14)" }}>
              <p style={{ color: "rgba(240,235,224,0.45)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em", marginBottom: 4 }}>
                АДРЕС КОШЕЛЬКА (SOLANA)
              </p>
              <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "11px", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.6 }}>
                {publicKey}
              </p>
            </div>

            {/* Seed phrase grid */}
            <div className="mb-3">
              <div className="flex items-center justify-between mb-3">
                <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.07em" }}>
                  СИД-ФРАЗА (12 СЛОВ)
                </p>
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                  style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.16)", color: "rgba(240,235,224,0.70)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}>
                  {showAll ? <><EyeOff size={10} /> Скрыть все</> : <><Eye size={10} /> Показать все</>}
                </button>
              </div>
              <SeedGrid words={words} showAll={showAll} />
            </div>

            <p style={{ color: "rgba(255,255,255,0.25)", fontSize: "10.5px", lineHeight: 1.7, textAlign: "center", marginBottom: 14 }}>
              Эти 12 слов — ключ к вашему кошельку.<br />
              <span style={{ color: "rgba(255,100,50,0.70)", fontWeight: 600 }}>Не делитесь ими ни с кем. Никогда.</span>
            </p>

            <button
              onClick={copyMnemonic}
              className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 mb-3"
              style={{
                background: copied ? "rgba(201,168,76,0.10)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${copied ? "rgba(201,168,76,0.30)" : "rgba(255,255,255,0.10)"}`,
                color: copied ? "#C9A84C" : "rgba(255,255,255,0.45)",
                fontFamily: "'Space Grotesk', sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
                transition: "all 0.25s ease",
              }}
            >
              {copied ? <><Check size={13} /> Скопировано!</> : <><Copy size={13} /> Копировать фразу</>}
            </button>

            <button
              onClick={() => { onCreated(publicKey); onClose(); }}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2"
              style={{
                background: "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.09))",
                border: "1px solid rgba(201,168,76,0.38)",
                boxShadow: "0 0 28px rgba(201,168,76,0.18)",
                color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
              }}
            >
              Войти в терминал →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
