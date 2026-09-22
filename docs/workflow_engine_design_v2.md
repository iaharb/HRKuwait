# Configurable Workflow Engine — v2 Design (Request & Approval Platform)

Status: IMPLEMENTED — migrations 035–039 applied and verified; generic Requests UI shipped in the
portal (`/requests`); 32/32 REST engine checks green. Supersedes `workflow_engine_design.md` (v1/v3)
for new features. One open review item remains (§11.4 notifications); see §14 for the pending-task
roadmap.

This document is the canonical spec for architecture, data models and logic rules. v1 (§4–§9 of
`workflow_engine_design.md`) remains valid where not contradicted here.

---

## 1. Goals

Provide a metadata-driven HR request & approval platform that scales across organizations:

1. Every organization defines its own **org structure**, **request types**, **workflows**, and
   **users→roles** as data — never code.
2. Workflows chain through the real reporting structure:
   `requester → direct manager (DLM) → unit/supervision head → department manager → division manager
   → HR / FIN managers → CEO`.
3. Request types are pluggable (leave, sick, short permission, hajj, financial loans, custom) with
   per-type **payload schema**, **eligibility rules**, and **finalization strategy**.
4. Steps are fully configurable per org + request type, with conditional routing on any request
   attribute (e.g. loan amount > 5,000 → CFO; leave > 14 days → HR Manager).
5. Deployments stay single-tenant-operational; `org_id` is carried on all tables so a shared
   multi-tenant deployment needs no redesign (isolation is future work).

---

## 2. Tenancy model

- `org_id uuid DEFAULT '00000000-0000-0000-0000-000000000000'` (zero-org) on every table that holds
  configuration, entities, requests or employees.
- Functions resolve the current org the same way they do today (`wf_default_org()`); all selects
  filter on it. No tenant-context claim / RLS enforcement this phase.
- Portal `employees` and leave `la_users` gain `org_id` (null → zero-org on insert).
- `wf_flow_steps` is scoped by `flow_id` (flow is org-scoped) — unchanged.

New to add: `org_id` → `employees`, `la_users`, `wf_requests`, `hr_org_units`, `wf_request_types`.

---

## 3. Organizational model

### 3.1 Entities

`hr_org_units` — one row per organizational entity:

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | |
| code | text | stable id used by config (`IT`, `FIN`, `SALES`) |
| kind | text CHECK | `division` \| `department` \| `supervision` \| `unit` |
| parent_id | uuid FK → hr_org_units | hierarchy edge |
| head_user_id | uuid FK → la_users | the person who is the official head |
| name | text | display name (en) |
| name_arabic | text | optional |
| active | boolean | default true |

**Contract / invariants**
- Acyclic tree. Allowed parent kinds:
  - `division` → parent NULL (top level, e.g. Finance & Administration, Operations).
  - `department` → parent is a `division` (FIN dept, HR dept under Finance & Admin; IT, Sales under Operations).
  - `supervision` / `unit` → parent is a `department` or a `supervision`.
- `department` and lower must have a parent; `division` is the only root.
- Path depth limit: division → department → supervision → unit (4 levels max this phase).

### 3.2 Employee membership

- `la_users.manager_id` (exists) = **the direct manager (DLM)** — the person the employee reports
  to; may be a unit/supervision head or someone under them. Required for every employee except
  `CEO` (enforced by `wf_dlm_coverage()`).
- `la_users.entity_id uuid FK → hr_org_units` (new) = the **leaf** entity the employee sits in
  (a `unit` or `supervision`). `null` allowed for executives (CEO/division heads).
- `la_users.department` remains a denormalized string for display/compat; not authoritative once
  `entity_id` is set.
- Portal `employees` mirrors both (`org_id`, `entity_id`); existing `manager_id` stays.

### 3.3 Head derivation (read-only helpers → actor rules in §5)

Given a user, compute these deterministically:

| who | how |
|---|---|
| unit/supervision head | `hr_org_units.head_user_id` where `entity_id` in (`unit`,`supervision`) |
| department manager | head of the `department` ancestor of `entity_id` |
| division manager | head of the `division` ancestor (0 or 1 levels up) |
| department scope | `la_users.department` (existing dept-scope semantics kept) |

