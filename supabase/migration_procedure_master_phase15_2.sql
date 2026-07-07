-- ============================================================
-- SUNBOO経営ナビ — Procedure Master拡充（Sprint15 Phase15.2）
-- ============================================================
-- 実行済み: Supabase SQL Editorで実行済み・Playwrightで動作確認済み（2026-07-06）。
-- 冪等性（ON CONFLICT / DELETE-then-recreateパターン）を検証済みのため、
-- 誤って再実行しても procedures / event_types / rules は重複登録されない。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（ON CONFLICT / DELETE-then-recreate を使用）。
--
-- 設計根拠: docs/PROCEDURE_MASTER_AUDIT.md（Phase15.1監査）
--           docs/PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md（Phase15.2提案・レビュー承認済み）
--
-- 本マイグレーションが行うこと（データ投入のみ、スキーマ変更なし）:
--   1. procedures へ10件追加（法人税・消費税・地方税3種・償却資産・給与支払報告書・
--      源泉所得税の特例申請・異動届出書・決算公告）
--   2. event_types へ5件追加（決算・本店移転・賞与支給・36協定・インボイス登録）。
--      いずれも is_active = false で追加し、既存 /events ページ（EVENT_ICON が
--      3種しか定義されていない）をクラッシュさせないようにする
--   3. rules / rule_conditions / rule_actions へ11件追加
--
-- 新しいテーブル・カラムは作らないため、GRANT / RLS の追加設定は不要
-- （procedures / event_types / rules 系は既存マイグレーションで設定済み）。
-- ============================================================

-- ============================================================
-- 1. procedures 追加（10件）
-- ============================================================
-- 優先度: 既存の最大値が20（LEGAL_CERT_SEAL）のため、21番から採番する。

INSERT INTO procedures (
  code, name, description, category, requires_employees,
  office_type, frequency, timing_label, timing_type, timing_data, priority,
  corporate_type, requires_officer_term, include_in_diagnosis,
  target_note, submission_method, e_filing_system_name, e_filing_system_url, caution_note
) VALUES

('CORP_TAX_RETURN',
 '法人税確定申告',
 '事業年度終了後に行う法人税・地方法人税の確定申告です。決算日の翌日から2ヶ月以内に税務署へ提出します。',
 'tax', FALSE, 'tax_office', 'annual',
 '決算日の翌日から2ヶ月以内',
 'fiscal_offset', '{"months": 2}', 21,
 NULL, FALSE, TRUE,
 '全ての法人（決算を迎えた事業年度分）',
 '税務署窓口へ持参、郵送、またはe-Taxによるオンライン申告',
 'e-Tax', 'https://www.e-tax.nta.go.jp/',
 '本情報は一般的な参考情報です。申告書の作成・税額計算は税理士等の専門家にご確認ください。'),

('CONSUMPTION_TAX_RETURN',
 '消費税確定申告',
 '課税事業者が行う消費税及び地方消費税の確定申告です。決算日の翌日から2ヶ月以内に税務署へ提出します。免税事業者は対象外です。',
 'tax', FALSE, 'tax_office', 'annual',
 '決算日の翌日から2ヶ月以内',
 'fiscal_offset', '{"months": 2}', 22,
 NULL, FALSE, FALSE,
 '消費税の課税事業者（インボイス登録事業者を含む）',
 '税務署窓口へ持参、郵送、またはe-Taxによるオンライン申告',
 'e-Tax', 'https://www.e-tax.nta.go.jp/',
 '免税事業者は対象外です。課税事業者に該当するかどうかは資本金・課税売上高等により判定が異なるため、税理士等の専門家にご確認ください。'),

('PREFECTURAL_RESIDENT_TAX_RETURN',
 '法人県民税申告',
 '都道府県が課す法人住民税（均等割・法人税割）の申告です。決算日の翌日から2ヶ月以内に都道府県税事務所へ提出します。',
 'local_tax', FALSE, 'prefectural_tax', 'annual',
 '決算日の翌日から2ヶ月以内',
 'fiscal_offset', '{"months": 2}', 23,
 NULL, FALSE, TRUE,
 '全ての法人（決算を迎えた事業年度分）',
 '都道府県税事務所窓口へ持参、郵送、またはeLTAXによるオンライン申告',
 'eLTAX（地方税ポータルシステム）', 'https://www.eltax.lta.go.jp/',
 '本情報は一般的な参考情報です。法人事業税と同一の申告書（第6号様式等）で同時提出するのが一般的です。税理士等の専門家にご確認ください。'),

