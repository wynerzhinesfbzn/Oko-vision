import { useTrading } from '@/context/TradingContext';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

export default function HistoryTab() {
  const { tradeHistory } = useTrading();

  if (!tradeHistory || tradeHistory.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <h1 className="text-xl font-semibold text-white mb-6">История сделок</h1>
        <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-12 text-center text-gray-500">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium">Нет истории сделок</p>
          <p className="text-sm mt-1">Ваши сделки появятся здесь</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-white">История сделок</h1>
        <span className="text-xs text-gray-500 bg-white/[0.06] px-2.5 py-1 rounded-full">{tradeHistory.length} сделок</span>
      </div>

      <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
        {tradeHistory.map((trade: any, i: number) => {
          const pnl = trade.pnlUsd ?? trade.pnl ?? 0;
          const positive = pnl >= 0;
          const date = trade.timestamp
            ? new Date(trade.timestamp).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '—';

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className={`flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${positive ? 'bg-emerald-500/15' : 'bg-red-500/15'}`}>
                  {positive
                    ? <ArrowUpIcon className="w-4 h-4 text-emerald-400" />
                    : <ArrowDownIcon className="w-4 h-4 text-red-400" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">
                    {trade.symbol ?? trade.mint?.slice(0, 8) ?? 'Unknown'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {trade.side ?? trade.type ?? 'Trade'} · {date}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-sm font-semibold ${positive ? 'text-emerald-400' : 'text-red-400'}`}>
                  {positive ? '+' : ''}${pnl.toFixed(2)}
                </p>
                {trade.sizeUsd != null && (
                  <p className="text-xs text-gray-500">${trade.sizeUsd.toFixed(2)}</p>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
