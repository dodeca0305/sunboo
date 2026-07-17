-- ============================================================
-- SUNBOO経営ナビ — National Submission Directory Phase3C-1
-- 「prefectural_tax 実データ投入」＋「office_category 細分化の基盤実装（ADR D13）」
-- ============================================================
-- 対象:
--   1. prefectural_tax（福岡県12県税事務所・72判定単位）の実データ投入
--      根拠: docs/PHASE3B_PREFECTURAL_TAX_DISCOVERY.md（情報源A/B/C、福岡県庁公式サイト）
--   2. ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md（D13、選択肢A採用）の基盤実装
--      - organization_types に新カテゴリ 'municipal_asset_tax' を追加（データ行の追加のみ）
--      - procedure_submission_rules に DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax の
--        無条件上書きルールを追加
--
-- 【対象外・本Migrationでは投入しない】
--   - municipal_tax の実データ（submission_offices/submission_jurisdictions とも0件のまま）。
--     72判定単位の調査（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md）はまだ50/60自治体分までしか
--     取得できておらず、投入は別Phaseとする（ユーザー指示により本Phaseでは禁止）。
--   - municipal_asset_tax の窓口データ（submission_offices/submission_jurisdictions）。
--     カテゴリとルールの「受け皿」だけを用意し、データはmunicipal_tax投入と同じタイミングで
--     別Phaseで投入する。本Migration適用後、DEPRECIABLE_ASSET_TAX_RETURNの解決結果は
--     引き続き not_supported のまま変化しない（非破壊的な追加、意図通り）。
--
-- 【変更しないもの】
--   - src/lib/submissionDirectory/resolve.ts / dataAccess.ts / stateModel.ts / explain.ts（無変更）
--   - procedures テーブル本体（Procedure Master）
--   - organization_types の既存13行（削除・更新なし。新規1行の追加のみ）
--   - Rule Engine（rules/rule_conditions/rule_actions）
--
-- 【GRANT/RLSについて】
--   本Migrationは新規テーブルを作成しない（organization_types/submission_offices/office_sources/
--   submission_jurisdictions/procedure_submission_rulesは全てmigration_national_submission_directory.sql
--   で作成済み・GRANT/RLS設定済み）。既存テーブルへの行追加のみのため、GRANT/RLSの追加は不要
--   （CLAUDE.mdの「新規テーブル作成時はGRANT/RLSをセットで書く」原則は本Migrationには該当しない）。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（ON CONFLICT / NOT EXISTS ガードを使用）。
-- ============================================================

-- ============================================================
-- 0. 依存データの存在確認
-- ============================================================

DO $$
DECLARE
  muni_count INT;
  proc_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM organization_types WHERE code = 'prefectural_tax') THEN
    RAISE WARNING 'Phase3C-1: organization_types.code=prefectural_tax が見つかりません。1節のINSERTがFK制約違反になります。';
  END IF;

  SELECT COUNT(*) INTO muni_count FROM municipalities m JOIN prefectures p ON p.id = m.prefecture_id WHERE p.code = '40';
  IF muni_count <> 72 THEN
    RAISE WARNING 'Phase3C-1: 福岡県の municipalities 件数が%件で、想定の72判定単位と一致しません。2節の投入が一部欠落する可能性があります。', muni_count;
  ELSE
    RAISE NOTICE 'Phase3C-1: 福岡県 municipalities は72件（想定通り）。';
  END IF;

  SELECT COUNT(*) INTO proc_count FROM procedures WHERE code = 'DEPRECIABLE_ASSET_TAX_RETURN';
  IF proc_count = 0 THEN
    RAISE WARNING 'Phase3C-1: procedures.code=DEPRECIABLE_ASSET_TAX_RETURN が見つかりません。4節のINSERTは0件のまま成功します。';
  END IF;
END $$;

-- ============================================================
-- 1. prefectural_tax: submission_offices（12県税事務所）
-- ============================================================
-- 情報源: docs/PHASE3B_PREFECTURAL_TAX_DISCOVERY.md 情報源A（所在地一覧）・B（組織一覧、official_urlの元）。
-- 電話番号は情報源A・Cで全12拠点とも記載が食い違うため（同ドキュメント8節）、情報源Aの値を暫定値として
-- 採用し、official_url_status は 'ok' と断定せず 'unchecked' のまま投入する。
-- 地区県税相談窓口（4ヶ所）は提出先ではないため対象外（同ドキュメント1節・6節）。
-- postal_code は情報源に記載が無いため NULL のまま（推測で埋めない）。

