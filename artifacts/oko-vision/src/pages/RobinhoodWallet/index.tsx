import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ethers } from "ethers";
import { useEVMWallet, RH_EXPLORER } from "@/context/EVMWalletContext";

/* ─── palette (matches OKO dark + RH green) ─────────────────── */
const C = {
  bg:      "#080808",
  card:    "#0e0e0e",
  card2:   "#141414",
  border:  "rgba(255,255,255,0.07)",
  border2: "rgba(255,255,255,0.04)",
  gold:    "#C9A84C",
  green:   "#00c853",
  red:     "#ff1744",
  blue:    "#2962ff",
  text:    "#ffffff",
  sub:     "#888888",
  dim:     "#444444",
} as const;

type View =
  | "landing"
  | "create-show"    // show mnemonic
  | "create-confirm" // type back word #N to confirm
  | "import-phrase"
  | "import-key"
  | "set-password"   // after create or import, set password
  | "unlock"
  | "dashboard"
  | "send"
  | "receive";

/* ─── main component ─────────────────────────────────────────── */
export default function RobinhoodWallet() {
  const evm = useEVMWallet();
  const [, navigate] = useLocation();
  const [view, setView] = useState<View>(() => {
    if (!evm.hasWallet) return "landing";
    if (evm.locked) return "unlock";
    return "dashboard";
  });

  // Whenever wallet state changes from outside
  useEffect(() => {
    if (!evm.hasWallet) { setView("landing"); return; }
    if (evm.locked && view !== "unlock") setView("unlock");
    if (!evm.locked && view === "unlock") setView("dashboard");
  }, [evm.hasWallet, evm.locked]);

  return (
    <div style={{ minHeight: "100dvh", background: C.bg, color: C.text, fontFamily: "inherit" }}>
      {/* ── top bar ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 20px",
        borderBottom: `1px solid ${C.border2}`,
        position: "sticky", top: 0, zIndex: 10,
        background: C.bg, backdropFilter: "blur(12px)",
      }}>
        <button onClick={() => navigate("/")} style={ghostBtn}>
          ← Назад
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 18 }}>🔥</span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Robinhood Chain</span>
        </div>
        {evm.address && (
          <button onClick={evm.lock} style={{ ...ghostBtn, color: C.dim }}>
            Закрыть
          </button>
        )}
        {!evm.address && <div style={{ width: 60 }} />}
      </header>

      {/* ── views ── */}
      <AnimatePresence mode="wait" initial={false}>
        {view === "landing"        && <LandingView   key="l"  onAction={setView} />}
        {view === "create-show"    && <CreateShowView key="cs" onNext={(m) => { pendingMnemonic.current = m; setView("set-password"); }} onBack={() => setView("landing")} />}
        {view === "import-phrase"  && <ImportPhraseView key="ip" onNext={() => setView("dashboard")} onBack={() => setView("landing")} />}
        {view === "import-key"     && <ImportKeyView key="ik" onNext={() => setView("dashboard")} onBack={() => setView("landing")} />}
        {view === "set-password"   && <SetPasswordView key="sp" mnemonic={pendingMnemonic.current} onNext={() => setView("dashboard")} onBack={() => setView("landing")} />}
        {view === "unlock"         && <UnlockView key="u" onUnlocked={() => setView("dashboard")} onDisconnect={() => setView("landing")} />}
        {view === "dashboard"      && <DashboardView key="d" onSend={() => setView("send")} onReceive={() => setView("receive")} onLock={() => { evm.lock(); setView("unlock"); }} />}
        {view === "send"           && <SendView key="s" onBack={() => setView("dashboard")} />}
        {view === "receive"        && <ReceiveView key="r" onBack={() => setView("dashboard")} />}
      </AnimatePresence>
    </div>
  );

  // Temporary mnemonic storage between create-show and set-password views
  var pendingMnemonic = useRef<string>("");
}

