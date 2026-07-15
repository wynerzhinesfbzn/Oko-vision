// Jupiter V6 API + Trigger Orders
// Platform fee: 1% = 100 bps on every trade

export const PLATFORM_FEE_BPS = 100; // 1%
export const PLATFORM_FEE_ACCOUNT = "Hk5GnVcjCwMEauaapH18p5ZSPDekUjScBZ8G8gGuzksC";

export const JUPITER_BASE      = "https://lite-api.jup.ag/swap/v1";  // quote-api.jup.ag DNS may fail in some networks
export const TRIGGER_BASE      = "https://api.jup.ag/trigger/v1";

export const SOL_MINT  = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: "ExactIn" | "ExactOut";
  slippageBps: number;
  platformFee: { amount: string; feeBps: number } | null;
  priceImpactPct: string;
  routePlan: RouteStep[];
  contextSlot: number;
  timeTaken: number;
  // computed
  netOutAmount?: number;
  netProfitPct?: number;
}

export interface RouteStep {
  swapInfo: {
    ammKey: string;
    label: string;
    inputMint: string;
    outputMint: string;
    inAmount: string;
    outAmount: string;
    feeAmount: string;
    feeMint: string;
  };
  percent: number;
}

export interface TriggerOrderParams {
  userPublicKey: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;    // input amount in lamports/base units
  takingAmount: string;    // output amount in lamports/base units
  expiredAt?: number;      // unix timestamp, optional
}

export interface TriggerOrderResult {
  order: string;           // order address
  transaction: string;     // base64 encoded transaction
}

/** Get a swap quote from Jupiter V6 with 1% platform fee.
 *  Tries server-side proxy first (avoids VPN/CORS blocks), then falls back to direct call. */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,          // in smallest units (lamports, token base units)
  slippageBps = 50,
): Promise<JupiterQuote> {
  const isSell = outputMint === SOL_MINT;
  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(Math.round(amount)),
    slippageBps: String(slippageBps),
    onlyDirectRoutes: "false",
    asLegacyTransaction: "false",
    // For sells (token→SOL) Jupiter can collect the fee directly from SOL output.
    // For buys (SOL→token) the fee account would need an ATA for every token —
    // impractical, so we collect it via a separate SOL transfer instead.
    ...(isSell ? { platformFeeBps: String(PLATFORM_FEE_BPS) } : {}),
  });

  // Try server proxy first, then direct
  const endpoints: Array<() => Promise<Response>> = [
    () => fetch(`${window.location.origin}/api/jupiter/quote?${params}`),
    () => fetch(`${JUPITER_BASE}/quote?${params}`),
  ];

  let lastErr: Error | null = null;
  for (const ep of endpoints) {
    try {
      const res = await ep();
      if (!res.ok) { lastErr = new Error(`Jupiter quote HTTP ${res.status}`); continue; }
      const data: JupiterQuote = await res.json();
      if ((data as any).error) { lastErr = new Error(String((data as any).error)); continue; }
      // Compute net output after platform fee
      const raw    = parseInt(data.outAmount, 10);
      const feeAmt = data.platformFee ? parseInt(data.platformFee.amount, 10) : 0;
      data.netOutAmount = raw - feeAmt;
      return data;
    } catch (e) { lastErr = e as Error; }
  }
  throw lastErr ?? new Error("Jupiter quote failed");
}

/** Get swap transaction from Jupiter V6.
 *  Tries server-side proxy first, then falls back to direct call. */
export async function getSwapTransaction(
  quote: JupiterQuote,
  userPublicKey: string,
  priorityFeeSol?: number,   // optional override; undefined = "auto"
): Promise<{ swapTransaction: string }> {
  const prioritizationFeeLamports = priorityFeeSol != null
    ? Math.round(priorityFeeSol * 1_000_000_000) // SOL → lamports
    : "auto";

  // For sells (token → SOL): Jupiter collects 1% fee from SOL output directly.
  // This works for ALL wallet types (generated keypair AND Phantom/adapter).
  // For buys (SOL → token): fee account needs per-token ATA — handled separately in swapExecutor.
  const isSell = quote.outputMint === SOL_MINT;

  const body: Record<string, unknown> = {
    quoteResponse: quote,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicComputeUnitLimit: true,
    prioritizationFeeLamports,
    ...(isSell ? { feeAccount: PLATFORM_FEE_ACCOUNT } : {}),
  };

  // Try server proxy first, then direct
  const endpoints: Array<() => Promise<Response>> = [
    () => fetch(`${window.location.origin}/api/jupiter/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    () => fetch(`${JUPITER_BASE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  ];

  let lastErr: Error | null = null;
  for (const ep of endpoints) {
    try {
      const res = await ep();
      if (!res.ok) { lastErr = new Error(`Jupiter swap HTTP ${res.status}`); continue; }
      const data = await res.json();
      if ((data as any).error) { lastErr = new Error(String((data as any).error)); continue; }
      return data as { swapTransaction: string };
    } catch (e) { lastErr = e as Error; }
  }
  throw lastErr ?? new Error("Jupiter swap failed");
}

/** Create a Jupiter Trigger Order (SL/TP / limit order) */
export async function createTriggerOrder(
  params: TriggerOrderParams,
): Promise<TriggerOrderResult> {
  const res = await fetch(`${TRIGGER_BASE}/createOrder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Trigger order error: ${res.status}`);
  return res.json();
}

/** Cancel a Jupiter Trigger Order */
export async function cancelTriggerOrder(
  userPublicKey: string,
  order: string,
): Promise<{ transaction: string }> {
  const res = await fetch(`${TRIGGER_BASE}/cancelOrder`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userPublicKey, order }),
  });
  if (!res.ok) throw new Error(`Cancel order error: ${res.status}`);
  return res.json();
}

