import React, { useState, useEffect } from 'react';
import { User, KPITemplate, EmployeeEvaluation, Employee } from '../types/types.ts';
import { dbService } from '../services/dbService.ts';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationSystem.tsx';
import { supabase } from '../services/supabaseClient.ts';

interface PerformanceViewProps {
    user: User;
    compactMode?: boolean;
}

const PerformanceView: React.FC<PerformanceViewProps> = ({ user, compactMode }) => {
    const { t } = useTranslation();
    const { notify } = useNotifications();
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [templates, setTemplates] = useState<KPITemplate[]>([]);
    const [evaluations, setEvaluations] = useState<EmployeeEvaluation[]>([]);
    const [selectedEmployee, setSelectedEmployee] = useState<string>('');
    const [selectedTemplate, setSelectedTemplate] = useState<string>('');
    const [kpiScores, setKpiScores] = useState<{ name: string, weight: number, score: number }[]>([]);
    const [quarter, setQuarter] = useState<string>('');
    const [activeTab, setActiveTab] = useState<'employee' | 'department' | 'company' | 'templates'>('employee');

    // For Executive / HR View
    const [pendingEvals, setPendingEvals] = useState<EmployeeEvaluation[]>([]);

    // Template Modal State
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<Partial<KPITemplate> | null>(null);
    const [isSavingTemplate, setIsSavingTemplate] = useState(false);

    // History Modal State
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [editingEvaluation, setEditingEvaluation] = useState<EmployeeEvaluation | null>(null);
    const [isSavingHistory, setIsSavingHistory] = useState(false);

    // Finance / Profit Sharing
    const [financeNetProfit, setFinanceNetProfit] = useState<number>(0);
    const [isUpdatingProfit, setIsUpdatingProfit] = useState(false);
    const [profitPools, setProfitPools] = useState<any[]>([]);

    useEffect(() => {
        fetchData();
        // Default to current quarter
        const date = new Date();
        const q = Math.ceil((date.getMonth() + 1) / 3);
        setQuarter(`${date.getFullYear()}-Q${q}`);
    }, [user]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [emps, tmpls, allEvals] = await Promise.all([
                dbService.getEmployees(),
                dbService.getKPITemplates(),
                dbService.getEmployeeEvaluations()
            ]);

            setTemplates(tmpls);

            if (user.role === 'Manager') {
                setEmployees(emps.filter(e => e.managerId === user.id));
                setEvaluations(allEvals.filter(e => e.evaluatorId === user.id));
            } else {
                setEmployees(emps);
                setEvaluations(allEvals);
            }

            // Approval queues for Exec/HR
            if (['Executive', 'Admin'].includes(user.role)) {
                setPendingEvals(allEvals.filter(e => e.status === 'PENDING_EXEC'));
            } else if (['HR', 'HR Manager'].includes(user.role)) {
                setPendingEvals(allEvals.filter(e => e.status === 'PENDING_HR'));
            }

        } catch (err: any) {
            notify('Error fetching data', err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const loadKpisForEmployee = (empId: string) => {
        if (!empId) {
            setKpiScores([]);
            return;
        }
        const emp = employees.find(e => e.id === empId);
        if (!emp) return;

        let assignedIds = emp.kpiTemplateIds || [];
        if (assignedIds.length === 0) {
            const defaultTmpl = templates.find(t => t.department === emp.department);
            if (defaultTmpl) assignedIds = [defaultTmpl.id];
        }

        const assignedTemplates = templates.filter(t => assignedIds.includes(t.id));
        if (assignedTemplates.length === 0) {
            setKpiScores([]);
            return;
        }

        // Combine all KPIs from all assigned templates
        const combined: { name: string, weight: number, score: number }[] = [];
        assignedTemplates.forEach(t => {
            t.kpis.forEach(k => {
                // Normalize weight based on number of templates so total sum is roughly 100
                combined.push({
                    name: `[${t.title}] ${k.name}`,
                    weight: Number(k.weight) / assignedTemplates.length,
                    score: 0
                });
            });
        });
        setKpiScores(combined);
    };

    const handleEmployeeSelect = (empId: string) => {
        setSelectedEmployee(empId);
        loadKpisForEmployee(empId);
    };

    const calculatePerformancePoints = (score: number) => {
        // Convert % to 1-5 point scale
        if (score >= 0.95) return 5;
        if (score >= 0.85) return 4;
        if (score >= 0.70) return 3;
        if (score >= 0.50) return 2;
        return 1;
    };

    const calculateTotalScore = () => {
        const total = kpiScores.reduce((sum, kpi) => sum + (kpi.weight * kpi.score), 0);
        return total / 10000;
    };

    const handleSubmitEvaluation = async () => {
        if (!selectedEmployee || kpiScores.length === 0) {
            notify('Validation Error', 'Please select an employee and wait for KPIs to load.', 'error');
            return;
        }

        const totalWeight = kpiScores.reduce((sum, kpi) => sum + Number(kpi.weight), 0);
        // Do not strictly check 100% since multiple templates might scale them uniquely, but we normalized them.
        // Actually since we normalized: weight = k.weight / templates.length. So total should be exactly 100%.
        if (totalWeight < 90 || totalWeight > 110) {
            notify('Validation Error', `Total KPI weights seem incorrect. Contact admin. Currently: ${totalWeight}%`, 'error');
            return;
        }

        const emp = employees.find(e => e.id === selectedEmployee);
        if (!emp) return;

        // Calculate Pro-Rata factor (Simplified: assume full quarter for now unless join date logic is strictly applied)
        // Actually, let's implement the logic.
        const qParts = quarter.split('-Q');
        const qYear = parseInt(qParts[0]);
        const qNum = parseInt(qParts[1]);

        // Quarter start/end
        const qStart = new Date(qYear, (qNum - 1) * 3, 1);
        const qEnd = new Date(qYear, qNum * 3, 0);
        const qTotalDays = Math.ceil((qEnd.getTime() - qStart.getTime()) / (1000 * 60 * 60 * 24));

        let proRataFactor = 1.0;
        if (emp.joinDate) {
            const joinDate = new Date(emp.joinDate);
            if (joinDate > qEnd) {
                notify('Validation Error', 'Employee joined after this quarter ended.', 'error');
                return;
            }
            if (joinDate > qStart && joinDate <= qEnd) {
                const employedDays = Math.ceil((qEnd.getTime() - joinDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                proRataFactor = employedDays / qTotalDays;
            }
        }

        const totalScore = calculateTotalScore();
        const scorePoint = calculatePerformancePoints(totalScore);
        
        // 1. Performance Bonus logic (Max 10% of salary per quarter)
        // Rating 5 = 10%, 4 = 8%, 3 = 6%, 2 = 4%, 1 = 2%
        const ratePerPoint = 0.02; // 2% per point
        const bonusPct = scorePoint * ratePerPoint;
        const calculatedKwd = (emp.salary * bonusPct) * proRataFactor;

        try {
            await dbService.submitEmployeeEvaluation({
                employeeId: selectedEmployee,
                evaluatorId: user.id,
                quarter,
                kpiScores,
                totalScore: Number(totalScore.toFixed(4)),
                proRataFactor,
                calculatedKwd: Number(calculatedKwd.toFixed(3)),
                status: 'PENDING_EXEC'
            });
            notify('Success', 'Evaluation submitted for executive review.', 'success');
            setSelectedEmployee('');
            setKpiScores([]);
            fetchData();
        } catch (error: any) {
            notify('Submission Error', error.message, 'error');
        }
    };

    const approveEvaluation = async (id: string, currentStatus: string) => {
        let nextStatus = '';
        if (currentStatus === 'PENDING_EXEC') nextStatus = 'PENDING_HR';
        if (currentStatus === 'PENDING_HR') nextStatus = 'APPROVED_FOR_PAYROLL';

        if (!nextStatus) return;

        try {
            await dbService.updateEvaluationStatus(id, nextStatus);
            notify('Success', `Evaluation advanced to ${nextStatus}`, 'success');
            fetchData();
        } catch (err: any) {
            notify('Approval Error', err.message, 'error');
        }
    };

    const handleEditTemplate = (tmpl: Partial<KPITemplate>) => {
        setEditingTemplate(tmpl);
        setIsTemplateModalOpen(true);
    };

    const handleSaveTemplate = async () => {
        if (!editingTemplate || !editingTemplate.title || !editingTemplate.kpis || editingTemplate.kpis.length === 0) {
            notify('Validation Error', 'Title and at least one KPI are required.', 'error');
            return;
        }

        const totalWeight = editingTemplate.kpis.reduce((sum, kpi) => sum + Number(kpi.weight), 0);
        if (totalWeight !== 100 && editingTemplate.kpis.length > 0) {
            notify('Warning', `Total KPI weight is ${totalWeight}%, it is recommended to be 100%.`, 'warning');
            // Allow saving anyway but warn
        }

        setIsSavingTemplate(true);
        try {
            if (editingTemplate.id) {
                // Update
                await dbService.updateKPITemplate(editingTemplate.id, {
                    title: editingTemplate.title,
                    department: editingTemplate.department || '',
                    roleName: editingTemplate.roleName || '',
                    kpis: editingTemplate.kpis
                });
                notify('Success', 'KPI Template updated inside registry.', 'success');
            } else {
                // Insert
                await dbService.addKPITemplate({
                    title: editingTemplate.title,
                    department: editingTemplate.department || '',
                    roleName: editingTemplate.roleName || '',
                    kpis: editingTemplate.kpis
                });
                notify('Success', 'New KPI Template created.', 'success');
            }
            setIsTemplateModalOpen(false);
            fetchData();
        } catch (err: any) {
            notify('Backend Error', err.message, 'error');
        } finally {
            setIsSavingTemplate(false);
        }
    };

    const handleEditHistory = (ev: EmployeeEvaluation) => {
        // Locked for normal managers if approved for payroll. 
        // Admins, Executives, and HR Managers can override if errors are found.
        const canOverride = ['Admin', 'Executive', 'HR Manager'].includes(user.role);
        if (ev.status === 'APPROVED_FOR_PAYROLL' && !canOverride) {
            notify('Access Denied', 'This evaluation is already locked for payroll processing. Contact HR to override.', 'error');
            return;
        }
        setEditingEvaluation({ ...ev });
        setIsHistoryModalOpen(true);
    };

    const handleSaveHistory = async () => {
        if (!editingEvaluation) return;

        setIsSavingHistory(true);
        try {
            // Recalculate totals
            const totalScore = editingEvaluation.kpiScores.reduce((sum, kpi) => sum + (kpi.weight * kpi.score), 0) / 10000;
            const emp = employees.find(e => e.id === editingEvaluation.employeeId);
            const salary = emp?.salary || 0;
            const calculatedKwd = (salary * totalScore) * editingEvaluation.proRataFactor;

            await dbService.updateEmployeeEvaluation(editingEvaluation.id, {
                kpiScores: editingEvaluation.kpiScores,
                totalScore: Number(totalScore.toFixed(4)),
                calculatedKwd: Number(calculatedKwd.toFixed(3)),
                status: 'PENDING_EXEC' // Reset to approval flow if edited
            });

            notify('Success', 'Historical evaluation updated and resent for signature.', 'success');
            setIsHistoryModalOpen(false);
            fetchData();
        } catch (err: any) {
            notify('Update Error', err.message, 'error');
        } finally {
            setIsSavingHistory(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.7s ease' }}>
            <header>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>{t('performance_evaluations') || 'Performance evaluations'}</h2>
                <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{quarter} Operational performance cycle.</p>
            </header>

            {/* Standardized Tabs */}
            <div className="cds--tabs">
                <ul className="cds--tabs__nav" role="tablist">
                    {[
                        { id: 'employee', label: 'INDIVIDUAL', roles: ['Admin', 'Manager', 'Employee', 'HR Manager'] },
                        { id: 'department', label: 'DEPARTMENT', roles: ['Admin', 'Manager', 'Executive', 'HR Manager'] },
                        { id: 'company', label: 'COMPANY', roles: ['Admin', 'Executive'] },
                        { id: 'templates', label: 'TEMPLATES', roles: ['Admin', 'HR Manager'] }
                    ].filter(tab => tab.roles.includes(user.role)).map(tab => (
                        <li 
                            key={tab.id}
                            className={`cds--tabs__nav-item ${activeTab === tab.id ? 'cds--tabs__nav-item--selected' : ''}`}
                            onClick={() => setActiveTab(tab.id as any)}
                        >
                            <button className="cds--tabs__nav-link" type="button">
                                {tab.label}
                            </button>
                        </li>
                    ))}
                </ul>
            </div>

            {activeTab === 'employee' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
                    {/* Creation Panel */}
                    {(['Manager', 'Admin', 'HR Manager'].includes(user.role)) && (
                        <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--cds-spacing-05)' }}>Initiate quality review</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--cds-spacing-05)', marginBottom: 'var(--cds-spacing-06)' }}>
                                <div>
                                    <label className="cds--label">Employee registry</label>
                                    <select className="cds--select-input" value={selectedEmployee} onChange={e => handleEmployeeSelect(e.target.value)}>
                                        <option value="">Select identity...</option>
                                        {employees.map(e => (
                                            <option key={e.id} value={e.id}>{e.name} — {e.department}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="cds--label">Review cycle</label>
                                    <input type="text" className="cds--text-input" value={quarter} onChange={e => setQuarter(e.target.value)} />
                                </div>
                            </div>

                            {kpiScores.length > 0 && (
                                <div style={{ background: 'var(--cds-layer-01)', padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)' }}>
                                    <h4 style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: 'var(--cds-spacing-04)' }}>Metric scoring matrix</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                        {kpiScores.map((kpi, idx) => (
                                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-05)', background: 'var(--cds-background)', padding: 'var(--cds-spacing-04) var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)' }}>
                                                <span style={{ flex: 1, fontSize: '0.875rem' }}>{kpi.name}</span>
                                                <span style={{ width: '80px', fontSize: '0.625rem', color: 'var(--cds-text-secondary)', fontWeight: 600 }}>WT: {kpi.weight}%</span>
                                                <div style={{ width: '120px', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                                                    <input 
                                                        type="number"
                                                        className="cds--text-input"
                                                        style={{ height: '32px', textAlign: 'center' }}
                                                        value={kpi.score === 0 ? '' : kpi.score}
                                                        onChange={e => {
                                                            const newScores = [...kpiScores];
                                                            newScores[idx].score = Number(e.target.value);
                                                            setKpiScores(newScores);
                                                        }}
                                                    />
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>%</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    <div style={{ marginTop: 'var(--cds-spacing-06)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid var(--cds-border-subtle)', paddingTop: 'var(--cds-spacing-05)' }}>
                                        <div>
                                            <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Calculated factor</p>
                                            <p style={{ fontSize: '2rem', fontWeight: 400, color: 'var(--cds-interactive-01)' }}>{(calculateTotalScore() * 100).toFixed(1)}%</p>
                                        </div>
                                        <button onClick={handleSubmitEvaluation} className="cds--btn cds--btn--primary">Submit registry evaluation</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Pending Sign-offs */}
                    {pendingEvals.length > 0 && (
                        <div className="cds--tile" style={{ border: '1px solid var(--cds-support-warning)', background: 'var(--cds-background)' }}>
                           <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
                               <div className="hub--status-glow" style={{ background: 'var(--cds-support-warning)' }}></div>
                               <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Awaiting executive signature</h3>
                           </div>
                           <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                               <thead>
                                   <tr>
                                       <th style={{ width: '180px' }}>Identity</th>
                                       <th style={{ width: '80px' }}>Cycle</th>
                                       <th>Metric Factor</th>
                                       <th>Pro-Rata</th>
                                       <th style={{ textAlign: 'right' }}>Calculated Bonus</th>
                                       <th style={{ textAlign: 'right' }}>Action</th>
                                   </tr>
                               </thead>
                               <tbody>
                                   {pendingEvals.map(ev => (
                                       <tr key={ev.id}>
                                           <td>
                                               <p style={{ fontWeight: 600 }}>{ev.employeeName}</p>
                                               <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>{ev.department}</p>
                                           </td>
                                           <td style={{ fontFamily: 'monospace' }}>{ev.quarter}</td>
                                           <td>
                                               <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-interactive-01)' }}>{(ev.totalScore * 100).toFixed(1)}%</span>
                                               <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>Rating: {calculatePerformancePoints(ev.totalScore)} / 5</p>
                                           </td>
                                           <td style={{ fontSize: '0.75rem' }}>{ev.proRataFactor.toFixed(2)}x</td>
                                           <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--cds-support-success)' }}>{ev.calculatedKwd.toLocaleString()} KWD</td>
                                           <td style={{ textAlign: 'right' }}>
                                               <button onClick={() => approveEvaluation(ev.id, ev.status)} className="cds--btn cds--btn--primary cds--btn--sm">
                                                   {user.role === 'Executive' ? 'Sign & Commit' : 'Audit & Advance'}
                                               </button>
                                           </td>
                                       </tr>
                                   ))}
                               </tbody>
                           </table>
                        </div>
                    )}

                    {/* Registry History */}
                    <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                        <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Historical evaluations</h3>
                        </div>
                        <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                           <thead>
                               <tr>
                                   <th>Identity</th>
                                   <th>Cycle</th>
                                   <th>Factor</th>
                                   <th>Value (KWD)</th>
                                   <th>Fulfillment Status</th>
                               </tr>
                           </thead>
                           <tbody>
                               {evaluations.map(ev => (
                                   <tr key={ev.id} onClick={() => handleEditHistory(ev)} style={{ cursor: 'pointer' }}>
                                       <td>{ev.employeeName}</td>
                                       <td style={{ fontFamily: 'monospace' }}>{ev.quarter}</td>
                                       <td style={{ fontWeight: 600 }}>{(ev.totalScore * 100).toFixed(1)}%</td>
                                       <td style={{ fontWeight: 600 }}>{ev.calculatedKwd.toLocaleString()}</td>
                                       <td>
                                           <span className={`cds--tag ${ev.status === 'APPROVED_FOR_PAYROLL' ? 'cds--tag--green' : 'cds--tag--blue'}`}>
                                               {ev.status.replace(/_/g, ' ')}
                                           </span>
                                       </td>
                                   </tr>
                               ))}
                               {evaluations.length === 0 && (
                                   <tr><td colSpan={5} style={{ textAlign: 'center', padding: 'var(--cds-spacing-08)', color: 'var(--cds-text-secondary)' }}>No registry entries found.</td></tr>
                               )}
                           </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'department' && (
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                    <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Sector operational health</h3>
                    </div>
                    <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                        <thead>
                            <tr>
                                <th>Operational Sector</th>
                                <th>Registry Count</th>
                                <th>Aggregated Factor</th>
                                <th>Health Status</th>
                                <th style={{ textAlign: 'right' }}>Certification</th>
                            </tr>
                        </thead>
                        <tbody>
                            {Array.from(new Set(evaluations.map(e => e.department).filter(Boolean))).map(dept => {
                                const deptEvals = evaluations.filter(e => e.department === dept && e.quarter === quarter);
                                if (deptEvals.length === 0) return null;
                                const avgScore = deptEvals.reduce((sum, e) => sum + e.totalScore, 0) / deptEvals.length;
                                return (
                                    <tr key={dept}>
                                        <td>{dept}</td>
                                        <td>{deptEvals.length} Identifiers</td>
                                        <td style={{ fontWeight: 600 }}>{(avgScore * 100).toFixed(1)}%</td>
                                        <td>
                                            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: avgScore >= 0.85 ? 'var(--cds-support-success)' : 'var(--cds-support-warning)' }}>
                                                {avgScore >= 0.85 ? 'Optimized' : avgScore >= 0.6 ? 'Stabilized' : 'Critical'}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right' }}>
                                            <button onClick={() => notify('Audit Success', `Sector ${dept} acknowledged.`, 'info')} className="cds--btn cds--btn--ghost cds--btn--sm">Acknowledge node</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'company' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-05)' }}>
                        <div className="hub--node" style={{ padding: 'var(--cds-spacing-06)', borderRadius: 0 }}>
                            <p style={{ fontSize: '0.625rem', color: 'var(--cds-interactive-01)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-03)' }}>Inference profitability engine</p>
                            <h4 style={{ fontSize: '0.875rem', marginBottom: 'var(--cds-spacing-05)' }}>Input quarterly net yield (KWD)</h4>
                            <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
                                <input 
                                    type="number" 
                                    className="cds--text-input hub--node" 
                                    style={{ flex: 1, fontSize: '1.5rem', padding: 'var(--cds-spacing-04)' }}
                                    value={financeNetProfit}
                                    onChange={e => setFinanceNetProfit(Number(e.target.value))}
                                />
                                <button className="cds--btn cds--btn--primary" style={{ height: 'auto' }}>Recalculate node shares</button>
                            </div>
                        </div>
                        <div className="cds--tile" style={{ border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                            <h4 style={{ fontSize: '0.75rem', fontWeight: 600, padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>Managerial profit attribution</h4>
                            <div style={{ height: '140px', overflowY: 'auto' }}>
                                {employees.filter(e => ['Manager', 'Executive'].includes(e.role)).map(mgr => (
                                    <div key={mgr.id} className="hub--data-row">
                                        <span>{mgr.name}</span>
                                        <span style={{ fontWeight: 600 }}>{(financeNetProfit * 0.05).toLocaleString()} KWD</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--cds-spacing-05)' }}>
                        {[
                            { label: 'Org-wide Factor', val: `${(evaluations.reduce((s, e) => s + e.totalScore, 0) / (evaluations.length || 1) * 100).toFixed(1)}%`, color: 'var(--cds-interactive-01)' },
                            { label: 'Total PE Load', val: `${evaluations.reduce((s, e) => s + e.calculatedKwd, 0).toLocaleString()} KWD`, color: 'var(--cds-support-success)' },
                            { label: 'Committed Headcount', val: evaluations.length, color: 'var(--cds-text-primary)' }
                        ].map((m, i) => (
                            <div key={i} className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                                <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>{m.label}</p>
                                <p style={{ fontSize: '2.5rem', fontWeight: 400, color: m.color }}>{m.val}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {activeTab === 'templates' && (
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                    <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Inference frameworks</h3>
                        <button onClick={() => handleEditTemplate({ title: '', department: '', roleName: '', kpis: [] })} className="cds--btn cds--btn--primary cds--btn--sm">+ Add Blueprint</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--cds-spacing-05)', padding: 'var(--cds-spacing-05)' }}>
                        {templates.map(tmpl => (
                            <div key={tmpl.id} className="cds--tile" style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', borderRadius: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--cds-spacing-04)' }}>
                                    <h4 style={{ fontSize: '1rem', fontWeight: 600 }}>{tmpl.title}</h4>
                                    <button onClick={() => handleEditTemplate(tmpl)} className="cds--btn cds--btn--ghost cds--btn--sm">Edit</button>
                                </div>
                                <span className="cds--tag cds--tag--blue">{tmpl.department}</span>
                                <div style={{ marginTop: 'var(--cds-spacing-05)', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    {tmpl.kpis.map((k, i) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--cds-background)', padding: 'var(--cds-spacing-02) var(--cds-spacing-03)', fontSize: '0.75rem' }}>
                                            <span>{k.name}</span>
                                            <span style={{ fontWeight: 600 }}>{k.weight}%</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* KPI Template Editor Modal */}
            {isTemplateModalOpen && editingTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up" style={{ background: 'var(--cds-background)', color: 'var(--cds-text-primary)', border: '1px solid var(--cds-border-subtle)' }}>
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50" style={{ background: 'var(--cds-layer-01)', borderColor: 'var(--cds-border-subtle)' }}>
                            <div>
                                <h3 className="text-2xl font-black text-slate-800" style={{ fontSize: '1.25rem', fontWeight: 600 }}>{editingTemplate.id ? 'Edit Template' : 'Create Template'}</h3>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1" style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Configure Departmental KPIs</p>
                            </div>
                            <button onClick={() => setIsTemplateModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--cds-text-secondary)' }}>✕</button>
                        </div>
                        
                        <div className="p-8 overflow-y-auto flex-1 space-y-6" style={{ padding: 'var(--cds-spacing-07)' }}>
                            <div className="grid grid-cols-2 gap-6" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--cds-spacing-06)' }}>
                                <div>
                                    <label className="cds--label">Template Title</label>
                                    <input 
                                        type="text" 
                                        className="cds--text-input"
                                        value={editingTemplate.title || ''} 
                                        onChange={e => setEditingTemplate({...editingTemplate, title: e.target.value})}
                                        placeholder="e.g. Senior Frontend Engineer"
                                    />
                                </div>
                                <div>
                                    <label className="cds--label">Target Department</label>
                                    <input 
                                        type="text" 
                                        className="cds--text-input"
                                        value={editingTemplate.department || ''} 
                                        onChange={e => setEditingTemplate({...editingTemplate, department: e.target.value})}
                                        placeholder="e.g. Engineering"
                                    />
                                </div>
                            </div>

                            <div style={{ marginTop: 'var(--cds-spacing-07)' }}>
                                <div className="flex justify-between items-center mb-4" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--cds-spacing-05)' }}>
                                    <label className="cds--label" style={{ margin: 0 }}>Performance Indicators</label>
                                    <button 
                                        onClick={() => setEditingTemplate({
                                            ...editingTemplate, 
                                            kpis: [...(editingTemplate.kpis || []), { name: '', weight: 10 }]
                                        })}
                                        className="cds--btn cds--btn--ghost cds--btn--sm"
                                    >
                                        + Add Rule
                                    </button>
                                </div>

                                <div className="space-y-3" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                                    {(editingTemplate.kpis || []).map((kpi, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: 'var(--cds-spacing-04)', alignItems: 'center', background: 'var(--cds-layer-01)', padding: 'var(--cds-spacing-04)', border: '1px solid var(--cds-border-subtle)' }}>
                                            <input 
                                                type="text" 
                                                className="cds--text-input"
                                                style={{ flex: 1 }}
                                                value={kpi.name}
                                                onChange={e => {
                                                    const newKpis = [...(editingTemplate.kpis || [])];
                                                    newKpis[idx].name = e.target.value;
                                                    setEditingTemplate({...editingTemplate, kpis: newKpis});
                                                }}
                                                placeholder="Identifier Description"
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-02)', width: '80px' }}>
                                                <input 
                                                    type="number" 
                                                    className="cds--text-input"
                                                    value={kpi.weight}
                                                    onChange={e => {
                                                        const newKpis = [...(editingTemplate.kpis || [])];
                                                        newKpis[idx].weight = Number(e.target.value);
                                                        setEditingTemplate({...editingTemplate, kpis: newKpis});
                                                    }}
                                                />
                                                <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>%</span>
                                            </div>
                                            <button 
                                                onClick={() => {
                                                    const newKpis = [...(editingTemplate.kpis || [])];
                                                    newKpis.splice(idx, 1);
                                                    setEditingTemplate({...editingTemplate, kpis: newKpis});
                                                }}
                                                className="cds--btn cds--btn--ghost cds--btn--sm"
                                                style={{ color: 'var(--cds-support-error)', padding: '0 8px' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3" style={{ padding: 'var(--cds-spacing-06)', borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'flex-end', gap: 'var(--cds-spacing-04)' }}>
                            <button onClick={() => setIsTemplateModalOpen(false)} className="cds--btn cds--btn--secondary">Cancel</button>
                            <button 
                                onClick={handleSaveTemplate} 
                                disabled={isSavingTemplate}
                                className="cds--btn cds--btn--primary"
                            >
                                {isSavingTemplate ? 'Saving...' : 'Save Configuration'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* History Edit Modal */}
            {isHistoryModalOpen && editingEvaluation && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl animate-fade-in-up" style={{ background: 'var(--cds-background)', color: 'var(--cds-text-primary)', border: '1px solid var(--cds-border-subtle)' }}>
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center" style={{ padding: 'var(--cds-spacing-07)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Edit Historic Evaluation</h3>
                                <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: 'var(--cds-spacing-02)' }}>{editingEvaluation.employeeName} • {editingEvaluation.quarter}</p>
                            </div>
                            <button onClick={() => setIsHistoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.25rem', color: 'var(--cds-text-secondary)' }}>✕</button>
                        </div>
                        
                        <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto" style={{ padding: 'var(--cds-spacing-07)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)', maxHeight: '60vh', overflowY: 'auto' }}>
                            {editingEvaluation.kpiScores.map((kpi, idx) => (
                                <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--cds-layer-01)', padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)' }}>
                                    <span style={{ fontSize: '0.875rem', flex: 1 }}>{kpi.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
                                        <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)', fontWeight: 600 }}>WT: {kpi.weight}%</span>
                                        <input 
                                            type="number"
                                            className="cds--text-input"
                                            style={{ width: '80px', textAlign: 'center' }}
                                            value={kpi.score}
                                            onChange={e => {
                                                const newScores = [...editingEvaluation.kpiScores];
                                                newScores[idx].score = Number(e.target.value);
                                                setEditingEvaluation({...editingEvaluation, kpiScores: newScores});
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-b-[32px]" style={{ padding: 'var(--cds-spacing-07)', borderTop: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>New Calculated Factor</p>
                                <p style={{ fontSize: '2rem', fontWeight: 400, color: 'var(--cds-interactive-01)' }}>{(editingEvaluation.kpiScores.reduce((sum, kpi) => sum + (kpi.weight * kpi.score), 0) / 100).toFixed(1)}%</p>
                            </div>
                            <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)' }}>
                                <button onClick={() => setIsHistoryModalOpen(false)} className="cds--btn cds--btn--secondary">Cancel</button>
                                <button 
                                    onClick={handleSaveHistory}
                                    disabled={isSavingHistory}
                                    className="cds--btn cds--btn--primary"
                                >
                                    {isSavingHistory ? 'Saving...' : 'Update Records'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PerformanceView;
