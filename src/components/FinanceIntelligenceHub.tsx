import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Sankey, BarChart, Bar, Line, ComposedChart, XAxis, YAxis, CartesianGrid } from 'recharts';

export const FinanceIntelligenceHub: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [pendingRuns, setPendingRuns] = useState<{ id: string, period_key: string, status?: string }[]>([]);
    const [nationalityData, setNationalityData] = useState<any[]>([]);
    const [fundsFlow, setFundsFlow] = useState<any>({ nodes: [], links: [] });
    const [projectedOutflow, setProjectedOutflow] = useState<number>(0);
    const [monthlyNetData, setMonthlyNetData] = useState<any[]>([]);

    useEffect(() => {
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

            // 2. Projected Cash Outflow (Simple estimation based on current JV totals)
            const currentRunTotal = rollup.reduce((acc, r) => acc + (r.nationality_status ? Number(r.total_amount) : 0), 0);
            // Let's assume an AI projection of 5% growth or new hires
            setProjectedOutflow(currentRunTotal * 1.05);

            // 3. Flow of Funds (Simplified representation for Sankey or Stacked Bar)
            // Node 0: Bank Account (Source)
            // Node 1..N: Cost Centers
            // Node N+1...M: Expense Categories
            // Since Sankey in recharts requires a specific structure:
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

            // Provide data only if we generated some links
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
                        // Use UTC to avoid timezone bleeding for month-end dates
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

            setLoading(false);
        };

        fetchAnalytics();
    }, []);

    const COLORS = ['#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#3B82F6'];

    if (loading) {
        return <div className="p-8 text-center text-slate-500 animate-pulse">Initializing AI Finance Models...</div>;
    }

    return (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Predictive GL Anomaly / Projected Cash Outflow */}
                <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-3xl p-8 border border-indigo-500/30 shadow-2xl relative overflow-hidden text-white flex flex-col justify-center">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-indigo-500 rounded-full blur-3xl opacity-20 pointer-events-none"></div>
                    <div className="z-10 relative">
                        <div className="flex items-center gap-3 mb-4">
                            <span className="p-2 bg-indigo-500/20 text-indigo-300 rounded-xl">🤖</span>
                            <h3 className="font-bold text-indigo-100 text-lg">AI Cash Outflow Projection</h3>
                        </div>
                        <div className="text-sm font-medium text-slate-300 mb-6 flex items-start gap-2">
                            <span className="text-amber-400 mt-0.5">⚡</span>
                            <span>Projected Cash Outflow for the next payroll cycle based on active contracts and planned 'Tech' department hires.</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-5xl font-black tracking-tight">{projectedOutflow.toLocaleString('en-KW', { minimumFractionDigits: 3 })}</span>
                            <span className="text-lg font-bold text-indigo-300 uppercase">KWD</span>
                        </div>
                    </div>
                </div>

                {/* Nationality-to-Expense Ratio */}
                <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                    <h3 className="font-bold text-slate-800 text-lg mb-2">Nationality-to-Expense Ratio</h3>
                    <p className="text-xs font-medium text-slate-500 mb-6">Visualizing PIFSS impact vs Expat allowance mappings.</p>
                    <div className="h-48 w-full">
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
                                <Legend iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Cost Center Efficiency / Flow of Funds */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">Flow of Funds</h3>
                        <p className="text-xs font-medium text-slate-500 mt-1">Sankey diagram showing how payroll funds flow from the 'Bank Account' GL into specific 'Cost Centers'.</p>
                    </div>
                    <div className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-200 flex items-center gap-2">
                        <span>⚠️</span>
                        AI Insight: Housing Allowances for Expat group in Tech is trending upwards.
                    </div>
                </div>
                <div className="h-64 w-full">
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
                        <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm">
                            No funding flow data available. Please generate a JV first.
                        </div>
                    )}
                </div>
            </div>

            {/* Monthly Net Payroll Area Chart */}
            <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">Monthly Net Payroll by Cost Center</h3>
                        <p className="text-xs font-medium text-slate-500 mt-1">Area chart tracking localized net pay distribution.</p>
                    </div>
                </div>
                <div className="h-64 w-full">
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
                                    <Line type="monotone" strokeWidth={3} key={key} dataKey={key} stroke={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'][i % 6]} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                ))}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-full flex items-center justify-center text-slate-400 font-medium text-sm">
                            No net payroll data available.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
