# MIGRATION_INVENTORY.md — Migration一覧・分類（Phase5-4）

**作成日**: 2026-07-17
**目的**: `supabase/`直下の全SQLファイルを「Geography（地理マスタ）」「Office（窓口・提出先データ）」「Rule（ルールエンジン／procedure_submission_rules）」「その他」に分類する。分類は各ファイル冒頭のコメント・実際のINSERT/CREATE対象テーブルを確認した上で判定している（ファイル名からの推測のみに頼っていない）。
**件数**: 34ファイル（`supabase/`直下の`.sql`全件）

---

## 1. Geography（地理マスタ: `prefectures` / `municipalities`）

| ファイル | 内容 |
|---|---|
| `migration_designated_cities_geography.sql` | 全国47都道府県 + 政令指定都市20市・行政区157件を投入（Phase4）。北九州市・福岡市の既存14区は対象外（重複回避） |
| `migration_shibuya_code_canonical_format.sql` | 渋谷区の`municipality_code`を5桁→6桁canonical形式（ADR D14）へ修正 |
| `migration_organizations.sql`（一部） | 福岡県72市区町村（北九州市7区・福岡市7区を含む）の`prefectures`/`municipalities`投入（本体はOffice分類、地理マスタ投入は第3節のみ） |
| `seed.sql` / `reset_and_seed.sql`（一部） | 東京都渋谷区の地理マスタ・初期データ（MVP時点） |

## 2. Office（窓口・提出先データ: 新旧いずれかの窓口4テーブル群）

### 新Resolver（`submission_offices` / `office_sources` / `submission_jurisdictions`）

| ファイル | 内容 |
|---|---|
| `migration_national_submission_directory.sql` | 新4テーブルのスキーマ定義（GRANT/RLS込み）＋福岡市中央区・東区の最小パイロットデータ（Phase2） |
| `migration_national_submission_directory_phase3a.sql` | 旧スキーマの5カテゴリ（tax_office等）データを福岡県72市区町村分そのまま新スキーマへ移植 |
| `migration_national_submission_directory_phase3c1.sql` | `prefectural_tax`（福岡県12県税事務所・72判定単位）の新規データ投入＋`municipal_asset_tax`カテゴリ新設（スキーマ拡張はRuleにも一部該当） |
| `migration_national_submission_directory_phase3c2.sql` | 福岡市`municipal_tax`/`municipal_asset_tax`（2窓口・7区分） |
| `migration_national_submission_directory_phase3c3.sql` | 北九州市`municipal_tax`（1窓口・7区分。`municipal_asset_tax`は投入なし） |
| `migration_national_submission_directory_phase4_sapporo.sql` | 札幌市`municipal_tax`/`municipal_asset_tax`（2窓口・10区分） |

### 旧スキーマ（`organizations` / `organization_offices` / `jurisdictions`）

| ファイル | 内容 |
|---|---|
| `migration_organizations.sql` | 旧4テーブルのスキーマ定義＋渋谷区7機関＋福岡県72市区町村5カテゴリ（法務局2・税務署18・年金11・労基12・ハローワーク17）の実データ投入 |
| `migration_organizations_permissions.sql` | 旧スキーマのGRANT/RLS設定（後追い） |
| `migration_link_status.sql` | `organization_offices`等へ`official_url_status`等のリンク切れ対策カラム追加 |

## 3. Rule（ルールエンジン: `rules`/`rule_conditions`/`rule_actions` および `procedure_submission_rules`）

| ファイル | 内容 |
|---|---|
| `migration_rule_engine.sql` | 経営イベントエンジン用ルールエンジン本体（`rules`/`rule_conditions`/`rule_actions`）のスキーマ・シードデータ |
| `fix_duplicate_rules.sql` | `rules.name`にUNIQUE制約が無かったことによる重複ルールの復旧（[docs/RULE_ENGINE.md](RULE_ENGINE.md)記載の事故対応） |
| `migration_national_submission_directory.sql`（第5節） | `procedure_submission_rules`への`each_employee`上書きルール2件（給与支払報告書・特別徴収）※新Resolver用の別系統ルール。上記「Office」区分と同一ファイル内に併存 |
| `migration_national_submission_directory_phase3c1.sql`（第4節） | `procedure_submission_rules`へ償却資産申告→`municipal_asset_tax`の無条件振り分けルール追加 |

