import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLongRightIcon } from '@heroicons/react/24/outline';

// LI.FI public API — no key required for quotes
const LIFI_API = 'https://li.quest/v1';

const CHAINS = [
  { id: '1',     name: 'Ethereum',  symbol: 'ETH'  },
  { id: '137',   name: 'Polygon',   symbol: 'MATIC' },
  { id: '42161', name: 'Arbitrum',  symbol: 'ETH'  },
  { id: '10',    name: 'Optimism',  symbol: 'ETH'  },
  { id: '56',    name: 'BSC',       symbol: 'BNB'  },
  { id: '43114', name: 'Avalanche', symbol: 'AVAX' },
];

// Native token addresses per chain (LI.FI convention)
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
    toAmountMin: string;
    executionDuration: number;
    feeCosts: { amount: string; token: { symbol: string } }[];
  };
  action: {
    fromToken: { symbol: string; decimals: number };
    toToken: { symbol: string; decimals: number };
  };
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
    setLoading(true);
    setError('');
    setQuote(null);
    try {
      const decimals = 18;
      const amountWei = BigInt(Math.round(+amount * 1e9)) * BigInt(1e9);
      const params = new URLSearchParams({
        fromChainId: fromChain.id,
        fromAmount:  amountWei.toString(),
        fromTokenAddress: NATIVE[fromChain.id],
        toChainId:   toChain.id,
        toTokenAddress: NATIVE[toChain.id],
        fromAddress: '0x0000000000000000000000000000000000000001', // demo addr
      });
      const res = await fetch(`${LIFI_API}/quote?${params}`);
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setQuote(data);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка LI.FI');
    } finally {
      setLoading(false);
    }
  };

  const toDecimals = quote ? quote.action.toToken.decimals : 18;
  const toAmount = quote
    ? (Number(quote.estimate.toAmount) / Math.pow(10, toDecimals)).toFixed(6)
    : '';
  const duration = quote
    ? Math.ceil(quote.estimate.executionDuration / 60) + ' мин'
    : '';

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold text-white mb-2">Кросс-чейн мост</h1>
      <p className="text-sm text-gray-500 mb-6">Powered by LI.FI — лучший маршрут автоматически</p>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5 space-y-4"
      >
        {/* Chain selectors */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Откуда</label>
            <ChainSelect value={fromChain} options={CHAINS.filter(c => c.id !== toChain.id)} onChange={c => { setFromChain(c); setQuote(null); }} />
          </div>
          <ArrowLongRightIcon className="w-5 h-5 text-gray-500 mt-4 shrink-0" />
          <div className="flex-1">
            <label className="text-xs text-gray-500 mb-1 block">Куда</label>
            <ChainSelect value={toChain} options={CHAINS.filter(c => c.id !== fromChain.id)} onChange={c => { setToChain(c); setQuote(null); }} />
          </div>
        </div>

        {/* Amount */}
        <div className="bg-white/[0.06] rounded-xl p-4">
          <span className="text-xs text-gray-500">Сумма ({fromChain.symbol})</span>
          <input
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={e => { setAmount(e.target.value); setQuote(null); }}
            placeholder="0.0"
            className="w-full bg-transparent text-2xl font-light text-white placeholder-gray-600 outline-none mt-1"
          />
        </div>

        {/* Result */}
        {quote && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Получите</span>
              <span className="text-white font-medium">{toAmount} {toChain.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Время</span>
              <span className="text-gray-300">~{duration}</span>
            </div>
            {quote.estimate.feeCosts?.map((f, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-gray-400">Комиссия ({f.token.symbol})</span>
                <span className="text-gray-300">{(Number(f.amount) / 1e18).toFixed(6)}</span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={fetchQuote}
          disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-white/[0.08] text-gray-300 hover:bg-white/[0.12] disabled:opacity-40 transition-all text-sm font-medium"
        >
          {loading ? 'Поиск маршрута...' : 'Найти лучший маршрут'}
        </button>

        <button
          disabled={!quote}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/25 hover:opacity-90 disabled:opacity-40 transition-all"
        >
          Перевести
        </button>

        <p className="text-center text-xs text-gray-600">
          Маршрут через LI.FI · без регистрации
        </p>
      </motion.div>
    </div>
  );
}

function ChainSelect({
  value,
  options,
  onChange,
}: {
  value: typeof CHAINS[0];
  options: typeof CHAINS;
  onChange: (c: typeof CHAINS[0]) => void;
}) {
  return (
    <select
      value={value.id}
      onChange={e => {
        const c = options.find(o => o.id === e.target.value) ?? value;
        onChange(c);
      }}
      className="w-full bg-white/[0.08] border border-white/[0.12] rounded-xl px-3 py-2.5 text-white text-sm font-medium outline-none cursor-pointer"
    >
      {options.map(c => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      {!options.find(o => o.id === value.id) && (
        <option value={value.id}>{value.name}</option>
      )}
    </select>
  );
}
