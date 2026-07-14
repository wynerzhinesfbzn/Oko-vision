import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEVMWallet, EVMWallet } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { ClipboardDocumentIcon, CheckIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

type Screen = 'home' | 'create-reveal' | 'import-phrase' | 'import-pk';

export default function Onboarding() {
  const { createNewWallet, importWallet, importPrivateKey, error } = useEVMWallet();
  const [screen,    setScreen]    = useState<Screen>('home');
  const [newWallet, setNewWallet] = useState<EVMWallet | null>(null);
  const [copied,    setCopied]    = useState(false);
  const [phrase,    setPhrase]    = useState('');
  const [pk,        setPk]        = useState('');
  const [showPk,    setShowPk]    = useState(false);
  const [formErr,   setFormErr]   = useState('');

  const handleCreate = () => {
    const w = createNewWallet();
    setNewWallet(w);
    setScreen('create-reveal');
  };

  const copyMnemonic = () => {
    if (!newWallet?.mnemonic) return;
    navigator.clipboard.writeText(newWallet.mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleImportPhrase = () => {
    setFormErr('');
    const w = importWallet(phrase);
    if (!w) setFormErr(error ?? 'Неверная фраза');
  };

  const handleImportPk = () => {
    setFormErr('');
    const w = importPrivateKey(pk);
    if (!w) setFormErr(error ?? 'Неверный ключ');
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {screen === 'home' && (
          <Card key="home">
            {/* Logo */}
            <div className="text-center mb-10">
              <div className="inline-flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-[#2962ff] flex items-center justify-center">
                  <span className="text-white font-bold text-sm">R</span>
                </div>
                <span className="text-2xl font-semibold text-white tracking-tight">OKO Vision</span>
              </div>
              <p className="text-[#888] text-sm">Robinhood Chain · EVM Wallet</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleCreate}
                className="w-full bg-[#2962ff] hover:bg-[#1e50e2] active:bg-[#1941c9] text-white font-semibold py-3.5 rounded-2xl transition-all duration-150"
              >
                Создать новый кошелёк
              </button>
              <button
                onClick={() => { setScreen('import-phrase'); setFormErr(''); }}
                className="w-full bg-white/[0.06] hover:bg-white/[0.10] text-white font-medium py-3.5 rounded-2xl border border-white/[0.08] transition-all duration-150"
              >
                Импорт через сид-фразу
              </button>
              <button
                onClick={() => { setScreen('import-pk'); setFormErr(''); }}
                className="w-full bg-white/[0.06] hover:bg-white/[0.10] text-white font-medium py-3.5 rounded-2xl border border-white/[0.08] transition-all duration-150"
              >
                Импорт через приватный ключ
              </button>
            </div>

            <p className="mt-8 text-center text-xs text-[#555]">
              🔒 Ключи хранятся локально — никуда не передаются
            </p>
          </Card>
        )}

        {screen === 'create-reveal' && newWallet && (
          <Card key="reveal">
            <button onClick={() => setScreen('home')} className="text-[#888] text-sm mb-6 hover:text-white transition-colors">← Назад</button>
            <h2 className="text-xl font-semibold text-white mb-1">Сид-фраза создана</h2>
            <p className="text-[#888] text-sm mb-6">Сохраните эти слова в безопасном месте. Без них доступ к кошельку будет утерян.</p>

            {/* Mnemonic grid */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {newWallet.mnemonic?.split(' ').map((word, i) => (
                <div key={i} className="bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 flex items-center gap-2">
                  <span className="text-[#555] text-xs w-4 shrink-0">{i + 1}</span>
                  <span className="text-white text-sm font-medium">{word}</span>
                </div>
              ))}
            </div>

            <button
              onClick={copyMnemonic}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.06] text-[#888] hover:text-white hover:bg-white/[0.10] text-sm transition-all mb-4"
            >
              {copied ? <CheckIcon className="w-4 h-4 text-[#00c853]" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
              {copied ? 'Скопировано!' : 'Скопировать фразу'}
            </button>

            <div className="bg-[#ff1744]/10 border border-[#ff1744]/20 rounded-xl px-4 py-3 text-sm text-[#ff6b6b] mb-6">
              ⚠️ Никогда не делитесь фразой с третьими лицами
            </div>

            <p className="text-xs text-[#555] text-center mb-4">Адрес: <span className="text-[#888] font-mono">{newWallet.shortAddress}</span></p>

            <button
              onClick={() => setScreen('home')}
              className="w-full bg-[#2962ff] hover:bg-[#1e50e2] text-white font-semibold py-3.5 rounded-2xl transition-all"
            >
              Готово — войти в кошелёк
            </button>
          </Card>
        )}

        {screen === 'import-phrase' && (
          <Card key="import-phrase">
            <button onClick={() => setScreen('home')} className="text-[#888] text-sm mb-6 hover:text-white transition-colors">← Назад</button>
            <h2 className="text-xl font-semibold text-white mb-1">Импорт кошелька</h2>
            <p className="text-[#888] text-sm mb-6">Введите 12 или 24 слова через пробел</p>

            <textarea
              value={phrase}
              onChange={e => { setPhrase(e.target.value); setFormErr(''); }}
              placeholder="word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12"
              className="w-full h-28 bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 text-white text-sm placeholder-[#444] outline-none focus:border-[#2962ff]/60 focus:ring-1 focus:ring-[#2962ff]/30 resize-none mb-4 transition-all"
            />

            {formErr && <p className="text-[#ff6b6b] text-sm mb-3">{formErr}</p>}

            <button
              onClick={handleImportPhrase}
              disabled={!phrase.trim()}
              className="w-full bg-[#2962ff] hover:bg-[#1e50e2] disabled:opacity-40 text-white font-semibold py-3.5 rounded-2xl transition-all"
            >
              Импортировать
            </button>
          </Card>
        )}

        {screen === 'import-pk' && (
          <Card key="import-pk">
            <button onClick={() => setScreen('home')} className="text-[#888] text-sm mb-6 hover:text-white transition-colors">← Назад</button>
            <h2 className="text-xl font-semibold text-white mb-1">Приватный ключ</h2>
            <p className="text-[#888] text-sm mb-6">Вставьте hex-ключ (0x...)</p>

            <div className="relative mb-4">
              <input
                type={showPk ? 'text' : 'password'}
                value={pk}
                onChange={e => { setPk(e.target.value); setFormErr(''); }}
                placeholder="0x..."
                className="w-full bg-white/[0.06] border border-white/[0.10] rounded-2xl px-4 py-3 pr-11 text-white text-sm placeholder-[#444] outline-none focus:border-[#2962ff]/60 focus:ring-1 focus:ring-[#2962ff]/30 font-mono transition-all"
              />
              <button
                onClick={() => setShowPk(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555] hover:text-[#888]"
              >
                {showPk ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
              </button>
            </div>

            {formErr && <p className="text-[#ff6b6b] text-sm mb-3">{formErr}</p>}

            <button
              onClick={handleImportPk}
              disabled={!pk.trim()}
              className="w-full bg-[#2962ff] hover:bg-[#1e50e2] disabled:opacity-40 text-white font-semibold py-3.5 rounded-2xl transition-all"
            >
              Импортировать
            </button>
          </Card>
        )}
      </AnimatePresence>
    </div>
  );
}

function Card({ children, key: _k }: { children: React.ReactNode; key?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.2 }}
      className="w-full max-w-md bg-[#111111] rounded-3xl p-7 border border-white/[0.07] shadow-2xl"
    >
      {children}
    </motion.div>
  );
}
