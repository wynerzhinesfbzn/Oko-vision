/**
 * Privy Wallet Bridge
 *
 * To activate Privy embedded wallets:
 * 1. Create an account at https://privy.io and get your App ID
 * 2. Replace "YOUR_PRIVY_APP_ID" below with your actual App ID
 * 3. The "Create New Wallet" button will automatically work with email/Google/Telegram/Apple
 *
 * Privy handles everything: key generation, cloud backup, and social recovery.
 * Users never see a seed phrase.
 */

import { ReactNode } from "react";

// ── Replace with your actual Privy App ID ──────────────────────────────────
export const PRIVY_APP_ID = "clrk0f4mb034dp40fy8nz8p9y"; // placeholder
// ──────────────────────────────────────────────────────────────────────────────

// Lazy-load PrivyProvider to avoid breaking build when Privy is not configured
let PrivyProvider: React.ComponentType<{ appId: string; config?: object; children: ReactNode }> | null = null;

try {
  // @ts-expect-error — optional dependency, not installed
  const privy = await import("@privy-io/react-auth");
  PrivyProvider = privy.PrivyProvider as any;
} catch {
  PrivyProvider = null;
}

export function PrivyBridgeProvider({ children }: { children: ReactNode }) {
  if (!PrivyProvider) return <>{children}</>;

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#C9A84C",
          logo: "https://oko-vision.replit.app/favicon.svg",
        },
        embeddedWallets: {
          createOnLogin: "users-without-wallets",
          requireUserPasswordOnCreate: false,
        },
        loginMethods: ["email", "google", "telegram", "apple"],
        defaultChain: {
          id: 101,
          name: "Solana Mainnet",
          network: "mainnet-beta",
          nativeCurrency: { name: "SOL", symbol: "SOL", decimals: 9 },
          rpcUrls: { default: { http: ["https://api.mainnet-beta.solana.com"] } },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
