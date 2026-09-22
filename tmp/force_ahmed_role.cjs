
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('c:\\projects\\hrportal\\.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL="(.+)"/)[1];
const supabaseKey = env.match(/VITE_SUPABASE_SERVICE_ROLE_KEY="(.+)"/)[1];
const supabase = createClient(supabaseUrl, supabaseKey);

async function forceUpdateAhmed() {
  console.log("Forcing role update for Ahmed Al-Mutairi...");
  
  // 1. Get the auth user ID
  const { data: { users }, error: err1 } = await supabase.auth.admin.listUsers();
  if (err1) {
    console.error("Error listing users:", err1);
    return;
  }
  
  const ahmed = users.find(u => u.email === 'ahmed@test.com');
  if (!ahmed) {
    console.error("Ahmed not found in Auth registry.");
    return;
  }
  
  console.log("Current metadata:", ahmed.user_metadata);
  
  // 2. Update metadata and role
  const { data, error: err2 } = await supabase.auth.admin.updateUserById(ahmed.id, {
    user_metadata: {
      ...ahmed.user_metadata,
      role: 'Payroll Manager'
    }
  });
  
  if (err2) console.error("Error updating auth metadata:", err2);
  else console.log("Auth metadata updated successfully.");
  
  // 3. Ensure DB tables are correct too
  const { error: err3 } = await supabase.from('app_users').update({ role: 'Payroll Manager' }).eq('employee_id', ahmed.id);
  const { error: err4 } = await supabase.from('employees').update({ role: 'Payroll Manager' }).eq('id', '00000000-0000-0000-0000-000000000003');
  
  console.log("DB sync status:", { err3, err4 });
}

forceUpdateAhmed();
