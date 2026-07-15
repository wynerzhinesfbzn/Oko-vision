/**
 * AutoTrader — Production 24/7 Auto-Trading Engine
 *
 * Runs as a background React component (no rendered UI).
 * Works ONLY for "generated" wallets (keypair available via walletKeystore).
 *
 * Each 60-second tick:
 *  1. Guard checks (autoTrading on, generated wallet, keypair available)
 *  2. Stop if daily net P&L target is reached
 *  3. Fetch SOL balance + network congestion (parallel)
 *  4. Fetch DexScreener scan results (via server-side proxy)
 *  5. For each enabled strategy — in parallel:
 *     a. Count active positions attributed to this strategy
 *     b. Skip if strategy is at max positions
 *     c. Filter + rank scan results against strategy criteria
 *     d. For best candidate: run pre-buy net-profit gate (Jupiter quote)
 *     e. Execute real Jupiter V6 swap
 *     f. Register position with SL/TP for PositionMonitor to monitor
 *     g. Update daily stats
 *
 * PositionMonitor (separate component) handles:
 *  - Auto SL/TP/trailing stop execution every 30s
 *  - DCA and dip-buy execution
 *
 * AutoProfitLock: moves SL up as position profits grow (implemented here
 * in a parallel 30s tick, separate from PositionMonitor's sell logic).
 */

import { useEffect, useRef, useCallback } from "react";
import { useTrading }    from "@/context/TradingContext";
import { useOkoWallet }  from "@/context/WalletContext";
import { useBalance }    from "@/context/BalanceContext";
import { getKeypairDirect }  from "@/lib/walletKeystore";
import { executeSwap }       from "@/lib/swapExecutor";
import { fetchSolBalance }   from "@/lib/swapExecutor";
import { savePurchase }      from "@/lib/portfolioData";
import { SOL_MINT }          from "@/lib/jupiter";
import {
  STRATEGIES,
  fetchScanResults,
  tokenMatchesStrategy,
  scoreTokenForStrategy,
  calcPositionSizeUsd,
  calcDynamicPriorityFee,
  checkNetProfitBeforeBuy,
  fetchNetworkCongestion,
  computeDailyNetPnlUsd,
  computeProfitLockSlPrice,
  type Strategy,
  type ScanResult,
} from "@/lib/tradingEngine";

// ── Constants ─────────────────────────────────────────────────────────────────

const SCAN_INTERVAL_MS        = 60_000;  // main scan loop
const PROFIT_LOCK_INTERVAL_MS = 30_000;  // profit lock check
const MIN_SOL_RESERVE         = 0.05;    // always keep this much SOL for fees
const COOLDOWN_MS             = 300_000; // 5 min cooldown after buying a token
const MAX_CIRCUIT_BREAK_ERRS  = 5;       // consecutive errors before pausing scans

// ── Helper: send browser notification (fire-and-forget) ───────────────────────

