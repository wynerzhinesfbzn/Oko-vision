import { useBalance } from '@/context/BalanceContext';
import { useOkoWallet } from '@/context/WalletContext';
import { useTrading } from '@/context/TradingContext';
import { ArrowUpIcon, ArrowDownIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

export default function WalletTab() {
  const { solBalance, solPrice, solUsd, tokens, totalUsd, loading, refresh } = useBalance();
  const { address, shortAddress, connected } = useOkoWallet();
  const { totalPnlUsd, totalPnlPct, positions } = useTrading();

  const pnlPositive = totalPnlUsd >= 0;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-white">Кошелёк</h1>
        <button
          onClick={refresh}
          disabled={loading}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Balance card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-orange-500/10 to-amber-500/5 border border-orange-500/20 rounded-2xl p-6 fire-glow"
      >
        <p className="text-sm text-gray-400 mb-1">Общий баланс</p>
        <p className="text-4xl font-light text-white">
          ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>

        <div className={`mt-2 flex items-center gap-1 text-sm font-medium ${pnlPositive ? 'text-emerald-400' : 'text-red-400'}`}>
          {pnlPositive ? <ArrowUpIcon className="w-3.5 h-3.5" /> : <ArrowDownIcon className="w-3.5 h-3.5" />}
          {pnlPositive ? '+' : ''}${totalPnlUsd.toFixed(2)} ({totalPnlPct.toFixed(2)}%) всего P&L
        </div>

        {connected && address && (
          <p className="mt-3 text-xs text-gray-500 font-mono">{shortAddress}</p>
        )}
      </motion.div>

      {/* SOL row */}
      <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Активы</span>
        </div>

        {/* SOL */}
        <div className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center text-xs font-bold text-white">S</div>
            <div>
              <p className="text-sm font-medium text-white">Solana</p>
              <p className="text-xs text-gray-500">{solBalance.toFixed(4)} SOL · ${solPrice.toFixed(2)}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-white">${solUsd.toFixed(2)}</p>
          </div>
        </div>

        {/* SPL tokens */}
        {tokens.map((tok, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors border-t border-white/[0.04]">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold text-gray-300 overflow-hidden">
                {(tok as any).logo ? (
                  <img src={(tok as any).logo} alt="" className="w-full h-full object-cover rounded-full" />
                ) : (
                  ((tok as any).symbol ?? '?').slice(0, 2)
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-white">{(tok as any).symbol ?? 'Unknown'}</p>
                <p className="text-xs text-gray-500">{Number((tok as any).amount ?? 0).toLocaleString()} tokens</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-white">${Number((tok as any).usdValue ?? 0).toFixed(2)}</p>
            </div>
          </div>
        ))}

        {!connected && (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            Подключите кошелёк для просмотра баланса
          </div>
        )}
      </div>

      {/* Open positions */}
      {positions.length > 0 && (
        <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <span className="text-xs text-gray-500 font-medium uppercase tracking-wider">Открытые позиции ({positions.length})</span>
          </div>
          {positions.map((pos, i) => {
            const pnl = (pos as any).pnlUsd ?? 0;
            const pos2 = pnlPositive;
            return (
              <div key={i} className="flex items-center justify-between px-4 py-3 border-t border-white/[0.04] hover:bg-white/[0.03] transition-colors">
                <div>
                  <p className="text-sm font-medium text-white">{(pos as any).symbol ?? (pos as any).mint?.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">{(pos as any).side ?? 'long'} · {(pos as any).size ?? '-'}</p>
                </div>
                <p className={`text-sm font-medium ${pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
