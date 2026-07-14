/**
 * PNLShareModal — PNL share card using real OKO Vision character images.
 * Profit → confident/rich characters (9 variants)
 * Loss   → sad/crying characters (5 variants)
 *
 * The image fills the full card; a dark gradient overlay is applied on the
 * right half so PNL data is always readable over any background.
 */
import { useEffect, useRef, useState } from "react";
import { X, Download, Share2 } from "lucide-react";
import type { Position } from "@/context/TradingContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const W    = 1200;
const H    = 675;
const GOLD = "#C9A84C";

// zoom = how much to enlarge the image to crop out surrounding backgrounds.
// 1.00 = fill exactly, 1.20 = crop ~10% from each edge, 1.40 = crop ~18% etc.
interface CardImg { src: string; zoom: number }

const PROFIT_IMGS: CardImg[] = [
  { src: "/pnl-cards/profit-1.jpg", zoom: 1.20 }, // Shiba sunglasses chain — dark card on grey
  { src: "/pnl-cards/profit-2.jpg", zoom: 1.24 }, // Shiba crown throne — physical card on grey
  { src: "/pnl-cards/profit-3.jpg", zoom: 1.20 }, // Shiba sunglasses luxe — rounded card dark
  { src: "/pnl-cards/profit-4.jpg", zoom: 1.20 }, // Pepe Andy top hat — rounded card
  { src: "/pnl-cards/profit-5.jpg", zoom: 1.26 }, // Viking dog — card on gold texture
  { src: "/pnl-cards/profit-6.jpg", zoom: 1.12 }, // Black lab hoodie — full bleed + bokeh
  { src: "/pnl-cards/profit-7.jpg", zoom: 1.42 }, // Andy frog elegant — embossed 3D card, thick border
  { src: "/pnl-cards/profit-8.jpg", zoom: 1.30 }, // Dog warrior armor — card on velvet
  { src: "/pnl-cards/profit-9.jpg", zoom: 1.06 }, // Rich Pepe billionaire — wide banner, fills well
];

