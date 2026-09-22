import React, { useState, useEffect, useMemo } from 'react';
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
  const getVal = (obj: any) => Number(obj.value !== undefined ? obj.value : (obj.housing || obj.others || obj.ot || obj.bonus || obj.late || 0));

  const rawBreakdown = item.allowanceBreakdown || [];
  const rawDeductions = item.deductionBreakdown || [];

  const contractualGross = rawBreakdown.find(a => a.name.includes('Contractual'))?.value
    || (item.basicSalary + item.housingAllowance + item.otherAllowances + (item.leaveDeductions || 0));

  const earnings = rawBreakdown.filter(a => !a.name.includes('Contractual') && getVal(a) > 0);
  const deductions = rawDeductions.filter(d => !d.name.toLowerCase().includes('pro-rata') && !d.name.toLowerCase().includes('loss') && getVal(d) > 0);

  return (
    <div className={`cds--card`} style={{ 
      background: 'var(--cds-background)', 
      border: '1px solid var(--cds-border-subtle)', 
      padding: 'var(--cds-spacing-05)', 
      display: 'flex', 
      flexDirection: 'column', 
      gap: 'var(--cds-spacing-05)',
      height: '100%',
      textAlign: isAr ? 'right' : 'left'
    }} dir={isAr ? 'rtl' : 'ltr'}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-05)' }}>
        <div>
          <h4 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-02)' }}>
            {isAr ? 'قسيمة الراتب' : 'Audit Payslip'}
          </h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontWeight: 600 }}>TRACE ID: {run?.id?.slice(0, 8).toUpperCase()}</p>
        </div>
        <div style={{ textAlign: isAr ? 'left' : 'right' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontWeight: 600 }}>PERIOD</p>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-interactive-01)' }}>{monthNames[monthIndex]} {year}</p>
        </div>
      </div>

      <div style={{ background: 'var(--cds-layer-01)', padding: 'var(--cds-spacing-05)', borderLeft: `4px solid var(--cds-interactive-01)` }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>CONTRACTUAL GROSS</span>
            <span style={{ fontSize: '1.25rem', fontWeight: 600 }}>{formatVal(contractualGross)} <small style={{ fontSize: '0.75rem', fontWeight: 400 }}>KWD</small></span>
         </div>
         <p style={{ fontSize: '0.875rem', marginTop: 'var(--cds-spacing-02)' }}>{item.employeeName}</p>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
         <div>
            <h5 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-02)', marginBottom: 'var(--cds-spacing-03)' }}>EARNINGS</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
               {earnings.map((a, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                     <span style={{ color: 'var(--cds-text-secondary)' }}>{isAr ? a.nameArabic || a.name : a.name}</span>
                     <span style={{ fontWeight: 600 }}>{formatVal(getVal(a))}</span>
                  </div>
               ))}
               {(item.performanceBonus > 0 || item.profitSharing > 0 || item.companyBonus > 0) && (
                  <div style={{ borderTop: '1px dashed var(--cds-border-subtle)', paddingTop: 'var(--cds-spacing-03)', marginTop: 'var(--cds-spacing-02)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-02)' }}>
                     {item.performanceBonus > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--cds-interactive-01)' }}>
                           <span style={{ fontWeight: 600 }}>{isAr ? 'مكافأة الأداء' : 'Performance Bonus'}</span>
                           <span style={{ fontWeight: 600 }}>{formatVal(item.performanceBonus)}</span>
                        </div>
                     )}
                     {item.profitSharing > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: 'var(--cds-support-success)' }}>
                           <span style={{ fontWeight: 600 }}>{isAr ? 'المشاركة في الأرباح' : 'Profit Sharing'}</span>
                           <span style={{ fontWeight: 600 }}>{formatVal(item.profitSharing)}</span>
                        </div>
                     )}
                  </div>
               )}
            </div>
         </div>

         {deductions.length > 0 && (
            <div>
               <h5 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-error)', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-02)', marginBottom: 'var(--cds-spacing-03)' }}>DEDUCTIONS</h5>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  {deductions.map((d, idx) => (
                     <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--cds-text-secondary)' }}>{isAr ? d.nameArabic || d.name : d.name}</span>
                        <span style={{ color: 'var(--cds-text-error)', fontWeight: 600 }}>-{formatVal(getVal(d))}</span>
                     </div>
                  ))}
               </div>
            </div>
         )}
      </div>

      <div style={{ marginTop: 'auto', paddingTop: 'var(--cds-spacing-05)', borderTop: '2px solid var(--cds-border-strong)' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
               <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-interactive-01)', marginBottom: 'var(--cds-spacing-01)' }}>NET PAYABLE</p>
               <span style={{ fontSize: '2rem', fontWeight: 600 }}>{formatVal(item.netSalary)}</span>
               <span style={{ fontSize: '1rem', fontWeight: 400, marginLeft: 'var(--cds-spacing-03)', color: 'var(--cds-text-secondary)' }}>KWD</span>
            </div>
         </div>
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
  const [expandedVarCompGroups, setExpandedVarCompGroups] = useState<Record<string, boolean>>({});

  const [vcSearch, setVcSearch] = useState('');
  const [vcMonthFilter, setVcMonthFilter] = useState<string>('all');

  const groupedVarComp = useMemo(() => {
    const groups: Record<string, Record<string, any[]>> = {};
    const filtered = pendingVarComp.filter(vc => {
      const date = new Date(vc.created_at);
      const monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      const matchSearch = vc.employees?.name?.toLowerCase().includes(vcSearch.toLowerCase()) || 
                          vc.employee_id.includes(vcSearch);
      const matchMonth = vcMonthFilter === 'all' || monthYear === vcMonthFilter;
      
      return matchSearch && matchMonth;
    });

    filtered.forEach(vc => {
      const date = new Date(vc.created_at);
      let monthYear = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      
      // If date is invalid or missing, fallback to 'Unscheduled'
      if (monthYear === 'Invalid Date' || !vc.created_at) {
        monthYear = 'Unscheduled Audit';
      }

      const dept = vc.employees?.department || 'General';

      if (!groups[monthYear]) groups[monthYear] = {};
      if (!groups[monthYear][dept]) groups[monthYear][dept] = [];
      groups[monthYear][dept].push(vc);
    });
    return groups;
  }, [pendingVarComp, vcSearch, vcMonthFilter]);

  const availableVcMonths = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const start = new Date(2026, 0, 1); // Start of 2026
    
    // Show all months from Jan 2026 through the end of the current year
    const end = new Date(Math.max(2026, currentYear), 11, 31);
    
    let current = new Date(start);
    while (current <= end) {
      months.push(current.toLocaleString('default', { month: 'long', year: 'numeric' }));
      current.setMonth(current.getMonth() + 1);
    }
    
    // Add existing data months that might be outside range (just in case)
    pendingVarComp.forEach(vc => {
      const date = new Date(vc.created_at);
      const m = date.toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!months.includes(m)) months.push(m);
    });

    return months;
  }, [pendingVarComp]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const runsData = await hrmDb.getPayrollRuns();
      // DETECTION: Include ALL HR_Finalized requests which represent pending settlement
      const leavesData = await hrmDb.getLeaveRequests();

      // Fetch pending variable comp
      const { data: vcData } = await supabase.from('variable_compensation')
        .select('*, employees!inner(name, department)')
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
      {/* SECTION 1: DISBURSEMENT HUB */}
      <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
        <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Active Disbursement Hub</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Pending settlement registry and verification</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--cds-spacing-05)', alignItems: 'center' }}>
             <button title={t('pendingRecords')} onClick={() => setHubStatusFilter('Pending')} className={`cds--btn cds--btn--ghost cds--btn--sm ${hubStatusFilter === 'Pending' ? 'cds--btn--primary' : ''}`}>PENDING</button>
             <button title={t('settledRecords')} onClick={() => setHubStatusFilter('Settled')} className={`cds--btn cds--btn--ghost cds--btn--sm ${hubStatusFilter === 'Settled' ? 'cds--btn--primary' : ''}`}>SETTLED</button>
             <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-interactive-01)', background: 'var(--cds-layer-02)', padding: 'var(--cds-spacing-02) var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)' }}>
                {pendingLeaveRequests.filter(l => l.status !== 'Paid').length} ACTIVE NODES
             </span>
          </div>
        </div>

        <div style={{ padding: 'var(--cds-spacing-07)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--cds-spacing-07)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
              {hubFilteredData.length > 0 ? (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-02)', maxHeight: '400px', overflowY: 'auto' }}>
                    {hubPaginatedData.map(req => (
                      <button
                        key={req.id}
                        onClick={() => handleSelectLeaveForPreview(req.id)}
                        className={`cds--btn ${selectedLeaveId === req.id ? 'cds--btn--primary' : 'cds--btn--ghost'}`}
                        style={{ justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: 'var(--cds-spacing-05)', height: 'auto', border: selectedLeaveId === req.id ? 'none' : '1px solid var(--cds-border-subtle)' }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                           <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{req.employeeName}</span>
                           <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{req.type} • {req.days} days</span>
                        </div>
                        <span style={{ fontSize: '0.625rem' }}>{req.startDate}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ padding: 'var(--cds-spacing-10)', textAlign: 'center', border: '1px dashed var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                  <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>No active disbursements.</p>
                </div>
              )}
            </div>

            <div style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', minHeight: '350px' }}>
              {lrPreview ? (
                <div style={{ padding: 'var(--cds-spacing-07)', display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-04)', marginBottom: 'var(--cds-spacing-07)' }}>
                     <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>Settlement Logic Verification</h4>
                     <span style={{ fontSize: '0.75rem', color: 'var(--cds-interactive-01)' }}>ID: {selectedLeaveId.slice(0, 12).toUpperCase()}</span>
                  </div>

                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--cds-text-secondary)' }}>Prorated Gross (Work)</span>
                        <span style={{ fontWeight: 600 }}>{formatCurrency(lrPreview.workPay)} KWD</span>
                     </div>
                     <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
                        <span style={{ color: 'var(--cds-text-secondary)' }}>Benefits Payout</span>
                        <span style={{ fontWeight: 600 }}>{formatCurrency(lrPreview.leavePayStartMonth + (lrPreview.leavePayNextMonth || 0))} KWD</span>
                     </div>
                  </div>

                  <div style={{ marginTop: 'auto', paddingTop: 'var(--cds-spacing-07)', borderTop: '2px solid var(--cds-border-strong)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                     <div>
                        <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-interactive-01)', textTransform: 'uppercase' }}>Net Settlement Amount</p>
                        <span style={{ fontSize: '2.5rem', fontWeight: 600 }}>{formatCurrency(lrPreview.total)} <small style={{ fontSize: '0.875rem', fontWeight: 400 }}>KWD</small></span>
                     </div>
                     <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
                        <button className="cds--btn cds--btn--secondary" onClick={handlePushToPayroll}>Push to monthly</button>
                        <button className="cds--btn cds--btn--primary" onClick={handleExecuteLeaveRun}>Authorize payout</button>
                     </div>
                  </div>
                </div>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cds-text-secondary)' }}>
                   <p style={{ fontSize: '0.875rem' }}>Select a record to evaluate settlement paths</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: VARIABLE COMPENSATION AUDIT */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
         <div style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
               <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Variable Compensation Audit</h3>
               <span className="cds--tag cds--tag--magenta" style={{ fontSize: '0.625rem' }}>Q1 2026 Audit Ready</span>
            </div>
            <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
               <input 
                 type="text" 
                 placeholder="Filter employee..." 
                 value={vcSearch}
                 onChange={(e) => setVcSearch(e.target.value)}
                 style={{ padding: 'var(--cds-spacing-03) var(--cds-spacing-05)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', fontSize: '0.875rem', width: '250px' }}
               />
            </div>
         </div>

         <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
            {Object.entries(groupedVarComp).map(([month, depts]) => (
               <div key={month} className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)' }}>
                  <div 
                    onClick={() => setExpandedVarCompGroups(prev => ({...prev, [month]: !prev[month]}))}
                    style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-07)', background: 'var(--cds-layer-01)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                     <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{month} Statements</span>
                     <span>{expandedVarCompGroups[month] ? '▲' : '▼'}</span>
                  </div>

                  {expandedVarCompGroups[month] && (
                     <div style={{ padding: 'var(--cds-spacing-07)' }}>
                        {Object.entries(depts).map(([dept, vcs]) => (
                           <div key={dept} style={{ marginBottom: 'var(--cds-spacing-07)' }}>
                              <h4 style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-04)', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-02)' }}>{dept}</h4>
                              <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                                 <thead>
                                    <tr>
                                       <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>EMPLOYEE</th>
                                       <th style={{ fontSize: '0.625rem', fontWeight: 600 }}>TYPE</th>
                                       <th style={{ fontSize: '0.625rem', fontWeight: 600, textAlign: 'right' }}>AMOUNT</th>
                                       <th style={{ fontSize: '0.625rem', fontWeight: 600, textAlign: 'center' }}>STATUS</th>
                                    </tr>
                                 </thead>
                                 <tbody>
                                    {vcs.map(vc => (
                                       <tr key={vc.id}>
                                          <td style={{ fontSize: '0.75rem', fontWeight: 600 }}>{vc.employees?.name || 'Unknown Employee'}</td>
                                          <td>
                                             <span style={{ fontSize: '0.5rem' }} className={`cds--tag cds--tag--${String(vc.type).toLowerCase().includes('overtime') ? 'blue' : 'green'}`}>{(vc.type || 'ADJUSTMENT').toUpperCase()}</span>
                                          </td>
                                          <td style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'right' }}>{(Number(vc.amount) || 0).toLocaleString()} KWD</td>
                                          <td style={{ textAlign: 'center' }}>
                                             {vc.payroll_processed ? (
                                                <span style={{ color: 'var(--cds-support-success)' }}>●</span>
                                             ) : (
                                                <span style={{ color: 'var(--cds-support-warning)' }}>●</span>
                                             )}
                                          </td>
                                       </tr>
                                    ))}
                                 </tbody>
                              </table>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
            ))}
         </div>
      </div>

      {/* SECTION 3: PAYROLL TERMINAL */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 'var(--cds-spacing-07)', marginTop: 'var(--cds-spacing-09)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)' }}>
            <h3 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-07)', textTransform: 'uppercase' }}>Cycle config</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
               <select value={filter.month} onChange={e => setFilter({ ...filter, month: parseInt(e.target.value) })} style={{ height: '40px', background: 'var(--cds-field-01)', border: '1px solid var(--cds-border-subtle)', padding: '0 var(--cds-spacing-04)' }}>
                  {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
               </select>
               <button className="cds--btn cds--btn--primary" onClick={handleGenerateDraft} disabled={processing}>
                  {processing ? 'Synthesizing...' : 'Execute Audit'}
               </button>
            </div>
          </div>

          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)' }}>
             <h4 style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-04)', textTransform: 'uppercase' }}>History</h4>
             <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-02)', maxHeight: '300px', overflowY: 'auto' }}>
                {runs.map(run => (
                   <button key={run.id} onClick={() => handleSelectRun(run)} className={`cds--btn cds--btn--ghost cds--btn--sm ${activeRun?.id === run.id ? 'cds--btn--secondary' : ''}`} style={{ width: '100%', justifyContent: 'flex-start' }}>
                      {run.periodKey}
                   </button>
                ))}
             </div>
          </div>
        </div>

        <div style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
           {activeRun ? (
              <div style={{ padding: 'var(--cds-spacing-05)' }}>
                 <div style={{ borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-05)', marginBottom: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{activeRun.periodKey} Registry</h3>
                    {activeRun.status === 'Draft' && <button className="cds--btn cds--btn--primary cds--btn--sm" onClick={handleFinalize}>Commit</button>}
                 </div>
                 <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                    <thead>
                       <tr>
                          <th>EMPLOYEE</th>
                          <th style={{ textAlign: 'right' }}>NET PAYABLE</th>
                          <th style={{ textAlign: 'center' }}>AUDIT</th>
                       </tr>
                    </thead>
                    <tbody>
                       {paginatedData.map(it => (
                          <React.Fragment key={it.id}>
                             <tr>
                                <td style={{ fontSize: '0.75rem', fontWeight: 600 }}>{it.employeeName}</td>
                                <td style={{ fontSize: '0.75rem', fontWeight: 600, textAlign: 'right' }}>{it.netSalary.toLocaleString()} KWD</td>
                                <td style={{ textAlign: 'center' }}>
                                   <button onClick={() => setExpandedItems(prev => ({...prev, [it.id]: !prev[it.id]}))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                      {expandedItems[it.id] ? '▲' : '▼'}
                                   </button>
                                </td>
                             </tr>
                             {expandedItems[it.id] && (
                                <tr>
                                   <td colSpan={3} style={{ padding: 'var(--cds-spacing-07)', background: 'var(--cds-layer-01)' }}>
                                      <PayslipCard item={it} run={activeRun} />
                                   </td>
                                </tr>
                             )}
                          </React.Fragment>
                       ))}
                    </tbody>
                 </table>
              </div>
           ) : (
              <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cds-text-secondary)' }}>
                 <p>Select a period to initialize audit terminal.</p>
              </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default PayrollView;
