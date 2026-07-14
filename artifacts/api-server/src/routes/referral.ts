import { Router } from "express";
import { db } from "@workspace/db";
import {
  referralLinks,
  referralRelations,
  referralTrades,
  referralPayouts,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { Connection, PublicKey, SystemProgram, Transaction, Keypair, LAMPORTS_PER_SOL, sendAndConfirmTransaction } from "@solana/web3.js";
import bs58 from "bs58";

const router = Router();

const RPC = "https://api.mainnet-beta.solana.com";
const REFERRAL_RATE = 0.0025; // 0.25% of trade volume
const PAYOUT_THRESHOLD_USD = 0.50; // $0.50 min to trigger auto-payout

function getSolPrice(): Promise<number> {
  return fetch("https://api.jup.ag/price/v2?ids=So11111111111111111111111111111111111111112")
    .then(r => r.json() as Promise<any>)
    .then((d: any) => {
      const p = d?.data?.["So11111111111111111111111111111111111111112"]?.price;
      return p ? parseFloat(p) : 140;
    })
    .catch(() => 140);
}

async function sendSolPayout(toAddress: string, amountSol: number): Promise<string> {
  const secretKeyEnv = process.env.PLATFORM_SECRET_KEY;
  if (!secretKeyEnv) throw new Error("PLATFORM_SECRET_KEY not set");

  const secretKey = bs58.decode(secretKeyEnv);
  const payer = Keypair.fromSecretKey(secretKey);
  const connection = new Connection(RPC, "confirmed");

  const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
  if (lamports < 5000) throw new Error("Amount too small (< min lamports)");

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: payer.publicKey,
      toPubkey:   new PublicKey(toAddress),
      lamports,
    })
  );

  const sig = await sendAndConfirmTransaction(connection, tx, [payer]);
  return sig;
}

async function tryAutoPayout(referrerAddress: string): Promise<void> {
  const unpaid = await db
    .select({ total: sql<number>`sum(${referralTrades.referralUsd})` })
    .from(referralTrades)
    .where(and(
      eq(referralTrades.referrerAddress, referrerAddress),
      eq(referralTrades.paid, false),
    ));

  const pendingUsd = unpaid[0]?.total ?? 0;
  if (pendingUsd < PAYOUT_THRESHOLD_USD) return;

  const solPrice = await getSolPrice();
  const amountSol = pendingUsd / solPrice;

  try {
    const txHash = await sendSolPayout(referrerAddress, amountSol);

    await db.insert(referralPayouts).values({
      id:              `pay-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      referrerAddress,
      amountSol,
      amountUsd:       pendingUsd,
      txHash,
      createdAt:       Date.now(),
    });

    await db
      .update(referralTrades)
      .set({ paid: true })
      .where(and(
        eq(referralTrades.referrerAddress, referrerAddress),
        eq(referralTrades.paid, false),
      ));
  } catch (err) {
    console.error("[referral payout error]", (err as Error).message);
  }
}

// POST /api/referral/register
// Body: { refCode, refereeAddress }
router.post("/referral/register", async (req, res) => {
  try {
    const { refCode, refereeAddress } = req.body as { refCode?: string; refereeAddress?: string };
    if (!refCode || !refereeAddress) {
      res.status(400).json({ error: "refCode and refereeAddress required" });
      return;
    }

    const existing = await db
      .select()
      .from(referralRelations)
      .where(eq(referralRelations.refereeAddress, refereeAddress))
      .limit(1);

    if (existing.length > 0) {
      res.json({ ok: true, already: true });
      return;
    }

    const link = await db
      .select()
      .from(referralLinks)
      .where(eq(referralLinks.refCode, refCode))
      .limit(1);

    if (link.length === 0) {
      res.status(404).json({ error: "Ref code not found" });
      return;
    }

    const referrer = link[0];
    if (referrer.referrerAddress === refereeAddress) {
      res.status(400).json({ error: "Cannot refer yourself" });
      return;
    }

    await db.insert(referralRelations).values({
      refereeAddress,
      referrerAddress: referrer.referrerAddress,
      refCode,
      createdAt: Date.now(),
    });

    res.json({ ok: true, referrerAddress: referrer.referrerAddress });
  } catch (err) {
    console.error("[referral/register]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/referral/link
// Body: { referrerAddress, refCode }
router.post("/referral/link", async (req, res) => {
  try {
    const { referrerAddress, refCode } = req.body as { referrerAddress?: string; refCode?: string };
    if (!referrerAddress || !refCode) {
      res.status(400).json({ error: "referrerAddress and refCode required" });
      return;
    }

    await db
      .insert(referralLinks)
      .values({ refCode, referrerAddress, createdAt: Date.now() })
      .onConflictDoNothing();

    res.json({ ok: true });
  } catch (err) {
    console.error("[referral/link]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// POST /api/referral/trade
// Body: { refereeAddress, tradeVolumeUsd, txHash }
router.post("/referral/trade", async (req, res) => {
  try {
    const { refereeAddress, tradeVolumeUsd, txHash } = req.body as {
      refereeAddress?: string;
      tradeVolumeUsd?: number;
      txHash?: string;
    };

    if (!refereeAddress || !tradeVolumeUsd || !txHash) {
      res.status(400).json({ error: "refereeAddress, tradeVolumeUsd, txHash required" });
      return;
    }

    const relation = await db
      .select()
      .from(referralRelations)
      .where(eq(referralRelations.refereeAddress, refereeAddress))
      .limit(1);

    if (relation.length === 0) {
      res.json({ ok: true, noReferral: true });
      return;
    }

    const { referrerAddress } = relation[0];
    const referralUsd = tradeVolumeUsd * REFERRAL_RATE;

    await db.insert(referralTrades).values({
      id:             `tr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      refereeAddress,
      referrerAddress,
      tradeVolumeUsd,
      referralUsd,
      txHash,
      paid:           false,
      createdAt:      Date.now(),
    });

    tryAutoPayout(referrerAddress).catch(() => {});
    res.json({ ok: true, referralUsd, referrerAddress });
  } catch (err) {
    console.error("[referral/trade]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// GET /api/referral/stats/:address
router.get("/referral/stats/:address", async (req, res) => {
  try {
    const { address } = req.params;

    const myLink = await db
      .select()
      .from(referralLinks)
      .where(eq(referralLinks.referrerAddress, address))
      .limit(1);

    const refCode = myLink[0]?.refCode ?? null;

    const friends = await db
      .select()
      .from(referralRelations)
      .where(eq(referralRelations.referrerAddress, address));

    const friendAddresses = friends.map(f => f.refereeAddress);

    let trades: typeof referralTrades.$inferSelect[] = [];
    if (friendAddresses.length > 0) {
      trades = await db
        .select()
        .from(referralTrades)
        .where(eq(referralTrades.referrerAddress, address))
        .orderBy(sql`${referralTrades.createdAt} desc`);
    }

    const payouts = await db
      .select()
      .from(referralPayouts)
      .where(eq(referralPayouts.referrerAddress, address))
      .orderBy(sql`${referralPayouts.createdAt} desc`);

    const totalEarnedUsd = trades.reduce((s, t) => s + t.referralUsd, 0);
    const pendingUsd     = trades.filter(t => !t.paid).reduce((s, t) => s + t.referralUsd, 0);
    const paidOutUsd     = payouts.reduce((s, p) => s + p.amountUsd, 0);

    const friendStats = friends.map(f => {
      const fTrades = trades.filter(t => t.refereeAddress === f.refereeAddress);
      return {
        address:      f.refereeAddress,
        shortAddr:    `${f.refereeAddress.slice(0, 4)}…${f.refereeAddress.slice(-4)}`,
        joinedAt:     f.createdAt,
        tradeCount:   fTrades.length,
        volumeUsd:    fTrades.reduce((s, t) => s + t.tradeVolumeUsd, 0),
        earnedUsd:    fTrades.reduce((s, t) => s + t.referralUsd, 0),
      };
    });

    res.json({
      refCode,
      friendCount:    friends.length,
      totalEarnedUsd,
      pendingUsd,
      paidOutUsd,
      friends:        friendStats,
      payouts:        payouts.map(p => ({
        id:        p.id,
        amountSol: p.amountSol,
        amountUsd: p.amountUsd,
        txHash:    p.txHash,
        createdAt: p.createdAt,
      })),
      recentTrades: trades.slice(0, 20).map(t => ({
        from:           `${t.refereeAddress.slice(0, 4)}…${t.refereeAddress.slice(-4)}`,
        volumeUsd:      t.tradeVolumeUsd,
        referralUsd:    t.referralUsd,
        txHash:         t.txHash,
        paid:           t.paid,
        createdAt:      t.createdAt,
      })),
    });
  } catch (err) {
    console.error("[referral/stats]", err);
    res.status(500).json({ error: "Internal error" });
  }
});

export default router;
