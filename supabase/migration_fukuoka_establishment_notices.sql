-- 福岡県・福岡市の法人設立時地方税届出（公式確認済み範囲のみ）
INSERT INTO procedures (
  code, name, description, category, requires_employees, office_type, frequency,
  timing_label, timing_type, timing_data, priority, corporate_type,
  requires_officer_term, include_in_diagnosis, target_note, submission_method,
  e_filing_system_name, e_filing_system_url, caution_note
) VALUES
('FUKUOKA_PREFECTURAL_ESTABLISHMENT_NOTICE', '法人設立（設置）届（福岡県）',
 '福岡県内で法人を設立・設置した際に、管轄の県税事務所へ提出する届出です。',
 'local_tax', FALSE, 'prefectural_tax', 'one_time', '設立日から15日以内',
 'at_establishment', '{"days_from_event":15}', 4, NULL, FALSE, TRUE,
 '福岡県内に法人を設立・設置した法人', '県税事務所への持参、郵送または電子申請',
 'eLTAX', 'https://www.eltax.lta.go.jp/', '期限・必要書類は福岡県または管轄県税事務所の最新案内を確認してください。'),
('FUKUOKA_CITY_ESTABLISHMENT_NOTICE', '法人等の設立申告書（福岡市）',
 '福岡市内で法人を設立・設置した際に、福岡市財政局法人税務課へ提出する申告書です。',
 'local_tax', FALSE, 'municipal_tax', 'one_time', '設立日から10日以内',
 'at_establishment', '{"days_from_event":10}', 3, NULL, FALSE, TRUE,
 '福岡市内に法人を設立・設置した法人', '窓口への持参、郵送またはeLTAX',
 'eLTAX', 'https://www.eltax.lta.go.jp/', '定款の写しと登記事項証明書の写し等が必要です。福岡市の最新案内を確認してください。')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, description=EXCLUDED.description, timing_label=EXCLUDED.timing_label,
  timing_type=EXCLUDED.timing_type, timing_data=EXCLUDED.timing_data,
  include_in_diagnosis=EXCLUDED.include_in_diagnosis, caution_note=EXCLUDED.caution_note;

INSERT INTO procedure_submission_rules (procedure_id, office_category, conditions, recipient_scope, priority, is_active, notes)
SELECT p.id, p.office_type, '[]'::jsonb, 'company', 0, TRUE, '設立時地方税届出の提出先'
FROM procedures p
WHERE p.code IN ('FUKUOKA_PREFECTURAL_ESTABLISHMENT_NOTICE','FUKUOKA_CITY_ESTABLISHMENT_NOTICE')
ON CONFLICT (procedure_id, office_category, priority) DO UPDATE SET is_active=TRUE, updated_at=NOW();

INSERT INTO official_links (procedure_id, label, url, sort_order)
SELECT p.id, '福岡市 法人市民税について', 'https://www.city.fukuoka.lg.jp/zaisei/shisanzei/life/002.html', 1
FROM procedures p WHERE p.code='FUKUOKA_CITY_ESTABLISHMENT_NOTICE'
  AND NOT EXISTS (SELECT 1 FROM official_links l WHERE l.procedure_id=p.id AND l.url='https://www.city.fukuoka.lg.jp/zaisei/shisanzei/life/002.html');
