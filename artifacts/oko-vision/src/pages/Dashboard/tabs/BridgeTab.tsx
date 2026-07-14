import { useState } from 'react';
import { useEVMWallet } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { getLifiQuote, nativeToken, LifiQuoteResponse } from '@/api/lifi';
import { ArrowLongRightIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';
import { ethers } from 'ethers';

const CHAINS = [
  { id: 1,     name: 'Ethereum',  symbol: 'ETH',  color: '#627eea' },
  { id: 137,   name: 'Polygon',   symbol: 'MATIC', color: '#8247e5' },
  { id: 42161, name: 'Arbitrum',  symbol: 'ETH',  color: '#28a0f0' },
  { id: 10,    name: 'Optimism',  symbol: 'ETH',  color: '#ff0420' },
  { id: 8453,  name: 'Base',      symbol: 'ETH',  color: '#0052ff' },
  { id: 56,    name: 'BNB Chain', symbol: 'BNB',  color: '#f3ba2f' },
  { id: 43114, name: 'Avalanche', symbol: 'AVAX', color: '#e84142' },
];

// Placeholder address — use real connected wallet in production
const DEMO_ADDR = '0x0000000000000000000000000000000000000001';

export default function BridgeTab() {
  const { wallet } = useEVMWallet();

  const [fromChainIdx, setFromChainIdx] = useState(0);
  const [toChainIdx,   setToChainIdx]   = useState(2);
  const [amount,       setAmount]       = useState('');
  const [quote,        setQuote]        = useState<LifiQuoteResponse | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const fromChain = CHAINS[fromChainIdx];
  const toChain   = CHAINS[toChainIdx];

  const fetchQuote = async () => {
    if (!amount || isNaN(+amount) || +amount <= 0) return;
    setLoading(true); setError(''); setQuote(null);

    try {
      const fromAddr  = wallet?.address ?? DEMO_ADDR;
      // amount in wei (18 decimals for native token)
      const amountWei = ethers.parseEther(amount).toString();

      const data = await getLifiQuote({
        fromChainId:      fromChain.id,
        toChainId:        toChain.id,
        fromTokenAddress: nativeToken(fromChain.id),
        toTokenAddress:   nativeToken(toChain.id),
        fromAmount:       amountWei,
        fromAddress:      fromAddr,
      });
      setQuote(data);
    } catch (e: any) {
      setError(e.message ?? 'Ошибка LI.FI');
    } finally {
      setLoading(false);
    }
  };

  const toDecimals = quote?.action.toToken.decimals ?? 18;
  const toAmount   = quote ? (Number(quote.estimate.toAmount) / Math.pow(10, toDecimals)).toFixed(6) : '';
  const duration   = quote ? `~${Math.ceil(quote.estimate.executionDuration / 60)} мин` : '';
  const usdFrom    = quote?.estimate.fromAmountUSD ? `$${Number(quote.estimate.fromAmountUSD).toFixed(2)}` : '';
  const usdTo      = quote?.estimate.toAmountUSD   ? `$${Number(quote.estimate.toAmountUSD).toFixed(2)}`   : '';

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white">Мост</h1>
        <p className="text-[#555] text-sm">Кросс-чейн переводы · LI.FI агрегатор</p>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-[#111] border border-white/[0.06] rounded-2xl p-5 space-y-4">

        {/* Chain selector row */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="text-xs text-[#555] mb-1.5 block">Откуда</label>
            <ChainSelect chains={CHAINS} value={fromChainIdx} exclude={toChainIdx}
              onChange={i => { setFromChainIdx(i); setQuote(null); }} />
          </div>
          <div className="pb-2.5 shrink-0">
            <button onClick={() => { setFromChainIdx(toChainIdx); setToChainIdx(fromChainIdx); setQuote(null); }}
              className="p-2 rounded-xl bg-[#1a1a1a] border border-white/[0.08] text-[#555] hover:text-[#2962ff] hover:border-[#2962ff]/30 transition-all">
              <ArrowLongRightIcon className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1">
            <label className="text-xs text-[#555] mb-1.5 block">Куда</label>
            <ChainSelect chains={CHAINS} value={toChainIdx} exclude={fromChainIdx}
              onChange={i => { setToChainIdx(i); setQuote(null); }} />
          </div>
        </div>

        {/* Chain badges */}
        <div className="flex items-center gap-2 text-xs">
          <ChainBadge chain={fromChain} />
          <ArrowLongRightIcon className="w-4 h-4 text-[#333] shrink-0" />
          <ChainBadge chain={toChain} />
        </div>

        {/* Amount */}
        <div className="bg-[#1a1a1a] rounded-xl p-4">
          <p className="text-xs text-[#555] mb-2">Сумма ({fromChain.symbol})</p>
          <input type="number" min="0" step="any" value={amount}
            onChange={e => { setAmount(e.target.value); setQuote(null); }}
            placeholder="0.0"
            className="w-full bg-transparent text-3xl font-light text-white placeholder-[#333] outline-none" />
        </div>

        {/* Quote result */}
        {quote && (
          <div className="bg-[#00c853]/5 border border-[#00c853]/15 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[#555]">Отправите</span>
              <span className="text-white font-medium">{amount} {fromChain.symbol} <span className="text-[#555]">{usdFrom}</span></span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#555]">Получите</span>
              <span className="text-white font-semibold">{toAmount} {toChain.symbol} <span className="text-[#555]">{usdTo}</span></span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#555]">Время</span>
              <span className="text-[#888]">{duration}</span>
            </div>
            {quote.estimate.feeCosts?.slice(0, 2).map((f, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-[#555]">Комиссия ({f.token.symbol})</span>
                <span className="text-[#888]">
                  {(Number(f.amount) / Math.pow(10, f.token.decimals)).toFixed(6)} ≈ ${Number(f.amountUSD).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="bg-[#ff1744]/8 border border-[#ff1744]/20 rounded-xl px-4 py-3 text-sm text-[#ff6b6b]">
            {error}
          </div>
        )}

        <button onClick={fetchQuote} disabled={loading || !amount}
          className="w-full py-3 rounded-xl bg-white/[0.06] text-[#888] hover:bg-white/[0.10] disabled:opacity-40 transition-all text-sm font-medium flex items-center justify-center gap-2">
          {loading ? <><ArrowPathIcon className="w-4 h-4 animate-spin" /> Поиск маршрута...</> : 'Найти лучший маршрут'}
        </button>

        <button disabled={!quote}
          className="w-full py-3.5 rounded-xl bg-[#2962ff] hover:bg-[#1e50e2] text-white font-semibold disabled:opacity-40 transition-all">
          {!wallet ? 'Создайте кошелёк' : 'Перевести через мост'}
        </button>

        <p className="text-center text-xs text-[#333]">Маршрут через LI.FI · лучшая цена автоматически</p>
      </motion.div>
    </div>
  );
}

function ChainSelect({ chains, value, exclude, onChange }: {
  chains: { name: string }[]; value: number; exclude: number; onChange: (i: number) => void;
}) {
  return (
    <select value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-3 py-2.5 text-white text-sm font-medium outline-none cursor-pointer">
      {chains.map((c, i) => (
        <option key={i} value={i} disabled={i === exclude}>{c.name}</option>
      ))}
    </select>
  );
}

function ChainBadge({ chain }: { chain: { name: string; symbol: string; color: string } }) {
  return (
    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: chain.color + '18', color: chain.color, border: `1px solid ${chain.color}30` }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: chain.color }} />
      {chain.name}
    </span>
  );
}
