import { useState, useCallback } from 'react';
import { useOkoWallet } from '@/context/WalletContext';
import { ArrowsUpDownIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

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
  const [done,      setDone]      = useState(false);

  const flip = () => { setFromToken(toToken); setToToken(fromToken); setQuote(null); setAmount(''); };

  const fetchQuote = useCallback(async () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return;
    setLoading(true); setError(''); setQuote(null); setDone(false);
    try {
      const lamports = Math.round(+amount * Math.pow(10, fromToken.decimals));
      const res = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${fromToken.mint}&outputMint=${toToken.mint}&amount=${lamports}&slippageBps=50`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setQuote(data);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка котировки');
    } finally { setLoading(false); }
  }, [amount, fromToken, toToken]);

  const outAmount = quote ? (Number(quote.outAmount) / Math.pow(10, toToken.decimals)).toFixed(6) : '';
  const priceImpact = quote ? Number(quote.priceImpactPct).toFixed(3) : null;
  const route = quote?.routePlan?.map(r => r.swapInfo.label).join(' → ') ?? '';

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Обмен</h1>
        <p className="text-[#555] text-sm">Solana · Jupiter Aggregator</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 space-y-3"
      >
        {/* From */}
        <div className="bg-[#1a1a1a] rounded-xl p-4">
          <p className="text-xs text-[#555] mb-2">Отдаёте</p>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={amount}
              onChange={e => { setAmount(e.target.value); setQuote(null); setDone(false); }}
              placeholder="0.00"
              className="flex-1 bg-transparent text-3xl font-light text-white placeholder-[#333] outline-none"
            />
            <TokenPill value={fromToken} options={POPULAR_TOKENS.filter(t => t.mint !== toToken.mint)} onChange={setFromToken} />
          </div>
        </div>

        {/* Flip */}
        <div className="flex justify-center">
          <button
            onClick={flip}
            className="w-9 h-9 rounded-full bg-[#1a1a1a] border border-white/[0.08] flex items-center justify-center text-[#555] hover:text-[#2962ff] hover:border-[#2962ff]/40 transition-all"
          >
            <ArrowsUpDownIcon className="w-4 h-4" />
          </button>
        </div>

        {/* To */}
        <div className="bg-[#1a1a1a] rounded-xl p-4">
          <p className="text-xs text-[#555] mb-2">Получаете</p>
          <div className="flex items-center gap-3">
            <input
              readOnly
              value={outAmount}
              placeholder="0.00"
              className="flex-1 bg-transparent text-3xl font-light text-white placeholder-[#333] outline-none"
            />
            <TokenPill value={toToken} options={POPULAR_TOKENS.filter(t => t.mint !== fromToken.mint)} onChange={t => { setToToken(t); setQuote(null); }} />
          </div>
        </div>

        {/* Route info */}
        {quote && (
          <div className="px-3 py-2.5 bg-white/[0.03] rounded-xl text-xs text-[#555] space-y-1">
            {route && <p>Маршрут: <span className="text-[#888]">{route}</span></p>}
            {priceImpact && (
              <p>Влияние на цену: <span className={Number(priceImpact) > 1 ? 'text-[#ff1744]' : 'text-[#00c853]'}>{priceImpact}%</span></p>
            )}
          </div>
        )}

        {error && <p className="text-[#ff6b6b] text-sm">{error}</p>}

        <button
          onClick={fetchQuote}
          disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-white/[0.06] text-[#888] hover:bg-white/[0.10] disabled:opacity-40 transition-all text-sm font-medium"
        >
          {loading ? 'Поиск маршрута...' : 'Получить курс'}
        </button>

        <button
          disabled={!quote || !connected}
          onClick={() => setDone(true)}
          className="w-full py-3.5 rounded-xl bg-[#2962ff] hover:bg-[#1e50e2] text-white font-semibold disabled:opacity-40 transition-all"
        >
          {!connected ? 'Подключите кошелёк' : done ? '✓ Выполнено (симуляция)' : 'Обменять'}
        </button>

        <p className="text-center text-xs text-[#333]">Slippage 0.5% · Powered by Jupiter v6</p>
      </motion.div>
    </div>
  );
}

function TokenPill({
  value, options, onChange,
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
      className="bg-[#2a2a2a] border border-white/[0.10] rounded-xl px-3 py-2 text-white text-sm font-semibold outline-none cursor-pointer"
    >
      {options.map(t => <option key={t.mint} value={t.mint}>{t.symbol}</option>)}
      {!options.find(o => o.mint === value.mint) && (
        <option value={value.mint}>{value.symbol}</option>
      )}
    </select>
  );
}
