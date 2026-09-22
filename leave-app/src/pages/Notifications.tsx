import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { notifications, markNotificationRead, markAllNotificationsRead } from '../lib/api';
import type { Notification } from '../lib/types';
import { fmtDateTime } from '../lib/format';

export function Notifications() {
  const { refreshTick, bump, setNotificationCount, showToast } = useApp();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    notifications().then((n) => {
      setItems(n);
      setNotificationCount(n.length > 0 ? n[0].unread : 0);
    }).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [refreshTick]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  const open = async (n: Notification) => {
    if (n.is_read) return;
    await markNotificationRead(n.id);
    load();
  };

  const markAll = async () => {
    await markAllNotificationsRead();
    showToast('All notifications marked as read.');
    bump();
  };

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>Notifications</h2>

      {unreadCount > 0 && (
        <button className="btn btn-ghost btn-sm btn-block" style={{ marginBottom: 12 }} onClick={markAll}>
          Mark all as read ({unreadCount})
        </button>
      )}

      {loading && <div className="loader">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="empty">
          <div className="big">✦</div>
          No notifications yet.
        </div>
      )}

      <div className="card list-flat">
        {items.map((n) => (
          <div
            key={n.id}
            className={'notif-row' + (n.is_read ? '' : ' unread')}
            onClick={() => open(n)}
          >
            {!n.is_read && <span className="unread-bullet" />}
            <div style={{ flex: 1 }}>
              <div className="n-title">{n.title}</div>
              {n.body && <div className="n-body">{n.body}</div>}
              <div className="n-when">{fmtDateTime(n.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}