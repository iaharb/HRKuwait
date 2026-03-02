
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

    async function checkRequests() {
        const { data, error } = await supabase.from('leave_requests').select('employee_name, type, days, status');
        if (error) {
            console.log('Error:', error.message);
        } else {
            console.log('--- LEAVE REQUESTS ---');
            data.forEach(r => {
                console.log(`${r.employee_name.padEnd(20)} | ${r.type.padEnd(10)} | ${r.days}d | ${r.status}`);
            });
        }
    }

    checkRequests();
} catch (e) { console.error(e); }
