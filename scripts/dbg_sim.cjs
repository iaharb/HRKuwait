const { Client } = require('pg');
const client = new Client({
    host: "db.tjkapzlfvxgocfitusxb.supabase.co", port: 5432, user: "postgres",
    password: "SB@1963$1234", database: "postgres", ssl: { rejectUnauthorized: false }
});
async function main() {
    await client.connect();
    // Simulate la_my_requests() for faisal (requester_id = his la_users id)
    const q = await client.query(`
        SELECT lr.leave_type, lr.start_date, lr.end_date, lr.days, lr.status
        FROM la_leave_requests lr
        JOIN la_users u ON u.email = 'faisal@test.com'
        WHERE lr.requester_id = u.id
        ORDER BY lr.created_at DESC`);
    console.log(`la_my_requests(faisal) -> ${q.rows.length} rows:`);
    q.rows.forEach(r => console.log(`  ${r.leave_type.padEnd(12)} ${r.start_date.toISOString().slice(0,10)}..${r.end_date.toISOString().slice(0,10)} days=${r.days} ${r.status}`));

    // Simulate la_request_detail authority: deputy null renders fine (object with null name)
    const d = await client.query(`
        SELECT lr.deputy_id,
               jsonb_build_object('id', de.id, 'name', de.full_name) AS deputy
        FROM la_leave_requests lr
        LEFT JOIN la_users de ON de.id = lr.deputy_id
        JOIN la_users u ON u.email='faisal@test.com'
        WHERE lr.requester_id = u.id LIMIT 1`);
    console.log('\ndeputy json for an imported row:', JSON.stringify(d.rows[0]));
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });