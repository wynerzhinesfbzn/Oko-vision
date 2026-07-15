/**
 * OKO Trading Engine — Production Core
 *
 * Single source of truth for all 9 auto-trading strategies.
 * Provides:
 *  ─ Strategy definitions (exact filters, sizing, fee, SL/TP params)
 *  ─ Token-to-strategy matching
 *  ─ Position sizing
 *  ─ Dynamic priority fee (network congestion aware)
 *  ─ Pre-buy net-profit gate via Jupiter quote
 *  ─ Multi-source DexScreener scanning
 *  ─ Daily net P&L computation helpers
 */

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { TradeRecord } from "@/context/TradingContext";

// ── Strategy Definition ────────────────────────────────────────────────────────

export interface Strategy {
  id:          string;
  name:        string;
  description: string;
  emoji:       string;
  riskLevel:   "low" | "medium" | "high" | "very-high";

  // ── Token filters ──────────────────────────────────────────────────
  mcapMin:               number;   // minimum market cap USD
  mcapMax:               number;   // maximum market cap USD
  liquidityMin:          number;   // minimum pool liquidity USD
  volSpikeMin:           number;   // min vol1h/avgHourly ratio (0 = disabled)
  change1hMin:           number;   // min 1h price change % (momentum check)
  change1hMax:           number;   // max 1h price change %
  change24hMin:          number;   // min 24h change (use -Infinity for no limit)
  change24hMax:          number;   // max 24h change (use +Infinity for no limit)
  aiScoreMin:            number;   // min computed AI score 0–100
  requireBuyAiSignal:    boolean;  // must have computed signal === "BUY"
  dipRecovery:           boolean;  // special dip-recovery logic

  // ── Execution params ───────────────────────────────────────────────
  positionPct:           number;   // fraction of strategy balance per position (0.12 = 12%)
  maxPositions:          number;   // max concurrent open positions for this strategy
  slippageBps:           number;   // Jupiter swap slippage tolerance
  trailingPct:           number;   // trailing stop % (0 = disabled)
  slPct:                 number;   // hard stop-loss %
  tpPct:                 number;   // take-profit %

  // ── Fee config ─────────────────────────────────────────────────────
  basePriorityFeeSol:    number;   // base priority fee (SOL) at normal congestion
  maxPriorityFeeSol:     number;   // hard cap on priority fee

  // ── Profitability gate ─────────────────────────────────────────────
  minNetProfitPct:       number;   // reject trade if expected net at TP < this %
  maxPriceImpactPct:     number;   // reject trade if Jupiter price impact > this %
}

// ── All 9 Strategies ──────────────────────────────────────────────────────────

