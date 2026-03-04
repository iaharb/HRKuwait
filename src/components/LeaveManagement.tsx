
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

    const pendingRequests = personalRequests.filter(r =>
      ['Pending', 'Manager_Approved', 'HR_Approved', 'Resumed'].includes(r.status)
    );

    // Sum up everything that deducts from Annual
    const pendingAnnualPool = pendingRequests
      .filter(r => r.type !== 'Sick' && r.type !== 'Hajj')
      .reduce((acc, curr) => {
        if (curr.type === 'ShortPermission') return acc + (curr.durationHours || 0) / 8;
        return acc + curr.days;
      }, 0);

    const pending = {
      annual: pendingAnnualPool,
      sick: pendingRequests.filter(r => r.type === 'Sick').reduce((acc, curr) => acc + curr.days, 0),
      emergency: pendingRequests.filter(r => r.type === 'Emergency').reduce((acc, curr) => acc + curr.days, 0),
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
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {showGuide && (
        <div className="bg-slate-900 p-8 rounded-[40px] text-white shadow-xl shadow-indigo-500/10 flex flex-col md:flex-row items-center gap-8 border border-white/5 animate-in slide-in-from-top-4 duration-500 relative overflow-hidden text-start">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none text-6xl">⚖️</div>
          <div className="w-16 h-16 bg-indigo-500/20 backdrop-blur-xl rounded-3xl flex items-center justify-center text-3xl shrink-0">📋</div>
          <div className="flex-1 space-y-2">
            <h3 className="text-xl font-black tracking-tight">{t('guideLeaveTitle')}</h3>
            <p className="text-slate-400 font-medium leading-relaxed opacity-90">{t('guideLeaveDesc')}</p>
          </div>
          <button
            onClick={dismissGuide}
            className="px-8 py-3 bg-white text-slate-900 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition-all active:scale-95 shadow-lg"
          >
            {t('gotIt')}
          </button>
        </div>
      )}

      <div className="flex justify-between items-center text-start">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 tracking-tight">{t('kuwaitLaborWorkflow')}</h2>
          <p className="text-slate-500 text-sm">{t('automatedCompliance')}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`px-6 py-3 rounded-2xl font-bold transition-all shadow-lg active:scale-95 ${showForm ? 'bg-slate-200 text-slate-600 shadow-none' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20'
            }`}
        >
          {showForm ? t('cancel') : t('newLeaveRequest')}
        </button>
      </div>

      {showForm && (
        <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm animate-in zoom-in-95 duration-200">
          <div className="flex justify-center mb-10">
            <div className="bg-slate-100 p-1 rounded-2xl flex border border-slate-200">
              <button onClick={() => setIsHourBased(false)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isHourBased ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>{t('fullDayLeave')}</button>
              <button onClick={() => setIsHourBased(true)} className={`px-8 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isHourBased ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>{t('shortPermission')}</button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4 space-y-6 text-start">
              {!isHourBased ? (
                <>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{t('leaveType')}</label>
                    <select
                      className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-700"
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value as LeaveType })}
                    >
                      <option value="Annual">🌴 {t('annualArt70')}</option>
                      <option value="Sick">🤒 {t('sickArt69')}</option>
                      <option value="Emergency">🚨 {t('emergencyLeave')}</option>
                      <option value="Maternity">👶 {t('maternityLeave')}</option>
                      <option value="Hajj">🕌 {t('hajLeaveArt47')}</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{t('leavePeriod')}</label>
                    <div className="space-y-3">
                      <input required type="date" className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                      <p className="text-center text-[10px] text-slate-400 font-black uppercase">{t('to')}</p>
                      <input required type="date" className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{language === 'ar' ? 'تاريخ الإذن' : 'Permission Date'}</label>
                    <input required type="date" min={tomorrowStr} className="w-full px-5 py-4 rounded-2xl border border-slate-200 bg-slate-50 text-xs font-bold" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">{t('hoursLabel')}</label>
                    <div className="grid grid-cols-2 gap-4">
                      <button type="button" onClick={() => setFormData({ ...formData, durationHours: 1 })} className={`py-4 rounded-2xl font-black text-lg border transition-all ${formData.durationHours === 1 ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>1h</button>
                      <button type="button" onClick={() => setFormData({ ...formData, durationHours: 2 })} className={`py-4 rounded-2xl font-black text-lg border transition-all ${formData.durationHours === 2 ? 'bg-slate-900 text-white border-slate-900 shadow-xl' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>2h</button>
                    </div>
                  </div>
                  <div className="p-5 bg-amber-50 rounded-3xl border border-amber-100">
                    <p className="text-[10px] text-amber-800 font-bold leading-relaxed">
                      ⚠️ {language === 'ar' ? 'يجب تقديم الطلب قبل يوم واحد على الأقل.' : 'Must be requested at least 1 day in advance.'}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-8 space-y-8 text-start">
              <div className="bg-slate-50 p-8 rounded-[32px] border border-slate-200 min-h-[200px]">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{t('calcAudit')}</h4>
                {!isHourBased ? (
                  formData.startDate && formData.endDate ? (
                    <div className="space-y-4">
                      <div className="flex items-end justify-between border-b border-slate-200 pb-4">
                        <div>
                          <p className="text-4xl font-black text-slate-900">{calculationBreakdown.total} <span className="text-sm text-slate-400">{t('billableDays')}</span></p>
                        </div>
                        <div className="text-right">
                          {formData.type === 'Hajj' && (
                            <span className="text-[10px] px-3 py-1 bg-amber-100 text-amber-700 rounded-lg font-black uppercase mb-2 block">🕌 Life Event Leave</span>
                          )}
                          <span className="text-[10px] px-3 py-1 bg-white border border-slate-200 rounded-lg font-black text-slate-500 uppercase">
                            {employeeData?.workDaysPerWeek} {t('workingDaysWeek')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-rose-500 uppercase tracking-widest">{t('holidaysDeducted')} ({calculationBreakdown.holidays?.length || 0})</p>
                          {calculationBreakdown.holidays && calculationBreakdown.holidays.length > 0 ? (
                            calculationBreakdown.holidays.map((h, i) => <p key={i} className="text-[11px] font-bold text-slate-600">🏛️ {h}</p>)
                          ) : <p className="text-[11px] text-slate-400 italic">{t('noneDetected')}</p>}
                        </div>
                        <div className="space-y-2">
                          <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">{t('weekendsConsumed')} ({calculationBreakdown.weekends?.length || 0})</p>
                          {calculationBreakdown.weekends && calculationBreakdown.weekends.length > 0 ? (
                            calculationBreakdown.weekends.map((w, i) => <p key={i} className="text-[11px] font-bold text-slate-600">🗓️ {w}</p>)
                          ) : <p className="text-[11px] text-slate-400 italic">{t('noneDetected')}</p>}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-300 italic text-sm text-center">
                      {t('enterDatesPrompt')}
                    </div>
                  )
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-end justify-between border-b border-slate-200 pb-6">
                      <div>
                        <p className="text-5xl font-black text-slate-900">{formData.durationHours} <span className="text-lg text-slate-400">Hours</span></p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{t('shortPermission')}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{t('maxPermissionHours')}</p>
                        <p className="text-xl font-black text-slate-900">{monthlyUsage} / 8h Used</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      Note: Short permissions must be authorized by your immediate line manager before leaving the office perimeter. Quota resets every month.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-6">
                <textarea
                  placeholder={t('reasonRequest')}
                  className="flex-1 px-5 py-4 rounded-2xl border border-slate-200 bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-sm min-h-[80px]"
                  value={formData.reason}
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                />
                <button type="submit" disabled={submitting || (isHourBased ? !formData.startDate : calculationBreakdown.total <= 0)} className="px-12 py-6 bg-indigo-600 text-white rounded-3xl font-black text-sm shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-30 active:scale-95 transition-all">
                  {submitting ? '...' : t('submitApp')}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {(user.role !== 'Employee' || isHrAdmin) && (
            <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
              <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center text-start">
                <h3 className="font-bold text-slate-800 tracking-tight">{t('execApprovalFeed')}</h3>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('pendingDecisions')}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {paginatedApproval.map((req) => {
                  const emp = employeeMap[req.employeeId];
                  const includeSat = hrIncludeSaturdays[req.id] ?? (emp?.workDaysPerWeek === 6);

                  return (
                    <div key={req.id} className="p-8 hover:bg-slate-50/30 transition-all text-start">
                      <div className="flex flex-col gap-6">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl border border-slate-200">
                              {getLeaveIcon(req.type)}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 text-lg flex items-center gap-2">
                                {req.employeeName}
                                <span className="text-[9px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded uppercase font-black">{req.department}</span>
                              </p>
                              <p className="text-xs text-slate-500 font-medium tracking-tight">
                                {req.type === 'ShortPermission'
                                  ? `${req.startDate} • ${req.durationHours}h Permission`
                                  : `${req.startDate} → ${req.endDate} (${req.days} days)`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className={`px-4 py-2 rounded-full text-[9px] font-black uppercase tracking-widest shadow-sm border ${req.status === 'Pending' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                              req.status === 'Manager_Approved' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                req.status === 'HR_Approved' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                  'bg-rose-100 text-rose-700 border-rose-200'
                              }`}>
                              {t(req.status.toLowerCase().replace('_', '')) || req.status.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-col gap-4">
                          {isManagerAdmin && req.status === 'Pending' && (
                            <button
                              disabled={processingId === req.id}
                              onClick={() => handleManagerApprove(req.id)}
                              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs shadow-lg hover:bg-black transition-all active:scale-95"
                            >
                              {req.type === 'ShortPermission' ? t('authorize') : t('approveForward')}
                            </button>
                          )}

                          {isHrAdmin && req.status === 'Manager_Approved' && req.type !== 'ShortPermission' && (
                            <button
                              disabled={processingId === req.id}
                              onClick={() => handleHRApprove(req.id)}
                              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs shadow-lg hover:bg-indigo-700 transition-all active:scale-95"
                            >
                              {t('hrVerifyAuthorize')}
                            </button>
                          )}

                          {isHrAdmin && req.status === 'Resumed' && (
                            <div className="w-full bg-slate-50 p-8 rounded-[32px] border border-slate-200 space-y-6">
                              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                                <h4 className="text-xs font-black text-slate-900 uppercase">{t('payrollReconHub')}</h4>
                                {req.type !== 'ShortPermission' && (
                                  <div className="flex items-center gap-4">
                                    <span className="text-[10px] font-bold text-slate-500">{t('includeSat')}</span>
                                    <button onClick={() => toggleSaturdayInclusion(req)} className={`w-10 h-5 rounded-full relative transition-colors ${includeSat ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                      <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${includeSat ? (language === 'ar' ? 'right-[22px]' : 'left-[22px]') : (language === 'ar' ? 'right-0.5' : 'left-0.5')}`}></div>
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold text-slate-500 uppercase">{req.type === 'ShortPermission' ? t('hoursLabel') : t('confirmedDeductible')}</p>
                                <input
                                  type="number"
                                  className="w-20 px-3 py-2 border border-slate-300 rounded-xl font-black text-sm bg-white"
                                  value={req.type === 'ShortPermission' ? req.durationHours : (hrEditDays[req.id] || req.days)}
                                  readOnly={req.type === 'ShortPermission'}
                                  onChange={e => !req.type && setHrEditDays({ ...hrEditDays, [req.id]: parseInt(e.target.value) || 0 })}
                                />
                              </div>

                              <button onClick={() => handleHRFinalize(req)} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs shadow-lg hover:bg-indigo-700 transition-all">
                                {t('finalizeSync')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {approvalRequests.length === 0 && (
                  <div className="p-16 text-center text-slate-400 font-medium italic">{t('allTasksDone')}</div>
                )}
              </div>

              {totalApprovalPages > 1 && (
                <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-center gap-4">
                  <button disabled={approvalPage === 1} onClick={() => setApprovalPage(p => p - 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all hover:bg-white shadow-sm">Prev</button>
                  <span className="text-[10px] font-black flex items-center">{approvalPage} / {totalApprovalPages}</span>
                  <button disabled={approvalPage === totalApprovalPages} onClick={() => setApprovalPage(p => p + 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all hover:bg-white shadow-sm">Next</button>
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center text-start">
              <h3 className="font-bold text-slate-800 tracking-tight">{historyTitle}</h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{historicalLog.length} {t('requestsFound')}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {paginatedHistory.map(req => (
                <div key={req.id} className="p-8 hover:bg-slate-50/30 transition-all text-start">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-2xl border border-slate-200">
                        {getLeaveIcon(req.type)}
                      </div>
                      <div>
                        {/* Enhancement: Always show employee name for anyone looking at a team log (Admins, HR, Mandoobs, Managers) */}
                        {isTeamViewer && (
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">{req.employeeName}</p>
                        )}
                        <p className="font-bold text-slate-900 text-sm">
                          {language === 'ar' ? t(req.type.toLowerCase()) : req.type} {t('leaves')}
                        </p>
                        {/* Enhancement: Visual date pills for clearer Start/End visibility */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <div className="flex items-center bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                            <span className="text-[8px] font-black text-indigo-400 uppercase me-2">{language === 'ar' ? 'من' : 'START'}</span>
                            <span className="text-[11px] font-black text-indigo-900">{req.startDate}</span>
                          </div>
                          {req.type !== 'ShortPermission' && (
                            <div className="flex items-center bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                              <span className="text-[8px] font-black text-slate-400 uppercase me-2">{language === 'ar' ? 'إلى' : 'END'}</span>
                              <span className="text-[11px] font-black text-slate-700">{req.endDate}</span>
                            </div>
                          )}
                          <div className="bg-slate-900 px-3 py-1 rounded-lg text-[9px] font-black text-white uppercase shadow-sm">
                            {req.type === 'ShortPermission' ? `${req.durationHours}h` : `${req.days} ${t('billableDays')}`}
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${req.status === 'Paid' || req.status === 'HR_Finalized' ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-indigo-100 text-indigo-700 border-indigo-200'
                      }`}>
                      {t(req.status.toLowerCase().replace('_', '')) || req.status.replace('_', ' ')}
                    </span>
                  </div>

                  {(req.employeeId === user.id && (req.status === 'HR_Approved' || (req.type === 'ShortPermission' && req.status === 'Manager_Approved'))) && (
                    <div className="mt-6 bg-indigo-50 p-6 rounded-[24px] border border-indigo-100 flex flex-col md:flex-row items-center justify-between gap-4">
                      <p className="text-[11px] text-indigo-800 font-bold italic leading-relaxed text-start">{t('resumptionAuthorize')}</p>
                      <button
                        disabled={processingId === req.id}
                        onClick={() => handleResumption(req.id)}
                        className="px-8 py-3 bg-indigo-600 text-white rounded-2xl font-black text-[9px] uppercase tracking-[0.15em] hover:bg-indigo-700 shadow-lg active:scale-95 transition-all w-full md:w-auto"
                      >
                        {t('confirmResumption')}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {historicalLog.length === 0 && (
                <div className="p-16 text-center text-slate-400 font-medium italic">{t('noRecords')}</div>
              )}
            </div>

            {totalHistoryPages > 1 && (
              <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-center gap-4">
                <button disabled={historyPage === 1} onClick={() => setHistoryPage(p => p - 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all hover:bg-white shadow-sm">Prev</button>
                <span className="text-[10px] font-black flex items-center">{historyPage} / {totalHistoryPages}</span>
                <button disabled={historyPage === totalHistoryPages} onClick={() => setHistoryPage(p => p + 1)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase disabled:opacity-30 transition-all hover:bg-white shadow-sm">Next</button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 text-start">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                {t('availableBalances')}
              </h3>
              <span className="text-[8px] font-black text-slate-400 border border-slate-200 px-2 py-0.5 rounded">{t('netTotal')}</span>
            </div>
            <div className="space-y-8">
              {[
                { label: t('annualArt70'), val: availableBalances.annual, pending: availableBalances.pending.annual, max: 30, color: 'indigo', unit: 'd' },
                { label: t('sickThreshold'), val: availableBalances.sick, pending: availableBalances.pending.sick, max: 45, color: 'rose', unit: 'd' },
                { label: t('maxPermissionHours'), val: availableBalances.shortPermissionLimit - availableBalances.shortPermissionUsed, pending: 0, max: 8, color: 'blue', unit: 'h' }
              ].map((b, i) => (
                <div key={i}>
                  <div className="flex justify-between items-center mb-2 px-1 text-start">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{b.label}</span>
                    <div className="text-right">
                      <span className="text-xs font-black text-slate-900">{b.val} / {b.max}{b.unit}</span>
                    </div>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden relative border border-slate-200 shadow-inner">
                    <div
                      className={`absolute top-0 h-full transition-all duration-1000 ${b.color === 'rose' ? 'bg-rose-500' : (b.color === 'indigo' ? 'bg-indigo-600' : 'bg-blue-500')} ${language === 'ar' ? 'right-0' : 'left-0'}`}
                      style={{ width: `${Math.min(100, (b.val / b.max) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              ))}

              <div className="pt-4 mt-4 border-t border-slate-100">
                <div className="flex justify-between items-center mb-2 text-start">
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Haj Life Event</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${availableBalances.hajUsed ? 'bg-slate-100 text-slate-400 border-slate-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
                    {availableBalances.hajUsed ? 'Used' : 'Available'}
                  </span>
                </div>
                <p className="text-[9px] text-slate-400 italic text-start">Entitled after 2 years of service.</p>
              </div>

              <div className="mt-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 text-start">
                <p className="text-[9px] text-slate-500 leading-relaxed italic">
                  {t('balanceLogic')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LeaveManagement;
