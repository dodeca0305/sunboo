-- ============================================================
-- SUNBOO経営ナビ — Workspace単位のアクセス制御（Sprint 33）
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（DROP POLICY IF EXISTS / DROP CONSTRAINT IF EXISTS / ON CONFLICT DO NOTHING /
-- CREATE OR REPLACE を使用）。
-- 前提：migration_workspace_mvp.sql（Sprint22.4）・migration_workspace_documents.sql（Sprint26）・
-- migration_workspace_procedure_statuses_occurrence.sql（Sprint32）が実行済みであること。
--
-- 【背景】これまで全workspace_*テーブルは「admin_users登録者なら誰でも全社にアクセス可」という
-- フラットな権限モデルだった（Sprint22.4のスコープ判断、意図的な先送り）。
-- ARCHITECTURE_REVIEW_SPRINT28.md 5-2節が最重要課題として指摘した通り、これは複数の
-- 税理士事務所スタッフを admin_users に追加した場合に、互いの顧問先の機微データへ無制限に
-- アクセスできてしまう状態だった。本migrationは既存のworkspace_members（Sprint22.4で
-- テーブルのみ作成・一度もアプリコードから参照されていなかった）を実際の認可判定に使う。
--
-- 【権限モデル】admin_users membership は従来通り「/adminへのログイン可否」の大枠のゲートとして
-- 維持し、workspace_membersのroleで「どの会社に、何ができるか」を判定する（2層構造）。
--   owner  : Workspace設定変更・メンバー管理・編集・閲覧
--   member : 編集・閲覧
--   viewer : 閲覧のみ
-- 旧role値（'admin'/'staff'、Sprint22.4で定義されたが一度も使われていない）は本Sprintで
-- 'owner'/'member'/'viewer'の3値に置き換える（workspace_membersは実データ0件のため
-- 実質的な破壊的変更ではない。念のため既存行がある場合に備え、置き換え前に
-- 'admin'→'owner'・'staff'→'member'のUPDATEを一度通してから制約を切り替える）。
--
-- 【既存データを壊さない工夫】workspace_companiesは既にSprint22〜32のテストで複数行存在する。
-- 新しいRLSをそのまま有効化すると、workspace_membersに行が無い既存会社は「誰からも見えない」
-- 状態になってしまう。これを防ぐため、既存の全workspace_companies × 全admin_usersの組に対して
-- role='owner'のworkspace_members行を先に補完する（＝現状「誰でも全社アクセス可」だった状態を
-- そのままworkspace_membersに明示的に書き出すだけで、既存admin_usersの利用者からはアクセス権が
-- 一切変わらない）。今後新しく admin_users に追加される人は、明示的にworkspace_membersへ
-- 追加されない限り既存の会社にはアクセスできなくなる（＝これが今回の制限強化の実体）。
--
-- 【Shareとの独立性】get_shared_workspace_view（経営者向け公開共有RPC）はSECURITY DEFINERで
-- RLSを内部的にバイパスしており、本migrationでは一切変更しない（要件5「共有ページは従来通り
-- workspace_membersとは独立」）。
-- ============================================================

-- ============================================================
-- 1. workspace_members.role を owner/member/viewer の3値へ
-- ============================================================

-- 既存行があった場合に備えた安全な値変換（実データ0件を確認済みだが、
-- 「検証なしの断定をしない」ため念のため実施する）。
UPDATE workspace_members SET role = 'owner'  WHERE role = 'admin';
UPDATE workspace_members SET role = 'member' WHERE role = 'staff';

ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_role_check;
ALTER TABLE workspace_members
  ADD CONSTRAINT workspace_members_role_check CHECK (role IN ('owner', 'member', 'viewer'));

