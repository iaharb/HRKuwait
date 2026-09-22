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
    const c = await client.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'la_leave_requests' ORDER BY ordinal_position`);
    for (const r of c.rows) console.log(`${r.column_name.padEnd(20)} nullable=${r.is_nullable}`);

    console.log("\nleaves already imported pattern? none yet. statuses present in HR leave_requests:");
    const s = await client.query(`SELECT status, count(*) FROM leave_requests GROUP BY status ORDER BY count(*) DESC`);
    for (const r of s.rows) console.log(`  ${r.status.padEnd(20)} ${r.count}`);
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });