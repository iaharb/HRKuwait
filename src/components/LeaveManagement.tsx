
import React, { useState, useEffect, useMemo } from 'react';
import { User, LeaveRequest, LeaveType, Employee, PublicHoliday } from '../types/types';
import { dbService, calculateLeaveDays } from '../services/dbService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

interface LeaveManagementProps {
  user: User;
}

const LeaveManagement: React.FC<LeaveManagementProps> = ({ user }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const { notify, confirm } = useNotifications();
  const leaveAppUrl = import.meta.env.VITE_LEAVE_APP_URL || process.env.VITE_LEAVE_APP_URL || '';
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [personalRequests, setPersonalRequests] = useState<LeaveRequest[]>([]);
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [employeeData, setEmployeeData] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(!localStorage.getItem('guide_leave_seen'));

  const [hrEditDays, setHrEditDays] = useState<Record<string, number>>({});
  const [hrIncludeSaturdays, setHrIncludeSaturdays] = useState<Record<string, boolean>>({});
  const [employeeMap, setEmployeeMap] = useState<Record<string, Employee>>({});

  // Form State
  const [isHourBased, setIsHourBased] = useState(false);
  const [formData, setFormData] = useState({
    type: 'Annual' as LeaveType,
    startDate: '',
    endDate: '',
    reason: '',
    durationHours: 1
  });

  // Monthly Quota State
  const [monthlyUsage, setMonthlyUsage] = useState(0);
  const MAX_PERMISSION_HOURS = 8;

  // Pagination states
  const [approvalPage, setApprovalPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const itemsPerPage = 5;

  const holidayDates = useMemo(() => publicHolidays.map(h => h.date), [publicHolidays]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profile, allEmployees, holidayData] = await Promise.all([
        dbService.getEmployeeByName(user.name),
        dbService.getEmployees(),
        dbService.getPublicHolidays()
      ]);

      if (profile) setEmployeeData(profile);
      setPublicHolidays(holidayData);

      const empMap: Record<string, Employee> = {};
      allEmployees.forEach(e => empMap[e.id] = e);
      setEmployeeMap(empMap);

      let filter: any = {};
      const isGlobalViewer = ['Admin', 'HR', 'HR Manager', 'HR Officer', 'Mandoob', 'Payroll Manager', 'Executive'].includes(user.role);
      const isDeptManager = ['Manager', 'Dept Manager'].includes(user.role);

      if (isGlobalViewer) {
        filter = {};
      } else if (isDeptManager) {
        filter = { department: user.department };
      } else {
        filter = { employeeId: user.id };
      }

      const [teamData, personalData] = await Promise.all([
        dbService.getLeaveRequests(filter),
        dbService.getLeaveRequests({ employeeId: user.id })
      ]);

      setRequests(teamData);
      setPersonalRequests(personalData);

      // Calculate monthly usage for short permissions
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const usage = personalData
        .filter(r => r.type === 'ShortPermission' && r.status !== 'Rejected')
        .filter(r => {
          const d = new Date(r.startDate);
          return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        })
        .reduce((sum, r) => sum + (r.durationHours || 0), 0);
      setMonthlyUsage(usage);

      const dayMap: Record<string, number> = {};
      const satMap: Record<string, boolean> = {};

      teamData.forEach(r => {
        const emp = empMap[r.employeeId];
        const defaultIncludeSat = emp ? emp.workDaysPerWeek === 6 : false;
        dayMap[r.id] = r.days;
        satMap[r.id] = defaultIncludeSat;
      });

      setHrEditDays(dayMap);
      setHrIncludeSaturdays(satMap);
    } catch (err) {
      console.error("Fetch leave error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem('guide_leave_seen', 'true');
  };

  const availableBalances = useMemo(() => {
    if (!employeeData || !employeeData.leaveBalances) {
      return { annual: 0, sick: 0, emergency: 0, pending: { annual: 0, sick: 0, emergency: 0 }, hajUsed: false };
    }

    // Optimistic pending deduction: only for requests NOT yet counted by the DB trigger
    // The DB trigger (update_leave_balances) already updates 'used_days' for:
    // Manager_Approved, HR_Approved, Resumed, HR_Finalized, Pushed_To_Payroll, Paid
    const optimisticRequests = personalRequests.filter(r =>
      ['Pending'].includes(r.status)
    );

    // Sum up everything in Pending that will eventually deduct from Annual
    const pendingAnnualPool = optimisticRequests
      .filter(r => r.type !== 'Sick' && r.type !== 'Hajj')
      .reduce((acc, curr) => {
        if (curr.type === 'ShortPermission') return acc + (curr.durationHours || 0) / 8;
        return acc + curr.days;
      }, 0);

    const pending = {
      annual: pendingAnnualPool,
      sick: optimisticRequests.filter(r => r.type === 'Sick').reduce((acc, curr) => acc + curr.days, 0),
      emergency: optimisticRequests.filter(r => r.type === 'Emergency').reduce((acc, curr) => acc + curr.days, 0),
    };

    const balances = employeeData.leaveBalances;

    return {
      annual: Math.max(0, (balances.annual || 0) - (balances.annualUsed || 0) - pendingAnnualPool),
      sick: Math.max(0, (balances.sick || 0) - (balances.sickUsed || 0) - pending.sick),
      emergency: Math.max(0, (balances.emergency || 0) - (balances.emergencyUsed || 0) - pending.emergency),
      shortPermissionLimit: MAX_PERMISSION_HOURS,
      shortPermissionUsed: monthlyUsage,
      hajUsed: balances.hajUsed || false,
      pending
    };
  }, [employeeData, personalRequests, monthlyUsage]);

  const calculationBreakdown = useMemo(() => {
    if (isHourBased) return { total: 0, hours: formData.durationHours };
    if (!formData.startDate || !formData.endDate) return { total: 0, holidays: [], weekends: [] };

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const isFiveDayWorker = employeeData?.workDaysPerWeek === 5;

    let total = 0;
    const holidaysFound: string[] = [];
    const weekendsFound: string[] = [];

    let current = new Date(start.getTime());
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;

      const holiday = publicHolidays.find(h => h.date === dateStr);
      const dayOfWeek = current.getDay();

      if (holiday) {
        holidaysFound.push(`${dateStr} (${holiday.name})`);
      } else {
        total++;
        if (dayOfWeek === 5) {
          weekendsFound.push(`${dateStr} (${language === 'ar' ? 'الجمعة' : 'Friday'})`);
        } else if (dayOfWeek === 6 && isFiveDayWorker) {
          weekendsFound.push(`${dateStr} (${language === 'ar' ? 'السبت' : 'Saturday'})`);
        }
      }
      current.setDate(current.getDate() + 1);
    }

    return { total, holidays: holidaysFound, weekends: weekendsFound };
  }, [formData.startDate, formData.endDate, formData.durationHours, employeeData, publicHolidays, language, isHourBased]);

  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isHourBased) {
      if (!formData.startDate) {
        notify(t('warning'), t('actionRequired'), "warning");
        return;
      }
      const selectedDate = new Date(formData.startDate);
      const minLeadDate = new Date();
      minLeadDate.setHours(0, 0, 0, 0);
      minLeadDate.setDate(minLeadDate.getDate() + 1);

      if (selectedDate < minLeadDate) {
        notify(t('critical'), t('shortPermissionLeadTime'), "error");
        return;
      }

      if (monthlyUsage + formData.durationHours > MAX_PERMISSION_HOURS) {
        notify(t('critical'), t('quotaExceeded'), "error");
        return;
      }
    } else if (formData.type === 'Hajj') {
      if (!employeeData) return;
      const joinDate = new Date(employeeData.joinDate);
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

      if (joinDate > twoYearsAgo) {
        notify(t('critical'), t('hajLeaveMinService'), "error");
        return;
      }
      if (employeeData.leaveBalances.hajUsed) {
        notify(t('critical'), t('hajLeaveUtilized'), "error");
        return;
      }
      if (calculationBreakdown.total > 21) {
        notify(t('warning'), t('hajLeaveMaxDays'), "warning");
        return;
      }
    } else if (calculationBreakdown.total <= 0) {
      notify(t('warning'), t('noneDetected'), "warning");
      return;
    }

    setSubmitting(true);
    try {
      await dbService.createLeaveRequest({
        employeeId: user.id,
        employeeName: user.name,
        department: user.department || employeeData?.department || 'General',
        type: isHourBased ? 'ShortPermission' : formData.type,
        startDate: formData.startDate,
        endDate: isHourBased ? formData.startDate : formData.endDate,
        days: isHourBased ? 0 : calculationBreakdown.total,
        durationHours: isHourBased ? formData.durationHours : undefined,
        reason: formData.reason,
        status: 'Pending',
        managerId: employeeData?.managerId || '00000000-0000-0000-0000-000000000000',
        createdAt: new Date().toISOString(),
        history: []
      }, user);
      setShowForm(false);
      setFormData({ type: 'Annual', startDate: '', endDate: '', reason: '', durationHours: 1 });
      await fetchData();
      notify(t('success'), isHourBased ? t('leaveApprovedMsg') : t('leaveApprovedMsg'), "success");
    } catch (err: any) {
      notify(t('critical'), err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleManagerApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await dbService.updateLeaveRequestStatus(id, 'Manager_Approved', user);
      await fetchData();
      notify(t('success'), t('approveForward'), "success");
    } catch (err: any) {
      notify(t('critical'), err.message, "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleHRApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await dbService.updateLeaveRequestStatus(id, 'HR_Approved', user, "HR pre-approval complete. Awaiting resumption.");
      await fetchData();
      notify(t('success'), t('hrVerifyAuthorize'), "success");
    } catch (err: any) {
      notify(t('critical'), err.message, "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleResumption = async (id: string) => {
    setProcessingId(id);
    try {
      await dbService.updateLeaveRequestStatus(id, 'Resumed', user, "Employee confirmed resumption to work.");
      await fetchData();
      notify(t('success'), t('resumeDuty'), "success");
    } catch (err: any) {
      notify(t('critical'), err.message, "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleHRFinalize = async (req: LeaveRequest) => {
    const finalizedDays = hrEditDays[req.id] || req.days;
    confirm({
      title: t('finalizeSync'),
      message: `${t('confirmedDeductible')} ${finalizedDays} ${language === 'ar' ? 'أيام لـ' : 'days for'} ${req.employeeName}.`,
      confirmText: t('finalizeSync'),
      onConfirm: async () => {
        setProcessingId(req.id);
        try {
          await dbService.finalizeHRApproval(req.id, user, finalizedDays);
          await fetchData();
          notify(t('success'), t('officialRecord'), "success");
        } catch (err: any) {
          notify(t('critical'), err.message, "error");
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const handleReverseLeave = async (id: string) => {
    confirm({
      title: language === 'ar' ? 'عكس معاملة الإجازة؟' : 'Reverse Leave Transaction?',
      message: language === 'ar' ? 'سيتم إلغاء هذه الإجازة. هل تريد عكسها؟' : 'This will cancel the leave completely.',
      confirmText: language === 'ar' ? 'عكس (الاحتفاظ بالرصيد)' : 'Reverse (Keep Balance)',
      onConfirm: async () => {
        setProcessingId(id);
        try {
          await dbService.updateLeaveRequestStatus(id, 'Rejected', user, "Leave transaction reversed by HR/Admin. Balance retained.");
          await fetchData();
          notify(t('success'), 'Leave transaction reversed securely', "success");
        } catch (err: any) {
          notify(t('critical'), err.message, "error");
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const toggleSaturdayInclusion = (req: LeaveRequest) => {
    const emp = employeeMap[req.employeeId];
    if (emp && emp.workDaysPerWeek === 5) return;

    const newValue = !hrIncludeSaturdays[req.id];
    setHrIncludeSaturdays(prev => ({ ...prev, [req.id]: newValue }));

    const recalculated = calculateLeaveDays(req.startDate, req.endDate, req.type, newValue, holidayDates);
    setHrEditDays(prev => ({ ...prev, [req.id]: recalculated }));
  };

  const getLeaveIcon = (type: string) => {
    switch (type) {
      case 'Annual': return '🌴';
      case 'Sick': return '🤒';
      case 'Emergency': return '🚨';
      case 'Maternity': return '👶';
      case 'Hajj': return '🕌';
      case 'ShortPermission': return '🚶';
      default: return '📅';
    }
  };

  const isHrAdmin = ['Admin', 'HR', 'HR Manager', 'HR Officer'].includes(user.role);
  const isManagerAdmin = ['Manager', 'Admin', 'Dept Manager', 'HR Manager', 'Payroll Manager', 'Executive'].includes(user.role);
  const isTeamViewer = user.role !== 'Employee';

  const approvalRequests = requests.filter(r => r.status !== 'HR_Finalized' && r.status !== 'Rejected' && r.status !== 'Paid');
  const paginatedApproval = approvalRequests.slice((approvalPage - 1) * itemsPerPage, approvalPage * itemsPerPage);
  const totalApprovalPages = Math.ceil(approvalRequests.length / itemsPerPage);

  const historicalLog = useMemo(() => {
    return [...requests].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [requests]);

  const paginatedHistory = historicalLog.slice((historyPage - 1) * itemsPerPage, historyPage * itemsPerPage);
  const totalHistoryPages = Math.ceil(historicalLog.length / itemsPerPage);

  const historyTitle = t('workforceLeaveLog');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
            {/* Header Section */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 400, color: 'var(--cds-text-primary)' }}>{t('kuwaitLaborWorkflow')}</h2>
                    <p style={{ color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>{t('automatedCompliance')}</p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className={`cds--btn cds--btn--sm ${showForm ? 'cds--btn--danger' : 'cds--btn--primary'}`}
                >
                    {showForm ? t('cancel') : t('newLeaveRequest')}
                </button>
                {leaveAppUrl && (
                    <button
                        onClick={() => window.open(leaveAppUrl, '_blank', 'noopener,noreferrer')}
                        className="cds--btn cds--btn--sm cds--btn--secondary"
                        title={t('openLeaveApp')}
                    >
                        {language === 'ar' ? 'تطبيق الإجازات' : 'Leave App'}
                    </button>
                )}
            </div>

            {/* Form Section - High Density Carbon Style */}
            {showForm && (
                <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-06)', marginBottom: 'var(--cds-spacing-06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--cds-spacing-06)' }}>
                        <div className="cds--content-switcher" style={{ border: '1px solid var(--cds-border-subtle)' }}>
                            <button type="button" onClick={() => setIsHourBased(false)} className={`cds--content-switcher-btn ${!isHourBased ? 'cds--content-switcher-btn--selected' : ''}`} style={{ height: '32px' }}>{t('fullDayLeave')}</button>
                            <button type="button" onClick={() => setIsHourBased(true)} className={`cds--content-switcher-btn ${isHourBased ? 'cds--content-switcher-btn--selected' : ''}`} style={{ height: '32px' }}>{t('shortPermission')}</button>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-07)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                            {!isHourBased ? (
                                <>
                                    <div className="cds--form-item">
                                        <label className="cds--label">{t('leaveType')}</label>
                                        <select
                                            className="cds--select-input"
                                            value={formData.type}
                                            onChange={e => setFormData({ ...formData, type: e.target.value as LeaveType })}
                                            style={{ height: '40px', background: 'var(--cds-background)' }}
                                        >
                                            <option value="Annual">🌴 {t('annualArt70')}</option>
                                            <option value="Sick">🤒 {t('sickArt69')}</option>
                                            <option value="Emergency">🚨 {t('emergencyLeave')}</option>
                                            <option value="Maternity">👶 {t('maternityLeave')}</option>
                                            <option value="Hajj">🕌 {t('hajLeaveArt47')}</option>
                                        </select>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-05)' }}>
                                        <div className="cds--form-item">
                                            <label className="cds--label">{language === 'ar' ? 'من' : 'From'}</label>
                                            <input required type="date" className="cds--text-input" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} style={{ height: '40px', background: 'var(--cds-background)' }} />
                                        </div>
                                        <div className="cds--form-item">
                                            <label className="cds--label">{language === 'ar' ? 'إلى' : 'To'}</label>
                                            <input required type="date" className="cds--text-input" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} style={{ height: '40px', background: 'var(--cds-background)' }} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="cds--form-item">
                                        <label className="cds--label">{language === 'ar' ? 'تاريخ الإذن' : 'Permission Date'}</label>
                                        <input required type="date" min={tomorrowStr} className="cds--text-input" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} style={{ height: '40px', background: 'var(--cds-background)' }} />
                                    </div>
                                    <div className="cds--form-item">
                                        <label className="cds--label">{t('duration')}</label>
                                        <div className="cds--content-switcher" style={{ border: '1px solid var(--cds-border-subtle)' }}>
                                            <button type="button" onClick={() => setFormData({ ...formData, durationHours: 1 })} className={`cds--content-switcher-btn ${formData.durationHours === 1 ? 'cds--content-switcher-btn--selected' : ''}`} style={{ flex: 1, height: '32px' }}>1h</button>
                                            <button type="button" onClick={() => setFormData({ ...formData, durationHours: 2 })} className={`cds--content-switcher-btn ${formData.durationHours === 2 ? 'cds--content-switcher-btn--selected' : ''}`} style={{ flex: 1, height: '32px' }}>2h</button>
                                        </div>
                                    </div>
                                </>
                            )}
                            <div className="cds--form-item">
                                <label className="cds--label">{t('reason')}</label>
                                <textarea
                                    className="cds--text-area"
                                    placeholder={t('reasonRequest')}
                                    value={formData.reason}
                                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                                    style={{ background: 'var(--cds-background)', minHeight: '80px' }}
                                />
                            </div>
                        </div>

                        <div style={{ background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-05)' }}>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-05)', textTransform: 'uppercase' }}>{t('calcAudit')}</h4>
                            
                            {!isHourBased ? (
                                formData.startDate && formData.endDate ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-03)' }}>
                                            <span style={{ fontSize: '2rem', fontWeight: 300 }}>{calculationBreakdown.total} <span style={{ fontSize: '0.875rem' }}>DAYS</span></span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-05)', marginTop: 'var(--cds-spacing-03)' }}>
                                            <div>
                                                <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-support-error)', marginBottom: '4px' }}>HOLIDAYS</p>
                                                {calculationBreakdown.holidays.length > 0 ? 
                                                    calculationBreakdown.holidays.map((h, i) => <div key={i} style={{ fontSize: '0.75rem' }}>• {h}</div>) : 
                                                    <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>None</div>
                                                }
                                            </div>
                                            <div>
                                                <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: '4px' }}>WEEKENDS</p>
                                                {calculationBreakdown.weekends.length > 0 ? 
                                                    calculationBreakdown.weekends.map((w, i) => <div key={i} style={{ fontSize: '0.75rem' }}>• {w}</div>) : 
                                                    <div style={{ fontSize: '0.75rem', opacity: 0.5 }}>None</div>
                                                }
                                            </div>
                                        </div>
                                    </div>
                                ) : <p style={{ fontSize: '0.875rem', opacity: 0.5, textAlign: 'center', marginTop: 'var(--cds-spacing-07)' }}>{t('enterDatesPrompt')}</p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-03)' }}>
                                        <span style={{ fontSize: '2rem', fontWeight: 300 }}>{formData.durationHours} <span style={{ fontSize: '0.875rem' }}>HOURS</span></span>
                                    </div>
                                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontStyle: 'italic' }}>
                                        Quota: {monthlyUsage}h / 8h used this month.
                                    </p>
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={submitting || (isHourBased ? !formData.startDate : calculationBreakdown.total <= 0)} 
                                className="cds--btn cds--btn--primary" 
                                style={{ width: '100%', marginTop: 'var(--cds-spacing-07)' }}
                            >
                                {submitting ? 'Authenticating...' : t('submitApp').toUpperCase()}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-08)' }}>
                {/* Main Content: Logs and Feeds */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
                    
                    {/* Execution Feed for Managers/HR */}
                    {isTeamViewer && approvalRequests.length > 0 && (
                        <div style={{ background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                            <div style={{ padding: 'var(--cds-spacing-04)', background: 'var(--cds-layer-01)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                                <h3 style={{ fontSize: '0.75rem', fontWeight: 600 }}>APPROVAL QUEUE</h3>
                                <span className="cds--tag cds--tag--blue cds--tag--sm">{approvalRequests.length} PENDING</span>
                            </div>
                            <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                                <thead>
                                    <tr>
                                        <th>EMPLOYEE</th>
                                        <th>DETAILS</th>
                                        <th>STATUS</th>
                                        <th style={{ textAlign: 'right' }}>ACTIONS</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedApproval.map(req => (
                                        <tr key={req.id} style={{ height: '32px' }}>
                                            <td>
                                                <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{req.employeeName}</div>
                                                <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{req.department}</div>
                                            </td>
                                            <td>{getLeaveIcon(req.type)} {req.type} ({req.days || req.durationHours}{req.days ? 'd' : 'h'})</td>
                                            <td><span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--cds-interactive-01)' }}>{req.status.replace('_', ' ').toUpperCase()}</span></td>
                                            <td style={{ textAlign: 'right' }}>
                                                {req.status === 'Pending' && <button onClick={() => handleManagerApprove(req.id)} className="cds--btn cds--btn--ghost cds--btn--sm">Authorize</button>}
                                                {req.status === 'Manager_Approved' && isHrAdmin && <button onClick={() => handleHRApprove(req.id)} className="cds--btn cds--btn--ghost cds--btn--sm">Review</button>}
                                                {req.status === 'Resumed' && isHrAdmin && <button onClick={() => handleHRFinalize(req)} className="cds--btn cds--btn--primary cds--btn--sm">Finalize</button>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Historical Log */}
                    <div style={{ background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                        <div style={{ padding: 'var(--cds-spacing-04)', background: 'var(--cds-layer-01)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                            <h3 style={{ fontSize: '0.75rem', fontWeight: 600 }}>LEAVE HISTORY</h3>
                        </div>
                        <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                            <thead>
                                <tr>
                                    <th>WORKER</th>
                                    <th>TYPE</th>
                                    <th>PERIOD</th>
                                    <th>DAYS</th>
                                    <th>STATUS</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paginatedHistory.map(req => (
                                    <tr key={req.id} style={{ height: '32px' }}>
                                        <td>{req.employeeName}</td>
                                        <td>{getLeaveIcon(req.type)} {req.type}</td>
                                        <td>{req.startDate}</td>
                                        <td>{req.days || req.durationHours}{req.days ? 'd' : 'h'}</td>
                                        <td>
                                            {req.employeeId === user.id && (req.status === 'HR_Approved' || (req.type === 'ShortPermission' && req.status === 'Manager_Approved')) ? (
                                                <button onClick={() => handleResumption(req.id)} className="cds--btn cds--btn--primary cds--btn--sm">RESUME</button>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{req.status.toUpperCase()}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {totalHistoryPages > 1 && (
                            <div style={{ padding: 'var(--cds-spacing-03)', display: 'flex', justifyContent: 'center', gap: 'var(--cds-spacing-05)', borderTop: '1px solid var(--cds-border-subtle)' }}>
                                <button disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)} className="cds--btn cds--btn--ghost cds--btn--sm">PREV</button>
                                <span style={{ fontSize: '0.75rem', alignSelf: 'center' }}>{historyPage} / {totalHistoryPages}</span>
                                <button disabled={historyPage === totalHistoryPages} onClick={() => setHistoryPage(p => p + 1)} className="cds--btn cds--btn--ghost cds--btn--sm">NEXT</button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right Sidebar: Balances and Analytics */}
                <div style={{ width: '100%', maxWidth: '300px', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
                    <div style={{ background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-05)' }}>
                        <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-06)', textTransform: 'uppercase' }}>LEAVE BALANCES</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
                            {[
                                { label: t('annualArt70'), val: availableBalances.annual, max: 30, color: 'var(--cds-interactive-01)' },
                                { label: t('sickThreshold'), val: availableBalances.sick, max: 45, color: 'var(--cds-support-error)' },
                                { label: 'Short Permission', val: availableBalances.shortPermissionLimit - availableBalances.shortPermissionUsed, max: 8, color: 'var(--cds-support-info)' }
                            ].map((b, i) => (
                                <div key={i}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--cds-spacing-02)' }}>
                                        <span style={{ fontSize: '0.75rem' }}>{b.label}</span>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{b.val} / {b.max}</span>
                                    </div>
                                    <div style={{ height: '4px', background: 'var(--cds-layer-01)', width: '100%', position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: b.color, width: `${(b.val / b.max) * 100}%`, transition: 'width 0.5s' }}></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-05)', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                        <p><strong>Note:</strong> {t('balanceLogic')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LeaveManagement;
