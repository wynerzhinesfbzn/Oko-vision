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
import { getScreenerData } from "./screener.js";

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
    // DexScreener already returns pairCreatedAt in milliseconds — do NOT multiply by 1000
    pairCreatedAt:  pair.pairCreatedAt ? Number(pair.pairCreatedAt) : null,
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

// ── PumpFun → PumpSwap Migration Scan ────────────────────────────────────────
//
// RULE: Only tokens that graduated from PumpFun's bonding curve and migrated
//       to PumpSwap are valid. ALL other Solana DEXes (Raydium, Meteora, Orca,
//       Jupiter) are excluded — their tokens were NOT verified by the PumpFun
//       graduation process and are considered untrusted.
//
// IDENTIFIER: DexScreener marks every migrated token with dexId === "pumpswap".
//             This is the single hard filter applied to every source.
//
// SEARCH STRATEGY: DexScreener search returns max 30 results per query.
//   We use 28 diverse terms covering common PumpFun token name themes so
//   the same tokens do not keep appearing. ALL results are post-filtered to
//   dexId === "pumpswap" before entering the pool.
//
const PUMPSWAP_SEARCH_TERMS = [
  // Theme: animals & creatures
  "cat",    "dog",    "frog",   "ape",    "bull",   "bear",   "inu",
  "fish",   "shark",  "bird",   "kitten", "wolf",   "rabbit", "fox",
  "horse",  "snake",  "crab",   "goat",   "rat",
  // Theme: internet culture & memes
  "pepe",   "wojak",  "chad",   "meme",   "giga",   "sigma",
  "based",  "wif",    "brain",  "degen",  "pnut",   "bonk",
  // Theme: celebrity / political
  "trump",  "elon",   "ansem",  "musk",   "biden",  "vlad",
  // Theme: crypto/money terms
  "moon",   "pump",   "sol",    "coin",   "token",  "fi",     "swap",
  // Theme: common word fragments — catches tokens with unusual names
  // (single searches return 30 results each, all post-filtered to pumpswap)
  "world",  "cup",    "game",   "play",   "new",    "real",
  "king",   "lord",   "war",    "fire",   "sky",    "sun",
  "red",    "blue",   "green",  "black",  "white",
  "super",  "ultra",  "mega",   "pro",    "max",    "big",
  "love",   "fun",    "rich",   "gold",   "star",   "club",
];

/** Filter a raw pair list to only PumpSwap migrations */
function keepPumpSwap(pairs: PairData[]): PairData[] {
  return pairs.filter((p) => p.dexId === "pumpswap");
}

