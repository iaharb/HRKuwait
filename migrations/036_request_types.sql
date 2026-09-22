-- 036: Request types & eligibility (generic payload engine, part 1).
--
-- Part of docs/workflow_engine_design_v2.md §4/§6.2/§8. Adds:
--   wf_request_types      org-scoped catalog; each type carries a payload
--                         attribute schema, eligibility rules, and a
--                         finalization strategy (all runtime data edited by
--                         HR/Admin through Workflow Config → Request Types).
--   wf_validate_payload   attribute grammar validation (§4.3).
--   wf_check_eligibility  per-type eligibility evaluated at submit (§6.2).
--
-- Eligibility is enforced only by the generic engine (wf_start_request, 037);
-- the legacy la_start_request path is untouched, so live leave flows and tests
-- keep their exact behavior.
-- ============================================================================

-- 1. Request type catalog.
CREATE TABLE IF NOT EXISTS wf_request_types (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    code            TEXT NOT NULL,
    name            TEXT NOT NULL,
    payload_schema  JSONB NOT NULL DEFAULT '{}'::jsonb,
    eligibility     JSONB NOT NULL DEFAULT '{}'::jsonb,
    finalization    JSONB NOT NULL DEFAULT '{"action":"none"}'::jsonb,
    active          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (org_id, code)
);

CREATE INDEX IF NOT EXISTS idx_wf_request_types_org ON wf_request_types(org_id);
CREATE INDEX IF NOT EXISTS idx_wf_request_types_code ON wf_request_types(org_id, code);

-- 2. Seed today's request types (single-tenant zero-org). Idempotent.
--    Leave-family types keep using the existing balance buckets (Annual/Sick/
--    ShortPermission/Emergency); Hajj is tenure+once-only; Loan is the newest.
INSERT INTO wf_request_types (org_id, code, name, payload_schema, eligibility, finalization) VALUES
(
 '00000000-0000-0000-0000-000000000000', 'Annual', 'Annual Leave',
 '{"attributes":[
     {"key":"start_date","type":"date","required":true},
     {"key":"end_date","type":"date","required":true},
     {"key":"days","type":"number","min":1,"max":365},
     {"key":"reason","type":"text"},
     {"key":"contact_during","type":"text"}
   ],
   "derived":{"days":"working_days(start_date,end_date)"}}',
 '{"balance_required":true,"balance_keys":["Annual"],"count_statuses":["APPROVED"]}',
 '{"action":"balance"}'
),
(
 '00000000-0000-0000-0000-000000000000', 'Sick', 'Sick Leave',
 '{"attributes":[
     {"key":"start_date","type":"date","required":true},
     {"key":"end_date","type":"date","required":true},
     {"key":"days","type":"number","min":1,"max":365},
     {"key":"reason","type":"text"},
     {"key":"medical_report","type":"boolean"}
   ],
   "derived":{"days":"working_days(start_date,end_date)"}}',
 '{"balance_required":true,"balance_keys":["Sick"],"count_statuses":["APPROVED"]}',
 '{"action":"balance"}'
),
(
 '00000000-0000-0000-0000-000000000000', 'ShortPermission', 'Short Permission',
 '{"attributes":[
     {"key":"start_date","type":"date","required":true},
     {"key":"end_date","type":"date","required":true},
     {"key":"period","type":"enum","values":["start","end"],"required":true},
     {"key":"hours","type":"number","min":1,"max":8},
     {"key":"reason","type":"text"}
   ]}',
 '{"balance_required":true,"balance_keys":["ShortPermission"],"count_statuses":["APPROVED"]}',
 '{"action":"balance"}'
),
(
 '00000000-0000-0000-0000-000000000000', 'Emergency', 'Emergency Leave',
 '{"attributes":[
     {"key":"start_date","type":"date","required":true},
     {"key":"end_date","type":"date","required":true},
     {"key":"days","type":"number","min":1,"max":365},
     {"key":"reason","type":"text","required":true}
   ],
   "derived":{"days":"working_days(start_date,end_date)"}}',
 '{"balance_required":true,"balance_keys":["Emergency"],"count_statuses":["APPROVED"]}',
 '{"action":"balance"}'
),
(
 '00000000-0000-0000-0000-000000000000', 'Hajj', 'Hajj',
 '{"attributes":[
     {"key":"start_date","type":"date","required":true},
     {"key":"end_date","type":"date","required":true},
     {"key":"reason","type":"text"}
   ]}',
 '{"min_tenure_months":24,"max_uses":1,"count_statuses":["APPROVED"]}',
 '{"action":"none"}'
),
(
 '00000000-0000-0000-0000-000000000000', 'Loan', 'Employee Loan',
 '{"attributes":[
     {"key":"amount","type":"number","min":100,"max":1000000,"required":true},
     {"key":"duration_months","type":"number","min":1,"max":60,"required":true},
     {"key":"purpose","type":"text"}
   ]}',
 '{}',
 '{"action":"loan"}'
)
ON CONFLICT (org_id, code) DO NOTHING;

