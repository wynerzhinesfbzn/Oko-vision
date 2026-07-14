import { pgTable, text, integer, bigint, boolean, real } from "drizzle-orm/pg-core";

export const referralLinks = pgTable("referral_links", {
  refCode:         text("ref_code").primaryKey(),
  referrerAddress: text("referrer_address").notNull(),
  createdAt:       bigint("created_at", { mode: "number" }).notNull(),
});

export const referralRelations = pgTable("referral_relations", {
  refereeAddress:  text("referee_address").primaryKey(),
  referrerAddress: text("referrer_address").notNull(),
  refCode:         text("ref_code").notNull(),
  createdAt:       bigint("created_at", { mode: "number" }).notNull(),
});

export const referralTrades = pgTable("referral_trades", {
  id:              text("id").primaryKey(),
  refereeAddress:  text("referee_address").notNull(),
  referrerAddress: text("referrer_address").notNull(),
  tradeVolumeUsd:  real("trade_volume_usd").notNull(),
  referralUsd:     real("referral_usd").notNull(),
  txHash:          text("tx_hash").notNull(),
  createdAt:       bigint("created_at", { mode: "number" }).notNull(),
  paid:            boolean("paid").notNull().default(false),
});

export const referralPayouts = pgTable("referral_payouts", {
  id:              text("id").primaryKey(),
  referrerAddress: text("referrer_address").notNull(),
  amountSol:       real("amount_sol").notNull(),
  amountUsd:       real("amount_usd").notNull(),
  txHash:          text("tx_hash").notNull(),
  createdAt:       bigint("created_at", { mode: "number" }).notNull(),
});
