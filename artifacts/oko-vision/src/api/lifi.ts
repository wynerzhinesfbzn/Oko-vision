/**
 * LI.FI Aggregation API – cross-chain bridge & swap
 * Public endpoint: https://li.quest/v1  (no key required for quotes)
 */

const BASE = 'https://li.quest/v1';

export const LIFI_CHAINS: Record<string, number> = {
  ETHEREUM:  1,
  BSC:       56,
  POLYGON:   137,
  ARBITRUM:  42161,
  OPTIMISM:  10,
  BASE:      8453,
  AVALANCHE: 43114,
  ROBINHOOD: 4663,
  SOLANA:    1151111081099710,  // LI.FI uses this virtual ID for Solana
};

// Native token per chain (LI.FI convention)
const NATIVE: Record<string, string> = {
  '1':     '0x0000000000000000000000000000000000000000',
  '56':    '0x0000000000000000000000000000000000000000',
  '137':   '0x0000000000000000000000000000000000001010',
  '42161': '0x0000000000000000000000000000000000000000',
  '10':    '0x0000000000000000000000000000000000000000',
  '8453':  '0x0000000000000000000000000000000000000000',
  '43114': '0x0000000000000000000000000000000000000000',
  '4663':  '0x0000000000000000000000000000000000000000',
};

export function nativeToken(chainId: number | string) {
  return NATIVE[String(chainId)] ?? '0x0000000000000000000000000000000000000000';
}

export interface LifiQuoteResponse {
  id: string;
  type: string;
  estimate: {
    toAmount:           string;
    toAmountMin:        string;
    executionDuration:  number;   // seconds
    fromAmountUSD:      string;
    toAmountUSD:        string;
    feeCosts: {
      name:    string;
      amount:  string;
      amountUSD: string;
      token: { symbol: string; decimals: number };
    }[];
  };
  action: {
    fromToken: { symbol: string; decimals: number; address: string };
    toToken:   { symbol: string; decimals: number; address: string };
    fromChainId: number;
    toChainId:   number;
  };
  transactionRequest?: {
    to: string; data: string; value: string;
    gasLimit: string; gasPrice: string;
    chainId: number;
  };
}

// ── Get bridge/swap quote ────────────────────────────────────────────
export async function getLifiQuote(params: {
  fromChainId:      number;
  toChainId:        number;
  fromTokenAddress: string;
  toTokenAddress:   string;
  fromAmount:       string;  // in wei
  fromAddress:      string;
  slippage?:        number;
}): Promise<LifiQuoteResponse> {
  const p = new URLSearchParams({
    fromChainId:      String(params.fromChainId),
    toChainId:        String(params.toChainId),
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress:   params.toTokenAddress,
    fromAmount:       params.fromAmount,
    fromAddress:      params.fromAddress,
    slippage:         String(params.slippage ?? 0.005),
  });
  const res = await fetch(`${BASE}/quote?${p}`);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`LI.FI quote: ${res.status} – ${txt.slice(0, 200)}`);
  }
  return res.json() as Promise<LifiQuoteResponse>;
}

// ── Get available routes (multiple options) ──────────────────────────
export async function getLifiRoutes(params: {
  fromChainId: number; toChainId: number;
  fromTokenAddress: string; toTokenAddress: string;
  fromAmount: string; fromAddress: string;
}) {
  const p = new URLSearchParams({
    fromChainId:      String(params.fromChainId),
    toChainId:        String(params.toChainId),
    fromTokenAddress: params.fromTokenAddress,
    toTokenAddress:   params.toTokenAddress,
    fromAmount:       params.fromAmount,
    fromAddress:      params.fromAddress,
  });
  const res = await fetch(`${BASE}/routes?${p}`);
  if (!res.ok) throw new Error(`LI.FI routes: ${res.status}`);
  return res.json();
}

// ── Check tx status ──────────────────────────────────────────────────
export async function getLifiStatus(txHash: string, fromChainId: number, toChainId: number) {
  const p = new URLSearchParams({ txHash, fromChain: String(fromChainId), toChain: String(toChainId) });
  const res = await fetch(`${BASE}/status?${p}`);
  if (!res.ok) throw new Error(`LI.FI status: ${res.status}`);
  return res.json();
}
