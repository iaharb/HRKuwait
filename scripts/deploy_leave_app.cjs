const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const client = new Client({
    host: "db.tjkapzlfvxgocfitusxb.supabase.co",
    port: 5432,
    user: "postgres",
    password: "SB@1963$1234",
    database: "postgres",
    ssl: { rejectUnauthorized: false }
    // NOTE: Direct PG requires IPv6 connectivity. The pooler (aws-0-us-east-1.pooler.supabase.com)
    // resolves to IPv4 but the tenant/user format (postgres.<project-ref>) is not accepted.
    // Run these scripts from an IPv6-enabled environment (GitHub Actions, Supabase CLI, VPS with IPv6).
});

const MIGRATIONS = [
    '025_leave_app_isolated_schema.sql',
    '026_sync_balances_from_hrportal.sql',
    '027_collate_leave_app_into_hrportal.sql',
    '028_backfill_hr_history.sql',
    '029_configurable_workflow_engine.sql',
    '030_workflow_config_read_access.sql',
    '031_engine_activation_and_autoskip.sql',
    '032_ceo_skip_rule.sql',
    '033_deterministic_flow_resolution.sql',
    '034_dlm_coverage.sql',
    '035_org_entities.sql',
    '036_request_types.sql',
    '037_generic_requests.sql',
    '038_actor_rules_entities.sql',
    '039_seed_org_tree.sql'
].map(f => path.join(__dirname, '..', 'migrations', f));

async function main() {
    try {
        console.log("LOG: Connecting...");
        await client.connect();
        for (const m of MIGRATIONS) {
            const sql = fs.readFileSync(m, 'utf8');
            console.log(`LOG: Applying ${path.basename(m)}...`);
            await client.query(sql);
        }
        const q = await client.query(
            `SELECT (SELECT count(*) FROM la_leave_balances WHERE used_days > 0) AS used_nonzero,
                    (SELECT count(*) FROM la_users) AS la_users,
                    (SELECT array_agg(email ORDER BY email) FROM la_users WHERE email NOT IN
                        (SELECT NULLIF(e.email,'') FROM employees e)) AS unmatched`
        );
        console.log("LOG: LEAVE APP SCHEMA DEPLOYED SUCCESS");
        console.log("LOG: balances_with_usage:", q.rows[0].used_nonzero, "| la_users:", q.rows[0].la_users, "| unmatched:", q.rows[0].unmatched);
    } catch (err) {
        console.log("LOG: ERROR_START");
        console.log(err.message);
        console.log(err.stack);
        console.log("LOG: ERROR_END");
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

main();