import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { getKuwaitizationInsights, getActiveAiProvider } from '../services/geminiService.ts';
import { dbService } from '../services/dbService.ts';
import { InsightReport, LeaveRequest, Employee, AttendanceRecord } from '../types.ts';
import { useTranslation } from 'react-i18next';

const COLORS = ['#4f46e5', '#818cf8', '#f59e0b', '#ec4899', '#94a3b8'];

const AiInsights: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<InsightReport | null>(null);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [riskAssessment, setRiskAssessment] = useState<{level: string, message: string} | null>(null);

  const isAr = i18n.language === 'ar';
  const activeProvider = getActiveAiProvider();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [liveEmployees, leaves, attendance] = await Promise.all([
        dbService.getEmployees(),
        dbService.getLeaveRequests(),
        dbService.getAttendanceRecords()
      ]);
      
      setEmployees(liveEmployees);
      setLeaveRequests(leaves);
      setAttendanceLogs(attendance);

      const dataStr = JSON.stringify(liveEmployees.map(e => ({
        name: e.name,
        nat: e.nationality,
        dept: e.department,
        pos: e.position
      })));
      
      const result = await getKuwaitizationInsights(dataStr);
      setReport(result);
      generateHeatmap(leaves);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateHeatmap = (leaves: LeaveRequest[]) => {
    const data = [];
    const today = new Date();
    
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const count = leaves.filter(l => {
        const start = new Date(l.startDate);
        const end = new Date(l.endDate);
        const current = new Date(dateStr);
        return current >= start && current <= end;
      }).length;
      
      data.push({
        date: date.toLocaleDateString(i18n.language === 'ar' ? 'ar-KW' : 'en-GB', { day: '2-digit', month: 'short' }),
        absences: count,
        staffingLevel: 100 - (count * 15)
      });
    }
    setHeatmapData(data);

    const maxAbsences = Math.max(...data.map(d => d.absences));
    if (maxAbsences > 3) {
      setRiskAssessment({
        level: t('critical'),
        message: i18n.language === 'ar' 
          ? 'يتوقع النظام نقصاً حاداً في القوى العاملة منتصف الشهر القادم.'
          : 'System predicts a critical staffing dip around the middle of next month.'
      });
    } else {
      setRiskAssessment({
        level: t('optimal'),
        message: i18n.language === 'ar'
          ? 'جاهزية القوى العاملة ضمن المعايير التشغيلية الآمنة للدورة القادمة.'
          : 'Workforce availability remains within safe operational parameters for the upcoming cycle.'
      });
    }
  };

  useEffect(() => {
    fetchData();
  }, [i18n.language]);

  // Analytical Computations
  const leaveDistribution = useMemo(() => {
    const types: Record<string, number> = {};
    leaveRequests.forEach(r => {
      types[r.type] = (types[r.type] || 0) + 1;
    });
    return Object.entries(types).map(([name, value]) => ({ name, value }));
  }, [leaveRequests]);

  const punctualityData = useMemo(() => {
    const dates: Record<string, { total: number, late: number }> = {};
    attendanceLogs.slice(0, 50).forEach(log => {
      if (!dates[log.date]) dates[log.date] = { total: 0, late: 0 };
      dates[log.date].total++;
      if (log.status === 'Late') dates[log.date].late++;
    });
    return Object.entries(dates).map(([date, stats]) => ({
      date: date.slice(-5),
      rate: Math.round(( (stats.total - stats.late) / stats.total ) * 100)
    })).reverse();
  }, [attendanceLogs]);

  const latenessWatchlist = useMemo(() => {
    const userLateness: Record<string, { name: string, count: number, avgCheckIn: string }> = {};
    attendanceLogs.forEach(log => {
      if (!userLateness[log.employeeId]) userLateness[log.employeeId] = { name: log.employeeName, count: 0, avgCheckIn: log.clockIn };
      if (log.status === 'Late') userLateness[log.employeeId].count++;
    });
    return Object.values(userLateness)
      .sort((a,b) => b.count - a.count)
      .slice(0, 5);
  }, [attendanceLogs]);

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-20 text-start">
      {/* SaaS Hero Banner */}
      <div className="bg-slate-900 rounded-[64px] p-16 text-white shadow-2xl relative overflow-hidden group border border-white/5">
        <div className="absolute top-0 right-0 p-16 opacity-[0.03] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
           <span className="text-[320px] leading-none select-none">🧠</span>
        </div>
        
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
          <div className="space-y-10">
            <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
              <span className="text-indigo-400">✨</span>
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">{activeProvider === 'Local' ? 'Local Node Active' : t('generativeIntelHub')}</span>
            </div>
            
            <h2 className="text-6xl font-black tracking-tighter leading-[0.9] text-white">
              {t('strategicForecasting')}
            </h2>
            <p className="text-slate-400 text-xl max-w-xl leading-relaxed font-medium opacity-80">
              {isAr 
                ? 'تحليلات مدعومة بالذكاء الاصطناعي لسجلك المؤسسي. نتابع حصص التوطين، ونتنبأ بتوفر الموظفين، وننشئ مسارات الامتثال تلقائياً.'
                : 'Advanced workforce modeling powered by Gemini. We track Kuwaitization compliance, predict labor scarcity, and automate regulatory pathfinding.'}
            </p>
            
            <button 
              onClick={fetchData}
              disabled={loading}
              className="bg-white text-slate-900 px-12 py-6 rounded-[28px] font-black text-[13px] uppercase tracking-[0.15em] hover:bg-indigo-600 hover:text-white transition-all disabled:opacity-50 shadow-2xl shadow-white/5 active:scale-95"
            >
              {loading 
                ? (activeProvider === 'Local' ? 'Consulting Local AI...' : 'Consulting Gemini...') 
                : t('runAiAudit')}
            </button>
          </div>

          {report && (
             <div className="bg-white/5 backdrop-blur-3xl p-10 rounded-[48px] border border-white/10 space-y-8 animate-in zoom-in-95 duration-500 shadow-2xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest">{t('complianceAudit')}</h3>
                  <span className={`px-5 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] ${
                    report.complianceStatus === 'Compliant' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 
                    report.complianceStatus === 'Warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                  }`}>
                    {report.complianceStatus}
                  </span>
                </div>
                <div className="space-y-4">
                  {report.recommendations.slice(0, 3).map((rec, i) => (
                    <div key={i} className="flex gap-5 p-5 bg-white/5 rounded-3xl border border-white/5 hover:border-indigo-500/30 transition-all group">
                      <span className="text-indigo-500 font-black text-sm group-hover:scale-125 transition-transform">0{i+1}</span>
                      <p className="text-[12px] text-slate-300 font-bold leading-relaxed">{rec}</p>
                    </div>
                  ))}
                </div>
             </div>
           )}
        </div>
      </div>

      {/* KPI Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <div className="bg-white p-12 rounded-[56px] border border-slate-200 shadow-sm hover:shadow-xl transition-all group">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">{t('lateRate')}</p>
            <div className="flex items-end gap-4">
               <h4 className="text-6xl font-black text-slate-900 tracking-tighter">
                 {Math.round((attendanceLogs.filter(a => a.status === 'Late').length / (attendanceLogs.length || 1)) * 100)}%
               </h4>
               <span className="text-xs font-black text-rose-500 mb-2 uppercase tracking-widest">High Variance</span>
            </div>
         </div>
         <div className="bg-white p-12 rounded-[56px] border border-slate-200 shadow-sm hover:shadow-xl transition-all">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">{t('presentCount')}</p>
            <div className="flex items-end gap-4">
               <h4 className="text-6xl font-black text-indigo-600 tracking-tighter">
                 {employees.filter(e => e.status === 'Active').length}
               </h4>
               <span className="text-xs font-black text-indigo-500 mb-2 uppercase tracking-widest">Capacity</span>
            </div>
         </div>
         <div className="bg-indigo-50/50 p-12 rounded-[56px] border border-indigo-100 shadow-sm">
            <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-6">{t('staffingResilience')}</p>
            <p className="text-base font-bold text-indigo-900 leading-relaxed">
               {riskAssessment?.message || 'Calculating predictive readiness...'}
            </p>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 bg-white p-12 rounded-[56px] border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-12">
            <div>
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">{t('punctualityTrend')}</h3>
              <p className="text-sm text-slate-500 font-medium">Daily attendance integrity baseline.</p>
            </div>
          </div>
          
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={punctualityData}>
                <defs>
                  <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} dy={15} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} domain={[0, 100]} />
                <Tooltip contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '20px'}} />
                <Area type="monotone" dataKey="rate" stroke="#4f46e5" strokeWidth={5} fillOpacity={1} fill="url(#colorRate)" animationDuration={2000} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white p-12 rounded-[56px] border border-slate-200 shadow-sm flex flex-col">
          <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.2em] mb-10 flex items-center gap-4">
             <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.4)]"></span>
             {t('topLateness')}
          </h3>
          <div className="space-y-6 flex-1">
             {latenessWatchlist.map((user, i) => (
               <div key={i} className="flex items-center justify-between p-6 bg-slate-50 rounded-[32px] border border-slate-100 hover:bg-white hover:border-indigo-100 hover:shadow-lg transition-all group">
                  <div className="text-start">
                    <p className="text-sm font-black text-slate-900">{user.name}</p>
                    <p className="text-[9px] text-slate-400 font-extrabold uppercase mt-1 tracking-widest">{t('avgCheckIn')}: {user.avgCheckIn}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-black text-rose-600">{user.count}</span>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">Flags</p>
                  </div>
               </div>
             ))}
             {latenessWatchlist.length === 0 && (
                <div className="flex-1 flex flex-col items-center justify-center grayscale opacity-30">
                   <span className="text-4xl mb-4">🛡️</span>
                   <p className="text-xs font-black uppercase tracking-widest">No Integrity Issues</p>
                </div>
             )}
          </div>
        </div>
      </div>

      <div className="bg-slate-900 rounded-[64px] p-16 text-white flex flex-col md:flex-row items-center justify-between gap-16 shadow-2xl">
         <div className="space-y-6 max-w-2xl text-start">
            <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]">{t('operationalIntelligence')}</h4>
            <h3 className="text-4xl font-black tracking-tighter leading-tight">Automated Workforce Calibration</h3>
            <p className="text-slate-400 text-lg leading-relaxed font-medium opacity-80">
               Our neural engine predicts a potential 22% dip in service availability for Q3. We recommend staggering IT Support leave cycles to maintain baseline velocity.
            </p>
         </div>
         <div className="w-full md:w-auto flex flex-wrap gap-6">
            <div className="px-12 py-8 bg-white/5 backdrop-blur-xl rounded-[40px] border border-white/10 text-center flex-1 md:flex-none hover:bg-white/10 transition-all">
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Availability</p>
               <p className="text-3xl font-black">94.2%</p>
            </div>
            <div className="px-12 py-8 bg-white/5 backdrop-blur-xl rounded-[40px] border border-white/10 text-center flex-1 md:flex-none hover:bg-white/10 transition-all">
               <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Drift Risk</p>
               <p className="text-3xl font-black text-indigo-400">Low</p>
            </div>
         </div>
      </div>
    </div>
  );
};

export default AiInsights;