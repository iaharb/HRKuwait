
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

    async function findDupes() {
        const { data } = await supabase.from('leave_requests').select('*');
        console.log('--- LEAVE REQUESTS ANALYTICS ---');
        const counts = {};
        data?.forEach(r => {
            const key = `${r.employee_name} | ${r.type} | ${r.start_date}`;
            counts[key] = (counts[key] || 0) + 1;
        });

        Object.entries(counts).forEach(([k, v]) => {
            if (v > 1) console.log(`DUPLICATE FOUND: ${k} (count: ${v})`);
            else console.log(`OK: ${k}`);
        });
    }

    findDupes();
} catch (e) { console.error(e); }
