const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Try to read .env or .env.local
const env = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const urlMatch = env.match(/VITE_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/);

if (!urlMatch || !keyMatch) {
    console.error('Credentials not found');
    process.exit(1);
}

const supabaseUrl = urlMatch[1].trim();
const supabaseAnonKey = keyMatch[1].trim();

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    const { data: rules, error: rError } = await supabase.from('finance_mapping_rules').select('*');
    if (rError) {
        console.error('Error fetching rules:', rError);
        return;
    }

    const { data: accounts, error: aError } = await supabase.from('finance_chart_of_accounts').select('*');
    if (aError) {
        console.error('Error fetching accounts:', aError);
        return;
    }

    const joined = rules.map(r => {
        const acc = accounts.find(a => a.id === r.gl_account_id);
        return { ...r, account_name: acc?.account_name, account_code: acc?.account_code };
    });

    console.log(JSON.stringify(joined, null, 2));
}

check();
