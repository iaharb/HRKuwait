
import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { dbService } from '../services/dbService.ts';
import { Employee, DepartmentMetric, User, View } from '../types/types';
import { useTranslation } from 'react-i18next';

interface DashboardProps {
  user: User;
  onNavigate?: (view: View) => void;
  language?: 'en' | 'ar';
}

const Dashboard: React.FC<DashboardProps> = ({ user, onNavigate }) => {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [deptMetrics, setDeptMetrics] = useState<DepartmentMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState<{ type: string, latency?: number }>({ type: 'Testing' });
  const [showGuide, setShowGuide] = useState(!localStorage.getItem('guide_dashboard_seen'));

  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const test = await dbService.testConnection();
        setDbStatus({
          type: test.success ? (language === 'ar' ? 'مباشر' : 'Live') : (language === 'ar' ? 'تجريبي' : 'Mock'),
          latency: test.latency
        });

        const [empData, metricData, profileReqs, leaveReqs] = await Promise.all([
          dbService.getEmployees(),
          dbService.getDepartmentMetrics(),
          dbService.getProfileUpdateRequests(),
          dbService.getLeaveRequests({})
        ]);

        const pendingProfile = profileReqs.filter(r => r.status === 'PENDING').length;
        const pendingLeaves = leaveReqs.filter(r => r.status.toLowerCase().includes('pending')).length;
        setPendingCount(pendingProfile + pendingLeaves);

        if (user.role === 'Manager' && user.department) {
          const filteredEmps = empData.filter(e => e.department === user.department);
          const filteredMetrics = metricData.filter(m => m.name === user.department);
          setEmployees(filteredEmps);
          setDeptMetrics(filteredMetrics);
        } else {
          setEmployees(empData);
          setDeptMetrics(metricData);
        }
      } catch (err) {
        console.error("Dashboard Fetch failed", err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user, language]);

  const dismissGuide = () => {
    setShowGuide(false);
    localStorage.setItem('guide_dashboard_seen', 'true');
  };

  const calculateDaysRemaining = (expiryDate?: string) => {
    if (!expiryDate) return Infinity;
    const today = new Date();
    const expiry = new Date(expiryDate);
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const totalEmployees = employees.length;
  const kuwaitiCount = employees.filter(e => e.nationality === 'Kuwaiti').length;
  const kuwaitizationRatio = totalEmployees > 0 ? (kuwaitiCount / totalEmployees) * 100 : 0;
  const targetRatio = 30;

  const criticalExpiries = employees.filter(emp => {
    const cid = emp.civilIdExpiry ? calculateDaysRemaining(emp.civilIdExpiry) : Infinity;
    const pass = emp.passportExpiry ? calculateDaysRemaining(emp.passportExpiry) : Infinity;
    const izn = emp.iznAmalExpiry ? calculateDaysRemaining(emp.iznAmalExpiry) : Infinity;
    return cid <= 30 || pass <= 30 || izn <= 90;
  }).length;

  if (loading) {
    return (
      <div className="space-y-10 animate-pulse px-4">
        <div className="h-48 bg-white/50 rounded-3xl border border-slate-100"></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-white/50 rounded-3xl border border-slate-100"></div>)}
        </div>
      </div>
    );
  }

  const kpiItems = [
    { label: t('active'), val: employees.filter(e => e.status === 'Active').length, icon: '⚡', color: 'text-indigo-600', bg: 'bg-indigo-50', view: View.Directory },
    { label: t('onLeave'), val: employees.filter(e => e.status === 'On Leave').length, icon: '📅', color: 'text-amber-600', bg: 'bg-amber-50', view: View.Leaves },
    { label: t('nationalTalent'), val: kuwaitiCount, icon: '🇰🇼', color: 'text-emerald-600', bg: 'bg-emerald-50', view: View.Directory },
    { label: t('pendingDecisions'), val: pendingCount, icon: '📝', color: 'text-indigo-600', bg: 'bg-indigo-50', view: View.UserManagement },
    { label: t('systemAlerts'), val: criticalExpiries, icon: '⚠️', color: criticalExpiries > 0 ? 'text-rose-600' : 'text-slate-400', bg: criticalExpiries > 0 ? 'bg-rose-50' : 'bg-slate-50', view: View.Compliance },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
      {showGuide && (
        <div style={{ background: 'var(--cds-background-inverse)', padding: 'var(--cds-spacing-07)', color: 'var(--cds-text-inverse)', border: '1px solid var(--cds-border-subtle)', position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-07)' }}>
          <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', flexShrink: 0 }}>
            ✨
          </div>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'inherit', marginBottom: 'var(--cds-spacing-02)' }}>{t('guideDashboardTitle')}</h3>
            <p style={{ fontSize: '0.875rem', opacity: 0.8 }}>{t('guideDashboardDesc')}</p>
          </div>
          <button
            onClick={dismissGuide}
            className="cds--btn cds--btn--secondary cds--btn--sm"
          >
            {t('gotIt')}
          </button>
        </div>
      )}

      {/* Main KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
        {kpiItems.map((kpi, i) => (
          <button
            key={i}
            onClick={() => onNavigate?.(kpi.view)}
            className="cds--tile"
            style={{ 
              padding: 'var(--cds-spacing-05)', 
              textAlign: 'start', 
              border: '1px solid var(--cds-border-subtle)', 
              background: 'var(--cds-background)', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: 'var(--cds-spacing-05)',
              cursor: 'pointer',
              borderRadius: 0,
              minHeight: '130px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ width: '32px', height: '32px', background: 'var(--cds-layer-01)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem', border: '1px solid var(--cds-border-subtle)' }}>
                {kpi.icon}
              </div>
              <div style={{ textAlign: 'end' }}>
                 <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{kpi.label}</span>
                 {kpi.label === t('active') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-02)', justifyContent: 'flex-end', marginTop: 'var(--cds-spacing-01)' }}>
                       <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: dbStatus.type.includes('Live') || dbStatus.type.includes('مباشر') ? 'var(--cds-support-success)' : 'var(--cds-support-warning)' }}></div>
                       <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{dbStatus.type}</span>
                    </div>
                 )}
              </div>
            </div>

            <div style={{ marginTop: 'auto' }}>
              <h4 style={{ fontSize: '2rem', fontWeight: 400, color: 'var(--cds-text-primary)', margin: 0 }}>
                {kpi.val.toLocaleString(language === 'ar' ? 'ar-KW' : 'en-KW')}
              </h4>
              <span style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{t('members')}</span>
            </div>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 8fr) minmax(0, 4fr)', gap: 'var(--cds-spacing-05)' }}>
        {/* Analytics Section */}
        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', borderRadius: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--cds-spacing-07)' }}>
            <div style={{ width: '160px', height: '160px', flexShrink: 0, position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { value: kuwaitizationRatio },
                      { value: Math.max(0, 100 - kuwaitizationRatio) }
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={0}
                    startAngle={90}
                    endAngle={450}
                    dataKey="value"
                    stroke="none"
                    animationDuration={1500}
                  >
                    <Cell fill="var(--cds-interactive-01)" />
                    <Cell fill="var(--cds-layer-01)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }} dir="ltr">
                <span style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                   {kuwaitizationRatio.toFixed(0)}%
                </span>
                <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('kuwaitization')}</p>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: '250px' }}>
              <div style={{ marginBottom: 'var(--cds-spacing-05)' }}>
                <span className="cds--tag cds--tag--blue" style={{ fontSize: '0.625rem' }}>{t('pamCertified')}</span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: 'var(--cds-spacing-03)', marginBottom: 'var(--cds-spacing-02)' }}>{t('workforceBalance')}</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', lineHeight: 1.4 }}>{kuwaitizationRatio >= targetRatio ? t('hiringSuccess') : t('hiringNeeded')}</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-07)', paddingTop: 'var(--cds-spacing-05)', borderTop: '1px solid var(--cds-border-subtle)' }}>
                 <div>
                    <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-02)' }}>{t('nationalTalent')}</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 400 }}>{kuwaitiCount.toLocaleString(language === 'ar' ? 'ar-KW' : 'en-KW')}</p>
                    <div style={{ height: '4px', background: 'var(--cds-layer-01)', width: '100%', marginTop: 'var(--cds-spacing-03)' }}>
                       <div style={{ height: '100%', background: 'var(--cds-interactive-01)', width: `${(kuwaitiCount / totalEmployees) * 100}%`, transition: 'width 1s ease' }}></div>
                    </div>
                 </div>
                 <div>
                    <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-02)' }}>{t('expat')}</p>
                    <p style={{ fontSize: '1.5rem', fontWeight: 400 }}>{(totalEmployees - kuwaitiCount).toLocaleString(language === 'ar' ? 'ar-KW' : 'en-KW')}</p>
                    <div style={{ height: '4px', background: 'var(--cds-layer-01)', width: '100%', marginTop: 'var(--cds-spacing-03)' }}>
                       <div style={{ height: '100%', background: 'var(--cds-border-strong)', width: `${((totalEmployees - kuwaitiCount) / totalEmployees) * 100}%`, transition: 'width 1s ease' }}></div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Quick Access */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
          <div className="cds--tile" style={{ flex: 1, padding: 'var(--cds-spacing-05)', background: 'var(--cds-text-primary)', color: '#ffffff', borderRadius: 0, display: 'flex', flexDirection: 'column' }}>
             <h4 style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-interactive-01)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-04)' }}>{t('regulatoryHub')}</h4>
             <p style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: 'var(--cds-spacing-07)' }}>{t('dashboardDescription')}</p>
             <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                <button onClick={() => onNavigate?.(View.Compliance)} className="cds--btn cds--btn--ghost" style={{ width: '100%', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>{t('compliance')}</button>
                <button onClick={() => onNavigate?.(View.Payroll)} className="cds--btn cds--btn--primary" style={{ width: '100%' }}>{t('payroll')}</button>
             </div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <section className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', borderRadius: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--cds-spacing-07)' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--cds-spacing-02)' }}>{t('nationalizationTargets')}</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{t('nationalizationMetrics')}</p>
          </div>
          <div style={{ display: 'flex', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-03)', background: 'var(--cds-layer-01)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-02)' }}>
              <div style={{ width: '8px', height: '8px', background: 'var(--cds-interactive-01)' }}></div>
              <span style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase' }}>{t('kuwaiti')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-02)' }}>
              <div style={{ width: '8px', height: '8px', background: 'var(--cds-border-strong)' }}></div>
              <span style={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase' }}>{t('expat')}</span>
            </div>
          </div>
        </div>

        <div style={{ height: '300px', width: '100%' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deptMetrics} barGap={4}>
              <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--cds-border-subtle)" />
              <XAxis
                dataKey={language === 'ar' ? 'nameArabic' : 'name'}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10 }}
              />
              <Tooltip
                cursor={{ fill: 'var(--cds-layer-01)' }}
                contentStyle={{ background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', borderRadius: 0 }}
              />
              <Bar
                dataKey="kuwaitiCount"
                fill="var(--cds-interactive-01)"
                barSize={24}
              />
              <Bar
                dataKey="expatCount"
                fill="var(--cds-border-strong)"
                barSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
