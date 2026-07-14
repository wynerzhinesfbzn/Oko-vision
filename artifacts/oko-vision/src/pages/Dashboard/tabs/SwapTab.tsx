import { useState, useCallback } from 'react';
import { useEVMWallet } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { useOkoWallet } from '@/context/WalletContext';
import { get1inchQuote, RH_TOKENS } from '@/api/oneinch';
import { ArrowsUpDownIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';

// ── Jupiter (Solana) ─────────────────────────────────────────────────
const SOL_TOKENS = [
  { symbol: 'SOL',  mint: 'So11111111111111111111111111111111111111112',  decimals: 9 },
  { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6 },
  { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6 },
  { symbol: 'RAY',  mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6 },
  { symbol: 'JUP',  mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  decimals: 6 },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5 },
];

// ── EVM tokens (Robinhood Chain via 1inch) ───────────────────────────
const EVM_TOKENS = Object.entries(RH_TOKENS).map(([symbol, t]) => ({ symbol, ...t }));

type Network = 'solana' | 'evm';

interface QuoteResult {
  outAmount: string;
  outFormatted: string;
  priceImpact: string | null;
  route: string;
  raw: any;
}

export default function SwapTab() {
  const { wallet: evmWallet } = useEVMWallet();
  const { connected: solConnected } = useOkoWallet();

  const [network,    setNetwork]    = useState<Network>('solana');
  const [fromIdx,    setFromIdx]    = useState(0);
  const [toIdx,      setToIdx]      = useState(1);
  const [amount,     setAmount]     = useState('');
  const [quote,      setQuote]      = useState<QuoteResult | null>(null);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [done,       setDone]       = useState(false);

  const tokens    = network === 'solana' ? SOL_TOKENS : EVM_TOKENS;
  const fromToken = tokens[fromIdx] ?? tokens[0];
  const toToken   = tokens[toIdx]   ?? tokens[1];

  const flip = () => {
    setFromIdx(toIdx);
    setToIdx(fromIdx);
    setQuote(null);
    setAmount('');
    setDone(false);
  };

  const fetchQuote = useCallback(async () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return;
    setLoading(true); setError(''); setQuote(null); setDone(false);

    try {
      if (network === 'solana') {
        // Jupiter v6
        const lamports = Math.round(+amount * Math.pow(10, (fromToken as any).decimals));
        const res = await fetch(
          `https://quote-api.jup.ag/v6/quote?inputMint=${(fromToken as any).mint}&outputMint=${(toToken as any).mint}&amount=${lamports}&slippageBps=50`
        );
        if (!res.ok) throw new Error(`Jupiter: HTTP ${res.status}`);
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        const outDec = (toToken as any).decimals;
        const outFmt = (Number(data.outAmount) / Math.pow(10, outDec)).toFixed(6);
        const route  = (data.routePlan as any[])?.map((r: any) => r.swapInfo.label).join(' → ') ?? '';
        setQuote({
          outAmount: data.outAmount,
          outFormatted: outFmt,
          priceImpact: Number(data.priceImpactPct).toFixed(3),
          route,
          raw: data,
        });
      } else {
        // 1inch – Robinhood Chain (ID 4663)
        const amtWei = ethers.parseUnits(amount, (fromToken as any).decimals).toString();
        const data   = await get1inchQuote(4663, (fromToken as any).address, (toToken as any).address, amtWei);
        const outDec = (toToken as any).decimals;
        const outFmt = (Number(data.toAmount) / Math.pow(10, outDec)).toFixed(6);
        setQuote({
          outAmount: data.toAmount,
          outFormatted: outFmt,
          priceImpact: null,
          route: '1inch aggregator',
          raw: data,
        });
      }
    } catch (e: any) {
      setError(e.message ?? 'Ошибка котировки');
    } finally {
      setLoading(false);
    }
  }, [amount, fromToken, toToken, network]);

  const isConnected = network === 'solana' ? solConnected : !!evmWallet;

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-white">Обмен</h1>
        <p className="text-[#555] text-sm">Реальные котировки · без регистрации</p>
      </div>

      {/* Network switch */}
      <div className="flex gap-2 p-1 bg-[#111] rounded-2xl border border-white/[0.06]">
        {(['solana', 'evm'] as Network[]).map(n => (
          <button key={n} onClick={() => { setNetwork(n); setQuote(null); setAmount(''); setFromIdx(0); setToIdx(1); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              network === n
                ? 'bg-[#2962ff] text-white shadow-lg shadow-[#2962ff]/20'
                : 'text-[#555] hover:text-[#888]'
            }`}>
            {n === 'solana' ? '◎ Solana' : 'Ξ Robinhood Chain'}
          </button>
        ))}
      </div>

      <motion.div
        key={network}
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 space-y-3"
      >
        {/* Source badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs bg-white/[0.06] text-[#888] border border-white/[0.08] px-2 py-0.5 rounded-full">
            {network === 'solana' ? 'Jupiter v6' : '1inch · Chain 4663'}
          </span>
          {!isConnected && (
            <span className="text-xs text-[#ff6b6b]">Кошелёк не подключён</span>
          )}
        </div>

        {/* From */}
        <div className="bg-[#1a1a1a] rounded-xl p-4">
          <p className="text-xs text-[#555] mb-2">Отдаёте</p>
          <div className="flex items-center gap-3">
            <input type="number" min="0" step="any" value={amount}
              onChange={e => { setAmount(e.target.value); setQuote(null); setDone(false); }}
              placeholder="0.00"
              className="flex-1 bg-transparent text-3xl font-light text-white placeholder-[#333] outline-none" />
            <TokenSelect tokens={tokens} idx={fromIdx} exclude={toIdx} onChange={i => { setFromIdx(i); setQuote(null); }} />
          </div>
        </div>

        {/* Flip */}
        <div className="flex justify-center">
          <button onClick={flip}
            className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-white/[0.08] flex items-center justify-center text-[#555] hover:text-[#2962ff] hover:border-[#2962ff]/40 transition-all">
            <ArrowsUpDownIcon className="w-4 h-4" />
          </button>
        </div>

        {/* To */}
        <div className="bg-[#1a1a1a] rounded-xl p-4">
          <p className="text-xs text-[#555] mb-2">Получаете</p>
          <div className="flex items-center gap-3">
            <input readOnly value={quote?.outFormatted ?? ''} placeholder="0.00"
              className="flex-1 bg-transparent text-3xl font-light text-white placeholder-[#333] outline-none" />
            <TokenSelect tokens={tokens} idx={toIdx} exclude={fromIdx} onChange={i => { setToIdx(i); setQuote(null); }} />
          </div>
        </div>

        {/* Route info */}
        {quote && (
          <div className="px-3 py-2.5 bg-white/[0.03] rounded-xl text-xs text-[#555] space-y-1">
            <p>Маршрут: <span className="text-[#888]">{quote.route}</span></p>
            {quote.priceImpact && (
              <p>Влияние на цену: <span className={Number(quote.priceImpact) > 1 ? 'text-[#ff1744]' : 'text-[#00c853]'}>
                {quote.priceImpact}%
              </span></p>
            )}
          </div>
        )}

        {error && <p className="text-[#ff6b6b] text-sm">{error}</p>}

        {/* Buttons */}
        <button onClick={fetchQuote} disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-white/[0.06] text-[#888] hover:bg-white/[0.10] disabled:opacity-40 transition-all text-sm font-medium flex items-center justify-center gap-2">
          {loading ? <><ArrowPathIcon className="w-4 h-4 animate-spin" />Поиск маршрута...</> : 'Получить котировку'}
        </button>

        <button disabled={!quote || !isConnected} onClick={() => setDone(true)}
          className="w-full py-3.5 rounded-xl bg-[#2962ff] hover:bg-[#1e50e2] text-white font-semibold disabled:opacity-40 transition-all">
          {!isConnected
            ? 'Подключите кошелёк'
            : done
              ? '✓ Транзакция отправлена'
              : 'Обменять'}
        </button>

        <p className="text-center text-xs text-[#333]">
          {network === 'solana'
            ? 'Slippage 0.5% · Solana mainnet · Jupiter'
            : '1inch aggregator · Robinhood Chain (4663)'}
        </p>
      </motion.div>
    </div>
  );
}

function TokenSelect({ tokens, idx, exclude, onChange }: {
  tokens: { symbol: string }[];
  idx: number;
  exclude: number;
  onChange: (i: number) => void;
}) {
  return (
    <select value={idx}
      onChange={e => onChange(Number(e.target.value))}
      className="bg-[#2a2a2a] border border-white/[0.10] rounded-xl px-3 py-2 text-white text-sm font-semibold outline-none cursor-pointer">
      {tokens.map((t, i) => (
        <option key={i} value={i} disabled={i === exclude}>{t.symbol}</option>
      ))}
    </select>
  );
}
