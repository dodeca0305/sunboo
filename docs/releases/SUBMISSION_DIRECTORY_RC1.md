# Submission Directory RC1

**ステータス: Release Candidate 1（レビュー待ち）。本ドキュメント自体はコード変更を含まない。**

## 概要

全国の提出先（法人市民税・償却資産等の申告窓口）を、市区町村×手続きの組み合わせで自動判定する
「National Submission Directory」基盤のRelease Candidateである。今回追加した内容は以下の通り。

- **Submission Resolver**（`src/lib/submissionDirectory/`）— 会社所在地・手続きから提出先窓口を
  判定する新Resolver本体。Phase2（福岡県パイロット）で実装済み、本RCでは無変更のまま利用
- **Geography Master** — 全国47都道府県＋政令指定都市20市・行政区157件の地理マスタ投入
  （`prefectures`/`municipalities`）
- **Canonical Municipality Code**（ADR D14）— 自治体コードを6桁（本体5桁＋検査数字、JIS X0402）に
  統一する設計決定と、渋谷区の既存データ修正
- **Procedure Submission Rules**（ADR D13）— 同一`office_category`内で手続きごとに提出先が
  分かれるケース（法人市民税と償却資産で担当部署が異なる等）を、Resolverコード無変更のまま
  データのみで表現する設計・実装
- **Preview Route**（`/admin/submission-directory-preview`）— 新Resolverの動作を実DBに対して
  直接確認できる、既存画面から独立した隔離ルート
- **Adapter**（`src/lib/submissionDirectoryAdapter/`）— 新Resolverの戻り値をPreview Route表示用の
  軽量なビュー型へ変換する純粋関数
- **Workspace Cutover**（`src/lib/submissionDirectoryCutover/`）— 対象自治体・対象手続きで
  新Resolverが`resolved`を返した場合にのみ、Workspace Roadmapの表示を新提出先へ切り替える
  条件付き統合ロジック

---

## 対応自治体

| 自治体 | 状態 |
|---|---|
| 札幌市（10区） | 提出先データ投入済み。法人市民税・償却資産の両方が新Resolver対応 |
| 福岡市（7区） | 提出先データ投入済み。法人市民税が新Resolver対応（償却資産は二次情報のみ、要一次確認） |
| 北九州市（7区） | 提出先データ投入済み。法人市民税のみ新Resolver対応（償却資産は担当部署未調査のため`not_supported`） |

### 対応手続き

| procedure code | 手続き名 | 札幌市 | 福岡市 | 北九州市 |
|---|---|---|---|---|
| `MUNICIPAL_RESIDENT_TAX_RETURN` | 法人市民税申告 | ○ resolved | ○ resolved | ○ resolved |
| `DEPRECIABLE_ASSET_TAX_RETURN` | 償却資産申告 | ○ resolved | △ 二次情報のみ・要再確認（Cutover対象外） | ✕ not_supported（Cutover対象外） |

Workspace Roadmapでの切り替え（Cutover）は、上記のうち**resolvedかつCutover対象と定義した組み合わせのみ**
（[docs/PHASE5_UI_CUTOVER_PLAN.md](../PHASE5_UI_CUTOVER_PLAN.md) Part C）: 札幌市×法人市民税・
札幌市×償却資産・福岡市×法人市民税・北九州市×法人市民税の4件。福岡市×償却資産（データ未投入）・
北九州市×償却資産（対象外）は旧Resolverの結果を維持する。

---

## 技術変更

### Migration一覧（いずれも未適用〜段階適用、DDL自体はこのRCでは変更しない）

| ファイル | 内容 |
|---|---|
| `supabase/migration_shibuya_code_canonical_format.sql` | 渋谷区`municipalities.code`を5桁→6桁（ADR D14）へ修正 |
| `supabase/migration_designated_cities_geography.sql` | 全国47都道府県＋政令指定都市20市・行政区157件を投入 |
| `supabase/migration_national_submission_directory_phase3c2.sql` | 福岡市の提出先データ（`municipal_tax`/`municipal_asset_tax`）投入 |
| `supabase/migration_national_submission_directory_phase3c3.sql` | 北九州市の提出先データ（`municipal_tax`のみ）投入 |
| `supabase/migration_national_submission_directory_phase4_sapporo.sql` | 札幌市の提出先データ（`municipal_tax`/`municipal_asset_tax`）投入 |

いずれも`ON CONFLICT`による冪等設計、検証SQL・Rollback SQLを内包する（各ファイル末尾参照）。
**本番Supabaseへの適用状況はファイルごとに異なる**ため、適用前に必ず各ファイルの「検証SQL」節で
現状を確認すること（詳細は「Known Limitations」節）。

### Resolver構造（無変更、参考情報として記載）

