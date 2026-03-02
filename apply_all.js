
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

    async function runSqlFile(filename) {
        console.log(`Reading ${filename}...`);
        const sql = fs.readFileSync(path.join(__dirname, filename), 'utf-8');
        const statements = sql
            .split(';')
            .map(s => s.replace(/--.*$/gm, '').trim())
            .filter(s => s.length > 0);

        console.log(`Executing ${statements.length} statements from ${filename}...`);
        for (let i = 0; i < statements.length; i++) {
            const { error } = await supabase.rpc('run_sql', { sql_query: statements[i] });
            if (error) {
                console.error(`Error in ${filename} stmt ${i + 1}:`, error.message);
            }
        }
    }

    async function main() {
        await runSqlFile('fix_tables.sql');
        await runSqlFile('seed_normalized_tables.sql');
        console.log("All fixes and seed applied.");
    }

    main();
} catch (e) { console.error(e); }
