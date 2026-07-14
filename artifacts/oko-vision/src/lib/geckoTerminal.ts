/**
 * DexScreener open API  — no API key required.
 * File kept as geckoTerminal.ts so all existing imports continue to work.
 */
const BASE = import.meta.env.DEV
  ? "/dex"
  : "https://api.dexscreener.com";

/** Map our internal chain IDs → DexScreener chainId strings */
const CHAIN_ID_MAP: Record<string, string> = {
  solana:   "solana",
  eth:      "ethereum",
  bsc:      "bsc",
  arbitrum: "arbitrum",
  polygon:  "polygon",
};

// ─── Public types ─────────────────────────────────────────────────────────────

export type Chain = { id: string; label: string; icon: string; color: string };

export const CHAINS: Chain[] = [
  { id: "solana",   label: "Solana",    icon: "◎", color: "#9945FF" },
  { id: "eth",      label: "Ethereum",  icon: "Ξ", color: "#627EEA" },
  { id: "bsc",      label: "BNB Chain", icon: "⬡", color: "#F3BA2F" },
  { id: "arbitrum", label: "Arbitrum",  icon: "△", color: "#28A0F0" },
  { id: "polygon",  label: "Polygon",   icon: "⬟", color: "#8247E5" },
];

export type Token = {
  id:       string;
  symbol:   string;
  name:     string;
  imageUrl: string;
};

export type PoolSignal = {
  poolAddress:    string;
  name:           string;
  baseToken:      Token;
  price:          number;
  priceFormatted: string;
  marketCap:      number | null;
  volume24h:      number;
  liquidity:      number;
  change5m:       number;
  change1h:       number;
  change24h:      number;
  volumeSpike:    boolean;
  whaleEntry:     boolean;
  dex:            string;
  network:        string;
  aiSignal:       "BUY" | "SELL" | "HOLD";
  aiScore:        number;
  dexScreenerUrl: string;   // direct link to dexscreener.com for this pair
};

export type OHLCVBar = {
  time:   number;
  open:   number;
  high:   number;
  low:    number;
  close:  number;
  volume: number;
};