const LOSS_IMGS: CardImg[] = [
  { src: "/pnl-cards/loss-1.jpg", zoom: 1.22 }, // Golden Shiba crying + crown — card on grey
  { src: "/pnl-cards/loss-2.jpg", zoom: 1.20 }, // Black dog crying chain — card on grey/beige
  { src: "/pnl-cards/loss-3.jpg", zoom: 1.06 }, // Pepe crying top hat — wide banner, fills
  { src: "/pnl-cards/loss-4.jpg", zoom: 1.22 }, // Black/tan dog crying suit — card on dark grey
  { src: "/pnl-cards/loss-5.jpg", zoom: 1.22 }, // Baby Shiba sad hoodie — dark bokeh bg
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function holdTime(openedAt: number): string {
  const ms = Date.now() - openedAt;
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function fmt(v: number): string {
  if (v < 0.000001) return v.toExponential(2);
  if (v < 0.0001)   return v.toExponential(2);
  if (v < 0.01)     return v.toFixed(6);
  if (v < 1)        return v.toFixed(4);
  return v.toFixed(2);
}

function fmtMcap(v: number): string {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

/** Deterministic pick based on symbol so same token always gets same card */
function pickImage(symbol: string, profit: boolean): CardImg {
  const pool = profit ? PROFIT_IMGS : LOSS_IMGS;
  const idx  = symbol.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % pool.length;
  return pool[idx];
}

// ── Image loader ──────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img  = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

/**
 * Draw image in "cover + zoom" mode.
 * zoom > 1 crops into the image to eliminate outer padding/background visible
 * on images that were photographed with a surrounding environment (grey mat,
 * gold texture, fabric, etc.).
 * zoom = 1.22 cuts ~11% from each side — enough to remove most outer borders
 * while keeping the character/content intact.
 */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, cw: number, ch: number, zoom = 1.22) {
  const scale = Math.max(cw / img.width, ch / img.height) * zoom;
  const sw    = img.width  * scale;
  const sh    = img.height * scale;
  const ox    = (cw - sw) / 2;
  const oy    = (ch - sh) / 2;
  ctx.drawImage(img, ox, oy, sw, sh);
}

// ── Rounded rect clip ─────────────────────────────────────────────────────────

function clipRounded(ctx: CanvasRenderingContext2D, r: number) {
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(W - r, 0);
  ctx.quadraticCurveTo(W, 0, W, r);
  ctx.lineTo(W, H - r);
  ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H);
  ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.clip();
}

// ── Data overlay ──────────────────────────────────────────────────────────────

function drawDataOverlay(
  ctx: CanvasRenderingContext2D,
  pos: Position,
  profit: boolean,
) {
  const accent  = profit ? GOLD : "#FF4D5E";
  const accentR = profit ? "201,168,76" : "255,77,94";
  const sign    = profit ? "+" : "";

  // ── Right half dark gradient so text is always readable ────────────────────
  const darkOverlay = ctx.createLinearGradient(W * 0.38, 0, W, 0);
  darkOverlay.addColorStop(0,   "rgba(6,6,6,0)");
  darkOverlay.addColorStop(0.18,"rgba(6,6,6,0.72)");
  darkOverlay.addColorStop(0.35,"rgba(6,6,6,0.88)");
  darkOverlay.addColorStop(1,   "rgba(6,6,6,0.94)");
  ctx.fillStyle = darkOverlay;
  ctx.fillRect(0, 0, W, H);

  // Subtle vertical accent stripe
  ctx.fillStyle = `rgba(${accentR},0.22)`;
  ctx.fillRect(W * 0.495, 0, 2, H);

  // ── Left edge accent bar ────────────────────────────────────────────────────
  const bar = ctx.createLinearGradient(0, 0, 0, H);
  bar.addColorStop(0,   `rgba(${accentR},0)`);
  bar.addColorStop(0.3, `rgba(${accentR},0.9)`);
  bar.addColorStop(0.7, `rgba(${accentR},0.9)`);
  bar.addColorStop(1,   `rgba(${accentR},0)`);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, 3, H);

  // ── DATA PANEL (right half) ─────────────────────────────────────────────────
  const DX = W * 0.53;   // data start x
  const DW = W - DX - 36; // data area width

  // OKO VISION label (tiny, top right — replaces the logo already in image)
  ctx.fillStyle = `rgba(${accentR},0.5)`;
  ctx.font      = "600 10px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.letterSpacing = "0.12em";
  ctx.fillText("OKO VISION TERMINAL", W - 36, 38);
  ctx.letterSpacing = "0";

  // Token symbol
  ctx.fillStyle = "rgba(240,235,224,0.92)";
  ctx.font      = "800 52px Arial Black, Arial, sans-serif";
  ctx.textAlign = "left";
  // Clip text if too long
  const symText = pos.symbol.toUpperCase();
  ctx.fillText(symText, DX, 120);

  // ── PNL % — the hero number ─────────────────────────────────────────────────
  ctx.fillStyle = accent;
  const pnlStr  = `${sign}${Math.abs(pos.pnlPct).toFixed(2)}%`;
  // Dynamic font size based on string length
  const pnlSize = pnlStr.length <= 8 ? 118 : pnlStr.length <= 10 ? 98 : 82;
  ctx.font      = `900 ${pnlSize}px Arial Black, Arial, sans-serif`;
  ctx.fillText(pnlStr, DX, 240);

  // Gold/red glow under the % text
  const pnlGlow = ctx.createLinearGradient(DX, 145, DX, 250);
  pnlGlow.addColorStop(0, `rgba(${accentR},0.0)`);
  pnlGlow.addColorStop(1, `rgba(${accentR},0.10)`);
  ctx.fillStyle = pnlGlow;
  ctx.fillRect(DX - 4, 145, 520, 110);

  // USD PNL
  ctx.fillStyle = `rgba(${accentR},0.78)`;
  ctx.font      = `700 28px Arial, sans-serif`;
  ctx.fillText(`${sign}$${Math.abs(pos.pnlUsd).toFixed(2)}`, DX, 280);

  // ── Ornate divider ──────────────────────────────────────────────────────────
  const divGrad = ctx.createLinearGradient(DX, 0, DX + DW, 0);
  divGrad.addColorStop(0,   `rgba(${accentR},0.7)`);
  divGrad.addColorStop(0.6, `rgba(${accentR},0.25)`);
  divGrad.addColorStop(1,   `rgba(${accentR},0)`);
  ctx.fillStyle = divGrad;
  ctx.fillRect(DX, 298, DW, 1);
  // Diamond
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(DX, 298); ctx.lineTo(DX + 6, 292); ctx.lineTo(DX + 12, 298);
  ctx.lineTo(DX + 6, 304); ctx.closePath(); ctx.fill();

  // ── Stats grid ─────────────────────────────────────────────────────────────
  const stats: { label: string; value: string; highlight?: boolean }[] = [
    { label: "КУПЛЕНО ПО",     value: `$${fmt(pos.entryPrice)}` },
    { label: "ТЕКУЩАЯ ЦЕНА",   value: `$${fmt(pos.currentPrice)}`, highlight: true },
    { label: "ОБЪЁМ",          value: `$${pos.usdValue.toFixed(2)}` },
    { label: "ДЕРЖУ",          value: holdTime(pos.openedAt) },
  ];

  // If market caps stored on position (future)
  const p = pos as Position & { entryMcap?: number; exitMcap?: number };
  if (p.entryMcap) stats.push({ label: "MCAP ВХОД", value: fmtMcap(p.entryMcap) });
  if (p.exitMcap)  stats.push({ label: "MCAP ВЫХОД", value: fmtMcap(p.exitMcap), highlight: true });

  const COL_W = DW / 2 + 8;
  stats.forEach(({ label, value, highlight }, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const sx  = DX + col * COL_W;
    const sy  = 322 + row * 82;

    // Label
    ctx.fillStyle  = `rgba(${accentR},0.48)`;
    ctx.font       = "600 9px Arial, sans-serif";
    ctx.textAlign  = "left";
    ctx.letterSpacing = "0.1em";
    ctx.fillText(label, sx, sy);
    ctx.letterSpacing = "0";

    // Value
    ctx.fillStyle  = highlight ? accent : "rgba(240,235,224,0.88)";
    ctx.font       = "700 21px Arial, sans-serif";
    ctx.fillText(value, sx, sy + 27);
  });

  // ── Mood badge ─────────────────────────────────────────────────────────────
  const badgeY   = H - 88;
  const badgeText = profit ? "🏆  ТРЕЙД ЗАКРЫТ В ПЛЮС" : "⚡  РЫНОК ПРОВЕРЯЕТ — ОКО ПОМНИТ";
  ctx.fillStyle   = `rgba(${accentR},0.11)`;
  ctx.beginPath();
  ctx.roundRect(DX, badgeY, Math.min(DW, 370), 46, 8);
  ctx.fill();
  ctx.strokeStyle = `rgba(${accentR},0.28)`;
  ctx.lineWidth   = 1;
  ctx.beginPath();
  ctx.roundRect(DX, badgeY, Math.min(DW, 370), 46, 8);
  ctx.stroke();
  ctx.fillStyle   = `rgba(${accentR},0.85)`;
  ctx.font        = "700 14px Arial, sans-serif";
  ctx.textAlign   = "left";
  ctx.fillText(badgeText, DX + 16, badgeY + 29);

  // ── Bottom watermark ───────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.font      = "400 11px Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("okovision.io  ·  Powered by Solana", W - 28, H - 28);
}

