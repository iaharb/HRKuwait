
import React, { useState, useEffect } from 'react';
import { View, User } from '../types.ts';
import MobileDashboard from './Dashboard.tsx';
import MobileAttendance from './Attendance.tsx';
import MobileExpenses from './Expenses.tsx';
import MobileLeaves from './Leaves.tsx';
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
  const [activeTab, setActiveTab] = useState<'home' | 'clock' | 'expenses' | 'leaves'>('home');

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans select-none animate-in fade-in duration-500" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      {/* Dynamic Mobile Header */}
      <header className="px-6 pt-12 pb-6 bg-white/80 backdrop-blur-xl border-b border-slate-100 flex items-center justify-between sticky top-0 z-50">
        <div>
          <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">{t('enterprise')}</p>
          <h1 className="text-xl font-black text-slate-900 capitalize">{t(activeTab)}</h1>
        </div>
        <div className="flex items-center gap-3">
           {window.innerWidth >= 768 && onSwitchToDesktop && (
             <button 
               onClick={onSwitchToDesktop}
               className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest border border-indigo-100"
             >
               {t('switchToDesktop')}
             </button>
           )}
           <button onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black transition-transform active:scale-90">
             {language === 'en' ? 'ع' : 'EN'}
           </button>
           <button 
             onClick={onLogout}
             className="w-10 h-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center text-lg border border-rose-100 active:scale-95 transition-all shadow-sm"
             title={t('terminateSession')}
           >
             🚪
           </button>
           <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-black text-sm border border-slate-800">
             {user.name[0]}
           </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto pb-32 pt-4 px-4">
        <IntelligentTicker />
        
        {activeTab === 'home' && <MobileDashboard user={user} language={language} onNavigate={setActiveTab} onLogout={onLogout} />}
        {activeTab === 'clock' && <MobileAttendance user={user} language={language} />}
        {activeTab === 'expenses' && <MobileExpenses user={user} language={language} />}
        {activeTab === 'leaves' && <MobileLeaves user={user} language={language} />}
      </main>

      {/* Persistent Bottom Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-2xl border-t border-slate-100 px-8 py-4 flex justify-between items-center z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-[32px]">
        {[
          { id: 'home', icon: '🏠', label: t('home') },
          { id: 'clock', icon: '⏱️', label: t('clock') },
          { id: 'leaves', icon: '📅', label: t('leaves') },
          { id: 'expenses', icon: '📸', label: t('claims') }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex flex-col items-center gap-1.5 transition-all ${activeTab === tab.id ? 'scale-110' : 'opacity-40 grayscale'}`}
          >
            <span className="text-2xl">{tab.icon}</span>
            <span className={`text-[8px] font-black uppercase tracking-widest ${activeTab === tab.id ? 'text-slate-900' : 'text-slate-400'}`}>
              {tab.label}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
};

export default MobileApp;
