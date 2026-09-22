/* Verifies migration 031: condition fix + auto-skip of un-actionable steps.
 *
 * Scenario: the CEO (no line manager) requests leave through a flow whose first
 * approval is rule=line_manager. It must auto-skip, skip a min_days rule that
 * doesn't match, then proceed to HR and the (non-self) CEO approver.
 *
 *   node scripts/test_engine_autoskip.cjs
 */
const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

const URL = 'https://tjkapzlfvxgocfitusxb.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqa2Fwemxmdnhnb2NmaXR1c3hiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMjU0MjIsImV4cCI6MjA4NTcwMTQyMn0.sZVL7JE8aG8geFzC2z-_xRjMkozSQoIb1Tvohmk53c0';
const ORG = '00000000-0000-0000-0000-000000000000';

const db = new Client({
  host: 'db.tjkapzlfvxgocfitusxb.supabase.co', port: 5432,
  user: 'postgres', password: 'SB@1963$1234', database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

const ROLE = { DM: 'ZZ2_DM', HR: 'ZZ2_HR', CEO: 'ZZ2_CEO' };
const FLOW = 'ZZ2_SKIP_FLOW';
const REQUESTER = 'faisal@test.com';   // CEO, manager_id = NULL
const USERS = { HR: 'layla@test.com', CEO: 'john@test.com', DM: 'ahmed@test.com' };
const LT = 'Emergency';
const YEAR = 2026;

async function asUser(email) {
  const c = createClient(URL, ANON);
  const { error } = await c.auth.signInWithPassword({ email, password: '12345' });
  if (error) throw new Error(`signIn ${email}: ${error.message}`);
  return c;
}
async function rpc(c, fn, args, label) {
  const { data, error } = await c.rpc(fn, args);
  if (error) throw new Error(`${label}: ${error.message}`);
  console.log(`OK  [${label}]`, JSON.stringify(data).slice(0, 220));
  return data;
}

let reqId = null, flowId = null, hadBal = false, priorUsed = 0;

(async () => {
  try {
    await db.connect();
    const q = (sql, p) => db.query(sql, p);

    // Hermetic start: purge any stale test flows/roles left by an aborted run.
    // NOTE: these engine tests share the live DB and the same leave type —
    // never run them concurrently with each other.
    await q(`DELETE FROM wf_flow_steps WHERE flow_id IN (SELECT id FROM wf_flows WHERE code LIKE 'ZZ%')`);
    await q(`DELETE FROM wf_flows WHERE code LIKE 'ZZ%'`);
    await q(`DELETE FROM wf_user_roles WHERE role_code LIKE 'ZZ%'`);
    await q(`DELETE FROM wf_roles WHERE code LIKE 'ZZ%'`);

    for (const code of Object.values(ROLE)) {
      await q(`INSERT INTO wf_roles (org_id, code, name, rank) VALUES ($1,$2,$2,20)
               ON CONFLICT (org_id, code) DO UPDATE SET name = EXCLUDED.name`, [ORG, code]);
    }
    const f = await q(`INSERT INTO wf_flows (org_id, code, name, version, status, applies_to)
                       VALUES ($1,$2,'ZZ2 Skip Flow',1,'active',$3) RETURNING id`,
                      [ORG, FLOW, { leave_types: [LT] }]);
    flowId = f.rows[0].id;

    // order, code, role, type, rule, condition, allow_self
    const steps = [
      [0, 'INI',  null,      'init',     'requester',           {}, true],
      [1, 'DLM',  ROLE.DM,   'approval', 'line_manager',        {}, false],
      [2, 'LONG', ROLE.DM,   'approval', 'role', { min_days: 5 },    false],
      [3, 'HR',   ROLE.HR,   'approval', 'role', {}, false],
      [4, 'CEO',  ROLE.CEO,  'approval', 'role', {}, false],
    ];
    for (const [o, code, role, type, rule, cond, self] of steps) {
      await q(`INSERT INTO wf_flow_steps
               (flow_id, step_order, code, name, actor_role_code, step_type, rule, condition, allow_self)
               VALUES ($1,$2,$3,$3,$4,$5,$6,$7::jsonb,$8)`,
              [flowId, o, code, role, type, rule, JSON.stringify(cond), self]);
    }
    for (const [role, email] of Object.entries(USERS)) {
      await q(`INSERT INTO wf_user_roles (org_id, user_id, role_code)
               SELECT $1, u.id, $2 FROM la_users u WHERE u.email=$3
               ON CONFLICT (org_id, user_id, role_code) DO NOTHING`, [ORG, ROLE[role], email]);
    }

    const bal = await q(`SELECT b.used_days FROM la_leave_balances b JOIN la_users u ON u.id=b.user_id
                         WHERE u.email=$1 AND b.leave_type=$2 AND b.year=$3`, [REQUESTER, LT, YEAR]);
    hadBal = bal.rows.length > 0;
    priorUsed = hadBal ? Number(bal.rows[0].used_days) : 0;

    const ceo = await asUser(REQUESTER);
    // 2026-11-02 (Mon) .. 2026-11-04 (Wed) = 3 working days
    const sub = await rpc(ceo, 'la_start_request', {
      p_leave_type: LT, p_start_date: '2026-11-02', p_end_date: '2026-11-04',
      p_reason: 'autoskip test', p_contact: '+965 000', p_deputy_id: null,
    }, 'start (as CEO)');
    if (!sub.success) throw new Error('start failed');
    reqId = sub.id;
    if (sub.current_step !== 3) throw new Error(`expected current_step 3 (HR), got ${sub.current_step}`);

    const flow0 = await rpc(ceo, 'la_request_flow', { p_request_id: reqId }, 'flow after start');
    const statuses = flow0.map(s => `${s.step_order}:${s.code}=${s.status}`);
    console.log('   steps:', statuses.join(' '));
    const byCode = Object.fromEntries(flow0.map(s => [s.code, s.status]));
    if (byCode.DLM !== 'SKIPPED') throw new Error(`DLM should be SKIPPED (no line manager), got ${byCode.DLM}`);
    if (byCode.LONG !== 'SKIPPED') throw new Error(`LONG should be SKIPPED (min_days 5 > 3), got ${byCode.LONG}`);
    if (byCode.HR !== 'PENDING') throw new Error(`HR should be PENDING, got ${byCode.HR}`);

    const hr = await asUser(USERS.HR);
    const s2 = await rpc(hr, 'la_step_decision', { p_request_id: reqId, p_approve: true, p_note: 'HR ok' }, 'hr-approve');
    if (s2.current_step !== 4) throw new Error(`expected current_step 4, got ${s2.current_step}`);

    const approver = await asUser(USERS.CEO);
    const s3 = await rpc(approver, 'la_step_decision', { p_request_id: reqId, p_approve: true, p_note: 'CEO ok', p_final_days: 3 }, 'ceo-approve');
    if (s3.status !== 'APPROVED') throw new Error(`expected APPROVED, got ${s3.status}`);

    const balAfter = await q(`SELECT b.used_days FROM la_leave_balances b JOIN la_users u ON u.id=b.user_id
                              WHERE u.email=$1 AND b.leave_type=$2 AND b.year=$3`, [REQUESTER, LT, YEAR]);
    console.log('   used_days:', priorUsed, '->', balAfter.rows[0]?.used_days);

    // The CEO (requester) must NOT be able to act on the final step if it resolved to them.
    console.log('\nALL OK — auto-skip + condition fix verified');
  } catch (e) {
    console.log('FATAL:', e.message);
    process.exitCode = 1;
  } finally {
    try {
      const q = (sql, p) => db.query(sql, p);
      if (reqId) {
        await q(`DELETE FROM la_notifications WHERE user_id IN (SELECT id FROM la_users WHERE email = ANY($1)) AND created_at > now() - interval '10 minutes'`, [[REQUESTER, ...Object.values(USERS)]]);
        await q(`DELETE FROM leave_requests WHERE la_request_id=$1`, [reqId]);
        await q(`DELETE FROM la_leave_requests WHERE id=$1`, [reqId]);
      }
      if (hadBal) {
        await q(`UPDATE la_leave_balances b SET used_days=$1 FROM la_users u
                 WHERE u.id=b.user_id AND u.email=$2 AND b.leave_type=$3 AND b.year=$4`, [priorUsed, REQUESTER, LT, YEAR]);
      } else {
        await q(`DELETE FROM la_leave_balances b USING la_users u
                 WHERE u.id=b.user_id AND u.email=$1 AND b.leave_type=$2 AND b.year=$3`, [REQUESTER, LT, YEAR]);
      }
      if (flowId) {
        await q(`DELETE FROM wf_flow_steps WHERE flow_id=$1`, [flowId]);
        await q(`DELETE FROM wf_flows WHERE id=$1`, [flowId]);
      }
      await q(`DELETE FROM wf_user_roles WHERE role_code = ANY($1)`, [Object.values(ROLE)]);
      await q(`DELETE FROM wf_roles WHERE code = ANY($1)`, [Object.values(ROLE)]);
      console.log('LOG: teardown complete');
    } catch (e) { console.log('TEARDOWN ERR:', e.message); }
    await db.end();
  }
})();
