-- ============================================================
-- SUNBOO経営ナビ — 経営イベントエンジン（Phase 2 MVP）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / ON CONFLICT / DROP POLICY IF EXISTS を使用）。
-- 前提：schema.sql, migration_organizations.sql, migration_legal_registry.sql が実行済みであること。
--
-- 設計メモ：
-- procedures.timing_type = 'at_establishment' / 'event_based' の手続きは、
-- timing_data に {"days_from_event": N} が既に用意されているが、従来の診断フロー
-- （/start → /result）には「起算日」が存在しないため next_deadline は常に null だった。
-- 経営イベントエンジンは company_events.event_date という実際の起算日を初めて提供する。
-- event_procedures は「どのイベント種別にどの手続きが該当するか」を紐づけるだけの
-- 中間テーブルとし、期限の日数オフセットは procedures.timing_data を単一の情報源として
-- 再利用する（このテーブルに日数を重複して持たせない）。
-- ============================================================

-- ============================================================
-- 1. スキーマ定義
-- ============================================================

-- 経営イベント種別マスタ
CREATE TABLE IF NOT EXISTS event_types (
  id          SERIAL      PRIMARY KEY,
  code        TEXT        NOT NULL UNIQUE, -- 'company_establishment' | 'employee_hired' | 'officer_change'
  name        TEXT        NOT NULL,        -- '会社設立' 等
  description TEXT,
  sort_order  INT         NOT NULL DEFAULT 0,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- イベント種別ごとに発生する手続き（procedure_organizations と同じ「中間テーブルで既存マスタに紐づける」設計パターン）
CREATE TABLE IF NOT EXISTS event_procedures (
  id            SERIAL  PRIMARY KEY,
  event_type_id INT     NOT NULL REFERENCES event_types(id) ON DELETE CASCADE,
  procedure_id  INT     NOT NULL REFERENCES procedures(id)  ON DELETE CASCADE,
  is_required   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT     NOT NULL DEFAULT 0,
  notes         TEXT,
  UNIQUE (event_type_id, procedure_id)
);

-- 登録された経営イベント（会社アカウントが存在しないため、ブラウザ単位のUUIDで束ねる。
-- 他機能のlocalStorage方式と同じ「認証なし・ブラウザ単位」の信頼モデル）
CREATE TABLE IF NOT EXISTS company_events (
  id              SERIAL      PRIMARY KEY,
  browser_id      UUID        NOT NULL,
  event_type_id   INT         NOT NULL REFERENCES event_types(id),
  event_date      DATE        NOT NULL,
  municipality_id INT         NOT NULL REFERENCES municipalities(id),
  corporate_type  TEXT        NOT NULL, -- 'kabushiki' | 'godo'
  has_employees   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_procedures_event_type ON event_procedures(event_type_id);
CREATE INDEX IF NOT EXISTS idx_event_procedures_procedure   ON event_procedures(procedure_id);
CREATE INDEX IF NOT EXISTS idx_company_events_browser       ON company_events(browser_id);
CREATE INDEX IF NOT EXISTS idx_company_events_municipality  ON company_events(municipality_id);

-- ============================================================
-- 2. イベント種別マスタ投入（MVP: 3種）
-- ============================================================

INSERT INTO event_types (code, name, description, sort_order) VALUES
  ('company_establishment', '会社設立',   '法人を新規に設立した', 1),
  ('employee_hired',        '従業員採用', '従業員を新たに雇用した', 2),
  ('officer_change',        '役員変更',   '役員の就任・退任・重任があった', 3)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 3. イベント別・必要手続きマッピング
-- ============================================================
-- 法人種別（株式会社/合同会社）による絞り込みは procedures.corporate_type が
-- 既に持っているため、event_procedures 側では絞り込まず候補として両方登録する
-- （生成時に既存の診断ロジックと同じ corporate_type フィルタを適用する）。

-- 会社設立
INSERT INTO event_procedures (event_type_id, procedure_id, sort_order)
SELECT et.id, p.id, v.sort_order
FROM event_types et, procedures p,
(VALUES
  ('CORP_ESTABLISH_TAX', 1),
  ('BLUE_RETURN_APPROVAL', 2),
  ('PAYROLL_OFFICE_OPEN', 3),
  ('SOCIAL_INS_NEW', 4),
  ('LEGAL_ESTABLISH_KK', 5),
  ('LEGAL_ESTABLISH_GODO', 6)
) AS v(code, sort_order)
WHERE et.code = 'company_establishment' AND p.code = v.code
ON CONFLICT (event_type_id, procedure_id) DO NOTHING;

-- 従業員採用
INSERT INTO event_procedures (event_type_id, procedure_id, sort_order)
SELECT et.id, p.id, v.sort_order
FROM event_types et, procedures p,
(VALUES
  ('LABOR_INS_ESTABLISH', 1),
  ('EMPLOY_INS_OFFICE', 2)
) AS v(code, sort_order)
WHERE et.code = 'employee_hired' AND p.code = v.code
ON CONFLICT (event_type_id, procedure_id) DO NOTHING;

-- 役員変更
INSERT INTO event_procedures (event_type_id, procedure_id, sort_order)
SELECT et.id, p.id, 1
FROM event_types et, procedures p
WHERE et.code = 'officer_change' AND p.code = 'LEGAL_OFFICER_CHANGE'
ON CONFLICT (event_type_id, procedure_id) DO NOTHING;

-- ============================================================
-- 4. 権限設定（GRANT + RLS）
-- ============================================================
-- 参考: event_types / event_procedures は organization_types と同じ「参照専用マスタ」。
-- company_events はユーザー入力データのため、anon に INSERT と SELECT のみ許可する
-- （UPDATE/DELETEはMVPでは提供しない。個人情報は含まず、所在地区分・法人種別・日付のみ）。

GRANT SELECT ON event_types      TO anon;
GRANT SELECT ON event_procedures TO anon;
GRANT SELECT, INSERT ON company_events TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

ALTER TABLE event_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_procedures ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_events   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read" ON event_types;
DROP POLICY IF EXISTS "public_read" ON event_procedures;
CREATE POLICY "public_read" ON event_types      FOR SELECT USING (true);
CREATE POLICY "public_read" ON event_procedures FOR SELECT USING (true);

DROP POLICY IF EXISTS "anon_insert" ON company_events;
CREATE POLICY "anon_insert" ON company_events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "anon_read" ON company_events;
CREATE POLICY "anon_read" ON company_events FOR SELECT USING (true);

-- 管理画面からの書き込み権限（admin_users 登録者のみ。admin_schema.sql 未実行なら安全にスキップ）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN

    GRANT INSERT, UPDATE, DELETE ON event_types      TO authenticated;
    GRANT INSERT, UPDATE, DELETE ON event_procedures TO authenticated;
    GRANT SELECT ON company_events TO authenticated;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

    DECLARE
      t TEXT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['event_types', 'event_procedures']
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

    DROP POLICY IF EXISTS "admin_read" ON company_events;
    CREATE POLICY "admin_read" ON company_events FOR SELECT
      USING (auth.email() IN (SELECT email FROM admin_users));

    RAISE NOTICE '経営イベントエンジンの管理者書き込みポリシーを設定しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、管理者書き込みポリシーの設定をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 5. 確認クエリ
-- ============================================================

SELECT et.name AS イベント種別, p.name AS 手続き, p.timing_type, p.timing_data
FROM event_procedures ep
JOIN event_types et ON et.id = ep.event_type_id
JOIN procedures p ON p.id = ep.procedure_id
ORDER BY et.sort_order, ep.sort_order;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('event_types', 'event_procedures', 'company_events');
