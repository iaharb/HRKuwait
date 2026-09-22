
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('c:\\projects\\hrportal\\.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const supabaseKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.+)"/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllVC() {
  console.log("Checking all Variable Compensation records...");
  const { data, error } = await supabase
    .from('variable_compensation')
    .select('*, employees(name, department)');
    
  if (error) {
    console.error(error);
    return;
  }
  
  const stats = data.reduce((acc, vc) => {
    const date = new Date(vc.created_at);
    const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!acc[month]) acc[month] = { count: 0, statuses: {} };
    acc[month].count++;
    acc[month].statuses[vc.status] = (acc[month].statuses[vc.status] || 0) + 1;
    return acc;
  }, {});
  
  console.log("VC Statistics by Month:", JSON.stringify(stats, null, 2));
}

checkAllVC();