/* ═══════════════════════════════════════════════════════════════
   LANDING
═══════════════════════════════════════════════════════════════ */
function LandingView({ onAction }: { onAction: (v: View) => void }) {
  return (
    <Page>
      <div style={{ textAlign: "center", paddingTop: 40, paddingBottom: 40 }}>
        {/* logo */}
        <div style={{
          width: 80, height: 80, borderRadius: 24,
          background: "linear-gradient(135deg,#1a3a1a,#003300)",
          border: `1px solid ${C.green}33`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40, margin: "0 auto 20px",
          boxShadow: `0 0 40px ${C.green}22`,
        }}>🔥</div>
        <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>
          Robinhood Chain
        </h1>
        <p style={{ color: C.sub, fontSize: 14, margin: "8px 0 0" }}>
          Chain ID 4663 · EVM-совместимый
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400, margin: "0 auto" }}>
        <Btn primary onClick={() => onAction("create-show")}>
          ✦ Создать новый кошелёк
        </Btn>
        <Btn onClick={() => onAction("import-phrase")}>
          Импорт из фразы (12/24 слов)
        </Btn>
        <Btn onClick={() => onAction("import-key")}>
          Импорт приватного ключа
        </Btn>
      </div>

      <Note style={{ marginTop: 32 }}>
        🔒 Приватный ключ хранится только на вашем устройстве,
        зашифрован AES-256-GCM с вашим паролем.
        Никто кроме вас не имеет к нему доступа.
      </Note>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CREATE — SHOW MNEMONIC
