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
    console.log("=== columns la_leave_requests ===");
    const c1 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='la_leave_requests' ORDER BY ordinal_position`);
    console.log(c1.rows.map(r => `${r.column_name}:${r.data_type}`).join('\n'));
    console.log("\n=== columns la_notifications ===");
    const c2 = await client.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='la_notifications' ORDER BY ordinal_position`);
    console.log(c2.rows.map(r => `${r.column_name}:${r.data_type}`).join('\n'));
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });