/**
 * BalanceContext — polls real on-chain SOL + token balances every 6s.
 * Uses multiple RPC fallbacks + Jupiter Price API for USD values.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useOkoWallet } from "@/context/WalletContext";

// Raw JSON-RPC call via fetch — more reliable than Connection class (no retry loops)
async function rpcCall(endpoint: string, method: string, params: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000); // 5s timeout (was 7s)
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    if (json.error) throw new Error(json.error.message ?? JSON.stringify(json.error));
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

// RPC endpoints in priority order:
// 1. /api/rpc  — our own API server proxy (server-side, zero CORS, most reliable)
// 2. /sol-rpc  — Vite dev proxy to mainnet-beta (fallback)
// 3. Direct public endpoints (last resort)
function buildRpcList(): string[] {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return [
    `${origin}/api/rpc`,                          // server-side proxy with backoff logic
    "https://solana-rpc.publicnode.com",           // free, no rate limit ✓
    `${origin}/sol-rpc`,                           // Vite dev proxy to mainnet-beta
    "https://api.mainnet-beta.solana.com",         // sometimes 429, direct fallback
    "https://solana.public-rpc.com",
  ];
}

const DEDUPED_RPC = buildRpcList();

/** Try each RPC endpoint until getBalance succeeds */
async function tryGetBalance(address: string): Promise<{ lamports: number; endpoint: string }> {
  for (const endpoint of DEDUPED_RPC) {
    try {
      const result: any = await rpcCall(endpoint, "getBalance", [address, { commitment: "confirmed" }]);
      const lamports: number = typeof result?.value === "number" ? result.value : result;
      return { lamports, endpoint };
    } catch (e) {
      console.warn("[Balance] ✗ RPC failed:", endpoint, "—", (e as Error).message);
    }
  }
  throw new Error("Все RPC недоступны. Проверьте подключение.");
}

const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

/** Fetch all token accounts (SPL + Token2022) — tries all RPC endpoints until one succeeds */
async function fetchTokenAccounts(preferredEndpoint: string, address: string): Promise<any[]> {
  const endpoints = [preferredEndpoint, ...DEDUPED_RPC.filter((e) => e !== preferredEndpoint)];
  for (const endpoint of endpoints) {
    try {
      // SPL Token must succeed (it's required); T22 can fail silently
      const splResult = await rpcCall(endpoint, "getTokenAccountsByOwner", [
        address,
        { programId: TOKEN_PROGRAM_ID.toBase58() },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]);
      // T22 is optional — fail silently
      const t22Result = await rpcCall(endpoint, "getTokenAccountsByOwner", [
        address,
        { programId: TOKEN_2022_PROGRAM },
        { encoding: "jsonParsed", commitment: "confirmed" },
      ]).catch(() => ({ value: [] }));

      const accounts = [
        ...((splResult as any)?.value ?? []),
        ...((t22Result as any)?.value ?? []),
      ];
      console.log(`[Balance] ✓ token accounts from ${endpoint}: ${accounts.length} (SPL+T22)`);
      return accounts;
    } catch (e) {
      console.warn("[Balance] ✗ token accounts failed on", endpoint, ":", (e as Error).message);
      // Continue to next endpoint
    }
  }
  console.warn("[Balance] all endpoints failed for token accounts");
  return [];
}

export interface TokenHolding {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  amount: number;       // UI amount
  usdValue: number;
  usdPrice: number;
  logoURI?: string;
  change24h?: number;
}

interface BalanceState {
  solBalance: number;
  solPrice: number;
  solUsd: number;
  tokens: TokenHolding[];
  totalUsd: number;
  loading: boolean;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
  error: string | null;
}

const BalanceCtx = createContext<BalanceState>({
  solBalance: 0, solPrice: 0, solUsd: 0, tokens: [], totalUsd: 0,
  loading: false, lastUpdated: null, error: null,
  refresh: async () => {},
});

