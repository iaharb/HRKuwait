
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

    const roles: UserRole[] = [
        'Admin',
        'HR Officer',
        'HR Manager',
        'Payroll Officer',
        'Payroll Manager',
        'Manager',
        'Executive',
        'Mandoob',
        'Employee'
    ];

    const loadData = async () => {
        setLoading(true);
        try {
            // First check if employees exist to ensure general DB health
            const emps = await dbService.getEmployees();
            setEmployees(emps);

            // Fetch system users separately
            const users = await dbService.getAppUsers();
            setSystemUsers(users);
            setIsSetupNeeded(false);
        } catch (err: any) {
            console.error("User management load error:", err);
            // Only show setup prompt if it looks like a relation/table error
            const msg = err.message || '';
            const code = err.code || '';
            if (msg.includes('app_users') &&
                (msg.includes('not found') || msg.includes('does not exist') || code === '42P01' || code === 'PGRST204')) {
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
            `;

            if (dbService.isLive()) {
                await supabase?.rpc('run_sql', { sql_query: sql });
                alert("System initialized successfully on Supabase.");
                loadData();
            }
        } catch (err: any) {
            console.error("Initialization error:", err);
            alert("Initialization failed. Error: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleUpgrade = async () => {
        if (!username || !password) {
            alert("Please provide username and password");
            return;
        }

        const result = await dbService.createAppUser({
            username,
            password,
            role: selectedRole,
            employee_id: selectedEmployee?.id
        });

        if (result.success) {
            setShowUpgradeModal(false);
            setSelectedEmployee(null);
            setUsername('');
            setPassword('');
            // Ensure clear modal before loading
            setTimeout(() => loadData(), 300);
        } else {
            alert(result.message || "Failed to create system user. Username might already exist.");
            // Always reload even on failure to ensure we haven't created it partially
            loadData();
        }
    };

    const handleUpdateRole = async (userId: string, newRole: UserRole) => {
        const result = await dbService.updateAppUserRole(userId, newRole);
        if (result.success) {
            loadData();
        } else {
            alert(result.message || "Failed to update role. Please check your connectivity.");
            loadData(); // Sync to current state
        }
    };

    const handleDeleteUser = async (userId: string) => {
        if (window.confirm("Are you sure you want to revoke system access for this user?")) {
            const result = await dbService.deleteAppUser(userId);
            if (result.success) {
                if (result.message) alert(result.message);
                loadData();
            } else {
                alert(result.message || "Revocation failed.");
                loadData();
            }
        }
    };

    const filteredEmployees = employees.filter(emp =>
        !systemUsers.some(u => u.employee_id === emp.id) &&
        (emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            emp.id.includes(searchQuery))
    );

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-700">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tight">System Access Control</h2>
                    <p className="text-slate-500 text-sm font-medium mt-1">Manage administrative roles and system portal access.</p>
                </div>
                <button
                    onClick={() => {
                        setSelectedEmployee(null);
                        setShowUpgradeModal(true);
                    }}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold text-sm shadow-lg shadow-indigo-600/20 hover:bg-slate-900 transition-all active:scale-95"
                >
                    + Create Standalone Admin
                </button>
            </div>

            {/* Notification area removed for PGLite fallbacks */}

            {/* System Users Table */}
            <div className="bg-white rounded-[32px] border border-slate-200/60 overflow-hidden shadow-sm">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
                        Active System Users
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/30">
                                <th className="px-6 py-4">User / Employee</th>
                                <th className="px-6 py-4">Portal Username</th>
                                <th className="px-6 py-4">System Role</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 font-medium">
                            {systemUsers.map((user) => (
                                <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black text-xs border border-indigo-100">
                                                {user.username[0].toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-slate-900 font-bold">{user.employees?.name || 'Independent Admin'}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">{user.employees?.department || 'System'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-slate-500 font-mono text-sm">{user.username}</td>
                                    <td className="px-6 py-4">
                                        <select
                                            value={user.role}
                                            onChange={(e) => handleUpdateRole(user.id, e.target.value as UserRole)}
                                            className="bg-slate-100 border-none rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
                                        >
                                            {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => handleDeleteUser(user.id)}
                                            className="text-rose-500 hover:bg-rose-50 p-2 rounded-xl transition-all"
                                            title="Revoke Access"
                                        >
                                            Revoke
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Upgrade Employees Section */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="md:col-span-1 space-y-4">
                    <div className="bg-indigo-900 text-white p-8 rounded-[32px] shadow-xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10 text-6xl font-black">UPGRADE</div>
                        <h4 className="text-xl font-black mb-2">Upgrade Workforce</h4>
                        <p className="text-indigo-200 text-sm font-medium leading-relaxed mb-6">
                            Grant administrative privileges to employees to assist in HR or Payroll operations.
                        </p>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search employees..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-white/10 border border-white/20 rounded-2xl px-5 py-3 text-sm outline-none placeholder:text-white/40 focus:bg-white/20"
                            />
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 bg-white rounded-[32px] border border-slate-200/60 p-2 shadow-sm">
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar p-6 space-y-3">
                        {filteredEmployees.length === 0 ? (
                            <div className="text-center py-10">
                                <p className="text-slate-400 font-bold">No eligible employees found.</p>
                            </div>
                        ) : (
                            filteredEmployees.map(emp => (
                                <div key={emp.id} className="flex justify-between items-center p-4 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center font-black text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                            {emp.name[0]}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-800">{emp.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase">{emp.position} • {emp.department}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setSelectedEmployee(emp);
                                            setUsername(emp.name.split(' ')[0].toLowerCase() + emp.id.slice(-4));
                                            setShowUpgradeModal(true);
                                        }}
                                        className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-600 hover:text-white transition-all"
                                    >
                                        Upgrade
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Upgrade Modal */}
            {showUpgradeModal && (
                <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-md p-10 relative">
                        <h3 className="text-2xl font-black text-slate-900 mb-2">
                            {selectedEmployee ? `Upgrade: ${selectedEmployee.name}` : 'New System User'}
                        </h3>
                        <p className="text-slate-500 text-sm font-medium mb-8">Set credentials and roles for system portal access.</p>

                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Portal Username</label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="e.g. jdoe123"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Portal Password</label>
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Assign Role</label>
                                <select
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value as UserRole)}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 font-bold outline-none focus:ring-2 focus:ring-indigo-500 appearance-none"
                                >
                                    {roles.map(r => <option key={r} value={r}>{r}</option>)}
                                </select>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => setShowUpgradeModal(false)}
                                    className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleUpgrade}
                                    className="flex-1 bg-indigo-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-indigo-600/30 hover:bg-slate-900 transition-all"
                                >
                                    Commit
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
