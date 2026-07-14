/**
 * PositionMonitor — runs silently in the background every 30 seconds.
 *
 * Handles three auto-execution flows for generated wallets (keypair available):
 *
 * 1. TP / SL / Trailing Stop  — auto-sell when conditions are hit.
 * 2. DCA (interval buying)    — real Jupiter buy on each scheduled interval.
 * 3. Dip buy                  — auto-buy when price drops dipPct% from entry.
 *
 * For Phantom / adapter wallets all auto-execution is skipped (cannot sign).
 * Returns null — no rendered UI.
 */

import { useEffect, useRef } from "react";
import { useTrading } from "@/context/TradingContext";
import { useOkoWallet } from "@/context/WalletContext";
import { useBalance } from "@/context/BalanceContext";
import { getKeypairDirect } from "@/lib/walletKeystore";
import { executeSwap } from "@/lib/swapExecutor";
import { recordSale, savePurchase } from "@/lib/portfolioData";
import { SOL_MINT } from "@/lib/jupiter";

const INTERVAL_MS          = 30_000;
const SELL_SLIPPAGE_BPS    = 150;  // 1.5%
const BUY_SLIPPAGE_BPS     = 100;  // 1.0%
const DEFAULT_SOL_PRICE    = 170;

async function fetchPrice(mint: string): Promise<number | null> {
  try {
    const res  = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    const json = await res.json() as Record<string, unknown>;
    const p    = (json?.data as Record<string, { price?: string }>)?.[mint]?.price;
    return p ? parseFloat(p) : null;
  } catch {
    return null;
  }
}

