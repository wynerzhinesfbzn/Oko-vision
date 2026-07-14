import { useState, useCallback } from "react";
import { ArrowLeft, Play, BarChart2, TrendingUp, TrendingDown, RefreshCw, Zap, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

// ── Types ────────────────────────────────────────────────────────────────────

interface BacktestConfig {
  slPct:        number;
  tpPct:        number;
  trailingPct:  number;
  period:       7 | 14 | 30 | 90;
  strategy:     "momentum" | "mean-reversion" | "breakout";
  riskPerTrade: number;
  tokenId:      string;
}

interface TradeResult {
  id:         number;
  symbol:     string;
  entryDate:  string;
  exitDate:   string;
  entryPrice: number;
  exitPrice:  number;
  pnlPct:     number;
  pnlUsd:     number;
  duration:   string;
  exitReason: "TP" | "SL" | "Trailing" | "Time";
}

interface BacktestResult {
  totalTrades:      number;
  winningTrades:    number;
  losingTrades:     number;
  winRate:          number;
  profitFactor:     number;
  maxDrawdownPct:   number;
  totalPnlUsd:      number;
  totalPnlPct:      number;
  avgTradeDuration: string;
  sharpeRatio:      number;
  equityCurve:      number[];
  trades:           TradeResult[];
  dataSource:       string;
}

// ── Real OHLCV Tokens (CoinGecko IDs) ───────────────────────────────────────

const TOKENS: { id: string; symbol: string; label: string }[] = [
  { id: "solana",                    symbol: "SOL",   label: "Solana" },
  { id: "bonk",                      symbol: "BONK",  label: "Bonk" },
  { id: "dogwifcoin",                symbol: "WIF",   label: "dogwifhat" },
  { id: "jupiter-exchange-solana",   symbol: "JUP",   label: "Jupiter" },
  { id: "jito-governance-token",     symbol: "JTO",   label: "Jito" },
  { id: "raydium",                   symbol: "RAY",   label: "Raydium" },
  { id: "pyth-network",              symbol: "PYTH",  label: "Pyth" },
  { id: "popcat",                    symbol: "POPCAT", label: "Popcat" },
];

// ── Fetch Real OHLCV from CoinGecko ─────────────────────────────────────────

async function fetchRealOHLCV(coinId: string, days: number): Promise<{ time: number; open: number; high: number; low: number; close: number }[]> {
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko error: ${res.status}`);
  const raw = await res.json() as [number, number, number, number, number][];
  return raw.map(([time, open, high, low, close]) => ({ time, open, high, low, close }));
}

// ── Real Strategy Engines ───────────────────────────────────────────────────

function ema(prices: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let prev = prices[0];
  for (const p of prices) {
    prev = p * k + prev * (1 - k);
    result.push(prev);
  }
  return result;
}

function rsi(prices: number[], period = 14): number[] {
  const result: number[] = Array(period).fill(50);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  for (let i = period; i < prices.length; i++) {
    const avgGain = gains / period;
    const avgLoss = losses / period;
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs));
    const diff = prices[i] - prices[i - 1];
    gains = (gains - gains / period) + Math.max(0, diff);
    losses = (losses - losses / period) + Math.max(0, -diff);
  }
  return result;
}

// ── Run Backtest on Real Data ───────────────────────────────────────────────

function runBacktestOnData(
  bars: { time: number; open: number; high: number; low: number; close: number }[],
  cfg: BacktestConfig,
  symbol: string,
): BacktestResult {
  const closes = bars.map((b) => b.close);
  const initialCapital = 1000;
  let equity = initialCapital;
  const equityCurve: number[] = [equity];
  const trades: TradeResult[] = [];

  // Pre-compute indicators
  const ema8  = ema(closes, 8);
  const ema21 = ema(closes, 21);
  const rsiArr = rsi(closes, 10);
  const rolling20High = closes.map((_, i) => Math.max(...closes.slice(Math.max(0, i - 20), i + 1)));

  let inTrade = false;
  let entryPrice = 0;
  let entryIdx = 0;
  let highSinceEntry = 0;

  for (let i = 22; i < bars.length; i++) {
    const bar = bars[i];
    const close = closes[i];

    if (!inTrade) {
      // Entry signals
      let signal = false;
      if (cfg.strategy === "momentum") {
        // EMA crossover: fast crosses above slow
        signal = ema8[i] > ema21[i] && ema8[i - 1] <= ema21[i - 1];
      } else if (cfg.strategy === "mean-reversion") {
        // RSI oversold bounce
        signal = rsiArr[i] < 35 && rsiArr[i] > rsiArr[i - 1];
      } else if (cfg.strategy === "breakout") {
        // Price breaks 20-bar high
        signal = close > rolling20High[i - 1] && closes[i - 1] <= rolling20High[i - 2];
      }

      if (signal) {
        inTrade = true;
        entryPrice = close;
        entryIdx = i;
        highSinceEntry = close;
      }
    } else {
      highSinceEntry = Math.max(highSinceEntry, close);
      const pnlPct = ((close - entryPrice) / entryPrice) * 100;
      const trailingDrop = ((highSinceEntry - close) / highSinceEntry) * 100;
      const barsHeld = i - entryIdx;

      let exit = false;
      let exitReason: TradeResult["exitReason"] = "Time";
      let exitPrice = close;

      if (pnlPct <= -cfg.slPct) {
        exit = true;
        exitReason = "SL";
        exitPrice = entryPrice * (1 - cfg.slPct / 100);
      } else if (pnlPct >= cfg.tpPct) {
        exit = true;
        exitReason = "TP";
        exitPrice = entryPrice * (1 + cfg.tpPct / 100);
      } else if (trailingDrop >= cfg.trailingPct && pnlPct > 0) {
        exit = true;
        exitReason = "Trailing";
      } else if (barsHeld >= Math.floor(bars.length / 8)) {
        // Max hold time
        exit = true;
        exitReason = "Time";
      }

      if (exit) {
        const finalPnlPct = ((exitPrice - entryPrice) / entryPrice) * 100;
        const usdRisk = (equity * cfg.riskPerTrade) / 100;
        const pnlUsd = usdRisk * (finalPnlPct / cfg.slPct);
        equity = Math.max(0, equity + pnlUsd);
        equityCurve.push(equity);

        const entryDate = new Date(bars[entryIdx].time).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
        const exitDate  = new Date(bar.time).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
        const durationH = Math.round(barsHeld * (bars[1]?.time - bars[0]?.time || 14400000) / 3600000);
        const duration  = durationH >= 24 ? `${Math.floor(durationH / 24)}д ${durationH % 24}ч` : `${durationH}ч`;

        trades.push({
          id: trades.length + 1,
          symbol,
          entryDate, exitDate,
          entryPrice, exitPrice,
          pnlPct: finalPnlPct,
          pnlUsd,
          duration,
          exitReason,
        });
        inTrade = false;
      }
    }
  }

  const winners = trades.filter((t) => t.pnlUsd > 0);
  const losers  = trades.filter((t) => t.pnlUsd <= 0);
  const grossProfit = winners.reduce((s, t) => s + t.pnlUsd, 0);
  const grossLoss   = Math.abs(losers.reduce((s, t) => s + t.pnlUsd, 0));

  let peak = initialCapital, maxDD = 0;
  equityCurve.forEach((v) => {
    if (v > peak) peak = v;
    const dd = ((peak - v) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  });

  const avgBars = trades.length > 0
    ? trades.reduce((s, t) => s + parseInt(t.duration.replace(/[^\d]/g, "")) || 1, 0) / trades.length
    : 0;

  const returns = equityCurve.slice(1).map((v, i) => (v - equityCurve[i]) / equityCurve[i]);
  const avgReturn = returns.length > 0 ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdDev = returns.length > 0
    ? Math.sqrt(returns.reduce((s, r) => s + (r - avgReturn) ** 2, 0) / returns.length)
    : 0;
  const sharpe = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  return {
    totalTrades:      trades.length,
    winningTrades:    winners.length,
    losingTrades:     losers.length,
    winRate:          (winners.length / (trades.length || 1)) * 100,
    profitFactor:     grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0,
    maxDrawdownPct:   maxDD,
    totalPnlUsd:      equity - initialCapital,
    totalPnlPct:      ((equity - initialCapital) / initialCapital) * 100,
    avgTradeDuration: avgBars >= 24 ? `${Math.floor(avgBars / 24)}д ${Math.floor(avgBars % 24)}ч` : `${Math.floor(avgBars)}ч`,
    sharpeRatio:      sharpe,
    equityCurve:      equityCurve.slice(0, 80),
    trades:           trades.slice(0, 40),
    dataSource:       "CoinGecko · реальные данные",
  };
}

// ── Equity Sparkline ──────────────────────────────────────────────────────────

function EquitySpark({ curve }: { curve: number[] }) {
  if (curve.length < 2) return null;
  const min = Math.min(...curve);
  const max = Math.max(...curve);
  const range = max - min || 1;
  const W = 320, H = 80;
  const pts = curve.map((v, i) => {
    const x = (i / (curve.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(" ");
  const isPos = curve[curve.length - 1] >= curve[0];
  const color = isPos ? "#C9A84C" : "#ff5252";
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="eq-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill="url(#eq-grad)" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" />
    </svg>
  );
}

// ── Slider Row ────────────────────────────────────────────────────────────────

function SliderRow({ label, value, min, max, step, unit, onChange, color = "#C9A84C" }: {
  label: string; value: number; min: number; max: number; step: number;
  unit: string; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px" }}>{label}</span>
        <span style={{ color, fontSize: "10px", fontFamily: "monospace", fontWeight: 700 }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full" style={{ accentColor: color, height: "4px" }}
      />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function Backtesting() {
  const [, navigate] = useLocation();
  const [cfg, setCfg] = useState<BacktestConfig>({
    slPct:        8,
    tpPct:        24,
    trailingPct:  5,
    period:       30,
    strategy:     "momentum",
    riskPerTrade: 2,
    tokenId:      "solana",
  });
  const [result,     setResult]     = useState<BacktestResult | null>(null);
  const [running,    setRunning]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [showTrades, setShowTrades] = useState(false);

  const selectedToken = TOKENS.find((t) => t.id === cfg.tokenId) ?? TOKENS[0];

  const run = useCallback(async () => {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      const bars = await fetchRealOHLCV(cfg.tokenId, cfg.period);
      if (bars.length < 25) throw new Error("Недостаточно данных для этого периода");
      const r = runBacktestOnData(bars, cfg, selectedToken.symbol);
      setResult(r);
    } catch (e: any) {
      setError(e?.message ?? "Ошибка загрузки данных");
    } finally {
      setRunning(false);
    }
  }, [cfg, selectedToken.symbol]);

  const periodOpts: Array<BacktestConfig["period"]> = [7, 14, 30, 90];
  const stratOpts: Array<{ key: BacktestConfig["strategy"]; label: string }> = [
    { key: "momentum",       label: "Моментум" },
    { key: "mean-reversion", label: "Откат" },
    { key: "breakout",       label: "Пробой" },
  ];

  return (
    <div className="min-h-screen pb-6" style={{ background: "#080808" }}>
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-4"
        style={{ background: "rgba(5,5,15,0.92)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(201,168,76,0.07)" }}>
        <button onClick={() => navigate("/")} className="flex items-center justify-center w-8 h-8 rounded-xl"
          style={{ background: "rgba(201,168,76,0.07)", border: "1px solid rgba(201,168,76,0.15)" }}>
          <ArrowLeft size={16} style={{ color: "#C9A84C" }} />
        </button>
        <div>
          <h1 className="font-orbitron font-black" style={{ color: "#C9A84C", fontSize: "14px" }}>BACKTESTING</h1>
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>Реальные исторические данные · CoinGecko</p>
        </div>
      </div>

      <div className="px-4 pt-5 space-y-4">
        {/* Token Selector */}
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", marginBottom: "10px" }}>
            ТОКЕН
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {TOKENS.map((t) => (
              <button key={t.id}
                onClick={() => { setCfg((c) => ({ ...c, tokenId: t.id })); setResult(null); }}
                className="py-2 rounded-xl text-center"
                style={{
                  background: cfg.tokenId === t.id ? "rgba(201,168,76,0.15)" : "rgba(255,255,255,0.04)",
                  border: cfg.tokenId === t.id ? "1px solid rgba(201,168,76,0.40)" : "1px solid rgba(255,255,255,0.07)",
                  color: cfg.tokenId === t.id ? "#C9A84C" : "rgba(255,255,255,0.40)",
                  fontSize: "9px", fontWeight: cfg.tokenId === t.id ? 700 : 400,
                }}>
                {t.symbol}
              </button>
            ))}
          </div>
        </div>

        {/* Strategy Config */}
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <h2 style={{ color: "rgba(255,255,255,0.5)", fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", marginBottom: "14px" }}>
            КОНФИГУРАЦИЯ СТРАТЕГИИ
          </h2>

          <div className="flex gap-1.5 mb-4">
            {stratOpts.map((s) => (
              <button key={s.key} onClick={() => setCfg((c) => ({ ...c, strategy: s.key }))}
                className="flex-1 py-2 rounded-xl"
                style={{
                  background: cfg.strategy === s.key ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)",
                  border: cfg.strategy === s.key ? "1px solid rgba(201,168,76,0.35)" : "1px solid rgba(255,255,255,0.07)",
                  color: cfg.strategy === s.key ? "#C9A84C" : "rgba(255,255,255,0.35)",
                  fontSize: "9px", fontWeight: cfg.strategy === s.key ? 700 : 400,
                }}>
                {s.label}
              </button>
            ))}
          </div>

          {/* Strategy description */}
          <div className="mb-4 px-3 py-2 rounded-xl" style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.10)" }}>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", lineHeight: 1.5 }}>
              {cfg.strategy === "momentum" && "EMA 8/21 кроссовер — входит при пересечении быстрой EMA выше медленной"}
              {cfg.strategy === "mean-reversion" && "RSI(10) < 35 + разворот — входит на перепроданности"}
              {cfg.strategy === "breakout" && "Пробой 20-бар максимума — входит при обновлении хая"}
            </p>
          </div>

          {/* Period */}
          <div className="mb-4">
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px", marginBottom: "6px" }}>Период тестирования</div>
            <div className="flex gap-1.5">
              {periodOpts.map((p) => (
                <button key={p} onClick={() => setCfg((c) => ({ ...c, period: p }))}
                  className="flex-1 py-1.5 rounded-lg"
                  style={{
                    background: cfg.period === p ? "rgba(0,168,68,0.12)" : "rgba(255,255,255,0.04)",
                    border: cfg.period === p ? "1px solid rgba(0,168,68,0.35)" : "1px solid rgba(255,255,255,0.07)",
                    color: cfg.period === p ? "#00A844" : "rgba(255,255,255,0.35)",
                    fontSize: "10px", fontWeight: cfg.period === p ? 700 : 400,
                  }}>
                  {p}д
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <SliderRow label="Стоп-лосс"      value={cfg.slPct}        min={2}    max={25}  step={0.5} unit="%" onChange={(v) => setCfg((c) => ({ ...c, slPct: v }))}        color="#ff5252" />
            <SliderRow label="Тейк-профит"    value={cfg.tpPct}        min={5}    max={100} step={1}   unit="%" onChange={(v) => setCfg((c) => ({ ...c, tpPct: v }))}        color="#C9A84C" />
            <SliderRow label="Трейлинг стоп"  value={cfg.trailingPct}  min={1}    max={20}  step={0.5} unit="%" onChange={(v) => setCfg((c) => ({ ...c, trailingPct: v }))} color="#ffab00" />
            <SliderRow label="Риск на сделку" value={cfg.riskPerTrade} min={0.5}  max={10}  step={0.5} unit="%" onChange={(v) => setCfg((c) => ({ ...c, riskPerTrade: v }))} />
          </div>
        </div>

        {/* Run button */}
        <button onClick={run} disabled={running}
          className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-orbitron font-black"
          style={{
            background: running ? "rgba(201,168,76,0.06)" : "linear-gradient(135deg, rgba(201,168,76,0.15), rgba(42,200,232,0.08))",
            border: "1px solid rgba(201,168,76,0.35)",
            color: running ? "rgba(201,168,76,0.4)" : "#C9A84C",
            fontSize: "13px",
          }}>
          {running ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              ЗАГРУЗКА РЕАЛЬНЫХ ДАННЫХ…
            </>
          ) : (
            <>
              <Play size={16} />
              ЗАПУСТИТЬ БЭКТЕСТ · {selectedToken.symbol} · {cfg.period}Д
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "rgba(255,82,82,0.06)", border: "1px solid rgba(255,82,82,0.20)" }}>
            <AlertCircle size={16} style={{ color: "#ff5252", flexShrink: 0 }} />
            <div>
              <div style={{ color: "#ff5252", fontSize: "11px", fontWeight: 700 }}>Ошибка загрузки</div>
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "9px" }}>{error}. Попробуйте другой токен или период.</div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-3" style={{ animation: "fadeInUp 0.4s ease" }}>
            {/* Data source badge */}
            <div className="flex items-center justify-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#C9A84C", boxShadow: "0 0 6px #C9A84C" }} />
              <span style={{ color: "rgba(201,168,76,0.6)", fontSize: "9px", fontFamily: "monospace" }}>
                {result.dataSource} · {result.totalTrades} сигналов найдено
              </span>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Общий PnL",    value: `${result.totalPnlUsd >= 0 ? "+" : ""}$${Math.abs(result.totalPnlUsd).toFixed(0)}`, sub: `${result.totalPnlPct >= 0 ? "+" : ""}${result.totalPnlPct.toFixed(1)}%`,       color: result.totalPnlUsd >= 0 ? "#C9A84C" : "#ff5252" },
                { label: "Win Rate",     value: `${result.winRate.toFixed(1)}%`,                                                      sub: `${result.winningTrades}W / ${result.losingTrades}L`,                            color: result.winRate >= 50 ? "#C9A84C" : "#ff5252" },
                { label: "Profit Factor", value: result.profitFactor.toFixed(2),                                                      sub: result.profitFactor >= 1.5 ? "Отлично" : result.profitFactor >= 1 ? "Хорошо" : "Убыток", color: result.profitFactor >= 1.5 ? "#C9A84C" : result.profitFactor >= 1 ? "#ffab00" : "#ff5252" },
                { label: "Max Drawdown", value: `-${result.maxDrawdownPct.toFixed(1)}%`,                                              sub: "Макс просадка",                                                                  color: result.maxDrawdownPct > 20 ? "#ff5252" : result.maxDrawdownPct > 10 ? "#ffab00" : "#C9A84C" },
                { label: "Sharpe Ratio", value: result.sharpeRatio.toFixed(2),                                                        sub: result.sharpeRatio >= 1 ? "Принято" : "Низкий",                                  color: result.sharpeRatio >= 1 ? "#C9A84C" : "#ff5252" },
                { label: "Avg Сделка",   value: result.avgTradeDuration,                                                              sub: `${result.totalTrades} сделок`,                                                  color: "#00A844" },
              ].map((m) => (
                <div key={m.label} className="rounded-2xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                  <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginBottom: "4px" }}>{m.label}</div>
                  <div style={{ color: m.color, fontSize: "18px", fontFamily: "monospace", fontWeight: 700, lineHeight: 1 }}>{m.value}</div>
                  <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", marginTop: "2px" }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Equity curve */}
            {result.equityCurve.length >= 2 && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div style={{ color: "rgba(255,255,255,0.35)", fontSize: "9px", marginBottom: "10px" }}>КРИВАЯ КАПИТАЛА ($1000 стартовый)</div>
                <EquitySpark curve={result.equityCurve} />
                <div className="flex justify-between mt-2">
                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>$1,000</span>
                  <span style={{ color: result.totalPnlUsd >= 0 ? "#C9A84C" : "#ff5252", fontSize: "9px", fontFamily: "monospace" }}>
                    ${(1000 + result.totalPnlUsd).toFixed(0)}
                  </span>
                </div>
              </div>
            )}

            {/* No trades state */}
            {result.totalTrades === 0 && (
              <div className="rounded-2xl p-6 flex flex-col items-center gap-3"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <AlertCircle size={28} style={{ color: "rgba(255,255,255,0.2)" }} />
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", textAlign: "center" }}>
                  Стратегия не дала сигналов за этот период.<br />Попробуйте другую стратегию или более длинный период.
                </div>
              </div>
            )}

            {/* Trade list toggle */}
            {result.trades.length > 0 && (
              <button onClick={() => setShowTrades((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-2xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div className="flex items-center gap-2">
                  <BarChart2 size={14} style={{ color: "#C9A84C" }} />
                  <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px" }}>
                    История сделок ({result.trades.length})
                  </span>
                </div>
                {showTrades ? <ChevronUp size={14} style={{ color: "#C9A84C" }} /> : <ChevronDown size={14} style={{ color: "#C9A84C" }} />}
              </button>
            )}

            {showTrades && (
              <div className="space-y-2">
                {result.trades.map((t) => {
                  const pos = t.pnlUsd >= 0;
                  return (
                    <div key={t.id} className="rounded-xl px-3 py-2.5 flex items-center gap-2"
                      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.05)" }}>
                      {pos
                        ? <TrendingUp size={12} style={{ color: "#C9A84C", flexShrink: 0 }} />
                        : <TrendingDown size={12} style={{ color: "#ff5252", flexShrink: 0 }} />
                      }
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-1.5">
                          <span style={{ color: "#C9A84C", fontSize: "10px", fontWeight: 700, fontFamily: "monospace" }}>{t.symbol}</span>
                          <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px" }}>{t.entryDate} → {t.exitDate}</span>
                          <span style={{ background: pos ? "rgba(201,168,76,0.12)" : "rgba(255,82,82,0.12)", color: pos ? "#C9A84C" : "#ff5252",
                            fontSize: "8px", padding: "1px 5px", borderRadius: "4px" }}>{t.exitReason}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", fontFamily: "monospace" }}>{t.duration}</span>
                          <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px", fontFamily: "monospace" }}>
                            ${t.entryPrice < 0.001 ? t.entryPrice.toExponential(2) : t.entryPrice.toFixed(4)}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div style={{ color: pos ? "#C9A84C" : "#ff5252", fontSize: "11px", fontFamily: "monospace", fontWeight: 700 }}>
                          {pos ? "+" : ""}{t.pnlPct.toFixed(1)}%
                        </div>
                        <div style={{ color: pos ? "rgba(201,168,76,0.6)" : "rgba(255,82,82,0.6)", fontSize: "9px", fontFamily: "monospace" }}>
                          {pos ? "+" : ""}${t.pnlUsd.toFixed(1)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Strategy tip */}
            {result.totalTrades > 0 && (
              <div className="rounded-2xl p-3 flex items-start gap-2"
                style={{ background: "rgba(201,168,76,0.04)", border: "1px solid rgba(201,168,76,0.1)" }}>
                <Zap size={14} style={{ color: "#C9A84C", flexShrink: 0, marginTop: "1px" }} />
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", lineHeight: "1.5" }}>
                  {result.profitFactor >= 1.5
                    ? `Стратегия "${stratOpts.find((s) => s.key === cfg.strategy)?.label}" на ${selectedToken.label} показывает сильные результаты за ${cfg.period}д. SL ${cfg.slPct}% / TP ${cfg.tpPct}%.`
                    : result.profitFactor >= 1
                    ? `Стратегия прибыльна, но с запасом для улучшения. Попробуйте TP до ${Math.round(cfg.tpPct * 1.3)}% или SL до ${Math.round(cfg.slPct * 0.85)}%.`
                    : `Стратегия убыточна на ${selectedToken.label} за ${cfg.period}д. Рекомендуется сменить токен или параметры.`
                  }
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