export interface SearchSuggestion {
  symbol:       string;
  name:         string;
  poolName:     string;
  imageUrl:     string;
  tokenAddress: string;   // base token contract address — used for exact lookup
  poolAddress:  string;   // pair address — used to match exact result
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function calcAISignal(p: {
  change5m:    number;
  change1h:    number;
  change24h:   number;
  volumeSpike: boolean;
}): { signal: "BUY" | "SELL" | "HOLD"; score: number } {
  let score = 50;

  if (p.change1h > 3)       score += 15;
  else if (p.change1h > 1)  score += 7;
  else if (p.change1h < -3) score -= 15;
  else if (p.change1h < -1) score -= 7;

  if (p.change24h > 10)       score += 10;
  else if (p.change24h > 5)   score += 5;
  else if (p.change24h < -10) score -= 10;
  else if (p.change24h < -5)  score -= 5;

  if (p.change5m > 1)       score += 8;
  else if (p.change5m < -1) score -= 8;

  if (p.volumeSpike) score += 12;

  score = Math.max(0, Math.min(100, score));
  const signal: "BUY" | "SELL" | "HOLD" =
    score >= 62 ? "BUY" : score <= 38 ? "SELL" : "HOLD";
  return { signal, score };
}

export function formatPrice(n: number): string {
  if (n === 0) return "$0";
  if (n >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 4 })}`;
  const s = n.toFixed(12);
  const match = s.match(/^0\.(0+)(\d+)/);
  if (match) {
    const zeros = match[1].length;
    const sig   = match[2].slice(0, 4);
    return `$0.0${zeros > 1 ? `(${zeros})` : "0"}${sig}`;
  }
  return `$${n.toFixed(6)}`;
}

/** Map our internal chain IDs → DexScreener URL slug */
const CHAIN_URL_MAP: Record<string, string> = {
  solana:   "solana",
  eth:      "ethereum",
  bsc:      "bsc",
  arbitrum: "arbitrum",
  polygon:  "polygon",
};

/** Convert a DexScreener pair object → PoolSignal */
function pairToPoolSignal(pair: any, network: string): PoolSignal {
  const price    = parseFloat(pair.priceUsd ?? "0") || 0;
  const vol24h   = pair.volume?.h24   ?? 0;
  const vol1h    = pair.volume?.h1    ?? 0;
  const change5m  = pair.priceChange?.m5  ?? 0;
  const change1h  = pair.priceChange?.h1  ?? 0;
  const change24h = pair.priceChange?.h24 ?? 0;

  const avgHourlyVol = vol24h / 24;
  const volumeSpike  = vol1h > 0 && avgHourlyVol > 0 ? vol1h > avgHourlyVol * 2.5 : false;
  const whaleEntry   = volumeSpike && Math.abs(change5m) > 2;

  const { signal, score } = calcAISignal({ change5m, change1h, change24h, volumeSpike });

  const baseSym  = pair.baseToken?.symbol ?? "?";
  const quoteSym = pair.quoteToken?.symbol ?? "";
  const pairName = quoteSym ? `${baseSym} / ${quoteSym}` : baseSym;

  const pairAddress = pair.pairAddress ?? "";
  const chainSlug   = CHAIN_URL_MAP[network] ?? network;
  const dexUrl = pair.url
    ? pair.url
    : pairAddress
      ? `https://dexscreener.com/${chainSlug}/${pairAddress}`
      : `https://dexscreener.com/${chainSlug}`;

  return {
    poolAddress:    pairAddress,
    name:           pairName,
    baseToken: {
      id:       pair.baseToken?.address ?? "",
      symbol:   baseSym,
      name:     pair.baseToken?.name    ?? baseSym,
      imageUrl: pair.info?.imageUrl     ?? "",
    },
    price,
    priceFormatted: formatPrice(price),
    marketCap:  pair.marketCap  ?? pair.fdv ?? null,
    volume24h:  vol24h,
    liquidity:  pair.liquidity?.usd ?? 0,
    change5m,
    change1h,
    change24h,
    volumeSpike,
    whaleEntry,
    dex:            pair.dexId ?? "unknown",
    network,
    aiSignal:       signal,
    aiScore:        score,
    dexScreenerUrl: dexUrl,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

const _trendingCache: Record<string, { data: PoolSignal[]; ts: number }> = {};
const TRENDING_CACHE_MS = 25_000; // cache for 25s — fresh enough for 30s auto-refresh

/**
 * Fetch trending/boosted tokens for a chain from DexScreener.
 * Uses /token-boosts/top/v1 to get promoted tokens, then fetches pair data.
 */
export async function fetchTrendingPools(network = "solana"): Promise<PoolSignal[]> {
  const chainId = CHAIN_ID_MAP[network] ?? network;

  // Return in-memory cache if fresh
  const cached = _trendingCache[chainId];
  if (cached && Date.now() - cached.ts < TRENDING_CACHE_MS) return cached.data;

  try {
    // Step 1 — get top boosted tokens (free, no auth)
    const boostsRes = await fetch(`${BASE}/token-boosts/top/v1`);
    if (!boostsRes.ok) throw new Error(`boosts HTTP ${boostsRes.status}`);
    const boosts: any[] = await boostsRes.json();

    const chainBoosts = boosts
      .filter((b) => b.chainId === chainId)
      .slice(0, 30);

    // Step 2 — fetch pair data for up to 30 token addresses (DexScreener allows comma list)
    const addresses = chainBoosts.map((b) => b.tokenAddress).join(",");
    if (!addresses) return [];

    const pairsRes = await fetch(`${BASE}/latest/dex/tokens/${addresses}`);
    if (!pairsRes.ok) throw new Error(`pairs HTTP ${pairsRes.status}`);
    const pairsJson = await pairsRes.json();
    const pairs: any[] = pairsJson.pairs ?? [];

    // Keep only matching chain, pick highest-volume pair per base token
    const tokenMap = new Map<string, any>();
    for (const pair of pairs) {
      if (pair.chainId !== chainId) continue;
      const key      = pair.baseToken?.address ?? pair.pairAddress;
      const existing = tokenMap.get(key);
      if (!existing || (pair.volume?.h24 ?? 0) > (existing.volume?.h24 ?? 0)) {
        tokenMap.set(key, pair);
      }
    }

    const MIN_LIQUIDITY = 30_000;

    const result = [...tokenMap.values()]
      .filter((p) => (p.liquidity?.usd ?? 0) >= MIN_LIQUIDITY)
      .sort((a, b) => (b.volume?.h24 ?? 0) - (a.volume?.h24 ?? 0))
      .map((p) => pairToPoolSignal(p, network));

    // Store in cache
    _trendingCache[chainId] = { data: result, ts: Date.now() };
    return result;
  } catch (err) {
    console.error("DexScreener trending fetch error:", err);
    // Return stale cache on error rather than empty array
    return cached?.data ?? [];
  }
}

/**
 * Search pools by query — uses DexScreener /latest/dex/search
 */
export async function searchPools(query: string, network = "solana"): Promise<PoolSignal[]> {
  if (!query.trim()) return [];
  const chainId = CHAIN_ID_MAP[network] ?? network;
  const res = await fetch(`${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const pairs: any[] = json.pairs ?? [];
  return pairs
    .filter((p) => p.chainId === chainId && (p.liquidity?.usd ?? 0) >= 30_000)
    .map((p) => pairToPoolSignal(p, network))
    .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
}

/**
 * Fast autocomplete suggestions from search results
 */
export async function fetchSuggestions(query: string, network = "solana"): Promise<SearchSuggestion[]> {
  if (query.trim().length < 2) return [];
  try {
    const pools = await searchPools(query, network);
    const seen = new Set<string>();
    return pools
      .filter((p) => {
        const k = p.baseToken.id || p.baseToken.symbol.toUpperCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 6)
      .map((p) => ({
        symbol:       p.baseToken.symbol,
        name:         p.baseToken.name,
        poolName:     p.name,
        imageUrl:     p.baseToken.imageUrl,
        tokenAddress: p.baseToken.id,
        poolAddress:  p.poolAddress,
      }));
  } catch {
    return [];
  }
}

/**
 * Fetch all pools for a specific token address — used when user picks a suggestion
 * so we show the exact token they selected, not whatever has the highest market cap.
 */
export async function fetchPoolsByTokenAddress(
  tokenAddress: string,
  network = "solana",
): Promise<PoolSignal[]> {
  if (!tokenAddress) return [];
  const chainId = CHAIN_ID_MAP[network] ?? network;
  try {
    const res = await fetch(`${BASE}/latest/dex/tokens/${encodeURIComponent(tokenAddress)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const pairs: any[] = json.pairs ?? [];
    return pairs
      .filter((p) => p.chainId === chainId && (p.liquidity?.usd ?? 0) >= 30_000)
      .map((p) => pairToPoolSignal(p, network))
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
  } catch {
    return [];
  }
}

/**
 * OHLCV chart data — DexScreener does not expose a public OHLCV endpoint.
 * Returns empty array; callers should use generateSyntheticOHLCV as fallback.
 */
export async function fetchPoolOHLCV(
  _network:     string,
  _poolAddress: string,
  _timeframe:   "minute" | "hour" | "day" = "minute",
  _aggregate    = 5,
  _limit        = 200,
): Promise<OHLCVBar[]> {
  return [];
}

/**
 * Generate realistic synthetic OHLCV bars derived from a PoolSignal's
 * known price-change anchors (5m, 1h, 24h).  Produces a path-constrained
 * Brownian-motion walk that passes through the implied historical prices.
 */
export function generateSyntheticOHLCV(
  token:     PoolSignal,
  timeframe: "minute" | "hour" | "day" = "minute",
  aggregate  = 5,
  limit      = 200,
): OHLCVBar[] {
  if (token.price <= 0) return [];

  const nowSec  = Math.floor(Date.now() / 1000);
  const stepSec = aggregate * (timeframe === "minute" ? 60 : timeframe === "hour" ? 3600 : 86400);

  // ── Anchor prices derived from price-change data ──────────────────────────
  const p0   = token.price;                                  // now
  const p5m  = p0 / (1 + (token.change5m  || 0) / 100);    // 5-min ago
  const p1h  = p0 / (1 + (token.change1h  || 0) / 100);    // 1-hr ago
  const p24h = p0 / (1 + (token.change24h || 0) / 100);    // 24-hr ago

  const barCount5m  = Math.round(300  / stepSec);           // index of 5-min anchor
  const barCount1h  = Math.round(3600 / stepSec);           // index of 1-hr anchor
  const barCount24h = Math.round(86400 / stepSec);          // index of 24-hr anchor

  // Clamp to available limit
  const totalBars = Math.min(limit, Math.max(barCount24h + 20, limit));

  // Build price-anchor path with linear interpolation between known points
  // anchors: [barIndex_from_end, price]
  const anchors: [number, number][] = ([
    [0,             p0  ] as [number, number],
    [barCount5m,    p5m ] as [number, number],
    [barCount1h,    p1h ] as [number, number],
    [Math.min(barCount24h, totalBars - 1), p24h] as [number, number],
  ]).sort((a, b) => a[0] - b[0]) as [number, number][];

  // Interpolate baseline price for each bar (bars stored oldest→newest)
  const baselineArr: number[] = new Array(totalBars);
  for (let seg = 0; seg < anchors.length - 1; seg++) {
    const [ia, pa] = anchors[seg];
    const [ib, pb] = anchors[seg + 1];
    for (let i = ia; i <= ib; i++) {
      const t = ib === ia ? 0 : (i - ia) / (ib - ia);
      baselineArr[totalBars - 1 - i] = pa + (pb - pa) * t;
    }
  }
  // Fill any tail beyond 24h anchor with a drift from p24h
  for (let i = 0; i < totalBars; i++) {
    if (baselineArr[i] === undefined) baselineArr[i] = p24h;
  }

  // ── Brownian-motion noise ─────────────────────────────────────────────────
  // Volatility: scale with price magnitude and 24h move
  const vol24hAbs = Math.abs(token.change24h) / 100;
  const barVol    = (vol24hAbs / Math.sqrt(barCount24h || 1)) * 0.55;   // per-bar sigma
  const minBarVol = 0.002;
  const sigma     = Math.max(barVol, minBarVol);

  // Seeded-ish random (deterministic per token) for consistent chart replay
  let seed = token.poolAddress.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 1);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) & 0xffffffff;
    return ((seed >>> 1) / 0x7fffffff) - 1; // [-1, 1]
  };
  const randn = () => {
    // Box-Muller
    const u1 = Math.abs(rand()) || 1e-9;
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * u2);
  };

  // ── Assemble bars ─────────────────────────────────────────────────────────
  const avgVol24hPerBar = (token.volume24h || 1_000) / (barCount24h || 288);
  const bars: OHLCVBar[] = [];
  let prevClose = baselineArr[0];

  for (let i = 0; i < totalBars; i++) {
    const baseline = baselineArr[i];
    // Blend random walk with mean-reversion to baseline
    const noise     = randn() * sigma * prevClose;
    const reversion = (baseline - prevClose) * 0.18;
    const close     = Math.max(prevClose + noise + reversion, prevClose * 0.0001);

    // Candle body
    const bodyLo = Math.min(prevClose, close);
    const bodyHi = Math.max(prevClose, close);
    const wickExt = Math.abs(noise) * (0.5 + Math.abs(randn()) * 0.8);
    const high    = bodyHi + Math.abs(wickExt);
    const low     = Math.max(bodyLo - Math.abs(wickExt), close * 0.0001);

    // Volume: spike near anchor transitions
    const distFrom5m  = Math.abs(totalBars - 1 - i - barCount5m);
    const distFrom1h  = Math.abs(totalBars - 1 - i - barCount1h);
    const spikeBoost  = Math.exp(-distFrom5m / 3) * 3 + Math.exp(-distFrom1h / 8) * 1.5;
    const volNoise    = 0.5 + Math.abs(randn()) * 1.5 + spikeBoost;
    const volume      = avgVol24hPerBar * volNoise;

    bars.push({
      time:  nowSec - (totalBars - 1 - i) * stepSec,
      open:  prevClose,
      high,
      low,
      close,
      volume,
    });
    prevClose = close;
  }

  return bars;
}

export function formatNum(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)         return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}
