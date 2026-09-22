import { useEffect, useState } from 'react';
import { useApp } from '../App';
import { actionQueue, deputyDecision, managerDecision, hrDecision, ceoDecision, stepDecision } from '../lib/api';
import type { QueueItem } from '../lib/types';
import { fmtDate, fmtDays, LEAVE_TYPE_LABEL } from '../lib/format';

const STEP_TITLE: Record<string, string> = {
  deputy: 'Replacement concurrence',
  manager: 'Line manager approval',
  hr: 'HR balance check',
  ceo: 'CEO final approval',
};

const stepTitle = (item: QueueItem) =>
  item.engine ? (item.step_name || item.step_code || 'Approval') : (STEP_TITLE[item.step] ?? item.step);
const needsDays = (item: QueueItem) => (item.engine ? !!item.is_final_step : item.step === 'hr');

export function Approvals() {
  const { user, refreshTick, bump, showToast } = useApp();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandId, setExpandId] = useState<string | null>(null);

  const load = () => {
    actionQueue().then(setItems).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(load, [refreshTick]);

  const decide = async (item: QueueItem, approve: boolean, note?: string, finalDays?: number) => {
    try {
      let res;
      if (item.engine) res = await stepDecision(item.request_id, approve, note, finalDays ?? item.days);
      else if (item.step === 'deputy') res = await deputyDecision(item.request_id, approve, note);
      else if (item.step === 'manager') res = await managerDecision(item.request_id, approve, note);
      else if (item.step === 'hr') res = await hrDecision(item.request_id, approve, finalDays ?? item.days, note);
      else res = await ceoDecision(item.request_id, approve, note);
      if (!res.success) throw new Error(res.message ?? 'Action failed.');
      showToast(res.message ?? 'Decision recorded.');
      bump();
      load();
      setExpandId(null);
    } catch (e: any) {
      showToast(e.message ?? 'Action failed.');
    }
  };

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>My approval queue</h2>
      <p className="sub" style={{ marginTop: 0, fontSize: 13 }}>{user?.full_name} · acting as {items[0]?.engine ? (items[0]?.step_name ?? user?.role) : (STEP_TITLE[items[0]?.step ?? '']?.split(' ')[0] ?? user?.role)}</p>

      {loading && <div className="loader">Loading…</div>}

      {!loading && items.length === 0 && (
        <div className="empty">
          <div className="big">✔</div>
          You're all caught up — nothing waiting on you.
        </div>
      )}

      {items.map((item) => (
        <ApprovalCard
          key={item.request_id}
          item={item}
          expanded={expandId === item.request_id}
          onToggle={() => setExpandId(expandId === item.request_id ? null : item.request_id)}
          onDecide={decide}
        />
      ))}
    </div>
  );
}

function ApprovalCard({
  item, expanded, onToggle, onDecide,
}: {
  item: QueueItem;
  expanded: boolean;
  onToggle: () => void;
  onDecide: (item: QueueItem, approve: boolean, note?: string, finalDays?: number) => void;
}) {
  const [note, setNote] = useState('');
  const [finalDays, setFinalDays] = useState<number>(item.days);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="req-row" style={{ cursor: 'default' }}>
        <div className="req-main">
          <div className="top">{item.requester_name}</div>
          <div className="meta">
            {item.requester_pos ?? ''} · {item.requester_dept ?? ''}<br />
            <b>{LEAVE_TYPE_LABEL[item.leave_type]}</b> · {fmtDate(item.start_date)} → {fmtDate(item.end_date)} ({fmtDays(item.days)})<br />
            {item.deputy_name && <>Replacement: {item.deputy_name}<br /></>}
            {item.requester_manager && <>Reports to: {item.requester_manager}<br /></>}
            {item.reason && <><br /><i>“{item.reason}”</i></>}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 4 }}>
        <span className="chip chip-warn">{stepTitle(item)}</span>
      </div>

      {expanded && (
        <div className="detail-actions">
          {needsDays(item) && (
            <div className="field">
              <label>Approved days (leave) to record</label>
              <input className="input" type="number" min={0} value={finalDays} onChange={(e) => setFinalDays(Number(e.target.value))} />
            </div>
          )}
          <div className="field">
            <label>Note (required when rejecting)</label>
            <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your comment…" />
          </div>
          <div className="grid-2">
            <button
              className="btn btn-success"
              disabled={!!busy || (needsDays(item) && finalDays < 0)}
              onClick={() => { setBusy('approve'); onDecide(item, true, note || undefined, finalDays); }}
            >
              {busy === 'approve' ? '…' : 'Approve'}
            </button>
            <button
              className="btn btn-danger"
              disabled={!!busy || !note.trim()}
              onClick={() => { setBusy('reject'); onDecide(item, false, note || undefined); }}
              title={note.trim() ? '' : 'A note is required to reject'}
            >
              {busy === 'reject' ? '…' : 'Reject'}
            </button>
          </div>
        </div>
      )}

      {!expanded && (
        <button className="btn btn-ghost btn-sm btn-block" style={{ marginTop: 10 }} onClick={onToggle}>
          Review · Approve / Reject
        </button>
      )}
    </div>
  );
}