INSERT INTO submission_offices (
  office_category, organization_name, name, postal_code, address, phone, fax, email,
  website_url, official_url, e_filing_url, download_page_url, map_url, business_hours, notes,
  official_url_status, official_url_checked_at, fallback_url, update_frequency
)
VALUES
  ('prefectural_tax', '福岡県', '博多県税事務所', NULL, '福岡市博多区博多駅東1-17-1（コネクトスクエア博多2・3階）', '092-260-6001', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/208127/', 'https://www.pref.fukuoka.lg.jp/soshiki/208127/', NULL, NULL, NULL, NULL,
   '情報源A（所在地一覧）とC（提出先PDF）で電話番号の記載が異なる（A=092-260-6001／C=092-260-6008）。Aを暫定値として採用、要一次確認（docs/PHASE3B_PREFECTURAL_TAX_DISCOVERY.md 8節）。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '東福岡県税事務所', NULL, '福岡市東区箱崎1-18-1（福岡県粕屋総合庁舎2階）', '092-641-0201', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/208305/', 'https://www.pref.fukuoka.lg.jp/soshiki/208305/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=092-641-0201／C=092-641-0148）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '西福岡県税事務所', NULL, '福岡市中央区赤坂1-8-8（福岡県福岡西総合庁舎3・4階）', '092-735-6141', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/208400/', 'https://www.pref.fukuoka.lg.jp/soshiki/208400/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=092-735-6141／C=092-735-6145）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '筑紫県税事務所', NULL, '大野城市白木原3-5-25（福岡県筑紫総合庁舎4階）', '092-513-5573', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/208508/', 'https://www.pref.fukuoka.lg.jp/soshiki/208508/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=092-513-5573／C=092-513-5578）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '北九州東県税事務所', NULL, '北九州市小倉北区城内7-8（福岡県小倉総合庁舎1・2階）', '093-592-3511', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/208613/', 'https://www.pref.fukuoka.lg.jp/soshiki/208613/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=093-592-3511／C=093-592-3506）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '北九州西県税事務所', NULL, '北九州市八幡東区平野2-13-2', '093-662-9310', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/208816/', 'https://www.pref.fukuoka.lg.jp/soshiki/208816/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=093-662-9310／C=093-662-9317）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '田川県税事務所', NULL, '田川市大字伊田3292-2（福岡県田川総合庁舎2階）', '0947-42-9302', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/209107/', 'https://www.pref.fukuoka.lg.jp/soshiki/209107/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=0947-42-9302／C=0947-42-9306）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '飯塚・直方県税事務所', NULL, '飯塚市新立岩8-1（福岡県飯塚総合庁舎1階）', '0948-21-4902', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/209212/', 'https://www.pref.fukuoka.lg.jp/soshiki/209212/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=0948-21-4902／C=0948-21-4921）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '久留米県税事務所', NULL, '久留米市合川町1642-1（福岡県久留米総合庁舎4階）', '0942-30-1012', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/209301/', 'https://www.pref.fukuoka.lg.jp/soshiki/209301/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=0942-30-1012／C=0942-30-1028）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '大牟田県税事務所', NULL, '大牟田市小浜町24-1（福岡県大牟田総合庁舎1階）', '0944-41-5122', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/209407/', 'https://www.pref.fukuoka.lg.jp/soshiki/209407/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=0944-41-5122／C=0944-41-5126）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '筑後県税事務所', NULL, '筑後市大字和泉423（南筑後教育事務所庁舎内）', '0942-52-5131', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/209504/', 'https://www.pref.fukuoka.lg.jp/soshiki/209504/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=0942-52-5131／C=0942-52-5135）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual'),
  ('prefectural_tax', '福岡県', '行橋県税事務所', NULL, '行橋市中央1-2-1（福岡県行橋総合庁舎1階）', '0930-23-2216', NULL, NULL,
   'https://www.pref.fukuoka.lg.jp/soshiki/209601/', 'https://www.pref.fukuoka.lg.jp/soshiki/209601/', NULL, NULL, NULL, NULL,
   '情報源A/Cで電話番号が異なる（A=0930-23-2216／C=0930-23-2258）。Aを暫定値として採用、要一次確認。',
   'unchecked', NULL, NULL, 'annual')
