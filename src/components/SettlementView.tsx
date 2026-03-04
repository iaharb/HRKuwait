import React, { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee, SettlementResult } from '../types/types';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';
import AISearchBar from './AISearchBar.tsx';

const SettlementView: React.FC = () => {
  const { notify } = useNotifications();
  const { t, i18n } = useTranslation();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [aiFilteredIds, setAiFilteredIds] = useState<string[] | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [reason, setReason] = useState<'Resignation' | 'Termination'>('Resignation');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [unpaidDays, setUnpaidDays] = useState(0);
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAr = i18n.language === 'ar';

  useEffect(() => {
    const fetch = async () => {
      const emps = await dbService.getEmployees();
      setEmployees(emps);
    };
    fetch();

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCalculate = async () => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const res = await dbService.calculateFinalSettlement(selectedId, endDate, reason, unpaidDays);
      setResult(res);
      notify(t('success'), "Audit sequence completed for Art 51/53.", "success");
    } catch (err: any) {
      notify("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!formRef.current) return;
    const formHtml = formRef.current.innerHTML;
    const fullHtml = `
      <!DOCTYPE html>
      <html lang="${i18n.language}" dir="${isAr ? 'rtl' : 'ltr'}">
      <head>
        <meta charset="UTF-8">
        <title>Official Settlement Certificate</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&family=Alexandria:wght@400;700;900&display=swap" rel="stylesheet">
        <style>
          body { font-family: 'Plus Jakarta Sans', sans-serif; background: white; margin: 0; padding: 0; }
          [dir="rtl"] body { font-family: 'Alexandria', sans-serif; }
          @page { size: A4; margin: 0; }
          .printable-document {
            width: 210mm;
            height: 297mm;
            padding: 20mm;
            margin: 0 auto;
            background: white;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            box-sizing: border-box;
          }
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .border-print-solid { border: 1.5pt solid black !important; }
        </style>
      </head>
      <body>
        <div class="printable-document">
          ${formHtml}
        </div>
        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
            }, 500);
          };
        </script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(fullHtml);
      printWindow.document.close();
    } else {
      notify("Popup Blocked", "Please enable popups or press Ctrl+P manually to print the current page.", "error");
      window.print();
    }
  };

  const filteredEmployees = employees.filter(emp => {
    if (aiFilteredIds !== null) {
      return aiFilteredIds.includes(emp.id);
    }
    const name = emp.name.toLowerCase();
    const nameAr = (emp.nameArabic || '').toLowerCase();
    const search = searchTerm.toLowerCase();
    return name.includes(search) || nameAr.includes(search);
  });

  const selectedEmp = employees.find(e => e.id === selectedId);
  const locale = isAr ? 'ar-KW' : 'en-KW';
  const dateFormatter = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20 text-start">
      <div className="flex flex-col lg:flex-row gap-12 items-start">
        {/* SaaS Configuration Panel - HIDDEN IN PRINT */}
        <div className="lg:w-[420px] space-y-8 sticky top-8 no-print">
          <div className="bg-white/80 backdrop-blur-2xl p-10 rounded-[48px] border border-slate-200 shadow-2xl shadow-slate-900/[0.04]">
            <div className="flex items-center gap-5 mb-10">
              <div className="w-14 h-14 bg-indigo-600 text-white rounded-[22px] flex items-center justify-center text-3xl shadow-lg border border-indigo-500">⚖️</div>
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-tight">{t('exitConfig')}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1 opacity-60">Engine v6.2 Premium</p>
              </div>
            </div>

            <div className="space-y-8">
              <div className="space-y-2 relative" ref={dropdownRef}>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ps-1">{t('targetEmployee')}</label>
                <div className="relative">
                  <AISearchBar
                    data={employees}
                    onFilter={(ids) => {
                      setAiFilteredIds(ids)
                      setIsDropdownOpen(true);
                    }}
                    placeholder={t('searchPlaceholder')}
                    contextMessage="KUWAIT HR REPORTING - Employee directory. Return matching IDs."
                    extractInfo={emp => `Name: ${emp.name}, ArabicName: ${emp.nameArabic}, Dept: ${emp.department}`}
                    onFocus={() => setIsDropdownOpen(true)}
                    initialValue={searchTerm}
                    onQueryChange={(q) => {
                      setSearchTerm(q);
                      setIsDropdownOpen(true);
                      if (selectedId && q !== (isAr ? selectedEmp?.nameArabic || selectedEmp?.name : selectedEmp?.name)) {
                        setSelectedId('');
                      }
                    }}
                  />
                </div>

                {/* Search Results Dropdown */}
                {isDropdownOpen && searchTerm && !selectedId && (
                  <div className="absolute z-[100] top-full left-0 right-0 mt-3 bg-white border border-slate-200 rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.1)] overflow-hidden max-h-72 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
                    {filteredEmployees.length > 0 ? (
                      filteredEmployees.map(emp => (
                        <button
                          key={emp.id}
                          onClick={() => {
                            setSelectedId(emp.id);
                            setSearchTerm(isAr ? emp.nameArabic || emp.name : emp.name);
                            setIsDropdownOpen(false);
                          }}
                          className="w-full text-left px-6 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4 group"
                        >
                          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center font-black text-xs text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                            {emp.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800">{isAr ? emp.nameArabic || emp.name : emp.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{emp.department}</p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-6 py-8 text-center text-slate-400 italic text-xs">
                        No matches found in registry.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ps-1">{t('effectiveLastDay')}</label>
                <input
                  type="date"
                  className="w-full px-6 py-4 rounded-[22px] border border-slate-200 bg-white font-black outline-none transition-all text-sm"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ps-1">{t('reasonSeparation')}</label>
                <div className="flex p-1.5 bg-slate-100 rounded-[20px]">
                  <button onClick={() => setReason('Resignation')} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${reason === 'Resignation' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'}`}>{t('resignation')}</button>
                  <button onClick={() => setReason('Termination')} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase transition-all ${reason === 'Termination' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-400'}`}>{t('termination')}</button>
                </div>
              </div>

              <button
                onClick={handleCalculate}
                disabled={!selectedId || loading}
                className="w-full py-5 bg-indigo-600 text-white rounded-[28px] font-black text-[12px] uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(79,70,229,0.3)] active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? '...' : t('executeSettlement')}
              </button>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[40px] text-white border border-white/5 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-125 transition-transform duration-1000">🇰🇼</div>
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Legal Context</p>
            <p className="text-xs text-slate-400 leading-relaxed font-medium">Calculations enforce Kuwait Labor Law No. 6/2010 Article 51 for Indemnity and Article 53 for resignation multipliers.</p>
          </div>
        </div>

        {/* Audit Sheet Area */}
        <div className="flex-1 min-w-0">
          {!result ? (
            <div className="bg-white/40 border-2 border-dashed border-slate-200 rounded-[72px] h-[750px] flex flex-col items-center justify-center text-center p-20 grayscale opacity-40 no-print">
              <div className="w-32 h-32 bg-slate-100 rounded-[48px] flex items-center justify-center text-6xl mb-10 shadow-inner">📜</div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter">{t('statementPreview')}</h3>
              <p className="text-slate-500 mt-4 font-medium text-lg">{i18n.language === 'ar' ? 'اختر موظفاً باستخدام أداة البحث لإنشاء مستند التسوية الرسمي.' : 'Select an employee using the search tool to generate the formal settlement document.'}</p>
            </div>
          ) : (
            <div ref={formRef} className="printable-document bg-white rounded-[56px] border border-slate-200 shadow-2xl p-12 md:p-24 relative overflow-hidden flex flex-col justify-between">

              {/* 1. Header (High Fidelity On-Screen, Minimal in Print) */}
              <div className="border-b-4 border-slate-900 pb-10 mb-12 flex justify-between items-start text-start relative z-10 print:border-black print:pb-6">
                <div>
                  <h1 className="text-5xl font-black text-slate-900 tracking-tighter uppercase mb-1 print:text-3xl print:text-black">{t('settlementCertificate')}</h1>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] print:text-slate-500">{t('officialRecord')}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-6xl mb-2 print:text-4xl">🇰🇼</span>
                  <p className="text-lg font-black text-slate-900 print:text-black">{dateFormatter.format(new Date())}</p>
                  <p className="text-[10px] font-black text-indigo-600 mt-1 uppercase tracking-widest print:text-black">{t('auditIdEos')}{result.totalServiceDays}-{selectedId.slice(0, 5).toUpperCase()}</p>
                </div>
              </div>

              {/* 2. Content Sections (Colorful SaaS look on screen) */}
              <div className="flex-1 space-y-16 print:space-y-10">
                {/* Employee Block */}
                <div className="grid grid-cols-2 gap-12 text-start relative z-10">
                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('identifier')}</p>
                    <p className="text-3xl font-black text-slate-900 print:text-2xl print:text-black">{isAr ? selectedEmp?.nameArabic || selectedEmp?.name : selectedEmp?.name}</p>
                    <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">{selectedEmp?.position} <span className="text-slate-200 mx-2 no-print">•</span> {selectedEmp?.department}</p>
                  </div>
                  <div className="space-y-2 text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('totalTenure')}</p>
                    <p className="text-3xl font-black text-slate-900 print:text-2xl print:text-black">{result.tenureYears}y {result.tenureMonths}m {result.tenureDays}d</p>
                    <div className="inline-block px-4 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest print:border print:border-black print:text-black print:bg-white">
                      {t('basisStr')} {t(reason.toLowerCase())}
                    </div>
                  </div>
                </div>

                {/* Table (SaaS Styling On Screen, Table in Print) */}
                <div className="bg-slate-50 rounded-[40px] p-10 border border-slate-200 relative z-10 print:border-print-solid print:p-0 print:rounded-none">
                  <div className="flex items-center justify-between mb-8 print:hidden">
                    <h4 className="text-xs font-black uppercase tracking-[0.3em] text-indigo-600">{t('registryCalculationLedger')}</h4>
                    <span className="text-[9px] font-black text-slate-400 uppercase">{t('kuwaitLawAudit')}</span>
                  </div>
                  <div className="hidden print:block bg-slate-100 p-3 border-b-2 border-black">
                    <p className="text-xs font-black uppercase tracking-widest">{t('auditCalculationSummary')}</p>
                  </div>
                  <table className="w-full text-left text-sm border-collapse">
                    <tbody className="divide-y divide-slate-200 print:divide-black">
                      <tr>
                        <td className="py-5 font-bold text-slate-600 uppercase text-[10px] print:p-3">{t('remunerationExt')}</td>
                        <td className="py-5 text-right font-black text-slate-900 print:p-3 print:text-black">{result.remuneration.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                      <tr>
                        <td className="py-5 font-bold text-slate-600 uppercase text-[10px] print:p-3">{t('dailyWageDivisor')}</td>
                        <td className="py-5 text-right font-black text-slate-900 print:p-3 print:text-black">{result.dailyRate.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                      <tr>
                        <td className="py-5 font-bold text-slate-600 uppercase text-[10px] print:p-3">{t('accruedEndOfService')}</td>
                        <td className="py-5 text-right font-black text-slate-900 print:p-3 print:text-black">{result.breakdown.baseIndemnity.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                      <tr>
                        <td className="py-5 font-bold text-indigo-600 uppercase text-[10px] print:p-3 print:text-black">{t('resignationMultiplierApplied')}</td>
                        <td className="py-5 text-right font-black text-indigo-600 print:p-3 print:text-black">{(result.breakdown.multiplierApplied * 100).toFixed(1)} %</td>
                      </tr>
                      <tr className="bg-indigo-600/5 print:bg-white print:border-t-2 print:border-black">
                        <td className="p-6 font-black uppercase text-xs print:p-3">{t('netIndemnityDisbursement')}</td>
                        <td className="p-6 text-right font-black text-2xl text-indigo-700 print:p-3 print:text-black">{result.indemnityAmount.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Leave Encasement */}
                <div className="bg-white border-2 border-indigo-600/20 p-8 rounded-[32px] flex justify-between items-center text-start relative z-10 print:border-print-solid print:rounded-none">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-900">{t('unusedLeaveEncasement')}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{t('basedOnBillableDays1')}{result.breakdown.leaveDaysEncashed}{t('basedOnBillableDays2')}</p>
                  </div>
                  <p className="text-2xl font-black text-slate-900">{result.leavePayout.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</p>
                </div>

                {/* Final Net Block - SaaS Dark Style On-Screen */}
                <div className="bg-slate-900 p-12 text-white rounded-[48px] flex justify-between items-center relative z-10 shadow-2xl shadow-indigo-500/10 print:bg-white print:text-black print:border-print-solid print:p-8 print:rounded-none">
                  <div className="text-start space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.4em] text-indigo-400 print:text-black">{t('finalNetPayableDisbursement')}</p>
                    <h2 className="text-7xl font-black tracking-tighter print:text-5xl print:text-black">
                      {result.totalSettlement.toLocaleString(locale, { minimumFractionDigits: 3 })}
                      <span className="text-2xl ms-4 opacity-50 print:opacity-100 print:text-2xl">{t('currency')}</span>
                    </h2>
                  </div>
                  <div className="no-print">
                    <button onClick={handlePrint} className="px-10 py-6 bg-white text-slate-900 rounded-[24px] font-black text-xs uppercase tracking-widest hover:bg-indigo-50 active:scale-95 transition-all shadow-2xl">{t('printOfficialStatement')}</button>
                  </div>
                </div>
              </div>

              {/* 3. Signature Block (Positioned at bottom for print) */}
              <div className="grid grid-cols-2 gap-32 pt-24 relative z-10 print:pt-16 print:gap-16">
                <div className="text-start space-y-16 print:space-y-12">
                  <div className="border-b-2 border-slate-900 w-full print:border-black"></div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-900">{t('employeeAcknowledgment')}</p>
                    <p className="text-[10px] text-slate-400 mt-2 uppercase font-bold">{t('signatureNationalId')}</p>
                  </div>
                </div>
                <div className="text-end space-y-16 print:space-y-12">
                  <div className="border-b-2 border-slate-900 w-full print:border-black"></div>
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-900">{t('authorizedRegistryDirector')}</p>
                    <p className="text-[10px] text-slate-400 mt-2 uppercase font-bold">{t('officialSealRequired')}</p>
                  </div>
                </div>
              </div>

              <div className="mt-20 pt-8 border-t border-slate-100 text-center opacity-30 text-[10px] font-black uppercase tracking-[0.5em] relative z-10 print:opacity-100 print:mt-12 print:border-black">
                {t('endOfRegistryRecord')}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettlementView;
