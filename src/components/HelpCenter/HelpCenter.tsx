
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
        <div className="cds--registry-view" style={{ padding: 'var(--cds-spacing-05)', animation: 'fade-in 0.8s ease', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
            {/* Header */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-03)' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--cds-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-04)' }}>
                    <span style={{ color: 'var(--cds-interactive-01)' }}>📚</span>
                    {isAr ? 'مركز المساعدة والتوثيق' : 'Documentation Hub'}
                </h1>
                <p style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>
                    {isAr
                        ? 'اكتشف كيف يعمل النظام من خلال المخططات التفاعلية والأدلة الشاملة.'
                        : 'Explore how the system works through interactive diagrams and comprehensive guides.'}
                </p>
            </div>

            {/* Main Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--cds-border-subtle)', background: 'transparent' }}>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        style={{
                            padding: 'var(--cds-spacing-04) var(--cds-spacing-05)',
                            background: activeTab === tab.id ? 'var(--cds-layer-01)' : 'transparent',
                            border: 'none',
                            borderBottom: activeTab === tab.id ? '2px solid var(--cds-interactive-01)' : '2px solid transparent',
                            color: activeTab === tab.id ? 'var(--cds-text-primary)' : 'var(--cds-text-secondary)',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            fontFamily: 'monospace',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--cds-spacing-03)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Workflows Tab */}
            {activeTab === 'workflows' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-06)', animation: 'slide-in 0.5s ease' }}>
                    <div style={{ display: 'flex', gap: 'var(--cds-spacing-04)', overflowX: 'auto', paddingBottom: 'var(--cds-spacing-03)' }}>
                        {workflows.map(wf => (
                            <button
                                key={wf.id}
                                onClick={() => setActiveWorkflow(wf.id as any)}
                                style={{
                                    padding: 'var(--cds-spacing-03) var(--cds-spacing-05)',
                                    background: activeWorkflow === wf.id ? 'var(--cds-interactive-01)' : 'var(--cds-layer-01)',
                                    color: activeWorkflow === wf.id ? '#fff' : 'var(--cds-text-primary)',
                                    border: activeWorkflow === wf.id ? '1px solid var(--cds-interactive-01)' : '1px solid var(--cds-border-subtle)',
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    fontFamily: 'monospace',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.05em',
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {wf.label}
                            </button>
                        ))}
                    </div>

                    <div className="cds--tile" style={{ padding: 'var(--cds-spacing-07)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', height: '100%', gap: 'var(--cds-spacing-05)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <h2 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                                    {workflows.find(wf => wf.id === activeWorkflow)?.label}
                                </h2>
                                <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--cds-interactive-01)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Interactive Blueprint</span>
                            </div>

                            <div style={{ marginTop: 'var(--cds-spacing-04)' }}>
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
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--cds-spacing-06)', animation: 'slide-in 0.5s ease' }}>
                    <SOPCard
                        title={isAr ? "سياسة الإجازات المرضية" : "Sick Leave Policy"}
                        rules={[
                            { label: "1-15 days", value: "Full Pay" },
                            { label: "16-30 days", value: "75% Pay" },
                            { label: "31-45 days", value: "25% Pay" },
                            { label: "46+ days", value: "No Pay (Statutory Max)" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "دورة حياة الإجازة" : "Leave Lifecycle"}
                        rules={[
                            { label: "Submissions", value: "Auto-Pending" },
                            { label: "Resumption", value: "Required by Employee" },
                            { label: "Finalization", value: "Balance Deducted (Async Trigger)" },
                            { label: "Payout", value: "Hub Auth vs Monthly" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "قواعد المكافأة" : "EOSB Settlement"}
                        rules={[
                            { label: "< 5y service", value: "15 days payout/y" },
                            { label: "> 5y service", value: "30 days payout/y" },
                            { label: "Resignation Multiplier", value: "0% <3y -> 100% 10+y" },
                            { label: "Max Final Cap", value: "18 Months Remuneration" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "التأمينات الاجتماعية" : "PIFSS Deduction"}
                        rules={[
                            { label: "Employee Contribution", value: "11.5% of Basic" },
                            { label: "Eligibility", value: "National Hub (Kuwaiti Only)" },
                            { label: "Calculation Basis", value: "Basic + Housing" },
                            { label: "Deduction Timing", value: "Monthly Payroll/Hub Runs" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "الأذونات القصيرة" : "Short Permission"}
                        rules={[
                            { label: "Monthly Max", value: "8 Hours (Cumulative)" },
                            { label: "Lead Time", value: "Minimum 1 Day Advance" },
                            { label: "Deduction", value: "8 Hours = 1 Annual Day" },
                            { label: "Blocking", value: "Same-Day blocked by System" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "العمل الإضافي" : "Overtime Logic"}
                        rules={[
                            { label: "Detection", value: "Standard Shift > 8 Hours" },
                            { label: "Authorization", value: "Manager -> Executive -> HR -> Payroll" },
                            { label: "Compensation", value: "1.0x Base Hourly (Workday)" },
                            { label: "Filter Selection", value: "January 2026 Onwards" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "دورة مكافآت المتغيرة" : "Variable Comp Approvals"}
                        rules={[
                            { label: "Types", value: "Overtime, Performance, Company Pool" },
                            { label: "Visibility", value: "Grouped by Month & Department" },
                            { label: "Bulk Action", value: "Multiple select -> Common Status Update" },
                            { label: "Audit Link", value: "Only Approved items enter Payroll Run" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "نظام حماية الأجور" : "WPS Standards"}
                        rules={[
                            { label: "File Formats", value: "NBK / KFH / BOUB / GULF" },
                            { label: "Export Timing", value: "After Payroll Finalization" },
                            { label: "Currency", value: "Kuwaiti Dinar (KWD) Only" },
                            { label: "Compliance", value: "MOL Employer ID Verification" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "حساب الأجر اليومي" : "Daily Rate Formulas"}
                        rules={[
                            { label: "Indemnity Rate", value: "(Basic + All Allowed) / 26" },
                            { label: "Leave Rate", value: "(Basic + Housing) / 26" },
                            { label: "Working Days", value: "26 Day Standard Month" },
                            { label: "Exclusions", value: "Fridays always excluded" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "مطالبات المصاريف" : "Expense Policies"}
                        rules={[
                            { label: "Receipt Requirement", value: "Photo/Scan Upload mandatory" },
                            { label: "Threshold", value: "Manager Auth > 50 KWD" },
                            { label: "Settlement", value: "Direct Bank Transfer (Finance)" },
                            { label: "Categories", value: "Travel, Meals, Supply, Official" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "دقة المزامنة" : "Role Correlation"}
                        rules={[
                            { label: "Dual Role Logic", value: "Functional Title vs System Role" },
                            { label: "System Role", value: "Drives Permissions (e.g., Payroll Manager)" },
                            { label: "Functional Title", value: "Informative Designation (e.g., IT Manager)" },
                            { label: "Bi-directional Sync", value: "Workforce ⟷ Access Control Map" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "لوحة استراتيجية" : "Strategy Dashboard"}
                        rules={[
                            { label: isAr ? "إجمالي العمالة" : "Labor Cost", value: isAr ? "إجمالي المصاريف السنوية" : "Aggregate Annual Personnel Expense" },
                            { label: isAr ? "تغطية مخصصات" : "EOSB Coverage", value: isAr ? "الرصيد مقابل الالتزام الفعلي" : "Provision GL vs Calculated Liability" },
                            { label: isAr ? "عبء التأمينات" : "Statutory Burden", value: isAr ? "حصة صاحب العمل في التأمينات" : "Employer PIFSS Share vs Basic" },
                            { label: isAr ? "تذبذب الرواتب" : "Volatility", value: isAr ? "تغير التكاليف بين الأشهر" : "MoM budget fluctuation tracking" }
                        ]}
                    />
                    <SOPCard
                        title={isAr ? "تحليل الرفاهية" : "Wellness & Utilization"}
                        rules={[
                            { label: isAr ? "الإجازات والبيانات" : "Leave Data Map", value: isAr ? "ربط Account 600500 / 600600" : "Linked to Account 600500/600600" },
                            { label: isAr ? "تحليل المرضي" : "Sick Wellness", value: isAr ? "مراقبة اتجاهات المرضية" : "Monitoring health-related budget spikes" },
                            { label: isAr ? "تغطية الإجازات" : "Utilization", value: isAr ? "استخدام الإجازة السنوية" : "Tracking burnout via unused annual balances" },
                            { label: isAr ? "سبب الرسوم الصفرية" : "Why Blank?", value: isAr ? "تتطلب ترحيل قيد رواتب (JV)" : "Requires Payroll JV generation" }
                        ]}
                    />
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

const SOPCard = ({ title, rules }: any) => (
    <div className="cds--tile" style={{ padding: 'var(--cds-spacing-06)', border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)', transition: 'all 0.2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--cds-spacing-03)' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{title}</h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-04)' }}>
            {rules.map((rule: any, i: number) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span style={{ fontSize: '0.625rem', fontWeight: 700, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--cds-text-secondary)' }}>{rule.label}</span>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{rule.value}</span>
                </div>
            ))}
        </div>
    </div>
);

export default HelpCenter;
