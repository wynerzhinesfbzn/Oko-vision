import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  LineStyle,
  CrosshairMode,
  type IChartApi,
} from "lightweight-charts";
import { fetchPoolOHLCV, generateSyntheticOHLCV, formatNum } from "@/lib/geckoTerminal";
import { calcRSI, calcMACD, calcBollingerBands, calcEMA, calcSMA, findKeyLevels, findLocalExtremes } from "@/lib/indicators";
import type { PoolSignal, OHLCVBar } from "@/lib/geckoTerminal";
import { X, RefreshCw, BarChart2 } from "lucide-react";

const TIMEFRAMES = [
  { label: "5M",  tf: "minute" as const, agg: 5  },
  { label: "15M", tf: "minute" as const, agg: 15 },
  { label: "1H",  tf: "hour"   as const, agg: 1  },
  { label: "4H",  tf: "hour"   as const, agg: 4  },
  { label: "1D",  tf: "day"    as const, agg: 1  },
];

interface Props {
  token: PoolSignal | null;
  onClose: () => void;
}

// ── Consolidation (sideways) detector ──
function detectConsolidation(
  bars: OHLCVBar[],
  lookback = 40,
): { active: boolean; upper: number; lower: number; startTime: number } {
  if (bars.length < lookback) {
    return { active: false, upper: 0, lower: 0, startTime: 0 };
  }
  const recent = bars.slice(-lookback);
  const highs = recent.map((b) => b.high);
  const lows  = recent.map((b) => b.low);
  const upper = Math.max(...highs);
  const lower = Math.min(...lows);
  const mid   = (upper + lower) / 2;
  if (mid === 0) return { active: false, upper: 0, lower: 0, startTime: 0 };

  const rangePct = ((upper - lower) / mid) * 100;

  // Candles that close inside the range (allow 5% beyond bounds)
  const tolerance = (upper - lower) * 0.1;
  const inside = recent.filter(
    (b) => b.close >= lower - tolerance && b.close <= upper + tolerance,
  ).length;
  const insidePct = inside / recent.length;

  const active = rangePct < 35 && insidePct >= 0.80;
  return {
    active,
    upper,
    lower,
    startTime: (recent[0].time as number),
  };
}