`wf_org_context(p_user_id)` (new RPC) returns `{entity_id, unit_head, supervision_head, department_head, division_head, manager_id, department}` — one source of truth used by the actor rules.

### 3.4 Personnel definitions are runtime data maintained by HR/Admin

Nothing about "who is who" is hardcoded or static. All definitions are rows in tables edited at
runtime by authorized HR/Admin through the admin UI (Workflow Config is guarded to
`Admin | HR Manager` on the portal). Migrations only create the shapes and seed today's snapshot once.

| Definition | Table | Editor surface |
|---|---|---|
| People (users) | `employees` / `la_users` | Employee registry (`AddEmployeeModal`) |
| Direct manager (DLM) | `la_users.manager_id` | Workflow Config → Organization/DLM |
| Who holds a workflow role | `wf_user_roles` | Workflow Config → Role Assignments |
| Org tree (entities) | `hr_org_units` | Workflow Config → Org Tree (035) |
| Entity heads | `hr_org_units.head_user_id` | Workflow Config → Org Tree |
| Employee leaf membership | `la_users.entity_id` | Workflow Config → Org Tree (membership) |
| Request types (`payload_schema`/`eligibility`/`finalization`) | `wf_request_types` | Workflow Config → Request Types (036) |

All writes run through the service-role client with server-side validation: acyclic tree, allowed
parent kinds, max depth (division→department→supervision→unit), head is an active user, manager ≠
self, membership is a `unit`/`supervision` leaf. An audit trail column records who changed what.

---

## 4. Request model (generic payload engine)

### 4.1 Request types — `wf_request_types` (org-scoped)

| column | type | notes |
|---|---|---|
| id / org_id | uuid | |
| code | text | `Annual`, `Sick`, `ShortPermission`, `Hajj`, `Loan`, custom |
| name | text | |
| payload_schema | jsonb | attribute definitions (§4.3) |
| eligibility | jsonb | rules evaluated at submit (§6.2) |
| finalization | jsonb | strategy on final approval (§6.5) |
| active | boolean | |

### 4.2 Requests — `wf_requests` (runtime)

Generic header; replaces the leave-specific assumptions of `la_leave_requests`.

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| org_id | uuid | |
| request_type | text | → `wf_request_types.code` |
| requester_id | uuid FK → la_users | |
| payload | jsonb | validated attributes (§4.3) |
| deputy_id | uuid FK → la_users | ad hoc replacement (request-level, as today) |
| flow_id / flow_version | | pinned at submit (§7) |
| current_step | int | index of the step awaiting action |
| status | text | `DRAFT \| PENDING \| APPROVED \| REJECTED \| CANCELLED \| RETURNED` |
| created_at / updated_at | timestamptz | |

Details per type live in **typed detail tables** where business logic needs stable columns:
- leave/short-permission/sick: `la_leave_requests` continues as the detail row (`start_date`,
  `end_date`, `days`, hours for ShortPermission). Leave app keeps reading it.
- loan: new `wf_loans` (`request_id`, `amount`, `duration_months`, `instalments_payload` or
  derived schedule, timestamps).
- `wf_requests.detail_type` text + `detail_id` uuid (polymorphic pointer) ties header → detail.

### 4.3 payload_schema (attribute grammar)

```jsonc
{
  "attributes": [
    { "key": "days",            "type": "number", "min": 1, "max": 365 },
    { "key": "amount",          "type": "number", "min": 100, "max": 100000 },
    { "key": "duration_months", "type": "number", "min": 1, "max": 60 },
    { "key": "start_date",      "type": "date" },
    { "key": "end_date",        "type": "date" },
    { "key": "period",          "type": "enum",   "values": ["start","end"] }   // ShortPermission
  ],
  "derived":  { "days": "end_date - start_date + 1" }   // computed at submit, read by condition/balance
}
```

- `type` ∈ `number | date | text | enum | boolean`.
- Validation at submit: required keys, ranges, enum membership; unknown keys rejected.
- **`derived`** lets conditions and balances reference computed values (`days`, `loan_total`).

