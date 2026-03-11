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
  compactMode: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ user, language, setLanguage, onLogout, onToggleMobile, onAddMember, compactMode }) => {
  const location = useLocation();
  const activePath = location.pathname.split('/')[1]?.toLowerCase() || 'dashboard';
  const { t } = useTranslation();
  const [dbStatus, setDbStatus] = useState<{ type: 'testing' | 'live' | 'mock', latency?: number }>({ type: 'testing' });
  const [isHovered, setIsHovered] = useState(false);

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

  const allRoles = ['Admin', 'Manager', 'Employee', 'HR', 'Mandoob', 'Executive', 'HR Officer', 'HR Manager', 'Payroll Officer', 'Payroll Manager'];

  const allItems = [
    // --- Employee Level (Base) ---
    { id: View.Profile, label: t('profile'), icon: 'user', roles: allRoles },
    { id: View.Attendance, label: t('attendance'), icon: 'map-pin', roles: allRoles },
    { id: View.Leaves, label: t('leaves'), icon: 'calendar', roles: allRoles },

    // --- Enterprise Dashboards ---
    { id: View.Dashboard, label: t('dashboard'), icon: 'layout-grid', roles: ['Admin', 'Manager', 'HR', 'Mandoob', 'Executive', 'HR Manager', 'HR Officer', 'Payroll Manager', 'Payroll Officer'] },

    // --- Management & Approvals ---
    { id: View.Approvals, label: t('approvals'), icon: 'check-circle', roles: ['Admin', 'Manager', 'HR', 'Executive', 'HR Manager', 'HR Officer', 'Payroll Manager'] },
    { id: View.Performance, label: language === 'ar' ? 'تقييم الأداء' : 'Performance', icon: 'star', roles: ['Admin', 'Manager', 'HR', 'Executive', 'HR Manager'] },

    // --- HR Ops & Mandoob ---
    { id: View.Directory, label: t('directory'), icon: 'users', roles: ['Admin', 'Manager', 'HR', 'HR Manager', 'HR Officer'] },
    { id: View.Mandoob, label: language === 'ar' ? 'أعمال المندوب' : 'Mandoob PRO', icon: 'passport', roles: ['Admin', 'HR', 'Mandoob', 'HR Manager', 'HR Officer'] },
    { id: View.AdminCenter, label: t('adminCenter'), icon: 'shield', roles: ['Admin', 'HR', 'HR Manager', 'HR Officer'] },
    { id: View.Compliance, label: t('compliance'), icon: 'scale', roles: ['Admin', 'HR', 'HR Manager', 'HR Officer', 'Executive'] },

    // --- Payroll & Finance ---
    { id: View.Payroll, label: t('payroll'), icon: 'banknote', roles: ['Admin', 'HR', 'HR Manager', 'Payroll Manager', 'Payroll Officer', 'Executive'] },
    { id: View.Settlement, label: t('settlement'), icon: 'file-text', roles: ['Admin', 'HR', 'HR Manager', 'Payroll Manager', 'Payroll Officer'] },
    { id: View.Finance, label: language === 'ar' ? 'المحاسبة' : 'Finance', icon: 'finance', roles: ['Admin', 'HR', 'HR Manager', 'Payroll Manager', 'Payroll Officer', 'Executive'] },
    { id: View.ProfitSharing, label: 'Profit Bonus', icon: 'trending-up', roles: ['Admin', 'HR', 'Executive', 'HR Manager', 'Payroll Manager'] },

    // --- Global Strategy & Support ---
    { id: View.Management, label: t('strategy'), icon: 'management', roles: ['Admin', 'Executive', 'Manager', 'HR', 'HR Manager', 'HR Officer', 'Payroll Manager'] },
    { id: View.Insights, label: t('insights'), icon: 'sparkles', roles: ['Admin', 'Manager', 'HR', 'Executive', 'HR Manager'] },
    { id: View.Whitepaper, label: t('whitepaper'), icon: 'book-open', roles: ['Admin', 'HR', 'Executive'] },
    { id: View.HelpCenter, label: language === 'ar' ? 'مركز المساعدة' : 'Help Center', icon: 'help-circle', roles: allRoles },
    { id: View.UserManagement, label: 'Security & Roles', icon: 'lock', roles: ['Admin', 'HR Manager'] },
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
      case 'finance': return '🏦';
      case 'management': return '📈';
      case 'sparkles': return '✨';
      case 'scale': return '⚖️';
      case 'book-open': return '📑';
      case 'lock': return '🔐';
      case 'star': return '⭐';
      case 'trending-up': return '💹';
      case 'help-circle': return '📖';
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

  const [expandedFolders, setExpandedFolders] = useState<string[]>(['core']);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev =>
      prev.includes(folderId) ? prev.filter(f => f !== folderId) : [...prev, folderId]
    );
  };

  const coreItems = filteredItems.filter(item =>
    [View.Dashboard, View.Profile, View.Attendance, View.Leaves, View.Approvals, View.Performance].includes(item.id)
  );

  const opsItems = filteredItems.filter(item =>
    [View.Directory, View.Mandoob, View.AdminCenter, View.Compliance, View.Payroll, View.Settlement, View.Finance, View.ProfitSharing].includes(item.id)
  );

  const strategyItems = filteredItems.filter(item =>
    [View.Management, View.Insights, View.Whitepaper, View.HelpCenter, View.UserManagement].includes(item.id)
  );

  const sidebarWidth = compactMode ? (isHovered ? 'w-64' : 'w-20') : 'w-64';

  const renderNavGroup = (title: string, items: any[], folderId: string) => {
    if (items.length === 0) return null;
    const isExpanded = expandedFolders.includes(folderId);
    const showHeader = !compactMode || isHovered;

    return (
      <div className="space-y-1 py-1">
        {showHeader && (
          <button
            onClick={() => toggleFolder(folderId)}
            className="w-full flex items-center justify-between px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            <span>{title}</span>
            <span className={`text-[8px] transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
          </button>
        )}

        {(!showHeader || isExpanded) && (
          <div className={`space-y-0.5 animate-in slide-in-from-top-2 duration-300 ${!isExpanded && showHeader ? 'hidden' : 'block'}`}>
            {items.map((item) => {
              const isActive = activePath === item.id.toLowerCase();
              return (
                <Link
                  key={item.id}
                  to={`/${item.id.toLowerCase()}`}
                  className={`w-full flex items-center ${compactMode && !isHovered ? 'justify-center h-10 w-10 mx-auto' : 'gap-3 px-4 py-2'} rounded-xl text-sm font-bold transition-all group relative overflow-hidden ${isActive
                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'}`}
                  title={item.label}
                >
                  {isActive && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-indigo-500 rounded-full my-2"></div>
                  )}
                  <span className={`text-lg transition-all duration-300 group-hover:scale-110 ${isActive ? '' : 'opacity-60'}`}>
                    {getIcon(item.icon)}
                  </span>
                  {(!compactMode || isHovered) && (
                    <span className={`tracking-tight text-start flex-1 text-[13px] whitespace-nowrap animate-in fade-in duration-300 ${isActive ? 'font-black' : 'font-medium'}`}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`${sidebarWidth} bg-white border-e border-slate-200/50 h-screen sticky top-0 flex flex-col z-[80] shadow-[1px_0_10px_0_rgba(0,0,0,0.01)] transition-all duration-300 ease-in-out no-print overflow-hidden`}
    >
      <div className={`${compactMode && !isHovered ? 'p-4' : 'p-6'} pb-2 text-start transition-all`}>
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-3 tracking-tighter">
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 text-xl relative group overflow-hidden shrink-0">
            <div className="absolute inset-0 bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            🇰🇼
          </div>
          {(!compactMode || isHovered) && (
            <div className="flex flex-col leading-none animate-in fade-in duration-300">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-0.5">Portal</span>
              <span className="text-lg">Enterprise<span className="text-indigo-600">HR</span></span>
            </div>
          )}
        </h1>

        {(!compactMode || isHovered) && (
          <div
            onClick={checkConnection}
            className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all active:scale-95 group animate-in fade-in duration-300"
          >
            <div className={`w-2 h-2 rounded-full ${dbStatus.type === 'testing' ? 'bg-slate-300 animate-pulse' :
              dbStatus.type === 'live' ? 'bg-indigo-500 shadow-[0_0_8px_rgba(79,70,229,0.5)]' : 'bg-rose-500'} group-hover:scale-110 transition-transform`}></div>
            <span className="text-[9px] text-slate-500 font-black uppercase tracking-widest whitespace-nowrap">
              {dbStatus.type === 'testing' ? t('syncing') :
                dbStatus.type === 'live' ? `${dbStatus.latency}ms` : 'Offline'}
            </span>
          </div>
        )}
      </div>

      <nav className={`flex-1 ${compactMode && !isHovered ? 'px-2' : 'px-3'} space-y-1 overflow-y-auto mt-4 custom-scrollbar`}>
        {(user.role.toLowerCase() === 'admin' || user.role.toLowerCase() === 'hr' || user.role.toLowerCase() === 'hr manager') && (
          <button
            onClick={onAddMember}
            className={`w-full flex items-center ${compactMode && !isHovered ? 'justify-center p-0 h-10 w-10 mx-auto mb-4' : 'gap-3 px-4 py-2.5 mb-6'} rounded-xl text-sm font-black transition-all bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 active:scale-95 group border border-indigo-500/50 overflow-hidden relative`}
            title={t('addMember')}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
            <span className="text-white font-black text-lg">+</span>
            {(!compactMode || isHovered) && <span className="tracking-tight uppercase text-[10px] font-black animate-in fade-in duration-300">{t('addMember')}</span>}
          </button>
        )}

        {renderNavGroup('Main Ops', coreItems, 'core')}
        {renderNavGroup('Resource Mgmt', opsItems, 'ops')}
        {renderNavGroup('Strategy & Intel', strategyItems, 'strategy')}
      </nav>

      <div className={`${compactMode && !isHovered ? 'p-3' : 'p-4'} space-y-3 mt-auto mb-4 border-t border-slate-50 pt-4`}>
        <div className="flex bg-slate-50 p-1 rounded-lg border border-slate-200/50 overflow-hidden">
          <button
            onClick={() => setLanguage('en')}
            className={`flex-1 py-1 text-[9px] font-black rounded-md transition-all ${language === 'en' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400'}`}
          >
            {compactMode && !isHovered ? 'EN' : 'ENG'}
          </button>
          <button
            onClick={() => setLanguage('ar')}
            className={`flex-1 py-1 text-[9px] font-black rounded-md transition-all ${language === 'ar' ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400'}`}
          >
            {compactMode && !isHovered ? 'AR' : 'ARA'}
          </button>
        </div>

        <div className="flex items-center gap-3 px-1 text-start overflow-hidden">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 flex items-center justify-center font-black text-xs shadow-inner shrink-0 cursor-pointer hover:bg-indigo-100 transition-colors">
            {user.name[0]}
          </div>
          {(!compactMode || isHovered) && (
            <div className="min-w-0 flex-1 animate-in slide-in-from-left-2 duration-300">
              <p className="text-[11px] font-black text-slate-900 truncate tracking-tight">{language === 'ar' ? (user as any).nameArabic || user.name : user.name}</p>
              <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{user.role}</p>
            </div>
          )}
        </div>

        {(!compactMode || isHovered) && (
          <button
            onClick={onLogout}
            className="w-full py-2.5 text-[9px] font-black text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all uppercase tracking-[0.1em] border border-transparent hover:border-rose-100 animate-in fade-in duration-300"
          >
            {t('terminateSession')}
          </button>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
