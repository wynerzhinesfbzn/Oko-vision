/**
 * Server-side DexScreener proxy — Signals feed.
 *
 * Routes:
 *  GET /api/scan?chain=solana&type=all       → comprehensive scan (300+ tokens)
 *  GET /api/scan?chain=robinhood&type=all    → Robinhood Chain DEX tokens
 *  GET /api/price/:mint                      → Jupiter price (10s cache)
 *
 * type=all fetches from 12 parallel DexScreener sources and deduplicates.
 */

import { Router } from "express";

const router  = Router();
const DEX_BASE = "https://api.dexscreener.com";
const JUP_PRICE = "https://api.jup.ag/price/v2";

// ── Cache ─────────────────────────────────────────────────────────────────────

interface CacheEntry<T> { data: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();
function getCached<T>(key: string, ttlMs: number): T | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  return e && Date.now() - e.ts < ttlMs ? e.data : null;
}
function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// ── Pair parser ───────────────────────────────────────────────────────────────

export interface PairData {
  mint:               string;
  symbol:             string;
  name:               string;
  imageUrl:           string;
  poolAddress:        string;
  price:              number;
  marketCap:          number | null;
  liquidity:          number;
  volume24h:          number;
  volume1h:           number;
  volume6h:           number;
  volume5m:           number;
  volSpikeMultiplier: number;
  change5m:           number;
  change1h:           number;
  change24h:          number;
  dexId:              string;
  chainId:            string;
  dexScreenerUrl:     string;
  pairCreatedAt:      number | null;
}

function parsePair(pair: any, chainId: string): PairData | null {
  const mint = pair.baseToken?.address;
  if (!mint) return null;
  const price  = parseFloat(pair.priceUsd ?? "0") || 0;
  const vol24h = Number(pair.volume?.h24 ?? 0);
  const vol1h  = Number(pair.volume?.h1  ?? 0);
  const vol6h  = Number(pair.volume?.h6  ?? 0);
  const vol5m  = Number(pair.volume?.m5  ?? 0);
  const avgHourly          = vol24h > 0 ? vol24h / 24 : 0;
  const volSpikeMultiplier = avgHourly > 0 ? vol1h / avgHourly : 0;
  return {
    mint,
    symbol:      pair.baseToken?.symbol  ?? "?",
    name:        pair.baseToken?.name    ?? pair.baseToken?.symbol ?? "?",
    imageUrl:    pair.info?.imageUrl     ?? "",
    poolAddress: pair.pairAddress        ?? "",
    price,
    marketCap:   pair.marketCap != null ? Number(pair.marketCap) : (pair.fdv != null ? Number(pair.fdv) : null),
    liquidity:   Number(pair.liquidity?.usd ?? 0),
    volume24h: vol24h, volume1h: vol1h, volume6h: vol6h, volume5m: vol5m,
    volSpikeMultiplier,
    change5m:  Number(pair.priceChange?.m5  ?? 0),
    change1h:  Number(pair.priceChange?.h1  ?? 0),
    change24h: Number(pair.priceChange?.h24 ?? 0),
    dexId:    pair.dexId ?? "unknown",
    chainId,
    dexScreenerUrl: pair.url ?? `https://dexscreener.com/${chainId}/${pair.pairAddress ?? ""}`,
    pairCreatedAt:  pair.pairCreatedAt ? Number(pair.pairCreatedAt) * 1000 : null,
  };
}

