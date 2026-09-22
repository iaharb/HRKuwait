const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');
const lines = fs.readFileSync(envPath, 'utf8').split('\n');
const config = {};
lines.forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    let val = parts.slice(1).join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.substring(1, val.length - 1);
    }
    config[parts[0].trim()] = val;
  }
});

const supabaseUrl = config['VITE_SUPABASE_URL'];
const serviceRoleKey = config['VITE_SUPABASE_SERVICE_ROLE_KEY'] || config['SUPABASE_SERVICE_ROLE_KEY'];

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function tryRunSql() {
  console.log("Trying run_sql with different parameter names...");
  
  const testSql = "SELECT 1;";
  
  // Try 1: Named parameter
  const res1 = await supabase.rpc('run_sql', { sql_query: testSql });
  console.log("Attempt 1 (sql_query):", res1.error ? res1.error.message : "Success");

  // Try 2: Alternative name 'query'
  const res2 = await supabase.rpc('run_sql', { query: testSql });
  console.log("Attempt 2 (query):", res2.error ? res2.error.message : "Success");
}

tryRunSql();
