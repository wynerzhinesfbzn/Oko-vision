import { useState, useCallback } from 'react';
import { useOkoWallet } from '@/context/WalletContext';
import { ArrowsUpDownIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface JupiterQuote {
  inAmount: string;
  outAmount: string;
  priceImpactPct: string;
  routePlan: { swapInfo: { label: string } }[];
}

const POPULAR_TOKENS = [
  { symbol: 'SOL',   mint: 'So11111111111111111111111111111111111111112',  decimals: 9  },
  { symbol: 'USDC',  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', decimals: 6  },
  { symbol: 'USDT',  mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', decimals: 6  },
  { symbol: 'RAY',   mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', decimals: 6  },
  { symbol: 'JUP',   mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',  decimals: 6  },
  { symbol: 'BONK',  mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', decimals: 5  },
];

export default function SwapTab() {
  const { connected } = useOkoWallet();
  const [fromToken, setFromToken] = useState(POPULAR_TOKENS[0]);
  const [toToken,   setToToken]   = useState(POPULAR_TOKENS[1]);
  const [amount,    setAmount]    = useState('');
  const [quote,     setQuote]     = useState<JupiterQuote | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [swapped,   setSwapped]   = useState(false);

  const flip = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setQuote(null);
    setAmount('');
  };

  const fetchQuote = useCallback(async () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return;
    setLoading(true);
    setError('');
    setQuote(null);
    try {
      const lamports = Math.round(+amount * Math.pow(10, fromToken.decimals));
      const url = `https://quote-api.jup.ag/v6/quote?inputMint=${fromToken.mint}&outputMint=${toToken.mint}&amount=${lamports}&slippageBps=50`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка получения котировки');
    } finally {
      setLoading(false);
    }
  }, [amount, fromToken, toToken]);

  const outAmount = quote
    ? (Number(quote.outAmount) / Math.pow(10, toToken.decimals)).toFixed(6)
    : '';

  const priceImpact = quote ? Number(quote.priceImpactPct).toFixed(3) : null;
  const route = quote?.routePlan?.map(r => r.swapInfo.label).join(' → ') ?? '';

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold text-white mb-6">Обмен токенов</h1>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5 space-y-3"
      >
        {/* Network badge */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full font-medium">Solana · Jupiter</span>
        </div>

        {/* From */}
        <div className="bg-white/[0.06] rounded-xl p-4 space-y-2">
          <span className="text-xs text-gray-500">Отдаёте</span>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={e => { setAmount(e.target.value); setQuote(null); }}
              placeholder="0.00"
              className="flex-1 bg-transparent text-2xl font-light text-white placeholder-gray-600 outline-none"
            />
            <TokenSelect value={fromToken} options={POPULAR_TOKENS.filter(t => t.mint !== toToken.mint)} onChange={setFromToken} />
          </div>
        </div>

        {/* Flip */}
        <div className="flex justify-center">
          <button
            onClick={flip}
            className="w-9 h-9 rounded-full bg-white/[0.07] border border-white/[0.12] flex items-center justify-center text-gray-400 hover:text-orange-400 hover:bg-orange-500/10 transition-all"
          >
            <ArrowsUpDownIcon className="w-4 h-4" />
          </button>
        </div>

        {/* To */}
        <div className="bg-white/[0.06] rounded-xl p-4 space-y-2">
          <span className="text-xs text-gray-500">Получаете</span>
          <div className="flex items-center gap-3">
            <input
              readOnly
              value={outAmount}
              placeholder="0.00"
              className="flex-1 bg-transparent text-2xl font-light text-white placeholder-gray-600 outline-none opacity-80"
            />
            <TokenSelect value={toToken} options={POPULAR_TOKENS.filter(t => t.mint !== fromToken.mint)} onChange={t => { setToToken(t); setQuote(null); }} />
          </div>
        </div>

        {/* Route info */}
        {quote && (
          <div className="bg-white/[0.03] rounded-xl px-4 py-3 space-y-1 text-xs text-gray-400">
            {route && <p>Маршрут: <span className="text-gray-300">{route}</span></p>}
            {priceImpact && (
              <p>Влияние на цену: <span className={Number(priceImpact) > 1 ? 'text-red-400' : 'text-emerald-400'}>{priceImpact}%</span></p>
            )}
          </div>
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {/* Buttons */}
        <button
          onClick={fetchQuote}
          disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-white/[0.08] text-gray-300 hover:bg-white/[0.12] disabled:opacity-40 transition-all text-sm font-medium"
        >
          {loading ? 'Загрузка...' : 'Получить курс'}
        </button>

        <button
          disabled={!quote || !connected}
          onClick={() => setSwapped(true)}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/25 hover:opacity-90 disabled:opacity-40 transition-all"
        >
          {!connected ? 'Подключите кошелёк' : swapped ? '✓ Выполнено (симуляция)' : 'Обменять'}
        </button>

        <p className="text-center text-xs text-gray-600">
          Котировки Jupiter · slippage 0.5%
        </p>
      </motion.div>
    </div>
  );
}

function TokenSelect({
  value,
  options,
  onChange,
}: {
  value: typeof POPULAR_TOKENS[0];
  options: typeof POPULAR_TOKENS;
  onChange: (t: typeof POPULAR_TOKENS[0]) => void;
}) {
  return (
    <select
      value={value.mint}
      onChange={e => {
        const t = options.find(o => o.mint === e.target.value) ?? value;
        onChange(t);
      }}
      className="bg-white/[0.08] border border-white/[0.12] rounded-xl px-3 py-2 text-white text-sm font-medium outline-none cursor-pointer"
    >
      {options.map(t => (
        <option key={t.mint} value={t.mint}>{t.symbol}</option>
      ))}
      {/* Show current if not in options */}
      {!options.find(o => o.mint === value.mint) && (
        <option value={value.mint}>{value.symbol}</option>
      )}
    </select>
  );
}
