
import React, { useState, useEffect } from 'react';
import { User, View } from '../types/types';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from './NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';
import { supabase } from '../services/supabaseClient.ts';

interface ApprovalsViewProps {
    user: User;
    compactMode?: boolean;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({ user, compactMode }) => {
    const { t, i18n } = useTranslation();
    const { notify } = useNotifications();
    const [activeTab, setActiveTab] = useState<'overtime' | 'leaves' | 'profile'>('overtime');
    const [overtimeRequests, setOvertimeRequests] = useState<any[]>([]);
    const [leaveRequests, setLeaveRequests] = useState<any[]>([]);
    const [profileRequests, setProfileRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            const isExecOrHr = ['Admin', 'Executive', 'HR Manager', 'HR Officer', 'Payroll Manager', 'HR'].includes(user.role);

            const [ot, leaves, prof] = await Promise.all([
                dbService.getOvertimeApprovals(),
                dbService.getLeaveRequests(),
                dbService.getProfileUpdateRequests()
            ]);

            const filterItems = (items: any[], empDeptPath: string, empMgrIdPath: string) => {
                if (isExecOrHr) return items;
                return items.filter((item: any) => {
                    const getNested = (obj: any, path: string) => path.split('.').reduce((o, i) => o?.[i], obj);
                    const dept = getNested(item, empDeptPath);
                    const mgrId = getNested(item, empMgrIdPath);
                    return mgrId === user.id || dept === user.department;
                });
            };

            setOvertimeRequests(filterItems(ot, 'employees.department', 'employees.manager_id'));
            setLeaveRequests(filterItems(leaves, 'department', 'managerId'));
            setProfileRequests(filterItems(prof, 'employees.department', 'employees.manager_id'));
        } catch (error) {
            console.error('Failed to fetch approvals:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [user]);

    const handleUpdateStatus = async (item: any, newStatus: string, successMsg: string) => {
        try {
            await dbService.updateVariableCompStatus(item.id, newStatus);
            notify(t('success'), successMsg, 'success');
            fetchData();
        } catch (error) {
            notify(t('error'), 'Update failed', 'error');
        }
    };

    const handleUpdateLeave = async (item: any, newStatus: 'Pending' | 'Manager_Approved' | 'HR_Approved' | 'Resumed' | 'Rejected' | 'HR_Finalized' | 'Paid' | 'Pushed_To_Payroll', note: string) => {
        try {
            await dbService.updateLeaveRequestStatus(item.id, newStatus, user, note);
            notify(t('success'), `Leave ${newStatus.replace('_', ' ')}`, 'success');
            fetchData();
        } catch (error) {
            notify(t('error'), 'Update failed', 'error');
        }
    };

    const handleUpdateProfile = async (item: any, action: 'approve' | 'reject') => {
        try {
            if (action === 'approve') await dbService.approveProfileUpdate(item.id, user.id);
            else await dbService.rejectProfileUpdate(item.id, 'Rejected by ' + user.id);
            notify(t('success'), `Profile ${action}d`, 'success');
            fetchData();
        } catch (error) {
            notify(t('error'), 'Update failed', 'error');
        }
    };

    const getStatusBadge = (status: string) => {
        const s = status.toUpperCase();
        if (s.includes('PENDING_MANAGER')) return <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-full text-[10px] font-black border border-amber-200 uppercase tracking-widest">Manager Action</span>;
        if (s.includes('PENDING_HR')) return <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black border border-blue-200 uppercase tracking-widest">HR Ack</span>;
        if (s.includes('PENDING_PAYROLL')) return <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[10px] font-black border border-indigo-200 uppercase tracking-widest">Payroll Action</span>;
        return <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black border border-emerald-200 uppercase tracking-widest">{status.replace('_', ' ')}</span>;
    };

    return (
        <div className={`${compactMode ? 'space-y-4' : 'space-y-8'} animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 text-start`}>
            <div className={`flex flex-col md:flex-row md:items-center justify-between ${compactMode ? 'gap-2' : 'gap-6'}`}>
                <div>
                    <h2 className={`${compactMode ? 'text-xl' : 'text-4xl'} font-black text-slate-900 tracking-tighter uppercase`}>{t('approvalsWorkflow')}</h2>
                    <p className="text-slate-500 font-medium mt-1">{t('reviewActionPendingItems')}</p>
                </div>

                <div className="flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
                    <button onClick={() => setActiveTab('overtime')} className={`px-6 py-2 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'overtime' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>OVERTIME</button>
                    <button onClick={() => setActiveTab('leaves')} className={`px-6 py-2 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'leaves' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>LEAVES</button>
                    <button onClick={() => setActiveTab('profile')} className={`px-6 py-2 rounded-xl text-xs font-black tracking-widest transition-all ${activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>PROFILE</button>
                </div>
            </div>

            {
                loading ? (
                    <div className="bg-white rounded-[40px] p-20 border border-slate-200 flex flex-col items-center justify-center animate-pulse">
                        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{t('synthesizing')}</p>
                    </div>
                ) : activeTab === 'overtime' ? (
                    <div className={`bg-white ${compactMode ? 'rounded-2xl' : 'rounded-[40px]'} border border-slate-200 shadow-xl shadow-slate-900/[0.02] overflow-hidden`}>
                        <table className="w-full text-start">
                            <thead className={`bg-slate-50 border-b border-slate-100 ${compactMode ? 'text-[9px]' : 'text-[10px]'} font-black text-slate-400 uppercase tracking-widest`}>
                                <tr>
                                    <th className={`${compactMode ? 'px-4 py-2' : 'px-8 py-5'}`}>{t('employee')}</th>
                                    <th className={`${compactMode ? 'px-4 py-2' : 'px-8 py-5'}`}>Type</th>
                                    <th className={`${compactMode ? 'px-4 py-2' : 'px-8 py-5'}`}>{t('hours')}</th>
                                    <th className={`${compactMode ? 'px-4 py-2' : 'px-8 py-5'}`}>{t('status')}</th>
                                    <th className={`${compactMode ? 'px-4 py-2' : 'px-8 py-5'} text-end`}>{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {overtimeRequests.length > 0 ? overtimeRequests.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-8 py-6">
                                            <p className="font-black text-slate-900 text-base">{i18n.language === 'ar' ? item.employees?.name_arabic || item.employees?.name : item.employees?.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{item.employees?.department}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-xs font-black text-slate-600 uppercase tracking-widest">{item.sub_type?.replace('_', ' ') || 'OVERTIME'}</p>
                                            <p className="text-[9px] text-slate-400 mt-1 max-w-[200px] truncate">{item.notes}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="inline-flex flex-col">
                                                <p className="text-lg font-black text-indigo-600 leading-none">{item.amount}</p>
                                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-1">{t('hours')}</p>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            {getStatusBadge(item.status)}
                                        </td>
                                        <td className="px-8 py-6 text-end">
                                            <div className="flex justify-end gap-3">
                                                {item.status === 'PENDING_MANAGER' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleUpdateStatus(item, 'PENDING_HR', 'Overtime approved by Manager')}
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateStatus(item, 'REJECTED', 'Overtime rejected')}
                                                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-200 transition-all active:scale-95"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {item.status === 'PENDING_HR' && ['Admin', 'HR Manager', 'Executive'].includes(user.role) && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(item, 'PENDING_PAYROLL', 'Overtime acknowledged by HR')}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                                                    >
                                                        Acknowledge (HR)
                                                    </button>
                                                )}
                                                {item.status === 'PENDING_PAYROLL' && ['Admin', 'Payroll Manager', 'Payroll Officer'].includes(user.role) && (
                                                    <button
                                                        onClick={() => handleUpdateStatus(item, 'APPROVED_FOR_PAYROLL', 'Overtime pushed to Payroll')}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                                                    >
                                                        Process to Payroll
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-32 text-center text-slate-300 italic font-medium uppercase tracking-[0.3em]">
                                            {t('clearSet')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : activeTab === 'leaves' ? (
                    <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] overflow-hidden">
                        <table className="w-full text-start">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="px-8 py-6">{t('employee')}</th>
                                    <th className="px-8 py-6">{t('leaveType')}</th>
                                    <th className="px-8 py-6">{t('duration')}</th>
                                    <th className="px-8 py-6">{t('status')}</th>
                                    <th className="px-8 py-6 text-end">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {leaveRequests.length > 0 ? leaveRequests.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-8 py-6">
                                            <p className="font-black text-slate-900 text-base">{item.employeeName}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{item.department}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl">{item.type === 'Annual' ? '🌴' : item.type === 'Sick' ? '🤒' : '🚶'}</span>
                                                <p className="text-xs font-black text-slate-600 uppercase tracking-widest">{item.type}</p>
                                            </div>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-lg font-black text-indigo-600 leading-none">{item.days ? item.days : item.durationHours}</p>
                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-1">{item.days ? t('members') : t('hours')}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            {getStatusBadge(item.status)}
                                        </td>
                                        <td className="px-8 py-6 text-end">
                                            <div className="flex justify-end gap-3">
                                                {(item.status === 'Pending' || item.status === 'Pending_Manager') && (
                                                    <>
                                                        <button
                                                            onClick={() => handleUpdateLeave(item, 'Manager_Approved', 'Manager generic approval')}
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateLeave(item, 'Rejected', 'Rejected by Manager')}
                                                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-200 transition-all active:scale-95"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                                {item.status === 'Manager_Approved' && ['Admin', 'HR', 'HR Manager', 'Executive'].includes(user.role) && (
                                                    <button
                                                        onClick={() => handleUpdateLeave(item, 'HR_Approved', 'HR final review')}
                                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                                                    >
                                                        HR Sign-off
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-32 text-center text-slate-300 italic font-medium uppercase tracking-[0.3em]">
                                            {t('clearSet')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="bg-white rounded-[40px] border border-slate-200 shadow-xl shadow-slate-900/[0.02] overflow-hidden">
                        <table className="w-full text-start">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-200">
                                <tr>
                                    <th className="px-8 py-6">{t('employee')}</th>
                                    <th className="px-8 py-6">Update Field</th>
                                    <th className="px-8 py-6">New Value</th>
                                    <th className="px-8 py-6">{t('status')}</th>
                                    <th className="px-8 py-6 text-end">{t('actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {profileRequests.length > 0 ? profileRequests.map(item => (
                                    <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                                        <td className="px-8 py-6">
                                            <p className="font-black text-slate-900 text-base">{item.employees?.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{item.employees?.department}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            <span className="px-3 py-1 bg-slate-100 text-slate-600 font-mono text-xs rounded-lg">{item.field_name}</span>
                                        </td>
                                        <td className="px-8 py-6">
                                            <p className="text-sm font-black text-emerald-600 truncate max-w-[200px]">{item.new_value}</p>
                                            <p className="text-[10px] font-bold text-slate-400 line-through mt-0.5 truncate max-w-[200px]">{item.old_value}</p>
                                        </td>
                                        <td className="px-8 py-6">
                                            {getStatusBadge(item.status)}
                                        </td>
                                        <td className="px-8 py-6 text-end">
                                            <div className="flex justify-end gap-3">
                                                {item.status === 'PENDING' && (
                                                    <>
                                                        <button
                                                            onClick={() => handleUpdateProfile(item, 'approve')}
                                                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                                                        >
                                                            Approve
                                                        </button>
                                                        <button
                                                            onClick={() => handleUpdateProfile(item, 'reject')}
                                                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-rose-200 transition-all active:scale-95"
                                                        >
                                                            Reject
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={5} className="px-8 py-32 text-center text-slate-300 italic font-medium uppercase tracking-[0.3em]">
                                            {t('clearSet')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )
            }
        </div >
    );
};
