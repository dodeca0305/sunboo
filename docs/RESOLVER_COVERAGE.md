# RESOLVER_COVERAGE.md — Submission Directory Resolver Coverage Audit（Phase5-4）

**作成日**: 2026-07-17
**目的**: 「新Resolverにデータがあるか」と「実際に画面へ反映されているか（Cutover対象か）」を分離して棚卸しする。RC1完了時点でこの2つを混同しないための基礎資料。
**調査方法**: `supabase/*.sql`（Migrationファイルの実際のINSERT文）と`src/lib/submissionDirectory*`のソースコードを直接読み、DBへは接続していない（anon keyのみ・service role keyなし）。したがって本書の「投入済み」はMigrationファイルの内容に基づく主張であり、実DBへの反映状況（Supabase Dashboardで実行済みか）は別途確認が必要（[PHASE5_3_MANUAL_BROWSER_VERIFICATION.md](PHASE5_3_MANUAL_BROWSER_VERIFICATION.md)参照）。

---

## 0. 前提: 3つのレイヤーを区別する

このコードベースには、提出先解決の仕組みが3層ある。**この3層を混同すると「対応済み」の意味が食い違う。**

| レイヤー | 実体 | 呼び出し元 |
|---|---|---|
| ① 新Resolver（データ層） | `submission_offices` / `office_sources` / `submission_jurisdictions` / `procedure_submission_rules`（4テーブル） | `src/lib/submissionDirectory/resolveSubmissionOfficeForCompany()` |
| ② Cutover（配線層） | `isPhase5_2Target` / `shouldUseCutoverResult` / `applyCutoverToRoadmapYears` | `src/lib/workspaceLoader.ts`（Workspace Dashboard/Roadmap/PDF/Excelへ供給） |
| ③ 旧Resolver | `jurisdictions` / `organization_offices` / `organizations`（旧3テーブル） | `src/lib/diagnosis.ts: resolveOffices()`（`/result`・経営イベントエンジン・Cutover対象外の全Workspace手続き） |

①にデータがあっても②で配線されていなければ、ユーザーが実際に見る画面（Workspace Roadmap・`/result`・共有ページ・PDF/Excel）には一切反映されない。**現時点で②は①のごく一部（1カテゴリ×3都市×2手続き）に過ぎない。**

---

## 1. 新Resolver対象（① データが投入済みの範囲）

`office_category`（`organization_types.code`）ごとに、Migrationで投入されたデータの地理的範囲。

| office_category | 名称 | 地理的範囲 | 件数 | 投入Migration |
|---|---|---|---|---|
| `tax_office` | 税務署 | 福岡県72市区町村（旧データを移植） | 18署 | `migration_national_submission_directory.sql`（福岡税務署のみ） → `migration_national_submission_directory_phase3a.sql`（全72市区町村分に拡張） |
| `legal_affairs_bureau` | 法務局 | 福岡県72市区町村 | 2庁（本局・北九州支局に集約） | 同上（Phase3A） |
| `pension_office` | 年金事務所 | 福岡県72市区町村 | 11所（一部分割管轄を構造化） | 同上（Phase3A） |
| `labor_standards` | 労働基準監督署 | 福岡県72市区町村 | 12署 | 同上（Phase3A） |
| `hello_work` | ハローワーク | 福岡県72市区町村 | 17所 | 同上（Phase3A） |
| `prefectural_tax` | 都道府県税事務所 | 福岡県72市区町村 | 12県税事務所 | `migration_national_submission_directory_phase3c1.sql` |
| `municipal_tax` | 市区町村税務課（市民税） | 札幌市10区・福岡市7区・北九州市7区（計24市区町村） | 3窓口 | `phase3c2.sql`（福岡市）・`phase3c3.sql`（北九州市）・`phase4_sapporo.sql`（札幌市） |
| `municipal_asset_tax` | 市区町村資産課税課（償却資産） | 札幌市10区・福岡市7区（計17市区町村、**北九州市は対象外**） | 2窓口 | `phase3c2.sql`（福岡市）・`phase4_sapporo.sql`（札幌市）。北九州市分は「資産税担当データ未投入」（`decision.ts`コメントより） |
| `municipal_office` / `prefectural_office` / `health_center` / `fire_department` / `chamber_of_commerce` / `other` | — | **0件（未投入）** | — | — |

**新Resolverの地理的範囲は実質「福岡県72市区町村」＋「札幌市・北九州市の市民税/資産税2カテゴリのみ」に限定される。** 東京都渋谷区・その他46都道府県は新Resolver側に一切データが無い（旧Resolver側のみ、後述）。

`procedure_submission_rules`（従業員住所依存の上書き）は以下3件のみ:

| procedure | office_category | recipient_scope | 条件 |
|---|---|---|---|
| `SALARY_PAYMENT_REPORT`（給与支払報告書） | `municipal_tax` | `each_employee` | 無条件 |
| `RESIDENT_TAX_WITHHOLDING`（住民税特別徴収） | `municipal_tax` | `each_employee` | 無条件 |
| `DEPRECIABLE_ASSET_TAX_RETURN`（償却資産申告） | `municipal_asset_tax` | `company` | 無条件（全国一律で振り分けのみ。窓口データは上表の17市区町村のみ） |

---

## 2. Cutover対象（② 実際にWorkspace画面へ反映される範囲）

