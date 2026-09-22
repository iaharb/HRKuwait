
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { User, Employee, LeaveRequest, PayrollItem, PayrollRun, AttendanceRecord } from '../types/types';
import { dbService as hrmDb } from '../services/dbService.ts';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationSystem.tsx';

interface ProfileViewProps {
  user: User;
}

const SalaryCertificateModal: React.FC<{
  employee: Employee;
  item?: PayrollItem;
  onClose: () => void;
  bankName: string;
  language: string;
}> = ({ employee, item, onClose, bankName, language }) => {
  const { t } = useTranslation();
  const locale = language === 'ar' ? 'ar-KW' : 'en-KW';
  const today = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  const basicSalary = item ? item.basicSalary : (employee.salary || 0);
  const allowances = item ? (item.housingAllowance + item.otherAllowances) : 0;
  const deductions = item ? (item.pifssDeduction + item.leaveDeductions + item.shortPermissionDeductions) : (employee.nationality === 'Kuwaiti' ? basicSalary * 0.115 : 0);
  const netSalary = basicSalary + allowances - deductions;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 printable-document-root" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-md no-print" onClick={onClose}></div>
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh] flex flex-col text-start border border-slate-200 printable-document">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center no-print">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('salaryCertPreview')}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-12 bg-white font-serif">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-8 mb-12 text-start">
            <div className="space-y-1">
              <h2 className="text-2xl font-black text-slate-900 font-sans tracking-tighter">ENTERPRISE HR WORKFORCE</h2>
              <p className="text-[10px] font-sans font-bold text-slate-500 uppercase tracking-widest">Kuwait City, State of Kuwait</p>
            </div>
            <div className="text-right">
              <span className="text-4xl">🇰🇼</span>
            </div>
          </div>

          <div className="space-y-8 text-slate-800 leading-relaxed text-start">
            <p className="text-right font-sans font-bold text-sm">Date: {today}</p>
            <div className="space-y-1">
              <p className="font-bold">To: {bankName || t('toWhom')}</p>
            </div>

            <h3 className="text-center text-xl font-bold underline underline-offset-8 uppercase font-sans py-4">
              {t('salaryCert')}
            </h3>

            <p className="text-sm">
              This is to certify that <strong>{language === 'ar' ? (
                `${employee.titleAr || ''} ${employee.firstNameAr || ''} ${employee.secondNameAr || ''} ${employee.familyNameAr || ''}`.replace(/\s+/g, ' ').trim() || employee.nameArabic
              ) : (
                `${employee.title || ''} ${employee.firstName || ''} ${employee.secondName || ''} ${employee.familyName || ''}`.replace(/\s+/g, ' ').trim() || employee.name
              )}</strong>, a <strong>{t(employee.nationality.toLowerCase())}</strong> national...
            </p>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-3 font-sans">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">{t('salary')}</span>
                <span className="font-black text-slate-900">{basicSalary.toLocaleString(locale)} {t('currency')}</span>
              </div>
              <div className="flex justify-between text-lg pt-4 border-t-2 border-slate-900">
                <span className="text-slate-900 font-black uppercase tracking-widest text-[11px]">{t('netTransfer')}</span>
                <span className="font-black text-slate-900">{netSalary.toLocaleString(locale)} {t('currency')}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8 bg-slate-900 text-white flex gap-4 no-print">
          <button onClick={onClose} className="flex-1 py-4 bg-white/10 hover:bg-white/20 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
            {t('discard')}
          </button>
          <button onClick={() => window.print()} className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20">
            {t('downloadCert')}
          </button>
        </div>
      </div>
    </div>
  );
};