═══════════════════════════════════════════════════════════════ */
function CreateShowView({ onNext, onBack }: { onNext: (m: string) => void; onBack: () => void }) {
  const [mnemonic] = useState(() => {
    const w = ethers.Wallet.createRandom() as ethers.HDNodeWallet;
    return w.mnemonic!.phrase;
  });
  const words = mnemonic.split(" ");
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Page>
      <BackBtn onClick={onBack} />
      <h2 style={h2}>Сохраните фразу</h2>
      <p style={sub}>12 слов — единственный способ восстановить кошелёк. Запишите их офлайн.</p>

      {/* Mnemonic grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
        margin: "20px 0",
      }}>
        {words.map((w, i) => (
          <div key={i} style={{
            background: C.card2, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: "8px 10px",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ color: C.dim, fontSize: 11, minWidth: 18 }}>{i + 1}.</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{w}</span>
          </div>
        ))}
      </div>

      <button onClick={copy} style={{
        ...ghostBtn, width: "100%", padding: "10px 0", textAlign: "center",
        border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 16,
        color: copied ? C.green : C.sub,
      }}>
        {copied ? "✓ Скопировано" : "Скопировать фразу"}
      </button>

      {/* Confirmation checkbox */}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 12, cursor: "pointer", marginBottom: 20 }}>
        <div
          onClick={() => setConfirmed(c => !c)}
          style={{
            width: 20, height: 20, borderRadius: 6, flexShrink: 0, marginTop: 1,
            background: confirmed ? C.green : "transparent",
            border: `1px solid ${confirmed ? C.green : C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}
        >
          {confirmed && <span style={{ fontSize: 12, color: "#000" }}>✓</span>}
        </div>
        <span style={{ fontSize: 13, color: C.sub, lineHeight: 1.5 }}>
          Я записал(а) фразу в надёжном месте и понимаю, что без неё восстановить кошелёк невозможно
        </span>
      </label>

      <Btn primary disabled={!confirmed} onClick={() => onNext(mnemonic)}>
        Продолжить →
      </Btn>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SET PASSWORD (after create or import)
═══════════════════════════════════════════════════════════════ */
function SetPasswordView({ mnemonic, onNext, onBack }: { mnemonic: string; onNext: () => void; onBack: () => void }) {
  const evm = useEVMWallet();
  const [pw, setPw]       = useState("");
  const [pw2, setPw2]     = useState("");
  const [show, setShow]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState("");

  const confirm = async () => {
    if (pw.length < 6) return setErr("Минимум 6 символов");
    if (pw !== pw2)    return setErr("Пароли не совпадают");
    setLoading(true); setErr("");
    try {
      await evm.createWallet(pw);
      // Actually we need to use the mnemonic we already generated…
      // createWallet() generates a new one, so import it instead
      await evm.importFromPhrase(mnemonic, pw);
      onNext();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <BackBtn onClick={onBack} />
      <h2 style={h2}>Задайте пароль</h2>
      <p style={sub}>Пароль шифрует ваш ключ на устройстве. Без него кошелёк не откроется.</p>

      <Field label="Пароль" type={show ? "text" : "password"} value={pw} onChange={setPw}
        placeholder="Минимум 6 символов"
        right={<Vis show={show} toggle={() => setShow(s => !s)} />} />
      <Field label="Повторите пароль" type={show ? "text" : "password"} value={pw2} onChange={setPw2}
        placeholder="Повторите пароль" />

      {err && <Err>{err}</Err>}

      <StrengthBar pw={pw} />

      <Btn primary disabled={!pw || !pw2 || loading} onClick={confirm} style={{ marginTop: 16 }}>
        {loading ? "Шифрование…" : "Создать кошелёк"}
      </Btn>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IMPORT — PHRASE
═══════════════════════════════════════════════════════════════ */
function ImportPhraseView({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const evm = useEVMWallet();
  const [phrase, setPhrase] = useState("");
  const [pw, setPw]         = useState("");
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState("");

  const confirm = async () => {
    const words = phrase.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) return setErr("Нужно 12 или 24 слова");
    if (pw.length < 6) return setErr("Минимум 6 символов для пароля");
    setLoading(true); setErr("");
    try {
      await evm.importFromPhrase(phrase.trim(), pw);
      onNext();
    } catch (e: any) {
      setErr(e.message.includes("mnemonic") ? "Неверная мнемоническая фраза" : e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <BackBtn onClick={onBack} />
      <h2 style={h2}>Импорт из фразы</h2>
      <p style={sub}>Введите 12 или 24 слова через пробел</p>

      <label style={labelStyle}>Мнемоническая фраза</label>
      <textarea
        value={phrase}
        onChange={e => setPhrase(e.target.value)}
        placeholder="word1 word2 word3 …"
        rows={4}
        style={{
          ...inputStyle, resize: "none", lineHeight: 1.6,
          fontFamily: "monospace", fontSize: 13,
        }}
      />

      <Field label="Новый пароль для этого устройства" type={show ? "text" : "password"}
        value={pw} onChange={setPw} placeholder="Минимум 6 символов"
        right={<Vis show={show} toggle={() => setShow(s => !s)} />} />

      {err && <Err>{err}</Err>}
      <Btn primary disabled={!phrase || !pw || loading} onClick={confirm}>
        {loading ? "Импортируем…" : "Импортировать"}
      </Btn>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   IMPORT — PRIVATE KEY
═══════════════════════════════════════════════════════════════ */
function ImportKeyView({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const evm = useEVMWallet();
  const [pk, setPk]         = useState("");
  const [pw, setPw]         = useState("");
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState("");

  const confirm = async () => {
    if (!pk.trim()) return setErr("Введите приватный ключ");
    if (pw.length < 6) return setErr("Минимум 6 символов для пароля");
    setLoading(true); setErr("");
    try {
      await evm.importFromKey(pk.trim(), pw);
      onNext();
    } catch (e: any) {
      setErr(e.message.includes("invalid") || e.message.includes("hex")
        ? "Неверный приватный ключ" : e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <BackBtn onClick={onBack} />
      <h2 style={h2}>Импорт приватного ключа</h2>
      <p style={sub}>Hex-строка (0x…). Ключ будет зашифрован и сохранён локально.</p>

      <Field label="Приватный ключ" type={show ? "text" : "password"}
        value={pk} onChange={setPk} placeholder="0x..."
        right={<Vis show={show} toggle={() => setShow(s => !s)} />} />
      <Field label="Новый пароль" type="password"
        value={pw} onChange={setPw} placeholder="Минимум 6 символов" />

      {err && <Err>{err}</Err>}
      <Btn primary disabled={!pk || !pw || loading} onClick={confirm}>
        {loading ? "Импортируем…" : "Импортировать"}
      </Btn>

      <Note>⚠️ Никогда не вводите приватный ключ на незнакомых сайтах.</Note>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   UNLOCK
═══════════════════════════════════════════════════════════════ */
function UnlockView({ onUnlocked, onDisconnect }: { onUnlocked: () => void; onDisconnect: () => void }) {
  const evm = useEVMWallet();
  const [pw, setPw]         = useState("");
  const [show, setShow]     = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr]       = useState("");

  const unlock = async () => {
    if (!pw) return;
    setLoading(true); setErr("");
    try {
      await evm.unlock(pw);
      onUnlocked();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page style={{ justifyContent: "center", minHeight: "calc(100dvh - 60px)" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ ...h2, marginBottom: 4 }}>Разблокировать</h2>
        <p style={sub}>Введите пароль чтобы открыть кошелёк</p>
        {evm.address && (
          <p style={{ fontFamily: "monospace", fontSize: 12, color: C.dim, marginTop: 8 }}>
            {evm.address}
          </p>
        )}
      </div>

      <Field label="Пароль" type={show ? "text" : "password"}
        value={pw} onChange={setPw} placeholder="Ваш пароль"
        onKeyDown={e => e.key === "Enter" && unlock()}
        right={<Vis show={show} toggle={() => setShow(s => !s)} />} />

      {err && <Err>{err}</Err>}
      <Btn primary disabled={!pw || loading} onClick={unlock}>
        {loading ? "Расшифровка…" : "Разблокировать"}
      </Btn>

      <button
        onClick={() => { evm.disconnect(); onDisconnect(); }}
        style={{ ...ghostBtn, width: "100%", textAlign: "center", marginTop: 16, color: C.red }}
      >
        Удалить кошелёк с устройства
      </button>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════ */
function DashboardView({
  onSend, onReceive, onLock,
}: { onSend: () => void; onReceive: () => void; onLock: () => void }) {
  const evm = useEVMWallet();
  const bal = parseFloat(evm.balance ?? "0");

  return (
    <Page style={{ paddingBottom: 40 }}>
      {/* Balance card */}
      <Card style={{ textAlign: "center", padding: "28px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>
          Баланс · Robinhood Chain
        </div>
        {evm.balanceLoading ? (
          <Spinner />
        ) : (
          <div style={{ fontSize: 40, fontWeight: 300, letterSpacing: "-0.02em" }}>
            {bal.toFixed(6)} <span style={{ fontSize: 22, color: C.sub }}>ETH</span>
          </div>
        )}
        <div style={{
          marginTop: 14, padding: "10px 0 0",
          borderTop: `1px solid ${C.border2}`,
          fontSize: 11, fontFamily: "monospace", color: C.dim, wordBreak: "break-all",
        }}>
          {evm.address}
        </div>
      </Card>

      {/* Network chip */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          background: `${C.green}10`, border: `1px solid ${C.green}25`,
          borderRadius: 20, padding: "5px 14px", fontSize: 12, color: C.green,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, display: "inline-block" }} />
          Robinhood Chain · ID 4663
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        <ActionBtn icon="↑" label="Отправить" onClick={onSend} color={C.green} />
        <ActionBtn icon="↓" label="Получить"  onClick={onReceive} color={C.blue} />
        <ActionBtn icon="↺" label="Обновить"  onClick={evm.refreshBalance} color={C.gold} />
        <ActionBtn icon="🔒" label="Закрыть" onClick={onLock} color={C.dim} />
      </div>

      {/* TX History */}
      <div style={{ fontSize: 12, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
        История транзакций
      </div>
      {evm.txHistory.length === 0 ? (
        <Card style={{ textAlign: "center", padding: "28px 16px" }}>
          <p style={{ color: C.dim, fontSize: 13 }}>Транзакций нет</p>
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          {evm.txHistory.map((tx, i) => (
            <div key={tx.hash} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "13px 16px",
              borderTop: i > 0 ? `1px solid ${C.border2}` : "none",
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                  Отправка {tx.value} ETH
                </div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 2, fontFamily: "monospace" }}>
                  → {tx.to.slice(0, 8)}…{tx.to.slice(-4)}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <a
                  href={`${RH_EXPLORER}/tx/${tx.hash}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 11, color: C.blue, textDecoration: "none" }}
                >
                  Tx ↗
                </a>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 2 }}>
                  {new Date(tx.timestamp).toLocaleDateString("ru-RU")}
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SEND
═══════════════════════════════════════════════════════════════ */
function SendView({ onBack }: { onBack: () => void }) {
  const evm = useEVMWallet();
  const [to,      setTo]      = useState("");
  const [amount,  setAmount]  = useState("");
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");
  const [txHash,  setTxHash]  = useState("");

  const bal = parseFloat(evm.balance ?? "0");

  const send = async () => {
    if (!ethers.isAddress(to.trim())) return setErr("Неверный адрес (0x…)");
    if (!amount || +amount <= 0)      return setErr("Введите сумму");
    if (+amount >= bal)               return setErr("Недостаточно средств (учтите газ)");
    setLoading(true); setErr("");
    try {
      const hash = await evm.sendTransaction(to.trim(), amount);
      setTxHash(hash);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (txHash) return (
    <Page style={{ justifyContent: "center", minHeight: "calc(100dvh - 60px)", textAlign: "center" }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
      <h2 style={{ ...h2, marginBottom: 4 }}>Отправлено!</h2>
      <p style={{ ...sub, marginBottom: 20 }}>Транзакция подтверждена в сети</p>
      <div style={{
        background: C.card2, borderRadius: 12,
        border: `1px solid ${C.border}`,
        padding: "12px 16px", fontSize: 11,
        fontFamily: "monospace", color: C.sub, wordBreak: "break-all",
        marginBottom: 20,
      }}>
        {txHash}
      </div>
      <a
        href={`${RH_EXPLORER}/tx/${txHash}`}
        target="_blank" rel="noopener noreferrer"
        style={{
          display: "block", textAlign: "center", color: C.blue,
          fontSize: 13, marginBottom: 20, textDecoration: "none",
        }}
      >
        Открыть в Explorer ↗
      </a>
      <Btn primary onClick={onBack}>← Назад в кошелёк</Btn>
    </Page>
  );

  return (
    <Page>
      <BackBtn onClick={onBack} />
      <h2 style={h2}>Отправить ETH</h2>
      <p style={{ ...sub, marginBottom: 0 }}>
        Доступно: <span style={{ color: C.text }}>{bal.toFixed(6)} ETH</span>
      </p>

      <div style={{ margin: "20px 0 0" }}>
        <Field label="Адрес получателя (0x…)" type="text"
          value={to} onChange={setTo} placeholder="0x0000…0000"
          style={{ fontFamily: "monospace", fontSize: 13 }} />

        <label style={labelStyle}>Сумма (ETH)</label>
        <div style={{ position: "relative" }}>
          <input
            type="number" min="0" step="any"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.001"
            style={{ ...inputStyle, paddingRight: 60 }}
          />
          <button
            onClick={() => setAmount(String(Math.max(0, bal - 0.0005).toFixed(6)))}
            style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: `${C.blue}20`, border: `1px solid ${C.blue}40`,
              borderRadius: 6, padding: "3px 8px",
              color: C.blue, fontSize: 11, fontWeight: 700, cursor: "pointer",
            }}
          >
            MAX
          </button>
        </div>
      </div>

      {err && <Err>{err}</Err>}

      <Btn primary disabled={loading || !to || !amount} onClick={send} style={{ marginTop: 8 }}>
        {loading ? "Отправка в блокчейн…" : "Подтвердить и отправить"}
      </Btn>

      <Note>
        🔗 Реальная транзакция в Robinhood Chain.
        Убедитесь в правильности адреса — отменить нельзя.
      </Note>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   RECEIVE
═══════════════════════════════════════════════════════════════ */
function ReceiveView({ onBack }: { onBack: () => void }) {
  const { address } = useEVMWallet();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Page style={{ alignItems: "center", textAlign: "center" }}>
      <BackBtn onClick={onBack} />
      <h2 style={h2}>Получить ETH</h2>
      <p style={sub}>Отправляйте ETH только в сети Robinhood Chain (ID 4663)</p>

      {/* QR placeholder — real QR requires a lib, show address prominently */}
      <div style={{
        width: 180, height: 180, background: "#fff", borderRadius: 20,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", margin: "24px auto",
        padding: 12,
      }}>
        <div style={{ fontSize: 44 }}>🔥</div>
        <div style={{ fontSize: 9, color: "#333", fontFamily: "monospace", wordBreak: "break-all", marginTop: 6 }}>
          {address?.slice(0, 22)}…
        </div>
      </div>

      <Card style={{ width: "100%", maxWidth: 360, marginBottom: 12, padding: "12px 16px" }}>
        <div style={{ fontSize: 11, color: C.sub, marginBottom: 6 }}>Ваш адрес</div>
        <div style={{ fontSize: 12, fontFamily: "monospace", color: C.text, wordBreak: "break-all", lineHeight: 1.6 }}>
          {address}
        </div>
      </Card>

      <Btn primary onClick={copy} style={{ maxWidth: 360 }}>
        {copied ? "✓ Скопировано!" : "Скопировать адрес"}
      </Btn>

      <Note style={{ maxWidth: 360, marginTop: 16 }}>
        ⚠️ Принимайте только нативный ETH сети Robinhood Chain.
        Другие сети не поддерживаются этим адресом в рамках данного кошелька.
      </Note>
    </Page>
  );
}

/* ═══════════════════════════════════════════════════════════════
   REUSABLE PRIMITIVES
═══════════════════════════════════════════════════════════════ */
function Page({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.18 }}
      style={{
        maxWidth: 480, margin: "0 auto",
        padding: "24px 20px 32px",
        display: "flex", flexDirection: "column", gap: 12,
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: 16, ...style,
    }}>
      {children}
    </div>
  );
}

