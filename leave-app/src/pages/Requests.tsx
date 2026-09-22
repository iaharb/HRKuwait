import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { myRequests } from '../lib/api';
import type { LaLeaveRequest, RequestStatus } from '../lib/types';
import { fmtDate, fmtDays, STATUS_META, LEAVE_TYPE_LABEL } from '../lib/format';

export function Requests() {
  const { navigate, refreshTick, user } = useApp();
  const [requests, setRequests] = useState<LaLeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    myRequests().then(setRequests).catch(() => {}).finally(() => setLoading(false));
  }, [refreshTick]);

  const PENDING: RequestStatus[] = ['PENDING', 'DEPUTY_CONFIRMED', 'MANAGER_APPROVED', 'HR_APPROVED'];
  const active = requests.filter((r) => PENDING.includes(r.status));
  const closed = requests.filter((r) => !PENDING.includes(r.status));

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>My leave requests</h2>

      {loading && <div className="loader">Loading…</div>}

      <div className="sec-title">In progress</div>
      <div className="card">
        {active.length === 0 && !loading && <div className="empty" style={{ padding: '16px' }}>No requests in progress.</div>}
        {active.map((r) => (
          <div className="req-row" key={r.id} onClick={() => navigate('detail', { requestId: r.id })}>
            <div className="req-main">
              <div className="top">{LEAVE_TYPE_LABEL[r.leave_type]}</div>
              <div className="meta">{fmtDate(r.start_date)} → {fmtDate(r.end_date)} · {fmtDays(r.days)}</div>
            </div>
            <span className={'chip ' + STATUS_META[r.status].cls}>{STATUS_META[r.status].label}</span>
          </div>
        ))}
      </div>

      <div className="sec-title">Finished</div>
      <div className="card">
        {closed.length === 0 && !loading && <div className="empty" style={{ padding: '16px' }}>Nothing here yet.</div>}
        {closed.map((r) => (
          <div className="req-row" key={r.id} onClick={() => navigate('detail', { requestId: r.id })}>
            <div className="req-main">
              <div className="top">{LEAVE_TYPE_LABEL[r.leave_type]}</div>
              <div className="meta">{fmtDate(r.start_date)} → {fmtDate(r.end_date)} · {fmtDays(r.days)}</div>
            </div>
            <span className={'chip ' + STATUS_META[r.status].cls}>{STATUS_META[r.status].label}</span>
          </div>
        ))}
      </div>

      {requests.length === 0 && !loading && (
        <div className="empty">You haven't submitted any leave requests yet.</div>
      )}
    </div>
  );
}