const ProfileView: React.FC<ProfileViewProps> = ({ user }) => {
  const { t, i18n } = useTranslation();
  const { notify, confirm } = useNotifications();
  const [employeeData, setEmployeeData] = useState<Employee | null>(null);
  const [latestPayslip, setLatestPayslip] = useState<{ item: PayrollItem, run: PayrollRun } | null>(null);
  const [personalWorksheet, setPersonalWorksheet] = useState<any[]>([]);
  const [personalLeaves, setPersonalLeaves] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [showCertModal, setShowCertModal] = useState(false);
  const [selectedBank, setSelectedBank] = useState(t('toWhom'));
  const [showGuide, setShowGuide] = useState(!localStorage.getItem('guide_profile_seen'));
  const [hubTab, setHubTab] = useState<'attendance' | 'leaves' | 'documents' | 'payroll' | 'expenses' | 'bonuses' | 'performance'>('attendance');
  const [expandedLeaveId, setExpandedLeaveId] = useState<string | null>(null);
  const [leaveAuditMap, setLeaveAuditMap] = useState<Record<string, any[]>>({});
  const [payrollHistory, setPayrollHistory] = useState<Array<{ item: PayrollItem, run: PayrollRun }>>([]);
  const [selectedPayslip, setSelectedPayslip] = useState<{ item: PayrollItem, run: PayrollRun } | null>(null);
  const [showPayslipModal, setShowPayslipModal] = useState(false);
  const [expenseClaims, setExpenseClaims] = useState<any[]>([]);
  const [variableComp, setVariableComp] = useState<any[]>([]);
  const [kpiTemplates, setKpiTemplates] = useState<any[]>([]);
  const [latestEval, setLatestEval] = useState<any | null>(null);
  const [vCompSubTypeFilter, setVCompSubTypeFilter] = useState<'ALL' | 'Performance_Bonus' | 'Profit_Sharing'>('ALL');
  const [pendingProfileRequests, setPendingProfileRequests] = useState<any[]>([]);

  // Filter state
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());
  const [vCompFilterStatus, setVCompFilterStatus] = useState<'ALL' | 'APPROVED' | 'PENDING' | 'REJECTED'>('ALL');

  const accruedAnnual = useMemo(() => {
    if (!employeeData?.joinDate) return 0;
    const startOfYear = new Date(new Date().getFullYear(), 0, 1);
    const join = new Date(employeeData.joinDate);
    const anchor = join > startOfYear ? join : startOfYear;
    const today = new Date();
    const diffDays = Math.ceil(Math.abs(today.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
    return Number(((diffDays / 365) * (employeeData.leaveBalances?.annual || 30)).toFixed(2));
  }, [employeeData]);

  const months = useMemo(() => {
    return i18n.language === 'ar'
      ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  }, [i18n.language]);
  
  const filteredVariableComp = useMemo(() => {
    return variableComp
      .filter(vc => {
        const date = new Date(vc.effective_date || vc.created_at);
        const inPeriod = (date.getMonth() + 1 === filterMonth) && (date.getFullYear() === filterYear);
        if (!inPeriod) return false;

        // Sub-type filter
        if (vCompSubTypeFilter !== 'ALL' && vc.sub_type !== vCompSubTypeFilter) return false;

        // Status filter
        if (vCompFilterStatus === 'ALL') return true;
        if (vCompFilterStatus === 'APPROVED') return vc.status === 'APPROVED_FOR_PAYROLL' || vc.status === 'PROCESSED';
        if (vCompFilterStatus === 'PENDING') return vc.status?.startsWith('PENDING');
        if (vCompFilterStatus === 'REJECTED') return vc.status === 'REJECTED';
        return true;
      })
      .sort((a, b) => {
        // Priority: Approved for Payroll on top
        if (a.status === 'APPROVED_FOR_PAYROLL' && b.status !== 'APPROVED_FOR_PAYROLL') return -1;
        if (a.status !== 'APPROVED_FOR_PAYROLL' && b.status === 'APPROVED_FOR_PAYROLL') return 1;
        // Then by date descending
        return new Date(b.effective_date || b.created_at).getTime() - new Date(a.effective_date || a.created_at).getTime();
      });
  }, [variableComp, filterMonth, filterYear, vCompFilterStatus, vCompSubTypeFilter]);

  // Biometric Enrollment State
  const [enrolling, setEnrolling] = useState(false);
  const [enrollProgress, setEnrollProgress] = useState(0);
  const enrollVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const watchdogRef = useRef<number | null>(null);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      // Step 1: Get Employee Object (Primary Sync)
      const emp = await hrmDb.getEmployeeById(user.id);
      if (emp) {
        setEmployeeData(emp);
        
        // Fetch KPIs
        const templates = await hrmDb.getKPITemplates();
        setKpiTemplates(templates);
      }

      // Step 2: Parallel fetch all related transactional data
      const [payslip, leaves, history, expenses, vComp, evals] = await Promise.all([
        hrmDb.getLatestFinalizedPayroll(user.id),
        hrmDb.getLeaveRequests({ employeeId: user.id }),
        hrmDb.getPayrollHistory(user.id),
        hrmDb.getExpenseClaims(user.id),
        hrmDb.getEmployeeVariableComp(user.id),
        hrmDb.getEmployeeEvaluations()
      ]);

      setLatestPayslip(payslip);
      setPersonalLeaves(leaves);
      setPayrollHistory((history || []).sort((a, b) => b.run.periodKey.localeCompare(a.run.periodKey)));
      setExpenseClaims(expenses);
      setVariableComp(vComp);
      
      const empEvals = evals.filter(e => e.employeeId === user.id).sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      if (empEvals.length > 0) setLatestEval(empEvals[0]);

    } catch (error) {
      console.error('Sync Error:', error);
      notify("Connectivity Warning", "Profile data might be partially out of sync. Please retry.", "warning");
    } finally {
      setLoading(false);
    }
  };

  const fetchPersonalWorksheet = async () => {
    setSheetLoading(true);
    try {
      // Robust retrieval: check both session user.id and database-retrieved employeeData.id
      const targetId = employeeData?.id || user.id;
      const allLogs = await hrmDb.getAttendanceWorksheet(filterYear, filterMonth);
      const userLogs = allLogs.filter(log => log.employeeId === targetId);
      setPersonalWorksheet(userLogs);
    } catch (err) {
      notify("Sync Failed", "Could not synchronize activity sheet.", "error");
    } finally {
      setSheetLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [user]);

  useEffect(() => {
    fetchPersonalWorksheet();
  }, [user, employeeData, filterMonth, filterYear]);

  const filteredLeaves = useMemo(() => {
    return personalLeaves.filter(req => {
      const start = new Date(req.startDate);
      const end = new Date(req.endDate);
      return (start.getMonth() + 1 === filterMonth && start.getFullYear() === filterYear) ||
        (end.getMonth() + 1 === filterMonth && end.getFullYear() === filterYear);
    });
  }, [personalLeaves, filterMonth, filterYear]);

  // Lazy-load audit trail for a leave request
  const handleToggleLeaveAudit = async (reqId: string) => {
    if (expandedLeaveId === reqId) { setExpandedLeaveId(null); return; }
    setExpandedLeaveId(reqId);
    if (!leaveAuditMap[reqId]) {
      const history = await hrmDb.getLeaveHistory(reqId);
      setLeaveAuditMap(prev => ({ ...prev, [reqId]: history }));
    }
  };

  // Document expiry helper
  const getDocStatus = (dateStr?: string | null) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    if (diff < 0) return { label: 'Expired', cls: 'bg-rose-100 text-rose-700' };
    if (diff < 30) return { label: `${diff}d — Urgent`, cls: 'bg-red-100 text-red-700' };
    if (diff < 90) return { label: `${diff}d — Expiring`, cls: 'bg-amber-100 text-amber-700' };
    return { label: 'Secure', cls: 'bg-emerald-100 text-emerald-600' };
  };

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem('guide_profile_seen', 'true');
  };

  const handleEnrollFace = async () => {
    if (enrolling) return;

    setEnrolling(true);
    setEnrollProgress(0);

    let activeStream: MediaStream | null = null;

    watchdogRef.current = window.setTimeout(() => {
      if (enrolling) {
        setEnrolling(false);
        if (activeStream) activeStream.getTracks().forEach(t => t.stop());
        notify(t('critical'), t('latencyMessage'), "error");
      }
    }, 10000);

    try {
      activeStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = activeStream;
      }

      let progress = 0;
      const intervalId = window.setInterval(async () => {
        progress += 10;
        setEnrollProgress(progress);

        if (progress >= 100) {
          window.clearInterval(intervalId);
          if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
          await finalizeEnrollment(activeStream!);
        }
      }, 300);

    } catch (err) {
      if (watchdogRef.current) window.clearTimeout(watchdogRef.current);
      notify(t('critical'), t('biometricHandshake'), "error");
      setEnrolling(false);
      if (activeStream) activeStream.getTracks().forEach(t => t.stop());
    }
  };

  const finalizeEnrollment = async (stream: MediaStream) => {
    try {
      if (enrollVideoRef.current && canvasRef.current && enrollVideoRef.current.readyState >= 2) {
        const ctx = canvasRef.current.getContext('2d');
        canvasRef.current.width = enrollVideoRef.current.videoWidth;
        canvasRef.current.height = enrollVideoRef.current.videoHeight;
        ctx?.drawImage(enrollVideoRef.current, 0, 0);
        const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);

        if (employeeData) {
          await hrmDb.updateEmployee(employeeData.id, { faceToken: dataUrl });
          notify(t('verified'), t('officialRecord'), "success");
          await fetchProfileData();
        }
      } else {
        throw new Error("Video stream was not ready for snapshot.");
      }
    } catch (err: any) {
      notify(t('critical'), err.message || "Failed to commit biometric record.", "error");
    } finally {
      stream.getTracks().forEach(t => t.stop());
      setEnrolling(false);
    }
  };

  const handleClearBiometrics = () => {
    if (!employeeData) return;
    confirm({
      title: i18n.language === 'ar' ? 'حذف بيانات الوجه؟' : 'Purge Biometric Data?',
      message: i18n.language === 'ar'
        ? 'سيؤدي هذا إلى إزالة صورتك المرجعية من السجل الرسمي. ستحتاج للتسجيل مرة أخرى لاستخدام الحضور الجغرافي.'
        : 'This will remove your reference image from the official registry. You will need to re-enroll to use Geo-Attendance.',
      confirmText: i18n.language === 'ar' ? 'تأكيد الحذف' : 'Purge Record',
      onConfirm: async () => {
        try {
          await hrmDb.updateEmployee(employeeData.id, { faceToken: '' });
          notify(t('success'), i18n.language === 'ar' ? 'تم حذف السجل البيومتري' : 'Biometric record purged.', "success");
          await fetchProfileData();
        } catch (err) {
          notify(t('critical'), t('unknown'), "error");
        }
      }
    });
  };

  const locale = i18n.language === 'ar' ? 'ar-KW' : 'en-KW';

  const getStatusStyle = (status: string, sub?: string) => {
    if (sub === 'Resumption Pending') return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    switch (status) {
      case 'On-Site': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      case 'On Leave': return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'Rest Day': return 'bg-slate-50 text-slate-400 border-slate-100';
      case 'Off-Day': return 'bg-slate-50 text-slate-400 border-slate-100';
      case 'Weekend': return 'bg-slate-50 text-slate-300 border-slate-50';
      case 'Absent': return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'Holiday': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  if (loading) return <div className="p-10 animate-pulse bg-white rounded-[32px] h-96"></div>;

  return (
      <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
        {showGuide && (
          <div style={{ background: 'var(--cds-interactive-01)', padding: 'var(--cds-spacing-06)', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', animation: 'slide-in-from-top-4 0.5s ease', color: '#fff' }}>
            <div style={{ fontSize: '2rem' }}>👤</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, fontFamily: 'monospace' }}>{t('guideProfileTitle')}</h3>
              <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', opacity: 0.9 }}>{t('guideProfileDesc')}</p>
            </div>
            <button
              onClick={dismissGuide}
              className="cds--btn cds--btn--secondary"
              style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}
            >
              {t('gotIt')}
            </button>
          </div>
        )}

        <header style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-07)', display: 'flex', flexWrap: 'wrap', gap: 'var(--cds-spacing-06)', alignItems: 'flex-start', position: 'relative', overflow: 'hidden' }}>
          <div style={{ width: '100px', height: '100px', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', flexShrink: 0 }}>
            {employeeData?.faceToken ? (
              <img src={employeeData.faceToken} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%) brightness(1.2)' }} />
            ) : (
              user.name.split(' ').map(n => n[0]).join('')
            )}
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
            <h2 style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
              {i18n.language === 'ar' ? (
                employeeData ? (
                  [employeeData.titleAr, employeeData.firstNameAr, employeeData.secondNameAr, employeeData.thirdNameAr, employeeData.fourthNameAr, employeeData.familyNameAr]
                    .filter(Boolean).join(' ') || employeeData.nameArabic || employeeData.name
                ) : user.name
              ) : (
                employeeData ? (
                  [employeeData.title, employeeData.firstName, employeeData.secondName, employeeData.thirdName, employeeData.fourthName, employeeData.familyName]
                    .filter(Boolean).join(' ') || employeeData.name
                ) : user.name
              )}
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cds-spacing-03)' }}>
              <span style={{ padding: '4px 12px', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--cds-interactive-01)', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', border: '1px solid rgba(79, 70, 229, 0.2)' }}>{user.role}</span>
              <span style={{ padding: '4px 12px', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', border: '1px solid var(--cds-border-subtle)', background: employeeData?.faceToken ? 'rgba(79, 70, 229, 0.1)' : 'var(--cds-background)', color: employeeData?.faceToken ? 'var(--cds-interactive-01)' : 'var(--cds-text-secondary)' }}>
                {employeeData?.faceToken ? `🧬 ${t('biometricallyLinked')}` : `🚫 ${t('faceNotEnrolled')}`}
              </span>
              <button 
                onClick={fetchProfileData}
                style={{ padding: '4px 12px', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', color: 'var(--cds-text-secondary)', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', gap: '4px', alignItems: 'center' }}
              >
                <span className={loading ? 'animate-spin' : ''}>🔄</span> {i18n.language === 'ar' ? 'تحديث' : 'Sync'}
              </button>
            </div>
          </div>

        <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', textAlign: 'center' }}>
            <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>{t('joinedSince')}</p>
            <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
              {employeeData?.joinDate && !isNaN(new Date(employeeData.joinDate).getTime())
                ? new Date(employeeData.joinDate).getFullYear()
                : (i18n.language === 'ar' ? 'غير متوفر' : 'N/A')}
            </p>
          </div>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-07)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
          <div 
            onClick={() => { if (latestPayslip) { setSelectedPayslip(latestPayslip); setShowPayslipModal(true); } }}
            className="cds--tile"
            style={{ background: 'var(--cds-background)', border: '1px solid var(--cds-interactive-01)', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', cursor: 'pointer', padding: 'var(--cds-spacing-07)' }}
          >
            <p style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-04)' }}>{t('latestSalarySlip')}</p>
            <h3 style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--cds-text-primary)' }}>{latestPayslip ? latestPayslip.item.netSalary.toLocaleString(locale) : '0'} <span style={{ fontSize: '1rem' }}>{t('currency')}</span></h3>
            <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginTop: 'var(--cds-spacing-03)' }}>REVIEW_AUDIT_TRACE</p>
          </div>

          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--cds-border-subtle)', paddingBottom: 'var(--cds-spacing-05)', marginBottom: 'var(--cds-spacing-05)' }}>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{t('identityEnrollment')}</h3>
                <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>{t('verifyFaceSignature')}</p>
              </div>
              {employeeData?.faceToken && (
                <div style={{ padding: '4px 12px', background: 'rgba(79, 70, 229, 0.1)', color: 'var(--cds-interactive-01)', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase' }}>✅ VERIFIED</div>
              )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cds-spacing-07)', alignItems: 'center' }}>
              <div style={{ width: '160px', height: '160px', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {enrolling ? (
                  <video ref={enrollVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%)' }} />
                ) : employeeData?.faceToken ? (
                  <img src={employeeData.faceToken} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'grayscale(100%)' }} />
                ) : (
                  <span style={{ fontSize: '2rem', opacity: 0.2 }}>🔍</span>
                )}

                {enrolling && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px', background: 'rgba(0,0,0,0.5)' }}>
                    <div style={{ width: '100%', height: '2px', background: 'rgba(255,255,255,0.2)' }}>
                      <div style={{ height: '100%', background: 'var(--cds-interactive-01)', width: `${enrollProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>

              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', lineHeight: 1.6 }}>
                  {i18n.language === 'ar'
                    ? 'لتمكين تسجيل الحضور من المواقع البعيدة، نحتاج لمسح صورة مرجعية بيومترية. يتم تشفير هذه البيانات واستخدامها فقط للتحقق من القرب المكاني المعتمد من القوى العاملة.'
                    : 'To authorize your attendance from remote sites, we require a master biometric image. This data is encrypted and used only for PAM-mandated proximity verification.'}
                </p>
                <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
                  <button
                    onClick={handleEnrollFace}
                    disabled={enrolling}
                    className="cds--btn cds--btn--primary"
                    style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}
                  >
                    {enrolling ? t('scanningGeometry') : (employeeData?.faceToken ? t('updateFaceRecord') : t('registerNewSignature'))}
                  </button>
                  {employeeData?.faceToken && !enrolling && (
                    <button
                      onClick={handleClearBiometrics}
                      className="cds--btn cds--btn--danger"
                      style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}
                    >
                      {i18n.language === 'ar' ? 'حذف الصورة' : 'Remove Photo'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{t('selfService')}</h3>
              <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: 'var(--cds-spacing-03)' }}>
                {i18n.language === 'ar'
                  ? 'قم بإنشاء شهادات راتب مختومة فوراً لطلبات القروض البنكية (الوطني / بيتك).'
                  : 'Instantly generate stamped salary certificates for bank loan applications (NBK/KFH).'}
              </p>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
              <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>
                {i18n.language === 'ar' ? 'جهة الإصدار' : 'Issuance Entity'}
              </label>
              <select
                value={selectedBank}
                onChange={(e) => setSelectedBank(e.target.value)}
                style={{ width: '100%', padding: 'var(--cds-spacing-04)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', color: 'var(--cds-text-primary)', fontSize: '0.875rem', fontFamily: 'monospace' }}
              >
                <option>{t('toWhom')}</option>
                <option>National Bank of Kuwait (NBK)</option>
                <option>Kuwait Finance House (KFH)</option>
                <option>Boubyan Bank</option>
                <option>Gulf Bank</option>
              </select>
              <button
                onClick={() => setShowCertModal(true)}
                className="cds--btn cds--btn--primary"
                style={{ width: '100%', marginTop: 'var(--cds-spacing-03)', fontSize: '0.75rem', fontFamily: 'monospace' }}
              >
                {i18n.language === 'ar' ? 'تحميل شهادة الراتب' : 'Generate Salary Certificate'}
              </button>
            </div>

            {/* Allowance Breakdown */}
            <div style={{ paddingTop: 'var(--cds-spacing-06)', borderTop: '1px solid var(--cds-border-subtle)' }}>
              <h4 style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-04)' }}>
                {i18n.language === 'ar' ? 'بدلاتي' : 'My Allowances'}
              </h4>
              {employeeData?.allowances?.length ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                  {employeeData.allowances.map((a: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--cds-spacing-03)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                        <span>{a.isHousing ? '🏠' : '💼'}</span>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>
                          {i18n.language === 'ar' && a.nameArabic ? a.nameArabic : a.name}
                        </span>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>
                        {a.type === 'Fixed' ? `${Number(a.value).toLocaleString()} KWD` : `${a.value}%`}
                      </span>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--cds-spacing-03)', background: 'var(--cds-interactive-01)', color: '#fff', border: '1px solid var(--cds-interactive-01)' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase' }}>{i18n.language === 'ar' ? 'إجمالي البدلات' : 'Total Allowances'}</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace' }}>
                      {employeeData.allowances.reduce((s: number, a: any) =>
                        s + (a.type === 'Fixed' ? Number(a.value) : (employeeData!.salary * Number(a.value) / 100)), 0
                      ).toLocaleString()} KWD
                    </span>
                  </div>
                </div>
              ) : (
                <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-disabled)' }}>{i18n.language === 'ar' ? 'لا توجد بدلات مسجلة' : 'No allowances on record'}</p>
              )}
            </div>

            <div style={{ paddingTop: 'var(--cds-spacing-06)', borderTop: '1px solid var(--cds-border-subtle)' }}>
              <h4 style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-04)' }}>
                {i18n.language === 'ar' ? 'إحصائيات الوثائق الرسمية' : 'Official Document Stats'}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--cds-spacing-03)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                  <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{i18n.language === 'ar' ? 'حالة البطاقة المدنية' : 'Civil ID Status'}</span>
                  <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>{t('secure')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--cds-spacing-03)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                  <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{i18n.language === 'ar' ? 'ملف التأمينات (PIFSS)' : 'PIFSS Filing'}</span>
                  <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>{t('verified')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Leave Balance Cards ── */}
      {employeeData && employeeData.leaveBalances && (
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {i18n.language === 'ar' ? 'رصيد الإجازات' : 'Leave Balance Overview'}
            </h3>
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
               <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Live To-Date Accrual</span>
            </div>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[
              { id: 'annual', icon: '🌴', label: i18n.language === 'ar' ? 'سنوية' : 'Annual', entitled: employeeData.leaveBalances.annual, used: employeeData.leaveBalances.annualUsed, color: 'bg-indigo-500', isSubLevel: false, accrued: accruedAnnual },
              { id: 'sick', icon: '🤒', label: i18n.language === 'ar' ? 'مرضية' : 'Sick', entitled: employeeData.leaveBalances.sick, used: employeeData.leaveBalances.sickUsed, color: 'bg-amber-500', isSubLevel: false },
              { id: 'emergency', icon: '🚨', label: i18n.language === 'ar' ? 'طارئة' : 'Emergency', entitled: employeeData.leaveBalances.emergency, used: employeeData.leaveBalances.emergencyUsed, color: 'bg-rose-400', isSubLevel: true },
              { id: 'short', icon: '⏱', label: i18n.language === 'ar' ? 'إذن قصير' : 'Short Perm', entitled: employeeData.leaveBalances.shortPermissionLimit, used: employeeData.leaveBalances.shortPermissionUsed, color: 'bg-violet-400', isSubLevel: true },
              { id: 'hajj', icon: '🕌', label: i18n.language === 'ar' ? 'حج' : 'Hajj', entitled: 1, used: employeeData.leaveBalances.hajUsed ? 1 : 0, color: 'bg-emerald-500', isSubLevel: false },
            ].map((item: any, i) => {
              const remaining = Math.max(0, item.entitled - item.used);
              const pct = item.entitled > 0 ? Math.min(100, (item.used / item.entitled) * 100) : 0;
              const isOver = item.used > item.entitled;
              return (
                <div key={i} className={`shrink-0 w-44 p-5 rounded-[28px] border space-y-3 transition-all duration-300 ${item.isSubLevel ? 'bg-slate-50/50 border-transparent opacity-80 hover:opacity-100' : 'bg-slate-50 border-slate-100 shadow-sm'}`}>
                  <div className={`flex items-center gap-2 ${item.isSubLevel ? 'grayscale opacity-75' : ''}`}>
                    <span className="text-2xl">{item.icon}</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest leading-tight ${item.isSubLevel ? 'text-slate-500' : 'text-slate-600'}`}>{item.label}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-black">
                      <span className={isOver ? 'text-rose-600' : (item.isSubLevel ? 'text-slate-600' : 'text-slate-900')}>{item.used} used</span>
                      <span className="text-slate-400">{item.entitled} total</span>
                    </div>
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${isOver ? 'bg-rose-500' : item.color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between items-center">
                       <p className={`text-[9px] font-bold ${item.isSubLevel ? 'text-slate-300' : 'text-slate-400'}`}>{remaining} {item.id === 'short' ? 'hrs' : 'days'} remaining</p>
                       {item.accrued !== undefined && (
                         <span className="text-[8px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded">
                           {item.accrued} earned to-date
                         </span>
                       )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Personal Activity Hub (Filtered Section) */}
      <div className="cds--tile" style={{ padding: '0', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 'var(--cds-spacing-06)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--cds-spacing-05)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
              {t('personalActivityHub')}
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--cds-spacing-03)' }}>
              <select
                style={{ padding: 'var(--cds-spacing-03) var(--cds-spacing-04)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', color: 'var(--cds-text-primary)', fontSize: '0.75rem', fontFamily: 'monospace' }}
                value={filterMonth}
                onChange={e => setFilterMonth(parseInt(e.target.value))}
              >
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select
                style={{ padding: 'var(--cds-spacing-03) var(--cds-spacing-04)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', color: 'var(--cds-text-primary)', fontSize: '0.75rem', fontFamily: 'monospace' }}
                value={filterYear}
                onChange={e => setFilterYear(parseInt(e.target.value))}
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>

              {hubTab === 'bonuses' && (
                <div style={{ display: 'flex', gap: 'var(--cds-spacing-03)', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 'var(--cds-spacing-03)' }}>
                    <button 
                      onClick={() => setVCompSubTypeFilter(prev => prev === 'Performance_Bonus' ? 'ALL' : 'Performance_Bonus')}
                      style={{ padding: 'var(--cds-spacing-03)', fontSize: '0.625rem', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', background: vCompSubTypeFilter === 'Performance_Bonus' ? 'var(--cds-interactive-01)' : 'var(--cds-background)', color: vCompSubTypeFilter === 'Performance_Bonus' ? '#fff' : 'var(--cds-text-secondary)', border: '1px solid var(--cds-border-subtle)' }}
                    >
                      <span>⭐</span> {i18n.language === 'ar' ? 'ترشيح للأداء' : 'Performance'}
                    </button>
                    <button 
                      onClick={() => setVCompSubTypeFilter(prev => prev === 'Profit_Sharing' ? 'ALL' : 'Profit_Sharing')}
                      style={{ padding: 'var(--cds-spacing-03)', fontSize: '0.625rem', fontFamily: 'monospace', textTransform: 'uppercase', cursor: 'pointer', background: vCompSubTypeFilter === 'Profit_Sharing' ? 'var(--cds-support-success)' : 'var(--cds-background)', color: vCompSubTypeFilter === 'Profit_Sharing' ? '#fff' : 'var(--cds-text-secondary)', border: '1px solid var(--cds-border-subtle)' }}
                    >
                      <span>💰</span> {i18n.language === 'ar' ? 'مكافأة الشركة' : 'Company Bonus'}
                    </button>
                  </div>

                  <select
                    style={{ padding: 'var(--cds-spacing-03) var(--cds-spacing-04)', background: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle)', color: 'var(--cds-text-primary)', fontSize: '0.75rem', fontFamily: 'monospace' }}
                    value={vCompFilterStatus}
                    onChange={e => setVCompFilterStatus(e.target.value as any)}
                  >
                    <option value="ALL">{i18n.language === 'ar' ? 'الكل' : 'All Status'}</option>
                    <option value="APPROVED">{i18n.language === 'ar' ? 'مقبول' : 'Approved'}</option>
                    <option value="PENDING">{i18n.language === 'ar' ? 'قيد الانتظار' : 'Pending'}</option>
                    <option value="REJECTED">{i18n.language === 'ar' ? 'مرفوض' : 'Rejected'}</option>
                  </select>
                </div>
              )}
            </div>
          </div>
          <div className="cds--tabs">
            {[
              { id: 'attendance', label: t('attendanceSheet') },
              { id: 'leaves', label: t('leavePortfolio') },
              { id: 'documents', label: i18n.language === 'ar' ? 'وثائقي' : 'Documents' },
              { id: 'payroll', label: i18n.language === 'ar' ? 'الرواتب' : 'Payroll' },
              { id: 'expenses', label: i18n.language === 'ar' ? 'المصاريف' : 'Expenses' },
              { id: 'bonuses', label: i18n.language === 'ar' ? 'المكافآت' : 'Bonuses' },
              { id: 'performance', label: i18n.language === 'ar' ? 'الأداء' : 'Performance' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setHubTab(tab.id as any)}
                className={`cds--tab ${hubTab === tab.id ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto min-h-[400px]">
          {hubTab === 'attendance' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="px-10 py-6">{t('date')}</th>
                  <th className="px-10 py-6">{t('clock')} In</th>
                  <th className="px-10 py-6">{t('clock')} Out</th>
                  <th className="px-10 py-6">{t('contextLocationTh')}</th>
                  <th className="px-10 py-6">{t('registryStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sheetLoading ? (
                  <tr><td colSpan={5} className="p-32 text-center animate-pulse text-slate-300 font-black uppercase tracking-widest">{i18n.language === 'ar' ? 'معالجة ورقة العمل الشخصية...' : 'Synthesizing Personal Worksheet...'}</td></tr>
                ) : personalWorksheet.length > 0 ? (
                  personalWorksheet.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-10 py-6 font-black text-slate-700">{log.date}</td>
                      <td className="px-10 py-6 font-mono text-xs font-bold text-slate-900">{log.clockIn}</td>
                      <td className="px-10 py-6 font-mono text-xs font-bold text-slate-400">{log.clockOut}</td>
                      <td className="px-10 py-6">
                        <p className="text-xs font-bold text-slate-700">{log.location !== '--' ? log.location : '---'}</p>
                        {log.subStatus && <p className="text-[8px] font-black text-indigo-500 uppercase">{log.subStatus}</p>}
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border ${getStatusStyle(log.status, log.subStatus)}`}>
                            {t(log.status.toLowerCase().replace(' ', '')) || log.status}
                          </span>
                          {log.subStatus === 'Resumption Pending' && (
                            <span className="text-[7px] font-black text-amber-600 uppercase tracking-tighter animate-pulse">{i18n.language === 'ar' ? 'بانتظار مصادقة الموارد البشرية' : 'Awaiting HR Handshake'}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))) : (
                  <tr><td colSpan={5} className="p-32 text-center text-slate-300 italic font-medium">{i18n.language === 'ar' ? 'لم يتم العثور على سجلات نشاط للفترة المحددة.' : 'No activity logs found for the selected period.'}</td></tr>
                )}
              </tbody>
            </table>
          ) : hubTab === 'leaves' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="px-10 py-6">{t('leaveType')}</th>
                  <th className="px-10 py-6">{t('leavePeriod')}</th>
                  <th className="px-10 py-6">{t('billableDays')}</th>
                  <th className="px-10 py-6">{t('registryStatus')}</th>
                  <th className="px-10 py-6" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeaves.length > 0 ? filteredLeaves.map(req => (
                  <React.Fragment key={req.id}>
                    <tr className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-10 py-6">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{req.type === 'Annual' ? '🌴' : req.type === 'Sick' ? '🤒' : '🚶'}</span>
                          <p className="text-sm font-black text-slate-800">{req.type}</p>
                        </div>
                      </td>
                      <td className="px-10 py-6"><p className="text-xs font-bold text-slate-600">{req.startDate} → {req.endDate}</p></td>
                      <td className="px-10 py-6 font-black text-slate-900">
                        {req.type === 'ShortPermission' ? `${req.durationHours}h` : `${req.days} ${t('members')}`}
                      </td>
                      <td className="px-10 py-6">
                        <div className="flex flex-col">
                          <span className={`inline-block px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border max-w-fit ${req.status === 'HR_Finalized' || req.status === 'Paid' ? 'bg-slate-100 text-slate-400' : 'bg-amber-100 text-amber-700'
                            }`}>{req.status.replace('_', ' ')}</span>
                          {req.status === 'HR_Approved' && (
                            <span className="text-[8px] font-black text-rose-500 uppercase mt-1 animate-pulse">{i18n.language === 'ar' ? 'تأكيد الاستئناف عند تسجيل الحضور' : 'Confirm Resumption on Clock-In'}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-10 py-6 text-right">
                        <button
                          onClick={() => handleToggleLeaveAudit(req.id)}
                          className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all text-base ml-auto ${expandedLeaveId === req.id ? 'bg-indigo-100 text-indigo-700 rotate-90' : 'text-slate-300 hover:text-slate-600'
                            }`}
                        >⋯</button>
                      </td>
                    </tr>
                    {expandedLeaveId === req.id && (
                      <tr>
                        <td colSpan={5} className="px-10 pb-4 pt-0">
                          <div className="bg-slate-50 rounded-2xl border border-slate-100 p-4 space-y-2 animate-in slide-in-from-top-2 duration-300">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">{i18n.language === 'ar' ? 'سجل المراجعة' : 'Audit Trail'}</p>
                            {leaveAuditMap[req.id] === undefined ? (
                              <div className="flex items-center gap-2 text-slate-400 text-xs"><div className="w-3 h-3 border-2 border-slate-300 border-t-indigo-500 rounded-full animate-spin" />Loading…</div>
                            ) : leaveAuditMap[req.id].length === 0 ? (
                              <p className="text-xs text-slate-300 italic">{i18n.language === 'ar' ? 'لا توجد إدخالات' : 'No history entries'}</p>
                            ) : leaveAuditMap[req.id].map((h: any, idx: number) => (
                              <div key={idx} className="flex gap-3 items-start">
                                <div className="w-2 h-2 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                                <div>
                                  <p className="text-[11px] font-black text-slate-700">{h.action}</p>
                                  <p className="text-[9px] text-slate-400">{h.user || h.actor_name} · {(h.timestamp || h.created_at)?.slice(0, 10)}</p>
                                  {h.note && <p className="text-[9px] text-slate-500 italic mt-0.5">"{h.note}"</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )) : (
                  <tr><td colSpan={5} className="p-32 text-center text-slate-300 italic font-medium">{i18n.language === 'ar' ? 'لم يتم العثور على طلبات إجازة.' : 'No leave applications found for this month.'}</td></tr>
                )}
              </tbody>
            </table>
          ) : hubTab === 'payroll' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="px-10 py-6">{t('period')}</th>
                  <th className="px-10 py-6">Basic Salary</th>
                  <th className="px-10 py-6">Allowances & Bonuses</th>
                  <th className="px-10 py-6">Deductions</th>
                  <th className="px-10 py-6">Net Salary</th>
                  <th className="px-10 py-6 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payrollHistory.length > 0 ? payrollHistory.map(({ item, run }) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-10 py-6">
                      <p className="text-sm font-black text-slate-800">{run.periodKey}</p>
                      <p className="text-[10px] text-slate-400">{run.cycleType}</p>
                    </td>
                    <td className="px-10 py-6">
                       <p className="text-sm font-black text-slate-900">{item.basicSalary.toLocaleString(locale)}</p>
                       <p className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">Basic</p>
                    </td>
                    <td className="px-10 py-6">
                       <p className="text-sm font-black text-emerald-600">{(item.housingAllowance + item.otherAllowances + (item.overtimeAmount || 0) + (item.performanceBonus || 0) + (item.annualLeavePay || 0) + (item.sickLeavePay || 0)).toLocaleString(locale)}</p>
                       <p className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">
                         H: {item.housingAllowance.toLocaleString(locale)} | L: {((item.annualLeavePay || 0) + (item.sickLeavePay || 0)).toLocaleString(locale)}
                       </p>
                    </td>
                    <td className="px-10 py-6">
                       <p className="text-sm font-black text-rose-600">{(item.pifssDeduction + item.leaveDeductions + item.shortPermissionDeductions).toLocaleString(locale)}</p>
                       <p className="text-[8px] text-slate-400 uppercase font-bold tracking-tighter">
                         P: {item.pifssDeduction.toLocaleString(locale)} | A: {item.leaveDeductions.toLocaleString(locale)}
                       </p>
                    </td>
                    <td className="px-10 py-6 font-black text-indigo-600 font-mono text-lg">{item.netSalary.toLocaleString(locale)}</td>
                    <td className="px-10 py-6 text-right">
                      <button 
                        onClick={() => { setSelectedPayslip({ item, run }); setShowPayslipModal(true); }}
                        className="px-4 py-2 bg-indigo-50 text-indigo-700 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm group-hover:shadow-indigo-600/20"
                      >
                        {i18n.language === 'ar' ? 'عرض التفاصيل' : 'Details'}
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="p-32 text-center text-slate-300 italic font-medium">No payroll history found.</td></tr>
                )}
              </tbody>
            </table>
          ) : hubTab === 'expenses' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="px-10 py-6">Merchant</th>
                  <th className="px-10 py-6">Date</th>
                  <th className="px-10 py-6">Amount</th>
                  <th className="px-10 py-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenseClaims.length > 0 ? expenseClaims.map(claim => (
                  <tr key={claim.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-10 py-6 font-bold">{claim.merchant}</td>
                    <td className="px-10 py-6 text-slate-500">{claim.date}</td>
                    <td className="px-10 py-6 font-black">{claim.amount.toLocaleString(locale)} {t('currency')}</td>
                    <td className="px-10 py-6">
                      <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${
                        claim.status === 'Paid' ? 'bg-emerald-50 text-emerald-600' : 
                        claim.status === 'Rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                      }`}>{claim.status}</span>
                    </td>
                  </tr>
                )) : (
                   <tr><td colSpan={4} className="p-32 text-center text-slate-300 italic font-medium">No expense claims found.</td></tr>
                )}
              </tbody>
            </table>
          ) : hubTab === 'bonuses' ? (
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="px-10 py-6">Type</th>
                  <th className="px-10 py-6">Period</th>
                  <th className="px-10 py-6">Amount</th>
                  <th className="px-10 py-6">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVariableComp.length > 0 ? filteredVariableComp.map(comp => (
                  <tr key={comp.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-10 py-6">
                      <p className="text-sm font-black text-slate-800">
                        {comp.comp_type === 'OVERTIME' ? (i18n.language === 'ar' ? 'إضافي' : 'Overtime') : 
                         (comp.sub_type || 'Bonus').replace(/_/g, ' ')}
                      </p>
                    </td>
                    <td className="px-10 py-6 text-slate-500">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{comp.effective_date || comp.created_at?.slice(0, 10)}</p>
                      <p className="text-[10px] font-black text-indigo-500">{comp.comp_type}</p>
                    </td>
                    <td className="px-10 py-6 font-black text-emerald-600">+{Number(comp.amount).toLocaleString(locale)} {t('currency')}</td>
                    <td className="px-10 py-6">
                      <span className={`px-2.5 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${
                        comp.status === 'APPROVED_FOR_PAYROLL' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        comp.status === 'PROCESSED' ? 'bg-slate-50 text-slate-400 border-slate-100' :
                        comp.status === 'REJECTED' ? 'bg-rose-50 text-rose-600 border-rose-100' : 
                        'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>{comp.status?.replace(/_/g, ' ')}</span>
                    </td>
                  </tr>
                )) : (
                   <tr><td colSpan={4} className="p-32 text-center text-slate-300 italic font-medium">No bonuses or overtime found for this month.</td></tr>
                )}
              </tbody>
            </table>
          ) : null}

          {/* ── Documents Tab ── */}
          {hubTab === 'documents' && (
            <div className="p-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { icon: '🌍', label: i18n.language === 'ar' ? 'الجنسية' : 'Nationality', value: employeeData?.nationality, expiry: null },
                  { icon: '📧', label: i18n.language === 'ar' ? 'البريد الإلكتروني' : 'Corp Email', value: employeeData?.email, expiry: null },
                  { icon: '🪪', label: i18n.language === 'ar' ? 'البطاقة المدنية' : 'Civil ID', value: employeeData?.civilId, expiry: employeeData?.civilIdExpiry },
                  { icon: '🛂', label: i18n.language === 'ar' ? 'جواز السفر' : 'Passport', value: employeeData?.passportNumber, expiry: employeeData?.passportExpiry },
                  { icon: '📋', label: i18n.language === 'ar' ? 'إذن العمل' : 'Izn Amal', value: null, expiry: employeeData?.iznAmalExpiry },
                  { icon: '🏦', label: i18n.language === 'ar' ? 'آيبان' : 'IBAN', value: employeeData?.iban, expiry: null },
                  { icon: '🔐', label: i18n.language === 'ar' ? 'تأمينات' : 'PIFSS No.', value: employeeData?.pifssNumber, expiry: null },
                ].map((doc, i) => {
                  const st = getDocStatus(doc.expiry);
                  return (
                    <div key={i} className="bg-white border border-slate-200 rounded-[28px] p-6 flex flex-col gap-3 hover:border-indigo-200 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-50 rounded-2xl flex items-center justify-center text-xl border border-slate-100">{doc.icon}</div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{doc.label}</p>
                        </div>
                        {st && <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg whitespace-nowrap ${st.cls}`}>{st.label}</span>}
                      </div>
                      <p className="text-sm font-black text-slate-800 px-1 font-mono">
                        {doc.value ? doc.value : (doc.expiry ? doc.expiry : '—')}
                      </p>
                      {doc.expiry && (
                        <p className="text-[9px] text-slate-400 font-bold px-1">
                          {i18n.language === 'ar' ? 'ينتهي:' : 'Expires:'} {doc.expiry}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hubTab === 'performance' && (
            <div className="p-8">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">{i18n.language === 'ar' ? 'مؤشرات الأداء الرئيسية' : 'Key Performance Indicators (KPIs)'}</h3>
                  <p className="text-xs font-bold text-slate-500 mt-1">{i18n.language === 'ar' ? 'التقييمات المخصصة والنقاط المحققة' : 'Assigned templates and achieved scores'}</p>
                </div>
              </div>

              {employeeData?.kpiTemplateIds && employeeData.kpiTemplateIds.length > 0 ? (
                <div className="space-y-6">
                  {kpiTemplates.filter(t => employeeData.kpiTemplateIds?.includes(t.id)).map(tmpl => (
                    <div key={tmpl.id} className="bg-slate-50 p-6 rounded-3xl border border-slate-200">
                      <div className="flex justify-between items-center mb-4 px-2">
                        <h4 className="text-sm font-black text-slate-700">{tmpl.title}</h4>
                        {tmpl.department === employeeData.department && (
                          <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-xl uppercase tracking-widest border border-indigo-100 shadow-sm">{i18n.language === 'ar' ? 'افتراضي' : 'Default'}</span>
                        )}
                      </div>
                      <div className="space-y-3">
                        {tmpl.kpis.map((k: any, idx: number) => {
                           const evalScore = latestEval?.kpiScores?.find((s:any) => s.name === `[${tmpl.title}] ${k.name}`);
                           return (
                             <div key={idx} className="flex justify-between items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-colors hover:border-indigo-100">
                                <div className="flex-1">
                                  <span className="text-xs font-black text-slate-700">{k.name}</span>
                                </div>
                                <div className="w-24 text-center">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{i18n.language === 'ar' ? 'الوزن' : 'Weight'}: {k.weight}%</span>
                                </div>
                                <div className="w-32 text-right">
                                    {evalScore ? (
                                      <span className="inline-block text-xs font-black text-indigo-600 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100 shadow-sm">
                                        {evalScore.score}%  {i18n.language === 'ar' ? 'مُحقق' : 'Achieved'}
                                      </span>
                                    ) : (
                                      <span className="text-[11px] font-bold text-slate-400 px-3 py-1.5">{i18n.language === 'ar' ? 'قيد الانتظار' : 'Pending'}</span>
                                    )}
                                </div>
                             </div>
                           )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-20 text-center border-2 border-dashed border-slate-200 rounded-[40px] bg-slate-50/50">
                  <p className="text-slate-400 text-sm font-black uppercase tracking-widest">{i18n.language === 'ar' ? 'لا توجد نماذج مخصصة بعد' : 'No KPI Templates Assigned'}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {showCertModal && employeeData && (
        <SalaryCertificateModal
          employee={employeeData}
          item={latestPayslip?.item}
          bankName={selectedBank}
          language={i18n.language}
          onClose={() => setShowCertModal(false)}
        />
      )}

      {showPayslipModal && selectedPayslip && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 text-start printable-document-root">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md no-print" onClick={() => setShowPayslipModal(false)}></div>
          <div className="bg-white w-full max-w-2xl rounded-[48px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col border border-slate-200 printable-document">
            <div className="p-10 bg-slate-50 border-b border-slate-100 flex justify-between items-center text-start">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-xl font-black shadow-lg shadow-indigo-600/20">KW</div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">{i18n.language === 'ar' ? 'قسيمة الراتب التفصيلية' : 'Audit Payslip'}</h3>
                  <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Audit Trace ID: {selectedPayslip.run.id.slice(0, 8).toUpperCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right hidden sm:block">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{i18n.language === 'ar' ? 'الفترة المحاسبية' : 'Accounting Period'}</p>
                  <p className="text-xl font-black text-slate-900 tracking-tighter">
                    {(() => {
                      const [y, m] = selectedPayslip.run.periodKey.split('-');
                      const months = i18n.language === 'ar' 
                        ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
                        : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                      return `${months[parseInt(m) - 1]} ${y}`;
                    })()}
                  </p>
                </div>
                <button onClick={() => setShowPayslipModal(false)} className="w-14 h-14 flex items-center justify-center bg-white rounded-[20px] text-slate-400 hover:text-slate-600 shadow-sm border border-slate-100 transition-all active:scale-95 text-2xl font-bold">×</button>
              </div>
            </div>

            <div className={`flex-1 overflow-y-auto p-10 space-y-10 text-start ${i18n.language === 'ar' ? 'font-arabic' : ''}`} dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}>
              {/* Contractual Header */}
              <div className="bg-slate-900 rounded-[40px] p-8 text-white relative z-10 shadow-2xl overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -mr-20 -mt-20"></div>
                <div className="flex justify-between items-center mb-6 opacity-60">
                  <span className="text-[10px] font-black uppercase tracking-widest">{i18n.language === 'ar' ? 'الراتب التعاقدي الإجمالي' : 'Contractual Monthly Gross'}</span>
                  <span className="text-[10px] font-black uppercase tracking-widest font-mono">{(selectedPayslip.item.employeeId || '').slice(0, 8).toUpperCase()}</span>
                </div>
                <div className="flex justify-between items-end">
                  <div className="text-4xl font-black flex items-baseline gap-2">
                    {((selectedPayslip.item.allowanceBreakdown || []).find(a => a.name.includes('Contractual'))?.value
                      || (selectedPayslip.item.basicSalary + selectedPayslip.item.housingAllowance + selectedPayslip.item.otherAllowances + (selectedPayslip.item.leaveDeductions || 0))).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    <span className="text-sm opacity-40">KWD</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-300">{selectedPayslip.item.employeeName}</p>
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">{i18n.language === 'ar' ? 'حالة التدقيق: ناجح' : 'Audit Status: PASSED'}</p>
                  </div>
                </div>
              </div>

              <div className="space-y-10">
                {/* EARNINGS */}
                <div>
                  <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-4">
                    {i18n.language === 'ar' ? 'بيانات الاستحقاق وتوزيع الراتب' : 'Earnings & Salary Allocation'} <span className="h-[1px] flex-1 bg-slate-100"></span>
                  </h6>
                  <div className="grid grid-cols-1 gap-4">
                    {((selectedPayslip.item.allowanceBreakdown || []).filter(a => !a.name.includes('Contractual') && (a.value || 0) > 0)).length > 0 ? (
                      (selectedPayslip.item.allowanceBreakdown || [])
                        .filter(a => !a.name.includes('Contractual') && (a.value || 0) > 0)
                        .map((a, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-700">{a.name}</span>
                              {(a.name.includes('Pay') || a.name.includes('Worked')) && (
                                <span className="text-[9px] text-slate-400 uppercase font-black tracking-tighter">
                                  {i18n.language === 'ar' ? 'تم التحقق من بيانات الحضور' : 'Verified Attendance Data'}
                                </span>
                              )}
                            </div>
                            <span className="text-sm font-black text-indigo-600">{(a.value || 0).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                          </div>
                      ))
                    ) : (
                      <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                        <span className="text-sm font-bold text-slate-700">{i18n.language === 'ar' ? 'الراتب الأساسي' : 'Basic Salary'}</span>
                        <span className="text-sm font-black text-slate-900">{selectedPayslip.item.basicSalary.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* DEDUCTIONS */}
                <div>
                  <h6 className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-6 flex items-center gap-4">
                    {i18n.language === 'ar' ? 'الاستقطاعات' : 'Deductions'} <span className="h-[1px] flex-1 bg-rose-50"></span>
                  </h6>
                  <div className="grid grid-cols-1 gap-4">
                    {((selectedPayslip.item.deductionBreakdown || []).filter(d => (d.value || 0) > 0)).length > 0 ? (
                      (selectedPayslip.item.deductionBreakdown || [])
                        .filter(d => (d.value || 0) > 0)
                        .map((d, idx) => (
                          <div key={idx} className="flex justify-between items-center bg-rose-50/30 p-4 rounded-2xl border border-rose-100">
                            <span className="text-sm font-medium text-slate-600">{d.name}</span>
                            <span className="text-sm font-black text-rose-600">-{(d.value || 0).toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                          </div>
                      ))
                    ) : (
                      <div className="flex justify-between items-center bg-rose-50/30 p-4 rounded-2xl border border-rose-100">
                        <span className="text-sm font-medium text-slate-600">{i18n.language === 'ar' ? 'تأمينات (PIFSS)' : 'PIFSS (11.5%)'}</span>
                        <span className="text-sm font-black text-rose-600">-{selectedPayslip.item.pifssDeduction.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-10 border-t-2 border-dashed border-slate-200">
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-3">{i18n.language === 'ar' ? 'صافي الراتب المستحق' : 'Net Salary Payable'}</p>
                      <div className="flex items-baseline gap-4">
                        <span className="text-6xl font-black text-slate-900 tracking-tighter">{selectedPayslip.item.netSalary.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                        <span className="text-2xl font-black text-slate-400 uppercase tracking-widest">KWD</span>
                      </div>
                    </div>
                    <div className="text-right opacity-30">
                       <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] font-mono">*SECURED AUDIT SEAL*</p>
                       <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-1">VERIFIED AGAINST OFFICIAL PAYROLL AUDIT LOGS</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 bg-slate-900 flex gap-4 no-print">
               <button 
                onClick={() => window.print()} 
                className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all"
               >
                 {i18n.language === 'ar' ? 'طباعة القسيمة' : 'Print Payslip'}
               </button>
               <button 
                onClick={() => setShowPayslipModal(false)}
                className="flex-1 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-indigo-600/20"
               >
                 {t('close')}
               </button>
            </div>
          </div>
        </div>
      )}
      </div>
    );
};

export default ProfileView;