export const STRATEGIES: Strategy[] = [
  {
    id: "ultra-safe",
    name: "Ultra Safe Post-Migration",
    description: "Крупные стабильные токены после миграции. Минимальный риск.",
    emoji: "🛡️",
    riskLevel: "low",
    mcapMin: 800_000, mcapMax: 5_000_000,
    liquidityMin: 120_000,
    volSpikeMin: 0, change1hMin: 0, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 65, requireBuyAiSignal: true, dipRecovery: false,
    positionPct: 0.20, maxPositions: 3,
    slippageBps: 50, trailingPct: 10, slPct: 8, tpPct: 35,
    basePriorityFeeSol: 0.0001, maxPriorityFeeSol: 0.001,
    minNetProfitPct: 8, maxPriceImpactPct: 1.0,
  },
  {
    id: "safe-migration",
    name: "Safe Migration Hold",
    description: "Токены в фазе стабилизации. Очень консервативная.",
    emoji: "🔒",
    riskLevel: "low",
    mcapMin: 450_000, mcapMax: 1_800_000,
    liquidityMin: 55_000,
    volSpikeMin: 0, change1hMin: 0, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 65, requireBuyAiSignal: true, dipRecovery: false,
    positionPct: 0.15, maxPositions: 4,
    slippageBps: 75, trailingPct: 8, slPct: 10, tpPct: 40,
    basePriorityFeeSol: 0.0001, maxPriorityFeeSol: 0.001,
    minNetProfitPct: 10, maxPriceImpactPct: 1.5,
  },
  {
    id: "balanced",
    name: "Balanced Alpha Filter",
    description: "Золотая середина: объём + импульс + ликвидность.",
    emoji: "⚖️",
    riskLevel: "medium",
    mcapMin: 150_000, mcapMax: 500_000,
    liquidityMin: 20_000,
    volSpikeMin: 1.2, change1hMin: 3, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 56, requireBuyAiSignal: true, dipRecovery: false,
    positionPct: 0.12, maxPositions: 4,
    slippageBps: 100, trailingPct: 6, slPct: 12, tpPct: 50,
    basePriorityFeeSol: 0.0005, maxPriorityFeeSol: 0.003,
    minNetProfitPct: 12, maxPriceImpactPct: 2.0,
  },
  {
    id: "early-migration",
    name: "Early Migration Alpha v6",
    description: "Ранний вход в миграцию. Основная рабочая стратегия.",
    emoji: "🚀",
    riskLevel: "medium",
    mcapMin: 100_000, mcapMax: 350_000,
    liquidityMin: 15_000,
    volSpikeMin: 1.3, change1hMin: 5, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 56, requireBuyAiSignal: true, dipRecovery: false,
    positionPct: 0.10, maxPositions: 5,
    slippageBps: 100, trailingPct: 5, slPct: 15, tpPct: 60,
    basePriorityFeeSol: 0.001, maxPriorityFeeSol: 0.005,
    minNetProfitPct: 12, maxPriceImpactPct: 2.5,
  },
  {
    id: "volume-spike",
    name: "Volume Spike Sniper",
    description: "Ловит взрывной объём на малых капах. Агрессивная.",
    emoji: "⚡",
    riskLevel: "high",
    mcapMin: 50_000, mcapMax: 300_000,
    liquidityMin: 12_000,
    volSpikeMin: 2.0, change1hMin: 8, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 58, requireBuyAiSignal: false, dipRecovery: false,
    positionPct: 0.06, maxPositions: 5,
    slippageBps: 150, trailingPct: 4, slPct: 18, tpPct: 80,
    basePriorityFeeSol: 0.002, maxPriorityFeeSol: 0.008,
    minNetProfitPct: 15, maxPriceImpactPct: 3.0,
  },
  {
    id: "degen",
    name: "Degen Launch Hunter",
    description: "Новые запуски с максимальным объёмом. Очень высокий риск.",
    emoji: "🎰",
    riskLevel: "very-high",
    mcapMin: 20_000, mcapMax: 180_000,
    liquidityMin: 5_000,
    volSpikeMin: 2.0, change1hMin: 10, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 52, requireBuyAiSignal: false, dipRecovery: false,
    positionPct: 0.03, maxPositions: 6,
    slippageBps: 200, trailingPct: 3, slPct: 20, tpPct: 120,
    basePriorityFeeSol: 0.005, maxPriorityFeeSol: 0.01,
    minNetProfitPct: 20, maxPriceImpactPct: 4.0,
  },
  {
    id: "smart-money",
    name: "Smart Money Follower",
    description: "Следует за умными деньгами. Высокий AI-score обязателен.",
    emoji: "🧠",
    riskLevel: "medium",
    mcapMin: 150_000, mcapMax: 600_000,
    liquidityMin: 30_000,
    volSpikeMin: 0, change1hMin: 0, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 75, requireBuyAiSignal: true, dipRecovery: false,
    positionPct: 0.08, maxPositions: 4,
    slippageBps: 100, trailingPct: 0, slPct: 12, tpPct: 45,
    basePriorityFeeSol: 0.002, maxPriorityFeeSol: 0.005,
    minNetProfitPct: 12, maxPriceImpactPct: 2.0,
  },
  {
    id: "hype",
    name: "Hype Momentum",
    description: "Ловит хайп и сильный ценовой импульс.",
    emoji: "🔥",
    riskLevel: "high",
    mcapMin: 50_000, mcapMax: 450_000,
    liquidityMin: 8_000,
    volSpikeMin: 0, change1hMin: 8, change1hMax: 1_000,
    change24hMin: -100, change24hMax: 1_000,
    aiScoreMin: 58, requireBuyAiSignal: false, dipRecovery: false,
    positionPct: 0.07, maxPositions: 5,
    slippageBps: 150, trailingPct: 0, slPct: 15, tpPct: 60,
    basePriorityFeeSol: 0.002, maxPriorityFeeSol: 0.008,
    minNetProfitPct: 15, maxPriceImpactPct: 3.0,
  },
  {
    id: "dip-recovery",
    name: "Dip Recovery Hunter",
    description: "Покупает на сильном падении и ловит отскок.",
    emoji: "📉",
    riskLevel: "high",
    mcapMin: 120_000, mcapMax: 450_000,
    liquidityMin: 10_000,
    volSpikeMin: 0, change1hMin: 5, change1hMax: 1_000,
    change24hMin: -90, change24hMax: -25,   // must have dropped 25–90%
    aiScoreMin: 55, requireBuyAiSignal: false, dipRecovery: true,
    positionPct: 0.09, maxPositions: 3,
    slippageBps: 100, trailingPct: 0, slPct: 15, tpPct: 55,
    basePriorityFeeSol: 0.002, maxPriorityFeeSol: 0.005,
    minNetProfitPct: 10, maxPriceImpactPct: 2.5,
  },
];

