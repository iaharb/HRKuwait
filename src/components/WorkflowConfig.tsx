import React, { useEffect, useMemo, useState } from 'react';
import {
  workflowConfigService as svc,
  WfRole, WfFlow, WfStep, WfUserRole, LaUserLite, DlmRow, HrOrgUnit, OrgKind, StepType, ApproverRule, WfRequestType,
} from '../services/workflowConfigService.ts';

const STEP_OPTIONS: { value: StepType; label: string }[] = [
  { value: 'init', label: 'Init / submit' },
  { value: 'approval', label: 'Approval' },
  { value: 'review', label: 'Review' },
  { value: 'acknowledge', label: 'Replacement concurs' },
  { value: 'auto', label: 'Auto action' },
];
const RULE_OPTIONS: { value: ApproverRule; label: string; help: string }[] = [
  { value: 'role', label: 'Role holder', help: 'Anyone who holds the step\'s actor role acts (one approval advances).' },
  { value: 'requester', label: 'Requester', help: 'The employee themselves (used for the submit step).' },
  { value: 'line_manager', label: 'Direct manager', help: 'The requester\'s direct manager (manager_id), walking up N levels (rule_config.level).' },
  { value: 'requester_replacement', label: 'Replacement', help: 'The chosen replacement / deputy who acknowledged the leave.' },
  { value: 'department_head', label: 'Department head', help: 'Highest-ranked approver who holds a role in the requester\'s own department.' },
  { value: 'unit_head', label: 'Unit head', help: 'Head of the requester\'s unit entity.' },
  { value: 'supervision_head', label: 'Supervision head', help: 'Head of the requester\'s supervision entity.' },
  { value: 'division_head', label: 'Division head', help: 'Head of the requester\'s division entity.' },
  { value: 'reporting_chain', label: 'Reporting chain', help: 'Climb entities then manager chain, up to N hops (rule_config.level).' },
  { value: 'specific_user', label: 'Specific user', help: 'A fixed person (set in rule_config.user_id).' },
  { value: 'delegate_to_role', label: 'Delegate to role', help: 'Resolve a different role (rule_config.delegate_to_role) — for OOO coverage.' },
  { value: 'escalate_after_hours', label: 'Escalate after hours', help: 'After N hours pending, escalate to role/rule (rule_config.escalate_after_hours, escalate_to_role, escalate_to_rule).' },
  { value: 'escalate_to_rule', label: 'Escalate to rule', help: 'Use a different rule for escalation (rule_config.escalate_to_rule).' },
];

