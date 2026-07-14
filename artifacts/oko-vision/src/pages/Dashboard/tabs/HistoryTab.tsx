import { useEVMWallet, TxRecord } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { useTrading } from '@/context/TradingContext';
import { ArrowUpIcon, ArrowDownIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

const RH_EXPLORER = 'https://explorer.chain.robinhood.com/tx/';

export default function HistoryTab() {
  const { txHistory }    = useEVMWallet();
  const { tradeHistory } = useTrading();

  const evmRows = txHistory.map(tx => ({
    type:   'evm' as const,
    id:     tx.hash,
    label:  `Отправка ${tx.amount} ${tx.token}`,
    sub:    `→ ${tx.to.slice(0, 8)}...${tx.to.slice(-4)}`,
    pnl:    null as number | null,
    ts:     tx.timestamp,
    hash:   tx.hash,
    status: tx.status,
  }));

  const solRows = (tradeHistory as any[]).map((t, i) => ({
    type:   'sol' as const,
    id:     String(i),
    label:  t.symbol ?? t.mint?.slice(0, 8) ?? 'Unknown',
    sub:    `${t.side ?? t.type ?? 'Trade'} · Solana`,
    pnl:    t.pnlUsd ?? t.pnl ?? 0,
    ts:     t.timestamp ?? 0,
    hash:   null as string | null,
    status: 'confirmed' as const,
  }));

  const all = [...evmRows, ...solRows].sort((a, b) => b.ts - a.ts);

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">История</h1>
          <p className="text-[#555] text-sm">EVM транзакции и Solana сделки</p>
        </div>
        {all.length > 0 && (
          <span className="text-xs text-[#555] bg-white/[0.05] px-2.5 py-1 rounded-full">{all.length}</span>
        )}
      </div>

      {all.length === 0 ? (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="font-medium text-[#888]">Нет истории</p>
          <p className="text-sm text-[#555] mt-1">Транзакции появятся здесь после отправки</p>
        </div>
      ) : (
        <div className="bg-[#111] border border-white/[0.06] rounded-2xl overflow-hidden">
          {all.map((row, i) => {
            const pos = row.pnl == null ? null : row.pnl >= 0;
            const date = row.ts
              ? new Date(row.ts).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              : '—';

            return (
              <motion.div key={row.id + i}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.025 }}
                className={`flex items-center justify-between px-4 py-3.5 hover:bg-white/[0.02] transition-colors ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}>

                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    pos === null ? 'bg-[#2962ff]/10'
                    : pos ? 'bg-[#00c853]/10' : 'bg-[#ff1744]/10'
                  }`}>
                    {pos === null
                      ? <ArrowUpIcon className="w-4 h-4 text-[#2962ff]" />
                      : pos
                        ? <ArrowUpIcon className="w-4 h-4 text-[#00c853]" />
                        : <ArrowDownIcon className="w-4 h-4 text-[#ff1744]" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white leading-tight">{row.label}</p>
                    <p className="text-xs text-[#555] leading-tight">{row.sub} · {date}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-right">
                    {row.pnl != null && (
                      <p className={`text-sm font-semibold ${row.pnl >= 0 ? 'text-[#00c853]' : 'text-[#ff1744]'}`}>
                        {row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(2)}
                      </p>
                    )}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                      row.status === 'confirmed' ? 'text-[#00c853] bg-[#00c853]/10'
                      : row.status === 'pending'   ? 'text-[#f59e0b] bg-[#f59e0b]/10'
                      : 'text-[#ff1744] bg-[#ff1744]/10'
                    }`}>
                      {row.status === 'confirmed' ? 'Выполнено' : row.status === 'pending' ? 'Ожидание' : 'Ошибка'}
                    </span>
                  </div>
                  {row.hash && (
                    <a href={RH_EXPLORER + row.hash} target="_blank" rel="noopener noreferrer"
                      className="text-[#444] hover:text-[#2962ff] transition-colors" title="Открыть в Explorer">
                      <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                    </a>
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
