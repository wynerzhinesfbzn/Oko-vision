/**
 * AutoTrader — реальный фоновый сканер + исполнитель авто-торговли.
 *
 * Работает только для generated-кошельков (keypair доступен без подписи пользователя).
 * Каждые 60 секунд:
 *  1. Запрашивает trending-токены от DexScreener
 *  2. Фильтрует по параметрам выбранной стратегии (MCAP, ликвидность, volume spike, AI score)
 *  3. Исполняет реальный Jupiter V6 своп
 *  4. Добавляет позицию в контекст с SL/TP для PositionMonitor
 *  5. Отправляет browser notification о покупке
 */

import { useEffect, useRef } from "react";
import { useTrading } from "@/context/TradingContext";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance } from "@/context/BalanceContext";
import { getKeypairDirect } from "@/lib/walletKeystore";
import { executeSwap, fetchSolBalance } from "@/lib/swapExecutor";
import { fetchTrendingPools } from "@/lib/geckoTerminal";
import { SOL_MINT } from "@/lib/jupiter";
import { savePurchase } from "@/lib/portfolioData";

// ── Strategy filter parameters ──────────────────────────────────────────────

interface StrategyFilter {
  mcapMin:              number;    // minimum market cap USD
  mcapMax:              number;    // maximum market cap USD
  liquidityMin:         number;    // minimum liquidity USD
  needVolumeSpike:      boolean;   // requires volumeSpike flag from DexScreener
  minChange1hForSpike:  number;    // if needVolumeSpike, 1h change must exceed this %
  aiScoreMin:           number;    // minimum AI score (0–100)
  dipRecovery:          boolean;   // look for recovering dip tokens
  positionPct:          number;    // fraction of SOL balance to spend (0.03 = 3%)
  trailingPct:          number;    // trailing stop % (0 = disabled)
  priorityFeeSol:       number;    // SOL to pay as priority fee
}

const STRATEGY_FILTERS: Record<string, StrategyFilter> = {
  "ultra-safe":      { mcapMin: 800_000,  mcapMax: 5_000_000, liquidityMin: 120_000, needVolumeSpike: false, minChange1hForSpike: 0,  aiScoreMin: 65, dipRecovery: false, positionPct: 0.20, trailingPct: 10, priorityFeeSol: 0.0001 },
  "safe-migration":  { mcapMin: 450_000,  mcapMax: 1_800_000, liquidityMin:  55_000, needVolumeSpike: false, minChange1hForSpike: 0,  aiScoreMin: 65, dipRecovery: false, positionPct: 0.15, trailingPct:  8, priorityFeeSol: 0.0001 },
  "balanced":        { mcapMin: 170_000,  mcapMax:   380_000, liquidityMin:  28_000, needVolumeSpike: true,  minChange1hForSpike: 10, aiScoreMin: 62, dipRecovery: false, positionPct: 0.12, trailingPct:  6, priorityFeeSol: 0.0005 },
  "early-migration": { mcapMin: 125_000,  mcapMax:   260_000, liquidityMin:  22_000, needVolumeSpike: true,  minChange1hForSpike: 15, aiScoreMin: 62, dipRecovery: false, positionPct: 0.10, trailingPct:  5, priorityFeeSol: 0.001  },
  "volume-spike":    { mcapMin:  75_000,  mcapMax:   230_000, liquidityMin:  18_000, needVolumeSpike: true,  minChange1hForSpike: 25, aiScoreMin: 60, dipRecovery: false, positionPct: 0.06, trailingPct:  4, priorityFeeSol: 0.002  },
  "degen":           { mcapMin:  35_000,  mcapMax:   135_000, liquidityMin:  10_000, needVolumeSpike: true,  minChange1hForSpike: 40, aiScoreMin: 55, dipRecovery: false, positionPct: 0.03, trailingPct:  3, priorityFeeSol: 0.005  },
  "smart-money":     { mcapMin: 150_000,  mcapMax:   600_000, liquidityMin:  30_000, needVolumeSpike: false, minChange1hForSpike: 0,  aiScoreMin: 72, dipRecovery: false, positionPct: 0.08, trailingPct:  0, priorityFeeSol: 0.002  },
  "hype":            { mcapMin:  80_000,  mcapMax:   350_000, liquidityMin:  10_000, needVolumeSpike: false, minChange1hForSpike: 0,  aiScoreMin: 62, dipRecovery: false, positionPct: 0.07, trailingPct:  0, priorityFeeSol: 0.002  },
  "dip-recovery":    { mcapMin: 120_000,  mcapMax:   450_000, liquidityMin:  10_000, needVolumeSpike: false, minChange1hForSpike: 0,  aiScoreMin: 55, dipRecovery: true,  positionPct: 0.09, trailingPct:  0, priorityFeeSol: 0.002  },
};

const SCAN_INTERVAL_MS   = 60_000;   // scan every 60 seconds
const COOLDOWN_MS        = 300_000;  // 5 min cooldown per token after buy
const MIN_SOL_RESERVE    = 0.05;     // keep at least 0.05 SOL for fees

export default function AutoTrader() {
  const {
    autoTrading,
    riskSettings,
    sltpSettings,
    positions,
    addPosition,
    addTrade,
  } = useTrading();

  const { address, walletType } = useOkoWallet();
  const { solPrice, refresh: refreshBalance } = useBalance();

  // Refs so interval callback always sees current values
  const solPriceRef   = useRef(solPrice);
  const posRef        = useRef(positions);
  const sltpRef       = useRef(sltpSettings);
  const riskRef       = useRef(riskSettings);
  const autoRef       = useRef(autoTrading);

  solPriceRef.current = solPrice;
  posRef.current      = positions;
  sltpRef.current     = sltpSettings;
  riskRef.current     = riskSettings;
  autoRef.current     = autoTrading;

  const inFlight   = useRef<Set<string>>(new Set());
  const recentBuys = useRef<Map<string, number>>(new Map()); // mint → timestamp

  useEffect(() => {
    if (!autoTrading) return;

    const scan = async () => {
      // Safety re-check (closure over ref so it's always current)
      if (!autoRef.current) return;

      const addr  = address;
      const wType = walletType;
      if (!addr || wType !== "generated") {
        console.log("[AutoTrader] Пропуск: нет generated-кошелька");
        return;
      }

      const keypair = getKeypairDirect(addr);
      if (!keypair) {
        console.log("[AutoTrader] Пропуск: ключ кошелька не найден (нужна разблокировка)");
        return;
      }

      const strategyId = localStorage.getItem("oko-auto-strategy") ?? "early-migration";
      const filter     = STRATEGY_FILTERS[strategyId];
      if (!filter) return;

      // Check max open positions
      if (posRef.current.length >= riskRef.current.maxOpenPositions) {
        console.log(`[AutoTrader] Достигнут лимит позиций (${posRef.current.length})`);
        return;
      }

      // Fetch real SOL balance (fresh, not from cached context)
      const solBal = await fetchSolBalance(addr);
      if (solBal <= MIN_SOL_RESERVE) {
        console.log(`[AutoTrader] Баланс SOL слишком низкий: ${solBal.toFixed(4)} SOL`);
        return;
      }

      const solUsd = solPriceRef.current > 0 ? solPriceRef.current : 150;

      // Fetch DexScreener trending tokens
      let signals;
      try {
        signals = await fetchTrendingPools("solana");
      } catch (e) {
        console.warn("[AutoTrader] DexScreener недоступен:", e);
        return;
      }

      const now = Date.now();

      // Apply strategy filters
      const candidates = signals.filter((s) => {
        const mint = s.baseToken.id;
        if (!mint) return false;

        // Skip if already in portfolio
        if (posRef.current.some((p) => p.mint === mint)) return false;

        // Skip if in cooldown window
        const lastBuy = recentBuys.current.get(mint);
        if (lastBuy && now - lastBuy < COOLDOWN_MS) return false;

        // Skip if in flight
        if (inFlight.current.has(mint)) return false;

        // MCAP range
        const mcap = s.marketCap ?? 0;
        if (mcap < filter.mcapMin || mcap > filter.mcapMax) return false;

        // Liquidity minimum
        if (s.liquidity < filter.liquidityMin) return false;

        // Volume spike requirement
        if (filter.needVolumeSpike) {
          if (!s.volumeSpike) return false;
          // Use 1h price change as proxy for spike magnitude
          if (s.change1h < filter.minChange1hForSpike) return false;
        }

        // AI signal + score
        if (s.aiSignal !== "BUY") return false;
        if (s.aiScore < filter.aiScoreMin) return false;

        // Dip recovery: dropped 25%+ in 24h but recovering (positive 1h)
        if (filter.dipRecovery) {
          if (s.change24h > -25) return false;
          if (s.change1h <= 0)   return false;
        }

        return true;
      });

      if (candidates.length === 0) {
        console.log(`[AutoTrader] Нет кандидатов для стратегии "${strategyId}"`);
        return;
      }

      // Pick best candidate by AI score
      const best = [...candidates].sort((a, b) => b.aiScore - a.aiScore)[0];
      const mint   = best.baseToken.id;
      const symbol = best.baseToken.symbol;

      // Calculate position size (fraction of total SOL balance, keep reserve)
      const tradableSOL = Math.max(0, solBal - MIN_SOL_RESERVE);
      const usdAmount   = Math.round(tradableSOL * solUsd * filter.positionPct * 100) / 100;
      const minAmount   = 2; // minimum $2 per trade
      if (usdAmount < minAmount) {
        console.log(`[AutoTrader] Позиция слишком мала: $${usdAmount.toFixed(2)}`);
        return;
      }

      // Risk manager: enforce daily loss limit (simplified)
      // TODO: integrate with full daily loss tracking

      inFlight.current.add(mint);
      console.log(`[AutoTrader] 🎯 "${strategyId}" → покупаю ${symbol} $${usdAmount.toFixed(2)} (MCAP $${(best.marketCap ?? 0 / 1000).toFixed(0)}k, Score ${best.aiScore})`);

      try {
        const result = await executeSwap({
          userAddress:    addr,
          keypair,
          inputMint:      SOL_MINT,
          outputMint:     mint,
          inputAmountUsd: usdAmount,
          solPriceUsd:    solUsd,
          slippageBps:    150,
          priorityFeeSol: filter.priorityFeeSol,
        });

        const price    = result.entryPrice;
        const tokenQty = result.outAmountUi;

        // Compute SL/TP prices from settings
        const slPrice     = sltpRef.current.slPct > 0
          ? price * (1 - sltpRef.current.slPct / 100)
          : undefined;
        const tpPrice     = sltpRef.current.tpPct > 0
          ? price * (1 + sltpRef.current.tpPct / 100)
          : undefined;
        const trailingPct = filter.trailingPct > 0 ? filter.trailingPct : (sltpRef.current.trailingPct > 0 ? sltpRef.current.trailingPct : undefined);

        // Add position (PositionMonitor will auto-execute SL/TP)
        addPosition({
          symbol,
          mint,
          entryPrice:    price,
          currentPrice:  price,
          amount:        tokenQty,
          usdValue:      usdAmount,
          costBasisUsd:  usdAmount,
          openedAt:      now,
          slPrice,
          tpPrice,
          trailingPct,
          highWaterMark: price,
        });

        // Record trade in history
        addTrade({
          timestamp: now,
          symbol,
          mint,
          side:      "BUY",
          amount:    tokenQty,
          price,
          usdValue:  usdAmount,
          fee:       result.fee,
          txHash:    result.txHash,
        });

        // Persist cost basis for Portfolio page
        savePurchase(mint, symbol, usdAmount);

        // Mark cooldown
        recentBuys.current.set(mint, now);

        // Refresh balance in UI
        refreshBalance();

        // Browser notification
        try {
          if (Notification.permission === "granted") {
            new Notification(`🤖 AutoBot купил ${symbol}`, {
              body: `$${usdAmount.toFixed(2)} · ${strategyId} · Score ${best.aiScore} · ${result.txHash.slice(0, 10)}…`,
              icon: "/icons/icon-192.png",
            });
          }
        } catch { /* non-critical */ }

        console.log(`[AutoTrader] ✅ Куплено ${symbol}: txHash=${result.txHash} price=$${price.toExponential(3)} qty=${tokenQty.toFixed(4)}`);
      } catch (err: any) {
        console.error(`[AutoTrader] ❌ Ошибка покупки ${symbol}:`, err?.message ?? err);
      } finally {
        inFlight.current.delete(mint);
      }
    };

    // Run immediately on activation, then on interval
    scan();
    const id = setInterval(scan, SCAN_INTERVAL_MS);
    return () => clearInterval(id);
    // Re-run effect when wallet / autoTrading changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrading, address, walletType]);

  return null;
}