async function scanSolana(): Promise<PairData[]> {
  const allRaw: PairData[] = [];

  const push = (arr: PairData[]) => { allRaw.push(...keepPumpSwap(arr)); };

  await Promise.all([
    // Source 1: top boosted Solana tokens — keep only pumpswap
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-boosts/top/v1`);
        const addrs = (Array.isArray(j) ? j : [])
          .filter((b: any) => b.chainId === "solana").slice(0, 30)
          .map((b: any) => b.tokenAddress);
        push(await fetchPairsForAddresses(addrs, "solana"));
      } catch { /* skip */ }
    })(),

    // Source 2: latest boosted tokens
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-boosts/latest/v1`);
        const addrs = (Array.isArray(j) ? j : [])
          .filter((b: any) => b.chainId === "solana").slice(0, 30)
          .map((b: any) => b.tokenAddress);
        push(await fetchPairsForAddresses(addrs, "solana"));
      } catch { /* skip */ }
    })(),

    // Source 3: latest token profiles (newest tokens)
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-profiles/latest/v1`);
        const addrs = (Array.isArray(j) ? j : [])
          .filter((p: any) => p.chainId === "solana").slice(0, 30)
          .map((p: any) => p.tokenAddress);
        push(await fetchPairsForAddresses(addrs, "solana"));
      } catch { /* skip */ }
    })(),

    // Sources 4-31: parallel theme searches — all post-filtered to pumpswap
    ...PUMPSWAP_SEARCH_TERMS.map((term) =>
      searchPairs(term, "solana")
        .then((r) => push(r))
        .catch(() => {})
    ),
  ]);

  // PumpFun graduates start with ~$9k liquidity; accept down to $2k to catch
  // tokens just minutes after migration before liquidity fully settles.
  const result = dedup(allRaw).filter((p) =>
    p.price > 0 &&
    p.liquidity >= 2_000 &&
    // Must have at least some price or volume activity (not a dead zombie pair)
    (p.volume24h > 50 || p.volume1h > 5 || Math.abs(p.change1h) > 0.3 || Math.abs(p.change5m) > 0.3)
  );

  const raw = allRaw.length;
  const nonPs = raw - result.length; // approx other-dex tokens caught and dropped
  console.log(
    `[scan] PumpSwap migrations: ${raw} raw (pumpswap only) → ${result.length} active` +
    ` (dropped ${nonPs} zero-activity pairs)`
  );
  return result;
}

// ── Robinhood Chain scan ───────────────────────────────────────────────────────
//
// Robinhood Chain is an EVM network (chainId = "robinhood" on DexScreener).
// Tokens are memecoins with ANY names — not related to "Robinhood" the word.
// DexScreener has no "list all pairs for chain" endpoint for this chain (/latest/dex/pairs/robinhood → 404).
//
// APPROACH:
//   1. Chain-native sources: token-profiles + token-boosts filtered to chainId="robinhood"
//      → fetch pair data for discovered addresses via /latest/dex/tokens/
//   2. Generic broad searches: common memecoin terms that surface RH-chain tokens
//      (no chain-name keywords — tokens are named anything)
//   All results filtered to chainId === "robinhood".
//
// DATA NOTE: DexScreener only provides vol24h reliably for Robinhood chain.
//   vol1h / vol6h / vol5m are often 0. Use change24h and vol24h for activity signals.

/** Generic meme/culture terms — chain-agnostic, surfaces tokens from any chain */
const RH_BROAD_TERMS = [
  "pepe", "ape", "meme", "cat", "dog", "frog", "wif", "ai",
  "moon", "bull", "bear", "giga", "chad", "inu", "degen",
  "based", "trump", "elon", "shib", "bonk", "wojak", "sigma",
  "baby", "coin", "token", "fi", "x",
];

async function scanRobinhood(): Promise<PairData[]> {
  const allRaw: PairData[] = [];

  const addRhPairs = (rawPairs: any[]) => {
    for (const p of rawPairs) {
      if (p.chainId !== "robinhood") continue;
      const parsed = parsePair(p, "robinhood");
      if (parsed) allRaw.push(parsed);
    }
  };

  await Promise.all([
    // ── Source 1: Token profiles (chain-native) ────────────────────────────
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-profiles/latest/v1`);
        const addrs = (Array.isArray(j) ? j : [])
          .filter((b: any) => b.chainId === "robinhood")
          .map((b: any) => b.tokenAddress);
        if (addrs.length) {
          const data = await fetchJSON(`${DEX_BASE}/latest/dex/tokens/${addrs.join(",")}`);
          addRhPairs(data.pairs ?? []);
        }
      } catch { /* skip */ }
    })(),

    // ── Source 2: Top boosted (chain-native) ──────────────────────────────
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-boosts/top/v1`);
        const addrs = (Array.isArray(j) ? j : [])
          .filter((b: any) => b.chainId === "robinhood")
          .map((b: any) => b.tokenAddress);
        if (addrs.length) {
          const data = await fetchJSON(`${DEX_BASE}/latest/dex/tokens/${addrs.join(",")}`);
          addRhPairs(data.pairs ?? []);
        }
      } catch { /* skip */ }
    })(),

    // ── Source 3: Latest boosted (chain-native) ───────────────────────────
    (async () => {
      try {
        const j = await fetchJSON(`${DEX_BASE}/token-boosts/latest/v1`);
        const addrs = (Array.isArray(j) ? j : [])
          .filter((b: any) => b.chainId === "robinhood")
          .map((b: any) => b.tokenAddress);
        if (addrs.length) {
          const data = await fetchJSON(`${DEX_BASE}/latest/dex/tokens/${addrs.join(",")}`);
          addRhPairs(data.pairs ?? []);
        }
      } catch { /* skip */ }
    })(),

    // ── Source 4: Broad generic searches (supplements chain-native) ───────
    ...RH_BROAD_TERMS.map((term) =>
      fetchJSON(`${DEX_BASE}/latest/dex/search?q=${encodeURIComponent(term)}`)
        .then((j) => addRhPairs(j.pairs ?? []))
        .catch(() => {})
    ),
  ]);

  // Activity filter — use vol24h + change24h as primary signals (vol1h unreliable on RH chain)
  const result = dedup(allRaw).filter((p) =>
    p.price > 0 &&
    p.liquidity >= 1_000 &&
    (
      p.volume24h  > 100 ||
      p.volume1h   > 5   ||
      Math.abs(p.change1h)  > 0.3 ||
      Math.abs(p.change24h) > 1.0
    )
  );
  console.log(`[scan] Robinhood: ${allRaw.length} raw → ${result.length} active after dedup/filter`);
  return result;
}

// ── Route: GET /api/scan ───────────────────────────────────────────────────────

router.get("/scan", async (req, res): Promise<void> => {
  const chain = ((req.query.chain as string) ?? "solana").toLowerCase();
  const type  = ((req.query.type  as string) ?? "all").toLowerCase();
  const cacheKey = `scan:${chain}:${type}`;
  const TTL = chain === "solana" ? 60_000 : 90_000; // 60s solana, 90s robinhood

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

// ── Route: GET /api/screener ──────────────────────────────────────────────────
//
// Fire-and-forget + polling pattern (avoids Replit/Vite proxy timeouts).
//
// Returns immediately:
//   200 { pairs, source, count }  — data available (cache hit or stale-while-revalidate)
//   202 { status: "loading" }     — scrape in progress, poll again in 3s
//
// Query params:
//   url — full dexscreener.com screener URL (percent-encoded)
//
router.get("/screener", (req, res): void => {
  const url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: "url param required" });
    return;
  }

  const result = getScreenerData(url);

  if (!result.ready) {
    res.status(202).json({ status: "loading" });
    return;
  }

  // Parse raw DexScreener pairs → our PairData schema
  const parsed: PairData[] = result.pairs
    .map((p: any) => parsePair(p, p.chainId ?? "solana"))
    .filter((p): p is PairData => p !== null);

  const deduped = dedup(parsed).filter((p) => p.price > 0);
  console.log(`[screener] ${result.pairs.length} raw → ${deduped.length} parsed pairs`);

  res.json({ source: result.source, count: deduped.length, pairs: deduped });
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
