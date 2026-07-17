# COMMIT_PLAN.md — Submission Directory RC1 コミット単位分割案

**このドキュメントは提案のみ。`git add`/`git commit`はこのセッションでは一切実行していない。**

現状の変更（`git status`）を、レビューしやすい最小単位に分割する案を示す。各コミットは
単独でもビルド・テストが通る状態を維持することを意図している（依存関係の順序を守れば、
コミット単位でのrevertも可能）。

---

## コミット順序（依存関係を考慮した推奨順）

### 1. Migration: 地理マスタ（Geography Master）

```
supabase/migration_shibuya_code_canonical_format.sql
supabase/migration_designated_cities_geography.sql
```

**理由**: 提出先データMigration（3.）が参照する`municipalities`行を先に用意する必要があるため、
最初にコミットする。渋谷区コード修正（ADR D14）と新規地理マスタ投入は、どちらも「地理マスタの
整備」という同じ関心事のため1コミットにまとめる。

コミットメッセージ案:
```
feat(db): add designated-city geography master and canonicalize Shibuya code

- Add prefectures (47) and municipalities (157 wards, 20 designated cities)
- Fix Shibuya municipality code from 5-digit to 6-digit canonical form (ADR D14)
```

### 2. Migration: 提出先データ（Submission Offices）

```
supabase/migration_national_submission_directory_phase3c2.sql
supabase/migration_national_submission_directory_phase3c3.sql
supabase/migration_national_submission_directory_phase4_sapporo.sql
```

**理由**: 福岡市・北九州市・札幌市の提出先データ投入。1.のMigrationに依存するため、その後に
コミットする。3市をまとめても分けてもよいが、3市とも同一パターン（`office_category`分割、
ADR D13）のため1コミットにまとめる案とする。

コミットメッセージ案:
```
feat(db): add submission office data for Fukuoka, Kitakyushu, and Sapporo cities

Applies ADR D13 (office_category split) to represent department-level
differences between MUNICIPAL_RESIDENT_TAX_RETURN and DEPRECIABLE_ASSET_TAX_RETURN
where they exist. resolve.ts/dataAccess.ts/types.ts unchanged.
```

### 3. Preview Route + Adapter

```
src/lib/submissionDirectoryAdapter/index.ts
src/app/admin/(protected)/submission-directory-preview/page.tsx
```

**理由**: 新Resolver（既存・無変更）を実DBに対して確認できる隔離ルート。2.のデータに依存する。
Adapterと呼び出し元（Preview Route）は1セットの機能のため同一コミット。

コミットメッセージ案:
```
feat(admin): add submission directory preview route (Phase5-1)

Isolated route under /admin/(protected)/, Server Component only.
Does not touch /result, Workspace Roadmap, Share, PDF, or Excel.
```

### 4. Adapterテスト

```
src/lib/submissionDirectoryAdapter/index.test.ts
```

**理由**: 実装（3.）と分けることで、テスト追加そのもののレビューを独立させる
（本リポジトリの他のテストコミットの粒度と合わせる）。まとめても可。

コミットメッセージ案:
```
test: add unit tests for submissionDirectoryAdapter (5 cases)
```

### 5. Workspace Cutover

```
src/lib/submissionDirectoryCutover/decision.ts
src/lib/submissionDirectoryCutover/index.ts
src/lib/workspaceLoader.ts
```

**理由**: Cutoverモジュール本体と、それを呼び出す唯一の統合ポイント
（`workspaceLoader.ts`の変更）は不可分のため同一コミットとする（片方だけコミットすると
未使用importまたは未接続の機能になり、ビルドは通っても意味的に不完全になるため）。

コミットメッセージ案:
```
feat(workspace): wire Phase5-2 cutover into loadWorkspaceRoadmapContext

Only 4 (municipality, procedure) pairs are eligible (Sapporo x2,
Fukuoka x1, Kitakyushu x1). Falls back to legacy resolveOffices result
whenever the new resolver does not return 'resolved'. Rollback: revert
the single overlay call in workspaceLoader.ts.
```

### 6. Cutoverテスト

```
src/lib/submissionDirectoryCutover/index.test.ts
```

コミットメッセージ案:
```
test: add unit tests for submissionDirectoryCutover decision logic (12 cases)
```

### 7. Playwright準備（未実行）

```
.gitignore
playwright/save-admin-storage-state.mjs
playwright/verify-submission-directory-preview.mjs
```

**理由**: `playwright-core`が未インストールのため未実行だが、将来の実行に備えたスクリプトと
`.gitignore`のセキュリティ対応（認証済みセッションを誤ってコミットしない設定）は今のコミットに
含めてよい。`.gitignore`をここに含めるのは、このコミットで追加するファイル（`playwright/.auth/`
配下）を保護する設定だから。

コミットメッセージ案:
```
chore(playwright): add unexecuted browser verification scripts and .auth gitignore

playwright-core is not installed in this environment yet; scripts are
prepared for future use once the dependency and admin credentials are
available. Not part of CI.
```

### 8. Docs: 地理マスタ・自治体コード設計

```
docs/ADR_MUNICIPALITY_CODE_CANONICAL_FORMAT.md
docs/PHASE4_GEOGRAPHY_MASTER_AUDIT.md
docs/PHASE4_GEOGRAPHY_MASTER_PLAN.md
```

### 9. Docs: 都市Discovery・Phase5計画

```
docs/MUNICIPAL_DISCOVERY_CHECKLIST.md
docs/MUNICIPAL_DISCOVERY/
docs/PHASE5_UI_CUTOVER_PLAN.md
docs/PHASE5_3_MANUAL_BROWSER_VERIFICATION.md
docs/PHASE5_3_TEST_DATA_SQL.md
docs/PHASE5_3_BROWSER_CHECKLIST.md
```

### 10. Docs: RC1リリース文書

```
docs/releases/SUBMISSION_DIRECTORY_RC1.md
docs/releases/CHANGELOG_DRAFT.md
docs/releases/COMMIT_PLAN.md
```

**理由**: 8.・9.は設計・調査ドキュメントであり、実装コミット（1〜7）と時系列が前後する部分も
あるためdocsとして独立させる。10.は本RC自体の成果物のため最後にコミットする。

---

## 代替案: より粗い5コミット構成

依頼文の例（Migration/Resolver/Preview/Cutover/Docs）に厳密に合わせたい場合、以下のように
5コミットへ統合することもできる（レビュー粒度は粗くなるが、依頼の例に近い）。

1. **Migration**: 上記1.+2.をまとめる（Geography Master + 提出先データ）
2. **Resolver**: 今回`src/lib/submissionDirectory/`自体への変更は無いため、このコミットは
   **空になる（該当なし）**。依頼の例にある「Resolver」は既存資産（Phase2〜3で実装済み）を指すため
3. **Preview**: 上記3.+4.をまとめる（Adapter + Preview Route + テスト）
4. **Cutover**: 上記5.+6.をまとめる（Cutover本体 + workspaceLoader.ts変更 + テスト）
5. **Docs**: 上記7.〜10.をすべてまとめる（Playwright準備・設計docs・RC1文書一式）

**推奨は10コミット構成（前段）。** Resolver・Migration・UI統合という性質の異なる変更を
まとめすぎると、将来の`git blame`・部分revertが難しくなるため。
