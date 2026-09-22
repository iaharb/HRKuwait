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
    const r = await client.query(`SELECT la_sync_hr_balances(NULL) AS synced`);
    console.log("synced rows:", r.rows[0].synced);
    const q = await client.query(
        `SELECT lu.email, lab.leave_type, lab.entitled_days, lab.used_days
         FROM la_leave_balances lab JOIN la_users lu ON lu.id = lab.user_id
         WHERE lab.used_days > 0 ORDER BY lu.email, lab.leave_type`);
    console.log("la_leave_balances rows with usage now:");
    for (const row of q.rows) console.log(`  ${row.email.padEnd(22)} ${row.leave_type.padEnd(16)} used=${row.used_days}/${row.entitled_days}`);
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });