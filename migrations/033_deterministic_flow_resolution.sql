-- 033: deterministic flow resolution.
--
-- Multiple active flows can apply to the same leave type (e.g. QA/test flows,
-- or a misconfigured second active flow). Make the pick fully deterministic so
-- requests never bounce between equivalent flows: highest version, earliest
-- effective_from, then lexicographically first id.
--
CREATE OR REPLACE FUNCTION wf_resolve_flow(p_leave_type TEXT)
RETURNS wf_flows
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE f wf_flows%ROWTYPE;
BEGIN
    SELECT * INTO f
    FROM wf_flows
    WHERE org_id = wf_default_org() AND status = 'active'
      AND (applies_to = '{}'::jsonb OR applies_to->'leave_types' ? p_leave_type)
    ORDER BY (applies_to->'leave_types' ? p_leave_type) DESC,
             version DESC, effective_from ASC, id
    LIMIT 1;
    RETURN f;
END; $$;

-- (Note: in PostgreSQL, ASC sorts NULLs last, so unset effective_from ties and
--  falls through to the id for a stable pick.)