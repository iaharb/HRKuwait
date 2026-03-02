
import React, { useState, useEffect } from 'react';
import { User } from '../types/types';
import { dbService } from '../services/dbService.ts';
import { useTranslation } from 'react-i18next';

const MobilePayroll: React.FC<{ user: User, language: 'en' | 'ar' }> = ({ user, language }) => {
    const { t } = useTranslation();
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);

    const fetchPayroll = async () => {
        try {
            const data = await dbService.getPayrollItemsByEmployee(user.id);
            setItems(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPayroll(); }, [user]);

    const formatVal = (val: any) => (Number(val) || 0).toLocaleString();

    if (loading) return <div className="p-10 text-center text-slate-400 font-bold">LOADING_PAYSLIPS...</div>;

    return (
        <div className="p-4 space-y-6 pb-24 text-start">
            <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 text-white relative overflow-hidden shadow-2xl">
                <div className="absolute top-0 right-0 p-8 opacity-10 text-6xl">💰</div>
                <div>
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Financial Intelligence</p>
                    <h2 className="text-2xl font-black tracking-tight">{language === 'ar' ? 'الرواتب والمستحقات' : 'Payroll & Earnings'}</h2>
                    <p className="text-xs text-slate-400 font-medium mt-3 leading-relaxed opacity-80">
                        {language === 'ar' ? 'عرض سجل قسائم الراتب ودورة الصرف الحالية.' : 'View historical payslips and current disbursement cycles.'}
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">{language === 'ar' ? 'السجل التاريخي' : 'Historical Archive'}</h3>
                {items.length === 0 ? (
                    <div className="py-20 text-center bg-slate-50 rounded-[40px] border-2 border-dashed border-slate-200 grayscale opacity-40">
                        <span className="text-6xl mb-4">📂</span>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Registry Clear: No Slips Found</p>
                    </div>
                ) : (
                    items.map((item) => (
                        <button
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className="w-full bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between group active:scale-[0.98] transition-all"
                        >
                            <div className="flex items-center gap-5">
                                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-xl group-hover:bg-indigo-50 transition-colors">📄</div>
                                <div>
                                    <p className="text-sm font-black text-slate-800 tracking-tight">{item.payrollRun?.period_key || 'Month-End Slip'}</p>
                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-1.5 tracking-widest">{item.payrollRun?.cycle_type || 'Monthly Cycle'}</p>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-black text-indigo-600 tracking-tighter">{formatVal(item.net_salary)} <span className="text-[10px]">{t('currency')}</span></p>
                            </div>
                        </button>
                    ))
                )}
            </div>

            {selectedItem && (
                <div className="fixed inset-0 z-[1000] flex items-end justify-center p-4">
                    <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setSelectedItem(null)}></div>
                    <div className="bg-white rounded-[40px] w-full max-w-lg shadow-2xl relative z-10 overflow-hidden border border-slate-200 animate-in slide-in-from-bottom-6 duration-400">
                        <div className="p-8 border-b border-slate-100 bg-slate-50 flex justify-between items-center text-start">
                            <div>
                                <h3 className="text-lg font-black text-slate-900 tracking-tight">{language === 'ar' ? 'قسيمة الراتب' : 'Interactive Payslip'}</h3>
                                <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mt-1">{selectedItem.payrollRun?.period_key}</p>
                            </div>
                            <button onClick={() => setSelectedItem(null)} className="text-slate-400 font-bold text-2xl">×</button>
                        </div>
                        <div className="p-10 space-y-10">
                            <div className="grid grid-cols-2 gap-8 pb-10 border-b border-slate-100">
                                <div>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{t('netPayable')}</p>
                                    <p className="text-4xl font-black text-slate-900 tracking-tighter">{formatVal(selectedItem.net_salary)} <span className="text-sm">{t('currency')}</span></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Registry Token</p>
                                    <p className="text-[10px] font-bold text-slate-400 font-mono">#{selectedItem.id.slice(0, 12)}</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                    {language === 'ar' ? 'المستحقات' : 'Earnings Breakdown'}
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm font-medium text-slate-600">
                                        <span>Basic Salary</span>
                                        <span className="font-black text-slate-900">+{formatVal(selectedItem.basic_salary)}</span>
                                    </div>
                                    {selectedItem.allowance_breakdown?.map((a: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center text-sm font-medium text-slate-600">
                                            <span>{language === 'ar' && a.nameArabic ? a.nameArabic : a.name}</span>
                                            <span className="font-black text-indigo-600">+{formatVal(a.value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                                    {language === 'ar' ? 'الاستقطاعات' : 'Deductions & Offsets'}
                                </h4>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center text-sm font-medium text-slate-500">
                                        <span>PIFSS Share</span>
                                        <span className="font-black text-rose-600">-{formatVal(selectedItem.pifss_deduction)}</span>
                                    </div>
                                    {selectedItem.deduction_breakdown?.map((d: any, i: number) => (
                                        <div key={i} className="flex justify-between items-center text-sm font-medium text-slate-500">
                                            <span>{language === 'ar' && d.nameArabic ? d.nameArabic : d.name}</span>
                                            <span className="font-black text-rose-600">-{formatVal(selectedItem.pifss_deduction)}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-6">
                                <button onClick={() => window.print()} className="w-full py-4 bg-slate-900 text-white rounded-[24px] font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95">
                                    Download PDF Copy
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobilePayroll;
