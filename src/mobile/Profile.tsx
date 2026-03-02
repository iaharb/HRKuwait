
import React, { useState, useEffect } from 'react';
import { User, Employee } from '../types/types';
import { dbService } from '../services/dbService.ts';
import { useTranslation } from 'react-i18next';

const MobileProfile: React.FC<{ user: User, language: 'en' | 'ar' }> = ({ user, language }) => {
    const { t } = useTranslation();
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [loading, setLoading] = useState(true);
    const [editingField, setEditingField] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");
    const [requests, setRequests] = useState<any[]>([]);

    const fetchProfile = async () => {
        try {
            const emp = await dbService.getEmployeeByName(user.name);
            if (emp) setEmployee(emp);
            const reqs = await dbService.getProfileUpdateRequests(emp?.id);
            setRequests(reqs);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchProfile(); }, [user]);

    const handleRequestUpdate = async () => {
        if (!employee || !editingField) return;
        try {
            const oldValue = (employee as any)[editingField] || "";
            await dbService.requestProfileUpdate(employee.id, editingField, oldValue, editValue);
            setEditingField(null);
            setEditValue("");
            fetchProfile();
            alert(language === 'ar' ? "تم إرسال طلب التعديل للمراجعة" : "Update request sent for HR review.");
        } catch (e: any) { alert(e.message); }
    };

    if (loading) return <div className="p-10 text-center text-slate-400 font-bold">SYCHRONIZING_PROFILE...</div>;

    return (
        <div className="p-4 space-y-6 pb-24">
            <div className="bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm text-start">
                <div className="flex items-center gap-6 mb-8">
                    <div className="w-20 h-20 rounded-3xl bg-slate-900 text-white flex items-center justify-center text-3xl font-black shadow-xl">
                        {employee?.faceToken ? <img src={employee.faceToken} className="w-full h-full object-cover rounded-3xl" /> : user.name[0]}
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 tracking-tight">{language === 'ar' && employee?.nameArabic ? employee.nameArabic : user.name}</h2>
                        <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest mt-1">{employee?.position}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6 bg-slate-50 p-6 rounded-[24px] border border-slate-100 mb-8">
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('department')}</p>
                        <p className="text-sm font-black text-slate-700">{employee?.department}</p>
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('joinDate')}</p>
                        <p className="text-sm font-black text-slate-700">{employee?.joinDate}</p>
                    </div>
                </div>

                <div className="space-y-6">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('contactInfo')}</h3>
                    {[
                        { label: t('phone') || 'Phone', field: 'phone', value: employee?.phone },
                        { label: 'Emergency Contact', field: 'emergencyContact', value: employee?.emergencyContact },
                        { label: 'IBAN', field: 'iban', value: employee?.iban },
                    ].map((item) => (
                        <div key={item.field} className="flex justify-between items-center py-2 border-b border-slate-50">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.label}</p>
                                <p className="text-sm font-black text-slate-800">{item.value || 'Not Set'}</p>
                            </div>
                            <button
                                onClick={() => { setEditingField(item.field); setEditValue(item.value || ""); }}
                                className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-lg active:scale-95 transition-all"
                            >
                                📝
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            {editingField && (
                <div className="bg-indigo-600 rounded-[32px] p-8 text-white animate-in slide-in-from-bottom-6 duration-300">
                    <h4 className="text-xs font-black uppercase tracking-widest mb-4">Request Edit: {editingField}</h4>
                    <input
                        className="w-full bg-indigo-500 border border-indigo-400 rounded-2xl p-4 text-white font-bold mb-4 outline-none placeholder:text-indigo-300"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        placeholder={`Enter new ${editingField}`}
                    />
                    <div className="flex gap-4">
                        <button
                            onClick={handleRequestUpdate}
                            className="flex-1 py-4 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all"
                        >
                            Submit Request
                        </button>
                        <button
                            onClick={() => setEditingField(null)}
                            className="px-6 py-4 bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95"
                        >
                            {t('cancel')}
                        </button>
                    </div>
                </div>
            )}

            {requests.length > 0 && (
                <div className="bg-slate-100 rounded-[32px] p-8">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Recent Change Requests</h3>
                    <div className="space-y-4">
                        {requests.map((r) => (
                            <div key={r.id} className="bg-white p-4 rounded-2xl border border-slate-200 flex justify-between items-center text-start">
                                <div>
                                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{r.field_name}</p>
                                    <p className="text-xs font-bold text-slate-400 mt-1">{r.new_value}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest ${r.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' :
                                        r.status === 'REJECTED' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
                                    }`}>
                                    {r.status}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MobileProfile;
