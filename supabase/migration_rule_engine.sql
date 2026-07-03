-- ============================================================
-- SUNBOO経営ナビ — ルールエンジン（Phase 2.5 MVP）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS を使用）。
-- 前提：migration_event_engine.sql が実行済みであること。
--
-- 設計メモ：
-- これまで company_events → 手続き の対応は event_procedures（固定の中間テーブル）＋
-- TypeScript側のハードコードされたcorporate_typeフィルタで実現していた。
-- 本マイグレーションはこれを「rules × rule_conditions × rule_actions」による
-- 汎用ルール評価に置き換える。event_procedures テーブル自体は削除しない
-- （migration_organizations.sql が旧jurisdiction_officesを残した方針と同じ、
-- ロールバック安全性のため）が、アプリケーションコードからは参照しなくなる。
--
-- 評価モデル：
--   ・1ルールの複数条件は AND 結合（OR が必要な場合は条件の異なるルールを複数作成する）
--   ・条件が0件のルールは常に成立する（全体共通ルール用）
--   ・rules.priority の昇順で評価し、同一 procedure_id への change_office / change_deadline が
--     複数ルールで競合した場合は、後に評価されたルール（priorityが大きい方）が優先される
--   ・rule_conditions.field は自由記述（context のキー名と一致させる）。MVPでは
--     event_type_code / corporate_type / has_employees / prefecture_code の4種を評価対象に
--     しているが、将来 capital（資本金）や industry_code（業種）等を context に追加するだけで
--     コード変更なしに条件として使えるようになる（evaluateCondition は field 名を汎用的に扱う）
-- ============================================================

-- ============================================================
-- 1. スキーマ定義
-- ============================================================

