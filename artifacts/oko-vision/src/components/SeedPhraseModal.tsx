import { useState } from "react";
import {
  X, Eye, EyeOff, Copy, Check, AlertTriangle, ShieldAlert, Lock, Key,
} from "lucide-react";

async function decryptData(encrypted: string, password: string): Promise<string> {
  const bin = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));
  const salt = bin.slice(0, 16);
  const iv   = bin.slice(16, 28);
  const ct   = bin.slice(28);
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250_000, hash: "SHA-256" },
    km, { name: "AES-GCM", length: 256 }, false, ["decrypt"],
  );
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

function SeedGrid({ words }: { words: string[] }) {
  const [revealAll, setRevealAll] = useState(false);
  const [revealed, setRevealed]  = useState<Set<number>>(new Set());
  const [copied, setCopied]      = useState(false);

  const toggle = (i: number) => setRevealed(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });

  const copyAll = () => {
    navigator.clipboard.writeText(words.join(" "));
    setCopied(true); setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.07em" }}>
          СИД-ФРАЗА — {words.length} СЛОВ
        </p>
        <button
          onClick={() => { setRevealAll(!revealAll); setRevealed(new Set()); }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
          style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.16)", color: "rgba(240,235,224,0.70)", fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {revealAll ? <><EyeOff size={10} /> Скрыть</> : <><Eye size={10} /> Показать все</>}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        {words.map((word, i) => {
          const show = revealAll || revealed.has(i);
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
                fontFamily: "monospace", fontSize: "12px", fontWeight: 600, flex: 1,
                color: show ? "rgba(255,255,255,0.90)" : "rgba(255,255,255,0.20)",
                letterSpacing: show ? "0.03em" : "0.20em",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {show ? word : "••••••"}
              </span>
            </button>
          );
        })}
      </div>

      <p style={{ color: "rgba(255,255,255,0.20)", fontSize: "10px", lineHeight: 1.7, textAlign: "center", marginBottom: 14 }}>
        Эти 12 слов — полный доступ к кошельку.<br />
        <span style={{ color: "rgba(255,100,50,0.65)" }}>Не делитесь ни с кем и не сохраняйте в облаке.</span>
      </p>

      <button
        onClick={copyAll}
        className="w-full py-3 rounded-2xl flex items-center justify-center gap-2"
        style={{
          background: copied ? "rgba(201,168,76,0.10)" : "rgba(255,255,255,0.04)",
          border: `1px solid ${copied ? "rgba(201,168,76,0.30)" : "rgba(255,255,255,0.10)"}`,
          color: copied ? "#C9A84C" : "rgba(255,255,255,0.40)",
          fontFamily: "'Space Grotesk', sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em",
          transition: "all 0.25s ease",
        }}
      >
        {copied ? <><Check size={13} /> Скопировано!</> : <><Copy size={13} /> Копировать фразу</>}
      </button>
    </div>
  );
}