('PREFECTURAL_BUSINESS_TAX_RETURN',
 '法人事業税申告',
 '都道府県が課す法人事業税（所得割・付加価値割・資本割等）の申告です。決算日の翌日から2ヶ月以内に都道府県税事務所へ提出します。',
 'local_tax', FALSE, 'prefectural_tax', 'annual',
 '決算日の翌日から2ヶ月以内',
 'fiscal_offset', '{"months": 2}', 24,
 NULL, FALSE, TRUE,
 '全ての法人（決算を迎えた事業年度分）',
 '都道府県税事務所窓口へ持参、郵送、またはeLTAXによるオンライン申告',
 'eLTAX（地方税ポータルシステム）', 'https://www.eltax.lta.go.jp/',
 '本情報は一般的な参考情報です。法人県民税と同一の申告書で同時提出するのが一般的です。税理士等の専門家にご確認ください。'),

('MUNICIPAL_RESIDENT_TAX_RETURN',
 '法人市民税申告',
 '市区町村が課す法人住民税（均等割・法人税割）の申告です。決算日の翌日から2ヶ月以内に市区町村税務課へ提出します。',
 'local_tax', FALSE, 'municipal_tax', 'annual',
 '決算日の翌日から2ヶ月以内',
 'fiscal_offset', '{"months": 2}', 25,
 NULL, FALSE, TRUE,
 '全ての法人（決算を迎えた事業年度分）',
 '市区町村税務課窓口へ持参、郵送、またはeLTAXによるオンライン申告',
 'eLTAX（地方税ポータルシステム）', 'https://www.eltax.lta.go.jp/',
 '東京23区は都税事務所への申告に一本化される等、自治体により扱いが異なる場合があります。税理士等の専門家にご確認ください。'),

('DEPRECIABLE_ASSET_TAX_RETURN',
 '償却資産申告',
 '毎年1月1日時点で保有する事業用の償却資産（機械・器具備品等）について、資産所在地の市区町村へ行う申告です。',
 'local_tax', FALSE, 'municipal_tax', 'annual',
 '毎年1月31日',
 'fixed_date', '{"month": 1, "day": 31}', 26,
 NULL, FALSE, TRUE,
 '事業用の償却資産を保有する全ての法人',
 '市区町村税務課窓口へ持参、郵送、またはeLTAXによるオンライン申告',
 'eLTAX（地方税ポータルシステム）', 'https://www.eltax.lta.go.jp/',
 '課税対象となる資産（PC・什器等）を保有していない場合は申告が不要な場合があります。対象資産の有無は税理士等の専門家にご確認ください。'),

('SALARY_PAYMENT_REPORT',
 '給与支払報告書',
 '従業員の前年分給与支払額を、従業員それぞれの1月1日時点の住所地の市区町村へ報告する書類です。年末調整とあわせて作成します。',
 'local_tax', TRUE, 'municipal_tax', 'annual',
 '毎年1月31日',
 'fixed_date', '{"month": 1, "day": 31}', 27,
 NULL, FALSE, TRUE,
 '従業員に給与を支払う全ての法人',
 '市区町村窓口へ持参、郵送、またはeLTAX・地方税共通納税システムによるオンライン提出',
 'eLTAX（地方税ポータルシステム）', 'https://www.eltax.lta.go.jp/',
 '本情報は一般的な参考情報です。年末調整・法定調書合計表の提出と同時期に行う作業のため、あわせてご確認ください。'),

('WITHHOLDING_SPECIAL_EXCEPTION',
 '源泉所得税の納期の特例申請',
 '給与の源泉所得税を毎月ではなく年2回（7月・1月）にまとめて納付できるようにする届出です。従業員数が常時10人未満の場合に選択できます。',
 'tax', TRUE, 'tax_office', 'as_needed',
 '随時（提出の翌々月納付分から適用）',
 'event_based', NULL, 28,
 NULL, FALSE, FALSE,
 '給与の支払事務所等を有し、常時雇用する従業員が10人未満の法人',
 '税務署窓口へ持参、郵送、またはe-Taxによるオンライン申請',
 'e-Tax', 'https://www.e-tax.nta.go.jp/',
 '従業員が常時10人以上になった場合は対象外です。適用要件の詳細は税理士等の専門家にご確認ください。'),

