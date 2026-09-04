-- 源泉所得税の納期の特例を初回診断の候補に含める。
-- アプリ側で、給与の支給人員が常時1〜9人の場合だけ表示する。
UPDATE procedures
SET
  include_in_diagnosis = TRUE,
  description = '給与の源泉所得税を毎月ではなく年2回（7月・1月）にまとめて納付できるようにする届出です。給与の支給人員が常時10人未満の場合に選択できます。',
  target_note = '給与の支給人員が常時10人未満の源泉徴収義務者',
  caution_note = '給与の支給人員が常時10人以上になった場合は対象外です。適用要件の詳細は税理士等の専門家にご確認ください。'
WHERE code = 'WITHHOLDING_SPECIAL_EXCEPTION';
