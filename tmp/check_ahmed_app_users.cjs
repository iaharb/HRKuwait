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

async function check() {
  const { data: user, error: err } = await supabase
    .from('app_users')
    .select('*')
    .eq('username', 'ahmed');
  
  if (err) {
    console.error('Error fetching user:', err);
  } else {
    console.log('Ahmed app_users data:', JSON.stringify(user, null, 2));
  }
}

check();
