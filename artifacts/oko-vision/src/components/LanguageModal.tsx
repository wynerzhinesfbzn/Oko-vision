import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { setLanguage, isFirstVisit, markLanguageChosen } from "@/lib/i18n";

const languages = [
  {
    code: "en",
    label: "English",
    flag: "🇬🇧",
    sub: "Global",
  },
  {
    code: "ru",
    label: "Русский",
    flag: "🇷🇺",
    sub: "Россия / СНГ",
  },
];

export default function LanguageModal() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(i18n.language === "ru" ? "ru" : "en");
  const [visible, setVisible] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    if (location !== "/" && location !== "") return;
    if (new URLSearchParams(window.location.search).get("preview")) return;
    if (isFirstVisit()) {
      setTimeout(() => {
        setOpen(true);
        setTimeout(() => setVisible(true), 50);
      }, 600);
    }
  }, []);

  const handleContinue = () => {
    setLanguage(selected);
    markLanguageChosen();
    setVisible(false);
    setTimeout(() => setOpen(false), 350);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-5"
      style={{
        background: "rgba(0,0,0,0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.35s ease",
      }}
    >
      <div
        className="w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          background: "#111111",
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          transform: visible ? "scale(1) translateY(0)" : "scale(0.95) translateY(12px)",
          transition: "transform 0.4s cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Top decoration */}
        <div className="relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{ background: "rgba(255,255,255,0.02)" }}
          />
          <div className="relative px-6 pt-8 pb-6 text-center">
            {/* OKO icon */}
            <div className="flex justify-center mb-4">
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(201,168,76,0.25)",
                }}
              >
                <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="15" stroke="#C9A84C" strokeWidth="1.5"/>
                  <circle cx="24" cy="24" r="9" fill="rgba(201,168,76,0.1)" stroke="#C9A84C" strokeWidth="1"/>
                  <circle cx="24" cy="24" r="4" fill="#C9A84C" opacity="0.9"/>
                  <circle cx="24" cy="24" r="1.6" fill="#C9A84C"/>
                  <line x1="24" y1="6" x2="24" y2="13" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"/>
                  <line x1="24" y1="35" x2="24" y2="42" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"/>
                  <line x1="6" y1="24" x2="13" y2="24" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"/>
                  <line x1="35" y1="24" x2="42" y2="24" stroke="#C9A84C" strokeWidth="1.5" opacity="0.5" strokeLinecap="round"/>
                </svg>
              </div>
            </div>
            <h2
              className="font-orbitron font-bold text-lg mb-1"
              style={{ color: "#F0EBE0", letterSpacing: "0.04em" }}
            >
              {t("lang.title")}
            </h2>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "12px" }}>
              {t("lang.subtitle")}
            </p>
          </div>
        </div>

        {/* Language options */}
        <div className="px-5 pb-5 flex flex-col gap-2.5">
          {languages.map((lang) => {
            const isSelected = selected === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => setSelected(lang.code)}
                className="flex items-center gap-4 p-4 rounded-2xl text-left w-full transition-all"
                style={{
                  background: isSelected
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(255,255,255,0.03)",
                  border: isSelected
                    ? "1px solid rgba(255,255,255,0.18)"
                    : "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <span style={{ fontSize: "28px", lineHeight: 1 }}>{lang.flag}</span>
                <div className="flex-1">
                  <div style={{ color: isSelected ? "#F0EBE0" : "rgba(255,255,255,0.65)", fontWeight: 600, fontSize: "15px" }}>
                    {lang.label}
                  </div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px", marginTop: "2px" }}>
                    {lang.sub}
                  </div>
                </div>
                <div
                  className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                  style={{
                    border: isSelected ? "2px solid #C9A84C" : "2px solid rgba(255,255,255,0.15)",
                    background: isSelected ? "#C9A84C" : "transparent",
                    boxShadow: isSelected ? "0 0 10px rgba(201,168,76,0.5)" : "none",
                  }}
                >
                  {isSelected && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#080808" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
              </button>
            );
          })}

          {/* Continue button */}
          <button
            onClick={handleContinue}
            className="w-full mt-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2"
            style={{
              background: "#F0EBE0",
              border: "none",
              color: "#080808",
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "11px",
              letterSpacing: "0.10em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            {t("lang.continue")} →
          </button>
        </div>
      </div>
    </div>
  );
}
