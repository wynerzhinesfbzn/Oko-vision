import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext/AuthContext';
import { useEVMWallet } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import {
  FingerPrintIcon,
  KeyIcon,
  ShieldCheckIcon,
  ArrowLeftOnRectangleIcon,
  TrashIcon,
  ClipboardDocumentIcon,
  CheckIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

export default function SettingsTab() {
  const { biometricsSupported, logout, user } = useAuth();
  const { wallet, disconnectWallet } = useEVMWallet();
  const [bioStatus, setBioStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [bioMsg,    setBioMsg]    = useState('');
  const [copied,    setCopied]    = useState<'addr' | 'mnem' | 'pk' | null>(null);
  const [showMnem,  setShowMnem]  = useState(false);
  const [showPk,    setShowPk]    = useState(false);

  const copy = (text: string, key: typeof copied) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const registerBiometrics = async () => {
    if (!browserSupportsWebAuthn()) { setBioStatus('error'); setBioMsg('WebAuthn не поддерживается'); return; }
    setBioStatus('loading'); setBioMsg('');
    try {
      const challenge = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      await startRegistration({
        optionsJSON: {
          challenge,
          rp: { id: window.location.hostname, name: 'OKO Vision' },
          user: { id: btoa('oko-user'), name: 'oko@terminal', displayName: user?.name ?? 'Trader' },
          pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
          timeout: 60000, attestation: 'none',
          authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
        },
      });
      setBioStatus('ok'); setBioMsg('Биометрия зарегистрирована');
    } catch (e: any) {
      setBioStatus('error'); setBioMsg(e?.message ?? 'Ошибка');
    }
  };

  const hasCreds = JSON.parse(localStorage.getItem('oko-webauthn-creds') ?? '[]').length > 0;

  return (
    <div className="px-4 pt-6 pb-4 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Настройки</h1>
        <p className="text-[#555] text-sm">Безопасность и кошелёк</p>
      </div>

      {/* Wallet info */}
      {wallet && (
        <Section icon={KeyIcon} title="EVM-кошелёк">
          <div className="space-y-3">
            <InfoRow label="Адрес" value={wallet.shortAddress} onCopy={() => copy(wallet.address, 'addr')} copied={copied === 'addr'} />

            {wallet.mnemonic && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#555]">Сид-фраза</span>
                  <div className="flex gap-2">
                    <button onClick={() => setShowMnem(v => !v)} className="text-[#444] hover:text-[#888] transition-colors">
                      {showMnem ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                    <button onClick={() => copy(wallet.mnemonic!, 'mnem')} className="text-[#444] hover:text-[#888] transition-colors">
                      {copied === 'mnem' ? <CheckIcon className="w-4 h-4 text-[#00c853]" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="bg-[#1a1a1a] rounded-xl px-3 py-2.5 font-mono text-xs text-[#888] leading-relaxed break-all">
                  {showMnem ? wallet.mnemonic : '• • • • • • • • • • • •'}
                </div>
              </div>
            )}

            {wallet.privateKey && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-[#555]">Приватный ключ</span>
                  <div className="flex gap-2">
                    <button onClick={() => setShowPk(v => !v)} className="text-[#444] hover:text-[#888] transition-colors">
                      {showPk ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                    </button>
                    <button onClick={() => copy(wallet.privateKey!, 'pk')} className="text-[#444] hover:text-[#888] transition-colors">
                      {copied === 'pk' ? <CheckIcon className="w-4 h-4 text-[#00c853]" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="bg-[#1a1a1a] rounded-xl px-3 py-2.5 font-mono text-xs text-[#888] leading-relaxed break-all">
                  {showPk ? wallet.privateKey : '••••••••••••••••••••••••••••••••'}
                </div>
              </div>
            )}

            <button
              onClick={disconnectWallet}
              className="flex items-center gap-2 text-xs text-[#ff6b6b] hover:text-[#ff1744] transition-colors mt-1"
            >
              <TrashIcon className="w-3.5 h-3.5" />
              Удалить кошелёк с устройства
            </button>
          </div>
        </Section>
      )}

      {/* Biometrics */}
      <Section icon={FingerPrintIcon} title="Биометрия">
        <p className="text-sm text-[#555] mb-3">
          {biometricsSupported
            ? hasCreds ? 'Биометрия настроена.' : 'Зарегистрируйте отпечаток или Face ID.'
            : 'Устройство не поддерживает WebAuthn.'}
        </p>
        <button
          onClick={registerBiometrics}
          disabled={!biometricsSupported || bioStatus === 'loading'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/20 hover:bg-[#2962ff]/25 disabled:opacity-40 transition-all text-sm font-medium"
        >
          <FingerPrintIcon className="w-4 h-4" />
          {bioStatus === 'loading' ? 'Регистрация...' : hasCreds ? 'Перерегистрировать' : 'Зарегистрировать'}
        </button>
        {bioStatus === 'ok'    && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-sm text-[#00c853]">✓ {bioMsg}</motion.p>}
        {bioStatus === 'error' && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-sm text-[#ff6b6b]">{bioMsg}</motion.p>}
      </Section>

      {/* Security */}
      <Section icon={ShieldCheckIcon} title="Безопасность">
        <ul className="text-sm text-[#555] space-y-1.5">
          <li className="flex items-center gap-2"><span className="text-[#00c853]">✓</span> Ключи хранятся только локально</li>
          <li className="flex items-center gap-2"><span className="text-[#00c853]">✓</span> Сессия — sessionStorage</li>
          <li className="flex items-center gap-2"><span className="text-[#00c853]">✓</span> Биометрия через W3C WebAuthn</li>
          <li className="flex items-center gap-2"><span className="text-[#00c853]">✓</span> Нет серверов — нет утечек</li>
        </ul>
      </Section>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#ff1744]/8 text-[#ff6b6b] border border-[#ff1744]/15 hover:bg-[#ff1744]/15 transition-all text-sm font-medium"
      >
        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
        Выйти из терминала
      </button>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Icon className="w-4 h-4 text-[#555]" />
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, onCopy, copied }: { label: string; value: string; onCopy: () => void; copied: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-xs text-[#555]">{label}</p>
        <p className="text-sm text-white font-mono">{value}</p>
      </div>
      <button onClick={onCopy} className="text-[#444] hover:text-[#888] transition-colors p-1">
        {copied ? <CheckIcon className="w-4 h-4 text-[#00c853]" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
      </button>
    </div>
  );
}
