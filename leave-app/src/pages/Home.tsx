import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { myBalances, actionQueue, myRequests, directory } from '../lib/api';
import type { LaBalance, QueueItem, LaLeaveRequest, LaUser } from '../lib/types';
import { fmtDate, fmtDays, STATUS_META, LEAVE_TYPE_LABEL, ROLE_LABEL } from '../lib/format';

export function Home() {
  const { user, navigate } = useApp();
  const [balances, setBalances] = useState<LaBalance[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [requests, setRequests] = useState<LaLeaveRequest[]>([]);
  const [deputy, setDeputy] = useState<LaUser[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.allSettled([myBalances(), actionQueue(), myRequests(), directory()])
      .then(([b, q, r, d]) => {
        if (b.status === 'fulfilled') setBalances(b.value);
        if (q.status === 'fulfilled') setQueue(q.value);
        if (r.status === 'fulfilled') setRequests(r.value);
        if (d.status === 'fulfilled') setDeputy(d.value);
      })
      .finally(() => setLoading(false));
  }, []);

  const title = 'Greetings, ' + (user?.full_name?.split(' ')[0] ?? 'there');
  const role = ROLE_LABEL[user?.role ?? ''];

  return (
    <div>
      <h2 style={{ margin: '4px 0 2px' }}>{title}</h2>
      <p className="sub" style={{ margin: '0 0 14px' }}>{role} · {user?.department ?? ''}</p>

      {loading && <div className="loader">Loading…</div>}

      {queue.length > 0 && (
        <>
          <div className="sec-title">Needs your decision</div>
          <div className="card">
            {queue.map((q) => (
              <div className="req-row" key={q.request_id} onClick={() => navigate('approvals')}>
                <div className="req-main">
                  <div className="top">{q.requester_name}</div>
                  <div className="meta">
                    {LEAVE_TYPE_LABEL[q.leave_type]} · {fmtDate(q.start_date)} → {fmtDate(q.end_date)} ({fmtDays(q.days)})
                  </div>
                </div>
                <span className={'chip ' + STATUS_META[q.status].cls}>{STATUS_META[q.status].label}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sec-title">My leave balances · {new Date().getFullYear()}</div>
      <div className="balance-grid">
        {balances.length === 0 && !loading && <div className="empty" style={{ gridColumn: '1 / -1', padding: '14px' }}>No balances yet.</div>}
        {balances.map((b) => {
          const pct = b.entitled_days > 0 ? Math.min(100, (b.used_days / b.entitled_days) * 100) : 0;
          return (
            <div className="balance" key={b.id}>
              <div className="t">{LEAVE_TYPE_LABEL[b.leave_type]}</div>
              <div className="n">
                {Number(b.used_days)} <small>/ {Number(b.entitled_days)}</small>
              </div>
              <div className="bar"><div style={{ width: pct + '%' }} /></div>
            </div>
          );
        })}
      </div>

      <button className="btn btn-primary btn-block" style={{ marginTop: 6 }} onClick={() => navigate('new')}>
        ＋ New leave request
      </button>

      <div className="sec-title">Recent requests</div>
      <div className="card">
        {requests.length === 0 && !loading && <div className="empty" style={{ padding: '16px' }}>No leave requests yet.</div>}
        {requests.slice(0, 5).map((r) => (
          <div className="req-row" key={r.id} onClick={() => navigate('detail', { requestId: r.id })}>
            <div className="req-main">
              <div className="top">{LEAVE_TYPE_LABEL[r.leave_type]}</div>
              <div className="meta">{fmtDate(r.start_date)} → {fmtDate(r.end_date)} · {fmtDays(r.days)}</div>
            </div>
            <span className={'chip ' + STATUS_META[r.status].cls}>{STATUS_META[r.status].label}</span>
          </div>
        ))}
      </div>

      {deputy.length > 0 && user?.role === 'staff' && (
        <div className="alert alert-info" style={{ marginTop: 16 }}>
          You have {requests.length} request(s) on file. Your replacement{' '}
          <b>{requests.length ? '' : 'will be chosen when you apply'}</b>.
        </div>
      )}
    </div>
  );
}