function PrivKeyView({ privKeyHex }: { privKeyHex: string }) {
  const [show, setShow]   = useState(false);
  const [copied, setCopied] = useState<"json" | "hex" | null>(null);

  // Convert hex to JSON array (Phantom import format)
  const jsonArray = JSON.stringify(Array.from(Uint8Array.from(Buffer.from(privKeyHex, "hex"))));

  const copy = (type: "json" | "hex") => {
    navigator.clipboard.writeText(type === "json" ? jsonArray : privKeyHex);
    setCopied(type);
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl"
        style={{ background: "rgba(255,165,0,0.06)", border: "1px solid rgba(255,165,0,0.18)" }}>
        <AlertTriangle size={13} style={{ color: "rgba(255,165,0,0.80)", flexShrink: 0 }} />
        <p style={{ color: "rgba(255,200,100,0.75)", fontSize: "10px", lineHeight: 1.5 }}>
          Сид-фраза зашифрована паролем который ты не помнишь. Ниже — твой <b>приватный ключ</b>. Он даёт такой же полный доступ к кошельку.
        </p>
      </div>

      <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.07em", marginBottom: 10 }}>
        ПРИВАТНЫЙ КЛЮЧ (JSON — для импорта в Phantom)
      </p>

      <div className="relative mb-3 p-3 rounded-xl"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", wordBreak: "break-all" }}>
        <p style={{
          fontFamily: "monospace", fontSize: "11px", lineHeight: 1.5,
          color: show ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.15)",
          letterSpacing: show ? "0" : "0.15em", filter: show ? "none" : "blur(4px)",
          transition: "all 0.2s", userSelect: show ? "text" : "none",
        }}>
          {show ? jsonArray : "•".repeat(40)}
        </p>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setShow(!show)}
          className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.09)", color: "rgba(255,255,255,0.45)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {show ? <><EyeOff size={12} /> Скрыть</> : <><Eye size={12} /> Показать</>}
        </button>
        <button
          onClick={() => copy("json")}
          className="flex-1 py-2.5 rounded-xl flex items-center justify-center gap-1.5"
          style={{
            background: copied === "json" ? "rgba(201,168,76,0.10)" : "rgba(201,168,76,0.05)",
            border: `1px solid ${copied === "json" ? "rgba(201,168,76,0.35)" : "rgba(201,168,76,0.16)"}`,
            color: copied === "json" ? "#C9A84C" : "rgba(201,168,76,0.60)",
            fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
          }}
        >
          {copied === "json" ? <><Check size={11} /> Скопировано</> : <><Copy size={11} /> Копировать JSON</>}
        </button>
      </div>

      <div className="px-3 py-3 rounded-xl" style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.12)" }}>
        <p style={{ color: "rgba(240,235,224,0.45)", fontSize: "10px", lineHeight: 1.7 }}>
          <b style={{ color: "rgba(201,168,76,0.70)" }}>Как импортировать в Phantom:</b><br />
          Phantom → Настройки → Управление аккаунтами → Добавить/Подключить кошелёк → Импорт приватного ключа → вставить JSON массив
        </p>
      </div>
    </div>
  );
}

type Phase = "warning" | "show" | "showKey" | "unlock";