const card = { border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' } as React.CSSProperties;
const th = { textAlign: 'start', fontSize: '0.625rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cds-text-secondary)', padding: 'var(--cds-spacing-03) var(--cds-spacing-04)' } as React.CSSProperties;
const td = { padding: 'var(--cds-spacing-02) var(--cds-spacing-04)', verticalAlign: 'middle', fontSize: '0.8125rem' } as React.CSSProperties;
const input = { background: 'var(--cds-field-01)', border: 'none', borderBottom: '1px solid var(--cds-border-strong)', color: 'var(--cds-text-primary)', fontSize: '0.8125rem', padding: '4px 6px', width: '100%' } as React.CSSProperties;
const field = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' } as React.CSSProperties;
const btn = 'cds--btn cds--btn--sm';

const ORG_KIND_LABEL: Record<OrgKind, string> = {
  division: 'Division', department: 'Department', supervision: 'Supervision', unit: 'Unit',
};
const CHILD_KINDS: Record<OrgKind, OrgKind[]> = {
  division: ['department'],
  department: ['supervision', 'unit'],
  supervision: ['supervision', 'unit'],
  unit: [],
};

const blankStep = (order: number): WfStep => ({
  step_order: order, code: '', name: '', actor_role_code: null, step_type: 'approval',
  rule: 'role', rule_config: {}, condition: {}, is_required: true, allow_self: false,
});

const WorkflowConfig: React.FC = () => {
  const [tab, setTab] = useState<'roles' | 'workflows' | 'assignments' | 'org' | 'orgtree' | 'requesttypes' | 'reassignment'>('roles');
  const [roles, setRoles] = useState<WfRole[]>([]);
  const [flows, setFlows] = useState<WfFlow[]>([]);
  const [steps, setSteps] = useState<WfStep[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<WfUserRole[]>([]);
  const [laUsers, setLaUsers] = useState<LaUserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [mode, setMode] = useState<'legacy' | 'configurable'>('legacy');

  const [newAssignment, setNewAssignment] = useState<{ userId: string; roleCode: string; scope: string }>({ userId: '', roleCode: '', scope: '' });
  const [dlm, setDlm] = useState<DlmRow[]>([]);
  const [orgUnits, setOrgUnits] = useState<HrOrgUnit[]>([]);
  const [reqTypes, setReqTypes] = useState<WfRequestType[]>([]);
  const [rtEditor, setRtEditor] = useState<{ code: string; schema: string; eligibility: string; finalization: string } | null>(null);
  const [orgDraft, setOrgDraft] = useState<{ kind: OrgKind; code: string; name: string; name_arabic: string; parentId: string }>(
    { kind: 'division', code: '', name: '', name_arabic: '', parentId: '' }
  );

  // Reassignment state
  const [reassignFrom, setReassignFrom] = useState<string>('');
  const [reassignTo, setReassignTo] = useState<string>('');
  const [reassignResult, setReassignResult] = useState<any[]>([]);
  const [affectedCount, setAffectedCount] = useState<number>(0);

  const selectedFlow = useMemo(() => flows.find(f => f.id === selectedFlowId) || null, [flows, selectedFlowId]);

  // Debounced preview of affected steps count when "from" user changes
  useEffect(() => {
    let cancelled = false;
    if (!reassignFrom) { setAffectedCount(0); return; }
    const timer = setTimeout(async () => {
      try { const c = await svc.getOpenStepsCount(reassignFrom); if (!cancelled) setAffectedCount(c); } catch { if (!cancelled) setAffectedCount(0); }
    }, 300);
    return () => { cancelled = true; };
  }, [reassignFrom]);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const runReassign = async () => {
    if (!reassignFrom) { flash('err', 'Select a user to reassign from.'); return; }
    setSaving(true);
    setReassignResult([]);
    try {
      const res = await svc.reassignPending(reassignFrom, reassignTo || null);
      setReassignResult(res);
      if (res.length === 0) flash('ok', 'No pending steps found for that user.');
      else flash('ok', `Reassigned ${res.length} step(s).`);
    } catch (e: any) {
      flash('err', e.message);
    } finally {
      setSaving(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [r, f, ur, lu, d, ou, em, rt] = await Promise.all([svc.getRoles(), svc.getFlows(), svc.getUserRoles(), svc.getLaUsers(), svc.getDlmCoverage(), svc.getOrgUnits(), svc.getEngineMode(), svc.getRequestTypes()]);
      setRoles(r); setFlows(f); setUserRoles(ur); setLaUsers(lu); setDlm(d); setOrgUnits(ou); setMode(em); setReqTypes(rt);
      const active = f.find(x => x.status === 'active') || f[0];
      if (active) { setSelectedFlowId(active.id); setSteps(await svc.getSteps(active.id)); }
    } catch (e: any) {
      flash('err', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const selectFlow = async (id: string) => {
    if (!id) { setSelectedFlowId(''); setSteps([]); return; }
    setSelectedFlowId(id);
    try { setSteps(await svc.getSteps(id)); } catch (e: any) { flash('err', e.message); }
  };

  // ---------- Roles ----------
  const updateRole = (i: number, patch: Partial<WfRole>) =>
    setRoles(prev => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const saveRoles = async () => {
    setSaving(true);
    try { await svc.saveRoles(roles); flash('ok', 'Roles saved.'); }
    catch (e: any) { flash('err', e.message); } finally { setSaving(false); }
  };
  const removeRole = async (code: string) => {
    if (!window.confirm(`Delete role "${code}"?`)) return;
    try { await svc.deleteRole(code); setRoles(prev => prev.filter(r => r.code !== code)); flash('ok', 'Role deleted.'); }
    catch (e: any) { flash('err', e.message); }
  };

  // ---------- Workflows ----------
  const editSelected = (patch: Partial<WfFlow>) => {
    if (!selectedFlow) return;
    setFlows(prev => prev.map(f => (f.id === selectedFlow.id ? { ...f, ...patch } : f)));
  };
  const addFlow = () => {
    const draft: WfFlow = { id: '', code: 'NEW_FLOW', name: 'New Workflow', version: 0, status: 'draft', applies_to: {} };
    setFlows(prev => [draft, ...prev]);
    setSelectedFlowId('');
    setSteps([]);
  };
  const updateStep = (i: number, patch: Partial<WfStep>) =>
    setSteps(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps(prev => [...prev, blankStep(prev.length)]);
  const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps(prev => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  };
  const saveFlow = async () => {
    const flow = selectedFlow || flows.find(f => !f.id);
    if (!flow) return flash('err', 'No workflow selected.');
    if (!flow.code.trim() || !flow.name.trim()) return flash('err', 'Workflow code and name are required.');
    setSaving(true);
    try {
      const saved = await svc.saveFlow(flow, steps);
      flash('ok', `Workflow "${saved.name}" saved (v${saved.version}, ${saved.status}).`);
      await loadAll();
      setSelectedFlowId(saved.id);
    } catch (e: any) { flash('err', e.message); } finally { setSaving(false); }
  };
  const removeFlow = async () => {
    if (!selectedFlow?.id) return;
    if (!window.confirm(`Delete workflow "${selectedFlow.name}" and all its steps?`)) return;
    try { await svc.deleteFlow(selectedFlow.id); flash('ok', 'Workflow deleted.'); await loadAll(); }
    catch (e: any) { flash('err', e.message); }
  };

  // ---------- Assignments ----------
  const addAssignment = async () => {
    if (!newAssignment.userId || !newAssignment.roleCode) return flash('err', 'Pick a user and a role.');
    try {
      await svc.setUserRole(newAssignment.userId, newAssignment.roleCode, newAssignment.scope || null);
      setNewAssignment({ userId: '', roleCode: '', scope: '' });
      setUserRoles(await svc.getUserRoles());
      flash('ok', 'Role assigned.');
    } catch (e: any) { flash('err', e.message); }
  };
  const dropAssignment = async (id: string) => {
    try { await svc.removeUserRole(id); setUserRoles(prev => prev.filter(u => u.id !== id)); flash('ok', 'Assignment removed.'); }
    catch (e: any) { flash('err', e.message); }
  };

  // ---------- Engine activation ----------
  const activeFlows = flows.filter(f => f.status === 'active').length;
  const changeMode = async (next: 'legacy' | 'configurable') => {
    if (next === mode) return;
    if (next === 'configurable' && activeFlows === 0 &&
        !window.confirm('No active workflow exists yet. Switch anyway? Requests will fail until one is active.')) return;
    if (next === 'legacy' && !window.confirm('Switch the leave app back to the built-in legacy workflow?')) return;
    try {
      await svc.setEngineMode(next);
      setMode(next);
      flash('ok', next === 'configurable' ? 'The leave app now runs your configured workflows.' : 'The leave app now uses the legacy workflow.');
    } catch (e: any) { flash('err', e.message); }
  };

  const userName = (id: string) => laUsers.find(u => u.id === id)?.full_name || id.slice(0, 8);

  // ---------- Organization / DLM coverage ----------
  const setManager = async (row: DlmRow, managerId: string) => {
    const next = managerId || null;
    try {
      await svc.setDlmManager(row.user_id, next);
      setDlm(prev => prev.map(x => (x.user_id === row.user_id ? { ...x, manager_id: next, manager_name: next ? (laUsers.find(u => u.id === next)?.full_name || null) : null } : x)));
      flash('ok', next ? `${row.full_name} now reports to ${laUsers.find(u => u.id === next)?.full_name}.` : `Cleared ${row.full_name}'s manager.`);
    } catch (e: any) { flash('err', e.message); }
  };
  const missingDlm = dlm.filter(r => !r.manager_id && r.role !== 'ceo');

  // ---------- Org tree ----------
  const patchOrg = (id: string, patch: Partial<HrOrgUnit>) =>
    setOrgUnits(prev => prev.map(x => (x.id === id ? { ...x, ...patch } : x)));
  const orgNode = (id: string | null) => orgUnits.find(x => x.id === id);
  const orgChildren = (id: string) => orgUnits.filter(x => x.parent_id === id);
  const orgPath = (u: HrOrgUnit) => {
    const parts: string[] = [];
    let cur: HrOrgUnit | undefined = u;
    while (cur) { parts.unshift(cur.name); cur = orgNode(cur.parent_id); }
    return parts.join(' / ');
  };
  const leafUnits = orgUnits.filter(x => x.kind === 'unit' || x.kind === 'supervision');

  const saveOrgRow = async (u: HrOrgUnit) => {
    setSaving(true);
    try {
      await svc.saveOrgUnit(u);
      flash('ok', `Saved "${u.name}".`);
      setOrgUnits(await svc.getOrgUnits());
    } catch (e: any) { flash('err', e.message); } finally { setSaving(false); }
  };
  const addOrg = async () => {
    const kind = orgDraft.kind;
    if (kind !== 'division' && !orgDraft.parentId) return flash('err', 'Pick a parent entity.');
    if (!orgDraft.code.trim() || !orgDraft.name.trim()) return flash('err', 'Code and name are required.');
    setSaving(true);
    try {
      await svc.saveOrgUnit({
        kind, code: orgDraft.code, name: orgDraft.name,
        name_arabic: orgDraft.name_arabic || null,
        parent_id: kind === 'division' ? null : orgDraft.parentId,
        active: true,
      });
      setOrgDraft({ kind: 'division', code: '', name: '', name_arabic: '', parentId: '' });
      setOrgUnits(await svc.getOrgUnits());
      flash('ok', 'Entity created.');
    } catch (e: any) { flash('err', e.message); } finally { setSaving(false); }
  };
  const removeOrg = async (u: HrOrgUnit) => {
    if (orgChildren(u.id).length > 0) return flash('err', 'Remove child entities first.');
    if (laUsers.some(lu => lu.entity_id === u.id)) return flash('err', 'Employees are assigned to this entity; unassign them first.');
    if (!window.confirm(`Delete "${u.name}"?`)) return;
    try {
      await svc.deleteOrgUnit(u.id);
      setOrgUnits(prev => prev.filter(x => x.id !== u.id));
      flash('ok', 'Entity deleted.');
    } catch (e: any) { flash('err', e.message); }
  };
  const assignEntity = async (userId: string, entityId: string) => {
    const next = entityId || null;
    try {
      await svc.setLaUserEntity(userId, next);
      setLaUsers(prev => prev.map(x => (x.id === userId ? { ...x, entity_id: next } : x)));
      flash('ok', 'Membership updated.');
    } catch (e: any) { flash('err', e.message); }
  };

  // ---------- Request types ----------
  const patchRt = (i: number, patch: Partial<WfRequestType>) =>
    setReqTypes(prev => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  const addRt = () => setReqTypes(prev => [...prev, {
    id: '', code: '', name: '', payload_schema: { attributes: [] }, eligibility: {}, finalization: { action: 'none' }, active: true,
  }]);
  const openRtJson = (t: WfRequestType) => setRtEditor({
    code: t.code,
    schema: JSON.stringify(t.payload_schema || {}, null, 2),
    eligibility: JSON.stringify(t.eligibility || {}, null, 2),
    finalization: JSON.stringify(t.finalization || {}, null, 2),
  });
  const saveRt = async (t: WfRequestType) => {
    setSaving(true);
    try {
      if (rtEditor?.code === t.code) {
        let schema: any, elig: any, fin: any;
        try { schema = JSON.parse(rtEditor.schema); } catch (e: any) { throw new Error(`payload_schema JSON: ${e.message}`); }
        try { elig = JSON.parse(rtEditor.eligibility); } catch (e: any) { throw new Error(`eligibility JSON: ${e.message}`); }
        try { fin = JSON.parse(rtEditor.finalization); } catch (e: any) { throw new Error(`finalization JSON: ${e.message}`); }
        if (Array.isArray(schema) || schema === null) throw new Error('payload_schema must be a JSON object, e.g. {"attributes":[...]}.');
        t = { ...t, payload_schema: schema, eligibility: elig, finalization: fin };
      }
      await svc.saveRequestType(t);
      flash('ok', `Type "${t.code || t.name}" saved.`);
      setReqTypes(await svc.getRequestTypes());
      setRtEditor(null);
    } catch (e: any) { flash('err', e.message); } finally { setSaving(false); }
  };
  const removeRt = async (t: WfRequestType) => {
    if (!t.code) { setReqTypes(prev => prev.filter(x => x !== t)); return; }
    if (!window.confirm(`Delete request type "${t.code}"? Existing requests keep their history.`)) return;
    try {
      await svc.deleteRequestType(t.code);
      setReqTypes(prev => prev.filter(x => x.code !== t.code));
      flash('ok', 'Request type deleted.');
    } catch (e: any) { flash('err', e.message); }
  };

  const renderOrgNode = (u: HrOrgUnit, depth: number): React.ReactElement => {
    const kids = orgChildren(u.id);
    return (
      <React.Fragment key={u.id}>
        <tr>
          <td style={{ ...td, paddingLeft: `calc(var(--cds-spacing-04) + ${depth * 22}px)` }}>
            <span className="cds--tag cds--tag--sm" style={{ marginInlineEnd: 6, background: 'var(--cds-layer)',
              color: depth === 0 ? 'var(--cds-interactive-01)' : 'var(--cds-text-secondary)', fontWeight: depth === 0 ? 700 : 500 }}>
              {ORG_KIND_LABEL[u.kind]}
            </span>
            <input style={{ ...input, width: 180, fontWeight: 600 }} value={u.name}
              onChange={e => patchOrg(u.id, { name: e.target.value })} />
          </td>
          <td style={td}><input style={{ ...input, width: 110 }} value={u.code}
            onChange={e => patchOrg(u.id, { code: e.target.value })} /></td>
          <td style={td}>
            {u.kind === 'division'
              ? <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Root</span>
              : (
                <select style={input} value={u.parent_id || ''}
                  onChange={e => patchOrg(u.id, { parent_id: e.target.value || null })}>
                  {orgUnits.filter(c => c.id !== u.id && CHILD_KINDS[c.kind].includes(u.kind)).map(c =>
                    <option key={c.id} value={c.id}>{orgPath(c)}</option>)}
                </select>
              )}
          </td>
          <td style={{ ...td, minWidth: 170 }}>
            <select style={input} value={u.head_user_id || ''}
              onChange={e => patchOrg(u.id, { head_user_id: e.target.value || null })}>
              <option value="">— no head —</option>
              {laUsers.map(x => <option key={x.id} value={x.id}>{x.full_name}</option>)}
            </select>
          </td>
          <td style={td}>
            <input type="checkbox" checked={u.active} onChange={e => patchOrg(u.id, { active: e.target.checked })} />
          </td>
          <td style={{ ...td, whiteSpace: 'nowrap' }}>
            <button className={`${btn} cds--btn--primary`} disabled={saving} onClick={() => saveOrgRow(u)}>Save</button>
            {CHILD_KINDS[u.kind].length > 0 && (
              <button className={`${btn} cds--btn--tertiary`} title={`Add ${CHILD_KINDS[u.kind].join(' / ')}`}
                onClick={() => { setOrgDraft({ kind: CHILD_KINDS[u.kind][0], code: '', name: '', name_arabic: '', parentId: u.id }); }}>
                + child
              </button>
            )}
            <button className={`${btn} cds--btn--ghost cds--btn--danger`} onClick={() => removeOrg(u)}>Del</button>
          </td>
        </tr>
        {kids.map(k => renderOrgNode(k, depth + 1))}
      </React.Fragment>
    );
  };

  if (loading) return <div style={{ padding: 'var(--cds-spacing-09)', color: 'var(--cds-text-secondary)' }}>Loading workflow configuration…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)', animation: 'fade-in 0.4s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 'var(--cds-spacing-04)' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Workflow Configuration</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            Define roles, approval workflows and who holds each role. Changes are data, not code.
          </p>
        </div>
        {!svc.hasWriteAccess && (
          <span className="cds--tag cds--tag--red cds--tag--sm">Service-role key missing — read-only</span>
        )}
      </div>

      <div style={{ ...card, padding: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--cds-spacing-05)', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            Leave app engine:&nbsp;
            <span className={`cds--tag cds--tag--sm ${mode === 'configurable' ? 'cds--tag--green' : 'cds--tag--gray'}`}>
              {mode === 'configurable' ? 'New (configured workflows)' : 'Legacy (built-in chain)'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
            {mode === 'configurable'
              ? 'The app routes each request through the active workflow for its leave type.'
              : 'The app uses the hardcoded chain: replacement → line manager → HR → CEO.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '2px' }}>
          <button className={`${btn} ${mode === 'legacy' ? 'cds--btn--primary' : 'cds--btn--tertiary'}`} onClick={() => changeMode('legacy')}>Legacy</button>
          <button className={`${btn} ${mode === 'configurable' ? 'cds--btn--primary' : 'cds--btn--tertiary'}`} onClick={() => changeMode('configurable')} disabled={activeFlows === 0} title={activeFlows === 0 ? 'Activate a workflow first' : ''}>New workflow</button>
        </div>
      </div>

      {msg && (
        <div className="cds--inline-notification" style={{ padding: 'var(--cds-spacing-04)', background: msg.type === 'ok' ? 'var(--cds-support-success-inverse, #defbe6)' : 'var(--cds-support-error-inverse, #fff1f1)', color: msg.type === 'ok' ? '#0e6027' : '#a2191f', fontSize: '0.8125rem' }}>
          {msg.text}
        </div>
      )}

      <div className="cds--tabs" style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <ul className="cds--tabs__nav" style={{ display: 'flex', gap: '2px', padding: 0, margin: 0, listStyle: 'none' }}>
          {([['roles', 'Roles', '🙋'], ['workflows', 'Workflows', '🧭'], ['assignments', 'Role Assignments', '🔗'], ['org', 'Organization / DLM', '👥'], ['orgtree', 'Org Tree', '🌳'], ['requesttypes', 'Request Types', '📝'], ['reassignment', 'Reassignment', '🔄']] as const).map(([id, label, icon]) => (
            <li key={id}>
              <button
                onClick={() => setTab(id)}
                style={{
                  height: '36px', padding: '0 var(--cds-spacing-05)', border: 'none', cursor: 'pointer',
                  background: tab === id ? 'var(--cds-layer-01)' : 'transparent',
                  color: tab === id ? 'var(--cds-text-primary)' : 'var(--cds-text-secondary)',
                  borderBottom: tab === id ? '2px solid var(--cds-interactive-01)' : '2px solid transparent',
                  fontWeight: tab === id ? 600 : 400, fontSize: '0.875rem',
                }}
              >
                {icon} {label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {tab === 'roles' && (
        <div style={card} className="cds--tile">
          <div style={{ padding: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cds-border-subtle)' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Role Catalog</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>e.g. Emp, DM, HR, FD, CEO — used as step actors.</p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className={`${btn} cds--btn--secondary`} onClick={() => setRoles(prev => [...prev, { code: '', name: '', rank: (prev.at(-1)?.rank || 0) + 10, is_approver: true }])}>+ Add role</button>
              <button className={`${btn} cds--btn--primary`} disabled={saving} onClick={saveRoles}>{saving ? 'Saving…' : 'Save roles'}</button>
            </div>
          </div>
          <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
            <thead><tr><th style={th}>Code</th><th style={th}>Display name</th><th style={{ ...th, width: 90 }}>Rank</th><th style={{ ...th, width: 110 }}>Approver</th><th style={th}></th></tr></thead>
            <tbody>
              {roles.map((r, i) => (
                <tr key={i}>
                  <td style={td}><input style={input} value={r.code} onChange={e => updateRole(i, { code: e.target.value.toUpperCase().replace(/\s+/g, '_') })} /></td>
                  <td style={td}><input style={input} value={r.name || ''} onChange={e => updateRole(i, { name: e.target.value })} /></td>
                  <td style={td}><input style={input} type="number" value={r.rank} onChange={e => updateRole(i, { rank: parseInt(e.target.value || '0', 10) })} /></td>
                  <td style={td}><input type="checkbox" checked={r.is_approver} onChange={e => updateRole(i, { is_approver: e.target.checked })} /></td>
                  <td style={{ ...td, textAlign: 'end' }}>
                    <button className={`${btn} cds--btn--ghost cds--btn--danger`} onClick={() => removeRole(r.code)} disabled={!r.code}>Delete</button>
                  </td>
                </tr>
              ))}
              {roles.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: 'var(--cds-text-disabled)' }} colSpan={5}>No roles yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'workflows' && (
        <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 'var(--cds-spacing-06)' }}>
          <div style={{ ...card, padding: 'var(--cds-spacing-04)' }} className="cds--tile">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-04)' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Workflows</h3>
              <button className={`${btn} cds--btn--secondary`} onClick={addFlow}>+ New</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {flows.map(f => (
                <button key={f.id || 'new'} onClick={() => selectFlow(f.id)} style={{
                  textAlign: 'start', padding: 'var(--cds-spacing-03)', border: 'none', cursor: 'pointer',
                  background: selectedFlowId === f.id ? 'var(--cds-interactive-01)' : 'transparent',
                  color: selectedFlowId === f.id ? '#fff' : 'var(--cds-text-primary)',
                }}>
                  <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{f.name}</div>
                  <div style={{ fontSize: '0.625rem', opacity: 0.8 }}>{f.code} · v{f.version} · {f.status}</div>
                </button>
              ))}
              {flows.length === 0 && <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-disabled)', padding: 'var(--cds-spacing-03)' }}>No workflows.</div>}
            </div>
          </div>

          <div style={{ ...card }} className="cds--tile">
            {(selectedFlow || flows.find(f => !f.id)) ? (
              <>
                <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'grid', gridTemplateColumns: '1fr 2fr 140px 160px', gap: 'var(--cds-spacing-04)', alignItems: 'end' }}>
                  <label style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>CODE<input style={input} value={(selectedFlow || flows.find(f => !f.id))!.code} onChange={e => editSelected({ code: e.target.value.toUpperCase().replace(/\s+/g, '_') })} /></label>
                  <label style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>NAME<input style={input} value={(selectedFlow || flows.find(f => !f.id))!.name} onChange={e => editSelected({ name: e.target.value })} /></label>
                  <label style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>STATUS
                    <select style={input} value={(selectedFlow || flows.find(f => !f.id))!.status} onChange={e => editSelected({ status: e.target.value as WfFlow['status'] })}>
                      {['draft', 'active', 'archived'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className={`${btn} cds--btn--primary`} style={{ flex: 1 }} disabled={saving} onClick={saveFlow}>{saving ? 'Saving…' : 'Save workflow'}</button>
                    {selectedFlow?.id && <button className={`${btn} cds--btn--ghost cds--btn--danger`} onClick={removeFlow}>Delete</button>}
                  </div>
                </div>

                <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                  <div style={{ marginBottom: 'var(--cds-spacing-03)' }}>
                    <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', marginInlineEnd: 'var(--cds-spacing-04)' }}>APPLIES TO LEAVE TYPES:</span>
                    {svc.LEAVE_TYPES.map(lt => {
                      const flow = selectedFlow || flows.find(f => !f.id);
                      const list = flow!.applies_to?.leave_types || [];
                      const on = list.includes(lt);
                      return (
                        <label key={lt} style={{ marginInlineEnd: 'var(--cds-spacing-04)', fontSize: '0.8125rem' }}>
                          <input type="checkbox" checked={on} onChange={() => editSelected({ applies_to: { ...flow!.applies_to, leave_types: on ? list.filter(x => x !== lt) : [...list, lt] } })} /> {lt}
                        </label>
                      );
                    })}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', marginInlineEnd: 'var(--cds-spacing-04)' }}>APPLIES TO REQUEST TYPES:</span>
                    {reqTypes.map(rt => {
                      const flow = selectedFlow || flows.find(f => !f.id);
                      const list = flow!.applies_to?.request_types || [];
                      const on = list.includes(rt.code);
                      return (
                        <label key={rt.code} style={{ marginInlineEnd: 'var(--cds-spacing-04)', fontSize: '0.8125rem' }}>
                          <input type="checkbox" checked={on} onChange={() => editSelected({ applies_to: { ...flow!.applies_to, request_types: on ? list.filter(x => x !== rt.code) : [...list, rt.code] } })} /> {rt.code}
                        </label>
                      );
                    })}
                  </div>
                  <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-disabled)' }}> (none selected = catch-all)</span>
                </div>

                <div style={{ padding: 'var(--cds-spacing-05)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-04)' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Steps</h4>
                    <button className={`${btn} cds--btn--secondary`} onClick={addStep}>+ Add step</button>
                  </div>

                  {steps.map((s, i) => {
                    const ruleDesc = RULE_OPTIONS.find(o => o.value === s.rule);
                    const skipRoles: string[] = s.rule_config?.skip_for_requester_role || [];
                    return (
                      <div key={i} style={{ border: '1px solid var(--cds-border-subtle)', borderRadius: '8px', padding: 'var(--cds-spacing-04)', marginBottom: 'var(--cds-spacing-04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-03)' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
                            Step {i}{s.code ? <span>&nbsp;·&nbsp;</span> : null}{s.code || <em>no code</em>}
                          </span>
                          <span style={{ whiteSpace: 'nowrap' }}>
                            <button className={`${btn} cds--btn--ghost`} onClick={() => moveStep(i, -1)} disabled={i === 0}>↑</button>
                            <button className={`${btn} cds--btn--ghost`} onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>↓</button>
                            <button className={`${btn} cds--btn--ghost cds--btn--danger`} onClick={() => removeStep(i)}>Delete</button>
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--cds-spacing-04)', alignItems: 'end' }}>
                          <label style={field}>Code<input style={input} value={s.code} onChange={e => updateStep(i, { code: e.target.value.toUpperCase().replace(/\s+/g, '_') })} /></label>
                          <label style={field}>Name<input style={input} value={s.name} onChange={e => updateStep(i, { name: e.target.value })} /></label>
                          <label style={field}>Actor role
                            <select style={input} value={s.actor_role_code || ''} onChange={e => updateStep(i, { actor_role_code: e.target.value || null })}>
                              <option value="">— none —</option>
                              {roles.map(r => <option key={r.code} value={r.code}>{r.code}</option>)}
                            </select>
                          </label>
                          <label style={field}>Type
                            <select style={input} value={s.step_type} onChange={e => updateStep(i, { step_type: e.target.value as StepType })}>
                              {STEP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </label>
                          <label style={field}>Who acts
                            <select style={input} value={s.rule} onChange={e => updateStep(i, { rule: e.target.value as ApproverRule })}>
                              {RULE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                          </label>
                        </div>

                        <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)', margin: '8px 0 0' }}>{ruleDesc?.help}</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 130px 130px auto', gap: 'var(--cds-spacing-04)', alignItems: 'end', marginTop: 'var(--cds-spacing-04)' }}>
                          <div>
                            <span style={{ ...field, marginBottom: '6px' }}>Skip when requester holds (optional)</span>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                              {roles.map(r => {
                                const on = skipRoles.includes(r.code);
                                return (
                                  <label key={r.code} style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--cds-text-primary)' }}>
                                    <input type="checkbox" checked={on} onChange={() => updateStep(i, {
                                      rule_config: { ...s.rule_config, skip_for_requester_role: on ? skipRoles.filter(x => x !== r.code) : [...skipRoles, r.code] },
                                    })} /> {r.code}
                                  </label>
                                );
                              })}
                              {roles.length === 0 && <span style={{ fontSize: '0.6875rem', color: 'var(--cds-text-disabled)' }}>No roles defined yet.</span>}
                            </div>
                          </div>
                          <label style={field}>Min days<input style={input} type="number" value={s.condition?.min_days ?? ''} onChange={e => updateStep(i, { condition: { ...s.condition, min_days: e.target.value === '' ? undefined : parseInt(e.target.value, 10) } })} /></label>
                          <label style={field}>Max days<input style={input} type="number" value={s.condition?.max_days ?? ''} onChange={e => updateStep(i, { condition: { ...s.condition, max_days: e.target.value === '' ? undefined : parseInt(e.target.value, 10) } })} /></label>
                          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', paddingBottom: 4 }}>
                            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--cds-text-primary)' }}>
                              <input type="checkbox" checked={s.is_required} onChange={e => updateStep(i, { is_required: e.target.checked })} /> Required
                            </label>
                            <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--cds-text-primary)' }}>
                              <input type="checkbox" checked={s.allow_self} onChange={e => updateStep(i, { allow_self: e.target.checked })} /> Allow self
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {steps.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--cds-text-disabled)', padding: 'var(--cds-spacing-07)' }}>No steps. Add the approval chain.</div>
                  )}

                  <div style={{ marginTop: 'var(--cds-spacing-05)', paddingTop: 'var(--cds-spacing-04)', borderTop: '1px solid var(--cds-border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 6 }}>How “Who acts” works</div>
                    <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.6875rem', color: 'var(--cds-text-secondary)', lineHeight: 1.7 }}>
                      {RULE_OPTIONS.map(o => <li key={o.value}><strong>{o.label}</strong> — {o.help}</li>)}
                      <li><strong>Skip when requester holds</strong> — bypasses this step when the requester holds one of the flagged roles (e.g. a CEO's own leave skips the manager step).</li>
                    </ul>
                    <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', margin: 'var(--cds-spacing-04) 0 0' }}>
                      Steps that end up with <strong>no eligible actor</strong> (e.g. the requester is the only role holder) are automatically skipped and never block the request.
                      Saving an <strong>active</strong> workflow creates a new version; requests already in progress keep the version they started on.
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ padding: 'var(--cds-spacing-09)', textAlign: 'center', color: 'var(--cds-text-disabled)' }}>Select or create a workflow.</div>
            )}
          </div>
        </div>
      )}

      {tab === 'assignments' && (
        <div style={card} className="cds--tile">
          <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Role Assignments</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              Map people to the workflow roles. Multiple people may hold a role (any-one acts). A department scope must
              match the person's <code>la_users.department</code> exactly (e.g. “IT Services”), or leave it blank to act for everyone.
            </p>
          </div>
          <div style={{ padding: 'var(--cds-spacing-05)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 'var(--cds-spacing-04)', alignItems: 'end', borderBottom: '1px solid var(--cds-border-subtle)' }}>
            <label style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>USER
              <select style={input} value={newAssignment.userId} onChange={e => setNewAssignment(v => ({ ...v, userId: e.target.value }))}>
                <option value="">Select person…</option>
                {laUsers.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>ROLE
              <select style={input} value={newAssignment.roleCode} onChange={e => setNewAssignment(v => ({ ...v, roleCode: e.target.value }))}>
                <option value="">Select role…</option>
                {roles.map(r => <option key={r.code} value={r.code}>{r.code}</option>)}
              </select>
            </label>
            <label style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>DEPT SCOPE (optional)
              <input style={input} value={newAssignment.scope} onChange={e => setNewAssignment(v => ({ ...v, scope: e.target.value }))} />
            </label>
            <button className={`${btn} cds--btn--primary`} onClick={addAssignment}>Assign</button>
          </div>
          <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
            <thead><tr><th style={th}>Person</th><th style={th}>Role</th><th style={th}>Dept scope</th><th style={th}></th></tr></thead>
            <tbody>
              {userRoles.map(ur => (
                <tr key={ur.id}>
                  <td style={td}>{userName(ur.user_id)}</td>
                  <td style={td}><span className="cds--tag cds--tag--blue cds--tag--sm">{ur.role_code}</span></td>
                  <td style={td}>{ur.department_scope || '—'}</td>
                  <td style={{ ...td, textAlign: 'end' }}><button className={`${btn} cds--btn--ghost cds--btn--danger`} onClick={() => dropAssignment(ur.id)}>Remove</button></td>
                </tr>
              ))}
              {userRoles.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: 'var(--cds-text-disabled)' }} colSpan={4}>No assignments yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'org' && (
        <div style={card} className="cds--tile">
          <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Organization — DLM coverage</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              Every active employee must have a direct line manager (their department / unit manager) — the DLM step routes to it.
              The CEO is exempt. Pick each person's manager below.
            </p>
          </div>
          <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', gap: 'var(--cds-spacing-04)', flexWrap: 'wrap' }}>
            <span className={`cds--tag cds--tag--${missingDlm.length === 0 ? 'green' : 'red'} cds--tag--sm`} style={{ alignSelf: 'center' }}>
              {missingDlm.length === 0 ? `All ${dlm.length - (dlm.find(r => r.role === 'ceo') ? 1 : 0)} employees have a DLM` : `${missingDlm.length} employee(s) missing a DLM`}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)', alignSelf: 'center' }}>
              A missing manager means the DLM step auto-skips for that employee.
            </span>
          </div>
          <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th style={th}>Employee</th>
                <th style={th}>Department</th>
                <th style={th}>Position / role</th>
                <th style={th}>Workflow roles</th>
                <th style={{ ...th, minWidth: 220 }}>Direct manager (DLM)</th>
              </tr>
            </thead>
            <tbody>
              {dlm.map(x => {
                const isCeo = x.role === 'ceo';
                const wfRoles = userRoles.filter(ur => ur.user_id === x.user_id).map(ur => ur.role_code);
                return (
                  <tr key={x.user_id} style={!x.manager_id && !isCeo ? { background: 'var(--cds-support-error-inverse, #fff1f1)' } : undefined}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{x.full_name}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>{x.email}</div>
                    </td>
                    <td style={td}>{x.department || '—'}</td>
                    <td style={td}>{x.position ? `${x.position}` : x.role}</td>
                    <td style={td}>
                      {isCeo && <span className="cds--tag cds--tag--purple cds--tag--sm">CEO</span>}
                      {wfRoles.map(rc => <span key={rc} className="cds--tag cds--tag--blue cds--tag--sm" style={{ marginInlineEnd: 4 }}>{rc}</span>)}
                      {wfRoles.length === 0 && !isCeo && <span style={{ fontSize: '0.6875rem', color: 'var(--cds-text-disabled)' }}>no workflow role</span>}
                    </td>
                    <td style={td}>
                      {isCeo ? (
                        <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Exempt (CEO)</span>
                      ) : (
                        <select style={input} value={x.manager_id || ''} onChange={e => setManager(x, e.target.value)}>
                          <option value="">— none —</option>
                          {dlm.filter(c => c.user_id !== x.user_id).map(c => (
                            <option key={c.user_id} value={c.user_id}>{c.full_name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
              {dlm.length === 0 && <tr><td style={{ ...td, textAlign: 'center', color: 'var(--cds-text-disabled)' }} colSpan={5}>No roster yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'orgtree' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
          <div style={card} className="cds--tile">
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Org tree — entities & heads</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                Maintained by HR/Admin. Chain: <b>division → department → supervision → unit</b> (max 4 levels).
                Each entity has a head; each employee is placed in a unit/supervision (leaf). The engine’s
                <code> department_head</code> / <code>unit_head</code> / <code>supervision_head</code> /
                <code>division_head</code> rules read these — edits apply to new requests (in-flight steps stay frozen).
              </p>
            </div>
            <div style={{ padding: 'var(--cds-spacing-05)', display: 'grid', gridTemplateColumns: '1fr 1fr 1.4fr 1.4fr 1fr', gap: 'var(--cds-spacing-04)', alignItems: 'end', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <label style={field}>KIND
                <select style={input} value={orgDraft.kind}
                  onChange={e => setOrgDraft(v => ({ ...v, kind: e.target.value as OrgKind }))}>
                  <option value="division">Division</option>
                  <option value="department">Department</option>
                  <option value="supervision">Supervision</option>
                  <option value="unit">Unit</option>
                </select>
              </label>
              <label style={field}>CODE
                <input style={input} value={orgDraft.code} placeholder="IT"
                  onChange={e => setOrgDraft(v => ({ ...v, code: e.target.value }))} />
              </label>
              <label style={field}>NAME
                <input style={input} value={orgDraft.name} placeholder="IT Services"
                  onChange={e => setOrgDraft(v => ({ ...v, name: e.target.value }))} />
              </label>
              <label style={field}>PARENT (unless division)
                <select style={input} value={orgDraft.parentId}
                  onChange={e => setOrgDraft(v => ({ ...v, parentId: e.target.value }))}>
                  <option value="">{orgDraft.kind === 'division' ? '— root —' : '— pick parent —'}</option>
                  {orgUnits.filter(p => CHILD_KINDS[p.kind].includes(orgDraft.kind)).map(p =>
                    <option key={p.id} value={p.id}>{orgPath(p)}</option>)}
                </select>
              </label>
              <button className={`${btn} cds--btn--primary`} disabled={saving} onClick={addOrg}>Add entity</button>
            </div>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Entity</th>
                  <th style={th}>Code</th>
                  <th style={th}>Parent</th>
                  <th style={th}>Head (workflow actor)</th>
                  <th style={th}>Active</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {orgUnits.filter(x => !x.parent_id).map(u => renderOrgNode(u, 0))}
                {orgUnits.length === 0 && (
                  <tr><td style={{ ...td, textAlign: 'center', color: 'var(--cds-text-disabled)' }} colSpan={6}>
                    No entities yet — add a division above and build the tree.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={card} className="cds--tile">
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Membership — place employees in their leaf entity</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                Leaf entities are units/supervisions. This drives the entity-head actor rules.
              </p>
            </div>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Employee</th>
                  <th style={th}>Department</th>
                  <th style={{ ...th, minWidth: 240 }}>Leaf entity</th>
                </tr>
              </thead>
              <tbody>
                {laUsers.map(x => (
                  <tr key={x.id}>
                    <td style={td}>
                      <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{x.full_name}</div>
                      <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>{x.email}</div>
                    </td>
                    <td style={td}>{x.department || '—'}</td>
                    <td style={td}>
                      <select style={input} value={x.entity_id || ''} onChange={e => assignEntity(x.id, e.target.value)}>
                        <option value="">— unassigned —</option>
                        {leafUnits.map(u => <option key={u.id} value={u.id}>{orgPath(u)}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    {tab === 'requesttypes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
          <div style={card} className="cds--tile">
            <div style={{ padding: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Request Type Catalog</h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                  The generic engine's request catalog. Each type carries a payload attribute schema (validated on submit),
                  eligibility rules (tenure / once-only / balance), and a finalization action. Flows list these codes under
                  <code> applies_to.request_types</code>.
                </p>
              </div>
              <button className={`${btn} cds--btn--secondary`} onClick={addRt}>+ Add type</button>
            </div>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={th}>Code</th>
                  <th style={th}>Name</th>
                  <th style={{ ...th, width: 80 }}>Active</th>
                  <th style={{ ...th, width: 130 }}>Finalization</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {reqTypes.map((t, i) => (
                  <tr key={t.id || `new-${i}`}>
                    <td style={td}>
                      <input style={{ ...input, width: 130 }} value={t.code}
                        onChange={e => patchRt(i, { code: e.target.value.toUpperCase().replace(/\s+/g, '_') })} />
                    </td>
                    <td style={td}><input style={{ ...input, width: 200 }} value={t.name}
                      onChange={e => patchRt(i, { name: e.target.value })} /></td>
                    <td style={td}><input type="checkbox" checked={t.active}
                      onChange={e => patchRt(i, { active: e.target.checked })} /></td>
                    <td style={td}>
                      <span className="cds--tag cds--tag--sm" style={{ background: 'var(--cds-layer)', color: 'var(--cds-text-secondary)' }}>
                        {String(t.finalization?.action || 'none')}
                      </span>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button className={`${btn} cds--btn--tertiary`} onClick={() => openRtJson(t)}>Edit rules</button>
                      <button className={`${btn} cds--btn--primary`} disabled={saving} onClick={() => saveRt(t)}>{saving ? '…' : 'Save'}</button>
                      <button className={`${btn} cds--btn--ghost cds--btn--danger`} onClick={() => removeRt(t)}>Del</button>
                    </td>
                  </tr>
                ))}
                {reqTypes.length === 0 && (
                  <tr><td style={{ ...td, textAlign: 'center', color: 'var(--cds-text-disabled)' }} colSpan={5}>
                    No request types yet — add one above.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {rtEditor && (
            <div style={card} className="cds--tile">
              <div style={{ padding: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                <div>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Rules editor — {rtEditor.code}</h4>
                  <p style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)', marginTop: 4 }}>
                    Paste valid JSON. The three packs below are saved together when you press Save on the type's row.
                  </p>
                </div>
                <button className={`${btn} cds--btn--ghost`} onClick={() => setRtEditor(null)}>Close</button>
              </div>
              <div style={{ padding: 'var(--cds-spacing-05)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--cds-spacing-04)', alignItems: 'start' }}>
                {([
                  ['payload_schema', 'payload_schema', '{"attributes":[{"key":"amount","type":"number","min":100,"max":1000000,"required":true}],"derived":{}}'],
                  ['eligibility', 'eligibility', '{"min_tenure_months":24,"max_uses":1,"count_statuses":["APPROVED"],"balance_required":true,"balance_keys":["Annual"]}'],
                  ['finalization', 'finalization', '{"action":"balance"|"loan"|"none"}'],
                ] as const).map(([key, label, example]) => (
                  <label key={key} style={{ ...field, alignItems: 'stretch' }}>
                    <span>{label}</span>
                    <textarea style={{
                      width: '100%', minHeight: 170, background: 'var(--cds-field-01)', color: 'var(--cds-text-primary)',
                      border: '1px solid var(--cds-border-subtle)', borderRadius: 6, padding: 8,
                      fontFamily: 'monospace', fontSize: '0.6875rem', resize: 'vertical', lineHeight: 1.5,
                    }}
                      value={key === 'payload_schema' ? rtEditor.schema : key === 'eligibility' ? rtEditor.eligibility : rtEditor.finalization}
                      onChange={e => key === 'payload_schema' ? setRtEditor(v => ({ ...v!, schema: e.target.value }))
                        : key === 'eligibility' ? setRtEditor(v => ({ ...v!, eligibility: e.target.value }))
                        : setRtEditor(v => ({ ...v!, finalization: e.target.value }))}
                    />
                    <span style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.625rem', color: 'var(--cds-text-secondary)', whiteSpace: 'pre-wrap' }}>
                      e.g. {example}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'reassignment' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
          <div style={card} className="cds--tile">
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Pending Step Reassignment</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                Reassign open (PENDING/WAITING) workflow steps from one user to another. If no target user is
                specified, steps are re-resolved by their rule (e.g. new manager, new entity heads). Empty
                results are auto-skipped. Applies to both legacy leave and generic requests.
              </p>
            </div>
            <div style={{ padding: 'var(--cds-spacing-05)', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 'var(--cds-spacing-04)', alignItems: 'end' }}>
              <label style={field}>FROM USER (has open steps)
                <select style={input} value={reassignFrom} onChange={e => setReassignFrom(e.target.value)}>
                  <option value="">— select user —</option>
                  {usersWithOpenSteps.map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                </select>
              </label>
              <label style={field}>TO USER (optional)
                <select style={input} value={reassignTo} onChange={e => setReassignTo(e.target.value)}>
                  <option value="">— re-resolve by rule —</option>
                  {laUsers.filter(u => u.id !== reassignFrom).map(u => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                </select>
              </label>
              <label style={field}>AFFECTED STEPS
                <div style={input} style={{ background: 'var(--cds-field-01)', minHeight: '40px', display: 'flex', alignItems: 'center' }}>
                  {affectedCount > 0 ? (
                    <span style={{ color: 'var(--cds-support-warning)' }}>{affectedCount} step(s) will be reassigned</span>
                  ) : (
                    <span style={{ color: 'var(--cds-text-disabled)' }}>Select a user to see affected steps</span>
                  )}
                </div>
              </label>
              <button className={`${btn} cds--btn--primary`} disabled={saving || !reassignFrom} onClick={runReassign}>
                {saving ? 'Reassigning…' : 'Reassign'}
              </button>
            </div>
          </div>

          {reassignResult && reassignResult.length > 0 && (
            <div style={card} className="cds--tile">
              <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Reassignment Result</h3>
              </div>
              <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={th}>Request</th>
                    <th style={th}>Step</th>
                    <th style={th}>Code</th>
                    <th style={th}>From</th>
                    <th style={th}>To</th>
                    <th style={th}>Status</th>
                    <th style={th}>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {reassignResult.map((r, i) => (
                    <tr key={i}>
                      <td style={td}><span style={{ fontSize: '0.625rem' }}>{String(r.request_id).slice(0, 8)}…</span></td>
                      <td style={td}><span style={{ fontSize: '0.75rem' }}>{r.step_order}</span></td>
                      <td style={td}><span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{r.code}</span></td>
                      <td style={td}><span style={{ fontSize: '0.625rem' }}>{String(r.from_user).slice(0, 8)}…</span></td>
                      <td style={td}><span style={{ fontSize: '0.625rem' }}>{r.to_user ? String(r.to_user).slice(0, 8) + '…' : '—'}</span></td>
                      <td style={td}><span style={{ fontSize: '0.625rem', textTransform: 'uppercase' }}>{r.status}</span></td>
                      <td style={td}><span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>{r.note}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

    </div>
  );
};

export default WorkflowConfig;
