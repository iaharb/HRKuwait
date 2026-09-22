import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App';
import { requestDetail, cancelRequest } from '../lib/api';
import type { RequestDetail as Detail } from '../lib/types';
import { fmtDate, fmtDays, fmtDateTime, STATUS_META, LEAVE_TYPE_LABEL } from '../lib/format';

export function RequestDetail({ requestId }: { requestId: string }) {
  const { user, navigate, bump, showToast } = useApp();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    requestDetail(requestId)
      .then(setDetail)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [requestId]);

  useEffect(load, [load]);

  if (loading) return <div className="loader">Loading…</div>;
  if (error || !detail) return <div className="alert alert-danger">{error ?? 'Not found.'}</div>;

  const req = detail.request;
  const status = STATUS_META[req.status];
  const isRequester = user?.id === detail.requester.id;
  const canCancel = isRequester && ['PENDING', 'DEPUTY_CONFIRMED', 'MANAGER_APPROVED', 'HR_APPROVED'].includes(req.status);
  const isRejected = req.status === 'REJECTED';
  const resubmittable = isRequester && isRejected;

  const doCancel = async () => {
    if (!window.confirm('Cancel this leave request?')) return;
    setBusy(true);
    try {
      const res = await cancelRequest(requestId);
      if (!res.success) throw new Error(res.message ?? 'Cancel failed');
      showToast('Request cancelled.');
      bump();
      load();
    } catch (e: any) {
      showToast(e.message ?? 'Cancel failed');
    } finally {
      setBusy(false);
    }
  }; // end doCancel

  return (
    <div>
      <div className="viewbar">
        <button className="back" onClick={() => navigate('requests')}>←</button>
        <span className="t">Request detail</span>
      </div>

      <div className="card">
        <h3 style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          {LEAVE_TYPE_LABEL[req.leave_type]}
          <span className={'chip ' + status.cls}>{status.label}</span>
        </h3>
        <div className="meta" style={{ color: 'var(--muted)', fontSize: 13 }}>
          <b>Requester:</b> {detail.requester.name} · {detail.requester.position ?? ''} · {detail.requester.department ?? ''}<br />
          <b>Dates:</b> {fmtDate(req.start_date)} → {fmtDate(req.end_date)} ({fmtDays(req.days)})<br />
          <b>Replacement:</b> {detail.deputy.name}
          {detail.manager && <><br /><b>Line manager:</b> {detail.manager.name}</>}
          {req.contact_during && <><br /><b>Contact:</b> {req.contact_during}</>}
          {req.reason && <><br /><b>Reason:</b> {req.reason}</>}
        </div>
      </div>

      {isRejected && (
        <div className="alert alert-danger">
          <b>Rejected{req.rejection_step ? ` by ${STEP_PERSON[req.rejection_step] ?? req.rejection_step}` : ''}.</b>{' '}
          {req.rejection_reason || 'No reason given.'}
        </div>
      )}

      {isRequester && (canCancel || resubmittable) && (
        <div className="detail-actions">
          {canCancel && (
            <button className="btn btn-danger btn-block" onClick={doCancel} disabled={busy}>
              Cancel this request
            </button>
          )}
          {resubmittable && (
            <button className="btn btn-primary btn-block" onClick={() => navigate('new')}>
              ＋ Submit a new application
            </button>
          )}
        </div>
      )}

      <div className="sec-title">Approval journey</div>
      <div className="card flow">
        {detail.approvals.length === 0 && <div className="meta" style={{ color: 'var(--muted)' }}>No activity yet.</div>}
        {detail.approvals.map((a, i) => (
          <ApprovalStep key={i} entry={a} index={i} last={i === detail.approvals.length - 1} />
        ))}
      </div>
    </div>
  );
}

const STEP_PERSON: Record<string, string> = {
  deputy: 'your replacement',
  manager: 'your line manager',
  hr: 'HR',
  ceo: 'the CEO',
};

function ApprovalStep({ entry, index, last }: { entry: { step: string; action: string; actor: string; note: string | null; at: string }; index: number; last: boolean }) {
  const isSubmit = entry.step === 'submit';
  const isCancel = entry.step === 'cancel';
  const isRejected = entry.action === 'Rejected';
  const dot = isSubmit ? 'done' : isCancel ? 'hold' : isRejected ? 'bad' : 'done';
  return (
    <div className={'flow-step ' + dot}>
      <div className="dot">{isSubmit ? '✓' : isCancel ? '✕' : isRejected ? '✕' : '✓'}</div>
      <div className="flow-txt">
        <div className="who">{entry.actor} — {StepLabel[entry.step] ?? entry.step}</div>
        <div className="when">{fmtDateTime(entry.at)}</div>
        {entry.note && <div className="note">“{entry.note}”</div>}
      </div>
    </div>
  );
}

const StepLabel: Record<string, string> = {
  submit: 'Submitted request',
  deputy: 'Replacement',
  manager: 'Line manager',
  hr: 'HR',
  ceo: 'CEO',
  cancel: 'Cancelled',
};