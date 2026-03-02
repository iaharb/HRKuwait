
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '.env'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function checkRows() {
        const tables = ['employees', 'departments', 'employee_allowances', 'leave_balances', 'leave_requests', 'attendance'];
        for (const t of tables) {
            const { data, error } = await supabase.from(t).select('count', { count: 'exact' }).limit(0);
            if (error) {
                console.log(`Table ${t}: Error ${error.code} - ${error.message}`);
            } else {
                console.log(`Table ${t}: Row count = ${data?.length === 0 ? 0 : '?'} (Exact count: ${arguments[0]})`);
                // Wait, count is in the response object
            }
        }
    }

    // Simpler check
    async function checkSimple() {
        const res = await supabase.from('employees').select('id', { count: 'exact', head: true });
        console.log('Employees count:', res.count);

        const res2 = await supabase.from('departments').select('name', { count: 'exact', head: true });
        console.log('Departments count:', res2.count);
        if (res2.error) console.log('Dept error:', res2.error);
    }

    checkSimple();
} catch (e) { console.error(e); }
