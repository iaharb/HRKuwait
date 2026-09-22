
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('c:\\projects\\hrportal\\.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const supabaseKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.+)"/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAhmed() {
  console.log("Checking Ahmed's status...");
  
  const { data: appUsers, error: err1 } = await supabase
    .from('app_users')
    .select('*')
    .ilike('username', '%ahmed%');
    
  if (err1) console.error("Error fetching app_users:", err1);
  else console.log("App Users matching 'ahmed':", JSON.stringify(appUsers, null, 2));

  const { data: employees, error: err2 } = await supabase
    .from('employees')
    .select('*')
    .ilike('name', '%ahmed%');

  if (err2) console.error("Error fetching employees:", err2);
  else console.log("Employees matching 'ahmed':", JSON.stringify(employees, null, 2));

  // Also check authentications
  const { data: authUsers, error: err3 } = await supabase.auth.admin.listUsers();
  if (err3) console.error("Error listing auth users:", err3);
  else {
    const ahmedAuth = authUsers.users.find(u => u.email.toLowerCase().includes('ahmed'));
    console.log("Auth User metadata for Ahmed:", JSON.stringify(ahmedAuth?.user_metadata || "Not found", null, 2));
    console.log("Auth User email:", ahmedAuth?.email);
  }
}

checkAhmed();
