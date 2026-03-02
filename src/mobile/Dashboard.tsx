
import React, { useState, useEffect } from 'react';
import { User } from '../types.ts';
import { dbService } from '../services/dbService.ts';
import { translations } from '../translations.ts';

const MobileDashboard: React.FC<{ user: User, language: 'en' | 'ar', onNavigate: (t: any) => void, onLogout?: () => void }> = ({ user, language, onNavigate, onLogout }) => {
  const [timer, setTimer] = useState("00:00:00");
  const [balances, setBalances] = useState({ annual: 0, sick: 0 });
  const t = translations[language];

  useEffect(() => {
    const fetch = async () => {
      const emp = await dbService.getEmployeeByName(user.name);
      if (emp?.leaveBalances) {
        setBalances({
          annual: (emp.leaveBalances.annual || 0) - (emp.leaveBalances.annualUsed || 0),
          sick: (emp.leaveBalances.sick || 0) - (emp.leaveBalances.sickUsed || 0)
        });
      }
    };
    fetch();

    const interval = setInterval(() => {
      const start = localStorage.getItem('shift_start');
      if (start) {
        const diff = Date.now() - parseInt(start);
        const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
        setTimer(`${h}:${m}:${s}`);
      } else {
        setTimer("00:00:00");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user]);

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Card */}
      <div className="bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 p-6 opacity-10">🇰🇼</div>
        <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">{t.welcome}, {user.name.split(' ')[0]}</p>
        <h2 className="text-2xl font-black tracking-tight mb-6">{t.readyShift}</h2>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t.currentShift}</p>
            <p className="text-4xl font-black font-mono tracking-tighter">{timer}</p>
          </div>
          <button onClick={() => onNavigate('clock')} className="px-6 py-3 bg-emerald-500 text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all">
            {t.viewSession}
          </button>
        </div>
      </div>

      {/* Enhanced Quick Action Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm space-y-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t.leaveBalance}</p>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mb-1.5 uppercase">
                <span>{t.annual}</span>
                <span>{balances.annual}/30d</span>
              </div>
              <div className="w-full h-2 bg-indigo-50 rounded-full overflow-hidden border border-indigo-100 shadow-inner">
                <div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${(balances.annual / 30) * 100}%` }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 mb-1.5 uppercase">
                <span>{t.sick}</span>
                <span>{balances.sick}/15d</span>
              </div>
              <div className="w-full h-2 bg-rose-50 rounded-full overflow-hidden border border-rose-100 shadow-inner">
                <div className="h-full bg-rose-500 transition-all duration-1000" style={{ width: `${(balances.sick / 15) * 100}%` }}></div>
              </div>
            </div>
          </div>
        </div>
        <button onClick={() => onNavigate('payroll')} className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm text-start flex flex-col justify-between active:scale-95 transition-all">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t.nextPayDay}</p>
          <div>
            <p className="text-xl font-black text-slate-900">{language === 'ar' ? '٢٥ أبريل' : 'April 25'}</p>
            <p className="text-[8px] font-bold text-emerald-600 uppercase mt-1 tracking-widest flex items-center gap-1">
              <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse"></span>
              WPS Verified
            </p>
          </div>
        </button>
      </div>

      {/* Notifications / Alerts Feed */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">{t.actionRequired}</h3>
        <div className="bg-amber-50 border border-amber-100 p-6 rounded-[32px] flex items-center gap-4">
          <span className="text-2xl">🚨</span>
          <div>
            <p className="text-xs font-black text-amber-900 uppercase">{t.civilIdExpiryAlert}</p>
            <p className="text-[10px] text-amber-700 font-medium">{t.expiryMessage} {t.uploadNew}</p>
          </div>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-[32px] flex items-center gap-4">
          <span className="text-2xl">✅</span>
          <div>
            <p className="text-xs font-black text-indigo-900 uppercase">{t.leaveApproved}</p>
            <p className="text-[10px] text-indigo-700 font-medium">{t.leaveApprovedMsg}</p>
          </div>
        </div>
      </div>

      {/* Quick Access Actions */}
      <div className="space-y-4">
        <button
          onClick={() => onNavigate('expenses')}
          className="w-full py-5 bg-white text-indigo-600 border border-slate-100 rounded-[28px] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-sm active:scale-95 transition-all"
        >
          <span>📸</span> {t.claims}
        </button>
      </div>

      {/* Explicit Logout Section */}
      <div className="pt-6 border-t border-slate-100">
        <button
          onClick={onLogout}
          className="w-full py-5 bg-rose-50 text-rose-600 border border-rose-100 rounded-[24px] font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all shadow-sm"
        >
          {t.signOutEss}
        </button>
        <p className="mt-4 text-center text-[8px] text-slate-400 font-black uppercase tracking-widest">
          {t.version} 4.0.2 {t.mobileBuild} • Enterprise HR
        </p>
      </div>
    </div>
  );
};

export default MobileDashboard;