export function getStrategyById(id: string): Strategy | undefined {
  return STRATEGIES.find((s) => s.id === id);
}

// ── Scan Result Type ──────────────────────────────────────────────────────────

export interface ScanResult {
  mint:               string;
  symbol:             string;
  name:               string;
  imageUrl:           string;
  poolAddress:        string;
  price:              number;
  marketCap:          number;
  liquidity:          number;
  volume24h:          number;
  volume1h:           number;
  volSpikeMultiplier: number;
  change5m:           number;
  change1h:           number;
  change24h:          number;
  aiScore:            number;
  aiSignal:           "BUY" | "SELL" | "HOLD";
  dexScreenerUrl:     string;
}

/** Compute AI score + signal from price action + volume */
function computeAiSignal(t: {
  change5m: number;
  change1h: number;
  change24h: number;
  volSpikeMultiplier: number;
}): { signal: "BUY" | "SELL" | "HOLD"; score: number } {
  let score = 50;
  // 1h change — strongest signal
  if      (t.change1h > 8)  score += 18;
  else if (t.change1h > 3)  score += 10;
  else if (t.change1h > 1)  score +=  5;
  else if (t.change1h < -5) score -= 18;
  else if (t.change1h < -2) score -= 10;
  // 24h trend
  if      (t.change24h > 20) score += 10;
  else if (t.change24h > 8)  score +=  5;
  else if (t.change24h < -20) score -= 10;
  else if (t.change24h < -8)  score -=  5;
  // 5m momentum
  if      (t.change5m > 2)  score +=  8;
  else if (t.change5m < -2) score -=  8;
  // Volume spike
  if      (t.volSpikeMultiplier > 5) score += 18;
  else if (t.volSpikeMultiplier > 3) score += 12;
  else if (t.volSpikeMultiplier > 2) score +=  6;

  score = Math.max(0, Math.min(100, score));
  const signal: "BUY" | "SELL" | "HOLD" =
    score >= 62 ? "BUY" : score <= 38 ? "SELL" : "HOLD";
  return { signal, score };
}

/**
 * Fetch enriched scan results from the server-side proxy.
 *
 * type="all"  → 12+ parallel DexScreener sources, 150+ unique Solana tokens (default)
 * type="boosted" / "latest" → single-source fallback (legacy)
 *
 * Falls back to DexScreener direct (token-boosts) if the proxy is unavailable.
 */
