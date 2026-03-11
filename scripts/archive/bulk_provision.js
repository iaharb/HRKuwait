
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8') + '\n' + (fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '');
const urlMatch = env.match(/VITE_SUPABASE_URL="(https:\/\/[^"]+)"/);
const keyMatch = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="([^"]+)"/);

if (!urlMatch || !keyMatch) {
    console.error('Missing Supabase Config');
    process.exit(1);
}

const url = urlMatch[1];
const key = keyMatch[1];
const supabaseAdmin = createClient(url, key);

async function provisionAll() {
    console.log('Fetching employees for provisioning...');
    const { data: employees, error } = await supabaseAdmin.from('employees').select('*');
    if (error) {
        console.error('Error fetching employees:', error);
        return;
    }

    console.log(`Found ${employees.length} employees. Starting provisioning...`);

    for (const emp of employees) {
        let firstName = emp.name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
        if (emp.name.toLowerCase().includes('dr.')) {
            firstName = emp.name.split(' ')[1].toLowerCase().replace(/[^a-z0-9]/g, '');
        }
        if (emp.name.toLowerCase().includes('layla')) firstName = 'layla';
        if (emp.name.toLowerCase().includes('ahmed')) firstName = 'ahmed';
        if (emp.name.toLowerCase().includes('sarah')) firstName = 'sarah';
        if (emp.username) firstName = emp.username; // Use username if exists

        const email = emp.email || `${firstName}@enterprise-hr.kw`;

        const metadata = {
            employee_id: emp.id,
            name: emp.name,
            role: emp.role || 'Employee',
            department: emp.department || 'General'
        };

        console.log(`Provisioning ${emp.name} as ${email}...`);

        const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
            email: email,
            password: '12345',
            email_confirm: true,
            user_metadata: metadata
        });

        if (createError) {
            if (createError.message.includes('already registered')) {
                console.log(`User ${email} already exists. Updating metadata...`);
                // Find user by email
                const { data: { users } } = await supabaseAdmin.auth.admin.listUsers();
                const existing = users.find(u => u.email === email);
                if (existing) {
                    await supabaseAdmin.auth.admin.updateUserById(existing.id, {
                        user_metadata: metadata
                    });
                }
            } else {
                console.error(`Error provisioning ${email}:`, createError.message);
            }
        } else {
            console.log(`Successfully provisioned ${email}.`);
        }
    }

    // Also provision 'superadmin' and 'it_lead' specifically if they use different emails
    const extraUsers = [
        { username: 'superadmin', role: 'Admin', email: 'admin@enterprise.local' },
        { username: 'it_lead', role: 'Manager', email: 'it_lead@enterprise-hr.kw' }
    ];

    for (const u of extraUsers) {
        const { error: err } = await supabaseAdmin.auth.admin.createUser({
            email: u.email,
            password: '12345',
            email_confirm: true,
            user_metadata: { role: u.role, name: u.username }
        });
        if (err && !err.message.includes('already registered')) {
            console.error(`Error provisioning extra user ${u.username}:`, err.message);
        }
    }

    console.log('Provisioning complete.');
}

provisionAll();
