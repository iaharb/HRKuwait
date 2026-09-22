/* Diagnose + fix: find approved la requests with no HR collation, collate them,
   resync la balances from hrportal, then clean notifications that reference the
   deleted 3-day test request (2026-10-05..07). */
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

    // 1. Approved la requests missing a collated HR row.
    const q = await client.query(`
        SELECT q.id, ru.email, q.leave_type, q.days, q.start_date, q.end_date
        FROM la_leave_requests q JOIN la_users ru ON ru.id = q.requester_id
        WHERE q.status = 'APPROVED'
          AND NOT EXISTS (SELECT 1 FROM leave_requests lr WHERE lr.la_request_id = q.id)
        ORDER BY q.created_at`);
    console.log(`Approved la requests WITHOUT collation: ${q.rows.length}`);
    if (q.rows.length === 0) return;

    // 2. Collate each now (function is idempotent per request).
    for (const r of q.rows) {
        const c = await client.query(`SELECT la_collate_hr_leave($1::uuid) AS out`, [r.id]);
        console.log(`  ${r.email} ${r.leave_type} ${r.days}d -> `, JSON.stringify(c.rows[0].out));
    }

    // 3. Re-check HR rows.
    const hr = await client.query(`
        SELECT lr.employee_name, lr.type, lr.status, lr.days, lr.la_request_id::text
        FROM leave_requests lr WHERE lr.la_request_id IS NOT NULL ORDER BY lr.created_at`);
    console.log('\nHR portal collated rows now:');
    hr.rows.forEach(r => console.log(`  ${r.employee_name} | ${r.type} | ${r.status} | days=${r.days} | la=${r.la_request_id.slice(0,8)}`));

    // 4. Resync la balances from HR portal (source of truth after trigger recalc).
    const sync = await client.query(`SELECT la_sync_hr_balances(NULL) AS n`);
    console.log(`\nresynced la balances rows: ${sync.rows[0].n}`);

    // 5. Mohamed balances both sides.
    const la = await client.query(`
        SELECT lab.leave_type, lab.used_days, lab.entitled_days FROM la_leave_balances lab
        JOIN la_users lu ON lu.id = lab.user_id WHERE lu.email='mohamed@test.com' AND lab.year=2026 ORDER BY lab.leave_type`);
    console.log('\nla mohamed balances:');
    la.rows.forEach(r => console.log(`  ${r.leave_type}: ${r.used_days}/${r.entitled_days}`));
    const hrb = await client.query(`
        SELECT lb.leave_type, lb.used_days FROM leave_balances lb
        JOIN employees e ON e.id=lb.employee_id WHERE e.email='mohamed@test.com' AND lb.year=2026 ORDER BY lb.leave_type`);
    console.log('hrportal mohamed balances:');
    hrb.rows.forEach(r => console.log(`  ${r.leave_type}: ${r.used_days}`));

    // 6. Clean stale notifications from the removed 3-day test request (dates 2026-10-05..07).
    const del = await client.query(`
        DELETE FROM la_notifications
        WHERE body LIKE '%2026-10-05%2026-10-07%' OR body LIKE '%2026-10-05 to 2026-10-07%'`);
    console.log(`\ndeleted stale test notifications: ${del.rowCount}`);

    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });