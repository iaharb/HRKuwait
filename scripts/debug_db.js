
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const serviceKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.*)"/)?.[1];

const supabase = createClient(url, serviceKey);

async function check() {
    const { data: employees } = await supabase.from('employees').select('id, name');
    console.log('EMPLOYEES_START');
    console.log(JSON.stringify(employees, null, 2));
    console.log('EMPLOYEES_END');

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const userSummary = users.map(u => ({ email: u.email, id: u.id, metadata_id: u.user_metadata?.employee_id }));
    console.log('AUTH_USERS_START');
    console.log(JSON.stringify(userSummary, null, 2));
    console.log('AUTH_USERS_END');
}

check();
