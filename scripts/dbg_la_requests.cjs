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
        SELECT ru.email, q.leave_type, q.start_date, q.end_date, q.days, q.status, q.created_at
        FROM la_leave_requests q
        JOIN la_users ru ON ru.id = q.requester_id
        ORDER BY q.created_at`);
    console.log(`total la_leave_requests: ${q.rows.length}`);
    for (const r of q.rows) console.log(`${r.email.padEnd(20)} ${r.leave_type.padEnd(12)} ${r.start_date}..${r.end_date} days=${r.days} ${r.status.padEnd(20)} created=${r.created_at.toISOString()}`);
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });