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
    for (const fn of ['la_ceo_decision', 'la_collate_hr_leave']) {
        const r = await client.query(`SELECT pg_get_functiondef(p.oid) AS def
            FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE p.proname=$1 AND n.nspname='public'`, [fn]);
        console.log(`\n===== ${fn} =====`);
        console.log(r.rows[0] ? r.rows[0].def : 'NOT FOUND');
    }
    await client.end();
}
main().catch(e => { console.error(e.message); process.exit(1); });