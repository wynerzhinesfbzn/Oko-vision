/**
 * portfolioStorage — The single source of truth for cost basis (invested USD).
 *
 * Structure: symbol (UPPERCASE) → { usdCostBasis, timestamp }
 * Written at buy-time (before any React state update), read at render-time.
 * Independent of: mint addresses, decimal guessing, or any unstable data.
 */

const STORE_KEY = "oko-portfolio-v1";

export interface CostEntry {
  usdCostBasis: number;
  timestamp: number;
}

export type CostStore = Record<string, CostEntry>;

function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().trim();
}

export function loadStore(): CostStore {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) return parsed as CostStore;
    return {};
  } catch {
    return {};
  }
}

function saveStore(store: CostStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {}
}

/**
 * Record a buy. Call this BEFORE addPosition so Portfolio sees fresh data.
 * Accumulates usdAmount into the symbol's cost basis.
 */
export function recordBuy(symbol: string, usdAmount: number): void {
  const usd = Number(usdAmount);
  if (!(usd > 0)) return;
  const key   = normalizeSymbol(symbol);
  const store = loadStore();
  const prev  = store[key]?.usdCostBasis ?? 0;
  store[key]  = { usdCostBasis: prev + usd, timestamp: Date.now() };
  saveStore(store);
  console.log(`[Portfolio] BUY ${key}: +$${usd.toFixed(2)} → total invested $${store[key].usdCostBasis.toFixed(2)}`);
}

/**
 * Record a sell. Reduces cost basis proportionally.
 * sellFraction=1.0 → full sell (clears to 0).
 * sellFraction=0.5 → 50% sold → cost basis halved.
 */
export function recordSell(symbol: string, sellFraction: number): void {
  const key   = normalizeSymbol(symbol);
  const store = loadStore();
  const entry = store[key];
  if (!entry || !(entry.usdCostBasis > 0)) return;
  const remaining = sellFraction >= 1 ? 0 : entry.usdCostBasis * (1 - sellFraction);
  store[key] = { usdCostBasis: remaining, timestamp: Date.now() };
  saveStore(store);
  console.log(`[Portfolio] SELL ${key}: ${(sellFraction * 100).toFixed(0)}% sold → remaining $${remaining.toFixed(2)}`);
}

/**
 * Get the invested USD for a symbol. Returns undefined if no data.
 */
export function getCostBasis(symbol: string): number | undefined {
  const key   = normalizeSymbol(symbol);
  const entry = loadStore()[key];
  const usd   = Number(entry?.usdCostBasis);
  return usd > 0 ? usd : undefined;
}

/**
 * Clear all stored cost basis data.
 */
export function clearCostBases(): void {
  try { localStorage.removeItem(STORE_KEY); } catch {}
  console.log("[Portfolio] Cleared all cost basis data");
}

/**
 * Migrate legacy data from old stores and trade history into this store.
 * Safe: never overwrites existing entries. Call once on Portfolio mount.
 */
export function migrateToNewStore(
  positions: Array<{ symbol: string; usdValue?: number }>,
  tradeHistory: Array<{ side: string; symbol: string; usdValue?: number; timestamp?: number }>,
): void {
  const store = loadStore();
  let changed = false;

  // 1. From old costBasis store (oko-cb-v2)
  try {
    const oldCB = JSON.parse(localStorage.getItem("oko-cb-v2") || "{}") as Record<string, number>;
    for (const [rawKey, val] of Object.entries(oldCB)) {
      const usd = Number(val);
      const key = normalizeSymbol(rawKey);
      if (usd > 0 && !(key in store)) {
        store[key] = { usdCostBasis: usd, timestamp: Date.now() };
        changed = true;
      }
    }
  } catch {}

  // 2. From old oko-cost-basis store
  try {
    const oldOko = JSON.parse(localStorage.getItem("oko-cost-basis") || "{}") as Record<string, number>;
    for (const [rawKey, val] of Object.entries(oldOko)) {
      const usd = Number(val);
      const key = normalizeSymbol(rawKey);
      if (usd > 0 && !(key in store)) {
        store[key] = { usdCostBasis: usd, timestamp: Date.now() };
        changed = true;
      }
    }
  } catch {}

  // 3. From trade history: sum all BUY usdValues per symbol
  const fromTrades: Record<string, { total: number; ts: number }> = {};
  for (const t of tradeHistory) {
    if (t.side !== "BUY") continue;
    const usd = Number(t.usdValue);
    if (!(usd > 0)) continue;
    const key = normalizeSymbol(t.symbol);
    const cur = fromTrades[key] ?? { total: 0, ts: 0 };
    fromTrades[key] = { total: cur.total + usd, ts: Math.max(cur.ts, t.timestamp ?? 0) };
  }
  for (const [key, { total, ts }] of Object.entries(fromTrades)) {
    if (total > 0 && !(key in store)) {
      store[key] = { usdCostBasis: total, timestamp: ts || Date.now() };
      changed = true;
    }
  }

  // 4. From positions as last resort
  for (const p of positions) {
    const usd = Number(p.usdValue);
    const key = normalizeSymbol(p.symbol);
    if (usd > 0 && !(key in store)) {
      store[key] = { usdCostBasis: usd, timestamp: Date.now() };
      changed = true;
    }
  }

  if (changed) {
    saveStore(store);
    console.log("[Portfolio] Migrated legacy data →", store);
  }
}

/**
 * Force rebuild the store from trade history (for the Reset button).
 * Replaces everything — use when data is suspected to be corrupt.
 */
export function rebuildFromTradeHistory(
  tradeHistory: Array<{ side: string; symbol: string; usdValue?: number; timestamp?: number }>,
): void {
  const fresh: CostStore = {};
  // Process BUYs in chronological order
  const buys = [...tradeHistory].filter((t) => t.side === "BUY").sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  for (const t of buys) {
    const usd = Number(t.usdValue);
    if (!(usd > 0)) continue;
    const key = normalizeSymbol(t.symbol);
    const prev = fresh[key]?.usdCostBasis ?? 0;
    fresh[key] = { usdCostBasis: prev + usd, timestamp: t.timestamp ?? Date.now() };
  }
  // Then process SELLs proportionally
  const sells = [...tradeHistory].filter((t) => t.side === "SELL").sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));
  for (const t of sells) {
    const key   = normalizeSymbol(t.symbol);
    const entry = fresh[key];
    if (!entry || !(entry.usdCostBasis > 0)) continue;
    // Estimate fraction sold: usdValue / invested
    const fraction = Math.min(1, Number(t.usdValue) / entry.usdCostBasis);
    if (fraction > 0) {
      entry.usdCostBasis = entry.usdCostBasis * (1 - fraction);
    }
  }
  saveStore(fresh);
  console.log("[Portfolio] Rebuilt from trade history →", fresh);
}
