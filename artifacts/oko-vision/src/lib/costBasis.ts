/**
 * costBasis — Simple, reliable cost-basis store for PnL tracking.
 *
 * Stores invested USD per token (keyed by UPPERCASE symbol).
 * Written at buy time, read at portfolio time.
 * Independent of mint addresses, decimals, or any other unreliable data.
 */

const STORE_KEY = "oko-cb-v2";

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as Record<string, number>;
    return {};
  } catch {
    return {};
  }
}

function persist(data: Record<string, number>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {}
}

function normalizeKey(symbol: string): string {
  return symbol.toUpperCase().trim();
}

/**
 * Record a buy event — adds usdAmount to the symbol's cumulative cost basis.
 */
export function recordBuy(symbol: string, usdAmount: number): void {
  const usd = Number(usdAmount);
  if (!(usd > 0)) return;
  const key  = normalizeKey(symbol);
  const data = load();
  const prev = Number(data[key]) || 0;
  data[key]  = prev + usd;
  persist(data);
  console.log(`[CostBasis] BUY ${key}: +$${usd.toFixed(2)} → invested total $${data[key].toFixed(2)}`);
}

/**
 * Record a sell event — reduces cost basis proportionally.
 * sellFraction = 0.5 means selling 50% → cost basis halved.
 * sellFraction = 1.0 means full sell → cost basis cleared.
 */
export function recordSell(symbol: string, sellFraction: number): void {
  const key  = normalizeKey(symbol);
  const data = load();
  const prev = Number(data[key]) || 0;
  if (!(prev > 0)) return;
  const remaining = sellFraction >= 1 ? 0 : prev * (1 - sellFraction);
  data[key] = remaining;
  persist(data);
  console.log(`[CostBasis] SELL ${key}: ${(sellFraction * 100).toFixed(0)}% sold → remaining $${remaining.toFixed(2)}`);
}

/**
 * Get the invested USD for a single symbol.
 * Returns undefined if no data is available.
 */
export function getCostBasis(symbol: string): number | undefined {
  const key = normalizeKey(symbol);
  const val = Number(load()[key]);
  return val > 0 ? val : undefined;
}

/**
 * Get all stored cost bases (UPPERCASE_SYMBOL → usdAmount).
 */
export function getAllCostBases(): Record<string, number> {
  const raw  = load();
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (n > 0) out[k] = n;
  }
  return out;
}

/**
 * Migrate data from old sources (positions, tradeHistory) into the store.
 * Safe to call multiple times — only writes missing entries, never overwrites.
 */
export function migrateFromLegacy(
  positions: Array<{ symbol: string; usdValue?: number }>,
  tradeHistory: Array<{ side: string; symbol: string; usdValue?: number }>,
): void {
  const data = load();
  let changed = false;

  // From trade history: sum usdValue for BUY records
  const fromTrades: Record<string, number> = {};
  for (const t of tradeHistory) {
    if (t.side !== "BUY") continue;
    const usd = Number(t.usdValue);
    if (!(usd > 0)) continue;
    const key = normalizeKey(t.symbol);
    fromTrades[key] = (fromTrades[key] ?? 0) + usd;
  }
  for (const [key, usd] of Object.entries(fromTrades)) {
    if (!(key in data)) {
      data[key] = usd;
      changed = true;
    }
  }

  // From positions: use usdValue as fallback (single most recent buy amount)
  for (const p of positions) {
    const usd = Number(p.usdValue);
    if (!(usd > 0)) continue;
    const key = normalizeKey(p.symbol);
    if (!(key in data)) {
      data[key] = usd;
      changed = true;
    }
  }

  if (changed) {
    persist(data);
    console.log("[CostBasis] Migrated legacy data →", data);
  }
}
