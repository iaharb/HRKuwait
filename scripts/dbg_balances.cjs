const { Client } = require('pg');
const client = new Client({
    host: "db.tjkapzlfvxgocfitusxb.supabase.co",
    port: 5432,
    user: "postgres",
    password: "SB@1963$1234",
    database: "postgres",
    ssl: { rejectUnauthorized: false }
});

async function main() {
    await client.connect();

    console.log("=== la_leave_balances (leave app) ===");
    const la = await client.query(
        `SELECT lu.email, lab.leave_type, lab.entitled_days, lab.used_days, lab.year
         FROM la_leave_balances lab JOIN la_users lu ON lu.id = lab.user_id
         ORDER BY lu.email, lab.leave_type`);
    for (const r of la.rows) console.log(`${r.email.padEnd(22)} ${r.leave_type.padEnd(16)} entitled=${r.entitled_days} used=${r.used_days} (${r.year})`);

    console.log("\n=== hrportal leave_balances ===");
    const hr = await client.query(
        `SELECT e.email, lb.leave_type, lb.entitled_days, lb.used_days, lb.year
         FROM leave_balances lb JOIN employees e ON e.id = lb.employee_id
         ORDER BY e.email, lb.leave_type`);
    for (const r of hr.rows) console.log(`${(r.email||'').padEnd(22)} ${r.leave_type.padEnd(16)} entitled=${r.entitled_days} used=${r.used_days} (${r.year})`);

    console.log("\n=== la_sync function definition ===");
    const def = await client.query(`SELECT pg_get_functiondef('la_sync_hr_balances(int)') AS def`);
    if (def.rows[0]) console.log(def.rows[0].def);

    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });