import React, { useEffect, useState, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseClient';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { dbService } from '../services/dbService';

const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6', '#EC4899', '#06B6D4'];

export const ManagementDashboard: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [rollupData, setRollupData] = useState<any[]>([]);
    const [historicalData, setHistoricalData] = useState<any[]>([]);
    const [employees, setEmployees] = useState<any[]>([]);
    const [runIds, setRunIds] = useState<string[]>([]);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Guard: Supabase must be available for live data
                if (!supabase || !isSupabaseConfigured) {
                    setLoading(false);
                    return;
                }

                // 1. Fetch Finalized/Locked Runs
                const { data: runs, error: runsError } = await supabase
                    .from('payroll_runs')
                    .select('id, period_key, status')
                    .in('status', ['Finalized', 'Locked', 'JV_Generated', 'finalized', 'locked', 'jv_generated'])
                    .order('period_key', { ascending: true });

                if (runsError || !runs || runs.length === 0) {
                    setLoading(false);
                    return;
                }

                const ids = runs.map(r => r.id);
                setRunIds(ids);

                // 2. Fetch Rollup Data
                const { data: rollup, error: rollupError } = await supabase
                    .from('view_financial_rollup')
                    .select('*')
                    .in('payroll_run_id', ids);

                if (!rollupError && rollup) setRollupData(rollup);

                // 3. Fetch Historical Journal Entries
                const { data: entries, error: entriesError } = await supabase
                    .from('journal_entries')
                    .select(`
                        payroll_run_id,
                        amount,
                        entry_date,
                        entry_type,
                        payroll_item_type,
                        finance_chart_of_accounts!inner(account_name, account_code),
                        finance_cost_centers!inner(segment_name)
                    `)
                    .in('payroll_run_id', ids);

                if (!entriesError && entries) setHistoricalData(entries);

                // 4. Fetch Employees for True Liability Calculation
                const emps = await dbService.getEmployees();
                setEmployees(emps);

            } catch (err) {
                console.error("Management Dashboard Fetch Error:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // --- 1. Payroll Expense Distribution ---
    const expenseDistribution = useMemo(() => {
        const map: Record<string, number> = {};
        rollupData.forEach(r => {
            if (r.account_name && r.account_name.toLowerCase().includes('expense')) {
                map[r.account_name] = (map[r.account_name] || 0) + Number(r.total_amount);
            }
        });
        return Object.entries(map).map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [rollupData]);

    // --- 2. EOSB Liability Health (True Tenure-based Liability) ---
    const eosbMetrics = useMemo(() => {
        let provisionBalance = 0; // GL Account 200300 (CR)

        historicalData.forEach(e => {
            const code = e.finance_chart_of_accounts.account_code;
            if (code === '200300') provisionBalance += Number(e.amount);
        });

        // Calculate True Calculated Liability based on tenure for ALL employees
        let trueLiability = 0;
        employees.forEach(emp => {
            if (emp.status === 'Active' && emp.nationality !== 'Kuwaiti') {
                const basic = Number(emp.salary) || 0;
                const dailyRate = basic / 26; // Standard Kuwait Daily Rate
                const joinDate = new Date(emp.joinDate);
                const yearsService = (new Date().getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);

                let indemnity = 0;
                if (yearsService <= 5) {
                    indemnity = (yearsService * 15 * dailyRate);
                } else {
                    indemnity = (5 * 15 * dailyRate) + ((yearsService - 5) * 30 * dailyRate);
                }
                trueLiability += Math.min(indemnity, (basic * 18)); // Capped at 18 months
            }
        });

        return { provisionBalance, trueLiability };
    }, [historicalData, employees]);

    // --- 3. Statutory Burden (PIFSS) ---
    const pifssStatics = useMemo(() => {
        let employerContribution = 0; // 600700
        let totalBasicSalaries = 0;    // 600100

        historicalData.forEach(e => {
            const code = e.finance_chart_of_accounts.account_code;
            if (code === '600700') employerContribution += Number(e.amount);
            if (code === '600100') totalBasicSalaries += Number(e.amount);
        });

        const burdenRate = totalBasicSalaries > 0 ? (employerContribution / totalBasicSalaries) * 100 : 12.5; // Default 12.5% for Kuwait
        return { employerContribution, totalBasicSalaries, burdenRate };
    }, [historicalData]);

    // --- 4. MoM Variance Analysis ---
    const varianceData = useMemo(() => {
        const months: Record<string, any> = {};
        historicalData.forEach(e => {
            if (e.entry_type === 'DR') { // Expenses
                const date = new Date(e.entry_date);
                // Safe Month Extraction (Force UTC for consistency across servers)
                const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
                const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

                if (!months[monthKey]) {
                    months[monthKey] = {
                        name: monthLabel,
                        sortKey: monthKey,
                        total: 0,
                        sickLeave: 0,
                        annualLeave: 0
                    };
                }
                // Track specific volatility items using types, codes, and names for safety
                const pType = e.payroll_item_type;
                const code = e.finance_chart_of_accounts.account_code;
                const name = (e.finance_chart_of_accounts.account_name || '').toLowerCase();

                // If it's an expense account, include in total if entry type is DR (or if it's explicitly a leave payout)
                const isExpenseAccount = name.includes('expense');

                if (e.entry_type === 'DR' || isExpenseAccount) {
                    months[monthKey].total += Number(e.amount);

                    if (pType === 'sick_leave' || code === '600500' || name.includes('sick leave')) {
                        months[monthKey].sickLeave += Number(e.amount);
                    } else if (pType === 'annual_leave' || code === '600600' || name.includes('annual leave')) {
                        months[monthKey].annualLeave += Number(e.amount);
                    }
                }
            }
        });

        return Object.values(months)
            .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }, [historicalData]);

    if (loading) {
        return (
            <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)' }}>
                <div style={{ padding: 'var(--cds-spacing-10)', textAlign: 'center', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>
                    Loading Management Telemetry...
                </div>
            </div>
        );
    }

    if (runIds.length === 0) {
        const isOffline = !supabase || !isSupabaseConfigured;
        return (
            <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', animation: 'fade-in 0.5s ease', minHeight: '100%' }}>
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-10)', textAlign: 'center', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <span style={{ fontSize: '2rem', display: 'block', marginBottom: 'var(--cds-spacing-05)', color: isOffline ? '#fa4d56' : '#f1c21b' }}>{isOffline ? '🔌' : '📊'}</span>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                        {isOffline ? 'Database Offline — Mock Mode Active' : 'No Management Data Available'}
                    </h3>
                    <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: 'var(--cds-spacing-04)', maxWidth: '600px', marginInline: 'auto' }}>
                        {isOffline
                            ? 'Strategy Dashboard requires a live Supabase connection with finalized payroll runs and GL journal entries. Connect your database to unlock this view.'
                            : 'Finalize at least one payroll run and generate its Journal Voucher (JV) via Finance → JV Generator. The data will populate here automatically.'}
                    </p>
                    {!isOffline && (
                        <div style={{ marginTop: 'var(--cds-spacing-07)', display: 'inline-flex', alignItems: 'center', gap: 'var(--cds-spacing-04)', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', background: '#d0e2ff', border: '1px solid #4589ff', color: '#0043ce', fontSize: '0.875rem', fontWeight: 600, fontFamily: 'monospace' }}>
                            <span>📍</span>
                            Go to <strong>Finance → JV Generator</strong> to generate your first journal voucher
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>

            {/* --- Executive KPI Row --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--cds-spacing-06)' }}>
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>Total Labor Cost (YTD)</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                        <h4 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)' }}>
                            {varianceData.reduce((acc, m) => acc + m.total, 0).toLocaleString('en-KW', { minimumFractionDigits: 0 })}
                        </h4>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>KWD</span>
                    </div>
                </div>
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>EOSB Funding Ratio</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                        <h4 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: '#24a148' }}>
                            {eosbMetrics.trueLiability > 0 ? ((eosbMetrics.provisionBalance / eosbMetrics.trueLiability) * 100).toFixed(1) : '100.0'}%
                        </h4>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>Target: 100%</span>
                    </div>
                </div>
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>Statutory Burden Rate</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                        <h4 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: '#f1c21b' }}>{pifssStatics.burdenRate.toFixed(1)}%</h4>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>Employer PIFSS</span>
                    </div>
                </div>
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>Payroll Volatility</p>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                        <h4 style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: '#da1e28' }}>
                            {varianceData.length > 1 ?
                                (((varianceData[varianceData.length - 1].total - varianceData[varianceData.length - 2].total) / varianceData[varianceData.length - 2].total) * 100).toFixed(1)
                                : '0.0'}%
                        </h4>
                        <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>MoM Change</span>
                    </div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-07)' }}>

                {/* 1. Payroll Expense Distribution */}
                <section className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <div style={{ marginBottom: 'var(--cds-spacing-06)' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Payroll Expense Distribution</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '4px' }}>Composition of total compensation by account type.</p>
                    </div>
                    <div style={{ height: '320px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={expenseDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={110}
                                    paddingAngle={2}
                                    dataKey="value"
                                >
                                    {expenseDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{ borderRadius: '0', border: '1px solid var(--cds-border-strong)', background: 'var(--cds-layer-01)', fontFamily: 'monospace' }} formatter={(v: number) => v.toLocaleString() + ' KWD'} />
                                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* 2. Monthly Payroll Volatility */}
                <section className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <div style={{ marginBottom: 'var(--cds-spacing-06)' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Monthly Payroll Volatility</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '4px' }}>Tracking MoM budget vs actual disbursement spikes.</p>
                    </div>
                    <div style={{ height: '320px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={varianceData}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#0f62fe" stopOpacity={0.2} />
                                        <stop offset="95%" stopColor="#0f62fe" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cds-border-subtle)" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10, fontFamily: 'monospace' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10, fontFamily: 'monospace' }} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                                <Tooltip contentStyle={{ borderRadius: '0', border: '1px solid var(--cds-border-strong)', background: 'var(--cds-layer-01)', fontFamily: 'monospace' }} />
                                <Area type="monotone" dataKey="total" stroke="#0f62fe" strokeWidth={2} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* 3. Leave Utilization (Wellness Tracking) */}
                <section className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <div style={{ marginBottom: 'var(--cds-spacing-06)' }}>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Leave Utilization & Wellness</h3>
                        <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '4px' }}>Statistical monitoring of Sick vs Annual Leave expenses.</p>
                    </div>
                    <div style={{ height: '320px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={varianceData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--cds-border-subtle)" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10, fontFamily: 'monospace' }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--cds-text-secondary)', fontSize: 10, fontFamily: 'monospace' }} />
                                <Tooltip contentStyle={{ borderRadius: '0', border: '1px solid var(--cds-border-strong)', background: 'var(--cds-layer-01)', fontFamily: 'monospace' }} />
                                <Legend iconType="rect" wrapperStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                                <Bar dataKey="sickLeave" name="Sick Leave Cost" fill="#da1e28" barSize={32} />
                                <Bar dataKey="annualLeave" name="Annual Leave Cost" fill="#24a148" barSize={32} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* 4. Strategic Risk: EOSB Liability Cover */}
                <section className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-interactive-01)', background: '#161616', color: '#f4f4f4', overflow: 'hidden', position: 'relative' }}>
                    <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#4589ff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>EOSB Liability Coverage</h3>
                            <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: '#c6c6c6', marginTop: '4px' }}>Comparing Accrued Provision (200300) against Payout Trend.</p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-07)', paddingTop: 'var(--cds-spacing-04)' }}>
                            <div>
                                <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: '#8d8d8d', textTransform: 'uppercase', marginBottom: '4px' }}>Total Provision Balance</p>
                                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>{eosbMetrics.provisionBalance.toLocaleString()} <span style={{ fontSize: '0.875rem', color: '#c6c6c6' }}>KWD</span></p>
                            </div>
                            <div>
                                <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: '#8d8d8d', textTransform: 'uppercase', marginBottom: '4px' }}>True Liability Estimate</p>
                                <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: '#4589ff' }}>{eosbMetrics.trueLiability.toLocaleString()} <span style={{ fontSize: '0.875rem', color: '#c6c6c6' }}>KWD</span></p>
                            </div>
                        </div>

                        <div style={{ paddingTop: 'var(--cds-spacing-04)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: '#8d8d8d', textTransform: 'uppercase' }}>
                                <span>Risk Assessment: {eosbMetrics.trueLiability === 0 ? 'Optimal' : (eosbMetrics.provisionBalance / eosbMetrics.trueLiability) > 0.9 ? 'Optimal Coverage' : 'Underfunded'}</span>
                                <span>{eosbMetrics.trueLiability > 0 ? ((eosbMetrics.provisionBalance / eosbMetrics.trueLiability) * 100).toFixed(0) : '100'}% Cover</span>
                            </div>
                            <div style={{ height: '12px', background: 'rgba(255,255,255,0.1)' }}>
                                <div
                                    style={{ height: '100%', background: '#4589ff', transition: 'width 1s ease', width: `${Math.min(100, (eosbMetrics.trueLiability > 0 ? (eosbMetrics.provisionBalance / eosbMetrics.trueLiability) * 100 : 100))}%` }}
                                ></div>
                            </div>
                        </div>

                        <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#8d8d8d', fontStyle: 'italic', marginTop: 'var(--cds-spacing-03)' }}>
                            * Management Recommendation: Review "Provision for Indemnity" monthly to ensure alignment with tenure growth.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
};
