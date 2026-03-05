import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
// Prioritize VITE prefix but fallback to original for local script compatibility
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.*)"/)?.[1] || env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)?.[1];

const supabase = createClient(url, serviceKey);

async function bulkProvision() {
    console.log('🚀 Starting Enterprise Auth Provisioning (REPAIR & SYNC MODE)...');

    const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, name, role, department');

    if (empError) return console.error('Error fetching employees:', empError);

    // Get all current Auth users to search/compare
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers();

    for (const emp of employees) {
        // Intelligent Email Generation
        let parts = emp.name.split(' ').map(p => p.toLowerCase().replace(/[^a-z0-9]/g, ''));
        // Skip common prefixes
        const prefixes = ['dr', 'mr', 'mrs', 'ms', 'eng', 'prof'];
        let firstName = prefixes.includes(parts[0]) ? parts[1] : parts[0];

        // Manual override for Faisal to ensure it matches user expectations
        if (emp.name.toLowerCase().includes('faisal')) firstName = 'faisal';

        const testEmail = `${firstName}@test.com`;
        const existingUser = authUsers.find(u => u.email === testEmail);

        if (existingUser) {
            console.log(`📡 Updating Link: ${emp.name} -> ${testEmail}...`);
            const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
                user_metadata: {
                    employee_id: emp.id,
                    name: emp.name,
                    role: emp.role || 'Employee',
                    department: emp.department || 'General'
                }
            });
            if (updateError) console.error(`❌ Failed to link ${emp.name}:`, updateError.message);
            else console.log(`✅ ${emp.name} re-linked to ID ${emp.id.slice(0, 8)}...`);
        } else {
            console.log(`✨ Creating NEW: ${emp.name} -> ${testEmail}...`);
            const { data, error } = await supabase.auth.admin.createUser({
                email: testEmail,
                password: '12345',
                email_confirm: true,
                user_metadata: {
                    employee_id: emp.id,
                    name: emp.name,
                    role: emp.role || 'Employee',
                    department: emp.department || 'General'
                }
            });
            if (error) console.error(`❌ Error creating ${emp.name}:`, error.message);
            else console.log(`🎉 Success! ${emp.name} provisioned.`);
        }
    }
    console.log('🏁 Auth Repair Complete. Lockdown logic is now synced with IDs.');
}

bulkProvision();
