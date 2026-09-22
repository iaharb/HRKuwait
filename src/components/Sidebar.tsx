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
    { id: View.GenericRequests, label: language === 'ar' ? 'الطلبات' : 'Requests', icon: 'inbox', roles: allRoles },

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
    { id: View.WorkflowConfig, label: language === 'ar' ? 'تهيئة سير العمل' : 'Workflow Config', icon: 'git-branch', roles: ['Admin', 'HR Manager'] },
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
      case 'git-branch': return '🧩';
      case 'inbox': return '📥';
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
    [View.Dashboard, View.Profile, View.Attendance, View.Leaves, View.GenericRequests, View.Approvals, View.Performance].includes(item.id)
  );

  const opsItems = filteredItems.filter(item =>
    [View.Directory, View.Mandoob, View.AdminCenter, View.Compliance, View.Payroll, View.Settlement, View.Finance, View.ProfitSharing].includes(item.id)
  );

  const strategyItems = filteredItems.filter(item =>
      [View.Management, View.Insights, View.Whitepaper, View.HelpCenter, View.UserManagement, View.WorkflowConfig].includes(item.id)
  );

  const sidebarWidth = compactMode ? (isHovered ? 'w-64' : 'w-20') : 'w-64';

  const [searchTerm, setSearchTerm] = useState('');

  const filteredNavItems = filteredItems.filter(item =>
    item.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const coreItemsFiltered = coreItems.filter(item => filteredNavItems.includes(item));
  const opsItemsFiltered = opsItems.filter(item => filteredNavItems.includes(item));
  const strategyItemsFiltered = strategyItems.filter(item => filteredNavItems.includes(item));

  const renderNavGroup = (title: string, items: any[], folderId: string) => {
    if (items.length === 0) return null;
    const isExpanded = expandedFolders.includes(folderId);
    const showHeader = !compactMode || isHovered;

    return (
      <div style={{ marginBottom: 'var(--cds-spacing-03)' }}>
        {showHeader && (
          <button
            onClick={() => toggleFolder(folderId)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 'var(--cds-spacing-03) var(--cds-spacing-05)',
              background: 'none',
              border: 'none',
              fontSize: '0.625rem',
              fontWeight: 600,
              color: 'var(--cds-text-secondary)',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              textAlign: 'start'
            }}
          >
            <span>{title}</span>
            <span style={{ fontSize: '0.5rem', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
          </button>
        )}

        {(!showHeader || isExpanded) && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((item) => {
              const isActive = activePath === item.id.toLowerCase();
              return (
                <Link
                  key={item.id}
                  to={`/${item.id.toLowerCase()}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: compactMode && !isHovered ? 'center' : 'flex-start',
                    gap: compactMode && !isHovered ? '0' : 'var(--cds-spacing-04)',
                    padding: compactMode && !isHovered ? 'var(--cds-spacing-05) 0' : 'var(--cds-spacing-04) var(--cds-spacing-05)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    color: isActive ? 'var(--cds-interactive-01)' : 'var(--cds-text-secondary)',
                    background: isActive ? 'var(--cds-layer-02)' : 'transparent',
                    borderLeft: isActive ? '6px solid var(--cds-interactive-01)' : '6px solid transparent',
                    fontWeight: isActive ? 600 : 400,
                    minHeight: '48px',
                    transition: 'all 0.2s cubic-bezier(0.2, 0, 0.38, 0.9)'
                  }}
                  title={item.label}
                >
                  <span style={{ fontSize: compactMode && !isHovered ? '1.5rem' : '1.1rem', transition: 'font-size 0.2s' }}>{getIcon(item.icon)}</span>
                  {(!compactMode || isHovered) && (
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
    <aside
      className="cds--side-nav"
      style={{ 
        width: compactMode && !isHovered ? 'var(--cds-sidebar-width-collapsed)' : 'var(--cds-sidebar-width-expanded)',
        background: 'var(--cds-layer-01)',
        borderRight: '1px solid var(--cds-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        height: 'calc(100vh - 48px)',
        transition: 'width 0.2s cubic-bezier(0.2, 0, 0.38, 0.9)',
        zIndex: 1000,
        position: 'fixed',
        top: '48px',
        left: 0
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header / Logo Section */}
      <div style={{ 
        padding: compactMode && !isHovered ? 'var(--cds-spacing-05) 0' : 'var(--cds-spacing-05)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: compactMode && !isHovered ? 'center' : 'flex-start',
        gap: compactMode && !isHovered ? '0' : 'var(--cds-spacing-04)', 
        borderBottom: '1px solid var(--cds-border-subtle)', 
        minHeight: '64px' 
      }}>
        <div style={{ width: '32px', height: '32px', background: 'var(--cds-interactive-01)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '1.25rem', flexShrink: 0, borderRadius: '4px' }}>
          H
        </div>
        {(!compactMode || isHovered) && (
          <div style={{ display: 'flex', flexDirection: 'column', animation: 'fade-in 0.3s ease' }}>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)', lineHeight: 1 }}>{t('systemTitle')}</span>
            <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Enterprise v11</span>
          </div>
        )}
      </div>

      {/* Search Section */}
      {(!compactMode || isHovered) && (
        <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                background: 'var(--cds-field-01)',
                border: 'none',
                borderBottom: '1px solid var(--cds-border-strong)',
                padding: 'var(--cds-spacing-03) var(--cds-spacing-05) var(--cds-spacing-03) var(--cds-spacing-07)',
                fontSize: '0.875rem',
                color: 'var(--cds-text-primary)'
              }}
            />
            <span style={{ position: 'absolute', left: 'var(--cds-spacing-03)', fontSize: '0.875rem', opacity: 0.5 }}>🔍</span>
          </div>
        </div>
      )}

      {/* Scrollable Navigation Area */}
      <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 'var(--cds-spacing-03) 0', display: 'flex', flexDirection: 'column' }} className="cds--side-nav__items">
        {searchTerm ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
             {filteredNavItems.map(item => (
                <Link
                  key={item.id}
                  to={`/${item.id.toLowerCase()}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: compactMode && !isHovered ? 'center' : 'flex-start',
                    gap: compactMode && !isHovered ? '0' : 'var(--cds-spacing-04)',
                    padding: compactMode && !isHovered ? 'var(--cds-spacing-05) 0' : 'var(--cds-spacing-04) var(--cds-spacing-05)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    color: activePath === item.id.toLowerCase() ? 'var(--cds-interactive-01)' : 'var(--cds-text-secondary)',
                    background: activePath === item.id.toLowerCase() ? 'var(--cds-layer-02)' : 'transparent',
                    borderLeft: activePath === item.id.toLowerCase() ? '6px solid var(--cds-interactive-01)' : '6px solid transparent',
                    fontWeight: activePath === item.id.toLowerCase() ? 600 : 400,
                    minHeight: '48px'
                  }}
                >
                  <span style={{ fontSize: compactMode && !isHovered ? '1.5rem' : '1.1rem' }}>{getIcon(item.icon)}</span>
                  <span>{item.label}</span>
                </Link>
             ))}
          </div>
        ) : (
          <>
            {renderNavGroup(t('core'), coreItemsFiltered, 'core')}
            {renderNavGroup(t('operations'), opsItemsFiltered, 'ops')}
            {renderNavGroup(t('strategy'), strategyItemsFiltered, 'strategy')}
          </>
        )}
      </nav>

      {/* Footer / User Profile */}
      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-02)' }}>
        <div style={{ 
          padding: compactMode && !isHovered ? 'var(--cds-spacing-05) 0' : 'var(--cds-spacing-05)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: compactMode && !isHovered ? 'center' : 'flex-start',
          gap: compactMode && !isHovered ? '0' : 'var(--cds-spacing-04)' 
        }}>
           <div style={{ width: '32px', height: '32px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              👤
           </div>
           {(!compactMode || isHovered) && (
              <div style={{ flex: 1, overflow: 'hidden', animation: 'fade-in 0.3s ease' }}>
                 <p style={{ fontSize: '0.75rem', fontWeight: 600, margin: 0, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{user.name}</p>
                 <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', margin: 0 }}>{user.role}</p>
              </div>
           )}
        </div>
        
        {(!compactMode || isHovered) && (
           <div style={{ padding: '0 var(--cds-spacing-05) var(--cds-spacing-05) var(--cds-spacing-05)', display: 'flex', gap: 'var(--cds-spacing-03)' }}>
              <button 
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')} 
                className="cds--btn cds--btn--ghost cds--btn--sm" 
                style={{ flex: 1, border: '1px solid var(--cds-border-subtle)', padding: '0 var(--cds-spacing-03)', minHeight: '32px' }}
              >
                {language === 'en' ? 'Arabic' : 'English'}
              </button>
              <button 
                onClick={onLogout} 
                className="cds--btn cds--btn--ghost cds--btn--sm" 
                style={{ flex: 1, color: 'var(--cds-support-error)', border: '1px solid var(--cds-border-subtle)', padding: '0 var(--cds-spacing-03)', minHeight: '32px' }}
              >
                Logout
              </button>
           </div>
        )}
      </div>

      <style>{`
        .cds--side-nav__items::-webkit-scrollbar {
          width: 4px;
        }
        .cds--side-nav__items::-webkit-scrollbar-thumb {
          background: var(--cds-border-subtle);
        }
        .cds--side-nav__items::-webkit-scrollbar-track {
          background: transparent;
        }
      `}</style>
    </aside>
  );
};

export default Sidebar;
