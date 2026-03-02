-- Fix Cost Centers script
UPDATE finance_cost_centers SET department_id = 'Executive' WHERE cost_center_code = 'CC-100';
UPDATE finance_cost_centers SET department_id = 'IT' WHERE cost_center_code = 'CC-300';