export default function PositionMonitor() {
  const {
    positions,
    removePosition,
    addPosition,
    addTrade,
    setPositionHighWater,
    markDipBought,
    dcaOrders,
    updateDCAOrder,
  } = useTrading();

  const { address, walletType } = useOkoWallet();
  const { solPrice, refresh: refreshBalance } = useBalance();

  const posRef      = useRef(positions);
  const dcaRef      = useRef(dcaOrders);
  const solRef      = useRef(solPrice);
  const addrRef     = useRef(address);
  const walletRef   = useRef(walletType);

  posRef.current    = positions;
  dcaRef.current    = dcaOrders;
  solRef.current    = solPrice;
  addrRef.current   = address;
  walletRef.current = walletType;

  // Prevent double-triggering
  const sellInFlight = useRef<Set<string>>(new Set());
  const buyInFlight  = useRef<Set<string>>(new Set());

  useEffect(() => {
    const tick = async () => {
      const addr    = addrRef.current;
      const wType   = walletRef.current;
      const solUsd  = solRef.current > 0 ? solRef.current : DEFAULT_SOL_PRICE;

      const isGenerated = wType === "generated" && !!addr;
      const keypair     = isGenerated ? getKeypairDirect(addr!) : null;

      // ──────────────────────────────────────────────────────────────
      // 1. TP / SL / Trailing Stop monitoring
      // ──────────────────────────────────────────────────────────────
      const watchedForSell = posRef.current.filter(
        (p) => p.amount > 0 && (p.tpPrice || p.slPrice || p.trailingPct),
      );

      for (const pos of watchedForSell) {
        if (sellInFlight.current.has(pos.id)) continue;

        const price = await fetchPrice(pos.mint);
        if (!price || price <= 0) continue;

        if (pos.trailingPct) setPositionHighWater(pos.mint, price);

        let sellReason: string | null = null;

        if (pos.tpPrice && price >= pos.tpPrice) {
          sellReason = `TP +${(((price - pos.entryPrice) / pos.entryPrice) * 100).toFixed(1)}%`;
        } else if (pos.slPrice && price <= pos.slPrice) {
          sellReason = `SL -${(((pos.entryPrice - price) / pos.entryPrice) * 100).toFixed(1)}%`;
        } else if (pos.trailingPct) {
          const hwm  = pos.highWaterMark ?? pos.entryPrice;
          const stop = hwm * (1 - pos.trailingPct / 100);
          if (price <= stop) {
            sellReason = `Трейлинг SL (порог $${stop.toFixed(6)})`;
          }
        }

        if (!sellReason) continue;
        sellInFlight.current.add(pos.id);
        console.log(`[Monitor] SELL ${pos.symbol}: ${sellReason}`);

        if (keypair && addr) {
          try {
            const usdValue = pos.amount * price;
            const pnlPct   = pos.entryPrice > 0
              ? ((price - pos.entryPrice) / pos.entryPrice) * 100
              : 0;

            const result = await executeSwap({
              userAddress:      addr,
              keypair,
              inputMint:        pos.mint,
              outputMint:       SOL_MINT,
              inputAmountUsd:   usdValue,
              inputTokenAmount: pos.amount,
              solPriceUsd:      solUsd,
              slippageBps:      SELL_SLIPPAGE_BPS,
              priorityMode:     "fast",
            });

            addTrade({
              timestamp: Date.now(), symbol: pos.symbol, mint: pos.mint,
              side: "SELL", amount: pos.amount, price,
              usdValue, fee: result.fee, pnlPct, txHash: result.txHash,
            });
            recordSale(pos.mint, pos.symbol, 1);
            removePosition(pos.id);
            refreshBalance();
            console.log(`[Monitor] ✓ Auto-sold ${pos.symbol}: ${result.txHash}`);
          } catch (e) {
            console.error(`[Monitor] Auto-sell failed for ${pos.symbol}:`, e);
            sellInFlight.current.delete(pos.id);
          }
        } else {
          console.log(`[Monitor] ${pos.symbol}: ${sellReason} — ручная продажа (адаптер-кошелёк)`);
          sellInFlight.current.delete(pos.id);
        }
      }

      // ──────────────────────────────────────────────────────────────
      // 2. DCA — interval buy execution
      // ──────────────────────────────────────────────────────────────
      const now      = Date.now();
      const dueDCA   = dcaRef.current.filter((o) => o.active && o.nextBuyAt <= now);

      for (const order of dueDCA) {
        const key = `dca-${order.id}`;
        if (buyInFlight.current.has(key)) continue;
        buyInFlight.current.add(key);

        const price = await fetchPrice(order.mint);
        if (!price || price <= 0) {
          buyInFlight.current.delete(key);
          continue;
        }

        console.log(`[Monitor] DCA ${order.symbol}: $${order.amountUsd}`);

        if (keypair && addr) {
          try {
            const result = await executeSwap({
              userAddress:    addr,
              keypair,
              inputMint:      SOL_MINT,
              outputMint:     order.mint,
              inputAmountUsd: order.amountUsd,
              solPriceUsd:    solUsd,
              slippageBps:    BUY_SLIPPAGE_BPS,
              priorityMode:   "normal",
            });

            const tokenQty = result.outAmountUi;
            savePurchase(order.mint, order.symbol, order.amountUsd);

            addPosition({
              symbol: order.symbol, mint: order.mint,
              entryPrice: price, currentPrice: price,
              amount: tokenQty, usdValue: order.amountUsd,
              openedAt: now,
            });

            addTrade({
              timestamp: now, symbol: order.symbol, mint: order.mint,
              side: "BUY", amount: tokenQty, price,
              usdValue: order.amountUsd, fee: result.fee, txHash: result.txHash,
            });

            updateDCAOrder(order.id, {
              totalSpent:   order.totalSpent + order.amountUsd,
              buysExecuted: order.buysExecuted + 1,
              nextBuyAt:    now + order.intervalMs,
            });

            refreshBalance();
            console.log(`[Monitor] ✓ DCA buy ${order.symbol}: ${result.txHash}`);
          } catch (e) {
            console.error(`[Monitor] DCA buy failed for ${order.symbol}:`, e);
          }
        } else {
          // Phantom / adapter: simulate the buy (update position state only)
          const tokenQty = price > 0 ? order.amountUsd / price : 0;

          addPosition({
            symbol: order.symbol, mint: order.mint,
            entryPrice: price, currentPrice: price,
            amount: tokenQty, usdValue: order.amountUsd,
            openedAt: now,
          });
          addTrade({
            timestamp: now, symbol: order.symbol, mint: order.mint,
            side: "BUY", amount: tokenQty, price,
            usdValue: order.amountUsd, fee: order.amountUsd * 0.002,
          });
          updateDCAOrder(order.id, {
            totalSpent:   order.totalSpent + order.amountUsd,
            buysExecuted: order.buysExecuted + 1,
            nextBuyAt:    now + order.intervalMs,
          });
        }

        buyInFlight.current.delete(key);
      }

      // ──────────────────────────────────────────────────────────────
      // 3. Dip buy monitoring
      // ──────────────────────────────────────────────────────────────
      const dipPositions = posRef.current.filter(
        (p) => p.dipPct && p.dipAmountUsd && !p.dipBought && p.amount > 0,
      );

      for (const pos of dipPositions) {
        const key = `dip-${pos.id}`;
        if (buyInFlight.current.has(key)) continue;

        const price = await fetchPrice(pos.mint);
        if (!price || price <= 0) continue;

        const dipThreshold = pos.entryPrice * (1 - (pos.dipPct! / 100));
        if (price > dipThreshold) continue;

        buyInFlight.current.add(key);
        const dipAmt = pos.dipAmountUsd!;
        console.log(`[Monitor] DIP ${pos.symbol}: ценa $${price} ≤ порог $${dipThreshold.toFixed(6)} → докупка $${dipAmt}`);

        if (keypair && addr) {
          try {
            const result = await executeSwap({
              userAddress:    addr,
              keypair,
              inputMint:      SOL_MINT,
              outputMint:     pos.mint,
              inputAmountUsd: dipAmt,
              solPriceUsd:    solUsd,
              slippageBps:    BUY_SLIPPAGE_BPS,
              priorityMode:   "normal",
            });

            const tokenQty = result.outAmountUi;
            savePurchase(pos.mint, pos.symbol, dipAmt);

            addPosition({
              symbol: pos.symbol, mint: pos.mint,
              entryPrice: price, currentPrice: price,
              amount: tokenQty, usdValue: dipAmt,
              openedAt: now,
            });
            addTrade({
              timestamp: now, symbol: pos.symbol, mint: pos.mint,
              side: "BUY", amount: tokenQty, price,
              usdValue: dipAmt, fee: result.fee, txHash: result.txHash,
            });

            markDipBought(pos.id);
            refreshBalance();
            console.log(`[Monitor] ✓ Dip buy ${pos.symbol}: ${result.txHash}`);
          } catch (e) {
            console.error(`[Monitor] Dip buy failed for ${pos.symbol}:`, e);
          }
        } else {
          // Phantom: simulate dip buy
          const tokenQty = price > 0 ? dipAmt / price : 0;
          savePurchase(pos.mint, pos.symbol, dipAmt);
          addPosition({
            symbol: pos.symbol, mint: pos.mint,
            entryPrice: price, currentPrice: price,
            amount: tokenQty, usdValue: dipAmt,
            openedAt: now,
          });
          addTrade({
            timestamp: now, symbol: pos.symbol, mint: pos.mint,
            side: "BUY", amount: tokenQty, price,
            usdValue: dipAmt, fee: dipAmt * 0.002,
          });
          markDipBought(pos.id);
        }

        buyInFlight.current.delete(key);
      }
    };

    tick();
    const id = setInterval(tick, INTERVAL_MS);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
