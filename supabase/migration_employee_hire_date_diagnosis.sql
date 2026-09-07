-- 労働保険・雇用保険の期限を、会社設立日ではなく最初の従業員の雇用日から計算する。
UPDATE procedures
SET timing_type = 'hiring_event',
    timing_data = '{"days_from_event": 10}'::jsonb
WHERE code IN ('LABOR_INS_ESTABLISH', 'EMPLOY_INS_OFFICE');
