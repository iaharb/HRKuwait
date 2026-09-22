-- 042: Extend wf_reassign_pending to cover generic wf_request_steps (docs/workflow_engine_design_v2.md §6.6, §14.2-5).
--
-- The original 035 function only reassigned steps in la_request_steps (legacy leave app).
-- This updates it to also cover wf_request_steps (generic request engine), so HR can
-- reassign open steps for any request type (leave, loan, hajj, custom).
--
-- Behavior per request type:
--   - Legacy leave (la_request_steps): checks la_leave_requests status NOT IN (APPROVED/REJECTED/CANCELLED)
--   - Generic (wf_request_steps): checks wf_requests status NOT IN (APPROVED/REJECTED/CANCELLED)
-- Both paths support:
--   p_new_user_id provided  → explicit override to that user (must be active)
--   p_new_user_id NULL      → re-resolve by step rule; if no actor found → SKIPPED with note

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
    -- 1) Legacy leave engine (la_request_steps)
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

    -- 2) Generic request engine (wf_request_steps)
    FOR r IN
        SELECT s.id AS step_id, s.request_id, s.step_order, s.code, s.rule,
               s.actor_role_code, fs.rule_config
        FROM wf_request_steps s
        JOIN wf_flow_steps fs
          ON fs.flow_id = s.flow_id AND fs.step_order = s.step_order
        WHERE s.status IN ('PENDING','WAITING')
          AND s.resolved_actor_id = p_old_user_id
          AND EXISTS (
              SELECT 1 FROM wf_requests wr
              WHERE wr.id = s.request_id AND wr.status NOT IN ('APPROVED','REJECTED','CANCELLED')
          )
        ORDER BY s.request_id, s.step_order
    LOOP
        BEGIN
            IF p_new_user_id IS NOT NULL THEN
                IF NOT EXISTS (SELECT 1 FROM la_users u WHERE u.id = p_new_user_id AND u.status = 'active') THEN
                    RAISE EXCEPTION 'Target user is not active';
                END IF;
                v_new := p_new_user_id;
                UPDATE wf_request_steps
                   SET resolved_actor_id = v_new
                 WHERE id = r.step_id;
                v_status := 'PENDING';
                v_note := 'Reassigned by HR (from ' || p_old_user_id || ')';
            ELSE
                SELECT u.id INTO v_new
                FROM wf_resolve_actors2(r.request_id, NULL, r.rule, r.actor_role_code, r.rule_config) u
                ORDER BY u.id
                LIMIT 1;
                IF v_new IS NULL THEN
                    UPDATE wf_request_steps
                       SET status = 'SKIPPED',
                           note   = 'Skipped: no eligible approver after reassignment'
                     WHERE id = r.step_id;
                    v_status := 'SKIPPED';
                    v_note := 'Skipped: no eligible approver after reassignment';
                ELSE
                    UPDATE wf_request_steps
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

GRANT EXECUTE ON FUNCTION wf_reassign_pending(UUID, UUID) TO authenticated, service_role;