import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ethers } from 'ethers';

// Robinhood Chain public RPC (EVM-compatible)
const ROBINHOOD_RPC = 'https://rpc.mainnet.chain.robinhood.com';
const ROBINHOOD_CHAIN_ID = 4663;

export interface EVMWallet {
  address: string;
  shortAddress: string;
  mnemonic: string | null;
  privateKey: string | null;
}

interface EVMWalletContextType {
  wallet: EVMWallet | null;
  balance: string | null;          // ETH balance as formatted string
  balanceUsd: number | null;       // USD value (fetched from price API)
  ethPrice: number | null;
  loading: boolean;
  error: string | null;
  createNewWallet: () => EVMWallet;
  importWallet: (phrase: string) => EVMWallet | null;
  importPrivateKey: (pk: string) => EVMWallet | null;
  refreshBalance: () => Promise<void>;
  disconnectWallet: () => void;
}

const EVMWalletContext = createContext<EVMWalletContextType | null>(null);

const STORAGE_KEY = 'oko-evm-wallet';

function short(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function saveWallet(w: EVMWallet) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(w));
}

function loadWallet(): EVMWallet | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EVMWallet) : null;
  } catch { return null; }
}

export function EVMWalletProvider({ children }: { children: ReactNode }) {
  const [wallet,     setWallet]     = useState<EVMWallet | null>(null);
  const [balance,    setBalance]    = useState<string | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [ethPrice,   setEthPrice]   = useState<number | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // ── helpers ──────────────────────────────────────────────────────
  function buildWallet(raw: ethers.HDNodeWallet | ethers.Wallet): EVMWallet {
    return {
      address:      raw.address,
      shortAddress: short(raw.address),
      mnemonic:     (raw as ethers.HDNodeWallet).mnemonic?.phrase ?? null,
      privateKey:   raw.privateKey,
    };
  }

  // ── public actions ───────────────────────────────────────────────
  const createNewWallet = (): EVMWallet => {
    const raw = ethers.Wallet.createRandom();
    const w   = buildWallet(raw);
    saveWallet(w);
    setWallet(w);
    return w;
  };

  const importWallet = (phrase: string): EVMWallet | null => {
    try {
      const raw = ethers.Wallet.fromPhrase(phrase.trim());
      const w   = buildWallet(raw);
      saveWallet(w);
      setWallet(w);
      return w;
    } catch {
      setError('Неверная мнемоническая фраза');
      return null;
    }
  };

  const importPrivateKey = (pk: string): EVMWallet | null => {
    try {
      const raw = new ethers.Wallet(pk.trim());
      const w: EVMWallet = {
        address:      raw.address,
        shortAddress: short(raw.address),
        mnemonic:     null,
        privateKey:   raw.privateKey,
      };
      saveWallet(w);
      setWallet(w);
      return w;
    } catch {
      setError('Неверный приватный ключ');
      return null;
    }
  };

  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      // ETH price (CoinGecko public API, no key)
      const priceRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd'
      );
      if (priceRes.ok) {
        const pd = await priceRes.json();
        setEthPrice(pd.ethereum?.usd ?? null);
      }

      // Balance via Robinhood RPC
      const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC, {
        name: 'robinhood',
        chainId: ROBINHOOD_CHAIN_ID,
      });
      const raw = await provider.getBalance(wallet.address);
      const fmt = ethers.formatEther(raw);
      setBalance(fmt);
      if (ethPrice) setBalanceUsd(parseFloat(fmt) * ethPrice);
    } catch (e: any) {
      // Fallback: show 0, set error for UI
      setBalance('0.0');
      setError('RPC недоступен — баланс может быть неточным');
    } finally {
      setLoading(false);
    }
  }, [wallet, ethPrice]);

  const disconnectWallet = () => {
    localStorage.removeItem(STORAGE_KEY);
    setWallet(null);
    setBalance(null);
    setBalanceUsd(null);
  };

  // ── init ─────────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadWallet();
    if (saved) setWallet(saved);
  }, []);

  useEffect(() => {
    if (wallet) refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet?.address]);

  return (
    <EVMWalletContext.Provider value={{
      wallet, balance, balanceUsd, ethPrice, loading, error,
      createNewWallet, importWallet, importPrivateKey,
      refreshBalance, disconnectWallet,
    }}>
      {children}
    </EVMWalletContext.Provider>
  );
}

export function useEVMWallet() {
  const ctx = useContext(EVMWalletContext);
  if (!ctx) throw new Error('useEVMWallet must be used within EVMWalletProvider');
  return ctx;
}