`src/lib/submissionDirectoryCutover/decision.ts`の`PHASE5_2_CUTOVER_TARGETS`が唯一の定義。**新Resolverにデータがあっても、ここに列挙されていない限りUIには一切反映されない。**

| 都市 | municipality_code | procedure | 状態 |
|---|---|---|---|
| 札幌市（10区） | `011011`〜`011100` | 65 `MUNICIPAL_RESIDENT_TAX_RETURN` | Cutover対象・`resolved`確認済み（Resolver直接検証8/8 PASS） |
| 札幌市（10区） | 同上 | 66 `DEPRECIABLE_ASSET_TAX_RETURN` | Cutover対象・`resolved`確認済み |
| 福岡市（7区） | `401315`〜`401374` | 65 | Cutover対象・`resolved`確認済み |
| 北九州市（7区） | `401013`〜`401099` | 65 | Cutover対象・`resolved`確認済み |
| 北九州市（7区） | 同上 | 66 | **対象外**（`PHASE5_2_CUTOVER_TARGETS`に含まれない。新Resolverを呼び出しすらしない） |

さらに`shouldUseCutoverResult`は「対象」かつ「新Resolverの判定結果が`resolved`」の場合のみ新結果を採用する（AND条件）。`multiple_candidates`/`not_supported`等は対象都市であっても旧結果を維持する。

**Cutoverの対象範囲は「1カテゴリ相当（municipal_tax/municipal_asset_tax）×3都市×最大2手続き」に限定される。** 上記1節の`tax_office`・`legal_affairs_bureau`・`pension_office`・`labor_standards`・`hello_work`・`prefectural_tax`（福岡県72市区町村分）は、新Resolverにデータが存在するにもかかわらず**Cutoverに一切配線されていない**（`src/app/admin/(protected)/submission-directory-preview/page.tsx`という管理画面限定のPreview Routeからのみ到達可能で、`/result`・Workspace・共有ページ・PDF/Excelのいずれからも参照されない）。

---

## 3. 旧Resolver対象（③ `jurisdictions`テーブルの実データ範囲）

`src/lib/diagnosis.ts: resolveOffices()`が読む旧スキーマ（`jurisdictions` / `organization_offices` / `organizations`）の実データ範囲。Cutover対象外の全ての手続き・全ての地域は、この旧Resolverの結果がそのまま画面に出る。

| 地域 | office_category | 件数 |
|---|---|---|
| 東京都渋谷区（`13113`／canonical化後`131130`） | `tax_office` / `prefectural_tax` / `municipal_tax` / `pension_office` / `labor_standards` / `hello_work` / `legal_affairs_bureau`（7カテゴリ全て） | 各1窓口（`migration_organizations.sql`） |
| 福岡県72市区町村 | `tax_office` / `legal_affairs_bureau` / `pension_office` / `labor_standards` / `hello_work`（5カテゴリ） | 上表1節と同一実体（Phase3Aが旧データをそのまま新スキーマへ移植したため、旧・新で内容は同一） |
| 福岡県72市区町村 | `prefectural_tax` / `municipal_tax` | **0件（旧スキーマには一度も投入されていない）** |
| 上記以外の全国（渋谷区・福岡県を除く45都道府県） | 全カテゴリ | **0件** |

**重要な確認ポイント（引き継ぎ資料より）**: 旧`jurisdictions`の`municipal_tax`データは渋谷区の1件のみ。したがって札幌市・福岡市・北九州市で法人市民税/償却資産の提出先が画面に表示された場合、それは新Resolver（Cutover）経由であると断定できる（旧経路からは物理的に出てこない）。

---

## 4. `not_supported` / `requires_employee_address`の扱い

- `not_supported`: 新Resolver内部の状態（`ResolutionStatus`の1つ）。**Workspace Roadmap画面（`ScheduleProcedure.office`）には現れない設計。** Cutoverは`resolved`のときのみ上書きするため、`not_supported`だった場合は単に旧結果（多くの場合`office: null`）がそのまま表示され続ける。この文言自体が到達できるのはPreview Route（管理画面限定）のみ。
- `requires_employee_address`: `SALARY_PAYMENT_REPORT`・`RESIDENT_TAX_WITHHOLDING`が該当。これら2手続きはPhase5-2の`PHASE5_2_CUTOVER_TARGETS`（procedure 65・66）に含まれないため、**Cutoverの範囲外＝現状は旧Resolverの結果がそのまま表示され続ける**（旧Resolverはそもそも「従業員住所ごと」という概念を持たないため、会社所在地の窓口が誤って断定表示される可能性が既存のまま残っている。新Resolver側は対応済みだが未配線）。

---

## 5. まとめ表（一覧性重視）

| 観点 | 範囲 |
|---|---|
| 新Resolverにデータがある地理範囲 | 福岡県72市区町村（7カテゴリ中5〜7） + 札幌市/福岡市/北九州市（municipal_tax/municipal_asset_tax） |
| Cutoverで実際にUIへ反映される範囲 | 札幌市10区・福岡市7区・北九州市7区 × 法人市民税/償却資産（北九州市は法人市民税のみ）＝**最大2手続き** |
| 旧Resolverしか使えない地理範囲 | 渋谷区以外の全国46都道府県（福岡県の5カテゴリを除く）、および福岡県内でもprefectural_tax・municipal_tax |
| 旧Resolverすら0件の範囲 | 渋谷区・福岡県以外の全ての都道府県・全カテゴリ |
