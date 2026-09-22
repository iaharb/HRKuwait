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

async function checkAhmedData() {
  const ahmedId = '00000000-0000-0000-0000-000000000003';
  
  // 1. Employee Info
  const { data: emp } = await supabase.from('employees').select('*').eq('id', ahmedId).single();
  console.log('--- Employee Info ---');
  console.log(JSON.stringify(emp, null, 2));

  // 2. Allowances
  const { data: allowances } = await supabase.from('employee_allowances').select('*').eq('employee_id', ahmedId);
  console.log('--- Allowances ---');
  console.log(JSON.stringify(allowances, null, 2));

  // 3. Variable Comp for Jan/Feb 2026
  const { data: vc } = await supabase.from('variable_compensation').select('*').eq('employee_id', ahmedId);
  console.log('--- Variable Compensation ---');
  console.log(JSON.stringify(vc, null, 2));

  // 4. Leave Requests for Jan 2026
  const { data: leaves } = await supabase.from('leave_requests')
    .select('*')
    .eq('employee_id', ahmedId)
    .gte('start_date', '2026-01-01')
    .lte('start_date', '2026-01-31');
  console.log('--- Leave Requests (Jan) ---');
  console.log(JSON.stringify(leaves, null, 2));

  // 5. Check actual Payroll Items for Jan 2026 if any
  const { data: items } = await supabase.from('payroll_items')
    .select('*, payroll_runs(*)')
    .eq('employee_id', ahmedId)
    .contains('payroll_runs', { period_key: '2026-01-MONTHLY' });
  console.log('--- Payroll Items (Jan) ---');
  console.log(JSON.stringify(items, null, 2));
}

checkAhmedData();
