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

    console.log("=== 1. HR portal employees matching faisal ===");
    const emp = await client.query(`SELECT id::text, name, email, department, role FROM employees WHERE name ILIKE '%faisal%' OR email ILIKE '%faisal%'`);
    for (const r of emp.rows) console.log(`${r.id}  ${r.name}  email=${r.email}  dept=${r.department}  role=${r.role}`);

    const empId = emp.rows[0]?.id;

    console.log("\n=== 2. HR portal leave_requests for Faisal (Leave History source) ===");
    const lr = await client.query(`SELECT type, start_date, end_date, days, duration_hours, status, reason, la_request_id::text, created_at
        FROM leave_requests WHERE employee_id = $1 ORDER BY created_at`, [empId]);
    console.log(`count = ${lr.rows.length}`);
    for (const r of lr.rows) console.log(`${r.type.padEnd(16)} ${r.start_date}..${r.end_date} days=${r.days} hrs=${r.duration_hours} ${r.status.padEnd(18)} la=${r.la_request_id || '-'}  ${r.reason || ''}`);

    console.log("\n=== 3. la_users row for faisal (mobile roster) ===");
    const lu = await client.query(`SELECT id::text, email, full_name, role, department, manager_id::text FROM la_users WHERE email ILIKE '%faisal%'`);
    for (const r of lu.rows) console.log(`${r.id}  ${r.email}  ${r.full_name}  role=${r.role}  dept=${r.department}  mgr=${r.manager_id}`);
    const luId = lu.rows[0]?.id;

    console.log("\n=== 4. Mobile: la_my_requests equivalent for faisal (requester_id = user) ===");
    if (luId) {
        const mine = await client.query(`SELECT leave_type, start_date, end_date, days, status, created_at
            FROM la_leave_requests WHERE requester_id = $1 ORDER BY created_at`, [luId]);
        console.log(`count = ${mine.rows.length}`);
        for (const r of mine.rows) console.log(`${r.leave_type.padEnd(12)} ${r.start_date}..${r.end_date} days=${r.days} ${r.status}`);
    }

    console.log("\n=== 5. Employee<->la_users email mapping check ===");
    const map = await client.query(`
        SELECT e.name, e.email AS emp_email, lu.email AS la_email
        FROM employees e LEFT JOIN la_users lu ON lower(lu.email) = lower(NULLIF(e.email,''))
        WHERE e.name ILIKE '%faisal%'`);
    for (const r of map.rows) console.log(`${r.name}: employees.email=${r.emp_email}  la_users.email=${r.la_email}`);

    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });