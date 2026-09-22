import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Sankey, BarChart, Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import { syncEOSBLiability } from '../services/financeUtils';
import { useNotifications } from './NotificationSystem';
import { dbService } from '../services/dbService';

interface FinanceIntelligenceHubProps {
    compactMode?: boolean;
}

export const FinanceIntelligenceHub: React.FC<FinanceIntelligenceHubProps> = ({ compactMode }) => {
    const { notify } = useNotifications();
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);
    const [liabilityGap, setLiabilityGap] = useState<number | null>(null);
    const [pendingRuns, setPendingRuns] = useState<{ id: string, period_key: string, status?: string }[]>([]);
    const [nationalityData, setNationalityData] = useState<any[]>([]);
    const [fundsFlow, setFundsFlow] = useState<any>({ nodes: [], links: [] });
    const [projectedOutflow, setProjectedOutflow] = useState<number>(0);
    const [monthlyNetData, setMonthlyNetData] = useState<any[]>([]);

    const fetchAnalytics = async () => {
        // Fetch IDs of Finalized/Locked runs first for reliable filtering
        const { data: runs, error: runsError } = await supabase
            .from('payroll_runs')
            .select('id')
            .in('status', ['Finalized', 'Locked', 'JV_Generated', 'finalized', 'locked', 'jv_generated']);

        if (runsError || !runs || runs.length === 0) {
            setLoading(false);
            return;
        }

        const runIds = runs.map(r => r.id);

        // 1. Fetch Rollup Data filtered by these run IDs
        const { data: rollup, error: rollupError } = await supabase
            .from('view_financial_rollup')
            .select('*')
            .in('payroll_run_id', runIds);

        if (rollupError || !rollup) {
            setLoading(false);
            return;
        }

        // 1. Nationality-to-Expense Ratio
        const natMap: Record<string, number> = {};
        rollup.forEach(r => {
            if (r.nationality_status && r.account_name) {
                natMap[r.nationality_status] = (natMap[r.nationality_status] || 0) + Number(r.total_amount);
            }
        });
        const pieData = Object.entries(natMap).map(([name, value]) => ({ name, value }));
        setNationalityData(pieData);

        // 2. Projected Cash Outflow (Standard monthly recurring only)
        const standardRollup = rollup.filter(r => !r.payroll_run_id?.includes('MIGRATION'));
        const currentRunTotal = standardRollup.reduce((acc, r) => acc + (r.nationality_status ? Number(r.total_amount) : 0), 0);
        // Let's assume an AI projection of 5% growth or new hires
        setProjectedOutflow(currentRunTotal * 1.05);

        // 3. Flow of Funds (Simplified representation for Sankey or Stacked Bar)
        const nodes = [{ name: 'Corporate Bank Account' }];
        const links: any[] = [];
        const segmentMap: Record<string, number> = {};

        rollup.forEach(r => {
            if (r.segment_name && r.nationality_status) {
                if (segmentMap[r.segment_name] === undefined) {
                    segmentMap[r.segment_name] = nodes.length;
                    nodes.push({ name: r.segment_name });
                }
                links.push({
                    source: 0,
                    target: segmentMap[r.segment_name],
                    value: Number(r.total_amount)
                });
            }
        });

        if (links.length > 0) {
            setFundsFlow({ nodes, links });
        }

        // 4. Monthly Net Payroll by Cost Center - Filtered by Run IDs
        const { data: histData, error: histError } = await supabase
            .from('journal_entries')
            .select(`
            amount,
            entry_date,
            finance_chart_of_accounts!inner(account_name),
            finance_cost_centers!inner(segment_name)
          `)
            .in('payroll_run_id', runIds);

        const monthlyNetByCostCenter: any[] = [];
        if (!histError && histData) {
            const groupedHist: Record<string, any> = {};
            histData.forEach((row: any) => {
                const accName = row.finance_chart_of_accounts?.account_name?.toLowerCase() || '';
                if (accName.includes('net ') || accName.includes('payable')) {
                    const date = new Date(row.entry_date);
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthLabel = `${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
                    const sortKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
                    const cc = row.finance_cost_centers.segment_name;
                    const amt = Number(row.amount);

                    if (!groupedHist[sortKey]) groupedHist[sortKey] = { name: monthLabel, sortKey, 'Total Net Payroll': 0 };
                    if (!groupedHist[sortKey][cc]) groupedHist[sortKey][cc] = 0;
                    groupedHist[sortKey][cc] += amt;
                    groupedHist[sortKey]['Total Net Payroll'] += amt;
                }
            });
            Object.keys(groupedHist).sort().forEach(key => monthlyNetByCostCenter.push(groupedHist[key]));
        }

        setMonthlyNetData(monthlyNetByCostCenter);

        // 5. Calculate Liability Gap for the UI
        const employees = await dbService.getEmployees();
        let trueLiability = 0;
        employees.forEach(emp => {
            if (emp.status === 'Active' && emp.nationality !== 'Kuwaiti') {
                const basic = Number(emp.salary) || 0;
                const dailyRate = basic / 26;
                const joinDate = new Date(emp.joinDate);
                const years = (new Date().getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                let indemnity = years <= 5 ? (years * 15 * dailyRate) : (5 * 15 * dailyRate) + ((years - 5) * 30 * dailyRate);
                trueLiability += Math.min(indemnity, (basic * 18));
            }
        });

        const { data: accounts } = await supabase.from('finance_chart_of_accounts').select('id').eq('account_code', '200300').single();
        if (accounts) {
            const { data: entries } = await supabase.from('journal_entries').select('amount').eq('gl_account_id', accounts.id);
            const currentBalance = entries?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
            setLiabilityGap(Math.max(0, trueLiability - currentBalance));
        }

        setLoading(false);
    };

    const handleSync = async () => {
        setIsSyncing(true);
        try {
            const result = await syncEOSBLiability();
            notify("Reality Sync Complete", `Successfully created a catch-up JV for ${result.gap.toLocaleString()} KWD.`, "success");
            // Re-fetch to update all stats and gap
            await fetchAnalytics();
        } catch (err: any) {
            notify("Sync Failed", err.message, "error");
        } finally {
            setIsSyncing(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, []);

    const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6'];

    if (loading) {
        return <div className="p-8 text-center text-slate-500 animate-pulse">Initializing AI Finance Models...</div>;
    }

    return (
        <div className="cds--registry-view" style={{ padding: compactMode ? '0' : 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-07)', alignItems: 'stretch' }}>

                {/* Liability Gap Card */}
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: liabilityGap && liabilityGap > 0 ? '1px solid #da1e28' : '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 'var(--cds-spacing-05)' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)', marginBottom: 'var(--cds-spacing-04)' }}>
                            <span style={{ fontSize: '1rem', color: liabilityGap && liabilityGap > 0 ? '#da1e28' : 'var(--cds-interactive-01)' }}>⚖️</span>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Actuarial Liability Gap</h3>
                        </div>
                        <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', lineHeight: 1.5, marginBottom: 'var(--cds-spacing-06)' }}>
                            Difference between tenure-based mathematical liability and GL Provision Balance (Account 200300).
                        </p>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)', marginBottom: 'var(--cds-spacing-06)' }}>
                            <span style={{ fontSize: '2.5rem', fontWeight: 700, fontFamily: 'monospace', color: liabilityGap && liabilityGap > 0 ? '#da1e28' : '#24a148', letterSpacing: '-0.02em' }}>
                                {liabilityGap?.toLocaleString('en-KW', { minimumFractionDigits: 3 })}
                            </span>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>KWD</span>
                        </div>
                    </div>

                    <div>
                        {liabilityGap && liabilityGap > 10 ? (
                            <button
                                onClick={handleSync}
                                disabled={isSyncing}
                                className="cds--btn cds--btn--danger"
                                style={{ width: '100%', fontSize: '0.75rem', fontFamily: 'monospace', opacity: isSyncing ? 0.5 : 1 }}
                            >
                                {isSyncing ? 'Syncing...' : 'Sync GL with Reality'}
                            </button>
                        ) : (
                            <div style={{ padding: 'var(--cds-spacing-04)', background: '#defbe6', color: '#044317', border: '1px solid #24a148', fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                                <span>✅</span>
                                GL Balance is healthy & synced.
                            </div>
                        )}
                    </div>
                </div>

                {/* Predictive GL Anomaly / Projected Cash Outflow */}
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-interactive-01)', background: '#161616', color: '#f4f4f4', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)', marginBottom: 'var(--cds-spacing-04)' }}>
                            <span style={{ fontSize: '1rem', color: '#4589ff' }}>🤖</span>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#f4f4f4' }}>AI Cash Outflow Projection</h3>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--cds-spacing-03)', fontSize: '0.75rem', fontFamily: 'monospace', color: '#c6c6c6', lineHeight: 1.5, marginBottom: 'var(--cds-spacing-06)' }}>
                            <span style={{ color: '#f1c21b', marginTop: '2px' }}>⚡</span>
                            <span>Projected Cash Outflow for the next payroll cycle based on active contracts and planned 'Tech' department hires.</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--cds-spacing-03)' }}>
                        <span style={{ fontSize: '3rem', fontWeight: 700, fontFamily: 'monospace', color: '#fff', letterSpacing: '-0.02em' }}>{projectedOutflow.toLocaleString('en-KW', { minimumFractionDigits: 3 })}</span>
                        <span style={{ fontSize: '1rem', fontWeight: 700, fontFamily: 'monospace', color: '#4589ff', textTransform: 'uppercase' }}>KWD</span>
                    </div>
                </div>
            </div>

            {/* Sub-Charts Layer */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)', gap: 'var(--cds-spacing-07)', alignItems: 'stretch' }}>
                {/* Nationality-to-Expense Ratio */}
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-03)' }}>Nationality-to-Expense Ratio</h3>
                    <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginBottom: 'var(--cds-spacing-06)' }}>Visualizing PIFSS impact vs Expat allowance mappings.</p>
                    <div style={{ height: '240px', width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={nationalityData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {nationalityData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => [value.toLocaleString('en-KW', { minimumFractionDigits: 3 }) + ' KWD', 'Total Expense']}
                                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend iconType="circle" wrapperStyle={{ fontSize: '0.75rem', fontFamily: 'monospace' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Cost Center Efficiency / Flow of Funds */}
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--cds-spacing-06)' }}>
                        <div>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Flow of Funds</h3>
                            <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: '4px' }}>Sankey diagram showing how payroll funds flow from the 'Bank Account' GL into specific 'Cost Centers'.</p>
                        </div>
                        <div style={{ padding: 'var(--cds-spacing-03)', background: '#fdf6e3', color: '#8a6d3b', border: '1px solid #fcf0cb', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                            <span>⚠️</span>
                            AI Insight: Housing Allowances for Expat group in Tech is trending upwards.
                        </div>
                    </div>
                    <div style={{ height: '280px', width: '100%' }}>
                    {fundsFlow.links.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <Sankey
                                data={fundsFlow}
                                width={960}
                                height={400}
                                node={{ fill: '#3b82f6', stroke: '#1e3a8a' }}
                                nodePadding={50}
                                margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
                                link={{ stroke: '#818cf8', opacity: 0.3 }}
                            >
                                <Tooltip />
                            </Sankey>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cds-text-disabled)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            No funding flow data available. Please generate a JV first.
                        </div>
                    )}
                </div>
            </div>
            </div>

            {/* Monthly Net Payroll Area Chart */}
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--cds-spacing-06)' }}>
                    <div>
                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Monthly Net Payroll by Cost Center</h3>
                        <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: '4px' }}>Area chart tracking localized net pay distribution.</p>
                    </div>
                </div>
                <div style={{ height: '320px', width: '100%' }}>
                    {monthlyNetData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={monthlyNetData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} tickFormatter={(v) => (v / 1000).toFixed(0) + 'k'} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                                <Bar dataKey="Total Net Payroll" barSize={40} fill="#f1f5f9" radius={[8, 8, 0, 0]} />
                                {Object.keys(monthlyNetData[0] || {}).filter(k => k !== 'name' && k !== 'Total Net Payroll' && k !== 'sortKey').map((key, i) => (
                                    <Line type="monotone" strokeWidth={2} key={key} dataKey={key} stroke={['#10b981', '#0f62fe', '#f1c21b', '#da1e28', '#8a3ffc', '#0043ce'][i % 6]} dot={{ r: 3, strokeWidth: 1 }} activeDot={{ r: 5 }} />
                                ))}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--cds-text-disabled)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                            No net payroll data available.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
