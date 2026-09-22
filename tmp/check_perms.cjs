
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('c:\\projects\\hrportal\\.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const supabaseKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.+)"/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkPermissions() {
  console.log("Checking role permissions for Payroll Manager...");
  
  const { data: perms, error } = await supabase
    .from('role_permissions')
    .select('*')
    .ilike('role', 'Payroll Manager');
    
  if (error) console.error("Error:", error);
  else console.log("Permissions:", JSON.stringify(perms, null, 2));
}

checkPermissions();
