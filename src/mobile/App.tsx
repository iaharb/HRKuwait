
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
      {/* Sliding Mobile Menu Overlay */}
      <div
        className={`fixed inset-0 z-[100] transition-opacity duration-300 ${isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}></div>
        <aside
          className={`absolute top-0 bottom-0 w-80 bg-white shadow-2xl transition-transform duration-500 transform 
            ${isAr ? (isMenuOpen ? 'translate-x-0' : 'translate-x-full') : (isMenuOpen ? 'translate-x-0' : '-translate-x-full')}
            ${isAr ? 'right-0 rounded-l-[40px]' : 'left-0 rounded-r-[40px]'}
            flex flex-col
          `}
        >
          {/* Menu Header with Close/Toggle Sandwich */}
          <div className="p-8 pb-4 pt-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-black text-xl">
                {user.name[0]}
              </div>
              <div className="overflow-hidden">
                <h2 className="text-sm font-black text-slate-900 tracking-tight truncate">{user.name}</h2>
                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{user.role}</p>
              </div>
            </div>
            <button
              onClick={() => setIsMenuOpen(false)}
              className="w-10 h-10 rounded-xl bg-slate-50 flex flex-col items-center justify-center gap-1"
            >
              <span className="w-4 h-0.5 bg-slate-400 rotate-45 translate-y-0.5"></span>
              <span className="w-4 h-0.5 bg-slate-400 -rotate-45 -translate-y-0.5"></span>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-6 py-4 space-y-2 custom-scrollbar">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id as any); setIsMenuOpen(false); }}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${activeTab === item.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <span className="text-2xl">{item.icon}</span>
                <span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="p-8 border-t border-slate-100 space-y-4 bg-slate-50/50">
            <button
              onClick={() => { setLanguage(isAr ? 'en' : 'ar'); setIsMenuOpen(false); }}
              className="w-full flex items-center gap-4 px-6 py-2 text-slate-500 font-black text-[10px] uppercase tracking-widest"
            >
              <span>🌐</span> {isAr ? 'English' : 'العربية'}
            </button>
            <button
              onClick={onLogout}
              className="w-full py-4 bg-white text-rose-600 rounded-2xl font-black text-[10px] uppercase tracking-widest border border-rose-100 shadow-sm active:scale-95 transition-all"
            >
              {t('terminateSession')}
            </button>
          </div>
        </aside>
      </div>

      {/* Dynamic Mobile Header */}
      <header className="px-6 pt-12 pb-6 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (activeTab !== 'home') {
                setActiveTab('home');
              } else {
                setIsMenuOpen(true);
              }
            }}
            className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col items-center justify-center gap-1.5 active:scale-90 transition-all shadow-sm"
          >
            <span className="w-5 h-0.5 bg-slate-900 rounded-full"></span>
            <span className="w-5 h-0.5 bg-slate-400 rounded-full"></span>
            <span className="w-5 h-0.5 bg-slate-900 rounded-full"></span>
          </button>
          <div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest leading-none mb-1">{t('enterprise')}</p>
            <h1 className="text-xl font-black text-slate-900 capitalize leading-none">
              {activeTab === 'home' ? t('dashboard') : t(activeTab)}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-3 text-right">
          {onSwitchToDesktop && (
            <button
              onClick={onSwitchToDesktop}
              className="hidden sm:block px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100"
            >
              {t('switchToDesktop')}
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-sm border border-slate-800 shadow-lg">
            {user.name[0]}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-12 pt-4 px-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <IntelligentTicker />

        {activeTab === 'home' && <MobileDashboard user={user} language={language} onNavigate={setActiveTab} onLogout={onLogout} />}
        {activeTab === 'clock' && <MobileAttendance user={user} language={language} />}
        {activeTab === 'payroll' && <MobilePayroll user={user} language={language} />}
        {activeTab === 'leaves' && <MobileLeaves user={user} language={language} />}
        {activeTab === 'profile' && <MobileProfile user={user} language={language} />}
        {activeTab === 'expenses' && <MobileExpenses user={user} language={language} />}
      </main>
    </div>
  );
};

export default MobileApp;