function buildCharts(
  mainEl: HTMLDivElement,
  rsiEl: HTMLDivElement | null,
  macdEl: HTMLDivElement | null,
  bars: OHLCVBar[],
  indicators: Record<string, boolean>,
  supply: number | null,
  showMcap: boolean,
): () => void {
  // Scale bars to market cap only when toggled on and supply is available
  const useMcap = showMcap && supply && supply > 0;
  const scaledBars: OHLCVBar[] = useMcap
    ? bars.map((b) => ({
        ...b,
        open:  b.open  * supply!,
        high:  b.high  * supply!,
        low:   b.low   * supply!,
        close: b.close * supply!,
      }))
    : bars;

  const base = {
    layout: {
      background: { color: "#080808" },
      textColor: "rgba(255,255,255,0.4)",
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: "rgba(201,168,76,0.04)" },
      horzLines: { color: "rgba(201,168,76,0.04)" },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: "rgba(201,168,76,0.12)" },
    timeScale: { borderColor: "rgba(201,168,76,0.12)", timeVisible: true, secondsVisible: false },
  };

  const closes = scaledBars.map((b) => b.close);
  const times  = scaledBars.map((b) => b.time as any);

  // Price format
  const mcapFormat = {
    type: "custom" as const,
    formatter: (v: number) => formatNum(v),
    minMove: 0.01,
  };

  const rawBarsForPrecision = bars;
  const allPrices = rawBarsForPrecision.flatMap((b) => [b.open, b.high, b.low, b.close]).filter((p) => p > 0);
  const minPrice  = allPrices.length ? Math.min(...allPrices) : 1;
  const magnitude = Math.floor(Math.log10(minPrice));
  const precision = magnitude >= 2 ? 2 : magnitude >= 0 ? 4 : magnitude >= -2 ? 6 : Math.min(10, Math.abs(magnitude) + 4);
  const rawFormat = { type: "price" as const, precision, minMove: Math.pow(10, -precision) };

  const priceFormat = useMcap ? mcapFormat : rawFormat;

  // ── MAIN CHART ──
  const main = createChart(mainEl, { ...base, width: mainEl.clientWidth, height: mainEl.clientHeight });

  const candleSeries = main.addSeries(CandlestickSeries, {
    upColor: "#C9A84C", downColor: "#ff5252",
    borderUpColor: "#C9A84C", borderDownColor: "#ff5252",
    wickUpColor: "#C9A84C", wickDownColor: "#ff5252",
    priceFormat,
  });
  candleSeries.setData(
    scaledBars.map((b) => ({ time: b.time as any, open: b.open, high: b.high, low: b.low, close: b.close })),
  );

  // Volume on main
  if (indicators.volume) {
    const volSeries = main.addSeries(HistogramSeries, {
      color: "rgba(201,168,76,0.25)",
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    main.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });
    const avgVol = bars.reduce((s, b) => s + b.volume, 0) / (bars.length || 1);
    volSeries.setData(
      bars.map((b) => ({
        time: b.time as any,
        value: b.volume,
        color: b.volume > avgVol * 2.5
          ? "rgba(255,140,0,0.55)"
          : b.close >= b.open
          ? "rgba(201,168,76,0.28)"
          : "rgba(255,82,82,0.25)",
      })),
    );

    // Volume spike markers — compact, smaller text
    const spikeMarkers = bars
      .map((b, i) => (b.volume > avgVol * 2.5 ? i : -1))
      .filter((i) => i >= 0)
      .slice(-3)
      .map((i) => ({
        time: bars[i].time as any,
        position: "aboveBar" as const,
        color: "#C9A84C",
        shape: "arrowDown" as const,
        text: "🔥 Всплеск объёма",
        size: 1,
      }));
    if (spikeMarkers.length) createSeriesMarkers(candleSeries, spikeMarkers);
  }

  // Bollinger Bands
  if (indicators.bb && closes.length >= 20) {
    const bb = calcBollingerBands(closes);
    const mkLine = (color: string) =>
      main.addSeries(LineSeries, {
        color, lineWidth: 1, lineStyle: LineStyle.Dashed,
        crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
      });
    const toSeries = (arr: (number | null)[]) =>
      arr.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[];
    mkLine("rgba(255,215,0,0.5)").setData(toSeries(bb.upper));
    mkLine("rgba(255,215,0,0.3)").setData(toSeries(bb.middle));
    mkLine("rgba(255,215,0,0.5)").setData(toSeries(bb.lower));
  }

  // SMA
  if (indicators.sma && closes.length >= 20) {
    const mkLine = (color: string) =>
      main.addSeries(LineSeries, {
        color, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
      });
    const toSeries = (arr: (number | null)[]) =>
      arr.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[];
    mkLine("rgba(201,168,76,0.55)").setData(toSeries(calcSMA(closes, 20)));
    if (closes.length >= 50) mkLine("rgba(0,180,255,0.35)").setData(toSeries(calcSMA(closes, 50)));
  }

  // EMA
  if (indicators.ema && closes.length >= 9) {
    const mkLine = (color: string) =>
      main.addSeries(LineSeries, {
        color, lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceLineVisible: false,
      });
    const toSeries = (arr: (number | null)[]) =>
      arr.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[];
    mkLine("rgba(255,100,255,0.55)").setData(toSeries(calcEMA(closes, 9)));
    if (closes.length >= 21) mkLine("rgba(200,80,255,0.35)").setData(toSeries(calcEMA(closes, 21)));
  }

  // ── KEY LEVELS (Support / Resistance) — professional approach ──
  const levels = findKeyLevels(scaledBars);
  const LEVELS: { price: number; title: string; color: string; dash: LineStyle; width: 1 | 2 }[] = [
    { price: levels.resistance1, title: "Сопротивление",   color: "#ff5252", dash: LineStyle.Dashed,  width: 1 },
    { price: levels.resistance2, title: "Сопр. 2",         color: "#C9A84C", dash: LineStyle.Dotted,  width: 1 },
    { price: levels.midpoint,    title: "Midpoint",        color: "rgba(255,215,0,0.6)", dash: LineStyle.Dotted, width: 1 },
    { price: levels.support1,    title: "Поддержка",       color: "#00b8d9", dash: LineStyle.Dashed,  width: 1 },
    { price: levels.support2,    title: "Поддержка 2",     color: "#C9A84C", dash: LineStyle.Dotted,  width: 1 },
  ];
  LEVELS.forEach(({ price, title, color, dash, width }) => {
    if (price <= 0) return;
    candleSeries.createPriceLine({ price, color, lineWidth: width, lineStyle: dash, axisLabelVisible: true, title });
  });

  // ── LOCAL EXTREMES (peaks / troughs) — pro trader markers ──
  const { peaks, troughs } = findLocalExtremes(scaledBars);
  const extremeMarkers: any[] = [
    ...peaks.slice(-3).map((i, idx) => ({
      time: scaledBars[i].time as any,
      position: "aboveBar" as const,
      color: "#ff5252",
      shape: "arrowDown" as const,
      size: 1,
      text: idx === peaks.slice(-3).length - 1 ? "Верш." : "Макс.",
    })),
    ...troughs.slice(-3).map((i, idx) => ({
      time: scaledBars[i].time as any,
      position: "belowBar" as const,
      color: "#C9A84C",
      shape: "arrowUp" as const,
      size: 1,
      text: idx === troughs.slice(-3).length - 1 ? "Дно" : "Мин.",
    })),
  ].sort((a, b) => (a.time as number) - (b.time as number));

  if (!indicators.volume && extremeMarkers.length) {
    createSeriesMarkers(candleSeries, extremeMarkers);
  }

  // ── CONSOLIDATION ZONE (sideways market) ──
  const consol = detectConsolidation(scaledBars, 40);
  if (consol.active) {
    // Upper boundary of the range
    candleSeries.createPriceLine({
      price: consol.upper,
      color: "#ffd700",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "══ Боковик верх",
    });
    // Lower boundary of the range
    candleSeries.createPriceLine({
      price: consol.lower,
      color: "#ffd700",
      lineWidth: 2,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: true,
      title: "══ Боковик низ",
    });
    // Mid-line of the consolidation zone
    candleSeries.createPriceLine({
      price: (consol.upper + consol.lower) / 2,
      color: "rgba(255,215,0,0.35)",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
  }

  main.timeScale().fitContent();

  const charts: IChartApi[] = [main];
  const cleanups: (() => void)[] = [];

  // ── RSI ──
  let rsiChart: IChartApi | null = null;
  if (rsiEl && indicators.rsi && closes.length > 14) {
    rsiChart = createChart(rsiEl, { ...base, width: rsiEl.clientWidth, height: rsiEl.clientHeight });
    charts.push(rsiChart);
    const rsiValues = calcRSI(closes);
    const rsiSeries = rsiChart.addSeries(LineSeries, { color: "#b39ddb", lineWidth: 2, priceLineVisible: false });
    rsiSeries.setData(
      rsiValues.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[],
    );
    [70, 50, 30].forEach((level) => {
      rsiSeries.createPriceLine({
        price: level,
        color: level === 70 ? "rgba(255,82,82,0.4)" : level === 30 ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.12)",
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
        title: level === 70 ? "Перекуп" : level === 30 ? "Перепрод" : "",
      });
    });
    rsiChart.timeScale().fitContent();
  }

  // ── MACD ──
  let macdChart: IChartApi | null = null;
  if (macdEl && indicators.macd && closes.length > 26) {
    macdChart = createChart(macdEl, { ...base, width: macdEl.clientWidth, height: macdEl.clientHeight });
    charts.push(macdChart);
    const { macd: macdLine, signal: signalLine, histogram } = calcMACD(closes);
    const toSeries = (arr: (number | null)[]) =>
      arr.map((v, i) => (v !== null ? { time: times[i], value: v } : null)).filter(Boolean) as any[];

    macdChart.addSeries(LineSeries, { color: "#C9A84C", lineWidth: 2, priceLineVisible: false }).setData(toSeries(macdLine));
    macdChart.addSeries(LineSeries, { color: "#ff80ab", lineWidth: 2, priceLineVisible: false, lastValueVisible: false }).setData(toSeries(signalLine));
    macdChart
      .addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false })
      .setData(
        histogram
          .map((v, i) => (v !== null ? { time: times[i], value: v, color: v >= 0 ? "rgba(201,168,76,0.55)" : "rgba(255,82,82,0.55)" } : null))
          .filter(Boolean) as any[],
      );
    macdChart.timeScale().fitContent();
  }

  // Sync timescales
  const syncHandler = (range: any) => {
    if (!range) return;
    rsiChart?.timeScale().setVisibleLogicalRange(range);
    macdChart?.timeScale().setVisibleLogicalRange(range);
  };
  main.timeScale().subscribeVisibleLogicalRangeChange(syncHandler);
  cleanups.push(() => main.timeScale().unsubscribeVisibleLogicalRangeChange(syncHandler));

  // Resize observer
  const ro = new ResizeObserver(() => {
    main.applyOptions({ width: mainEl.clientWidth, height: mainEl.clientHeight });
    if (rsiEl && rsiChart) rsiChart.applyOptions({ width: rsiEl.clientWidth, height: rsiEl.clientHeight });
    if (macdEl && macdChart) macdChart.applyOptions({ width: macdEl.clientWidth, height: macdEl.clientHeight });
  });
  ro.observe(mainEl);

  return () => {
    ro.disconnect();
    cleanups.forEach((fn) => fn());
    charts.forEach((c) => { try { c.remove(); } catch {} });
  };
}

