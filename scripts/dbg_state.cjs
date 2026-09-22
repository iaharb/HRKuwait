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

    console.log("=== la_leave_requests (leave app) ===");
    const la = await client.query(
        `SELECT q.id::text, ru.email AS requester, du.email AS deputy,
                q.leave_type, q.start_date, q.end_date, q.days, q.status, q.reason, q.rejection_reason, q.rejection_step, q.created_at
         FROM la_leave_requests q
         JOIN la_users ru ON ru.id = q.requester_id
         LEFT JOIN la_users du ON du.id = q.deputy_id
         ORDER BY q.created_at`);
    for (const r of la.rows) console.log(`${r.created_at?.toISOString ? r.created_at.toISOString() : r.created_at}  ${r.requester?.padEnd(20)} dep=${r.deputy}  ${r.leave_type.padEnd(15)} ${r.start_date}..${r.end_date} days=${r.days} ${r.status}  ${r.reason}${r.rejection_reason ? ' REJ:'+r.rejection_reason : ''}${r.rejection_step ? ' STEP:'+r.rejection_step : ''}`);

    console.log("\n=== leave_requests (HR portal) - recent ===");
    const hr = await client.query(
        `SELECT id::text, employee_id::text, employee_name, type, start_date, end_date, days,
                status, la_request_id::text, created_at, manager_id
         FROM leave_requests ORDER BY created_at DESC LIMIT 20`);
    for (const r of hr.rows) console.log(`${r.employee_name || r.employee_id}  ${r.type.padEnd(15)} ${r.status.padEnd(20)} days=${r.days} la_id=${r.la_request_id ? (r.la_request_id.slice(0,8)) : '-'}  created=${r.created_at?.toISOString ? r.created_at.toISOString() : r.created_at}`);

    console.log("\n=== la_notifications (leave app) ===");
    const notif = await client.query(
        `SELECT n.id::text, lu.email, n.title, n.body, n.created_at, n.is_read
         FROM la_notifications n JOIN la_users lu ON lu.id = n.user_id
         ORDER BY n.created_at`);
    for (const r of notif.rows) console.log(`${r.created_at?.toISOString ? r.created_at.toISOString() : r.created_at}  ${r.email.padEnd(22)} read=${r.is_read}  ${r.title} | ${r.body}`);

    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });