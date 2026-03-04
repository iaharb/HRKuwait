
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, Link } from 'react-router-dom';
import { View, User, Notification } from '../types/types.ts';

interface MainHeaderProps {
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
    const location = useLocation();
    const [showDisplaySettings, setShowDisplaySettings] = useState(false);
    const settingsRef = useRef<HTMLDivElement>(null);

    const currentPath = location.pathname.split('/')[1]?.toLowerCase() || 'dashboard';

    const viewTitle = useMemo(() => {
        const matchedView = Object.values(View).find(v => v.toLowerCase() === currentPath);
        if (!matchedView) return t('dashboard');

        switch (matchedView) {
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
            default: return t('dashboard');
        }
    }, [currentPath, t, language]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setShowDisplaySettings(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`flex items-center justify-between ${compactMode ? 'py-2 mb-4' : 'py-4 mb-8'} px-0 transition-all no-print`}>
            <div className="space-y-0.5">
                <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-start">
                    <Link to="/dashboard" className="hover:text-indigo-600 transition-colors cursor-pointer">{t('enterprise')}</Link>
                    <span className="text-slate-300">/</span>
                    <span className="text-indigo-600">{viewTitle}</span>
                </div>
                <h1 className={`${compactMode ? 'text-lg' : 'text-xl'} font-black text-slate-900 tracking-tight text-start`}>{viewTitle}</h1>
            </div>

            <div className="flex items-center gap-3">
                {/* Display Settings Dropdown */}
                <div className="relative" ref={settingsRef}>
                    <button
                        onClick={() => setShowDisplaySettings(!showDisplaySettings)}
                        className={`flex items-center gap-2 h-9 px-4 rounded-xl border transition-all ${showDisplaySettings ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
                    >
                        <span className="text-sm">⚙️</span>
                        <span className="text-[10px] font-black uppercase tracking-wider">Display Settings</span>
                    </button>

                    {showDisplaySettings && (
                        <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-2xl p-2 z-[100] animate-in fade-in zoom-in-95 duration-200">
                            <div className="p-3 border-b border-slate-50 mb-1">
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Interface Options</p>
                            </div>

                            <button
                                onClick={() => { toggleTheme(); setShowDisplaySettings(false); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm">🪩</span>
                                    <span className="text-xs font-bold text-slate-700">{theme === 'shadcn' ? 'Glassmorphism' : 'Shadcn Base'}</span>
                                </div>
                                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 group-hover:bg-indigo-500 transition-colors"></div>
                            </button>

                            <button
                                onClick={() => { setCompactMode(!compactMode); setShowDisplaySettings(false); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm">🗜️</span>
                                    <span className="text-xs font-bold text-slate-700">{compactMode ? 'Normal Spacing' : 'Compact UI'}</span>
                                </div>
                                {compactMode && <div className="w-2 h-2 rounded-full bg-indigo-500"></div>}
                            </button>

                            <button
                                onClick={() => { setPresentationMode(true); setShowDisplaySettings(false); }}
                                className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-slate-50 rounded-xl transition-colors group"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-sm">📽️</span>
                                    <span className="text-xs font-bold text-slate-700">Presentation Mode</span>
                                </div>
                            </button>
                        </div>
                    )}
                </div>

                {/* Notifications */}
                <div className="relative">
                    <button
                        onClick={() => setShowNotifications(!showNotifications)}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all ${showNotifications ? 'bg-indigo-600 text-white' : 'bg-white text-slate-400 hover:bg-slate-50'}`}
                    >
                        <span className="text-lg">🔔</span>
                        {notifications.filter(n => !n.isRead).length > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white text-[8px] rounded-full flex items-center justify-center border-2 border-white font-black">
                                {notifications.filter(n => !n.isRead).length}
                            </span>
                        )}
                    </button>
                </div>

                {/* Scope Selection */}
                <button
                    onClick={onOpenScopeModal}
                    className="bg-white px-4 h-9 rounded-xl border border-slate-200 shadow-sm flex items-center gap-2.5 hover:bg-slate-50 transition-all"
                >
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                        {user.role === 'Admin' ? 'Global Admin' : `${user.department} Scope`}
                    </span>
                    <span className="text-[8px] opacity-40">▼</span>
                </button>
            </div>
        </div>
    );
};

export default MainHeader;