function notify(title: string, body: string) {
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icons/icon-192.png" });
    }
  } catch { /* non-critical */ }
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function AutoTrader() {
  const {
    autoTrading,
    autoStrategies,
    riskSettings,
    sltpSettings,
    dailyTargetUsd,
    positions,
    tradeHistory,
    addPosition,
    addTrade,
    updatePositionSlPrice,
  } = useTrading();

  const { address, walletType } = useOkoWallet();
  const { solPrice, refresh: refreshBalance } = useBalance();

  // ── Stable refs so interval callbacks always see current values ────────────
  const autoTradingRef    = useRef(autoTrading);
  const autoStrategiesRef = useRef(autoStrategies);
  const posRef            = useRef(positions);
  const tradeHistRef      = useRef(tradeHistory);
  const solPriceRef       = useRef(solPrice);
  const sltpRef           = useRef(sltpSettings);
  const riskRef           = useRef(riskSettings);
  const dailyTargetRef    = useRef(dailyTargetUsd);
  const addrRef           = useRef(address);
  const walletTypeRef     = useRef(walletType);

  autoTradingRef.current    = autoTrading;
  autoStrategiesRef.current = autoStrategies;
  posRef.current            = positions;
  tradeHistRef.current      = tradeHistory;
  solPriceRef.current       = solPrice;
  sltpRef.current           = sltpSettings;
  riskRef.current           = riskSettings;
  dailyTargetRef.current    = dailyTargetUsd;
  addrRef.current           = address;
  walletTypeRef.current     = walletType;

  // ── State for circuit-breaker and cooldowns ────────────────────────────────
  const consecutiveErrors = useRef(0);
  const inFlight          = useRef<Set<string>>(new Set());          // mints being bought
  const cooldowns         = useRef<Map<string, number>>(new Map());  // mint → last buy ts
  const stratPositions    = useRef<Map<string, Set<string>>>(new Map()); // stratId → Set<mint>

  // ── Sync stratPositions from positions state ───────────────────────────────
  useEffect(() => {
    const map = new Map<string, Set<string>>();
    for (const p of positions) {
      const sid = (p as any).strategyId as string | undefined;
      if (!sid) continue;
      if (!map.has(sid)) map.set(sid, new Set());
      map.get(sid)!.add(p.mint);
    }
    stratPositions.current = map;
  }, [positions]);

  // ── Execute one strategy against a set of candidates ───────────────────────
  const executeStrategy = useCallback(async (
    strategy: Strategy,
    candidates: ScanResult[],
    solBal: number,
    congestion: number,
    addr: string,
  ) => {
    const solUsd      = solPriceRef.current > 0 ? solPriceRef.current : 150;
    const activeMints = stratPositions.current.get(strategy.id) ?? new Set<string>();

    if (activeMints.size >= strategy.maxPositions) {
      console.log(`[AutoTrader] ${strategy.id}: макс. позиций (${activeMints.size}/${strategy.maxPositions})`);
      return;
    }

    // Filter candidates for this strategy
    const now   = Date.now();
    const valid = candidates.filter((t) => {
      if (!t.mint || inFlight.current.has(t.mint)) return false;
      // Already in any open position
      if (posRef.current.some((p) => p.mint === t.mint)) return false;
      // Cooldown
      const lastBuy = cooldowns.current.get(t.mint);
      if (lastBuy && now - lastBuy < COOLDOWN_MS) return false;
      // Strategy filter
      return tokenMatchesStrategy(t, strategy);
    });

    if (valid.length === 0) return;

    // Pick highest-scoring candidate
    const best = valid
      .map((t) => ({ t, score: scoreTokenForStrategy(t, strategy) }))
      .sort((a, b) => b.score - a.score)[0].t;

    const enabledCount = autoStrategiesRef.current.length || 1;
    const usdAmount    = calcPositionSizeUsd(strategy, solBal, solUsd, enabledCount);
    const minAmount    = 2; // $2 minimum
    if (usdAmount < minAmount) {
      console.log(`[AutoTrader] ${strategy.id}: позиция слишком мала ($${usdAmount.toFixed(2)})`);
      return;
    }

    const priorityFeeSol = calcDynamicPriorityFee(strategy, congestion);

    // ── Pre-buy net profit gate ───────────────────────────────────────────────
    const gate = await checkNetProfitBeforeBuy({
      inputMint:      SOL_MINT,
      outputMint:     best.mint,
      inputAmountUsd: usdAmount,
      solPriceUsd:    solUsd,
      strategy,
      priorityFeeSol,
    });

    if (!gate.ok) {
      console.log(`[AutoTrader] ${strategy.id}: ❌ Net-profit gate: ${gate.reason}`);
      return;
    }

    // ── Risk manager check ────────────────────────────────────────────────────
    const riskCheck = riskRef.current;
    if (posRef.current.length >= riskCheck.maxOpenPositions) {
      console.log(`[AutoTrader] Глобальный лимит позиций (${posRef.current.length})`);
      return;
    }

    // ── Execute real Jupiter swap ─────────────────────────────────────────────
    inFlight.current.add(best.mint);

    console.log(
      `[AutoTrader] 🎯 ${strategy.emoji} ${strategy.id} → покупаю ${best.symbol}` +
      ` $${usdAmount.toFixed(2)} | MCAP $${(best.marketCap / 1000).toFixed(0)}k` +
      ` | Score ${best.aiScore} | Impact ${gate.priceImpactPct.toFixed(2)}%` +
      ` | fee ${priorityFeeSol.toFixed(5)} SOL`,
    );

    try {
      const keypair = getKeypairDirect(addr);
      if (!keypair) throw new Error("Keypair не найден");

      const result = await executeSwap({
        userAddress:    addr,
        keypair,
        inputMint:      SOL_MINT,
        outputMint:     best.mint,
        inputAmountUsd: usdAmount,
        solPriceUsd:    solUsd,
        slippageBps:    strategy.slippageBps,
        priorityFeeSol,
      });

      const price    = result.entryPrice;
      const tokenQty = result.outAmountUi;
      const posNow   = Date.now();

      // Compute SL/TP from strategy + global sltpSettings
      const slPct        = Math.max(strategy.slPct, sltpRef.current.slPct);
      const tpPct        = strategy.tpPct;
      const trailingPct  = strategy.trailingPct > 0 ? strategy.trailingPct
                         : sltpRef.current.trailingPct > 0 ? sltpRef.current.trailingPct
                         : undefined;

      const slPrice = price * (1 - slPct / 100);
      const tpPrice = price * (1 + tpPct / 100);

      // Register position — PositionMonitor will auto-execute SL/TP
      addPosition({
        symbol:        best.symbol,
        mint:          best.mint,
        logoURI:       best.imageUrl,
        entryPrice:    price,
        currentPrice:  price,
        amount:        tokenQty,
        usdValue:      usdAmount,
        costBasisUsd:  usdAmount,
        openedAt:      posNow,
        slPrice,
        tpPrice,
        trailingPct,
        highWaterMark: price,
        // Strategy tag (custom field stored on Position)
        ...(({ strategyId: strategy.id } as any)),
      });

      // Record trade
      addTrade({
        timestamp: posNow,
        symbol:    best.symbol,
        mint:      best.mint,
        side:      "BUY",
        amount:    tokenQty,
        price,
        usdValue:  result.inputAmountUsd,
        fee:       result.fee,
        txHash:    result.txHash,
      });

      // Persist cost basis for Portfolio page
      savePurchase(best.mint, best.symbol, usdAmount);

      // Track cooldown
      cooldowns.current.set(best.mint, posNow);

      // Refresh wallet balance in UI
      refreshBalance();

      notify(
        `🤖 ${strategy.emoji} Куплено ${best.symbol}`,
        `$${usdAmount.toFixed(2)} · ${strategy.name} · Score ${best.aiScore}` +
        ` · ${result.txHash.slice(0, 8)}…`,
      );

      console.log(
        `[AutoTrader] ✅ ${strategy.id} bought ${best.symbol}:` +
        ` tx=${result.txHash} price=$${price.toExponential(3)}` +
        ` qty=${tokenQty.toFixed(4)}`,
      );

      consecutiveErrors.current = 0; // reset circuit breaker on success
    } catch (err: any) {
      consecutiveErrors.current++;
      console.error(`[AutoTrader] ❌ ${strategy.id} buy ${best.symbol} failed:`, err?.message ?? err);
    } finally {
      inFlight.current.delete(best.mint);
    }
  }, [addPosition, addTrade, refreshBalance]);

  // ── Main scan tick ────────────────────────────────────────────────────────
  const scanTick = useCallback(async () => {
    if (!autoTradingRef.current) return;

    const addr   = addrRef.current;
    const wType  = walletTypeRef.current;
    if (!addr || wType !== "generated") return;

    // Circuit breaker: pause if too many consecutive errors
    if (consecutiveErrors.current >= MAX_CIRCUIT_BREAK_ERRS) {
      console.warn(`[AutoTrader] ⛔ Circuit breaker: ${consecutiveErrors.current} ошибок подряд. Жду 5 минут.`);
      setTimeout(() => { consecutiveErrors.current = 0; }, 300_000);
      return;
    }

    // Quick keypair check before any async work
    const keypair = getKeypairDirect(addr);
    if (!keypair) {
      console.log("[AutoTrader] Keypair не найден — нужна разблокировка кошелька");
      return;
    }

    const enabledStrategies = autoStrategiesRef.current
      .map((id) => STRATEGIES.find((s) => s.id === id))
      .filter(Boolean) as Strategy[];

    if (enabledStrategies.length === 0) {
      console.log("[AutoTrader] Нет активных стратегий");
      return;
    }

    // ── Daily net target check ─────────────────────────────────────────────
    const dailyNet    = computeDailyNetPnlUsd(tradeHistRef.current);
    const dailyTarget = dailyTargetRef.current;
    if (dailyTarget > 0 && dailyNet >= dailyTarget) {
      console.log(`[AutoTrader] 🎯 Дневной таргет достигнут! Net P&L $${dailyNet.toFixed(2)} ≥ $${dailyTarget}. Покупки остановлены.`);
      return;
    }

    // ── Parallel: SOL balance + network congestion ─────────────────────────
    let solBal: number, congestion: number;
    try {
      [solBal, congestion] = await Promise.all([
        fetchSolBalance(addr),
        fetchNetworkCongestion(),
      ]);
    } catch (e: any) {
      console.warn("[AutoTrader] Не удалось получить баланс или конгестию:", e.message);
      consecutiveErrors.current++;
      return;
    }

    const spendableSol = solBal - MIN_SOL_RESERVE;
    if (spendableSol <= 0) {
      console.log(`[AutoTrader] Баланс SOL слишком низкий: ${solBal.toFixed(4)} SOL`);
      return;
    }

    // ── Fetch scan results (все источники: 150+ токенов) ──────────────────────
    let scanResults: ScanResult[];
    try {
      // type="all" → 12+ параллельных DexScreener источников через сервер-прокси
      // Тот же пул токенов, что и на странице Сигналов (ручной трейдинг)
      scanResults = await fetchScanResults("all");
      console.log(`[AutoTrader] 📊 Скан: ${scanResults.length} токенов (congestion ${(congestion * 100).toFixed(0)}%)`);
    } catch (e: any) {
      console.warn("[AutoTrader] Scan failed:", e.message);
      consecutiveErrors.current++;
      return;
    }

    if (scanResults.length === 0) return;

    // ── Run all enabled strategies in parallel ─────────────────────────────
    // Each strategy independently finds its best candidate and executes
    await Promise.allSettled(
      enabledStrategies.map((strategy) =>
        executeStrategy(strategy, scanResults, spendableSol, congestion, addr),
      ),
    );
  }, [executeStrategy]);

  // ── Profit Lock tick (30s) ─────────────────────────────────────────────────
  const profitLockTick = useCallback(() => {
    if (!autoTradingRef.current) return;
    const positions = posRef.current;

    for (const pos of positions) {
      if (!pos.currentPrice || !pos.entryPrice) continue;
      const newSl = computeProfitLockSlPrice(pos.entryPrice, pos.currentPrice, pos.slPrice);
      if (newSl !== null) {
        console.log(`[AutoTrader] 🔒 Profit Lock ${pos.symbol}: SL ${pos.slPrice?.toFixed(6) ?? "none"} → ${newSl.toFixed(6)}`);
        updatePositionSlPrice?.(pos.id, newSl);
      }
    }
  }, [updatePositionSlPrice]);

  // ── Request notification permission on first enable ────────────────────────
  useEffect(() => {
    if (autoTrading && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }, [autoTrading]);

  // ── Main scan loop ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoTrading) return;

    // Run immediately on enable, then on interval
    scanTick();
    const scanId = setInterval(scanTick, SCAN_INTERVAL_MS);

    // Profit lock on a faster tick
    profitLockTick();
    const lockId = setInterval(profitLockTick, PROFIT_LOCK_INTERVAL_MS);

    return () => {
      clearInterval(scanId);
      clearInterval(lockId);
    };
    // Re-run when wallet or autoTrading changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTrading, address, walletType]);

  return null;
}
