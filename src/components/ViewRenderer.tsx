
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
    const isAdminOrHr = ['Admin', 'HR', 'HR Manager', 'HR Officer'].includes(user.role);
    const isAdmin = user.role === 'Admin';
    const isMandoob = user.role === 'Mandoob';

    return (
        <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />
            <Route path="/dashboard" element={<Dashboard user={user} onNavigate={onNavigate} key={`dash-${refreshKey}`} language={language} />} />
            <Route path="/directory" element={<EmployeeDirectory user={user} onAddClick={onOpenEmployeeModal} onEditClick={onEditEmployee} key={`dir-${refreshKey}`} language={language} />} />
            <Route path="/insights" element={isAdminOrHr ? <AiInsights key={`ai-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/compliance" element={isAdminOrHr ? <ComplianceView key={`comp-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/profile" element={<ProfileView user={user} key={`profile-${refreshKey}`} />} />
            <Route path="/leaves" element={<LeaveManagement user={user} key={`leaves-${refreshKey}`} />} />
            <Route path="/payroll" element={isAdminOrHr ? <PayrollView user={user} key={`pay-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/settlement" element={isAdminOrHr ? <SettlementView key={`settle-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/attendance" element={<AttendanceView user={user} key={`attend-${refreshKey}`} />} />
            <Route path="/admin-center" element={isAdminOrHr ? <AdminCenter key={`admin-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/whitepaper" element={isAdminOrHr ? <Whitepaper key={`wp-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/mandoob" element={(isAdminOrHr || isMandoob) ? <MandoobDashboard key={`mandoob-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/finance" element={isAdminOrHr ? <FinanceMappingSettings key={`finance-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/management" element={isAdminOrHr ? <ManagementDashboard key={`manage-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/user-management" element={isAdmin ? <UserManagement key={`user-${refreshKey}`} /> : <Navigate to={defaultRoute} replace />} />
            <Route path="/approvals" element={<ApprovalsView user={user} key={`approvals-${refreshKey}`} />} />
            {/* 404 handling - redirect to default */}
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
    );
};

export default ViewRenderer;