const TOKEN_META: Record<string, { symbol: string; name: string; logoURI: string }> = {
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": { symbol: "USDC",  name: "USD Coin",           logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png" },
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": { symbol: "USDT",  name: "Tether",             logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.svg" },
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": { symbol: "mSOL",  name: "Marinade staked SOL", logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png" },
  "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": { symbol: "BONK",  name: "Bonk",               logoURI: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5cSY7I" },
  "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": { symbol: "WIF",   name: "dogwifhat",          logoURI: "https://bafkreibk3covs5ltyqxa272uodhculbgn2cutn3hmnqrd7aqbd5m3jxv.ipfs.nftstorage.link" },
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN":  { symbol: "JUP",   name: "Jupiter",            logoURI: "https://static.jup.ag/jup/icon.png" },
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4": { symbol: "JTO",   name: "Jito",               logoURI: "https://metadata.jito.network/token/jto/image" },
  "HZ1JovNiVvGrG7RCMLr97FrMHUQ49ELMKEXiT4eLjVhP": { symbol: "PYTH",  name: "Pyth Network",       logoURI: "https://pyth.network/token.svg" },
  "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": { symbol: "RAY",   name: "Raydium",            logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png" },
};

/** Fetch DexScreener data for a token — returns price + metadata */
const _dexCache: Record<string, { price: number; symbol: string; name: string; logoURI?: string }> = {};
async function fetchDexScreenerToken(mint: string): Promise<{ price: number; symbol: string; name: string; logoURI?: string } | null> {
  if (_dexCache[mint]) return _dexCache[mint];
  try {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const r = await fetch(`${origin}/dex/tokens/v1/solana/${mint}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const pairs: any[] = await r.json();
    if (!Array.isArray(pairs) || !pairs.length) return null;
    // Sort by liquidity to get the best pair
    const best = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const tokenInfo = best.baseToken?.address?.toLowerCase() === mint.toLowerCase()
      ? best.baseToken
      : best.quoteToken;
    const price = parseFloat(
      best.baseToken?.address?.toLowerCase() === mint.toLowerCase()
        ? (best.priceUsd ?? "0")
        : "0"
    );
    const result = {
      price,
      symbol: tokenInfo?.symbol ?? mint.slice(0, 6),
      name:   tokenInfo?.name   ?? "Token",
      logoURI: best.info?.imageUrl ?? undefined,
    };
    _dexCache[mint] = result;
    return result;
  } catch {
    return null;
  }
}

/** Fetch token USD prices — Jupiter first, DexScreener fallback for unknowns */
async function fetchTokenPrices(mints: string[]): Promise<Record<string, number>> {
  if (!mints.length) return {};
  const result: Record<string, number> = {};

  // Step 1: Jupiter Price API (fast, covers major tokens)
  try {
    const ids = mints.join(",");
    const r = await fetch(`https://api.jup.ag/price/v2?ids=${ids}`, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const d = await r.json();
      for (const [mint, info] of Object.entries(d.data ?? {})) {
        const p = parseFloat((info as any).price ?? "0");
        if (p > 0) result[mint] = p;
      }
    }
  } catch { /* ignore */ }

  // Step 2: For mints still missing price → try DexScreener
  const stillMissing = mints.filter((m) => !result[m] || result[m] === 0);
  if (stillMissing.length) {
    await Promise.allSettled(
      stillMissing.map(async (mint) => {
        const dex = await fetchDexScreenerToken(mint);
        if (dex && dex.price > 0) result[mint] = dex.price;
      })
    );
  }

  return result;
}

interface TokenMeta { symbol: string; name: string; logoURI?: string }
const _metaCache: Record<string, TokenMeta> = {};

/** Fetch token metadata (symbol, name, logo) — Jupiter first, then DexScreener fallback */
async function fetchTokenMeta(mints: string[]): Promise<Record<string, TokenMeta>> {
  const unknown = mints.filter((m) => !TOKEN_META[m] && !_metaCache[m]);
  if (unknown.length) {
    await Promise.allSettled(
      unknown.map(async (mint) => {
        // Try Jupiter Token API first
        try {
          const r = await fetch(`https://lite-api.jup.ag/tokens/v1/token/${mint}`, {
            signal: AbortSignal.timeout(5000),
          });
          if (r.ok) {
            const d = await r.json();
            if (d?.symbol) {
              _metaCache[mint] = { symbol: d.symbol, name: d.name ?? d.symbol, logoURI: d.logoURI };
              return;
            }
          }
        } catch { /* fall through */ }

        // Fallback: DexScreener (covers most meme tokens on Solana)
        const dex = await fetchDexScreenerToken(mint);
        if (dex) {
          _metaCache[mint] = { symbol: dex.symbol, name: dex.name, logoURI: dex.logoURI };
        }
      })
    );
  }
  const result: Record<string, TokenMeta> = {};
  for (const mint of mints) {
    result[mint] = TOKEN_META[mint] ?? _metaCache[mint] ?? { symbol: mint.slice(0, 6), name: "Token" };
  }
  return result;
}

let _solPriceCache = 0;
let _solPriceCacheTs = 0;

async function fetchSolPrice(): Promise<number> {
  if (_solPriceCache > 0 && Date.now() - _solPriceCacheTs < 20_000) return _solPriceCache;
  // Jupiter Price API (fast, no rate limits)
  try {
    const r = await fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112", { signal: AbortSignal.timeout(5000) });
    const d = await r.json() as any;
    const p = parseFloat(d?.data?.["So11111111111111111111111111111111111111112"]?.price ?? "0");
    if (p > 0) { _solPriceCache = p; _solPriceCacheTs = Date.now(); return p; }
  } catch { /* fall through */ }
  // CoinGecko fallback
  try {
    const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", { signal: AbortSignal.timeout(5000) });
    const d = await r.json() as any;
    const p = d?.solana?.usd ?? 0;
    if (p > 0) { _solPriceCache = p; _solPriceCacheTs = Date.now(); return p; }
  } catch { /* fall through */ }
  return _solPriceCache > 0 ? _solPriceCache : 170;
}

const SOL_POLL_MS    = 20_000;  // SOL balance every 20s (was 8s)
const TOKEN_POLL_MS  = 90_000;  // Token accounts every 90s (was 60s)

/** Cache balance data in sessionStorage for instant display on reconnect */
function saveBalanceCache(address: string, sol: number, price: number, tokens: TokenHolding[]) {
  try {
    sessionStorage.setItem(`oko-bal-${address}`, JSON.stringify({ sol, price, tokens, ts: Date.now() }));
  } catch { /* ignore */ }
}
function loadBalanceCache(address: string): { sol: number; price: number; tokens: TokenHolding[] } | null {
  try {
    const raw = sessionStorage.getItem(`oko-bal-${address}`);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - d.ts > 5 * 60_000) return null; // stale after 5 min
    return d;
  } catch { return null; }
}