('TAX_OFFICE_CHANGE_NOTICE',
 '異動届出書',
 '本店所在地・事業年度・代表者等に変更があった場合に税務署へ提出する届出です。',
 'tax', FALSE, 'tax_office', 'one_time',
 '遅滞なく（提出期限の法定の日数指定はありません）',
 'event_based', NULL, 29,
 NULL, FALSE, FALSE,
 '本店移転等の異動があった法人',
 '税務署窓口へ持参、郵送、またはe-Taxによるオンライン申請',
 'e-Tax', 'https://www.e-tax.nta.go.jp/',
 '都道府県税事務所・市区町村税務課へも別途、異動に関する届出が必要な場合があります。税理士等の専門家にご確認ください。'),

('FINANCIAL_STATEMENT_PUBLICATION',
 '決算公告',
 '株式会社が定時株主総会での決算承認後に行う、貸借対照表（またはその要旨）の公告です。会社法上の義務であり、合同会社には義務がありません。',
 'legal', FALSE, 'other', 'annual',
 '定時株主総会後、遅滞なく（目安: 決算日から3ヶ月以内）',
 'fiscal_offset', '{"months": 3}', 30,
 'kabushiki', FALSE, TRUE,
 '株式会社（合同会社は決算公告の義務がありません）',
 '官報・日刊新聞・電子公告のいずれかの方法により実施（提出先となる行政機関はありません）',
 NULL, NULL,
 '未公告のまま放置すると100万円以下の過料の対象となる場合があります（会社法976条）。実施時期・方法は司法書士等の専門家にご確認ください。')

ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 2. event_types 追加（5件、いずれも is_active = false）
-- ============================================================
-- is_active = false にする理由: 既存の /events ページ（src/app/(site)/events/page.tsx）は
-- is_active = true の event_types を全件取得し、EVENT_ICON（3種のみ定義）からアイコンを
-- 引いて描画するため、is_active = true で追加すると未対応イベントでクラッシュする。
-- 本Phaseはコード・画面を変更しないため、is_active = false のまま「マスタとして存在するが
-- 未使用」の状態に留め、UI側の対応が整うフェーズで true に切り替える運用とする。

INSERT INTO event_types (code, name, description, sort_order, is_active) VALUES
  ('fiscal_year_end',     '決算',         '事業年度が終了し決算を迎えた', 4, FALSE),
  ('hq_relocation',       '本店移転',     '本店所在地を移転した', 5, FALSE),
  ('bonus_payment',       '賞与支給',     '従業員に賞与を支給した', 6, FALSE),
  ('labor_agreement_36',  '36協定',       '時間外労働・休日労働に関する労使協定を締結した', 7, FALSE),
  ('invoice_registration','インボイス登録', '適格請求書発行事業者の登録を行った', 8, FALSE)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3. rules / rule_conditions / rule_actions 追加（11件）
-- ============================================================
-- migration_rule_engine.sql と同じ冪等化パターン（DELETE-then-recreate + ヘルパー関数）を用いる。
-- 「決算」「本店移転」を条件に使うルールは、上記2節の通りイベント自体が is_active = false のため
-- 現時点では /events 経由では発火しない（将来の活性化に備えたデータとして先行投入する）。
-- 「会社設立」「従業員採用」を条件に使う2件（源泉所得税の特例申請）は、既存の活性化済み
-- イベントを使うため、今回から実際に発火する。

INSERT INTO rules (name, description, priority) VALUES
  ('決算：法人税確定申告', '決算イベントで、全ての法人に法人税確定申告を追加する', 50),
  ('決算：法人県民税申告', '決算イベントで、全ての法人に法人県民税申告を追加する', 51),
  ('決算：法人事業税申告', '決算イベントで、全ての法人に法人事業税申告を追加する', 52),
  ('決算：法人市民税申告', '決算イベントで、全ての法人に法人市民税申告を追加する', 53),
  ('決算：消費税確定申告（課税事業者）', '決算イベントで、消費税課税事業者の場合に消費税確定申告を追加する', 54),
  ('決算：消費税確定申告（インボイス登録済み）', '決算イベントで、インボイス登録済みの場合に消費税確定申告を追加する', 55),
  ('決算：決算公告（株式会社）', '決算イベントで、株式会社の場合のみ決算公告を追加する', 56),
  ('本店移転：異動届出書', '本店移転イベントで、異動届出書を追加する', 60),
  ('本店移転：本店移転登記', '本店移転イベントで、本店移転登記を追加する', 61),
  ('会社設立：源泉所得税の納期の特例申請', '会社設立イベントで、納期の特例が未設定の場合に申請書を追加する', 70),
  ('従業員採用：源泉所得税の納期の特例申請', '従業員採用イベントで、納期の特例が未設定の場合に申請書を追加する', 71)
