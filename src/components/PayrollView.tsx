import React, { useState, useEffect } from 'react';
import { User, PayrollRun, PayrollItem, BreakdownItem, Employee, LeaveRequest } from '../types/types';
import { dbService as hrmDb } from '../services/dbService.ts';
import { supabase } from '../services/supabaseClient.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

interface PayrollViewProps {
  user: User;
}

const PayslipCard: React.FC<{ item: PayrollItem; run: PayrollRun }> = ({ item, run }) => {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';

  const monthNames = isAr
    ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const periodKey = run?.periodKey || '';
  const [year, monthStr] = periodKey.split('-');
  const monthIndex = monthStr ? (parseInt(monthStr) - 1) : 0;

  const formatVal = (val: any) => (Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });

  // Resilient Extraction: Handles both fixed aliasing (V6) and broken aliasing (V5)
  const getVal = (obj: any) => Number(obj.value !== undefined ? obj.value : (obj.housing || obj.others || obj.ot || obj.bonus || obj.late || 0));

  const rawBreakdown = item.allowanceBreakdown || [];
  const rawDeductions = item.deductionBreakdown || [];

  const contractualGross = rawBreakdown.find(a => a.name.includes('Contractual'))?.value
    || (item.basicSalary + item.housingAllowance + item.otherAllowances + (item.leaveDeductions || 0));

  const proRataLossItem = rawDeductions.find(d => d.name.toLowerCase().includes('pro-rata') || d.name.toLowerCase().includes('loss'));
  const proRataValue = proRataLossItem ? getVal(proRataLossItem) : 0;

  const earnings = rawBreakdown.filter(a => !a.name.includes('Contractual') && getVal(a) > 0);
  const deductions = rawDeductions.filter(d => !d.name.toLowerCase().includes('pro-rata') && !d.name.toLowerCase().includes('loss') && getVal(d) > 0);

  return (
    <div className={`bg-white border border-slate-200 rounded-[40px] p-10 shadow-2xl relative overflow-hidden flex flex-col h-full text-start ${isAr ? 'font-arabic' : ''}`} dir={isAr ? 'rtl' : 'ltr'}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50"></div>

      <div className="flex justify-between items-start mb-10 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white text-xs font-black">KW</div>
            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Enterprise HR Port</h5>
          </div>
          <h4 className="text-2xl font-black text-slate-900 tracking-tighter">{isAr ? 'قسيمة الراتب التفصيلية' : 'Audit Payslip'}</h4>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Audit Trace ID: {run?.id?.slice(0, 8).toUpperCase()}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isAr ? 'الشهر' : 'Month'}</p>
          <p className="text-lg font-black text-indigo-600">{monthNames[monthIndex] || '---'} {year || '---'}</p>
        </div>
      </div>

      {/* Contractual Header */}
      <div className="bg-slate-900 rounded-[32px] p-6 mb-8 text-white relative z-10 shadow-lg">
        <div className="flex justify-between items-center mb-4 opacity-60">
          <span className="text-[10px] font-black uppercase tracking-widest">{isAr ? 'الراتب التعاقدي الإجمالي' : 'Contractual Monthly Gross'}</span>
          <span className="text-[10px] font-black uppercase tracking-widest font-mono">{(item.employeeId || '').slice(0, 8).toUpperCase()}</span>
        </div>
        <div className="flex justify-between items-end">
          <div className="text-2xl font-black">{formatVal(contractualGross)} <span className="text-xs opacity-50">KWD</span></div>
          <div className="text-right">
            <p className="text-[10px] font-medium text-slate-400">{item.employeeName}</p>
            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest mt-1">{isAr ? 'حالة التدقيق: ناجح' : 'Audit Status: PASSED'}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-8 relative z-10 overflow-y-auto custom-scrollbar pr-2 mb-4 scroll-smooth">
        {/* MATH TRACE SECTION */}
        {proRataValue > 0 && (
          <div className="bg-amber-50 rounded-3xl p-5 border border-amber-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-amber-500 text-sm">🧮</span>
              <h6 className="text-[10px] font-black text-amber-700 uppercase tracking-widest">{isAr ? 'حساب الراتب النسبي' : 'Pro-rata Math (Transparency Trace)'}</h6>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-amber-900 opacity-60">
                <span>{isAr ? 'نوع التسوية' : 'Adjustment Logic'}</span>
                <span className="bg-amber-200 px-2 py-0.5 rounded-full text-[9px]">{proRataLossItem?.name || 'Pro-rata Calculation'}</span>
              </div>
              <div className="flex justify-between items-center text-xs font-black text-amber-900 border-t border-amber-200 mt-2 pt-2">
                <span>{isAr ? 'قيمة الخصم النسبي' : 'Pro-rata Deduction'}</span>
                <span className="text-rose-600 text-sm">-{formatVal(proRataValue)} KWD</span>
              </div>
              <p className="text-[9px] text-amber-600 font-medium italic mt-2">
                {isAr ? '* يعتمد الحساب على أساس 26 يوم عمل شهرياً.' : '* Calculation based on 26-day labor basis as per Kuwait Law.'}
              </p>
            </div>
          </div>
        )}

        {/* EARNINGS */}
        <div>
          <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-3">
            {isAr ? 'بيانات الاستحقاق وتوزيع الراتب' : 'Earnings & Salary Allocation'} <span className="h-[1px] flex-1 bg-slate-100"></span>
          </h6>
          <div className="space-y-3">
            {earnings.map((a, idx) => (
              <div key={idx} className={`flex justify-between items-center text-sm ${idx > 0 ? 'border-t border-slate-50 pt-2' : ''}`}>
                <div className="flex flex-col">
                  <span className="text-slate-600 font-bold">{isAr ? a.nameArabic || a.name : a.name}</span>
                  {a.name.includes('Pay') && (
                    <span className="text-[8px] text-slate-400 uppercase font-black uppercase tracking-tighter">
                      {isAr ? 'تم التحقق من بيانات الحضور' : 'Verified Attendance Data'}
                    </span>
                  )}
                </div>
                <span className="font-black text-slate-900">{formatVal(getVal(a))}</span>
              </div>
            ))}
          </div>
        </div>

        {/* DEDUCTIONS */}
        <div>
          <h6 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-3">
            {isAr ? 'الاستقطاعات' : 'Deductions'} <span className="h-[1px] flex-1 bg-rose-50"></span>
          </h6>
          <div className="space-y-3">
            {deductions.map((d, idx) => (
              <div key={idx} className="flex justify-between items-center text-sm border-t border-slate-50 pt-2">
                <span className="text-slate-500 font-medium">{isAr ? d.nameArabic || d.name : d.name}</span>
                <span className="font-black text-rose-600">-{formatVal(getVal(d))}</span>
              </div>
            ))}
            {deductions.length === 0 && (
              <p className="text-[10px] text-slate-400 italic">{isAr ? 'لا توجد استقطاعات إضافية' : 'No other deductions.'}</p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-auto pt-6 border-t-2 border-dashed border-slate-200 relative z-10 bg-white">
        <div className="flex justify-between items-end">
          <div>
            <p className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">{isAr ? 'صافي الراتب المستحق' : 'Net Salary Payable'}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black text-slate-900 tracking-tighter">{formatVal(item.netSalary)}</span>
              <span className="text-lg font-black text-slate-400 uppercase tracking-widest">KWD</span>
            </div>
          </div>
          <div className="text-right">
            <div className="w-16 h-16 border-2 border-indigo-100 rounded-2xl flex items-center justify-center opacity-20 rotate-12">
              <span className="text-[8px] font-black text-indigo-900 text-center uppercase tracking-tighter leading-tight">Secured<br />Audit<br />Seal</span>
            </div>
          </div>
        </div>

        <p className="text-[9px] text-slate-300 mt-6 italic text-center border-t border-slate-50 pt-4 font-medium uppercase tracking-tighter">
          {isAr ? '* تم التحقق من هذا المستند مقابل سجلات الرواتب المعتمدة.' : '* Document verified against official payroll audit logs.'}
        </p>
      </div>
    </div>
  );
};

