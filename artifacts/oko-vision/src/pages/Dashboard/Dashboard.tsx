import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  ArrowsRightLeftIcon,
  ArrowPathIcon,
  ClockIcon,
  Cog6ToothIcon,
  ArrowLeftOnRectangleIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';
import WalletTab from './tabs/WalletTab';
import SwapTab from './tabs/SwapTab';
import BridgeTab from './tabs/BridgeTab';
import HistoryTab from './tabs/HistoryTab';
import SettingsTab from './tabs/SettingsTab';

type TabId = 'wallet' | 'swap' | 'bridge' | 'history' | 'settings';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'wallet',   label: 'Кошелёк',   icon: HomeIcon },
  { id: 'swap',     label: 'Обмен',      icon: ArrowsRightLeftIcon },
  { id: 'bridge',   label: 'Мост',       icon: ArrowPathIcon },
  { id: 'history',  label: 'История',    icon: ClockIcon },
  { id: 'settings', label: 'Настройки',  icon: Cog6ToothIcon },
];

export default function Dashboard() {
  const { logout, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('wallet');

  const renderTab = () => {
    switch (activeTab) {
      case 'wallet':   return <WalletTab />;
      case 'swap':     return <SwapTab />;
      case 'bridge':   return <BridgeTab />;
      case 'history':  return <HistoryTab />;
      case 'settings': return <SettingsTab />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b0f] text-white flex">
      {/* ── Phantom-style sidebar ── */}
      <aside className="w-[72px] shrink-0 bg-[#111118] border-r border-white/[0.06] flex flex-col items-center py-5 gap-1 z-10">
        {/* Logo */}
        <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-orange-500/30">
          <ChartBarIcon className="w-5 h-5 text-white" />
        </div>

        {/* Nav items */}
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              title={label}
              className={`relative w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-all duration-200 group ${
                active
                  ? 'bg-orange-500/15 text-orange-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.06]'
              }`}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-orange-500/10 border border-orange-500/20"
                  transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                />
              )}
              <Icon className="w-5 h-5 relative z-10" />
              <span className="text-[9px] leading-none font-medium relative z-10 opacity-70">
                {label.slice(0, 3)}
              </span>
            </button>
          );
        })}

        {/* Spacer + logout */}
        <div className="flex-1" />
        <div className="text-[10px] text-gray-600 text-center leading-tight mb-1 px-1">
          {user?.name ?? 'OKO'}
        </div>
        <button
          onClick={logout}
          title="Выйти"
          className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200"
        >
          <ArrowLeftOnRectangleIcon className="w-5 h-5" />
        </button>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto max-h-screen">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="h-full"
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
