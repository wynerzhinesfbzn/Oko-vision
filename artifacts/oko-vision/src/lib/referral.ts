/**
 * Real referral API client — connects to the api-server backend.
 * Referral code is stored in localStorage["oko-ref"].
 * On first wallet connect → register relationship with backend.
 * After every swap → report trade volume → triggers auto-payout.
 */

const API = "/api/referral";

export function getStoredRefCode(): string | null {
  return localStorage.getItem("oko-ref");
}

export function saveRefCode(code: string) {
  localStorage.setItem("oko-ref", code);
}

export function buildRefCode(address: string): string {
  return `OKO-${address.slice(0, 4).toUpperCase()}${address.slice(-4).toUpperCase()}`;
}

export function buildRefLink(address: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/?ref=${buildRefCode(address)}`;
}

// Ensure our own ref link is registered in DB
export async function ensureRefLinkRegistered(referrerAddress: string): Promise<void> {
  try {
    const refCode = buildRefCode(referrerAddress);
    await fetch(`${API}/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referrerAddress, refCode }),
    });
  } catch {}
}

// Register a referral relationship (referee → referrer)
export async function registerReferral(refereeAddress: string): Promise<void> {
  const refCode = getStoredRefCode();
  if (!refCode) return;
  try {
    const res = await fetch(`${API}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refCode, refereeAddress }),
    });
    if (res.ok) {
      localStorage.removeItem("oko-ref");
    }
  } catch {}
}

// Report a trade (triggers auto-payout if threshold reached)
export async function reportTrade(refereeAddress: string, tradeVolumeUsd: number, txHash: string): Promise<void> {
  if (!refereeAddress || tradeVolumeUsd <= 0) return;
  try {
    await fetch(`${API}/trade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refereeAddress, tradeVolumeUsd, txHash }),
    });
  } catch {}
}

export interface ReferralFriend {
  address:    string;
  shortAddr:  string;
  joinedAt:   number;
  tradeCount: number;
  volumeUsd:  number;
  earnedUsd:  number;
}

export interface ReferralPayout {
  id:        string;
  amountSol: number;
  amountUsd: number;
  txHash:    string;
  createdAt: number;
}

export interface RecentTrade {
  from:        string;
  volumeUsd:   number;
  referralUsd: number;
  txHash:      string;
  paid:        boolean;
  createdAt:   number;
}

export interface ReferralStats {
  refCode:        string | null;
  friendCount:    number;
  totalEarnedUsd: number;
  pendingUsd:     number;
  paidOutUsd:     number;
  friends:        ReferralFriend[];
  payouts:        ReferralPayout[];
  recentTrades:   RecentTrade[];
}

export async function fetchReferralStats(address: string): Promise<ReferralStats | null> {
  try {
    const res = await fetch(`${API}/stats/${address}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
