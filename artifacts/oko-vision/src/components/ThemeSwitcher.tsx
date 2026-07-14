import { useState, useEffect } from "react";
import { Palette, X } from "lucide-react";
import { THEMES, getThemeId, setThemeId } from "@/lib/themes";

export default function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(getThemeId);

  useEffect(() => { setActive(getThemeId()); }, []);

  const select = (id: string) => {
    setThemeId(id);
    setActive(id);
  };

  const current = THEMES.find((t) => t.id === active) ?? THEMES[0];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Сменить тему"
        className="flex items-center justify-center w-9 h-9 rounded-xl"
        style={{
          background: "rgba(201,168,76,0.07)",
          border: "1px solid rgba(201,168,76,0.2)",
        }}
      >
        <span style={{ fontSize: "14px", lineHeight: 1 }}>{current.icon}</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="w-full max-w-sm mx-4 mb-8 rounded-3xl p-5"
            style={{
              background: "rgba(10,10,25,0.97)",
              border: "1px solid rgba(201,168,76,0.15)",
              animation: "fadeInUp 0.25s ease",
            }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Palette size={15} style={{ color: "var(--cyan, #C9A84C)" }} />
                <h2 className="font-orbitron font-black" style={{ color: "var(--cyan, #C9A84C)", fontSize: "13px" }}>ТЕМА ИНТЕРФЕЙСА</h2>
              </div>
              <button onClick={() => setOpen(false)}
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <X size={14} style={{ color: "rgba(255,255,255,0.5)" }} />
              </button>
            </div>

            <div className="space-y-2">
              {THEMES.map((t) => {
                const isActive = t.id === active;
                return (
                  <button key={t.id} onClick={() => select(t.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all"
                    style={{
                      background: isActive ? `rgba(${t.id === "hacker-green" ? "57,255,20" : t.id === "inferno" ? "255,109,0" : "201,168,76"},0.1)` : "rgba(255,255,255,0.03)",
                      border: isActive ? `1px solid ${t.vars["--cyan"]}33` : "1px solid rgba(255,255,255,0.07)",
                    }}>
                    <span style={{ fontSize: "22px", lineHeight: 1 }}>{t.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: isActive ? t.vars["--cyan"] : "rgba(255,255,255,0.65)", fontSize: "12px", fontWeight: isActive ? 700 : 400 }}>
                        {t.name}
                      </div>
                      <div className="flex gap-1.5 mt-1.5">
                        {[t.vars["--cyan"], t.vars["--positive"], t.vars["--negative"], t.vars["--deep-space"]].map((c, i) => (
                          <div key={i} className="rounded-full w-4 h-4"
                            style={{ background: c, border: "1px solid rgba(255,255,255,0.12)" }} />
                        ))}
                      </div>
                    </div>
                    {isActive && (
                      <div className="w-2 h-2 rounded-full" style={{ background: t.vars["--cyan"] }} />
                    )}
                  </button>
                );
              })}
            </div>

            <p style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", textAlign: "center", marginTop: "12px" }}>
              Тема сохраняется автоматически
            </p>
          </div>
        </div>
      )}
    </>
  );
}
