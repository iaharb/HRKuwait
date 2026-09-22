-- 039: Tenant org-tree seed (docs/workflow_engine_design_v2.md §8/§9).
--
-- Bootstrap only: seeds the live tenant's division -> department ->
-- supervision/unit tree + heads + employee leaf membership. This is a ONE-TIME
-- seed; from here on the Org Tree tab in Workflow Config owns the data
-- (HR/Admin maintain it as runtime rows, §3.4). Every statement is idempotent
-- and never overwrites later admin edits.
-- ============================================================================

-- 1. Divisions (root; no parent).
INSERT INTO hr_org_units (org_id, code, kind, parent_id, head_user_id, name)
SELECT '00000000-0000-0000-0000-000000000000', s.code, 'division', NULL,
       (SELECT id FROM la_users WHERE email = s.head_email AND status = 'active' LIMIT 1), s.name
FROM (VALUES
    ('OPER', 'faisal@test.com', 'Operations'),
    ('FAD',  'layla@test.com',  'Finance & Administration')
) AS s(code, head_email, name)
ON CONFLICT (org_id, code) DO NOTHING;

-- 2. Departments (parent = division).
INSERT INTO hr_org_units (org_id, code, kind, parent_id, head_user_id, name)
SELECT '00000000-0000-0000-0000-000000000000', s.code, 'department', p.id,
       (SELECT id FROM la_users WHERE email = s.head_email AND status = 'active' LIMIT 1), s.name
FROM (VALUES
    ('IT',        'OPER', 'ahmed@test.com', 'IT Services'),
    ('OPER-DEPT', 'OPER', 'sarah@test.com', 'Operations Department'),
    ('HR',        'FAD',  'layla@test.com',  'Human Resources'),
    ('FIN',       'FAD',  NULL,              'Finance')
) AS s(code, parent_code, head_email, name)
JOIN hr_org_units p ON p.org_id = '00000000-0000-0000-0000-000000000000'
                    AND p.kind = 'division' AND p.code = s.parent_code
ON CONFLICT (org_id, code) DO NOTHING;

-- 3. Supervision / unit (parent = department above).
INSERT INTO hr_org_units (org_id, code, kind, parent_id, head_user_id, name)
SELECT '00000000-0000-0000-0000-000000000000', s.code, s.kind, p.id,
       (SELECT id FROM la_users WHERE email = s.head_email AND status = 'active' LIMIT 1), s.name
FROM (VALUES
    ('IT-SUPPORT', 'supervision', 'IT',       'ahmed@test.com', 'IT Support'),
    ('OPS',        'unit',        'OPER-DEPT', 'sarah@test.com', 'Operations Unit')
) AS s(code, kind, parent_code, head_email, name)
JOIN hr_org_units p ON p.org_id = '00000000-0000-0000-0000-000000000000'
                    AND p.code = s.parent_code
ON CONFLICT (org_id, code) DO NOTHING;

-- 4. Employee leaf membership (staff only; executives keep entity_id NULL).
UPDATE la_users SET entity_id = (
    SELECT o.id FROM hr_org_units o
    WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'IT-SUPPORT'
) WHERE email = 'mohamed@test.com' AND entity_id IS NULL
  AND EXISTS (SELECT 1 FROM hr_org_units o WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'IT-SUPPORT');

UPDATE la_users SET entity_id = (
    SELECT o.id FROM hr_org_units o
    WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'IT-SUPPORT'
) WHERE email = 'ihab@test.com' AND entity_id IS NULL
  AND EXISTS (SELECT 1 FROM hr_org_units o WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'IT-SUPPORT');

UPDATE la_users SET entity_id = (
    SELECT o.id FROM hr_org_units o
    WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'OPS'
) WHERE email = 'john@test.com' AND entity_id IS NULL
  AND EXISTS (SELECT 1 FROM hr_org_units o WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'OPS');

UPDATE la_users SET entity_id = (
    SELECT o.id FROM hr_org_units o
    WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'OPS'
) WHERE email = 'sarah@test.com' AND entity_id IS NULL
  AND EXISTS (SELECT 1 FROM hr_org_units o WHERE o.org_id = '00000000-0000-0000-0000-000000000000' AND o.code = 'OPS');

NOTIFY pgrst, 'reload schema';