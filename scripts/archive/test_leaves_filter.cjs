const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const stageEnvRaw = fs.readFileSync('.env.local', 'utf-8') + '\n' + fs.readFileSync('.env', 'utf-8');
const stageEnv = Object.fromEntries(
    stageEnvRaw.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'))
        .map(line => {
            const index = line.indexOf('=');
            return [line.slice(0, index), line.slice(index + 1).replace(/"/g, '')];
        })
);

const stageClient = createClient(stageEnv.VITE_SUPABASE_URL, stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    // Exact mapping logic from dbService
    const mapLeaveRequest = (data) => {
        if (!data) return data;
        const joinedHistory = (data.leave_history || []).map(h => ({
            user: h.actor_name, role: h.actor_role, action: h.action, timestamp: h.created_at, note: h.note
        }));
        return {
            id: data.id, employeeId: data.employee_id, employeeName: data.employee_name,
            department: data.department, type: data.type, startDate: data.start_date,
            endDate: data.end_date, days: data.days, durationHours: data.duration_hours,
            reason: data.reason, status: data.status, managerId: data.manager_id,
            createdAt: data.created_at, history: joinedHistory
        };
    };

    const { data, error } = await stageClient.from('leave_requests').select('*, leave_history(*)').order('created_at', { ascending: false });
    if (error) throw error;
    const leaves = (data || []).map(mapLeaveRequest);

    // Mock Layla
    const userRole = 'HR Manager';
    const user_department = 'HR';
    const user_id = '644360b9-93d9-461b-b8c0-4ae688b95200';
    const userEmpId = '00000000-0000-0000-0000-000000000002'; // From users.json

    const roles = ['Admin', 'Executive', 'HR Manager', 'HR Officer', 'Payroll Manager', 'HR', 'Mandoob', 'Payroll Officer'];
    const isExecOrHr = roles.some(r => r.toLowerCase() === userRole.toLowerCase());

    console.log("isExecOrHr is: " + isExecOrHr);

    const filterItems = (items, empDeptPath, empMgrIdPath) => {
        if (isExecOrHr) return items;
        return items.filter((item) => {
            const getNested = (obj, path) => path.split('.').reduce((o, i) => o?.[i], obj);
            const dept = getNested(item, empDeptPath);
            const mgrId = getNested(item, empMgrIdPath);
            return mgrId === userEmpId || dept === user_department;
        });
    };

    const targetStatuses = ['Pending', 'Pending_Manager', 'Manager_Approved', 'Rejected', 'Rejected_By_Manager'];

    const preFiltered = filterItems(leaves, 'department', 'managerId');
    const finalFiltered = preFiltered.filter(r => targetStatuses.includes(r.status));

    console.log("Total Leaves Count: " + leaves.length);
    console.log("Leaves after `filterItems`: " + preFiltered.length);
    console.log("Final Filtered for Approvals view: " + finalFiltered.length);

    // Let's log statuses to explicitly trace why they might be missing
    const statsUsed = [...new Set(leaves.map(l => l.status))];
    console.log("All DB leave statuses present: " + statsUsed.join(', '));
    console.log("Leaves failing the final `.filter()` check: ", leaves.filter(l => !targetStatuses.includes(l.status)).map(l => l.status));

    process.exit(0);
}
run();
