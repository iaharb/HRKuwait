
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { Employee, PublicHoliday, PayrollRun, PayrollItem } from '../types.ts';
import { useTranslation } from 'react-i18next';

const BankLetterModal: React.FC<{
  run: PayrollRun;
  items: PayrollItem[];
  employees: Employee[];
  bankName: string;
  language: string;
  onClose: () => void;
}> = ({ run, items, employees, bankName, language, onClose }) => {
  const { t } = useTranslation();
  const isAr = language === 'ar';
  const today = new Intl.DateTimeFormat(isAr ? 'ar-KW' : 'en-KW', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());

  const total = items.reduce((acc, curr) => acc + curr.netSalary, 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="bg-white w-full max-w-4xl rounded-[40px] shadow-2xl relative z-10 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center no-print">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('bankLetter')}</p>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-16 bg-white text-start">
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-10 mb-12">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tighter">ENTERPRISE WORKFORCE SOLUTIONS</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mt-2">Kuwait City Headquarters • Reg #990112</p>
            </div>
            <span className="text-5xl">🇰🇼</span>
          </div>

          <div className="space-y-10 text-slate-800 leading-relaxed font-serif">
            <div className="flex justify-between font-sans">
              <div className="space-y-1">
                <p className="font-black uppercase tracking-widest text-[10px] text-slate-400">{t('to')}:</p>
                <p className="text-lg font-black">{bankName}</p>
                <p className="text-sm font-bold text-slate-500">Kuwait Operations Department</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold">Date: {today}</p>
                <p className="text-xs text-slate-400 font-mono mt-1">REF: HRM/BNK/{run.periodKey.replace(/-/g, '')}</p>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-xl font-bold underline underline-offset-8 uppercase font-sans">
                Subject: Salary Transfer Authorization - {run.periodKey}
              </h3>
              <p className="text-sm">
                Dear Sir/Madam, Please find below the authorized salary disbursement for the period of <strong>{run.periodKey}</strong>. We request you to debit our account and credit the respective employees as listed:
              </p>
            </div>

            <table className="w-full border-collapse border border-slate-200 font-sans">
              <thead className="bg-slate-50">
                <tr className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
                  <th className="p-4 text-left border-e border-slate-200">{t('employeeNameTh')}</th>
                  <th className="p-4 text-left border-e border-slate-200">{t('ibanNumberTh')}</th>
                  <th className="p-4 text-right">{t('amountKwdTh')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map(item => {
                  const emp = employees.find(e => e.id === item.employeeId);
                  return (
                    <tr key={item.id} className="text-xs">
                      <td className="p-4 font-bold border-e border-slate-200">{item.employeeName}</td>
                      <td className="p-4 font-mono border-e border-slate-200 text-slate-500">{emp?.iban || '---'}</td>
                      <td className="p-4 text-right font-black">{item.netSalary.toLocaleString(isAr ? 'ar-KW' : 'en-KW', { minimumFractionDigits: 3 })}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-900 text-white">
                <tr>
                  <td colSpan={2} className="p-4 text-right font-black uppercase tracking-widest text-[10px]">Total Disbursement</td>
                  <td className="p-4 text-right text-lg font-black">{total.toLocaleString(isAr ? 'ar-KW' : 'en-KW', { minimumFractionDigits: 3 })}</td>
                </tr>
              </tfoot>
            </table>

            <div className="grid grid-cols-2 gap-20 pt-20 no-print-section">
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Authorized Signature</p>
                <div className="h-1 bg-slate-900 w-full opacity-10"></div>
                <p className="text-xs font-bold">HR Director / Finance Controller</p>
              </div>
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Company Stamp</p>
                <div className="w-32 h-32 border-2 border-dashed border-slate-200 rounded-full flex items-center justify-center text-[8px] text-slate-300 font-black uppercase text-center p-4">
                  Official Corporate Seal Required
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-10 bg-slate-900 flex gap-4 no-print">
          <button onClick={onClose} className="flex-1 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
            Close
          </button>
          <button onClick={() => window.print()} className="flex-[2] py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">
            Print Official Document (PDF)
          </button>
        </div>
      </div>
    </div>
  );
};

const ComplianceView: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { notify } = useNotifications();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [payrollRuns, setPayrollRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBankFormat, setSelectedBankFormat] = useState('NBK');
  const [letterModalData, setLetterModalData] = useState<{ run: PayrollRun, items: PayrollItem[] } | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  const banks = [
    { id: 'NBK', name: 'National Bank of Kuwait (NBK)' },
    { id: 'KFH', name: 'Kuwait Finance House (KFH)' },
    { id: 'BOUB', name: 'Boubyan Bank' },
    { id: 'GULF', name: 'Gulf Bank' },
    { id: 'Standard', name: 'Generic WPS Portal' }
  ];

  useEffect(() => {
    const fetchData = async () => {
      const [emps, runs] = await Promise.all([
        dbService.getEmployees(),
        dbService.getPayrollRuns()
      ]);
      setEmployees(emps);
      setPayrollRuns(runs);
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleExportWPS = async (runId: string) => {
    try {
      const csv = await dbService.exportWPS(runId, selectedBankFormat);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.setAttribute('href', url);
      const bankCode = banks.find(b => b.id === selectedBankFormat)?.id || 'GEN';
      a.setAttribute('download', `WPS_${bankCode}_${runId.slice(0, 8)}.csv`);
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      notify(t('success'), `${t('wpsExport')} (${selectedBankFormat}) Ready.`, "success");
    } catch (err) {
      notify(t('critical'), t('unknown'), "error");
    }
  };

  const handleOpenBankLetter = async (run: PayrollRun) => {
    try {
      const items = await dbService.getPayrollItems(run.id);
      setLetterModalData({ run, items });
    } catch (err) {
      notify("Error", "Failed to fetch payroll distribution details.", "error");
    }
  };

  const calculateDaysRemaining = (expiryDate?: string) => {
    if (!expiryDate) return Infinity;
    const today = new Date();
    const expiry = new Date(expiryDate);
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getExpiryStatus = (days: number) => {
    if (days < 0) return { label: t('expired'), color: 'bg-rose-500 text-white shadow-rose-200', icon: '🚨' };
    if (days <= 30) return { label: `${days}d`, color: 'bg-orange-500 text-white shadow-orange-200', icon: '⚠️' };
    if (days <= 90) return { label: t('warning'), color: 'bg-amber-400 text-amber-900 shadow-amber-100', icon: '⏳' };
    return { label: t('secure'), color: 'bg-indigo-600 text-white shadow-indigo-200', icon: '✅' };
  };

  const expiringDocs = employees.flatMap(emp => {
    const docs = [];
    if (emp.civilIdExpiry) docs.push({ emp, type: i18n.language === 'ar' ? 'البطاقة المدنية' : 'Civil ID', expiry: emp.civilIdExpiry, days: calculateDaysRemaining(emp.civilIdExpiry) });
    if (emp.passportExpiry) docs.push({ emp, type: i18n.language === 'ar' ? 'جواز السفر' : 'Passport', expiry: emp.passportExpiry, days: calculateDaysRemaining(emp.passportExpiry) });
    if (emp.iznAmalExpiry) docs.push({ emp, type: i18n.language === 'ar' ? 'إذن العمل' : 'Izn Amal', expiry: emp.iznAmalExpiry, days: calculateDaysRemaining(emp.iznAmalExpiry) });
    return docs;
  }).sort((a, b) => a.days - b.days);

  const totalPages = Math.ceil(expiringDocs.length / itemsPerPage);
  const paginatedData = expiringDocs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-24 text-start">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">{t('governmentFilings')}</h2>
          <p className="text-slate-500 font-medium text-lg mt-1">{t('complianceSub')}</p>
        </div>
      </header>

      <section className="bg-white rounded-[56px] border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-10 border-b border-slate-100 bg-slate-50/30 flex flex-col md:flex-row gap-6 md:items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-2.5 bg-indigo-50 rounded-2xl text-indigo-600 text-lg">💰</div>
            <div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight">{t('wpsEngine')}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{t('bankPortalFormat')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t('selectBank')}:</label>
            <select
              className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/5"
              value={selectedBankFormat}
              onChange={e => setSelectedBankFormat(e.target.value)}
            >
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div className="p-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
          {payrollRuns.filter(r => r.status === 'JV_Generated' || r.status === 'Locked').slice(0, 4).map(run => (
            <div key={run.id} className="group p-8 bg-slate-50 hover:bg-white hover:ring-2 hover:ring-indigo-500/10 rounded-[40px] border border-slate-200 transition-all duration-300">
              <div className="flex justify-between items-start mb-8">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('fiscalPeriod')}</p>
                  <p className="text-2xl font-black text-slate-900">{run.periodKey}</p>
                  <p className="text-[11px] font-bold text-slate-400 mt-1">{run.totalDisbursement.toLocaleString(i18n.language === 'ar' ? 'ar-KW' : 'en-KW', { minimumFractionDigits: 3 })} {t('currency')}</p>
                </div>
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center text-xl">✓</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleExportWPS(run.id)}
                  className="py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all active:scale-[0.98] shadow-xl shadow-slate-900/10"
                >
                  📥 {t('wpsExport')}
                </button>
                <button
                  onClick={() => handleOpenBankLetter(run)}
                  className="py-4 bg-white border border-slate-200 text-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-[0.98] shadow-sm"
                >
                  📄 {t('printBankLetter')}
                </button>
              </div>
            </div>
          ))}
          {payrollRuns.filter(r => r.status === 'JV_Generated' || r.status === 'Locked').length === 0 && (
            <div className="col-span-full py-20 text-center text-slate-300 italic">No JV generated or locked payroll runs found for export.</div>
          )}
        </div>
      </section>

      <section className="bg-white rounded-[56px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-10 border-b border-slate-100 bg-slate-50/30 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3">
              <span className="p-2.5 bg-indigo-50 rounded-2xl text-indigo-600 text-lg">🪪</span>
              {t('docIntegrityRadar')}
            </h3>
          </div>
          <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-5 py-2 rounded-2xl">
            {t('criticalThreshold')}
          </span>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-white text-[11px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                <th className="px-10 py-8">{t('members')}</th>
                <th className="px-10 py-8">{t('documentTh')}</th>
                <th className="px-10 py-8">{t('validUntilTh')}</th>
                <th className="px-10 py-8">{t('registryStatus')}</th>
                <th className="px-10 py-8 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.map((doc, i) => {
                const status = getExpiryStatus(doc.days);
                const empDisplayName = i18n.language === 'ar' ? doc.emp.nameArabic || doc.emp.name : doc.emp.name;
                return (
                  <tr key={`${doc.emp.id}-${doc.type}`} className={`group hover:bg-slate-50/50 transition-colors`}>
                    <td className="px-10 py-8">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center font-black text-sm border border-slate-200 group-hover:scale-110">
                          {doc.emp.name[0]}
                        </div>
                        <div>
                          <p className="text-base font-black text-slate-900 leading-none mb-1.5">{empDisplayName}</p>
                          <p className="text-[10px] font-black uppercase text-slate-400">{doc.emp.nationality}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-10 py-8">
                      <span className="text-[11px] font-black uppercase text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">{doc.type}</span>
                    </td>
                    <td className="px-10 py-8 font-mono text-sm font-black text-slate-600">{doc.expiry}</td>
                    <td className="px-10 py-8">
                      <div className={`inline-flex items-center gap-2 px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${status.color}`}>
                        {status.label}
                      </div>
                    </td>
                    <td className="px-10 py-8 text-right">
                      <button
                        onClick={() => notify("Success", "Automated alert sent to employee device.", "success")}
                        className="px-6 py-2.5 bg-white border border-slate-200 hover:border-indigo-200 hover:text-indigo-600 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95"
                      >
                        {i18n.language === 'ar' ? 'إخطار بالتجديد' : 'Notify'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="p-8 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(expiringDocs.length, currentPage * itemsPerPage)} of {expiringDocs.length} entries
            </div>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-30 active:scale-95 shadow-sm"
              >
                {i18n.language === 'ar' ? 'السابق' : 'Previous'}
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="px-6 py-2.5 rounded-xl border border-slate-200 bg-white text-[10px] font-black text-slate-400 uppercase tracking-widest hover:bg-slate-50 hover:text-slate-900 transition-all disabled:opacity-30 active:scale-95 shadow-sm"
              >
                {i18n.language === 'ar' ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        )}
      </section>

      {letterModalData && (
        <BankLetterModal
          run={letterModalData.run}
          items={letterModalData.items}
          employees={employees}
          bankName={banks.find(b => b.id === selectedBankFormat)?.name || 'Specified Bank'}
          language={i18n.language}
          onClose={() => setLetterModalData(null)}
        />
      )}
    </div>
  );
};

export default ComplianceView;
