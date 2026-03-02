
import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee, User, LeaveBalances } from '../types/types';
import { useTranslation } from 'react-i18next';
import { supabase } from '../services/supabaseClient.ts';
import { useNotifications } from './NotificationSystem.tsx';

interface EmployeeDirectoryProps {
  user: User;
  onAddClick?: () => void;
  onEditClick?: (emp: Employee) => void;
  language: 'en' | 'ar';
}

// ─── Leave balance progress bar ───────────────────────────────────────────────
const BalanceBar: React.FC<{ used: number; entitled: number; color: string }> = ({ used, entitled, color }) => {
  const pct = entitled > 0 ? Math.min(100, (used / entitled) * 100) : 0;
  const isOver = used > entitled;
  return (
    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${isOver ? 'bg-rose-500' : color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};

// ─── Expandable employee detail panel ─────────────────────────────────────────
const EmployeeDetailPanel: React.FC<{ emp: Employee, currentUser: User }> = ({ emp, currentUser }) => {
  const { i18n } = useTranslation();
  const { notify } = useNotifications();
  const [tab, setTab] = useState<'balances' | 'allowances' | 'documents' | 'performance'>('balances');
  const [balances, setBalances] = useState<LeaveBalances | null>(null);
  const [loadingBal, setLoadingBal] = useState(false);

  // Performance Tab State
  const [rating, setRating] = useState<number>(3);
  const [bonusPct, setBonusPct] = useState<number>(5);
  const [period, setPeriod] = useState<string>('2026 Annual');
  const [justification, setJustification] = useState<string>('');
  const [isSubmittingBonus, setIsSubmittingBonus] = useState(false);

  useEffect(() => {
    // Autocalculate recommended bonus based on rating
    if (rating >= 4.5) setBonusPct(10);
    else if (rating >= 4) setBonusPct(7);
    else if (rating >= 3) setBonusPct(5);
    else setBonusPct(0);
  }, [rating]);

  const submitPerformanceBonus = async () => {
    try {
      if (!justification) return notify("Attention", "Please provide a justification.", "warning");
      setIsSubmittingBonus(true);

      // Insert performance eval
      const { data: peData, error: peError } = await supabase.from('performance_evaluations').insert([{
        employee_id: emp.id,
        reviewer_id: currentUser.id,
        period_name: period,
        rating_score: rating,
        recommended_bonus_pct: bonusPct,
        status: 'SUBMITTED',
        comments: justification
      }]).select().single();

      if (peError) throw peError;

      // Calculate flat value
      const val = (emp.salary * (bonusPct / 100));

      // Insert variable comp
      const { error: vcError } = await supabase.from('variable_compensation').insert([{
        employee_id: emp.id,
        comp_type: 'BONUS',
        sub_type: 'Performance_Bonus',
        amount: val, // Since it's a value bonus
        status: 'PENDING_EXEC',
        pam_exempt: true,
        performance_evaluation_id: peData.id,
        notes: `Performance rating: ${rating}/5`,
        created_by: currentUser.id
      }]);

      if (vcError) throw vcError;

      notify("Successfully Submitted", "Performance rating and bonus proposal sent to Executives.", "success");
      setTab('balances');
    } catch (err: any) {
      notify("Error", err.message, "error");
    } finally {
      setIsSubmittingBonus(false);
    }
  };

  useEffect(() => {
    setLoadingBal(true);
    dbService.getLeaveBalances(emp.id)
      .then(setBalances)
      .finally(() => setLoadingBal(false));
  }, [emp.id]);

  const leaveTypes = balances ? [
    { key: 'Annual', icon: '🌴', label: 'Annual Leave', entitled: balances.annual, used: balances.annualUsed, color: 'bg-indigo-500', isSubLevel: false },
    { key: 'Sick', icon: '🤒', label: 'Sick Leave', entitled: balances.sick, used: balances.sickUsed, color: 'bg-amber-500', isSubLevel: false },
    { key: 'Emergency', icon: '🚨', label: 'Emergency', entitled: balances.emergency, used: balances.emergencyUsed, color: 'bg-rose-400', isSubLevel: true },
    { key: 'ShortPerm', icon: '⏱', label: 'Short Permission', entitled: balances.shortPermissionLimit, used: balances.shortPermissionUsed, color: 'bg-violet-400', isSubLevel: true },
    { key: 'Hajj', icon: '🕌', label: 'Hajj Leave', entitled: 1, used: balances.hajUsed ? 1 : 0, color: 'bg-emerald-500', isSubLevel: false },
  ] : [];

  const getDocStatus = (dateStr?: string) => {
    if (!dateStr) return { label: 'N/A', cls: 'bg-slate-100 text-slate-400' };
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    if (diff < 0) return { label: 'Expired', cls: 'bg-rose-100 text-rose-600' };
    if (diff < 30) return { label: `${diff}d`, cls: 'bg-red-100 text-red-600' };
    if (diff < 90) return { label: `${diff}d`, cls: 'bg-amber-100 text-amber-600' };
    return { label: 'Secure', cls: 'bg-emerald-100 text-emerald-600' };
  };

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'balances', label: '🏖️ Leave Balances' },
    { id: 'allowances', label: '💰 Allowances' },
    { id: 'documents', label: '📋 Documents' },
    { id: 'performance', label: '🎯 Performance' },
  ];

  return (
    <tr>
      <td colSpan={6} className="px-0 pb-0">
        <div className="mx-6 mb-4 bg-slate-50 border border-slate-200 rounded-[28px] overflow-hidden animate-in slide-in-from-top-2 duration-300">
          {/* Tab Row */}
          <div className="flex gap-1 p-3 border-b border-slate-100 bg-white rounded-t-[28px]">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${tab === t.id ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-700 hover:bg-slate-50'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Leave Balances */}
          {tab === 'balances' && (
            <div className="p-6">
              {loadingBal ? (
                <div className="flex items-center gap-3 text-slate-400 text-xs font-bold"><div className="w-4 h-4 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />Loading balances…</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {leaveTypes.map(lt => {
                    const remaining = Math.max(0, lt.entitled - lt.used);
                    return (
                      <div key={lt.key} className={`p-4 rounded-2xl border space-y-2 transition-all duration-300 ${lt.isSubLevel ? 'bg-slate-50/50 border-transparent opacity-80 hover:opacity-100' : 'bg-white border-slate-100 shadow-sm'}`}>
                        <div className="flex items-center justify-between">
                          <div className={`flex items-center gap-2 ${lt.isSubLevel ? 'grayscale opacity-75' : ''}`}>
                            <span className="text-base">{lt.icon}</span>
                            <span className={`text-[10px] font-black uppercase tracking-widest ${lt.isSubLevel ? 'text-slate-500' : 'text-slate-700'}`}>{lt.label}</span>
                          </div>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-lg ${lt.used > lt.entitled ? 'bg-rose-100 text-rose-600' : (lt.isSubLevel ? 'bg-slate-200/50 text-slate-500' : 'bg-slate-100 text-slate-600')}`}>
                            {lt.used}/{lt.entitled}
                          </span>
                        </div>
                        <BalanceBar used={lt.used} entitled={lt.entitled} color={lt.color} />
                        <p className={`text-[9px] font-bold ${lt.isSubLevel ? 'text-slate-400' : 'text-slate-500'}`}>{remaining} {lt.key === 'ShortPerm' ? 'hrs' : 'days'} remaining</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Allowances */}
          {tab === 'allowances' && (
            <div className="p-6">
              {emp.allowances?.length > 0 ? (
                <div className="space-y-2">
                  {emp.allowances.map((a, i) => (
                    <div key={i} className="flex items-center justify-between bg-white px-5 py-3 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-3">
                        <span className="text-base">{a.isHousing ? '🏠' : '💼'}</span>
                        <div>
                          <p className="text-sm font-black text-slate-800">
                            {i18n.language === 'ar' && a.nameArabic ? a.nameArabic : a.name}
                          </p>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-md ${a.type === 'Fixed' ? 'bg-indigo-50 text-indigo-600' : 'bg-violet-50 text-violet-600'}`}>
                            {a.type}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm font-black text-slate-900">
                        {a.type === 'Fixed'
                          ? `${Number(a.value).toLocaleString()} KWD`
                          : `${a.value}%`}
                      </p>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-indigo-600 px-5 py-3 rounded-2xl text-white mt-2">
                    <span className="text-[10px] font-black uppercase tracking-widest">Total Allowances</span>
                    <span className="text-sm font-black">
                      {emp.allowances.reduce((s, a) =>
                        s + (a.type === 'Fixed' ? Number(a.value) : (emp.salary * Number(a.value) / 100)), 0
                      ).toLocaleString()} KWD
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-medium text-center py-8">No allowances on record.</p>
              )}
            </div>
          )}

          {/* Documents */}
          {tab === 'documents' && (
            <div className="p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { icon: '🪪', label: 'Civil ID', value: emp.civilId, expiry: emp.civilIdExpiry },
                  { icon: '🛂', label: 'Passport', value: emp.passportNumber, expiry: emp.passportExpiry },
                  { icon: '📋', label: 'Izn Amal', value: null, expiry: emp.iznAmalExpiry },
                  { icon: '🏦', label: 'IBAN', value: emp.iban, expiry: null },
                  { icon: '🔐', label: 'PIFSS No.', value: emp.pifssNumber, expiry: null },
                ].map((doc, i) => {
                  const st = getDocStatus(doc.expiry || undefined);
                  return (
                    <div key={i} className="bg-white px-5 py-4 rounded-2xl border border-slate-100 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{doc.icon}</span>
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{doc.label}</p>
                          <p className="text-sm font-black text-slate-800 mt-0.5">
                            {doc.value ? doc.value : (doc.expiry ? doc.expiry : '—')}
                          </p>
                        </div>
                      </div>
                      {doc.expiry && (
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg shrink-0 ${st.cls}`}>{st.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance & Bonus Workflow */}
          {tab === 'performance' && (
            <div className="p-6 bg-indigo-50/30">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h4 className="text-lg font-black text-slate-800 tracking-tight">Executive Performance & Bonus Nomination</h4>
                  <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">Linked to Executive Workflow - PAM Exempt</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 block">Review Period</label>
                    <select value={period} onChange={e => setPeriod(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-indigo-500">
                      <option value="2025 Annual">2025 Annual Review</option>
                      <option value="2026 Annual">2026 Annual Review</option>
                      <option value="Special Case">Ad-Hoc Specialized</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 block flex justify-between">
                      <span>Performance Rating (1-5)</span>
                      <span className="text-indigo-600 font-extrabold">{rating} / 5</span>
                    </label>
                    <input
                      type="range" min="1" max="5" step="0.5"
                      value={rating} onChange={(e) => setRating(Number(e.target.value))}
                      className="w-full accent-indigo-600 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-2 px-1">
                      <span>Needs Work (1)</span>
                      <span>Target (3)</span>
                      <span>Exceptional (5)</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-black uppercase tracking-widest text-slate-500 mb-2 block">Manager Justification</label>
                    <textarea
                      value={justification} onChange={(e) => setJustification(e.target.value)}
                      placeholder="Detail specific accomplishments matching the rating..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-500 min-h-[85px] resize-none"
                    ></textarea>
                  </div>
                </div>

                <div className="md:col-span-2 flex items-center justify-between border-t border-slate-100 pt-6 mt-2">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-xl text-indigo-600">📈</div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Recommended Bonus</p>
                      <p className="text-2xl font-black text-slate-900 leading-none mt-1">
                        {bonusPct}% <span className="text-sm text-slate-500 font-bold ml-1">of Basic Salary (≈ {(emp.salary * (bonusPct / 100)).toLocaleString()} KWD)</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={submitPerformanceBonus}
                    disabled={isSubmittingBonus}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
                  >
                    {isSubmittingBonus ? 'Submitting...' : 'Initiate Bonus Workflow ➔'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
};

// ─── Main Directory Component ──────────────────────────────────────────────────
const EmployeeDirectory: React.FC<EmployeeDirectoryProps> = ({ user, onAddClick, onEditClick }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState('');
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'low' | 'overdue'>('all');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      let data = await dbService.getEmployees();

      const getWeight = (pos: string) => {
        const p = pos.toLowerCase();
        if (p.includes('ceo') || p.includes('general manager')) return 100;
        if (p.includes('director') || p.includes('head of')) return 80;
        if (p.includes('manager')) return 60;
        if (p.includes('lead')) return 40;
        return 10;
      };

      if (user.role === 'Manager' || user.role === 'HR') {
        const targetDept = user.department;
        data = data.filter(e => /ceo/i.test(e.position) || e.department === targetDept);
      }

      setEmployees([...data].sort((a, b) => {
        const diff = getWeight(b.position) - getWeight(a.position);
        return diff !== 0 ? diff : a.name.localeCompare(b.name);
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, [user.id, user.department, user.role]);

  const handleStatusChange = async (employeeId: string, newStatus: Employee['status']) => {
    setUpdatingId(employeeId);
    try {
      await dbService.updateEmployee(employeeId, { status: newStatus });
      setEmployees(prev => prev.map(emp => emp.id === employeeId ? { ...emp, status: newStatus } : emp));
    } catch (err) {
      console.error('Status update failed', err);
    } finally {
      setUpdatingId(null);
    }
  };

  const getComplianceStatus = (emp: Employee) => {
    const dates = [emp.civilIdExpiry, emp.passportExpiry, emp.iznAmalExpiry]
      .filter(Boolean)
      .map(d => Math.ceil((new Date(d!).getTime() - Date.now()) / 86400000));

    if (dates.length === 0) return { label: t('unknown'), color: 'bg-slate-200', text: 'text-slate-500' };
    const min = Math.min(...dates);
    if (min < 0) return { label: t('expired'), color: 'bg-rose-100', text: 'text-rose-600' };
    if (min <= 30) return { label: `${min}d`, color: 'bg-orange-100', text: 'text-orange-600' };
    if (min <= 90) return { label: t('warning'), color: 'bg-amber-100', text: 'text-amber-600' };
    return { label: t('secure'), color: 'bg-emerald-100', text: 'text-emerald-600' };
  };

  const filtered = useMemo(() => {
    const search = filter.toLowerCase();
    return employees.filter(e => {
      const textMatch = e.name.toLowerCase().includes(search)
        || (e.nameArabic && e.nameArabic.includes(search))
        || e.position.toLowerCase().includes(search)
        || e.department.toLowerCase().includes(search);
      if (!textMatch) return false;
      if (balanceFilter === 'low') {
        const remaining = (e.leaveBalances?.annual ?? 30) - (e.leaveBalances?.annualUsed ?? 0);
        return remaining < 5;
      }
      if (balanceFilter === 'overdue') {
        return (e.leaveBalances?.annualUsed ?? 0) > (e.leaveBalances?.annual ?? 30);
      }
      return true;
    });
  }, [employees, filter, balanceFilter]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedData = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const canManage = user.role === 'Admin' || user.role === 'HR';

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1);
  };

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 text-start">
        <div>
          <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{t('directory')}</h2>
          <div className="flex items-center gap-3 mt-2">
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-lg tracking-widest border border-indigo-100 italic">
              {user.role === 'Admin' ? 'Global Registry' : `${user.department} Scope`}
            </span>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">• {filtered.length} {t('members')}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch gap-4">
          {/* Balance filter chips */}
          <div className="flex gap-2 items-center">
            {(['all', 'low', 'overdue'] as const).map(f => (
              <button
                key={f}
                onClick={() => { setBalanceFilter(f); setCurrentPage(1); }}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${balanceFilter === f
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300'
                  }`}
              >
                {f === 'all' ? 'All' : f === 'low' ? '⚠ Low Balance' : '🔴 Overdue'}
              </button>
            ))}
          </div>

          <div className="relative group">
            <span className={`absolute inset-y-0 ${language === 'ar' ? 'right-0 pr-5' : 'left-0 pl-5'} flex items-center text-slate-400 group-focus-within:text-indigo-600 transition-colors`}>🔍</span>
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              className={`w-full min-w-[280px] ${language === 'ar' ? 'pr-12 pl-6' : 'pl-12 pr-6'} py-4.5 border border-slate-200/60 rounded-[28px] bg-white/70 backdrop-blur-md text-sm font-bold outline-none transition-all shadow-sm focus:ring-8 focus:ring-indigo-500/5 focus:border-indigo-500/30 focus:bg-white`}
              value={filter}
              onChange={e => { setFilter(e.target.value); setCurrentPage(1); }}
            />
          </div>
          {canManage && (
            <button
              onClick={onAddClick}
              className="bg-indigo-600 text-white px-10 py-5 rounded-[28px] font-black text-[11px] uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all active:scale-95 shadow-xl shadow-indigo-600/20 border border-indigo-500"
            >
              + {t('enroll')}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[48px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {loading ? (
          <div className="p-32 flex flex-col justify-center items-center gap-4">
            <div className="w-12 h-12 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('syncing')}</p>
          </div>
        ) : filtered.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-start">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100">
                    <th className="px-10 py-6 text-start">{t('identifierTh')}</th>
                    <th className="px-10 py-6 text-start">{t('members')}</th>
                    <th className="px-10 py-6 text-start">{t('documentHealth')}</th>
                    <th className="px-10 py-6 text-start">{t('careerPlacement')}</th>
                    <th className="px-10 py-6 text-start">{t('registryStatus')}</th>
                    <th className="px-10 py-6 text-end" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {paginatedData.map(emp => {
                    const health = getComplianceStatus(emp);
                    const isManager = /manager|head|director|ceo|lead/i.test(emp.position);
                    const isCEO = emp.position.toLowerCase().includes('ceo');
                    const isExpanded = expandedId === emp.id;

                    return (
                      <React.Fragment key={emp.id}>
                        <tr
                          onClick={() => toggleExpand(emp.id)}
                          className={`transition-colors group cursor-pointer ${isExpanded ? 'bg-indigo-50/40' : 'hover:bg-slate-50/50'} ${isManager ? 'bg-indigo-50/20' : ''}`}
                        >
                          <td className="px-10 py-8">
                            <div className="relative inline-block">
                              <div className={`w-14 h-14 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center text-lg font-black border border-slate-200 overflow-hidden shadow-inner ring-4 ring-white ${isExpanded ? 'ring-indigo-200' : 'group-hover:ring-indigo-100'} transition-all ${isManager ? 'ring-indigo-100' : ''}`}>
                                {emp.faceToken ? (
                                  <img src={emp.faceToken} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all" />
                                ) : (
                                  <span className="opacity-30">{emp.name[0]}</span>
                                )}
                              </div>
                              {isManager && (
                                <div className={`absolute -top-1 -right-1 w-5 h-5 ${isCEO ? 'bg-amber-500' : 'bg-indigo-600'} text-white rounded-full flex items-center justify-center text-[10px] shadow-lg border-2 border-white`}>
                                  {isCEO ? '👑' : '★'}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-10 py-8">
                            <div className="text-start">
                              <p className="text-lg font-black text-slate-900 leading-tight">
                                {language === 'ar' && emp.nameArabic ? emp.nameArabic : emp.name}
                              </p>
                              <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">
                                {emp.nationality === 'Kuwaiti' ? '🇰🇼 Kuwaiti National' : `🌍 Expat • ${emp.nationality}`}
                              </p>
                            </div>
                          </td>
                          <td className="px-10 py-8 text-start">
                            <div className={`inline-flex items-center gap-2 px-4 py-1.5 ${health.color} rounded-xl border border-transparent shadow-sm`}>
                              <span className={`text-[10px] font-black uppercase tracking-wider ${health.text}`}>{health.label}</span>
                            </div>
                          </td>
                          <td className="px-10 py-8 text-start">
                            <p className="text-sm font-black text-slate-800 leading-tight">
                              {language === 'ar' && emp.positionArabic ? emp.positionArabic : emp.position}
                            </p>
                            <p className="text-[11px] text-indigo-600 font-extrabold uppercase mt-1 tracking-wider">
                              {language === 'ar' && emp.departmentArabic ? emp.departmentArabic : emp.department}
                            </p>
                          </td>
                          <td className="px-10 py-8 text-start">
                            {canManage ? (
                              <div className="relative inline-block w-full max-w-[140px]" onClick={e => e.stopPropagation()}>
                                <select
                                  disabled={updatingId === emp.id}
                                  value={emp.status}
                                  onChange={e => handleStatusChange(emp.id, e.target.value as Employee['status'])}
                                  className="w-full appearance-none text-[11px] font-black uppercase tracking-widest rounded-xl px-4 py-2 bg-slate-50 border border-slate-200 outline-none hover:bg-white focus:ring-4 focus:ring-indigo-500/10 transition-all disabled:opacity-50"
                                >
                                  <option value="Active">{t('active')}</option>
                                  <option value="On Leave">{t('onleave')}</option>
                                  <option value="Terminated">{t('terminated')}</option>
                                </select>
                                <div className={`pointer-events-none absolute inset-y-0 ${language === 'ar' ? 'left-0 pl-3' : 'right-0 pr-3'} flex items-center text-slate-400 text-[10px]`}>▼</div>
                              </div>
                            ) : (
                              <span className={`text-[11px] font-black uppercase tracking-[0.1em] ${emp.status === 'Active' ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {t(emp.status.toLowerCase().replace(' ', '')) || emp.status}
                              </span>
                            )}
                          </td>
                          <td className="px-10 py-8 text-end">
                            <div className="flex items-center justify-end gap-2">
                              <span className={`text-slate-300 text-xs transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>▼</span>
                              {canManage && (
                                <button
                                  onClick={e => { e.stopPropagation(); onEditClick?.(emp); }}
                                  className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-95"
                                >
                                  <span className="text-xl">⚙️</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable detail panel */}
                        {isExpanded && <EmployeeDetailPanel emp={emp} currentUser={user} />}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-8 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
              <div className="flex items-center gap-8">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  {filtered.length.toLocaleString(language === 'ar' ? 'ar-KW' : 'en-KW')} {t('orgRegistry')}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{i18n.language === 'ar' ? 'عرض:' : 'View:'}</span>
                  <select
                    value={itemsPerPage}
                    onChange={handleItemsPerPageChange}
                    className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-[10px] font-black outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
                  >
                    <option value={5}>05</option>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-30 active:scale-95 shadow-sm">
                  {i18n.language === 'ar' ? 'السابق' : 'Prev'}
                </button>
                <div className="flex items-center px-6 text-[11px] font-black text-slate-900 bg-white border border-slate-200 rounded-xl shadow-inner">
                  {currentPage.toLocaleString(language === 'ar' ? 'ar-KW' : 'en-KW')} <span className="mx-2 opacity-30">/</span> {totalPages.toLocaleString(language === 'ar' ? 'ar-KW' : 'en-KW')}
                </div>
                <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(p => p + 1)} className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-30 active:scale-95 shadow-sm">
                  {i18n.language === 'ar' ? 'التالي' : 'Next'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-40 text-center flex flex-col items-center gap-6">
            <div className="w-20 h-20 bg-slate-50 rounded-[32px] flex items-center justify-center text-4xl grayscale opacity-20">👥</div>
            <div>
              <h4 className="text-sm font-black text-slate-300 uppercase tracking-[0.3em]">{t('noRecords')}</h4>
              <p className="text-xs text-slate-400 font-medium mt-2">{i18n.language === 'ar' ? 'اضبط الفلاتر أو جرب مصطلح بحث مختلف.' : 'Adjust your filters or try a different search term.'}</p>
            </div>
            <button onClick={() => { setFilter(''); setBalanceFilter('all'); }} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest underline underline-offset-4">
              {i18n.language === 'ar' ? 'مسح جميع الفلاتر' : 'Clear All Filters'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeDirectory;
