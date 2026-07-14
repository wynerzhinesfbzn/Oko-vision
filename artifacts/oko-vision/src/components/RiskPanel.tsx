/**
 * RiskPanel — inline risk-detail section, rendered inside TokenCard.
 * No outer wrapper card — the host card provides all borders/bg.
 */
import { useState } from "react";
import type { RiskData, RiskItem } from "@/lib/riskAnalysis";
import { ShieldCheck, ShieldAlert, ShieldX, Shield, Copy, CheckCheck, AlertTriangle, RefreshCw } from "lucide-react";

// ─── Colour helpers ───────────────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score <= 25) return "#C9A84C";
  if (score <= 60) return "#C9A84C";
  if (score <= 85) return "#C9A84C";
  return "#ff3d3d";
}

function levelColor(level: RiskItem["level"]): string {
  return level === "danger" ? "#ff4444" : level === "warn" ? "#C9A84C" : "rgba(240,235,224,0.65)";
}

// ─── Mini score arc ───────────────────────────────────────────────────────────

export function ScorePill({ score, level }: { score: number; level: RiskData["riskLevel"] }) {
  const color = scoreColor(score);
  const Icon  = level === "safe" ? ShieldCheck : level === "medium" ? Shield : level === "high" ? ShieldAlert : ShieldX;
  const label = level === "safe" ? "Безопасно" : level === "medium" ? "Средний" : level === "high" ? "Высокий" : "Rug!";

  return (
    <div className="flex items-center gap-1.5">
      <Icon size={11} style={{ color, flexShrink: 0 }} />
      <span style={{ color, fontFamily: "monospace", fontWeight: 800, fontSize: "10px" }}>{score}</span>
      <span style={{ color, fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, opacity: 0.85 }}>{label}</span>
    </div>
  );
}

// ─── Metric row (compact, no overflow) ───────────────────────────────────────

function MetricRow({
  label, value, pct, good, bad, warn, unknown,
}: {
  label: string; value: string;
  pct?: number | null;
  good?: boolean; bad?: boolean; warn?: boolean; unknown?: boolean;
}) {
  const color = unknown ? "rgba(255,255,255,0.22)"
    : good  ? "#C9A84C"
    : bad   ? "#ff4444"
    : warn  ? "#C9A84C"
    : "rgba(255,255,255,0.45)";

  return (
    <div className="flex items-center justify-between gap-2 py-0.5 min-w-0">
      <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "8px", letterSpacing: "0.03em", flexShrink: 0 }}>
        {label}
      </span>
      <div className="flex items-center gap-1.5 min-w-0">
        {pct != null && (
          <div
            style={{
              width: 32, height: 3, background: "rgba(255,255,255,0.07)",
              borderRadius: 99, overflow: "hidden", flexShrink: 0,
            }}
          >
            <div
              style={{
                width: `${Math.min(100, Math.max(0, pct))}%`,
                height: "100%", background: color,
                borderRadius: 99, transition: "width 0.5s ease",
              }}
            />
          </div>
        )}
        <span style={{ color, fontSize: "9px", fontFamily: "monospace", fontWeight: 700, whiteSpace: "nowrap" }}>
          {value}
        </span>
      </div>
    </div>
  );
}

// ─── Main expanded panel (no wrapper card) ────────────────────────────────────

interface Props {
  data:         RiskData;
  mintAddress:  string;
  loading?:     boolean;
  onRefresh?:   () => void;
}

