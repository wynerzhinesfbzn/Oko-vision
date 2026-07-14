/**
 * Server-side Jupiter V6 API proxy.
 * Browser → /api/jupiter/quote or /api/jupiter/swap → this route → lite-api.jup.ag
 * Uses lite-api.jup.ag which is reachable from Replit (quote-api.jup.ag DNS fails).
 */
import { Router } from "express";

const router = Router();

// lite-api works from Replit; quote-api.jup.ag DNS does not resolve
const JUPITER_LITE = "https://lite-api.jup.ag/swap/v1";

// GET /api/jupiter/quote
router.get("/jupiter/quote", async (req, res): Promise<void> => {
  try {
    const params = new URLSearchParams(req.query as Record<string, string>);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    const upstream = await fetch(`${JUPITER_LITE}/quote?${params}`, {
      signal: controller.signal,
      headers: { "Accept": "application/json" },
    });
    clearTimeout(timer);
    if (!upstream.ok) {
      const body = await upstream.text();
      res.status(upstream.status).json({ error: body });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (e: any) {
    console.error("[Jupiter proxy] quote error:", e.message);
    res.status(503).json({ error: `Jupiter quote failed: ${e.message}` });
  }
});

// POST /api/jupiter/swap
router.post("/jupiter/swap", async (req, res): Promise<void> => {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const upstream = await fetch(`${JUPITER_LITE}/swap`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!upstream.ok) {
      const body = await upstream.text();
      res.status(upstream.status).json({ error: body });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (e: any) {
    console.error("[Jupiter proxy] swap error:", e.message);
    res.status(503).json({ error: `Jupiter swap failed: ${e.message}` });
  }
});

export default router;
