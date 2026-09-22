
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, Link } from 'react-router-dom';
import { View, User, Notification } from '../types/types.ts';

interface MainHeaderProps {
    user: User;
    language: 'en' | 'ar';
    theme: 'shadcn' | 'glass' | 'dark';
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
    <header className="cds--header" style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '48px', backgroundColor: 'var(--cds-text-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', zIndex: 1000, padding: '0 var(--cds-spacing-05)' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
            <Link to="/dashboard" style={{ textDecoration: 'none', color: '#fff', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                <span style={{ color: 'var(--cds-interactive-01)' }}>IBM</span>
                <span>HR Kuwait</span>
            </Link>
            <div style={{ marginLeft: 'var(--cds-spacing-07)', height: '24px', width: '1px', backgroundColor: 'var(--cds-border-strong)' }}></div>
            <span style={{ marginLeft: 'var(--cds-spacing-05)', fontSize: '0.875rem', opacity: 0.8 }}>{viewTitle}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
            {/* Display Settings */}
            <div style={{ position: 'relative', height: '100%' }} ref={settingsRef}>
                <button
                    onClick={() => setShowDisplaySettings(!showDisplaySettings)}
                    style={{ height: '48px', padding: '0 var(--cds-spacing-05)', background: showDisplaySettings ? 'var(--cds-layer-01)' : 'transparent', border: 'none', borderRight: '1px solid var(--cds-border-strong)', cursor: 'pointer', color: '#fff' }}
                    title="Display Settings"
                >
                    ⚙️
                </button>
                {showDisplaySettings && (
                    <div style={{ position: 'absolute', right: 0, top: '48px', width: '200px', backgroundColor: 'var(--cds-layer-02)', color: 'var(--cds-text-primary)', border: '1px solid var(--cds-border-subtle)', zIndex: 1100, boxShadow: '0 4px 8px rgba(0,0,0,0.1)' }}>
                        <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Interface</div>
                        <button onClick={() => { toggleTheme(); setShowDisplaySettings(false); }} style={{ width: '100%', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem', color: 'var(--cds-text-primary)' }}>
                            {theme === 'glass' ? '🌙 Switch to Dark Mode' : theme === 'dark' ? '🏢 Switch to Enterprise' : '🌊 Switch to Glass Mode'}
                        </button>
                        <button onClick={() => { setCompactMode(!compactMode); setShowDisplaySettings(false); }} style={{ width: '100%', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '0.875rem' }}>{compactMode ? 'Default Spacing' : 'High Density'}</button>
                    </div>
                )}
            </div>

            {/* Notifications */}
            <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{ height: '48px', padding: '0 var(--cds-spacing-05)', background: 'transparent', border: 'none', borderRight: '1px solid var(--cds-border-strong)', cursor: 'pointer', color: '#fff', position: 'relative' }}
            >
                🔔
                {notifications.filter(n => !n.isRead).length > 0 && (
                    <span style={{ position: 'absolute', top: '10px', right: '10px', width: '8px', height: '8px', backgroundColor: 'var(--cds-text-error)', borderRadius: '50%' }}></span>
                )}
            </button>

            {/* User Profile / Scope */}
            <button
                onClick={onOpenScopeModal}
                style={{ height: '48px', padding: '0 var(--cds-spacing-05)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}
            >
                <div style={{ width: '24px', height: '24px', backgroundColor: 'var(--cds-interactive-01)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>{user.name[0]}</div>
                {!compactMode && <span>{user.role === 'Admin' ? 'Global Admin' : user.department}</span>}
            </button>
        </div>
    </header>
    );
};

export default MainHeader;
