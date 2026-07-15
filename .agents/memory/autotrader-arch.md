---
name: AutoTrader architecture decisions
description: Key architectural choices for the AutoTrader component and its relationship with PositionMonitor
---

## Profit Lock location
Profit lock (`computeProfitLockSlPrice` from tradingEngine.ts) runs only inside `AutoTrader`'s 30s tick, not in `PositionMonitor`.

**Why:** Both components share a 30s interval. Putting profit-lock in both would cause double-writes to the same position's slPrice and race conditions. AutoTrader is the strategy owner; PositionMonitor is the executor. Keep concerns separated.

**How to apply:** If profit-lock logic needs to move to PositionMonitor in the future, remove it from AutoTrader first.

## Keypair access
Both AutoTrader and PositionMonitor call `getKeypairDirect(address)` — no password required. This works only when the wallet was previously unlocked in the session (rawPrivKey cached in walletKeystore). The components check for null and bail out gracefully if not available.

## Circuit breaker
5 consecutive scan errors → 5 minute pause. Counter is a `useRef`, not state (no re-render).
