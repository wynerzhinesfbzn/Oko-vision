import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
  createRealWallet,
  importRealWallet,
  importFromPrivateKey,
  getRealBalance,
  sendRealTransaction,
  sendTokenTransaction,
} from '@/utils/wallet';

export interface EVMWallet {
  address:      string;
  shortAddress: string;
  mnemonic:     string | null;
  privateKey:   string | null;
}

export interface TxRecord {
  hash:      string;
  to:        string;
  amount:    string;
  token:     string;    // 'ETH' or token symbol
  timestamp: number;
  status:    'pending' | 'confirmed' | 'failed';
}

interface EVMWalletContextType {
  wallet:       EVMWallet | null;
  balance:      string | null;
  balanceUsd:   number | null;
  ethPrice:     number | null;
  loading:      boolean;
  error:        string | null;
  txHistory:    TxRecord[];
  createNewWallet:   () => EVMWallet;
  importWallet:      (phrase: string) => EVMWallet | null;
  importPrivateKey:  (pk: string) => EVMWallet | null;
  refreshBalance:    () => Promise<void>;
  sendETH:           (to: string, amount: string) => Promise<string>;
  sendToken:         (tokenAddress: string, to: string, amount: string) => Promise<string>;
  disconnectWallet:  () => void;
}

const EVMWalletContext = createContext<EVMWalletContextType | null>(null);

const STORAGE_KEY  = 'oko-evm-wallet';
const HISTORY_KEY  = 'oko-evm-history';

function short(addr: string) { return `${addr.slice(0, 6)}...${addr.slice(-4)}`; }
function saveWallet(w: EVMWallet) { localStorage.setItem(STORAGE_KEY, JSON.stringify(w)); }
function loadWallet(): EVMWallet | null {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'); } catch { return null; }
}
function loadHistory(): TxRecord[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]'); } catch { return []; }
}
function pushHistory(rec: TxRecord) {
  const h = loadHistory();
  h.unshift(rec);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 50)));
}

export function EVMWalletProvider({ children }: { children: ReactNode }) {
  const [wallet,     setWallet]     = useState<EVMWallet | null>(null);
  const [balance,    setBalance]    = useState<string | null>(null);
  const [balanceUsd, setBalanceUsd] = useState<number | null>(null);
  const [ethPrice,   setEthPrice]   = useState<number | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [txHistory,  setTxHistory]  = useState<TxRecord[]>(loadHistory);

  // ── helpers ────────────────────────────────────────────────────────
  function applyWallet(w: EVMWallet) { saveWallet(w); setWallet(w); }

  // ── wallet creation / import ────────────────────────────────────────
  const createNewWallet = (): EVMWallet => {
    const raw = createRealWallet();
    const w: EVMWallet = { address: raw.address, shortAddress: short(raw.address), mnemonic: raw.mnemonic, privateKey: raw.privateKey };
    applyWallet(w);
    return w;
  };

  const importWallet = (phrase: string): EVMWallet | null => {
    try {
      const raw = importRealWallet(phrase);
      const w: EVMWallet = { address: raw.address, shortAddress: short(raw.address), mnemonic: raw.mnemonic, privateKey: raw.privateKey };
      applyWallet(w);
      return w;
    } catch (e: any) { setError(e.message); return null; }
  };

  const importPrivateKey = (pk: string): EVMWallet | null => {
    try {
      const raw = importFromPrivateKey(pk);
      const w: EVMWallet = { address: raw.address, shortAddress: short(raw.address), mnemonic: null, privateKey: raw.privateKey };
      applyWallet(w);
      return w;
    } catch (e: any) { setError(e.message); return null; }
  };

  // ── balance refresh ─────────────────────────────────────────────────
  const refreshBalance = useCallback(async () => {
    if (!wallet) return;
    setLoading(true);
    setError(null);
    try {
      // ETH price from CoinGecko (public, no key)
      const priceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd');
      if (priceRes.ok) {
        const pd = await priceRes.json();
        const p = pd?.ethereum?.usd ?? null;
        setEthPrice(p);
        const bal = await getRealBalance(wallet.address);
        setBalance(bal);
        if (p) setBalanceUsd(parseFloat(bal) * p);
      } else {
        const bal = await getRealBalance(wallet.address);
        setBalance(bal);
      }
    } catch (e: any) {
      setBalance('0.0');
      setError('RPC недоступен — данные могут быть устаревшими');
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  // ── send ETH ────────────────────────────────────────────────────────
  const sendETH = async (to: string, amount: string): Promise<string> => {
    if (!wallet?.privateKey) throw new Error('Нет приватного ключа');
    setLoading(true);
    try {
      const hash = await sendRealTransaction(wallet.privateKey, to, amount);
      const rec: TxRecord = { hash, to, amount, token: 'ETH', timestamp: Date.now(), status: 'confirmed' };
      pushHistory(rec);
      setTxHistory(loadHistory());
      await refreshBalance();
      return hash;
    } catch (e: any) {
      throw new Error(e.message ?? 'Ошибка транзакции');
    } finally {
      setLoading(false);
    }
  };

  // ── send ERC-20 token ────────────────────────────────────────────────
  const sendToken = async (tokenAddress: string, to: string, amount: string): Promise<string> => {
    if (!wallet?.privateKey) throw new Error('Нет приватного ключа');
    setLoading(true);
    try {
      const hash = await sendTokenTransaction(wallet.privateKey, tokenAddress, to, amount);
      const rec: TxRecord = { hash, to, amount, token: tokenAddress, timestamp: Date.now(), status: 'confirmed' };
      pushHistory(rec);
      setTxHistory(loadHistory());
      return hash;
    } finally {
      setLoading(false);
    }
  };

  // ── disconnect ────────────────────────────────────────────────────────
  const disconnectWallet = () => {
    localStorage.removeItem(STORAGE_KEY);
    setWallet(null); setBalance(null); setBalanceUsd(null); setTxHistory([]);
  };

  // ── init ──────────────────────────────────────────────────────────────
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
      wallet, balance, balanceUsd, ethPrice, loading, error, txHistory,
      createNewWallet, importWallet, importPrivateKey,
      refreshBalance, sendETH, sendToken, disconnectWallet,
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
