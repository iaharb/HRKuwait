
import React, { useState } from 'react';
import { User, View } from '../../types/types.ts';
import LeaveWorkflow from './LeaveWorkflow.tsx';
import PayrollWorkflow from './PayrollWorkflow.tsx';
import SettlementWorkflow from './SettlementWorkflow.tsx';
import OvertimeWorkflow from './OvertimeWorkflow.tsx';
import ExpenseWorkflow from './ExpenseWorkflow.tsx';
import UserHandbook from './UserHandbook.tsx';
import { useTranslation } from 'react-i18next';

interface HelpCenterProps {
    user: User;
    onNavigate?: (view: View) => void;
}

const HelpCenter: React.FC<HelpCenterProps> = ({ user }) => {
    const { t, i18n } = useTranslation();
    const [activeTab, setActiveTab] = useState<'workflows' | 'sop' | 'guides'>('workflows');
    const [activeWorkflow, setActiveWorkflow] = useState<'leave' | 'payroll' | 'eosb' | 'overtime' | 'expense'>('leave');
    const isAr = i18n.language === 'ar';

    const tabs = [
        { id: 'workflows', label: isAr ? 'مخططات سير العمل' : 'Workflow Diagrams', icon: '🔄' },
        { id: 'sop', label: isAr ? 'إجراءات التشغيل القياسية' : 'SOP & Rules', icon: '📝' },
        { id: 'guides', label: isAr ? 'أدلة المستخدم' : 'User Guides', icon: '📖' },
    ];

    const workflows = [
        { id: 'leave', label: isAr ? 'دورة حياة الإجازة' : 'Leave Lifecycle', icon: '📅' },
        { id: 'payroll', label: isAr ? 'دورة الرواتب' : 'Payroll Cycle', icon: '💰' },
        { id: 'eosb', label: isAr ? 'مكافأة نهاية الخدمة' : 'EOSB Calculation', icon: '⚖️' },
        { id: 'overtime', label: isAr ? 'معالجة الإضافي' : 'Overtime Processing', icon: '🕒' },
        { id: 'expense', label: isAr ? 'مطالبات المصاريف' : 'Expense Claims', icon: '📤' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-24">
            {/* Header */}
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter flex items-center gap-3">
                    <span className="p-2 bg-indigo-600 text-white rounded-xl shadow-lg shadow-indigo-600/20 text-xl">📚</span>
                    {isAr ? 'مركز المساعدة والتوثيق' : 'Documentation Hub'}
                </h1>
                <p className="text-slate-500 font-medium tracking-tight">
                    {isAr
                        ? 'اكتشف كيف يعمل النظام من خلال المخططات التفاعلية والأدلة الشاملة.'
                        : 'Explore how the system works through interactive diagrams and comprehensive guides.'}
                </p>
            </div>

            {/* Main Tabs */}
            <div className="flex bg-white shadow-sm p-1 rounded-[20px] border border-slate-200 w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-6 py-2.5 rounded-2xl text-sm font-black transition-all flex items-center gap-2 ${activeTab === tab.id
                            ? 'bg-slate-900 text-white shadow-xl shadow-slate-900/10'
                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                            }`}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Workflows Tab */}
            {activeTab === 'workflows' && (
                <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="flex gap-3 overflow-x-auto pb-2 noscroll">
                        {workflows.map(wf => (
                            <button
                                key={wf.id}
                                onClick={() => setActiveWorkflow(wf.id as any)}
                                className={`px-4 py-2 shrink-0 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeWorkflow === wf.id
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-white border border-slate-200 text-slate-500 hover:border-indigo-400'
                                    }`}
                            >
                                {wf.label}
                            </button>
                        ))}
                    </div>

                    <div className="bg-white rounded-[40px] p-8 border border-slate-200 relative overflow-hidden group shadow-2xl shadow-slate-200/50">
                        {/* Background Decorative Icon */}
                        <div className="absolute top-0 right-0 p-20 text-[200px] opacity-[0.03] grayscale pointer-events-none select-none transition-transform duration-1000 group-hover:scale-110">
                            {workflows.find(wf => wf.id === activeWorkflow)?.icon}
                        </div>

                        <div className="relative z-10 space-y-4 h-full">
                            <div className="flex flex-col">
                                <h2 className="text-xl font-black text-slate-900">
                                    {workflows.find(wf => wf.id === activeWorkflow)?.label}
                                </h2>
                                <span className="text-xs uppercase tracking-[0.2em] font-black text-indigo-500">Interactive Blueprint</span>
                            </div>

                            <div className="mt-4">
                                {activeWorkflow === 'leave' && <LeaveWorkflow />}
                                {activeWorkflow === 'payroll' && <PayrollWorkflow />}
                                {activeWorkflow === 'eosb' && <SettlementWorkflow />}
                                {activeWorkflow === 'overtime' && <OvertimeWorkflow />}
                                {activeWorkflow === 'expense' && <ExpenseWorkflow />}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* SOP Tab */}
            {activeTab === 'sop' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SOPCard
                            title={isAr ? "سياسة الإجازات المرضية" : "Sick Leave Policy"}
                            icon="🤒"
                            rules={[
                                { label: "1-15 days", value: "Full Pay" },
                                { label: "16-30 days", value: "75% Pay" },
                                { label: "31-45 days", value: "25% Pay" },
                                { label: "46+ days", value: "No Pay (Statutory Max)" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "دورة حياة الإجازة" : "Leave Lifecycle"}
                            icon="🔄"
                            rules={[
                                { label: "Submissions", value: "Auto-Pending" },
                                { label: "Resumption", value: "Required by Employee" },
                                { label: "Finalization", value: "Balance Deducted (Async Trigger)" },
                                { label: "Payout", value: "Hub Auth vs Monthly" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "قواعد المكافأة" : "EOSB Settlement"}
                            icon="⚖️"
                            rules={[
                                { label: "< 5y service", value: "15 days payout/y" },
                                { label: "> 5y service", value: "30 days payout/y" },
                                { label: "Resignation Multiplier", value: "0% <3y -> 100% 10+y" },
                                { label: "Max Final Cap", value: "18 Months Remuneration" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "التأمينات الاجتماعية" : "PIFSS Deduction"}
                            icon="🛡️"
                            rules={[
                                { label: "Employee Contribution", value: "11.5% of Basic" },
                                { label: "Eligibility", value: "National Hub (Kuwaiti Only)" },
                                { label: "Calculation Basis", value: "Basic + Housing" },
                                { label: "Deduction Timing", value: "Monthly Payroll/Hub Runs" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "الأذونات القصيرة" : "Short Permission"}
                            icon="⏳"
                            rules={[
                                { label: "Monthly Max", value: "8 Hours (Cumulative)" },
                                { label: "Lead Time", value: "Minimum 1 Day Advance" },
                                { label: "Deduction", value: "8 Hours = 1 Annual Day" },
                                { label: "Blocking", value: "Same-Day blocked by System" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "العمل الإضافي" : "Overtime Logic"}
                            icon="⚙️"
                            rules={[
                                { label: "Detection", value: "Standard Shift > 8 Hours" },
                                { label: "Authorization", value: "Manager -> HR Ack -> Payroll" },
                                { label: "Compensation", value: "1.0x Base Hourly (Workday)" },
                                { label: "Source", value: "Web, Mobile, HW Device Logs" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "نظام حماية الأجور" : "WPS Standards"}
                            icon="🏛️"
                            rules={[
                                { label: "File Formats", value: "NBK / KFH / BOUB / GULF" },
                                { label: "Export Timing", value: "After Payroll Finalization" },
                                { label: "Currency", value: "Kuwaiti Dinar (KWD) Only" },
                                { label: "Compliance", value: "MOL Employer ID Verification" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "حساب الأجر اليومي" : "Daily Rate Formulas"}
                            icon="📊"
                            rules={[
                                { label: "Indemnity Rate", value: "(Basic + All Allowed) / 26" },
                                { label: "Leave Rate", value: "(Basic + Housing) / 26" },
                                { label: "Working Days", value: "26 Day Standard Month" },
                                { label: "Exclusions", value: "Fridays always excluded" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "مطالبات المصاريف" : "Expense Policies"}
                            icon="🎞️"
                            rules={[
                                { label: "Receipt Requirement", value: "Photo/Scan Upload mandatory" },
                                { label: "Threshold", value: "Manager Auth > 50 KWD" },
                                { label: "Settlement", value: "Direct Bank Transfer (Finance)" },
                                { label: "Categories", value: "Travel, Meals, Supply, Official" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "دقة المزامنة" : "Role Correlation"}
                            icon="🔗"
                            rules={[
                                { label: "Dual Role Logic", value: "Functional Title vs System Role" },
                                { label: "System Role", value: "Drives Permissions (e.g., Payroll Manager)" },
                                { label: "Functional Title", value: "Informative Designation (e.g., IT Manager)" },
                                { label: "Bi-directional Sync", value: "Workforce ⟷ Access Control Map" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "لوحة استراتيجية" : "Strategy Dashboard"}
                            icon="📊"
                            rules={[
                                { label: isAr ? "إجمالي العمالة" : "Labor Cost", value: isAr ? "إجمالي المصاريف السنوية" : "Aggregate Annual Personnel Expense" },
                                { label: isAr ? "تغطية مخصصات" : "EOSB Coverage", value: isAr ? "الرصيد مقابل الالتزام الفعلي" : "Provision GL vs Calculated Liability" },
                                { label: isAr ? "عبء التأمينات" : "Statutory Burden", value: isAr ? "حصة صاحب العمل في التأمينات" : "Employer PIFSS Share vs Basic" },
                                { label: isAr ? "تذبذب الرواتب" : "Volatility", value: isAr ? "تغير التكاليف بين الأشهر" : "MoM budget fluctuation tracking" }
                            ]}
                        />
                        <SOPCard
                            title={isAr ? "تحليل الرفاهية" : "Wellness & Utilization"}
                            icon="🌡️"
                            rules={[
                                { label: isAr ? "الإجازات والبيانات" : "Leave Data Map", value: isAr ? "ربط Account 600500 / 600600" : "Linked to Account 600500/600600" },
                                { label: isAr ? "تحليل المرضي" : "Sick Wellness", value: isAr ? "مراقبة اتجاهات المرضية" : "Monitoring health-related budget spikes" },
                                { label: isAr ? "تغطية الإجازات" : "Utilization", value: isAr ? "استخدام الإجازة السنوية" : "Tracking burnout via unused annual balances" },
                                { label: isAr ? "سبب الرسوم الصفرية" : "Why Blank?", value: isAr ? "تتطلب ترحيل قيد رواتب (JV)" : "Requires Payroll JV generation" }
                            ]}
                        />
                    </div>
                </div>
            )}

            {/* Guides Tab */}
            {activeTab === 'guides' && (
                <div className="animate-in slide-in-from-bottom-4 duration-500">
                    <UserHandbook user={user} isAr={isAr} />
                </div>
            )}
        </div>
    );
};

const SOPCard = ({ title, icon, rules }: any) => (
    <div className="bg-white p-8 rounded-[40px] border border-slate-200 hover:shadow-2xl hover:shadow-indigo-900/5 transition-all group relative overflow-hidden">
        <div className="absolute top-0 right-0 p-4 text-4xl opacity-10 grayscale group-hover:scale-110 transition-transform origin-right pointer-events-none">
            {icon}
        </div>
        <div className="flex items-center gap-3 mb-6">
            <span className="text-2xl">{icon}</span>
            <h3 className="text-lg font-black text-slate-900 leading-tight">{title}</h3>
        </div>
        <div className="space-y-5">
            {rules.map((rule: any, i: number) => (
                <div key={i} className="flex flex-col gap-0.5 relative">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{rule.label}</span>
                    <span className="text-[13px] font-bold text-slate-700">{rule.value}</span>
                    <div className="absolute left-[-1.5rem] top-1/2 -translate-y-1/2 w-1 h-0 group-hover:h-3 bg-indigo-500 rounded-full transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
                </div>
            ))}
        </div>
    </div>
);

export default HelpCenter;
