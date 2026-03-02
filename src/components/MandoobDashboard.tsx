
import React, { useState, useEffect } from 'react';
import { dbService } from '../services/dbService.ts';
import { Employee, User } from '../types/types';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

const MandoobDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { notify } = useNotifications();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const isAr = i18n.language === 'ar';

  // Focused Visa Workflow Statuses
  const [visaWorkflow, setVisaWorkflow] = useState([
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

  return (
    <div className="space-y-10 animate-in fade-in duration-700 pb-20 text-start">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            {t('mandoobOpsCenter')}
          </h2>
          <p className="text-slate-500 font-medium text-lg mt-1">
            {t('trackingDocsSub')}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_#6366f1]"></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{isAr ? 'سجل المعاملات' : 'Registry Status'}</p>
              <p className="text-xs font-black text-slate-900 uppercase">INTERNAL SYNC ACTIVE</p>
            </div>
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {/* Visa Status Workflow - FULL WIDTH */}
        <div className="w-full bg-white rounded-[48px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-8 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-800 tracking-tight">{t('residencyWorkflow')}</h3>
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
              {t('activeFiles')}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                  <th className="px-10 py-6">{t('employee')}</th>
                  <th className="px-10 py-6">{t('application')}</th>
                  <th className="px-10 py-6">{t('currentStep')}</th>
                  <th className="px-10 py-6">{t('targetDate')}</th>
                  <th className="px-10 py-6"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visaWorkflow.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-10 py-6">
                      <p className="font-bold text-slate-900">{item.name}</p>
                    </td>
                    <td className="px-10 py-6">
                      <span className="text-[10px] font-black text-indigo-600 uppercase bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                        {isAr ?
                          (item.type === 'Article 18 Transfer' ? 'نقل مادة ١٨' :
                            item.type === 'Izn Amal Renewal' ? 'تجديد إذن العمل' :
                              item.type === 'Dependant Visa (Art 22)' ? 'سمة التحاق بعائل (مادة ٢٢)' :
                                item.type === 'Residency Cancellation' ? 'إلغاء إقامة' : item.type)
                          : item.type}
                      </span>
                    </td>
                    <td className="px-10 py-6">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-700">
                          {isAr ?
                            (item.step === 'Medical Report' ? 'الفحص الطبي' :
                              item.step === 'Signature Auth' ? 'اعتماد توقيع' :
                                item.step === 'Fingerprinting' ? 'البصمات' :
                                  item.step === 'Clearance Form' ? 'نموذج مخالصة' : item.step)
                            : item.step}
                        </span>
                        <span className="text-[9px] text-slate-400 font-bold uppercase">
                          {isAr ?
                            (item.status === 'Pending Clinic' ? 'قيد انتظار العيادة' :
                              item.status === 'Awaiting Auth' ? 'بانتظار الاعتماد' :
                                item.status === 'Scheduled' ? 'مجدول' :
                                  item.status === 'Internal Review' ? 'مراجعة داخلية' : item.status)
                            : item.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-10 py-6">
                      <p className={`text-xs font-black font-mono ${item.priority === 'Urgent' ? 'text-rose-600' : 'text-slate-500'}`}>{item.deadline}</p>
                    </td>
                    <td className="px-10 py-6 text-right">
                      <button
                        onClick={() => handleUpdateStatus(item.id)}
                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-black transition-all active:scale-95 shadow-lg shadow-slate-900/10"
                      >
                        {t('update')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Priority Watchlist & Tasks - FULL WIDTH UNDERNEATH */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-slate-900 p-10 rounded-[48px] text-white shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-700">
              <span className="text-6xl">🗃️</span>
            </div>
            <h4 className="text-[11px] font-black text-indigo-400 uppercase tracking-widest mb-10">{t('docExpiryWatchlist')}</h4>
            <div className="space-y-6">
              {getExpiringDocs().slice(0, 5).map((doc, i) => (
                <div key={i} className="bg-white/5 border border-white/10 p-5 rounded-[32px] backdrop-blur-md hover:bg-white/10 transition-all border-s-4 border-s-indigo-500">
                  <div className="flex justify-between items-start mb-3">
                    <div className="text-start">
                      <p className="text-sm font-black text-white">{isAr && doc.emp.nameArabic ? doc.emp.nameArabic : doc.emp.name}</p>
                      <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest mt-0.5">
                        {isAr ?
                          (doc.type === 'Civil ID' ? 'البطاقة المدنية' :
                            doc.type === 'Izn Amal' ? 'إذن العمل' :
                              doc.type === 'Passport' ? 'جواز السفر' : doc.type)
                          : doc.type}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[11px] font-black uppercase tracking-widest ${doc.days < 30 ? 'text-rose-400 animate-pulse' : 'text-amber-400'}`}>
                        {doc.days} {isAr ? 'يوم' : 'Days'}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-1000 ${doc.days < 30 ? 'bg-rose-500' : 'bg-indigo-500'}`}
                      style={{ width: `${Math.max(10, 100 - (doc.days / 1.2))}%` }}
                    ></div>
                  </div>
                </div>
              ))}
              {getExpiringDocs().length === 0 && (
                <div className="py-12 text-center">
                  <p className="text-xs text-slate-400 italic">{t('allRecordsSecure')}</p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-10 rounded-[48px] border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="text-start">
              <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-6">{t('proFieldTasks')}</h4>
              <div className="space-y-4">
                <button className="w-full py-5 bg-slate-50 border border-slate-100 text-slate-700 rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-100 transition-all flex items-center gap-4 px-6 group">
                  <span className="text-lg group-hover:scale-110 transition-transform">📂</span>
                  {t('prepareDossiers')}
                </button>
                <button className="w-full py-5 bg-slate-50 border border-slate-100 text-slate-700 rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-100 transition-all flex items-center gap-4 px-6 group">
                  <span className="text-lg group-hover:scale-110 transition-transform">🚚</span>
                  {t('courierDispatch')}
                </button>
                <button className="w-full py-5 bg-slate-50 border border-slate-100 text-slate-700 rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-100 transition-all flex items-center gap-4 px-6 group">
                  <span className="text-lg group-hover:scale-110 transition-transform">📑</span>
                  {t('auditOnboardingDocs')}
                </button>
              </div>
            </div>

            <div className="mt-10 p-6 bg-indigo-600 rounded-[32px] text-white text-start">
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">{t('legalCompliance')}</p>
              <p className="text-xs font-bold leading-relaxed">
                {t('originalCertNote')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MandoobDashboard;
