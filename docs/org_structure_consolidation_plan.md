# Organization Structure Consolidation Plan

## Problem
Organization structure data is fragmented across multiple admin surfaces:
- **Workforce Registry** — employee records, department, job title
- **Admin Center / Users** — user accounts, roles
- **Admin Center / Registry** — employee master data
- **Strategy / Security & Roles** — workflow role assignments
- **Strategy / Workflow Config** — org tree (divisions/departments/supervisions/units), heads, membership

## Target: Single "Organization Structure" Module in Admin Center

### 1. Data Model (Unified)

| Entity | Table | Key Fields | Notes |
|--------|-------|------------|-------|
| **Division** | `hr_org_units` (kind='division') | code, name, head_user_id, parent_id=NULL | Top level (e.g., Operations, Finance & Admin) |
| **Department** | `hr_org_units` (kind='department') | code, name, head_user_id, parent_id→Division | Under division (e.g., IT, Marketing, HR, Finance) |
| **Supervision** | `hr_org_units` (kind='supervision') | code, name, head_user_id, parent_id→Department | Optional intermediate layer |
| **Unit** | `hr_org_units` (kind='unit') | code, name, head_user_id, parent_id→Department/Supervision | Leaf level where employees sit |
| **Job Title** | `hr_job_titles` (NEW) | code, name, name_arabic, department_id, grade, description | Catalog of positions (Technical Consultant, Accountant, etc.) |
| **Employee** | `la_users` + `employees` (synced) | id, email, full_name, job_title_id, entity_id (unit/supervision), manager_id (DLM), department (denorm), division (denorm) | Single source of truth |

### 2. Consolidation Map

| Current Location | Data | Target Location |
|------------------|------|-----------------|
| Workforce Registry → Employee cards | department, job title (free text) | Organization Structure → Employee Assignment |
| Admin Center / Users | role, department dropdown | Organization Structure → Role Assignment (wf_user_roles) |
| Admin Center / Registry | department, designation | Organization Structure → Employee Assignment |
| Strategy / Security & Roles | wf_user_roles assignments | Organization Structure → Role Assignment |
| Strategy / Workflow Config / Org Tree | hr_org_units tree, heads, membership | Organization Structure → Org Tree (single editor) |
| Strategy / Workflow Config / Role Assignments | wf_user_roles | Organization Structure → Role Assignment |

### 3. New Admin Center Module: "Organization Structure"

#### Tabs:
1. **Org Tree** — Visual tree editor (divisions → departments → supervisions → units)
   - Drag-drop reorder, inline add/edit/delete
   - Set head per entity (picks from active users)
   - Validates: acyclic, max depth 4, kind hierarchy rules

2. **Departments & Units** — Tabular management
   - Department list with head, division, unit count
   - Unit list with head, department, supervision, employee count
   - Inline edit code/name/head

3. **Job Titles** — Catalog of positions
   - Code, Name (EN/AR), Department, Grade, Description
   - Used in employee assignment dropdown

4. **Employee Assignment** — Unified employee placement
   - Grid: Employee | Job Title | Unit/Supervision | Department (auto) | Division (auto) | DLM (manager_id)
   - Inline edit job_title_id, entity_id, manager_id
   - Auto-derives department/division from entity_id path
   - Syncs to `employees` table and `la_users` simultaneously

5. **Role Assignments** — Workflow roles (wf_user_roles)
   - User | Role Code | Department Scope (optional)
   - Replaces Strategy/Security & Roles + Workflow Config/Role Assignments

6. **Heads & Managers** — Derived view (read-only)
   - Division Head, Department Head, Supervision Head, Unit Head
   - DLM coverage report (employees missing manager_id)
   - Entity heads coverage (entities missing head_user_id)

### 4. Migration Steps

#### Phase 1: Data Model (DB)
1. Create `hr_job_titles` table
2. Add `job_title_id` to `la_users` and `employees` (FK → hr_job_titles)
3. Add triggers to sync `la_users` ↔ `employees` on org fields
4. Add computed columns `department`, `division` on `la_users`/`employees` (derived from entity_id path)

#### Phase 2: Backend Services
1. `orgStructureService` — CRUD for org tree, job titles, employee assignment
2. `orgSyncService` — Sync `la_users` ↔ `employees` on org changes
3. Extend `workflowConfigService` to delegate org ops to `orgStructureService`

#### Phase 3: Admin Center UI
1. Add "Organization Structure" top-level nav item
2. Build 6 tabs per §3
3. Remove org tree/role assignments from Workflow Config
4. Remove org fields from Admin Center/Registry employee editor
5. Update Workforce Registry to read from unified model

#### Phase 4: Cleanup
1. Drop redundant columns (free-text department/designation in employee tables)
2. Deprecate Strategy/Security & Roles and Strategy/Workflow Config org tabs
3. Add audit log for org structure changes

### 5. Validation Rules

| Rule | Enforcement |
|------|-------------|
| Division has no parent | DB constraint + UI |
| Department parent = Division | DB constraint + UI |
| Supervision/Unit parent = Department or Supervision | DB constraint + UI |
| Max depth = 4 | DB trigger + UI |
| Entity head must be active user | DB FK + UI |
| Employee entity_id must be leaf (unit/supervision) | DB trigger + UI |
| Employee manager_id ≠ self | DB constraint |
| DLM coverage: every employee has manager (except CEO) | Report + UI warning |
| Job title belongs to employee's department | UI validation |

### 6. API Endpoints (REST via Supabase RPC)

| RPC | Purpose |
|-----|---------|
| `org_tree_get()` | Full tree for UI |
| `org_tree_upsert(entity)` | Create/update entity |
| `org_tree_delete(id)` | Delete (cascades if no children) |
| `job_titles_upsert/deletes` | Catalog management |
| `employee_assignment_upsert(employee_id, job_title_id, entity_id, manager_id)` | Single call updates both tables |
| `dlm_coverage_report()` | Missing DLM list |
| `heads_coverage_report()` | Missing heads list |

### 7. Timeline Estimate

| Phase | Effort | Dependencies |
|-------|--------|--------------|
| DB Migration | 2 days | — |
| Backend Services | 2 days | DB |
| Admin UI (6 tabs) | 5 days | Backend |
| Migration/cleanup | 2 days | UI done |
| **Total** | **~11 days** | — |

### 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Data loss during sync | Run migration in transaction, verify counts before/after |
| Breaking existing role assignments | Keep `wf_user_roles` intact; new UI writes to same table |
| Circular DLM references | DB constraint `manager_id <> id` |
| Orphaned employees after entity delete | Prevent delete if employees assigned; show count in UI |

---

## Next Steps
1. Review and approve plan
2. Create migration `045_org_structure_consolidation.sql` (Phase 1)
3. Implement `orgStructureService` (Phase 2)
4. Build Admin Center module (Phase 3)