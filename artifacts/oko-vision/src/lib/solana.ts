import { Connection, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

export const RPC = "https://api.mainnet-beta.solana.com";
export const connection = new Connection(RPC, "confirmed");

export interface TokenBalance {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number;          // UI amount (already divided by decimals)
  usdValue: number;
  logoURI?: string;
  change24h?: number;
}

// Popular Solana token metadata (mint → info)
const TOKEN_META: Record<string, { symbol: string; name: string; logoURI: string }> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC",  name: "USD Coin",           logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB":  { symbol: "USDT",  name: "Tether",             logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg" },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So":  { symbol: "mSOL",  name: "Marinade staked SOL", logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png" },
  "7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj": { symbol: "stSOL", name: "Lido Staked SOL",    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj/logo.png" },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK",  name: "Bonk",               logoURI: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I" },
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": { symbol: "WIF",   name: "dogwifhat",          logoURI: "https://bafkreibk3covs5ltyqxa272uodhculbgn2cutn3hmnqrd7aqbd5m3jxv.ipfs.nftstorage.link" },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  { symbol: "JUP",   name: "Jupiter",            logoURI: "https://static.jup.ag/jup/icon.png" },
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": { symbol: "JTO",   name: "Jito",               logoURI: "https://metadata.jito.network/token/jto/image" },
  "HZ1JovNiVvGrG7RCMLr97FrMHUQ49ELMKEXiT4eLjVhP": { symbol: "PYTH",  name: "Pyth Network",       logoURI: "https://pyth.network/token.svg" },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY",   name: "Raydium",            logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png" },
};

/** Fetch SOL balance in lamports, returns SOL amount */
export async function getSolBalance(address: string): Promise<number> {
  const pk = new PublicKey(address);
  const lamports = await connection.getBalance(pk);
  return lamports / LAMPORTS_PER_SOL;
}

/** Fetch all SPL token balances for an address */
export async function getTokenBalances(address: string): Promise<TokenBalance[]> {
  const pk = new PublicKey(address);
  const { value } = await connection.getParsedTokenAccountsByOwner(pk, { programId: TOKEN_PROGRAM_ID });

  const tokens: TokenBalance[] = [];
  for (const acc of value) {
    const info = acc.account.data.parsed?.info;
    if (!info) continue;
    const mint: string = info.mint;
    const decimals: number = info.tokenAmount.decimals;
    const amount: number = info.tokenAmount.uiAmount ?? 0;
    if (amount === 0) continue;

    const meta = TOKEN_META[mint];
    tokens.push({
      mint,
      symbol:   meta?.symbol ?? mint.slice(0, 6),
      name:     meta?.name   ?? "Unknown Token",
      decimals,
      amount,
      usdValue: 0,    // filled in by price fetch
      logoURI:  meta?.logoURI,
    });
  }
  return tokens;
}

/** Fetch SOL price in USD from CoinGecko (via proxy if needed) */
export async function getSolPrice(): Promise<number> {
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd");
    const d = await r.json();
    return d.solana?.usd ?? 170;
  } catch {
    return 170; // fallback
  }
}

/** Build a SOL transfer transaction */
export function buildSolTransfer(from: string, to: string, lamports: number): Transaction {
  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: new PublicKey(from),
      toPubkey:   new PublicKey(to),
      lamports,
    }),
  );
  return tx;
}

/** Validate Solana address */
export function isValidAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

/** Shorten address */
export function shortAddr(addr: string, chars = 4): string {
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}
