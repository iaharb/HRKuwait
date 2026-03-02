const fs = require('fs');

const envLines = fs.readFileSync('.env', 'utf-8').split('\n');
const env = {};
envLines.forEach(l => {
    const parts = l.split('=');
    if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/['"]/g, '');
        env[key] = val;
    }
});

const url = env['VITE_SUPABASE_URL'];
const key = env['VITE_SUPABASE_ANON_KEY'];

const MOCK_EMPLOYEES = [
    {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'Ahmed Al-Mutairi',
        leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 12, sickUsed: 4, emergencyUsed: 1, shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: false },
    },
    {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'Sarah Al-Ghanim',
        leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 8, sickUsed: 2, emergencyUsed: 0, shortPermissionLimit: 2, shortPermissionUsed: 1.5, hajUsed: false },
    },
    {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'John Doe',
        leaveBalances: { annual: 30, sick: 15, emergency: 6, annualUsed: 14, sickUsed: 5, emergencyUsed: 3, shortPermissionLimit: 2, shortPermissionUsed: 0, hajUsed: true },
    }
];

async function sync() {
    for (const emp of MOCK_EMPLOYEES) {
        console.log('Sending update for', emp.name);
        const res = await fetch(`${url}/rest/v1/employees?id=eq.${emp.id}`, {
            method: 'PATCH',
            headers: {
                'apikey': key,
                'Authorization': `Bearer ${key}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ leave_balances: emp.leaveBalances })
        });
        console.log(emp.name, res.status, res.statusText);
    }
    console.log('Done.');
}
sync();
