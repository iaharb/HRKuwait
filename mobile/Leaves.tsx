import React, { useState, useEffect, useMemo } from 'react';
import { User, LeaveRequest, LeaveType, Employee } from '../types.ts';
import { dbService } from '../services/dbService.ts';
import { useNotifications } from '../components/NotificationSystem.tsx';
import { useTranslation } from 'react-i18next';

const MobileLeaves: React.FC<{ user: User, language: 'en' | 'ar' }> = ({ user, language }) => {
  const { t } = useTranslation();
  const { notify, confirm } = useNotifications();
  const [history, setHistory] = useState<LeaveRequest[]>([]);
  const [teamRequests, setTeamRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showApply, setShowApply] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isShiftActive, setIsShiftActive] = useState(!!localStorage.getItem('shift_start'));
  const [isHourBased, setIsHourBased] = useState(false);

  const [formData, setFormData] = useState({
    type: 'Annual' as LeaveType,
    start: '',
    end: '',
    reason: '',
    hours: 1
  });

  const isManagerOrAdmin = user.role === 'Manager' || user.role === 'Admin' || user.role === 'HR';
  const isHR = user.role === 'HR' || user.role === 'Admin';

  const fetch = async () => {
    setLoading(true);
    try {
      const personalData = await dbService.getLeaveRequests({ employeeId: user.id });
      setHistory(personalData);

      if (isManagerOrAdmin) {
        let filter: any = {};
        if (user.role === 'Manager') filter = { department: user.department };
        const teamData = await dbService.getLeaveRequests(filter);
        setTeamRequests(teamData.filter(r => r.status !== 'HR_Finalized' && r.status !== 'Rejected' && r.employeeId !== user.id));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
    setIsShiftActive(!!localStorage.getItem('shift_start'));
  }, [user]);

  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isHourBased && (!formData.start || !formData.end)) {
      notify(t('critical'), t('actionRequired'), "warning");
      return;
    }
    if (isHourBased && !formData.start) {
      notify(t('critical'), t('actionRequired'), "warning");
      return;
    }

    if (isHourBased) {
       const selectedDate = new Date(formData.start);
       const minLeadDate = new Date();
       minLeadDate.setHours(0, 0, 0, 0);
       minLeadDate.setDate(minLeadDate.getDate() + 1);

       if (selectedDate < minLeadDate) {
         notify(t('critical'), language === 'ar' ? "يجب طلب إذن الخروج قبل يوم واحد على الأقل." : "Short Permission must be requested at least one day in advance.", "error");
         return;
       }
    }

    setSubmitting(true);
    try {
      const startD = new Date(formData.start || new Date());
      const endD = new Date(formData.end || new Date());
      const diffTime = Math.abs(endD.getTime() - startD.getTime());
      const diffDays = isHourBased ? 0 : Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      await dbService.createLeaveRequest({
        employeeId: user.id,
        employeeName: user.name,
        department: user.department || 'General',
        type: isHourBased ? 'ShortPermission' : formData.type,
        startDate: formData.start,
        endDate: isHourBased ? formData.start : formData.end,
        days: diffDays,
        durationHours: isHourBased ? formData.hours : undefined,
        reason: formData.reason,
        status: 'Pending',
        managerId: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date().toISOString(),
        history: []
      }, user);
      
      notify(t('leaveApproved'), t('leaveApprovedMsg'), "success");
      setShowApply(false);
      setFormData({ type: 'Annual', start: '', end: '', reason: '', hours: 1 });
      fetch();
    } catch (err) {
      notify("Failed", "Error", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResume = async (req: LeaveRequest) => {
    setProcessingId(req.id);
    try {
      await dbService.updateLeaveRequestStatus(req.id, 'Resumed', user, "Mobile resumption confirmed.");
      notify(t('resumeDuty'), t('hrInformed'), "success");
      fetch();
    } catch (err) {
      notify("Error", "Action failed.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleApprovalAction = async (id: string, nextStatus: LeaveRequest['status']) => {
    setProcessingId(id);
    try {
      await dbService.updateLeaveRequestStatus(id, nextStatus, user);
      notify(t('success'), t('saveChanges'), "success");
      fetch();
    } catch (err) {
      notify("Error", "Action failed.", "error");
    } finally {
      setProcessingId(null);
    }
  };

  const handleFinalize = (req: LeaveRequest) => {
    confirm({
      title: t('payroll'),
      message: `${t('executeSettlement')} for ${req.employeeName}?`,
      onConfirm: async () => {
        setProcessingId(req.id);
        try {
          await dbService.finalizeHRApproval(req.id, user, req.days);
          notify(t('success'), t('officialRecord'), "success");
          fetch();
        } catch (err) {
          notify("Error", "Finalize failed.", "error");
        } finally {
          setProcessingId(null);
        }
      }
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'Manager_Approved': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'HR_Approved': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case 'Resumed': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'HR_Finalized': return 'bg-slate-100 text-slate-400 border-slate-200';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };

  const activeResumption = history.find(h => h.status === 'HR_Approved' || (h.type === 'ShortPermission' && h.status === 'Manager_Approved'));

  return (
    <div className="p-6 space-y-8 pb-32">
      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
         <button 
           onClick={() => { setIsHourBased(false); setShowApply(true); }}
           className="p-6 bg-white border border-slate-200 rounded-[32px] flex flex-col items-center gap-2 active:scale-95 transition-all shadow-sm"
         >
            <span className="text-3xl">🌴</span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('applyLeave')}</span>
         </button>
         
         <button 
           onClick={() => { setIsHourBased(true); setShowApply(true); }}
           className="p-6 bg-indigo-50 border border-indigo-100 rounded-[32px] flex flex-col items-center gap-2 active:scale-95 transition-all shadow-sm"
         >
            <span className="text-3xl">🚶</span>
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{t('shortPermission')}</span>
         </button>
      </div>

      {activeResumption && (
        <div className="bg-indigo-600 p-6 rounded-[32px] text-white space-y-4 shadow-xl shadow-indigo-200">
           <div>
              <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{t('resumeDuty')}</p>
              <h4 className="text-lg font-black">{activeResumption.type === 'ShortPermission' ? t('shortPermission') : activeResumption.type}</h4>
           </div>
           <button 
             disabled={processingId === activeResumption.id}
             onClick={() => handleResume(activeResumption)}
             className="w-full py-4 bg-white text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all"
           >
             {t('confirmResumption')}
           </button>
        </div>
      )}

      {/* Approval Feed (Managers/HR) */}
      {isManagerOrAdmin && teamRequests.length > 0 && (
        <div className="space-y-4 animate-in slide-in-from-top duration-500">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex justify-between items-center">
             <span>{t('adminCenter')} • {t('actionRequired')}</span>
             <span className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px]">{teamRequests.length}</span>
          </h3>
          <div className="space-y-3">
            {teamRequests.map(req => (
              <div key={req.id} className="bg-white p-5 rounded-[32px] border border-slate-200 shadow-sm space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-lg">{req.type === 'Annual' ? '🌴' : (req.type === 'ShortPermission' ? '🚶' : '🤒')}</div>
                    <div>
                      <p className="text-sm font-black text-slate-900">{req.employeeName}</p>
                      <p className="text-[9px] text-slate-400 font-bold uppercase">
                        {req.type === 'ShortPermission' ? `${req.durationHours}h Permission` : `${req.startDate} → ${req.endDate}`}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase border ${getStatusColor(req.status)}`}>
                    {t(req.status.toLowerCase().replace('_', '')) || req.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="pt-2">
                  {req.status === 'Pending' && (user.role === 'Manager' || user.role === 'Admin') && (
                    <button 
                      disabled={processingId === req.id}
                      onClick={() => handleApprovalAction(req.id, 'Manager_Approved')}
                      className="w-full py-3 bg-slate-900 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-slate-900/10 active:scale-95"
                    >
                      {processingId === req.id ? '...' : t('authorize')}
                    </button>
                  )}
                  {req.status === 'Manager_Approved' && isHR && req.type !== 'ShortPermission' && (
                    <button 
                      disabled={processingId === req.id}
                      onClick={() => handleApprovalAction(req.id, 'HR_Approved')}
                      className="w-full py-3 bg-emerald-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-600/10 active:scale-95"
                    >
                      {processingId === req.id ? '...' : t('pamCertified')}
                    </button>
                  )}
                  {req.status === 'Resumed' && isHR && (
                    <button 
                      disabled={processingId === req.id}
                      onClick={() => handleFinalize(req)}
                      className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/10 active:scale-95"
                    >
                      {processingId === req.id ? '...' : t('executeSettlement')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leave Application Modal */}
      {showApply && (
        <div className="fixed inset-0 z-[100] flex items-end">
           <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowApply(false)}></div>
           <form onSubmit={handleApply} className="relative bg-white w-full rounded-t-[40px] p-8 space-y-8 animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-y-auto">
              <div className="flex justify-between items-center">
                 <h3 className="text-xl font-black text-slate-900 tracking-tight">{isHourBased ? t('shortPermission') : t('newLeaveRequest')}</h3>
                 <button type="button" onClick={() => setShowApply(false)} className="text-slate-400 text-2xl">×</button>
              </div>

              <div className="space-y-6">
                 {!isHourBased ? (
                   <>
                     <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('leaveType')}</label>
                        <select 
                          className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 font-bold text-sm outline-none"
                          value={formData.type}
                          onChange={e => setFormData({...formData, type: e.target.value as any})}
                        >
                           <option value="Annual">{t('annual')}</option>
                           <option value="Sick">{t('sick')}</option>
                           <option value="Emergency">{t('emergency')}</option>
                        </select>
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'من' : 'From'}</label>
                           <input type="date" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-4 font-bold text-xs" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'إلى' : 'To'}</label>
                           <input type="date" required className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-4 font-bold text-xs" value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})} />
                        </div>
                     </div>
                   </>
                 ) : (
                   <div className="space-y-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">{language === 'ar' ? 'تاريخ الإذن' : 'Permission Date'}</label>
                         <input type="date" required min={tomorrowStr} className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-4 font-bold text-xs" value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})} />
                      </div>
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('hoursLabel')}</label>
                      <div className="grid grid-cols-2 gap-4">
                         <button type="button" onClick={() => setFormData({...formData, hours: 1})} className={`py-4 rounded-2xl border font-black text-xl transition-all ${formData.hours === 1 ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>1h</button>
                         <button type="button" onClick={() => setFormData({...formData, hours: 2})} className={`py-4 rounded-2xl border font-black text-xl transition-all ${formData.hours === 2 ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 border-slate-100 text-slate-400'}`}>2h</button>
                      </div>
                      <p className="text-[10px] text-amber-600 font-bold text-center">One day lead time & Max 2h/week.</p>
                   </div>
                 )}

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{language === 'ar' ? 'السبب' : 'Reason'}</label>
                    <textarea className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-medium h-24 outline-none" placeholder="..." value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} />
                 </div>
              </div>

              <button type="submit" disabled={submitting} className="w-full py-5 bg-emerald-600 text-white rounded-[24px] font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all">
                {submitting ? '...' : t('enroll')}
              </button>
           </form>
        </div>
      )}

      {/* Request History */}
      <div className="space-y-4">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2">{t('applicationStatus')}</h3>
        {loading ? (
          <div className="p-20 text-center animate-pulse text-slate-300">{t('syncing')}</div>
        ) : history.length > 0 ? (
          history.map(req => (
            <div key={req.id} className="bg-white p-5 rounded-[32px] border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-50 flex items-center justify-center text-xl">
                  {req.type === 'Annual' ? '🌴' : (req.type === 'ShortPermission' ? '🚶' : '🤒')}
                </div>
                <div>
                   <p className="text-sm font-black text-slate-900">{req.type === 'ShortPermission' ? t('shortPermission') : req.type}</p>
                   <p className="text-[10px] text-slate-500 font-bold">
                     {req.type === 'ShortPermission' ? `${req.startDate} (${req.durationHours}h)` : `${req.startDate} → ${req.endDate}`}
                   </p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border ${getStatusColor(req.status)}`}>
                {t(req.status.toLowerCase().replace('_', '')) || req.status.replace('_', ' ')}
              </span>
            </div>
          ))
        ) : (
          <div className="p-20 text-center text-slate-300 font-medium italic">{t('noRecords')}</div>
        )}
      </div>
    </div>
  );
};

export default MobileLeaves;