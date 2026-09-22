const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    let val = v.join('=').trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.substring(1, val.length - 1);
    return [k.trim(), val];
}));

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
    const url = `${vars.VITE_SUPABASE_URL}/rest/v1/rpc/run_sql`;
    console.log("LOG: Fetching", url);
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': vars.VITE_SUPABASE_SERVICE_ROLE_KEY,
            'Authorization': `Bearer ${vars.VITE_SUPABASE_SERVICE_ROLE_KEY}`
        },
        body: JSON.stringify({ sql_query: sql })
    });
    
    if (!res.ok) {
        const text = await res.text();
        console.error("Fetch failed:", res.status, res.statusText, text);
    } else {
        console.log("Success! fn_count_working_days created.");
    }
}
main();
