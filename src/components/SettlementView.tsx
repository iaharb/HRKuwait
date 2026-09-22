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
    <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 'var(--cds-spacing-07)', alignItems: 'flex-start' }}>
        {/* SaaS Configuration Panel - HIDDEN IN PRINT */}
        <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', position: 'sticky', top: 'var(--cds-spacing-05)' }}>
          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)', marginBottom: 'var(--cds-spacing-06)', paddingBottom: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
              <div style={{ width: '40px', height: '40px', background: 'var(--cds-interactive-01)', color: '#fff', border: '1px solid var(--cds-interactive-01)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem' }}>⚖️</div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{t('exitConfig')}</h3>
                <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-interactive-01)', marginTop: '4px', textTransform: 'uppercase' }}>Engine v6.2 Premium</p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)', position: 'relative' }} ref={dropdownRef}>
                <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('targetEmployee')}</label>
                <div style={{ position: 'relative' }}>
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
                  <div style={{ position: 'absolute', zIndex: 100, top: '100%', left: 0, right: 0, marginTop: '8px', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', maxHeight: '18rem', overflowY: 'auto' }}>
                    {filteredEmployees.length > 0 ? (
                      filteredEmployees.map(emp => (
                        <button
                          key={emp.id}
                          onClick={() => {
                            setSelectedId(emp.id);
                            setSearchTerm(isAr ? emp.nameArabic || emp.name : emp.name);
                            setIsDropdownOpen(false);
                          }}
                          style={{ width: '100%', textAlign: 'left', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)', cursor: 'pointer' }}
                        >
                          <div style={{ width: '32px', height: '32px', background: 'var(--cds-interactive-01)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
                            {emp.name[0]}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{isAr ? emp.nameArabic || emp.name : emp.name}</p>
                            <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{emp.department}</p>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div style={{ padding: 'var(--cds-spacing-05)', textAlign: 'center', color: 'var(--cds-text-disabled)', fontSize: '0.75rem', fontStyle: 'italic' }}>
                        No matches found in registry.
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('effectiveLastDay')}</label>
                <input
                  type="date"
                  style={{ width: '100%', padding: 'var(--cds-spacing-04)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', color: 'var(--cds-text-primary)', outline: 'none', fontSize: '0.875rem', fontFamily: 'monospace' }}
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('reasonSeparation')}</label>
                <div style={{ display: 'flex', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                  <button onClick={() => setReason('Resignation')} style={{ flex: 1, padding: 'var(--cds-spacing-04)', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', background: reason === 'Resignation' ? 'var(--cds-interactive-01)' : 'transparent', color: reason === 'Resignation' ? '#fff' : 'var(--cds-text-secondary)', cursor: 'pointer', border: 'none' }}>{t('resignation')}</button>
                  <button onClick={() => setReason('Termination')} style={{ flex: 1, padding: 'var(--cds-spacing-04)', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', background: reason === 'Termination' ? 'var(--cds-interactive-01)' : 'transparent', color: reason === 'Termination' ? '#fff' : 'var(--cds-text-secondary)', cursor: 'pointer', border: 'none' }}>{t('termination')}</button>
                </div>
              </div>

              <button
                onClick={handleCalculate}
                disabled={!selectedId || loading}
                className="cds--btn cds--btn--primary"
                style={{ width: '100%', marginTop: 'var(--cds-spacing-04)', fontSize: '0.75rem', fontFamily: 'monospace' }}
              >
                {loading ? '...' : t('executeSettlement')}
              </button>
            </div>
          </div>

          <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
            <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>Legal Context</p>
            <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', lineHeight: 1.6 }}>Calculations enforce Kuwait Labor Law No. 6/2010 Article 51 for Indemnity and Article 53 for resignation multipliers.</p>
          </div>
        </div>

        {/* Audit Sheet Area */}
        <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
          {!result ? (
            <div className="cds--tile no-print" style={{ padding: 'var(--cds-spacing-08)', border: '1px dashed var(--cds-border-subtle)', background: 'var(--cds-background)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '600px', opacity: 0.6 }}>
              <div style={{ fontSize: '3rem', marginBottom: 'var(--cds-spacing-06)', filter: 'grayscale(100%)' }}>📜</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-04)' }}>{t('statementPreview')}</h3>
              <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', maxWidth: '400px' }}>{i18n.language === 'ar' ? 'اختر موظفاً باستخدام أداة البحث لإنشاء مستند التسوية الرسمي.' : 'Select an employee using the search tool to generate the formal settlement document.'}</p>
            </div>
          ) : (
            <div ref={formRef} className="printable-document cds--tile" style={{ padding: 'var(--cds-spacing-08)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-09)' }}>

              {/* 1. Header (High Fidelity On-Screen, Minimal in Print) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid var(--cds-border-strong)', paddingBottom: 'var(--cds-spacing-07)' }}>
                <div>
                  <h1 style={{ fontSize: '2rem', fontWeight: 600, color: 'var(--cds-text-primary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>{t('settlementCertificate')}</h1>
                  <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('officialRecord')}</p>
                </div>
                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--cds-spacing-03)' }}>
                  <span style={{ fontSize: '2.5rem' }}>🇰🇼</span>
                  <p style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{dateFormatter.format(new Date())}</p>
                  <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase' }}>{t('auditIdEos')}{result.totalServiceDays}-{selectedId.slice(0, 5).toUpperCase()}</p>
                </div>
              </div>

              {/* 2. Content Sections (Colorful SaaS look on screen) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-08)' }}>
                {/* Employee Block */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-07)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('identifier')}</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{isAr ? selectedEmp?.nameArabic || selectedEmp?.name : selectedEmp?.name}</p>
                    <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{selectedEmp?.position} <span style={{ margin: '0 8px' }}>•</span> {selectedEmp?.department}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)', textAlign: 'right', alignItems: 'flex-end' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('totalTenure')}</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{result.tenureYears}y {result.tenureMonths}m {result.tenureDays}d</p>
                    <div style={{ padding: '4px 12px', background: 'var(--cds-interactive-01)', color: '#fff', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase' }}>
                      {t('basisStr')} {t(reason.toLowerCase())}
                    </div>
                  </div>
                </div>

                {/* Table (SaaS Styling On Screen, Table in Print) */}
                <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-06)', width: '100%' }}>
                  <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--cds-spacing-06)' }}>
                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', textTransform: 'uppercase' }}>{t('registryCalculationLedger')}</h4>
                    <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('kuwaitLawAudit')}</span>
                  </div>
                  <div className="hidden print:block" style={{ background: '#f4f4f4', padding: '12px', borderBottom: '2px solid #000' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase' }}>{t('auditCalculationSummary')}</p>
                  </div>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <tbody style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
                      <tr style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', color: 'var(--cds-text-secondary)', fontSize: '0.625rem', fontFamily: 'monospace', textTransform: 'uppercase' }}>{t('remunerationExt')}</td>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', textAlign: 'right', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{result.remuneration.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', color: 'var(--cds-text-secondary)', fontSize: '0.625rem', fontFamily: 'monospace', textTransform: 'uppercase' }}>{t('dailyWageDivisor')}</td>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', textAlign: 'right', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{result.dailyRate.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', color: 'var(--cds-text-secondary)', fontSize: '0.625rem', fontFamily: 'monospace', textTransform: 'uppercase' }}>{t('accruedEndOfService')}</td>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', textAlign: 'right', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{result.breakdown.baseIndemnity.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid var(--cds-border-subtle)' }}>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', color: 'var(--cds-interactive-01)', fontSize: '0.625rem', fontFamily: 'monospace', textTransform: 'uppercase', fontWeight: 700 }}>{t('resignationMultiplierApplied')}</td>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', textAlign: 'right', fontWeight: 700, color: 'var(--cds-interactive-01)' }}>{(result.breakdown.multiplierApplied * 100).toFixed(1)} %</td>
                      </tr>
                      <tr style={{ background: 'var(--cds-layer-02)' }}>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', fontWeight: 700, fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase', color: 'var(--cds-text-primary)' }}>{t('netIndemnityDisbursement')}</td>
                        <td style={{ padding: 'var(--cds-spacing-05) var(--cds-spacing-04)', textAlign: 'right', fontWeight: 700, fontSize: '1.25rem', color: 'var(--cds-text-primary)' }}>{result.indemnityAmount.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Leave Encasement */}
                <div style={{ background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', borderLeft: '4px solid var(--cds-interactive-01)', padding: 'var(--cds-spacing-06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                    <h4 style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', textTransform: 'uppercase' }}>{t('unusedLeaveEncasement')}</h4>
                    <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('basedOnBillableDays1')}{result.breakdown.leaveDaysEncashed}{t('basedOnBillableDays2')}</p>
                  </div>
                  <p style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{result.leavePayout.toLocaleString(locale, { minimumFractionDigits: 3 })} {t('currency')}</p>
                </div>

                {/* Final Net Block - SaaS Dark Style On-Screen */}
                <div style={{ background: 'var(--cds-layer-02)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-07)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('finalNetPayableDisbursement')}</p>
                    <h2 style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--cds-text-primary)', lineHeight: 1 }}>
                      {result.totalSettlement.toLocaleString(locale, { minimumFractionDigits: 3 })}
                      <span style={{ fontSize: '1rem', marginLeft: '12px', opacity: 0.5 }}>{t('currency')}</span>
                    </h2>
                  </div>
                  <div className="no-print">
                    <button onClick={handlePrint} className="cds--btn cds--btn--secondary" style={{ fontSize: '0.75rem', fontFamily: 'monospace' }}>{t('printOfficialStatement')}</button>
                  </div>
                </div>
              </div>

              {/* 3. Signature Block (Positioned at bottom for print) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-10)', paddingTop: 'var(--cds-spacing-09)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-08)', textAlign: 'left' }}>
                  <div style={{ borderBottom: '1px solid var(--cds-border-strong)', width: '100%' }}></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', textTransform: 'uppercase' }}>{t('employeeAcknowledgment')}</p>
                    <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('signatureNationalId')}</p>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-08)', textAlign: 'right' }}>
                  <div style={{ borderBottom: '1px solid var(--cds-border-strong)', width: '100%' }}></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', textTransform: 'uppercase' }}>{t('authorizedRegistryDirector')}</p>
                    <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('officialSealRequired')}</p>
                  </div>
                </div>
              </div>

              <div className="no-print" style={{ marginTop: 'var(--cds-spacing-09)', paddingTop: 'var(--cds-spacing-06)', borderTop: '1px solid var(--cds-border-subtle)', textAlign: 'center', fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.2em' }}>
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