CREATE TABLE IF NOT EXISTS rules (
  id          SERIAL      PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  description TEXT,
  priority    INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 旧バージョン（UNIQUE制約なし）で既にテーブルが作られていた場合の保険
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rules_name_key') THEN
    ALTER TABLE rules ADD CONSTRAINT rules_name_key UNIQUE (name);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS rule_conditions (
  id         SERIAL  PRIMARY KEY,
  rule_id    INT     NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  field      TEXT    NOT NULL,               -- 例: 'event_type_code' | 'corporate_type' | 'has_employees' | 'prefecture_code'
  operator   TEXT    NOT NULL DEFAULT 'eq',  -- 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte'
  value      JSONB   NOT NULL,               -- 比較対象値（文字列/数値/真偽値/配列）
  sort_order INT     NOT NULL DEFAULT 0,
  CONSTRAINT chk_rule_conditions_operator
    CHECK (operator IN ('eq','neq','in','not_in','gt','gte','lt','lte'))
);

CREATE TABLE IF NOT EXISTS rule_actions (
  id            SERIAL  PRIMARY KEY,
  rule_id       INT     NOT NULL REFERENCES rules(id) ON DELETE CASCADE,
  action_type   TEXT    NOT NULL,  -- 'add_procedure' | 'show_warning' | 'change_office' | 'change_deadline'
  procedure_id  INT     REFERENCES procedures(id) ON DELETE CASCADE,
  payload       JSONB,             -- action_type別の追加データ（下記コメント参照）
  sort_order    INT     NOT NULL DEFAULT 0,
  CONSTRAINT chk_rule_actions_type
    CHECK (action_type IN ('add_procedure','show_warning','change_office','change_deadline')),
  CONSTRAINT chk_rule_actions_procedure_required
    CHECK (
      (action_type IN ('add_procedure','change_office','change_deadline') AND procedure_id IS NOT NULL)
      OR (action_type = 'show_warning')
    )
);
-- payload の形：
--   add_procedure    : 不要（procedure_id のみで完結）
--   show_warning      : {"message": "表示文言", "severity": "info" | "warning"}
--   change_office     : {"office_type": "organization_types.code の値"}（procedures.office_type の代わりに使う機関種別）
--   change_deadline   : {"days_from_event": 数値}（procedures.timing_data.days_from_event の代わりに使う日数）

CREATE INDEX IF NOT EXISTS idx_rule_conditions_rule ON rule_conditions(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_actions_rule     ON rule_actions(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_actions_procedure ON rule_actions(procedure_id);
CREATE INDEX IF NOT EXISTS idx_rules_priority         ON rules(priority);

DROP TRIGGER IF EXISTS trg_rules_updated_at ON rules;
CREATE TRIGGER trg_rules_updated_at
  BEFORE UPDATE ON rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 2. 初期ルール投入
-- ============================================================
-- migration_event_engine.sql で投入した event_procedures と同じ内容を
-- ルールとして再現する（1手続き＝1ルールが基本、admin画面での個別編集・無効化がしやすいように）。

-- 会社設立：全法人共通で必要な3手続き
INSERT INTO rules (name, description, priority) VALUES
  ('会社設立：法人設立届出書', '会社設立イベントで、全ての法人に法人設立届出書を追加する', 10),
  ('会社設立：青色申告承認申請書', '会社設立イベントで、全ての法人に青色申告承認申請書を追加する', 11),
  ('会社設立：社会保険新規適用届', '会社設立イベントで、全ての法人に社会保険新規適用届を追加する', 12),
  ('会社設立：給与支払事務所等の開設届', '会社設立イベントで、従業員がいる場合のみ給与支払事務所等の開設届を追加する', 13),
  ('会社設立：株式会社設立登記', '会社設立イベントで、株式会社の場合のみ株式会社設立登記を追加する', 14),
  ('会社設立：合同会社設立登記', '会社設立イベントで、合同会社の場合のみ合同会社設立登記を追加する', 15),
  ('従業員採用：労働保険成立届', '従業員採用イベントで、労働保険成立届を追加する', 20),
  ('従業員採用：雇用保険適用事業所設置届', '従業員採用イベントで、雇用保険適用事業所設置届を追加する', 21),
  ('役員変更：役員変更登記', '役員変更イベントで、役員変更登記を追加する', 30),
  ('福岡県：創業支援の案内（デモ）', '福岡県内での会社設立イベント時に、創業支援窓口の案内を表示する', 40)
ON CONFLICT (name) DO NOTHING;

-- このファイルを再実行した場合に条件・実行内容が増殖しないよう、上記10ルール分の
-- 条件・実行内容のみ一旦削除してから作り直す（管理画面から作成された別のルールには影響しない）。
DELETE FROM rule_conditions WHERE rule_id IN (
  SELECT id FROM rules WHERE name IN (
    '会社設立：法人設立届出書', '会社設立：青色申告承認申請書', '会社設立：社会保険新規適用届',
    '会社設立：給与支払事務所等の開設届', '会社設立：株式会社設立登記', '会社設立：合同会社設立登記',
    '従業員採用：労働保険成立届', '従業員採用：雇用保険適用事業所設置届',
    '役員変更：役員変更登記', '福岡県：創業支援の案内（デモ）'
  )
);
DELETE FROM rule_actions WHERE rule_id IN (
  SELECT id FROM rules WHERE name IN (
    '会社設立：法人設立届出書', '会社設立：青色申告承認申請書', '会社設立：社会保険新規適用届',
    '会社設立：給与支払事務所等の開設届', '会社設立：株式会社設立登記', '会社設立：合同会社設立登記',
    '従業員採用：労働保険成立届', '従業員採用：雇用保険適用事業所設置届',
    '役員変更：役員変更登記', '福岡県：創業支援の案内（デモ）'
  )
);

-- 条件・実行内容の投入用ヘルパー（このファイル内でのみ使用し、末尾で削除する）
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

-- 会社設立：法人設立届出書
SELECT _sunboo_add_rule_condition('会社設立：法人設立届出書', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_action('会社設立：法人設立届出書', 'add_procedure', 'CORP_ESTABLISH_TAX', NULL, 1);

-- 会社設立：青色申告承認申請書
SELECT _sunboo_add_rule_condition('会社設立：青色申告承認申請書', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_action('会社設立：青色申告承認申請書', 'add_procedure', 'BLUE_RETURN_APPROVAL', NULL, 1);

-- 会社設立：社会保険新規適用届
SELECT _sunboo_add_rule_condition('会社設立：社会保険新規適用届', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_action('会社設立：社会保険新規適用届', 'add_procedure', 'SOCIAL_INS_NEW', NULL, 1);

-- 会社設立：給与支払事務所等の開設届（従業員あり限定）
SELECT _sunboo_add_rule_condition('会社設立：給与支払事務所等の開設届', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_condition('会社設立：給与支払事務所等の開設届', 'has_employees', 'eq', 'true', 2);
SELECT _sunboo_add_rule_action('会社設立：給与支払事務所等の開設届', 'add_procedure', 'PAYROLL_OFFICE_OPEN', NULL, 1);

-- 会社設立：株式会社設立登記（株式会社限定）
SELECT _sunboo_add_rule_condition('会社設立：株式会社設立登記', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_condition('会社設立：株式会社設立登記', 'corporate_type', 'eq', '"kabushiki"', 2);
SELECT _sunboo_add_rule_action('会社設立：株式会社設立登記', 'add_procedure', 'LEGAL_ESTABLISH_KK', NULL, 1);

-- 会社設立：合同会社設立登記（合同会社限定）
SELECT _sunboo_add_rule_condition('会社設立：合同会社設立登記', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_condition('会社設立：合同会社設立登記', 'corporate_type', 'eq', '"godo"', 2);
SELECT _sunboo_add_rule_action('会社設立：合同会社設立登記', 'add_procedure', 'LEGAL_ESTABLISH_GODO', NULL, 1);

-- 従業員採用：労働保険成立届
SELECT _sunboo_add_rule_condition('従業員採用：労働保険成立届', 'event_type_code', 'eq', '"employee_hired"', 1);
SELECT _sunboo_add_rule_action('従業員採用：労働保険成立届', 'add_procedure', 'LABOR_INS_ESTABLISH', NULL, 1);

-- 従業員採用：雇用保険適用事業所設置届
SELECT _sunboo_add_rule_condition('従業員採用：雇用保険適用事業所設置届', 'event_type_code', 'eq', '"employee_hired"', 1);
SELECT _sunboo_add_rule_action('従業員採用：雇用保険適用事業所設置届', 'add_procedure', 'EMPLOY_INS_OFFICE', NULL, 1);

-- 役員変更：役員変更登記
SELECT _sunboo_add_rule_condition('役員変更：役員変更登記', 'event_type_code', 'eq', '"officer_change"', 1);
SELECT _sunboo_add_rule_action('役員変更：役員変更登記', 'add_procedure', 'LEGAL_OFFICER_CHANGE', NULL, 1);

-- 福岡県：創業支援の案内（show_warning のデモ。地域条件（prefecture_code）の動作確認用）
SELECT _sunboo_add_rule_condition('福岡県：創業支援の案内（デモ）', 'event_type_code', 'eq', '"company_establishment"', 1);
SELECT _sunboo_add_rule_condition('福岡県：創業支援の案内（デモ）', 'prefecture_code', 'eq', '"40"', 2);
SELECT _sunboo_add_rule_action('福岡県：創業支援の案内（デモ）', 'show_warning', NULL,
  '{"message": "福岡県内で会社を設立する場合、よろず支援拠点など無料の創業相談窓口が利用できる場合があります。", "severity": "info"}', 1);

DROP FUNCTION _sunboo_add_rule_condition(TEXT, TEXT, TEXT, JSONB, INT);
DROP FUNCTION _sunboo_add_rule_action(TEXT, TEXT, TEXT, JSONB, INT);

-- ============================================================
-- 3. 権限設定（GRANT + RLS）
-- ============================================================
-- rules / rule_conditions / rule_actions は procedures 等と同じ「参照は誰でも可、
-- 書き込みは管理者のみ」という既存パターンに揃える。

GRANT SELECT ON rules            TO anon;
GRANT SELECT ON rule_conditions  TO anon;
GRANT SELECT ON rule_actions     TO anon;

ALTER TABLE rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rule_actions    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read" ON rules;
DROP POLICY IF EXISTS "public_read" ON rule_conditions;
DROP POLICY IF EXISTS "public_read" ON rule_actions;
CREATE POLICY "public_read" ON rules           FOR SELECT USING (true);
CREATE POLICY "public_read" ON rule_conditions FOR SELECT USING (true);
CREATE POLICY "public_read" ON rule_actions    FOR SELECT USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN

    GRANT INSERT, UPDATE, DELETE ON rules           TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON rule_conditions TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON rule_actions    TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    DECLARE
      t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['rules', 'rule_conditions', 'rule_actions']
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS "admin_insert" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_insert" ON %I FOR INSERT
             WITH CHECK (auth.email() IN (SELECT email FROM admin_users))', t
        );

        EXECUTE format('DROP POLICY IF EXISTS "admin_update" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_update" ON %I FOR UPDATE
             USING (auth.email() IN (SELECT email FROM admin_users))
             WITH CHECK (auth.email() IN (SELECT email FROM admin_users))', t
        );

        EXECUTE format('DROP POLICY IF EXISTS "admin_delete" ON %I', t);
        EXECUTE format(
          'CREATE POLICY "admin_delete" ON %I FOR DELETE
             USING (auth.email() IN (SELECT email FROM admin_users))', t
        );
      END LOOP;
    END;

    RAISE NOTICE 'ルールエンジンの管理者書き込みポリシーを設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、管理者書き込みポリシーの設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 4. 確認クエリ
-- ============================================================

SELECT r.name AS ルール名, r.priority, r.is_active,
  (SELECT COUNT(*) FROM rule_conditions rc WHERE rc.rule_id = r.id) AS 条件数,
  (SELECT COUNT(*) FROM rule_actions ra WHERE ra.rule_id = r.id) AS 実行内容数
FROM rules r
ORDER BY r.priority;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('rules', 'rule_conditions', 'rule_actions');