ON CONFLICT (name) DO NOTHING;

-- 再実行時に条件・実行内容が増殖しないよう、上記11ルール分のみ一旦削除してから作り直す
-- （管理画面から作成された別のルールには影響しない）。
DELETE FROM rule_conditions WHERE rule_id IN (
  SELECT id FROM rules WHERE name IN (
    '決算：法人税確定申告', '決算：法人県民税申告', '決算：法人事業税申告', '決算：法人市民税申告',
    '決算：消費税確定申告（課税事業者）', '決算：消費税確定申告（インボイス登録済み）', '決算：決算公告（株式会社）',
    '本店移転：異動届出書', '本店移転：本店移転登記',
    '会社設立：源泉所得税の納期の特例申請', '従業員採用：源泉所得税の納期の特例申請'
  )
);
DELETE FROM rule_actions WHERE rule_id IN (
  SELECT id FROM rules WHERE name IN (
    '決算：法人税確定申告', '決算：法人県民税申告', '決算：法人事業税申告', '決算：法人市民税申告',
    '決算：消費税確定申告（課税事業者）', '決算：消費税確定申告（インボイス登録済み）', '決算：決算公告（株式会社）',
    '本店移転：異動届出書', '本店移転：本店移転登記',
    '会社設立：源泉所得税の納期の特例申請', '従業員採用：源泉所得税の納期の特例申請'
  )
);

