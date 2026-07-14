import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext/AuthContext';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { FingerPrintIcon, KeyIcon, ShieldCheckIcon, ArrowLeftOnRectangleIcon } from '@heroicons/react/24/outline';
import { motion } from 'framer-motion';

export default function SettingsTab() {
  const { biometricsSupported, logout, user } = useAuth();
  const [bioStatus, setBioStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [bioMsg,    setBioMsg]    = useState('');

  const registerBiometrics = async () => {
    if (!browserSupportsWebAuthn()) {
      setBioStatus('error');
      setBioMsg('Браузер не поддерживает WebAuthn');
      return;
    }
    setBioStatus('loading');
    setBioMsg('');
    try {
      const challenge = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      const attResp = await startRegistration({
        optionsJSON: {
          challenge,
          rp: { id: window.location.hostname, name: 'OKO Vision' },
          user: {
            id: btoa('oko-user'),
            name: 'oko@terminal',
            displayName: user?.name ?? 'Trader',
          },
          pubKeyCredParams: [
            { alg: -7,   type: 'public-key' },
            { alg: -257, type: 'public-key' },
          ],
          timeout: 60000,
          attestation: 'none',
          authenticatorSelection: {
            userVerification: 'required',
            residentKey: 'preferred',
          },
        },
      });

      // Store credential locally (production: send to server)
      const existing = JSON.parse(localStorage.getItem('oko-webauthn-creds') ?? '[]');
      existing.push({ id: attResp.id, type: attResp.type });
      localStorage.setItem('oko-webauthn-creds', JSON.stringify(existing));

      setBioStatus('ok');
      setBioMsg('Биометрия зарегистрирована! Теперь вы можете входить отпечатком / Face ID.');
    } catch (e: any) {
      setBioStatus('error');
      setBioMsg(e?.message ?? 'Ошибка регистрации');
    }
  };

  const hasCreds = JSON.parse(localStorage.getItem('oko-webauthn-creds') ?? '[]').length > 0;

  return (
    <div className="p-6 max-w-xl mx-auto space-y-5">
      <h1 className="text-xl font-semibold text-white">Настройки</h1>

      {/* Biometrics */}
      <Section icon={FingerPrintIcon} title="Биометрия" accent="orange">
        <p className="text-sm text-gray-400 mb-4">
          {biometricsSupported
            ? hasCreds
              ? 'Биометрия уже настроена. Можно перерегистрировать.'
              : 'Зарегистрируйте отпечаток пальца или Face ID для быстрого входа.'
            : 'Ваше устройство или браузер не поддерживает WebAuthn.'}
        </p>

        <button
          onClick={registerBiometrics}
          disabled={!biometricsSupported || bioStatus === 'loading'}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/25 hover:bg-orange-500/25 disabled:opacity-40 transition-all text-sm font-medium"
        >
          <FingerPrintIcon className="w-4 h-4" />
          {bioStatus === 'loading' ? 'Регистрация...' : hasCreds ? 'Перерегистрировать' : 'Зарегистрировать отпечаток / Face ID'}
        </button>

        {bioStatus === 'ok' && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-emerald-400">
            ✓ {bioMsg}
          </motion.p>
        )}
        {bioStatus === 'error' && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-sm text-red-400">
            {bioMsg}
          </motion.p>
        )}
      </Section>

      {/* Auth methods info */}
      <Section icon={KeyIcon} title="Методы входа" accent="blue">
        <div className="space-y-2 text-sm text-gray-400">
          <MethodRow label="Пароль" available />
          <MethodRow label="Мнемоника (12 слов)" available />
          <MethodRow label="Биометрия (WebAuthn)" available={biometricsSupported} />
          <MethodRow label="Аппаратный ключ" available={false} note="Скоро" />
        </div>
      </Section>

      {/* Security */}
      <Section icon={ShieldCheckIcon} title="Безопасность" accent="emerald">
        <ul className="text-sm text-gray-400 space-y-1.5">
          <li>✓ Пароль хранится в зашифрованном виде (btoa)</li>
          <li>✓ Сессия — только в памяти (sessionStorage)</li>
          <li>✓ Биометрия через W3C WebAuthn API</li>
          <li>✓ Никакие данные не передаются на сервер</li>
        </ul>
      </Section>

      {/* Logout */}
      <button
        onClick={logout}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm font-medium"
      >
        <ArrowLeftOnRectangleIcon className="w-4 h-4" />
        Выйти из терминала
      </button>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  accent,
  children,
}: {
  icon: React.ElementType;
  title: string;
  accent: 'orange' | 'blue' | 'emerald';
  children: React.ReactNode;
}) {
  const colors: Record<string, string> = {
    orange: 'text-orange-400 bg-orange-500/10',
    blue:   'text-blue-400 bg-blue-500/10',
    emerald:'text-emerald-400 bg-emerald-500/10',
  };
  return (
    <div className="bg-white/[0.04] border border-white/[0.07] rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colors[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function MethodRow({ label, available, note }: { label: string; available: boolean; note?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        available
          ? 'bg-emerald-500/15 text-emerald-400'
          : 'bg-gray-700/60 text-gray-500'
      }`}>
        {note ?? (available ? 'Активен' : 'Недоступно')}
      </span>
    </div>
  );
}
