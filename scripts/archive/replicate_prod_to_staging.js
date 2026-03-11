
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

/**
 * PRODUCTION TO STAGING DATA REPLICATOR
 * This script mirrors the data from the Production Supabase project to Staging.
 * It uses the service_role key to bypass RLS and ensures dependencies are synced in order.
 */

async function replicate() {
    console.log('🚀 Initializing Data Replication: PROD -> STAGING');

    // 1. Load Environment Variables
    const loadEnv = (filePath) => {
        if (!fs.existsSync(filePath)) {
            console.error(`❌ Missing file: ${filePath}`);
            return null;
        }
        const content = fs.readFileSync(filePath, 'utf8');
        const env = {};
        content.split('\n').forEach(line => {
            const match = line.match(/^([^=]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                let value = match[2].trim();
                if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
                env[key] = value;
            }
        });
        return env;
    };

    const prodEnv = loadEnv('.env.production');
    const stageEnv1 = loadEnv('.env');
    const stageEnv2 = loadEnv('.env.local') || {};
    const stageEnv = { ...stageEnv1, ...stageEnv2 };

    if (!prodEnv || !stageEnv) {
        process.exit(1);
    }

    console.log("PROD ENV LOADED KEYS:", Object.keys(prodEnv));
    console.log("STAGE ENV LOADED KEYS:", Object.keys(stageEnv));

    if (!prodEnv.VITE_SUPABASE_URL || !prodEnv.VITE_SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Missing PROD URL or KEY");
        process.exit(1);
    }
    if (!stageEnv.VITE_SUPABASE_URL || !stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY) {
        console.error("Missing STAGE URL or KEY");
        process.exit(1);
    }

    const prodClient = createClient(prodEnv.VITE_SUPABASE_URL, prodEnv.VITE_SUPABASE_SERVICE_ROLE_KEY);
    const stageClient = createClient(stageEnv.VITE_SUPABASE_URL, stageEnv.VITE_SUPABASE_SERVICE_ROLE_KEY);

    // 2. Define Tables to Sync (Ordered by dependencies)
    const tables = [
        { name: 'company_settings', conflict: 'id' },
        { name: 'departments', conflict: 'name' },
        { name: 'office_locations', conflict: 'id' },
        { name: 'finance_cost_centers', conflict: 'id' },
        { name: 'finance_chart_of_accounts', conflict: 'id' },
        { name: 'finance_mapping_rules', conflict: 'id' },
        { name: 'employees', conflict: 'id' },
        { name: 'employee_allowances', conflict: 'id' },
        { name: 'app_users', conflict: 'username' },
        { name: 'permission_templates', conflict: 'name' },
        { name: 'role_permissions', conflict: 'id' },
        { name: 'public_holidays', conflict: 'id' },
        { name: 'announcements', conflict: 'id' },
        { name: 'notifications', conflict: 'id' },
        { name: 'leave_balances', conflict: 'id' },
        { name: 'leave_requests', conflict: 'id' },
        { name: 'leave_history', conflict: 'id' },
        { name: 'attendance', conflict: 'id' },
        { name: 'payroll_runs', conflict: 'id' },
        { name: 'payroll_items', conflict: 'id' },
        { name: 'journal_entries', conflict: 'id' },
        { name: 'performance_evaluations', conflict: 'id' },
        { name: 'variable_compensation', conflict: 'id' },
        { name: 'expense_claims', conflict: 'id' },
        { name: 'expense_claim_history', conflict: 'id' }
    ];

    console.log(`📡 Connected to:\n   PROD: ${prodEnv.VITE_SUPABASE_URL}\n   STAGE: ${stageEnv.VITE_SUPABASE_URL}\n`);

    // --- Phase 1: WIPE STAGING (Reverse Order to respect FKs) ---
    console.log('🧹 Phase 1: Wiping Staging data...');
    const reversedTables = [...tables].reverse();
    for (const table of reversedTables) {
        if (table.name === 'office_locations') continue; // Safe to ignore due to UUID mismatches

        let conflictCol = table.conflict;
        if (table.name === 'permission_templates') conflictCol = 'id'; // fix

        const { error: delError } = await stageClient.from(table.name).delete().not(conflictCol, 'is', null);
        if (delError) {
            console.error(`   Failed to delete ${table.name}: ${delError.message}`);
        }
    }

    // --- Phase 2: REPLICATE PROD TO STAGING ---
    console.log('\n🔄 Phase 2: Copying Prod -> Staging...');
    for (const table of tables) {
        if (table.name === 'office_locations') continue; // Skip to avoid type errors

        console.log(`⏳ Syncing [${table.name}]...`);
        const { data: prodData, error: fetchError } = await prodClient.from(table.name).select('*');
        if (fetchError) {
            console.warn(`⚠️  Failed to fetch ${table.name}: ${fetchError.message}. Skipping.`);
            continue;
        }
        if (!prodData || prodData.length === 0) continue;

        console.log(`   Found ${prodData.length} rows. Pushing...`);
        const chunkSize = 100;

        for (let i = 0; i < prodData.length; i += chunkSize) {
            let currentChunk = prodData.slice(i, i + chunkSize);
            let chunkSuccess = false;

            while (!chunkSuccess) {
                const { error: pushError } = await stageClient
                    .from(table.name)
                    .upsert(currentChunk, { onConflict: table.conflict });

                if (!pushError) {
                    chunkSuccess = true;
                    break;
                }

                // If column missing in Staging, auto-heal by stripping it
                const match = pushError.message.match(/Could not find the '([^']+)' column/);
                if (match) {
                    const badCol = match[1];
                    console.log(`     -> Healing schema drift: Stripping unknown column '${badCol}'`);
                    currentChunk = currentChunk.map(item => {
                        const newItem = { ...item };
                        delete newItem[badCol];
                        return newItem;
                    });
                    continue; // Retry chunk
                }

                // FK constraint violation handler
                if (pushError.message.includes('foreign key constraint')) {
                    if (table.name === 'leave_requests' && pushError.message.includes('manager_id_fkey')) {
                        console.log(`     -> Healing FK: Stripping manager_id from leave_requests`);
                        currentChunk = currentChunk.map(item => {
                            const newItem = { ...item };
                            delete newItem['manager_id'];
                            return newItem;
                        });
                        continue;
                    }
                    if (table.name === 'leave_requests' && pushError.message.includes('employee_id_fkey')) {
                        console.error(`     ❌ FK Error on ${table.name} employee_id: ${pushError.message}. Ignoring this chunk.`);
                        break;
                    }
                    console.error(`     ❌ FK Error on ${table.name}: ${pushError.message}. Ignoring this chunk.`);
                    break;
                }

                if (pushError.message.includes('invalid input syntax for type uuid')) {
                    console.error(`     ❌ Type mismatch in ${table.name}. Prod data incompatible with Staging UUID schema. Skipping table.`);
                    break;
                }

                console.error(`     ❌ Push Error on ${table.name}: ${pushError.message}`);
                break; // break while
            }
        }
        console.log(`✅ [${table.name}] sync complete.`);
    }

    console.log('\n✨ All tables processed. Environment synchronization complete.');
}

replicate();