CREATE OR REPLACE FUNCTION _sunboo_add_rule_condition(
  p_rule_name TEXT, p_field TEXT, p_operator TEXT, p_value JSONB, p_sort INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO rule_conditions (rule_id, field, operator, value, sort_order)
  SELECT id, p_field, p_operator, p_value, p_sort FROM rules WHERE name = p_rule_name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION _sunboo_add_rule_action(
  p_rule_name TEXT, p_action_type TEXT, p_procedure_code TEXT, p_payload JSONB, p_sort INT
) RETURNS VOID AS $$
DECLARE
  v_procedure_id INT;
BEGIN
  IF p_procedure_code IS NOT NULL THEN
    SELECT id INTO v_procedure_id FROM procedures WHERE code = p_procedure_code;
  END IF;
  INSERT INTO rule_actions (rule_id, action_type, procedure_id, payload, sort_order)
  SELECT id, p_action_type, v_procedure_id, p_payload, p_sort FROM rules WHERE name = p_rule_name;
END;
$$ LANGUAGE plpgsql;

-- 決算：法人税確定申告
SELECT _sunboo_add_rule_condition('決算：法人税確定申告', 'event_type_code', 'eq', '"fiscal_year_end"', 1);
SELECT _sunboo_add_rule_action('決算：法人税確定申告', 'add_procedure', 'CORP_TAX_RETURN', NULL, 1);

-- 決算：法人県民税申告
SELECT _sunboo_add_rule_condition('決算：法人県民税申告', 'event_type_code', 'eq', '"fiscal_year_end"', 1);
SELECT _sunboo_add_rule_action('決算：法人県民税申告', 'add_procedure', 'PREFECTURAL_RESIDENT_TAX_RETURN', NULL, 1);

-- 決算：法人事業税申告
SELECT _sunboo_add_rule_condition('決算：法人事業税申告', 'event_type_code', 'eq', '"fiscal_year_end"', 1);
SELECT _sunboo_add_rule_action('決算：法人事業税申告', 'add_procedure', 'PREFECTURAL_BUSINESS_TAX_RETURN', NULL, 1);

-- 決算：法人市民税申告
SELECT _sunboo_add_rule_condition('決算：法人市民税申告', 'event_type_code', 'eq', '"fiscal_year_end"', 1);
SELECT _sunboo_add_rule_action('決算：法人市民税申告', 'add_procedure', 'MUNICIPAL_RESIDENT_TAX_RETURN', NULL, 1);

-- 決算：消費税確定申告（課税事業者 OR インボイス登録済み。ORはルールを分けて表現）
SELECT _sunboo_add_rule_condition('決算：消費税確定申告（課税事業者）', 'event_type_code', 'eq', '"fiscal_year_end"', 1);
SELECT _sunboo_add_rule_condition('決算：消費税確定申告（課税事業者）', 'consumption_tax_status', 'eq', '"taxable"', 2);
SELECT _sunboo_add_rule_action('決算：消費税確定申告（課税事業者）', 'add_procedure', 'CONSUMPTION_TAX_RETURN', NULL, 1);

SELECT _sunboo_add_rule_condition('決算：消費税確定申告（インボイス登録済み）', 'event_type_code', 'eq', '"fiscal_year_end"', 1);
SELECT _sunboo_add_rule_condition('決算：消費税確定申告（インボイス登録済み）', 'invoice_registration_status', 'eq', '"registered"', 2);
SELECT _sunboo_add_rule_action('決算：消費税確定申告（インボイス登録済み）', 'add_procedure', 'CONSUMPTION_TAX_RETURN', NULL, 1);

-- 決算：決算公告（株式会社のみ）
SELECT _sunboo_add_rule_condition('決算：決算公告（株式会社）', 'event_type_code', 'eq', '"fiscal_year_end"', 1);
SELECT _sunboo_add_rule_condition('決算：決算公告（株式会社）', 'corporate_type', 'eq', '"kabushiki"', 2);
SELECT _sunboo_add_rule_action('決算：決算公告（株式会社）', 'add_procedure', 'FINANCIAL_STATEMENT_PUBLICATION', NULL, 1);

-- 本店移転：異動届出書
SELECT _sunboo_add_rule_condition('本店移転：異動届出書', 'event_type_code', 'eq', '"hq_relocation"', 1);
SELECT _sunboo_add_rule_action('本店移転：異動届出書', 'add_procedure', 'TAX_OFFICE_CHANGE_NOTICE', NULL, 1);

-- 本店移転：本店移転登記（既存 procedure_id=44 / LEGAL_HQ_RELOCATION と接続。従来どこからも未参照だった）
SELECT _sunboo_add_rule_condition('本店移転：本店移転登記', 'event_type_code', 'eq', '"hq_relocation"', 1);
SELECT _sunboo_add_rule_action('本店移転：本店移転登記', 'add_procedure', 'LEGAL_HQ_RELOCATION', NULL, 1);

-- 会社設立：源泉所得税の納期の特例申請（納期の特例が未設定の場合のみ）
SELECT _sunboo_add_rule_condition('会社設立：源泉所得税の納期の特例申請', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_condition('会社設立：源泉所得税の納期の特例申請', 'withholding_tax_cycle', 'eq', '"unset"', 2);
SELECT _sunboo_add_rule_action('会社設立：源泉所得税の納期の特例申請', 'add_procedure', 'WITHHOLDING_SPECIAL_EXCEPTION', NULL, 1);

-- 従業員採用：源泉所得税の納期の特例申請（納期の特例が未設定の場合のみ）
SELECT _sunboo_add_rule_condition('従業員採用：源泉所得税の納期の特例申請', 'event_type_code', 'eq', '"employee_hired"', 1);
SELECT _sunboo_add_rule_condition('従業員採用：源泉所得税の納期の特例申請', 'withholding_tax_cycle', 'eq', '"unset"', 2);
SELECT _sunboo_add_rule_action('従業員採用：源泉所得税の納期の特例申請', 'add_procedure', 'WITHHOLDING_SPECIAL_EXCEPTION', NULL, 1);

DROP FUNCTION _sunboo_add_rule_condition(TEXT, TEXT, TEXT, JSONB, INT);
DROP FUNCTION _sunboo_add_rule_action(TEXT, TEXT, TEXT, JSONB, INT);

-- ============================================================
-- 4. 確認クエリ
-- ============================================================

SELECT code, name, category, office_type, include_in_diagnosis, priority
FROM procedures
WHERE code IN (
  'CORP_TAX_RETURN', 'CONSUMPTION_TAX_RETURN', 'PREFECTURAL_RESIDENT_TAX_RETURN',
  'PREFECTURAL_BUSINESS_TAX_RETURN', 'MUNICIPAL_RESIDENT_TAX_RETURN', 'DEPRECIABLE_ASSET_TAX_RETURN',
  'SALARY_PAYMENT_REPORT', 'WITHHOLDING_SPECIAL_EXCEPTION', 'TAX_OFFICE_CHANGE_NOTICE',
  'FINANCIAL_STATEMENT_PUBLICATION'
)
ORDER BY priority;

SELECT code, name, is_active FROM event_types ORDER BY sort_order;

SELECT r.name AS ルール名, r.priority, r.is_active,
  (SELECT COUNT(*) FROM rule_conditions rc WHERE rc.rule_id = r.id) AS 条件数,
  (SELECT COUNT(*) FROM rule_actions ra WHERE ra.rule_id = r.id) AS 実行内容数
FROM rules r
WHERE r.priority >= 50
ORDER BY r.priority;
