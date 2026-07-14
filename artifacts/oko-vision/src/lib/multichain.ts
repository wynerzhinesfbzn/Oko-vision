/**
 * Multi-chain wallet derivation from BIP39 mnemonic.
 * EVM chains (ETH/BSC/Base/Arbitrum/Polygon): m/44'/60'/0'/0/0 → same address on all.
 * Tron: same private key, different address encoding (0x41 prefix + base58check).
 */
import { HDNodeWallet, Mnemonic, getBytes, keccak256 } from "ethers";

// ── EVM ──────────────────────────────────────────────────────────────────────

export function deriveEvmAddress(mnemonic: string): string {
  const mnObj = Mnemonic.fromPhrase(mnemonic);
  const wallet = HDNodeWallet.fromMnemonic(mnObj, "m/44'/60'/0'/0/0");
  return wallet.address;
}

export function deriveEvmPrivateKey(mnemonic: string): string {
  const mnObj = Mnemonic.fromPhrase(mnemonic);
  const wallet = HDNodeWallet.fromMnemonic(mnObj, "m/44'/60'/0'/0/0");
  return wallet.privateKey;
}

// ── Tron ──────────────────────────────────────────────────────────────────────
// Tron uses the same secp256k1 curve, different derivation path + address encoding.

async function sha256once(data: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", data);
}

async function sha256twice(data: Uint8Array): Promise<Uint8Array> {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const h1 = await sha256once(buf);
  const h2 = await sha256once(h1);
  return new Uint8Array(h2);
}

const BASE58_CHARS = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let result = "";
  while (n > 0n) {
    result = BASE58_CHARS[Number(n % 58n)] + result;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    result = "1" + result;
  }
  return result;
}

export async function deriveTronAddress(mnemonic: string): Promise<string> {
  const mnObj = Mnemonic.fromPhrase(mnemonic);
  // Use Tron derivation path m/44'/195'/0'/0/0
  const wallet = HDNodeWallet.fromMnemonic(mnObj, "m/44'/195'/0'/0/0");
  // Uncompressed public key (65 bytes starting with 0x04)
  const pubKey = getBytes(wallet.signingKey.publicKey);
  // keccak256 of the last 64 bytes (strip 0x04 prefix)
  const hash = getBytes(keccak256(pubKey.slice(1)));
  // Take last 20 bytes
  const addrBytes = hash.slice(12);
  // Tron prefix 0x41
  const tronRaw = new Uint8Array([0x41, ...addrBytes]);
  // Base58Check: append 4-byte checksum
  const checksum = (await sha256twice(tronRaw)).slice(0, 4);
  return base58encode(new Uint8Array([...tronRaw, ...checksum]));
}

// ── Chain configs ─────────────────────────────────────────────────────────────

export interface ChainConfig {
  id: string;
  name: string;
  symbol: string;
  icon: string;
  color: string;
  rpc: string;
  explorer: string;
  explorerTx: string;
  type: "evm" | "tron";
  decimals: number;
}

export const CHAINS: ChainConfig[] = [
  {
    id: "ethereum",
    name: "Ethereum",
    symbol: "ETH",
    icon: "Ξ",
    color: "#627EEA",
    rpc: "https://cloudflare-eth.com",
    explorer: "https://etherscan.io/address/",
    explorerTx: "https://etherscan.io/tx/",
    type: "evm",
    decimals: 18,
  },
  {
    id: "bsc",
    name: "BNB Chain",
    symbol: "BNB",
    icon: "⬡",
    color: "#F3BA2F",
    rpc: "https://bsc-dataseed.binance.org",
    explorer: "https://bscscan.com/address/",
    explorerTx: "https://bscscan.com/tx/",
    type: "evm",
    decimals: 18,
  },
  {
    id: "base",
    name: "Base",
    symbol: "ETH",
    icon: "🔵",
    color: "#0052FF",
    rpc: "https://mainnet.base.org",
    explorer: "https://basescan.org/address/",
    explorerTx: "https://basescan.org/tx/",
    type: "evm",
    decimals: 18,
  },
  {
    id: "arbitrum",
    name: "Arbitrum",
    symbol: "ETH",
    icon: "△",
    color: "#28A0F0",
    rpc: "https://arb1.arbitrum.io/rpc",
    explorer: "https://arbiscan.io/address/",
    explorerTx: "https://arbiscan.io/tx/",
    type: "evm",
    decimals: 18,
  },
  {
    id: "polygon",
    name: "Polygon",
    symbol: "POL",
    icon: "⬟",
    color: "#8247E5",
    rpc: "https://polygon-rpc.com",
    explorer: "https://polygonscan.com/address/",
    explorerTx: "https://polygonscan.com/tx/",
    type: "evm",
    decimals: 18,
  },
  {
    id: "tron",
    name: "Tron",
    symbol: "TRX",
    icon: "⬡",
    color: "#FF0013",
    rpc: "",
    explorer: "https://tronscan.org/#/address/",
    explorerTx: "https://tronscan.org/#/transaction/",
    type: "tron",
    decimals: 6,
  },
];

// ── Balance fetching ──────────────────────────────────────────────────────────

async function fetchEvmBalance(address: string, rpc: string): Promise<number> {
  const res = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_getBalance",
      params: [address, "latest"],
      id: 1,
    }),
  });
  const json = await res.json() as any;
  const hex: string = json?.result ?? "0x0";
  const wei = BigInt(hex);
  return Number(wei) / 1e18;
}

async function fetchTronBalance(address: string): Promise<number> {
  const res = await fetch(`https://api.trongrid.io/v1/accounts/${address}`, {
    headers: { accept: "application/json" },
  });
  const json = await res.json() as any;
  const sun: number = json?.data?.[0]?.balance ?? 0;
  return sun / 1_000_000;
}

export interface ChainBalance {
  chainId: string;
  balance: number;
  loading: boolean;
  error: boolean;
}

export async function fetchChainBalance(chain: ChainConfig, address: string): Promise<number> {
  if (chain.type === "evm") {
    return fetchEvmBalance(address, chain.rpc);
  } else {
    return fetchTronBalance(address);
  }
}

// ── Price fetching (CoinGecko) ────────────────────────────────────────────────

const COINGECKO_IDS: Record<string, string> = {
  ethereum: "ethereum",
  bsc:      "binancecoin",
  base:     "ethereum",
  arbitrum: "ethereum",
  polygon:  "matic-network",
  tron:     "tron",
};

let priceCache: Record<string, number> = {};
let priceCacheTs = 0;

export async function fetchChainPrices(): Promise<Record<string, number>> {
  if (Date.now() - priceCacheTs < 60_000) return priceCache;
  const ids = [...new Set(Object.values(COINGECKO_IDS))].join(",");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
    );
    const json = await res.json() as any;
    const result: Record<string, number> = {};
    for (const [chainId, geckoId] of Object.entries(COINGECKO_IDS)) {
      result[chainId] = json?.[geckoId]?.usd ?? 0;
    }
    priceCache = result;
    priceCacheTs = Date.now();
    return result;
  } catch {
    return priceCache;
  }
}
