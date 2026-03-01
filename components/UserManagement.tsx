import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient.ts';
import { dbService } from '../services/dbService.ts';
import { Employee, UserRole, View } from '../types.ts';
import { useTranslation } from 'react-i18next';

export const UserManagement: React.FC = () => {
    const { t } = useTranslation();
    const [systemUsers, setSystemUsers] = useState<any[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [showUpgradeModal, setShowUpgradeModal] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [selectedRole, setSelectedRole] = useState<UserRole>('Employee');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isSetupNeeded, setIsSetupNeeded] = useState(false);
    const [activeTab, setActiveTab] = useState<'users' | 'permissions'>('users');
    const [rolePermissions, setRolePermissions] = useState<any[]>([]);
    const [selectedRoleForPermissions, setSelectedRoleForPermissions] = useState<UserRole>('Admin');
    const [updatingPermission, setUpdatingPermission] = useState<string | null>(null);
    const [templates, setTemplates] = useState<any[]>([]);
    const [applyingTemplate, setApplyingTemplate] = useState(false);

    const roles: UserRole[] = [
        'Admin',
        'HR',
        'HR Officer',
        'HR Manager',
        'Payroll Officer',
        'Payroll Manager',
        'Manager',
        'Executive',
        'Mandoob',
        'Employee'
    ];

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

    const filteredEmployees = employees.filter(emp =>
        !systemUsers.some(u => u.employee_id === emp.id) &&
        (emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || emp.id.includes(searchQuery))
    );

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">System Access Control</h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Manage administrative roles and feature permissions.</p>
                </div>
                {!isSetupNeeded && (
                    <button onClick={() => { setSelectedEmployee(null); setShowUpgradeModal(true); }} className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/20 hover:bg-slate-900 transition-all active:scale-95">
                        + Create Standalone Admin
                    </button>
                )}
            </div>

            {isSetupNeeded ? (
                <div className="bg-rose-50 border border-rose-100 p-8 rounded-[32px] text-center space-y-4">
                    <h3 className="text-rose-900 font-bold">System Setup Required</h3>
                    <button onClick={handleInitializeSystem} disabled={loading} className="bg-rose-600 text-white px-8 py-3 rounded-2xl font-bold hover:bg-rose-700 transition-all">
                        {loading ? 'Initializing...' : 'Initialize System Tables'}
                    </button>
                </div>
            ) : (
                <>
                    <div className="flex gap-4 border-b border-slate-200">
                        <button onClick={() => setActiveTab('users')} className={`pb-4 px-2 text-sm font-bold transition-all relative ${activeTab === 'users' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                            User Accounts
                            {activeTab === 'users' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full"></div>}
                        </button>
                        <button onClick={() => setActiveTab('permissions')} className={`pb-4 px-2 text-sm font-bold transition-all relative ${activeTab === 'permissions' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
                            Role Feature Permissions
                            {activeTab === 'permissions' && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-600 rounded-full"></div>}
                        </button>
                    </div>

                    {activeTab === 'users' ? (
                        <>
                            <div className="bg-white rounded-[32px] border border-slate-200/60 overflow-hidden shadow-sm">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/30">
                                                <th className="px-6 py-4">User / Employee</th>
                                                <th className="px-6 py-4">Username</th>
                                                <th className="px-6 py-4">System Role</th>
                                                <th className="px-6 py-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 font-medium">
                                            {systemUsers.map((user) => (
                                                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div>
                                                            <p className="text-slate-900 font-bold">{user.employees?.name || 'Admin'}</p>
                                                            <p className="text-[10px] text-slate-400 uppercase">{user.employees?.department || 'System'}</p>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-slate-500 font-mono text-sm">{user.username}</td>
                                                    <td className="px-6 py-4">
                                                        <select value={user.role} onChange={(e) => handleUpdateRole(user.id, e.target.value as UserRole)} className="bg-slate-100 rounded-lg px-3 py-1.5 text-xs font-bold outline-none">
                                                            {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                                        </select>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <button onClick={() => handleDeleteUser(user.id)} className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all">Revoke</button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="md:col-span-1">
                                    <div className="bg-slate-900 text-white p-8 rounded-[32px] shadow-xl h-full">
                                        <h4 className="text-xl font-black mb-2">Upgrade Workforce</h4>
                                        <p className="text-slate-400 text-sm mb-6">Grant portal access to employees.</p>
                                        <input type="text" placeholder="Search..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-3 text-sm" />
                                    </div>
                                </div>
                                <div className="md:col-span-2 bg-white rounded-[32px] border border-slate-200/60 p-6 max-h-[400px] overflow-y-auto custom-scrollbar space-y-3">
                                    {filteredEmployees.map(emp => (
                                        <div key={emp.id} className="flex justify-between items-center p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all">
                                            <div>
                                                <p className="font-bold text-slate-800">{emp.name}</p>
                                                <p className="text-[10px] text-slate-400 uppercase">{emp.position} • {emp.department}</p>
                                            </div>
                                            <button onClick={() => { setSelectedEmployee(emp); setUsername(emp.name.split(' ')[0].toLowerCase() + emp.id.slice(-4)); setShowUpgradeModal(true); }} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all">Upgrade</button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="bg-white rounded-[32px] border border-slate-200/60 p-10 shadow-sm animate-in slide-in-from-bottom-4 duration-500">
                            <div className="flex flex-col md:flex-row gap-8">
                                <div className="md:w-1/3 space-y-6">
                                    <h3 className="text-xl font-black text-slate-900">Feature Access</h3>
                                    <div className="grid grid-cols-1 gap-2">
                                        {roles.map(r => (
                                            <button key={r} onClick={() => setSelectedRoleForPermissions(r)} className={`text-start px-5 py-3.5 rounded-2xl text-xs font-bold transition-all border ${selectedRoleForPermissions === r ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg' : 'bg-slate-50 text-slate-600 border-slate-100 hover:bg-slate-100'}`}>
                                                {r}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="md:w-2/3">
                                    <div className="bg-slate-50/50 rounded-[24px] border border-slate-100 overflow-hidden">
                                        <div className="p-6 bg-white border-b border-slate-100 flex justify-between items-center">
                                            <h4 className="font-black text-slate-800 text-[10px] uppercase tracking-widest">Modules for {selectedRoleForPermissions}</h4>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">Apply Template:</span>
                                                <select
                                                    disabled={applyingTemplate || templates.length === 0}
                                                    onChange={(e) => e.target.value && handleApplyTemplate(e.target.value)}
                                                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-[10px] font-black outline-none focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    <option value="">Select Template...</option>
                                                    {templates.map(t => (
                                                        <option key={t.id} value={t.id}>{t.template_name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto custom-scrollbar">
                                            {availableViews.map(v => {
                                                const isEnabled = rolePermissions.some(ps => ps.role === selectedRoleForPermissions && ps.view_id === v && ps.is_active !== false);
                                                const isUpdating = updatingPermission === `${selectedRoleForPermissions}-${v}`;
                                                return (
                                                    <div key={v} onClick={() => !isUpdating && handleTogglePermission(selectedRoleForPermissions, v, isEnabled)} className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer border transition-all ${isEnabled ? 'bg-white border-indigo-100 shadow-sm' : 'bg-slate-50/50 border-transparent opacity-60'}`}>
                                                        <span className="text-xs font-bold capitalize">{v.replace('-', ' ')}</span>
                                                        <div className={`w-8 h-4 rounded-full relative ${isEnabled ? 'bg-indigo-500' : 'bg-slate-300'}`}>
                                                            <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isEnabled ? 'right-0.5' : 'left-0.5'} ${isUpdating ? 'animate-pulse' : ''}`}></div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {showUpgradeModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10 relative">
                        <h3 className="text-2xl font-black mb-8">{selectedEmployee ? `Upgrade: ${selectedEmployee.name}` : 'New System User'}</h3>
                        <div className="space-y-6">
                            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="w-full bg-slate-50 border rounded-2xl px-6 py-4 font-bold outline-none" />
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full bg-slate-50 border rounded-2xl px-6 py-4 font-bold outline-none" />
                            <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value as UserRole)} className="w-full bg-slate-50 border rounded-2xl px-6 py-4 font-bold outline-none">
                                {roles.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            <div className="flex gap-4 pt-4">
                                <button onClick={() => setShowUpgradeModal(false)} className="flex-1 bg-slate-100 font-bold py-4 rounded-2xl">Cancel</button>
                                <button onClick={handleUpgrade} className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/30">Commit</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
