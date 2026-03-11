const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function main() {
    const { data: tables, error } = await supabase.from('information_schema.tables').select('table_name').eq('table_schema', 'public');
    if (error) {
        // PostgREST might not expose information_schema. Trying rpc if I have run_sql
        console.log("PostgREST attempt failed or blocked. Trying RPC...");
        const { data: rpcData, error: rpcError } = await supabase.rpc('run_sql', {
            sql_query: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        });
        if (rpcError) {
            console.error("RPC Error:", rpcError);
        } else {
            console.log("RPC Data:", rpcData);
        }
    } else {
        console.log("Tables:", tables);
    }
}
main();
