import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ArrowRight, Trophy } from "lucide-react";

const injectKF = () => {
  if (document.getElementById("oko-hero-kf")) return;
  const s = document.createElement("style");
  s.id = "oko-hero-kf";
  s.textContent = `
    @keyframes oko-pulse {
      0%,100% { opacity: 0.55; transform: scale(1);   }
      50%      { opacity: 1;    transform: scale(1.06); }
    }
    @keyframes oko-flicker {
      0%,100%{ opacity:1 } 48%{ opacity:1 } 50%{ opacity:.78 } 52%{ opacity:1 }
    }
    @keyframes oko-scan {
      0%   { transform: translateY(-100%); }
      100% { transform: translateY(400%); }
    }
  `;
  document.head.appendChild(s);
};

const CIS = ["ru","uk","be","kk","az","hy","ka","uz","tk","tg","ky","mn"];
const browserLang = navigator.language.split("-")[0].toLowerCase();
const isCIS = CIS.includes(browserLang);

export default function HeroSection() {
  const [phase, setPhase] = useState(0);
  const [, navigate]      = useLocation();

  useEffect(() => {
    injectKF();
    const ts = [60, 150, 250, 350, 450].map((d, i) =>
      setTimeout(() => setPhase(i + 1), d)
    );
    return () => ts.forEach(clearTimeout);
  }, []);

  const fly = (show: boolean, x = 0, y = 22) => ({
    opacity:    show ? 1 : 0,
    transform:  show ? "translate(0,0)" : `translate(${x}px,${y}px)`,
    transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1),
                 transform 0.6s cubic-bezier(0.16,1,0.3,1)`,
  });

  return (
    <section style={{ padding: "8px 0 10px", maxWidth: 480, margin: "0 auto", overflow: "hidden" }}>

      {/* ── TOP ROW: icon left + label right ── */}
      <div style={{
        ...fly(phase >= 1),
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        padding:        "0 18px",
        marginBottom:   10,
      }}>
        {/* Trophy */}
        <div style={{
          width:          46,
          height:         46,
          borderRadius:   "50%",
          background:     "radial-gradient(circle at 40% 35%, rgba(201,168,76,0.14), transparent 70%)",
          border:         "1px solid rgba(201,168,76,0.20)",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          animation:      "oko-pulse 3.5s ease-in-out infinite",
          flexShrink:     0,
        }}>
          <Trophy size={24} strokeWidth={1.4} style={{ color: "#C9A84C" }} />
        </div>

        {/* Label top-right */}
        <div style={{ textAlign: "right" }}>
          <div style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      "8px",
            fontWeight:    600,
            letterSpacing: "0.22em",
            color:         "rgba(240,235,224,0.14)",
            textTransform: "uppercase",
            marginBottom:  3,
          }}>
            OKO VISION TERMINAL
          </div>
          <div style={{
            fontFamily:    "'Space Grotesk', sans-serif",
            fontSize:      "7px",
            fontWeight:    500,
            letterSpacing: "0.16em",
            color:         "rgba(201,168,76,0.35)",
            textTransform: "uppercase",
          }}>
            EST. 2024
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════
          BLOCK 1 — left-aligned, English HUGE
          + Russian micro below, right-offset
         ══════════════════════════════════════════ */}

      {/* "BUILT" — small, left */}
      <div style={{ ...fly(phase >= 2, -16), padding: "0 20px", marginBottom: 0 }}>
        <span style={{
          fontFamily:    "'Space Grotesk', sans-serif",
          fontSize:      "12px",
          fontWeight:    300,
          letterSpacing: "0.30em",
          color:         "rgba(240,235,224,0.24)",
          textTransform: "uppercase",
        }}>
          BUILT
        </span>
      </div>

      {/* "FOR TRADERS" — massive, left-edge */}
      <div style={{ ...fly(phase >= 3, -20), paddingLeft: 14, marginBottom: 2 }}>
        <div style={{
          fontFamily:    "'Bebas Neue', sans-serif",
          fontSize:      "clamp(48px, 14.5vw, 68px)",
          letterSpacing: "0.02em",
          color:         "#F0EBE0",
          lineHeight:    0.9,
          textTransform: "uppercase",
        }}>
          FOR TRADERS
        </div>
      </div>

      {/* Russian translation — tiny, right-aligned */}
      <div style={{ ...fly(phase >= 3, 20), padding: "0 20px", marginBottom: 4, textAlign: "right" }}>
        <span style={{
          fontFamily:    "'Space Grotesk', sans-serif",
          fontSize:      "9px",
          fontWeight:    400,
          fontStyle:     "italic",
          letterSpacing: "0.08em",
          color:         "rgba(240,235,224,0.18)",
        }}>
          создано для трейдеров
        </span>
      </div>

      {/* Divider line — partial, right-aligned */}
      <div style={{ ...fly(phase >= 3), display: "flex", justifyContent: "flex-end", padding: "0 20px", marginBottom: 4 }}>
        <div style={{ width: 48, height: 1, background: "rgba(201,168,76,0.18)" }} />
      </div>

      {/* ══════════════════════════════════════════
          BLOCK 2 — right-aligned, gold punchline
         ══════════════════════════════════════════ */}

      {/* "TO" — small, right */}
      <div style={{ ...fly(phase >= 4, 16), padding: "0 20px", marginBottom: 0, textAlign: "right" }}>
        <span style={{
          fontFamily:    "'Space Grotesk', sans-serif",
          fontSize:      "12px",
          fontWeight:    300,
          letterSpacing: "0.30em",
          color:         "rgba(240,235,224,0.24)",
          textTransform: "uppercase",
        }}>
          TO
        </span>
      </div>

      {/* "WIN." — massive, right-edge, gold */}
      <div style={{ ...fly(phase >= 5, 24), paddingRight: 14, marginBottom: 2, textAlign: "right" }}>
        <div style={{
          fontFamily:    "'Bebas Neue', sans-serif",
          fontSize:      "clamp(60px, 18vw, 90px)",
          letterSpacing: "0.04em",
          color:         "#C9A84C",
          lineHeight:    0.88,
          textTransform: "uppercase",
          animation:     phase >= 5 ? "oko-flicker 7s ease-in-out infinite 1.2s" : "none",
        }}>
          WIN.
        </div>
      </div>

      {/* Russian translation — tiny, left-aligned */}
      <div style={{ ...fly(phase >= 5, -20), padding: "0 20px", marginBottom: 8 }}>
        <span style={{
          fontFamily:    "'Space Grotesk', sans-serif",
          fontSize:      "9px",
          fontWeight:    400,
          fontStyle:     "italic",
          letterSpacing: "0.08em",
          color:         "rgba(240,235,224,0.18)",
        }}>
          чтобы побеждать
        </span>
      </div>

      {/* ── Sub text ── */}
      <div style={{ ...fly(phase >= 5, 0, 8), padding: "0 20px", marginBottom: 12 }}>
        <p style={{
          fontFamily:  "'Inter', sans-serif",
          fontSize:    "12px",
          lineHeight:  1.6,
          color:       "rgba(240,235,224,0.30)",
          margin:      0,
        }}>
          {isCIS
            ? <>Создано на абсолютном доверии. Разработано для успеха каждого трейдера.{" "}<span style={{ color: "rgba(240,235,224,0.16)" }}>Безопасно, мощно, лично.</span></>
            : <>Built on absolute trust. Designed for every trader's success.{" "}<span style={{ color: "rgba(240,235,224,0.16)" }}>Secure, powerful, personal.</span></>
          }
        </p>
      </div>

      {/* ── Gold tagline — centered ── */}
      <div style={{
        ...fly(phase >= 5, 0, 10),
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        gap:            10,
        marginBottom:   12,
      }}>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)", marginLeft: 20 }} />
        <span style={{
          fontFamily:    "'Space Grotesk', sans-serif",
          fontSize:      "8px",
          fontWeight:    600,
          letterSpacing: "0.20em",
          color:         "rgba(201,168,76,0.45)",
          textTransform: "uppercase",
          whiteSpace:    "nowrap",
        }}>
          EVERY TRADE. EVERY DAY.
        </span>
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.05)", marginRight: 20 }} />
      </div>

      {/* ── CTA buttons — centered ── */}
      <div style={{
        ...fly(phase >= 5, 0, 12),
        display:       "flex",
        flexDirection: "column",
        alignItems:    "center",
        gap:           10,
        padding:       "0 20px",
        marginBottom:  22,
      }}>

        {/* Primary — ENTER TERMINAL */}
        <div style={{ width: "100%", maxWidth: 340 }}>
          <button
            onClick={() => navigate("/wallet")}
            style={{
              width:          "100%",
              height:         58,
              borderRadius:   14,
              background:     "#F0EBE0",
              border:         "none",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              gap:            10,
              fontFamily:     "'Space Grotesk', sans-serif",
              fontSize:       "13px",
              fontWeight:     800,
              letterSpacing:  "0.12em",
              color:          "#080808",
              cursor:         "pointer",
              textTransform:  "uppercase",
              transition:     "background 0.2s, transform 0.15s, box-shadow 0.2s",
              boxShadow:      "0 4px 24px rgba(240,235,224,0.12)",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#ffffff";
              el.style.transform  = "scale(1.01)";
              el.style.boxShadow  = "0 6px 32px rgba(240,235,224,0.22)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "#F0EBE0";
              el.style.transform  = "scale(1)";
              el.style.boxShadow  = "0 4px 24px rgba(240,235,224,0.12)";
            }}
          >
            ENTER TERMINAL
            <ArrowRight size={15} strokeWidth={2.5} />
          </button>
          {isCIS && (
            <div style={{
              textAlign:     "center",
              marginTop:     5,
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      "9px",
              fontStyle:     "italic",
              letterSpacing: "0.06em",
              color:         "rgba(240,235,224,0.20)",
            }}>
              войти в терминал
            </div>
          )}
        </div>

        {/* Secondary — EXPLORE MARKETS */}
        <div style={{ width: "100%", maxWidth: 340 }}>
          <button
            onClick={() => navigate("/markets")}
            style={{
              width:          "100%",
              height:         50,
              borderRadius:   14,
              background:     "rgba(255,255,255,0.04)",
              border:         "1px solid rgba(255,255,255,0.18)",
              display:        "flex",
              alignItems:     "center",
              justifyContent: "center",
              fontFamily:     "'Space Grotesk', sans-serif",
              fontSize:       "12px",
              fontWeight:     700,
              letterSpacing:  "0.12em",
              color:          "rgba(240,235,224,0.52)",
              cursor:         "pointer",
              textTransform:  "uppercase",
              transition:     "all 0.2s",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "rgba(255,255,255,0.32)";
              el.style.color       = "rgba(240,235,224,0.85)";
              el.style.background  = "rgba(255,255,255,0.07)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.borderColor = "rgba(255,255,255,0.18)";
              el.style.color       = "rgba(240,235,224,0.52)";
              el.style.background  = "rgba(255,255,255,0.04)";
            }}
          >
            EXPLORE MARKETS
          </button>
          {isCIS && (
            <div style={{
              textAlign:     "center",
              marginTop:     5,
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      "9px",
              fontStyle:     "italic",
              letterSpacing: "0.06em",
              color:         "rgba(240,235,224,0.15)",
            }}>
              исследовать рынки
            </div>
          )}
        </div>

      </div>

      {/* ── Stats strip ── */}
      <div style={{ ...fly(phase >= 5, 0, 8), display: "flex", padding: "0 20px" }}>
        {[
          { v: "284K+", l: "Traders"  },
          { v: "$4.2B", l: "Daily vol"},
          { v: "28",    l: "Countries"},
        ].map((s, i) => (
          <div key={i} style={{
            flex:        1,
            textAlign:   "center",
            borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
          }}>
            <div style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize:   "14px",
              fontWeight: 700,
              color:      "rgba(240,235,224,0.65)",
              lineHeight: 1,
              marginBottom: 3,
            }}>
              {s.v}
            </div>
            <div style={{
              fontFamily:    "'Space Grotesk', sans-serif",
              fontSize:      "8px",
              letterSpacing: "0.05em",
              color:         "rgba(240,235,224,0.18)",
              textTransform: "uppercase",
            }}>
              {s.l}
            </div>
          </div>
        ))}
      </div>

    </section>
  );
}
