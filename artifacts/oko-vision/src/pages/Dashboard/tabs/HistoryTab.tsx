import { useTrading } from '@/context/TradingContext';
import { ArrowUpIcon, ArrowDownIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

export default function HistoryTab() {
  const { tradeHistory } = useTrading();

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">История</h1>
          <p className="text-[#555] text-sm">Все сделки и переводы</p>
        </div>
        {tradeHistory.length > 0 && (
          <span className="text-xs text-[#555] bg-white/[0.05] px-2.5 py-1 rounded-full">
            {tradeHistory.length}
          </span>
        )}
      </div>

      {tradeHistory.length === 0 ? (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium text-[#888]">Нет истории</p>
          <p className="text-sm text-[#555] mt-1">Сделки появятся здесь</p>
        </div>
      ) : (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl overflow-hidden">
          {(tradeHistory as any[]).map((trade, i) => {
            const pnl = trade.pnlUsd ?? trade.pnl ?? 0;
            const pos = pnl >= 0;
            const date = trade.timestamp
              ? new Date(trade.timestamp).toLocaleString('ru-RU', {
                  day: '2-digit', month: '2-digit',
                  hour: '2-digit', minute: '2-digit',
                })
              : '—';

            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.03 }}
                className={`flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${pos ? 'bg-[#00c853]/10' : 'bg-[#ff1744]/10'}`}>
                    {pos
                      ? <ArrowUpIcon className="w-4 h-4 text-[#00c853]" />
                      : <ArrowDownIcon className="w-4 h-4 text-[#ff1744]" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white leading-tight">
                      {trade.symbol ?? trade.mint?.slice(0, 8) ?? 'Unknown'}
                    </p>
                    <p className="text-xs text-[#555] leading-tight">
                      {trade.side ?? trade.type ?? 'Trade'} · {date}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-semibold ${pos ? 'text-[#00c853]' : 'text-[#ff1744]'}`}>
                    {pos ? '+' : ''}${pnl.toFixed(2)}
                  </p>
                  {trade.sizeUsd != null && (
                    <p className="text-xs text-[#555]">${trade.sizeUsd.toFixed(2)}</p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