/** Get open trigger orders for a user */
export async function getTriggerOrders(
  userPublicKey: string,
): Promise<{ orders: TriggerOrder[] }> {
  const res = await fetch(`${TRIGGER_BASE}/openOrders?user=${userPublicKey}`);
  if (!res.ok) throw new Error(`Get orders error: ${res.status}`);
  return res.json();
}

export interface TriggerOrder {
  orderKey: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  borrowMakingAmount: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  expiredAt: string | null;
  oriMakingAmount: string;
  oriTakingAmount: string;
  uniqueId: string;
}

/**
 * Check if a trade is profitable after all fees.
 * Returns true if net profit > minProfitPct (default 10%)
 */
export function checkProfitability(
  quote: JupiterQuote,
  entryPrice: number,
  currentPrice: number,
  minProfitPct = 10,
): { profitable: boolean; netPct: number; breakdown: ProfitBreakdown } {
  const priceChangePct  = ((currentPrice - entryPrice) / entryPrice) * 100;
  const platformFeePct  = PLATFORM_FEE_BPS / 100;           // 1%
  const networkFeeEst   = 0.1;                               // estimated ~0.1% in Solana fees
  const slippageEst     = parseFloat(quote.priceImpactPct ?? "0") * 100;
  const totalCostPct    = platformFeePct + networkFeeEst + slippageEst;
  const netPct          = priceChangePct - totalCostPct;

  return {
    profitable: netPct >= minProfitPct,
    netPct,
    breakdown: {
      priceChangePct,
      platformFeePct,
      networkFeeEst,
      slippageEst,
      totalCostPct,
    },
  };
}

export interface ProfitBreakdown {
  priceChangePct: number;
  platformFeePct: number;
  networkFeeEst: number;
  slippageEst: number;
  totalCostPct: number;
}

/** Format a token amount from base units */
export function fromLamports(amount: string | number, decimals = 9): number {
  return Number(amount) / Math.pow(10, decimals);
}

/** Convert UI amount to base units */
export function toLamports(amount: number, decimals = 9): number {
  return Math.round(amount * Math.pow(10, decimals));
}

export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
export const USDS_MINT = "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA";
export const WETH_MINT = "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs";

/** Common Solana token list (for display purposes) */
export const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number; logoURI?: string }> = {
  [SOL_MINT]:  { symbol: "SOL",  name: "Solana",           decimals: 9,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png" },
  [USDC_MINT]: { symbol: "USDC", name: "USD Coin",          decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
  [USDT_MINT]: { symbol: "USDT", name: "Tether USD",        decimals: 6,  logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png" },
  [USDS_MINT]: { symbol: "USDS", name: "Sky USD (USDS)",    decimals: 6,  logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdC035D45d973E3EC169d2276DDab16f1e407384F/logo.png" },
  [WETH_MINT]: { symbol: "wETH", name: "Wrapped Ether (Wormhole)", decimals: 8, logoURI: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png" },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So":  { symbol: "mSOL", name: "Marinade staked SOL", decimals: 9 },
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": { symbol: "stSOL", name: "Lido Staked SOL",    decimals: 9 },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK", name: "Bonk",                decimals: 5 },
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": { symbol: "WIF",  name: "dogwifhat",           decimals: 6 },
};

/** Popular stablecoins and quote tokens available as BUY currency via Jupiter */
export const QUOTE_TOKENS = [
  { mint: SOL_MINT,  symbol: "SOL",  name: "Solana",   decimals: 9 },
  { mint: USDC_MINT, symbol: "USDC", name: "USD Coin",  decimals: 6 },
  { mint: USDT_MINT, symbol: "USDT", name: "Tether",    decimals: 6 },
  { mint: USDS_MINT, symbol: "USDS", name: "Sky USD",   decimals: 6 },
  { mint: WETH_MINT, symbol: "wETH", name: "Wrapped ETH", decimals: 8 },
];
