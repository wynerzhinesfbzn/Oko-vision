import {
  createContext, useContext, useState, useEffect, useCallback, ReactNode,
} from "react";
import { ethers } from "ethers";
import { encryptPrivateKey, decryptPrivateKey, EncryptedPayload } from "@/lib/evmCrypto";

/* ── Robinhood Chain constants ──────────────────────────────── */
export const RH_CHAIN_ID   = 4663;
export const RH_RPC        = "https://rpc.mainnet.chain.robinhood.com";
export const RH_EXPLORER   = "https://explorer.chain.robinhood.com";
export const RH_NETWORK    = { name: "robinhood", chainId: RH_CHAIN_ID };

/* ── Storage keys ───────────────────────────────────────────── */
const SK_ADDRESS   = "hofire-evm-address";
const SK_ENCRYPTED = "hofire-evm-encrypted";   // JSON of EncryptedPayload
const SK_TX_LIST   = "hofire-evm-txlist";

/* ── Types ──────────────────────────────────────────────────── */
export interface EVMTxRecord {
  hash:      string;
  to:        string;
  value:     string;   // in ETH
  timestamp: number;
  status:    "confirmed" | "failed";
}

export interface EVMWalletState {
  address:        string | null;
  shortAddress:   string | null;
  balance:        string | null;    // formatted ETH
  balanceLoading: boolean;
  txHistory:      EVMTxRecord[];
  locked:         boolean;          // key encrypted but not yet unlocked
  hasWallet:      boolean;

  /* actions */
  createWallet:       (password: string) => Promise<{ mnemonic: string; address: string }>;
  importFromPhrase:   (phrase: string, password: string) => Promise<string>;
  importFromKey:      (pk: string, password: string) => Promise<string>;
  unlock:             (password: string) => Promise<void>;
  lock:               () => void;
  disconnect:         () => void;
  refreshBalance:     () => Promise<void>;
  sendTransaction:    (to: string, amountEth: string) => Promise<string>;
  getProvider:        () => ethers.JsonRpcProvider;
}

/* ── Context ────────────────────────────────────────────────── */
const Ctx = createContext<EVMWalletState | null>(null);

export function useEVMWallet() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useEVMWallet outside EVMWalletProvider");
  return c;
}

/* ── Helpers ────────────────────────────────────────────────── */
function short(a: string) { return `${a.slice(0, 6)}…${a.slice(-4)}`; }
function loadTxList(): EVMTxRecord[] {
  try { return JSON.parse(localStorage.getItem(SK_TX_LIST) ?? "[]"); } catch { return []; }
}
function saveTxList(l: EVMTxRecord[]) {
  localStorage.setItem(SK_TX_LIST, JSON.stringify(l.slice(0, 100)));
}

