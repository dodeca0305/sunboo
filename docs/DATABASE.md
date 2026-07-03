# DATABASE.md — テーブル一覧と関係性

対象: Supabase（PostgreSQL）。定義元のSQLファイルは `supabase/` 配下（`schema.sql` が初期スキーマ、
以降は `migration_*.sql` で追加）。全テーブルRLS有効・`anon`ロールにSELECT許可が原則（詳細は各テーブルの節）。

## 全体関係図（テキスト）

```
prefectures ─┬─ municipalities ─┬─ jurisdiction_offices（旧設計・残置・未参照）
             │                  │
             │                  └─ jurisdictions ─── organization_offices ─── organizations ─── organization_types
             │                                                                                         │
             │                                                                            procedures.office_type
             │                                                                            （FK: organization_types.code）
             │
             └─ company_events（法人所在地の市区町村を保持）

procedures ─┬─ procedure_documents（必要書類）
            ├─ official_links（公式リンク）
            ├─ procedure_organizations（office_typeの多対応拡張、未参照）
            ├─ event_procedures（旧: イベント種別との固定マッピング、未参照）
            └─ rule_actions（procedure_id、ルールから参照される）

event_types ─┬─ company_events（どのイベントが登録されたか）
             └─ event_procedures（旧マッピング、未参照）

rules ─┬─ rule_conditions（AND条件）
       └─ rule_actions（add_procedure / show_warning / change_office / change_deadline）

admin_users（Supabase Authのメールアドレスと突き合わせる許可リスト。他テーブルのRLSポリシーから参照される）
```

「未参照」と記載したテーブルは、テーブル自体はDBに存在し新規実装の妨げにはならないが、
現行のアプリケーションコード（`src/lib/diagnosis.ts` / `src/lib/events.ts` / `src/lib/ruleEngine.ts`）
からは読み書きされていないことを意味する。

## マスタ系テーブル

### `prefectures`
都道府県マスタ。`code`（例: `'13'`=東京都、`'40'`=福岡県）、`name`。`schema.sql`で定義。

### `municipalities`
市区町村マスタ。`prefecture_id` → `prefectures.id`。`code`（例: `'13113'`=渋谷区）はUNIQUE。

## 手続きマスタ

### `procedures`
手続き本体。中核テーブルで、診断エンジン・経営イベントエンジンの両方から参照される。

| カラム | 役割 |
|---|---|
| `code` | 一意な識別コード（例: `CORP_ESTABLISH_TAX`）。マイグレーション/ルールから`code`で引く際のキー |
| `category` | `tax` / `labor` / `insurance` / `registration` / `legal` / `other` |
| `requires_employees` | 従業員がいる会社のみ対象か（診断エンジンでのフィルタに使用） |
| `office_type` | 提出先の機関種別コード。`organization_types.code`へのFK（`fk_procedures_office_type`） |
| `timing_type` / `timing_data` | 期限計算方式。`docs/ARCHITECTURE.md`の期限計算ロジック（`diagnosis.ts`）参照 |
| `corporate_type` | `kabushiki` / `godo` / `NULL`（問わず）。法務・登記手続きの絞り込みに使用 |
| `requires_officer_term`, `include_in_diagnosis`, `target_note`, `submission_method`, `e_filing_system_name/url`, `caution_note` | 法務・登記カテゴリ追加時（Phase 1.5）に追加した詳細情報カラム |

`timing_type`の値と`timing_data`の対応：

| `timing_type` | `timing_data`の形 | 計算方法 |
|---|---|---|
| `at_establishment` / `hiring_event` / `event_based` | `{"days_from_event": N}` | 起算日（`event_date`）が渡された場合のみ`N`日後を計算。無指定なら`null`（後方互換） |
| `fiscal_offset` | `{"months": N}` | 決算月から`N`ヶ月後の月末 |
| `fixed_date` | `{"month": M, "day": D}` | 毎年固定日 |
| `period` | `{"startMonth","startDay","endMonth","endDay"}` | 毎年の期間（例: 算定基礎届） |
| `monthly_10th` | なし | 毎月10日固定 |

### `procedure_documents`
`procedures`の必要書類。`procedure_id` → `procedures.id`（`ON DELETE CASCADE`）。

### `official_links`
`procedures`または旧`jurisdiction_offices`への公式リンク。`status`（`ok`/`broken`/`redirected`/`unchecked`）で
リンク切れ対策を管理。

## 行政機関マスタ（Phase 1.5で正規化）

### `organization_types`
機関種別マスタ（法務局・税務署・年金事務所・労基署・ハローワーク等、13種）。`code`が`procedures.office_type`と
同じ値体系。

### `organizations`
統括組織（例:「福岡法務局」）。`organization_type_id` → `organization_types.id`。

### `organization_offices`
物理窓口（例:「福岡法務局北九州支局」）。`organization_id` → `organizations.id`。住所・電話・FAX・メール・
電子申請URL・地図URL・営業時間等を持つ。**旧`jurisdiction_offices`にあった情報はこちらに統合済み。**

### `jurisdictions`
市区町村 × 機関種別 → 窓口、の多対多解決テーブル。`(municipality_id, organization_type_id)`がUNIQUE
（1市区町村内で同じ種別の機関は1つに確定させる、というSUNBOOの制約を表現）。1つの窓口が複数市区町村を
管轄できる（例: 福岡法務局が福岡市7区＋周辺市町村を管轄）。

`src/lib/diagnosis.ts`の`resolveOffices(client, municipalityId)`がこのテーブルを起点に
`organization_types.code` → `organization_offices`の情報をまとめて`JurisdictionOffice`型に整形して返す。
診断エンジン・経営イベントエンジン共通のエントリーポイント。

### `procedure_organizations`
`procedures` × `organization_types`の中間テーブル（`is_primary`, `notes`）。1手続きが複数の提出先を持ちうる
将来的な拡張のために用意されているが、**現状のアプリコードは`procedures.office_type`（単一値）を正として動作しており、
このテーブルは未参照**。1手続き=複数提出先の実装が必要になった際の拡張ポイント。

### `jurisdiction_offices`（旧設計・残置）
Phase 1のMVP時点の設計（1市区町村=1行、機関の重複あり）。Phase 1.5で`organizations`系に置き換えられたが、
ロールバック安全性のため削除していない。**新規実装では使わないこと。**

## 経営イベントエンジン（Phase 2）

### `event_types`
経営イベント種別マスタ。MVPでは3種: `company_establishment`（会社設立）/ `employee_hired`（従業員採用）/
`officer_change`（役員変更）。

### `company_events`
登録された経営イベント本体。**`companies`という独立エンティティは存在しない**（一般ユーザーに
アカウント機能が無いため）。会社プロフィール（`municipality_id`, `corporate_type`, `has_employees`）は
イベントごとに非正規化して直接保持し、`browser_id`（クライアント生成UUID、`localStorage`に保存）で
「同じブラウザが登録したイベント」を緩やかに束ねる。

| カラム | 役割 |
|---|---|
| `browser_id` | ブラウザ単位の識別子（アカウント無しの信頼モデル。他機能のlocalStorageパターンと同じ） |
| `event_type_id` | → `event_types.id` |
| `event_date` | イベント発生日（期限計算の起算日として使われる） |
| `municipality_id`, `corporate_type`, `has_employees` | 提出先解決・ルール評価に使う会社プロフィールのスナップショット |

### `event_procedures`（旧設計・残置）
Phase 2時点での「イベント種別→手続き」固定マッピング。Phase 2.5で`rules`系に置き換えられ、
**現状はアプリコードから未参照**（削除はしていない）。

## ルールエンジン（Phase 2.5）

`rules` / `rule_conditions` / `rule_actions` の詳細な設計思想・評価フローは [RULE_ENGINE.md](RULE_ENGINE.md) を
参照。ここではテーブル構造のみ要約する。

### `rules`
ルール本体。`name`（**UNIQUE制約あり**、詳細はRULE_ENGINE.md）、`priority`（昇順で評価）、`is_active`。

### `rule_conditions`
`rule_id` → `rules.id`。`field`（自由記述の文字列、コンテキストのキー名と一致させる）・`operator`
（`eq`/`neq`/`in`/`not_in`/`gt`/`gte`/`lt`/`lte`）・`value`（JSONB）。同一ルール内の複数条件はAND結合。

### `rule_actions`
`rule_id` → `rules.id`。`action_type`（`add_procedure`/`show_warning`/`change_office`/`change_deadline`）・
`procedure_id`（→ `procedures.id`、`show_warning`のみNULL許容）・`payload`（JSONB、アクション種別ごとに形が違う）。

## 管理者認可

### `admin_users`
管理画面へのアクセスを許可するメールアドレスの許可リスト。`email`がPRIMARY KEY。Supabase Authで作成した
ユーザーのメールアドレスと突き合わせて認可する（Supabase Auth自体のユーザーテーブルとは別）。
他の全テーブルの「管理者書き込みポリシー」（`admin_insert`/`admin_update`/`admin_delete`）は
`auth.email() IN (SELECT email FROM admin_users)`を条件にしている。

## 権限（GRANT / RLS）の一般原則

全テーブル共通で以下のパターンを踏襲している（マイグレーションファイルごとに定義）。

| ロール | 権限 | 対象 |
|---|---|---|
| `anon`（未ログイン一般ユーザー） | `SELECT` 全テーブル、`INSERT`は`company_events`のみ | RLSポリシー`public_read`（`USING (true)`）、`company_events`は`anon_insert`/`anon_read` |
| `authenticated` かつ `admin_users`登録者 | `INSERT`/`UPDATE`/`DELETE`（マスタ系テーブル） | RLSポリシー`admin_insert`/`admin_update`/`admin_delete` |

新しいテーブルを追加する際は、**テーブル定義と同じマイグレーションファイル内で** GRANT・
`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`・policyの3点セットを必ず書くこと。過去に
`organization_types`系・`event_types`系のいずれも「テーブルは存在するが権限未設定で常に空に見える」
事故を起こしている（`supabase/migration_organizations_permissions.sql`、
`supabase/migration_event_engine.sql`のGRANTセクション参照）。
