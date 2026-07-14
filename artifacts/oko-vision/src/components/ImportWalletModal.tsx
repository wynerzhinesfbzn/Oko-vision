import { useState, useEffect, useRef } from "react";
import { Keypair } from "@solana/web3.js";
import * as bip39 from "bip39";
import { derivePath } from "ed25519-hd-key";
import {
  X, Eye, EyeOff, AlertTriangle, Check, Download, ChevronLeft,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

async function encryptData(data: string, password: string): Promise<string> {
  const enc = new TextEncoder();
  const km  = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const key  = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["encrypt"],
  );
  const ct  = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(data));
  const buf = new Uint8Array([...salt, ...iv, ...new Uint8Array(ct)]);
  return btoa(String.fromCharCode(...buf));
}

function mnemonicToKeypair(mnemonic: string): Keypair {
  const seed = bip39.mnemonicToSeedSync(mnemonic.trim().toLowerCase());
  const { key } = derivePath("m/44'/501'/0'/0'", Buffer.from(seed).toString("hex"));
  return Keypair.fromSeed(key);
}

// ── Word input grid ──────────────────────────────────────────────────────────

function WordGrid({
  words, onChange,
}: {
  words: string[];
  onChange: (words: string[]) => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const update = (i: number, val: string) => {
    // Handle paste of full mnemonic into any cell
    const trimmed = val.trim();
    const split   = trimmed.split(/\s+/);
    if (split.length >= 12) {
      const next = Array(12).fill("").map((_, k) => (split[k] ?? "").toLowerCase().trim());
      onChange(next);
      // Focus last filled input
      const last = Math.min(split.length - 1, 11);
      setTimeout(() => refs.current[last]?.focus(), 30);
      return;
    }
    const next = [...words];
    next[i]    = val.toLowerCase().trim();
    onChange(next);
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === " " || e.key === "Tab" || e.key === "Enter") && i < 11) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
    if (e.key === "Backspace" && words[i] === "" && i > 0) {
      refs.current[i - 1]?.focus();
    }
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {words.map((w, i) => {
        const valid = w === "" ? null : bip39.wordlists.english.includes(w);
        return (
          <div key={i} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${w && valid === false ? "rgba(255,60,60,0.35)" : w && valid ? "rgba(201,168,76,0.22)" : "rgba(255,255,255,0.09)"}`,
              transition: "border-color 0.15s ease",
            }}>
            <span style={{ color: "rgba(240,235,224,0.38)", fontSize: "9.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, minWidth: 14, flexShrink: 0 }}>
              {i + 1}
            </span>
            <input
              ref={el => { refs.current[i] = el; }}
              value={w}
              onChange={e => update(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              onPaste={i === 0 ? undefined : undefined}
              placeholder="word"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="flex-1 bg-transparent outline-none min-w-0"
              style={{
                color: valid === false && w ? "rgba(255,100,100,0.85)" : valid ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.55)",
                fontSize: "12px", fontFamily: "monospace", fontWeight: 600,
                caretColor: "#C9A84C",
              }}
            />
            {w && (
              <div style={{ flexShrink: 0 }}>
                {valid
                  ? <Check size={9} style={{ color: "rgba(240,235,224,0.50)" }} />
                  : <span style={{ fontSize: "9px", color: "rgba(255,80,80,0.60)" }}>✗</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Step = "phrase" | "password" | "done";

interface Props {
  open:      boolean;
  onClose:   () => void;
  onImported: (address: string) => void;
}

export default function ImportWalletModal({ open, onClose, onImported }: Props) {
  const [step, setStep]     = useState<Step>("phrase");
  const [words, setWords]   = useState<string[]>(Array(12).fill(""));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [resultAddr, setResultAddr] = useState("");
  const [visible, setVisible]   = useState(false);

  useEffect(() => {
    if (open) {
      setStep("phrase"); setWords(Array(12).fill("")); setPassword("");
      setConfirm(""); setError(""); setResultAddr("");
      setTimeout(() => setVisible(true), 30);
    } else { setVisible(false); }
  }, [open]);

  // ── Validation ──────────────────────────────────────────────────────────────

  const mnemonic    = words.join(" ").trim();
  const allFilled   = words.every(w => w.length > 0);
  const mnemonicOk  = allFilled && bip39.validateMnemonic(mnemonic);
  const filledCount = words.filter(w => w.length > 0).length;

  const pwStrength = password.length >= 16 ? 4 : password.length >= 12 ? 3 : password.length >= 8 ? 2 : password.length > 0 ? 1 : 0;
  const strengthColors = ["", "#ff4444", "#C9A84C", "#C9A84C", "#C9A84C"];

  // ── Step 1 → 2 ─────────────────────────────────────────────────────────────

  const goPassword = () => {
    if (!mnemonicOk) { setError("Сид-фраза содержит ошибку. Проверьте правильность слов."); return; }
    setError(""); setStep("password");
  };

  // ── Step 2 → done ──────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (password.length < 8) { setError("Пароль должен содержать минимум 8 символов"); return; }
    if (password !== confirm) { setError("Пароли не совпадают"); return; }
    setError(""); setLoading(true);
    try {
      const kp   = mnemonicToKeypair(mnemonic);
      const addr = kp.publicKey.toBase58();

      const [encMnemonic, encPrivKey] = await Promise.all([
        encryptData(mnemonic, password),
        encryptData(Buffer.from(kp.secretKey).toString("hex"), password),
      ]);

      localStorage.setItem(`oko-wallet-${addr}`, JSON.stringify({
        type: "generated", publicKey: addr,
        rawMnemonic: mnemonic,
        rawPrivKey: Buffer.from(kp.secretKey).toString("hex"),
        encMnemonic, encPrivKey, createdAt: Date.now(),
      }));
      localStorage.setItem("oko-active-wallet", addr);

      setResultAddr(addr);
      setStep("done");
    } catch (e: any) {
      setError("Ошибка импорта: " + (e?.message ?? String(e)));
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
      style={{
        background: "rgba(5,5,20,0.90)", backdropFilter: "blur(14px)",
        opacity: visible ? 1 : 0, transition: "opacity 0.25s ease",
      }}
      onClick={e => e.target === e.currentTarget && step !== "done" && onClose()}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0D120D 0%, #080808 100%)",
          border: "1px solid rgba(201,168,76,0.18)",
          boxShadow: "0 0 60px rgba(201,168,76,0.10), 0 -8px 60px rgba(0,0,0,0.7)",
          transform: visible ? "translateY(0)" : "translateY(24px)",
          transition: "transform 0.35s cubic-bezier(0.16,1,0.3,1)",
          maxHeight: "93vh", overflowY: "auto",
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
        </div>

        {/* ── STEP 1: Enter phrase ─────────────────────────────────────── */}
        {step === "phrase" && (
          <div className="px-5 pt-2 pb-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-orbitron font-bold" style={{ fontSize: "14px", color: "#C9A84C", letterSpacing: "0.06em" }}>
                  ИМПОРТ КОШЕЛЬКА
                </h3>
                <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "11px", marginTop: 2 }}>
                  Введите 12-словную сид-фразу
                </p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}>
                <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>

            {/* Security notice */}
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl mb-4"
              style={{ background: "rgba(255,80,0,0.06)", border: "1px solid rgba(255,80,0,0.18)" }}>
              <AlertTriangle size={13} style={{ color: "#ff8030", marginTop: 1, flexShrink: 0 }} />
              <p style={{ color: "rgba(255,160,80,0.80)", fontSize: "11px", lineHeight: 1.65 }}>
                Вводите сид-фразу только в надёжном месте. Убедитесь, что рядом нет посторонних.
              </p>
            </div>

            {/* Counter */}
            <div className="flex items-center justify-between mb-3">
              <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.06em" }}>
                СЛОВА ({filledCount}/12)
              </p>
              {mnemonicOk && (
                <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>
                  ✓ Фраза верна
                </span>
              )}
              {allFilled && !mnemonicOk && (
                <span style={{ color: "#ff5050", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>
                  ✗ Ошибка в фразе
                </span>
              )}
            </div>

            <WordGrid words={words} onChange={setWords} />

            {/* Paste hint */}
            <p style={{ color: "rgba(255,255,255,0.18)", fontSize: "10px", textAlign: "center", marginTop: 10, marginBottom: 4, lineHeight: 1.6 }}>
              Вы можете вставить всю фразу сразу в первое поле
            </p>

            {error && (
              <div className="flex items-center gap-2 mt-3 px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.20)" }}>
                <AlertTriangle size={12} style={{ color: "#ff6060", flexShrink: 0 }} />
                <span style={{ color: "rgba(255,130,130,0.90)", fontSize: "12px" }}>{error}</span>
              </div>
            )}

            <button
              onClick={goPassword}
              disabled={!allFilled}
              className="w-full mt-4 py-4 rounded-2xl font-orbitron font-bold flex items-center justify-center gap-2"
              style={{
                background: mnemonicOk
                  ? "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.09))"
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${mnemonicOk ? "rgba(201,168,76,0.38)" : "rgba(255,255,255,0.08)"}`,
                color: mnemonicOk ? "#C9A84C" : "rgba(255,255,255,0.20)",
                fontSize: "11px", letterSpacing: "0.10em", textTransform: "uppercase",
                opacity: !allFilled ? 0.5 : 1,
                cursor: !allFilled ? "not-allowed" : "pointer",
              }}
            >
              Далее — задать пароль →
            </button>
          </div>
        )}

        {/* ── STEP 2: Set password ─────────────────────────────────────── */}
        {step === "password" && (
          <div className="px-5 pt-2 pb-6">
            <div className="flex items-center gap-2 mb-4">
              <button onClick={() => { setStep("phrase"); setError(""); }}
                className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <ChevronLeft size={14} style={{ color: "rgba(255,255,255,0.45)" }} />
              </button>
              <div>
                <h3 className="font-orbitron font-bold" style={{ fontSize: "14px", color: "#C9A84C", letterSpacing: "0.06em" }}>
                  ЗАЩИТА КОШЕЛЬКА
                </h3>
                <p style={{ color: "rgba(255,255,255,0.30)", fontSize: "11px", marginTop: 1 }}>
                  Установите пароль для шифрования
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-5"
              style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}>
              <span style={{ fontSize: "13px" }}>🔐</span>
              <p style={{ color: "rgba(240,235,224,0.65)", fontSize: "11px", lineHeight: 1.55 }}>
                Пароль шифрует вашу сид-фразу на этом устройстве. Без него расшифровка невозможна.
              </p>
            </div>

            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label style={{ color: "rgba(255,255,255,0.40)", fontSize: "10px", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Новый пароль
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
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {password.length > 0 && (
                <div className="flex gap-1">
                  {[1,2,3,4].map(l => (
                    <div key={l} className="flex-1 h-1 rounded-full"
                      style={{ background: pwStrength >= l ? strengthColors[l] : "rgba(255,255,255,0.07)", transition: "background 0.2s" }} />
                  ))}
                </div>
              )}

              <div>
                <label style={{ color: "rgba(255,255,255,0.40)", fontSize: "10px", letterSpacing: "0.07em", textTransform: "uppercase", fontFamily: "'Space Grotesk', sans-serif" }}>
                  Повторите пароль
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && handleImport()}
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
              <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-xl"
                style={{ background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.20)" }}>
                <AlertTriangle size={12} style={{ color: "#ff6060", flexShrink: 0 }} />
                <span style={{ color: "rgba(255,130,130,0.90)", fontSize: "12px" }}>{error}</span>
              </div>
            )}

            <button
              onClick={handleImport}
              disabled={loading || !password || !confirm}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 relative overflow-hidden"
              style={{
                background: "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.09))",
                border: "1px solid rgba(201,168,76,0.38)",
                boxShadow: "0 0 28px rgba(201,168,76,0.16)",
                color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif",
                fontSize: "11px", fontWeight: 700, letterSpacing: "0.10em", textTransform: "uppercase",
                opacity: loading || !password || !confirm ? 0.5 : 1,
                cursor: loading || !password || !confirm ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} /><span>Импорт...</span></>
                : <><Download size={14} /> Импортировать кошелёк</>}
            </button>
          </div>
        )}

        {/* ── STEP 3: Done ─────────────────────────────────────────────── */}
        {step === "done" && (
          <div className="px-5 pt-4 pb-8 text-center">
            <div className="flex justify-center mb-5">
              <div style={{
                width: 80, height: 80, borderRadius: "50%",
                background: "radial-gradient(circle, rgba(201,168,76,0.15), rgba(201,168,76,0.03) 70%)",
                border: "1.5px solid rgba(201,168,76,0.30)",
                boxShadow: "0 0 40px rgba(201,168,76,0.18)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Check size={32} style={{ color: "#C9A84C", filter: "drop-shadow(0 0 10px #C9A84C)" }} />
              </div>
            </div>

            <h3 className="font-orbitron font-bold mb-2" style={{ fontSize: "16px", color: "#C9A84C", letterSpacing: "0.04em" }}>
              Кошелёк импортирован!
            </h3>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px", lineHeight: 1.7, marginBottom: 18 }}>
              Ваш существующий кошелёк успешно добавлен в OKO Vision Terminal.
            </p>

            <div className="text-left mb-5 px-4 py-3.5 rounded-2xl"
              style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.14)" }}>
              <p style={{ color: "rgba(240,235,224,0.45)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.08em", marginBottom: 5 }}>
                АДРЕС КОШЕЛЬКА (SOLANA)
              </p>
              <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "11px", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.6 }}>
                {resultAddr}
              </p>
            </div>

            <div className="flex flex-col gap-2 mb-5">
              {[
                "Сид-фраза зашифрована и хранится только на вашем устройстве",
                "Совместимо: Phantom, Solflare, Backpack и другие",
              ].map((t, i) => (
                <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-left"
                  style={{ background: "rgba(201,168,76,0.05)", border: "1px solid rgba(201,168,76,0.14)" }}>
                  <Check size={11} style={{ color: "#C9A84C", flexShrink: 0 }} />
                  <span style={{ color: "rgba(0,200,100,0.75)", fontSize: "11px" }}>{t}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => { onImported(resultAddr); onClose(); }}
              className="w-full py-4 rounded-2xl font-orbitron font-bold"
              style={{
                background: "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.09))",
                border: "1px solid rgba(201,168,76,0.38)",
                boxShadow: "0 0 28px rgba(201,168,76,0.18)",
                color: "#C9A84C", fontSize: "11px", letterSpacing: "0.10em", textTransform: "uppercase",
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
