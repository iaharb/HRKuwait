
import React, { useState } from 'react';
import { User } from '../../types/types.ts';

interface UserHandbookProps {
    user: User;
    isAr: boolean;
}

const UserHandbook: React.FC<UserHandbookProps> = ({ user, isAr }) => {
    const [selectedRole, setSelectedRole] = useState(user.role);

    const roles = [
        { id: 'Employee', label: isAr ? 'موظف' : 'Employee', icon: '👤' },
        { id: 'Manager', label: isAr ? 'مدير' : 'Manager', icon: '👥' },
        { id: 'HR Manager', label: isAr ? 'مدير الموارد البشرية' : 'HR Manager', icon: '🛡️' },
        { id: 'Payroll Manager', label: isAr ? 'مدير الرواتب' : 'Payroll Manager', icon: '💰' },
        { id: 'Admin', label: isAr ? 'مسؤول' : 'Admin', icon: '🔐' },
        { id: 'Executive', label: isAr ? 'تنفيذي' : 'Executive', icon: '📈' },
        { id: 'Mandoob', label: isAr ? 'مندوب' : 'Mandoob', icon: '🛂' },
    ];

    const getGuideContent = (role: string) => {
        switch (role) {
            case 'Employee':
                return {
                    modules: 'Profile · Leave Management · Attendance',
                    steps: [
                        { title: 'Viewing Profile', content: 'Navigate to Profile to view personal, position, and salary details. Use the edit icon to request updates.' },
                        { title: 'Leave Requests', content: 'Submit Annual, Sick, or Emergency leaves in Leave Management. View calculation breakdowns and remaining balances.' },
                        { title: 'Short Permission', content: 'Request hourly leave (max 8h/month). Must be submitted 1 day in advance.' },
                        { title: 'Resuming Duty', content: 'CRITICAL: After returning from leave, click "Resume Duty" in Leave Management to allow HR finalization.' },
                        { title: 'Attendance', content: 'Clock-in via Web or Mobile (GPS geofenced) and view daily logs.' },
                    ]
                };
            case 'Manager':
                return {
                    modules: 'Dashboard · Directory · Approvals · Performance',
                    steps: [
                        { title: 'Approving Leaves', content: 'Review and approve/reject team leave requests in the Approvals module (LEAVES tab).' },
                        { title: 'Overtime Review', content: 'Approve auto-generated overtime entries in Approvals (OVERTIME tab).' },
                        { title: 'Team Directory', content: 'View profiles and attendance of all direct reports in the Directory.' },
                        { title: 'Performance', content: 'Score team members on defined KPIs during evaluation periods.' },
                    ]
                };
            case 'HR Manager':
            case 'HR Officer':
            case 'HR':
                return {
                    modules: 'Full HR Operations · Admin Center · Compliance · Mandoob PRO',
                    steps: [
                        { title: 'Leave Finalization', content: 'After employee resumes duty, finalize days in Leave Management to deduct balances.' },
                        { title: 'Workforce Management', content: 'Add/edit employees and manage full profiles in Directory.' },
                        { title: 'Role Correlation', content: 'System Role in Directory synchronizes with Access Control permissions. Designation is for display only.' },
                        { title: 'Admin Center', content: 'Manage Announcements, Public Holidays, Office Geofences, and sync core data.' },
                        { title: 'Compliance', content: 'Monitor Kuwaitization targets and track document expiries (Civil ID, Passports).' },
                    ]
                };
            case 'Payroll Manager':
            case 'Payroll Officer':
                return {
                    modules: 'Payroll Console · Settlement · Finance · Profit Bonus',
                    steps: [
                        { title: 'Monthly Payroll', content: 'Execute period audits, review the audit grid for integrity, and finalize runs.' },
                        { title: 'Leave Settlement Hub', content: 'Authorize immediate payouts (Hub Path) or defer to monthly (Month-End Path).' },
                        { title: 'WPS Export', content: 'Generate bank-specific files (NBK, KFH, BOUB, etc.) for finalized runs.' },
                        { title: 'Final Settlement', content: 'Calculate EOSB/Indemnity for terminating employees according to Kuwait Labour Law.' },
                    ]
                };
            case 'Admin':
                return {
                    modules: 'Full Access · Security & Roles · SQL Terminal',
                    steps: [
                        { title: 'Security & Roles', content: 'Define role templates and customize module-level access permissions. Roles sync bi-directionally with the Workforce registry.' },
                        { title: 'Database Ops', content: 'Execute raw SQL (terminal) and manage core system sync tables.' },
                        { title: 'Full Control', content: 'Access any view and perform administrative rollbacks for payroll and leaves.' },
                    ]
                };
            case 'Executive':
                return {
                    modules: 'Dashboards · Strategy · Insights · Profit Sharing',
                    steps: [
                        { title: 'Strategic Oversight', content: 'Monitor headcount, payroll trends, and department performance via dashboards.' },
                        { title: 'Profit Sharing', content: 'Define and approve profit bonus pools for company-wide distribution.' },
                        { title: 'AI Insights', content: 'Review workforce analytics and growth projections.' },
                    ]
                };
            case 'Mandoob':
                return {
                    modules: 'Mandoob PRO · Attendance · Leaves',
                    steps: [
                        { title: 'Mandoob PRO', content: 'Track Civil ID renewals, Work Permits (Izn Amal), and Passport expiries.' },
                        { title: 'Government Liaison', content: 'Manage document tracking and PIFSS registration statuses.' },
                    ]
                };
            default: return null;
        }
    };

    const currentGuide = getGuideContent(selectedRole);

    return (
        <div className="flex gap-8">
            {/* Sidebar Role Selector */}
            <div className="w-64 flex flex-col gap-2 shrink-0">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Select User Role</h4>
                {roles.map(r => (
                    <button
                        key={r.id}
                        onClick={() => setSelectedRole(r.id as any)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-2xl font-bold transition-all ${selectedRole === r.id
                            ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10'
                            : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-400'
                            }`}
                    >
                        <span>{r.icon}</span>
                        {r.label}
                    </button>
                ))}
            </div>

            {/* Guide Content */}
            <div className="flex-1 space-y-8 animate-in slide-in-from-right-4 duration-500">
                <div className="bg-slate-900 p-8 rounded-[40px] text-white relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-12 text-[150px] opacity-10 grayscale pointer-events-none group-hover:rotate-12 transition-transform duration-700">
                        {roles.find(r => r.id === selectedRole)?.icon}
                    </div>
                    <div className="relative z-10">
                        <span className="text-xs font-black uppercase tracking-[0.3em] text-indigo-400 mb-2 block">Quick Start Guide</span>
                        <h3 className="text-3xl font-black tracking-tighter mb-4">{roles.find(r => r.id === selectedRole)?.label} Handbook</h3>
                        <div className="flex flex-wrap gap-2">
                            {currentGuide?.modules.split(' · ').map((m, i) => (
                                <span key={i} className="px-3 py-1 bg-white/10 rounded-full text-[11px] font-bold backdrop-blur-md">
                                    {m}
                                </span>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {currentGuide?.steps.map((step, i) => (
                        <div key={i} className="p-6 bg-white rounded-[32px] border border-slate-200 hover:shadow-xl hover:shadow-slate-200/50 transition-all">
                            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs mb-4">
                                {i + 1}
                            </div>
                            <h5 className="font-black text-slate-900 mb-2">{step.title}</h5>
                            <p className="text-slate-500 text-sm leading-relaxed">{step.content}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default UserHandbook;
