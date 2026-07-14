/**
 * portfolioSnapshots.ts
 * Stores real on-chain portfolio value snapshots (from BalanceContext),
 * independent of the internally tracked positions in TradingContext.
 * Used by Portfolio.tsx to power the PnL chart and period PnL calculation.
 */

export interface Snapshot {
  timestamp: number;
  totalUsd: number;
}

const KEY = "oko-portfolio-snapshots-v1";
const MAX_SNAPSHOTS = 180; // ~6 months of daily snapshots

function read(): Snapshot[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Snapshot[];
  } catch {
    return [];
  }
}

function write(snaps: Snapshot[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(snaps.slice(-MAX_SNAPSHOTS)));
  } catch {}
}

/**
 * Record a portfolio value snapshot.
 * De-duplicates: only records a new snapshot if at least MIN_INTERVAL_MS has
 * passed since the last one, OR if totalUsd changed by more than DELTA_THRESHOLD.
 */
const MIN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const DELTA_THRESHOLD = 0.50;            // $0.50 change triggers immediate snapshot

export function addSnapshot(totalUsd: number): void {
  if (!(totalUsd > 0)) return;

  const snaps = read();
  const last  = snaps[snaps.length - 1];
  const now   = Date.now();

  if (last) {
    const timeDelta  = now - last.timestamp;
    const valueDelta = Math.abs(totalUsd - last.totalUsd);

    // Skip if recent AND value hasn't changed enough
    if (timeDelta < MIN_INTERVAL_MS && valueDelta < DELTA_THRESHOLD) return;
  }

  snaps.push({ timestamp: now, totalUsd });
  write(snaps);
}

/**
 * Retrieve all stored snapshots.
 */
export function getSnapshots(): Snapshot[] {
  return read();
}

/**
 * Clear all snapshots.
 */
export function clearSnapshots(): void {
  try { localStorage.removeItem(KEY); } catch {}
}
