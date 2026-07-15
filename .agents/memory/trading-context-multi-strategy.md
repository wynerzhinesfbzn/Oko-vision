---
name: TradingContext multi-strategy fields
description: Fields added to TradingContext for multi-strategy auto-trading support
---

## Added fields

- `autoStrategies: string[]` — IDs of currently enabled strategies (replaces single `oko-auto-strategy` localStorage key). Initialized by migrating the legacy key on first load.
- `setAutoStrategies: (ids: string[]) => void`
- `dailyTargetUsd: number` — stop new buys when daily net P&L ≥ this value. 0 = disabled.
- `setDailyTargetUsd: (v: number) => void`
- `updatePositionSlPrice(positionId: string, newSlPrice: number): void` — only moves SL upward (profit lock). Ignores if newSlPrice ≤ current slPrice.

## Position type addition
`strategyId?: string` added to Position interface.

## Storage key
All new fields persisted inside `"oko-trading"` localStorage key alongside existing fields. Legacy `"oko-auto-strategy"` key is read once on init for backward compat migration.

**Why:** Single key avoids partial-state desync on load. The legacy single-strategy key is still written (first element of autoStrategies) for any components that haven't been updated to use the context field.