```
resolveSubmissionOfficeForCompany()（src/lib/submissionDirectory/index.ts）
  ├─ dataAccess.ts（Supabase問い合わせのみ）
  ├─ resolve.ts（procedure_submission_rules評価 → jurisdiction探索、純粋関数）
  ├─ stateModel.ts（5状態への変換、純粋関数）
  └─ explain.ts（表示用reason・ラベル生成、純粋関数）
```

### Adapter（`src/lib/submissionDirectoryAdapter/`）

`SubmissionOfficeResolution` → Preview Route表示用の`PreviewOfficeView`へ変換する純粋関数
`toPreviewView`のみ。DBアクセス・JSX依存なし。

### Cutover（`src/lib/submissionDirectoryCutover/`）

```
decision.ts（DBアクセスなし、純粋関数）
  ├─ 対象定義（PHASE5_2_CUTOVER_TARGETS、canonical municipality code + procedure id）
  ├─ isPhase5_2Target()
  ├─ shouldUseCutoverResult()（対象判定 AND status==='resolved'）
  └─ mergeOfficeOverlay()（非破壊的な重ね合わせ）

index.ts（DBアクセスあり、Server Component専用）
  ├─ applyCutoverToProcedure()
  └─ applyCutoverToRoadmapYears()
       └─ src/lib/workspaceLoader.ts の loadWorkspaceRoadmapContext から1箇所のみ呼び出される
```

`src/lib/diagnosis.ts`・`src/lib/roadmap.ts`（Engine本体）・`src/lib/submissionDirectory/`
（Resolver本体）はいずれも無変更。

---

## テスト結果

| 対象 | コマンド | 結果 |
|---|---|---|
| Resolver（実DB直接検証、node scriptによる一時検証・非CI） | `resolveSubmissionOfficeForCompany()`を8ケースで直接呼び出し | **8/8 PASS** |
| Adapter | `node --test src/lib/submissionDirectoryAdapter/index.test.ts` | **5/5 PASS** |
| Cutover | `node --test src/lib/submissionDirectoryCutover/index.test.ts` | **12/12 PASS** |
| Build | `npm run build` | **PASS**（TypeScriptエラー0、全ルート生成成功） |
| Browser | — | **未実施**（理由: 下記Known Limitations参照） |

---

## Known Limitations

- **Browser確認未実施**: Workspace Dashboard/Roadmap/PDF/Excelの実ブラウザ確認は行っていない
- **Playwright環境未整備**: `node_modules/playwright-core`が未インストール（`.bin`のみ残存する
  壊れた状態）。加えて管理者ログイン用の認証情報も未取得
- **Workspace検証データ未投入**: `workspace_companies`が0件のため、実ブラウザ確認ができたとしても
  現時点では対象企業が存在しない。投入計画は[docs/PHASE5_3_TEST_DATA_SQL.md](../PHASE5_3_TEST_DATA_SQL.md)
  として用意済みだが未実行
- **`/result`は未切替**: Cutoverは`workspaceLoader.ts`（Workspace専用データ取得層）にのみ接続。
  `(site)/result`・`(site)/roadmap`はPROJECT_CONTEXT.mdの既存方針（互換・検証用、新機能追加停止）
  により意図的に対象外
- **Shareは未切替**: `share/[token]/page.tsx`は`buildAnnualRoadmap`を独自に直接呼んでおり、
  Cutoverが接続されていない（同じパターンで拡張可能だが未実施）
- **地理マスタ・提出先Migrationの本番適用状況が未確定**: 本RC作成時点で、どのMigrationが実際に
  本番Supabaseへ適用済みかはセッションを跨いで確認できていない部分がある。適用前に各Migrationの
  検証SQLで現状確認すること

---

## Rollback

いずれの層も、個別に無効化するだけで前の状態へ戻せる設計にしてある。

- **Workspace Cutoverの無効化**: `src/lib/workspaceLoader.ts`の`loadWorkspaceRoadmapContext`内、
  `const roadmapYears = await applyCutoverToRoadmapYears(...)`の行を
  `const roadmapYears = roadmapYearsBeforeCutover;`に戻すだけで、**旧Resolverのみの挙動へ即座に戻る**
  （新規追加ファイルの削除も、Migrationのロールバックも不要）
- **Migrationのロールバック**: 各Migrationファイル末尾にRollback SQL（DELETE文）を用意済み
- **Preview Routeの無効化**: `src/app/admin/(protected)/submission-directory-preview/`・
  `src/lib/submissionDirectoryAdapter/`を削除するだけで完結（他ファイルから参照されていない）

---

## 次フェーズ（Phase6予定）

- 全国政令指定都市（残り17市）への展開（[docs/MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md)の
  手順に従い1都市ずつ）
- `/result`の切替検討（PROJECT_CONTEXT.mdの位置づけ変更が前提）
- Shareページへの Cutover接続
- Playwrightの正式導入（`playwright-core`のpackage.json追加、CI/CD組み込み）
