import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';
import { supabase } from '../services/supabaseClient.ts';
import { HardwareConfig, AttendanceRecord, OfficeLocation, Announcement, PublicHoliday, DepartmentMetric, ExpenseClaim, ClaimStatus, User } from '../types/types';
import { runAiTask } from '../services/geminiService.ts';
import { UserManagement } from './UserManagement.tsx';

type TableName = 'employees' | 'leave_requests' | 'payroll_runs' | 'public_holidays' | 'office_locations' | 'department_metrics' | 'announcements';

const DataExplorerTab: React.FC = () => {
  const { t } = useTranslation();

  // ─── Entity definitions ────────────────────────────────────────────
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
      // For employees, join related tables
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

  // Load on mount
  React.useEffect(() => { loadEntity(entities[0]); }, []);

  // Load extra detail data when a row is selected
  React.useEffect(() => {
    if (!selectedRow || !supabase) { setDetailData({}); return; }
    setDetailLoading(true);
    const load = async () => {
      const d: typeof detailData = {};
      if (explorerEntity.id === 'employees') {
        const [hist, bal, allow] = await Promise.all([
          supabase.from('leave_history').select('*').filter('leave_request_id', 'in', `(SELECT id FROM leave_requests WHERE employee_id = '${selectedRow.id}')`),
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
      if (explorerEntity.id === 'expense_claims') {
        const hist = await supabase.from('expense_claim_history').select('*').eq('claim_id', selectedRow.id).order('created_at');
        (d as any).claimHistory = hist.data || [];
      }
      setDetailData(d);
      setDetailLoading(false);
    };
    load();
  }, [selectedRow?.id]);

  // Filter rows by search text
  const filteredExplorer = React.useMemo(() => {
    const q = explorerSearch.toLowerCase();
    if (!q) return explorerData;
    return explorerData.filter(row =>
      Object.values(row).some(v => v && String(v).toLowerCase().includes(q))
    );
  }, [explorerData, explorerSearch]);

  // Get flat columns (exclude nested objects)
  const columns = explorerData.length > 0
    ? Object.keys(explorerData[0]).filter(k => {
      const v = explorerData[0][k];
      return !Array.isArray(v) && typeof v !== 'object';
    }).slice(0, 8)
    : [];

  // CSV Export
  const exportCsv = () => {
    const csv = [columns.join(','), ...filteredExplorer.map(r => columns.map(c => JSON.stringify(r[c] ?? '')).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${explorerEntity.id}_export.csv`;
    a.click();
  };

  const renderCell = (v: any) => {
    if (v === null || v === undefined || v === '') return <span className="text-slate-300">—</span>;
    if (typeof v === 'boolean') return <span className={`text-[9px] font-black px-2 py-0.5 rounded ${v ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{v ? 'Yes' : 'No'}</span>;
    if (typeof v === 'string' && v.match(/^\d{4}-\d{2}-\d{2}/)) return <span className="font-mono text-[11px] text-slate-600">{v.slice(0, 10)}</span>;
    return <span className="text-[12px] text-slate-700 block truncate max-w-[160px]" title={String(v)}>{String(v)}</span>;
  };

  return (
    <div className="animate-in slide-in-from-bottom-4 duration-500 text-start">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-xl font-black text-slate-900 tracking-tight">{t('dataExplorer')}</h3>
          <p className="text-xs text-slate-400 font-medium mt-1">Click any row to inspect full details in the side panel</p>
        </div>
      </div>

      <div className="flex gap-6 h-[calc(100vh-320px)] min-h-[560px]">

        {/* ── Left: Entity Sidebar ── */}
        <div className="w-52 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entities</p>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {entities.map(e => (
              <button
                key={e.id}
                onClick={() => loadEntity(e)}
                className={`w-full text-left flex items-center gap-3 px-4 py-3 transition-all text-sm font-bold ${explorerEntity.id === e.id ? 'bg-indigo-50 text-indigo-700 border-r-2 border-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                <span className="text-base leading-none">{e.icon}</span>
                <span className="text-[11px] font-black uppercase tracking-wide leading-tight">{e.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Center: Results Table ── */}
        <div className={`flex-1 min-w-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-300 ${selectedRow ? 'lg:flex' : ''}`}>
          {/* Toolbar */}
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                placeholder={`Search ${explorerEntity.label}…`}
                className="w-full pl-9 pr-4 py-2 text-xs font-bold bg-white border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                value={explorerSearch}
                onChange={e => setExplorerSearch(e.target.value)}
              />
            </div>
            <span className="text-[10px] font-black text-slate-400 whitespace-nowrap">{filteredExplorer.length} rows</span>
            <button onClick={exportCsv} className="px-4 py-2 border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-all whitespace-nowrap">↓ CSV</button>
            <button onClick={() => loadEntity(explorerEntity)} className="px-4 py-2 border border-slate-200 rounded-xl text-[10px] font-black text-slate-600 hover:bg-slate-50 transition-all">↺</button>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto">
            {explorerLoading ? (
              <div className="flex items-center justify-center h-32 gap-3 text-slate-400 text-xs font-bold">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
                Loading {explorerEntity.label}…
              </div>
            ) : (
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-white border-b border-slate-100 z-10">
                  <tr>
                    {columns.map(c => (
                      <th key={c} className="px-4 py-3 text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        {c.replace(/_/g, ' ')}
                      </th>
                    ))}
                    <th className="px-4 py-3 w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredExplorer.length === 0 ? (
                    <tr><td colSpan={columns.length + 1} className="px-4 py-16 text-center text-slate-300 text-sm font-medium italic">No records found</td></tr>
                  ) : filteredExplorer.map((row, i) => (
                    <tr
                      key={i}
                      onClick={() => setSelectedRow(prev => prev?.id === row.id ? null : row)}
                      className={`cursor-pointer transition-colors ${selectedRow?.id === row.id ? 'bg-indigo-50' : 'hover:bg-slate-50/70'}`}
                    >
                      {columns.map(c => (
                        <td key={c} className="px-4 py-3">{renderCell(row[c])}</td>
                      ))}
                      <td className="px-4 py-3 text-slate-300 text-xs">›</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ── Right: Slide-out Detail Panel ── */}
        <div className={`flex flex-col bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden transition-all duration-300 ease-in-out ${selectedRow ? 'w-80 opacity-100' : 'w-0 opacity-0 border-0'}`}>
          {selectedRow && (
            <>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{explorerEntity.label} Detail</p>
                  <p className="text-sm font-black mt-0.5 truncate max-w-[200px]">{selectedRow.name || selectedRow.employee_name || selectedRow.id}</p>
                </div>
                <button onClick={() => setSelectedRow(null)} className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white text-sm transition-all">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 text-start">
                {/* Raw fields */}
                <div className="space-y-1">
                  {Object.entries(selectedRow)
                    .filter(([, v]) => !Array.isArray(v) && typeof v !== 'object')
                    .map(([k, v]: any) => (
                      <div key={k} className="flex items-start justify-between gap-2 py-1.5 border-b border-slate-50">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider shrink-0">{k.replace(/_/g, ' ')}</span>
                        <span className="text-[11px] font-bold text-slate-700 text-right break-all max-w-[160px]">{v === null || v === undefined || v === '' ? '—' : String(v)}</span>
                      </div>
                    ))}
                </div>

                {/* Leave Balances sub-table (for employees) */}
                {explorerEntity.id === 'employees' && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Leave Balances</p>
                    {detailLoading ? <div className="text-xs text-slate-300 animate-pulse">Loading…</div> : (
                      <div className="space-y-1">
                        {(detailData.leaveBalances || []).map((lb: any) => {
                          const isSub = lb.leave_type === 'Emergency' || lb.leave_type === 'ShortPermission';
                          return (
                            <div key={lb.leave_type} className={`flex items-center justify-between px-3 py-2 rounded-xl transition-all ${isSub ? 'bg-transparent border border-slate-100 opacity-60' : 'bg-slate-50 border border-transparent'}`}>
                              <span className={`text-[10px] font-black ${isSub ? 'text-slate-400' : 'text-slate-600'}`}>{lb.leave_type}</span>
                              <span className={`text-[10px] font-black ${isSub ? 'text-slate-500' : 'text-indigo-600'}`}>{lb.used_days}/{lb.entitled_days}</span>
                            </div>
                          );
                        })}
                        {!detailData.leaveBalances?.length && <p className="text-xs text-slate-300 italic">No balance records</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Allowances sub-table */}
                {explorerEntity.id === 'employees' && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Allowances</p>
                    {detailLoading ? <div className="text-xs text-slate-300 animate-pulse">Loading…</div> : (
                      <div className="space-y-1">
                        {(detailData.allowances || []).map((a: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl">
                            <span className="text-[10px] font-black text-slate-600">{a.name}</span>
                            <span className="text-[10px] font-black text-emerald-600">{a.type === 'Fixed' ? `${a.value} KWD` : `${a.value}%`}</span>
                          </div>
                        ))}
                        {!detailData.allowances?.length && <p className="text-xs text-slate-300 italic">No allowances</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Leave History timeline */}
                {explorerEntity.id === 'leave_requests' && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Audit Trail</p>
                    {detailLoading ? <div className="text-xs text-slate-300 animate-pulse">Loading…</div> : (
                      <div className="space-y-2">
                        {(detailData.leaveHistory || []).map((h: any, i: number) => (
                          <div key={i} className="bg-slate-50 px-3 py-2 rounded-xl border-l-2 border-indigo-300">
                            <p className="text-[10px] font-black text-slate-700">{h.action}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">{h.actor_name} · {h.created_at?.slice(0, 10)}</p>
                            {h.note && <p className="text-[9px] text-slate-500 italic mt-0.5">"{h.note}"</p>}
                          </div>
                        ))}
                        {!detailData.leaveHistory?.length && <p className="text-xs text-slate-300 italic">No history entries</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* Claim History timeline */}
                {explorerEntity.id === 'expense_claims' && (
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Claim Audit Trail</p>
                    {detailLoading ? <div className="text-xs text-slate-300 animate-pulse">Loading…</div> : (
                      <div className="space-y-2">
                        {((detailData as any).claimHistory || []).map((h: any, i: number) => (
                          <div key={i} className="bg-slate-50 px-3 py-2 rounded-xl border-l-2 border-emerald-300">
                            <p className="text-[10px] font-black text-slate-700">{h.action}</p>
                            <p className="text-[9px] text-slate-400 mt-0.5">{h.actor_role} · {h.created_at?.slice(0, 10)}</p>
                            {h.notes && <p className="text-[9px] text-slate-500 italic mt-0.5">"{h.notes}"</p>}
                          </div>
                        ))}
                        {!((detailData as any).claimHistory || []).length && <p className="text-xs text-slate-300 italic">No history entries</p>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      </div>
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
      // Approval Progression: Manager -> HR -> Payroll -> Approved -> Paid
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
    <div className="animate-in slide-in-from-bottom-4 duration-500 text-start space-y-8">
      <div>
        <h3 className="text-xl font-black text-slate-900 tracking-tight">Expense Claims Manager</h3>
        <p className="text-xs text-slate-400 font-medium mt-1">Multi-stage approval workflow for business reimbursements.</p>
      </div>

      <div className="bg-white rounded-[40px] border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Employee</th>
              <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest">Details</th>
              <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Amount</th>
              <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th>
              <th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              <tr><td colSpan={5} className="p-20 text-center text-slate-300 italic">Synchronizing claims registry...</td></tr>
            ) : claims.length === 0 ? (
              <tr><td colSpan={5} className="p-20 text-center text-slate-300 italic">No expense claims found</td></tr>
            ) : claims.map(c => (
              <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-8 py-6">
                  <p className="text-sm font-black text-slate-900">{c.employeeName}</p>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{c.date}</p>
                </td>
                <td className="px-8 py-6">
                  <p className="text-xs font-bold text-slate-700">{c.merchant}</p>
                  <p className="text-[9px] text-slate-400 italic">"{c.category}"</p>
                </td>
                <td className="px-8 py-6 text-right">
                  <p className="text-lg font-black text-indigo-600">{c.amount.toFixed(3)} <span className="text-[9px]">KWD</span></p>
                </td>
                <td className="px-8 py-6 text-center">
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${c.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' :
                    c.status === 'Rejected' ? 'bg-rose-50 text-rose-600' :
                      c.status === 'Paid' ? 'bg-indigo-50 text-indigo-600' :
                        'bg-slate-100 text-slate-500'
                    }`}>
                    {c.status.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <div className="flex justify-center gap-3">
                    {['Pending_Manager', 'Pending_HR', 'Pending_Payroll', 'Approved'].includes(c.status) && (
                      <>
                        <button onClick={() => handleAction(c, 'Approve')} className="h-10 px-6 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/10 active:scale-95 transition-all">
                          {c.status === 'Approved' ? 'Mark Paid' : 'Approve'}
                        </button>
                        <button onClick={() => handleAction(c, 'Reject')} className="h-10 px-6 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 active:scale-95 transition-all">
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
const AdminCenter: React.FC = () => {
  const { notify, confirm } = useNotifications();
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const isAr = language === 'ar';
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'Integrity' | 'Registry' | 'Claims' | 'Configuration' | 'Worksheet' | 'Connectors' | 'Terminal' | 'Intelligence' | 'MasterData' | 'Maintenance' | 'Users'>('Integrity');

  const [selectedTable, setSelectedTable] = useState<TableName>('employees');
  const [tableData, setTableData] = useState<any[]>([]);
  const [connectionReport, setConnectionReport] = useState<any>(null);
  const [latencyHistory, setLatencyHistory] = useState<number[]>([]);

  const [hwConfig, setHwConfig] = useState<HardwareConfig | null>(null);
  const [syncingHw, setSyncingHw] = useState(false);
  const [reconstructing, setReconstructing] = useState(false);

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

  const fetchTableData = async (tableName: TableName) => {
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
  };

  const fetchHwConfig = async () => {
    const config = await dbService.getHardwareConfig();
    setHwConfig(config);
  };

  const fetchWorksheetData = async () => {
    setLoading(true);
    try {
      const logs = await dbService.getAttendanceWorksheet(wsFilter.year, wsFilter.month);
      setWorksheetLogs(logs);
    } catch (err) {
      notify("Sync Failed", "Could not synchronize worksheet data.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchMasterHub = async () => {
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
  };

  const fetchIntelligence = async () => {
    setLoading(true);
    try {
      const data = await dbService.getAnnouncements();
      setAnnouncements(data);
    } finally {
      setLoading(false);
    }
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

  const fetchLeaveRuns = async () => {
    try {
      const runs = await dbService.getPayrollRuns();
      setLeaveRuns(runs.filter(r => r.cycleType === 'Leave_Run'));
    } catch (e) {
      console.error(e);
    }
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
    const periodKey = `${rollbackFilter.year}-${String(rollbackFilter.month).padStart(2, '0')}-${rollbackFilter.cycle.toUpperCase()}`;
    confirm({
      title: isAr ? "تأكيد التراجع عن الرواتب؟" : "Confirm Payroll Rollback?",
      message: isAr
        ? `تحذير: سيتم حذف كافة سجلات الرواتب للفترة ${periodKey} بشكل نهائي. هذا الإجراء لا يمكن التراجع عنه.`
        : `CRITICAL: This will permanently delete ALL finalized and draft records for period ${periodKey}. This action is irreversible.`,
      confirmText: isAr ? "حذف السجلات" : "Purge Records",
      onConfirm: async () => {
        setLoading(true);
        try {
          const res = await dbService.rollbackPayrollRun(periodKey);
          if (res.success) {
            notify(t('success'), res.message, "success");
          } else {
            notify(t('warning'), res.message, "warning");
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
    const periodKey = `${rollbackFilter.year}-${String(rollbackFilter.month).padStart(2, '0')}-${rollbackFilter.cycle.toUpperCase()}`;
    confirm({
      title: isAr ? "تأكيد التراجع عن يومية؟" : "Confirm JV Reversal?",
      message: isAr
        ? `تحذير: سيتم حذف كافة قيود اليومية للفترة ${periodKey} وفتح الشهر مرة أخرى. هذا الإجراء يتطلب مصادقة.`
        : `CRITICAL: This will permanently purge the GL Entries for period ${periodKey} and unlock the month.`,
      confirmText: isAr ? "إلغاء القفل" : "Purge & Unlock",
      onConfirm: async () => {
        setLoading(true);
        try {
          const { data: runs, error: runsError } = await supabase!.from('payroll_runs').select('id').eq('period_key', periodKey);
          if (runsError) throw runsError;

          if (!runs || runs.length === 0) {
            notify(t('warning'), "No payroll run found for this period to rollback JV.", "warning");
          } else {
            const runId = runs[0].id;
            const { error: delError } = await supabase!.from('journal_entries').delete().eq('payroll_run_id', runId);
            if (delError) throw delError;

            await supabase!.from('payroll_runs').update({ status: 'Finalized' }).eq('id', runId);
            notify(t('success'), "Journal Voucher reversed and month unlocked.", "success");
          }
        } catch (e: any) {
          notify(t('critical'), e.message, "error");
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
    <div className="mb-6 flex items-center justify-between">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">
          {title}
        </h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {onAdd && (
        <button
          onClick={onAdd}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-slate-900 text-slate-50 hover:bg-slate-900/90 h-9 px-4 py-2"
          title="Add New Entry"
        >
          Add Item
        </button>
      )}
    </div>
  );

  const monthsList = i18n.language === 'ar'
    ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-16 font-sans text-slate-950" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header Panel */}
      <div className="flex flex-col space-y-1.5 text-start">
        <h2 className="text-3xl font-bold tracking-tight">{t('controlTower')}</h2>
        <p className="text-sm text-slate-500">{t('controlTowerSub')}</p>
      </div>

      {/* Main Tab Navigation */}
      <div className="inline-flex h-9 items-center justify-start rounded-lg bg-slate-100 p-1 text-slate-500 w-full overflow-x-auto lg:w-max">
        {[
          { id: 'Integrity', label: t('healthMatrix') },
          { id: 'Registry', label: t('dataExplorer') },
          { id: 'Claims', label: 'Claims' },
          { id: 'MasterData', label: t('masterData') },
          { id: 'Intelligence', label: t('tickerHub') },
          { id: 'Worksheet', label: t('dailyWorksheet') },
          { id: 'Connectors', label: t('hybridConnectors') },
          { id: 'Users', label: 'Access Control' },
          { id: 'Maintenance', label: t('maintenance') },
          { id: 'Terminal', label: t('sqlTerminal') }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${activeTab === tab.id ? 'bg-white text-slate-950 shadow-sm' : 'hover:bg-slate-50 hover:text-slate-900'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-12">
        {activeTab === 'Registry' && <DataExplorerTab />}
        {activeTab === 'Claims' && <ClaimsManagerTab />}
        {activeTab === 'Users' && <div className="animate-in slide-in-from-bottom-4 duration-500"><UserManagement /></div>}

        {
          activeTab === 'Integrity' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 animate-in slide-in-from-bottom-6 duration-700">
              <div className="lg:col-span-1 bg-white p-12 rounded-[64px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] flex flex-col justify-between text-start">
                <div className="space-y-8">
                  <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">{t('registryStatus')}</h3>
                  {connectionReport ? (
                    <div className="flex items-center gap-8 p-8 bg-slate-50 rounded-[40px] border border-slate-100 shadow-inner">
                      <div className={`w-20 h-20 rounded-[28px] flex items-center justify-center text-3xl shadow-xl ${connectionReport.success ? 'bg-emerald-50 text-emerald-600 shadow-emerald-500/10' : 'bg-rose-50 text-rose-600 shadow-rose-500/10'}`}>
                        {connectionReport.success ? '⚡' : '❌'}
                      </div>
                      <div>
                        <p className="text-lg font-black text-slate-900">
                          {connectionReport.success ? t('handshakeVerified') : t('handshakeFailed')}
                        </p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1.5">{connectionReport.message}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-10 text-center text-slate-300 italic border-2 border-dashed border-slate-100 rounded-[40px]">
                      {t('runDiagnostics')}
                    </div>
                  )}
                </div>
                <div className="space-y-5 pt-16">
                  <button onClick={checkConnection} className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl hover:bg-black active:scale-95 transition-all">{t('executeDiagnostics')}</button>
                </div>
              </div>

              <div className="lg:col-span-1 bg-white p-12 rounded-[64px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] text-start">
                <h3 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em] mb-12">{t('networkTelemetry')}</h3>
                <div className="h-56 flex items-end gap-3 px-2">
                  {latencyHistory.map((ping, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t-2xl transition-all duration-700 shadow-sm ${ping > 1000 ? 'bg-rose-500 shadow-rose-500/20' : 'bg-emerald-500 shadow-emerald-500/20'}`}
                      style={{ height: `${Math.max(10, Math.min(100, (ping / 2000) * 100))}%` }}
                    ></div>
                  ))}
                  {latencyHistory.length === 0 && <div className="w-full text-center text-slate-200 font-black uppercase tracking-widest py-20 opacity-30">{t('nullFeed')}</div>}
                </div>
                <p className="mt-10 text-[10px] font-black text-slate-400 text-center uppercase tracking-[0.25em]">{t('latencyMonitor')}</p>
              </div>

              <div className="lg:col-span-1 bg-indigo-600 p-16 rounded-[64px] shadow-2xl text-white text-start relative overflow-hidden flex flex-col justify-between border border-indigo-500">
                <div className="absolute top-0 right-0 p-12 opacity-10 group-hover:scale-110 transition-transform duration-1000">🛰️</div>
                <div className="space-y-4">
                  <h3 className="text-[11px] font-black text-indigo-200 uppercase tracking-[0.3em]">{t('cloudStatus')}</h3>
                  <p className="text-3xl font-black tracking-tighter leading-tight">{t('cloudOptimized')}</p>
                </div>
                <div className="pt-12">
                  <div className="px-8 py-4 bg-white/10 rounded-[24px] border border-white/10 backdrop-blur-3xl shadow-2xl">
                    <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-100">{t('authBridge')}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        {activeTab === 'MasterData' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in slide-in-from-bottom-6 duration-700 text-start">
            <div className="bg-white p-12 rounded-[56px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] space-y-12">
              <SectionHeading icon="📍" title={t('officeLocations')} subtitle={t('officeNodesSub')} onAdd={() => { setEditItem({ type: 'Office', data: {} }); setIsCapturing(true); }} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {officeNodes.map(node => (
                  <div key={node.id} className="p-8 bg-slate-50 rounded-[32px] border border-slate-100 shadow-inner group relative">
                    <p className="text-lg font-black text-slate-900 mb-1">{isAr && node.nameArabic ? node.nameArabic : node.name}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isAr && node.addressArabic ? node.addressArabic : node.address}</p>
                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setEditItem({ type: 'Office', data: node }); setIsCapturing(true); }} className="w-8 h-8 rounded-lg bg-white text-indigo-600 flex items-center justify-center hover:bg-slate-50 text-xs shadow-sm border border-slate-100">✏️</button>
                      <button onClick={() => handleDeleteItem('Office', node.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 text-xs shadow-sm">🗑️</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-12 rounded-[56px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] space-y-12">
              <SectionHeading icon="📅" title={t('publicHolidays')} subtitle={t('publicHolidaysSub')} onAdd={() => { setEditItem({ type: 'Holiday', data: {} }); setIsCapturing(true); }} />
              <div className="space-y-4">
                {holidayRegistry.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-[28px] border border-slate-100 shadow-inner group transition-all hover:bg-white hover:shadow-lg">
                    <div>
                      <p className="text-sm font-black text-slate-800">{isAr && h.nameArabic ? h.nameArabic : h.name}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{h.date}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`px-4 py-1.5 ${h.isFixed ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-amber-50 text-amber-600 border-amber-100'} rounded-xl text-[9px] font-black uppercase tracking-widest border`}>
                        {h.isFixed ? t('fixed') : t('variable')}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={() => { setEditItem({ type: 'Holiday', data: h }); setIsCapturing(true); }} className="w-8 h-8 rounded-lg bg-white text-indigo-600 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-slate-50 transition-all text-xs shadow-sm border border-slate-100">✏️</button>
                        <button onClick={() => handleDeleteItem('Holiday', h.id)} className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-rose-100 transition-all text-xs shadow-sm">🗑️</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Intelligence' && (
          <div className="space-y-12 animate-in slide-in-from-bottom-6 duration-700 text-start">
            <div className="bg-white p-16 rounded-[64px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] space-y-12">
              <SectionHeading icon="📣" title={t('tickerBroadcast')} subtitle={t('tickerBroadcastSub')} onAdd={() => { setEditItem({ type: 'Announcement', data: {} }); setIsCapturing(true); }} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {announcements.map(ann => (
                  <div key={ann.id} className="p-10 bg-slate-50 rounded-[40px] border border-slate-100 hover:border-indigo-600/20 transition-all group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 text-4xl group-hover:scale-125 transition-transform duration-500">📎</div>
                    <div className="absolute top-6 right-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all">
                      <button onClick={() => { setEditItem({ type: 'Announcement', data: ann }); setIsCapturing(true); }} className="w-9 h-9 rounded-xl bg-white text-indigo-600 flex items-center justify-center hover:bg-slate-50 shadow-sm border border-slate-200 text-xs">✏️</button>
                      <button onClick={() => handleDeleteItem('Announcement', ann.id)} className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center hover:bg-rose-100 shadow-sm text-xs">🗑️</button>
                    </div>
                    <h4 className="text-xl font-black text-slate-900 mb-2 truncate pr-16">{isAr && ann.titleArabic ? ann.titleArabic : ann.title}</h4>
                    <p className="text-sm text-slate-500 font-medium leading-relaxed line-clamp-2">{isAr && ann.contentArabic ? ann.contentArabic : ann.content}</p>
                    <div className="mt-6 pt-6 border-t border-slate-200/60 flex justify-between items-center">
                      <span className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{ann.createdAt}</span>
                      <span className={`px-3 py-1 bg-white border border-slate-200 rounded-lg text-[9px] font-black uppercase tracking-widest ${ann.priority === 'Urgent' ? 'text-rose-600 border-rose-100' : 'text-indigo-600'}`}>{ann.priority === 'Urgent' ? t('urgent') : t('normal')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Worksheet' && (
          <div className="space-y-12 animate-in slide-in-from-bottom-6 duration-700 text-start">
            <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] flex flex-wrap justify-between items-center gap-6">
              <SectionHeading icon="📋" title={t('dailyWorksheet')} subtitle={t('dailyWorksheetSub')} />
              <div className="flex gap-4">
                <select className="px-5 py-4 bg-slate-50 rounded-2xl text-xs font-bold border border-slate-100 shadow-inner outline-none" value={wsFilter.month} onChange={e => setWsFilter({ ...wsFilter, month: parseInt(e.target.value) })}>
                  {monthsList.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select className="px-5 py-4 bg-slate-50 rounded-2xl text-xs font-bold border border-slate-100 shadow-inner outline-none" value={wsFilter.year} onChange={e => setWsFilter({ ...wsFilter, year: parseInt(e.target.value) })}>
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-[48px] border border-slate-200 shadow-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[700px]">
                <table className="w-full text-start">
                  <thead>
                    <tr className="bg-slate-50/50 text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                      <th className="px-10 py-6">{t('date')}</th>
                      <th className="px-10 py-6">{t('employee')}</th>
                      <th className="px-10 py-6">{t('identityLink')}</th>
                      <th className="px-10 py-6">{t('clockIn')}</th>
                      <th className="px-10 py-6">{t('clockOut')}</th>
                      <th className="px-10 py-6">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {worksheetLogs.length > 0 ? worksheetLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-10 py-6 font-black text-slate-500">{log.date}</td>
                        <td className="px-10 py-6 font-black text-slate-900">{log.employeeName}</td>
                        <td className="px-10 py-6">
                          <span className="px-3 py-1 bg-slate-100 text-slate-400 text-[9px] font-black rounded-lg uppercase tracking-tight">{t('verified')}</span>
                        </td>
                        <td className="px-10 py-6 font-mono text-xs font-black text-indigo-600">{log.clockIn}</td>
                        <td className="px-10 py-6 font-mono text-xs font-black text-slate-400">{log.clockOut}</td>
                        <td className="px-10 py-6">
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border ${log.status === 'Present' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{log.status}</span>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="p-32 text-center text-slate-300 italic">{t('noWorksheetLogs')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Maintenance' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in slide-in-from-bottom-6 duration-700 text-start">
            <div className="bg-white p-16 rounded-[64px] border border-slate-200 shadow-xl space-y-12">
              <SectionHeading icon="⏪" title={t('payrollRollback')} subtitle={t('rollbackSub')} />

              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('year')}</label>
                    <select
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-rose-500/5 transition-all"
                      value={rollbackFilter.year}
                      onChange={e => setRollbackFilter({ ...rollbackFilter, year: parseInt(e.target.value) })}
                    >
                      <option value={2025}>2025</option>
                      <option value={2026}>2026</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('month')}</label>
                    <select
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-rose-500/5 transition-all"
                      value={rollbackFilter.month}
                      onChange={e => setRollbackFilter({ ...rollbackFilter, month: parseInt(e.target.value) })}
                    >
                      {monthsList.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('cycle')}</label>
                    <select
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-rose-500/5 transition-all"
                      value={rollbackFilter.cycle}
                      onChange={e => setRollbackFilter({ ...rollbackFilter, cycle: e.target.value as any })}
                    >
                      <option value="Monthly">{t('monthly')}</option>
                      <option value="Bi-Weekly">{t('biWeekly')}</option>
                    </select>
                  </div>
                </div>

                <div className="p-8 bg-rose-50 rounded-[40px] border border-rose-100 space-y-4">
                  <p className="text-xs text-rose-800 font-bold leading-relaxed">
                    ⚠️ {t('rollbackWarning')}
                  </p>
                </div>

                <div className="flex flex-col md:flex-row gap-4">
                  <button
                    onClick={handleRollbackPayroll}
                    disabled={loading}
                    className="flex-1 py-6 bg-rose-600 text-white rounded-[28px] font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-rose-600/20 active:scale-95 transition-all hover:bg-rose-700"
                  >
                    {loading ? '...' : t('executeRollback')}
                  </button>
                  <button
                    onClick={handleRollbackJV}
                    disabled={loading}
                    className="flex-1 py-6 bg-slate-900 text-white rounded-[28px] font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-slate-900/20 active:scale-95 transition-all hover:bg-black"
                  >
                    {loading ? '...' : (isAr ? 'التراجع عن اليومية' : 'Reverse JV Lock')}
                  </button>
                </div>

                <div className="pt-8 border-t border-slate-100 flex flex-col md:flex-row items-end gap-6">
                  <div className="flex-1 w-full space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Reverse Pay Leave</label>
                    <select
                      className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-rose-500/5 transition-all"
                      value={selectedLeaveRunId}
                      onChange={e => setSelectedLeaveRunId(e.target.value)}
                    >
                      <option value="">-- Select Paid Leave Record --</option>
                      {leaveRuns.map(run => (
                        <option key={run.id} value={run.id}>{run.periodKey} ({run.totalDisbursement} KWD)</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleRollbackLeaveRun}
                    disabled={loading || !selectedLeaveRunId}
                    className="md:w-auto w-full py-4 px-8 bg-white border-2 border-slate-900 text-slate-900 rounded-[24px] font-black text-[12px] uppercase tracking-[0.2em] shadow-sm active:scale-95 transition-all disabled:opacity-50 hover:bg-slate-50"
                  >
                    {loading ? '...' : 'Reverse Pay Leave'}
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-16 rounded-[64px] shadow-2xl flex flex-col justify-center text-white space-y-10 relative overflow-hidden border border-white/5">
              <div className="absolute top-0 right-0 p-12 opacity-5">🛡️</div>
              <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{t('auditPolicyEnforced')}</h4>
              <p className="text-2xl font-bold leading-relaxed">
                {t('rollbackAuditDesc')}
              </p>
              <div className="flex items-center gap-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                {t('sessionSecured')}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Connectors' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-in fade-in duration-700 text-start">
            <div className="bg-white p-20 rounded-[64px] border border-slate-200 shadow-xl space-y-16">
              <div>
                <SectionHeading icon="📠" title={t('biometricNode')} subtitle={t('biometricNodeSub')} />
                <div className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('hwIpAddress')}</label>
                    <input className="w-full px-8 py-6 bg-slate-50 border border-slate-100 rounded-[28px] font-black text-lg outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={hwConfig?.serverIp || ''} placeholder="192.168.1.1" />
                  </div>
                  <button className="w-full py-6 bg-slate-900 text-white rounded-[28px] font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl hover:bg-black active:scale-95 transition-all">{t('probeNodeStatus')}</button>
                </div>
              </div>

              <div className="pt-16 border-t border-slate-100">
                <SectionHeading icon="🧠" title={t('inferenceBridge')} subtitle={t('inferenceBridgeSub')} />
                <div className="space-y-8">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('localApiEndpoint')}</label>
                    <input className="w-full px-8 py-6 bg-slate-50 border border-slate-100 rounded-[28px] font-black outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={aiUrl} onChange={e => setAiUrl(e.target.value)} placeholder="http://localhost:11434/api/generate" />
                    <p className="text-[9px] text-slate-400 font-bold tracking-widest uppercase ps-2">{t('geminiDefault')}</p>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('selectedIntelModel')}</label>
                    <div className="flex flex-col sm:flex-row gap-4">
                      <select
                        className="flex-1 px-8 py-5 bg-slate-50 border border-slate-100 rounded-[24px] font-black text-sm outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner"
                        value={['llama3', 'mistral', 'qwen2.5', 'phi3', 'gemma2'].includes(aiModel) ? aiModel : 'custom'}
                        onChange={e => {
                          if (e.target.value !== 'custom') setAiModel(e.target.value);
                        }}
                      >
                        <option value="llama3">Llama 3 (Meta Inference)</option>
                        <option value="mistral">Mistral (High Density)</option>
                        <option value="qwen2.5">Qwen 2.5 (Registry Expert)</option>
                        <option value="phi3">Phi-3 (Compute Efficient)</option>
                        <option value="gemma2">Gemma 2 (Google Local)</option>
                        <option value="custom">-- Custom Local Model --</option>
                      </select>

                      {(!['llama3', 'mistral', 'qwen2.5', 'phi3', 'gemma2'].includes(aiModel)) && (
                        <input
                          className="flex-1 px-8 py-5 bg-indigo-50 border border-indigo-100 rounded-[24px] font-black text-sm outline-none focus:ring-8 focus:ring-indigo-500/20 transition-all shadow-inner text-indigo-700 animate-in slide-in-from-right-4"
                          value={aiModel}
                          onChange={e => setAiModel(e.target.value)}
                          placeholder="Handle: e.g. codellama"
                        />
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Inference API Key (Optional)</label>
                    <input
                      type="password"
                      className="w-full px-8 py-6 bg-slate-50 border border-slate-100 rounded-[28px] font-black outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner"
                      value={aiKey}
                      onChange={e => setAiKey(e.target.value)}
                      placeholder="Enter API Key for hosted providers"
                    />
                  </div>

                  <button onClick={handleSaveAiConfig} className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl shadow-indigo-600/20 active:scale-95 transition-all border border-indigo-500">{t('commitAiLogic')}</button>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 p-20 rounded-[64px] shadow-2xl flex flex-col items-center justify-center text-center space-y-12 relative overflow-hidden group border border-white/5">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/40 via-transparent to-transparent opacity-30"></div>
              <div className="w-40 h-40 rounded-[48px] bg-white/5 border border-white/10 backdrop-blur-3xl flex items-center justify-center text-6xl group-hover:scale-110 transition-transform duration-1000 shadow-2xl shadow-black/50 relative z-10">⌛</div>
              <div className="space-y-6 max-w-md relative z-10">
                <h3 className="text-4xl font-black text-white tracking-tighter leading-none">{t('registryOverhaul')}</h3>
                <p className="text-slate-400 text-lg leading-relaxed font-medium opacity-80">{t('overhaulDesc')}</p>
              </div>
              <div className="w-full space-y-5 relative z-10 max-w-sm">
                <button onClick={handleSyncHardware} disabled={syncingHw} className="w-full py-6 bg-white text-slate-900 rounded-[28px] font-black text-[12px] uppercase tracking-[0.25em] shadow-2xl transition-all active:scale-95 disabled:opacity-50 hover:bg-indigo-50">{t('pullLogs')}</button>
                <button onClick={handleReconstructHistory} disabled={reconstructing} className="w-full py-6 bg-indigo-600 text-white rounded-[28px] font-black text-[12px] uppercase tracking-[0.25em] shadow-2xl shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50 border border-indigo-500">{t('backfillRegistry')}</button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Terminal' && (
          <div className="bg-slate-950 p-16 rounded-[64px] shadow-[0_40px_100px_-20px_rgba(0,0,0,0.5)] border border-white/5 animate-in zoom-in-95 duration-700 text-start">
            <div className="flex flex-col md:flex-row items-center justify-between mb-16 gap-10">
              <div className="space-y-3">
                <h3 className="text-4xl font-black text-white tracking-tighter flex items-center gap-6 leading-none">
                  <span className="w-4 h-4 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]"></span>
                  {t('registryTerminal')}
                </h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ps-10">{t('directSqlBridge')}</p>
              </div>
              <div className="flex gap-4">
                <button onClick={() => setTerminalSql('')} className="px-10 py-4 bg-white/5 text-slate-400 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 transition-all">Clear</button>
                <button onClick={handleExecuteTerminalSql} disabled={loading || !terminalSql.trim()} className="px-12 py-4 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-emerald-600/20 active:scale-95 disabled:opacity-50 transition-all border border-emerald-500">Commit Query</button>
              </div>
            </div>

            <div className="relative group rounded-[48px] overflow-hidden border border-white/10 shadow-2xl">
              <textarea
                className="w-full min-h-[550px] bg-slate-900 p-16 font-mono text-base text-emerald-400 outline-none focus:ring-0 shadow-inner transition-all selection:bg-emerald-500/20"
                spellCheck={false}
                value={terminalSql}
                onChange={e => setTerminalSql(e.target.value)}
              />
              <div className="absolute bottom-10 right-16 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] pointer-events-none select-none">
                {t('encryptedSessionActive')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Capture Hub Overlay */}
      {
        isCapturing && editItem && (
          <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in zoom-in-95 duration-300">
            <div className="bg-white w-full max-w-2xl rounded-[64px] shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-12 border-b border-slate-100 flex justify-between items-center text-start">
                <div>
                  <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{t('captureHub')} {editItem.type}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 px-1">{t('globalRegistryWriteMode')}</p>
                </div>
                <button onClick={() => setIsCapturing(false)} className="w-14 h-14 rounded-[20px] bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-slate-100 transition-all text-2xl font-light">✕</button>
              </div>
              <div className="p-12 space-y-10 text-start">
                {editItem.type === 'Announcement' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('englishTitle')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.title || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, title: e.target.value } })} placeholder="System Update" />
                      </div>
                      <div className="space-y-3" dir="rtl">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('arabicTitle')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner text-right" value={editItem.data.titleArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, titleArabic: e.target.value } })} placeholder="تحديث النظام" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('englishContent')}</label>
                        <textarea className="w-full p-8 bg-slate-50 rounded-[32px] border border-slate-100 font-medium h-48 outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner resize-none" value={editItem.data.content || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, content: e.target.value } })} placeholder="English message content..." />
                      </div>
                      <div className="space-y-3" dir="rtl">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('arabicContent')}</label>
                        <textarea className="w-full p-8 bg-slate-50 rounded-[32px] border border-slate-100 font-medium h-48 outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner resize-none text-right" value={editItem.data.contentArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, contentArabic: e.target.value } })} placeholder="محتوى الرسالة بالعربي..." />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('urgencyLevel')}</label>
                        <select className="w-full p-5 bg-slate-50 rounded-[20px] border border-slate-100 font-black text-[10px] uppercase tracking-widest outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.priority || 'Normal'} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, priority: e.target.value } })}>
                          <option value="Normal">Normal</option>
                          <option value="Urgent">Urgent</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}
                {editItem.type === 'Holiday' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('englishDesignation')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.name || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, name: e.target.value } })} placeholder="Eid Al-Adha" />
                      </div>
                      <div className="space-y-3" dir="rtl">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('arabicDesignation')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner text-right" value={editItem.data.nameArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, nameArabic: e.target.value } })} placeholder="عيد الأضحى" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('calendarDate')}</label>
                        <input type="date" className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.date || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, date: e.target.value } })} />
                      </div>
                      <div className="flex flex-col justify-center gap-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('policy')}</label>
                        <label className="flex items-center gap-4 p-5 bg-slate-50 rounded-[20px] border border-slate-100 cursor-pointer hover:bg-slate-100 transition-all">
                          <input type="checkbox" className="w-6 h-6 rounded-lg accent-indigo-600" checked={editItem.data.isFixed} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, isFixed: e.target.checked } })} />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">{t('fixedDate')}</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
                {editItem.type === 'Office' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('englishDesignation')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.name || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, name: e.target.value } })} placeholder="Grand Tower Hub" />
                      </div>
                      <div className="space-y-3" dir="rtl">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('arabicDesignation')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner text-right" value={editItem.data.nameArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, nameArabic: e.target.value } })} placeholder="برج التحرير" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('englishAddress')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.address || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, address: e.target.value } })} placeholder="Kuwait City, Block 3..." />
                      </div>
                      <div className="space-y-3" dir="rtl">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('arabicAddress')}</label>
                        <input className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner text-right" value={editItem.data.addressArabic || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, addressArabic: e.target.value } })} placeholder="مدينة الكويت، قطعة 3..." />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('gpsLatitude')}</label>
                        <input type="number" step="any" className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.lat || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, lat: parseFloat(e.target.value) } })} placeholder="29.3759" />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('gpsLongitude')}</label>
                        <input type="number" step="any" className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.lng || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, lng: parseFloat(e.target.value) } })} placeholder="47.9774" />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{t('attendanceRadius')}</label>
                      <input type="number" className="w-full p-6 bg-slate-50 rounded-[28px] border border-slate-100 font-bold outline-none focus:ring-8 focus:ring-indigo-500/5 transition-all shadow-inner" value={editItem.data.radius || ''} onChange={e => setEditItem({ ...editItem, data: { ...editItem.data, radius: parseInt(e.target.value) } })} placeholder="250" />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-12 bg-slate-50 flex gap-6">
                <button onClick={() => setIsCapturing(false)} className="flex-1 py-6 bg-white border border-slate-200 rounded-[32px] font-black text-[11px] uppercase tracking-[0.2em] text-slate-400 hover:bg-slate-100 transition-all active:scale-95">{t('cancel')}</button>
                <button onClick={handleSaveCaptured} className="flex-1 py-6 bg-slate-900 text-white rounded-[32px] font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl transition-all active:scale-95 hover:bg-black">{t('commitToRegistry')}</button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default AdminCenter;