---

## 5. Actor resolution — rule catalog

All rules return `SETOF la_users` (any-of-N applies; single user is the common case). Resolution
order per rule below. `wf_org_context` powers the entity rules.

| rule | resolves to | config |
|---|---|---|
| `role` (default) | holders of `actor_role_code` in `wf_user_roles` (+ dept scope) | — |
| `requester` | the requester (self step `init`) | — |
| `line_manager` | manager chain, `level` levels up (`1` = DLM) | `level` |
| `requester_replacement` | `wf_requests.deputy_id` | — |
| `department_head` | head of requester's **department** entity | — |
| `unit_head` | head of requester's **unit** entity | — |
| `supervision_head` | head of requester's **supervision** entity | — |
| `division_head` | head of requester's **division** entity | — |
| `specific_user` | configured user | `user_id` |
| `reporting_chain` | climb entities then manager chain, up to `level` hops (0 = DLM) | `level`, optional `include_role` |

**Dedup rule**: a step's resolved set is deduped; if a person is reachable by multiple rules they
resolve once. `allow_self=false` (default) removes the requester from the set (existing behavior).

Recommendation for the current tenant:
- DLM step → `line_manager` `{level:1}` (unchanged).
- Dept manager step → `department_head` (explicit head, not rank-based).
- Add steps: `supervision_head`, `division_head` as the org grows; empty resolved set ⇒ step
  auto-skips with `Skipped: no eligible approver` (existing).

---

## 6. Conditional routing & logic rules

### 6.1 Step `condition` (extended grammar, AND across present keys — current OR[all-present] semantics)

| key | evaluates against | example |
|---|---|---|
| `leave_type` | request types list — exact | `{"leave_type":["Annual","Sick"]}` |
| `days_gt / days_gte / days_lt / days_lte` | `payload.days` | `{"days_gt":14}` → HR manager step |
| `amount_gt / amount_gte / amount_lt / amount_lte` | `payload.amount` | `{"amount_gt":5000}` → CFO/division step |
| `duration_months_gt` … | `payload.duration_months` | loans ≤ 12 with manager only |
| `period` | enum attribute | short permission start vs end |
| `requester_role` | requester's role in `wf_user_roles` | executive-vs-staff routing |
| `rule_config.skip_for_requester_role` | (existing; step skipped) | CEO exempt from DLM |
| `dynamic` (future) | PL/pgSQL-expr allow-list | — |

Unmet condition ⇒ status `SKIPPED`, note `Skipped: step condition not met` (existing), unless
`is_required=true` in which case the step blocks. **Step applicability is evaluated at submit and
frozen** (like flow versioning).

### 6.2 Eligibility rules — `wf_request_types.eligibility`

Evaluated by new `wf_check_eligibility(p_type, p_requester_id, p_payload)` → `{eligible, code, reason}`.

| rule key | meaning | example |
|---|---|---|
| `min_tenure_months` | months since `la_users.joined_on` | Hajj = 24 |
| `max_uses` | count prior approved requests of this type | Hajj = 1 (once-only) |
| `count_statuses` | which statuses count toward `max_uses` | `["APPROVED"]` |
| `balance_required` | balance key with enough remaining | Annual ≥ requested days |
| `balance_keys` | which `la_leave_balances.leave_type` rows | Annual/Sick |
| `exclusion_months` | cool-down after last request | optional |

Defaults: if no rule → eligible. Ineligible ⇒ request not submitted (client gets reason).

### 6.3 Decision / action model

`step_type` extended: `init | approval | review | acknowledge | endorsement | return_for_correction | auto`.

Allowed decisions per step type (passed to `wf_step_decision`):

| step_type | decisions available |
|---|---|
| `init` | auto-completes at submit (existing) |
| `approval` | `approve`, `reject` |
| `review` | `approve`, `return`, `reject` |
| `acknowledge` (replacement) | `approve` (concur), `reject` |
| `endorsement` | `endorse` (=approve, records opinion), `return`, `reject` |
| `return_for_correction` | hosted as a *capability* of review/endorsement steps: `return` resets flow to a target step |
| `auto` | runs server-side (no actor) |

