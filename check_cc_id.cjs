const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const env = fs.readFileSync('.env', 'utf8');
const url = env.match(/VITE_SUPABASE_URL="(.*)"/)[1];
const key = env.match(/VITE_SUPABASE_ANON_KEY="(.*)"/)[1];

const supabase = createClient(url, key);

async function getGLIds() {
    const { data: cc } = await supabase.from('cost_centers').select('id').limit(1).single();
    const { data: d1 } = await supabase.from('finance_chart_of_accounts').select('id').eq('account_code', '510400').single();
    const { data: d2 } = await supabase.from('finance_chart_of_accounts').select('id').eq('account_code', '210500').single();

    console.log('Cost Center ID:', cc?.id);
    console.log('510400:', d1?.id);
    console.log('210500:', d2?.id);
}

getGLIds();
