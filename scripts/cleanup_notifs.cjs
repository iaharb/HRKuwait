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
    const del = await client.query(`
        DELETE FROM la_notifications
        WHERE created_at BETWEEN '2026-09-21 10:56:40' AND '2026-09-21 10:56:50'
          AND body NOT LIKE '%2026-10-05%'`);
    console.log(`deleted remaining stale test notifications: ${del.rowCount}`);
    const n = await client.query(`
        SELECT lu.email, n.title, n.body, n.created_at
        FROM la_notifications n JOIN la_users lu ON lu.id = n.user_id
        ORDER BY n.created_at`);
    console.log(`\nremaining notifications: ${n.rows.length}`);
    for (const r of n.rows) console.log(`${r.created_at.toISOString()}  ${r.email.padEnd(20)} ${r.title} | ${r.body}`);
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });