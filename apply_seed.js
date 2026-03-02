
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

    if (!urlMatch || !keyMatch) {
        throw new Error('Credentials not found');
    }

    const supabaseUrl = urlMatch[1].trim();
    const supabaseAnonKey = keyMatch[1].trim();

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    async function runSeed() {
        console.log("Reading seed script...");
        const seedSql = fs.readFileSync(path.join(__dirname, 'seed_normalized_tables.sql'), 'utf-8');

        // Remove comments and split by semicolon
        const statements = seedSql
            .split(';')
            .map(s => s.replace(/--.*$/gm, '').trim())
            .filter(s => s.length > 0);

        console.log(`Executing ${statements.length} statements via run_sql RPC...`);

        for (let i = 0; i < statements.length; i++) {
            console.log(`Executing statement ${i + 1}/${statements.length}...`);
            const { error } = await supabase.rpc('run_sql', { sql_query: statements[i] });
            if (error) {
                console.error(`Error in statement ${i + 1}:`, error.message);
                // Continue or break? Let's continue for now.
            }
        }

        console.log("Seed process finished.");
    }

    runSeed();
} catch (e) {
    console.error(e);
}
