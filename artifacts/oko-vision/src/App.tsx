import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OkoWalletProvider } from "@/context/WalletContext";
import { SolanaWalletProvider } from "@/context/SolanaWalletProvider";
import { TradingProvider } from "@/context/TradingContext";
import { BalanceProvider } from "@/context/BalanceContext";
import { initTheme } from "@/lib/themes";
import WalletApp from "@/wallet/WalletApp";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function App() {
  useEffect(() => { initTheme(); }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SolanaWalletProvider>
        <OkoWalletProvider>
          <BalanceProvider>
            <TradingProvider>
              <WalletApp />
            </TradingProvider>
          </BalanceProvider>
        </OkoWalletProvider>
      </SolanaWalletProvider>
    </QueryClientProvider>
  );
}

export default App;