// ── Gold border ───────────────────────────────────────────────────────────────

function drawBorder(ctx: CanvasRenderingContext2D, profit: boolean) {
  const r      = 32;
  const alpha  = profit ? 0.55 : 0.30;
  ctx.strokeStyle = `rgba(201,168,76,${alpha})`;
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(W - r, 0);
  ctx.quadraticCurveTo(W, 0, W, r);
  ctx.lineTo(W, H - r);
  ctx.quadraticCurveTo(W, H, W - r, H);
  ctx.lineTo(r, H);
  ctx.quadraticCurveTo(0, H, 0, H - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.stroke();

  // Corner ornaments
  const ornamentCorners = [
    { x: 28, y: 28, ax: 1, ay: 1 },
    { x: W - 28, y: 28, ax: -1, ay: 1 },
  ];
  ctx.strokeStyle = `rgba(201,168,76,${alpha * 0.8})`;
  ctx.lineWidth   = 1.5;
  ornamentCorners.forEach(({ x, y, ax, ay }) => {
    const s = 28;
    ctx.beginPath();
    ctx.moveTo(x - ax * s, y); ctx.lineTo(x - ax * s, y - ay * s); ctx.lineTo(x, y - ay * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - ax * s * 0.5, y - ay * s * 0.5, 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(201,168,76,${alpha})`;
    ctx.fill();
  });
}

// ── Main draw ─────────────────────────────────────────────────────────────────

async function drawCard(canvas: HTMLCanvasElement, pos: Position): Promise<void> {
  const ctx    = canvas.getContext("2d")!;
  canvas.width = W; canvas.height = H;
  const profit   = pos.pnlPct >= 0;
  const cardImg  = pickImage(pos.symbol, profit);

  // Draw black base
  ctx.fillStyle = "#080808";
  ctx.fillRect(0, 0, W, H);

  // Apply rounded clip
  ctx.save();
  clipRounded(ctx, 32);

  try {
    const img = await loadImage(cardImg.src);
    drawCover(ctx, img, W, H, cardImg.zoom);
  } catch {
    // Fallback: dark background if image fails
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(0, 0, W, H);
  }

  drawDataOverlay(ctx, pos, profit);
  ctx.restore();

  // Border drawn OUTSIDE clip so it sits on top of the rounded edge
  drawBorder(ctx, profit);
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props { pos: Position | null; onClose: () => void; }

export default function PNLShareModal({ pos, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready,   setReady]   = useState(false);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    if (!pos || !canvasRef.current) return;
    setReady(false);
    drawCard(canvasRef.current, pos).then(() => setReady(true));
  }, [pos]);

  if (!pos) return null;

  const profit = pos.pnlPct >= 0;
  const accentR = profit ? "201,168,76" : "255,77,94";
  const accent  = profit ? GOLD : "#FF4D5E";

  const handleDownload = () => {
    const url = canvasRef.current?.toDataURL("image/png");
    if (!url) return;
    const a = document.createElement("a");
    a.href = url; a.download = `oko-pnl-${pos.symbol}.png`; a.click();
  };

  const handleShare = async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    setCopying(true);
    canvas.toBlob(async (blob) => {
      if (!blob) { setCopying(false); return; }
      try {
        if (navigator.share) {
          await navigator.share({
            title: `${pos.symbol} ${profit ? "+" : ""}${pos.pnlPct.toFixed(2)}% — OKO Vision`,
            files: [new File([blob], `oko-pnl-${pos.symbol}.png`, { type: "image/png" })],
          });
        } else {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        }
      } catch (_) {}
      setTimeout(() => setCopying(false), 1500);
    }, "image/png");
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9500,
        background: "rgba(4,4,4,0.94)", backdropFilter: "blur(18px)",
        WebkitBackdropFilter: "blur(18px)",
        display: "flex", alignItems: "flex-end",
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{
        width: "100%", maxWidth: 480, margin: "0 auto",
        background: "#0A0A0A",
        borderTop: `1px solid rgba(${accentR},0.22)`,
        borderRadius: "20px 20px 0 0",
      }}>
        {/* Handle */}
        <div style={{ display: "flex", justifyContent: "center", padding: "10px 0 4px" }}>
          <div style={{ width: 36, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.10)" }} />
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Share2 size={13} style={{ color: accent }} />
            <div>
              <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "13px", fontWeight: 800, color: "#F0EBE0", letterSpacing: "0.06em" }}>
                ПОДЕЛИТЬСЯ PNL
              </div>
              <div style={{ color: `rgba(${accentR},0.45)`, fontSize: "9.5px", fontFamily: "'Space Grotesk', sans-serif", letterSpacing: "0.04em", marginTop: 1 }}>
                {pos.symbol} · {profit ? "ПРОФИТ" : "УБЫТОК"} · {profit ? "+" : ""}{pos.pnlPct.toFixed(2)}%
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer" }}>
            <X size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
          </button>
        </div>

        {/* Canvas preview */}
        <div style={{ padding: "0 14px", marginBottom: 14 }}>
          <div style={{
            borderRadius: 12, overflow: "hidden",
            border: `1px solid rgba(${accentR},0.20)`,
            background: "#060606",
            minHeight: 195,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {!ready && (
              <div style={{ width: 26, height: 26, border: `2px solid rgba(${accentR},0.25)`, borderTopColor: accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", position: "absolute" }} />
            )}
            <canvas
              ref={canvasRef}
              style={{ width: "100%", display: "block", opacity: ready ? 1 : 0, transition: "opacity 0.35s" }}
            />
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 10, padding: "0 14px 32px" }}>
          <button
            onClick={handleShare}
            style={{
              flex: 1, height: 50, borderRadius: 12, cursor: "pointer",
              background: `rgba(${accentR},0.09)`,
              border: `1px solid rgba(${accentR},0.22)`,
              color: accent,
              fontSize: "12px", fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "0.06em", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            <Share2 size={13} />
            {copying ? "ГОТОВО!" : "ПОДЕЛИТЬСЯ"}
          </button>
          <button
            onClick={handleDownload}
            style={{
              flex: 1, height: 50, borderRadius: 12, cursor: "pointer",
              background: accent, border: "none",
              color: profit ? "#080808" : "#fff",
              fontSize: "12px", fontWeight: 800, fontFamily: "'Space Grotesk', sans-serif",
              letterSpacing: "0.06em", display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            <Download size={13} />
            СКАЧАТЬ PNG
          </button>
        </div>
      </div>
    </div>
  );
}
