-- 採用時に必要となる3手続きを初回診断へ追加する。
INSERT INTO procedures (
  code, name, description, category, requires_employees,
  office_type, frequency, timing_label, timing_type, timing_data, priority,
  include_in_diagnosis, target_note, submission_method, caution_note
) VALUES
('LABOR_INS_ESTIMATED_PREMIUM',
 '労働保険概算保険料申告書',
 '保険年度末までに支払う賃金総額の見込額をもとに、労働保険料を申告・納付する手続きです。',
 'labor', TRUE, 'labor_standards', 'one_time',
 '保険関係成立日の翌日から50日以内', 'hiring_event', '{"days_from_event": 50}', 41,
 TRUE, '労働者を初めて雇用した事業主',
 '労働基準監督署、都道府県労働局または金融機関へ提出・納付',
 '一元適用事業を前提とした一般的な案内です。事業区分により提出先が異なる場合があります。'),
('EMPLOY_INS_QUALIFICATION',
 '雇用保険被保険者資格取得届',
 '雇用保険の加入要件を満たす従業員について、被保険者となったことを届け出る手続きです。',
 'labor', TRUE, 'hello_work', 'one_time',
 '被保険者となった月の翌月10日まで', 'event_next_month_day', '{"day": 10}', 42,
 TRUE, '雇用保険の加入要件を満たす従業員を雇用した事業主',
 '管轄の公共職業安定所へ電子申請、郵送または窓口提出',
 '従業員ごとに必要な手続きです。'),
('SOCIAL_INS_QUALIFICATION',
 '健康保険・厚生年金保険 被保険者資格取得届',
 '社会保険の加入要件を満たす従業員について、健康保険・厚生年金保険の資格取得を届け出る手続きです。',
 'insurance', TRUE, 'pension_office', 'one_time',
 '事実発生から5日以内', 'hiring_event', '{"days_from_event": 5}', 43,
 TRUE, '社会保険の加入要件を満たす従業員を雇用した事業主',
 '事務センターまたは管轄の年金事務所へ電子申請、郵送または窓口提出',
 '短時間労働者には企業規模等による別の加入要件があります。')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  requires_employees = EXCLUDED.requires_employees,
  office_type = EXCLUDED.office_type,
  frequency = EXCLUDED.frequency,
  timing_label = EXCLUDED.timing_label,
  timing_type = EXCLUDED.timing_type,
  timing_data = EXCLUDED.timing_data,
  priority = EXCLUDED.priority,
  include_in_diagnosis = EXCLUDED.include_in_diagnosis,
  target_note = EXCLUDED.target_note,
  submission_method = EXCLUDED.submission_method,
  caution_note = EXCLUDED.caution_note,
  is_active = TRUE,
  updated_at = NOW();

INSERT INTO procedure_documents (procedure_id, name, is_required, sort_order)
SELECT p.id, v.document_name, TRUE, 1
FROM (VALUES
  ('LABOR_INS_ESTIMATED_PREMIUM', '労働保険概算保険料申告書'),
  ('EMPLOY_INS_QUALIFICATION', '雇用保険被保険者資格取得届'),
  ('SOCIAL_INS_QUALIFICATION', '健康保険・厚生年金保険 被保険者資格取得届')
) AS v(code, document_name)
JOIN procedures p ON p.code = v.code
ON CONFLICT (procedure_id, name) DO UPDATE SET is_required = TRUE;

INSERT INTO official_links (procedure_id, label, url, sort_order, status, fallback_url)
SELECT p.id, v.label, v.url, 1, 'ok', v.fallback_url
FROM (VALUES
  ('LABOR_INS_ESTIMATED_PREMIUM', '労働保険の成立手続（厚生労働省）', 'https://www.mhlw.go.jp/www2/topics/seido/daijin/hoken/980916_2.htm', 'https://www.mhlw.go.jp/'),
  ('EMPLOY_INS_QUALIFICATION', '雇用保険の加入手続（厚生労働省）', 'https://www.mhlw.go.jp/stf/seisakunitsuite/bunya/0000147331.html', 'https://www.mhlw.go.jp/'),
  ('SOCIAL_INS_QUALIFICATION', '就職したときの資格取得手続（日本年金機構）', 'https://www.nenkin.go.jp/service/kounen/tekiyo/hihokensha1/20150422.html', 'https://www.nenkin.go.jp/')
) AS v(code, label, url, fallback_url)
JOIN procedures p ON p.code = v.code
ON CONFLICT (procedure_id, url) DO UPDATE SET
  label = EXCLUDED.label,
  status = EXCLUDED.status,
  fallback_url = EXCLUDED.fallback_url;