-- ============================================================
-- 2. 既存workspace_companiesへのowner補完（既存アクセス権を壊さないための必須ステップ）
-- ============================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_users') THEN
    INSERT INTO workspace_members (company_id, email, role)
    SELECT c.id, a.email, 'owner'
    FROM workspace_companies c
    CROSS JOIN admin_users a
    ON CONFLICT (company_id, email) DO NOTHING;

    RAISE NOTICE '既存の全会社 × 全admin_usersにownerとしてworkspace_membersを補完しました。';
  ELSE
    RAISE NOTICE 'admin_users テーブルが存在しないため、補完をスキップしました。';
  END IF;
END $$;

-- ============================================================
-- 3. 認可判定ヘルパー関数
-- ============================================================
-- 各テーブルのRLSポリシーから共通で呼ぶ。SECURITY DEFINERにすることで、
-- workspace_members自体のRLS（後述）に関わらず判定できるようにする
-- （get_shared_workspace_viewと同じ考え方、既存パターンの踏襲）。
--
-- 【レビュー指摘1: search_path固定】SECURITY DEFINER関数は呼び出し側のsearch_pathを
-- 引き継いでしまうと、同名の関数・テーブルを別スキーマに仕込まれて意図しない対象を
-- 参照させられるリスクがある（Postgres/Supabaseの既知の注意点）。`SET search_path = public`を
-- 明示し、常にpublicスキーマのworkspace_membersを参照することを固定する
-- （get_shared_workspace_viewと同じ対策を踏襲）。
--
-- 【レビュー指摘2: ポリシーの無限再帰】workspace_membersのRLSポリシー自身がこの関数を呼ぶ
-- （6節）。関数の内部SELECTがworkspace_membersに対するRLS評価を再度誘発すると
-- 循環しうるが、本関数はSECURITY DEFINERのため、関数所有者（Supabase SQL Editorで実行した
-- postgresロール、BYPASSRLS権限を持つ）の権限で実行され、内部SELECTはRLSを一切経由しない
-- （テーブルを直接読む）。したがって「ポリシー評価がポリシー評価を呼ぶ」循環は構造的に発生しない
-- （SECURITY DEFINERを使う最大の理由がこれであり、単なる重複防止のためではない）。

CREATE OR REPLACE FUNCTION is_workspace_member(p_company_id INTEGER, p_roles TEXT[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members m
    WHERE m.company_id = p_company_id
      AND m.email = auth.email()
      AND (p_roles IS NULL OR m.role = ANY(p_roles))
  );
$$;

GRANT EXECUTE ON FUNCTION is_workspace_member(INTEGER, TEXT[]) TO authenticated;

-- 【実機検証で発見した不具合の修正・その2】workspace_membersのINSERTポリシー（6節）は
-- 「その会社にまだ誰もメンバーがいない」ことを判定するため、当初
-- `NOT EXISTS (SELECT 1 FROM workspace_members m2 WHERE m2.company_id = ...)` を
-- ポリシー本文に直接書いていた。これはworkspace_membersに対するポリシーの中で
-- workspace_members自身を生のサブクエリで参照する形になり、Postgresが
-- 「infinite recursion detected in policy for relation "workspace_members"」を検出して
-- 拒否した（is_workspace_memberと違いSECURITY DEFINER関数を経由していなかったため、
-- RLSがそのサブクエリにも適用され、自己参照が解決不能になっていた）。
-- is_workspace_memberと同じ理由でSECURITY DEFINER関数化し、生の自己参照を無くす。

CREATE OR REPLACE FUNCTION workspace_has_any_member(p_company_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM workspace_members m WHERE m.company_id = p_company_id);
$$;

GRANT EXECUTE ON FUNCTION workspace_has_any_member(INTEGER) TO authenticated;

-- ============================================================
-- 4. workspace_company_profiles / workspace_procedure_statuses /
--    workspace_documents / workspace_share_links のRLSを会社単位に絞る
-- ============================================================
-- 4テーブルとも「company_id列を持ち、admin_all（全社アクセス可）だった」という同じ形なので
-- ループで一括置換する。SELECTは所属していれば（roleを問わず）許可、
-- INSERT/UPDATE/DELETEはowner/memberのみ許可する（viewerは書き込み不可）。

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'workspace_company_profiles', 'workspace_procedure_statuses',
    'workspace_documents', 'workspace_share_links'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "admin_all" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "member_select" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "member_insert" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "member_update" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "member_delete" ON %I', t);

    EXECUTE format(
      'CREATE POLICY "member_select" ON %I FOR SELECT
         USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id))', t
    );
    EXECUTE format(
      'CREATE POLICY "member_insert" ON %I FOR INSERT
         WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY[''owner'',''member'']))', t
    );
    EXECUTE format(
      'CREATE POLICY "member_update" ON %I FOR UPDATE
         USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY[''owner'',''member'']))
         WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY[''owner'',''member'']))', t
    );
    EXECUTE format(
      'CREATE POLICY "member_delete" ON %I FOR DELETE
         USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY[''owner'',''member'']))', t
    );
  END LOOP;

  RAISE NOTICE 'workspace_company_profiles / workspace_procedure_statuses / workspace_documents / workspace_share_links のRLSをWorkspace単位に更新しました。';
