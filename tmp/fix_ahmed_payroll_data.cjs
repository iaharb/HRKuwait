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

async function fixAhmedData() {
  const ahmedId = '00000000-0000-0000-0000-000000000003';
  
  // 1. Update Allowance name to include (deductible) so the engine can handle it
  console.log("Updating Ahmed's allowance name...");
  const { error: err1 } = await supabase
    .from('employee_allowances')
    .update({ name: 'Technical Allowance (deductible)' })
    .eq('employee_id', ahmedId)
    .eq('name', 'Technical');
  
  if (err1) console.error("Error updating allowance:", err1);
  else console.log("Allowance name updated.");

  // 2. Reject Overtime for Jan and Feb 2026
  console.log("Rejecting Ahmed's overtime for Jan/Feb...");
  const { data: vcs, error: err2 } = await supabase
    .from('variable_compensation')
    .select('id, metadata')
    .eq('employee_id', ahmedId)
    .eq('comp_type', 'OVERTIME');
  
  if (vcs) {
      for (const vc of vcs) {
          const date = vc.metadata?.date;
          if (date && (date.startsWith('2026-01') || date.startsWith('2026-02'))) {
              await supabase
                  .from('variable_compensation')
                  .update({ status: 'REJECTED', notes: 'User feedback: No overtime for Ahmed in Jan/Feb' })
                  .eq('id', vc.id);
          }
      }
      console.log("Overtime records updated (Rejected).");
  } else if (err2) {
      console.error("Error fetching VC:", err2);
  }

  // 3. Clear existing Jan payroll run so it can be re-generated
  console.log("Deleting existing Jan 2026 payroll run for Ahmed to allow re-generation...");
  const { data: run } = await supabase.from('payroll_runs').select('id').eq('period_key', '2026-01-MONTHLY').single();
  if (run) {
      await supabase.from('payroll_items').delete().eq('run_id', run.id).eq('employee_id', ahmedId);
      console.log("Deleted Ahmed's item from Jan run.");
  }
}

fixAhmedData();