export async function fetchScanResults(type: "all" | "boosted" | "latest" = "all"): Promise<ScanResult[]> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  let rawPairs: any[] = [];

  // ── Try server proxy first (no CORS, multi-source) ────────────────────────
  try {
    const res = await fetch(`${origin}/api/scan?chain=solana&type=${type}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const data = await res.json();
      rawPairs = data.pairs ?? [];
      if (rawPairs.length > 0) {
        console.log(`[TradingEngine] fetchScanResults(${type}): ${rawPairs.length} токенов от proxy`);
      }
    }
  } catch { /* fall through to direct */ }

  // ── Fallback: direct DexScreener if proxy returned nothing ────────────────
  if (rawPairs.length === 0) {
    console.warn("[TradingEngine] Proxy вернул 0 токенов — пробую DexScreener напрямую");
    try {
      // Parallel: top boosts + latest boosts + latest profiles
      const [topBoostRes, latestBoostRes] = await Promise.allSettled([
        fetch("https://api.dexscreener.com/token-boosts/top/v1",    { signal: AbortSignal.timeout(8_000) }),
        fetch("https://api.dexscreener.com/token-boosts/latest/v1", { signal: AbortSignal.timeout(8_000) }),
      ]);

      const allAddrs = new Set<string>();
      for (const r of [topBoostRes, latestBoostRes]) {
        if (r.status !== "fulfilled" || !r.value.ok) continue;
        const items: any[] = await r.value.json();
        items.filter((b) => b.chainId === "solana").slice(0, 40)
          .forEach((b) => allAddrs.add(b.tokenAddress));
      }

      if (allAddrs.size > 0) {
        const addrs = [...allAddrs].join(",");
        const pairRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${addrs}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (pairRes.ok) {
          const pj = await pairRes.json();
          const seenMint = new Set<string>();
          for (const p of (pj.pairs ?? []).filter((pp: any) => pp.chainId === "solana")) {
            const mint = p.baseToken?.address;
            if (!mint || seenMint.has(mint)) continue;
            seenMint.add(mint);
            const vol24h = Number(p.volume?.h24 ?? 0);
            const vol1h  = Number(p.volume?.h1  ?? 0);
            const avg    = vol24h > 0 ? vol24h / 24 : 0;
            rawPairs.push({
              mint,
              symbol:             p.baseToken?.symbol ?? "?",
              name:               p.baseToken?.name   ?? "?",
              imageUrl:           p.info?.imageUrl     ?? "",
              poolAddress:        p.pairAddress        ?? "",
              price:              parseFloat(p.priceUsd ?? "0") || 0,
              marketCap:          p.marketCap ?? p.fdv ?? null,
              liquidity:          Number(p.liquidity?.usd ?? 0),
              volume24h:          vol24h,
              volume1h:           vol1h,
              volSpikeMultiplier: avg > 0 ? vol1h / avg : 0,
              change5m:  Number(p.priceChange?.m5  ?? 0),
              change1h:  Number(p.priceChange?.h1  ?? 0),
              change24h: Number(p.priceChange?.h24 ?? 0),
              dexScreenerUrl: p.url ?? "",
            });
          }
          console.log(`[TradingEngine] Fallback DexScreener: ${rawPairs.length} токенов`);
        }
      }
    } catch (e: any) {
      console.warn("[TradingEngine] DexScreener fallback failed:", e.message);
    }
  }

  return rawPairs
    .filter((p: any) => p.mint && p.price > 0 && p.liquidity > 0)
    .map((p: any): ScanResult => {
      const { signal, score } = computeAiSignal({
        change5m:           Number(p.change5m           ?? 0),
        change1h:           Number(p.change1h           ?? 0),
        change24h:          Number(p.change24h          ?? 0),
        volSpikeMultiplier: Number(p.volSpikeMultiplier ?? 0),
      });
      return {
        mint:               p.mint,
        symbol:             p.symbol ?? "?",
        name:               p.name   ?? "?",
        imageUrl:           p.imageUrl ?? "",
        poolAddress:        p.poolAddress ?? "",
        price:              Number(p.price),
        marketCap:          Number(p.marketCap ?? 0),
        liquidity:          Number(p.liquidity),
        volume24h:          Number(p.volume24h  ?? 0),
        volume1h:           Number(p.volume1h   ?? 0),
        volSpikeMultiplier: Number(p.volSpikeMultiplier ?? 0),
        change5m:           Number(p.change5m   ?? 0),
        change1h:           Number(p.change1h   ?? 0),
        change24h:          Number(p.change24h  ?? 0),
        aiScore:            score,
        aiSignal:           signal,
        dexScreenerUrl:     p.dexScreenerUrl ?? "",
      };
    });
}

// ── Token Filter ──────────────────────────────────────────────────────────────

/**
 * Returns true if the token passes all of the strategy's filter criteria.
 * Call this BEFORE position-size or profitability checks.
 */
export function tokenMatchesStrategy(token: ScanResult, strategy: Strategy): boolean {
  // Market cap range
  const mcap = token.marketCap;
  if (mcap <= 0 || mcap < strategy.mcapMin || mcap > strategy.mcapMax) return false;

  // Minimum liquidity
  if (token.liquidity < strategy.liquidityMin) return false;

  // Volume spike ratio
  if (strategy.volSpikeMin > 0 && token.volSpikeMultiplier < strategy.volSpikeMin) return false;

  // 1h price change (momentum direction)
  if (token.change1h < strategy.change1hMin) return false;
  if (token.change1h > strategy.change1hMax) return false;

  // 24h price change band
  if (token.change24h < strategy.change24hMin) return false;
  if (token.change24h > strategy.change24hMax) return false;

  // AI score threshold
  if (token.aiScore < strategy.aiScoreMin) return false;

  // Require BUY signal for conservative strategies
  if (strategy.requireBuyAiSignal && token.aiSignal !== "BUY") return false;

  return true;
}

/** Score a token for a given strategy (higher = better candidate to buy). */
export function scoreTokenForStrategy(token: ScanResult, strategy: Strategy): number {
  let score = token.aiScore;

  // Bonus for strong volume spike
  score += Math.min(20, token.volSpikeMultiplier * 2);

  // Bonus for 1h momentum
  score += Math.min(10, token.change1h * 0.3);

  // Penalty for very high price impact (proxy: thin liquidity relative to volume)
  const liquidityRatio = token.volume1h > 0 ? token.liquidity / token.volume1h : 10;
  if (liquidityRatio < 0.5) score -= 10; // very thin — high slippage risk

  // Dip recovery: extra weight for strong 1h recovery
  if (strategy.dipRecovery) score += Math.min(15, token.change1h * 1.5);

  return score;
}

// ── Position Sizing ───────────────────────────────────────────────────────────

/**
 * Calculate USD amount to use for a single position.
 *
 * Logic:
 *  - Divide wallet balance equally among enabled strategies
 *  - Each strategy uses positionPct of its allocation per trade
 *  - Minimum $2, capped at strategy.positionPct * total wallet
 */
export function calcPositionSizeUsd(
  strategy: Strategy,
  walletBalanceSol: number,
  solPriceUsd: number,
  enabledStrategiesCount: number,
): number {
  const totalWalletUsd = walletBalanceSol * solPriceUsd;
  // Allocate balance equally across all enabled strategies
  const strategyAllocUsd = totalWalletUsd / Math.max(1, enabledStrategiesCount);
  // Position = positionPct of that allocation
  const raw = strategyAllocUsd * strategy.positionPct;
  return Math.max(2, Math.round(raw * 100) / 100);
}

// ── Dynamic Priority Fee ──────────────────────────────────────────────────────

/**
 * Fetch the current Solana network congestion level (0.0 – 1.0).
 * Congestion = share of recent slots that paid a non-zero priority fee.
 */
export async function fetchNetworkCongestion(): Promise<number> {
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${origin}/api/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getRecentPrioritizationFees", params: [] }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return 0.35;
    const data = await res.json();
    const fees: { prioritizationFee: number }[] = data.result ?? [];
    if (!fees.length) return 0.2;
    const nonZero = fees.filter((f) => f.prioritizationFee > 0);
    return nonZero.length / fees.length;
  } catch {
    return 0.35; // assume moderate on failure
  }
}

/**
 * Compute dynamic priority fee in SOL.
 *
 * Tiers vs. congestion:
 *  < 20% idle      → base × 0.7
 *  20–40% light    → base × 1.0
 *  40–60% moderate → base × 1.8
 *  60–80% busy     → base × 3.0
 *  > 80% congested → base × 5.0  (capped at strategy.maxPriorityFeeSol)
 */
export function calcDynamicPriorityFee(strategy: Strategy, congestion: number): number {
  let multiplier: number;
  if      (congestion < 0.20) multiplier = 0.7;
  else if (congestion < 0.40) multiplier = 1.0;
  else if (congestion < 0.60) multiplier = 1.8;
  else if (congestion < 0.80) multiplier = 3.0;
  else                        multiplier = 5.0;

  const fee = strategy.basePriorityFeeSol * multiplier;
  return Math.min(fee, strategy.maxPriorityFeeSol);
}

// ── Pre-buy Net Profit Gate ───────────────────────────────────────────────────

export interface NetProfitGateResult {
  ok:              boolean;
  reason?:         string;
  priceImpactPct:  number;
  totalCostPct:    number;
  expectedNetPct:  number;
}

/**
 * Fetch a Jupiter quote and compute expected net P&L.
 * Rejects the trade if:
 *  1. Price impact > strategy.maxPriceImpactPct
 *  2. Expected net profit at TP < strategy.minNetProfitPct
 *
 * Round-trip cost estimate:
 *  priceImpact + buySlippage + platformFee(buy+sell) + exitSlippage + priorityFeeAsPercent
 */
export async function checkNetProfitBeforeBuy(params: {
  inputMint:      string;
  outputMint:     string;
  inputAmountUsd: number;
  solPriceUsd:    number;
  strategy:       Strategy;
  priorityFeeSol: number;
}): Promise<NetProfitGateResult> {
  const { strategy, inputAmountUsd, solPriceUsd, priorityFeeSol } = params;

  try {
    const solAmount    = inputAmountUsd / solPriceUsd;
    const inputLamports = Math.round(solAmount * LAMPORTS_PER_SOL);

    if (inputLamports < 10_000) {
      return { ok: false, reason: "Сумма слишком мала для получения котировки", priceImpactPct: 0, totalCostPct: 0, expectedNetPct: 0 };
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const qp = new URLSearchParams({
      inputMint:   params.inputMint,
      outputMint:  params.outputMint,
      amount:      String(inputLamports),
      slippageBps: String(strategy.slippageBps),
    });

    const res = await fetch(`${origin}/api/jupiter/quote?${qp}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      // Can't check — proceed with caution (don't block the trade)
      console.warn("[TradingEngine] Jupiter quote unavailable for net-profit check, proceeding");
      return { ok: true, priceImpactPct: 0, totalCostPct: 0, expectedNetPct: strategy.tpPct };
    }

    const quote = await res.json();
    if (quote.error) {
      console.warn("[TradingEngine] Jupiter quote error:", quote.error);
      return { ok: true, priceImpactPct: 0, totalCostPct: 0, expectedNetPct: strategy.tpPct };
    }

    // Price impact from Jupiter (as decimal, e.g. "0.0012" = 0.12%)
    const priceImpactPct = Math.abs(parseFloat(quote.priceImpactPct ?? "0")) * 100;

    // Build round-trip cost model
    const buySlippagePct  = strategy.slippageBps / 100;  // worst-case slippage
    const platformFeePct  = 2.0;                          // 1% buy + 1% sell
    const exitSlippagePct = buySlippagePct * 0.5;         // assume exit is calmer
    const priorityFeePct  = inputAmountUsd > 0
      ? (priorityFeeSol * solPriceUsd / inputAmountUsd) * 100
      : 0;

    const totalCostPct  = priceImpactPct + buySlippagePct + platformFeePct + exitSlippagePct + priorityFeePct;
    const expectedNetPct = strategy.tpPct - totalCostPct;

    if (priceImpactPct > strategy.maxPriceImpactPct) {
      return {
        ok: false,
        reason: `Влияние на цену ${priceImpactPct.toFixed(2)}% > лимит ${strategy.maxPriceImpactPct}% (нет ликвидности)`,
        priceImpactPct, totalCostPct, expectedNetPct,
      };
    }

    if (expectedNetPct < strategy.minNetProfitPct) {
      return {
        ok: false,
        reason: `Net-прибыль при TP: ${expectedNetPct.toFixed(1)}% < мин. ${strategy.minNetProfitPct}% (комиссии: ${totalCostPct.toFixed(1)}%)`,
        priceImpactPct, totalCostPct, expectedNetPct,
      };
    }

    return { ok: true, priceImpactPct, totalCostPct, expectedNetPct };
  } catch (e: any) {
    // Network error in profit check → don't block the trade
    console.warn("[TradingEngine] Net-profit check exception:", e.message);
    return { ok: true, priceImpactPct: 0, totalCostPct: 0, expectedNetPct: strategy.tpPct };
  }
}

