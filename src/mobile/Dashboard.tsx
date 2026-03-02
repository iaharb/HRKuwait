
import React, { useState, useEffect } from 'react';
import { User } from '../types/types';
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
    <div className="space-y-4">
      {/* Primary Action Card: Clock In/Out */}
      <div className="bg-slate-900 rounded-[28px] p-6 text-white relative overflow-hidden shadow-xl shadow-slate-900/10">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t.currentShift}</p>
          <div className="flex items-center gap-1.5 px-2 py-1 bg-white/10 rounded-lg">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[8px] font-black uppercase tracking-widest">Live</span>
          </div>
        </div>

        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-4xl font-black font-mono tracking-tighter">{timer}</span>
          <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Hrs Active</span>
        </div>

        <button
          onClick={() => onNavigate('clock')}
          className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-indigo-500/20"
        >
          {timer !== "00:00:00" ? "Manage Current Session" : "Start New Shift"}
        </button>
      </div>

      {/* Grid: Balances & Payroll */}
      <div className="grid grid-cols-2 gap-3">
        {/* Compact Balance Column */}
        <div className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm flex flex-col justify-between">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em] mb-4">Availability</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-600">{t.annual}</span>
              <span className="text-sm font-black text-indigo-600">{balances.annual}<span className="text-[8px] ml-0.5">d</span></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-600">{t.sick}</span>
              <span className="text-sm font-black text-rose-500">{balances.sick}<span className="text-[8px] ml-0.5">d</span></span>
            </div>
          </div>
        </div>

        {/* Compact Payroll Card */}
        <button onClick={() => onNavigate('payroll')} className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm text-start flex flex-col justify-between active:scale-95 transition-all">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">Next Payment</p>
          <div>
            <p className="text-lg font-black text-slate-900 mb-1">{language === 'ar' ? '٢٥ أبريل' : 'April 25'}</p>
            <div className="h-0.5 w-full bg-emerald-500/20 rounded-full">
              <div className="h-full bg-emerald-500 w-2/3 rounded-full"></div>
            </div>
          </div>
        </button>
      </div>

      {/* Critical Alerts - Ultra Compact */}
      <div className="space-y-2">
        <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg">🚨</span>
            <p className="text-[9px] font-black text-amber-900 uppercase tracking-tighter">{t.civilIdExpiryAlert}</p>
          </div>
          <button className="px-3 py-1.5 bg-amber-200 text-amber-900 rounded-lg text-[8px] font-black uppercase tracking-widest">Update</button>
        </div>
      </div>

      {/* Quick Utility Strip */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onNavigate('expenses')} className="py-3 bg-white border border-slate-100 rounded-2xl text-[9px] font-black text-slate-600 uppercase tracking-widest shadow-sm">📸 {t.claims}</button>
        <button onClick={() => onNavigate('leaves')} className="py-3 bg-white border border-slate-100 rounded-2xl text-[9px] font-black text-slate-600 uppercase tracking-widest shadow-sm">📅 {t.leaves}</button>
        <button onClick={() => onNavigate('profile')} className="py-3 bg-white border border-slate-100 rounded-2xl text-[9px] font-black text-slate-600 uppercase tracking-widest shadow-sm">👤 Me</button>
      </div>

      {/* Build Info */}
      <div className="pt-4 text-center">
        <p className="text-[7px] text-slate-300 font-black uppercase tracking-[0.3em]">{t.version} 5.0-COMPACT • KUWAIT ENTERPRISE</p>
      </div>
    </div>
  );
};

export default MobileDashboard;