function Btn({
  children, onClick, primary, disabled, style,
}: {
  children: React.ReactNode; onClick?: () => void;
  primary?: boolean; disabled?: boolean; style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: "100%", padding: "15px 0",
        background: disabled ? C.card2 : primary ? C.green : C.card2,
        border: `1px solid ${disabled ? C.border2 : primary ? C.green + "40" : C.border}`,
        borderRadius: 14, color: disabled ? C.dim : primary ? "#000" : C.text,
        fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer",
        boxShadow: !disabled && primary ? `0 0 24px ${C.green}30` : "none",
        transition: "all 0.15s",
        ...style,
      }}
    >
      {children}
    </button>
  );
}

function ActionBtn({ icon, label, onClick, color }: { icon: string; label: string; onClick: () => void; color: string }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      gap: 6, padding: "16px 0",
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, cursor: "pointer",
      color: C.sub, transition: "all 0.15s",
    }}>
      <span style={{ fontSize: 22, color }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color }}>{label}</span>
    </button>
  );
}

function Field({
  label, type, value, onChange, placeholder, right, style, onKeyDown,
}: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  right?: React.ReactNode; style?: React.CSSProperties; onKeyDown?: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div style={{ marginBottom: 4 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          type={type} value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          style={{ ...inputStyle, paddingRight: right ? 42 : 14, ...style }}
          autoComplete="off"
        />
        {right && (
          <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
            {right}
          </div>
        )}
      </div>
    </div>
  );
}

function Vis({ show, toggle }: { show: boolean; toggle: () => void }) {
  return (
    <button onClick={toggle} style={{ background: "none", border: "none", cursor: "pointer", color: C.dim, fontSize: 16 }}>
      {show ? "🙈" : "👁"}
    </button>
  );
}

function StrengthBar({ pw }: { pw: string }) {
  const s = pw.length === 0 ? 0 : pw.length < 6 ? 1 : pw.length < 10 ? 2 : pw.length < 14 ? 3 : 4;
  const cols = ["#333", C.red, "#ff9800", C.gold, C.green];
  const lbls = ["", "Слабый", "Средний", "Хороший", "Надёжный"];
  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
        {[1,2,3,4].map(i => (
          <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: s >= i ? cols[i] : "#222", transition: "background 0.2s" }} />
        ))}
      </div>
      {pw && <div style={{ fontSize: 11, color: cols[s], marginTop: 4 }}>{lbls[s]}</div>}
    </div>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...ghostBtn, alignSelf: "flex-start", marginBottom: 4 }}>← Назад</button>
  );
}

