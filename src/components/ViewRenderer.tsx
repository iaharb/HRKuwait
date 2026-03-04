
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
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
import { ApprovalsView } from './ApprovalsView.tsx';
import PerformanceView from './PerformanceView.tsx';
import ProfitSharingView from './ProfitSharingView.tsx';

interface ViewRendererProps {
    user: User;
    language: 'en' | 'ar';
    refreshKey: number;
    onNavigate: (view: View) => void;
    onOpenEmployeeModal: () => void;
    onEditEmployee: (emp: any) => void;
}

const ViewRenderer: React.FC<ViewRendererProps> = ({
    user,
    language,
    refreshKey,
    onNavigate,
    onOpenEmployeeModal,
    onEditEmployee
}) => {
    const defaultRoute = user.role === 'Employee' ? '/profile' : '/dashboard';

    const isHrOrAdmin = ['Admin', 'HR', 'HR Manager', 'HR Officer'].includes(user.role);
    const isExecutiveOrAdmin = ['Admin', 'Executive'].includes(user.role);
    const isPayrollOrAdmin = ['Admin', 'Payroll Manager', 'Payroll Officer', 'HR Manager', 'HR', 'Executive'].includes(user.role);
    const isAdmin = user.role === 'Admin';

    // Check if role has "Managerial" aspects
    const isManagerial = ['Admin', 'Manager', 'Executive', 'HR Manager', 'Payroll Manager', 'HR'].includes(user.role);

    return (
        <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />

            {/* --- Base Employee Views (All Roles) --- */}
            <Route path="/profile" element={<ProfileView user={user} key={`profile-${refreshKey}`} />} />
            <Route path="/attendance" element={<AttendanceView user={user} key={`attend-${refreshKey}`} />} />
            <Route path="/leaves" element={<LeaveManagement user={user} key={`leaves-${refreshKey}`} />} />

            {/* --- Dashboards --- */}
            <Route path="/dashboard" element={user.role !== 'Employee' ? <Dashboard user={user} onNavigate={onNavigate} key={`dash-${refreshKey}`} language={language} /> : <Navigate to={defaultRoute} replace />} />

            {/* --- Management & Approvals --- */}
            <Route path="/approvals" element={isManagerial || ['HR Officer'].includes(user.role) ? <ApprovalsView user={user} key={`approvals-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/performance" element={isManagerial ? <PerformanceView user={user} key={`perf-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />

            {/* --- HR Ops --- */}
            <Route path="/directory" element={isHrOrAdmin || user.role === 'Manager' ? <EmployeeDirectory user={user} onAddClick={onOpenEmployeeModal} onEditClick={onEditEmployee} key={`dir-${refreshKey}`} language={language} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/mandoob" element={isHrOrAdmin || user.role === 'Mandoob' ? <MandoobDashboard key={`mandoob-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/admin-center" element={isHrOrAdmin ? <AdminCenter key={`admin-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/compliance" element={isHrOrAdmin || isExecutiveOrAdmin ? <ComplianceView key={`comp-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />

            {/* --- Payroll & Finance --- */}
            <Route path="/payroll" element={isPayrollOrAdmin ? <PayrollView user={user} key={`pay-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/settlement" element={isHrOrAdmin || ['Payroll Manager', 'Payroll Officer'].includes(user.role) ? <SettlementView key={`settle-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/finance" element={isPayrollOrAdmin ? <FinanceMappingSettings key={`finance-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/profit-sharing" element={isExecutiveOrAdmin || ['HR', 'HR Manager', 'Payroll Manager'].includes(user.role) ? <ProfitSharingView user={user} key={`profit-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />

            {/* --- Global Strategy --- */}
            <Route path="/management" element={isExecutiveOrAdmin || isManagerial ? <ManagementDashboard key={`manage-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/insights" element={isExecutiveOrAdmin || ['Manager', 'HR', 'HR Manager'].includes(user.role) ? <AiInsights key={`ai-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/whitepaper" element={isExecutiveOrAdmin || isHrOrAdmin ? <Whitepaper key={`wp-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/user-management" element={isAdmin ? <UserManagement key={`user-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />

            {/* 404 handling */}
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
    );
};

export default ViewRenderer;
