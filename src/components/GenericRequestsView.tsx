import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types/types';
import { WfRequestType } from '../services/workflowConfigService.ts';
import { genericRequestService, WfRequestRow, WfQueueRow, WfFlowRow, WfLoanRow, EligibilityResult } from '../services/genericRequestService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

interface GenericRequestsViewProps {
  user: User;
}

type TabId = 'catalog' | 'mine' | 'queue';

interface SchemaAttribute {
  key: string;
  label?: string;
  type: 'number' | 'date' | 'text' | 'boolean' | 'enum';
  required?: boolean;
  min?: number;
  max?: number;
  values?: string[];
  placeholder?: string;
}

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  PENDING:  { color: '#0f62fe', bg: '#edf5ff' },
  RETURNED: { color: '#7f6000', bg: '#fff8e1' },
  APPROVED: { color: '#198038', bg: '#defbe6' },
  REJECTED: { color: '#da1e28', bg: '#fff1f1' },
  CANCELLED: { color: '#6f6f6f', bg: '#f4f4f4' },
  DRAFT:    { color: '#6f6f6f', bg: '#f4f4f4' },
};

function attributesOf(rt: WfRequestType): SchemaAttribute[] {
  return Array.isArray(rt.payload_schema?.attributes) ? rt.payload_schema.attributes : [];
}

