import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLongRightIcon } from '@heroicons/react/24/outline';

const LIFI_API = 'https://li.quest/v1';

const CHAINS = [
  { id: '1',     name: 'Ethereum',  symbol: 'ETH'  },
  { id: '137',   name: 'Polygon',   symbol: 'MATIC' },
  { id: '42161', name: 'Arbitrum',  symbol: 'ETH'  },
  { id: '10',    name: 'Optimism',  symbol: 'ETH'  },
  { id: '56',    name: 'BSC',       symbol: 'BNB'  },
  { id: '43114', name: 'Avalanche', symbol: 'AVAX' },
];

const NATIVE: Record<string, string> = {
  '1':     '0x0000000000000000000000000000000000000000',
  '137':   '0x0000000000000000000000000000000000001010',
  '42161': '0x0000000000000000000000000000000000000000',
  '10':    '0x0000000000000000000000000000000000000000',
  '56':    '0x0000000000000000000000000000000000000000',
  '43114': '0x0000000000000000000000000000000000000000',
};

interface LifiQuote {
  estimate: {
    toAmount: string;
    executionDuration: number;
    feeCosts: { amount: string; token: { symbol: string; decimals: number } }[];
  };
  action: { toToken: { symbol: string; decimals: number } };
}

export default function BridgeTab() {
  const [fromChain, setFromChain] = useState(CHAINS[0]);
  const [toChain,   setToChain]   = useState(CHAINS[2]);
  const [amount,    setAmount]    = useState('');
  const [quote,     setQuote]     = useState<LifiQuote | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const fetchQuote = async () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return;
    setLoading(true); setError(''); setQuote(null);
    try {
      const amountWei = (BigInt(Math.round(+amount * 1e9)) * BigInt(1e9)).toString();
      const params = new URLSearchParams({
        fromChainId: fromChain.id, fromAmount: amountWei,
        fromTokenAddress: NATIVE[fromChain.id],
        toChainId: toChain.id, toTokenAddress: NATIVE[toChain.id],
        fromAddress: '0x0000000000000000000000000000000000000001',
      });
      const res = await fetch(`${LIFI_API}/quote?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setQuote(data);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка LI.FI');
    } finally { setLoading(false); }
  };

  const toDecimals = quote?.action.toToken.decimals ?? 18;
  const toAmount = quote ? (Number(quote.estimate.toAmount) / Math.pow(10, toDecimals)).toFixed(6) : '';
  const duration = quote ? `~${Math.ceil(quote.estimate.executionDuration / 60)} мин` : '';

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Мост</h1>
        <p className="text-[#555] text-sm">Кросс-чейн · LI.FI</p>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 space-y-4"
      >
        {/* Chain row */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-[#555] mb-1.5 block">Откуда</label>
            <ChainSelect value={fromChain} options={CHAINS.filter(c => c.id !== toChain.id)} onChange={c => { setFromChain(c); setQuote(null); }} />
          </div>
          <div className="pb-2.5">
            <ArrowLongRightIcon className="w-5 h-5 text-[#333]" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[#555] mb-1.5 block">Куда</label>
            <ChainSelect value={toChain} options={CHAINS.filter(c => c.id !== fromChain.id)} onChange={c => { setToChain(c); setQuote(null); }} />
          </div>
        </div>

        {/* Amount */}
        <div className="bg-[#1a1a1a] rounded-xl p-4">
          <p className="text-xs text-[#555] mb-2">Сумма ({fromChain.symbol})</p>
          <input
            type="number"
            value={amount}
            onChange={e => { setAmount(e.target.value); setQuote(null); }}
            placeholder="0.0"
            className="w-full bg-transparent text-3xl font-light text-white placeholder-[#333] outline-none"
          />
        </div>

        {/* Result */}
        {quote && (
          <div className="bg-[#00c853]/5 border border-[#00c853]/15 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#555]">Получите</span>
              <span className="text-white font-semibold">{toAmount} {toChain.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#555]">Время</span>
              <span className="text-[#888]">{duration}</span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-[#ff1744]/8 border border-[#ff1744]/20 rounded-xl px-4 py-3 text-sm text-[#ff6b6b]">
            {error}
          </div>
        )}

        <button
          onClick={fetchQuote}
          disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-white/[0.06] text-[#888] hover:bg-white/[0.10] disabled:opacity-40 transition-all text-sm font-medium"
        >
          {loading ? 'Поиск маршрута...' : 'Найти лучший маршрут'}
        </button>

        <button
          disabled={!quote}
          className="w-full py-3.5 rounded-xl bg-[#2962ff] hover:bg-[#1e50e2] text-white font-semibold disabled:opacity-40 transition-all"
        >
          Перевести
        </button>

        <p className="text-center text-xs text-[#333]">Маршрут через LI.FI · без регистрации</p>
      </motion.div>
    </div>
  );
}

function ChainSelect({ value, options, onChange }: {
  value: typeof CHAINS[0];
  options: typeof CHAINS;
  onChange: (c: typeof CHAINS[0]) => void;
}) {
  return (
    <select
      value={value.id}
      onChange={e => { const c = options.find(o => o.id === e.target.value) ?? value; onChange(c); }}
      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm font-medium outline-none cursor-pointer"
    >
      {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      {!options.find(o => o.id === value.id) && <option value={value.id}>{value.name}</option>}
    </select>
  );
}
