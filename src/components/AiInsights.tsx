import React, { useState, useEffect, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';
import { getKuwaitizationInsights, getActiveAiProvider } from '../services/geminiService.ts';
import { dbService } from '../services/dbService.ts';
import { InsightReport, LeaveRequest, Employee, AttendanceRecord } from '../types/types';
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
  const [riskAssessment, setRiskAssessment] = useState<{ level: string, message: string } | null>(null);

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
    const dates: Record<string, { total: number, late: number, label: string }> = {};
    const now = new Date();

    // Create map for last 14 days to ensure zero-filling
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().split('T')[0];
      const label = d.toLocaleDateString(i18n.language === 'ar' ? 'ar-KW' : 'en-GB', { day: '2-digit', month: 'short' });
      dates[iso] = { total: 0, late: 0, label };
    }

    attendanceLogs.forEach(log => {
      // Ensure we only process logs within our 14-day map
      if (dates[log.date]) {
        dates[log.date].total++;

        // Unified late check (matches Watchlist logic)
        const [h, m] = (log.clockIn || "").split(':').map(Number);
        const isLate = log.status === 'Late' || (h > 8) || (h === 8 && m > 30);

        if (isLate) dates[log.date].late++;
      }
    });

    return Object.entries(dates)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, stats]) => ({
        date: stats.label,
        rate: stats.total === 0 ? 100 : Math.round(((stats.total - stats.late) / stats.total) * 100)
      }));
  }, [attendanceLogs, i18n.language]);

  const { latenessWatchlist, overallLateRate } = useMemo(() => {
    const userStats: Record<string, { name: string, count: number, totalMinutes: number, logCount: number }> = {};
    let totalLates = 0;

    attendanceLogs.forEach(log => {
      if (!log.clockIn) return;

      // Parse time to minutes (e.g., 08:45 -> 525)
      const [h, m] = log.clockIn.split(':').map(Number);
      const minutes = (h || 0) * 60 + (m || 0);

      if (!userStats[log.employeeId]) {
        userStats[log.employeeId] = { name: log.employeeName, count: 0, totalMinutes: 0, logCount: 0 };
      }

      const isLate = log.status === 'Late' || (h > 8) || (h === 8 && m > 30);
      if (isLate) {
        userStats[log.employeeId].count++;
        totalLates++;
      }

      userStats[log.employeeId].totalMinutes += minutes;
      userStats[log.employeeId].logCount++;
    });

    const watchlist = Object.values(userStats)
      .filter(u => u.count > 0)
      .map(u => {
        const avgMins = Math.round(u.totalMinutes / (u.logCount || 1));
        const hh = Math.floor(avgMins / 60).toString().padStart(2, '0');
        const mm = (avgMins % 60).toString().padStart(2, '0');
        return { name: u.name, count: u.count, avgCheckIn: `${hh}:${mm}` };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const rate = attendanceLogs.length > 0
      ? Math.round((totalLates / attendanceLogs.length) * 100)
      : 0;

    return { latenessWatchlist: watchlist, overallLateRate: rate };
  }, [attendanceLogs]);

  return (
    <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.8s ease', minHeight: '100%' }}>
      
      {/* Hero Banner */}
      <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-07)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--cds-spacing-03)', padding: '4px 12px', background: 'rgba(79, 70, 229, 0.1)', border: '1px solid rgba(79, 70, 229, 0.2)', marginBottom: 'var(--cds-spacing-05)' }}>
              <span style={{ color: 'var(--cds-interactive-01)' }}>✨</span>
              <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                {activeProvider === 'Local' ? 'LOCAL_INFERENCE_NODE_ACTIVE' : 'CLOUD_INFERENCE_NODE_ACTIVE'}
              </span>
            </div>
            <h2 style={{ fontSize: '2rem', fontWeight: 600, letterSpacing: '0.5px', marginBottom: 'var(--cds-spacing-03)', color: 'var(--cds-text-primary)' }}>
              {t('strategicForecasting')}
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', fontFamily: 'monospace', maxWidth: '600px', lineHeight: '1.5' }}>
              {isAr
                ? 'تحليلات مدعومة بالذكاء الاصطناعي لسجلك المؤسسي. نتابع حصص التوطين، ونتنبأ بتوفر الموظفين، وننشئ مسارات الامتثال تلقائياً.'
                : 'Advanced workforce modeling powered by AI. We track compliance, predict labor scarcity, and automate regulatory pathfinding.'}
            </p>
          </div>
          <div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="cds--btn cds--btn--primary"
              style={{ height: '48px', padding: '0 var(--cds-spacing-07)', fontSize: '0.875rem', letterSpacing: '0.1em', fontFamily: 'monospace' }}
            >
              {loading
                ? (activeProvider === 'Local' ? 'SYNCING_LOCAL_AI...' : 'SYNCING_CLOUD_AI...')
                : 'INITIATE_AI_AUDIT'}
            </button>
          </div>
        </div>

        {report && (
          <div style={{ marginTop: 'var(--cds-spacing-07)', padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', animation: 'slide-up 0.5s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-05)' }}>
              <h3 style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase' }}>COMPLIANCE_AUDIT_REPORT</h3>
              <span style={{ 
                padding: '4px 12px', fontSize: '0.625rem', fontFamily: 'monospace', fontWeight: 600, textTransform: 'uppercase',
                background: report.complianceStatus === 'Compliant' ? 'var(--cds-support-success)' :
                            report.complianceStatus === 'Warning' ? 'var(--cds-support-warning)' : 'var(--cds-support-error)',
                color: '#fff'
              }}>
                STATE: {report.complianceStatus}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
              {report.recommendations.slice(0, 3).map((rec, i) => (
                <div key={i} style={{ display: 'flex', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                  <span style={{ color: 'var(--cds-interactive-01)', fontFamily: 'monospace', fontWeight: 700 }}>0{i + 1}</span>
                  <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* KPI Section */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)' }}>
          <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-05)' }}>VARIANCE_RATE_METRIC</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--cds-spacing-04)' }}>
            <h4 style={{ fontSize: '3rem', fontWeight: 700, fontFamily: 'monospace', color: overallLateRate > 10 ? 'var(--cds-support-error)' : 'var(--cds-text-primary)', lineHeight: 1 }}>
              {overallLateRate}%
            </h4>
            <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: overallLateRate > 10 ? 'var(--cds-support-error)' : 'var(--cds-support-success)', textTransform: 'uppercase', marginBottom: '6px' }}>
              {overallLateRate > 10 ? '[ HIGH_VARIANCE ]' : '[ OPTIMAL ]'}
            </span>
          </div>
        </div>

        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)' }}>
          <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-05)' }}>ACTIVE_NODE_CAPACITY</p>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--cds-spacing-04)' }}>
            <h4 style={{ fontSize: '3rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', lineHeight: 1 }}>
              {employees.filter(e => e.status === 'Active').length}
            </h4>
            <span style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', marginBottom: '6px' }}>nodes</span>
          </div>
        </div>

        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-interactive-01)', background: 'rgba(79, 70, 229, 0.05)' }}>
          <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-05)' }}>RESILIENCE_VECTOR</p>
          <p style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--cds-text-primary)', lineHeight: 1.5 }}>
            {riskAssessment?.message || 'CALCULATING_PREDICTIVE_READINESS...'}
          </p>
        </div>
      </div>

      {/* Chart & Watchlist */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--cds-spacing-05)' }}>
        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)' }}>
          <div style={{ marginBottom: 'var(--cds-spacing-07)' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>{t('punctualityTrend')}</h3>
            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>INTEGRITY_BASELINE_14D_WINDOW</p>
          </div>

          <div style={{ height: '400px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={punctualityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--cds-interactive-01)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--cds-interactive-01)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cds-border-subtle)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10, fontFamily: 'monospace' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10, fontFamily: 'monospace' }} domain={[0, 100]} />
                <Tooltip 
                  contentStyle={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', borderRadius: '0', fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--cds-text-primary)' }} 
                  itemStyle={{ color: 'var(--cds-interactive-01)' }}
                />
                <Area type="monotone" dataKey="rate" stroke="var(--cds-interactive-01)" strokeWidth={2} fillOpacity={1} fill="url(#colorRate)" animationDuration={1000} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-06)', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
            <span style={{ width: '8px', height: '8px', background: 'var(--cds-support-error)', borderRadius: '50%' }}></span>
            {t('topLateness')}
          </h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)', flex: 1 }}>
            {latenessWatchlist.map((user, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--cds-spacing-04)', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
                <div>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{user.name}</p>
                  <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: '2px' }}>AVG_T: {user.avgCheckIn}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-support-error)' }}>{user.count}</span>
                  <p style={{ fontSize: '0.5rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>FLAGS</p>
                </div>
              </div>
            ))}
            {latenessWatchlist.length === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.5 }}>
                <span style={{ fontSize: '1.5rem', marginBottom: 'var(--cds-spacing-03)' }}>🛡️</span>
                <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', textTransform: 'uppercase' }}>SYS_INTEGRITY_100%</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Insight Banner */}
      <div style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-07)', display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-07)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
          <h4 style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('operationalIntelligence')}</h4>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Automated Workforce Calibration</h3>
          <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', lineHeight: 1.6 }}>
            Our neural engine predicts a potential 22% dip in service availability for next quarter. Recommended protocol: Stagger support team leave cycles to maintain baseline operation velocity.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--cds-spacing-05)', alignItems: 'center', justifyContent: 'flex-end' }}>
          <div style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', textAlign: 'center', minWidth: '120px' }}>
            <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-02)' }}>AVAILABILITY</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>94.2%</p>
          </div>
          <div style={{ padding: 'var(--cds-spacing-05)', background: 'var(--cds-background)', border: '1px solid var(--cds-interactive-01)', textAlign: 'center', minWidth: '120px' }}>
            <p style={{ fontSize: '0.625rem', fontFamily: 'monospace', color: 'var(--cds-interactive-01)', marginBottom: 'var(--cds-spacing-02)' }}>DRIFT_RISK</p>
            <p style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>LOW</p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default AiInsights;
