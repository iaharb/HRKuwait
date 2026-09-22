import { useEffect, type ReactNode } from 'react';
import { useApp, type View } from '../App';
import { notifications } from '../lib/api';

const TABS: { key: View; label: string; icon: string }[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'new', label: 'New', icon: '＋' },
  { key: 'approvals', label: 'Approvals', icon: '✔' },
  { key: 'requests', label: 'My Leave', icon: '▤' },
  { key: 'notifications', label: 'Alerts', icon: '✦' },
];

const ROLE_SUB: Record<string, string> = {
  staff: 'Employee',
  manager: 'Line Manager',
  hr: 'HR',
  ceo: 'CEO',
};

export function Shell({ children }: { children: ReactNode }) {
  const { user, view, navigate, refreshTick, notificationCount, setNotificationCount, signOut } = useApp();

  const countNotifications = async () => {
    try {
      const n = await notifications();
      setNotificationCount(n.length > 0 ? n[0].unread : 0);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    countNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, view]);

  return (
    <div>
      <header className="header">
        <div>
          <span className="title">Leave App</span>
          <span className="sub">{user?.full_name} · {ROLE_SUB[user?.role ?? ''] ?? user?.role}</span>
        </div>
        <button className="icon-btn" onClick={signOut} title="Sign out">✕</button>
      </header>

      <main className="content pad">{children}</main>

      <nav className="nav">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={view === t.key ? 'active' : ''}
            onClick={() => navigate(t.key)}
          >
            <span className="ic">{t.icon}</span>
            {t.label}
            {t.key === 'notifications' && notificationCount > 0 && (
              <span className="badge-dot" style={{ right: 'calc(50% - 22px)' }}>{notificationCount}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}