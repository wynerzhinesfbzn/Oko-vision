import { ethers } from 'ethers';

const ROBINHOOD_RPC    = 'https://rpc.mainnet.chain.robinhood.com';
const ROBINHOOD_CHAIN  = { name: 'robinhood', chainId: 4663 };

// ── Wallet creation ──────────────────────────────────────────────────
export const createRealWallet = () => {
  const w = ethers.Wallet.createRandom();
  return {
    address:    w.address,
    mnemonic:   (w as ethers.HDNodeWallet).mnemonic?.phrase ?? '',
    privateKey: w.privateKey,
  };
};

// ── Import from 12/24-word phrase (ethers v6) ───────────────────────
export const importRealWallet = (mnemonic: string) => {
  try {
    const w = ethers.Wallet.fromPhrase(mnemonic.trim());
    return {
      address:    w.address,
      mnemonic:   mnemonic.trim(),
      privateKey: w.privateKey,
    };
  } catch {
    throw new Error('Неверная мнемоническая фраза');
  }
};

// ── Import from raw private key ──────────────────────────────────────
export const importFromPrivateKey = (pk: string) => {
  try {
    const w = new ethers.Wallet(pk.trim());
    return { address: w.address, mnemonic: null as string | null, privateKey: w.privateKey };
  } catch {
    throw new Error('Неверный приватный ключ');
  }
};

// ── Real balance via Robinhood Chain RPC ─────────────────────────────
export const getRealBalance = async (address: string): Promise<string> => {
  try {
    const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC, ROBINHOOD_CHAIN);
    const raw = await provider.getBalance(address);
    return ethers.formatEther(raw);
  } catch (e) {
    console.warn('[wallet] balance fetch failed:', (e as Error).message);
    return '0';
  }
};

// ── Real ETH send ────────────────────────────────────────────────────
export const sendRealTransaction = async (
  privateKey: string,
  to: string,
  amount: string,    // in ETH (e.g. "0.01")
): Promise<string> => {
  if (!ethers.isAddress(to)) throw new Error('Неверный адрес получателя');
  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC, ROBINHOOD_CHAIN);
  const signer   = new ethers.Wallet(privateKey, provider);
  const tx = await signer.sendTransaction({
    to,
    value: ethers.parseEther(amount),
  });
  await tx.wait();
  return tx.hash;
};

// ── Token transfer (ERC-20) ──────────────────────────────────────────
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
];

export const sendTokenTransaction = async (
  privateKey:    string,
  tokenAddress:  string,
  to:            string,
  humanAmount:   string,   // e.g. "10.5"
): Promise<string> => {
  if (!ethers.isAddress(to) || !ethers.isAddress(tokenAddress))
    throw new Error('Неверный адрес');
  const provider = new ethers.JsonRpcProvider(ROBINHOOD_RPC, ROBINHOOD_CHAIN);
  const signer   = new ethers.Wallet(privateKey, provider);
  const token    = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const decimals: number = await token.decimals();
  const amount   = ethers.parseUnits(humanAmount, decimals);
  const tx       = await token.transfer(to, amount);
  await (tx as ethers.ContractTransactionResponse).wait();
  return (tx as ethers.ContractTransactionResponse).hash;
};
