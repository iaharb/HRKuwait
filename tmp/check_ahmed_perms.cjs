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

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing config:', { supabaseUrl: !!supabaseUrl, serviceRoleKey: !!serviceRoleKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function check() {
  const { data: perms, error: err1 } = await supabase
    .from('role_permissions')
    .select('*')
    .ilike('role', 'Payroll Manager');
  
  if (err1) {
    console.error('Error fetching perms:', err1);
  } else {
    console.log('Permissions for Payroll Manager:', JSON.stringify(perms, null, 2));
  }

  const { data: user, error: err2 } = await supabase
    .from('app_users')
    .select('*')
    .ilike('email', 'ahmed%');
  
  if (err2) {
    console.error('Error fetching user:', err2);
  } else {
    console.log('Ahmed user data:', JSON.stringify(user, null, 2));
  }
}

check();
