
import React from 'react';
import { View, User } from '../types/types.ts';
import Dashboard from './Dashboard.tsx';
import EmployeeDirectory from './EmployeeDirectory.tsx';
import AiInsights from './AiInsights.tsx';
import ComplianceView from './ComplianceView.tsx';
import ProfileView from './ProfileView.tsx';
import LeaveManagement from './LeaveManagement.tsx';
import PayrollView from './PayrollView.tsx';
import SettlementView from './SettlementView.tsx';
import AttendanceView from './AttendanceView.tsx';
import AdminCenter from './AdminCenter.tsx';
import Whitepaper from './Whitepaper.tsx';
import MandoobDashboard from './MandoobDashboard.tsx';
import { FinanceMappingSettings } from './FinanceMappingSettings.tsx';
import { ManagementDashboard } from './ManagementDashboard.tsx';
import { UserManagement } from './UserManagement.tsx';

interface ViewRendererProps {
    currentView: View;
    user: User;
    language: 'en' | 'ar';
    refreshKey: number;
    onNavigate: (view: View) => void;
    onOpenEmployeeModal: () => void;
    onEditEmployee: (emp: any) => void;
}

const ViewRenderer: React.FC<ViewRendererProps> = ({
    currentView,
    user,
    language,
    refreshKey,
    onNavigate,
    onOpenEmployeeModal,
    onEditEmployee
}) => {
    switch (currentView) {
        case View.Dashboard: return <Dashboard user={user} onNavigate={onNavigate} key={`dash-${refreshKey}`} language={language} />;
        case View.Directory: return <EmployeeDirectory user={user} onAddClick={onOpenEmployeeModal} onEditClick={onEditEmployee} key={`dir-${refreshKey}`} language={language} />;
        case View.Insights: return <AiInsights key={`ai-${refreshKey}`} />;
        case View.Compliance: return <ComplianceView key={`comp-${refreshKey}`} />;
        case View.Profile: return <ProfileView user={user} key={`profile-${refreshKey}`} />;
        case View.Leaves: return <LeaveManagement user={user} key={`leaves-${refreshKey}`} />;
        case View.Payroll: return <PayrollView user={user} key={`pay-${refreshKey}`} />;
        case View.Settlement: return <SettlementView key={`settle-${refreshKey}`} />;
        case View.Attendance: return <AttendanceView user={user} key={`attend-${refreshKey}`} />;
        case View.AdminCenter: return <AdminCenter key={`admin-${refreshKey}`} />;
        case View.Whitepaper: return <Whitepaper key={`wp-${refreshKey}`} />;
        case View.Mandoob: return <MandoobDashboard key={`mandoob-${refreshKey}`} />;
        case View.Finance: return <FinanceMappingSettings key={`finance-${refreshKey}`} />;
        case View.Management: return <ManagementDashboard key={`manage-${refreshKey}`} />;
        case View.UserManagement: return <UserManagement key={`user-${refreshKey}`} />;
        default: return null;
    }
};

export default ViewRenderer;
