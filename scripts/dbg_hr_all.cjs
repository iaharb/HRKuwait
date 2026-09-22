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
        SELECT type, start_date, end_date, days, duration_hours, status, la_request_id::text,
               reason, created_at
        FROM leave_requests ORDER BY created_at`);
    console.log(`total HR leave_requests = ${q.rows.length}`);
    for (const r of q.rows) console.log(`${(r.la_request_id ? 'COLLATED ' : '          ')} ${r.type.padEnd(16)} ${r.start_date}..${r.end_date} days=${r.days} hrs=${r.duration_hours} ${r.status.padEnd(14)} ${(r.reason||'').slice(0,20)} created=${r.created_at.toISOString()}`);

    console.log("\n=== does every HR employee id have email, and are they on la roster? ===");
    const m = await client.query(`
        SELECT e.name, e.email AS emp_email, lu.email AS la_email
        FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        LEFT JOIN la_users lu ON lower(lu.email) = lower(NULLIF(e.email,''))
        GROUP BY e.name, e.email, lu.email ORDER BY e.name`);
    for (const r of m.rows) console.log(`${r.name.padEnd(22)} hr.email=${r.emp_email}  la.email=${r.la_email || 'MISSING'}`);
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });