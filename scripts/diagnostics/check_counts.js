import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const env = fs.readFileSync(path.join(__dirname, '../../.env'), 'utf-8');
    const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
    const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

    if (!urlMatch || !keyMatch) {
        throw new Error('Credentials not found in .env');
    }

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function checkCounts() {
        const tables = ['employees', 'departments', 'employee_allowances', 'leave_balances', 'leave_requests', 'attendance'];
        console.log('--- Database Status ---');
        for (const table of tables) {
            const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
            if (error) {
                console.log(`${table}: ERROR - ${error.message}`);
            } else {
                console.log(`${table}: ${count} rows`);
            }
        }
    }

    checkCounts();
} catch (e) {
    console.error(e);
}