END $$;

-- ============================================================
-- 5. workspace_companies のRLS（作成はadmin_users全員に許可、以降はメンバーのみ）
-- ============================================================
-- 新規会社の作成時点ではworkspace_membersにまだ行が無い（作成者自身がこれから
-- ownerとして登録される）ため、INSERTだけはadmin_users membershipのみを条件にする。
-- SELECT/UPDATEはworkspace_membersに登録済みの会社のみ許可する。DELETEはowner限定
-- （会社ごと削除する破壊的操作のため、memberには許可しない）。
--
-- 【レビュー指摘3: 会社作成の補償処理】WorkspaceCompanyForm.tsxはworkspace_companies作成→
-- workspace_members登録の2操作をMVPとして順に行う（DBトランザクションで一括にはしていない）。
-- 後者が失敗すると、誰もアクセスできない「孤立した会社」が残ってしまう。これを防ぐため、
-- DELETEポリシーに「その会社にまだ1人もメンバーがいない場合は、admin_users登録者なら
-- 誰でも削除してよい」という特例を追加する（workspace_membersのINSERTポリシーの
-- bootstrap特例と対になる設計）。アプリ側（WorkspaceCompanyForm.tsx）はメンバー登録に
-- 失敗した場合、この特例を使って直前に作った会社を削除する補償処理を行う。
--
-- 【実機検証で発見した不具合の修正】Supabase-jsの`.insert().select()`はINSERT...RETURNINGとして
-- 実行され、RETURNINGされる行はSELECTポリシーの対象になる。member_selectがis_workspace_member
-- のみを条件にしていると、作成直後（まだworkspace_membersに行が無い）の会社はRETURNINGで
-- 一切返せず、会社作成そのものがRLS違反として失敗してしまうことが分かった。DELETEポリシーと
-- 対称に、SELECTにも「メンバーが1人もいない会社はadmin_users登録者なら閲覧できる」という
-- bootstrap特例を追加する（該当会社はまだ税務・労務データを持たない作成直後の状態のみが対象で、
-- 実害はない）。

DROP POLICY IF EXISTS "admin_all" ON workspace_companies;
DROP POLICY IF EXISTS "member_select" ON workspace_companies;
DROP POLICY IF EXISTS "member_insert" ON workspace_companies;
DROP POLICY IF EXISTS "admin_insert" ON workspace_companies;
DROP POLICY IF EXISTS "member_update" ON workspace_companies;
DROP POLICY IF EXISTS "member_delete" ON workspace_companies;

CREATE POLICY "member_select" ON workspace_companies FOR SELECT
  USING (
    auth.email() IN (SELECT email FROM admin_users)
    AND (
      is_workspace_member(id)
      OR NOT workspace_has_any_member(id)
    )
  );

CREATE POLICY "admin_insert" ON workspace_companies FOR INSERT
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users));

CREATE POLICY "member_update" ON workspace_companies FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(id, ARRAY['owner', 'member']))
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(id, ARRAY['owner', 'member']));

