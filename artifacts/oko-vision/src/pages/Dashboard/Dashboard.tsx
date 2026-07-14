import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext/AuthContext';
import { useEVMWallet } from '@/contexts/EVMWalletContext/EVMWalletContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HomeIcon,
  ArrowsRightLeftIcon,
  ArrowPathIcon,
  ClockIcon,
  Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import WalletTab from './tabs/WalletTab';
import SwapTab from './tabs/SwapTab';
import BridgeTab from './tabs/BridgeTab';
import HistoryTab from './tabs/HistoryTab';
import SettingsTab from './tabs/SettingsTab';

type TabId = 'wallet' | 'swap' | 'bridge' | 'history' | 'settings';

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'wallet',   label: 'Главная',   icon: HomeIcon },
  { id: 'swap',     label: 'Обмен',     icon: ArrowsRightLeftIcon },
  { id: 'bridge',   label: 'Мост',      icon: ArrowPathIcon },
  { id: 'history',  label: 'История',   icon: ClockIcon },
  { id: 'settings', label: 'Настройки', icon: Cog6ToothIcon },
];

export default function Dashboard() {
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
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col max-w-2xl mx-auto relative">
      {/* ── Main content area ── */}
      <main className="flex-1 overflow-y-auto pb-20">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
          >
            {renderTab()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Robinhood-style bottom nav ── */}
      <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-[#0a0a0a]/95 backdrop-blur border-t border-white/[0.06] flex justify-around px-2 py-3 z-50">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex flex-col items-center gap-0.5 py-1 px-3 rounded-xl transition-all duration-150 ${
                active ? 'text-white' : 'text-[#555] hover:text-[#888]'
              }`}
            >
              <Icon className={`w-6 h-6 transition-all ${active ? 'stroke-[2]' : 'stroke-[1.5]'}`} />
              <span className={`text-[10px] font-medium leading-tight ${active ? 'text-white' : 'text-[#555]'}`}>
                {label}
              </span>
              {active && (
                <motion.div
                  layoutId="tab-dot"
                  className="w-1 h-1 rounded-full bg-[#2962ff] mt-0.5"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
