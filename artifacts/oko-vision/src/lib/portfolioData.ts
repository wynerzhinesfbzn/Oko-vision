/**
 * portfolioData — Single source of truth for invested USD (cost basis).
 *
 * Storage key: "oko-pd-v1"
 * Primary index: mint address (always exact, blockchain-native)
 * Secondary index: UPPERCASE symbol (fallback when mint is unavailable)
 *
 * Call savePurchase() BEFORE any React state updates to guarantee data is
 * present when Portfolio re-renders.
 */

const KEY = "oko-pd-v1";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Entry {
  mint: string;
  symbol: string;
  usdCostBasis: number;   // total USD invested so far
  timestamp: number;
}

interface Store {
  byMint:   Record<string, Entry>;   // mint → entry
  bySymbol: Record<string, string>;  // UPPER_SYMBOL → mint (index)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const UP = (s: string) => s.toUpperCase().trim();

function empty(): Store {
  return { byMint: {}, bySymbol: {} };
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.byMint) return parsed as Store;
    return empty();
  } catch {
    return empty();
  }
}

function write(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {}
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a purchase.
 * MUST be called BEFORE addPosition() to avoid race with React re-render.
 *
 * @param mint      Token mint address (use "" if unknown)
 * @param symbol    Token ticker symbol
 * @param usdAmount USD amount spent (e.g. 25.00)
 */
export function savePurchase(mint: string, symbol: string, usdAmount: number): void {
  const usd = Number(usdAmount);
  if (!(usd > 0)) {
    console.warn(`[portfolioData] savePurchase skipped: usdAmount=${usdAmount} for ${symbol}`);
    return;
  }

  const store = read();
  const key   = mint || UP(symbol);   // prefer mint as primary key
  const symUp = UP(symbol);
  const prev  = store.byMint[key]?.usdCostBasis ?? 0;

  store.byMint[key] = { mint: key, symbol: symUp, usdCostBasis: prev + usd, timestamp: Date.now() };
  store.bySymbol[symUp] = key;        // update symbol → mint index

  write(store);
  console.log(`[portfolioData] ✅ BUY saved: ${symUp} | mint=${key.slice(0,8)}… | +$${usd.toFixed(2)} → total $${store.byMint[key].usdCostBasis.toFixed(2)}`);
}

/**
 * Record a sell — reduce cost basis proportionally.
 *
 * @param mint          Token mint address
 * @param symbol        Token ticker symbol
 * @param sellFraction  0.0–1.0 (1.0 = full sell)
 */
export function recordSale(mint: string, symbol: string, sellFraction: number): void {
  const store = read();
  const key   = mint || UP(symbol);
  const entry = store.byMint[key] ?? store.byMint[store.bySymbol[UP(symbol)] ?? ""];
  if (!entry || !(entry.usdCostBasis > 0)) return;

  const fraction  = Math.max(0, Math.min(1, sellFraction));
  const remaining = fraction >= 1 ? 0 : entry.usdCostBasis * (1 - fraction);
  entry.usdCostBasis = remaining;
  write(store);
  console.log(`[portfolioData] SELL ${UP(symbol)}: ${(fraction * 100).toFixed(0)}% → remaining $${remaining.toFixed(2)}`);
}

/**
 * Look up invested USD for a token.
 * Tries mint first, then symbol fallback.
 * Returns undefined if no data exists.
 */
export function getInvested(mint: string, symbol: string): number | undefined {
  const store  = read();
  const key    = mint || UP(symbol);
  const symUp  = UP(symbol);

  const byMint = store.byMint[key]?.usdCostBasis;
  if (byMint != null && byMint > 0) return byMint;

  // Symbol fallback: look up mint from index, then entry
  const mintFromSym = store.bySymbol[symUp];
  if (mintFromSym) {
    const byIdx = store.byMint[mintFromSym]?.usdCostBasis;
    if (byIdx != null && byIdx > 0) return byIdx;
  }

  return undefined;
}

/**
 * Get all entries (for debug display).
 */
export function getAllEntries(): Entry[] {
  return Object.values(read().byMint).filter((e) => e.usdCostBasis > 0);
}

/**
 * Last-resort fallback: populate missing entries from on-chain token values.
 * Used when tradeHistory and positions both lack usdValue (old data).
 * Only writes entries that don't already exist.
 * NOTE: uses current market value as an APPROXIMATION of invested amount.
 */
export function fillFromChainTokens(
  tokens: Array<{ mint: string; symbol: string; usdValue?: number; amount?: number; usdPrice?: number }>,
): void {
  const store = read();
  let changed = false;

  for (const t of tokens) {
    const symUp = UP(t.symbol);
    const key   = t.mint || symUp;
    const usd   = Number(t.usdValue) > 0
      ? Number(t.usdValue)
      : (Number(t.amount) * Number(t.usdPrice));

    if (!(usd > 0)) continue;
    if (store.byMint[key]) continue; // don't overwrite existing data

    store.byMint[key] = { mint: key, symbol: symUp, usdCostBasis: usd, timestamp: Date.now() };
    store.bySymbol[symUp] = key;
    changed = true;
    console.log(`[portfolioData] Filled from chain: ${symUp} ≈ $${usd.toFixed(2)} (approximation)`);
  }

  if (changed) write(store);
}

/**
 * Clear everything. Used by the "Reset" button.
 */
export function clearAll(): void {
  try { localStorage.removeItem(KEY); } catch {}
  console.log("[portfolioData] Cleared all data");
}

/**
 * Rebuild from existing data sources (one-time migration + reset flow).
 * Priority: tradeHistory BUYs → position.usdValue fallback.
 * Only writes entries that don't already exist.
 */
export function rebuildStore(
  tradeHistory: Array<{ side: string; mint?: string; symbol: string; usdValue?: number; timestamp?: number }>,
  positions:    Array<{ mint: string; symbol: string; usdValue?: number }>,
  overwrite = false,
): void {
  const store = overwrite ? empty() : read();

  // 1. Sum all BUYs from trade history (most reliable source)
  const buys = [...tradeHistory]
    .filter((t) => t.side === "BUY" && Number(t.usdValue) > 0)
    .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

  for (const t of buys) {
    const symUp = UP(t.symbol);
    const key   = t.mint || symUp;
    const usd   = Number(t.usdValue);
    if (!(usd > 0)) continue;
    if (!overwrite && store.byMint[key]) continue;  // don't overwrite existing
    const prev  = store.byMint[key]?.usdCostBasis ?? 0;
    store.byMint[key] = { mint: key, symbol: symUp, usdCostBasis: prev + usd, timestamp: t.timestamp ?? Date.now() };
    store.bySymbol[symUp] = key;
  }

  // 2. Sell reductions (only when doing full rebuild)
  if (overwrite) {
    const sells = [...tradeHistory]
      .filter((t) => t.side === "SELL" && Number(t.usdValue) > 0)
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    for (const t of sells) {
      const symUp = UP(t.symbol);
      const key   = t.mint || store.bySymbol[symUp] || symUp;
      const entry = store.byMint[key];
      if (!entry || !(entry.usdCostBasis > 0)) continue;
      const fraction = Math.min(1, Number(t.usdValue) / entry.usdCostBasis);
      if (fraction > 0) entry.usdCostBasis *= (1 - fraction);
    }
  }

  // 3. Position usdValue as last-resort fallback
  for (const p of positions) {
    const usd   = Number(p.usdValue);
    const symUp = UP(p.symbol);
    const key   = p.mint || symUp;
    if (usd > 0 && !store.byMint[key]) {
      store.byMint[key] = { mint: key, symbol: symUp, usdCostBasis: usd, timestamp: Date.now() };
      store.bySymbol[symUp] = key;
    }
  }

  write(store);
  console.log("[portfolioData] Store rebuilt →", store);
}

// ── Also migrate from old key formats ────────────────────────────────────────

export function migrateFromLegacyStores(): void {
  const store = read();
  let changed = false;

  for (const oldKey of ["oko-portfolio-v1", "oko-cb-v2", "oko-cost-basis"]) {
    try {
      const raw = localStorage.getItem(oldKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") continue;

      // oko-portfolio-v1 format: { SYMBOL: { usdCostBasis, timestamp } }
      // oko-cb-v2 format: { SYMBOL: number }
      // oko-cost-basis format: { SYMBOL: number }
      const entries = oldKey === "oko-portfolio-v1" && parsed.byMint
        ? Object.values(parsed.byMint) as Entry[]
        : Object.entries(parsed).map(([sym, val]) => ({
            mint: sym,
            symbol: sym,
            usdCostBasis: typeof val === "object" ? (val as any).usdCostBasis : Number(val),
            timestamp: Date.now(),
          }));

      for (const e of entries) {
        const usd   = Number(e.usdCostBasis);
        const symUp = UP(e.symbol);
        const key   = e.mint || symUp;
        if (usd > 0 && !store.byMint[key]) {
          store.byMint[key] = { mint: key, symbol: symUp, usdCostBasis: usd, timestamp: e.timestamp ?? Date.now() };
          store.bySymbol[symUp] = key;
          changed = true;
        }
      }
    } catch {}
  }

  if (changed) {
    write(store);
    console.log("[portfolioData] Migrated from legacy stores →", store);
  }
}