CREATE POLICY "member_delete" ON workspace_companies FOR DELETE
  USING (
    auth.email() IN (SELECT email FROM admin_users)
    AND (
      is_workspace_member(id, ARRAY['owner'])
      OR NOT workspace_has_any_member(id)
    )
  );

-- ============================================================
-- 6. workspace_members 自身のRLS
-- ============================================================
-- SELECT: そのWorkspaceのメンバー（role問わず）は他のメンバー一覧を見られる。
--         self_read（自分の行のみ、Sprint22.4で追加済み）は将来のログイン付き経営者アカウント
--         向けに残す（本Sprintでは未使用のまま）。
-- INSERT: 「そのWorkspaceにまだ誰もいない」（新規会社作成直後の最初のowner登録）か、
--         「既にownerとして登録済み」のいずれかの場合のみ許可する（chicken-and-egg対策）。
-- UPDATE/DELETE: 既存ownerのみ許可する（メンバー管理はownerの権限、要件2）。

DROP POLICY IF EXISTS "admin_all" ON workspace_members;
DROP POLICY IF EXISTS "member_select" ON workspace_members;
DROP POLICY IF EXISTS "member_insert" ON workspace_members;
DROP POLICY IF EXISTS "member_update" ON workspace_members;
DROP POLICY IF EXISTS "member_delete" ON workspace_members;
-- self_read は既存のまま維持する（DROPしない）。

CREATE POLICY "member_select" ON workspace_members FOR SELECT
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id));

CREATE POLICY "member_insert" ON workspace_members FOR INSERT
  WITH CHECK (
    auth.email() IN (SELECT email FROM admin_users)
    AND (
      NOT workspace_has_any_member(company_id)
      OR is_workspace_member(company_id, ARRAY['owner'])
    )
  );

CREATE POLICY "member_update" ON workspace_members FOR UPDATE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner']))
  WITH CHECK (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner']));

CREATE POLICY "member_delete" ON workspace_members FOR DELETE
  USING (auth.email() IN (SELECT email FROM admin_users) AND is_workspace_member(company_id, ARRAY['owner']));

-- ============================================================
-- 確認（レビュー指摘4: migration前後の件数確認）
-- ============================================================
-- 【実行前に必ず以下を別途実行し、結果を控えておくこと】
--   SELECT COUNT(*) FROM workspace_companies;
--   SELECT COUNT(*) FROM admin_users;
--   SELECT COUNT(*) FROM workspace_members;   -- 実行前は0件のはず（未使用のため）
-- 実行後、以下の3クエリの結果を実行前の値と突き合わせる。
--   - workspace_companies件数は実行前後で変化しないこと（本migrationはcompaniesを
--     一切INSERT/DELETEしない）
--   - workspace_members件数は「実行前の workspace_companies件数 × admin_users件数」に
--     一致すること（2節の全社×全admin_users補完が漏れなく行われたことの検算）

SELECT COUNT(*) AS workspace_companies_count FROM workspace_companies;
SELECT COUNT(*) AS admin_users_count FROM admin_users;
SELECT COUNT(*) AS workspace_members_count FROM workspace_members;

-- 【最重要】ownerが1人もいない会社が無いことの確認。0行が返ることを必ず確認する。
-- 1行でも返った場合、その会社は今後誰もアクセスできなくなるため、migrationを先に進めず
-- 個別に workspace_members へ owner 行を追加すること。
SELECT c.id, c.name
FROM workspace_companies c
WHERE NOT EXISTS (
  SELECT 1 FROM workspace_members m WHERE m.company_id = c.id AND m.role = 'owner'
);

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'workspace_companies', 'workspace_company_profiles', 'workspace_members',
    'workspace_procedure_statuses', 'workspace_documents', 'workspace_share_links'
  )
ORDER BY tablename, cmd;

SELECT company_id, email, role FROM workspace_members ORDER BY company_id, role;
