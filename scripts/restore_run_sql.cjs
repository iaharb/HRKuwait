const pkg = require('pg');
const { Client } = pkg;
const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const vars = Object.fromEntries(envText.split('\n').filter(l => l.includes('=')).map(l => {
    const [k, ...v] = l.split('=');
    return [k.trim(), v.join('=').trim().replace(/^['\"]|['\"]$/g, '')];
}));

const projectId = vars.VITE_SUPABASE_URL.split('//')[1].split('.')[0];
const host = `db.${projectId}.supabase.co`;

const client = new Client({
    host: host,
    port: 5432,
    user: "postgres",
    password: "admin@2026",
    database: "postgres",
    ssl: {
        rejectUnauthorized: false
    }
});

const sql = `
CREATE OR REPLACE FUNCTION run_sql(sql_query TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    EXECUTE sql_query;
    RETURN jsonb_build_object('success', true);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;
`;

async function main() {
    try {
        console.log(`LOG: Attempting connection to ${host}...`);
        await client.connect();
        console.log("LOG: Connected successfully.");
        await client.query(sql);
        console.log("LOG: run_sql RESTORED SUCCESS");
    } catch (err) {
        console.log("LOG: ERROR");
        console.log(err.message);
    } finally {
        await client.end();
    }
}

main();
