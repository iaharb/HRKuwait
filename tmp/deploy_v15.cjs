const pkg = require('pg');
const { Client } = pkg;
const fs = require('fs');
const path = require('path');

const client = new Client({
    host: "db.tjkapzlfvxgocfitusxb.supabase.co",
    port: 5432,
    user: "postgres",
    password: "admin@2026",
    database: "postgres",
    ssl: {
        rejectUnauthorized: false
    }
});

const v15_sql = fs.readFileSync(path.join(__dirname, '../tmp/update_rpc_v15.sql'), 'utf8');

async function main() {
    try {
        console.log("LOG: Attempting connection...");
        await client.connect();
        console.log("LOG: Connected successfully.");
        await client.query(v15_sql);
        console.log("LOG: V15 DEPLOYED SUCCESS");
    } catch (err) {
        console.log("LOG: ERROR_START");
        console.log(err.message);
        console.log("LOG: ERROR_END");
    } finally {
        await client.end();
    }
}

main();