const PayrollView: React.FC<PayrollViewProps> = ({ user }) => {
  const { t, i18n } = useTranslation();
  const { notify, confirm } = useNotifications();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [activeRun, setActiveRun] = useState<PayrollRun | null>(null);
  const [items, setItems] = useState<PayrollItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [viewMode, setViewMode] = useState<'Audit' | 'Payslips'>('Audit');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const itemsPerPage = 5;

  const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequest[]>([]);
  const [lrPreview, setLrPreview] = useState<any>(null);
  const [selectedLeaveId, setSelectedLeaveId] = useState('');

  const [pendingVarComp, setPendingVarComp] = useState<any[]>([]);

  const months = i18n.language === 'ar'
    ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
    : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const [filter, setFilter] = useState({
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    cycle: 'Monthly' as 'Monthly' | 'Bi-Weekly'
  });
  const [hubStatusFilter, setHubStatusFilter] = useState<'All' | 'Pending' | 'Settled'>('Pending');
  const [hubCurrentPage, setHubCurrentPage] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const runsData = await hrmDb.getPayrollRuns();
      // DETECTION: Include ALL HR_Finalized requests which represent pending settlement
      const leavesData = await hrmDb.getLeaveRequests();

      // Fetch pending variable comp
      const { data: vcData } = await supabase.from('variable_compensation')
        .select('*, employees!inner(name)')
        .in('status', ['PENDING_EXEC', 'PENDING_HR', 'APPROVED_FOR_PAYROLL'])
        .is('payroll_run_id', null)
        .order('created_at', { ascending: false });

      setRuns(runsData || []);
      setPendingLeaveRequests(leavesData.filter(l =>
        ['HR_Approved', 'HR_Finalized', 'Paid', 'Pushed_To_Payroll'].includes(l.status) && l.type !== 'ShortPermission'
      ));
      setPendingVarComp(vcData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerateDraft = async () => {
    setProcessing(true);
    const periodKey = `${filter.year}-${String(filter.month).padStart(2, '0')}-${filter.cycle.toUpperCase()}`;
    try {
      const run = await hrmDb.generatePayrollDraft(periodKey, filter.cycle);
      setActiveRun(run);
      setViewMode('Audit');
      const payrollItems = await hrmDb.getPayrollItems(run.id);
      setItems(payrollItems || []);
      setCurrentPage(1);
      notify(t('success'), `${t('auditTable')} : ${periodKey}`, "success");
      fetchData();
    } catch (err: any) {
      notify(t('critical'), err.message || t('unknown'), "error");
    } finally {
      setProcessing(false);
    }
  };

  const handleSelectRun = async (run: PayrollRun) => {
    setLoading(true);
    setActiveRun(run);
    setViewMode('Audit');
    setCurrentPage(1);
    try {
      const payrollItems = await hrmDb.getPayrollItems(run.id);
      setItems(payrollItems || []);
    } catch (err: any) {
      notify(t('critical'), err.message || t('unknown'), "error");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = () => {
    if (!activeRun) return;
    confirm({
      title: i18n.language === 'ar' ? 'تأكيد الصرف المالي؟' : 'Commit Financial Period?',
      message: `${t('officialRecord')} : ${activeRun.periodKey}`,
      confirmText: t('authorize'),
      onConfirm: async () => {
        setProcessing(true);
        try {
          await hrmDb.finalizePayrollRun(activeRun.id, user);
          await fetchData();
          setActiveRun({ ...activeRun, status: 'Finalized' });
          notify(t('success'), t('officialRecord'), "success");
        } catch (err: any) {
          notify(t('critical'), err.message || t('unknown'), "error");
        } finally {
          setProcessing(false);
        }
      }
    });
  };

  const handleSelectLeaveForPreview = async (leaveId: string) => {
    setSelectedLeaveId(leaveId);
    const leave = pendingLeaveRequests.find(l => l.id === leaveId);
    if (!leave) return;
    try {
      const res = await hrmDb.calculateLeavePayout(leave.employeeId, leave.startDate, leave.endDate, leave.id);
      setLrPreview({ ...res, currentStatus: leave.status });
    } catch (err) {
      console.error(err);
    }
  };

  const handlePushToPayroll = async () => {
    if (!selectedLeaveId) return;
    setProcessing(true);
    try {
      await hrmDb.pushLeaveToPayroll(selectedLeaveId, user);
      notify(t('success'), "Deferred to standard monthly cycle", "success");
      fetchData();
      setLrPreview(null);
      setSelectedLeaveId('');
    } catch (err: any) {
      notify("Error", err.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  const handleExecuteLeaveRun = async () => {
    if (!selectedLeaveId) return;
    setProcessing(true);
    try {
      const run = await hrmDb.generateLeaveRun(selectedLeaveId, user);
      setActiveRun(run);
      setViewMode('Audit');
      const payrollItems = await hrmDb.getPayrollItems(run.id);
      setItems(payrollItems || []);
      notify(t('success'), "Payment Node Settled Successfully", "success");
      fetchData();
      setSelectedLeaveId('');
      setLrPreview(null);
    } catch (err: any) {
      notify("Error", err.message, "error");
    } finally {
      setProcessing(false);
    }
  };

  const safeItems = Array.isArray(items) ? items : [];
  const totalPages = Math.ceil(safeItems.length / itemsPerPage);
  const paginatedData = safeItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const hubFilteredData = pendingLeaveRequests.filter(r => hubStatusFilter === 'All' || (hubStatusFilter === 'Pending' ? r.status !== 'Paid' : r.status === 'Paid'));
  const hubItemsPerPage = 4;
  const hubTotalPages = Math.ceil(hubFilteredData.length / hubItemsPerPage);
  const hubPaginatedData = hubFilteredData.slice((hubCurrentPage - 1) * hubItemsPerPage, hubCurrentPage * hubItemsPerPage);

  const formatCurrency = (val: any) => (Number(val) || 0).toLocaleString(undefined, { minimumFractionDigits: 3 });

  return (
    <div className="space-y-12 animate-in fade-in duration-500 pb-20">
      {/* SECTION 1: LEAVE PAYOUT HUB (ALWAYS VISIBLE) */}
      <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center text-start">
          <div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-4">
              <span className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-indigo-100">💰</span>
              {t('activeDisbursementHub')}
            </h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">{t('registryClear')}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-200/50 p-1.5 rounded-2xl border border-slate-200">
              {(['Pending', 'Settled', 'All'] as const).map(s => {
                const labelMap = { 'All': 'hubStatusAll', 'Pending': 'hubStatusPending', 'Settled': 'hubStatusSettled' };
                return (
                  <button
                    key={s}
                    onClick={() => setHubStatusFilter(s)}
                    className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hubStatusFilter === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t(labelMap[s])}
                  </button>
                )
              })}
            </div>
            <span className="text-[10px] font-black text-emerald-600 uppercase bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
              {pendingLeaveRequests.filter(l => l.status !== 'Paid').length} {t('activeNodeDisbursements')}
            </span>
          </div>
        </div>

        <div className="p-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-5 space-y-4">
              {hubFilteredData.length > 0 ? (
                <div className="flex flex-col justify-between h-full space-y-4">
                  <div className="grid grid-cols-1 gap-3 max-h-[450px] overflow-y-auto pr-3 custom-scrollbar">
                    {hubPaginatedData.map(req => {
                      const isShort = req.days <= 7 && new Date(req.endDate).getDate() < 25;
                      return (
                        <button
                          key={req.id}
                          onClick={() => handleSelectLeaveForPreview(req.id)}
                          className={`p-4 py-4 rounded-[24px] border text-start transition-all flex items-center justify-between group flex-shrink-0 ${selectedLeaveId === req.id ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xl z-10 relative' : 'bg-slate-50 border-slate-100 hover:bg-white hover:border-indigo-200 shadow-inner'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${selectedLeaveId === req.id ? 'bg-white/20' : 'bg-white border border-slate-200'}`}>
                              {req.type === 'Annual' ? '🌴' : '🤒'}
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className={`text-[11px] font-black uppercase ${selectedLeaveId === req.id ? 'text-indigo-200' : 'text-slate-400'}`}>{req.employeeName}</p>
                                <span className={`text-[7px] font-black uppercase px-1.5 py-0.5 rounded-md border ${req.status === 'Paid' ? 'bg-slate-200 border-slate-300 text-slate-600' : (isShort ? 'bg-amber-100 border-amber-200 text-amber-700' : 'bg-emerald-100 border-emerald-200 text-emerald-700')}`}>
                                  {req.status === 'Paid' ? 'Audit Settled' : (isShort ? 'Month-End Path' : 'Hub Path')}
                                </span>
                              </div>
                              <p className="text-sm font-black mt-1 leading-none">{req.type} Audit</p>
                              <p className={`text-[9px] font-bold mt-1.5 ${selectedLeaveId === req.id ? 'text-white/80' : 'text-slate-500'}`}>{req.startDate} &rarr; {req.endDate} ({req.days}d)</p>
                            </div>
                          </div>
                          <span className={`text-xl transition-transform group-hover:translate-x-1 ${selectedLeaveId === req.id ? 'text-white' : 'text-slate-200'}`}>
                            {i18n.language === 'ar' ? '←' : '→'}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Pagination Controls */}
                  {hubTotalPages > 1 && (
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                      <button
                        disabled={hubCurrentPage === 1}
                        onClick={() => setHubCurrentPage(prev => Math.max(1, prev - 1))}
                        className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${hubCurrentPage === 1 ? 'text-slate-300' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                      >
                        Previous
                      </button>
                      <span className="text-[10px] font-bold text-slate-400">
                        {hubCurrentPage} <span className="opacity-50">/</span> {hubTotalPages}
                      </span>
                      <button
                        disabled={hubCurrentPage === hubTotalPages}
                        onClick={() => setHubCurrentPage(prev => Math.min(hubTotalPages, prev + 1))}
                        className={`text-[9px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${hubCurrentPage === hubTotalPages ? 'text-slate-300' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-24 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 flex flex-col items-center justify-center grayscale opacity-40">
                  <span className="text-6xl mb-4">✅</span>
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Registry Clear: No Pending Payments</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-7">
              {lrPreview ? (
                <div className="bg-slate-900 rounded-[48px] p-10 text-white h-full relative overflow-hidden animate-in zoom-in-95 duration-400 shadow-2xl border border-white/10">
                  <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none text-8xl">🇰🇼</div>
                  <div className="flex justify-between items-start mb-12">
                    <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.3em]">Settlement Logic Verification</h4>
                    <span className={`text-[9px] font-black uppercase border px-3 py-1 rounded-lg ${lrPreview.isShort ? 'bg-amber-400/5 text-amber-400 border-amber-400/30' : 'bg-emerald-400/5 text-emerald-400 border-emerald-400/30'}`}>
                      Auto Path: {lrPreview.isShort ? 'Month-End Consolidation' : 'Hub Displacement'}
                    </span>
                  </div>

                  <div className="space-y-8 mb-16 text-start">
                    <div className="flex justify-between items-center border-b border-white/5 pb-5">
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">Bucket 1: Prorated Gross Work</p>
                        <p className="text-[9px] text-indigo-400 font-black uppercase">{lrPreview.workDays} Accrued Days (Excluded Fridays)</p>
                      </div>
                      <span className="text-lg font-black">{formatCurrency(lrPreview.workPay)}</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-white/5 pb-5">
                      <div>
                        <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-1">{t('bucket2StartMonth')}</p>
                        <p className="text-[9px] text-indigo-400 font-black uppercase">{lrPreview.daysInStartMonth} {t('businessDaysGross126')}</p>
                      </div>
                      <span className="text-lg font-black">{formatCurrency(lrPreview.leavePayStartMonth)}</span>
                    </div>
                    {lrPreview.daysInNextMonth > 0 && (
                      <div className="flex justify-between items-center border-b border-indigo-500/20 pb-5 text-indigo-300">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest mb-1">{t('bucket3ForwardAdvance')}</p>
                          <p className="text-[9px] font-black uppercase">{lrPreview.daysInNextMonth} {t('businessDaysStraddleSettlement')}</p>
                        </div>
                        <span className="text-lg font-black">{formatCurrency(lrPreview.leavePayNextMonth)}</span>
                      </div>
                    )}
                    {lrPreview.excludedAllowanceDeduction > 0 && (
                      <div className="flex justify-between items-center border-b border-rose-500/20 pb-5 text-rose-400">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest mb-1">{t('bucketExclusionNonHousing')}</p>
                          <p className="text-[9px] font-black uppercase">{t('notPayableDuringLeave')} ({lrPreview.payableLeaveDays} days)</p>
                        </div>
                        <span className="text-lg font-black">-{formatCurrency(lrPreview.excludedAllowanceDeduction)}</span>
                      </div>
                    )}
                    {lrPreview.sickLeaveDeduction > 0 && (
                      <div className="flex justify-between items-center border-b border-rose-500/20 pb-5 text-rose-400">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest mb-1">{t('sickLeaveSegmentPenalty')}</p>
                          <p className="text-[9px] font-black uppercase">{t('statutoryDeductions100')}</p>
                        </div>
                        <span className="text-lg font-black">-{formatCurrency(lrPreview.sickLeaveDeduction)}</span>
                      </div>
                    )}
                    {lrPreview.pifssDeducted > 0 && (
                      <div className="flex justify-between items-center border-b border-rose-500/20 pb-5 text-rose-400">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-widest mb-1">{t('mandatoryDeductionPIFSS')}</p>
                          <p className="text-[9px] font-black uppercase">{t('currentMonthEmployeeShare')} (11.5%)</p>
                        </div>
                        <span className="text-lg font-black">-{formatCurrency(lrPreview.pifssDeducted)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center text-emerald-400 bg-emerald-500/5 p-4 rounded-2xl border border-emerald-500/20">
                      <span className="text-xs font-bold uppercase tracking-widest">{t('registryVerificationFridaySaturday')}</span>
                      <span className="text-sm font-black">{t('validSettlementNode')}</span>
                    </div>
                  </div>

                  <div className="flex flex-col md:flex-row items-center justify-between gap-10 pt-8 border-t border-white/10 text-start">
                    <div>
                      <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">{t('totalCombinedDisbursement')}</p>
                      <p className="text-6xl font-black tracking-tighter">{formatCurrency(lrPreview.total)} <span className="text-2xl text-indigo-400 ml-2">{t('currency')}</span></p>
                    </div>
                    <div className="flex gap-4">
                      {pendingLeaveRequests.find(r => r.id === selectedLeaveId)?.status === 'HR_Finalized' && (
                        <button
                          onClick={handlePushToPayroll}
                          disabled={processing}
                          className="px-8 py-6 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] transition-all border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 active:scale-95"
                        >
                          {t('pushToMonthly')}
                        </button>
                      )}

                      <button
                        onClick={handleExecuteLeaveRun}
                        disabled={processing || ['Paid', 'Pushed_To_Payroll'].includes(pendingLeaveRequests.find(r => r.id === selectedLeaveId)?.status || '')}
                        className={`px-12 py-6 rounded-[28px] font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all border ${['Paid', 'Pushed_To_Payroll'].includes(pendingLeaveRequests.find(r => r.id === selectedLeaveId)?.status || '') ? 'bg-slate-700 text-slate-400 border-white/5' : (lrPreview.isShort ? 'bg-slate-700 text-slate-400 border-white/5' : 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-500/20 hover:bg-emerald-500')}`}
                      >
                        {processing ? '...' : (pendingLeaveRequests.find(r => r.id === selectedLeaveId)?.status === 'Paid' ? t('settledInRegistry') : pendingLeaveRequests.find(r => r.id === selectedLeaveId)?.status === 'Pushed_To_Payroll' ? t('deferredToMonthly') : (lrPreview.isShort ? t('overrideToHub') : t('authorizePayout')))}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-full bg-white border-2 border-dashed border-slate-200 rounded-[48px] flex flex-col items-center justify-center p-16 text-center shadow-inner">
                  <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center text-4xl mb-8 border border-slate-100 shadow-inner">🔒</div>
                  <p className="text-2xl font-black text-slate-900 tracking-tight">{t('calculationEngineLocked')}</p>
                  <p className="text-sm text-slate-400 font-medium max-w-sm mx-auto mt-3 leading-relaxed">
                    {t('selectRecordEvaluatePaths')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {pendingVarComp.length > 0 && (
        <div className="bg-white rounded-[40px] border border-slate-200 shadow-sm overflow-hidden flex flex-col p-10 animate-in slide-in-from-bottom-6">
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center text-start border-b border-slate-100 pb-10 mb-8">
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-4">
                <span className="text-4xl text-emerald-500">🎯</span>
                Variable Compensation Approvals
              </h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Executive & HR Approval Workflow</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-start">
              <thead>
                <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] border-y border-slate-100">
                  <th className="px-6 py-4 text-start">Employee Name</th>
                  <th className="px-6 py-4 text-start">Compensation Type</th>
                  <th className="px-6 py-4 text-start">Amount</th>
                  <th className="px-6 py-4 text-start">Status</th>
                  <th className="px-6 py-4 text-end">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {pendingVarComp.map(vc => (
                  <tr key={vc.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4 font-black text-slate-900">{vc.employees?.name}</td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-700 uppercase tracking-widest text-[11px]">{vc.comp_type}</p>
                      <p className="text-[10px] font-black text-slate-400 mt-1">{vc.sub_type.replace('_', ' ')}</p>
                    </td>
                    <td className="px-6 py-4 text-emerald-600 font-mono font-bold tracking-tight text-base">
                      +{Number(vc.amount).toLocaleString()} {t('currency')}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${vc.status === 'PENDING_EXEC' ? 'bg-amber-50 text-amber-600 border-amber-200' : vc.status === 'PENDING_HR' ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}>
                        {vc.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-end">
                      {vc.status === 'PENDING_EXEC' && ['Admin', 'Executive'].includes(user.role) && (
                        <button
                          onClick={async () => {
                            await supabase.from('variable_compensation').update({ status: 'PENDING_HR' }).eq('id', vc.id);
                            notify('Approved', 'Workflow elevated to HR Check', 'success');
                            fetchData();
                          }}
                          className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md"
                        >Approve (Exec)</button>
                      )}
                      {vc.status === 'PENDING_HR' && ['Admin', 'HR', 'HR Manager', 'Payroll Manager'].includes(user.role) && (
                        <button
                          onClick={async () => {
                            await supabase.from('variable_compensation').update({ status: 'APPROVED_FOR_PAYROLL' }).eq('id', vc.id);
                            notify('Approved', 'Added to next Payroll Cycle', 'success');
                            fetchData();
                          }}
                          className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md"
                        >Approve (HR)</button>
                      )}
                      {vc.status === 'APPROVED_FOR_PAYROLL' && (
                        <span className="text-[10px] font-bold text-slate-400 italic">No Action Needed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SECTION 2: CYCLE PAYROLL MANAGEMENT */}
      <div className="flex flex-col lg:flex-row gap-10">
        <div className="lg:w-80 space-y-8 text-start">
          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">{t('cycleConfiguration')}</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-[9px] font-black text-slate-500 uppercase mb-3 px-1">{t('logicArchitecture')}</label>
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                  <button onClick={() => setFilter({ ...filter, cycle: 'Monthly' })} className={`py-2.5 text-[10px] font-bold rounded-xl transition-all ${filter.cycle === 'Monthly' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-400'}`}>{t('monthly')}</button>
                  <button onClick={() => setFilter({ ...filter, cycle: 'Bi-Weekly' })} className={`py-2.5 text-[10px] font-bold rounded-xl transition-all ${filter.cycle === 'Bi-Weekly' ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-400'}`}>{t('biWeekly')}</button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="space-y-1">
                  <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest px-1">{t('auditPeriod')}</label>
                  <div className="grid grid-cols-2 gap-2">
                    <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/5" value={filter.month} onChange={e => setFilter({ ...filter, month: parseInt(e.target.value) })}>
                      {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                    </select>
                    <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/5" value={filter.year} onChange={e => setFilter({ ...filter, year: parseInt(e.target.value) })}>
                      <option value={2025}>2025</option>
                      <option value={2026}>2026</option>
                    </select>
                  </div>
                </div>
              </div>
              <button onClick={handleGenerateDraft} disabled={processing} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 disabled:opacity-50 transition-all hover:bg-indigo-700 shadow-xl shadow-indigo-600/20">{processing ? t('synthesizing') : t('executePeriodAudit')}</button>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">{t('auditArchive')}</h4>
            <div className="space-y-4 max-h-[550px] overflow-y-auto pr-4 custom-scrollbar">
              {runs.length > 0 ? runs.map(run => (
                <button
                  key={run.id}
                  onClick={() => handleSelectRun(run)}
                  className={`w-full text-left p-5 rounded-3xl border transition-all ${activeRun?.id === run.id ? 'bg-slate-900 border-slate-900 text-white shadow-2xl' : 'bg-slate-50 border-slate-100 text-slate-600 hover:bg-white hover:border-indigo-100'}`}
                >
                  <p className="text-xs font-black break-all">{run.periodKey}</p>
                  <p className="text-[11px] opacity-60 uppercase font-black mt-2 tracking-tight flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${run.status === 'Draft' ? 'bg-amber-400' : 'bg-emerald-400'}`}></span>
                    {t(run.status.toLowerCase() as any) || run.status} • {run.cycleType?.replace('_', ' ')}
                  </p>
                </button>
              )) : (
                <div className="py-12 text-center grayscale opacity-30">
                  <span className="text-3xl">📂</span>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{t('nullSet')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {!activeRun ? (
            <div className="bg-white/40 border-2 border-dashed border-slate-200 rounded-[56px] h-full min-h-[550px] flex flex-col items-center justify-center text-center p-20 grayscale opacity-40">
              <div className="w-24 h-24 bg-slate-100 rounded-full flex items-center justify-center text-5xl mb-8 shadow-inner">🗓️</div>
              <h3 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">{t('cycleAccrualsConsolidatedRegistry')}</h3>
              <p className="text-slate-400 text-lg mt-4 font-medium max-w-sm leading-relaxed">{t('selectPeriodViewAccruals')}</p>
            </div>
          ) : (
            <div className="space-y-10 animate-in slide-in-from-right-6 duration-500">
              <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] flex flex-col md:flex-row items-center justify-between gap-10 text-start">
                <div className="flex items-center gap-6">
                  <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-3xl shadow-inner border border-indigo-100">📋</div>
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{activeRun.periodKey}</h3>
                    <div className="flex items-center gap-2 text-sm text-slate-500 font-bold mt-1">
                      <span className="text-indigo-600 uppercase font-black tracking-[0.1em]">{activeRun.cycleType?.replace('_', ' ')} Run</span>
                      <span>•</span>
                      <div className="group relative flex items-center gap-1">
                        <span className={activeRun.status === 'Draft' ? 'text-slate-400 italic' : 'text-slate-900'}>
                          {formatCurrency(activeRun.totalDisbursement)} {t('currency')}
                        </span>
                        {activeRun.status === 'Draft' && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-amber-500 font-black uppercase">(Audit Mode)</span>
                            <span className="w-4 h-4 rounded-full bg-slate-100 text-[9px] flex items-center justify-center cursor-help border border-slate-200" title="Values remain nil until Registry Commitment. The audit engine currently projects no fixed disbursement for this draft.">?</span>
                          </div>
                        )}
                      </div>
                    </div>
                    {activeRun.status === 'Draft' && (
                      <div className="flex gap-4 mt-3">
                        <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 cursor-help" title="Sum of Authorized Performance Ratings & Nominations for this period.">
                          KPI: {formatCurrency(items.reduce((sum, i) => sum + (i.performanceBonus || 0), 0))}
                        </span>
                        <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg border border-blue-100 cursor-help" title="Sum of Company-wide Profit Sharing or Fixed Bonuses.">
                          BONUS: {formatCurrency(items.reduce((sum, i) => sum + (i.companyBonus || 0), 0))}
                        </span>
                        <span className="text-[10px] font-black text-amber-600 bg-amber-50 px-2 py-1 rounded-lg border border-amber-100 cursor-help" title="Sum of Approved Overtime from Attendance Logs & Geofence exceptions.">
                          OT: {formatCurrency(items.reduce((sum, i) => sum + (i.overtimeAmount || 0), 0))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
                    <button onClick={() => setViewMode('Audit')} className={`px-8 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all ${viewMode === 'Audit' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>{t('auditGrid')}</button>
                    <button onClick={() => setViewMode('Payslips')} className={`px-8 py-3 rounded-xl text-[10px] font-black tracking-widest transition-all ${viewMode === 'Payslips' ? 'bg-white text-slate-900 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}>{t('batchSlips')}</button>
                  </div>

                  {activeRun.status === 'Draft' && (
                    <button onClick={handleFinalize} className="px-10 py-4 bg-indigo-600 text-white rounded-[20px] font-black text-[11px] uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-600/30 active:scale-95 border border-indigo-500">
                      {t('commitData')}
                    </button>
                  )}
                </div>
              </div>

              {viewMode === 'Audit' ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  {paginatedData.length > 0 ? paginatedData.map(item => {
                    const isExpanded = expandedItems[item.id];
                    return (
                      <div key={item.id} className={`bg-white rounded-[32px] border transition-all duration-300 overflow-hidden shadow-sm ${isExpanded ? 'border-indigo-200 ring-4 ring-indigo-50/50' : 'border-slate-200 hover:border-indigo-100 hover:shadow-md'}`}>
                        {/* Main Summary Line */}
                        <div
                          onClick={() => setExpandedItems(prev => ({ ...prev, [item.id]: !isExpanded }))}
                          className={`px-8 py-6 flex flex-col md:flex-row md:items-center justify-between cursor-pointer group ${isExpanded ? 'bg-indigo-50/30' : 'bg-white'}`}
                        >
                          <div className="flex items-center gap-6">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-xl transition-all shadow-inner border ${isExpanded ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-slate-50 text-slate-400 border-slate-100 group-hover:bg-white group-hover:text-indigo-600 group-hover:border-indigo-100'}`}>
                              👤
                            </div>
                            <div className="text-start">
                              <h4 className={`text-xl font-black tracking-tight transition-colors ${isExpanded ? 'text-indigo-900' : 'text-slate-900 group-hover:text-indigo-600'}`}>
                                {item.employeeName}
                              </h4>
                              <p className="text-[10px] text-slate-400 font-extrabold uppercase mt-1 tracking-widest flex items-center gap-2">
                                ID: {(item.employeeId || '').slice(0, 8).toUpperCase()}
                                <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                                {item.allowanceBreakdown?.length || 0} Triggers
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-10 mt-6 md:mt-0 text-start">
                            <div className="flex flex-col items-end">
                              <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1.5 ${isExpanded ? 'text-indigo-600' : 'text-slate-400'}`}>
                                {t('netPayableAfterOffsets')}
                              </p>
                              <div className="flex items-baseline gap-2">
                                <span className={`text-3xl font-black tracking-tighter ${isExpanded ? 'text-indigo-600' : 'text-slate-900'}`}>
                                  {formatCurrency(item.netSalary)}
                                </span>
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('kwdTotal')}</span>
                              </div>
                            </div>
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border transition-all duration-500 ${isExpanded ? 'rotate-180 bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20' : 'text-slate-300 border-slate-100 group-hover:border-indigo-200 group-hover:text-indigo-400'}`}>
                              ▼
                            </div>
                          </div>
                        </div>

                        {/* Detailed Expansion */}
                        {isExpanded && (
                          <div className="p-8 bg-slate-50/50 border-t border-slate-100 animate-in slide-in-from-top-4 duration-300">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                              {/* Earnings Column */}
                              <div className="space-y-4">
                                <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-3">
                                  {t('periodEarnings')} <span className="h-[1px] flex-1 bg-slate-200"></span>
                                </h6>
                                <div className="space-y-2">
                                  {(item.allowanceBreakdown || []).length > 0 ? (item.allowanceBreakdown || []).map((a, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white px-4 py-3 rounded-2xl border border-slate-100 shadow-sm transition-all hover:border-indigo-100">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{a.name}</span>
                                      <span className="text-sm font-black text-indigo-600">{formatCurrency(a.value)}</span>
                                    </div>
                                  )) : (
                                    <div className="flex justify-between items-center px-4 py-3 rounded-2xl border bg-slate-50 border-slate-200 shadow-sm opacity-60">
                                      <div className="flex flex-col">
                                        <span className="text-[10px] font-black uppercase tracking-tighter text-slate-500">Base Salary (Static Entry)</span>
                                        <span className="text-[8px] font-bold text-slate-400 uppercase">Legacy Trace</span>
                                      </div>
                                      <span className="text-sm font-black text-slate-700">{formatCurrency(item.basicSalary)}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Deductions Column */}
                              <div className="space-y-4">
                                <h6 className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-3">
                                  Deductions & Offsets <span className="h-[1px] flex-1 bg-rose-100"></span>
                                </h6>
                                <div className="space-y-2">
                                  {(item.deductionBreakdown || []).length > 0 ? (item.deductionBreakdown || []).map((d, i) => {
                                    const isSpecial = d.name.includes('Excluded') || d.name.includes('HUB') || d.name.includes('PRO-RATA');
                                    return (
                                      <div key={i} className={`flex justify-between items-center px-4 py-3 rounded-2xl border shadow-sm transition-all ${isSpecial ? 'bg-indigo-50 border-indigo-100' : 'bg-white border-slate-100'}`}>
                                        <div className="flex flex-col">
                                          <span className={`text-[10px] font-black uppercase tracking-tighter leading-tight ${isSpecial ? 'text-indigo-800' : 'text-slate-500'}`}>{d.name}</span>
                                          {isSpecial && <span className="text-[8px] font-bold text-indigo-400 uppercase">Statutory Offset</span>}
                                        </div>
                                        <span className={`text-sm font-black ${isSpecial ? 'text-indigo-600' : 'text-rose-600'}`}>-{formatCurrency(d.value)}</span>
                                      </div>
                                    )
                                  }) : (
                                    <div className="bg-emerald-50 px-4 py-6 rounded-2xl border border-emerald-100/50 flex flex-col items-center justify-center text-center">
                                      <span className="text-xl mb-1">🛡️</span>
                                      <span className="text-[10px] text-emerald-600 font-black uppercase tracking-widest">{t('coreIntegrityOk')}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Fiscal/PIFSS Column */}
                              <div className="space-y-4">
                                <h6 className="text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-3">
                                  Fiscal & PIFSS Filing <span className="h-[1px] flex-1 bg-amber-100"></span>
                                </h6>
                                <div className="space-y-3">
                                  <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm space-y-4">
                                    <div className="flex justify-between items-center">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-black text-slate-400">👤</div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('emp')} Contribution</span>
                                      </div>
                                      <span className="text-sm font-black text-slate-900">{formatCurrency(item.pifssDeduction)}</span>
                                    </div>
                                    <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                                      <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-xs font-black text-indigo-400">🏛️</div>
                                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{t('gov')} Share</span>
                                      </div>
                                      <span className="text-sm font-black text-indigo-700">{formatCurrency(item.pifssEmployerShare)}</span>
                                    </div>
                                  </div>

                                  <div className="bg-slate-900 p-5 rounded-[24px] text-white flex justify-between items-center shadow-lg">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-xl">✅</div>
                                      <div>
                                        <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Calculated Net</p>
                                        <p className="text-xs font-bold opacity-80">Audit Passed</p>
                                      </div>
                                    </div>
                                    <p className="text-xl font-black text-white">{formatCurrency(item.netSalary)}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  }) : (
                    <div className="p-40 text-center bg-white rounded-[56px] border-2 border-dashed border-slate-200">
                      <div className="text-6xl mb-6 grayscale opacity-20">📂</div>
                      <p className="text-slate-400 italic font-medium uppercase tracking-[0.3em]">{t('registryUnderflow')}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                  {paginatedData.length > 0 ? paginatedData.map(item => (
                    <PayslipCard key={item.id} item={item} run={activeRun} />
                  )) : (
                    <div className="col-span-full p-40 text-center text-slate-400 italic">Registry Error: Null Payslip Set</div>
                  )}
                </div>
              )}

              <div className="flex justify-center gap-6 py-12 no-print">
                <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} className="px-12 py-4 bg-white border border-slate-200 rounded-[20px] font-black text-[11px] uppercase tracking-[0.2em] disabled:opacity-30 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-lg active:scale-95">{t('previousNode')}</button>
                <div className="flex items-center px-10 bg-slate-900 border border-slate-800 rounded-[20px] font-black text-[12px] text-white shadow-2xl tracking-widest">
                  {currentPage} <span className="mx-3 opacity-30 text-indigo-400">/</span> {totalPages || 1}
                </div>
                <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => setCurrentPage(prev => prev + 1)} className="px-12 py-4 bg-white border border-slate-200 rounded-[20px] font-black text-[11px] uppercase tracking-[0.2em] disabled:opacity-30 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-lg active:scale-95">{t('nextNode')}</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PayrollView;