-- 3. Payload validation against the type's attribute schema (§4.3).
CREATE OR REPLACE FUNCTION wf_validate_payload(p_schema JSONB, p_payload JSONB)
RETURNS TABLE(ok BOOLEAN, errors JSONB)
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    attrs   JSONB := COALESCE(p_schema->'attributes', '[]'::jsonb);
    errs    TEXT[] := '{}';
    a       RECORD;
    v_type  TEXT;
    v_val   JSONB;
    v_tok   TEXT;
    v_val0  TEXT;
    v_num   NUMERIC;
    v_dates TEXT;
    v_found BOOLEAN;
BEGIN
    IF p_payload IS NULL THEN
        errs := errs || 'payload is missing';
        RETURN QUERY SELECT TRUE, to_jsonb(errs); RETURN;
    END IF;

    -- Unknown top-level keys are rejected (derived keys are computed later and
    -- allowed only if they appear in the schema).
    FOR v_tok IN SELECT jsonb_object_keys(p_payload) LOOP
        v_found := FALSE;
        FOR a IN SELECT * FROM jsonb_array_elements(attrs) LOOP
            IF (a.value->>'key') = v_tok THEN v_found := TRUE; EXIT; END IF;
        END LOOP;
        IF NOT v_found THEN
            errs := errs || format('unknown attribute "%s"', v_tok);
        END IF;
    END LOOP;

    -- Per-attribute: required, type, range, enum.
    FOR a IN SELECT * FROM jsonb_array_elements(attrs) LOOP
        v_tok := a.value->>'key';
        v_type := a.value->>'type';
        v_val := p_payload->v_tok;

        IF (a.value->>'required')::boolean AND (v_val IS NULL OR v_val = 'null'::jsonb OR v_val = '""'::jsonb) THEN
            errs := errs || format('missing required attribute "%s"', v_tok);
            CONTINUE;
        END IF;
        IF v_val IS NULL OR v_val = 'null'::jsonb THEN CONTINUE; END IF;

        IF v_type = 'number' THEN
            IF jsonb_typeof(v_val) <> 'number' THEN
                errs := errs || format('"%s" must be a number', v_tok); CONTINUE;
            END IF;
            v_num := (v_val #>> '{}')::numeric;
            IF a.value->>'min' IS NOT NULL AND v_num < (a.value->>'min')::numeric THEN
                errs := errs || format('"%s" must be >= %s', v_tok, a.value->>'min');
            END IF;
            IF a.value->>'max' IS NOT NULL AND v_num > (a.value->>'max')::numeric THEN
                errs := errs || format('"%s" must be <= %s', v_tok, a.value->>'max');
            END IF;
        ELSIF v_type = 'date' THEN
            IF jsonb_typeof(v_val) <> 'string' THEN
                errs := errs || format('"%s" must be a date (YYYY-MM-DD)', v_tok); CONTINUE;
            END IF;
            v_val0 := v_val #>> '{}';
            IF v_val0 !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
                errs := errs || format('"%s" must be a date (YYYY-MM-DD)', v_tok); CONTINUE;
            END IF;
            BEGIN
                v_dates := to_char((v_val0)::date, 'YYYY-MM-DD');
            EXCEPTION WHEN OTHERS THEN
                errs := errs || format('"%s" is not a valid date', v_tok);
            END;
        ELSIF v_type = 'text' THEN
            IF jsonb_typeof(v_val) <> 'string' THEN
                errs := errs || format('"%s" must be text', v_tok);
            END IF;
        ELSIF v_type = 'boolean' THEN
            IF jsonb_typeof(v_val) <> 'boolean' THEN
                errs := errs || format('"%s" must be boolean', v_tok);
            END IF;
        ELSIF v_type = 'enum' THEN
            IF jsonb_typeof(v_val) <> 'string' OR NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements_text(COALESCE(a.value->'values','[]'::jsonb)) ev
                WHERE ev = (v_val #>> '{}')
            ) THEN
                errs := errs || format('"%s" must be one of %s', v_tok,
                    COALESCE((a.value->>'values'), '[]'));
            END IF;
        END IF;
    END LOOP;

    RETURN QUERY SELECT (COALESCE(array_length(errs,1),0) = 0), to_jsonb(errs);
END; $$;

-- 4. Eligibility evaluation at submit (§6.2).
--    Rules (AND across present keys): min_tenure_months, max_uses (+count_statuses),
--    balance_required (+balance_keys), exclusion_months.
CREATE OR REPLACE FUNCTION wf_check_eligibility(p_type TEXT, p_requester_id UUID, p_payload JSONB)
RETURNS TABLE(eligible BOOLEAN, code TEXT, reason TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    rt          wf_request_types%ROWTYPE;
    el          JSONB;
    u           la_users%ROWTYPE;
    v_days      NUMERIC;
    v_months    NUMERIC;
    v_count     BIGINT;
    v_bal       NUMERIC;
    v_statuses  TEXT[];
    v_req_year  INTEGER;
    v_last      TIMESTAMPTZ;
    v_key       TEXT;
BEGIN
    SELECT * INTO rt FROM wf_request_types t
        WHERE t.org_id = wf_default_org() AND t.code = p_type AND t.active;
    IF rt.id IS NULL THEN
        RETURN QUERY SELECT TRUE, 'OK', '';
        RETURN;
    END IF;
    el := rt.eligibility;

    SELECT * INTO u FROM la_users WHERE id = p_requester_id;
    IF u.id IS NULL THEN
        RETURN QUERY SELECT FALSE, 'NO_USER', 'Unknown requester.';
        RETURN;
    END IF;

    v_days := CASE WHEN p_payload ? 'days'
                   THEN (p_payload->>'days')::numeric
                   WHEN p_payload ? 'start_date' AND p_payload ? 'end_date'
                   THEN la_count_working_days((p_payload->>'start_date')::date,
                                              (p_payload->>'end_date')::date)
                   ELSE -1 END;

    -- Min tenure (months since joining).
    IF el ? 'min_tenure_months' THEN
        IF u.joined_on IS NULL THEN
            RETURN QUERY SELECT FALSE, 'NO_TENURE', 'Tenure cannot be verified (no join date on file).';
            RETURN;
        END IF;
        v_months := EXTRACT(YEAR FROM age(CURRENT_DATE, u.joined_on))::numeric * 12
                  + EXTRACT(MONTH FROM age(CURRENT_DATE, u.joined_on))::numeric;
        IF v_months < (el->>'min_tenure_months')::numeric THEN
            RETURN QUERY SELECT FALSE, 'MIN_TENURE',
                format('Requires at least %s months of tenure.', el->>'min_tenure_months');
            RETURN;
        END IF;
    END IF;

    -- Max uses (once-only etc.) counting the configured statuses.
    IF el ? 'max_uses' THEN
        SELECT COALESCE(array_agg(x), ARRAY['APPROVED']::text[])
          INTO v_statuses
          FROM jsonb_array_elements_text(COALESCE(el->'count_statuses','["APPROVED"]'::jsonb)) x;

        SELECT count(*) INTO v_count FROM la_leave_requests
         WHERE requester_id = p_requester_id AND leave_type = p_type
           AND status = ANY(v_statuses);

        IF to_regclass('public.wf_requests') IS NOT NULL THEN
            v_count := v_count + (SELECT count(*) FROM wf_requests
                WHERE requester_id = p_requester_id AND request_type = p_type
                  AND status = ANY(v_statuses));
        END IF;

        IF v_count >= (el->>'max_uses')::bigint THEN
            RETURN QUERY SELECT FALSE, 'MAX_USES',
                format('This request type is limited to %s use(s).', el->>'max_uses');
            RETURN;
        END IF;
    END IF;

    -- Balance gate: enough remaining balance on any configured bucket.
    IF (el->>'balance_required')::boolean THEN
        v_req_year := EXTRACT(YEAR FROM CURRENT_DATE)::int;
        IF p_payload ? 'start_date' THEN
            v_req_year := EXTRACT(YEAR FROM (p_payload->>'start_date')::date)::int;
        END IF;

        FOR v_key IN SELECT x FROM jsonb_array_elements_text(COALESCE(el->'balance_keys','[]'::jsonb)) x LOOP
            SELECT COALESCE(MIN(b.entitled_days - b.used_days), 0)
              INTO v_bal
              FROM la_leave_balances b
             WHERE b.user_id = p_requester_id AND b.leave_type = v_key AND b.year = v_req_year;

            IF v_days > v_bal THEN
                RETURN QUERY SELECT FALSE, 'INSUFFICIENT_BALANCE',
                    format('Requested %s; only %s left on the %s balance for %s.',
                           v_days, v_bal, v_key, v_req_year);
                RETURN;
            END IF;
            EXIT; -- first configured bucket decides (single-bucket types)
        END LOOP;
    END IF;

    -- Cool-down window after the last approved request.
    IF el ? 'exclusion_months' THEN
        SELECT created_at INTO v_last FROM la_leave_requests
         WHERE requester_id = p_requester_id AND leave_type = p_type AND status = 'APPROVED'
         ORDER BY created_at DESC LIMIT 1;
        IF v_last IS NOT NULL
           AND (CURRENT_DATE - v_last::date) < ((el->>'exclusion_months')::int) * 30 THEN
            RETURN QUERY SELECT FALSE, 'COOL_DOWN',
                format('Please wait %s month(s) after your last %s request.', el->>'exclusion_months', p_type);
            RETURN;
        END IF;
    END IF;

    RETURN QUERY SELECT TRUE, 'OK', '';
END; $$;

-- 5. Access.
REVOKE EXECUTE ON FUNCTION wf_validate_payload(JSONB, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION wf_check_eligibility(TEXT, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wf_validate_payload(JSONB, JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION wf_check_eligibility(TEXT, UUID, JSONB) TO authenticated, service_role;

ALTER TABLE wf_request_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_request_types_read ON wf_request_types;
CREATE POLICY wf_request_types_read ON wf_request_types FOR SELECT TO authenticated USING (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON wf_request_types TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';