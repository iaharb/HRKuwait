# Configurable Workflow Engine — Design

Status: v3 — implemented (migration `029`, loader, engine test all deployed and passing).
**Superseded for new features by `docs/workflow_engine_design_v2.md`** (generic request engine,
org entities, portal Requests UI — implemented via 035–039, see v2 §14).
Sample config: `docs/workflowMeta.csv` (format reference; not seeded to the live DB).

## 1. Goal

Make approval workflows **data, not code**, so the same HR system can be deployed to
multiple organizations where each organization supplies its own workflow definitions as
**configuration parameters**.

- An organization (client) defines roles, users→roles, flows and ordered steps in config
  (spreadsheet/CSV/JSON) — never in SQL.
- The engine knows only *flows, steps, roles, and the current step*. It does not know
  "deputy", "HR", "CEO".
- The **replacement (covering colleague) is ad hoc**: chosen per request at submit time,
  stored on the request, never fixed in config. A flow may include or omit a replacement step.
- A request is **pinned to the flow version** it started on; config edits affect only new requests.
- **Deployment = one organization per install**, with that org's config seeded on onboarding.
  An optional `org_id` is carried so a future shared deployment is possible; per-tenant RLS is out of scope.

## 2. Parsed configuration sample (`docs/workflowMeta.csv`)

The sample is a workbook with four logical blocks.

### 2.1 ROLES
`Emp, DM, HR, FD, CEO` — role catalog for this org.

### 2.2 USER_ROLE
| User | Role |
|------|------|
| Abbas | Emp |
| Ihab | DM |
| Amal | HR |
| Faisal | FD |
| Mohammad | CEO |

### 2.3 FLOW_DEF (flows and ordered steps)
| Flow | Name | Step | Step code/name |
|------|------|------|----------------|
| 1 | Leave | 0 | Init |
| 1 | Leave | 1 | DM |
| 1 | Leave | 2 | HR |
| 1 | Leave | 3 | FD |
| 1 | Leave | 4 | CEO |
| 2 | Sick Leave | — | *(no steps yet)* |

Step actors are the **roles** (step code = role in this org): `Init` is the employee
initiating, then `DM → HR → FD → CEO`.

### 2.4 REQUEST (runtime tracker)
Columns: `Request, DATE, REPLACEMENT, STATUS, FLOW_STEP, CURRENT USER, ACTIONS`.
Example row: `Abbas, …, 4, CEO, API(loggedIn)` = Abbas's request is at flow step 4, so the
current actor is the `CEO` and the available action is an API call while logged in.

Key confirmations:
- `REPLACEMENT` is a **request column**, not a step in this flow.
- Each request tracks `FLOW_STEP` (current step) and the resulting `CURRENT USER`/`ACTIONS`.
- Role→actor is 1:1 in this sample, but the model supports many users per role.

## 3. Current state in code (hardcoded baselines)

- **leave-app** (`migrations/025`, `027`): `PENDING → DEPUTY_CONFIRMED → MANAGER_APPROVED →
  HR_APPROVED → APPROVED`; one RPC per step (`la_deputy_decision` 025:250,
  `la_manager_decision` 025:311, `la_hr_decision` 025:374, `la_ceo_decision` 025:454);
  hardcoded queue (025:634-651); roles enum on `la_users.role` (`staff|manager|hr|ceo`).
- **HR portal** (`docs/Enterprise_HR-Workflows.docx`): `Pending → Manager_Approved →
  HR_Approved → Resumed → HR_Finalized → Paid/Pushed_To_Payroll`, `Rejected → Re-open`.

Both fit the same generic model (an ordered list of actor-steps).

## 4. Target data model

### 4.1 Configuration (seeded per org, from §2)

```
wf_roles        (id, org_id, code, name, rank, is_approver)
wf_user_roles   (id, org_id, user_id, role_code, department_scope)
wf_flows        (id, org_id, code, name, version, status, applies_to jsonb, effective_from)
wf_flow_steps   (id, flow_id, step_order, code, name, actor_role_code,
                 step_type, condition jsonb, is_required, allow_self)
```

- `rank` orders roles (Emp=10, DM=20, HR=30, FD=40, CEO=50) and powers escalation rules.
- `wf_user_roles.department_scope` optional; `NULL` = org-wide (sample DM acts org-wide).
- `applies_to`: which requests use a flow, e.g. `{"leave_types":["Annual"]}`. Guard leaves
  (Sick) explicitly route by name; unmatched leave types fall back to the default flow.
- `step_type`: `init | approval | review | acknowledge | auto`.
  `Init` = `init` (self, employee); DM/HR/FD/CEO = `approval`.
- `condition`: skip rule, e.g. `{"min_days":3}` or `{"leave_type":"Sick"}`; unmet +
  `is_required=false` ⇒ skipped.
- `allow_self=true` lets the requester act on their own step (`Init`).

### 4.2 Runtime

```
la_leave_requests + flow_id, flow_version, current_step int,
                    replacement_user_id uuid,   -- ad hoc cover (alias of deputy_id)
                    context jsonb               -- leave_type/dept/days snapshot at submit
la_request_steps  (id, request_id, step_order, code, name, actor_role_code,
                   resolved_actor_id uuid, status, decided_by, decided_at, note)
```

- `la_request_steps` is instantiated at submit from the pinned flow version.
- `current_step` = the step awaiting action (matches the sample's `FLOW_STEP`).
- Step `status`: `WAITING | PENDING | APPROVED | REJECTED | SKIPPED`.
- The sample's `CURRENT USER`/`ACTIONS` are **derived**: actor = resolved user for
  `current_step`; actions = allowed transitions for the caller's role.

## 5. Actor resolution

`la_resolve_actor(p_request_id, p_step)` → `uuid[]` (any-of-N):

| rule | resolves to |
|------|-------------|
| `role` (default) | active users with `wf_user_roles.role_code = step.actor_role_code` (+ dept scope) |
| `requester` | the requester (self step, e.g. Init / Resume Duty) |
| `line_manager` | requester's manager, `level` levels up (optional) |
| `requester_replacement` | `la_leave_requests.replacement_user_id` (ad hoc; optional step) |
| `department_head` | head of requester's department |
| `specific_user` | configured `user_id` |

Authorization = caller ∈ resolved set (server-side from `auth.jwt() ->> 'email'`).

## 6. Engine RPCs

- `la_start_request(leave_type, start, end, reason, contact, replacement_id, extra)`
  — selects flow via `applies_to`, snapshots `la_request_steps`, resolves actors, sets
  `current_step` to the first actionable step, notifies.
- `la_step_decision(request_id, approve, note, final_days)`
  — finds current `PENDING` step, authorizes caller, records decision, advances
  `current_step` (skipping unmet/non-applicable steps) or terminates; on final step runs
  finalization (balance deduction, collation into HR portal, notifications).
- `la_action_queue()`
  — `la_request_steps` where `status='PENDING'` and `resolved_actor_id = me` (or role matches);
  returns step + request metadata (replaces 025:592).
- Legacy `la_deputy_decision` / `la_manager_decision` / `la_hr_decision` / `la_ceo_decision`
  become thin adapters mapping to step codes, so the current mobile app keeps working.

### 6.1 Version freezing
`la_start_request` pins `flow_id` + `flow_version`; editing a flow creates a **new version**.
In-flight requests read only their snapshot.

## 7. Migration path (`029_…sql`)

1. Create §4.1 config tables + §4.2 `la_request_steps` + new request columns (additive; old columns kept).
2. Seed this org: roles, user_roles, `Leave` flow (Init→DM→HR→FD→CEO), `Sick Leave` flow stub.
3. Backfill `la_request_steps` for existing `la_leave_requests` rows from their current status.
4. Add engine RPCs; re-point the four legacy RPCs as adapters.
5. Later: expose the HR portal lifecycle (§3) as a second seeded flow; retire the
   status-column state machine in favour of `la_request_steps`.

## 8. CSV loader (`scripts/load_workflow_config.cjs`)

Reads the `workflowMeta.csv` shape and upserts config:
- `ROLES` / `USER_ROLE` blocks → `wf_roles`, `wf_user_roles`.
- `FLOW_DEF` block (Flow, Name, Step) → `wf_flows` + `wf_flow_steps` (step code = actor role);
  bump `version`/archive prior version when a flow changes.
- `FLOW_DEF` name list → flow names for flows with no steps yet (e.g. `Sick Leave`).

## 9. Examples

### 9.1 This org — Leave
```jsonc
roles: [Emp, DM, HR, FD, CEO]
user_roles: { Abbas:Emp, Ihab:DM, Amal:HR, Faisal:FD, Mohammad:CEO }
flow "Leave": [
  { step:0, code:"Init", actor_role:"Emp", type:"init",     allow_self:true },
  { step:1, code:"DM",   actor_role:"DM",  type:"approval" },
  { step:2, code:"HR",   actor_role:"HR",  type:"approval" },
  { step:3, code:"FD",   actor_role:"FD",  type:"approval" },
  { step:4, code:"CEO",  actor_role:"CEO", type:"approval" }
]
replacement: request-level field (no replacement step in this flow)
```

### 9.2 leave-app flow (current, generalized)
```jsonc
flow "leave-default": [
  { step:0, code:"replacement", actor_role:null,  type:"concurrence", rule:"requester_replacement", is_required:false },
  { step:1, code:"manager",     actor_role:"manager", type:"approval",  rule:"line_manager" },
  { step:2, code:"hr",          actor_role:"hr",      type:"approval",  rule:"role" },
  { step:3, code:"ceo",         actor_role:"ceo",     type:"approval",  rule:"role" }
]
```

## 10. Decisions (resolved)

1. **Sick Leave flow** — same chain as Leave, no replacement step (the sample's Leave flow
   has no replacement step either). The loader also copies the first flow's steps for any
   flow left empty.
2. **Roster** — **format-only for now**: the sample is not seeded. `load_workflow_config.cjs`
   matches its users to `la_users` by name/email and reports any unmatched (Abbas/Amal are
   currently unmatched). The test suite uses a temporary flow, then removes it.
3. **Role→actor** — many users may hold a role; **any-one acts** (first decision wins).
   Optional `department_scope` on `wf_user_roles` narrows a role to a department.
4. **Init step** — auto-completed at submit, so `current_step` starts at the first approval
   step (e.g. DM).
5. **Balance/finalization** — deduction + HR-portal collation happen on the final step,
   exactly as migration `027` did. Configurable trigger step is a future extension.

## 11. Implementation status

> Superseded for new features by `docs/workflow_engine_design_v2.md` (v2), which now includes the
> 035–039 engine phase (org entities, request types, generic requests, entity actor rules) and the
> portal Requests UI. §4–§9 here remain valid where not contradicted by v2. See v2 §14 for the
> current implementation status and pending-task roadmap.

| Artifact | State |
|----------|-------|
| `migrations/029_configurable_workflow_engine.sql` | deployed |
| `wf_roles / wf_user_roles / wf_flows / wf_flow_steps` | created (empty — config not seeded) |
| `la_request_steps` + `la_leave_requests.{flow_id,flow_version,current_step}` | created |
| `la_start_request`, `la_step_decision`, `la_workflow_action_queue`, `la_request_flow` | created + granted to `authenticated` |
| legacy RPCs (`la_submit_leave_request`, `la_*_decision`, `la_action_queue`) | untouched — app still works |
| `scripts/load_workflow_config.cjs` | parses `workflowMeta.csv` (dry-run verified) |
| `scripts/test_workflow_engine.cjs` | temp flow, full chain, self-cleaning — passed |

Next (not done): seed a real org's config via the loader, then switch the mobile app from the
legacy RPCs to the generic engine and retire the status-column state machine — now tracked under
v2 §14.2 (pending: switch leave-app + portal leave creation onto `wf_start_request`; seed real
tenant config via the loader once direct PG access is restored).
