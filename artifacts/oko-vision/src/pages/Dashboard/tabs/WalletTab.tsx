import { useState } from 'react';
import { useEVMWallet } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { useBalance } from '@/context/BalanceContext';
import { useTrading } from '@/context/TradingContext';
import {
  ArrowUpIcon, ArrowDownIcon, ArrowPathIcon,
  PaperAirplaneIcon, QrCodeIcon, XMarkIcon,
  CheckIcon, ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

export default function WalletTab() {
  const { wallet, balance, balanceUsd, ethPrice, loading, refreshBalance, sendETH } = useEVMWallet();
  const { solBalance, solUsd, tokens }  = useBalance();
  const { totalPnlUsd, totalPnlPct }    = useTrading();

  const [sendOpen,   setSendOpen]   = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [sendTo,     setSendTo]     = useState('');
  const [sendAmt,    setSendAmt]    = useState('');
  const [sendErr,    setSendErr]    = useState('');
  const [sending,    setSending]    = useState(false);
  const [txHash,     setTxHash]     = useState('');
  const [copied,     setCopied]     = useState(false);

  const pnlPos     = totalPnlUsd >= 0;
  const ethBal     = parseFloat(balance ?? '0');
  const totalUsd   = (balanceUsd ?? 0) + solUsd;

  const handleSend = async () => {
    setSendErr('');
    if (!sendTo.trim()) return setSendErr('Введите адрес');
    if (!sendAmt || parseFloat(sendAmt) <= 0) return setSendErr('Введите сумму');
    setSending(true);
    try {
      const hash = await sendETH(sendTo.trim(), sendAmt);
      setTxHash(hash);
      setSendTo(''); setSendAmt('');
    } catch (e: any) {
      setSendErr(e.message ?? 'Ошибка транзакции');
    } finally {
      setSending(false);
    }
  };

  const copyAddress = () => {
    if (!wallet?.address) return;
    navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="px-4 pt-6 pb-4 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[#888] text-xs uppercase tracking-widest mb-0.5">Портфель</p>
          {wallet && <p className="text-[#555] text-xs font-mono">{wallet.shortAddress}</p>}
        </div>
        <button onClick={refreshBalance} disabled={loading}
          className="p-2 rounded-xl text-[#555] hover:text-white hover:bg-white/[0.06] transition-all">
          <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Balance hero */}
      <div className="text-center py-4">
        <p className="text-5xl font-light text-white tracking-tight">
          ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
        <div className={`mt-2 inline-flex items-center gap-1 text-sm font-medium ${pnlPos ? 'text-[#00c853]' : 'text-[#ff1744]'}`}>
          {pnlPos ? <ArrowUpIcon className="w-3.5 h-3.5" /> : <ArrowDownIcon className="w-3.5 h-3.5" />}
          {pnlPos ? '+' : ''}${totalPnlUsd.toFixed(2)} ({totalPnlPct.toFixed(2)}%)
        </div>
        {ethPrice && (
          <p className="text-xs text-[#444] mt-1">ETH ${ethPrice.toLocaleString()}</p>
        )}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => { setSendOpen(true); setTxHash(''); setSendErr(''); }}
          className="flex items-center justify-center gap-2 py-3.5 bg-[#2962ff] hover:bg-[#1e50e2] rounded-2xl text-white font-semibold text-sm transition-all active:scale-95">
          <PaperAirplaneIcon className="w-4 h-4" /> Отправить
        </button>
        <button onClick={() => setReceiveOpen(true)}
          className="flex items-center justify-center gap-2 py-3.5 bg-[#111] hover:bg-[#1a1a1a] border border-white/[0.08] rounded-2xl text-white font-semibold text-sm transition-all active:scale-95">
          <QrCodeIcon className="w-4 h-4" /> Получить
        </button>
      </div>

      {/* Assets list */}
      <div className="rounded-2xl bg-[#111] border border-white/[0.06] overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.05]">
          <span className="text-xs font-medium text-[#555] uppercase tracking-wider">Активы</span>
        </div>

        {wallet && (
          <AssetRow icon="Ξ" color="#627eea"
            name="Ether" symbol="ETH · RH Chain"
            amount={`${ethBal.toFixed(6)} ETH`}
            usd={balanceUsd != null ? `$${balanceUsd.toFixed(2)}` : '—'} />
        )}

        <AssetRow icon="◎" color="#9945ff"
          name="Solana" symbol="SOL"
          amount={`${solBalance.toFixed(4)} SOL`}
          usd={`$${solUsd.toFixed(2)}`} />

        {tokens.slice(0, 6).map((tok: any, i: number) => (
          <AssetRow key={i}
            icon={tok.logo ? <img src={tok.logo} className="w-5 h-5 rounded-full" alt="" /> : tok.symbol?.slice(0, 2)}
            color="#2962ff"
            name={tok.symbol ?? 'Token'} symbol={tok.symbol ?? '—'}
            amount={Number(tok.amount ?? 0).toLocaleString()}
            usd={`$${Number(tok.usdValue ?? 0).toFixed(2)}`} />
        ))}

        {!wallet && tokens.length === 0 && (
          <div className="px-4 py-8 text-center text-[#555] text-sm">
            Подключите кошелёк
          </div>
        )}
      </div>

      {/* Network badge */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#111] rounded-2xl border border-white/[0.06]">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-[#00c853] shadow-[0_0_6px_#00c853]" />
          <span className="text-sm text-[#888]">Robinhood Chain</span>
        </div>
        <span className="text-xs text-[#555] font-mono">Chain ID 4663</span>
      </div>

      {/* ── Send modal ── */}
      <AnimatePresence>
        {sendOpen && (
          <Modal onClose={() => setSendOpen(false)} title="Отправить ETH">
            {txHash ? (
              <div className="text-center py-4 space-y-3">
                <div className="w-12 h-12 rounded-full bg-[#00c853]/15 flex items-center justify-center mx-auto">
                  <CheckIcon className="w-6 h-6 text-[#00c853]" />
                </div>
                <p className="text-white font-semibold">Транзакция отправлена!</p>
                <p className="text-xs text-[#555] font-mono break-all">{txHash}</p>
                <button onClick={() => setSendOpen(false)}
                  className="w-full py-3 rounded-xl bg-[#2962ff] text-white font-semibold">
                  Закрыть
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-[#555] mb-1.5 block">Адрес получателя</label>
                  <input value={sendTo} onChange={e => setSendTo(e.target.value)}
                    placeholder="0x..."
                    className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm font-mono outline-none focus:border-[#2962ff]/50 transition-all" />
                </div>
                <div>
                  <label className="text-xs text-[#555] mb-1.5 block">Сумма (ETH)</label>
                  <div className="relative">
                    <input type="number" min="0" step="any" value={sendAmt} onChange={e => setSendAmt(e.target.value)}
                      placeholder="0.001"
                      className="w-full bg-[#1a1a1a] border border-white/[0.08] rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-[#2962ff]/50 transition-all" />
                    <button onClick={() => setSendAmt(String(Math.max(0, ethBal - 0.001).toFixed(6)))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#2962ff] hover:text-blue-300">
                      MAX
                    </button>
                  </div>
                  <p className="text-xs text-[#555] mt-1">Доступно: {ethBal.toFixed(6)} ETH</p>
                </div>
                {sendErr && <p className="text-[#ff6b6b] text-sm">{sendErr}</p>}
                <button onClick={handleSend} disabled={sending}
                  className="w-full py-3.5 rounded-xl bg-[#2962ff] hover:bg-[#1e50e2] text-white font-semibold disabled:opacity-50 transition-all">
                  {sending ? 'Отправка...' : 'Подтвердить и отправить'}
                </button>
                <p className="text-center text-xs text-[#444]">
                  Реальная транзакция в Robinhood Chain
                </p>
              </div>
            )}
          </Modal>
        )}
      </AnimatePresence>

      {/* ── Receive modal ── */}
      <AnimatePresence>
        {receiveOpen && wallet && (
          <Modal onClose={() => setReceiveOpen(false)} title="Получить">
            <div className="space-y-4 text-center">
              {/* QR placeholder */}
              <div className="w-40 h-40 mx-auto bg-white rounded-xl flex items-center justify-center">
                <span className="text-[#111] text-xs font-mono break-all px-2">
                  {wallet.address.slice(0, 20)}...
                </span>
              </div>
              <div className="bg-[#1a1a1a] rounded-xl px-4 py-3 text-xs font-mono text-[#888] break-all">
                {wallet.address}
              </div>
              <button onClick={copyAddress}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/20 text-sm font-medium transition-all hover:bg-[#2962ff]/25">
                {copied ? <CheckIcon className="w-4 h-4 text-[#00c853]" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                {copied ? 'Скопировано!' : 'Скопировать адрес'}
              </button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </div>
  );
}

function AssetRow({ icon, color, name, symbol, amount, usd }: {
  icon: React.ReactNode; color: string;
  name: string; symbol: string; amount: string; usd: string;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5 border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors cursor-pointer">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 text-base"
          style={{ backgroundColor: color + '22', border: `1px solid ${color}33` }}>
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
      </div>
    </div>
  );
}

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 35 }}
        className="w-full max-w-md bg-[#111] border border-white/[0.08] rounded-3xl p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-[#555] hover:text-white transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
