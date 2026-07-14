/**
 * Solana Wallet Adapter Provider
 *
 * Supports: Phantom, Solflare, Torus, Ledger, and 15+ more wallets.
 * Backpack and other wallets auto-detected via wallet-standard protocol.
 */

import { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter }  from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { TorusWalletAdapter }    from "@solana/wallet-adapter-torus";
import { LedgerWalletAdapter }   from "@solana/wallet-adapter-ledger";

import "@solana/wallet-adapter-react-ui/styles.css";

const RPC_ENDPOINT = "https://api.mainnet-beta.solana.com";

export function SolanaWalletProvider({ children }: { children: ReactNode }) {
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
      new TorusWalletAdapter(),
      new LedgerWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={RPC_ENDPOINT}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
