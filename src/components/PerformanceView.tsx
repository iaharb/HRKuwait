import React, { useState, useEffect } from 'react';
import { User, KPITemplate, EmployeeEvaluation, Employee } from '../types/types.ts';
import { dbService } from '../services/dbService.ts';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationSystem.tsx';
import { supabase } from '../services/supabaseClient.ts';

interface PerformanceViewProps {
    user: User;
}

const PerformanceView: React.FC<PerformanceViewProps> = ({ user }) => {
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

    // For Executive / HR View
    const [pendingEvals, setPendingEvals] = useState<EmployeeEvaluation[]>([]);

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
            const emps = await dbService.getEmployees();
            // Managers evaluate their team. Executives and HR evaluate everyone/see everything.
            const isManagerOrAdmin = ['Admin', 'Manager', 'Executive', 'HR', 'HR Manager'].includes(user.role);

            if (['Manager'].includes(user.role)) {
                setEmployees(emps.filter(e => e.managerId === user.id));
            } else {
                setEmployees(emps);
            }

            const tmpls = await dbService.getKPITemplates();
            setTemplates(tmpls);

            const evals = await dbService.getEmployeeEvaluations();
            if (['Manager'].includes(user.role)) {
                setEvaluations(evals.filter(e => e.evaluatorId === user.id));
            } else {
                setEvaluations(evals);
            }

            // Extract pending for approval queues
            if (['Executive', 'Admin'].includes(user.role)) {
                setPendingEvals(evals.filter(e => e.status === 'PENDING_EXEC'));
            } else if (['HR', 'HR Manager'].includes(user.role)) {
                setPendingEvals(evals.filter(e => e.status === 'PENDING_HR'));
            }

        } catch (err: any) {
            notify('Error fetching data', err.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleTemplateSelect = (tmplId: string) => {
        setSelectedTemplate(tmplId);
        const tmpl = templates.find(t => t.id === tmplId);
        if (tmpl) {
            setKpiScores(tmpl.kpis.map(k => ({ name: k.name, weight: k.weight, score: 0 })));
        } else {
            setKpiScores([]);
        }
    };

    const calculateTotalScore = () => {
        return kpiScores.reduce((sum, kpi) => sum + (kpi.weight * (kpi.score / 100)), 0);
    };

    const handleSubmitEvaluation = async () => {
        if (!selectedEmployee || !selectedTemplate || kpiScores.length === 0) {
            notify('Validation Error', 'Please select an employee and KPI template.', 'error');
            return;
        }

        const totalWeight = kpiScores.reduce((sum, kpi) => sum + Number(kpi.weight), 0);
        if (totalWeight !== 100) {
            notify('Validation Error', `Total KPI weights must equal 100%. Currently: ${totalWeight}%`, 'error');
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
        const calculatedKwd = (emp.salary * totalScore) * proRataFactor;

        try {
            await dbService.submitEmployeeEvaluation({
                employeeId: selectedEmployee,
                evaluatorId: user.id,
                quarter,
                kpiScores,
                totalScore: Number(totalScore.toFixed(4)),
                proRataFactor: Number(proRataFactor.toFixed(4)),
                calculatedKwd: Number(calculatedKwd.toFixed(3)),
            });
            notify('Success', 'Evaluation submitted for executive review.', 'success');
            setSelectedEmployee('');
            setSelectedTemplate('');
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

    if (loading) return <div className="p-10 text-center flex items-center justify-center">Loading...</div>;

    return (
        <div className="p-8 space-y-8 animate-fade-in text-start">
            <div className="flex justify-between items-center bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <span className="text-4xl">⭐</span> {t('performance_evaluations') || 'Performance Evaluations'}
                    </h2>
                    <p className="text-sm font-bold text-slate-400 mt-2 uppercase tracking-widest">{quarter} Cycle</p>
                </div>
            </div>

            {(['Manager', 'Admin', 'HR Manager'].includes(user.role)) && (
                <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-xl">
                    <h3 className="text-xl font-black text-slate-900 mb-6">Create New Evaluation</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div>
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Employee</label>
                            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl" value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}>
                                <option value="">Select Employee</option>
                                {employees.map(e => (
                                    <option key={e.id} value={e.id}>{e.name} - {e.role}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">KPI Template</label>
                            <select className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl" value={selectedTemplate} onChange={e => handleTemplateSelect(e.target.value)}>
                                <option value="">Select Template</option>
                                {templates.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Quarter</label>
                            <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-center" value={quarter} onChange={e => setQuarter(e.target.value)} />
                        </div>
                    </div>

                    {kpiScores.length > 0 && (
                        <div className="bg-slate-50 rounded-3xl p-6 border border-slate-200">
                            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4">KPI Scoring</h4>
                            <div className="space-y-4">
                                {kpiScores.map((kpi, idx) => (
                                    <div key={idx} className="flex flex-col md:flex-row items-center gap-4 bg-white p-4 rounded-xl border border-slate-100">
                                        <div className="flex-1">
                                            <p className="font-bold text-slate-800">{kpi.name}</p>
                                        </div>
                                        <div className="w-24 text-center">
                                            <span className="text-xs font-black text-indigo-500 uppercase">Weight: {kpi.weight}%</span>
                                        </div>
                                        <div className="w-32 flex items-center gap-2">
                                            <input
                                                type="number"
                                                min="0" max="150"
                                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-center font-black"
                                                placeholder="Achieved %"
                                                value={kpi.score === 0 ? '' : kpi.score}
                                                onChange={e => {
                                                    const newScores = [...kpiScores];
                                                    newScores[idx].score = Number(e.target.value);
                                                    setKpiScores(newScores);
                                                }}
                                            />
                                            <span className="text-xs font-black text-slate-400">%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
                                <div>
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Calculated Performance Factor</p>
                                    <p className="text-3xl font-black text-indigo-600">{(calculateTotalScore() * 100).toFixed(1)}%</p>
                                </div>
                                <button
                                    onClick={handleSubmitEvaluation}
                                    className="px-8 py-4 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest hover:bg-indigo-700 active:scale-95 transition-all shadow-lg"
                                >
                                    Submit Evaluation
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {pendingEvals.length > 0 && (
                <div className="bg-white p-10 rounded-[40px] border border-amber-200 shadow-xl overflow-x-auto relative mt-8">
                    <div className="absolute top-0 right-0 p-8 text-5xl opacity-10 pointer-events-none">📋</div>
                    <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full bg-amber-500 animate-pulse"></span>
                        Pending Sign-Offs
                    </h3>
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-y border-slate-100">
                                <th className="p-4">Employee</th>
                                <th className="p-4">Quarter</th>
                                <th className="p-4">Final Factor</th>
                                <th className="p-4">Pro-Rata</th>
                                <th className="p-4">Calc. Bonus KWD</th>
                                <th className="p-4">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {pendingEvals.map(ev => (
                                <tr key={ev.id} className="hover:bg-slate-50/50">
                                    <td className="p-4">
                                        <p className="font-bold text-slate-900">{ev.employeeName}</p>
                                        <p className="text-[10px] text-slate-400">{ev.department}</p>
                                    </td>
                                    <td className="p-4 font-mono text-sm text-slate-600">{ev.quarter}</td>
                                    <td className="p-4">
                                        <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-md font-black text-sm">{(ev.totalScore * 100).toFixed(1)}%</span>
                                    </td>
                                    <td className="p-4 text-xs font-bold text-slate-500">{ev.proRataFactor.toFixed(2)}x</td>
                                    <td className="p-4 text-lg font-black text-emerald-600">{ev.calculatedKwd.toLocaleString()} KWD</td>
                                    <td className="p-4">
                                        <button
                                            onClick={() => approveEvaluation(ev.id, ev.status)}
                                            className="px-6 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors"
                                        >
                                            {user.role === 'Executive' ? 'Sign & Approve' : 'Acknowledge (HR)'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Audit History */}
            <div className="bg-white p-10 rounded-[40px] border border-slate-200 shadow-sm mt-8">
                <h3 className="text-lg font-black text-slate-800 mb-6">Historical Evaluations</h3>
                {evaluations.length === 0 ? (
                    <p className="p-8 text-center text-slate-400 italic">No historical evaluations found.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-y border-slate-100">
                                    <th className="p-4">Employee</th>
                                    <th className="p-4">Quarter</th>
                                    <th className="p-4">Factor</th>
                                    <th className="p-4">Award KWD</th>
                                    <th className="p-4">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {evaluations.map(ev => (
                                    <tr key={ev.id}>
                                        <td className="p-4">
                                            <p className="font-bold text-slate-900">{ev.employeeName}</p>
                                            <p className="text-[10px] text-slate-400">{ev.department}</p>
                                        </td>
                                        <td className="p-4 font-mono text-xs">{ev.quarter}</td>
                                        <td className="p-4 text-sm font-bold">{(ev.totalScore * 100).toFixed(1)}%</td>
                                        <td className="p-4 text-sm font-black text-slate-900">{ev.calculatedKwd.toLocaleString()}</td>
                                        <td className="p-4">
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-md border ${ev.status === 'APPROVED_FOR_PAYROLL' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                {ev.status.replace(/_/g, ' ')}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

        </div>
    );
};

export default PerformanceView;
