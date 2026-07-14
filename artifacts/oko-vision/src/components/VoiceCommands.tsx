import { useState, useEffect, useRef, useCallback } from "react";
import { Mic, MicOff, X } from "lucide-react";
import { useLocation } from "wouter";

// ── Types ────────────────────────────────────────────────────────────────────

interface Cmd { pattern: RegExp; label: string; action: (match: RegExpMatchArray) => void; }
type RecogStatus = "idle" | "listening" | "processing" | "error";

// ── Web Speech API typings (not in TS by default) ────────────────────────────

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onstart:  (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror:  ((event: any) => void) | null;
  onend:    (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VoiceCommands() {
  const [, navigate]  = useLocation();
  const [open, setOpen] = useState(false);
  const [status, setStatus]     = useState<RecogStatus>("idle");
  const [transcript, setTranscript] = useState("");
  const [lastCmd, setLastCmd]   = useState<string | null>(null);
  const [errMsg, setErrMsg]     = useState<string | null>(null);
  const recogRef = useRef<ISpeechRecognition | null>(null);

  const COMMANDS: Cmd[] = [
    { pattern: /рынок|маркет|токены|market/i,      label: "→ Рынки",    action: () => navigate("/markets") },
    { pattern: /портфель|портфолио|portfolio/i,     label: "→ Портфель", action: () => navigate("/portfolio") },
    { pattern: /торговл|трейдинг|trade|trading/i,   label: "→ Торговля", action: () => navigate("/trading") },
    { pattern: /кошел|wallet/i,                     label: "→ Кошелёк",  action: () => navigate("/wallet") },
    { pattern: /мост|bridge/i,                      label: "→ Мост",     action: () => navigate("/bridge") },
    { pattern: /лидер|leaderboard|копи/i,           label: "→ Лидерборд",action: () => navigate("/leaderboard") },
    { pattern: /реферал|referral/i,                 label: "→ Реферальная", action: () => navigate("/referral") },
    { pattern: /беcтест|бэктест|backtest/i,         label: "→ Бэктест",  action: () => navigate("/backtesting") },
    { pattern: /главн|дом|home|назад/i,             label: "→ Главная",  action: () => navigate("/") },
  ];

  const processText = useCallback((text: string) => {
    setTranscript(text);
    setStatus("processing");
    const found = COMMANDS.find((c) => c.pattern.test(text));
    if (found) {
      setLastCmd(found.label);
      found.action(text.match(found.pattern)!);
      setTimeout(() => setOpen(false), 800);
    } else {
      setLastCmd(null);
      setErrMsg("Команда не распознана. Попробуйте снова.");
      setTimeout(() => { setErrMsg(null); setStatus("idle"); }, 2000);
      return;
    }
    setTimeout(() => setStatus("idle"), 900);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate]);

  const startListening = useCallback(() => {
    setTranscript("");
    setLastCmd(null);
    setErrMsg(null);

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setErrMsg("Браузер не поддерживает голосовые команды");
      setStatus("error");
      return;
    }

    const recog = new SpeechRec();
    recog.lang = "ru-RU";
    recog.continuous = false;
    recog.interimResults = false;
    recog.maxAlternatives = 3;
    recogRef.current = recog;

    recog.onstart = () => setStatus("listening");
    recog.onresult = (e: any) => {
      const text = e.results[0][0].transcript;
      processText(text);
    };
    recog.onerror = (e: any) => {
      if (e.error === "no-speech") {
        setErrMsg("Речь не обнаружена");
      } else if (e.error === "not-allowed") {
        setErrMsg("Доступ к микрофону запрещён");
      } else {
        setErrMsg(`Ошибка: ${e.error}`);
      }
      setStatus("error");
    };
    recog.onend = () => {
      if (status !== "processing") setStatus("idle");
    };

    recog.start();
  }, [processText, status]);

  const stopListening = () => {
    recogRef.current?.stop();
    setStatus("idle");
  };

  useEffect(() => {
    return () => { recogRef.current?.stop(); };
  }, []);

  const supported = typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  if (!supported) return null;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        title="Голосовые команды"
        className="flex items-center justify-center w-9 h-9 rounded-xl transition-all"
        style={{
          background: open ? "rgba(201,168,76,0.15)" : "rgba(201,168,76,0.07)",
          border: "1px solid rgba(201,168,76,0.2)",
        }}
      >
        <Mic size={15} style={{ color: "#C9A84C" }} />
      </button>

      {/* Overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-sm mx-4 mb-8 rounded-3xl p-6"
            style={{
              background: "rgba(10,10,25,0.97)",
              border: "1px solid rgba(201,168,76,0.15)",
              animation: "fadeInUp 0.25s ease",
              boxShadow: "0 -20px 60px rgba(201,168,76,0.08)",
            }}>
            {/* Top row */}
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="font-orbitron font-black" style={{ color: "#C9A84C", fontSize: "13px" }}>ГОЛОСОВЫЕ КОМАНДЫ</h2>
                <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>Скажите команду на русском</p>
              </div>
              <button onClick={() => { stopListening(); setOpen(false); }}
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>

            {/* Mic button */}
            <div className="flex flex-col items-center mb-5">
              <button
                onClick={status === "listening" ? stopListening : startListening}
                className="relative flex items-center justify-center rounded-full mb-3"
                style={{
                  width: "80px",
                  height: "80px",
                  background: status === "listening"
                    ? "rgba(255,82,82,0.15)"
                    : status === "processing"
                    ? "rgba(201,168,76,0.15)"
                    : "rgba(201,168,76,0.08)",
                  border: status === "listening"
                    ? "2px solid rgba(255,82,82,0.6)"
                    : "2px solid rgba(201,168,76,0.35)",
                  transition: "all 0.25s",
                }}
              >
                {status === "listening" ? (
                  <MicOff size={28} style={{ color: "#ff5252" }} />
                ) : (
                  <Mic size={28} style={{ color: "#C9A84C" }} />
                )}
                {status === "listening" && (
                  <span className="absolute inset-0 rounded-full animate-ping"
                    style={{ background: "rgba(255,82,82,0.15)" }} />
                )}
              </button>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", minHeight: "16px" }}>
                {status === "idle"       && "Нажмите и говорите"}
                {status === "listening"  && <span style={{ color: "#ff5252" }}>Слушаю…</span>}
                {status === "processing" && <span style={{ color: "#C9A84C" }}>Обработка…</span>}
                {status === "error"      && <span style={{ color: "#ffab00" }}>Ошибка</span>}
              </div>
            </div>

            {/* Feedback */}
            {transcript && (
              <div className="rounded-xl px-3 py-2 mb-3" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>Услышано: </span>
                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "11px" }}>"{transcript}"</span>
              </div>
            )}
            {lastCmd && (
              <div className="rounded-xl px-3 py-2 mb-3 flex items-center gap-2"
                style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.2)" }}>
                <span style={{ color: "#C9A84C", fontSize: "12px", fontWeight: 700 }}>✓ {lastCmd}</span>
              </div>
            )}
            {errMsg && (
              <div className="rounded-xl px-3 py-2 mb-3"
                style={{ background: "rgba(255,171,0,0.06)", border: "1px solid rgba(255,171,0,0.2)" }}>
                <span style={{ color: "#ffab00", fontSize: "11px" }}>{errMsg}</span>
              </div>
            )}

            {/* Commands list */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "12px" }}>
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", marginBottom: "8px" }}>ДОСТУПНЫЕ КОМАНДЫ</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  "«Рынок»","«Портфель»","«Торговля»","«Кошелёк»",
                  "«Мост»","«Лидерборд»","«Реферал»","«Бэктест»",
                ].map((c) => (
                  <div key={c} className="rounded-lg px-2.5 py-1.5"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px" }}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