`return` semantics: request status → `RETURNED`, current step reset to `target_step` (default: the
lowest-numbered step whose rule resolves to the requester, or `step_target` in step config);
re-applied on next `approve` from requester (request steps re-instantiated from pinned version).

### 6.4 Delegation / escalation (phase 2 — schema-ready only)

Reserved in `rule_config` (not implemented): `delegate_to_role`, `escalate_after_hours`,
`escalate_to_rule`. Documented so step editing UI can admit them without migration.

### 6.5 Finalization strategy — `wf_request_types.finalization`

Per-type, executed on final approval in `wf_step_decision`:

| type | behavior |
|---|---|
| leave family | deduct `la_leave_balances`; collate into HR portal (027 logic); notify |
| loan | create/finalize `wf_loans` + generate repayment schedule; notify; flag for FIN |
| hajj | balance/history mark; notify HR |
| custom | config `finalization.action` (`none \| balance \| loan \| hook`) — extensible |

### 6.6 Org edits vs in-flight requests — freeze + explicit reassignment

- **Snapshots are frozen.** A request pins its flow version; actor steps were resolved at submit.
  Editing a head, manager, or membership **does not rewrite** pending steps — existing requests keep
  their resolved actors and history (predictable and auditable). Eligibility checks and
  finalization only apply to new / finishing transactions.