// ── Indicator help tooltips ──
const INDICATOR_HELP: Record<string, { name: string; desc: string; getSignal: (bars: OHLCVBar[]) => { text: string; color: string } }> = {
  rsi: {
    name: "RSI — Индекс относительной силы",
    desc: "Показывает, насколько токен перекуплен или перепродан. Значение >70 — перекуплен (риск коррекции), <30 — перепродан (возможен отскок).",
    getSignal: (b) => {
      const rsi = calcRSI(b.map((x) => x.close));
      const last = rsi.reduce<number | null>((_, v) => v ?? _, null);
      if (last === null) return { text: "Недостаточно данных (нужно 14+ свечей)", color: "rgba(255,255,255,0.4)" };
      if (last > 70) return { text: `RSI ${last.toFixed(1)} — Перекуплен, возможна продажа`, color: "#ff5252" };
      if (last < 30) return { text: `RSI ${last.toFixed(1)} — Перепродан, возможна покупка`, color: "#C9A84C" };
      return { text: `RSI ${last.toFixed(1)} — Нейтральная зона, без чёткого сигнала`, color: "#ffd700" };
    },
  },
  macd: {
    name: "MACD — Схождение/расхождение скользящих",
    desc: "Разница двух EMA. Если MACD пересекает сигнальную линию снизу вверх — сигнал на покупку, сверху вниз — на продажу.",
    getSignal: (b) => {
      const { macd, signal } = calcMACD(b.map((x) => x.close));
      const lm = macd.reduce<number | null>((_, v) => v ?? _, null);
      const ls = signal.reduce<number | null>((_, v) => v ?? _, null);
      if (lm === null || ls === null) return { text: "Недостаточно данных (нужно 26+ свечей)", color: "rgba(255,255,255,0.4)" };
      if (lm > ls) return { text: "MACD выше сигнала — бычий сигнал, возможен рост", color: "#C9A84C" };
      return { text: "MACD ниже сигнала — медвежий сигнал, возможно снижение", color: "#ff5252" };
    },
  },
  bb: {
    name: "ББ — Полосы Боллинджера",
    desc: "Три линии: средняя (SMA20) и границы ±2σ. Цена у верхней полосы — перекуплен, у нижней — перепродан.",
    getSignal: (b) => {
      const closes = b.map((x) => x.close);
      const { upper, lower } = calcBollingerBands(closes);
      const last = closes[closes.length - 1];
      const lu = upper.reduce<number | null>((_, v) => v ?? _, null);
      const ll = lower.reduce<number | null>((_, v) => v ?? _, null);
      if (!lu || !ll) return { text: "Недостаточно данных (нужно 20+ свечей)", color: "rgba(255,255,255,0.4)" };
      if (last > lu) return { text: "Цена выше верхней полосы — перекуплен, осторожно с покупкой", color: "#ff5252" };
      if (last < ll) return { text: "Цена ниже нижней полосы — перепродан, возможна покупка", color: "#C9A84C" };
      const pct = ((last - ll) / (lu - ll) * 100).toFixed(0);
      return { text: `Цена в середине полос (${pct}%) — нейтральная зона`, color: "#ffd700" };
    },
  },
  sma: {
    name: "СМА — Простая скользящая средняя",
    desc: "Средняя цена за 20 и 50 свечей. Цена выше SMA — восходящий тренд, ниже — нисходящий.",
    getSignal: (b) => {
      const closes = b.map((x) => x.close);
      const sma = calcSMA(closes, 20).reduce<number | null>((_, v) => v ?? _, null);
      const last = closes[closes.length - 1];
      if (!sma) return { text: "Недостаточно данных (нужно 20+ свечей)", color: "rgba(255,255,255,0.4)" };
      if (last > sma) return { text: "Цена выше SMA20 — восходящий тренд, бычий сигнал", color: "#C9A84C" };
      return { text: "Цена ниже SMA20 — нисходящий тренд, медвежий сигнал", color: "#ff5252" };
    },
  },
  ema: {
    name: "ЭМА — Экспоненциальная скользящая",
    desc: "Как SMA, но быстрее реагирует на изменения. EMA(9) — краткосрочный тренд, EMA(21) — среднесрочный.",
    getSignal: (b) => {
      const closes = b.map((x) => x.close);
      const e9  = calcEMA(closes, 9).reduce<number | null>((_, v) => v ?? _, null);
      const e21 = calcEMA(closes, 21).reduce<number | null>((_, v) => v ?? _, null);
      const last = closes[closes.length - 1];
      if (!e9) return { text: "Недостаточно данных", color: "rgba(255,255,255,0.4)" };
      if (!e21)
        return last > e9
          ? { text: "Цена выше EMA9 — краткосрочный рост", color: "#C9A84C" }
          : { text: "Цена ниже EMA9 — краткосрочное снижение", color: "#ff5252" };
      if (e9 > e21 && last > e9) return { text: "EMA9 > EMA21 и цена выше — сильный бычий тренд", color: "#C9A84C" };
      if (e9 < e21 && last < e9) return { text: "EMA9 < EMA21 и цена ниже — сильный медвежий тренд", color: "#ff5252" };
      return { text: "Смешанные сигналы EMA — рынок в неопределённости", color: "#ffd700" };
    },
  },
  volume: {
    name: "Объём — Volume",
    desc: "Торговый объём на главном графике. Оранжевые столбики — аномальный всплеск (возможный вход крупных игроков).",
    getSignal: (b) => {
      if (!b.length) return { text: "Нет данных", color: "rgba(255,255,255,0.4)" };
      const avg  = b.reduce((s, x) => s + x.volume, 0) / b.length;
      const last = b[b.length - 1];
      const ratio = (last.volume / avg).toFixed(1);
      if (last.volume > avg * 2.5) return { text: `Аномальный объём (${ratio}× среднего) — возможен вход крупных игроков`, color: "#C9A84C" };
      if (last.volume > avg * 1.5) return { text: `Повышенный объём (${ratio}× среднего) — интерес к токену растёт`, color: "#ffd700" };
      return { text: `Нормальный объём (${ratio}× среднего) — без аномалий`, color: "rgba(255,255,255,0.5)" };
    },
  },
};

