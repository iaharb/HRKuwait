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
        <div className="cds--registry-view" style={{ padding: compactMode ? '0' : 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
            {/* Header section... */}
            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-interactive-01)', background: '#161616', color: '#f4f4f4', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', '@media (min-width: 768px)': { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' } } as any}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: '#f4f4f4', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
                        <span style={{ color: '#4589ff' }}>🖩</span> Profit Sharing & Distributions
                    </h2>
                    <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#c6c6c6', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 'var(--cds-spacing-03)' }}>Corporate Stewardship & Reward Index</p>
                </div>
                <div>
                    <div style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-strong)', background: 'rgba(255,255,255,0.05)', display: 'inline-block' }}>
                        <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: '#4589ff', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Current Cycle</p>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: '#fff' }}>{periodName}</p>
                    </div>
                </div>
            </div>

            {/* Finance Input Panel */}
            {(['Admin', 'HR Manager', 'Executive'].includes(user.role)) && (
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Finance Recommendation Box</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--cds-spacing-05)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                            <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Period Mark</label>
                            <input type="text" style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)', fontFamily: 'monospace', textAlign: 'center' }} value={periodName} onChange={e => setPeriodName(e.target.value)} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                            <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Net Profit (KWD)</label>
                            <input type="number" style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-interactive-01)', fontFamily: 'monospace', textAlign: 'right', fontWeight: 700 }} placeholder="0.000" value={totalProfit} onChange={e => setTotalProfit(Number(e.target.value))} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                            <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Bonus Pool %</label>
                            <input type="number" style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)', fontFamily: 'monospace', textAlign: 'center' }} min="0" max="100" placeholder="%" value={poolPct} onChange={e => setPoolPct(Number(e.target.value))} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                            <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Methodology</label>
                            <select style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)' }} value={distMethod} onChange={e => setDistMethod(e.target.value as any)}>
                                <option value="EQUAL_SPLIT">Equal Split</option>
                                <option value="PRO_RATA_SALARY">Pro-Rata by Salary</option>
                            </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                            <label style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Eligibility Cut-Off</label>
                            <input type="date" style={{ padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)', color: 'var(--cds-text-primary)', fontFamily: 'monospace' }} value={cutoffDate} onChange={e => setCutoffDate(e.target.value)} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--cds-border-subtle)', paddingTop: 'var(--cds-spacing-05)', marginTop: 'var(--cds-spacing-05)' }}>
                        <div>
                            <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Recommended Bonus Pool Target</p>
                            <p style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>
                                {totalProfit && poolPct ? ((Number(totalProfit) * Number(poolPct)) / 100).toLocaleString() : '0.000'} <span style={{ fontSize: '1rem', color: 'var(--cds-text-secondary)' }}>KWD</span>
                            </p>
                        </div>
                        <button onClick={handleProposePool} className="cds--btn cds--btn--primary" style={{ fontFamily: 'monospace' }}>
                            Propose to Executives
                        </button>
                    </div>
                </div>
            )}

            {/* Pools Grid */}
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Bonus Cycles Registry</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 'var(--cds-spacing-06)' }}>
                {pools.map(pool => (
                    <div key={pool.id} className={`cds--tile ${selectedPoolId === pool.id ? 'cds--tile--is-selected' : ''}`} style={{ padding: '0', border: selectedPoolId === pool.id ? '1px solid var(--cds-interactive-01)' : '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', cursor: 'pointer', display: 'flex', flexDirection: 'column' }} onClick={() => handleSelectPool(pool.id)}>
                        <div style={{ padding: 'var(--cds-spacing-06)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h4 style={{ fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>{pool.periodName} Profit Run</h4>
                                    <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: '4px' }}>Initiated by: {pool.creatorName || 'Finance'}</p>
                                </div>
                                <div style={{ padding: '2px 8px', fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', background: pool.status === 'EXECUTIVE_APPROVED' ? '#d0e2ff' : pool.status === 'HR_PROCESSED' ? '#defbe6' : 'var(--cds-layer-active-01)', color: pool.status === 'EXECUTIVE_APPROVED' ? '#0043ce' : pool.status === 'HR_PROCESSED' ? '#044317' : 'var(--cds-text-primary)' }}>
                                    {pool.status.replace(/_/g, ' ')}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 'var(--cds-spacing-05)' }}>
                                <div>
                                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Reported Gross Net</p>
                                    <p style={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>{pool.totalNetProfit.toLocaleString()} <span style={{ fontSize: '0.75rem' }}>KWD</span></p>
                                </div>
                                <div>
                                    <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Approved Target Pool</p>
                                    <p style={{ fontSize: '1.125rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>{pool.approvedPoolAmount.toLocaleString()} <span style={{ fontSize: '0.75rem' }}>KWD</span> <span style={{ fontSize: '0.625rem', color: '#24a148', marginLeft: '4px' }}>({pool.recommendedPoolPct}%)</span></p>
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons purely based on state & role */}
                        <div style={{ padding: 'var(--cds-spacing-05)', borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                            {pool.status === 'DRAFT' && ['Executive', 'Admin'].includes(user.role) && (
                                <button onClick={() => handleExecutiveApproval(pool.id)} className="cds--btn cds--btn--tertiary" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    Sign & Accrue
                                </button>
                            )}
                            {pool.status === 'EXECUTIVE_APPROVED' && ['HR', 'HR Manager', 'Admin'].includes(user.role) && (
                                <button onClick={() => handleRunDistribution(pool)} className="cds--btn cds--btn--primary" style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                    Run Dist. Engine
                                </button> // Runs the logic to create variable pay entries
                            )}
                            {pool.status === 'HR_PROCESSED' && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                                    <span style={{ width: '8px', height: '8px', background: '#24a148', display: 'block' }}></span>
                                    <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: '#044317', textTransform: 'uppercase' }}>
                                        {pool.totalDistributed.toLocaleString()} KWD injected
                                    </span>
                                </div>
                            )}

                            <div style={{ textAlign: 'right' }}>
                                <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Distribution Standard</p>
                                <p style={{ fontSize: '0.75rem', fontWeight: 600, fontFamily: 'monospace', color: 'var(--cds-text-primary)' }}>{pool.distributionMethod.replace('_', ' ')}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Selected Pool Allocations Viewer */}
            {selectedPoolId && activePoolAllocations.length > 0 && (
                <div className="cds--tile" style={{ padding: '0', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', marginTop: 'var(--cds-spacing-07)', animation: 'fade-in 0.5s ease', overflow: 'hidden' }}>
                    <div style={{ padding: 'var(--cds-spacing-05)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-02)' }}>
                        <div>
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Distribution Audit Sub-Ledger</h3>
                            <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-secondary)', marginTop: '4px', textTransform: 'uppercase' }}>
                                {activePoolAllocations.length} Evaluated Records
                            </p>
                        </div>
                        <div style={{ border: '1px solid #24a148', background: '#defbe6', padding: 'var(--cds-spacing-04)' }}>
                            <p style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: '#044317', textTransform: 'uppercase', marginBottom: '4px' }}>Total Payout Booked</p>
                            <p style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'monospace', color: '#044317' }}>{activePoolAllocations.reduce((sum, a) => sum + a.allocatedAmount, 0).toLocaleString()} <span style={{ fontSize: '0.875rem' }}>KWD</span></p>
                        </div>
                    </div>

                    <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                        <thead style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                            <tr>
                                <th style={{ padding: 'var(--cds-spacing-04)' }}>Empl. Record</th>
                                <th style={{ padding: 'var(--cds-spacing-04)' }}>Department</th>
                                <th style={{ padding: 'var(--cds-spacing-04)' }}>Award Date</th>
                                <th style={{ padding: 'var(--cds-spacing-04)', textAlign: 'right' }}>Granted Value (KWD)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {activePoolAllocations.map((a, i) => (
                                <tr key={a.id} style={{ borderBottom: i < activePoolAllocations.length - 1 ? '1px solid var(--cds-border-subtle)' : 'none' }}>
                                    <td style={{ padding: 'var(--cds-spacing-04)', fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                                        {a.employeeName}
                                    </td>
                                    <td style={{ padding: 'var(--cds-spacing-04)' }}>
                                        <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', background: 'var(--cds-layer-active-01)', padding: '2px 8px' }}>{a.department}</span>
                                    </td>
                                    <td style={{ padding: 'var(--cds-spacing-04)', fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>
                                        {new Date(a.createdAt || '').toLocaleDateString('en-GB')}
                                    </td>
                                    <td style={{ padding: 'var(--cds-spacing-04)', fontSize: '1.25rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-text-primary)', textAlign: 'right' }}>
                                        {a.allocatedAmount.toFixed(3)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

        </div>
    );
};

export default ProfitSharingView;
