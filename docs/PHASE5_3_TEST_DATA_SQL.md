# PHASE5_3_TEST_DATA_SQL.md — Phase5-3 検証用データ作成SQL案

**このSQLはそのまま実行しないでください。** 案として提示するのみで、このセッションでは
実行していません（INSERT/UPDATE/DELETEいずれも未実行）。実行する場合は、[PHASE5_3_MANUAL_BROWSER_VERIFICATION.md](PHASE5_3_MANUAL_BROWSER_VERIFICATION.md)の手順に従い、
**Supabase Dashboard → SQL Editor**（anonキーではRLSにより投入不可、0-8節・0-11節参照）で
実行してください。

対象テーブル: `workspace_companies`・`workspace_company_profiles`（任意）のみ。
`workspace_members`・`workspace_share_links`は作らない（0-9節の通り不要）。

`workspace_id`・`user_id`・`auth_user_id`に相当する実値は本ドキュメントに一切埋め込んでいません
（`workspace_companies`自体がそれらの列を持たないため、埋め込む対象が存在しません）。

---

## 0. 投入前の確認SELECT（必ず先に実行する）

同名の検証用企業が既に存在しないことを確認する。1件でもヒットしたら、下記INSERTを実行する前に
名前の重複要因を確認すること（重複実行によるテストデータの増殖を防ぐ、
`docs/RULE_ENGINE.md`が指摘する過去の事故と同種のリスク）。

```sql
SELECT id, name, prefecture_code, municipality_code, corporate_type, fiscal_month, created_at
FROM workspace_companies
WHERE name IN (
  '[E2E] 札幌提出先検証株式会社',
  '[E2E] 福岡提出先検証株式会社',
  '[E2E] 北九州提出先検証株式会社'
);
-- 期待値: 0行（初回投入前）
```

## 1. INSERT本体（トランザクション案）

3社をまとめて1トランザクションで投入する。`RETURNING`で発行された`id`を必ず控えること
（4節のロールバックSQLで使用する）。

```sql
BEGIN;

INSERT INTO workspace_companies (name, prefecture_code, municipality_code, corporate_type, fiscal_month)
VALUES
  ('[E2E] 札幌提出先検証株式会社',   '01', '011011', 'kabushiki', 3),
  ('[E2E] 福岡提出先検証株式会社',   '40', '401331', 'kabushiki', 3),
  ('[E2E] 北九州提出先検証株式会社', '40', '401013', 'kabushiki', 3)
RETURNING id, name, prefecture_code, municipality_code;

-- ↑ ここで返る id 3件を必ず記録してから COMMIT すること。
-- 内容に誤りがあれば COMMIT せず ROLLBACK; で取り消せる。

COMMIT;
```

**municipality_code / prefecture_codeについて**: [PHASE5_3_MANUAL_BROWSER_VERIFICATION.md](PHASE5_3_MANUAL_BROWSER_VERIFICATION.md)
0-13節で確認した実在の`municipalities.code`（ADR D14準拠、canonical 6桁）をそのまま使用している。
推測・仮の値は使っていない。

## 2. `workspace_company_profiles`（任意・省略可）

**省略してよい。** `workspace_companies`の行だけで`workspaceRowsToCompanyProfile`が
デフォルト値（`employee_count: 0`等）を補うため（[PHASE5_3_MANUAL_BROWSER_VERIFICATION.md](PHASE5_3_MANUAL_BROWSER_VERIFICATION.md) 0-4節）、
対象手続き（`requires_employees=false`）の表示確認だけが目的であれば不要。

より実運用に近い状態で確認したい場合のみ、以下を追加してよい（`{company_id}`は1節の
`RETURNING`で得たIDに置き換えること。プレースホルダーのまま実行しないこと）。

```sql
-- 【プレースホルダー注意】{sapporo_company_id} 等は1節のRETURNINGで得た実際のidに置き換える。
INSERT INTO workspace_company_profiles (company_id, employee_count, stage)
VALUES
  ({sapporo_company_id},   0, 'second_term_or_later'),
  ({fukuoka_company_id},   0, 'second_term_or_later'),
  ({kitakyushu_company_id},0, 'second_term_or_later')
ON CONFLICT (company_id) DO NOTHING;
```

## 3. 投入後の確認SELECT

```sql
SELECT id, name, prefecture_code, municipality_code, corporate_type, fiscal_month
FROM workspace_companies
WHERE name IN (
  '[E2E] 札幌提出先検証株式会社',
  '[E2E] 福岡提出先検証株式会社',
  '[E2E] 北九州提出先検証株式会社'
)
ORDER BY id;
-- 期待値: 3行。ここで表示された id を [PHASE5_3_BROWSER_CHECKLIST.md](PHASE5_3_BROWSER_CHECKLIST.md) に転記する。
```

## 4. ロールバックSQL（検証後、必ず実行する）

`workspace_companies`を削除するだけでよい。`workspace_company_profiles`（2節を実行していた場合）・
`workspace_members`・`workspace_share_links`はいずれも`company_id`に`ON DELETE CASCADE`が
張られているため、自動的に連鎖削除される（新たなMigrationも個別DELETEも不要）。

```sql
BEGIN;

-- 削除前に対象を再確認（名前で確実に検証用データだけを対象にする、本番企業を巻き込まない）
SELECT id, name FROM workspace_companies
WHERE name IN (
  '[E2E] 札幌提出先検証株式会社',
  '[E2E] 福岡提出先検証株式会社',
  '[E2E] 北九州提出先検証株式会社'
);

DELETE FROM workspace_companies
WHERE name IN (
  '[E2E] 札幌提出先検証株式会社',
  '[E2E] 福岡提出先検証株式会社',
  '[E2E] 北九州提出先検証株式会社'
);

COMMIT;
```

**名前で絞り込む理由**: `id`は投入のたびに変わりうる連番のため、うっかり無関係な`id`を
指定して本番企業を削除してしまう事故を避けるため、`name`（`[E2E]`プレフィックス、既存の
本番企業とは明確に区別できる命名、設計原則の通り）で確実に対象を絞り込む。

## 5. 安全性についての補足

- `workspace_companies`は他のどのテーブルからも参照されない起点テーブルであり
  （`workspace_company_profiles`等が`workspace_companies`を参照する側）、**削除しても
  他の企業データに影響しない**
- `municipality_code`/`prefecture_code`にFK制約が無いため、投入時にエラーで気づけない
  （0-13節の通り、投入前に必ず実在するcodeであることを目視確認すること）
- `anon`ロールには本テーブルへの実質的な権限が無いため（RLS・REVOKE ALL、既に確認済み）、
  本SQLはSupabase DashboardのSQL Editor（プロジェクト所有者相当の接続）でのみ実行できる。
  アプリケーションコードにservice roleキーを追加する必要は無い（そのような変更はしない）
- 3節の確認SELECTを都度挟むことで、投入・削除のどちらの操作も「何件・どの行に対して
  行うか」を目視確認してから実行する運用にしている

---

レビュー待ちで停止する。
