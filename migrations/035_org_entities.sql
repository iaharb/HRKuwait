-- 035: Organizational entities - division -> department -> supervision -> unit.
--
-- Multi-tenant-ready ("carried" org_id; the engine resolves the zero-org today).
-- Entities, heads and memberships are RUNTIME data maintained by HR/Admin in the
-- Workflow Config UI (see docs/workflow_engine_design_v2.md §3.4, §6.6), not static.
--
-- Provides:
--   hr_org_units            the org entity tree (division at root)
--   la_users.{org_id,entity_id}   tenant + leaf membership (unit/supervision) on the roster
--   employees.{org_id,entity_id}  same membership on the HR registry
--   hr_org_units_guard()    trigger: kind/parent rules, max depth, no cycles
--   wf_org_context()        one source of truth for head derivation (feeds actor rules)
--   wf_reassign_pending()   explicit HR reassignment of open steps (never automatic)

-- 1. Entity tree.
CREATE TABLE IF NOT EXISTS hr_org_units (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    code         TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('division','department','supervision','unit')),
    parent_id    UUID REFERENCES hr_org_units(id),
    head_user_id UUID REFERENCES la_users(id),
    name         TEXT NOT NULL,
    name_arabic  TEXT,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_hr_org_units_org    ON hr_org_units(org_id);
CREATE INDEX IF NOT EXISTS idx_hr_org_units_parent ON hr_org_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_hr_org_units_kind   ON hr_org_units(kind);