export default function RiskPanel({ data, mintAddress, loading, onRefresh }: Props) {
  const [copied,    setCopied]    = useState(false);
  const [showRisks, setShowRisks] = useState(false);

  const color = scoreColor(data.riskScore);

  const copyAddress = () => {
    navigator.clipboard.writeText(mintAddress).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2 pt-1">

      {/* ── Divider ── */}
      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${color}40, transparent)` }} />

      {/* ── Header row: source tag + refresh ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Shield size={9} style={{ color: "rgba(240,235,224,0.65)" }} />
          <span style={{ color: "rgba(240,235,224,0.65)", fontSize: "7.5px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.07em" }}>
            АНАЛИЗ РИСКОВ
          </span>
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: "6.5px", fontFamily: "monospace" }}>
            [{data.source.toUpperCase()}]
          </span>
        </div>
        {onRefresh && (
          <button
            onClick={(e) => { e.stopPropagation(); onRefresh(); }}
            className="p-0.5"
            style={{ color: "rgba(255,255,255,0.22)" }}
          >
            <RefreshCw size={9} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
          </button>
        )}
      </div>

      {/* ── Verdict row ── */}
      <div
        className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl"
        style={{
          background:
            data.riskLevel === "safe"   ? "rgba(201,168,76,0.07)"  :
            data.riskLevel === "medium" ? "rgba(201,168,76,0.07)"  :
            data.riskLevel === "high"   ? "rgba(201,168,76,0.08)"  :
                                          "rgba(255,60,60,0.09)",
          border: `1px solid ${color}28`,
        }}
      >
        {/* Mini donut arc */}
        <div className="relative shrink-0" style={{ width: 44, height: 44 }}>
          {(() => {
            const r    = 17;
            const circ = 2 * Math.PI * r;
            const fill = (data.riskScore / 100) * circ * 0.75;
            const ShieldIcon =
              data.riskLevel === "safe"   ? ShieldCheck :
              data.riskLevel === "medium" ? Shield :
              data.riskLevel === "high"   ? ShieldAlert : ShieldX;
            return (
              <>
                <svg width="44" height="44" viewBox="0 0 44 44" style={{ transform: "rotate(135deg)" }}>
                  <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="4"
                    strokeDasharray={`${circ * 0.75} ${circ * 0.25}`} strokeLinecap="round" />
                  <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4"
                    strokeDasharray={`${fill} ${circ - fill}`} strokeLinecap="round"
                    style={{ filter: `drop-shadow(0 0 3px ${color}80)`, transition: "stroke-dasharray 0.6s ease" }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ transform: "translateY(-1px)" }}>
                  <ShieldIcon size={11} style={{ color }} />
                  <span style={{ color, fontSize: "9px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800, lineHeight: 1 }}>
                    {data.riskScore}
                  </span>
                </div>
              </>
            );
          })()}
        </div>

        <div className="flex-1 min-w-0">
          <p style={{ fontSize: "16px", lineHeight: 1, marginBottom: 3 }}>{data.verdictEmoji}</p>
          <p style={{ color, fontSize: "8.5px", fontWeight: 700, lineHeight: 1.5 }}>{data.verdict}</p>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div
        className="px-2.5 py-1.5 rounded-xl flex flex-col gap-0.5"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}
      >
        {data.honeypotRisk != null && (
          <MetricRow
            label="Honeypot"
            value={`${Math.round(data.honeypotRisk)}%`}
            pct={data.honeypotRisk}
            bad={data.honeypotRisk > 50}
            warn={data.honeypotRisk > 20 && data.honeypotRisk <= 50}
            good={data.honeypotRisk <= 20}
          />
        )}
        {data.bundleActivityPct != null && (
          <MetricRow
            label="Bundle/Sniper"
            value={`${Math.round(data.bundleActivityPct)}%`}
            pct={data.bundleActivityPct}
            bad={data.bundleActivityPct > 40}
            warn={data.bundleActivityPct > 15 && data.bundleActivityPct <= 40}
            good={data.bundleActivityPct <= 15}
          />
        )}
        {data.devSellingPct != null && (
          <MetricRow
            label="Dev Selling"
            value={`${Math.round(data.devSellingPct)}%`}
            pct={data.devSellingPct}
            bad={data.devSellingPct > 30}
            warn={data.devSellingPct > 10 && data.devSellingPct <= 30}
            good={data.devSellingPct <= 10}
          />
        )}
        {data.topHolderPct != null && (
          <MetricRow
            label="Топ холдер"
            value={`${data.topHolderPct.toFixed(1)}%`}
            pct={Math.min(100, data.topHolderPct * 2)}
            bad={data.topHolderPct > 30}
            warn={data.topHolderPct > 15 && data.topHolderPct <= 30}
            good={data.topHolderPct <= 15}
          />
        )}
        {data.top10HolderPct != null && (
          <MetricRow
            label="Топ-10"
            value={`${data.top10HolderPct.toFixed(1)}%`}
            pct={data.top10HolderPct}
            bad={data.top10HolderPct > 65}
            warn={data.top10HolderPct > 40 && data.top10HolderPct <= 65}
            good={data.top10HolderPct <= 40}
          />
        )}

        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "3px 0" }} />

        <MetricRow
          label="Mint Authority"
          value={data.mintRevoked === null ? "—" : data.mintRevoked ? "✓ Отозван" : "✗ Не отозван"}
          good={data.mintRevoked === true}
          bad={data.mintRevoked === false}
          unknown={data.mintRevoked === null}
        />
        <MetricRow
          label="Freeze Auth"
          value={data.freezeRevoked === null ? "—" : data.freezeRevoked ? "✓ Отозван" : "✗ Не отозван"}
          good={data.freezeRevoked === true}
          bad={data.freezeRevoked === false}
          unknown={data.freezeRevoked === null}
        />
        <MetricRow
          label="LP Lock"
          value={
            data.liquidityLocked === null  ? "—" :
            data.liquidityLocked
              ? `🔒 ${data.liquidityLockDays != null ? data.liquidityLockDays + " дн." : "Да"}`
              : "⚠ Нет"
          }
          good={data.liquidityLocked === true}
          bad={data.liquidityLocked === false}
          unknown={data.liquidityLocked === null}
        />
      </div>

      {/* ── Risk warnings (expandable) ── */}
      {data.risks.length > 0 && (
        <div>
          <button
            onClick={() => setShowRisks(p => !p)}
            className="flex items-center gap-1.5 w-full py-0.5"
            style={{ color: "rgba(255,255,255,0.3)", fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <AlertTriangle size={8} style={{ color: "#C9A84C" }} />
            <span style={{ color: "#C9A84C" }}>{data.risks.length}</span>
            <span>предупреждени{data.risks.length === 1 ? "е" : "я"}</span>
            <span style={{ marginLeft: "auto", fontSize: "7px", opacity: 0.5 }}>{showRisks ? "▲" : "▼"}</span>
          </button>

          {showRisks && (
            <div className="flex flex-col gap-1 mt-1">
              {data.risks.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-1.5 px-2 py-1.5 rounded-xl"
                  style={{
                    background: `${levelColor(r.level)}0c`,
                    border: `1px solid ${levelColor(r.level)}22`,
                  }}
                >
                  <AlertTriangle size={8} style={{ color: levelColor(r.level), flexShrink: 0, marginTop: 1 }} />
                  <div className="min-w-0">
                    <p style={{ color: levelColor(r.level), fontSize: "8px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {r.name}
                    </p>
                    {r.description && (
                      <p style={{ color: "rgba(255,255,255,0.28)", fontSize: "7.5px", lineHeight: 1.4, marginTop: 1 }}>
                        {r.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Copy contract address ── */}
      {mintAddress && mintAddress.length > 10 && (
        <button
          onClick={copyAddress}
          className="flex items-center justify-between gap-1.5 w-full px-2.5 py-1.5 rounded-xl"
          style={{
            background: copied ? "rgba(201,168,76,0.07)" : "rgba(255,255,255,0.025)",
            border: `1px solid ${copied ? "rgba(201,168,76,0.25)" : "rgba(255,255,255,0.07)"}`,
            transition: "all 0.2s ease",
          }}
        >
          <span className="truncate" style={{ color: "rgba(255,255,255,0.22)", fontSize: "7.5px", fontFamily: "monospace" }}>
            {mintAddress.slice(0, 18)}…{mintAddress.slice(-6)}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {copied
              ? <><CheckCheck size={8} style={{ color: "#C9A84C" }} /><span style={{ color: "#C9A84C", fontSize: "7.5px", fontFamily: "'Space Grotesk', sans-serif" }}>Скопировано</span></>
              : <><Copy size={8} style={{ color: "rgba(255,255,255,0.28)" }} /><span style={{ color: "rgba(255,255,255,0.28)", fontSize: "7.5px", fontFamily: "'Space Grotesk', sans-serif" }}>Копировать</span></>
            }
          </div>
        </button>
      )}
    </div>
  );
}
