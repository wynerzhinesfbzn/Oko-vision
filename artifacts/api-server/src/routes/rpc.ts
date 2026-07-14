/**
 * Server-side Solana RPC proxy.
 * Browser → POST /api/rpc → this route → Solana RPC endpoints (with fallbacks)
 */
import { Router } from "express";

const router = Router();

// Endpoints in priority order — tested 2026-03-26
// mainnet-beta: works but rate-limits heavy calls (429)
// publicnode:   free, no rate limit, supports all methods ✓
// public-rpc:   sometimes works
const SOLANA_RPC_ENDPOINTS = [
  "https://api.mainnet-beta.solana.com",
  "https://solana-rpc.publicnode.com",
  "https://solana.public-rpc.com",
];

// Simple in-memory rate-limit tracker: track last-429 timestamp per endpoint
const endpoint429At: Record<string, number> = {};
const BACKOFF_MS = 15_000; // skip an endpoint for 15s after 429

async function proxyRpc(body: unknown): Promise<unknown> {
  const now = Date.now();
  for (const endpoint of SOLANA_RPC_ENDPOINTS) {
    // Skip if recently 429'd
    if (endpoint429At[endpoint] && now - endpoint429At[endpoint] < BACKOFF_MS) {
      console.warn("[RPC proxy] skipping (recent 429):", endpoint);
      continue;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status === 429) {
        endpoint429At[endpoint] = Date.now();
        console.warn("[RPC proxy] 429 from", endpoint, "— backing off 15s");
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}`);
      return await res.json();
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        console.warn("[RPC proxy] failed:", endpoint, (e as Error).message);
      }
    }
  }
  throw new Error("All Solana RPC endpoints failed");
}

router.post("/rpc", async (req, res) => {
  try {
    const result = await proxyRpc(req.body);
    res.json(result);
  } catch (e: any) {
    res.status(503).json({
      jsonrpc: "2.0",
      id: (req.body as any)?.id ?? 1,
      error: { code: -32000, message: e.message },
    });
  }
});

export default router;
