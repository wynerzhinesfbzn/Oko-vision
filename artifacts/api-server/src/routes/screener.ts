/**
 * DexScreener Screener scraper — puppeteer-extra with stealth plugin.
 *
 * Architecture: fire-and-forget + polling (avoids proxy timeouts)
 *   - GET /api/screener?url=... returns immediately:
 *       • 200 {pairs, source:"cache"|"lastGood"|"live"} if data is available
 *       • 202 {status:"loading"}                        if scrape is in progress
 *   - Client polls every 3s until 200 arrives
 *
 * This means the proxy never has to wait >300ms, bypassing the ~5s
 * Replit/Vite proxy timeout that was aborting 20-25s browser launches.
 *
 * Additional fixes:
 *   - Browser mutex: one Playwright at a time (no userDataDir collision)
 *   - Batch pair API: 30 addresses per call (100→4 batches)
 *   - Stale-while-revalidate: return _lastGood immediately while refreshing
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
const _lastGood = new Map<string, any[]>();         // stale-while-revalidate data
const _inFlight = new Set<string>();                // URLs currently being scraped
const CACHE_TTL_MS = 60_000;

// ── Browser mutex ─────────────────────────────────────────────────────────────

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
 * Batch-fetch pair data using DexScreener's comma-separated pair endpoint.
 * 30 addresses per call = ~4 calls instead of 100 individual calls.
 */
async function fetchPairsByAddresses(chain: string, addrs: string[]): Promise<any[]> {
  if (!addrs.length) return [];
  const BATCH = 30;
  const out: any[] = [];

  for (let i = 0; i < addrs.length; i += BATCH) {
    const chunk  = addrs.slice(i, i + BATCH);
    const joined = chunk.join(",");
    try {
      const res = await fetch(`${DEX_API}/latest/dex/pairs/${chain}/${joined}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        const json = await res.json() as any;
        if (json?.pairs?.length) out.push(...json.pairs.filter(Boolean));
        else if (json?.pair)     out.push(json.pair);
      } else {
        console.warn(`[screener] pairs API ${res.status} batch ${i / BATCH + 1}`);
      }
    } catch (e: any) {
      console.warn(`[screener] pairs API error batch ${i / BATCH + 1}:`, e.message);
    }
    if (i + BATCH < addrs.length) await sleep(300);
  }
  return out;
}

// ── Background scraper ────────────────────────────────────────────────────────

/**
 * Run the full scrape pipeline in the background (fire-and-forget).
 * Updates _cache and _lastGood when complete. Clears _inFlight when done.
 */
async function backgroundScrape(url: string): Promise<void> {
  const chainMatch = url.match(/chainIds=([^&]+)/);
  const chain      = chainMatch ? decodeURIComponent(chainMatch[1]).split(",")[0] : "solana";

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

      // page.evaluate runs inside Chromium (browser context), not Node.
      // We pass a serialised function string to bypass TypeScript's DOM-type check.
      const evalFn = new Function("ch", `
        var links = document.querySelectorAll("a[href]");
        var addrs = [];
        links.forEach(function(a) {
          var href = a.getAttribute("href") || "";
          var m = href.match(new RegExp("/" + ch + "/([a-zA-Z0-9]{30,65})", "i"));
          if (m && addrs.indexOf(m[1].toLowerCase()) === -1) addrs.push(m[1].toLowerCase());
        });
        return addrs;
      `);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const extracted: string[] = await (page as any).evaluate(evalFn, chain);

      console.log(`[screener] extracted ${extracted.length} pair addresses`);
      return extracted;
    } finally {
      await browser.close();
    }
  });

  if (!pairAddrs.length) {
    console.log(`[screener] 0 addresses (CF block) — keeping _lastGood`);
    _inFlight.delete(url);
    return;
  }

  const rawPairs = await fetchPairsByAddresses(chain, pairAddrs);
  console.log(`[screener] fetched ${rawPairs.length} pairs from public API`);

  if (rawPairs.length > 0) {
    _cache.set(url, { pairs: rawPairs, ts: Date.now() });
    _lastGood.set(url, rawPairs);
  }
  _inFlight.delete(url);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Get screener data for a URL.
 *
 * Returns:
 *   { pairs, source, count }  when data is available (200)
 *   { status: "loading" }     when a scrape is in progress (202 — caller sets status code)
 *
 * Caller is responsible for setting the HTTP status code (200 vs 202).
 */
export function getScreenerData(url: string): {
  ready: boolean;
  pairs: any[];
  source: "cache" | "lastGood" | "loading";
} {
  // 1. Live cache hit (< 60s old) → return immediately
  const cached = _cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { ready: true, pairs: cached.pairs, source: "cache" };
  }

  // 2. Have stale data → return it immediately AND kick off background refresh
  const stale = _lastGood.get(url);
  if (stale && stale.length > 0) {
    if (!_inFlight.has(url)) {
      _inFlight.add(url);
      backgroundScrape(url).catch(console.error);
    }
    return { ready: true, pairs: stale, source: "lastGood" };
  }

  // 3. No data at all → start scraping, tell client to poll
  if (!_inFlight.has(url)) {
    _inFlight.add(url);
    backgroundScrape(url).catch((e) => {
      console.error(`[screener] background scrape failed:`, e);
      _inFlight.delete(url);
    });
  }
  return { ready: false, pairs: [], source: "loading" };
}
