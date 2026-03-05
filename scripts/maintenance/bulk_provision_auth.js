import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// This script MUST be run with a SERVICE_ROLE_KEY because it manages Auth users.
const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)?.[1] || "YOUR_SERVICE_ROLE_KEY_HERE";

const supabase = createClient(url, serviceKey);

async function bulkProvision() {
    console.log('🚀 Starting Enterprise Auth Provisioning (Test Email Mode)...');

    const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, name, role, department');

    if (empError) return console.error('Error fetching employees:', empError);

    console.log(`Found ${employees.length} employees to provision.`);

    for (const emp of employees) {
        // Generate test email based on first name (e.g., "faisal@test.com")
        const firstName = emp.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        const testEmail = `${firstName}@test.com`;

        console.log(`📡 Provisioning ${emp.name} -> ${testEmail}...`);

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

        if (error) {
            if (error.message.includes('already registered')) {
                console.log(`✅ ${emp.name} (${testEmail}) already exists in Auth.`);
                // Update metadata anyway to ensure ID is linked
                const existingUser = await supabase.auth.admin.listUsers();
                const user = existingUser.data.users.find(u => u.email === testEmail);
                if (user) {
                    await supabase.auth.admin.updateUserById(user.id, {
                        user_metadata: { employee_id: emp.id, role: emp.role, name: emp.name }
                    });
                }
            } else {
                console.error(`❌ Error provisioning ${emp.name}:`, error.message);
            }
        } else {
            console.log(`✨ Successfully provisioned ${emp.name} (UUID: ${data.user.id})`);
        }
    }

    console.log('🏁 Auth Provisioning Complete. Authenticated testing now enabled!');
}

bulkProvision();
