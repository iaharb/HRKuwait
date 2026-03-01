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
                        amount,
                        entry_date,
                        entry_type,
                        finance_chart_of_accounts!inner(account_name, account_code),
                        finance_cost_centers!inner(segment_name)
                    `)
                    .in('payroll_run_id', ids);

                if (!entriesError && entries) setHistoricalData(entries);

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

    // --- 2. EOSB Liability Health ---
    const eosbMetrics = useMemo(() => {
        let provisionBalance = 0; // 200300
        let currentExpense = 0;   // 600800

        historicalData.forEach(e => {
            const code = e.finance_chart_of_accounts.account_code;
            if (code === '200300') provisionBalance += Number(e.amount);
            if (code === '600800') currentExpense += Number(e.amount);
        });

        return { provisionBalance, currentExpense };
    }, [historicalData]);

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
                const monthKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
                const monthLabel = date.toLocaleDateString('default', { month: 'short', year: 'numeric' });

                if (!months[monthKey]) months[monthKey] = { name: monthLabel, sortKey: monthKey, total: 0 };
                months[monthKey].total += Number(e.amount);

                // Track specific volatility items
                const code = e.finance_chart_of_accounts.account_code;
                if (code === '600500') { // Sick Leave
                    months[monthKey].sickLeave = (months[monthKey].sickLeave || 0) + Number(e.amount);
                }
                if (code === '600600') { // Annual Leave
                    months[monthKey].annualLeave = (months[monthKey].annualLeave || 0) + Number(e.amount);
                }
            }
        });

        return Object.values(months).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }, [historicalData]);

    if (loading) {
        return (
            <div className="p-8 space-y-6 animate-pulse">
                <div className="h-40 bg-slate-100 rounded-3xl"></div>
                <div className="grid grid-cols-2 gap-6">
                    <div className="h-64 bg-slate-100 rounded-3xl"></div>
                    <div className="h-64 bg-slate-100 rounded-3xl"></div>
                </div>
            </div>
        );
    }

    if (runIds.length === 0) {
        const isOffline = !supabase || !isSupabaseConfigured;
        return (
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="p-12 text-center bg-white rounded-3xl border border-dashed border-slate-300">
                    <span className="text-4xl mb-4 block">{isOffline ? '🔌' : '📊'}</span>
                    <h3 className="text-lg font-bold text-slate-900">
                        {isOffline ? 'Database Offline — Mock Mode Active' : 'No Management Data Available'}
                    </h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
                        {isOffline
                            ? 'Strategy Dashboard requires a live Supabase connection with finalized payroll runs and GL journal entries. Connect your database to unlock this view.'
                            : 'Finalize at least one payroll run and generate its Journal Voucher (JV) via Finance → JV Generator. The data will populate here automatically.'}
                    </p>
                    {!isOffline && (
                        <div className="mt-8 inline-flex items-center gap-3 px-6 py-3 bg-indigo-50 border border-indigo-100 rounded-2xl text-indigo-700 text-sm font-bold">
                            <span>📍</span>
                            Go to <strong>Finance → JV Generator</strong> to generate your first journal voucher
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 pb-20">

            {/* --- Executive KPI Row --- */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Labor Cost (YTD)</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl font-black text-indigo-600">
                            {varianceData.reduce((acc, m) => acc + m.total, 0).toLocaleString('en-KW', { minimumFractionDigits: 0 })}
                        </h4>
                        <span className="text-xs font-bold text-slate-400">KWD</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">EOSB Funding Ratio</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl font-black text-emerald-600">
                            {((eosbMetrics.provisionBalance / (eosbMetrics.currentExpense || 1)) * 100).toFixed(1)}%
                        </h4>
                        <span className="text-xs font-bold text-slate-400">Target: 100%</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Statutory Burden Rate</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl font-black text-amber-600">{pifssStatics.burdenRate.toFixed(1)}%</h4>
                        <span className="text-xs font-bold text-slate-400">Employer PIFSS</span>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Payroll Volatility</p>
                    <div className="flex items-baseline gap-2">
                        <h4 className="text-3xl font-black text-rose-600">
                            {varianceData.length > 1 ?
                                (((varianceData[varianceData.length - 1].total - varianceData[varianceData.length - 2].total) / varianceData[varianceData.length - 2].total) * 100).toFixed(1)
                                : '0.0'}%
                        </h4>
                        <span className="text-xs font-bold text-slate-400">MoM Change</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* 1. Payroll Expense Distribution */}
                <section className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                    <div className="mb-6">
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">Payroll Expense Distribution</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Composition of total compensation by account type.</p>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={expenseDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {expenseDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={(v: number) => v.toLocaleString() + ' KWD'} />
                                <Legend layout="vertical" align="right" verticalAlign="middle" iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* 2. Monthly Payroll Volatility */}
                <section className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                    <div className="mb-6">
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">Monthly Payroll Volatility</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Tracking MoM budget vs actual disbursement spikes.</p>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={varianceData}>
                                <defs>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.1} />
                                        <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                                <Tooltip />
                                <Area type="monotone" dataKey="total" stroke="#4F46E5" strokeWidth={4} fillOpacity={1} fill="url(#colorTotal)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* 3. Leave Utilization (Wellness Tracking) */}
                <section className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                    <div className="mb-6">
                        <h3 className="text-lg font-black text-slate-900 tracking-tight">Leave Utilization & Wellness</h3>
                        <p className="text-xs text-slate-500 mt-0.5">Statistical monitoring of Sick vs Annual Leave expenses.</p>
                    </div>
                    <div className="h-80 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={varianceData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }} />
                                <Tooltip />
                                <Legend iconType="rect" />
                                <Bar dataKey="sickLeave" name="Sick Leave Cost" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="annualLeave" name="Annual Leave Cost" fill="#10B981" radius={[4, 4, 0, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </section>

                {/* 4. Strategic Risk: EOSB Liability Cover */}
                <section className="bg-slate-900 p-8 rounded-[32px] text-white overflow-hidden relative group shadow-2xl">
                    <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
                        <span className="text-[140px]">🏦</span>
                    </div>
                    <div className="relative z-10 space-y-6">
                        <div>
                            <h3 className="text-lg font-black tracking-tight text-indigo-400 uppercase tracking-widest">EOSB Liability Coverage</h3>
                            <p className="text-slate-400 text-sm font-medium mt-1">Comparing Accrued Provision (200300) against Payout Trend.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-8 pt-4">
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Provision Balance</p>
                                <p className="text-3xl font-black text-white">{eosbMetrics.provisionBalance.toLocaleString()} <span className="text-xs text-slate-400">KWD</span></p>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Fiscal Year Payout Exp</p>
                                <p className="text-3xl font-black text-rose-500">{eosbMetrics.currentExpense.toLocaleString()} <span className="text-xs text-slate-400">KWD</span></p>
                            </div>
                        </div>

                        <div className="space-y-2 pt-4">
                            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                <span>Risk Assessment: {eosbMetrics.currentExpense > 0 ? 'Optimal Coverage' : 'Awaiting Data'}</span>
                                <span>{((eosbMetrics.provisionBalance / (eosbMetrics.currentExpense + 1)) * 100).toFixed(0)}% Cover</span>
                            </div>
                            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-1000"
                                    style={{ width: `${Math.min(100, (eosbMetrics.provisionBalance / (eosbMetrics.currentExpense + 1)) * 100)}%` }}
                                ></div>
                            </div>
                        </div>

                        <p className="text-[11px] text-slate-500 font-medium italic">
                            * Management Recommendation: Review "Provision for Indemnity" monthly to ensure alignment with tenure growth.
                        </p>
                    </div>
                </section>
            </div>
        </div>
    );
};
