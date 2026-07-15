/**
 * Server-side DexScreener + Jupiter price proxy.
 *
 * Why server-side?
 *  - No CORS issues (DexScreener blocks browser cross-origin requests sometimes)
 *  - Centralized 30-second cache prevents rate-limiting from multiple clients
 *  - Enriches raw pair data with vol1h / volSpikeMultiplier before returning
 *
 * Routes:
 *  GET /api/scan?chain=solana&type=boosted   → top-boosted tokens (default)
 *  GET /api/scan?chain=solana&type=latest    → latest new pairs
 *  GET /api/price/:mint                     → Jupiter price (10s cache)
 */

import { Router } from "express";

const router = Router();

const DEX_BASE   = "https://api.dexscreener.com";
const JUP_PRICE  = "https://api.jup.ag/price/v2";

// ── Generic in-memory cache ────────────────────────────────────────────────────

interface CacheEntry<T> { data: T; ts: number }
const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string, ttlMs: number): T | null {
  const e = cache.get(key) as CacheEntry<T> | undefined;
  return e && Date.now() - e.ts < ttlMs ? e.data : null;
}
function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// ── Pair parser ────────────────────────────────────────────────────────────────

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
  volSpikeMultiplier: number;   // vol1h / (vol24h / 24)
  change5m:           number;
  change1h:           number;
  change24h:          number;
  dexId:              string;
  chainId:            string;
  dexScreenerUrl:     string;
  pairCreatedAt:      number | null; // epoch ms
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
    volume24h:   vol24h,
    volume1h:    vol1h,
    volume6h:    vol6h,
    volume5m:    vol5m,
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

function deduplicateByMint(pairs: PairData[]): PairData[] {
  const map = new Map<string, PairData>();
  for (const p of pairs) {
    const existing = map.get(p.mint);
    // prefer highest liquidity pair for the same token
    if (!existing || p.liquidity > existing.liquidity) {
      map.set(p.mint, p);
    }
  }
  return [...map.values()];
}

// ── Route: GET /api/scan ───────────────────────────────────────────────────────

router.get("/scan", async (req, res): Promise<void> => {
  const chain = ((req.query.chain as string) ?? "solana").toLowerCase();
  const type  = ((req.query.type  as string) ?? "boosted").toLowerCase();
  const cacheKey = `scan:${chain}:${type}`;
  const SCAN_TTL  = 30_000; // 30s

  const cached = getCached<PairData[]>(cacheKey, SCAN_TTL);
  if (cached) {
    res.json({ source: "cache", count: cached.length, pairs: cached });
    return;
  }

  try {
    let pairs: PairData[] = [];

    // ── TYPE: boosted ──────────────────────────────────────────────────────────
    if (type === "boosted") {
      const boostRes = await fetch(`${DEX_BASE}/token-boosts/top/v1`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!boostRes.ok) throw new Error(`DexScreener boosts HTTP ${boostRes.status}`);
      const boosts = (await boostRes.json()) as any[];

      // Filter to requested chain and take top 30
      const chainBoosts = boosts
        .filter((b) => b.chainId === chain)
        .slice(0, 30);

      if (chainBoosts.length > 0) {
        const addresses = chainBoosts.map((b) => b.tokenAddress).join(",");
        const pairsRes = await fetch(`${DEX_BASE}/latest/dex/tokens/${addresses}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(12_000),
        });
        if (!pairsRes.ok) throw new Error(`DexScreener token pairs HTTP ${pairsRes.status}`);
        const pairsJson = (await pairsRes.json()) as any;
        const rawPairs: any[] = pairsJson.pairs ?? [];
        pairs = rawPairs
          .filter((p) => p.chainId === chain)
          .map((p) => parsePair(p, chain))
          .filter(Boolean) as PairData[];
        pairs = deduplicateByMint(pairs);
      }
    }

    // ── TYPE: latest ───────────────────────────────────────────────────────────
    else if (type === "latest") {
      // DexScreener /latest/dex/pairs/{chainId} — returns recently active pairs
      const r = await fetch(`${DEX_BASE}/latest/dex/pairs/${chain}`, {
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!r.ok) throw new Error(`DexScreener latest HTTP ${r.status}`);
      const json = (await r.json()) as any;
      const rawPairs: any[] = json.pairs ?? [];
      pairs = rawPairs
        .map((p) => parsePair(p, chain))
        .filter(Boolean) as PairData[];
      pairs = deduplicateByMint(pairs);
    }

    // ── TYPE: trending (search-based — uses DexScreener /search) ──────────────
    else if (type === "trending") {
      // Fetch trending tokens via multiple search terms and merge
      const terms = ["pump", "sol", "meme", "ai", "doge"];
      const allPairs: any[] = [];
      for (const term of terms.slice(0, 2)) { // limit to 2 to avoid rate limits
        try {
          const r = await fetch(`${DEX_BASE}/latest/dex/search?q=${term}`, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(8_000),
          });
          if (r.ok) {
            const j = (await r.json()) as any;
            allPairs.push(...(j.pairs ?? []).filter((p: any) => p.chainId === chain));
          }
        } catch { /* skip on error */ }
      }
      pairs = allPairs
        .map((p) => parsePair(p, chain))
        .filter(Boolean) as PairData[];
      pairs = deduplicateByMint(pairs);
    }

    // Minimum quality filter: must have price > 0 and some liquidity
    pairs = pairs.filter((p) => p.price > 0 && p.liquidity > 0);

    setCached(cacheKey, pairs);
    res.json({ source: "live", count: pairs.length, pairs });
  } catch (e: any) {
    console.error("[scan] DexScreener error:", e.message);
    // Return empty on error — caller will retry next tick
    res.status(503).json({ error: e.message, source: "error", count: 0, pairs: [] });
  }
});

// ── Route: GET /api/price/:mint ────────────────────────────────────────────────

router.get("/price/:mint", async (req, res): Promise<void> => {
  const { mint } = req.params;
  if (!mint) { res.status(400).json({ error: "mint required" }); return; }

  const PRICE_TTL = 10_000; // 10s
  const cacheKey  = `price:${mint}`;
  const cached    = getCached<number>(cacheKey, PRICE_TTL);
  if (cached != null) {
    res.json({ price: cached, source: "cache" });
    return;
  }

  try {
    const r = await fetch(`${JUP_PRICE}?ids=${mint}`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(7_000),
    });
    if (!r.ok) throw new Error(`Jupiter price HTTP ${r.status}`);
    const data = await r.json() as any;
    const price = parseFloat(data?.data?.[mint]?.price ?? "0");
    setCached(cacheKey, price);
    res.json({ price, source: "live" });
  } catch (e: any) {
    console.error("[price] Jupiter error:", e.message);
    res.status(503).json({ error: e.message, price: 0 });
  }
});

export default router;