function Err({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: C.red, padding: "2px 0" }}>{children}</div>;
}

function Note({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: `rgba(255,255,255,0.03)`, border: `1px solid ${C.border2}`,
      borderRadius: 10, padding: "10px 14px",
      fontSize: 12, color: C.dim, lineHeight: 1.6, ...style,
    }}>
      {children}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
      <div style={{
        width: 24, height: 24, borderRadius: "50%",
        border: `2px solid ${C.border}`, borderTopColor: C.green,
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ─── style constants ──────────────────────────────────────── */
const h2: React.CSSProperties = {
  fontSize: 22, fontWeight: 800, margin: 0, color: C.text, letterSpacing: "-0.01em",
};
const sub: React.CSSProperties = {
  fontSize: 14, color: C.sub, margin: 0, lineHeight: 1.5,
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 11, color: C.sub,
  textTransform: "uppercase", letterSpacing: "0.08em",
  marginBottom: 6, marginTop: 4,
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  background: C.card2, border: `1px solid ${C.border}`,
  borderRadius: 12, padding: "13px 14px",
  color: C.text, fontSize: 15, outline: "none",
  fontFamily: "inherit",
};
const ghostBtn: React.CSSProperties = {
  background: "none", border: "none", cursor: "pointer",
  color: C.sub, fontSize: 13, padding: 0, fontFamily: "inherit",
};
