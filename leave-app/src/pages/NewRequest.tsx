import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../App';
import { directory, submitRequest } from '../lib/api';
import type { LaUser, LeaveType } from '../lib/types';
import { countWorkingDays, LEAVE_TYPE_LABEL } from '../lib/format';

const LEAVE_TYPES: LeaveType[] = ['Annual', 'Sick', 'Emergency', 'ShortPermission'];

export function NewRequest() {
  const { user, navigate, bump, showToast } = useApp();
  const [directoryList, setDirectoryList] = useState<LaUser[]>([]);
  const [leaveType, setLeaveType] = useState<LeaveType>('Annual');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [reason, setReason] = useState('');
  const [contact, setContact] = useState('');
  const [deputyId, setDeputyId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    directory().then((d) => {
      setDirectoryList(d.filter((x) => x.id !== user?.id && x.email !== 'faisal@test.com' && x.role !== 'hr'));
    });
  }, [user]);

  const days = start && end ? countWorkingDays(start, end) : 0;
  const deputies = directoryList.filter((x) => x.id !== user?.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!deputyId) { setError('Please pick your replacement (deputy).'); return; }
    setBusy(true);
    try {
      const res = await submitRequest({
        leaveType, start, end, reason: reason.trim(), contact: contact.trim(), deputyId,
      });
      if (!res.success) throw new Error(res.message ?? 'Failed to submit.');
      showToast(res.message ?? 'Submitted.');
      bump();
      navigate('requests');
    } catch (err: any) {
      setError(err?.message ?? 'Failed to submit request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 style={{ margin: '4px 0 12px' }}>New leave request</h2>

      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>Leave type</label>
          <select className="select" value={leaveType} onChange={(e) => setLeaveType(e.target.value as LeaveType)}>
            {LEAVE_TYPES.map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABEL[t]}</option>)}
          </select>
        </div>

        <div className="row">
          <div className="field">
            <label>Start date</label>
            <input className="input" type="date" value={start} min={today()} onChange={(e) => setStart(e.target.value)} required />
          </div>
          <div className="field">
            <label>End date</label>
            <input className="input" type="date" value={end} min={start || today()} onChange={(e) => setEnd(e.target.value)} required />
          </div>
        </div>

        <div className="alert alert-info" style={{ marginTop: 0 }}>
          Working days (Fridays excluded): <b>{days}</b>
        </div>

        <div className="field">
          <label>Who will cover your duties? (replacement)</label>
          <select className="select" value={deputyId} onChange={(e) => setDeputyId(e.target.value)}>
            <option value="">— choose a colleague —</option>
            {deputies.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name} · {d.department ?? ''}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Contact during leave (optional)</label>
          <input className="input" type="text" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
        </div>

        <div className="field">
          <label>Reason (optional)</label>
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Where are you going / why?" />
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        <button className="btn btn-primary btn-block" disabled={busy || !start || !end || days === 0}>
          {busy ? 'Submitting…' : 'Submit request'}
        </button>
      </form>

      <div className="alert alert-info">
        Next steps: your replacement concurs → line manager → HR (balance check) → CEO final approval.
      </div>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);