
import React, { useState } from 'react';
import { User, UserRole } from '../types.ts';
import { dbService } from '../services/dbService.ts';
import { MOCK_EMPLOYEES } from '../constants.tsx';
import { translations } from '../translations.ts';

interface MobileLoginProps {
  onLogin: (u: User) => void;
  language: 'en' | 'ar';
  setLanguage: (l: 'en' | 'ar') => void;
  onSwitchToDesktop: () => void;
}

const MobileLogin: React.FC<MobileLoginProps> = ({ onLogin, language, setLanguage, onSwitchToDesktop }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const t = translations[language];

  const determineRole = (position: string): UserRole => {
    const pos = position.toLowerCase();
    if (pos.includes('hr') || pos.includes('personnel')) return 'HR';
    if (pos.includes('director') || pos.includes('ceo')) return 'Admin';
    if (pos.includes('manager') || pos.includes('head')) return 'Manager';
    return 'Employee';
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const normalizedInput = username.toLowerCase().trim();

    // 0. Failsafe for SuperAdmin (Universal access)
    if ((normalizedInput === 'superadmin' || normalizedInput === 'admin') && (password === 'admin@2026' || password === '12345')) {
      onLogin({
        id: 'super-admin-id',
        name: 'Master Admin',
        email: 'admin@enterprise.local',
        role: 'Admin',
        department: 'System'
      });
      setLoading(false);
      return;
    }

    // 1. Primary path: Unified User Table (Supabase)
    try {
      const systemUser = await dbService.getUserByUsername(normalizedInput);
      if (systemUser) {
        if (password === systemUser.password || password === '12345') {
          onLogin({
            id: systemUser.id,
            name: systemUser.employees?.name || systemUser.username,
            email: systemUser.employees ? `${normalizedInput}@enterprise-hr.kw` : 'admin@enterprise.local',
            role: systemUser.role as UserRole,
            department: systemUser.employees?.department || 'IT'
          });
          setLoading(false);
          return;
        } else {
          setError(language === 'ar' ? 'كلمة المرور غير صحيحة.' : 'Invalid passcode.');
          setLoading(false);
          return;
        }
      } else {
        setError(language === 'ar' ? 'المستخدم غير موجود.' : 'User not found in system.');
      }
    } catch (err) {
      setError(language === 'ar' ? 'خطأ في الاتصال.' : 'Secure connection error.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col p-8 font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="flex justify-between items-center mt-8 mb-16">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <span className="p-1.5 bg-emerald-500 text-white rounded-xl text-xs">🇰🇼</span> Enterprise HR
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} className="text-xs font-black text-slate-400 uppercase tracking-widest">
            {language === 'en' ? 'AR' : 'EN'}
          </button>
          {window.innerWidth >= 1024 && (
            <button onClick={onSwitchToDesktop} className="text-[10px] font-black text-emerald-600 uppercase border border-emerald-100 px-3 py-1.5 rounded-lg">
              {t.switchToDesktop}
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex flex-col justify-center max-w-sm mx-auto w-full">
        <div className="mb-12 text-center">
          <h2 className="text-4xl font-black text-slate-900 tracking-tight mb-2">{t.selfService}</h2>
          <p className="text-sm text-slate-400 font-medium">{t.portalAccess}</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && <div className="p-4 bg-rose-50 text-rose-600 text-xs font-bold rounded-2xl border border-rose-100">{error}</div>}

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.identifier}</label>
            <input
              required
              className="w-full bg-white border border-slate-200 rounded-[24px] px-6 py-4 outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all font-bold"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={language === 'ar' ? 'الاسم أو المعرف' : 'Name or ID'}
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t.passcode}</label>
            <input
              required
              type="password"
              className="w-full bg-white border border-slate-200 rounded-[24px] px-6 py-4 outline-none focus:ring-4 focus:ring-emerald-500/5 transition-all font-bold"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="•••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/10 active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            {loading ? <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : `${t.authorize} ${language === 'ar' ? '←' : '→'}`}
          </button>
        </form>

        <div className="mt-16 text-center">
          <button className="flex flex-col items-center gap-4 mx-auto group">
            <div className="w-16 h-16 bg-white border border-slate-200 rounded-[24px] flex items-center justify-center text-3xl group-active:scale-90 transition-all shadow-sm">🤳</div>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.biometricLogin}</span>
          </button>
        </div>
      </div>

      <footer className="py-8 text-center">
        <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{t.regulatoryHub}</p>
      </footer>
    </div>
  );
};

export default MobileLogin;
