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

async function checkAhmedPayroll() {
  const ahmedId = '00000000-0000-0000-0000-000000000003';
  
  const { data: items, error } = await supabase
    .from('payroll_items')
    .select('*, payroll_runs!inner(*)')
    .eq('employee_id', ahmedId)
    .eq('payroll_runs.period_key', '2026-01-MONTHLY');

  if (error) {
    console.error("Error fetching payroll items:", error);
    return;
  }

  console.log(JSON.stringify(items, null, 2));
}

checkAhmedPayroll();