function attrLabel(a: SchemaAttribute): string {
  return a.label || a.key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function summarizePayload(payload: Record<string, any>): string {
  if (!payload || Object.keys(payload).length === 0) return '—';
  const entries = Object.entries(payload)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`);
  return entries.join(' · ') || '—';
}

export const GenericRequestsView: React.FC<GenericRequestsViewProps> = ({ user }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { notify, confirm } = useNotifications();

  const [activeTab, setActiveTab] = useState<TabId>('catalog');
  const [catalog, setCatalog] = useState<WfRequestType[]>([]);
  const [myRequests, setMyRequests] = useState<WfRequestRow[]>([]);
  const [queue, setQueue] = useState<WfQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // New-request form
  const [selectedType, setSelectedType] = useState<WfRequestType | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});

  // Live eligibility preview (debounced) for the open form
  const [eligChecking, setEligChecking] = useState(false);
  const [eligResult, setEligResult] = useState<EligibilityResult | null>(null);

  // Detail drawer
  const [detailRequest, setDetailRequest] = useState<WfRequestRow | null>(null);
  const [detailFlow, setDetailFlow] = useState<WfFlowRow[]>([]);
  const [detailLoan, setDetailLoan] = useState<WfLoanRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Queue action notes
  const [queueNotes, setQueueNotes] = useState<Record<string, string>>({});

  const fetchQueue = async () => {
    try {
      const rows = await genericRequestService.getActionQueue();
      setQueue(rows);
    } catch (e) {
      console.error('[GenericRequests] queue fetch failed:', e);
    }
  };

  const fetchMine = async () => {
    try {
      setMyRequests(await genericRequestService.getMyRequests(user));
    } catch (e) {
      console.error('[GenericRequests] my-requests fetch failed:', e);
    }
  };

  const fetchAll = async () => {
    setLoading(true);
    try {
      const cat = await genericRequestService.getCatalog();
      setCatalog(cat.filter(rt => rt.active));
    } catch (e) {
      console.error('[GenericRequests] catalog fetch failed:', e);
      notify(t('error'), String((e as Error).message), 'error');
    }
    await Promise.all([fetchMine(), fetchQueue()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [user]);

  const openForm = (rt: WfRequestType) => {
    setSelectedType(rt);
    const init: Record<string, any> = {};
    attributesOf(rt).forEach(a => {
      if (a.type === 'boolean') init[a.key] = false;
      else if (a.type === 'number') init[a.key] = undefined;
      else init[a.key] = '';
    });
    setFormValues(init);
  };

  const closeForm = () => {
    setSelectedType(null);
    setFormValues({});
    setEligChecking(false);
    setEligResult(null);
  };

  // Debounced eligibility preview — only runs for types with eligibility rules and a non-empty payload.
  useEffect(() => {
    if (!selectedType || !(selectedType.eligibility && Object.keys(selectedType.eligibility).length)) {
      setEligResult(null);
      setEligChecking(false);
      return;
    }
    const timer = setTimeout(async () => {
      setEligChecking(true);
      try {
        setEligResult(await genericRequestService.checkEligibility(user, selectedType.code, formValues));
      } catch {
        setEligResult(null); // best-effort preview; the engine still enforces at submit
      } finally {
        setEligChecking(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [selectedType, formValues, user]);

  const handleSubmit = async () => {
    if (!selectedType) return;
    const payload: Record<string, any> = {};
    let valid = true;
    for (const a of attributesOf(selectedType)) {
      const v = formValues[a.key];
      const isBlank = v === undefined || v === null || v === '';
      if (a.required && isBlank) {
        notify(t('warning'), `"${attrLabel(a)}" is required.`, 'warning');
        valid = false;
      }
      if (!isBlank) {
        if (a.type === 'number') {
          const n = Number(v);
          payload[a.key] = n;
          if ((a.min !== undefined && n < a.min) || (a.max !== undefined && n > a.max)) {
            notify(t('warning'), `"${attrLabel(a)}" outside allowed range.`, 'warning');
            valid = false;
          }
        } else if (a.type === 'boolean') {
          payload[a.key] = Boolean(v);
        } else {
          payload[a.key] = v;
        }
      }
    }
    if (!valid) return;

    // Server-side gate (eligibility preview is advisory; this is authoritative).
    if (eligResult && !eligResult.eligible) {
      notify(t('warning'), eligResult.reason || 'You are not eligible to submit this request.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const res = await genericRequestService.startRequest(selectedType.code, payload);
      if (res.success) {
        notify(t('success'), res.message || 'Request submitted.', 'success');
        closeForm();
        setActiveTab('mine');
        await fetchMine();
        await fetchQueue();
        if (res.id) openDetail(res.id);
      } else {
        notify(t('critical'), `${res.message || 'Submission failed.'}${res.errors?.length ? ' ' + res.errors.join('; ') : ''}`, 'error');
      }
    } catch (e) {
      notify(t('critical'), String((e as Error).message), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const openDetail = async (requestId: string) => {
    setDetailLoading(true);
    const req = myRequests.find(r => r.id === requestId) || null;
    setDetailRequest(req);
    setDetailFlow([]);
    setDetailLoan(null);
    try {
      const [flow, loan] = await Promise.all([
        genericRequestService.getFlow(requestId),
        genericRequestService.getLoan(requestId),
      ]);
      setDetailFlow(flow || []);
      setDetailLoan(loan || null);
    } catch (e) {
      console.error('[GenericRequests] detail fetch failed:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailRequest(null);
    setDetailFlow([]);
    setDetailLoan(null);
  };

  const runDecision = async (requestId: string, decision: string, successMsg: string, note?: string) => {
    setProcessingId(requestId);
    try {
      const res = await genericRequestService.decide(requestId, decision, note || null);
      if (res.success) {
        notify(t('success'), successMsg, 'success');
        await Promise.all([fetchMine(), fetchQueue()]);
        if (detailRequest && detailRequest.id === requestId) openDetail(requestId);
      } else {
        notify(t('critical'), res.message || 'Action failed.', 'error');
      }
    } catch (e) {
      notify(t('critical'), String((e as Error).message), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleResubmit = (req: WfRequestRow) => {
    confirm({
      title: 'Resubmit Request',
      message: `Send "${req.request_type}" back through the workflow after corrections?`,
      confirmText: 'Resubmit',
      onConfirm: () => runDecision(req.id, 'approve', 'Request resubmitted to the workflow.'),
    });
  };

  const handleCancel = (req: WfRequestRow) => {
    confirm({
      title: 'Cancel Request',
      message: `Withdraw this ${req.request_type} request?`,
      confirmText: 'Cancel Request',
      onConfirm: () => runDecision(req.id, 'cancel', 'Request cancelled.'),
    });
  };

  const statusBadge = (status: string) => {
    const s = (status || '').toUpperCase();
    const st = STATUS_STYLE[s] || STATUS_STYLE.DRAFT;
    return (
      <span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.05em' }}>
        {s.replace('_', ' ')}
      </span>
    );
  };

  const stepDot = (status: string) => {
    switch ((status || '').toUpperCase()) {
      case 'APPROVED': return '✅';
      case 'REJECTED': return '⛔';
      case 'SKIPPED': return '⚪';
      case 'PENDING': return '🔵';
      default: return '🔘';
    }
  };

  const tabs: { id: TabId; label: string; icon: string; count: number }[] = [
    { id: 'catalog', label: language === 'ar' ? 'طلب جديد' : 'New Request', icon: '📝', count: catalog.length },
    { id: 'mine', label: language === 'ar' ? 'طلباتي' : 'My Requests', icon: '🗂️', count: myRequests.length },
    { id: 'queue', label: language === 'ar' ? 'قائمة الانتظار' : 'Action Queue', icon: '📥', count: queue.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{language === 'ar' ? 'الطلبات العامة' : 'Generic Requests'}</h2>
          <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
            {language === 'ar' ? 'أرسل واعتمد أي نوع طلب يتم تهيئته في محرك سير العمل.' : 'Submit and approve any request type configured in the workflow engine.'}
          </p>
        </div>
        <button onClick={fetchAll} className="cds--btn cds--btn--ghost cds--btn--sm">{t('sync')} 🔄</button>
      </header>

      {/* Tabs */}
      <div className="cds--tabs" style={{ marginBottom: 'var(--cds-spacing-03)', width: '100%', overflowX: 'auto', background: 'var(--cds-background)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <ul className="cds--tabs__nav" role="tablist" style={{ display: 'flex', gap: '2px', padding: 0, margin: 0, listStyle: 'none' }}>
          {tabs.map(tab => (
            <li
              key={tab.id}
              className={`cds--tabs__nav-item ${activeTab === tab.id ? 'cds--tabs__nav-item--selected' : ''}`}
              role="presentation"
              style={{ flex: '1 0 auto', minWidth: '140px' }}
            >
              <button
                className="cds--tabs__nav-link"
                onClick={() => { setActiveTab(tab.id); closeDetail(); }}
                style={{
                  width: '100%',
                  padding: '0 var(--cds-spacing-05)',
                  fontSize: '0.75rem',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  background: activeTab === tab.id ? 'var(--cds-layer-01)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--cds-interactive-01)' : 'var(--cds-text-secondary)',
                  border: 'none',
                  borderBottom: activeTab === tab.id ? '2px solid var(--cds-interactive-01)' : '2px solid transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--cds-spacing-03)',
                  height: '40px',
                  transition: 'all 0.2s ease'
                }}
              >
                <span style={{ opacity: activeTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tab.label} ({tab.count})</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--cds-spacing-10)', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
          <div className="cds--loading cds--loading--small" style={{ margin: '0 auto var(--cds-spacing-05) auto' }}></div>
          Loading request catalog...
        </div>
      ) : (
        <>
          {/* ---------------- CATALOG + NEW FORM ---------------- */}
          {activeTab === 'catalog' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
              {catalog.length === 0 && (
                <div style={{ border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-07)', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
                  No active request types configured. Add one under Workflow Config → Request Types.
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
                {catalog.map(rt => (
                  <button
                    key={rt.code}
                    onClick={() => openForm(rt)}
                    style={{
                      textAlign: 'start',
                      background: selectedType?.code === rt.code ? 'var(--cds-layer-02)' : 'var(--cds-background)',
                      border: `1px solid ${selectedType?.code === rt.code ? 'var(--cds-interactive-01)' : 'var(--cds-border-subtle)'}`,
                      padding: 'var(--cds-spacing-05)',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--cds-spacing-03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>{rt.name}</span>
                      <span className="cds--tag cds--tag--cyan cds--tag--sm">{rt.code}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                      {attributesOf(rt).map(a => attrLabel(a)).join(' · ') || 'No attributes'}
                    </span>
                    {rt.eligibility && Object.keys(rt.eligibility).length > 0 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--cds-support-error)' }}>
                        ⚠ {Object.entries(rt.eligibility).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`).join(' · ')}
                      </span>
                    )}
                    {rt.finalization?.action && rt.finalization.action !== 'none' && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--cds-text-secondary)' }}>
                        Finalizes: {rt.finalization.action}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {selectedType && (
                <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-05)' }}>
                    <h3 style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                      {selectedType.name} — {selectedType.code}
                    </h3>
                    <button onClick={closeForm} className="cds--btn cds--btn--ghost cds--btn--sm">{t('cancel')}</button>
                  </div>

                  <form
                    onSubmit={e => { e.preventDefault(); handleSubmit(); }}
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--cds-spacing-05)' }}
                  >
                    {selectedType.eligibility && Object.keys(selectedType.eligibility).length > 0 && (
                      <div
                        style={{
                          gridColumn: '1 / -1',
                          display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)',
                          padding: 'var(--cds-spacing-03) var(--cds-spacing-04)', borderRadius: '4px',
                          fontSize: '0.75rem',
                          background: eligChecking ? 'var(--cds-layer)' : eligResult && !eligResult.eligible ? 'var(--cds-support-error)' : eligResult ? 'var(--cds-support-success)' : 'var(--cds-layer)',
                          color: eligChecking ? 'var(--cds-text-secondary)' : eligResult && !eligResult.eligible ? 'var(--cds-text-on-color)' : eligResult ? 'var(--cds-text-on-color)' : 'var(--cds-text-secondary)',
                          border: `1px solid ${eligChecking || !eligResult ? 'var(--cds-border-subtle)' : 'transparent'}`,
                        }}
                      >
                        <span>{eligChecking ? '⏳' : eligResult && !eligResult.eligible ? '⚠' : eligResult ? '✓' : 'ℹ'}</span>
                        <span>
                          {eligChecking
                            ? 'Checking eligibility…'
                            : eligResult
                              ? (eligResult.eligible ? 'You are eligible for this request.' : (eligResult.reason || 'You are not eligible for this request.'))
                              : 'Eligibility rules apply — see catalog card.'}
                        </span>
                      </div>
                    )}
                    {attributesOf(selectedType).map(a => (
                      <div key={a.key} className="cds--form-item">
                        <label className="cds--label">
                          {attrLabel(a)}
                          {a.required && <span style={{ color: 'var(--cds-support-error)' }}> *</span>}
                          {a.type === 'number' && (a.min !== undefined || a.max !== undefined) && (
                            <span style={{ color: 'var(--cds-text-secondary)', fontWeight: 400 }}>
                              {' '}({a.min !== undefined ? `min ${a.min}` : ''}{a.min !== undefined && a.max !== undefined ? ' / ' : ''}{a.max !== undefined ? `max ${a.max}` : ''})
                            </span>
                          )}
                        </label>
                        {a.type === 'boolean' ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)', height: '40px' }}>
                            <input
                              type="checkbox"
                              checked={!!formValues[a.key]}
                              onChange={e => setFormValues(v => ({ ...v, [a.key]: e.target.checked }))}
                              style={{ width: '16px', height: '16px' }}
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{a.required ? 'required' : 'optional'}</span>
                          </div>
                        ) : a.type === 'enum' ? (
                          <select
                            className="cds--select-input"
                            value={formValues[a.key] || ''}
                            onChange={e => setFormValues(v => ({ ...v, [a.key]: e.target.value }))}
                            style={{ height: '40px', background: 'var(--cds-background)' }}
                          >
                            <option value="">— select —</option>
                            {(a.values || []).map(val => <option key={val} value={val}>{val}</option>)}
                          </select>
                        ) : (
                          <input
                            required={!!a.required}
                            type={a.type === 'number' ? 'number' : a.type === 'date' ? 'date' : 'text'}
                            step={a.type === 'number' ? 'any' : undefined}
                            placeholder={a.placeholder || attrLabel(a)}
                            className={a.type === 'date' ? 'cds--text-input' : 'cds--text-input'}
                            value={formValues[a.key] ?? ''}
                            onChange={e => setFormValues(v => ({ ...v, [a.key]: e.target.value }))}
                            style={{ height: '40px', background: 'var(--cds-background)' }}
                          />
                        )}
                      </div>
                    ))}

                    <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 'var(--cds-spacing-03)' }}>
                      <button type="button" onClick={closeForm} className="cds--btn cds--btn--secondary">{t('cancel')}</button>
                      <button type="submit" disabled={submitting} className="cds--btn cds--btn--primary">
                        {submitting ? 'Submitting...' : (t('submitApp') || 'Submit').toUpperCase()}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          )}

          {/* ---------------- MY REQUESTS ---------------- */}
          {activeTab === 'mine' && (
            <div style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
              <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                <thead>
                  <tr>
                    <th>TYPE</th>
                    <th>SUMMARY</th>
                    <th>STATUS</th>
                    <th>STEP</th>
                    <th>SUBMITTED</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {myRequests.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--cds-spacing-10)', color: 'var(--cds-text-disabled)', fontStyle: 'italic' }}>
                      No requests yet. Create one from the New Request tab.
                    </td></tr>
                  ) : myRequests.map(req => (
                    <tr key={req.id}>
                      <td style={{ fontWeight: 600, fontSize: '0.875rem' }}>{req.request_type}</td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{summarizePayload(req.payload)}</td>
                      <td>{statusBadge(req.status)}</td>
                      <td style={{ fontSize: '0.75rem' }}>{req.current_step ?? '—'}</td>
                      <td style={{ fontSize: '0.75rem' }}>{new Date(req.created_at).toLocaleString()}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => openDetail(req.id)} className="cds--btn cds--btn--ghost cds--btn--sm">View</button>
                        {req.status === 'RETURNED' && (
                          <button onClick={() => handleResubmit(req)} disabled={processingId === req.id} className="cds--btn cds--btn--primary cds--btn--sm">Resubmit</button>
                        )}
                        {['PENDING', 'RETURNED'].includes(req.status) && (
                          <button onClick={() => handleCancel(req)} disabled={processingId === req.id} className="cds--btn cds--btn--danger--ghost cds--btn--sm">Cancel</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {detailRequest && (
                <div style={{ borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', padding: 'var(--cds-spacing-06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-05)' }}>
                    <h3 style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                      {detailRequest.request_type} — flow trace
                    </h3>
                    <button onClick={closeDetail} className="cds--btn cds--btn--ghost cds--btn--sm">Close</button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-06)' }}>
                    <div>
                      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-03)', textTransform: 'uppercase' }}>Payload</p>
                      <pre style={{ background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-04)', fontSize: '0.75rem', whiteSpace: 'pre-wrap', margin: 0 }}>
                        {JSON.stringify(detailRequest.payload, null, 2)}
                      </pre>
                      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--cds-text-secondary)', margin: 'var(--cds-spacing-05) 0 var(--cds-spacing-03)', textTransform: 'uppercase' }}>History</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-02)' }}>
                        {(detailRequest.history || []).slice(-5).reverse().map((h: any, i: number) => (
                          <div key={i} style={{ fontSize: '0.7rem', color: 'var(--cds-text-secondary)' }}>
                            <span style={{ color: 'var(--cds-text-primary)', fontWeight: 600 }}>{h.actor}</span> — {h.action}
                            {h.note ? `: ${h.note}` : ''}
                            <span style={{ opacity: 0.6 }}> · {new Date(h.at).toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-03)', textTransform: 'uppercase' }}>Workflow Steps</p>
                      {detailLoading ? (
                        <div className="cds--loading cds--loading--small" style={{ margin: 'var(--cds-spacing-05) auto' }}></div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {detailFlow.length === 0 ? (
                            <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-disabled)', fontStyle: 'italic' }}>Flow trace unavailable.</span>
                          ) : detailFlow.map((f, i, arr) => (
                            <div key={f.step_order}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--cds-spacing-03)' }}>
                                <span style={{ fontSize: '1rem' }}>{stepDot(f.status)}</span>
                                <div>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                                    {i + 1}. {f.name || f.code}
                                    {f.resolved_actor && <span style={{ color: 'var(--cds-text-secondary)', fontWeight: 400 }}> → {f.resolved_actor}</span>}
                                  </div>
                                  <div style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    {f.status} {f.decided_by ? `by ${f.decided_by}` : ''} {f.decided_at ? `at ${new Date(f.decided_at).toLocaleString()}` : ''}
                                  </div>
                                  {f.note && <div style={{ fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--cds-text-secondary)' }}>“{f.note}”</div>}
                                </div>
                              </div>
                              {i < arr.length - 1 && <div style={{ marginLeft: '10px', borderLeft: '1px dashed var(--cds-border-strong)', minHeight: 'var(--cds-spacing-04)' }} />}
                            </div>
                          ))}
                        </div>
                      )}

                      {detailLoan && (
                        <div style={{ marginTop: 'var(--cds-spacing-05)' }}>
                          <p style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-03)', textTransform: 'uppercase' }}>
                            Loan Schedule — {detailLoan.amount} over {detailLoan.duration_months} months
                          </p>
                          <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                            <thead>
                              <tr><th>{language === 'ar' ? 'الشهر' : 'Month'}</th><th>{language === 'ar' ? 'القسط' : 'Instalment'}</th><th>{language === 'ar' ? 'الحالة' : 'Status'}</th></tr>
                            </thead>
                            <tbody>
                              {(Array.isArray(detailLoan.instalments) ? detailLoan.instalments : []).map((ins: any, idx: number) => (
                                <tr key={idx}>
                                  <td style={{ fontSize: '0.75rem' }}>{ins.month_number ?? idx + 1}</td>
                                  <td style={{ fontSize: '0.75rem' }}>{ins.amount ?? ''}</td>
                                  <td style={{ fontSize: '0.75rem' }}>{ins.status ?? ''}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ---------------- ACTION QUEUE ---------------- */}
          {activeTab === 'queue' && (
            <div style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
              <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                <thead>
                  <tr>
                    <th>REQUESTER</th>
                    <th>TYPE</th>
                    <th>FLOW / STEP</th>
                    <th>STATUS</th>
                    <th>NOTE</th>
                    <th style={{ textAlign: 'right' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.length === 0 ? (
                    <tr><td colSpan={6} style={{ textAlign: 'center', padding: 'var(--cds-spacing-10)', color: 'var(--cds-text-disabled)', fontStyle: 'italic' }}>
                      Nothing awaiting your action.
                    </td></tr>
                  ) : queue.map(item => (
                    <tr key={`${item.request_id}-${item.step_order}`}>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.requester_name}</div>
                        <div style={{ fontSize: '0.625rem', opacity: 0.6, textTransform: 'uppercase' }}>{item.requester_dept}</div>
                      </td>
                      <td style={{ fontWeight: 600, fontSize: '0.75rem' }}>{item.request_type}</td>
                      <td style={{ fontSize: '0.75rem' }}>
                        <div>{item.flow_code}</div>
                        <div style={{ color: 'var(--cds-text-secondary)', fontSize: '0.625rem' }}>{item.step_name || item.step_code} (#{item.step_order})</div>
                      </td>
                      <td>{statusBadge(item.status)}</td>
                      <td style={{ minWidth: '180px' }}>
                        <input
                          className="cds--text-input cds--text-input--sm"
                          placeholder="Note (required for return/reject)"
                          value={queueNotes[item.request_id] || ''}
                          onChange={e => setQueueNotes(n => ({ ...n, [item.request_id]: e.target.value }))}
                          style={{ height: '28px', fontSize: '0.75rem', maxWidth: '220px' }}
                        />
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          onClick={() => runDecision(item.request_id, 'approve', 'Approved. Forwarded within the workflow.', queueNotes[item.request_id])}
                          disabled={processingId === item.request_id}
                          className="cds--btn cds--btn--ghost cds--btn--sm"
                        >Approve</button>
                        <button
                          onClick={() => {
                            if (!queueNotes[item.request_id]) { notify(t('warning'), 'Please add a note for the return.', 'warning'); return; }
                            runDecision(item.request_id, 'return', 'Returned to requester for correction.', queueNotes[item.request_id]);
                          }}
                          disabled={processingId === item.request_id}
                          className="cds--btn cds--btn--ghost cds--btn--sm"
                        >↩ Return</button>
                        <button
                          onClick={() => {
                            if (!queueNotes[item.request_id]) { notify(t('warning'), 'Please add a reason for the rejection.', 'warning'); return; }
                            runDecision(item.request_id, 'reject', 'Request rejected.', queueNotes[item.request_id]);
                          }}
                          disabled={processingId === item.request_id}
                          className="cds--btn cds--btn--danger--ghost cds--btn--sm"
                        >Reject</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default GenericRequestsView;