export default function SeedPhraseModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [phase, setPhase]       = useState<Phase>("warning");
  const [agreed, setAgreed]     = useState(false);
  const [words, setWords]       = useState<string[]>([]);
  const [privKeyHex, setPrivKey] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  const getKeystoreData = () => {
    try {
      const ks = localStorage.getItem(`oko-wallet-${address}`);
      return ks ? JSON.parse(ks) : null;
    } catch { return null; }
  };

  const handleContinue = () => {
    const data = getKeystoreData();
    if (!data) { setError("Данные кошелька не найдены"); return; }

    // Best case: rawMnemonic available — show immediately
    if (data.rawMnemonic) {
      setWords(data.rawMnemonic.trim().split(/\s+/));
      setPhase("show");
      return;
    }

    // Second best: rawPrivKey available — show private key (no password needed)
    if (data.rawPrivKey) {
      setPrivKey(data.rawPrivKey);
      setPhase("showKey");
      return;
    }

    // Last resort: need password to decrypt
    setPhase("unlock");
  };

  const handleUnlock = async () => {
    setError(""); setLoading(true);
    try {
      const data = getKeystoreData();
      if (!data) throw new Error("Данные кошелька не найдены");

      // Try to decrypt mnemonic
      if (data.encMnemonic) {
        const mn = await decryptData(data.encMnemonic, password);
        data.rawMnemonic = mn;
        // Also save rawPrivKey if we have encPrivKey
        if (data.encPrivKey) {
          try {
            const privHex = await decryptData(data.encPrivKey, password);
            data.rawPrivKey = privHex;
          } catch {}
        }
        localStorage.setItem(`oko-wallet-${address}`, JSON.stringify(data));
        setWords(mn.trim().split(/\s+/));
        setPhase("show");
      } else {
        throw new Error("Сид-фраза не найдена");
      }
    } catch (e: any) {
      setError(e?.message?.includes("decrypt") || e?.message?.includes("operation failed")
        ? "Неверный пароль" : (e?.message ?? "Ошибка расшифровки"));
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.90)", backdropFilter: "blur(16px)" }}>
      <div
        className="w-full max-w-sm rounded-t-3xl sm:rounded-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0d0d0d 0%, #080808 100%)",
          border: "1px solid rgba(201,168,76,0.18)",
          boxShadow: "0 0 60px rgba(201,168,76,0.06), 0 -8px 60px rgba(0,0,0,0.7)",
          maxHeight: "92vh", overflowY: "auto",
        }}
      >
        <div className="flex items-center justify-between px-5 pt-3 pb-1">
          <div className="flex-1 flex justify-center">
            <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.14)" }} />
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center ml-2"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <X size={14} style={{ color: "rgba(255,255,255,0.45)" }} />
          </button>
        </div>

        <div className="px-5 pb-6">

          {/* ── Warning ── */}
          {phase === "warning" && (
            <>
              <div className="flex justify-center mb-4 mt-2">
                <div style={{
                  width: 70, height: 70, borderRadius: "50%",
                  background: "rgba(201,168,76,0.08)", border: "1.5px solid rgba(201,168,76,0.25)",
                  boxShadow: "0 0 30px rgba(201,168,76,0.10)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <ShieldAlert size={30} style={{ color: "#C9A84C", filter: "drop-shadow(0 0 8px rgba(201,168,76,0.5))" }} />
                </div>
              </div>

              <h3 className="font-orbitron font-bold text-center mb-2" style={{ fontSize: "14px", color: "#C9A84C", letterSpacing: "0.04em" }}>
                РЕЗЕРВНАЯ КОПИЯ КОШЕЛЬКА
              </h3>
              <p style={{ color: "rgba(255,255,255,0.40)", fontSize: "11.5px", lineHeight: 1.75, textAlign: "center", marginBottom: 16 }}>
                Убедитесь что рядом нет посторонних
              </p>

              <div className="flex flex-col gap-2 mb-5">
                {[
                  { icon: "🚫", text: "Никогда не давайте ключи никому — ни поддержке, ни другу" },
                  { icon: "📸", text: "Не делайте скриншот — приложения могут его скопировать" },
                  { icon: "☁️", text: "Не сохраняйте в облаке, мессенджерах, заметках телефона" },
                  { icon: "👁", text: "Убедитесь что рядом нет людей, которые могут увидеть данные" },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-xl"
                    style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}>
                    <span style={{ fontSize: "13px", flexShrink: 0 }}>{item.icon}</span>
                    <span style={{ color: "rgba(240,235,224,0.55)", fontSize: "11px", lineHeight: 1.6 }}>{item.text}</span>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-3 px-3 py-3 rounded-xl mb-4 cursor-pointer"
                style={{ background: agreed ? "rgba(201,168,76,0.04)" : "rgba(255,255,255,0.02)", border: `1px solid ${agreed ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.07)"}` }}>
                <div
                  onClick={() => setAgreed(!agreed)}
                  style={{
                    width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                    background: agreed ? "rgba(201,168,76,0.18)" : "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${agreed ? "rgba(201,168,76,0.45)" : "rgba(255,255,255,0.12)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
                  }}
                >
                  {agreed && <Check size={12} style={{ color: "#C9A84C" }} />}
                </div>
                <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px", lineHeight: 1.5 }}>
                  Я понимаю риски и готов(а) посмотреть данные
                </span>
              </label>

              <button
                onClick={handleContinue}
                disabled={!agreed}
                className="w-full py-4 rounded-2xl font-orbitron font-bold"
                style={{
                  background: agreed ? "linear-gradient(135deg, rgba(201,168,76,0.18), rgba(201,168,76,0.10))" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${agreed ? "rgba(201,168,76,0.40)" : "rgba(255,255,255,0.07)"}`,
                  color: agreed ? "#C9A84C" : "rgba(255,255,255,0.18)",
                  fontSize: "11px", letterSpacing: "0.10em", textTransform: "uppercase",
                  cursor: agreed ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                Показать ключи →
              </button>
            </>
          )}

          {/* ── Show seed words ── */}
          {phase === "show" && words.length > 0 && (
            <div className="mt-2">
              <SeedGrid words={words} />
            </div>
          )}

          {/* ── Show private key (when rawMnemonic not available) ── */}
          {phase === "showKey" && privKeyHex && (
            <div className="mt-2">
              <PrivKeyView privKeyHex={privKeyHex} />
            </div>
          )}

          {/* ── Password unlock (only when nothing is available in plain text) ── */}
          {phase === "unlock" && (
            <>
              <div className="flex justify-center mb-4 mt-2">
                <div style={{
                  width: 64, height: 64, borderRadius: 18,
                  background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.22)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Lock size={26} style={{ color: "#ff6060" }} />
                </div>
              </div>

              <h3 className="font-orbitron font-bold text-center mb-2" style={{ fontSize: "13px", color: "#ff6060" }}>
                ДАННЫЕ ЗАШИФРОВАНЫ
              </h3>

              {/* Explanation box */}
              <div className="px-4 py-3 rounded-2xl mb-4" style={{ background: "rgba(255,80,80,0.06)", border: "1px solid rgba(255,80,80,0.18)" }}>
                <p style={{ color: "rgba(255,160,160,0.85)", fontSize: "11px", lineHeight: 1.7, textAlign: "center" }}>
                  Твоя сид-фраза зашифрована паролем который ты задал при создании кошелька. Без этого пароля расшифровать невозможно — это математически защищённое шифрование.
                </p>
              </div>

              {/* Try password */}
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", letterSpacing: "0.07em", marginBottom: 8, fontFamily: "'Space Grotesk', sans-serif" }}>
                ПОПРОБУЙ ВСПОМНИТЬ ПАРОЛЬ
              </p>
              <div className="relative mb-3">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && password && handleUnlock()}
                  placeholder="Введи пароль кошелька..."
                  className="w-full px-4 py-4 rounded-2xl pr-12 outline-none"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${error ? "rgba(255,80,80,0.45)" : "rgba(255,255,255,0.12)"}`,
                    color: "rgba(255,255,255,0.85)", fontSize: "15px", caretColor: "#C9A84C",
                    fontFamily: "'Space Grotesk', sans-serif",
                  }}
                  autoFocus
                />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.3)" }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              {error && (
                <div className="flex items-center gap-2 mb-3 px-3 py-2.5 rounded-xl"
                  style={{ background: "rgba(255,60,60,0.08)", border: "1px solid rgba(255,60,60,0.22)" }}>
                  <AlertTriangle size={13} style={{ color: "#ff5050", flexShrink: 0 }} />
                  <span style={{ color: "rgba(255,130,130,0.90)", fontSize: "12px" }}>{error}</span>
                </div>
              )}

              <button
                onClick={handleUnlock}
                disabled={!password || loading}
                className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 mb-5"
                style={{
                  background: "linear-gradient(135deg, rgba(201,168,76,0.16), rgba(201,168,76,0.10))",
                  border: "1px solid rgba(201,168,76,0.38)",
                  color: "#C9A84C", fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: "11px", fontWeight: 700, letterSpacing: "0.10em",
                  opacity: !password || loading ? 0.5 : 1, cursor: !password || loading ? "not-allowed" : "pointer",
                }}
              >
                {loading
                  ? <><div className="w-4 h-4 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.3)", borderTopColor: "#C9A84C" }} /><span>Расшифровка...</span></>
                  : "Расшифровать →"}
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
                <span style={{ color: "rgba(255,255,255,0.20)", fontSize: "10px" }}>если пароль точно забыт</span>
                <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.07)" }} />
              </div>

              {/* Options when password is forgotten */}
              <div className="flex flex-col gap-2">
                <div className="px-4 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ color: "rgba(201,168,76,0.80)", fontSize: "11px", fontWeight: 700, marginBottom: 4 }}>
                    📲 Вариант 1 — экспортировать зашифрованный файл
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", lineHeight: 1.6 }}>
                    Скачай зашифрованный файл кошелька. Если вспомнишь пароль позже — сможешь расшифровать.
                  </p>
                  <button
                    onClick={() => {
                      const data = localStorage.getItem(`oko-wallet-${address}`);
                      if (!data) return;
                      const blob = new Blob([data], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url;
                      a.download = `oko-wallet-${address.slice(0, 8)}.json`; a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="mt-2 w-full py-2 rounded-xl flex items-center justify-center gap-2"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)", color: "rgba(255,255,255,0.50)", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    <Key size={11} /> Скачать файл кошелька
                  </button>
                </div>

                <div className="px-4 py-3 rounded-2xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <p style={{ color: "rgba(255,100,100,0.80)", fontSize: "11px", fontWeight: 700, marginBottom: 4 }}>
                    ⚠️ Вариант 2 — создать новый кошелёк
                  </p>
                  <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", lineHeight: 1.6 }}>
                    Создай новый кошелёк и переведи туда средства. Новые кошельки в OKO больше не требуют пароль нигде.
                  </p>
                  <p style={{ color: "rgba(255,80,80,0.55)", fontSize: "9.5px", marginTop: 4 }}>
                    Сначала выведи средства с текущего адреса, если они там есть.
                  </p>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
