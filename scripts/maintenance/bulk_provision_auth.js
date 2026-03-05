
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// This script MUST be run with a SERVICE_ROLE_KEY because it manages Auth users.
// Never use this key in the frontend!

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
// IMPORTANT: You need your service_role key here, usually stored securely.
// We'll read it from env if it's there, otherwise this script is a guide.
const serviceKey = env.match(/SUPABASE_SERVICE_ROLE_KEY="(.*)"/)?.[1] || "YOUR_SERVICE_ROLE_KEY_HERE";

const supabase = createClient(url, serviceKey);

async function bulkInvite() {
    console.log('🚀 Starting Enterprise Auth Provisioning...');

    const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('id, name, email, role, department')
        .eq('status', 'Active');

    if (empError) return console.error('Error fetching employees:', empError);

    console.log(`Found ${employees.length} active employees to provision.`);

    for (const emp of employees) {
        if (!emp.email) {
            console.warn(`⚠️ Skipping ${emp.name} (No email)`);
            continue;
        }

        console.log(`📡 Provisioning ${emp.name} (${emp.email})...`);

        // Use admin.createUser to create them with metadata without confirmation emails
        const { data: user, error } = await supabase.auth.admin.createUser({
            email: emp.email,
            password: 'Employee@123', // Force them to change this on first login
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
                console.log(`✅ ${emp.name} already exists in Auth.`);
                // OPTIONAL: Update their metadata to ensure employee_id is correct
                await supabase.auth.admin.updateUserById(user?.user?.id || '', {
                    user_metadata: { employee_id: emp.id, role: emp.role }
                });
            } else {
                console.error(`❌ Error provisioning ${emp.name}:`, error.message);
            }
        } else {
            console.log(`✨ Successfully provisioned ${emp.name}`);
        }
    }

    console.log('🏁 Auth Provisioning Complete. RLS is now active for these users!');
}

bulkInvite();
