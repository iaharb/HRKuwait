import React, { useState, useEffect } from 'react';
import { View, User } from '../types/types';
import { dbService } from '../services/dbService.ts';
import { useTranslation } from 'react-i18next';
import { useLocation, Link } from 'react-router-dom';

interface SidebarProps {
  user: User;
  language: 'en' | 'ar';
  setLanguage: (lang: 'en' | 'ar') => void;
  onLogout: () => void;
  onToggleMobile?: () => void;
  onAddMember: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ user, language, setLanguage, onLogout, onToggleMobile, onAddMember }) => {
  const location = useLocation();
  const activePath = location.pathname.split('/')[1]?.toLowerCase() || 'dashboard';
  const { t } = useTranslation();
  const [dbStatus, setDbStatus] = useState<{ type: 'testing' | 'live' | 'mock', latency?: number }>({ type: 'testing' });
  const [isPending, startTransition] = React.useTransition();

  const [rolePermissions, setRolePermissions] = useState<any[]>([]);

  const checkConnection = async () => {
    setDbStatus({ type: 'testing' });
    const test = await dbService.testConnection();
    setDbStatus({
      type: test.success ? 'live' : 'mock',
      latency: test.latency
    });
  };

  const loadPermissions = async () => {
    try {
      const perms = await dbService.getRolePermissions();
      setRolePermissions(perms);
    } catch (e) {
      console.warn("Failed to load role permissions:", e);
    }
  };

  useEffect(() => {
    checkConnection();
    loadPermissions();
    const interval = setInterval(checkConnection, 120000);
    return () => clearInterval(interval);
  }, []);

  const allItems = [
    { id: View.Dashboard, label: t('dashboard'), icon: 'layout-grid', roles: ['Admin', 'Manager', 'HR', 'Mandoob'] },
    { id: View.AdminCenter, label: t('adminCenter'), icon: 'shield', roles: ['Admin', 'HR'] },
    { id: View.Mandoob, label: language === 'ar' ? 'أعمال المندوب' : 'Mandoob PRO', icon: 'passport', roles: ['Admin', 'HR', 'Mandoob'] },
    { id: View.Profile, label: t('profile'), icon: 'user', roles: ['Employee', 'Manager', 'Admin', 'HR'] },
    { id: View.Attendance, label: t('attendance'), icon: 'map-pin', roles: ['Employee', 'Manager', 'Admin', 'HR'] },
    { id: View.Leaves, label: t('leaves'), icon: 'calendar', roles: ['Admin', 'Manager', 'Employee', 'HR'] },
    { id: View.Directory, label: t('directory'), icon: 'users', roles: ['Admin', 'Manager', 'HR'] },
    { id: View.Payroll, label: t('payroll'), icon: 'banknote', roles: ['Admin', 'HR'] },
    { id: View.Settlement, label: t('settlement'), icon: 'file-text', roles: ['Admin', 'HR'] },
    { id: View.Finance, label: language === 'ar' ? 'المحاسبة' : 'Finance', icon: 'finance', roles: ['Admin', 'HR'] },
    { id: View.Management, label: t('strategy'), icon: 'management', roles: ['Admin', 'Executive', 'Manager', 'HR', 'HR Manager', 'HR Officer', 'Payroll Manager'] },
    { id: View.Insights, label: t('insights'), icon: 'sparkles', roles: ['Admin', 'Manager', 'HR'] },
    { id: View.Compliance, label: t('compliance'), icon: 'scale', roles: ['Admin', 'HR'] },
    { id: View.Whitepaper, label: t('whitepaper'), icon: 'book-open', roles: ['Admin', 'HR'] },
    { id: View.UserManagement, label: 'Security & Roles', icon: 'lock', roles: ['Admin'] },
  ];

  const getIcon = (iconName: string) => {
    switch (iconName) {
      case 'layout-grid': return '📊';
      case 'shield': return '🛡️';
      case 'passport': return '🛂';
      case 'user': return '👤';
      case 'map-pin': return '📍';
      case 'calendar': return '📅';
      case 'users': return '👥';
      case 'banknote': return '💰';
      case 'file-text': return '📜';
      case 'finance': return '🏦'; // Added Icon for Finance
      case 'management': return '📈';
      case 'sparkles': return '✨';
      case 'scale': return '⚖️';
      case 'book-open': return '📑';
      case 'lock': return '🔐';
      default: return '•';
    }
  };

  const filteredItems = allItems.filter(item => {
    const dbEntry = rolePermissions.find(p =>
      p.role.toLowerCase() === user.role.toLowerCase() &&
      p.view_id === item.id
    );

    if (dbEntry) {
      return dbEntry.is_active;
    }

    return item.roles.map(r => r.toLowerCase()).includes(user.role.toLowerCase());
  });

  return (
    <><div className="w-80 bg-white border-e border-slate-200/50 h-screen sticky top-0 flex flex-col z-[80] shadow-[1px_0_10px_0_rgba(0,0,0,0.01)] no-print">
      <div className="p-10 pb-6 text-start">
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-4 tracking-tighter">
          <div className="w-12 h-12 bg-indigo-600 text-white rounded-[18px] flex items-center justify-center shadow-xl shadow-indigo-600/20 text-2xl relative group overflow-hidden">
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            🇰🇼
          </div>
          <div className="flex flex-col leading-none">
            <span className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mb-1">Portal</span>
            <span>Enterprise<span className="text-indigo-600">HR</span></span>
          </div>
        </h1>

        <div
          onClick={checkConnection}
          className="inline-flex items-center gap-2.5 mt-8 px-4 py-2 bg-slate-50/50 rounded-2xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all active:scale-95 group"
        >
          <div className={`w-2.5 h-2.5 rounded-full ${dbStatus.type === 'testing' ? 'bg-slate-300 animate-pulse' :
            dbStatus.type === 'live' ? 'bg-indigo-500 shadow-[0_0_12px_rgba(79,70,229,0.5)]' : 'bg-rose-500'} group-hover:scale-110 transition-transform`}></div>
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">
            {dbStatus.type === 'testing' ? t('syncing') :
              dbStatus.type === 'live' ? `${dbStatus.latency}ms Latency` : 'Cloud Offline'}
          </span>
        </div>
      </div>

      <nav className="flex-1 px-6 space-y-1.5 overflow-y-auto mt-8 custom-scrollbar">
        {(user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'hr' || user.role.toLowerCase() === 'hr manager') && (
          <button
            onClick={onAddMember}
            className="w-full flex items-center gap-4 px-5 py-5 rounded-[24px] text-sm font-black transition-all bg-indigo-600 text-white shadow-xl shadow-indigo-600/30 mb-8 hover:bg-indigo-700 active:scale-95 group border border-indigo-500/50 overflow-hidden relative"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            <div className="w-8 h-8 bg-white/10 rounded-xl flex items-center justify-center transition-all group-hover:rotate-12 group-hover:scale-110">
              <span className="text-white font-black text-xl">+</span>
            </div>
            <span className="tracking-tight uppercase text-[11px] font-black">{t('addMember')}</span>
          </button>
        )}
        {filteredItems.map((item) => {
          const isActive = activePath === item.id.toLowerCase();
          return (
            <Link
              key={item.id}
              to={`/${item.id.toLowerCase()}`}
              className={`w-full flex items-center gap-4 px-5 py-4 rounded-[20px] text-sm font-bold transition-all group relative overflow-hidden ${isActive
                ? 'bg-slate-900 text-white shadow-2xl shadow-slate-900/10'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
            >
              {isActive && (
                <div className="absolute inset-y-0 left-0 w-1 bg-indigo-500 rounded-full my-3"></div>
              )}
              <span className={`text-xl transition-all duration-500 group-hover:scale-125 group-hover:rotate-3 ${isActive ? '' : 'opacity-60'}`}>
                {getIcon(item.icon)}
              </span>
              <span className={`tracking-tight text-start flex-1 text-[13px] ${isActive ? 'font-black' : 'font-bold'}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
      <div className="p-6 space-y-4 mt-auto mb-6">
        {onToggleMobile && (
          <button
            onClick={onToggleMobile}
            className="w-full py-4 bg-indigo-50/50 text-indigo-700 rounded-2xl text-[10px] font-black hover:bg-indigo-50 transition-all uppercase tracking-[0.2em] flex items-center justify-center gap-3 border border-indigo-100/50"
          >
            <span className="text-base">📱</span> {t('switchToMobile')}
          </button>
        )}
        <div className="flex bg-slate-50 p-1.5 rounded-2xl border border-slate-200/50">
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 py-2 text-[10px] font-extrabold rounded-xl transition-all ${language === 'en' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400'}`}
          >
            ENG
          </button>
          <button
            onClick={() => setLanguage('ar')}
            className={`flex-1 py-2 text-[10px] font-extrabold rounded-xl transition-all ${language === 'ar' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400'}`}
          >
            ARA
          </button>
        </div>

        <div className="pt-6 border-t border-slate-100">
          <div className="flex items-center gap-4 mb-6 px-1 text-start">
            <div className="w-11 h-11 rounded-2xl bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-black text-sm shadow-inner shrink-0">
              {user.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black text-slate-900 truncate tracking-tight">{language === 'ar' ? (user as any).nameArabic || user.name : user.name}</p>
              <p className="text-[9px] text-slate-400 font-black uppercase tracking-[0.15em] mt-1.5">{user.role}</p>
            </div>
          </div>
          <button
            onClick={onLogout}
            className="w-full py-3.5 text-[10px] font-black text-slate-400 hover:text-rose-600 hover:bg-rose-50/50 rounded-2xl transition-all uppercase tracking-[0.2em] border border-transparent hover:border-rose-100"
          >
            {t('terminateSession')}
          </button>
        </div>
      </div>
    </div></>
  );
};

export default Sidebar;