## 4. その他（Procedure Master / Workspace / Admin / 権限・修復・調査用）

| ファイル | 分類 | 内容 |
|---|---|---|
| `schema.sql` | 基盤スキーマ | `procedures`・`municipalities`・`prefectures`等のベーステーブル定義（初回投入用） |
| `import_from_csv.sql` | Procedure Master | 全国対応データ投入用のCSVインポート基盤 |
| `migration_procedure_master_phase15_2.sql` | Procedure Master | 手続きマスタ拡充（Sprint15 Phase15.2） |
| `migration_procedure_documents_item_type.sql` | Procedure Master | `procedure_documents`へ`item_type`追加 |
| `migration_resident_tax_withholding.sql` | Procedure Master | 住民税特別徴収 対応（Sprint47） |
| `migration_legal_registry.sql` | Procedure Master | 「法務・登記」カテゴリ追加 |
| `migration_event_engine.sql` | 経営イベントエンジン | 経営イベントエンジン（Phase2 MVP）スキーマ |
| `diagnose_company_events.sql` | 調査用 | `company_events`のpermission denied原因調査（読み取り専用診断クエリ） |
| `fix_duplicates.sql` | 修復 | 重複データ削除＆UNIQUE制約追加 |
| `grant_public_read.sql` | 権限 | `anon`ロールへのSELECT権限付与 |
| `migration_company_address.sql` | Workspace | `workspace_company_profiles`へ`address`追加（Sprint56） |
| `migration_next_officer_change_date.sql` | Workspace | `workspace_company_profiles`へ`next_officer_change_date`追加（Sprint55） |
| `migration_workspace_mvp.sql` | Workspace | Company Workspace MVP（Sprint22 Phase22.4）本体スキーマ |
| `migration_workspace_access_control.sql` | Workspace | Workspace単位のアクセス制御（Sprint33） |
| `migration_workspace_documents.sql` | Workspace | Workspace Documents MVP（Sprint26） |
| `migration_workspace_procedure_statuses.sql` | Workspace | Workspace Procedure Status（Sprint24） |
| `migration_workspace_procedure_statuses_occurrence.sql` | Workspace | Procedure Status 出現回単位化（Sprint32） |
| `migration_workspace_tax_returns.sql` | Workspace | Workspace Tax Return Profile（Sprint35） |
| `admin_schema.sql` | Admin | 管理画面用スキーマ（`admin_users`等） |
| `seed.sql` | 基盤シード | 初期データ（MVP: 東京都渋谷区）※Geographyにも一部該当 |
| `reset_and_seed.sql` | 基盤シード | リセット＆初期データ投入（一括実行用）※Geographyにも一部該当 |

---

## 5. Submission Directory関連ファイルの適用順序（参考）

Submission Directoryに直接関係するMigrationは以下の順で適用する必要がある（依存関係あり、各ファイル冒頭に前提として明記されている）。

1. `migration_organizations.sql`（旧スキーマ・Fukuoka/Shibuyaデータの前提）
2. `migration_national_submission_directory.sql`（新4テーブルのスキーマ）
3. `migration_national_submission_directory_phase3a.sql`（旧→新への移植）
4. `migration_national_submission_directory_phase3c1.sql`（prefectural_tax・municipal_asset_tax新設）
5. `migration_national_submission_directory_phase3c2.sql`（福岡市）
6. `migration_national_submission_directory_phase3c3.sql`（北九州市）
7. `migration_designated_cities_geography.sql`（全国地理マスタ、Phase4）
8. `migration_national_submission_directory_phase4_sapporo.sql`（札幌市、7の地理マスタに依存）
9. `migration_shibuya_code_canonical_format.sql`（独立、canonical化）

**この順序自体は本書作成時点でのファイル間の依存コメントを突き合わせた推定であり、実際にSupabase上でこの順に適用されたことを示す実行ログ等の確認はしていない。** 新規に別環境へ適用する場合は、各ファイル冒頭の「前提」節を都度確認すること。
