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
    const q = await client.query(`
        SELECT conname, pg_get_constraintdef(oid) AS def
        FROM pg_constraint WHERE conrelid = 'la_leave_requests'::regclass`);
    for (const r of q.rows) console.log(`${r.conname}: ${r.def}`);
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });