const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function addPerformanceTables() {
    const sql = `
    -- 1. KPI Templates for Standardization
    CREATE TABLE IF NOT EXISTS kpi_templates (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       title TEXT NOT NULL,
       department TEXT,
       role_name TEXT,
       kpis JSONB NOT NULL,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );

    -- 2. Employee Evaluations
    CREATE TABLE IF NOT EXISTS employee_evaluations (
       id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       employee_id UUID REFERENCES employees(id),
       evaluator_id UUID REFERENCES employees(id),
       quarter TEXT NOT NULL,
       kpi_scores JSONB NOT NULL,
       total_score NUMERIC NOT NULL,
       pro_rata_factor NUMERIC DEFAULT 1.0,
       calculated_kwd NUMERIC NOT NULL,
       status TEXT DEFAULT 'PENDING_EXEC', 
       created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
    );

    -- Reload schema cache
    NOTIFY pgrst, 'reload schema';
  `;

    const { error } = await supabase.rpc('run_sql', { sql_query: sql });
    if (error) {
        console.error('Migration failed:', error);
    } else {
        console.log('Performance tables added successfully.');
    }
}

addPerformanceTables();