ON CONFLICT (office_category, name) DO UPDATE SET
  organization_name = EXCLUDED.organization_name,
  address = EXCLUDED.address,
  phone = EXCLUDED.phone,
  website_url = EXCLUDED.website_url,
  official_url = EXCLUDED.official_url,
  notes = EXCLUDED.notes,
  official_url_status = EXCLUDED.official_url_status,
  updated_at = NOW();

-- ============================================================
-- 2. prefectural_tax: office_sources（情報源、窓口ごとに1件）
-- ============================================================
-- 住所・電話は情報源A（所在地一覧ページ）を正本として記録する。管轄区域（3節）は情報源C（提出先PDF）を
-- 正本とする。両情報源で電話番号が食い違う事実を notes に構造化して残す（D6の趣旨）。

INSERT INTO office_sources (
  office_id, source_type, publisher_name, source_url, retrieved_at, verification_method, status, is_current, notes
)
SELECT
  so.id,
  'pref_government',
  '福岡県庁',
  'https://www.pref.fukuoka.lg.jp/contents/shozaichi.html',
  '2026-07-17',
  'official_page_check',
  'active',
  true,
  '住所・電話は情報源A（所在地一覧, shozaichi.html）を採用。管轄区域はsubmission_jurisdictions側で情報源C（提出先PDF, uploaded/attachment/236131.pdf）を正本として別途投入。電話番号は情報源Cと不一致のため要再確認（docs/PHASE3B_PREFECTURAL_TAX_DISCOVERY.md 8節）。'
FROM submission_offices so
WHERE so.office_category = 'prefectural_tax'
ON CONFLICT (office_id) WHERE is_current = true DO UPDATE SET
  source_url = EXCLUDED.source_url,
  retrieved_at = EXCLUDED.retrieved_at,
  notes = EXCLUDED.notes;

-- ============================================================
-- 3. prefectural_tax: submission_jurisdictions（72判定単位、1対1）
-- ============================================================
-- 根拠: docs/PHASE3B_PREFECTURAL_TAX_DISCOVERY.md 3節・4節（情報源C、提出先PDFの管轄区域表）。
-- 72判定単位すべてが12県税事務所のいずれか1つに過不足なく対応する（同ドキュメントで確認済み、
-- multiple_candidatesに相当する分割管轄は無い）。博多県税事務所の「本店が県外の会社」特則（同3節）は
-- 現行CompanyProfileの制約により対象外のため実装しない（同ドキュメント10節の推奨方針通り）。

WITH office_municipality_map(office_name, municipality_code) AS (
  VALUES
    -- 博多県税事務所（2）
    ('博多県税事務所', '401323'), ('博多県税事務所', '401340'),
    -- 東福岡県税事務所（11）
    ('東福岡県税事務所', '401315'), ('東福岡県税事務所', '402206'), ('東福岡県税事務所', '402231'),
    ('東福岡県税事務所', '402249'), ('東福岡県税事務所', '403415'), ('東福岡県税事務所', '403423'),
    ('東福岡県税事務所', '403431'), ('東福岡県税事務所', '403440'), ('東福岡県税事務所', '403458'),
    ('東福岡県税事務所', '403482'), ('東福岡県税事務所', '403491'),
    -- 西福岡県税事務所（5）
    ('西福岡県税事務所', '401331'), ('西福岡県税事務所', '401358'), ('西福岡県税事務所', '401366'),
    ('西福岡県税事務所', '401374'), ('西福岡県税事務所', '402303'),
    -- 筑紫県税事務所（5）
    ('筑紫県税事務所', '402176'), ('筑紫県税事務所', '402184'), ('筑紫県税事務所', '402192'),
    ('筑紫県税事務所', '402214'), ('筑紫県税事務所', '402311'),
    -- 北九州東県税事務所（3）
    ('北九州東県税事務所', '401013'), ('北九州東県税事務所', '401064'), ('北九州東県税事務所', '401072'),
    -- 北九州西県税事務所（9）
    ('北九州西県税事務所', '401030'), ('北九州西県税事務所', '401056'), ('北九州西県税事務所', '401081'),
    ('北九州西県税事務所', '401099'), ('北九州西県税事務所', '402150'), ('北九州西県税事務所', '403814'),
    ('北九州西県税事務所', '403822'), ('北九州西県税事務所', '403831'), ('北九州西県税事務所', '403849'),
    -- 田川県税事務所（8）
    ('田川県税事務所', '402061'), ('田川県税事務所', '406015'), ('田川県税事務所', '406023'),
    ('田川県税事務所', '406040'), ('田川県税事務所', '406058'), ('田川県税事務所', '406082'),
    ('田川県税事務所', '406091'), ('田川県税事務所', '406104'),
    -- 飯塚・直方県税事務所（7）
    ('飯塚・直方県税事務所', '402044'), ('飯塚・直方県税事務所', '402052'), ('飯塚・直方県税事務所', '402265'),
    ('飯塚・直方県税事務所', '402273'), ('飯塚・直方県税事務所', '404012'), ('飯塚・直方県税事務所', '404021'),
    ('飯塚・直方県税事務所', '404217'),
    -- 久留米県税事務所（7）
    ('久留米県税事務所', '402036'), ('久留米県税事務所', '402168'), ('久留米県税事務所', '402257'),
    ('久留米県税事務所', '402281'), ('久留米県税事務所', '404471'), ('久留米県税事務所', '404489'),
    ('久留米県税事務所', '405035'),
    -- 大牟田県税事務所（3）
    ('大牟田県税事務所', '402028'), ('大牟田県税事務所', '402079'), ('大牟田県税事務所', '402290'),
    -- 筑後県税事務所（5）
    ('筑後県税事務所', '402109'), ('筑後県税事務所', '402117'), ('筑後県税事務所', '402125'),
    ('筑後県税事務所', '405442'), ('筑後県税事務所', '405221'),
    -- 行橋県税事務所（7）
    ('行橋県税事務所', '402133'), ('行橋県税事務所', '402141'), ('行橋県税事務所', '406210'),
    ('行橋県税事務所', '406252'), ('行橋県税事務所', '406422'), ('行橋県税事務所', '406465'),
    ('行橋県税事務所', '406473')
)
INSERT INTO submission_jurisdictions (office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, notes)
SELECT
  so.id,
  'prefectural_tax',
  'municipality',
  m.id,
  true,
  0,
  NULL
FROM office_municipality_map omm
JOIN submission_offices so ON so.office_category = 'prefectural_tax' AND so.name = omm.office_name
JOIN municipalities m ON m.code = omm.municipality_code
ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL
DO UPDATE SET office_id = EXCLUDED.office_id, updated_at = NOW();

-- ============================================================
-- 4. ADR D13: office_category 細分化の基盤実装（データ投入のみ、コード変更なし）
-- ============================================================
-- 根拠: docs/ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md 選択肢A採用。
-- 福岡市・北九州市で法人市民税申告と償却資産申告の提出先部署が異なることが判明した
-- （docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 6-2節）ため、専用カテゴリを新設し、
-- 償却資産申告のみをそちらへ無条件で振り分ける。窓口データ自体（submission_offices/
-- submission_jurisdictions）は本Migrationでは投入しない（municipal_tax実データ投入と同じ
-- タイミングで別Phaseに送る）。

-- 4-1. organization_types に新カテゴリを追加（既存13行は無変更）
INSERT INTO organization_types (code, name, description, sort_order, is_active)
VALUES (
  'municipal_asset_tax',
  '市区町村資産課税課',
  '固定資産税・都市計画税・償却資産税（市区町村の資産税部門）。municipal_tax（市民税部門）と同一市区町村・同一office_category内で提出先部署が異なる場合にのみ使う分割用カテゴリ（docs/ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md D13）。市民税・資産税が1部署に統合されている市区町村では、同一のsubmission_offices行をmunicipal_taxとmunicipal_asset_tax両方のsubmission_jurisdictionsから参照させる想定（新規の窓口調査は不要）。',
  14,
  true
)
ON CONFLICT (code) DO NOTHING;

-- 4-2. procedure_submission_rules: 償却資産申告を municipal_asset_tax へ無条件で振り分け
-- 条件なし（全国一律の上書き）。既存の each_employee 上書き2行（給与支払報告書・特別徴収）とは
-- 独立した3件目のルールとして追加する。
INSERT INTO procedure_submission_rules (procedure_id, office_category, conditions, recipient_scope, priority, is_active, notes)
SELECT
  p.id,
  'municipal_asset_tax',
  '[]'::jsonb,
  'company',
  0,
  true,
  '福岡市・北九州市で法人市民税申告（財政局法人税務課等）と提出先部署が異なることが判明したため（docs/PHASE3C_MUNICIPAL_TAX_DISCOVERY.md 6-2節）、専用カテゴリへ無条件で振り分ける（docs/ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md D13 選択肢A）。本Migration時点ではmunicipal_asset_tax側の窓口データが0件のため、解決結果はnot_supportedのまま（意図通り、municipal_tax実データ投入を待つ）。'
FROM procedures p
WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN'
ON CONFLICT (procedure_id, office_category, priority) DO NOTHING;

-- ============================================================
-- 5. 検証SQL
-- ============================================================

-- 5-1. prefectural_tax 窓口数（期待値: 12）
SELECT office_category, COUNT(*) AS office_count
FROM submission_offices
WHERE office_category = 'prefectural_tax'
GROUP BY office_category;

-- 5-2. 重複確認（0行が正常）
SELECT office_category, COUNT(*) AS total_rows, COUNT(DISTINCT name) AS distinct_names
FROM submission_offices
WHERE office_category = 'prefectural_tax'
GROUP BY office_category
HAVING COUNT(*) <> COUNT(DISTINCT name);

-- 5-3. 未紐付け窓口（0行が正常）
SELECT so.id, so.name
FROM submission_offices so
WHERE so.office_category = 'prefectural_tax'
  AND NOT EXISTS (SELECT 1 FROM submission_jurisdictions sj WHERE sj.office_id = so.id);

-- 5-4. 72判定単位×prefectural_tax の網羅チェック（期待値: 0行＝欠落なし）
SELECT m.code AS municipality_code, m.name AS municipality_name
FROM municipalities m
JOIN prefectures p ON p.id = m.prefecture_id
WHERE p.code = '40'
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.municipality_scope_id = m.id AND sj.office_category = 'prefectural_tax'
      AND sj.is_primary = true AND sj.effective_to IS NULL
  )
ORDER BY m.code;

-- 5-5. 分割管轄（is_primary=false）の件数（期待値: 0件、prefectural_taxに分割管轄は無い）
SELECT COUNT(*) AS alternative_count
FROM submission_jurisdictions
WHERE office_category = 'prefectural_tax' AND is_primary = false;

-- 5-6. office_sources の紐付け確認（期待値: 12件、is_current=trueが各1件ずつ）
SELECT COUNT(*) AS source_count
FROM office_sources os
JOIN submission_offices so ON so.id = os.office_id
WHERE so.office_category = 'prefectural_tax' AND os.is_current = true;

-- 5-7. ADR D13: 新カテゴリが追加されたことの確認（期待値: 1行）
SELECT code, name, sort_order FROM organization_types WHERE code = 'municipal_asset_tax';

-- 5-8. ADR D13: procedure_submission_rules の上書きルールが追加されたことの確認（期待値: 1行）
SELECT psr.id, p.code AS procedure_code, psr.office_category, psr.conditions, psr.is_active
FROM procedure_submission_rules psr
JOIN procedures p ON p.id = psr.procedure_id
WHERE psr.office_category = 'municipal_asset_tax';

-- 5-9. ガードレール: municipal_tax / municipal_asset_tax の窓口データが本Migrationで
--      投入されていないことの確認（期待値: 両方とも0件。1件でも出たら禁止事項に抵触）
SELECT office_category, COUNT(*) AS office_count
FROM submission_offices
WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
GROUP BY office_category;

SELECT office_category, COUNT(*) AS jurisdiction_count
FROM submission_jurisdictions
WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
GROUP BY office_category;

-- 5-10. RLS健全性（既存Phase2から変更なしのはずだが念のため確認）
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('submission_offices', 'office_sources', 'submission_jurisdictions', 'procedure_submission_rules', 'organization_types');
