
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function applyMigration() {
    try {
        const envPath = path.join(__dirname, '.env');
        const env = fs.readFileSync(envPath, 'utf-8');
        const urlMatch = env.match(/VITE_SUPABASE_URL=["']?([^"'\s]*)["']?/);
        const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=["']?([^"'\s]*)["']?/);

        const supabaseUrl = urlMatch[1].trim();
        const supabaseAnonKey = keyMatch[1].trim();
        const supabase = createClient(supabaseUrl, supabaseAnonKey);

        const sqlPath = path.join(__dirname, 'migrations', '012_expense_claims_workflow.sql');
        const sql = fs.readFileSync(sqlPath, 'utf-8');

        console.log("Applying Migration 012...");

        // Note: Supabase JS doesn't have a direct 'sql' execution method apart from RPC
        // If the 'exec_sql' RPC exists, we use it. Otherwise we have manual work.
        // For this project, we assume a helper function or direct dash usage.
        // We'll try to use a dummy RPC or just print instructions if it fails.
        const { error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.error("Migration failed via RPC. Please copy-paste the contents of migrations/012_expense_claims_workflow.sql into the Supabase SQL Editor.");
            console.error("Error details:", error.message);
        } else {
            console.log("Migration applied successfully.");
        }
    } catch (e) {
        console.error("Migration application process crashed:", e);
    }
}

applyMigration();
