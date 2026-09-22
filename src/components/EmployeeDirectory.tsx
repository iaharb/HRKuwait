
import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee, User, LeaveBalances, KPITemplate } from '../types/types';
import { useTranslation } from 'react-i18next';
import { supabase } from '../services/supabaseClient.ts';
import { useNotifications } from './NotificationSystem.tsx';
import AISearchBar from './AISearchBar.tsx';

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
    <div style={{ width: '100%', background: 'var(--cds-layer-01)', height: '4px', overflow: 'hidden' }}>
      <div
        style={{ 
          height: '100%', 
          background: isOver ? 'var(--cds-support-error)' : color,
          width: `${pct}%`,
          transition: 'width 0.7s ease'
        }}
      />
    </div>
  );
};

// ─── Expandable employee detail panel ─────────────────────────────────────────
const EmployeeDetailPanel: React.FC<{ emp: Employee, currentUser: User, kpiTemplates: KPITemplate[] }> = ({ emp, currentUser, kpiTemplates }) => {
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

  // New KPI States
  const [assignedKpis, setAssignedKpis] = useState<string[]>(emp.kpiTemplateIds || []);
  const [latestScore, setLatestScore] = useState<number | null>(null);
  const [latestEval, setLatestEval] = useState<any | null>(null);
  const [isSavingKpis, setIsSavingKpis] = useState(false);
  const [bonusHistory, setBonusHistory] = useState<any[]>([]);

  useEffect(() => {
    // Enforce default department template
    const defaultTmpl = kpiTemplates.find(t => t.department === emp.department);
    if (defaultTmpl && !assignedKpis.includes(defaultTmpl.id)) {
      setAssignedKpis(prev => [...prev, defaultTmpl.id]);
    }
    
    // Fetch latest scoring if any
    dbService.getEmployeeEvaluations().then(evals => {
      const empEvals = evals.filter(e => e.employeeId === emp.id).sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      if (empEvals.length > 0) {
        setLatestScore(empEvals[0].totalScore);
        setLatestEval(empEvals[0]);
        // Automatically adjust the manager slider based on KPI factor (factor is 0 to 1.5 roughly)
        // 0.6 = 3, 0.85+ = 4+, 1.0+ = 5
        let suggestedRating = 3;
        const s = empEvals[0].totalScore;
        if (s >= 1.0) suggestedRating = 5;
        else if (s >= 0.85) suggestedRating = 4;
        else if (s >= 0.6) suggestedRating = 3;
        else if (s >= 0.4) suggestedRating = 2;
        else suggestedRating = 1;

        setRating(suggestedRating);
        // PE is now read-only for records; Profit Share becomes the active nomination
        setJustification(`PE Score: ${(s * 100).toFixed(1)}% (${suggestedRating}/5 Points). Verified for ${empEvals[0].quarter}.`);
      }

      // Fetch full history of PR, PS and CB
      supabase.from('variable_compensation')
        .select('*')
        .eq('employee_id', emp.id)
        .in('comp_type', ['PERFORMANCE_BONUS', 'PROFIT_SHARE', 'BONUS'])
        .order('created_at', { ascending: false })
        .then(({ data }) => {
          if (data) setBonusHistory(data);
        });
    });
  }, [emp.id]);

  const saveKpiAssignments = async () => {
    setIsSavingKpis(true);
    try {
      await dbService.updateEmployee(emp.id, { kpiTemplateIds: assignedKpis });
      notify("Success", "KPI Templates assigned successfully.", "success");
    } catch (e: any) {
      notify("Error", e.message, "error");
    } finally {
      setIsSavingKpis(false);
    }
  };

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
    <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', margin: 'var(--cds-spacing-05)', display: 'flex', flexDirection: 'column' }}>
      {/* Tab Row */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`cds--tabs__nav-item ${tab === t.id ? 'cds--tabs__nav-item--selected' : ''}`}
            style={{ 
              padding: 'var(--cds-spacing-04) var(--cds-spacing-06)', 
              fontSize: '0.75rem', 
              fontWeight: tab === t.id ? 600 : 400,
              background: tab === t.id ? 'var(--cds-background)' : 'transparent',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--cds-interactive-01)' : '2px solid transparent',
              cursor: 'pointer',
              color: tab === t.id ? 'var(--cds-text-primary)' : 'var(--cds-text-secondary)'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

          {/* Leave Balances */}
          {tab === 'balances' && (
            <div style={{ padding: 'var(--cds-spacing-06)' }}>
              {loadingBal ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Loading balances…</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
                  {leaveTypes.map(lt => {
                    const remaining = Math.max(0, lt.entitled - lt.used);
                    return (
                      <div key={lt.key} className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-02)' }}>
                            <span style={{ fontSize: '1rem' }}>{lt.icon}</span>
                            <span style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{lt.label}</span>
                          </div>
                          <span style={{ fontSize: '0.625rem', padding: '2px 6px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', fontWeight: 600 }}>
                            {lt.used}/{lt.entitled}
                          </span>
                        </div>
                        <BalanceBar used={lt.used} entitled={lt.entitled} color="var(--cds-interactive-01)" />
                        <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', fontWeight: 600 }}>{remaining} {lt.key === 'ShortPerm' ? 'hrs' : 'days'} remaining</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Allowances */}
          {tab === 'allowances' && (
            <div style={{ padding: 'var(--cds-spacing-06)' }}>
              {emp.allowances?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  {emp.allowances.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--cds-background)', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
                        <span style={{ fontSize: '1rem' }}>{a.isHousing ? '🏠' : '💼'}</span>
                        <div>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                            {i18n.language === 'ar' && a.nameArabic ? a.nameArabic : a.name}
                          </p>
                          <span className="cds--tag cds--tag--blue" style={{ fontSize: '0.625rem', marginTop: '2px' }}>
                            {a.type}
                          </span>
                        </div>
                      </div>
                      <p style={{ fontSize: '1rem', fontWeight: 400 }}>
                        {a.type === 'Fixed'
                          ? `${Number(a.value).toLocaleString()} KWD`
                          : `${a.value}%`}
                      </p>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--cds-interactive-01)', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', color: '#ffffff', marginTop: 'var(--cds-spacing-03)' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Total Allowances</span>
                    <span style={{ fontSize: '1.125rem', fontWeight: 600 }}>
                      {emp.allowances.reduce((s, a) =>
                        s + (a.type === 'Fixed' ? Number(a.value) : (emp.salary * Number(a.value) / 100)), 0
                      ).toLocaleString()} KWD
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', textAlign: 'center', padding: 'var(--cds-spacing-08)' }}>No allowances on record.</p>
              )}
            </div>
          )}

          {/* Documents */}
          {tab === 'documents' && (
            <div style={{ padding: 'var(--cds-spacing-06)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
                {[
                  { icon: '🪪', label: 'Civil ID', value: emp.civilId, expiry: emp.civilIdExpiry },
                  { icon: '🛂', label: 'Passport', value: emp.passportNumber, expiry: emp.passportExpiry },
                  { icon: '📋', label: 'Izn Amal', value: null, expiry: emp.iznAmalExpiry },
                  { icon: '🏦', label: 'IBAN', value: emp.iban, expiry: null },
                  { icon: '🔐', label: 'PIFSS No.', value: emp.pifssNumber, expiry: null },
                ].map((doc, i) => {
                  const status = getDocStatus(doc.expiry || undefined);
                  return (
                    <div key={i} className="cds--tile" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--cds-background)', padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
                        <span style={{ fontSize: '1.25rem' }}>{doc.icon}</span>
                        <div>
                          <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{doc.label}</p>
                          <p style={{ fontSize: '0.875rem', fontWeight: 600, marginTop: '2px' }}>
                            {doc.value || doc.expiry || '—'}
                          </p>
                        </div>
                      </div>
                      {doc.expiry && (
                        <span className={`cds--tag ${status.label === 'Expired' ? 'cds--tag--red' : 'cds--tag--green'}`} style={{ fontSize: '0.625rem' }}>{status.label}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Performance & Bonus Workflow */}
          {tab === 'performance' && (
            <div style={{ padding: 'var(--cds-spacing-06)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>KPI Templates & Scoring</h4>
                <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '2px' }}>Operational KPI management and operational factor tracking.</p>
              </div>

              <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--cds-spacing-07)' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', display: 'block', marginBottom: 'var(--cds-spacing-04)' }}>Assigned KPI Templates</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cds-spacing-03)', marginBottom: 'var(--cds-spacing-05)' }}>
                      {kpiTemplates.map(tmpl => {
                        const isAssigned = assignedKpis.includes(tmpl.id);
                        const expectedDefaultTmpl = kpiTemplates.find(t => t.department === emp.department);
                        const isDefault = expectedDefaultTmpl ? expectedDefaultTmpl.id === tmpl.id : false;
                        const canEdit = ['Manager', 'Executive', 'Admin', 'HR Manager'].includes(currentUser.role);
                        if (!canEdit && !isAssigned) return null;

                        return (
                          <button
                            key={tmpl.id}
                            disabled={!canEdit || isDefault}
                            onClick={() => {
                              if (canEdit && !isDefault) {
                                if (isAssigned) setAssignedKpis(assignedKpis.filter(id => id !== tmpl.id));
                                else setAssignedKpis([...assignedKpis, tmpl.id]);
                              }
                            }}
                            className={`cds--tag ${isAssigned ? 'cds--tag--blue' : 'cds--tag--disabled'}`}
                            style={{ cursor: canEdit && !isDefault ? 'pointer' : 'default', border: isAssigned ? 'none' : '1px solid var(--cds-border-subtle)' }}
                          >
                            {isAssigned && '✓ '} {tmpl.title} {isDefault && '(Default)'}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                       {kpiTemplates.filter(t => assignedKpis.includes(t.id)).map(tmpl => (
                           <div key={tmpl.id} style={{ background: 'var(--cds-layer-01)', padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)' }}>
                               <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>{tmpl.title} Breakdown</p>
                               {tmpl.kpis.map((k, idx) => {
                                   const evalScore = latestEval?.kpiScores?.find((s:any) => s.name === `[${tmpl.title}] ${k.name}`);
                                   return (
                                     <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--cds-background)', padding: 'var(--cds-spacing-03) var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', marginBottom: '2px' }}>
                                        <div style={{ flex: 1, fontSize: '0.75rem' }}>{k.name}</div>
                                        <div style={{ width: '60px', textAlign: 'center', fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>W: {k.weight}%</div>
                                        <div style={{ width: '100px', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: evalScore ? 'var(--cds-interactive-01)' : 'var(--cds-text-disabled)' }}>
                                            {evalScore ? `${evalScore.score}%` : 'Pending'}
                                        </div>
                                     </div>
                                   )
                               })}
                           </div>
                       ))}
                    </div>

                    {['Manager', 'Executive', 'Admin', 'HR Manager'].includes(currentUser.role) && (
                      <button
                        onClick={saveKpiAssignments}
                        disabled={isSavingKpis}
                        className="cds--btn cds--btn--primary cds--btn--sm"
                        style={{ marginTop: 'var(--cds-spacing-05)' }}
                      >
                        {isSavingKpis ? 'Saving...' : 'Save Assignments'}
                      </button>
                    )}
                  </div>
                  <div style={{ width: '180px', background: 'var(--cds-layer-01)', padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-02)' }}>Latest Score</p>
                    {latestScore !== null ? (
                      <p style={{ fontSize: '2rem', fontWeight: 600, color: latestScore >= 0.85 ? 'var(--cds-support-success)' : 'var(--cds-text-primary)' }}>
                        {(latestScore * 100).toFixed(0)}%
                      </p>
                    ) : (
                      <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-disabled)' }}>Not Evaluated</p>
                    )}
                  </div>
                </div>
              </div>

              {['Manager', 'Executive'].includes(emp.role) && ['Admin', 'Executive', 'HR Manager'].includes(currentUser.role) && (
                <>
                  <div>
                    <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Profit Sharing Nomination</h4>
                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-interactive-01)', marginTop: '2px', fontStyle: 'italic' }}>Executive & Leadership Review Level</p>
                  </div>

                  <div className="cds--tile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-07)', padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                      <div>
                        <label className="cds--label">Review Period</label>
                        <select value={period} onChange={e => setPeriod(e.target.value)} className="cds--select-input">
                          <option value="2025 Annual">2025 Annual Review</option>
                          <option value="2026 Annual">2026 Annual Review</option>
                        </select>
                      </div>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--cds-spacing-02)' }}>
                          <label className="cds--label" style={{ marginBottom: 0 }}>Performance Rating</label>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-interactive-01)' }}>{rating} / 5</span>
                        </div>
                        <input
                          type="range" min="1" max="5" step="0.5"
                          value={rating} onChange={(e) => setRating(Number(e.target.value))}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="cds--label">Manager Justification</label>
                      <textarea
                        value={justification} onChange={(e) => setJustification(e.target.value)}
                        className="cds--text-input"
                        style={{ minHeight: '100px', resize: 'none' }}
                      ></textarea>
                    </div>

                    <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--cds-border-subtle)', paddingTop: 'var(--cds-spacing-06)', marginTop: 'var(--cds-spacing-02)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)' }}>
                        <div style={{ width: '40px', height: '40px', background: 'var(--cds-layer-01)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--cds-border-subtle)' }}>📈</div>
                        <div>
                          <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Recommended Bonus</p>
                          <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>{bonusPct}% <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--cds-text-secondary)' }}>(≈ {(emp.salary * (bonusPct / 100)).toLocaleString()} KWD)</span></p>
                        </div>
                      </div>
                      <button
                        onClick={submitPerformanceBonus}
                        disabled={isSubmittingBonus}
                        className="cds--btn cds--btn--primary"
                      >
                        {isSubmittingBonus ? 'Submitting...' : 'Initiate Review'}
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div style={{ borderTop: '1px solid var(--cds-border-subtle)', paddingTop: 'var(--cds-spacing-07)' }}>
                <h4 style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--cds-spacing-05)' }}>Payment & Performance History</h4>
                {bonusHistory.length > 0 ? (
                  <div style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                    <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                      <thead style={{ background: 'var(--cds-layer-01)' }}>
                        <tr>
                          <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>Period</th>
                          <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>Category</th>
                          <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>Notes</th>
                          <th style={{ fontSize: '0.625rem', fontWeight: 600, textAlign: 'right' }}>Amount</th>
                          <th style={{ fontSize: '0.625rem', fontWeight: 600, textAlign: 'center' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bonusHistory.map((h, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '0.75rem' }}>{h.sub_type || 'N/A'}</td>
                            <td>
                              <span className="cds--tag cds--tag--blue" style={{ fontSize: '0.625rem' }}>{h.comp_type.replace('_', ' ')}</span>
                            </td>
                            <td style={{ fontSize: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.notes || '—'}</td>
                            <td style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'right' }}>{h.amount.toLocaleString()} KWD</td>
                            <td style={{ textAlign: 'center' }}>
                              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: h.status === 'APPROVED_FOR_PAYROLL' ? 'var(--cds-support-success)' : 'var(--cds-support-warning)', margin: '0 auto' }}></div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: 'var(--cds-spacing-08)', border: '1px dashed var(--cds-border-subtle)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--cds-text-disabled)' }}>
                    No historical records available.
                  </div>
                )}
              </div>
            </div>
          )}
    </div>
  );
};

// ─── Main Directory Component ──────────────────────────────────────────────────
const EmployeeDirectory: React.FC<EmployeeDirectoryProps> = ({ user, onAddClick, onEditClick }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [filter, setFilter] = useState('');
  const [aiFilteredIds, setAiFilteredIds] = useState<string[] | null>(null);
  const [balanceFilter, setBalanceFilter] = useState<'all' | 'low' | 'overdue'>('all');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [kpiTemplates, setKpiTemplates] = useState<KPITemplate[]>([]);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const templates = await dbService.getKPITemplates();
      setKpiTemplates(templates);
      let data = await dbService.getEmployees();
      setEmployees(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchEmployees(); }, [user.id, user.department, user.role]);

  const filtered = useMemo(() => {
    if (aiFilteredIds !== null) {
      return employees.filter(e => aiFilteredIds.includes(e.id));
    }
    const search = filter.toLowerCase();
    return employees.filter(e => {
      const textMatch = e.name.toLowerCase().includes(search)
        || (e.nameArabic && e.nameArabic.includes(search))
        || e.position.toLowerCase().includes(search)
        || e.department.toLowerCase().includes(search);
      if (!textMatch) return false;
      return true;
    });
  }, [employees, filter]);

  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedData = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  const canManage = ['Admin', 'Manager', 'HR', 'HR Manager', 'HR Officer', 'Executive'].includes(user.role);

  const toggleExpand = (id: string) => setExpandedId(prev => prev === id ? null : id);

  return (
    <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.8s ease' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-06)' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600, letterSpacing: '0.5px' }}>WORKFORCE_NODE_REGISTRY</h2>
          <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontFamily: 'monospace', textTransform: 'uppercase' }}>System Status: Operational | Total Nodes: {employees.length}</p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--cds-spacing-05)', alignItems: 'center' }}>
          <div style={{ position: 'relative', width: '300px' }}>
            <AISearchBar
                data={employees}
                onFilter={setAiFilteredIds}
                placeholder="Filter Registry..."
                contextMessage="EMPLOYEE_REGISTRY_SCAN - Searching for active nodes."
                extractInfo={emp => `${emp.name} | ${emp.department} | ${emp.position} | ${emp.id}`}
                onQueryChange={(q) => { setFilter(q); setExpandedId(null); }}
                initialValue={filter}
            />
          </div>
          {canManage && (
            <button className="cds--btn cds--btn--primary cds--btn--sm" onClick={onAddClick} style={{ height: '32px' }}>
              Initialize New Node
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--cds-spacing-10)', textAlign: 'center' }}>
          <div className="cds--loading cds--loading--small" style={{ margin: '0 auto' }}></div>
          <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: 'var(--cds-spacing-04)', fontFamily: 'monospace' }}>SYNCHRONIZING_REGISTRY...</p>
        </div>
      ) : (
        <div className="cds--registry-grid">
          {filtered.map(emp => {
            const isExpanded = expandedId === emp.id;
            const isActive = emp.status === 'Active';
            return (
              <div 
                key={emp.id} 
                className={`cds--registry-card ${isExpanded ? 'active' : ''}`}
                onClick={() => toggleExpand(emp.id)}
                style={{ cursor: 'pointer', position: 'relative' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--cds-spacing-05)' }}>
                   <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                      <div className={`cds--status-indicator ${isActive ? 'cds--status-indicator--active' : 'cds--status-indicator--inactive'}`}></div>
                      <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>NODE_{emp.id.slice(0, 8)}</span>
                   </div>
                   <div style={{ fontSize: '0.625rem', padding: '2px 6px', border: '1px solid var(--cds-border-subtle)', color: 'var(--cds-interactive-01)', fontFamily: 'monospace' }}>
                      LVL_{emp.role === 'Admin' ? 'EX' : 'OP'}
                   </div>
                </div>

                <div style={{ marginBottom: 'var(--cds-spacing-05)' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '2px' }}>{language === 'ar' && emp.nameArabic ? emp.nameArabic : emp.name}</h3>
                  <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontFamily: 'monospace' }}>{emp.position}</p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-03)', padding: 'var(--cds-spacing-04)', background: 'rgba(0,0,0,0.1)', border: '1px solid var(--cds-border-subtle)', marginBottom: 'var(--cds-spacing-05)' }}>
                   <div>
                      <p style={{ fontSize: '0.5rem', color: 'var(--cds-text-disabled)', textTransform: 'uppercase' }}>Division</p>
                      <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>{emp.department}</p>
                   </div>
                   <div>
                      <p style={{ fontSize: '0.5rem', color: 'var(--cds-text-disabled)', textTransform: 'uppercase' }}>Joined</p>
                      <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>{emp.joinDate ? new Date(emp.joinDate).toLocaleDateString('en-GB') : '—'}</p>
                   </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                   <div style={{ display: 'flex', gap: '2px' }}>
                      <div style={{ width: '4px', height: '4px', background: 'var(--cds-interactive-01)' }}></div>
                      <div style={{ width: '4px', height: '4px', background: 'var(--cds-interactive-01)', opacity: 0.6 }}></div>
                      <div style={{ width: '4px', height: '4px', background: 'var(--cds-interactive-01)', opacity: 0.3 }}></div>
                   </div>
                   {canManage && (
                     <button 
                       className="cds--btn cds--btn--ghost cds--btn--sm"
                       onClick={(e) => { e.stopPropagation(); onEditClick?.(emp); }}
                       style={{ height: '24px', fontSize: '0.625rem', textTransform: 'uppercase', padding: '0 8px' }}
                     >
                       MODIFY_NODE
                     </button>
                   )}
                </div>

                {isExpanded && (
                  <div style={{ gridColumn: '1 / -1', marginTop: 'var(--cds-spacing-07)', animation: 'fade-in 0.4s ease' }} onClick={(e) => e.stopPropagation()}>
                    <EmployeeDetailPanel emp={emp} currentUser={user} kpiTemplates={kpiTemplates} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EmployeeDirectory;
