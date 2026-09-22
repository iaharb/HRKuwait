
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { Employee, PublicHoliday, PayrollRun, PayrollItem } from '../types/types';
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
  const itemsPerPage = 7;

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
    if (days < 0) return { label: t('expired'), color: 'cds--tag--red', icon: '🚨' };
    if (days <= 30) return { label: `${days}d`, color: 'cds--tag--orange', icon: '⚠️' };
    if (days <= 90) return { label: t('warning'), color: 'cds--tag--warm-gray', icon: '⏳' };
    return { label: t('secure'), color: 'cds--tag--green', icon: '✅' };
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

  if (loading) return <div style={{ padding: 'var(--cds-spacing-07)', textAlign: 'center' }}>Loading compliance datasets...</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
      <header>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{t('governmentFilings')}</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{t('complianceSub')}</p>
      </header>

      <section className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', borderRadius: 0 }}>
        <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
             <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{t('wpsEngine')}</h3>
             <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('bankPortalFormat')}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{t('selectBank')}:</label>
            <select
              className="cds--select-input"
              style={{ height: '32px', fontSize: '0.75rem', background: 'var(--cds-field-01)' }}
              value={selectedBankFormat}
              onChange={e => setSelectedBankFormat(e.target.value)}
            >
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ padding: 'var(--cds-spacing-05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
          {payrollRuns.filter(r => r.status === 'JV_Generated' || r.status === 'Locked').slice(0, 6).map(run => (
            <div key={run.id} style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-01)' }}>{t('fiscalPeriod')}</p>
                  <p style={{ fontSize: '1.25rem', fontWeight: 600 }}>{run.periodKey}</p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{run.totalDisbursement.toLocaleString(i18n.language === 'ar' ? 'ar-KW' : 'en-KW', { minimumFractionDigits: 3 })} {t('currency')}</p>
                </div>
                <div style={{ width: '24px', height: '24px', background: 'var(--cds-support-success)', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem' }}>✓</div>
              </div>

              <div style={{ display: 'flex', gap: 'var(--cds-spacing-03)', marginTop: 'auto' }}>
                <button
                  onClick={() => handleExportWPS(run.id)}
                  className="cds--btn cds--btn--primary"
                  style={{ flex: 1, padding: 0, justifyContent: 'center', fontSize: '0.75rem', height: '32px' }}
                >
                   {t('wpsExport')}
                </button>
                <button
                  onClick={() => handleOpenBankLetter(run)}
                  className="cds--btn cds--btn--secondary"
                  style={{ flex: 1, padding: 0, justifyContent: 'center', fontSize: '0.75rem', height: '32px' }}
                >
                   {t('printBankLetter')}
                </button>
              </div>
            </div>
          ))}
          {payrollRuns.filter(r => r.status === 'JV_Generated' || r.status === 'Locked').length === 0 && (
            <div style={{ gridColumn: '1 / -1', padding: 'var(--cds-spacing-07)', textAlign: 'center', color: 'var(--cds-text-secondary)', fontStyle: 'italic', fontSize: '0.875rem' }}>No datasets available for export.</div>
          )}
        </div>
      </section>

      <section className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', borderRadius: 0 }}>
        <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{t('docIntegrityRadar')}</h3>
          <span className="cds--tag cds--tag--blue" style={{ fontSize: '0.625rem' }}>{t('criticalThreshold')}</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="cds--data-table cds--data-table--compact">
            <thead>
              <tr>
                <th>{t('members')}</th>
                <th>{t('documentTh')}</th>
                <th>{t('validUntilTh')}</th>
                <th>{t('registryStatus')}</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedData.map((doc, i) => {
                const status = getExpiryStatus(doc.days);
                const empDisplayName = i18n.language === 'ar' ? doc.emp.nameArabic || doc.emp.name : doc.emp.name;
                return (
                  <tr key={`${doc.emp.id}-${doc.type}`}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                        <div style={{ width: '24px', height: '24px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 600 }}>
                          {doc.emp.name[0]}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontWeight: 600 }}>{empDisplayName}</span>
                          <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{doc.emp.nationality}</span>
                        </div>
                      </div>
                    </td>
                    <td><span className="cds--tag cds--tag--warm-gray" style={{ fontSize: '0.625rem' }}>{doc.type}</span></td>
                    <td style={{ fontSize: '0.75rem', fontWeight: 600 }}>{doc.expiry}</td>
                    <td>
                      <span className={`cds--tag ${status.color}`} style={{ fontSize: '0.625rem' }}>
                        {status.label}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => notify("Success", "Automated alert sent.", "success")}
                        className="cds--btn cds--btn--ghost cds--btn--sm"
                        style={{ padding: 0, justifyContent: 'center', width: '32px' }}
                        title={t('notify')}
                      >
                        🔔
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              Showing {(currentPage - 1) * itemsPerPage + 1}-{Math.min(expiringDocs.length, currentPage * itemsPerPage)} of {expiringDocs.length}
            </span>
            <div style={{ display: 'flex', gap: 'var(--cds-spacing-02)' }}>
              <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} className="cds--btn cds--btn--ghost cds--btn--sm">Previous</button>
              <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} className="cds--btn cds--btn--ghost cds--btn--sm">Next</button>
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
