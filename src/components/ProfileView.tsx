
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
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white w-full max-w-2xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh] flex flex-col text-start border border-slate-200">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
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

        <div className="p-8 bg-slate-900 text-white flex gap-4">
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
  const [hubTab, setHubTab] = useState<'attendance' | 'leaves' | 'documents'>('attendance');
  const [expandedLeaveId, setExpandedLeaveId] = useState<string | null>(null);
  const [leaveAuditMap, setLeaveAuditMap] = useState<Record<string, any[]>>({});

  // Filter state
  const [filterMonth, setFilterMonth] = useState(new Date().getMonth() + 1);
  const [filterYear, setFilterYear] = useState(new Date().getFullYear());

  const months = useMemo(() => {
    return i18n.language === 'ar'
      ? ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
      : ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  }, [i18n.language]);

  // Biometric Enrollment State
  const [enrolling, setEnrolling] = useState(false);
  const [enrollProgress, setEnrollProgress] = useState(0);
  const enrollVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const watchdogRef = useRef<number | null>(null);

  const fetchProfileData = async () => {
    setLoading(true);
    try {
      const [emp, payslip, leaves] = await Promise.all([
        hrmDb.getEmployeeByName(user.name),
        hrmDb.getLatestFinalizedPayroll(user.id),
        hrmDb.getLeaveRequests({ employeeId: user.id })
      ]);
      if (emp) setEmployeeData(emp);
      setLatestPayslip(payslip);
      setPersonalLeaves(leaves);
    } catch (err) {
      console.error('Error fetching profile data:', err);
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
      case 'Weekend': return 'bg-slate-50 text-slate-300 border-slate-50';
      case 'Absent': return 'bg-rose-50 text-rose-700 border-rose-100';
      case 'Holiday': return 'bg-indigo-50 text-indigo-700 border-indigo-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  if (loading) return <div className="p-10 animate-pulse bg-white rounded-[32px] h-96"></div>;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-24 text-start">
      {showGuide && (
        <div className="bg-indigo-600 p-8 rounded-[40px] text-white shadow-xl shadow-indigo-500/10 flex flex-col md:flex-row items-center gap-8 border border-indigo-500/20 animate-in slide-in-from-top-4 duration-500 relative overflow-hidden text-start">
          <div className="absolute top-0 right-0 p-12 opacity-10 pointer-events-none">🎫</div>
          <div className="w-16 h-16 bg-white/20 rounded-3xl flex items-center justify-center text-3xl shrink-0">👤</div>
          <div className="flex-1 space-y-2">
            <h3 className="text-xl font-black tracking-tight">{t('guideProfileTitle')}</h3>
            <p className="text-indigo-50 font-medium leading-relaxed opacity-90">{t('guideProfileDesc')}</p>
          </div>
          <button
            onClick={dismissGuide}
            className="px-8 py-3 bg-white text-indigo-700 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95 shadow-lg"
          >
            {t('gotIt')}
          </button>
        </div>
      )}

      <header className="flex flex-col md:flex-row items-start md:items-end gap-6 bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 end-0 p-10 opacity-5 pointer-events-none">
          <span className="text-[200px] leading-none select-none">🇰🇼</span>
        </div>

        <div className="w-28 h-28 rounded-[40px] bg-slate-900 border-4 border-slate-800 flex items-center justify-center text-5xl text-white shadow-2xl relative z-10 overflow-hidden">
          {employeeData?.faceToken ? (
            <img src={employeeData.faceToken} className="w-full h-full object-cover grayscale brightness-110" />
          ) : (
            user.name.split(' ').map(n => n[0]).join('')
          )}
        </div>
        <div className="mb-2 relative z-10 flex-1">
          <h2 className="text-4xl font-black text-slate-900 tracking-tight">
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
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-lg tracking-widest border border-indigo-100">{user.role}</span>
            <span className={`px-3 py-1 text-[10px] font-black uppercase rounded-lg tracking-widest border ${employeeData?.faceToken ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
              {employeeData?.faceToken ? `🧬 ${t('biometricallyLinked')}` : `🚫 ${t('faceNotEnrolled')}`}
            </span>
          </div>
        </div>

        <div className="relative z-10 flex gap-4">
          <div className="bg-slate-50 p-6 rounded-[32px] border border-slate-200">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 text-center">{t('joinedSince')}</p>
            <p className="text-lg font-black text-slate-900">
              {employeeData?.joinDate && !isNaN(new Date(employeeData.joinDate).getTime())
                ? new Date(employeeData.joinDate).getFullYear()
                : (i18n.language === 'ar' ? 'غير متوفر' : 'N/A')}
            </p>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-slate-900 p-10 rounded-[40px] text-white flex flex-col justify-center items-center text-center relative overflow-hidden group border border-white/5">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 opacity-90"></div>
            <div className="relative z-10">
              <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4">{t('latestSalarySlip')}</p>
              <h3 className="text-5xl font-black mb-2">{latestPayslip ? latestPayslip.item.netSalary.toLocaleString(locale) : '0'} <span className="text-xl">{t('currency')}</span></h3>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-8 border-b border-slate-100 pb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 tracking-tight">{t('identityEnrollment')}</h3>
                <p className="text-xs text-slate-500 font-medium">{t('verifyFaceSignature')}</p>
              </div>
              {employeeData?.faceToken && (
                <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">✓</div>
              )}
            </div>

            <div className="flex flex-col md:flex-row items-center gap-10">
              <div className="relative">
                <div className="w-48 h-48 rounded-[40px] bg-slate-50 border-2 border-dashed border-slate-200 overflow-hidden flex items-center justify-center group relative shadow-inner">
                  {enrolling ? (
                    <video ref={enrollVideoRef} autoPlay muted playsInline className="w-full h-full object-cover grayscale" />
                  ) : employeeData?.faceToken ? (
                    <img src={employeeData.faceToken} className="w-full h-full object-cover grayscale" />
                  ) : (
                    <span className="text-4xl opacity-20">🤳</span>
                  )}

                  {enrolling && (
                    <div className="absolute inset-0 bg-slate-900/40 flex items-center justify-center p-6">
                      <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden border border-white/10">
                        <div className="h-full bg-indigo-400 transition-all duration-300" style={{ width: `${enrollProgress}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 space-y-6">
                <p className="text-sm text-slate-600 leading-relaxed font-medium">
                  {i18n.language === 'ar'
                    ? 'لتمكين تسجيل الحضور من المواقع البعيدة، نحتاج لمسح صورة مرجعية بيومترية. يتم تشفير هذه البيانات واستخدامها فقط للتحقق من القرب المكاني المعتمد من القوى العاملة.'
                    : 'To authorize your attendance from remote sites, we require a master biometric image. This data is encrypted and used only for PAM-mandated proximity verification.'}
                </p>
                <div className="flex flex-wrap gap-4">
                  <button
                    onClick={handleEnrollFace}
                    disabled={enrolling}
                    className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {enrolling ? t('scanningGeometry') : (employeeData?.faceToken ? t('updateFaceRecord') : t('registerNewSignature'))}
                  </button>
                  {employeeData?.faceToken && !enrolling && (
                    <button
                      onClick={handleClearBiometrics}
                      className="px-8 py-4 bg-rose-50 text-rose-600 border border-rose-100 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all"
                    >
                      {i18n.language === 'ar' ? 'حذف الصورة' : 'Remove Photo'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-black text-slate-900 mb-4 tracking-tight">{t('selfService')}</h3>
              <p className="text-xs text-slate-400 mb-6 font-medium leading-relaxed">
                {i18n.language === 'ar'
                  ? 'قم بإنشاء شهادات راتب مختومة فوراً لطلبات القروض البنكية (الوطني / بيتك).'
                  : 'Instantly generate stamped salary certificates for bank loan applications (NBK/KFH).'}
              </p>
              <div className="space-y-4">
                <div className="space-y-2 text-start">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1">
                    {i18n.language === 'ar' ? 'جهة الإصدار' : 'Issuance Entity'}
                  </label>
                  <select
                    value={selectedBank}
                    onChange={(e) => setSelectedBank(e.target.value)}
                    className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/10"
                  >
                    <option>{t('toWhom')}</option>
                    <option>National Bank of Kuwait (NBK)</option>
                    <option>Kuwait Finance House (KFH)</option>
                    <option>Boubyan Bank</option>
                    <option>Gulf Bank</option>
                  </select>
                </div>
                <button
                  onClick={() => setShowCertModal(true)}
                  className="w-full py-5 bg-indigo-600 text-white rounded-[24px] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-indigo-600/10 active:scale-95 transition-all hover:bg-indigo-700"
                >
                  {i18n.language === 'ar' ? 'تحميل شهادة الراتب' : 'Generate Salary Certificate'}
                </button>
              </div>
            </div>

            {/* Allowance Breakdown */}
            <div className="pt-8 border-t border-slate-100 text-start">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                {i18n.language === 'ar' ? 'بدلاتي' : 'My Allowances'}
              </h4>
              {employeeData?.allowances?.length ? (
                <div className="space-y-2">
                  {employeeData.allowances.map((a: any, i: number) => (
                    <div key={i} className="flex items-center justify-between bg-slate-50 px-4 py-2.5 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{a.isHousing ? '🏠' : '💼'}</span>
                        <span className="text-[11px] font-black text-slate-700">
                          {i18n.language === 'ar' && a.nameArabic ? a.nameArabic : a.name}
                        </span>
                      </div>
                      <span className="text-[11px] font-black text-indigo-700">
                        {a.type === 'Fixed' ? `${Number(a.value).toLocaleString()} KWD` : `${a.value}%`}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between bg-slate-900 text-white px-4 py-2.5 rounded-2xl">
                    <span className="text-[10px] font-black uppercase tracking-widest">{i18n.language === 'ar' ? 'إجمالي البدلات' : 'Total Allowances'}</span>
                    <span className="text-[11px] font-black">
                      {employeeData.allowances.reduce((s: number, a: any) =>
                        s + (a.type === 'Fixed' ? Number(a.value) : (employeeData!.salary * Number(a.value) / 100)), 0
                      ).toLocaleString()} KWD
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-300 italic">{i18n.language === 'ar' ? 'لا توجد بدلات مسجلة' : 'No allowances on record'}</p>
              )}
            </div>

            <div className="pt-8 border-t border-slate-100 text-start">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                {i18n.language === 'ar' ? 'إحصائيات الوثائق الرسمية' : 'Official Document Stats'}
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500">{i18n.language === 'ar' ? 'حالة البطاقة المدنية' : 'Civil ID Status'}</span>
                  <span className="text-[10px] font-black text-indigo-600 uppercase">{t('secure')}</span>
                </div>
                <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500">{i18n.language === 'ar' ? 'ملف التأمينات (PIFSS)' : 'PIFSS Filing'}</span>
                  <span className="text-[10px] font-black text-indigo-600 uppercase">{t('verified')}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Leave Balance Cards ── */}
      {employeeData && employeeData.leaveBalances && (
        <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-5">
            {i18n.language === 'ar' ? 'رصيد الإجازات' : 'Leave Balance Overview'}
          </h3>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {[
              { id: 'annual', icon: '🌴', label: i18n.language === 'ar' ? 'سنوية' : 'Annual', entitled: employeeData.leaveBalances.annual, used: employeeData.leaveBalances.annualUsed, color: 'bg-indigo-500', isSubLevel: false },
              { id: 'sick', icon: '🤒', label: i18n.language === 'ar' ? 'مرضية' : 'Sick', entitled: employeeData.leaveBalances.sick, used: employeeData.leaveBalances.sickUsed, color: 'bg-amber-500', isSubLevel: false },
              { id: 'emergency', icon: '🚨', label: i18n.language === 'ar' ? 'طارئة' : 'Emergency', entitled: employeeData.leaveBalances.emergency, used: employeeData.leaveBalances.emergencyUsed, color: 'bg-rose-400', isSubLevel: true },
              { id: 'short', icon: '⏱', label: i18n.language === 'ar' ? 'إذن قصير' : 'Short Perm', entitled: employeeData.leaveBalances.shortPermissionLimit, used: employeeData.leaveBalances.shortPermissionUsed, color: 'bg-violet-400', isSubLevel: true },
              { id: 'hajj', icon: '🕌', label: i18n.language === 'ar' ? 'حج' : 'Hajj', entitled: 1, used: employeeData.leaveBalances.hajUsed ? 1 : 0, color: 'bg-emerald-500', isSubLevel: false },
            ].map((item, i) => {
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
                    <p className={`text-[9px] font-bold ${item.isSubLevel ? 'text-slate-300' : 'text-slate-400'}`}>{remaining} {item.id === 'short' ? 'hrs' : 'days'} remaining</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Personal Activity Hub (Filtered Section) */}
      <div className="bg-white rounded-[48px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 text-start">
          <div className="space-y-1">
            <h3 className="text-2xl font-black text-slate-800 tracking-tight">{t('personalActivityHub')}</h3>
            <div className="flex items-center gap-4 mt-2">
              <select
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest outline-none shadow-sm"
                value={filterMonth}
                onChange={e => setFilterMonth(parseInt(e.target.value))}
              >
                {months.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest outline-none shadow-sm"
                value={filterYear}
                onChange={e => setFilterYear(parseInt(e.target.value))}
              >
                <option value={2025}>2025</option>
                <option value={2026}>2026</option>
              </select>
            </div>
          </div>
          <div className="flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              onClick={() => setHubTab('attendance')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hubTab === 'attendance' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
            >
              {t('attendanceSheet')}
            </button>
            <button
              onClick={() => setHubTab('leaves')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hubTab === 'leaves' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
            >
              {t('leavePortfolio')}
            </button>
            <button
              onClick={() => setHubTab('documents')}
              className={`px-8 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hubTab === 'documents' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}
            >
              {i18n.language === 'ar' ? 'وثائقي' : 'Documents'}
            </button>
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
    </div>
  );
};

export default ProfileView;
