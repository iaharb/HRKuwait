const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    let val = v.join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
    return [k.trim(), val];
}));

const supabase = createClient(vars.VITE_SUPABASE_URL, vars.VITE_SUPABASE_SERVICE_ROLE_KEY);

const sql = `
CREATE OR REPLACE FUNCTION fn_count_working_days(p_start DATE, p_end DATE)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_curr DATE := p_start;
BEGIN
    WHILE v_curr <= p_end LOOP
        IF EXTRACT(DOW FROM v_curr) <> 5 THEN -- 5 is Friday
            v_count := v_count + 1;
        END IF;
        v_curr := v_curr + 1;
    END LOOP;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
`;

async function main() {
    console.log("LOG: Attempting to call run_sql RPC...");
    const { error } = await supabase.rpc('run_sql', { 
        sql_query: sql 
    });
    
    if (error) {
        console.error("run_sql RPC failed:", error);
    } else {
        console.log("Success! fn_count_working_days created.");
    }
}
main();