function dedup(pairs: PairData[]): PairData[] {
  const map = new Map<string, PairData>();
  for (const p of pairs) {
    const ex = map.get(p.mint);
    if (!ex || p.liquidity > ex.liquidity) map.set(p.mint, p);
  }
  return [...map.values()];
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchJSON(url: string, timeoutMs = 10_000): Promise<any> {
  const r = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "OKO-Vision/1.0" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

/** Fetch token pair data for a list of mint addresses (max 30 per call) */
async function fetchPairsForAddresses(addresses: string[], chain: string): Promise<PairData[]> {
  if (addresses.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));
  const results: PairData[] = [];
  await Promise.all(chunks.map(async (chunk) => {
    try {
      const j = await fetchJSON(`${DEX_BASE}/latest/dex/tokens/${chunk.join(",")}`);
      for (const p of (j.pairs ?? []).filter((p: any) => p.chainId === chain)) {
        const parsed = parsePair(p, chain);
        if (parsed) results.push(parsed);
      }
    } catch { /* skip chunk on error */ }
  }));
  return results;
}

/** Search DexScreener for a query and return pairs for the given chain */
async function searchPairs(query: string, chain: string): Promise<PairData[]> {
  try {
    const j = await fetchJSON(`${DEX_BASE}/latest/dex/search?q=${encodeURIComponent(query)}`);
    return (j.pairs ?? [])
      .filter((p: any) => p.chainId === chain)
      .map((p: any) => parsePair(p, chain))
      .filter(Boolean) as PairData[];
  } catch { return []; }
}

// ── Comprehensive Solana scan ─────────────────────────────────────────────────

// Terms that target NEW micro-cap tokens on Solana DEXes
const SOLANA_SEARCH_TERMS = [
  "pump.fun",       // pump.fun launchpad tokens
  "pumpfun",        // alternate spelling
  "raydium sol",    // new raydium pairs
  "solana launch",  // new solana launches
  "sol meme new",   // fresh meme tokens
  "solana migrate", // post-migration tokens
  "solana new pair",// new pairs
  "cat sol",        // cat-themed solana
  "dog sol",        // dog-themed solana
  "ai sol",         // AI-themed solana
  "moon sol",       // moon-themed
  "ape sol",        // ape-themed
];

async function scanSolana(): Promise<PairData[]> {
  const allRaw: PairData[] = [];

  await Promise.all([
    // Source 1: top boosted tokens
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-boosts/top/v1`);
        const addrs = (Array.isArray(j) ? j : [])
          .filter((b: any) => b.chainId === "solana").slice(0, 30)
          .map((b: any) => b.tokenAddress);
        allRaw.push(...await fetchPairsForAddresses(addrs, "solana"));
      } catch { /* skip */ }
    })(),

    // Source 2: latest boosted tokens
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-boosts/latest/v1`);
        const boosts = Array.isArray(j) ? j : [];
        const addrs = boosts
          .filter((b: any) => b.chainId === "solana").slice(0, 30)
          .map((b: any) => b.tokenAddress);
        allRaw.push(...await fetchPairsForAddresses(addrs, "solana"));
      } catch { /* skip */ }
    })(),

    // Source 3: latest token profiles (newest tokens)
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-profiles/latest/v1`);
        const profiles = Array.isArray(j) ? j : [];
        const addrs = profiles
          .filter((p: any) => p.chainId === "solana").slice(0, 30)
          .map((p: any) => p.tokenAddress);
        allRaw.push(...await fetchPairsForAddresses(addrs, "solana"));
      } catch { /* skip */ }
    })(),

    // Sources 4-15: parallel DexScreener search queries
    ...SOLANA_SEARCH_TERMS.map((term) => searchPairs(term, "solana")),
  ].map((p) => p.then((r) => { if (Array.isArray(r)) allRaw.push(...r); }).catch(() => {})));

  return dedup(allRaw).filter((p) => p.price > 0 && p.liquidity >= 5_000);
}

// ── Robinhood Chain scan ───────────────────────────────────────────────────────

const ROBINHOOD_SEARCH_TERMS = ["robinhood", "robin", "rh chain", "eth robinhood"];

async function scanRobinhood(): Promise<PairData[]> {
  const allRaw: PairData[] = [];
  // DexScreener chainId for Robinhood Chain — try multiple possible slugs
  const chainSlugs = ["robinhood", "robinhoodchain", "rh"];

  await Promise.all([
    // Try each chain slug directly
    ...chainSlugs.map(async (slug) => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/latest/dex/pairs/${slug}`);
        for (const p of (j.pairs ?? [])) {
          const parsed = parsePair(p, slug);
          if (parsed) allRaw.push({ ...parsed, chainId: "robinhood" });
        }
      } catch { /* unsupported chain */ }
    }),
    // Search-based
    ...ROBINHOOD_SEARCH_TERMS.map(async (term) => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/latest/dex/search?q=${encodeURIComponent(term)}`);
        const pairs = (j.pairs ?? []).filter((p: any) =>
          chainSlugs.includes(p.chainId) || p.chainId?.includes("robin")
        );
        for (const p of pairs) {
          const parsed = parsePair(p, "robinhood");
          if (parsed) allRaw.push(parsed);
        }
      } catch { /* skip */ }
    }),
  ]);

  return dedup(allRaw).filter((p) => p.price > 0 && p.liquidity >= 1_000);
}

// ── Route: GET /api/scan ───────────────────────────────────────────────────────

router.get("/scan", async (req, res): Promise<void> => {
  const chain = ((req.query.chain as string) ?? "solana").toLowerCase();
  const type  = ((req.query.type  as string) ?? "all").toLowerCase();
  const cacheKey = `scan:${chain}:${type}`;
  const TTL = chain === "solana" ? 45_000 : 60_000; // 45s solana, 60s robinhood

  const cached = getCached<PairData[]>(cacheKey, TTL);
  if (cached) {
    res.json({ source: "cache", count: cached.length, pairs: cached });
    return;
  }

  try {
    let pairs: PairData[] = [];

    if (chain === "robinhood") {
      pairs = await scanRobinhood();
    } else {
      // Default: comprehensive Solana scan regardless of type
      pairs = await scanSolana();
    }

    setCached(cacheKey, pairs);
    res.json({ source: "live", count: pairs.length, pairs });
  } catch (e: any) {
    console.error("[scan] error:", e.message);
    res.status(503).json({ error: e.message, source: "error", count: 0, pairs: [] });
  }
});

// ── Route: GET /api/price/:mint ───────────────────────────────────────────────

router.get("/price/:mint", async (req, res): Promise<void> => {
  const { mint } = req.params;
  if (!mint) { res.status(400).json({ error: "mint required" }); return; }
  const cacheKey = `price:${mint}`;
  const cached = getCached<number>(cacheKey, 10_000);
  if (cached != null) { res.json({ price: cached, source: "cache" }); return; }
  try {
    const r = await fetchJSON(`${JUP_PRICE}?ids=${mint}`, 7_000);
    const price = parseFloat(r?.data?.[mint]?.price ?? "0");
    setCached(cacheKey, price);
    res.json({ price, source: "live" });
  } catch (e: any) {
    res.status(503).json({ error: e.message, price: 0 });
  }
});

export default router;
