/* Load an organization's workflow definition (the `workflowMeta.csv` shape) into
 * the configurable workflow tables (wf_roles / wf_user_roles / wf_flows / wf_flow_steps).
 *
 *   node scripts/load_workflow_config.cjs [path] [--dry-run]
 *
 * The sample sheet is a small spreadsheet with side-by-side blocks:
 *
 *   Request,<name>,DATE,REPLACEMENT,STATUS,FLOW_STEP,CURRENT USER,ACTIONS
 *   USERS,,,FLOW_DEF,Flow,Step
 *   <person>,,,<flowId>,<stepOrder>,<stepName>
 *   FLOW_DEF
 *   <flowId>,<flowName>
 *   USER_ROLE,,,ROLES
 *   <person>,<role>,,<role>
 *
 * Parsing is column/header based so it tolerates the interleaved layout.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const ORG = '00000000-0000-0000-0000-000000000000';
const HEADERS = new Set(['REQUEST', 'USERS', 'USER_ROLE', 'FLOW_DEF', 'ROLES', 'FLOW', 'STEP']);

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const file = path.resolve(args.find(a => !a.startsWith('--')) || path.join(__dirname, '..', 'docs', 'workflowMeta.csv'));

const isInt = v => v !== undefined && /^\d+$/.test(String(v).trim());
const clean = v => (v === undefined ? '' : String(v).replace(/\ufeff/g, '').trim());
const isHeader = v => HEADERS.has(clean(v).toUpperCase());

function parseCsv(text) {
  return text.split(/\r?\n/).map(line => line.split(',').map(clean));
}

function parseConfig(text) {
  const rows = parseCsv(text);

  const users = new Set();
  const userRoles = new Map();
  const roleCodes = new Set();
  const flowNames = new Map();
  const stepsByFlow = new Map();

  for (const r of rows) {
    const c0 = r[0] || '', c1 = r[1] || '', c2 = r[2] || '', c3 = r[3] || '', c4 = r[4] || '', c5 = r[5] || '';

    // flow id -> name  (row: 1,Leave)
    if (isInt(c0) && c1 && !isInt(c4)) flowNames.set(c0, c1);

    // flow step  (row: <user>,,,1,0,Init)
    if (isInt(c3) && isInt(c4) && c5) {
      if (!stepsByFlow.has(c3)) stepsByFlow.set(c3, []);
      stepsByFlow.get(c3).push({ order: parseInt(c4, 10), name: c5 });
    }

    // people + their role  (row: Abbas,Emp)
    if (c0 && !isHeader(c0) && !isInt(c0) && c1 && !isHeader(c1)) {
      users.add(c0);
      userRoles.set(c0, c1);
    }

    // explicit ROLES catalog  (row: USER_ROLE,,,ROLES / ..,<role>)
    for (let i = 0; i < r.length; i++) {
      if (clean(r[i]).toUpperCase() === 'ROLES') {
        let j = rows.indexOf(r) + 1;
        for (; j < rows.length; j++) {
          const cell = clean(rows[j][i]);
          if (!cell) break;
          if (isHeader(cell) || !isInt(cell)) roleCodes.add(cell);
        }
      }
    }
  }

  // Role catalog = union of explicit ROLES and every role used by a person.
  for (const r of userRoles.values()) roleCodes.add(r);

  // Flows with no steps inherit the first flow's steps (e.g. "Sick Leave" = "Leave").
  const firstFlowWithSteps = [...stepsByFlow.entries()].find(([, s]) => s.length);
  for (const [id] of flowNames) {
    if (!stepsByFlow.has(id) || stepsByFlow.get(id).length === 0) {
      stepsByFlow.set(id, firstFlowWithSteps ? firstFlowWithSteps[1].map(s => ({ ...s })) : []);
    }
  }

  return { users: [...users], userRoles, roleCodes: [...roleCodes], flowNames, stepsByFlow, firstFlowWithSteps };
}

function flowAppliesTo(name) {
  return /sick/i.test(name) ? { leave_types: ['Sick'] } : {};
}

function stepRow(step) {
  const isInit = step.order === 0 || /^init$/i.test(step.name);
  return {
    code: step.name,
    name: step.name,
    actor_role_code: isInit ? 'Emp' : step.name,
    step_type: isInit ? 'init' : 'approval',
    rule: isInit ? 'requester' : 'role',
    allow_self: isInit,
  };
}

async function main() {
  const text = fs.readFileSync(file, 'utf8');
  const cfg = parseConfig(text);

  console.log('LOG: file:', file);
  console.log('LOG: roles:', cfg.roleCodes.join(', '));
  console.log('LOG: users:', cfg.users.join(', '));
  console.log('LOG: user->role:', JSON.stringify(Object.fromEntries(cfg.userRoles)));
  for (const [id, name] of cfg.flowNames) {
    console.log(`LOG: flow ${id} "${name}" applies_to=${JSON.stringify(flowAppliesTo(name))}`);
    for (const s of cfg.stepsByFlow.get(id) || []) {
      const r = stepRow(s);
      console.log(`      step ${s.order} ${r.code} role=${r.actor_role_code} type=${r.step_type} rule=${r.rule}`);
    }
  }

  if (DRY) { console.log('LOG: DRY-RUN — nothing written.'); return; }

  const client = new Client({
    host: 'db.tjkapzlfvxgocfitusxb.supabase.co', port: 5432,
    user: 'postgres', password: 'SB@1963$1234', database: 'postgres',
    ssl: { rejectUnauthorized: false }
    // NOTE: Direct PG requires IPv6 connectivity. Pooler (aws-0-us-east-1.pooler.supabase.com)
    // resolves to IPv4 but tenant/user format not accepted. Run from IPv6-enabled env.
  });
  await client.connect();
  try {
    await client.query('BEGIN');

    // 1. Roles (rank by catalog order).
    let rank = 10;
    for (const code of cfg.roleCodes) {
      await client.query(
        `INSERT INTO wf_roles (org_id, code, name, rank) VALUES ($1,$2,$2,$3)
         ON CONFLICT (org_id, code) DO UPDATE SET name = EXCLUDED.name, rank = EXCLUDED.rank`,
        [ORG, code, rank]
      );
      rank += 10;
    }

    // 2. Flows + steps (archive + new version when an active flow's steps change).
    for (const [id, name] of cfg.flowNames) {
      const steps = (cfg.stepsByFlow.get(id) || []).map(stepRow);
      const applies = flowAppliesTo(name);
      const code = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_');

      const existing = await client.query(
        `SELECT id, version FROM wf_flows WHERE org_id=$1 AND code=$2 AND status='active' ORDER BY version DESC LIMIT 1`,
        [ORG, code]
      );

      let flowId, version = 1, create = true;
      if (existing.rows.length) {
        const cur = existing.rows[0];
        const curSteps = await client.query(
          `SELECT step_order, code, actor_role_code, step_type, rule FROM wf_flow_steps WHERE flow_id=$1 ORDER BY step_order`,
          [cur.id]
        );
        const same = curSteps.rows.length === steps.length && curSteps.rows.every((s, i) =>
          s.step_order === steps[i].order && s.code === steps[i].code &&
          s.actor_role_code === steps[i].actor_role_code && s.step_type === steps[i].step_type && s.rule === steps[i].rule);
        if (same) { flowId = cur.id; version = cur.version; create = false; }
        else {
          await client.query(`UPDATE wf_flows SET status='archived' WHERE id=$1`, [cur.id]);
          version = cur.version + 1;
        }
      }

      if (create) {
        const ins = await client.query(
          `INSERT INTO wf_flows (org_id, code, name, version, status, applies_to)
           VALUES ($1,$2,$3,$4,'active',$5) RETURNING id`,
          [ORG, code, name, version, applies]
        );
        flowId = ins.rows[0].id;
      }

      await client.query(`DELETE FROM wf_flow_steps WHERE flow_id=$1`, [flowId]);
      for (const s of steps) {
        await client.query(
          `INSERT INTO wf_flow_steps
             (flow_id, step_order, code, name, actor_role_code, step_type, rule, rule_config, condition, is_required, allow_self)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'{}','{}',true,$8)`,
          [flowId, s.order, s.code, s.name, s.actor_role_code, s.step_type, s.rule, s.allow_self]
        );
      }
      console.log(`LOG: flow "${name}" -> ${code} v${version} (${steps.length} steps)${create ? '' : ' [unchanged]'}`);
    }

    // 3. Users -> roles (matched to la_users by name/email; skip + report if unknown).
    let mapped = 0; const unmatched = [];
    for (const [name, role] of cfg.userRoles) {
      const m = await client.query(
        `SELECT id, full_name FROM la_users
         WHERE lower(full_name) = lower($1)
            OR lower(full_name) LIKE '%' || lower($1) || '%'
            OR lower(split_part(email,'@',1)) = lower($1)
         ORDER BY (lower(full_name) = lower($1)) DESC
         LIMIT 1`,
        [name]
      );
      if (!m.rows.length) { unmatched.push(name); continue; }
      await client.query(
        `INSERT INTO wf_user_roles (org_id, user_id, role_code) VALUES ($1,$2,$3)
         ON CONFLICT (org_id, user_id, role_code) DO NOTHING`,
        [ORG, m.rows[0].id, role]
      );
      mapped++;
    }

    await client.query('COMMIT');
    console.log(`LOG: user_roles mapped: ${mapped}` + (unmatched.length ? ` | unmatched (not in la_users): ${unmatched.join(', ')}` : ''));
    console.log('LOG: WORKFLOW CONFIG LOADED');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    await client.end();
  }
}

main().catch(e => { console.log('LOG: ERROR_START'); console.log(e.message); console.log('LOG: ERROR_END'); process.exitCode = 1; });
