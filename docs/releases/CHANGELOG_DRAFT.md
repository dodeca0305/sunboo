# CHANGELOG (Draft) — Submission Directory RC1

**ステータス: ドラフト。正式な`CHANGELOG.md`への統合は別途判断する。**

## Added

- 地理マスタMigration（`supabase/migration_designated_cities_geography.sql`）: 全国47都道府県・
  政令指定都市20市・行政区157件
- 渋谷区コード修正Migration（`supabase/migration_shibuya_code_canonical_format.sql`）: 自治体コード
  6桁統一（ADR D14）
- 福岡市提出先Migration（`supabase/migration_national_submission_directory_phase3c2.sql`）
- 北九州市提出先Migration（`supabase/migration_national_submission_directory_phase3c3.sql`）
- 札幌市提出先Migration（`supabase/migration_national_submission_directory_phase4_sapporo.sql`）
- Submission Directory Preview Route（`src/app/admin/(protected)/submission-directory-preview/`）:
  固定4ケースで新Resolverの結果を直接確認できる隔離ルート
- Submission Directory Adapter（`src/lib/submissionDirectoryAdapter/`）: Preview Route表示用の
  変換関数`toPreviewView`
- Submission Directory Cutover（`src/lib/submissionDirectoryCutover/`）: 新旧Resolver切り替えの
  判定・重ね合わせロジック（`decision.ts`）およびオーケストレーション（`index.ts`）
- Playwright準備スクリプト（`playwright/save-admin-storage-state.mjs`・
  `playwright/verify-submission-directory-preview.mjs`）: 未実行、`playwright-core`未インストールのため

## Changed

- `src/lib/workspaceLoader.ts`: `loadWorkspaceRoadmapContext`に、Phase5-2対象の手続きのみ
  新Resolverの結果で上書きする1箇所のオーバーレイ呼び出しを追加（既存の`buildAnnualRoadmap`・
  `diagnosis.ts`・`roadmap.ts`は無変更）
- `.gitignore`: `playwright/.auth/`・`test-results/`を追加（認証済みセッション・テスト成果物を
  誤ってコミットしないため）

## Tests

- `src/lib/submissionDirectoryAdapter/index.test.ts`（新規、5件、`node:test`）
- `src/lib/submissionDirectoryCutover/index.test.ts`（新規、12件、`node:test`）
- Resolver（`resolveSubmissionOfficeForCompany`）の実DB直接検証: 8ケース（一時スクリプト、
  リポジトリには残していない。実行ログは会話履歴上のみ）

## Docs

- `docs/ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md`（D13、既存コミット済み）
- `docs/ADR_MUNICIPALITY_CODE_CANONICAL_FORMAT.md`（D14）
- `docs/MUNICIPAL_DISCOVERY_CHECKLIST.md`
- `docs/MUNICIPAL_DISCOVERY/sapporo.md`
- `docs/PHASE4_GEOGRAPHY_MASTER_AUDIT.md`
- `docs/PHASE4_GEOGRAPHY_MASTER_PLAN.md`
- `docs/PHASE5_UI_CUTOVER_PLAN.md`
- `docs/PHASE5_3_MANUAL_BROWSER_VERIFICATION.md`
- `docs/PHASE5_3_TEST_DATA_SQL.md`
- `docs/PHASE5_3_BROWSER_CHECKLIST.md`
- `docs/releases/SUBMISSION_DIRECTORY_RC1.md`（本リリースのRelease Notes）
- `docs/releases/CHANGELOG_DRAFT.md`（本ファイル）
- `docs/releases/COMMIT_PLAN.md`（コミット単位分割案）

## 明示的に含まないもの（Not Changed）

- `src/lib/submissionDirectory/`（Resolver本体）: 無変更
- `src/lib/diagnosis.ts`・`src/lib/roadmap.ts`（Engine本体）: 無変更
- `package.json`・`package-lock.json`: 無変更（前回のRepository Health Checkで解消済みの
  vitest混入を含め、意図しない変更は無い状態を維持）
- `/result`・`/roadmap`（(site)側）・`/share/[token]`: 無変更（Cutover未接続）