export function BalanceProvider({ children }: { children: ReactNode }) {
  const { address, connected } = useOkoWallet();

  // Seed from session cache so balance shows immediately on reconnect
  const cachedInit = address ? loadBalanceCache(address) : null;
  const [solBalance,   setSolBalance]   = useState(cachedInit?.sol ?? 0);
  const [solPrice,     setSolPrice]     = useState(cachedInit?.price ?? 0);
  const [tokens,       setTokens]       = useState<TokenHolding[]>(cachedInit?.tokens ?? []);
  const [loading,      setLoading]      = useState(false);
  const [lastUpdated,  setLastUpdated]  = useState<number | null>(cachedInit ? Date.now() : null);
  const [error,        setError]        = useState<string | null>(null);

  // Guards to prevent parallel refreshes from stacking up
  const solRefreshing   = useRef(false);
  const tokenRefreshing = useRef(false);

  /** Refresh only SOL balance — lightweight */
  const refreshSol = useCallback(async () => {
    if (!address || !connected || solRefreshing.current) return;
    solRefreshing.current = true;
    try {
      const [{ lamports }, solPriceVal] = await Promise.all([
        tryGetBalance(address),
        fetchSolPrice(),
      ]);
      setSolBalance(lamports / LAMPORTS_PER_SOL);
      setSolPrice(solPriceVal);
    } catch (e: any) {
      console.warn("[Balance] SOL refresh failed:", e?.message);
    } finally {
      solRefreshing.current = false;
    }
  }, [address, connected]);

  /** Refresh token accounts — heavier */
  const refreshTokens = useCallback(async () => {
    if (!address || !connected || tokenRefreshing.current) return;
    tokenRefreshing.current = true;
    try {
      const { endpoint } = await tryGetBalance(address);
      const rawAccounts = await fetchTokenAccounts(endpoint, address);

      const holdings: { mint: string; amount: number; decimals: number }[] = [];
      for (const acc of rawAccounts) {
        const info = acc.account?.data?.parsed?.info;
        if (!info) continue;
        const amount: number = info.tokenAmount?.uiAmount ?? 0;
        if (amount <= 0) continue;
        holdings.push({ mint: info.mint, amount, decimals: info.tokenAmount?.decimals ?? 0 });
      }

      const mints = holdings.map((h) => h.mint);
      const [prices, metas] = await Promise.all([
        fetchTokenPrices(mints),
        fetchTokenMeta(mints),
      ]);

      const tokenHoldings: TokenHolding[] = holdings.map((h) => {
        const meta  = metas[h.mint];
        const price = prices[h.mint] ?? 0;
        return {
          mint:     h.mint,
          symbol:   meta?.symbol ?? h.mint.slice(0, 6),
          name:     meta?.name   ?? "Token",
          decimals: h.decimals,
          amount:   h.amount,
          usdValue: h.amount * price,
          usdPrice: price,
          logoURI:  meta?.logoURI,
        };
      }).sort((a, b) => b.usdValue - a.usdValue);

      setTokens(tokenHoldings);
      setLastUpdated(Date.now());
    } catch (e: any) {
      console.warn("[Balance] token refresh failed:", e?.message);
    } finally {
      tokenRefreshing.current = false;
    }
  }, [address, connected]);

  /** Full refresh (both SOL + tokens) — exposed to consumers */
  const refresh = useCallback(async () => {
    if (!address || !connected) return;
    setLoading(true);
    setError(null);
    try {
      await Promise.all([refreshSol(), refreshTokens()]);
    } catch (e: any) {
      console.error("[Balance] full refresh error:", e?.message);
      setError(e?.message ?? "Ошибка загрузки баланса");
    } finally {
      setLoading(false);
    }
  }, [address, connected, refreshSol, refreshTokens]);

  // Save to session cache whenever data changes
  useEffect(() => {
    if (address && solBalance > 0) {
      saveBalanceCache(address, solBalance, solPrice, tokens);
    }
  }, [address, solBalance, solPrice, tokens]);

  // Initial load when wallet connects
  useEffect(() => {
    refresh();
  }, [refresh]);

  // SOL balance: poll every 20s (lightweight)
  useEffect(() => {
    if (!address || !connected) return;
    const id = setInterval(refreshSol, SOL_POLL_MS);
    return () => clearInterval(id);
  }, [address, connected, refreshSol]);

  // Token accounts: poll every 90s (heavy — avoid rate limits)
  useEffect(() => {
    if (!address || !connected) return;
    const id = setInterval(refreshTokens, TOKEN_POLL_MS);
    return () => clearInterval(id);
  }, [address, connected, refreshTokens]);

  const solUsd  = solBalance * solPrice;
  const tokenUsd = tokens.reduce((s, t) => s + t.usdValue, 0);
  const totalUsd = solUsd + tokenUsd;

  return (
    <BalanceCtx.Provider value={{ solBalance, solPrice, solUsd, tokens, totalUsd, loading, lastUpdated, error, refresh }}>
      {children}
    </BalanceCtx.Provider>
  );
}

export function useBalance() {
  return useContext(BalanceCtx);
}
