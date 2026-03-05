import React, { useState, useEffect } from 'react';
import { User, ProfitBonusPool, EmployeeBonusAllocation, Employee } from '../types/types.ts';
import { dbService } from '../services/dbService.ts';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationSystem.tsx';

interface ProfitSharingViewProps {
    user: User;
    compactMode?: boolean;
}

const ProfitSharingView: React.FC<ProfitSharingViewProps> = ({ user, compactMode }) => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [loading, setLoading] = useState(true);

    // Data State
    const [pools, setPools] = useState<ProfitBonusPool[]>([]);
    const [activePoolAllocations, setActivePoolAllocations] = useState<EmployeeBonusAllocation[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);

    // Form State (Finance)
    const [periodName, setPeriodName] = useState('');
    const [totalProfit, setTotalProfit] = useState<number | ''>('');
    const [poolPct, setPoolPct] = useState<number | ''>('');
    const [distMethod, setDistMethod] = useState<'EQUAL_SPLIT' | 'PRO_RATA_SALARY'>('EQUAL_SPLIT');
    const [cutoffDate, setCutoffDate] = useState('');

    // Selected Pool Context
    const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
        // Default semi-annual setup
        const date = new Date();
        const isFirstHalf = date.getMonth() < 6;
        setPeriodName(`${date.getFullYear()}-${isFirstHalf ? 'H1' : 'H2'}`);

        // Default cutoff to end of period
        if (isFirstHalf) {
            setCutoffDate(`${date.getFullYear()}-06-30`);
        } else {
            setCutoffDate(`${date.getFullYear()}-12-31`);
        }
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const p = await dbService.getProfitBonusPools();
            setPools(p);
            const emps = await dbService.getEmployees();
            setEmployees(emps);
        } catch (err: any) {
            notify('Error loading profit sharing data', err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectPool = async (id: string) => {
        setSelectedPoolId(id);
        try {
            const allocs = await dbService.getEmployeeBonusAllocations(id);
            setActivePoolAllocations(allocs);
        } catch (err) {
            console.error(err);
        }
    };

    // 1. Finance Initiates Proposal
    const handleProposePool = async () => {
        if (!periodName || !totalProfit || !poolPct || !cutoffDate) {
            notify('Validation Error', 'Please fill in all profit pool parameters.', 'error');
            return;
        }

        const approvedPoolAmount = (Number(totalProfit) * Number(poolPct)) / 100;

        try {
            await dbService.createProfitBonusPool({
                periodName,
                totalNetProfit: Number(totalProfit),
                recommendedPoolPct: Number(poolPct),
                approvedPoolAmount,
                distributionMethod: distMethod,
                eligibilityCutoffDate: cutoffDate,
                createdBy: user.id
            });
            notify('Success', 'Profit Bonus Pool Proposed successfully!', 'success');

            // Reset form
            setTotalProfit('');
            setPoolPct('');
            fetchData();
        } catch (err: any) {
            notify('Submission Error', err.message, 'error');
        }
    };

    // 2. Executive Approval
    const handleExecutiveApproval = async (poolId: string) => {
        try {
            // Moves it to EXECUTIVE_APPROVED and triggers GL Accrual Journal Entry
            await dbService.updateProfitBonusPoolStatus(poolId, 'EXECUTIVE_APPROVED', user.id);
            notify('Financial Approval Granted', 'Accrual GL generated successfully (210500 CR / 510400 DR)', 'success');
            fetchData();
        } catch (err: any) {
            notify('Approval Error', err.message, 'error');
        }
    };

    // 3. HR Runs the Distribution Engine
    const handleRunDistribution = async (pool: ProfitBonusPool) => {
        // Filter Eligibles
        const cutoffDateObj = new Date(pool.eligibilityCutoffDate);
        const eligibleEmps = employees.filter(e => {
            if (e.status !== 'Active') return false; // Must be active
            if (!e.joinDate) return false;
            const jDate = new Date(e.joinDate);
            return jDate <= cutoffDateObj;
        });

        if (eligibleEmps.length === 0) {
            notify('Error', 'No eligible employees found for this cut-off run.', 'error');
            return;
        }

        const allocations: Omit<EmployeeBonusAllocation, 'id' | 'createdAt' | 'isPaid'>[] = [];
        const totalPoolAmt = pool.approvedPoolAmount;

        if (pool.distributionMethod === 'EQUAL_SPLIT') {
            const amtPerHead = totalPoolAmt / eligibleEmps.length;
            eligibleEmps.forEach(e => {
                allocations.push({
                    poolId: pool.id,
                    employeeId: e.id,
                    allocatedAmount: Number(amtPerHead.toFixed(3))
                });
            });
        } else if (pool.distributionMethod === 'PRO_RATA_SALARY') {
            const totalEligiblePayroll = eligibleEmps.reduce((sum, e) => sum + (e.salary || 0), 0);

            if (totalEligiblePayroll === 0) {
                notify('Error', 'Eligible Payroll sum is 0, cannot divide.', 'error');
                return;
            }

            eligibleEmps.forEach(e => {
                const weight = (e.salary || 0) / totalEligiblePayroll;
                const amt = totalPoolAmt * weight;
                allocations.push({
                    poolId: pool.id,
                    employeeId: e.id,
                    allocatedAmount: Number(amt.toFixed(3))
                });
            });
        }

        // Validate total distributed hasn't wildly exceeded pool due to rounding
        const valSum = allocations.reduce((sum, a) => sum + a.allocatedAmount, 0);
        if (valSum > totalPoolAmt + 1) { // 1 kwd buffer for massive rounding
            notify('Auditor Error', 'Distribution exceeds pool cap. Please run manually.', 'error');
            return;
        }

        try {
            await dbService.createEmployeeBonusAllocations(allocations, pool.id);
            notify('Distribution Complete', `${eligibleEmps.length} records pushed to Variable Compensation.`, 'success');
            fetchData();
            handleSelectPool(pool.id); // View the results immediately
        } catch (err: any) {
            notify('Distribution Error', err.message, 'error');
        }
    };

    if (loading) return <div className="p-10 text-center flex items-center justify-center">Loading...</div>;
    const isExecutive = user.role === 'Executive' || user.role === 'Admin';
    const isFinanceOrHR = ['HR', 'HR Manager', 'Payroll Manager', 'Admin'].includes(user.role);

    return (
        <div className={`${compactMode ? 'p-4 space-y-4' : 'p-8 space-y-8'} animate-fade-in text-start pb-20`}>
            {/* Header section... */}
            <div className={`flex flex-col md:flex-row justify-between items-center bg-slate-900 ${compactMode ? 'p-6' : 'p-10'} rounded-[32px] border border-slate-800 shadow-2xl relative overflow-hidden group`}>
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
                <div className="relative z-10">
                    <h2 className={`${compactMode ? 'text-xl' : 'text-3xl'} font-black text-white tracking-tight flex items-center gap-3`}>
                        <span className={compactMode ? 'text-2xl' : 'text-4xl'}>💰</span> Profit Sharing & Distributions
                    </h2>
                    <p className={`font-bold text-slate-400 mt-2 uppercase ${compactMode ? 'text-[10px]' : 'text-xs'} tracking-[0.2em]`}>Corporate Stewardship & Reward Index</p>
                </div>
                <div className="relative z-10 flex gap-4">
                    <div className={`${compactMode ? 'p-3' : 'p-5'} bg-white/5 rounded-2xl border border-white/10 backdrop-blur-md`}>
                        <p className={`text-indigo-300 font-extrabold uppercase ${compactMode ? 'text-[8px]' : 'text-[10px]'} tracking-widest mb-1`}>Current Cycle</p>
                        <p className={`text-white font-black ${compactMode ? 'text-sm' : 'text-xl'}`}>{periodName}</p>
                    </div>
                </div>
            </div>

            {/* Finance Input Panel */}
            {(['Admin', 'HR Manager', 'Executive'].includes(user.role)) && (
                <div className={`bg-white ${compactMode ? 'p-5' : 'p-10'} rounded-[32px] border border-slate-200 shadow-xl relative overflow-hidden`}>
                    <div className={`absolute top-0 right-0 ${compactMode ? 'p-4 text-3xl' : 'p-8 text-5xl'} opacity-[0.03] pointer-events-none`}>🏦</div>
                    <h3 className={`${compactMode ? 'text-sm' : 'text-lg'} font-black text-slate-900 ${compactMode ? 'mb-4' : 'mb-6'} uppercase tracking-widest text-indigo-600`}>Finance Recommendation Box</h3>

                    <div className={`grid grid-cols-1 md:grid-cols-5 ${compactMode ? 'gap-3' : 'gap-6'}`}>
                        <div className="md:col-span-1">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Period Mark</label>
                            <input type="text" className={`w-full ${compactMode ? 'px-3 py-1.5 text-xs' : 'px-4 py-3'} bg-slate-50 border border-slate-200 rounded-xl font-mono text-center font-bold text-slate-700`} value={periodName} onChange={e => setPeriodName(e.target.value)} />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Net Profit (KWD)</label>
                            <input type="number" className={`w-full ${compactMode ? 'px-3 py-1.5 text-xs' : 'px-4 py-3'} bg-emerald-50/50 border border-emerald-200 rounded-xl font-bold text-emerald-700 text-right`} placeholder="0.000" value={totalProfit} onChange={e => setTotalProfit(Number(e.target.value))} />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Bonus Pool %</label>
                            <input type="number" className={`w-full ${compactMode ? 'px-3 py-1.5 text-xs' : 'px-4 py-3'} bg-slate-50 border border-slate-200 rounded-xl text-center font-bold`} min="0" max="100" placeholder="%" value={poolPct} onChange={e => setPoolPct(Number(e.target.value))} />
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Methodology</label>
                            <select className={`w-full ${compactMode ? 'px-3 py-1.5 text-xs' : 'px-4 py-3'} bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700`} value={distMethod} onChange={e => setDistMethod(e.target.value as any)}>
                                <option value="EQUAL_SPLIT">Equal Split</option>
                                <option value="PRO_RATA_SALARY">Pro-Rata by Salary</option>
                            </select>
                        </div>
                        <div className="md:col-span-1">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Eligibility Cut-Off</label>
                            <input type="date" className={`w-full ${compactMode ? 'px-3 py-1.5 text-xs' : 'px-4 py-3'} bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700`} value={cutoffDate} onChange={e => setCutoffDate(e.target.value)} />
                        </div>
                    </div>

                    <div className="mt-8 flex justify-between items-end border-t border-slate-200 pt-6">
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recommended Bonus Pool Target</p>
                            <p className="text-3xl font-black text-slate-900 mt-1">
                                {totalProfit && poolPct ? ((Number(totalProfit) * Number(poolPct)) / 100).toLocaleString() : '0.000'} <span className="text-xl text-slate-300">KWD</span>
                            </p>
                        </div>
                        <button onClick={handleProposePool} className="px-8 py-4 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20 active:scale-95">
                            Propose to Executives
                        </button>
                    </div>
                </div>
            )}

            {/* Pools Grid */}
            <h3 className={`${compactMode ? 'text-lg mt-6' : 'text-xl mt-12'} font-black text-slate-800 mb-4`}>Bonus Cycles Registry</h3>
            <div className={`grid grid-cols-1 lg:grid-cols-2 ${compactMode ? 'gap-4' : 'gap-8'}`}>
                {pools.map(pool => (
                    <div key={pool.id} className={`${compactMode ? 'p-5' : 'p-8'} rounded-[32px] border transition-all cursor-pointer group ${selectedPoolId === pool.id ? 'bg-indigo-600 border-indigo-500 shadow-xl shadow-indigo-600/20 text-white' : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg'}`} onClick={() => handleSelectPool(pool.id)}>
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h4 className={`text-2xl font-black font-mono tracking-tighter ${selectedPoolId === pool.id ? 'text-white' : 'text-slate-900'}`}>{pool.periodName} Profit Run</h4>
                                <p className={`text-xs mt-1 font-bold ${selectedPoolId === pool.id ? 'text-indigo-200' : 'text-slate-400'}`}>Initiated by: {pool.creatorName || 'Finance'}</p>
                            </div>
                            <div className={`px-4 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase ${selectedPoolId === pool.id ? 'bg-white/20 text-white' : pool.status === 'EXECUTIVE_APPROVED' ? 'bg-indigo-50 text-indigo-600' : pool.status === 'HR_PROCESSED' ? 'bg-blue-50 text-blue-500' : 'bg-slate-100 text-slate-500'}`}>
                                {pool.status.replace(/_/g, ' ')}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${selectedPoolId === pool.id ? 'text-indigo-300' : 'text-slate-400'}`}>Reported Gross Net</p>
                                <p className="text-lg font-black">{pool.totalNetProfit.toLocaleString()} <span className="text-xs">KWD</span></p>
                            </div>
                            <div>
                                <p className={`text-[10px] font-black uppercase tracking-widest ${selectedPoolId === pool.id ? 'text-indigo-300' : 'text-slate-400'}`}>Approved Target Pool</p>
                                <p className="text-lg font-black">{pool.approvedPoolAmount.toLocaleString()} <span className="text-xs">KWD</span> <span className="text-[10px] text-emerald-400">({pool.recommendedPoolPct}%)</span></p>
                            </div>
                        </div>

                        {/* Action Buttons purely based on state & role */}
                        <div className="pt-6 border-t border-white/10 flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                            {pool.status === 'DRAFT' && ['Executive', 'Admin'].includes(user.role) && (
                                <button onClick={() => handleExecutiveApproval(pool.id)} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedPoolId === pool.id ? 'bg-white text-indigo-600 hover:bg-slate-100' : 'bg-slate-900 text-white hover:bg-indigo-600'}`}>
                                    Sign & Accrue
                                </button> // Signs it, creates 210500 vs 510400 entries
                            )}
                            {pool.status === 'EXECUTIVE_APPROVED' && ['HR', 'HR Manager', 'Admin'].includes(user.role) && (
                                <button onClick={() => handleRunDistribution(pool)} className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${selectedPoolId === pool.id ? 'bg-white text-indigo-600 hover:bg-slate-100' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
                                    Run Distribution Engine
                                </button>
                            )}
                            {pool.status === 'HR_PROCESSED' && (
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${selectedPoolId === pool.id ? 'text-emerald-300' : 'text-emerald-600'}`}>
                                        {pool.totalDistributed.toLocaleString()} KWD successfully injected into VarComp
                                    </span>
                                </div>
                            )}

                            <div className="text-right">
                                <p className={`text-[9px] font-black uppercase tracking-widest ${selectedPoolId === pool.id ? 'text-indigo-300' : 'text-slate-400'}`}>Distribution Standard</p>
                                <p className={`text-xs font-bold ${selectedPoolId === pool.id ? 'text-white' : 'text-slate-700'}`}>{pool.distributionMethod.replace('_', ' ')}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Selected Pool Allocations Viewer */}
            {selectedPoolId && activePoolAllocations.length > 0 && (
                <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm mt-8 animate-fade-in">
                    <div className="flex justify-between items-end mb-8">
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">Distribution Audit Sub-Ledger</h3>
                            <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">
                                {activePoolAllocations.length} Evaluated Records
                            </p>
                        </div>
                        <div className="text-right border border-emerald-100 bg-emerald-50 rounded-xl px-6 py-4">
                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Total Payout Booked</p>
                            <p className="text-2xl font-black text-emerald-700">{activePoolAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0).toLocaleString()} <span className="text-sm">KWD</span></p>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-y border-slate-100">
                                    <th className="p-4 rounded-tl-xl px-6">Empl. Record</th>
                                    <th className="p-4 px-6">Department</th>
                                    <th className="p-4 px-6">Award Date</th>
                                    <th className="p-4 px-6 text-right">Granted Value (KWD)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {activePoolAllocations.map(a => (
                                    <tr key={a.id} className="hover:bg-slate-50">
                                        <td className="p-4 px-6">
                                            <p className="font-bold text-slate-900">{a.employeeName}</p>
                                        </td>
                                        <td className="p-4 px-6">
                                            <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-md font-bold text-xs">{a.department}</span>
                                        </td>
                                        <td className="p-4 px-6 font-mono text-xs text-slate-500">
                                            {new Date(a.createdAt || '').toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="p-4 px-6 text-right">
                                            <span className="text-lg font-black text-slate-800">{a.allocatedAmount.toFixed(3)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

        </div>
    );
};

export default ProfitSharingView;