-- 2. Tenant + membership columns on the leave roster and the HR registry.
ALTER TABLE la_users  ADD COLUMN IF NOT EXISTS org_id    UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE la_users  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES hr_org_units(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS org_id    UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES hr_org_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_la_users_org     ON la_users(org_id);
CREATE INDEX IF NOT EXISTS idx_la_users_entity  ON la_users(entity_id);
CREATE INDEX IF NOT EXISTS idx_employees_org    ON employees(org_id);
CREATE INDEX IF NOT EXISTS idx_employees_entity ON employees(entity_id);

-- 3. Depth of an entity (division = 0).
CREATE OR REPLACE FUNCTION hr_org_units_depth(p_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    WITH RECURSIVE up AS (
        SELECT o.id, o.parent_id, 0 AS d
        FROM hr_org_units o WHERE o.id = p_id
        UNION ALL
        SELECT o.id, o.parent_id, up.d + 1
        FROM hr_org_units o JOIN up ON o.id = up.parent_id
    )
    SELECT COALESCE(MAX(d), -1) FROM up;
$$;

-- 4. Structural guard: parent kinds, max depth, no cycles.
CREATE OR REPLACE FUNCTION hr_org_units_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_parent_kind TEXT;
    v_walk         UUID;
    v_depth        INTEGER;
BEGIN
    IF NEW.parent_id IS NOT NULL AND NEW.parent_id = NEW.id THEN
        RAISE EXCEPTION 'An entity cannot be its own parent (%).', NEW.code;
    END IF;

    -- Parent-kind rules.
    IF NEW.kind = 'division' THEN
        IF NEW.parent_id IS NOT NULL THEN
            RAISE EXCEPTION 'A division is a root entity and cannot have a parent (%).', NEW.code;
        END IF;
    ELSIF NEW.parent_id IS NULL THEN
        RAISE EXCEPTION '% "%" requires a parent entity.', NEW.kind, NEW.code;
    END IF;

    IF NEW.parent_id IS NOT NULL THEN
        SELECT kind INTO v_parent_kind FROM hr_org_units WHERE id = NEW.parent_id;
        IF v_parent_kind IS NULL THEN
            RAISE EXCEPTION 'Parent entity not found for "%.', NEW.code;
        END IF;
        IF NEW.kind = 'department' AND v_parent_kind <> 'division' THEN
            RAISE EXCEPTION 'A department must sit under a division (%).', NEW.code;
        END IF;
        IF NEW.kind IN ('supervision','unit') AND v_parent_kind NOT IN ('department','supervision') THEN
            RAISE EXCEPTION 'A % must sit under a department or supervision (%).', NEW.kind, NEW.code;
        END IF;

        -- Cycle: NEW must not appear in the parent chain.
        v_walk := NEW.parent_id;
        WHILE v_walk IS NOT NULL LOOP
            IF v_walk = NEW.id THEN
                RAISE EXCEPTION 'Cycle detected: % would become its own ancestor.', NEW.code;
            END IF;
            SELECT parent_id INTO v_walk FROM hr_org_units WHERE id = v_walk;
        END LOOP;

        -- Max depth: division=0, department=1, supervision=2, unit=3.
        v_depth := hr_org_units_depth(NEW.parent_id);
        IF v_depth >= 3 THEN
            RAISE EXCEPTION 'Max hierarchy depth reached (division -> department -> supervision -> unit).';
        END IF;
    END IF;

    -- Kind change: immediate children must still obey their parent-kind rules.
    IF TG_OP = 'UPDATE' THEN
        IF (NEW.kind IS DISTINCT FROM OLD.kind) AND EXISTS (
            SELECT 1 FROM hr_org_units c
            WHERE c.parent_id = OLD.id
              AND c.kind IN ('department','supervision','unit')
              AND CASE c.kind
                    WHEN 'department' THEN NEW.kind <> 'division'
                    ELSE NEW.kind NOT IN ('department','supervision')
                  END
        ) THEN
            RAISE EXCEPTION 'Cannot change "%" to %: incompatible with existing children.', NEW.code, NEW.kind;
        END IF;
    END IF;

    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_hr_org_units_guard ON hr_org_units;
CREATE TRIGGER trg_hr_org_units_guard
    BEFORE INSERT OR UPDATE OF kind, parent_id ON hr_org_units
    FOR EACH ROW EXECUTE FUNCTION hr_org_units_guard();

-- 5. Org context: heads at every level of the requester's entity path + DLM.
CREATE OR REPLACE FUNCTION wf_org_context(p_user_id UUID)
RETURNS TABLE(
    user_id             UUID,
    entity_id           UUID,
    entity_kind         TEXT,
    entity_code         TEXT,
    entity_name         TEXT,
    unit_head_id        UUID,
    supervision_head_id UUID,
    department_head_id  UUID,
    division_head_id    UUID,
    department          TEXT,
    manager_id          UUID
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    WITH RECURSIVE tree AS (
        SELECT o.*, 0 AS depth
        FROM hr_org_units o
        JOIN la_users u ON u.id = p_user_id AND u.entity_id = o.id
        UNION ALL
        SELECT o.*, t.depth + 1
        FROM hr_org_units o JOIN tree t ON o.id = t.parent_id
    )
    SELECT p_user_id,
           (SELECT u.entity_id FROM la_users u WHERE u.id = p_user_id),
           (SELECT t.kind FROM tree t WHERE t.depth = 0),
           (SELECT t.code FROM tree t WHERE t.depth = 0),
           (SELECT t.name FROM tree t WHERE t.depth = 0),
           (SELECT t.head_user_id FROM tree t WHERE t.kind = 'unit'        ORDER BY t.depth LIMIT 1),
           (SELECT t.head_user_id FROM tree t WHERE t.kind = 'supervision' ORDER BY t.depth LIMIT 1),
           (SELECT t.head_user_id FROM tree t WHERE t.kind = 'department'  ORDER BY t.depth LIMIT 1),
           (SELECT t.head_user_id FROM tree t WHERE t.kind = 'division'    ORDER BY t.depth LIMIT 1),
           (SELECT u.department FROM la_users u WHERE u.id = p_user_id),
           (SELECT u.manager_id FROM la_users u WHERE u.id = p_user_id)
    FROM (SELECT 1) AS x
    WHERE EXISTS (SELECT 1 FROM la_users u WHERE u.id = p_user_id);
$$;

-- 6. Explicit HR reassignment of open steps (see §6.6). Never automatic.
--    With p_new_user_id: point affected open steps at that user (auditable override).
--    Without: re-resolve affected steps by their rule (new manager/heads apply);
--             empty results are auto-skipped with the standard note.
CREATE OR REPLACE FUNCTION wf_reassign_pending(p_old_user_id UUID, p_new_user_id UUID DEFAULT NULL)
RETURNS TABLE(
    request_id  UUID,
    step_order  INTEGER,
    code        TEXT,
    from_user   UUID,
    to_user     UUID,
    status      TEXT,
    note        TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    r      RECORD;
    v_new  UUID;
    v_note TEXT;
    v_status TEXT;
BEGIN
    FOR r IN
        SELECT s.id AS step_id, s.request_id, s.step_order, s.code, s.rule,
               s.actor_role_code, fs.rule_config
        FROM la_request_steps s
        JOIN wf_flow_steps fs
          ON fs.flow_id = s.flow_id AND fs.step_order = s.step_order
        WHERE s.status IN ('PENDING','WAITING')
          AND s.resolved_actor_id = p_old_user_id
          AND EXISTS (
              SELECT 1 FROM la_leave_requests lr
              WHERE lr.id = s.request_id AND lr.status NOT IN ('APPROVED','REJECTED','CANCELLED')
          )
        ORDER BY s.request_id, s.step_order
    LOOP
        BEGIN
            IF p_new_user_id IS NOT NULL THEN
                IF NOT EXISTS (SELECT 1 FROM la_users u WHERE u.id = p_new_user_id AND u.status = 'active') THEN
                    RAISE EXCEPTION 'Target user is not active';
                END IF;
                v_new := p_new_user_id;
                UPDATE la_request_steps
                   SET resolved_actor_id = v_new
                 WHERE id = r.step_id;
                v_status := 'PENDING';
                v_note := 'Reassigned by HR (from ' || p_old_user_id || ')';
            ELSE
                SELECT u.id INTO v_new
                FROM wf_resolve_actors(r.request_id, r.rule, r.actor_role_code, r.rule_config) u
                ORDER BY u.id
                LIMIT 1;
                IF v_new IS NULL THEN
                    UPDATE la_request_steps
                       SET status = 'SKIPPED',
                           note   = 'Skipped: no eligible approver after reassignment'
                     WHERE id = r.step_id;
                    v_status := 'SKIPPED';
                    v_note := 'Skipped: no eligible approver after reassignment';
                ELSE
                    UPDATE la_request_steps
                       SET resolved_actor_id = v_new,
                           status            = 'PENDING'
                     WHERE id = r.step_id;
                    v_status := 'PENDING';
                    v_note := 'Re-resolved to new actor after org change';
                END IF;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_status := 'FAILED';
            v_note := SQLERRM;
        END;

        RETURN QUERY SELECT r.request_id, r.step_order, r.code,
                            p_old_user_id, v_new, v_status, v_note;
    END LOOP;
END; $$;

-- 7. Access.
REVOKE EXECUTE ON FUNCTION wf_org_context(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_reassign_pending(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wf_org_context(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wf_reassign_pending(UUID, UUID) TO authenticated, service_role;

ALTER TABLE hr_org_units ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hr_org_units_select ON hr_org_units;
CREATE POLICY hr_org_units_select ON hr_org_units FOR SELECT USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON hr_org_units TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';