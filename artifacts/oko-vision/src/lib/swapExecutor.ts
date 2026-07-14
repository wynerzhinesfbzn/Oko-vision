/**
 * Real Jupiter V6 swap executor.
 * 1. Gets a quote from Jupiter
 * 2. Fetches the swap transaction
 * 3. Signs with user's keypair (generated wallet) or wallet adapter (Phantom etc.)
 * 4. Sends to Solana mainnet and waits for confirmation
 */

import {
  VersionedTransaction,
  TransactionMessage,
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import { getJupiterQuote, getSwapTransaction, SOL_MINT, PLATFORM_FEE_BPS, PLATFORM_FEE_ACCOUNT } from "./jupiter";

const FEE_BPS = 100; // 1%
const MIN_FEE_LAMPORTS = 5_000; // ~$0.001 minimum to avoid dust

/**
 * Send a separate platform fee SOL transfer after the swap succeeds.
 *
 * Strategy to avoid CORS + rate-limit issues:
 *  1. Get blockhash from /api/rpc  (same-origin proxy → no CORS)
 *  2. Build & sign fee tx in the browser (keypair never leaves client)
 *  3. POST signed tx bytes to /api/fee  (server broadcasts to Solana → no CORS)
 *
 * Fire-and-forget — errors are logged but never block the swap result.
 */
async function sendFeeTransfer(
  keypair: Keypair,
  feeLamports: number,
): Promise<void> {
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  // 1 — Get fresh blockhash from our same-origin proxy (avoids CORS)
  const bhRes = await fetch(`${origin}/api/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getLatestBlockhash", params: [{ commitment: "confirmed" }] }),
  });
  const bhData = await bhRes.json();
  const blockhash: string = bhData?.result?.value?.blockhash;
  if (!blockhash) throw new Error("[FeeTransfer] no blockhash from proxy");

  // 2 — Build & sign fee transfer transaction
  const feeIx = SystemProgram.transfer({
    fromPubkey: keypair.publicKey,
    toPubkey:   new PublicKey(PLATFORM_FEE_ACCOUNT),
    lamports:   feeLamports,
  });
  const msg = new TransactionMessage({
    payerKey:        keypair.publicKey,
    recentBlockhash: blockhash,
    instructions:    [feeIx],
  }).compileToV0Message();
  const feeTx = new VersionedTransaction(msg);
  feeTx.sign([keypair]);
  const encoded = Buffer.from(feeTx.serialize()).toString("base64");

  // 3 — Send to our server endpoint (server broadcasts to Solana — no browser CORS issue)
  const sendRes = await fetch(`${origin}/api/fee`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tx: encoded }),
  });
  const sendData = await sendRes.json();
  if (!sendRes.ok || sendData.error) {
    throw new Error(`[FeeTransfer] server error: ${sendData.error ?? sendRes.status}`);
  }
  console.log(`[FeeTransfer] ✓ signature: ${sendData.signature} (${feeLamports} lam)`);
}

// Build endpoint list — /api/rpc (server-side proxy) is always first
function buildTxEndpoints(): string[] {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return [
    `${origin}/api/rpc`,                         // server proxy — NO CORS, most reliable
    "https://api.mainnet-beta.solana.com",
    "https://rpc.ankr.com/solana",
  ].filter(Boolean);
}

let _txConn: Connection | null = null;
let _txConnEp = "";

/** Health-check an RPC endpoint using a raw fetch (avoids WebSocket side-effects from Connection class) */
async function pingRpc(endpoint: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getSlot", params: [] }),
      signal: ac.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function getTxConnection(): Promise<Connection> {
  // Re-use cached connection if still valid (check via raw fetch, no WebSocket side-effects)
  if (_txConn && _txConnEp) {
    const ok = await pingRpc(_txConnEp, 3000);
    if (ok) return _txConn;
    _txConn = null; _txConnEp = "";
  }

  for (const ep of buildTxEndpoints()) {
    const ok = await pingRpc(ep, 4000);
    if (!ok) { console.warn("[SwapExecutor] RPC failed:", ep); continue; }
    // Create Connection with no WebSocket endpoint to avoid reconnection spam
    const c = new Connection(ep, {
      commitment: "confirmed",
      confirmTransactionInitialTimeout: 30_000,
      wsEndpoint: "wss://invalid.local/", // prevent persistent WS reconnect loops
    });
    console.log("[SwapExecutor] RPC ok:", ep);
    _txConn = c; _txConnEp = ep; return c;
  }
  // Last resort — use proxy without health check
  const ep = buildTxEndpoints()[0];
  console.warn("[SwapExecutor] using fallback RPC:", ep);
  _txConn = new Connection(ep, {
    commitment: "confirmed",
    confirmTransactionInitialTimeout: 60_000,
    wsEndpoint: "wss://invalid.local/",
  });
  _txConnEp = ep;
  return _txConn;
}

export interface SwapParams {
  userAddress: string;
  keypair?: Keypair;                         // for generated wallets
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>; // for adapter wallets
  inputMint: string;                         // what we spend
  outputMint: string;                        // what we receive
  inputAmountUsd: number;                    // USD amount to spend (BUY: SOL → token)
  inputTokenAmount?: number;                 // token UI amount to sell (SELL: token → SOL)
  inputDecimals?: number;                    // decimals of the token being sold
  solPriceUsd: number;                       // current SOL price
  slippageBps?: number;
  priorityMode?: "normal" | "fast" | "degen";
  priorityFeeSol?: number;  // direct SOL override; takes precedence over priorityMode
}

export interface SwapResult {
  txHash: string;
  inputAmountUsd: number;
  outAmount: number;         // raw token units received
  outAmountUi: number;       // human-readable token units
  outputDecimals: number;
  fee: number;               // platform fee in USD
  entryPrice: number;        // USD per token
}


/**
 * Execute a real Jupiter swap.
 * inputMint = SOL_MINT for buy (spend SOL, receive token)
 * outputMint = SOL_MINT for sell (spend token, receive SOL)
 */
export async function executeSwap(params: SwapParams): Promise<SwapResult> {
  const {
    userAddress, keypair, signTransaction,
    inputMint, outputMint, inputAmountUsd, solPriceUsd,
    slippageBps = 100,
    priorityMode = "normal",
    priorityFeeSol,
  } = params;

  // Resolve effective priority fee in SOL
  // If caller passes priorityFeeSol directly, that wins; otherwise derive from mode
  const PRESET_SOL: Record<string, number> = { normal: 0.001, fast: 0.005, degen: 0.01 };
  const effectivePriorityFeeSol = priorityFeeSol ?? PRESET_SOL[priorityMode] ?? 0.001;

  if (!keypair && !signTransaction) {
    throw new Error("Нужен keypair или signTransaction для подписи");
  }

  // 1 — Compute input amount in base units
  let inputLamports: number;
  if (inputMint === SOL_MINT) {
    // BUY: spending SOL → convert USD to lamports
    const solAmount = inputAmountUsd / solPriceUsd;
    inputLamports   = Math.round(solAmount * LAMPORTS_PER_SOL);
  } else if (params.inputTokenAmount !== undefined) {
    // SELL: spending token → use token UI amount × 10^decimals
    const dec     = params.inputDecimals ?? guessDecimals(inputMint, 0, 0);
    inputLamports = Math.round(params.inputTokenAmount * Math.pow(10, dec));
  } else {
    // SELL fallback: estimate token amount from USD value
    const dec     = params.inputDecimals ?? guessDecimals(inputMint, 0, 0);
    const tokenAmt = inputAmountUsd / (solPriceUsd * 0.001); // rough estimate
    inputLamports  = Math.round(tokenAmt * Math.pow(10, dec));
  }

  if (inputLamports < 1) {
    throw new Error("Сумма слишком мала");
  }

  // 2 — Get Jupiter quote
  let quote;
  try {
    quote = await getJupiterQuote(inputMint, outputMint, inputLamports, slippageBps);
  } catch (e: any) {
    const msg = e?.message ?? "";
    if (msg.toLowerCase().includes("fetch") || msg.includes("network") || msg.includes("503")) {
      throw new Error("Нет подключения к Jupiter. Проверь интернет или отключи VPN.");
    }
    throw e;
  }
  const outRaw = parseInt(quote.outAmount, 10);
  if (!outRaw) throw new Error("Jupiter не нашёл маршрут для этого токена");

  const conn = await getTxConnection();

  // 3 — Get swap transaction from Jupiter (unmodified — cleaner and more reliable)
  const { swapTransaction: swapTxBase64 } = await getSwapTransaction(quote, userAddress, effectivePriorityFeeSol);
  const swapTxBuf = Buffer.from(swapTxBase64, "base64");
  let tx = VersionedTransaction.deserialize(swapTxBuf);

  // Compute platform fee in lamports (1% of trade size, min 5000 lamports)
  const feeLamports = Math.max(
    MIN_FEE_LAMPORTS,
    Math.round((inputAmountUsd * FEE_BPS / 10_000) / solPriceUsd * LAMPORTS_PER_SOL),
  );

  // 4 — Sign swap transaction
  if (keypair) {
    tx.sign([keypair]);
  } else if (signTransaction) {
    const signed = await signTransaction(tx);
    Object.assign(tx, signed);
  }

  // 5 — Send the swap
  const rawTx = tx.serialize();
  const txHash = await conn.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: "confirmed",
    maxRetries: 3,
  });

  // 6 — Determine decimals & UI amount (before confirmation so we return optimistically)
  const outputDecimals = outputMint === SOL_MINT ? 9 : guessDecimals(outputMint, outRaw, inputAmountUsd / solPriceUsd);
  const outAmountUi    = outRaw / Math.pow(10, outputDecimals);
  const entryPrice     = outAmountUi > 0 ? inputAmountUsd / outAmountUi : 0;
  const fee            = inputAmountUsd * (PLATFORM_FEE_BPS / 10_000);

  const result = {
    txHash,
    inputAmountUsd,
    outAmount: outRaw,
    outAmountUi,
    outputDecimals,
    fee,
    entryPrice,
  };

  // 7 — Confirm swap on-chain. Re-throw only real errors, not WS timeouts.
  try {
    const latestBlock = await conn.getLatestBlockhash("confirmed");
    const confirmation = await conn.confirmTransaction(
      { signature: txHash, ...latestBlock },
      "confirmed",
    );
    if (confirmation.value.err) {
      throw new Error(`Транзакция отклонена: ${JSON.stringify(confirmation.value.err)}`);
    }
  } catch (confirmErr: any) {
    const msg: string = confirmErr?.message ?? "";
    const isOnChainReject =
      msg.includes("Transaction simulation failed") ||
      msg.includes("Транзакция отклонена") ||
      msg.includes("insufficient") ||
      msg.includes("custom program error");
    if (isOnChainReject) throw confirmErr;
    // Timeout / WS disconnect — proceed optimistically
    console.warn("[swapExecutor] confirmTransaction timed out, returning optimistically:", txHash);
  }

  // 8 — Send 1% platform fee as a separate SOL transfer (fire-and-forget).
  //     Only possible for generated wallets (we have the keypair).
  //     Uses independent public RPC endpoints to avoid rate-limiting after main swap.
  if (keypair) {
    sendFeeTransfer(keypair, feeLamports).catch(e =>
      console.error("[FeeTransfer] all retries failed:", e?.message),
    );
  }

  return result;
}

/**
 * Heuristic: guess token decimals from raw output vs expected USD value.
 * Works well for common tokens (6 decimals: USDC/WIF/etc, 9: SOL/mSOL, 5: BONK).
 */
function guessDecimals(mint: string, rawOut: number, solSpent: number): number {
  const KNOWN: Record<string, number> = {
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v": 6,  // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB": 6,  // USDT
    "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263": 5,  // BONK
    "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm": 6,  // WIF
    "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN": 6,   // JUP
    "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidzVJidD4": 9, // JTO
    "HZ1JovNiVvGrG7RCMLr97FrMHUQ49ELMKEXiT4eLjVhP": 6,  // PYTH
    "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R": 6,  // RAY
    "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So": 9,   // mSOL
  };
  return KNOWN[mint] ?? 6;
}

/**
 * Fetch the current SOL balance and token balances for an address.
 * Returns SOL amount (not lamports).
 */
export async function fetchSolBalance(address: string): Promise<number> {
  try {
    const pk = new PublicKey(address);
    const conn = await getTxConnection();
    const lamports = await conn.getBalance(pk, "confirmed");
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return 0;
  }
}
