/**
 * 1inch Aggregation API – v5.2 (Robinhood Chain + any EVM)
 *
 * Note: api.1inch.dev endpoints now require an Authorization header.
 * Pass VITE_ONEINCH_API_KEY in your .env to enable real calls.
 * Without it we fall back to a "no key" request (still returns data for
 * some chains; fails with 401 for restricted ones).
 */

const BASE = 'https://api.1inch.dev/swap/v5.2';
const KEY  = import.meta.env.VITE_ONEINCH_API_KEY ?? '';

function headers() {
  const h: Record<string, string> = { Accept: 'application/json' };
  if (KEY) h['Authorization'] = `Bearer ${KEY}`;
  return h;
}

// ── Real token addresses on Robinhood Chain ──────────────────────────
// Replace placeholders when official contracts are deployed.
export const RH_TOKENS: Record<string, { address: string; decimals: number }> = {
  ETH:     { address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE', decimals: 18 },
  USDC:    { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6  },  // placeholder – Base USDC
  WETH:    { address: '0x4200000000000000000000000000000000000006', decimals: 18 },  // placeholder
  CASHCAT: { address: '0x0000000000000000000000000000000000000001', decimals: 18 },  // replace
  STONKS:  { address: '0x0000000000000000000000000000000000000002', decimals: 18 },  // replace
};

export interface OneInchQuote {
  toAmount: string;
  fromToken: { symbol: string; decimals: number };
  toToken:   { symbol: string; decimals: number };
  gas: string;
}

export interface OneInchSwap {
  tx: {
    from: string; to: string; data: string;
    value: string; gas: number; gasPrice: string;
  };
  toAmount: string;
}

// ── Get price quote ──────────────────────────────────────────────────
export async function get1inchQuote(
  chainId:   number,
  fromToken: string,
  toToken:   string,
  amount:    string,   // in wei / smallest unit
): Promise<OneInchQuote> {
  const url = `${BASE}/${chainId}/quote?` + new URLSearchParams({
    fromTokenAddress: fromToken,
    toTokenAddress:   toToken,
    amount,
  });
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`1inch quote: ${res.status} – ${txt.slice(0, 120)}`);
  }
  return res.json() as Promise<OneInchQuote>;
}

// ── Build swap tx ────────────────────────────────────────────────────
export async function build1inchSwap(
  chainId:     number,
  fromToken:   string,
  toToken:     string,
  amount:      string,
  fromAddress: string,
  slippage = 1,
): Promise<OneInchSwap> {
  const url = `${BASE}/${chainId}/swap?` + new URLSearchParams({
    fromTokenAddress: fromToken,
    toTokenAddress:   toToken,
    amount,
    fromAddress,
    slippage: String(slippage),
    disableEstimate: 'true',
  });
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`1inch swap: ${res.status} – ${txt.slice(0, 120)}`);
  }
  return res.json() as Promise<OneInchSwap>;
}
