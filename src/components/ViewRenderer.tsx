
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

    return (
        <Routes>
            <Route path="/" element={<Navigate to={defaultRoute} replace />} />
            <Route path="/dashboard" element={<Dashboard user={user} onNavigate={onNavigate} key={`dash-${refreshKey}`} language={language} />} />
            <Route path="/directory" element={<EmployeeDirectory user={user} onAddClick={onOpenEmployeeModal} onEditClick={onEditEmployee} key={`dir-${refreshKey}`} language={language} />} />
            <Route path="/insights" element={<AiInsights key={`ai-${refreshKey}`} />} />
            <Route path="/compliance" element={<ComplianceView key={`comp-${refreshKey}`} />} />
            <Route path="/profile" element={<ProfileView user={user} key={`profile-${refreshKey}`} />} />
            <Route path="/leaves" element={<LeaveManagement user={user} key={`leaves-${refreshKey}`} />} />
            <Route path="/payroll" element={<PayrollView user={user} key={`pay-${refreshKey}`} />} />
            <Route path="/settlement" element={<SettlementView key={`settle-${refreshKey}`} />} />
            <Route path="/attendance" element={<AttendanceView user={user} key={`attend-${refreshKey}`} />} />
            <Route path="/admincenter" element={<AdminCenter key={`admin-${refreshKey}`} />} />
            <Route path="/whitepaper" element={<Whitepaper key={`wp-${refreshKey}`} />} />
            <Route path="/mandoob" element={<MandoobDashboard key={`mandoob-${refreshKey}`} />} />
            <Route path="/finance" element={<FinanceMappingSettings key={`finance-${refreshKey}`} />} />
            <Route path="/management" element={<ManagementDashboard key={`manage-${refreshKey}`} />} />
            <Route path="/usermanagement" element={<UserManagement key={`user-${refreshKey}`} />} />
            {/* 404 handling - redirect to default */}
            <Route path="*" element={<Navigate to={defaultRoute} replace />} />
        </Routes>
    );
};

export default ViewRenderer;
