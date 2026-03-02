
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

    async function checkDetailed() {
        const { data: emps } = await supabase.from('employees').select('id, name');
        const { data: bals, error } = await supabase.from('leave_balances').select('*').order('employee_id');

        if (error) {
            console.log('Error:', error.message);
        } else {
            console.log('--- DETAILED LEAVE BALANCES ---');
            bals.forEach(b => {
                const emp = emps.find(e => e.id === b.employee_id);
                console.log(`${emp ? emp.name.padEnd(20) : b.employee_id} | ${b.leave_type.padEnd(15)} | Entitled: ${b.entitled_days} | Used: ${b.used_days} | Year: ${b.year}`);
            });
        }
    }

    checkDetailed();
} catch (e) { console.error(e); }
