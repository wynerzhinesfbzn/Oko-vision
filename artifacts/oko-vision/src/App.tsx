import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OkoWalletProvider, useOkoWallet } from "@/context/WalletContext";
import { SolanaWalletProvider }  from "@/context/SolanaWalletProvider";
import { TradingProvider }       from "@/context/TradingContext";
import { BalanceProvider }       from "@/context/BalanceContext";
import { EVMWalletProvider }     from "@/context/EVMWalletContext";
import { initTheme }             from "@/lib/themes";
import { saveRefCode, registerReferral, ensureRefLinkRegistered } from "@/lib/referral";
import PositionMonitor from "@/components/PositionMonitor";
import AutoTrader from "@/components/AutoTrader";

import Home from "@/pages/Home";

const WalletSelect      = lazy(() => import("@/pages/WalletSelect"));
const WalletDashboard   = lazy(() => import("@/pages/WalletDashboard"));
const Markets           = lazy(() => import("@/pages/Markets"));
const Signals           = lazy(() => import("@/pages/Signals"));
const Portfolio         = lazy(() => import("@/pages/Portfolio"));
const Trading           = lazy(() => import("@/pages/Trading"));
const Leaderboard       = lazy(() => import("@/pages/Leaderboard"));
const Referral          = lazy(() => import("@/pages/Referral"));
const Bridge            = lazy(() => import("@/pages/Bridge"));
const Backtesting       = lazy(() => import("@/pages/Backtesting"));
const MultiChainWallet  = lazy(() => import("@/pages/MultiChainWallet"));
const RobinhoodWallet   = lazy(() => import("@/pages/RobinhoodWallet"));
const NotFound          = lazy(() => import("@/pages/not-found"));

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

function PageLoader() {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: "#080808" }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: "2px solid rgba(201,168,76,0.12)", borderTopColor: "#C9A84C", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function WalletRoute() {
  const { connected } = useOkoWallet();
  return connected ? <WalletDashboard /> : <WalletSelect />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/"             component={Home} />
        <Route path="/wallet"       component={WalletRoute} />
        <Route path="/markets"      component={Markets} />
        <Route path="/portfolio"    component={Portfolio} />
        <Route path="/trading"      component={Trading} />
        <Route path="/leaderboard"  component={Leaderboard} />
        <Route path="/referral"     component={Referral} />
        <Route path="/bridge"       component={Bridge} />
        <Route path="/backtesting"  component={Backtesting} />
        <Route path="/multichain"   component={MultiChainWallet} />
        <Route path="/robinhood"    component={RobinhoodWallet} />
        <Route path="/signals"      component={Signals} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function ReferralBridge() {
  const { address, connected } = useOkoWallet();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (ref) saveRefCode(ref);
  }, []);
  useEffect(() => {
    if (!connected || !address) return;
    ensureRefLinkRegistered(address);
    registerReferral(address);
  }, [connected, address]);
  return null;
}

function App() {
  useEffect(() => { initTheme(); }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <SolanaWalletProvider>
        <OkoWalletProvider>
          <BalanceProvider>
            <TradingProvider>
              <EVMWalletProvider>
                <PositionMonitor />
                <AutoTrader />
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <ReferralBridge />
                  <Router />
                </WouterRouter>
              </EVMWalletProvider>
            </TradingProvider>
          </BalanceProvider>
        </OkoWalletProvider>
      </SolanaWalletProvider>
    </QueryClientProvider>
  );
}

export default App;
