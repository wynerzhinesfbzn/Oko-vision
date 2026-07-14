import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Fingerprint, Key, ShieldCheck, Cpu, Eye, EyeOff, AlertCircle, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext/AuthContext';
import type { AuthMethod } from '@/contexts/AuthContext/types';
import zxcvbn from 'zxcvbn';

/* ─── Strength bar for password field ─────────────────────────── */
function StrengthBar({ value }: { value: string }) {
  if (!value) return null;
  const { score } = zxcvbn(value);
  const labels = ['Слабый', 'Слабый', 'Средний', 'Хороший', 'Сильный'];
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-lime-400', 'bg-emerald-400'];
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= score ? colors[score] : 'bg-white/10'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500">{labels[score]}</p>
    </div>
  );
}

/* ─── Method tab button ────────────────────────────────────────── */
interface TabProps {
  id: AuthMethod;
  active: boolean;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}
function Tab({ id: _id, active, disabled, icon, label, onClick }: TabProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border text-xs font-medium transition-all duration-200 ${
        active
          ? 'border-orange-500 bg-orange-500/15 text-orange-400 shadow-[0_0_16px_rgba(249,115,22,0.2)]'
          : 'border-white/8 bg-white/4 text-gray-500 hover:bg-white/8 hover:text-gray-300'
      } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className="w-5 h-5">{icon}</span>
      {label}
    </button>
  );
}

/* ─── Per-method error messages ───────────────────────────────── */
function errorMsg(method: AuthMethod): string {
  switch (method) {
    case 'password':  return 'Неверный пароль. Минимум 6 символов.';
    case 'mnemonic':  return 'Неверная фраза. Нужно 12 слов через пробел.';
    case 'biometrics':return 'Биометрия отклонена или недоступна.';
    case 'crypto':    return 'Ошибка аппаратного ключа.';
    default:          return 'Ошибка входа.';
  }
}

/* ─── Main Login screen ────────────────────────────────────────── */
export default function Login() {
  const { login, biometricsSupported } = useAuth();
  const [method, setMethod] = useState<AuthMethod>('password');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [mnemonic, setMnemonic] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      const creds: Record<string, string> = {};
      if (method === 'password') creds.password = password;
      if (method === 'mnemonic') creds.mnemonic = mnemonic;
      const ok = await login(method, creds);
      if (!ok) setError(errorMsg(method));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[#060606] p-4">
      {/* Ambient fire glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-orange-600/10 blur-[120px]" />
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-[300px] h-[200px] rounded-full bg-amber-500/8 blur-[80px]" />
        <div className="absolute top-1/4 left-1/4 w-[200px] h-[200px] rounded-full bg-orange-900/8 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-sm"
      >
        {/* Card */}
        <div className="fire-glow rounded-3xl border border-white/8 bg-white/4 backdrop-blur-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center mb-4 shadow-[0_0_32px_rgba(249,115,22,0.35)]">
              <Flame className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              OKO <span className="text-orange-400">Vision</span>
            </h1>
            <p className="text-gray-500 text-xs mt-1 tracking-widest uppercase">Terminal</p>
          </div>

          {/* Method selector */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            <Tab id="password"   active={method === 'password'}   icon={<Key className="w-5 h-5" />}         label="Пароль"   onClick={() => setMethod('password')} />
            <Tab id="biometrics" active={method === 'biometrics'} icon={<Fingerprint className="w-5 h-5" />} label="Биометр." disabled={!biometricsSupported} onClick={() => setMethod('biometrics')} />
            <Tab id="mnemonic"   active={method === 'mnemonic'}   icon={<ShieldCheck className="w-5 h-5" />} label="Фраза"    onClick={() => setMethod('mnemonic')} />
            <Tab id="crypto"     active={method === 'crypto'}     icon={<Cpu className="w-5 h-5" />}         label="Ключ"     onClick={() => setMethod('crypto')} />
          </div>

          {/* Input area */}
          <AnimatePresence mode="wait">
            {method === 'password' && (
              <motion.div key="pw" {...fade} className="mb-5">
                <div className="relative">
                  <input
                    autoFocus
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Введите пароль (мин. 6 символов)"
                    className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 pr-11 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <StrengthBar value={password} />
              </motion.div>
            )}

            {method === 'mnemonic' && (
              <motion.div key="mn" {...fade} className="mb-5">
                <textarea
                  autoFocus
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleLogin(); } }}
                  placeholder="Введите 12 слов сид-фразы через пробел"
                  rows={3}
                  className="w-full bg-white/6 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-orange-500/60 focus:ring-1 focus:ring-orange-500/30 transition-all resize-none leading-relaxed"
                />
                <p className="text-xs text-gray-600 mt-1">Фраза хранится только локально и никуда не отправляется</p>
              </motion.div>
            )}

            {method === 'biometrics' && (
              <motion.div key="bio" {...fade} className="mb-5 text-center py-2">
                <div className="w-20 h-20 mx-auto rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3">
                  <Fingerprint className="w-10 h-10 text-orange-400" />
                </div>
                <p className="text-gray-400 text-sm">Нажмите кнопку и приложите палец<br />или посмотрите в камеру</p>
              </motion.div>
            )}

            {method === 'crypto' && (
              <motion.div key="cr" {...fade} className="mb-5 text-center py-2">
                <div className="w-20 h-20 mx-auto rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center mb-3">
                  <Cpu className="w-10 h-10 text-orange-400" />
                </div>
                <p className="text-gray-400 text-sm">Подключите аппаратный ключ<br />(YubiKey, Ledger и др.)</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 text-red-400 text-sm mb-4 bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2"
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all duration-150 shadow-[0_4px_24px_rgba(249,115,22,0.3)] disabled:opacity-50 disabled:cursor-not-allowed text-sm tracking-wide"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Проверяем…
              </span>
            ) : 'Войти в терминал'}
          </button>

          <p className="text-center text-xs text-gray-700 mt-5">
            Защищено шифрованием · данные хранятся локально
          </p>
        </div>
      </motion.div>
    </div>
  );
}

/* shared fade animation for AnimatePresence children */
const fade = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.18 },
};
