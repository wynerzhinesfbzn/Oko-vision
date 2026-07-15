/**
 * DexScreener Screener scraper — puppeteer-extra with stealth plugin.
 *
 * Fixes applied:
 *   1. Browser mutex — only ONE Playwright instance runs at a time; concurrent
 *      requests wait in queue instead of launching parallel browsers that
 *      collide on the same userDataDir and cause 503 errors.
 *   2. Batch pair API — fetches up to 30 pair addresses per DexScreener API
 *      call (comma-separated) instead of one-at-a-time, reducing rate-limit
 *      exposure from 100 requests → 4 batches.
 *   3. _lastGood fallback — any time fresh fetch returns 0 pairs (API hiccup,
 *      Cloudflare block, rate-limit) the last known-good result is returned
 *      so the UI never goes blank.
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin   = require("puppeteer-extra-plugin-stealth");

puppeteerExtra.use(StealthPlugin());

const DEX_API  = "https://api.dexscreener.com";
const CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

// ── Cache ─────────────────────────────────────────────────────────────────────

interface ScreenerCache { pairs: any[]; ts: number }
const _cache    = new Map<string, ScreenerCache>(); // live result (short TTL)
const _lastGood = new Map<string, any[]>();         // last known-good (no expiry)
const CACHE_TTL_MS = 60_000;

// ── Browser mutex ─────────────────────────────────────────────────────────────
// Puppet launches collide if two run concurrently (same userDataDir → 503).
// Serialize all launches: each waits for the previous to finish before starting.

let _browserQueue: Promise<void> = Promise.resolve();

async function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  let releaseLock!: () => void;
  const waitForLock = _browserQueue;
  _browserQueue = new Promise<void>((resolve) => { releaseLock = resolve; });
  await waitForLock;
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Fetch pair data from DexScreener public API.
 * Uses comma-separated batch calls (up to 30 per request) to minimise
 * round-trips and avoid per-call rate limiting.
 */
async function fetchPairsByAddresses(chain: string, addrs: string[]): Promise<any[]> {
  if (!addrs.length) return [];

  const BATCH = 30;
  const out: any[] = [];

  for (let i = 0; i < addrs.length; i += BATCH) {
    const chunk = addrs.slice(i, i + BATCH);
    const joined = chunk.join(",");

    try {
      const res = await fetch(`${DEX_API}/latest/dex/pairs/${chain}/${joined}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });

      if (res.ok) {
        const json = await res.json();
        // Single pair → { pair: {...} }; multiple → { pairs: [...] }
        if (json?.pairs?.length) {
          out.push(...json.pairs.filter(Boolean));
        } else if (json?.pair) {
          out.push(json.pair);
        }
      } else {
        console.warn(`[screener] pairs API returned ${res.status} for batch ${i / BATCH + 1}`);
      }
    } catch (e: any) {
      console.warn(`[screener] pairs API error batch ${i / BATCH + 1}:`, e.message);
    }

    // Brief pause between batches to stay within rate limits
    if (i + BATCH < addrs.length) await sleep(300);
  }

  return out;
}

// ── Main scraper ──────────────────────────────────────────────────────────────

/**
 * Scrape a DexScreener screener URL via headless Chromium (stealth).
 * Returns raw DexScreener pair objects (same schema as the public REST API).
 * Concurrent calls are serialized via browser mutex.
 */
export async function scrapeScreener(url: string): Promise<any[]> {
  // Serve from live cache if still fresh
  const cached = _cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[screener] cache hit — ${cached.pairs.length} pairs`);
    return cached.pairs;
  }

  const chainMatch = url.match(/chainIds=([^&]+)/);
  const chain = chainMatch ? decodeURIComponent(chainMatch[1]).split(",")[0] : "solana";

  // ── Browser launch (serialized) ──────────────────────────────────────────
  const pairAddrs = await withBrowserLock(async () => {
    console.log(`[screener] launching Playwright for: ${url.slice(0, 80)}...`);

    const browser = await puppeteerExtra.launch({
      executablePath: CHROMIUM,
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--single-process", "--no-zygote",
      ],
    });

    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 900 });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

      // Wait for Cloudflare challenge + WebSocket data to arrive
      await sleep(18_000);

      const title = await page.title().catch(() => "?");
      console.log(`[screener] title="${title}"`);

      const isBlocked =
        title.toLowerCase().includes("moment") ||
        title.toLowerCase().includes("security") ||
        title.toLowerCase().includes("checking");

      if (isBlocked) {
        console.log(`[screener] Cloudflare block detected`);
        return [] as string[];
      }

      // Extract pair addresses from rendered DOM links (e.g. /solana/ADDR)
      const extracted: string[] = await page.evaluate((ch: string) => {
        const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");
        const addrs = new Set<string>();
        links.forEach((a) => {
          const href = a.getAttribute("href") || "";
          // Match /{chain}/{address} — Solana addresses are base58 (43-44 chars),
          // EVM addresses are 0x + 40 hex chars (42 chars total)
          const m = href.match(new RegExp(`/${ch}/([a-zA-Z0-9]{30,65})`, "i"));
          if (m) addrs.add(m[1].toLowerCase());
        });
        return [...addrs];
      }, chain);

      console.log(`[screener] extracted ${extracted.length} pair addresses from DOM`);
      return extracted;
    } finally {
      await browser.close();
    }
  });

  // ── Fallback on empty result ──────────────────────────────────────────────
  if (!pairAddrs.length) {
    const last = _lastGood.get(url);
    if (last && last.length > 0) {
      console.log(`[screener] no new addresses — returning ${last.length} cached good pairs`);
      return last;
    }
    console.log(`[screener] no addresses and no fallback — returning empty`);
    return [];
  }

  // ── Fetch structured pair data from DexScreener public API ───────────────
  const rawPairs = await fetchPairsByAddresses(chain, pairAddrs);
  console.log(`[screener] fetched ${rawPairs.length} pairs from public API`);

  if (rawPairs.length > 0) {
    _cache.set(url, { pairs: rawPairs, ts: Date.now() });
    _lastGood.set(url, rawPairs);
  } else {
    // API returned 0 despite valid addresses — use stale good data if available
    const last = _lastGood.get(url);
    if (last && last.length > 0) {
      console.log(`[screener] API returned 0 — returning ${last.length} stale good pairs`);
      return last;
    }
  }

  return rawPairs;
}
