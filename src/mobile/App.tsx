
import React, { useState, useEffect } from 'react';
import { View, User } from '../types/types';
import MobileDashboard from './Dashboard.tsx';
import MobileAttendance from './Attendance.tsx';
import MobileExpenses from './Expenses.tsx';
import MobileLeaves from './Leaves.tsx';
import MobileProfile from './Profile.tsx';
import MobilePayroll from './Payroll.tsx';
import IntelligentTicker from '../components/IntelligentTicker.tsx';
import { useTranslation } from 'react-i18next';

interface MobileAppProps {
  user: User;
  language: 'en' | 'ar';
  setLanguage: (l: 'en' | 'ar') => void;
  onLogout: () => void;
  onSwitchToDesktop?: () => void;
}

const MobileApp: React.FC<MobileAppProps> = ({ user, language, setLanguage, onLogout, onSwitchToDesktop }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'home' | 'clock' | 'payroll' | 'leaves' | 'profile' | 'expenses'>('home');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const menuItems = [
    { id: 'home', icon: '🏠', label: t('home') },
    { id: 'clock', icon: '⏱️', label: t('clock') },
    { id: 'leaves', icon: '📅', label: t('leaves') },
    { id: 'payroll', icon: '💵', label: t('payroll') },
    { id: 'profile', icon: '👤', label: t('profile') },
    { id: 'expenses', icon: '📸', label: t('claims') }
  ];

  const isAr = language === 'ar';

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans select-none" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Compact Mini Header */}
      <header className="px-5 pt-8 pb-4 bg-white border-b border-slate-100 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm">
            {user.name[0]}
          </div>
          <h1 className="text-sm font-black text-slate-900 tracking-tight capitalize">
            {activeTab === 'home' ? t('dashboard') : t(activeTab)}
          </h1>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLanguage(isAr ? 'en' : 'ar')} className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500">
            {isAr ? 'EN' : 'AR'}
          </button>
          <button onClick={onLogout} className="px-3 py-1 bg-rose-50 border border-rose-100 rounded-lg text-[9px] font-black uppercase tracking-widest text-rose-600">
            EXIT
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-24 px-4 pt-4 animate-in fade-in slide-in-from-bottom-2 duration-500 bg-slate-50/30">
        <IntelligentTicker />

        {activeTab === 'home' && <MobileDashboard user={user} language={language} onNavigate={setActiveTab} onLogout={onLogout} />}
        {activeTab === 'clock' && <MobileAttendance user={user} language={language} />}
        {activeTab === 'payroll' && <MobilePayroll user={user} language={language} />}
        {activeTab === 'leaves' && <MobileLeaves user={user} language={language} />}
        {activeTab === 'profile' && <MobileProfile user={user} language={language} />}
        {activeTab === 'expenses' && <MobileExpenses user={user} language={language} />}
      </main>

      {/* Persistent Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-2xl border-t border-slate-100 flex items-center justify-around px-2 py-3 pb-8 z-50 shadow-[0_-10px_30px_-15px_rgba(0,0,0,0.1)]">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id as any)}
            className={`flex flex-col items-center gap-1.5 px-3 py-2 rounded-2xl transition-all duration-300 ${activeTab === item.id
              ? 'text-indigo-600 scale-110'
              : 'text-slate-400 opacity-60'
              }`}
          >
            <span className="text-xl leading-none">{item.icon}</span>
            <span className={`text-[8px] font-black uppercase tracking-[0.1em] ${activeTab === item.id ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden text-transparent'}`}>
              {item.label}
            </span>
            {activeTab === item.id && (
              <span className="w-1 h-1 bg-indigo-600 rounded-full animate-pulse"></span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default MobileApp;
