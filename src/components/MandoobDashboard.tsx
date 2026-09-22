
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee } from '../types/types';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

const MandoobDashboard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { notify } = useNotifications();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const isAr = i18n.language === 'ar';

    // Focused Visa Workflow Statuses
    const [visaWorkflow] = useState([
        { id: 'vw1', name: 'John Doe', type: 'Article 18 Transfer', step: 'Medical Report', status: 'Pending Clinic', priority: 'High', deadline: '2025-05-15' },
        { id: 'vw2', name: 'Bader Al-Mutairi', type: 'Izn Amal Renewal', step: 'Signature Auth', status: 'Awaiting Auth', priority: 'Urgent', deadline: '2025-04-10' },
        { id: 'vw3', name: 'Maria Garcia', type: 'Dependant Visa (Art 22)', step: 'Fingerprinting', status: 'Scheduled', priority: 'Normal', deadline: '2025-06-01' },
        { id: 'vw4', name: 'Chen Wei', type: 'Residency Cancellation', step: 'Clearance Form', status: 'Internal Review', priority: 'High', deadline: '2025-04-20' }
    ]);

    useEffect(() => {
        const fetch = async () => {
            const data = await dbService.getEmployees();
            setEmployees(data);
            setLoading(false);
        };
        fetch();
    }, []);

    const handleUpdateStatus = (id: string) => {
        notify(t('success'), isAr ? 'تم تحديث حالة المعاملة بنجاح' : 'Visa workflow status updated locally.', 'success');
    };

    const getExpiringDocs = () => {
        return employees.flatMap(emp => {
            const docs = [];
            const today = new Date();
            if (emp.civilIdExpiry) {
                const diff = (new Date(emp.civilIdExpiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                if (diff < 90) docs.push({ emp, type: 'Civil ID', expiry: emp.civilIdExpiry, days: Math.ceil(diff) });
            }
            if (emp.iznAmalExpiry) {
                const diff = (new Date(emp.iznAmalExpiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                if (diff < 120) docs.push({ emp, type: 'Izn Amal', expiry: emp.iznAmalExpiry, days: Math.ceil(diff) });
            }
            if (emp.passportExpiry) {
                const diff = (new Date(emp.passportExpiry).getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
                if (diff < 180) docs.push({ emp, type: 'Passport', expiry: emp.passportExpiry, days: Math.ceil(diff) });
            }
            return docs;
        }).sort((a, b) => a.days - b.days);
    };

    if (loading) return <div className="cds--loading-overlay"><div className="cds--loading"></div></div>;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{t('mandoobOpsCenter')}</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{t('trackingDocsSub')}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)', padding: 'var(--cds-spacing-03) var(--cds-spacing-05)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                     <div className="hub--status-glow" style={{ background: 'var(--cds-interactive-01)' }}></div>
                     <span style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>INTERNAL SYNC ACTIVE</span>
                </div>
            </header>

            <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t('residencyWorkflow')}</h3>
                    <span className="cds--tag cds--tag--blue">{t('activeFiles')}</span>
                </div>
                <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                    <thead>
                        <tr>
                            <th>{t('employee')}</th>
                            <th>{t('application')}</th>
                            <th>{t('currentStep')}</th>
                            <th>{t('targetDate')}</th>
                            <th style={{ textAlign: 'right' }}>{t('action')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visaWorkflow.map(item => (
                            <tr key={item.id}>
                                <td style={{ fontWeight: 600 }}>{item.name}</td>
                                <td>
                                    <span className="cds--tag cds--tag--cool-gray" style={{ margin: 0 }}>
                                        {isAr ?
                                            (item.type === 'Article 18 Transfer' ? 'نقل مادة ١٨' :
                                                item.type === 'Izn Amal Renewal' ? 'تجديد إذن العمل' :
                                                    item.type === 'Dependant Visa (Art 22)' ? 'سمة التحاق بعائل (مادة ٢٢)' :
                                                        item.type === 'Residency Cancellation' ? 'إلغاء إقامة' : item.type)
                                            : item.type}
                                    </span>
                                </td>
                                <td>
                                    <div>
                                        <p style={{ fontSize: '0.875rem' }}>
                                            {isAr ?
                                                (item.step === 'Medical Report' ? 'الفحص الطبي' :
                                                    item.step === 'Signature Auth' ? 'اعتماد توقيع' :
                                                        item.step === 'Fingerprinting' ? 'البصمات' :
                                                            item.step === 'Clearance Form' ? 'نموذج مخالصة' : item.step)
                                                : item.step}
                                        </p>
                                        <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>
                                            {isAr ?
                                                (item.status === 'Pending Clinic' ? 'قيد انتظار العيادة' :
                                                    item.status === 'Awaiting Auth' ? 'بانتظار الاعتماد' :
                                                        item.status === 'Scheduled' ? 'مجدول' :
                                                            item.status === 'Internal Review' ? 'مراجعة داخلية' : item.status)
                                                : item.status}
                                        </p>
                                    </div>
                                </td>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600, color: item.priority === 'Urgent' ? 'var(--cds-support-error)' : 'inherit' }}>
                                    {item.deadline}
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                    <button onClick={() => handleUpdateStatus(item.id)} className="cds--btn cds--btn--primary cds--btn--sm">
                                        {t('update')}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-07)' }}>
                {/* Watchlist - Biometric Style */}
                <div className="hub--node" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)' }}>
                    <h4 style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--cds-interactive-01)', marginBottom: 'var(--cds-spacing-06)' }}>{t('docExpiryWatchlist')}</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                        {getExpiringDocs().slice(0, 5).map((doc, i) => (
                            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)', borderInlineStart: '4px solid var(--cds-interactive-01)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--cds-spacing-03)' }}>
                                    <div>
                                        <p style={{ fontSize: '0.875rem', fontWeight: 600 }}>{isAr && doc.emp.nameArabic ? doc.emp.nameArabic : doc.emp.name}</p>
                                        <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>
                                            {isAr ?
                                                (doc.type === 'Civil ID' ? 'البطاقة المدنية' :
                                                    doc.type === 'Izn Amal' ? 'إذن العمل' :
                                                        doc.type === 'Passport' ? 'جواز السفر' : doc.type)
                                                : doc.type}
                                        </p>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: doc.days < 30 ? 'var(--cds-support-error)' : 'var(--cds-support-warning)' }}>
                                        {doc.days} {isAr ? 'يوم' : 'Days'}
                                    </span>
                                </div>
                                <div style={{ height: '2px', background: 'var(--cds-border-subtle)' }}>
                                    <div style={{ 
                                        height: '100%', 
                                        width: `${Math.max(10, 100 - (doc.days / 1.2))}%`, 
                                        background: doc.days < 30 ? 'var(--cds-support-error)' : 'var(--cds-interactive-01)',
                                        transition: 'width 1s ease'
                                    }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Operations */}
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                        <h4 style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-06)' }}>{t('proFieldTasks')}</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
                            <button className="cds--btn cds--btn--ghost" style={{ justifyContent: 'flex-start', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-05)' }}>
                                <span style={{ marginRight: 'var(--cds-spacing-04)' }}>📂</span> {t('prepareDossiers')}
                            </button>
                            <button className="cds--btn cds--btn--ghost" style={{ justifyContent: 'flex-start', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-05)' }}>
                                <span style={{ marginRight: 'var(--cds-spacing-04)' }}>🚚</span> {t('courierDispatch')}
                            </button>
                            <button className="cds--btn cds--btn--ghost" style={{ justifyContent: 'flex-start', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-05)' }}>
                                <span style={{ marginRight: 'var(--cds-spacing-04)' }}>📑</span> {t('auditOnboardingDocs')}
                            </button>
                        </div>
                    </div>

                    <div style={{ marginTop: 'var(--cds-spacing-08)', padding: 'var(--cds-spacing-06)', background: 'var(--cds-layer-01)', borderInlineStart: '4px solid var(--cds-interactive-01)' }}>
                        <p style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-02)' }}>{t('legalCompliance')}</p>
                        <p style={{ fontSize: '0.75rem', lineHeight: '1.4' }}>{t('originalCertNote')}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MandoobDashboard;
