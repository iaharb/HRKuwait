
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, User, Notification } from '../types/types.ts';
import IntelligentTicker from './IntelligentTicker.tsx';

interface MainHeaderProps {
    currentView: View;
    setView: (view: View) => void;
    user: User;
    language: 'en' | 'ar';
    theme: 'shadcn' | 'glass';
    toggleTheme: () => void;
    compactMode: boolean;
    setCompactMode: (mode: boolean) => void;
    presentationMode: boolean;
    setPresentationMode: (mode: boolean) => void;
    notifications: Notification[];
    showNotifications: boolean;
    setShowNotifications: (show: boolean) => void;
    onOpenScopeModal: () => void;
}

const MainHeader: React.FC<MainHeaderProps> = ({
    currentView,
    setView,
    user,
    language,
    theme,
    toggleTheme,
    compactMode,
    setCompactMode,
    presentationMode,
    setPresentationMode,
    notifications,
    showNotifications,
    setShowNotifications,
    onOpenScopeModal
}) => {
    const { t } = useTranslation();

    const getViewTitle = (view: View) => {
        switch (view) {
            case View.Dashboard: return t('dashboard');
            case View.Directory: return t('directory');
            case View.Insights: return t('insights');
            case View.Compliance: return t('compliance');
            case View.Profile: return t('profile');
            case View.Leaves: return t('leaves');
            case View.Payroll: return t('payroll');
            case View.Settlement: return t('settlement');
            case View.Attendance: return t('attendance');
            case View.AdminCenter: return t('adminCenter');
            case View.Whitepaper: return t('whitepaper');
            case View.Mandoob: return language === 'ar' ? 'أعمال المندوب' : 'Mandoob Dashboard';
            case View.Finance: return 'Finance Mapping';
            case View.Management: return t('strategy');
            case View.UserManagement: return 'Security & Roles';
            default: return '';
        }
    };

    return (
        <div className={`flex items-center justify-between ${compactMode ? 'mb-6' : 'mb-12'} no-print`}>
            <div className="space-y-1">
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-start">
                    <span className="hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => setView(View.Dashboard)}>{t('enterprise')}</span>
                    <span className="text-slate-300">/</span>
                    <span className="text-indigo-600">{getViewTitle(currentView)}</span>
                </div>
                <h1 className={`${compactMode ? 'text-xl' : 'text-2xl'} font-black text-slate-900 tracking-tight text-start`}>{getViewTitle(currentView)}</h1>
            </div>
            <div className="flex items-center gap-4">
                <button onClick={toggleTheme} className={`flex items-center justify-center p-2 rounded-xl transition-all ${theme === 'shadcn' ? 'bg-slate-900 text-white' : 'bg-white border text-slate-500 hover:bg-slate-50 shadow-sm'}`} title="Toggle UI Design Language">
                    {theme === 'shadcn' ? '🔳 Shadcn Base' : '🪩 Glassmorphism'}
                </button>
                <button onClick={() => setCompactMode(!compactMode)} className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${compactMode ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-slate-500 hover:bg-slate-50'}`}>
                    <span className="text-[10px] font-black uppercase tracking-wider">{compactMode ? '🗜️ Compact' : '📏 Normal'}</span>
                </button>
                <button onClick={() => setPresentationMode(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-white text-slate-500 hover:bg-slate-50">
                    <span className="text-[10px] font-black uppercase tracking-wider">📽️ Present</span>
                </button>
                <div className="relative">
                    <button onClick={() => setShowNotifications(!showNotifications)} className={`w-11 h-11 rounded-xl flex items-center justify-center border transition-all ${showNotifications ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400'}`}>
                        <span className="text-xl">🔔</span>
                        {notifications.filter(n => !n.isRead).length > 0 && <span className="absolute -top-1 right-0 w-4 h-4 bg-rose-500 text-white text-[8px] rounded-full flex items-center justify-center border-2 border-white">{notifications.filter(n => !n.isRead).length}</span>}
                    </button>
                </div>
                <button onClick={onOpenScopeModal} className="bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3 h-11 hover:bg-slate-50 transition-all">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        {user.role === 'Admin' ? 'Global Admin' : `${user.department} Scope`}
                    </span>
                </button>
            </div>
        </div>
    );
};

export default MainHeader;
