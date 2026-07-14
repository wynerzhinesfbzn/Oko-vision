import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type WalletType = "generated" | "adapter" | null;

export interface StoredWalletInfo {
  address: string;
  name:    string;
  type:    "generated" | "adapter";
  createdAt: number;
}

export interface WalletState {
  connected:       boolean;
  walletType:      WalletType;
  address:         string | null;
  shortAddress:    string | null;
  connecting:      boolean;
  wallets:         StoredWalletInfo[];
  disconnectWallet: () => void;
  setConnected:    (type: "generated" | "adapter", address: string, name?: string) => void;
  switchWallet:    (address: string) => void;
  renameWallet:    (address: string, name: string) => void;
  removeWallet:    (address: string) => void;
}

const WalletCtx = createContext<WalletState>({
  connected: false, walletType: null, address: null, shortAddress: null, connecting: false, wallets: [],
  disconnectWallet: () => {}, setConnected: () => {}, switchWallet: () => {}, renameWallet: () => {}, removeWallet: () => {},
});

function loadWallets(): StoredWalletInfo[] {
  try { return JSON.parse(localStorage.getItem("oko-wallets-list") ?? "[]"); } catch { return []; }
}
function saveWallets(list: StoredWalletInfo[]) {
  localStorage.setItem("oko-wallets-list", JSON.stringify(list));
}

export function OkoWalletProvider({ children }: { children: ReactNode }) {
  const [connected, setConnectedState] = useState(false);
  const [walletType, setWalletType]   = useState<WalletType>(null);
  const [address, setAddress]         = useState<string | null>(null);
  const [connecting]                  = useState(false);
  const [wallets, setWallets]         = useState<StoredWalletInfo[]>([]);

  const shortAddress = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : null;

  // Restore on load
  useEffect(() => {
    const list = loadWallets();
    setWallets(list);
    const active = localStorage.getItem("oko-active-wallet");
    const legacyRaw = localStorage.getItem("oko-wallet");

    if (active) {
      const w = list.find(w => w.address === active);
      if (w) {
        setAddress(w.address); setWalletType(w.type); setConnectedState(true); return;
      }

      // Active wallet not in list — try to recover type from keystore (oko-wallet-{address})
      try {
        const keystoreRaw = localStorage.getItem(`oko-wallet-${active}`);
        if (keystoreRaw) {
          const ks = JSON.parse(keystoreRaw);
          const recoveredType: "generated" | "adapter" = ks.type === "generated" ? "generated" : "adapter";
          setAddress(active); setWalletType(recoveredType); setConnectedState(true);
          // Add to list so future restores work
          const name = `SOL Account ${list.filter(w => w.type === "generated").length + 1}`;
          const updated = [...list, { address: active, name, type: recoveredType, createdAt: Date.now() }];
          saveWallets(updated); setWallets(updated);
          return;
        }
      } catch {}
    }

    if (legacyRaw) {
      try {
        const { type, addr } = JSON.parse(legacyRaw);
        if (type && addr) {
          setAddress(addr); setWalletType(type as WalletType); setConnectedState(true);
          if (!list.find(w => w.address === addr)) {
            const updated = [...list, { address: addr, name: "SOL Account 1", type: type as "generated" | "adapter", createdAt: Date.now() }];
            saveWallets(updated); setWallets(updated);
            localStorage.setItem("oko-active-wallet", addr);
            localStorage.removeItem("oko-wallet");
          }
        }
      } catch {}
    }
  }, []);

  const setConnected = (type: "generated" | "adapter", addr: string, name?: string) => {
    setWalletType(type); setAddress(addr); setConnectedState(true);
    localStorage.setItem("oko-active-wallet", addr);
    setWallets(prev => {
      const existing = prev.find(w => w.address === addr);
      if (existing) return prev;
      const n = name ?? `SOL Account ${prev.filter(w => w.type === "generated").length + 1}`;
      const updated = [...prev, { address: addr, name: n, type, createdAt: Date.now() }];
      saveWallets(updated); return updated;
    });
  };

  const switchWallet = (addr: string) => {
    const w = wallets.find(x => x.address === addr);
    if (!w) return;
    setAddress(w.address); setWalletType(w.type); setConnectedState(true);
    localStorage.setItem("oko-active-wallet", addr);
  };

  const renameWallet = (addr: string, name: string) => {
    setWallets(prev => {
      const updated = prev.map(w => w.address === addr ? { ...w, name } : w);
      saveWallets(updated); return updated;
    });
  };

  const disconnectWallet = () => {
    setConnectedState(false); setWalletType(null); setAddress(null);
    localStorage.removeItem("oko-active-wallet");
    localStorage.removeItem("oko-wallet");
  };

  const removeWallet = (addr: string) => {
    // Remove keystore data
    localStorage.removeItem(`oko-wallet-${addr}`);
    // Update wallets list
    setWallets(prev => {
      const updated = prev.filter(w => w.address !== addr);
      saveWallets(updated);
      return updated;
    });
    // If removed wallet was active, switch to another or disconnect
    if (address === addr) {
      const remaining = wallets.filter(w => w.address !== addr);
      if (remaining.length > 0) {
        const next = remaining[0];
        setAddress(next.address); setWalletType(next.type); setConnectedState(true);
        localStorage.setItem("oko-active-wallet", next.address);
      } else {
        setConnectedState(false); setWalletType(null); setAddress(null);
        localStorage.removeItem("oko-active-wallet");
      }
    }
  };

  return (
    <WalletCtx.Provider value={{ connected, walletType, address, shortAddress, connecting, wallets, disconnectWallet, setConnected, switchWallet, renameWallet, removeWallet }}>
      {children}
    </WalletCtx.Provider>
  );
}

export function useOkoWallet() { return useContext(WalletCtx); }