// ── Daily Stats Helpers ────────────────────────────────────────────────────────

/** Compute today's net P&L USD from closed SELL trades in history. */
export function computeDailyNetPnlUsd(tradeHistory: TradeRecord[]): number {
  const todayMs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  return tradeHistory
    .filter((t) => t.side === "SELL" && t.timestamp >= todayMs)
    .reduce((sum, t) => {
      // pnlUsd if set directly, otherwise estimate from pnlPct
      const pnlUsd =
        (t as any).pnlUsd != null
          ? (t as any).pnlUsd
          : ((t.pnlPct ?? 0) / 100) * t.usdValue;
      return sum + pnlUsd;
    }, 0);
}

/** Compute today's total BUY volume in USD. */
export function computeDailyBuyVolumeUsd(tradeHistory: TradeRecord[]): number {
  const todayMs = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();
  return tradeHistory
    .filter((t) => t.side === "BUY" && t.timestamp >= todayMs)
    .reduce((sum, t) => sum + t.usdValue, 0);
}

// ── Auto Profit Lock Thresholds ───────────────────────────────────────────────

/** Compute the profit-locked SL price based on current gain.
 *
 * Rules:
 *  Position +50%  → move SL to +2%  (breakeven+)
 *  Position +100% → move SL to +50%
 *  Position +200% → move SL to +100%
 *
 * Returns null if no lock should be applied (position hasn't reached a threshold).
 */
export function computeProfitLockSlPrice(
  entryPrice: number,
  currentPrice: number,
  currentSl: number | undefined,
): number | null {
  if (!entryPrice || !currentPrice) return null;
  const gainPct = ((currentPrice - entryPrice) / entryPrice) * 100;

  let lockedSlMultiplier: number | null = null;
  if      (gainPct >= 200) lockedSlMultiplier = 1 + 100 / 100;  // +100%
  else if (gainPct >= 100) lockedSlMultiplier = 1 + 50  / 100;  // +50%
  else if (gainPct >= 50)  lockedSlMultiplier = 1 + 2   / 100;  // +2% (breakeven)

  if (lockedSlMultiplier === null) return null;

  const lockedSl = entryPrice * lockedSlMultiplier;
  // Only move SL up, never down
  if (currentSl != null && lockedSl <= currentSl) return null;
  return lockedSl;
}
