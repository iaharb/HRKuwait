import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { dbService } from '../services/dbService.ts';
import { Employee, UserRole, View } from '../types/types';
import { STANDARD_ROLES } from '../constants.tsx';
import { useTranslation } from 'react-i18next';
import AISearchBar from './AISearchBar.tsx';

export const UserManagement: React.FC = () => {
    const { t } = useTranslation();
    const [systemUsers, setSystemUsers] = useState<any[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [aiFilteredIds, setAiFilteredIds] = useState<string[] | null>(null);
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [selectedRole, setSelectedRole] = useState<UserRole>('Employee');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isSetupNeeded, setIsSetupNeeded] = useState(false);
    const [activeTab, setActiveTab] = useState<'users' | 'permissions' | 'requests'>('users');
    const [profileRequests, setProfileRequests] = useState<any[]>([]);
    const [rolePermissions, setRolePermissions] = useState<any[]>([]);
    const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<UserRole>('Admin');
    const [updatingPermission, setUpdatingPermission] = useState<string | null>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [applyingTemplate, setApplyingTemplate] = useState(false);
    const [isProvisioning, setIsProvisioning] = useState<string | null>(null);
    const [authUsers, setAuthUsers] = useState<any[]>([]);

    const roles = STANDARD_ROLES.map(r => r.id as UserRole);

    const availableViews = Object.values(View);

    const loadData = async () => {
        setLoading(true);
        try {
            const emps = await dbService.getEmployees();
            setEmployees(emps);

            const users = await dbService.getAppUsers();
            setSystemUsers(users);

            const perms = await dbService.getRolePermissions();
            setRolePermissions(perms);

            const tmpls = await dbService.getPermissionTemplates();
            setTemplates(tmpls);

            const requests = await dbService.getProfileUpdateRequests();
            setProfileRequests(requests);

            if (supabase) {
                const { data: { users } } = await supabase.auth.admin.listUsers();
                setAuthUsers(users || []);
            }

            setIsSetupNeeded(false);
        } catch (err: any) {
            console.error("User management load error:", err);
            const msg = (err.message || '').toLowerCase();
            if (msg.includes('app_users') || msg.includes('role_permissions') || msg.includes('permission_templates') || msg.includes('not found') || msg.includes('cache')) {
                setIsSetupNeeded(true);
            }
        }
        setLoading(false);
    };

    const handleInitializeSystem = async () => {
        setLoading(true);
        try {
            const sql = `
                CREATE TABLE IF NOT EXISTS app_users (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    username TEXT UNIQUE NOT NULL,
                    password TEXT NOT NULL, 
                    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
                    role TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
                );
                ALTER TABLE app_users DISABLE ROW LEVEL SECURITY;
                GRANT ALL ON TABLE app_users TO anon, authenticated, service_role;
                INSERT INTO app_users (username, password, role)
                VALUES ('superadmin', 'admin@2026', 'Admin')
                ON CONFLICT (username) DO NOTHING;
                
                CREATE TABLE IF NOT EXISTS role_permissions (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    role TEXT NOT NULL,
                    view_id TEXT NOT NULL,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
                    UNIQUE(role, view_id)
                );
                ALTER TABLE role_permissions DISABLE ROW LEVEL SECURITY;
                GRANT ALL ON TABLE role_permissions TO anon, authenticated, service_role;

                CREATE TABLE IF NOT EXISTS permission_templates (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    template_name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    permissions JSONB NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
                );
                ALTER TABLE permission_templates DISABLE ROW LEVEL SECURITY;
                GRANT ALL ON TABLE permission_templates TO anon, authenticated, service_role;

                INSERT INTO permission_templates (template_name, description, permissions) VALUES
                ('Super Admin', 'Full access to all modules and security settings.', '{"dashboard": true, "admin-center": true, "mandoob": true, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": true, "settlement": true, "finance": true, "management": true, "insights": true, "compliance": true, "whitepaper": true, "user-management": true}'),
                ('HR Manager', 'Comprehensive HR management access excluding security.', '{"dashboard": true, "admin-center": true, "mandoob": true, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": true, "finance": false, "management": true, "insights": true, "compliance": true, "whitepaper": true, "user-management": false}'),
                ('Payroll Manager', 'Dedicated access to financial and payroll modules.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": true, "settlement": true, "finance": true, "management": false, "insights": true, "compliance": false, "whitepaper": false, "user-management": false}'),
                ('Dept Manager', 'Department-level management focusing on team operations.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": false, "finance": false, "management": true, "insights": true, "compliance": false, "whitepaper": false, "user-management": false}'),
                ('Executive', 'Strategic overview and high-level insights.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": false, "finance": false, "management": true, "insights": true, "compliance": true, "whitepaper": true, "user-management": false}'),
                ('Standard Employee', 'Basic access to personal tools and company directory.', '{"dashboard": true, "admin-center": false, "mandoob": false, "profile": true, "attendance": true, "leaves": true, "directory": true, "payroll": false, "settlement": false, "finance": false, "management": false, "insights": false, "compliance": false, "whitepaper": false, "user-management": false}')
                ON CONFLICT (template_name) DO UPDATE SET permissions = EXCLUDED.permissions;
                
                -- Force Supabase cache reload
                NOTIFY pgrst, 'reload schema';
            `;

            if (dbService.isLive()) {
                await supabase?.rpc('run_sql', { sql_query: sql });
                alert("System initialized and cache reloaded successfully.");
                loadData();
            }
        } catch (err: any) {
            console.error("Initialization error:", err);
            alert("Initialization failed: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePermission = async (role: string, viewId: string, currentStatus: boolean) => {
        setUpdatingPermission(`${role}-${viewId}`);
        try {
            const result = await dbService.updateRolePermission(role, viewId, !currentStatus);
            if (result.success) {
                setRolePermissions(prev => {
                    const existing = prev.find(p => p.role === role && p.view_id === viewId);
                    if (existing) {
                        return prev.map(p => (p.role === role && p.view_id === viewId) ? { ...p, is_active: !currentStatus } : p);
                    } else {
                        return [...prev, { role, view_id: viewId, is_active: !currentStatus }];
                    }
                });
            }
        } finally {
            setUpdatingPermission(null);
        }
    };

    const handleApplyTemplate = async (templateId: string) => {
        const tmpl = templates.find(t => t.id === templateId);
        if (!tmpl) return;

        if (!window.confirm(`Apply "${tmpl.template_name}" template to ${selectedRoleForPermissions}? This will overwrite existing permissions for this role.`)) return;

        setApplyingTemplate(true);
        try {
            const result = await dbService.applyPermissionTemplate(selectedRoleForPermissions, tmpl.permissions);
            if (result.success) {
                const allPerms = await dbService.getRolePermissions();
                setRolePermissions(allPerms);
                alert("Template applied successfully.");
            } else {
                alert("Failed to apply template: " + result.message);
            }
        } finally {
            setApplyingTemplate(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleUpgrade = async () => {
        if (!username || !password) return alert("Credentials required");
        const result = await dbService.createAppUser({ username, password, role: selectedRole, employee_id: selectedEmployee?.id });
        if (result.success) {
            setShowUpgradeModal(false);
            setSelectedEmployee(null);
            setUsername('');
            setPassword('');
            setTimeout(() => loadData(), 300);
        } else alert(result.message);
    };

    const handleUpdateRole = async (userId: string, newRole: UserRole) => {
        const result = await dbService.updateAppUserRole(userId, newRole);
        if (result.success) loadData();
    };

    const handleDeleteUser = async (userId: string) => {
        if (window.confirm("Revoke access?")) {
            const result = await dbService.deleteAppUser(userId);
            if (result.success) loadData();
        }
    };

    const handleProvision = async (emp: Employee) => {
        setIsProvisioning(emp.id);
        const res = await dbService.provisionAuthUser(emp);
        if (res.success) {
            alert(res.message);
            loadData();
        } else {
            alert("Provisioning failed: " + res.message);
        }
        setIsProvisioning(null);
    };

    const filteredEmployees = employees.filter(emp => {
        if (systemUsers.some(u => u.employee_id === emp.id)) return false;
        if (aiFilteredIds !== null) return aiFilteredIds.includes(emp.id);
        return emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || emp.id.includes(searchQuery.toLowerCase());
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)', animation: 'fade-in 0.6s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 600 }}>System Access Control</h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>Manage administrative roles, auth credentials, and feature-level permissions.</p>
                </div>
                {!isSetupNeeded && (
                    <button 
                        onClick={() => { setSelectedEmployee(null); setShowUpgradeModal(true); }}
                        className="cds--btn cds--btn--primary cds--btn--sm"
                    >
                        Create Root Admin
                    </button>
                )}
            </div>

            {isSetupNeeded ? (
                <div className="cds--tile" style={{ padding: 'var(--cds-spacing-08)', textAlign: 'center', background: 'var(--cds-support-error-inverse)', color: 'white' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 'var(--cds-spacing-04)' }}>Registry Initialization Required</h3>
                    <p style={{ marginBottom: 'var(--cds-spacing-06)', opacity: 0.9 }}>Security tables not found in active database instance.</p>
                    <button onClick={handleInitializeSystem} disabled={loading} className="cds--btn cds--btn--secondary">
                        {loading ? 'Initializing...' : 'Synthesize Tables'}
                    </button>
                </div>
            ) : (
                <>
                    <div className="cds--tabs" style={{ marginBottom: 'var(--cds-spacing-05)', background: 'var(--cds-background)', borderBottom: '1px solid var(--cds-border-subtle)' }}>
                        <ul className="cds--tabs__nav" style={{ display: 'flex', gap: '2px', padding: 0, margin: 0, listStyle: 'none' }}>
                            {[
                                { id: 'users', label: 'Authorized Users', icon: '👤' },
                                { id: 'permissions', label: 'Modular Permissions', icon: '🔐' },
                                { id: 'requests', label: `Service Requests (${profileRequests.filter(r => r.status === 'PENDING').length})`, icon: '✉️' }
                            ].map(tab => (
                                <li key={tab.id} className={`cds--tabs__nav-item ${activeTab === tab.id ? 'cds--tabs__nav-item--selected' : ''}`} style={{ flex: '1 0 auto' }}>
                                    <button
                                        onClick={() => setActiveTab(tab.id as any)}
                                        style={{
                                            width: '100%',
                                            height: '32px',
                                            padding: '0 var(--cds-spacing-05)',
                                            fontSize: '0.875rem',
                                            fontWeight: activeTab === tab.id ? 600 : 400,
                                            background: activeTab === tab.id ? 'var(--cds-layer-01)' : 'transparent',
                                            color: activeTab === tab.id ? 'var(--cds-text-primary)' : 'var(--cds-text-secondary)',
                                            border: 'none',
                                            borderBottom: activeTab === tab.id ? '2px solid var(--cds-interactive-01)' : '2px solid transparent',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 'var(--cds-spacing-03)',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <span>{tab.icon}</span>
                                        {tab.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {activeTab === 'requests' && (
                        <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                            <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Profile Change Requests</h3>
                                <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)', marginTop: '4px' }}>Verification required for employee-initiated data updates.</p>
                            </div>
                            <table className="cds--data-table cds--data-table--short">
                                <thead>
                                    <tr>
                                        <th>Employee</th>
                                        <th>Field</th>
                                        <th>Value Delta</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {profileRequests.length === 0 ? (
                                        <tr><td colSpan={4} style={{ textAlign: 'center', padding: 'var(--cds-spacing-08)', color: 'var(--cds-text-disabled)' }}>No pending requests.</td></tr>
                                    ) : (
                                        profileRequests.map((req) => (
                                            <tr key={req.id}>
                                                <td>
                                                    <p style={{ fontWeight: 600 }}>{req.employees?.name}</p>
                                                    <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>ID: {req.employee_id.slice(0, 8)}</p>
                                                </td>
                                                <td><span className="cds--tag cds--tag--blue cds--tag--sm">{req.field_name}</span></td>
                                                <td style={{ fontSize: '0.75rem' }}>
                                                    <span style={{ textDecoration: 'line-through', color: 'var(--cds-text-disabled)', marginRight: '8px' }}>{req.old_value || '—'}</span>
                                                    <span style={{ color: 'var(--cds-support-success)', fontWeight: 600 }}>{req.new_value}</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {req.status === 'PENDING' ? (
                                                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                                            <button 
                                                                onClick={async () => { await dbService.approveProfileUpdate(req.id, 'HR_LEAD'); loadData(); }} 
                                                                className="cds--btn cds--btn--primary cds--btn--sm"
                                                            >Approve</button>
                                                            <button 
                                                                onClick={async () => { const reason = prompt("Reason:"); if (reason) { await dbService.rejectProfileUpdate(req.id, reason); loadData(); } }} 
                                                                className="cds--btn cds--btn--ghost cds--btn--sm cds--btn--danger"
                                                            >Reject</button>
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.625rem', fontWeight: 600, color: req.status === 'APPROVED' ? 'var(--cds-support-success)' : 'var(--cds-support-error)' }}>{req.status}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {activeTab === 'users' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-07)' }}>
                            <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', background: 'var(--cds-background)' }}>
                                <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)' }}>
                                    <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Portal Registry Users</h3>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)', marginTop: '4px' }}>Users with granted system access roles.</p>
                                </div>
                                <table className="cds--data-table cds--data-table--short">
                                    <thead>
                                        <tr>
                                            <th>Employee / Context</th>
                                            <th>Identifier</th>
                                            <th>Role Assignment</th>
                                            <th style={{ textAlign: 'right' }}>Management</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {systemUsers.map((user) => (
                                            <tr key={user.id}>
                                                <td>
                                                    <p style={{ fontWeight: 600 }}>{user.employees?.name || 'Administrative Node'}</p>
                                                    <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>{user.employees?.department || 'SYSTEM'}</p>
                                                </td>
                                                <td style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{user.username}</td>
                                                <td>
                                                    <select 
                                                        value={user.role} 
                                                        onChange={(e) => handleUpdateRole(user.id, e.target.value as UserRole)}
                                                        style={{ height: '24px', fontSize: '0.75rem', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', outline: 'none' }}
                                                    >
                                                        {STANDARD_ROLES.map(r => <option key={r.id} value={r.id}>{r.en}</option>)}
                                                    </select>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button onClick={() => handleDeleteUser(user.id)} className="cds--btn cds--btn--ghost cds--btn--sm cds--btn--danger">Revoke</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 'var(--cds-spacing-07)' }}>
                                <div className="cds--tile" style={{ background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)', padding: 'var(--cds-spacing-06)' }}>
                                    <h4 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--cds-spacing-05)', color: 'var(--cds-text-primary)' }}>Provisioning Engine</h4>
                                    <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)', marginBottom: 'var(--cds-spacing-06)' }}>Upgrade standard workforce records to authorized system actors.</p>
                                    <AISearchBar
                                        data={employees.filter(e => !systemUsers.some(u => u.employee_id === e.id))}
                                        onFilter={setAiFilteredIds}
                                        placeholder="Scan Registry..."
                                        contextMessage="USER_MANAGEMENT_SCAN - Finding employees for auth upgrades."
                                        extractInfo={emp => `${emp.name} | ${emp.department} | ${emp.position}`}
                                        onQueryChange={(q) => setSearchQuery(q)}
                                        initialValue={searchQuery}
                                    />
                                </div>
                                <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)', maxHeight: '400px', overflowY: 'auto' }}>
                                    <table className="cds--data-table cds--data-table--short cds--data-table--zebra">
                                        <thead>
                                            <tr>
                                                <th>Worker</th>
                                                <th style={{ textAlign: 'right' }}>Provisioning</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredEmployees.map(emp => {
                                                const isAuth = authUsers.some(au => au.email === (emp.email || `${emp.name.split(' ')[0].toLowerCase()}@test.com`));
                                                return (
                                                    <tr key={emp.id}>
                                                        <td>
                                                            <p style={{ fontWeight: 600, fontSize: '0.75rem' }}>{emp.name}</p>
                                                            <p style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>{emp.position} • {emp.department}</p>
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                                                                <button
                                                                    onClick={() => handleProvision(emp)}
                                                                    disabled={isProvisioning === emp.id}
                                                                    className={`cds--btn cds--btn--sm ${isAuth ? 'cds--btn--ghost' : 'cds--btn--secondary'}`}
                                                                >
                                                                    {isProvisioning === emp.id ? '...' : (isAuth ? 'Reset' : 'Auth')}
                                                                </button>
                                                                <button onClick={() => { setSelectedEmployee(emp); setUsername(emp.email || emp.name.split(' ')[0].toLowerCase() + emp.id.slice(-4)); setShowUpgradeModal(true); }} className="cds--btn cds--btn--primary cds--btn--sm">Grant</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'permissions' && (
                        <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 'var(--cds-spacing-07)', animation: 'slide-up 0.4s ease' }}>
                            <div className="cds--tile" style={{ padding: 'var(--cds-spacing-05)', border: '1px solid var(--cds-border-subtle)' }}>
                                <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)', textTransform: 'uppercase', marginBottom: 'var(--cds-spacing-05)', letterSpacing: '0.05em' }}>Security Roles</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {roles.map(r => (
                                        <button 
                                            key={r} 
                                            onClick={() => setSelectedRoleForPermissions(r)} 
                                            style={{
                                                textAlign: 'left',
                                                padding: 'var(--cds-spacing-03) var(--cds-spacing-04)',
                                                fontSize: '0.75rem',
                                                background: selectedRoleForPermissions === r ? 'var(--cds-interactive-01)' : 'transparent',
                                                color: selectedRoleForPermissions === r ? 'white' : 'var(--cds-text-primary)',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: selectedRoleForPermissions === r ? 600 : 400
                                            }}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="cds--tile" style={{ padding: 0, border: '1px solid var(--cds-border-subtle)' }}>
                                <div style={{ padding: 'var(--cds-spacing-05)', borderBottom: '1px solid var(--cds-border-subtle)', background: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>Capability Matrix: {selectedRoleForPermissions}</h3>
                                        <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-primary)', marginTop: '4px' }}>Toggle module access for this role.</p>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '0.625rem', fontWeight: 600 }}>TEMPLATE:</span>
                                        <select
                                            disabled={applyingTemplate}
                                            onChange={(e) => {
                                                if (e.target.value === 'seed') handleInitializeSystem();
                                                else if (e.target.value) handleApplyTemplate(e.target.value);
                                            }}
                                            style={{ height: '32px', fontSize: '0.75rem', background: 'var(--cds-background)', border: '1px solid var(--cds-border-subtle)', outline: 'none' }}
                                        >
                                            <option value="">Apply Configuration...</option>
                                            {templates.map(t => <option key={t.id} value={t.id}>{t.template_name}</option>)}
                                            {templates.length === 0 && <option value="seed">Restore Defaults</option>}
                                        </select>
                                    </div>
                                </div>
                                <div style={{ padding: 'var(--cds-spacing-05)', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--cds-spacing-03)' }}>
                                    {availableViews.map(v => {
                                        const isEnabled = rolePermissions.some(ps => ps.role === selectedRoleForPermissions && ps.view_id === v && ps.is_active !== false);
                                        const isUpdating = updatingPermission === `${selectedRoleForPermissions}-${v}`;
                                        return (
                                            <div 
                                                key={v} 
                                                onClick={() => !isUpdating && handleTogglePermission(selectedRoleForPermissions, v, isEnabled)} 
                                                style={{
                                                    padding: 'var(--cds-spacing-04)',
                                                    border: '1px solid var(--cds-border-subtle)',
                                                    background: isEnabled ? 'var(--cds-layer-01)' : 'var(--cds-background)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    opacity: isUpdating ? 0.5 : 1
                                                }}
                                            >
                                                <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>{v.replace(/-/g, ' ')}</span>
                                                <div style={{ 
                                                    width: '32px', 
                                                    height: '16px', 
                                                    borderRadius: '8px', 
                                                    background: isEnabled ? 'var(--cds-interactive-01)' : 'var(--cds-text-disabled)',
                                                    position: 'relative'
                                                }}>
                                                    <div style={{
                                                        width: '12px',
                                                        height: '12px',
                                                        borderRadius: '50%',
                                                        background: 'white',
                                                        position: 'absolute',
                                                        top: '2px',
                                                        left: isEnabled ? '18px' : '2px',
                                                        transition: 'all 0.2s'
                                                    }}></div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {showUpgradeModal && (
                <div className="cds--modal is-visible" style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}>
                    <div className="cds--modal-container" style={{ width: '400px', background: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
                        <div className="cds--modal-header" style={{ padding: 'var(--cds-spacing-06)', borderBottom: '1px solid var(--cds-border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
                            <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{selectedEmployee ? `Upgrade: ${selectedEmployee.name}` : 'Create Security Account'}</h3>
                            <button onClick={() => setShowUpgradeModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                        </div>
                        <div className="cds--modal-content" style={{ padding: 'var(--cds-spacing-07)', display: 'flex', flexDirection: 'column', gap: 'var(--cds-spacing-05)' }}>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: '4px' }}>Username</label>
                                <input className="cds--text-input" value={username} onChange={e => setUsername(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: '4px' }}>Initial Password</label>
                                <input className="cds--text-input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: '4px' }}>System Role</label>
                                <select className="cds--select-input" value={selectedRole} onChange={e => setSelectedRole(e.target.value as UserRole)}>
                                    {STANDARD_ROLES.map(r => <option key={r.id} value={r.id}>{r.en}</option>)}
                                </select>
                            </div>
                        </div>
                        <div className="cds--modal-footer" style={{ padding: 'var(--cds-spacing-06)', display: 'flex', gap: '8px' }}>
                            <button onClick={() => setShowUpgradeModal(false)} className="cds--btn cds--btn--secondary" style={{ flex: 1 }}>Cancel</button>
                            <button onClick={handleUpgrade} className="cds--btn cds--btn--primary" style={{ flex: 1 }}>Commit Access</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
