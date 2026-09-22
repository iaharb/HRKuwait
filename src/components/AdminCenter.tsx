import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';
import { supabase, supabaseUrl, supabaseAnonKey } from '../services/supabaseClient.ts';
import { HardwareConfig, AttendanceRecord, OfficeLocation, Announcement, PublicHoliday, DepartmentMetric, ExpenseClaim, ClaimStatus, User } from '../types/types';
import { runAiTask, geminiKey } from '../services/geminiService.ts';
import { UserManagement } from './UserManagement.tsx';

type TableName = 'employees' | 'leave_requests' | 'payroll_runs' | 'public_holidays' | 'office_locations' | 'department_metrics' | 'announcements';

const DataExplorerTab: React.FC = () => {
  const { t } = useTranslation();
  const entities = [
    { id: 'employees', icon: '👥', label: 'Employees', tables: ['employees', 'employee_allowances', 'leave_balances'] },
    { id: 'leave_requests', icon: '📋', label: 'Leave Requests', tables: ['leave_requests', 'leave_history'] },
    { id: 'employee_allowances', icon: '💰', label: 'Allowances', tables: ['employee_allowances'] },
    { id: 'departments', icon: '📊', label: 'Departments', tables: ['departments'] },
    { id: 'leave_balances', icon: '🏖️', label: 'Leave Balances', tables: ['leave_balances'] },
    { id: 'leave_history', icon: '📜', label: 'Leave Audit Trail', tables: ['leave_history'] },
    { id: 'payroll_runs', icon: '💳', label: 'Payroll Runs', tables: ['payroll_runs'] },
    { id: 'expense_claims', icon: '🧾', label: 'Expense Claims', tables: ['expense_claims', 'expense_claim_history'] },
    { id: 'attendance', icon: '📅', label: 'Attendance', tables: ['attendance'] },
  ];

  const [explorerEntity, setExplorerEntity] = React.useState(entities[0]);
  const [explorerData, setExplorerData] = React.useState<any[]>([]);
  const [explorerLoading, setExplorerLoading] = React.useState(false);
  const [explorerSearch, setExplorerSearch] = React.useState('');
  const [selectedRow, setSelectedRow] = React.useState<any | null>(null);
  const [detailData, setDetailData] = React.useState<{ leaveHistory?: any[]; leaveBalances?: any[]; allowances?: any[] }>({});
  const [detailLoading, setDetailLoading] = React.useState(false);

  const loadEntity = async (entity: typeof entities[0]) => {
    setExplorerEntity(entity);
    setSelectedRow(null);
    setExplorerSearch('');
    setExplorerLoading(true);
    try {
      if (!supabase) return;
      let primaryTable = entity.tables[0];
      let select = '*';
      if (entity.id === 'employees') select = '*, employee_allowances(*), leave_balances(*)';
      if (entity.id === 'leave_requests') select = '*, leave_history(*)';
      const { data } = await supabase.from(primaryTable).select(select).limit(200);
      setExplorerData(data || []);
    } catch (e) {
      setExplorerData([]);
    } finally {
      setExplorerLoading(false);
    }
  };

  React.useEffect(() => { loadEntity(entities[0]); }, []);

  React.useEffect(() => {
    if (!selectedRow || !supabase) { setDetailData({}); return; }
    setDetailLoading(true);
    const load = async () => {
      const d: typeof detailData = {};
      if (explorerEntity.id === 'employees') {
        const [bal, allow] = await Promise.all([
          supabase.from('leave_balances').select('*').eq('employee_id', selectedRow.id),
          supabase.from('employee_allowances').select('*').eq('employee_id', selectedRow.id),
        ]);
        d.leaveBalances = bal.data || [];
        d.allowances = allow.data || [];
      }
      if (explorerEntity.id === 'leave_requests') {
        const hist = await supabase.from('leave_history').select('*').eq('leave_request_id', selectedRow.id).order('created_at');
        d.leaveHistory = hist.data || [];
      }
      setDetailData(d);
      setDetailLoading(false);
    };
    load();
  }, [selectedRow?.id]);

  const filteredExplorer = React.useMemo(() => {
    const q = explorerSearch.toLowerCase();
    if (!q) return explorerData;
    return explorerData.filter(row =>
      Object.values(row).some(v => v && String(v).toLowerCase().includes(q))
    );
  }, [explorerData, explorerSearch]);

  const columns = explorerData.length > 0
    ? Object.keys(explorerData[0]).filter(k => {
      const v = explorerData[0][k];
      return !Array.isArray(v) && typeof v !== 'object';
    }).slice(0, 8)
    : [];

  const exportCsv = () => {
    const csv = [columns.join(','), ...filteredExplorer.map(r => columns.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${explorerEntity.id}_export.csv`;
    a.click();
  };

  return (
    <div style={{ display: 'flex', gap: 'var(--cds-spacing-05)', height: '600px', padding: 'var(--cds-spacing-05)', background: 'var(--cds-layer-01)' }}>
      {/* Entity Sidebar */}
      <div className="cds--tile" style={{ width: '220px', padding: 0, display: 'flex', flexDirection: 'column', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', borderRadius: 0 }}>
        <div style={{ padding: 'var(--cds-spacing-04)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
          <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registry Entities</p>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {entities.map(e => (
            <button
              key={e.id}
              onClick={() => loadEntity(e)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 'var(--cds-spacing-04) var(--cds-spacing-05)',
                border: 'none',
                background: explorerEntity.id === e.id ? 'var(--cds-layer-01)' : 'transparent',
                borderLeft: explorerEntity.id === e.id ? '3px solid var(--cds-interactive-01)' : '3px solid transparent',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: explorerEntity.id === e.id ? 'var(--cds-interactive-01)' : 'var(--cds-text-primary)',
                transition: 'all 0.2s'
              }}
            >
              <span style={{ marginRight: 'var(--cds-spacing-03)', opacity: explorerEntity.id === e.id ? 1 : 0.6 }}>{e.icon}</span>
              {e.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="cds--tile" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', borderRadius: 0 }}>
        <div style={{ padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', gap: 'var(--cds-spacing-04)', alignItems: 'center' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-interactive-01)' }}>{explorerEntity.label.toUpperCase()}</span>
          <input 
            className="cds--text-input"
            placeholder={`Filter ${explorerEntity.label.toLowerCase()}...`}
            style={{ flex: 1, height: '32px', fontSize: '0.75rem', background: 'var(--cds-background)' }}
            value={explorerSearch}
            onChange={e => setExplorerSearch(e.target.value)}
          />
          <button onClick={exportCsv} className="cds--btn cds--btn--ghost cds--btn--sm">CSV Export</button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
            <thead>
              <tr>
                {columns.map(c => <th key={c}>{c.replace(/_/g, ' ')}</th>)}
              </tr>
            </thead>
            <tbody>
              {explorerLoading ? (
                <tr><td colSpan={columns.length || 1} style={{ textAlign: 'center', padding: 'var(--cds-spacing-08)' }}>Accessing registry...</td></tr>
              ) : filteredExplorer.map((row, i) => (
                <tr 
                  key={i} 
                  onClick={() => setSelectedRow(prev => prev?.id === row.id ? null : row)}
                  style={{ cursor: 'pointer', background: selectedRow?.id === row.id ? 'var(--cds-layer-01)' : 'transparent' }}
                >
                  {columns.map(c => <td key={c} style={{ fontSize: '0.75rem' }}>{row[c] !== null && row[c] !== undefined ? String(row[c]) : '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Panel */}
      {selectedRow && (
        <div className="cds--tile" style={{ width: '320px', display: 'flex', flexDirection: 'column', padding: 0, background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', borderRadius: 0 }}>
          <div style={{ padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', background: 'var(--cds-layer-01)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Registry Properties</span>
            <button onClick={() => setSelectedRow(null)} style={{ background: 'none', border: 'none', color: 'var(--cds-text-secondary)', cursor: 'pointer', fontSize: '0.875rem' }}>✕</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--cds-spacing-05)' }}>
            {Object.entries(selectedRow)
              .filter(([, v]) => !Array.isArray(v) && typeof v !== 'object')
              .map(([k, v]: any) => (
                <div key={k} style={{ marginBottom: 'var(--cds-spacing-04)', paddingBottom: 'var(--cds-spacing-03)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                  <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: '4px' }}>{k.replace(/_/g, ' ')}</p>
                  <p style={{ fontSize: '0.75rem', fontWeight: 400, wordBreak: 'break-all', fontFamily: 'monospace' }}>{v !== null && v !== undefined ? String(v) : '—'}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ClaimsManagerTab: React.FC = () => {
  const { notify } = useNotifications();
  const [claims, setClaims] = useState<ExpenseClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem('app_user');
    if (raw) setUser(JSON.parse(raw));
    loadClaims();
  }, []);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const data = await dbService.getExpenseClaims();
      setClaims(data);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (claim: ExpenseClaim, action: 'Approve' | 'Reject') => {
    if (!user) return;
    let nextStatus: ClaimStatus = claim.status;
    if (action === 'Reject') {
      nextStatus = 'Rejected';
    } else {
      if (claim.status === 'Pending_Manager') nextStatus = 'Pending_HR';
      else if (claim.status === 'Pending_HR') nextStatus = 'Pending_Payroll';
      else if (claim.status === 'Pending_Payroll') nextStatus = 'Approved';
      else if (claim.status === 'Approved') nextStatus = 'Paid';
    }
    try {
      await dbService.updateExpenseClaimStatus(claim.id, user, nextStatus, `${action}ed by ${user.role}`);
      notify("Success", `Claim ${action.toLowerCase()}ed.`, "success");
      loadClaims();
    } catch (e) {
      notify("Error", "Failed to update claim status.", "error");
    }
  };

  return (
    <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', borderRadius: 0 }}>
      <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Expense Claims Management</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Multi-stage financial approval ledger</p>
        </div>
        <button onClick={loadClaims} className="cds--btn cds--btn--ghost cds--btn--sm">SYNC_LEDGER 🔄</button>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="cds--data-table cds--data-table--compact cds--data-table--short cds--data-table--zebra">
          <thead>
            <tr>
              <th style={{ paddingLeft: 'var(--cds-spacing-05)' }}>Node_ID / Member</th>
              <th>Transaction_Context</th>
              <th style={{ textAlign: 'right' }}>Credit_Amount</th>
              <th style={{ textAlign: 'center' }}>Quantum_Status</th>
              <th style={{ textAlign: 'right', paddingRight: 'var(--cds-spacing-05)' }}>Operations</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--cds-spacing-08)', fontStyle: 'italic', color: 'var(--cds-text-secondary)' }}>Synchronizing encrypted registry...</td></tr>
            ) : claims.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--cds-spacing-08)', color: 'var(--cds-text-disabled)' }}>No active claim nodes found.</td></tr>
            ) : claims.map(c => (
              <tr key={c.id}>
                <td style={{ paddingLeft: 'var(--cds-spacing-05)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                    <div style={{ width: '24px', height: '24px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                      {c.employeeName[0]}
                    </div>
                    <div>
                      <p style={{ fontWeight: 600, fontSize: '0.875rem' }}>{c.employeeName}</p>
                      <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{c.date}</p>
                    </div>
                  </div>
                </td>
                <td>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>{c.merchant}</p>
                  <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{c.category}</p>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--cds-interactive-01)', fontSize: '0.875rem' }}>
                  {c.amount.toFixed(3)} <span style={{ fontSize: '0.625rem', opacity: 0.7 }}>KWD</span>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`cds--tag ${
                    c.status === 'Approved' || c.status === 'Paid' ? 'cds--tag--green' : 
                    c.status === 'Rejected' ? 'cds--tag--red' : 
                    'cds--tag--cool-gray'
                  }`} style={{ fontSize: '0.625rem', margin: 0 }}>
                    {c.status.toUpperCase().replace(/_/g, ' ')}
                  </span>
                </td>
                <td style={{ textAlign: 'right', paddingRight: 'var(--cds-spacing-05)' }}>
                  {['Pending_Manager', 'Pending_HR', 'Pending_Payroll', 'Approved'].includes(c.status) && (
                    <div style={{ display: 'flex', gap: 'var(--cds-spacing-02)', justifyContent: 'flex-end' }}>
                      <button onClick={() => handleAction(c, 'Approve')} className="cds--btn cds--btn--primary cds--btn--sm">
                        {c.status === 'Approved' ? 'Mark Paid' : 'Authorize'}
                      </button>
                      <button onClick={() => handleAction(c, 'Reject')} className="cds--btn cds--btn--ghost cds--btn--sm" style={{ color: 'var(--cds-text-error)' }}>Abstain</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
const OrganizationStructureTab: React.FC = () => {
  const { t } = useTranslation();
  const { notify } = useNotifications();
  const [subTab, setSubTab] = useState<'orgTree' | 'departments' | 'jobTitles' | 'employeeAssignment' | 'roleAssignments' | 'headsManagers'>('orgTree');
  const [loading, setLoading] = useState(false);
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [jobTitles, setJobTitles] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [laUsers, setLaUsers] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      // In a real implementation, these would call orgStructureService
      // For now, we show the structure with placeholder data
      const [units, titles, emps, roles, users] = await Promise.all([
        fetch('/api/org/units').then(r => r.json()).catch(() => []),
        fetch('/api/org/job-titles').then(r => r.json()).catch(() => []),
        fetch('/api/org/employee-assignments').then(r => r.json()).catch(() => []),
        fetch('/api/org/user-roles').then(r => r.json()).catch(() => []),
        fetch('/api/org/la-users').then(r => r.json()).catch(() => []),
      ]);
      setOrgUnits(units || []);
      setJobTitles(titles || []);
      setEmployees(emps || []);
      setUserRoles(roles || []);
      setLaUsers(users || []);
    } catch (e: any) {
      console.error('Load org structure failed:', e);
    } finally {
      setLoading(false);
    }
  };

  // Placeholder implementations - in production these call orgStructureService
  const saveOrgUnit = async (unit: any) => {
    flash('ok', `Saved ${unit.code}`);
  };
  const deleteOrgUnit = async (id: string) => {
    flash('ok', 'Deleted');
  };
  const saveJobTitle = async (jt: any) => {
    flash('ok', `Saved ${jt.code}`);
  };
  const deleteJobTitle = async (id: string) => {
    flash('ok', 'Deleted');
  };
  const updateEmployeeAssignment = async (userId: string, patch: any) => {
    flash('ok', 'Updated');
  };
  const setDlmManager = async (userId: string, managerId: string | null) => {
    flash('ok', 'Manager updated');
  };
  const setEntityHead = async (entityId: string, headUserId: string | null) => {
    flash('ok', 'Head updated');
  };
  const runReassign = async (fromId: string, toId: string | null) => {
    flash('ok', 'Reassigned');
  };

  const subTabs = [
    { id: 'orgTree', label: 'Org Tree', icon: '🌳' },
    { id: 'departments', label: 'Departments & Units', icon: '🏢' },
    { id: 'jobTitles', label: 'Job Titles', icon: '📋' },
    { id: 'employeeAssignment', label: 'Employee Assignment', icon: '👥' },
    { id: 'roleAssignments', label: 'Role Assignments', icon: '🔗' },
    { id: 'headsManagers', label: 'Heads & Managers', icon: '👑' },
  ] as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)', padding: 'var(--cds-spacing-05)', animation: 'fade-in 0.5s ease' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Organization Structure</h2>
          <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>
            Unified management of org tree, job titles, employee assignments, and workflow roles.
          </p>
        </div>
        <button onClick={loadAll} className="cds--btn cds--btn--ghost cds--btn--sm" disabled={loading}>🔄 Refresh</button>
      </header>

      {msg && (
        <div className="cds--inline-notification" style={{ padding: 'var(--cds-spacing-04)', background: msg.type === 'ok' ? 'var(--cds-support-success-inverse)' : 'var(--cds-support-error-inverse)', color: msg.type === 'ok' ? '#0e6027' : '#a2191f', fontSize: '0.8125rem' }}>
          {msg.text}
        </div>
      )}

      <div className="cds--tabs" style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <ul className="cds--tabs__nav" style={{ display: 'flex', gap: '2px', padding: 0, margin: 0, listStyle: 'none', overflowX: 'auto' }}>
          {subTabs.map(tab => (
            <li key={tab.id} style={{ flex: '1 0 auto', minWidth: '140px' }}>
              <button
                onClick={() => setSubTab(tab.id as any)}
                className={`cds--tabs__nav-link ${subTab === tab.id ? 'cds--tabs__nav-link--selected' : ''}`}
                style={{
                  width: '100%', padding: '0 var(--cds-spacing-05)', fontSize: '0.75rem',
                  fontWeight: subTab === tab.id ? 600 : 400,
                  background: subTab === tab.id ? 'var(--cds-layer-01)' : 'transparent',
                  color: subTab === tab.id ? 'var(--cds-interactive-01)' : 'var(--cds-text-secondary)',
                  border: 'none', borderBottom: subTab === tab.id ? '2px solid var(--cds-interactive-01)' : '2px solid transparent',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 'var(--cds-spacing-03)', height: '40px', transition: 'all 0.2s ease'
                }}
              >
                <span style={{ opacity: subTab === tab.id ? 1 : 0.6 }}>{tab.icon}</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tab.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {loading && (
        <div style={{ padding: 'var(--cds-spacing-10)', textAlign: 'center', color: 'var(--cds-text-secondary)' }}>
          <div className="cds--loading cds--loading--small" style={{ margin: '0 auto var(--cds-spacing-05) auto' }}></div>
          Loading organization structure...
        </div>
      )}

      {!loading && subTab === 'orgTree' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
          <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Organization Tree</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                Drag-drop to reorder. Division → Department → Supervision → Unit (max 4 levels).
              </p>
            </div>
            <div style={{ padding: 'var(--cds-spacing-05)' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', fontStyle: 'italic' }}>
                Visual tree editor — connects to orgStructureService.createOrgUnit / updateOrgUnit / deleteOrgUnit
              </div>
            </div>
          </div>
        </div>
      )}

      {!loading && subTab === 'departments' && (
        <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
          <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Departments & Units</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Manage departments, supervisions, units, and their heads.</p>
          </div>
          <div style={{ padding: 'var(--cds-spacing-05)' }}>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Entity</th><th>Code</th><th>Kind</th><th>Parent</th><th>Head</th><th>Employees</th><th>Units</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgUnits.filter(u => u.kind !== 'division').map(u => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td><code>{u.code}</code></td>
                    <td><span className="cds--tag cds--tag--sm">{u.kind}</span></td>
                    <td>{u.parent_id || '—'}</td>
                    <td>{u.head_name || '—'}</td>
                    <td>{u.employee_count || 0}</td>
                    <td>{u.unit_count || 0}</td>
                    <td>
                      <button className="cds--btn cds--btn--ghost cds--btn--sm" onClick={() => setEntityHead(u.id, null)}>Set Head</button>
                      <button className="cds--btn cds--btn--ghost cds--btn--sm cds--btn--danger" onClick={() => deleteOrgUnit(u.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && subTab === 'jobTitles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
          <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ padding: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Job Title Catalog</h3>
              <button className="cds--btn cds--btn--secondary" onClick={() => { /* open modal */ }}>+ Add Job Title</button>
            </div>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead>
                <tr><th>Code</th><th>Name</th><th>Arabic</th><th>Department</th><th>Grade</th><th>Active</th><th>Employees</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {jobTitles.map(jt => (
                  <tr key={jt.id}>
                    <td><code>{jt.code}</code></td>
                    <td>{jt.name}</td>
                    <td>{jt.name_arabic || '—'}</td>
                    <td>{jt.department_name || '—'}</td>
                    <td>{jt.grade || '—'}</td>
                    <td><input type="checkbox" checked={jt.active} onChange={() => saveJobTitle({ ...jt, active: !jt.active })} /></td>
                    <td>{jt.employee_count || 0}</td>
                    <td><button className="cds--btn cds--btn--ghost cds--btn--sm cds--btn--danger" onClick={() => deleteJobTitle(jt.id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && subTab === 'employeeAssignment' && (
        <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
          <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Employee Assignment</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Assign job title, unit/supervision (leaf), and direct manager. Department & division auto-derived.</p>
          </div>
          <table className="cds--data-table cds--data-table--short cds--data-table--zebra" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Employee</th><th>Job Title</th><th>Unit / Supervision</th><th>Department</th><th>Division</th><th>DLM (Manager)</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(e => (
                <tr key={e.id}>
                  <td><strong>{e.full_name}</strong><br/><small>{e.email}</small></td>
                  <td>{e.job_title_name || '—'}</td>
                  <td>{e.entity_name || '—'}</td>
                  <td>{e.department_name || '—'}</td>
                  <td>{e.division_name || '—'}</td>
                  <td>
                    <select style={{ width: '180px', height: '32px', fontSize: '0.75rem' }} value={e.manager_id || ''} onChange={e => setDlmManager(e.id, e.target.value || null)}>
                      <option value="">— no manager —</option>
                      {laUsers.filter(u => u.id !== e.id).map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                    </select>
                  </td>
                  <td>
                    <button className="cds--btn cds--btn--ghost cds--btn--sm" onClick={() => { /* open modal */ }}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && subTab === 'roleAssignments' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
          <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Workflow Role Assignments</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Assign users to workflow roles (EMP, DM, HR, FD, CEO, etc.) with optional department scope.</p>
            </div>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead><tr><th>User</th><th>Role</th><th>Department Scope</th><th>Actions</th></tr></thead>
              <tbody>
                {userRoles.map(ur => (
                  <tr key={ur.id}>
                    <td>{ur.user_name || ur.user_id}</td>
                    <td><code>{ur.role_code}</code></td>
                    <td>{ur.department_scope || 'Organization-wide'}</td>
                    <td><button className="cds--btn cds--btn--ghost cds--btn--sm cds--btn--danger">Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Pending Step Reassignment</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                Reassign open workflow steps from one user to another, or re-resolve by rule.
              </p>
            </div>
            <div style={{ padding: 'var(--cds-spacing-05)', display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 'var(--cds-spacing-04)', alignItems: 'end' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>FROM USER</span>
                <select style={{ height: '36px', fontSize: '0.75rem' }}>
                  <option value="">— select —</option>
                  {laUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.625rem', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>TO USER (optional)</span>
                <select style={{ height: '36px', fontSize: '0.75rem' }}>
                  <option value="">— re-resolve by rule —</option>
                  {laUsers.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </label>
              <button className="cds--btn cds--btn--primary" onClick={() => runReassign('', null)}>Reassign</button>
            </div>
          </div>
        </div>
      )}

      {!loading && subTab === 'headsManagers' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-06)' }}>
          <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>Entity Heads Coverage</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Division, Department, Supervision, Unit heads.</p>
            </div>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead><tr><th>Entity</th><th>Kind</th><th>Head</th><th>Status</th></tr></thead>
              <tbody>
                {orgUnits.map(u => (
                  <tr key={u.id}>
                    <td>{u.name} ({u.code})</td>
                    <td><span className="cds--tag cds--tag--sm">{u.kind}</span></td>
                    <td>{u.head_name || '—'}</td>
                    <td>{u.has_head ? '✅' : '⚠️ Missing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>DLM (Direct Line Manager) Coverage</h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Employees with/without a direct manager assigned.</p>
            </div>
            <table className="cds--data-table cds--data-table--short" style={{ width: '100%' }}>
              <thead><tr><th>Employee</th><th>Department</th><th>Manager</th><th>Status</th></tr></thead>
              <tbody>
                {laUsers.filter(u => u.role !== 'ceo').map(u => (
                  <tr key={u.id}>
                    <td>{u.full_name}</td>
                    <td>{u.department || '—'}</td>
                    <td>{u.manager_name || '—'}</td>
                    <td>{u.has_manager ? '✅' : '⚠️ Missing'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminCenter: React.FC = () => {
  const { notify, confirm } = useNotifications();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const isAr = language === 'ar';
  const [loading, setLoading] = useState(false);
const [activeTab, setActiveTab] = useState<'Integrity' | 'Registry' | 'Claims' 
  | 'Configuration' | 'Worksheet' | 'Connectors' | 'Terminal' | 'Intelligence' | 'MasterData' | 'Maintenance' | 
  'Users' | 'OrganizationStructure'>('Integrity');

  const [selectedTable, setSelectedTable] = useState<TableName>('employees');
  const [tableData, setTableData] = useState<any[]>([]);
  const [connectionReport, setConnectionReport] = useState<any>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);

  const [hwConfig, setHwConfig] = useState<HardwareConfig | null>(null);
  const [syncingHw, setSyncingHw] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);
  const [analyzingOt, setAnalyzingOt] = useState(false);
  const [purgingOt, setPurgingOt] = useState(false);

  // -- Registry Integrity Audit State --
  const [auditStats, setAuditStats] = useState<{ healthy: number; risks: number; alerts: number } | null>(null);
  const [auditRisks, setAuditRisks] = useState<any[]>([]);
  const [auditing, setAuditing] = useState(false);

  // -- Data Fetchers (Defined early to avoid hoisting issues) --
  async function fetchTableData(tableName: TableName) {
    setLoading(true);
    try {
      let data: any[] = [];
      switch (tableName) {
        case 'employees': data = await dbService.getEmployees(); break;
        case 'leave_requests': data = await dbService.getLeaveRequests(); break;
        case 'payroll_runs': data = await dbService.getPayrollRuns(); break;
        case 'public_holidays': data = await dbService.getPublicHolidays(); break;
        case 'office_locations': data = await dbService.getOfficeLocations(); break;
        case 'department_metrics': data = await dbService.getDepartmentMetrics(); break;
        case 'announcements': data = await dbService.getAnnouncements(); break;
      }
      setTableData(data);
    } catch (err) {
      notify(t('fetchFailed'), t('latencyMessage'), "error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchHwConfig() {
    const config = await dbService.getHardwareConfig();
    setHwConfig(config);
  }

  async function fetchWorksheetData() {
    setLoading(true);
    try {
      const logs = await dbService.getAttendanceWorksheet(wsFilter.year, wsFilter.month);
      setWorksheetLogs(logs);
    } catch (err) {
      notify("Sync Failed", "Could not synchronize worksheet data.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function fetchMasterHub() {
    setLoading(true);
    const [nodes, holidays, metrics] = await Promise.all([
      dbService.getOfficeLocations(),
      dbService.getPublicHolidays(),
      dbService.getDepartmentMetrics()
    ]);
    setOfficeNodes(nodes);
    setHolidayRegistry(holidays);
    setDeptMetrics(metrics);
    setLoading(false);
  }

  async function fetchIntelligence() {
    setLoading(true);
    try {
      const data = await dbService.getAnnouncements();
      setAnnouncements(data);
    } finally {
      setLoading(false);
    }
  }

  async function fetchLeaveRuns() {
    try {
      const runs = await dbService.getPayrollRuns();
      setLeaveRuns(runs.filter(r => (r.cycleType === 'Leave_Run' || r.cycle_type === 'Leave_Run')));
    } catch (e) {
      console.error(e);
    }
  }

  // AI Configuration State
  const [aiUrl, setAiUrl] = useState(localStorage.getItem('ai_provider_url') || '');
  const [aiModel, setAiModel] = useState(localStorage.getItem('ai_provider_model') || 'qwen2.5');
  const [aiKey, setAiKey] = useState(localStorage.getItem('ai_provider_key') || '');

  const [terminalSql, setTerminalSql] = useState('-- Registry Terminal\n-- Enter SQL to execute via run_sql()\n\n');

  const [worksheetLogs, setWorksheetLogs] = useState<any[]>([]);
  const [wsFilter, setWsFilter] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    query: ''
  });

  const [rollbackFilter, setRollbackFilter] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    cycle: 'Monthly' as 'Monthly' | 'Bi-Weekly'
  });

  const [leaveRuns, setLeaveRuns] = useState<any[]>([]);
  const [selectedLeaveRunId, setSelectedLeaveRunId] = useState<string>('');

  const [officeNodes, setOfficeNodes] = useState<OfficeLocation[]>([]);
  const [holidayRegistry, setHolidayRegistry] = useState<PublicHoliday[]>([]);
  const [deptMetrics, setDeptMetrics] = useState<DepartmentMetric[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // CRUD State
  const [isCapturing, setIsCapturing] = useState(false);
  const [editItem, setEditItem] = useState<{ type: 'Announcement' | 'Holiday' | 'Office', data: any } | null>(null);

  useEffect(() => {
    if (activeTab === 'Registry') {
      fetchTableData(selectedTable);
    } else if (activeTab === 'Connectors') {
      fetchHwConfig();
    } else if (activeTab === 'Worksheet') {
      fetchWorksheetData();
    } else if (activeTab === 'MasterData') {
      fetchMasterHub();
    } else if (activeTab === 'Intelligence') {
      fetchIntelligence();
    } else if (activeTab === 'Maintenance') {
      fetchLeaveRuns();
    } else if (activeTab === 'Integrity') {
      runRegistryAudit();
    }
  }, [activeTab, selectedTable, wsFilter.month, wsFilter.year]);

  const handleDeleteItem = async (type: 'Announcement' | 'Holiday' | 'Office', id: string) => {
    confirm({
      title: t('deleteRecord'),
      message: t('deleteConfirm'),
      onConfirm: async () => {
        setLoading(true);
        try {
          if (type === 'Announcement') await dbService.deleteAnnouncement(id);
          else if (type === 'Holiday') await dbService.deletePublicHoliday(id);
          else if (type === 'Office') await dbService.deleteOfficeLocation(id);

          notify(t('success'), `${type} ${t('removedFromRegistry')}`, "success");
          if (type === 'Announcement') fetchIntelligence();
          else fetchMasterHub();
        } catch (e) {
          notify(t('critical'), t('deletionFailed'), "error");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleRegistryDelete = async (id: string) => {
    if (selectedTable !== 'employees' && selectedTable !== 'leave_requests' && selectedTable !== 'announcements') {
      notify(t('warning'), t('deleteNotEnabled'), "warning");
      return;
    }

    confirm({
      title: t('confirmDeleteEntry'),
      message: "This will permanently remove the record from the live registry.",
      onConfirm: async () => {
        setLoading(true);
        try {
          if (selectedTable === 'announcements') await dbService.deleteAnnouncement(id);
          else {
            // Generic supabase delete for others if live
            if (supabase) {
              const { error } = await supabase.from(selectedTable).delete().eq('id', id);
              if (error) throw error;
            }
          }
          notify("Registry Updated", "Record purged successfully.", "success");
          fetchTableData(selectedTable);
        } catch (e) {
          notify("Registry Error", "Could not purge record.", "error");
        } finally {
          setLoading(false);
        }
      }
    });
  };



  const handleSyncHardware = async () => {
    setSyncingHw(true);
    try {
      const result = await dbService.syncHardwareAttendance();
      notify(t('success'), `Synchronized ${result.synced} records from biometric node.`, "success");
    } catch (e) {
      notify("Sync Error", "Hardware bridge offline.", "error");
    } finally {
      setSyncingHw(false);
    }
  };

  const handleReconstructHistory = async () => {
    confirm({
      title: "Reconstruct Timeline?",
      message: "This will generate simulated historical records for 2025.",
      onConfirm: async () => {
        setReconstructing(true);
        try {
          const result = await dbService.generateHistoricalAttendance();
          notify("Timeline Patched", `Generated ${result.generated} historical entries.`, "success");
        } catch (e) {
          notify("Error", "Reconstruction failed.", "error");
        } finally {
          setReconstructing(false);
        }
      }
    });
  };

  const handleAnalyzeOvertime = async () => {
    setAnalyzingOt(true);
    try {
      await dbService.calculateOvertimeFromLogs();
      notify(t('success'), 'Daily logs analyzed. Pending OT entries pushed to Payroll Hub.', "success");
    } catch (err: any) {
      notify(t('critical'), err.message || t('unknown'), "error");
    } finally {
      setAnalyzingOt(false);
    }
  };

  const handlePurgeLowOvertime = async () => {
    confirm({
      title: isAr ? "تطهير العمل الإضافي الصغير؟" : "Purge Small Overtime?",
      message: isAr 
        ? "سيتم حذف جميع سجلات العمل الإضافي المعلقة التي تساوي ساعة واحدة أو أقل لتنظيف سير العمل."
        : "This will permanently delete all pending overtime records <= 1 hour to declutter the workflow.",
      onConfirm: async () => {
        setPurgingOt(true);
        try {
          await dbService.purgeLowOvertime();
          notify(t('success'), "Small overtime records purged from registry.", "success");
        } catch (e: any) {
          console.error('Purge Failed:', e);
          notify("Error", e.message || "Registry cleanup failed.", "error");
        } finally {
          setPurgingOt(false);
        }
      }
    });
  };


  const handleRollbackLeaveRun = async () => {
    if (!selectedLeaveRunId) return notify(t('warning'), "Please select a leave payout to reverse", 'warning');
    const run = leaveRuns.find(r => r.id === selectedLeaveRunId);
    if (!run || !run.target_leave_id) return;

    confirm({
      title: "Confirm Leave Payout Reversal?",
      message: `CRITICAL: This will permanently delete the payout record for leave request and any associated journal entries. The leave status will revert to HR_Finalized.`,
      confirmText: "Purge Payout",
      onConfirm: async () => {
        setLoading(true);
        try {
          const adminUser = { id: 'admin', name: 'System Admin', role: 'admin' };
          const res = await dbService.rollbackLeavePayout(selectedLeaveRunId, run.target_leave_id!, adminUser as any);
          if (res.success) {
            notify(t('success'), res.message, 'success');
            fetchLeaveRuns();
            setSelectedLeaveRunId('');
          } else {
            notify(t('warning'), res.message, 'warning');
          }
        } catch (e: any) {
          notify(t('critical'), e.message, "error");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleRollbackPayroll = async () => {
    const periodMonth = `${rollbackFilter.year}-${String(rollbackFilter.month).padStart(2, '0')}`;
    confirm({
      title: isAr ? "تأكيد التراجع عن الرواتب؟" : "Confirm Payroll Rollback?",
      message: isAr
        ? `تحذير: سيتم حذف كافة سجلات الرواتب للفترة ${periodMonth} بشكل نهائي. هذا الإجراء لا يمكن التراجع عنه.`
        : `CRITICAL: This will permanently delete ALL finalized and draft records for period ${periodMonth}. This action is irreversible.`,
      confirmText: isAr ? "حذف السجلات" : "Purge Records",
      onConfirm: async () => {
        setLoading(true);
        try {
          // Use backend RPC — bypasses RLS, handles cascading FK cleanup (JVs, VC, Leaves)
          const { data, error } = await supabase!.rpc('rollback_payroll_run_rpc', { p_period_key: periodMonth });
          if (error) throw error;
          if (data?.success) {
            notify(t('success'), data.message || 'Payroll records purged successfully.', 'success');
          } else {
            notify(t('warning'), data?.message || 'No records found for this period.', 'warning');
          }
        } catch (e: any) {
          notify(t('critical'), e.message, "error");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleRollbackJV = async () => {
    const periodMonth = `${rollbackFilter.year}-${String(rollbackFilter.month).padStart(2, '0')}`;
    confirm({
      title: isAr ? "تأكيد التراجع عن يومية؟" : "Confirm JV Reversal?",
      message: isAr
        ? `تحذير: سيتم حذف كافة قيود اليومية للفترة ${periodMonth} وفتح الشهر مرة أخرى. هذا الإجراء يتطلب مصادقة.`
        : `CRITICAL: This will permanently purge the GL Entries for period ${periodMonth} and unlock the month for re-processing.`,
      confirmText: isAr ? "إلغاء القفل" : "Purge & Unlock",
      onConfirm: async () => {
        setLoading(true);
        try {
          // Step 1: Find all runs for this period
          const { data: runs, error: runsError } = await supabase!.from('payroll_runs').select('id').like('period_key', `${periodMonth}%`);
          if (runsError) throw runsError;

          if (!runs || runs.length === 0) {
            notify(t('warning'), 'No payroll run found for this period to reverse JV.', 'warning');
          } else {
            // Step 2: Use RPC to safely unpin VCs and delete JVs
            const runIds = runs.map(r => r.id);
            // Delete JVs via backend-safe call
            for (const runId of runIds) {
              const { error: jvErr } = await supabase!.rpc('run_sql', {
                sql_query: `DELETE FROM journal_entries WHERE payroll_run_id = '${runId}'; UPDATE variable_compensation SET payroll_run_id = NULL WHERE payroll_run_id = '${runId}';`
              });
              if (jvErr) throw jvErr;
              // Revert run to Draft
              await supabase!.from('payroll_runs').update({ status: 'Draft' }).eq('id', runId);
            }
            notify(t('success'), 'Journal Voucher reversed and month unlocked.', 'success');
          }
        } catch (e: any) {
          notify(t('critical'), e.message, 'error');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleExecuteTerminalSql = async () => {
    if (!terminalSql.trim() || !supabase) {
      notify("Terminal Error", "Supabase client not initialized or query empty.", "error");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.rpc('run_sql', { sql_query: terminalSql });
      if (error) throw error;
      notify(t('success'), "Direct database write successful.", "success");
      setTerminalSql(prev => prev + '\n-- OK: ' + new Date().toLocaleTimeString());
    } catch (err: any) {
      notify("SQL Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const checkConnection = async () => {
    setLoading(true);
    const report = await dbService.testConnection();
    setConnectionReport(report);
    if (report.latency !== undefined) {
      setLatencyHistory(prev => [...prev.slice(-9), report.latency!]);
    }
    setLoading(false);
  };

  const runRegistryAudit = async () => {
    setAuditing(true);
    try {
      const emps = await dbService.getEmployees();
      const risks: any[] = [];
      let healthyCount = 0;
      const today = new Date();

      emps.forEach(emp => {
        let empRisksFound = 0;
        
        // 1. Data Integrity Checks
        if (!emp.civilId || emp.civilId.length < 10) {
          risks.push({ emp, category: 'registryHealth', issue: t('missingCivilId'), severity: 'critical' });
          empRisksFound++;
        }
        if (!emp.iban || emp.iban.length < 15) {
          risks.push({ emp, category: 'wpsCompliance', issue: t('missingIban'), severity: 'high' });
          empRisksFound++;
        }
        if (!emp.department) {
          risks.push({ emp, category: 'fieldAudit', issue: t('missingDept'), severity: 'high' });
          empRisksFound++;
        }
        const isExempt = emp.role === 'Admin' || emp.role === 'Executive' || emp.role === 'HR Manager';
        if (!emp.managerId && !isExempt) {
          risks.push({ emp, category: 'fieldAudit', issue: t('missingManager'), severity: 'medium' });
          empRisksFound++;
        }

        // 2. Document Expiry Checks (Unified Radar)
        const checkDocs = [
          { type: 'Civil ID', date: emp.civilIdExpiry },
          { type: 'Passport', date: emp.passportExpiry },
          { type: 'Izn Amal', date: emp.iznAmalExpiry }
        ];

        checkDocs.forEach(doc => {
          if (doc.date) {
            const exp = new Date(doc.date);
            const diff = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diff < 90) {
              risks.push({
                emp,
                category: 'docIntegrityRadar',
                issue: `${doc.type} expires in ${diff} days`,
                severity: diff < 30 ? 'critical' : (diff < 60 ? 'high' : 'medium'),
                metadata: { days: diff, type: doc.type }
              });
              empRisksFound++;
            }
          }
        });

        if (empRisksFound === 0) healthyCount++;
      });

      setAuditStats({ healthy: healthyCount, risks: risks.length, alerts: risks.filter(r => r.severity === 'critical').length });
      setAuditRisks(risks);
      notify(t('success'), "Registry Integrity Audit complete.", "success");
    } catch (err) {
      console.error(err);
      notify(t('critical'), "Integrity Audit engine failed.", "error");
    } finally {
      setAuditing(false);
    }
  };

  const handleSaveAiConfig = () => {
    localStorage.setItem('ai_provider_url', aiUrl);
    localStorage.setItem('ai_provider_model', aiModel);
    localStorage.setItem('ai_provider_key', aiKey);
    notify(t('success'), "Inference settings updated.", "success");
  };

  const handleSaveCaptured = async () => {
    if (!editItem) return;
    setLoading(true);
    try {
      if (editItem.type === 'Announcement') {
        if (editItem.data.id) await dbService.updateAnnouncement(editItem.data.id, editItem.data);
        else await dbService.createAnnouncement({ ...editItem.data, createdAt: new Date().toISOString() });
        fetchIntelligence();
      } else if (editItem.type === 'Holiday') {
        const payload = {
          ...editItem.data,
          type: editItem.data.type || 'National',
          isFixed: editItem.data.isFixed ?? true
        };
        if (editItem.data.id) await dbService.updatePublicHoliday(editItem.data.id, payload);
        else await dbService.addPublicHoliday(payload);
        fetchMasterHub();
      } else if (editItem.type === 'Office') {
        const payload = {
          ...editItem.data,
          lat: editItem.data.lat || 29.3759,
          lng: editItem.data.lng || 47.9774,
          radius: editItem.data.radius || 250
        };
        if (editItem.data.id) await dbService.updateOfficeLocation(editItem.data.id, payload);
        else await dbService.addOfficeLocation(payload);
        fetchMasterHub();
      }
      setIsCapturing(false);
      notify(t('success'), "Registry updated successfully.", "success");
    } catch (e) {
      notify("Save Failed", "Encountered a validation or network error.", "error");
    } finally {
      setLoading(false);
    }
  };

  const SectionHeading = ({ icon, title, subtitle, onAdd }: any) => (
    <div style={{ marginBottom: 'var(--cds-spacing-07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>
          {icon && <span style={{ marginRight: 'var(--cds-spacing-03)' }}>{icon}</span>}
          {title}
        </h3>
        {subtitle && <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{subtitle}</p>}
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="cds--btn cds--btn--primary cds--btn--sm"
          style={{ height: '32px' }}
        >
          {isAr ? 'إضافة سجل' : 'Registry_Add +'}
        </button>
      )}
    </div>
  );

  const monthsList = i18n.language === 'ar'
    ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
      <header>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{t('adminCenter')}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{isAr ? 'إدارة النظام والبيانات الأساسية' : 'Root registry management and system configuration.'}</p>
      </header>

      {/* Standardized Tabs Navigation - Single Row */}
      <div className="cds--tabs" style={{ marginBottom: 'var(--cds-spacing-05)', width: '100%', overflowX: 'auto', background: 'var(--cds-background)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
        <ul className="cds--tabs__nav" role="tablist" style={{ display: 'flex', gap: '2px', padding: 0, margin: 0, listStyle: 'none' }}>
           {[
             { id: 'Integrity', label: t('integrityReport'), icon: '🛡️' },
             { id: 'Registry', label: t('registry'), icon: '📜' },
             { id: 'Users', label: 'Users', icon: '👤' },
             { id: 'Claims', label: 'Claims', icon: '🧾' },
             { id: 'Configuration', label: t('settings'), icon: '⚙️' },
             { id: 'Connectors', label: 'Hardware', icon: '🔌' },
             { id: 'Worksheet', label: 'Worksheet', icon: '📅' },
             { id: 'MasterData', label: 'Hub', icon: '🏦' },
{ id: 'Terminal', label: 'Terminal', icon: 'TERM' },
            { id: 'Maintenance', label: 'Purge', icon: 'MAINT' },
            { id: 'OrganizationStructure', label: 'Org Structure', icon: 'ORG' },
          ].map(tab => (
            <li 
              key={tab.id}
              className={`cds--tabs__nav-item ${activeTab === tab.id ? 'cds--tabs__nav-item--selected' : ''}`}
              role="presentation"
              style={{ flex: '1 0 auto', minWidth: '100px' }}
            >
              <button
                className="cds--tabs__nav-link"
                onClick={() => setActiveTab(tab.id as any)}
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
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap'
                }}
              >
                <span style={{ fontSize: '1rem', opacity: activeTab === tab.id ? 1 : 0.7 }}>{tab.icon}</span>
                <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px' }}>{tab.label}</span>
              </button>
            </li>
           ))}
        </ul>
      </div>

      <main>
        {activeTab === 'Registry' && <DataExplorerTab />}
        {activeTab === 'Claims' && <ClaimsManagerTab />}
        {activeTab === 'Users' && <div className="animate-in slide-in-from-bottom-4 duration-500"><UserManagement /></div>}

        {activeTab === 'Integrity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'slide-up 0.4s ease' }}>
            
            {/* Core Infrastructure Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
               {/* Connection Status Tile */}
               <div className="cds--tile" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-06)' }}>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('registryStatus')}</h4>
                  {connectionReport ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-05)', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
                      <div style={{ fontSize: '1.5rem', color: connectionReport.success ? 'var(--cds-support-success)' : 'var(--cds-support-error)' }}>
                        {connectionReport.success ? '⚡' : '❌'}
                      </div>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{connectionReport.success ? t('handshakeVerified') : t('handshakeFailed')}</p>
                        <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{connectionReport.message}</p>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: 'var(--cds-spacing-07)', textAlign: 'center', color: 'var(--cds-text-disabled)', border: '1px dashed var(--cds-border-subtle)' }}>
                      {t('runDiagnostics')}
                    </div>
                  )}
                  <button onClick={checkConnection} className="cds--btn cds--btn--primary cds--btn--sm" style={{ width: '100%' }}>{t('executeDiagnostics')}</button>
               </div>

               {/* Telemetry Tile */}
               <div className="cds--tile" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-06)' }}>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('networkTelemetry')}</h4>
                  <div style={{ height: '120px', display: 'flex', alignItems: 'flex-end', gap: '2px' }}>
                    {latencyHistory.map((ping, i) => (
                      <div
                        key={i}
                        style={{ 
                          flex: 1, 
                          height: `${Math.max(10, Math.min(100, (ping / 2000) * 100))}%`, 
                          background: ping > 1000 ? 'var(--cds-support-error)' : 'var(--cds-support-success)',
                          opacity: 0.8
                        }}
                      ></div>
                    ))}
                    {latencyHistory.length === 0 && <div style={{ width: '100%', textAlign: 'center', fontSize: '0.75rem', color: 'var(--cds-text-disabled)' }}>{t('nullFeed')}</div>}
                  </div>
                  <p style={{ fontSize: '0.625rem', textAlign: 'center', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('latencyMonitor')}</p>
               </div>

               {/* System Stats Tile */}
               <div className="cds--tile" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-06)', background: 'var(--cds-interactive-01)', color: 'white' }}>
                  <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f4f4f4', textTransform: 'uppercase' }}>{t('systemIntegrity')}</h4>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>{auditStats ? `${auditStats.healthy} Healthy` : 'Awaiting Audit'}</p>
                      <p style={{ fontSize: '0.75rem', opacity: 0.8 }}>{auditStats ? `${auditStats.risks} Active Risks Detected` : 'Registry integrity scan pending'}</p>
                    </div>
                    <div style={{ fontSize: '2rem' }}>🛡️</div>
                  </div>
                  <button 
                    onClick={runRegistryAudit} 
                    disabled={auditing}
                    className="cds--btn cds--btn--secondary cds--btn--sm" 
                    style={{ width: '100%', border: '1px solid white', color: 'white' }}
                  >
                    {auditing ? 'CALCULATING...' : t('integrityReport')}
                  </button>
               </div>
            </div>

            {/* System Integrity Report - The Restored Functionality */}
            {auditRisks.length > 0 && (
              <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', borderRadius: 0 }}>
                <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{t('integrityReport')}</h3>
                    <span className="cds--tag cds--tag--red" style={{ fontSize: '0.625rem' }}>{auditStats?.alerts} CRITICAL_ALERTS</span>
                  </div>
                  <button onClick={() => setAuditRisks([])} className="cds--btn cds--btn--ghost cds--btn--sm">Dismiss</button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="cds--data-table cds--data-table--compact">
                    <thead>
                      <tr>
                        <th>{t('members')}</th>
                        <th>Category</th>
                        <th>Risk Severity</th>
                        <th>Condition</th>
                        <th style={{ textAlign: 'right' }}>Resolution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditRisks.map((risk, i) => (
                        <tr key={i}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                              <div style={{ width: '24px', height: '24px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                                {risk.emp.name[0]}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: 600 }}>{isAr && risk.emp.nameArabic ? risk.emp.nameArabic : risk.emp.name}</span>
                                <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{risk.emp.nationality}</span>
                              </div>
                            </div>
                          </td>
                          <td><span className="cds--tag cds--tag--warm-gray" style={{ fontSize: '0.625rem' }}>{t(risk.category)}</span></td>
                          <td>
                            <span className={`cds--tag ${risk.severity === 'critical' ? 'cds--tag--red' : risk.severity === 'high' ? 'cds--tag--magenta' : 'cds--tag--cyan'}`} style={{ fontSize: '0.625rem' }}>
                              {risk.severity.toUpperCase()}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.75rem', fontWeight: 600 }}>{risk.issue}</td>
                          <td style={{ textAlign: 'right' }}>
                            <button className="cds--btn cds--btn--ghost cds--btn--sm" style={{ padding: 0, justifyContent: 'center', width: '32px' }} title="Send Alert">🔔</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Network Topology Visualizer - Optional but premium */}
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)' }}>
              <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-05)' }}>Network Node Topology</h4>
              <div style={{ display: 'flex', gap: 'var(--cds-spacing-07)', overflowX: 'auto', padding: 'var(--cds-spacing-05) 0' }}>
                 {[
                   { name: 'Registry Gateway', status: 'Online', load: '12%' },
                   { name: 'Biometric Node', status: 'Online', load: '4%' },
                   { name: 'Audit Engine', status: 'Idle', load: '0%' },
                   { name: 'WPS Proxy', status: 'Online', load: '22%' },
                   { name: 'Auth Controller', status: 'Online', load: '8%' }
                 ].map(node => (
                   <div key={node.name} style={{ flex: '0 0 160px', padding: 'var(--cds-spacing-04)', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', textAlign: 'center' }}>
                      <div style={{ width: '40px', height: '40px', margin: '0 auto var(--cds-spacing-03) auto', background: 'var(--cds-background)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--cds-support-success)' }}>
                        <div style={{ width: '8px', height: '8px', background: 'var(--cds-support-success)', borderRadius: '50%' }}></div>
                      </div>
                      <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>{node.name}</p>
                      <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>LOAD: {node.load}</p>
                   </div>
                 ))}
              </div>
            </div>

          </div>
        )}

        {activeTab === 'MasterData' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.5s ease' }}>
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
              <SectionHeading title={t('officeLocations')} subtitle={t('officeNodesSub')} onAdd={() => { setEditItem({ type: 'Office', data: {} }); setIsCapturing(true); }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)', marginTop: 'var(--cds-spacing-05)' }}>
                {officeNodes.map(node => (
                  <div key={node.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--cds-spacing-04)', background: 'var(--cds-layer-01)', borderLeft: '4px solid var(--cds-interactive-01)' }}>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{isAr && node.nameArabic ? node.nameArabic : node.name}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{isAr && node.addressArabic ? node.addressArabic : node.address}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--cds-spacing-02)' }}>
                      <button onClick={() => { setEditItem({ type: 'Office', data: node }); setIsCapturing(true); }} className="cds--btn cds--btn--ghost cds--btn--sm">{isAr ? 'تعديل' : 'Edit'}</button>
                      <button onClick={() => handleDeleteItem('Office', node.id)} className="cds--btn cds--btn--danger--ghost cds--btn--sm">{isAr ? 'حذف' : 'Delete'}</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
              <SectionHeading title={t('publicHolidays')} subtitle={t('publicHolidaysSub')} onAdd={() => { setEditItem({ type: 'Holiday', data: {} }); setIsCapturing(true); }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: 'var(--cds-spacing-05)' }}>
                {holidayRegistry.map(h => (
                  <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--cds-spacing-03) var(--cds-spacing-04)', background: 'var(--cds-layer-01)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)' }}>
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, width: '80px', color: 'var(--cds-link-primary)' }}>{h.date}</div>
                      <p style={{ fontSize: '0.875rem' }}>{isAr && h.nameArabic ? h.nameArabic : h.name}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--cds-spacing-02)', alignItems: 'center' }}>
                      <span className={`cds--tag ${h.isFixed ? 'cds--tag--blue' : 'cds--tag--warm-gray'}`} style={{ fontSize: '0.625rem', margin: 0 }}>
                        {h.isFixed ? t('fixed') : t('variable')}
                      </span>
                      <button onClick={() => { setEditItem({ type: 'Holiday', data: h }); setIsCapturing(true); }} className="cds--btn cds--btn--ghost cds--btn--sm">✏️</button>
                      <button onClick={() => handleDeleteItem('Holiday', h.id)} className="cds--btn cds--btn--ghost cds--btn--sm" style={{ color: 'var(--cds-support-error)' }}>🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Intelligence' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.5s ease' }}>
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
              <SectionHeading title={t('tickerBroadcast')} subtitle={t('tickerBroadcastSub')} onAdd={() => { setEditItem({ type: 'Announcement', data: {} }); setIsCapturing(true); }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--cds-spacing-05)', marginTop: 'var(--cds-spacing-05)' }}>
                {announcements.map(ann => (
                  <div key={ann.id} style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-layer-01)', borderLeft: '4px solid var(--cds-interactive-01)', position: 'relative' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--cds-spacing-03)' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{isAr && ann.titleArabic ? ann.titleArabic : ann.title}</h4>
                      <div style={{ display: 'flex', gap: 'var(--cds-spacing-02)' }}>
                        <button onClick={() => { setEditItem({ type: 'Announcement', data: ann }); setIsCapturing(true); }} className="cds--btn cds--btn--ghost cds--btn--sm">✏️</button>
                        <button onClick={() => handleDeleteItem('Announcement', ann.id)} className="cds--btn cds--btn--danger--ghost cds--btn--sm">🗑️</button>
                      </div>
                    </div>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-04)', lineHeight: 1.5 }}>{isAr && ann.contentArabic ? ann.contentArabic : ann.content}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-disabled)', textTransform: 'uppercase' }}>{ann.createdAt}</span>
                      <span className={`cds--tag ${ann.priority === 'Urgent' ? 'cds--tag--red' : 'cds--tag--blue'}`} style={{ fontSize: '0.625rem', margin: 0 }}>
                        {ann.priority === 'Urgent' ? t('urgent') : t('normal')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Worksheet' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', animation: 'slide-up 0.5s ease' }}>
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{t('dailyWorksheet')}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{t('dailyWorksheetSub')}</p>
              </div>
              <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
                <select className="cds--select-input cds--select-input--sm" style={{ padding: '0 1rem', height: '32px' }} value={wsFilter.month} onChange={e => setWsFilter({ ...wsFilter, month: parseInt(e.target.value) })}>
                  {monthsList.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select className="cds--select-input cds--select-input--sm" style={{ padding: '0 1rem', height: '32px' }} value={wsFilter.year} onChange={e => setWsFilter({ ...wsFilter, year: parseInt(e.target.value) })}>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
              </div>
            </div>

            <div className="cds--data-table-container" style={{ border: '1px solid var(--cds-border-subtle)' }}>
              <table className="cds--data-table cds--data-table--short">
                <thead>
                  <tr>
                    <th>{t('date')}</th>
                    <th>{t('employee')}</th>
                    <th>{t('clockIn')}</th>
                    <th>{t('clockOut')}</th>
                    <th>{t('status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {worksheetLogs.length > 0 ? worksheetLogs.map(log => (
                    <tr key={log.id}>
                      <td>{log.date}</td>
                      <td style={{ fontWeight: 600 }}>{log.employeeName}</td>
                      <td style={{ color: 'var(--cds-interactive-01)', fontFamily: 'monospace' }}>{log.clockIn}</td>
                      <td style={{ color: 'var(--cds-text-secondary)', fontFamily: 'monospace' }}>{log.clockOut}</td>
                      <td>
                        <span className={`cds--tag ${log.status === 'Present' ? 'cds--tag--green' : 'cds--tag--red'}`} style={{ fontSize: '0.625rem', margin: 0 }}>
                          {log.status.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--cds-spacing-10)', fontStyle: 'italic', color: 'var(--cds-text-disabled)' }}>{t('noWorksheetLogs')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'Maintenance' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--cds-spacing-07)', animation: 'slide-up 0.5s ease' }}>
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
              <SectionHeading title={t('payrollRollback')} subtitle={t('rollbackSub')} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)', marginTop: 'var(--cds-spacing-05)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--cds-spacing-04)' }}>
                   <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: 'var(--cds-spacing-02)' }}>{t('year')}</label>
                      <select className="cds--select-input" value={rollbackFilter.year} onChange={e => setRollbackFilter({ ...rollbackFilter, year: parseInt(e.target.value) })}>
                        <option value={2025}>2025</option>
                        <option value={2026}>2026</option>
                      </select>
                   </div>
                   <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: 'var(--cds-spacing-02)' }}>{t('month')}</label>
                      <select className="cds--select-input" value={rollbackFilter.month} onChange={e => setRollbackFilter({ ...rollbackFilter, month: parseInt(e.target.value) })}>
                        {monthsList.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                      </select>
                   </div>
                   <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: 'var(--cds-spacing-02)' }}>{t('cycle')}</label>
                      <select className="cds--select-input" value={rollbackFilter.cycle} onChange={e => setRollbackFilter({ ...rollbackFilter, cycle: e.target.value as any })}>
                        <option value="Monthly">{t('monthly')}</option>
                        <option value="Bi-Weekly">{t('biWeekly')}</option>
                      </select>
                   </div>
                </div>

                <div style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-support-error-inverse)', color: 'var(--cds-text-inverse)', borderRadius: '4px' }}>
                   <p style={{ fontSize: '0.75rem', fontWeight: 600 }}>⚠️ {t('rollbackWarning')}</p>
                </div>

                <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
                  <button onClick={handleRollbackPayroll} disabled={loading} className="cds--btn cds--btn--danger cds--btn--sm" style={{ flex: 1 }}>{loading ? '...' : t('executeRollback')}</button>
                  <button onClick={handleRollbackJV} disabled={loading} className="cds--btn cds--btn--secondary cds--btn--sm" style={{ flex: 1 }}>{loading ? '...' : (isAr ? 'التراجع عن اليومية' : 'Reverse JV Lock')}</button>
                </div>

                <div style={{ borderTop: '1px solid var(--cds-border-subtle)', paddingTop: 'var(--cds-spacing-06)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                   <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Reverse Pay Leave</label>
                   <div style={{ display: 'flex', gap: 'var(--cds-spacing-03)' }}>
                      <select className="cds--select-input" style={{ flex: 1 }} value={selectedLeaveRunId} onChange={e => setSelectedLeaveRunId(e.target.value)}>
                        <option value="">-- Select Paid Leave Record --</option>
                        {leaveRuns.map(run => (
                          <option key={run.id} value={run.id}>{run.periodKey} ({run.totalDisbursement} KWD)</option>
                        ))}
                      </select>
                      <button onClick={handleRollbackLeaveRun} disabled={loading || !selectedLeaveRunId} className="cds--btn cds--btn--ghost cds--btn--sm">Reverse</button>
                   </div>
                </div>
              </div>
            </div>

            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-10)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
               <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-interactive-01)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-05)' }}>{t('auditPolicyEnforced')}</h4>
               <p style={{ fontSize: '1.25rem', fontWeight: 400, color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-07)', lineHeight: 1.6 }}>{t('rollbackAuditDesc')}</p>
               <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                 <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--cds-support-success)' }}></div>
                 {t('sessionSecured')}
               </div>
            </div>
          </div>
        )}

        {activeTab === 'Connectors' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.5s ease' }}>
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
              <SectionHeading title={t('biometricNode')} subtitle={t('biometricNodeSub')} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', marginTop: 'var(--cds-spacing-05)' }}>
                 <div>
                    <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: 'var(--cds-spacing-02)' }}>{t('hwIpAddress')}</label>
                    <input className="cds--text-input cds--text-input--sm" value={hwConfig?.serverIp || ''} readOnly placeholder="192.168.1.1" />
                 </div>
                 <button className="cds--btn cds--btn--secondary cds--btn--sm">{t('probeNodeStatus')}</button>
              </div>

              <div style={{ marginTop: 'var(--cds-spacing-08)', paddingTop: 'var(--cds-spacing-07)', borderTop: '1px solid var(--cds-border-subtle)' }}>
                <SectionHeading title={t('inferenceBridge')} subtitle={t('inferenceBridgeSub')} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', marginTop: 'var(--cds-spacing-05)' }}>
                   <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: 'var(--cds-spacing-02)' }}>{t('localApiEndpoint')}</label>
                      <input className="cds--text-input cds--text-input--sm" value={aiUrl} onChange={e => setAiUrl(e.target.value)} placeholder="http://localhost:11434/api/generate" />
                   </div>
                   <div>
                      <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: 'var(--cds-spacing-02)' }}>{t('selectedIntelModel')}</label>
                      <select className="cds--select-input" value={['llama3', 'mistral', 'qwen2.5', 'phi3', 'gemma2'].includes(aiModel) ? aiModel : 'custom'} onChange={e => e.target.value !== 'custom' && setAiModel(e.target.value)}>
                         <option value="llama3">Llama 3 (Meta Inference)</option>
                         <option value="mistral">Mistral (High Density)</option>
                         <option value="qwen2.5">Qwen 2.5 (Registry Expert)</option>
                         <option value="phi3">Phi-3 (Compute Efficient)</option>
                         <option value="gemma2">Gemma 2 (Google Local)</option>
                         <option value="custom">-- Custom Local Model --</option>
                      </select>
                   </div>
                   <button onClick={handleSaveAiConfig} className="cds--btn cds--btn--primary cds--btn--sm">{t('commitAiLogic')}</button>
                </div>
              </div>
            </div>

            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-08)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)', alignItems: 'center', textAlign: 'center' }}>
               <div style={{ fontSize: '3rem', opacity: 0.5 }}>⌛</div>
               <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{t('registryOverhaul')}</h3>
               <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', lineHeight: 1.5 }}>{t('overhaulDesc')}</p>
               <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  <button onClick={handleSyncHardware} disabled={syncingHw} className="cds--btn cds--btn--ghost cds--btn--sm" style={{ width: '100%' }}>{t('pullLogs')}</button>
                  <button onClick={handleReconstructHistory} disabled={reconstructing} className="cds--btn cds--btn--ghost cds--btn--sm" style={{ width: '100%' }}>{t('backfillRegistry')}</button>
                  <button onClick={handleAnalyzeOvertime} disabled={analyzingOt} className="cds--btn cds--btn--primary cds--btn--sm" style={{ width: '100%' }}>{t('analyzeOvertime')}</button>
               </div>
            </div>
          </div>
        )}

        {activeTab === 'OrganizationStructure' && <OrganizationStructureTab />}

        {activeTab === 'Terminal' && (
          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', animation: 'fade-in 0.5s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-05)' }}>
               <div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{t('registryTerminal')}</h3>
                  <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{t('directSqlBridge')}</p>
               </div>
               <div style={{ display: 'flex', gap: 'var(--cds-spacing-03)' }}>
                  <button onClick={() => setTerminalSql('')} className="cds--btn cds--btn--ghost cds--btn--sm">Clear</button>
                  <button onClick={handleExecuteTerminalSql} disabled={loading || !terminalSql.trim()} className="cds--btn cds--btn--primary cds--btn--sm">Commit Query</button>
               </div>
            </div>

            <textarea
              style={{ width: '100%', minHeight: '400px', padding: 'var(--cds-spacing-05)', background: 'var(--cds-layer-01)', color: '#24a148', fontFamily: 'monospace', fontSize: '0.875rem', border: '1px solid var(--cds-border-subtle)', outline: 'none' }}
              spellCheck={false}
              value={terminalSql}
              onChange={e => setTerminalSql(e.target.value)}
            />
          </div>
        )}
      </main>

      {/* Capture Hub Overlay */}
      {
        isCapturing && editItem && (
          <div className="cds--modal is-visible" style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
            <div className="cds--modal-container" style={{ width: '100%', maxWidth: '600px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', boxShadow: '0 12px 24px rgba(0,0,0,0.2)' }}>
              <div className="cds--modal-header" style={{ padding: 'var(--cds-spacing-06)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{t('captureHub')} {editItem.type}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: 'var(--cds-spacing-02)' }}>{t('globalRegistryWriteMode')}</p>
                </div>
                <button onClick={() => setIsCapturing(false)} className="cds--btn cds--btn--ghost cds--btn--sm">✕</button>
              </div>
              <div className="cds--modal-content" style={{ padding: 'var(--cds-spacing-07)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
                {editItem.type === 'Announcement' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-05)' }}>
                      <div>
                        <label className="cds--label">{t('englishTitle')}</label>
                        <input className="cds--text-input" value={editItem.data.title || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, title: e.target.value } })} />
                      </div>
                      <div dir="rtl">
                        <label className="cds--label">{t('arabicTitle')}</label>
                        <input className="cds--text-input" value={editItem.data.titleArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, titleArabic: e.target.value } })} />
                      </div>
                    </div>
                    <div>
                      <label className="cds--label">{t('englishContent')}</label>
                      <textarea className="cds--text-input" style={{ minHeight: '80px' }} value={editItem.data.content || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, content: e.target.value } })} />
                    </div>
                    <div dir="rtl">
                      <label className="cds--label">{t('arabicContent')}</label>
                      <textarea className="cds--text-input" style={{ minHeight: '80px' }} value={editItem.data.contentArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, contentArabic: e.target.value } })} />
                    </div>
                    <div>
                      <label className="cds--label">{t('urgencyLevel')}</label>
                      <select className="cds--select-input" value={editItem.data.priority || 'Normal'} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, priority: e.target.value } })}>
                        <option value="Normal">Normal</option>
                        <option value="Urgent">Urgent</option>
                      </select>
                    </div>
                  </>
                )}

                {editItem.type === 'Holiday' && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-05)' }}>
                      <div>
                        <label className="cds--label">{t('englishDesignation')}</label>
                        <input className="cds--text-input" value={editItem.data.name || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, name: e.target.value } })} />
                      </div>
                      <div dir="rtl">
                        <label className="cds--label">{t('arabicDesignation')}</label>
                        <input className="cds--text-input" value={editItem.data.nameArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, nameArabic: e.target.value } })} />
                      </div>
                    </div>
                    <div>
                      <label className="cds--label">{t('calendarDate')}</label>
                      <input type="date" className="cds--text-input" value={editItem.data.date || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, date: e.target.value } })} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
                      <input type="checkbox" checked={editItem.data.isFixed} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, isFixed: e.target.checked } })} />
                      <label className="cds--label" style={{ marginBottom: 0 }}>{t('fixedDate')}</label>
                    </div>
                  </>
                )}

                {editItem.type === 'Office' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-05)' }}>
                      <div>
                        <label className="cds--label">{t('englishDesignation')}</label>
                        <input className="cds--text-input" value={editItem.data.name || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, name: e.target.value } })} />
                      </div>
                      <div dir="rtl">
                        <label className="cds--label">{t('arabicDesignation')}</label>
                        <input className="cds--text-input" value={editItem.data.nameArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, nameArabic: e.target.value } })} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-05)' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-02)' }}>
                        <label className="cds--label">{t('gpsLatitude')}</label>
                        <input type="number" step="any" className="cds--text-input" value={editItem.data.lat || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, lat: parseFloat(e.target.value) } })} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-02)' }}>
                        <label className="cds--label">{t('gpsLongitude')}</label>
                        <input type="number" step="any" className="cds--text-input" value={editItem.data.lng || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, lng: parseFloat(e.target.value) } })} />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-02)' }}>
                      <label className="cds--label">{t('attendanceRadius')}</label>
                      <input type="number" className="cds--text-input" value={editItem.data.radius || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, radius: parseInt(e.target.value) } })} />
                    </div>
                  </div>
                )}
              </div>
              <div className="cds--modal-footer" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-layer-02)', display: 'flex', gap: 'var(--cds-spacing-05)' }}>
                <button onClick={() => setIsCapturing(false)} className="cds--btn cds--btn--secondary" style={{ flex: 1 }}>{t('cancel')}</button>
                <button onClick={handleSaveCaptured} className="cds--btn cds--btn--primary" style={{ flex: 1 }}>{t('commitToRegistry')}</button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default AdminCenter;
