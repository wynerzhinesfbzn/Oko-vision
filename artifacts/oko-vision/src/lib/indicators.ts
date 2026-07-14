export type OHLCVBar = { time: number; open: number; high: number; low: number; close: number; volume: number };

export function calcSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

export function calcEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  const k = 2 / (period + 1);
  let ema: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) continue;
    if (ema === null) {
      ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    result[i] = ema;
  }
  return result;
}

export function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }

  let avgGain = gains.reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.reduce((a, b) => a + b, 0) / period;

  const rs = avgGain / (avgLoss || 0.0001);
  result[period] = 100 - 100 / (1 + rs);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    const rsi = 100 - 100 / (1 + avgGain / (avgLoss || 0.0001));
    result[i] = rsi;
  }
  return result;
}

export type MACDResult = {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
};

export function calcMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9
): MACDResult {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  const macdLine: (number | null)[] = closes.map((_, i) => {
    const f = emaFast[i];
    const s = emaSlow[i];
    return f !== null && s !== null ? f - s : null;
  });

  const macdValues = macdLine.filter((v) => v !== null) as number[];
  const rawSignal = calcEMA(macdValues, signal);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  let si = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] !== null) {
      signalLine[i] = rawSignal[si] ?? null;
      si++;
    }
  }

  const histogram: (number | null)[] = closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return m !== null && s !== null ? m - s : null;
  });

  return { macd: macdLine, signal: signalLine, histogram };
}

export type BBResult = {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
};

export function calcBollingerBands(closes: number[], period = 20, stdDev = 2): BBResult {
  const middle = calcSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) {
      upper.push(null);
      lower.push(null);
      continue;
    }
    const slice = closes.slice(i - period + 1, i + 1);
    const mean = middle[i]!;
    const variance = slice.reduce((acc, v) => acc + (v - mean) ** 2, 0) / period;
    const sd = Math.sqrt(variance);
    upper.push(mean + stdDev * sd);
    lower.push(mean - stdDev * sd);
  }

  return { upper, middle, lower };
}

export function findKeyLevels(bars: OHLCVBar[]): {
  support1: number; support2: number;
  resistance1: number; resistance2: number;
  midpoint: number;
} {
  if (bars.length === 0) {
    return { support1: 0, support2: 0, resistance1: 0, resistance2: 0, midpoint: 0 };
  }
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const range = maxH - minL;
  return {
    resistance1: maxH,
    resistance2: maxH - range * 0.236,
    support1: minL + range * 0.236,
    support2: minL,
    midpoint: (maxH + minL) / 2,
  };
}

export function findLocalExtremes(bars: OHLCVBar[], window = 5): {
  peaks: number[];
  troughs: number[];
} {
  const peaks: number[] = [];
  const troughs: number[] = [];
  for (let i = window; i < bars.length - window; i++) {
    const isHigh = bars.slice(i - window, i + window + 1).every((b, j) => j === window || b.high <= bars[i].high);
    const isLow = bars.slice(i - window, i + window + 1).every((b, j) => j === window || b.low >= bars[i].low);
    if (isHigh) peaks.push(i);
    if (isLow) troughs.push(i);
  }
  return { peaks, troughs };
}