export default function ChartModal({ token, onClose }: Props) {
  const [visible,      setVisible]      = useState(false);
  const [bars,         setBars]         = useState<OHLCVBar[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [tfIdx,        setTfIdx]        = useState(0);
  const [showMcap,     setShowMcap]     = useState(false);
  const [isSynthetic,  setIsSynthetic]  = useState(false);
  const [indicators,   setIndicators]   = useState({ rsi: true, macd: true, bb: true, sma: true, ema: true, volume: true });
  const [lastUpdate,   setLastUpdate]   = useState<Date | null>(null);
  const [openTooltip,  setOpenTooltip]  = useState<string | null>(null);

  const mainRef    = useRef<HTMLDivElement | null>(null);
  const rsiRef     = useRef<HTMLDivElement | null>(null);
  const macdRef    = useRef<HTMLDivElement | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (token) setTimeout(() => setVisible(true), 30);
    else { setVisible(false); setBars([]); setShowMcap(false); }
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const tf   = TIMEFRAMES[tfIdx];
      let data = await fetchPoolOHLCV(token.network, token.poolAddress, tf.tf, tf.agg, 200);
      // DexScreener has no public OHLCV endpoint — use synthetic bars derived
      // from the token's known 5m/1h/24h price anchors as a realistic fallback.
      if (data.length === 0) {
        data = generateSyntheticOHLCV(token, tf.tf, tf.agg, 200);
        setIsSynthetic(true);
      } else {
        setIsSynthetic(false);
      }
      setBars(data);
      setLastUpdate(new Date());
    } finally {
      setLoading(false);
    }
  }, [token, tfIdx]);

  useEffect(() => { if (token) load(); }, [load]);

  // Render charts whenever bars, indicators, or mcap-mode changes
  useEffect(() => {
    if (!mainRef.current || bars.length === 0) return;
    if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; }
    const supply = token?.marketCap && token.price > 0 ? token.marketCap / token.price : null;
    const cleanup = buildCharts(
      mainRef.current,
      indicators.rsi  ? rsiRef.current  : null,
      indicators.macd ? macdRef.current : null,
      bars,
      indicators,
      supply,
      showMcap,
    );
    cleanupRef.current = cleanup;
    return () => { if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; } };
  }, [bars, indicators, token, showMcap]);

  useEffect(() => {
    return () => { if (cleanupRef.current) { cleanupRef.current(); cleanupRef.current = null; } };
  }, []);

  if (!token) return null;

  const signalColor  = token.aiSignal === "BUY" ? "#C9A84C" : token.aiSignal === "SELL" ? "#ff5252" : "#ffd700";
  const hasMcapData  = !!(token.marketCap && token.price > 0);

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col"
      style={{ background: "#080808", opacity: visible ? 1 : 0, transition: "opacity 0.25s ease", pointerEvents: visible ? "auto" : "none" }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid rgba(201,168,76,0.10)", background: "rgba(8,8,8,0.97)" }}
      >
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
        >
          <X size={15} style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {token.baseToken.imageUrl && (
              <img
                src={token.baseToken.imageUrl}
                alt={token.baseToken.symbol}
                className="w-5 h-5 rounded-full shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <span className="font-orbitron font-bold" style={{ color: "#C9A84C", fontSize: "13px", textShadow: "0 0 8px rgba(201,168,76,0.5)" }}>
              {token.baseToken.symbol}
            </span>
            <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>/ USDC</span>
            <span className="px-1.5 py-0.5 rounded" style={{
              background: `${signalColor}14`, border: `1px solid ${signalColor}30`,
              color: signalColor, fontSize: "8px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700,
            }}>
              AI: {token.aiSignal} {token.aiScore}
            </span>
            {token.volumeSpike && <span style={{ fontSize: "10px" }}>🔥</span>}
            {token.whaleEntry  && <span style={{ fontSize: "10px" }}>🐳</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {token.marketCap ? (
              <span style={{ color: "#C9A84C", fontSize: "12px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700 }}>
                Капа: {formatNum(token.marketCap)}
              </span>
            ) : null}
            <span style={{ color: token.change24h > 0 ? "#C9A84C" : "#ff5252", fontSize: "11px" }}>
              {token.change24h > 0 ? "+" : ""}{token.change24h.toFixed(2)}%
            </span>
            {lastUpdate && (
              <span style={{ color: "rgba(255,255,255,0.2)", fontSize: "9px" }}>
                {lastUpdate.toLocaleTimeString("ru")}
              </span>
            )}
            {isSynthetic && (
              <span
                className="px-1.5 py-0.5 rounded"
                style={{
                  background: "rgba(255,165,0,0.10)",
                  border: "1px solid rgba(255,165,0,0.25)",
                  color: "rgba(255,165,0,0.7)",
                  fontSize: "7px",
                  fontFamily: "'Space Grotesk', sans-serif",
                  letterSpacing: "0.05em",
                }}
              >
                ИИ-МОДЕЛЬ
              </span>
            )}
          </div>
        </div>

        <button onClick={load} className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "rgba(201,168,76,0.06)", border: "1px solid rgba(201,168,76,0.15)" }}>
          <RefreshCw size={13} style={{ color: "#C9A84C", animation: loading ? "spin 0.8s linear infinite" : "none" }} />
        </button>
      </div>

      {/* Timeframe + Price/MCap toggle + Indicators */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0 gap-2 flex-wrap"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: "rgba(8,8,8,0.85)" }}
      >
        {/* Left: timeframes + price/mcap toggle */}
        <div className="flex gap-1 items-center flex-wrap">
          {TIMEFRAMES.map((t, i) => (
            <button key={t.label} onClick={() => setTfIdx(i)}
              className="px-2 py-1 rounded-lg"
              style={{
                background: i === tfIdx ? "rgba(201,168,76,0.12)" : "transparent",
                border: i === tfIdx ? "1px solid rgba(201,168,76,0.28)" : "1px solid transparent",
                color: i === tfIdx ? "#C9A84C" : "rgba(255,255,255,0.35)",
                fontFamily: "'Space Grotesk', sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "0.06em",
              }}>
              {t.label}
            </button>
          ))}

          {/* Divider */}
          <div style={{ width: "1px", height: "16px", background: "rgba(255,255,255,0.08)", margin: "0 2px" }} />

          {/* Price / Market Cap toggle — only shown when mcap data available */}
          {hasMcapData && (
            <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.10)" }}>
              <button
                onClick={() => setShowMcap(false)}
                style={{
                  padding: "2px 7px",
                  background: !showMcap ? "rgba(201,168,76,0.14)" : "transparent",
                  color: !showMcap ? "#C9A84C" : "rgba(255,255,255,0.30)",
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: "8px", fontWeight: 700,
                  borderRight: "1px solid rgba(255,255,255,0.08)",
                  transition: "background 0.15s",
                }}
              >
                ЦЕНА
              </button>
              <button
                onClick={() => setShowMcap(true)}
                style={{
                  padding: "2px 7px",
                  background: showMcap ? "rgba(255,215,0,0.14)" : "transparent",
                  color: showMcap ? "#ffd700" : "rgba(255,255,255,0.30)",
                  fontFamily: "'Space Grotesk', sans-serif", fontSize: "8px", fontWeight: 700,
                  transition: "background 0.15s",
                }}
              >
                MCAP
              </button>
            </div>
          )}
        </div>

        {/* Right: indicator toggles */}
        <div className="flex gap-1 flex-wrap justify-end">
          {(Object.keys(indicators) as (keyof typeof indicators)[]).map((key) => (
            <div key={key} className="flex items-center">
              <button
                onClick={() => setIndicators((prev) => ({ ...prev, [key]: !prev[key] }))}
                className="px-2 py-0.5 rounded-l"
                style={{
                  background: indicators[key] ? "rgba(255,255,255,0.08)" : "transparent",
                  border: `1px solid ${indicators[key] ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
                  borderRight: "none",
                  color: indicators[key] ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.25)",
                  fontSize: "8px", fontFamily: "monospace", letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                {INDICATOR_HELP[key]?.name.split("—")[0].split(" ")[0] || key.toUpperCase()}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setOpenTooltip(openTooltip === key ? null : key); }}
                className="flex items-center justify-center rounded-r"
                style={{
                  width: "16px", height: "100%", minHeight: "20px",
                  background: openTooltip === key ? "rgba(201,168,76,0.15)" : indicators[key] ? "rgba(255,255,255,0.06)" : "transparent",
                  border: `1px solid ${indicators[key] ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.06)"}`,
                  color: openTooltip === key ? "#C9A84C" : "rgba(255,255,255,0.3)",
                  fontSize: "8px",
                }}>
                ?
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Indicator tooltip popup */}
      {openTooltip && INDICATOR_HELP[openTooltip] && (() => {
        const help = INDICATOR_HELP[openTooltip];
        const sig  = bars.length > 0 ? help.getSignal(bars) : null;
        return (
          <div
            className="mx-4 mb-1 rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, rgba(10,15,40,0.98) 0%, rgba(5,10,30,0.98) 100%)",
              border: "1px solid rgba(201,168,76,0.18)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.6), 0 0 20px rgba(201,168,76,0.05)",
            }}
          >
            <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2"
              style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <span style={{ color: "#C9A84C", fontSize: "10px", fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, letterSpacing: "0.06em" }}>
                {help.name}
              </span>
              <button onClick={() => setOpenTooltip(null)}
                style={{ color: "rgba(255,255,255,0.3)", fontSize: "14px", lineHeight: 1, flexShrink: 0, marginTop: "-1px" }}>×</button>
            </div>
            <div className="px-4 py-2.5 flex flex-col gap-2">
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: "10px", lineHeight: "1.5" }}>{help.desc}</p>
              {sig && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: `${sig.color}12`, border: `1px solid ${sig.color}30` }}>
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: sig.color, boxShadow: `0 0 6px ${sig.color}` }} />
                  <span style={{ color: sig.color, fontSize: "10px", fontWeight: 600 }}>{sig.text}</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Chart area */}
      <div className="flex-1 flex flex-col overflow-hidden relative min-h-0">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: "rgba(8,8,8,0.75)", backdropFilter: "blur(4px)" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(201,168,76,0.15)", borderTopColor: "#C9A84C" }} />
              <span className="font-orbitron" style={{ color: "rgba(201,168,76,0.7)", fontSize: "10px", letterSpacing: "0.08em" }}>ЗАГРУЗКА ДАННЫХ...</span>
            </div>
          </div>
        )}

        {!loading && bars.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <BarChart2 size={32} style={{ color: "rgba(201,168,76,0.2)", margin: "0 auto 8px" }} />
              <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px" }}>Нет данных по этому пулу</p>
              <button onClick={load} className="mt-3 px-4 py-2 rounded-xl"
                style={{ background: "rgba(201,168,76,0.08)", border: "1px solid rgba(201,168,76,0.20)", color: "#C9A84C", fontSize: "11px" }}>
                Повторить
              </button>
            </div>
          </div>
        )}

        {/* Main chart container */}
        <div ref={mainRef} className="flex-1 min-h-0" />

        {/* RSI sub-chart */}
        {indicators.rsi && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", height: "88px", flexShrink: 0 }}>
            <div className="px-2 pt-1">
              <span style={{ color: "rgba(179,157,219,0.6)", fontSize: "8px", fontFamily: "monospace" }}>RSI(14) · Перекуп &gt;70 · Перепрод &lt;30</span>
            </div>
            <div ref={rsiRef} style={{ height: "66px" }} />
          </div>
        )}

        {/* MACD sub-chart */}
        {indicators.macd && (
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", height: "88px", flexShrink: 0 }}>
            <div className="px-2 pt-1">
              <span style={{ color: "rgba(201,168,76,0.5)", fontSize: "8px", fontFamily: "monospace" }}>MACD(12,26,9) · Синий: MACD · Розовый: Signal</span>
            </div>
            <div ref={macdRef} style={{ height: "66px" }} />
          </div>
        )}
      </div>

      {/* Bottom stats */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 shrink-0 overflow-x-auto"
        style={{ borderTop: "1px solid rgba(201,168,76,0.08)", background: "rgba(8,8,8,0.97)" }}
      >
        {[
          { label: "5М",  value: token.change5m  },
          { label: "1Ч",  value: token.change1h  },
          { label: "24Ч", value: token.change24h },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-center gap-1.5 shrink-0">
            <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px" }}>{label}</span>
            <span style={{ color: value > 0 ? "#C9A84C" : value < 0 ? "#ff5252" : "rgba(255,255,255,0.4)", fontSize: "10px", fontWeight: 700, fontFamily: "monospace" }}>
              {value > 0 ? "+" : ""}{value.toFixed(2)}%
            </span>
          </div>
        ))}
        <div style={{ background: "rgba(255,255,255,0.07)", width: "1px", height: "14px", flexShrink: 0 }} />
        <span style={{ color: "rgba(255,255,255,0.25)", fontSize: "9px", flexShrink: 0 }}>
          {token.dex.toUpperCase()} · {token.network.toUpperCase()}
        </span>
        {token.volumeSpike && <span style={{ fontSize: "10px", flexShrink: 0 }}>🔥 Всплеск</span>}
        {token.whaleEntry  && <span style={{ fontSize: "10px", flexShrink: 0 }}>🐳 Кит</span>}
      </div>
    </div>
  );
}
