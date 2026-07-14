/**
 * POST /api/fee
 * Broadcasts a pre-signed platform fee transaction to Solana.
 * Browser builds + signs the tx, sends raw base64 here,
 * server forwards to RPC (no CORS restrictions on server side).
 */
import { Router } from "express";

const router = Router();

const SOLANA_RPC_ENDPOINTS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet-beta.solana.com",
  "https://rpc.ankr.com/solana",
];

async function broadcastTx(txBase64: string): Promise<string> {
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendTransaction",
    params: [txBase64, { encoding: "base64", skipPreflight: true, maxRetries: 3 }],
  };

  for (const endpoint of SOLANA_RPC_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn(`[FeeRoute] HTTP ${res.status} from ${endpoint}`);
        continue;
      }
      const data: any = await res.json();
      if (data.error) {
        console.warn(`[FeeRoute] RPC error from ${endpoint}:`, data.error.message);
        continue;
      }
      const sig: string = data.result;
      if (!sig) continue;
      console.log(`[FeeRoute] ✓ fee tx broadcast via ${endpoint}: ${sig}`);
      return sig;
    } catch (e) {
      console.warn(`[FeeRoute] ✗ ${endpoint}:`, (e as Error).message);
    }
  }
  throw new Error("All endpoints failed to broadcast fee tx");
}

router.post("/fee", async (req, res) => {
  const { tx } = req.body ?? {};
  if (!tx || typeof tx !== "string") {
    return res.status(400).json({ error: "Missing signed tx (base64)" });
  }
  try {
    const signature = await broadcastTx(tx);
    res.json({ signature });
  } catch (e: any) {
    console.error("[FeeRoute] broadcast failed:", e.message);
    res.status(502).json({ error: e.message });
  }
});

export default router;
