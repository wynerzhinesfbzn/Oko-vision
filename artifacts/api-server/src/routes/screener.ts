/**
 * DexScreener Screener scraper — puppeteer-extra with stealth plugin.
 *
 * Problem: DexScreener's screener data is delivered via WebSocket (protobuf),
 * and io.dexscreener.com is Cloudflare-protected — direct API calls return 403.
 *
 * Solution:
 *   1. Use puppeteer-extra + stealth plugin to bypass Cloudflare bot detection
 *   2. Load the DexScreener screener URL in headless Chromium
 *   3. Wait for the table to render (data arrives via WebSocket internally)
 *   4. Extract pair addresses from rendered DOM links (`/solana/PAIR_ADDRESS`)
 *   5. Fetch full structured pair data via DexScreener's PUBLIC API
 *      (`/latest/dex/pairs/{chainId}/{pairAddress}`) — no Cloudflare protection
 *
 * Cache TTL: 60 seconds (full browser launch takes ~8–12s).
 */

/* eslint-disable @typescript-eslint/no-require-imports */
// Dynamic require — puppeteer-extra is CJS and must stay external in esbuild
const puppeteerExtra = require("puppeteer-extra");
const StealthPlugin   = require("puppeteer-extra-plugin-stealth");

puppeteerExtra.use(StealthPlugin());

const DEX_API  = "https://api.dexscreener.com";
const CHROMIUM = "/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium";

// ── Cache ─────────────────────────────────────────────────────────────────────

interface ScreenerCache { pairs: any[]; ts: number }
const _cache    = new Map<string, ScreenerCache>(); // live (short TTL)
const _lastGood = new Map<string, any[]>();         // last known-good result (no expiry)
const CACHE_TTL_MS = 60_000;

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function fetchPairsByAddresses(chain: string, addrs: string[]): Promise<any[]> {
  if (!addrs.length) return [];
  const out: any[] = [];
  // DexScreener allows up to 30 addresses per call for /tokens/ but
  // /pairs/{chain}/{addr} works per-pair. Batch via /tokens/ with base token lookup.
  // Since we have PAIR addresses (not token addresses), use /pairs/chain/addr.
  // Fetch in batches of 10 in parallel to stay within rate limits.
  const BATCH = 10;
  for (let i = 0; i < addrs.length; i += BATCH) {
    const chunk = addrs.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map((addr) =>
        fetch(`${DEX_API}/latest/dex/pairs/${chain}/${addr}`, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8_000),
        })
          .then((r) => r.ok ? r.json() : null)
          .then((j) => j?.pair ?? j?.pairs?.[0] ?? null)
          .catch(() => null)
      )
    );
    out.push(...results.filter(Boolean));
  }
  return out;
}

// ── Main scraper ──────────────────────────────────────────────────────────────

/**
 * Scrape a DexScreener screener URL via headless Chromium (stealth).
 * Returns raw DexScreener pair objects (same schema as the public REST API).
 */
export async function scrapeScreener(url: string): Promise<any[]> {
  const cached = _cache.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    console.log(`[screener] cache hit — ${cached.pairs.length} pairs`);
    return cached.pairs;
  }

  const chainMatch = url.match(/chainIds=([^&]+)/);
  const chain = chainMatch ? decodeURIComponent(chainMatch[1]).split(",")[0] : "solana";

  const browser = await puppeteerExtra.launch({
    executablePath: CHROMIUM,
    headless: true,
    args: [
      "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
      "--disable-gpu", "--single-process", "--no-zygote",
    ],
  });

  let pairAddrs: string[] = [];

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for Cloudflare challenge + WebSocket data to render
    await sleep(18_000);

    const title = await page.title().catch(() => "?");
    console.log(`[screener] title="${title}"`);

    // Only proceed if page actually loaded (not Cloudflare block)
    const isBlocked = title.toLowerCase().includes("moment") ||
                      title.toLowerCase().includes("security") ||
                      title.toLowerCase().includes("checking");

    if (!isBlocked) {
      pairAddrs = await page.evaluate((ch: string) => {
        const links = document.querySelectorAll<HTMLAnchorElement>("a[href]");
        const addrs = new Set<string>();
        links.forEach((a) => {
          const href = a.getAttribute("href") || "";
          const m = href.match(new RegExp(`/${ch}/([a-zA-Z0-9]{30,60})`, "i"));
          if (m) addrs.add(m[1].toLowerCase());
        });
        return [...addrs];
      }, chain);
    } else {
      console.log(`[screener] Cloudflare block detected, skipping DOM extraction`);
    }

    console.log(`[screener] extracted ${pairAddrs.length} pair addresses from DOM`);
  } finally {
    await browser.close();
  }

  // If blocked (0 addresses), return last known-good result without updating cache
  if (!pairAddrs.length) {
    const last = _lastGood.get(url);
    if (last && last.length > 0) {
      console.log(`[screener] blocked — returning ${last.length} cached good pairs`);
      return last;
    }
    // No fallback available — return empty but don't cache (will retry next call)
    return [];
  }

  // Fetch full structured pair data from the public DexScreener API
  const rawPairs = await fetchPairsByAddresses(chain, pairAddrs);
  console.log(`[screener] fetched ${rawPairs.length} pairs from public API`);

  if (rawPairs.length > 0) {
    _cache.set(url, { pairs: rawPairs, ts: Date.now() });
    _lastGood.set(url, rawPairs); // persist last good result
  }
  return rawPairs;
}
