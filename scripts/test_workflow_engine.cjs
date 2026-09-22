/* End-to-end test for the configurable workflow engine (migration 029).
 *
 * Creates a TEMPORARY flow + roles + user mappings, drives a request through
 * every step via the generic RPCs (la_start_request / la_step_decision), then
 * removes all of it (config, request, steps, notifications, balance delta).
 *
 *   node scripts/test_workflow_engine.cjs
 */
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://tjkapzlfvxgocfitusxb.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjU0MjIsImV4cCI6MjA4NTcwMTQyMn0.sZVL7JE8aG8geFzC2z-_xRjMkozSQoIb1Tvohmk53c0';
const ORG = '00000000-0000-0000-0000-000000000000';

const db = new Client({
  host: 'db.tjkapzlfvxgocfitusxb.supabase.co', port: 5432,
  user: 'postgres', password: 'SB@1963$1234', database: 'postgres',
  ssl: { rejectUnauthorized: false }
  // NOTE: Direct PG requires IPv6 connectivity. Pooler (aws-0-us-east-1.pooler.supabase.com)
  // resolves to IPv4 but tenant/user format not accepted. Run from IPv6-enabled env.
});

const ROLE = { EMP: 'ZZ_EMP', DM: 'ZZ_DM', HR: 'ZZ_HR', CEO: 'ZZ_CEO' };
const FLOW = 'ZZ_TEST_FLOW';
const USERS = { EMP: 'mohamed@test.com', DM: 'ahmed@test.com', HR: 'layla@test.com', CEO: 'faisal@test.com' };

async function asUser(email) {
  const c = createClient(URL, ANON);
  const { error } = await c.auth.signInWithPassword({ email, password: '12345' });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}
async function rpc(c, fn, args, label) {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`OK  [${label}]`, JSON.stringify(data).slice(0, 200));
  return data;
}

let reqId = null, flowId = null, restore = null;

async function setup() {
  await db.connect();
  const q = async (sql, p) => (await db.query(sql, p));

  // Hermetic start: purge any stale test flows/roles left by an aborted run.
  // NOTE: these engine tests share the live DB and use the same leave type —
  // never run them concurrently with each other.
  await q(`DELETE FROM wf_flow_steps WHERE flow_id IN (SELECT id FROM wf_flows WHERE code LIKE 'ZZ%')`);
  await q(`DELETE FROM wf_flows WHERE code LIKE 'ZZ%'`);
  await q(`DELETE FROM wf_user_roles WHERE role_code LIKE 'ZZ%'`);
  await q(`DELETE FROM wf_roles WHERE code LIKE 'ZZ%'`);

  for (const code of Object.values(ROLE)) {
    await q(`INSERT INTO wf_roles (org_id, code, name, rank) VALUES ($1,$2,$2,10)
             ON CONFLICT (org_id, code) DO UPDATE SET name = EXCLUDED.name`, [ORG, code]);
  }
  const f = await q(`INSERT INTO wf_flows (org_id, code, name, version, status, applies_to)
                     VALUES ($1,$2,'ZZ Test Flow',1,'active',$3) RETURNING id`,
                    [ORG, FLOW, { leave_types: ['Emergency'] }]);
  flowId = f.rows[0].id;

  const steps = [
    [0, 'Init', ROLE.EMP, 'init', 'requester', true],
    [1, 'DM',   ROLE.DM,  'approval', 'role', false],
    [2, 'HR',   ROLE.HR,  'approval', 'role', false],
    [3, 'CEO',  ROLE.CEO, 'approval', 'role', false],
  ];
  for (const [o, code, role, type, rule, self] of steps) {
    await q(`INSERT INTO wf_flow_steps
             (flow_id, step_order, code, name, actor_role_code, step_type, rule, allow_self)
             VALUES ($1,$2,$3,$3,$4,$5,$6,$7)`, [flowId, o, code, role, type, rule, self]);
  }

  for (const [role, email] of Object.entries(USERS)) {
    await q(`INSERT INTO wf_user_roles (org_id, user_id, role_code)
             SELECT $1, u.id, $2 FROM la_users u WHERE u.email=$3
             ON CONFLICT (org_id, user_id, role_code) DO NOTHING`, [ORG, ROLE[role], email]);
  }

  const bal = await q(`SELECT b.used_days FROM la_leave_balances b
                       JOIN la_users u ON u.id=b.user_id
                       WHERE u.email=$1 AND b.leave_type='Emergency' AND b.year=2026`, [USERS.EMP]);
  restore = bal.rows[0] ? bal.rows[0].used_days : null;
  console.log('LOG: setup complete, flow', flowId, '| prior Emergency used_days:', restore);
}

async function teardown() {
  const q = async (sql, p) => (await db.query(sql, p));
  if (reqId) {
    await q(`DELETE FROM la_request_steps WHERE request_id=$1`, [reqId]);
    await q(`DELETE FROM la_notifications WHERE user_id IN (SELECT id FROM la_users WHERE email = ANY($1)) AND created_at > now() - interval '10 minutes'`,
            [Object.values(USERS)]);
    await q(`DELETE FROM leave_requests WHERE la_request_id=$1`, [reqId]);
    await q(`DELETE FROM la_leave_requests WHERE id=$1`, [reqId]);
  }
  if (restore !== null) {
    await q(`UPDATE la_leave_balances b SET used_days=$1
             FROM la_users u WHERE u.id=b.user_id AND u.email=$2 AND b.leave_type='Emergency' AND b.year=2026`,
            [restore, USERS.EMP]);
  }
  if (flowId) {
    await q(`DELETE FROM wf_flow_steps WHERE flow_id=$1`, [flowId]);
    await q(`DELETE FROM wf_flows WHERE id=$1`, [flowId]);
  }
  await q(`DELETE FROM wf_user_roles WHERE role_code = ANY($1)`, [Object.values(ROLE)]);
  await q(`DELETE FROM wf_roles WHERE code = ANY($1)`, [Object.values(ROLE)]);
  console.log('LOG: teardown complete');
}

(async () => {
  try {
    await setup();

    const emp = await asUser(USERS.EMP);
    const sub = await rpc(emp, 'la_start_request', {
      p_leave_type: 'Emergency', p_start_date: '2026-10-05', p_end_date: '2026-10-07',
      p_reason: 'engine test', p_contact: '+965 000', p_deputy_id: null,
    }, 'start');
    if (!sub.success) throw new Error('start failed');
    reqId = sub.id;
    if (sub.current_step !== 1) throw new Error(`expected current_step 1, got ${sub.current_step}`);

    const dm = await asUser(USERS.DM);
    const s2 = await rpc(dm, 'la_step_decision', { p_request_id: reqId, p_approve: true, p_note: 'DM ok' }, 'dm-approve');
    if (s2.current_step !== 2) throw new Error(`expected current_step 2, got ${s2.current_step}`);

    const hr = await asUser(USERS.HR);
    const s3 = await rpc(hr, 'la_step_decision', { p_request_id: reqId, p_approve: true, p_note: 'HR ok' }, 'hr-approve');
    if (s3.current_step !== 3) throw new Error(`expected current_step 3, got ${s3.current_step}`);

    const ceo = await asUser(USERS.CEO);
    const s4 = await rpc(ceo, 'la_step_decision', { p_request_id: reqId, p_approve: true, p_note: 'CEO ok', p_final_days: 3 }, 'ceo-approve');
    if (s4.status !== 'APPROVED') throw new Error(`expected APPROVED, got ${s4.status}`);

    const flow = await rpc(emp, 'la_request_flow', { p_request_id: reqId }, 'flow');
    console.log('   steps:', flow.map(s => `${s.step_order}:${s.code}=${s.status}`).join(' '));

    const bal = await db.query(`SELECT b.used_days FROM la_leave_balances b JOIN la_users u ON u.id=b.user_id
                                WHERE u.email=$1 AND b.leave_type='Emergency' AND b.year=2026`, [USERS.EMP]);
    console.log('   Emergency used_days after:', bal.rows[0]?.used_days, '(was', restore, ')');

    const coll = await db.query(`SELECT count(*)::int n FROM leave_requests WHERE la_request_id=$1`, [reqId]);
    console.log('   HR portal collated rows:', coll.rows[0].n);

    console.log('\nALL OK');
  } catch (e) {
    console.log('FATAL:', e.message);
    process.exitCode = 1;
  } finally {
    try { await teardown(); } catch (e) { console.log('TEARDOWN ERR:', e.message); }
    await db.end();
  }
})();