/* ── Provider ───────────────────────────────────────────────── */
export function EVMWalletProvider({ children }: { children: ReactNode }) {
  const [address,        setAddress]        = useState<string | null>(() => localStorage.getItem(SK_ADDRESS));
  const [balance,        setBalance]        = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [txHistory,      setTxHistory]      = useState<EVMTxRecord[]>(loadTxList);
  const [privateKeyMem,  setPrivateKeyMem]  = useState<string | null>(null);  // decrypted key in memory only

  const hasWallet = !!localStorage.getItem(SK_ENCRYPTED);
  const locked    = hasWallet && !privateKeyMem;
  const shortAddress = address ? short(address) : null;

  /* ── provider factory ──────────────────────────────────────── */
  const getProvider = useCallback(() =>
    new ethers.JsonRpcProvider(RH_RPC, RH_NETWORK, { staticNetwork: true }),
    []
  );

  /* ── balance refresh ────────────────────────────────────────── */
  const refreshBalance = useCallback(async () => {
    if (!address) return;
    setBalanceLoading(true);
    try {
      const p = getProvider();
      const raw = await p.getBalance(address);
      setBalance(ethers.formatEther(raw));
    } catch (e) {
      console.warn("[EVM] balance error", e);
    } finally {
      setBalanceLoading(false);
    }
  }, [address, getProvider]);

  useEffect(() => { if (address) refreshBalance(); }, [address]);

  /* ── persist helpers ────────────────────────────────────────── */
  async function storeWallet(wallet: ethers.Wallet, password: string) {
    const payload = await encryptPrivateKey(wallet.privateKey, password);
    localStorage.setItem(SK_ADDRESS,   wallet.address);
    localStorage.setItem(SK_ENCRYPTED, JSON.stringify(payload));
    setAddress(wallet.address);
    setPrivateKeyMem(wallet.privateKey);
  }

  /* ── create ─────────────────────────────────────────────────── */
  const createWallet = async (password: string) => {
    const w = ethers.Wallet.createRandom();
    await storeWallet(w, password);
    const mnemonic = (w as ethers.HDNodeWallet).mnemonic?.phrase ?? "";
    return { mnemonic, address: w.address };
  };

  /* ── import phrase ──────────────────────────────────────────── */
  const importFromPhrase = async (phrase: string, password: string) => {
    const w = ethers.Wallet.fromPhrase(phrase.trim());
    await storeWallet(w, password);
    return w.address;
  };

  /* ── import private key ─────────────────────────────────────── */
  const importFromKey = async (pk: string, password: string) => {
    const w = new ethers.Wallet(pk.trim());
    await storeWallet(w, password);
    return w.address;
  };

  /* ── unlock ─────────────────────────────────────────────────── */
  const unlock = async (password: string) => {
    const raw = localStorage.getItem(SK_ENCRYPTED);
    if (!raw) throw new Error("Нет сохранённого кошелька");
    const payload: EncryptedPayload = JSON.parse(raw);
    const pk = await decryptPrivateKey(payload, password);   // throws if wrong password
    setPrivateKeyMem(pk);
    // derive address from key to verify
    const w = new ethers.Wallet(pk);
    setAddress(w.address);
  };

  /* ── lock ────────────────────────────────────────────────────── */
  const lock = () => setPrivateKeyMem(null);

  /* ── disconnect / remove ─────────────────────────────────────── */
  const disconnect = () => {
    localStorage.removeItem(SK_ADDRESS);
    localStorage.removeItem(SK_ENCRYPTED);
    localStorage.removeItem(SK_TX_LIST);
    setAddress(null);
    setBalance(null);
    setPrivateKeyMem(null);
    setTxHistory([]);
  };

  /* ── send transaction ────────────────────────────────────────── */
  const sendTransaction = async (to: string, amountEth: string): Promise<string> => {
    if (!privateKeyMem) throw new Error("Кошелёк заблокирован — введите пароль");
    if (!ethers.isAddress(to)) throw new Error("Неверный адрес получателя");

    const p      = getProvider();
    const signer = new ethers.Wallet(privateKeyMem, p);
    const value  = ethers.parseEther(amountEth);

    // Estimate gas + get fee data
    const feeData = await p.getFeeData();
    const gasLimit = await p.estimateGas({ to, value, from: signer.address }).catch(() => 21000n);

    const tx = await signer.sendTransaction({
      to,
      value,
      gasLimit,
      maxFeePerGas:         feeData.maxFeePerGas         ?? undefined,
      maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? undefined,
    });

    // Record immediately as pending, update after confirmation
    const rec: EVMTxRecord = {
      hash:      tx.hash,
      to,
      value:     amountEth,
      timestamp: Date.now(),
      status:    "confirmed",
    };
    const updated = [rec, ...txHistory];
    saveTxList(updated);
    setTxHistory(updated);

    // Wait for 1 confirmation in background
    tx.wait(1).then(() => refreshBalance()).catch(console.warn);

    return tx.hash;
  };

  const value: EVMWalletState = {
    address, shortAddress, balance, balanceLoading,
    txHistory, locked, hasWallet,
    createWallet, importFromPhrase, importFromKey,
    unlock, lock, disconnect, refreshBalance, sendTransaction, getProvider,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
