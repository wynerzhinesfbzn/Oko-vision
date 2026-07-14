import { useEVMWallet } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { useBalance } from '@/context/BalanceContext';
import { useTrading } from '@/context/TradingContext';
import { ArrowUpIcon, ArrowDownIcon, ArrowPathIcon, QrCodeIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

export default function WalletTab() {
  const { wallet, balance, balanceUsd, ethPrice, loading, refreshBalance } = useEVMWallet();
  const { solBalance, solUsd, tokens, totalUsd } = useBalance();
  const { totalPnlUsd, totalPnlPct } = useTrading();

  const pnlPos = totalPnlUsd >= 0;
  const ethBal = parseFloat(balance ?? '0');

  const combinedUsd = (balanceUsd ?? 0) + totalUsd;

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[#888] text-xs uppercase tracking-widest mb-0.5">Портфель</p>
          {wallet && (
            <p className="text-[#555] text-xs font-mono">{wallet.shortAddress}</p>
          )}
        </div>
        <button
          onClick={refreshBalance}
          disabled={loading}
          className="p-2 rounded-xl text-[#555] hover:text-white hover:bg-white/[0.06] transition-all"
        >
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ── Balance hero ── */}
      <div className="text-center py-4">
        <p className="text-5xl font-light text-white tracking-tight">
          ${combinedUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${pnlPos ? 'text-[#00c853]' : 'text-[#ff1744]'}`}>
          {pnlPos ? <ArrowUpIcon className="w-3.5 h-3.5" /> : <ArrowDownIcon className="w-3.5 h-3.5" />}
          {pnlPos ? '+' : ''}${totalPnlUsd.toFixed(2)} ({totalPnlPct.toFixed(2)}%)
        </div>
      </div>

      {/* ── Quick actions ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Получить', icon: QrCodeIcon },
          { label: 'Отправить', icon: PaperAirplaneIcon },
          { label: 'Обновить', icon: ArrowPathIcon, action: refreshBalance },
        ].map(({ label, icon: Icon, action }) => (
          <button
            key={label}
            onClick={action}
            className="flex flex-col items-center gap-2 py-4 bg-[#111] hover:bg-[#1a1a1a] rounded-2xl border border-white/[0.06] transition-all active:scale-95"
          >
            <Icon className="w-5 h-5 text-[#888]" />
            <span className="text-xs text-[#888]">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Assets ── */}
      <div className="rounded-2xl bg-[#111] border border-white/[0.06] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <span className="text-xs font-medium text-[#555] uppercase tracking-wider">Активы</span>
        </div>

        {/* EVM / Robinhood Chain */}
        {wallet && (
          <AssetRow
            icon={<span className="text-lg">Ξ</span>}
            color="#627eea"
            name="Ether"
            symbol={`ETH · RH Chain`}
            amount={`${ethBal.toFixed(4)} ETH`}
            usd={balanceUsd != null ? `$${balanceUsd.toFixed(2)}` : '—'}
            change={null}
          />
        )}

        {/* Solana native */}
        <AssetRow
          icon={<span className="text-lg">◎</span>}
          color="#9945ff"
          name="Solana"
          symbol="SOL"
          amount={`${solBalance.toFixed(4)} SOL`}
          usd={`$${solUsd.toFixed(2)}`}
          change={null}
        />

        {/* SPL tokens */}
        {tokens.slice(0, 5).map((tok: any, i: number) => (
          <AssetRow
            key={i}
            icon={tok.logo ? <img src={tok.logo} className="w-6 h-6 rounded-full" alt="" /> : <span className="text-sm font-bold">{tok.symbol?.slice(0, 2)}</span>}
            color="#2962ff"
            name={tok.symbol ?? 'Token'}
            symbol={tok.symbol ?? '—'}
            amount={Number(tok.amount ?? 0).toLocaleString()}
            usd={`$${Number(tok.usdValue ?? 0).toFixed(2)}`}
            change={null}
          />
        ))}

        {!wallet && tokens.length === 0 && (
          <div className="px-4 py-8 text-center text-[#555] text-sm">
            Подключите кошелёк для просмотра активов
          </div>
        )}
      </div>

      {/* ── Network info ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#111] rounded-2xl border border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-[#00c853] shadow-[0_0_6px_#00c853]" />
          <span className="text-sm text-[#888]">Robinhood Chain</span>
        </div>
        <span className="text-xs text-[#555] font-mono">Chain ID 4663</span>
      </div>
    </div>
  );
}

function AssetRow({
  icon, color, name, symbol, amount, usd, change,
}: {
  icon: React.ReactNode;
  color: string;
  name: string;
  symbol: string;
  amount: string;
  usd: string;
  change: number | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center justify-between px-4 py-3.5 border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: color + '22', border: `1px solid ${color}33` }}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm font-medium text-white leading-tight">{name}</p>
          <p className="text-xs text-[#555] leading-tight">{symbol}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-white">{usd}</p>
        <p className="text-xs text-[#555]">{amount}</p>
        {change !== null && (
          <p className={`text-xs font-medium ${change >= 0 ? 'text-[#00c853]' : 'text-[#ff1744]'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </p>
        )}
      </div>
    </motion.div>
  );
}