- **Explicit reassignment** (HR-controlled). When someone leaves or the org changes, HR runs
  `wf_reassign_pending(p_old_user_id, p_new_user_id DEFAULT NULL)`:
  - with `p_new_user_id` → all `PENDING/WAITING` steps currently resolved to the old user are
    pointed at the new user (recorded override);
  - without → those steps are **re-resolved by their rule** (e.g. `line_manager` now picks the
    requester's new manager; entity-head rules pick the new heads); empty results are auto-skipped
    with the existing `Skipped: no eligible approver` note.
  Reassignment touches only affected open steps — a visible, auditable action. Auto-recompute of
  actors on every org edit is deliberately **not** implemented (silent ownership churn).

---

## 7. Engine RPC surface

| RPC | purpose | legacy impact |
|---|---|---|
| `wf_check_eligibility` | per-type eligibility (§6.2) | new |
| `wf_org_context` | entity/head context for a user (§3.3) | new |
| `wf_start_request(p_request_type, p_payload jsonb, p_deputy_id)` | validate schema → eligibility → resolve flow → instantiate steps → set `current_step` → notify | `la_start_request` becomes a leave adapter mapping leave args → payload and delegating |
| `wf_step_decision(p_request_id, p_decision, p_note, p_final_days)` | authorize → decision matrix (§6.3) → advance/skip/return → finalization (§6.5) | `la_step_decision` adapts to `approve/reject` |
| `wf_action_queue() / wf_request_flow()` | read models (unchanged semantics, new tables) | legacy names kept as views/adapters |
| `wf_dlm_coverage()` | enforcement (§3.2) | exists (034) |
| `wf_reassign_pending(p_old_user_id, p_new_user_id)` | explicit reassignment of open steps (§6.6) | new (035) |

**Version freezing**: `wf_requests` pins `flow_id` + `flow_version`; editing a flow creates a new
version; in-flight requests read only their snapshot. Step applicability frozen at submit (§6.1).

---

## 8. Data model delta (proposed migrations 035+)

1. `035_org_entities.sql` — `hr_org_units` (kinds, acyclic/depth guard trigger), `org_id` +
   `entity_id` on `la_users` and portal `employees`; `wf_org_context()`; `wf_reassign_pending()`.
2. `036_request_types.sql` — `wf_request_types`; seed current five types; `wf_check_eligibility()`.
3. `037_generic_requests.sql` — `wf_requests` header + `detail_type/detail_id`; leave-family
   materialization stays in `la_leave_requests`; `wf_loans` + repayment schedule; `wf_step_decision`
   decision matrix incl. `return`; rewrite `la_start_request`/`la_step_decision` as adapters.
4. `038_actor_rules_entities.sql` — `unit_head`, `supervision_head`, `division_head`,
   `reporting_chain` in `wf_resolve_actors`; extend `condition` evaluator (attribute grammar §6.1).
5. `039_seed_org_tree.sql` — seed this tenant's division/department/supervision/unit tree and heads
   mapping existing live users (§9).
6. UI + leave-app changes (post-migration): WorkflowConfig entity tree tab, request-type editor,
   payload/condition editors; leave-app dynamic form; DLM coverage now reads entity heads too.

## 9. Current-tenant seed sketch (for 039)

- Divisions: `OPER` (Operations), `FAD` (Finance & Administration).
- Departments under `OPER`: `IT` (IT Services), `SALES`; under `FAD`: `FIN`, `HR` (Human Resources).
- Units/supervisions: `IT-SUPPORT` (supervision) under `IT`; `OPS` (unit) under `OPER` (or `SALES`).
- Heads (live users): CEO=Dr. Faisal (Executive); Division FAD head = Layla (HR) or Faisal (open q);
  Dept IT head = Ahmed; Ops supervision/unit head = Sarah; HR dept head = Layla.
- Leaves entity rows; `la_users.entity_id` set for staff (Mohamed→IT-SUPPORT, Ihab→IT-SUPPORT,
  John→OPS). DLM (`manager_id`) unchanged.

## 10. Backward compatibility & rollout

- Legacy four statuses (`PENDING→…→APPROVED`) remain readable; new requests use `wf_requests`.
- Leave app request *creation* switches to `wf_start_request`; its *read* models keep working via
  the materialized `la_leave_requests` + `la_request_steps`.
- All new columns nullable/defaulted; zero-downtime additive migrations.
- Engine tests extended: entity-head rules, attribute condition routing (`amount_gt`), eligibility
  (Hajj tenure/uses), `return` decision, and a loan-flow full chain.

## 11. Decisions to confirm at review

1. Division heads for the live tenant — who heads `FAD`/`OPER` today (Layla/Faisal? Sarah for OPS)?
2. Loan finalization — generate instalment schedule (`wf_loans`) or only HR-flag? confirm `amount`
   and `duration_months` names.
3. Short Permission — hours (1–2) at `start`/`end` via `period` enum; is a separate balance bucket
   needed or leave only?
4. Emails/notifications wiring stays as-is (function-based), or move to pg_notify pumps this phase?
5. `return_for_correction` default target = requester-init step (confirm), with config override.

## 12. Decisions taken (reviewed)

1. **Personnel definitions are not static** — maintained by HR/Admin at runtime through the
   admin-guarded Workflow Config UI (§3.4); migrations only create shapes + one-time seed.
2. **In-flight transactions are unaffected by org edits** — snapshots frozen; new requests pick up
   new definitions (§6.6).
3. **Reassignment is explicit** — `wf_reassign_pending(old, new|null)` re-originates open steps
   only when HR invokes it; never automatic (§6.6).
4. **Admin editors live inside Workflow Config** (Org Tree + Request Types tabs), guarded to
   `Admin | HR Manager`.
5. **Implementation order** — 035 (org entities + context + reassign) and the Org Tree editor next;
   036/037 (request types / generic requests / loans) after review.

## 13. Engine phase decisions (036–038, taken at implementation)

1. §11 defaults: LIVE divisions FAD→Layla, OPER→Faisal; OPS unit head→Sarah; loan finalization
   generates the full instalment schedule (`wf_loans`); ShortPermission keeps its existing balance
   bucket (no new bucket); notifications stay function-based; `return` targets the requester init
   step (`step_target` config override available).
2. The generic engine is self-contained on `wf_requests`/`wf_request_steps` in this phase. The
   legacy leave engine (`la_start_request`/`la_step_decision`) is **not** rewritten as an adapter
   yet and `wf_start_request` does **not** materialize `la_leave_requests`; switching the leave app
   onto the generic engine (with leave-detail materialization) is a later UI-phase change. This
   keeps the running leave app and its tests byte-for-byte stable.
3. Engine plumbing that §8 conceptually put into 038 (entity actor rules in `wf_resolve_actors2`,
   payload condition evaluator `wf_step_applies_payload`, dual leave/request-type flow matching)
   was consolidated into 037 so each migration applies cleanly in order. 038 therefore contains the
   live-flow upgrades: extended legacy `wf_step_applies`, skip-on-empty-actor parity, and the
   executor notes.
4. Eligibility is enforced only by `wf_start_request`. The legacy path never calls
   `wf_check_eligibility`, so no leave-submission behavior changed for existing users (a deliberate
   guard rail this phase).

## 14. Implementation status & pending tasks

### 14.1 Implemented and verified (this phase)

| Item | State |
|---|---|
| Migrations 035–039 applied to the live DB | done — org tree, request types, generic requests, entity actor rules, org-tree seed |
| Org tree seeded | divisions `OPER`/`FAD`; depts `IT`/`SALES`/`FIN`/`HR`; supervision `IT-SUPPORT`; unit `OPS`; heads + `la_users.entity_id` for staff |
| Request type catalog | `Annual`, `Emergency`, `Hajj`, `Loan`, `ShortPermission`, `Sick` (balance/loan/none finalization) |
| Generic engine RPCs | `wf_start_request`, `wf_step_decision` (approve/reject/return/cancel/resubmit), `wf_action_queue`, `wf_request_flow`, `wf_check_eligibility`, `wf_org_context`, `wf_reassign_pending` |
| `wf_action_queue` RETURNED fix | applied live — requester resubmit steps (`RETURNED`) now surface; one gap originally failed the verifier and is patched |
| Loan finalization | `wf_loans` row + instalment schedule on final approval; schedule verified in `getLoan` UI detail |
| Portal Requests UI | `src/components/GenericRequestsView.tsx` + `src/services/genericRequestService.ts`; `/requests` route; Sidebar "Requests" item |
| Workflow Config UI | Org Tree + Request Types management tabs (`src/components/WorkflowConfig.tsx`) with payload/eligibility/finalization JSON editors |
| Verification | `generic_ui_verify.cjs` — 32/32 PASS (catalog, schema-driven form, submit+validation, own-scope list, queue authz, flow authz, decision matrix, resubmit, loan schedule) |
| Build | `npm run build` green (sole pre-existing `tsc` error is `scripts/maintenance/fix_historical_items.js:33`, unrelated) |

### 14.2 Pending tasks (roadmap)

**Engine / backend**
1. **Leave-app & legacy leave path switch to the generic engine** (§13.2 deferred by design): rewrite
   `la_start_request`/`la_step_decision` as adapters over `wf_start_request`/`wf_step_decision`;
   make `wf_start_request` materialize leave-family detail into `la_leave_requests` on submit; switch
   leave-app, `src/mobile` and portal Leave Management creation paths onto the generic engine; then
   retire the legacy status-column state machine. Largest remaining item.
2. **Codify the live `wf_action_queue` RETURNED patch** — DONE: `migrations/040_request_queue_returned.sql`
   recreates the function with `rs.status IN ('PENDING','RETURNED')` / `r.status IN
   ('PENDING','RETURNED')`, authz unchanged; matches the SQL Editor patch (green via verifier).
3. **Eligibility preview in UI** — DONE: `genericRequestService.checkEligibility` calls
   `wf_check_eligibility` (resolving the user by `la_users` email); `GenericRequestsView` runs a
   debounced preview on the open form and shows a banner (eligible / reason / checking), blocking
   submit when ineligible. REST-verified live (`INSUFFICIENT_BALANCE` reason surfaced correctly).
4. **Phase-2 delegation/escalation** (§6.4) — DONE: `migrations/043_delegation_escalation.sql` extends
   `wf_resolve_actors2` with three new rules (all schema-ready, stored in `rule_config` JSONB):
   - `delegate_to_role` → resolve to a different role (e.g. FD→CEO when FD is OOO)
   - `escalate_after_hours` → after N hours pending, escalate to another role/rule
   - `escalate_to_rule` → use a different resolution rule for escalation
   The step-editing UI in WorkflowConfig can now admit these keys; runtime escalation checks
   (comparing step `created_at` vs `now() - interval`) can be added in `wf_start_request` /
   `wf_step_decision` in a follow-up if desired.
5. **Reassignment UI** — DONE: `migrations/042_reassign_pending_generic.sql` extends
   `wf_reassign_pending` to cover both legacy `la_request_steps` and generic `wf_request_steps`;
   WorkflowConfig → **Reassignment** tab (`src/components/WorkflowConfig.tsx`) lets HR pick a
   "from" user (with live preview of affected step count), optionally a "to" user (or leave blank
   to re-resolve by rule), and shows a result table per step (PENDING/SKIPPED/FAILED).
6. **Finalization notifications** — DONE: `migrations/041_portal_notifications.sql` adds
   `wf_notify_portal_user` helper (writes to portal's `notifications` table, keyed by email), updates
   `wf_notify_request_actors` to surface step-actor notifications in the portal center, updates
   `wf_finalize_request` to also notify portal for loan (FIN/FD, `urgent`/`finance` category) and
   adds `hajj` strategy handling (notifies HRM role holders). Both `la_notify` (leave app) and
   portal notifications are emitted for compatibility.
7. **Notifications decision (§11.4)** — DECIDED: **function-based confirmed for this phase**. The
   bridge in migration 041 (`wf_notify_portal_user`) writes to the portal `notifications` table on
   finalization/step events, and the portal polls via `useNotificationsFetch`. This avoids WebSocket
   complexity and keeps the notification flow simple and auditable. `pg_notify` + Realtime can be
   evaluated in a future phase if real-time push is needed.

**Portal / UI**
8. **i18n** — DONE: `success`/`error`/`sync` keys added to `src/translations.ts` (en + ar); Requests tab
   already handled labels inline by language.
9. **Cleanup probe artifacts** — DONE: `OrgTest`/`UiProbe` request types, `ORGTEST`/`UIPROBE` flows and
   all 39 test `wf_requests` (all `john@test.com`) removed from the live DB. Seeded five preserved
   (`Annual, Emergency, Hajj, Loan, ShortPermission, Sick`) + `AL v4` and `LOAN v1` flows.
10. **Deployment** — UPDATED: `scripts/update_vercel_envs.cjs` now syncs
    `VITE_SUPABASE_SERVICE_ROLE_KEY` in addition to URL + anon key (required for
    `supabaseAdmin` used by catalog / my-requests / loan detail). Run
    `node scripts/update_vercel_envs.cjs` then `vercel --prod` to deploy the
    Requests feature.

**Quality / ops**
11. **Direct PG connectivity** still IPv6-only — `scripts/test_workflow_engine.cjs` (legacy engine),
    `scripts/deploy_leave_app.cjs` (025/026/027) and seeding a real tenant config via
    `scripts/load_workflow_config.cjs` require an IPv6-enabled environment. The Supabase pooler
    (`aws-0-us-east-1.pooler.supabase.com`) resolves to IPv4 but the tenant/user authentication
    format is not accepted (project-ref mapping issue). Workaround: run these scripts from
    GitHub Actions, Supabase CLI, or any IPv6-enabled host. Primary validation uses REST-based
    verifiers (`generic_ui_verify.cjs`, `engine_verify.cjs`) which work over HTTPS.

    **MITIGATED:** GitHub Actions workflow `.github/workflows/pg-tests.yml` runs the PG scripts
    on every push/PR using GitHub's IPv6-enabled runners. Secrets required:
    `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_ANON_KEY`.

12. **tsc hygiene** — the listed `fix_historical_items.js:33` error is FIXED (removed the `as any`
    cast); a stray root `tmp_app.tsx` was removed. A full `tsc --noEmit` still surfaces unrelated
    pre-existing errors in legacy files (`src/mobile/Login.tsx` MOCK_EMPLOYEES import,
    `scripts/maintenance/sync.ts`, `scripts/temp/*`, Deno `supabase/functions/*`) — out of scope here.

13. **Commit the working tree** — the whole workflow-engine workstream (migrations 023–044, leave-app,
    `WorkflowConfig`, `GenericRequestsView`, `genericRequestService`, design docs, CI workflow) is
    ready for commit.