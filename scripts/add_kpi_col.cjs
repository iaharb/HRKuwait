const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = "https://tjkapzlfvxgocfitusxb.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDEyNTQyMiwiZXhwIjoyMDg1NzAxNDIyfQ.cCuso45OfXs5XAaM-pFH7XQO3CHraT7fRtba28we95U";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
    const { error } = await supabase.rpc('run_sql', { sql_query: "ALTER TABLE employees ADD COLUMN IF NOT EXISTS kpi_template_ids JSONB DEFAULT '[]'::jsonb;" });
    if (error) console.error("Error:", error);
    else console.log("Added kpi_template_ids to employees successfully.");
}

runSQL();
