# WORKSPACE_DB_DESIGN.md — Workspace DB設計（Sprint22 Phase22.3）

**ステータス: 設計のみ。DB変更・マイグレーション作成・コード変更・画面変更は一切行っていない。**
実装はレビュー後、Sprint22.4以降で段階的に行う（最終提案・15節参照）。

[COMPANY_WORKSPACE_DB_AUDIT.md](COMPANY_WORKSPACE_DB_AUDIT.md)（Sprint22.2、承認済み）の結論
「B: 新規`workspace_companies`系テーブルを作る。既存`companies`/`company_events`は触らない」を
前提に、Company Workspace用の新規テーブル群を設計する。

## 0. 前提として確認した既存事実

- **既存`companies`/`company_events`は流用しない・削除しない・改変しない**（Sprint22.2承認済みの方針）。
  本設計のテーブルはすべて`workspace_`プレフィックスで命名し、命名衝突を避ける
- **既存の`CompanyProfile`/`TaxReturnEntry`/`TimelineEvent`/`RegisteredCompanyEvent`型
  （`src/lib/companyProfile.ts`/`taxReturnProfile.ts`/`timeline.ts`/`types.ts`）は、
  ほぼそのままDBカラムに転写できる形（フラットなプリミティブ値＋一部JSON）で既に設計されている。**
  本設計はこれらの型定義を変更せず、永続化先を`localStorage`からDBへ移すことだけを目的にする
  （[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 8-1節の原則の継承）
- **`localStorage`の既存キーは以下の5種類がすべて**（本セッションで`grep`により再確認）。
  `sunboo:onboarding-dismissed`のみUIの一時的な表示状態でありDB移行の対象外とする

  | キー | 内容 | 本設計での移行先 |
  |---|---|---|
  | `sunboo:company-profile` | `CompanyProfile` | 2節 `workspace_company_profiles` |
  | `sunboo:tax-return-profile` | `TaxReturnProfile`（`entries[]`） | 3節 `workspace_tax_return_profiles` |
  | `sunboo:timeline-events` | `TimelineEvent[]`（manual/systemソースのみ） | 4節 `workspace_timeline_events` |
  | `sunboo:procedure-status` | `Record<procedureId, ProcedureStatus>` | 10節で追加する`workspace_procedure_statuses`（ユーザー指定の10項目には無いが、完全な移行のために本設計で追加する） |
  | `sunboo:browser-id` | ブラウザ識別子 | 移行不要（`company_id`が識別子の役割を引き継ぐため） |

- **`admin_users`はロール列を持たないフラットな全権管理者リスト**（`email` PK、`name`のみ、
  [COMPANY_WORKSPACE_DB_AUDIT.md](COMPANY_WORKSPACE_DB_AUDIT.md) 3節で再確認済み）。本設計の
  7節はこれに`role`列を追加する前提で設計する
- **既存`anonymous_company_events`（`browser_id`軸）は一切変更しない。** 5節の
  `workspace_company_events`（`company_id`軸）は完全に別テーブルとして並行させる
  （[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 9-3節「段階的共存」A案と整合）
- **このプロジェクトは「全テーブルRLS有効・`anon`にSELECT許可が原則」という規約を持つ**
  （[DATABASE.md](DATABASE.md)）が、**本設計のテーブルは会社の税務・労務データという性質上、
  この原則の対象外とする。** `anon`には一切のGRANTを与えない（11節で明記）。これは既存規約からの
  意図的な逸脱であり、レビューで明示的に確認する
- **このプロジェクトは「APIルートを作らない、Supabase-js直接呼び出し」という制約を持つ**
  （[ARCHITECTURE.md](ARCHITECTURE.md)）。経営者への共有リンク（ログイン不要の閲覧）は、
  この制約の中で「認証されていない訪問者に、トークン一致時のみ限定データを返す」必要がある。
  **本設計はPostgreSQLの`SECURITY DEFINER`関数（RPC）をSupabase-js経由で呼び出す方式で実現する**
  （APIルート・`service_role`キーの露出のいずれも不要。12節が本設計の技術的な核心）

---

## 1. `workspace_companies`

会社の識別子となる最小限の1テーブル。他の全テーブルが`company_id`で参照する起点。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| `id` | `SERIAL` | PK | 既存の他テーブル（`procedures`等）と同じ採番方式に揃える（`companies`が`UUID`だったことと無関係に、このプロジェクト自身の規約を優先する） |
| `name` | `TEXT` | NOT NULL | 会社名（会社一覧の表示・検索に使う。既存`CompanyProfile`型には無いため新規追加） |
| `prefecture_code` | `TEXT` | NOT NULL | `prefectures.code`と同じ値体系（FK制約は張らず、既存の診断エンジンと同じ「コード文字列で保持し必要時にJOIN」方式に揃える） |
| `municipality_code` | `TEXT` | NOT NULL | `municipalities.code`と同じ値体系 |
| `corporate_type` | `TEXT` | NOT NULL | `'kabushiki' \| 'godo'`（既存`CorporateType`） |
| `fiscal_month` | `INTEGER` | NULL可 | 1〜12（既存`CompanyProfile.fiscalMonth`が`null`許容のため踏襲） |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**設計判断**: `employee_count`・`capital`・`established_date`等の税務・労務詳細は2節
`workspace_company_profiles`に置き、本テーブルには「会社一覧（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)
3節）の表示・検索に最低限必要な列」のみを残す。会社一覧のクエリを`workspace_company_profiles`の
全カラムに対して行わずに済むようにする分離（頻繁に引く一覧系クエリと、詳細タブでのみ引く詳細データを
分ける）。**`owner`や`auth_user_id`に相当する列は持たない。** 誰が担当するかは7節
`workspace_assignments`の多対多関係で表現し、単一所有者モデルにしない
（[COMPANY_WORKSPACE_DB_AUDIT.md](COMPANY_WORKSPACE_DB_AUDIT.md) 9-1節で指摘した既存`companies`の
問題点を踏まえた設計）。

---

## 2. `workspace_company_profiles`

既存`CompanyProfile`型（`src/lib/companyProfile.ts`）を1:1でDBに転写する。

| カラム | 型 | 制約 | 対応する`CompanyProfile`フィールド |
|---|---|---|---|
| `company_id` | `INTEGER` | PK, FK→`workspace_companies.id` ON DELETE CASCADE | （テーブルの主キー自体を`company_id`にし、1社1行を保証する） |
| `employee_count` | `INTEGER` | NOT NULL DEFAULT 0 | `employeeCount` |
| `capital` | `BIGINT` | NULL可 | `capital` |
| `established_date` | `DATE` | NULL可 | `establishedDate` |
| `stage` | `TEXT` | NOT NULL | `stage`（`CompanyStage`） |
| `consumption_tax_status` | `TEXT` | NOT NULL | `consumptionTaxStatus` |
| `invoice_registration_status` | `TEXT` | NOT NULL | `invoiceRegistrationStatus` |
| `taxation_method` | `TEXT` | NULL可 | `taxationMethod` |
| `corporate_tax_interim_filing` | `TEXT` | NOT NULL | `corporateTaxInterimFiling` |
| `consumption_tax_interim_frequency` | `TEXT` | NOT NULL | `consumptionTaxInterimFrequency` |
| `withholding_tax_cycle` | `TEXT` | NOT NULL | `withholdingTaxCycle` |
| `local_tax_collection_method` | `TEXT` | NOT NULL | `localTaxCollectionMethod` |
| `e_tax_enabled` | `BOOLEAN` | NOT NULL DEFAULT FALSE | `eTaxEnabled` |
| `e_ltax_enabled` | `BOOLEAN` | NOT NULL DEFAULT FALSE | `eLTaxEnabled` |
| `advisors` | `JSONB` | NOT NULL DEFAULT `'{}'` | `advisors`（`AdvisorPresence`、4項目のフラグをJSONBのまま保持。個別カラム化するほど検索要件が無いため） |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

`prefectureName`/`municipalityName`は1節`workspace_companies`の`prefecture_code`/`municipality_code`から
既存の`prefectures`/`municipalities`マスタをJOINして得るため、ここには持たない（正規化。既存の
`CompanyProfile`型が非正規化して両方持っていたのは`localStorage`単体で完結させるためであり、
DBではマスタJOINに置き換えられる）。

---

## 3. `workspace_tax_return_profiles`

既存`TaxReturnEntry`型（`src/lib/taxReturnProfile.ts`）を1行=1決算期で転写する
（`TaxReturnProfile`自体は`{entries: TaxReturnEntry[]}`という薄いラッパーのため、DBでは
「本テーブルの`company_id`に紐づく全行」が`TaxReturnProfile.entries`に相当する）。

| カラム | 型 | 制約 | 対応する`TaxReturnEntry`フィールド |
|---|---|---|---|
| `id` | `SERIAL` | PK | |
| `company_id` | `INTEGER` | NOT NULL, FK→`workspace_companies.id` ON DELETE CASCADE | |
| `fiscal_year` | `TEXT` | NOT NULL | `fiscalYear` |
| `fiscal_year_start_date` | `DATE` | NULL可 | `fiscalYearStartDate` |
| `fiscal_year_end_date` | `DATE` | NOT NULL | `fiscalYearEndDate` |
| `filed_date` | `DATE` | NULL可 | `filedDate` |
| `capital_at_filing` | `BIGINT` | NULL可 | `capitalAtFiling` |
| `taxable_sales_amount` | `JSONB` | NULL可 | `taxableSalesAmount`（`AmountValue`型をそのままJSONB化。`{precision, exactValue, rangeBucketId}`） |
| `consumption_tax_status` | `TEXT` | NOT NULL | `consumptionTaxStatus` |
| `taxation_method` | `TEXT` | NULL可 | `taxationMethod` |
| `invoice_registration_status` | `TEXT` | NOT NULL | `invoiceRegistrationStatus` |
| `corporate_tax_amount` | `JSONB` | NULL可 | `corporateTaxAmount`（`AmountValue`） |
| `consumption_tax_amount` | `JSONB` | NULL可 | `consumptionTaxAmount`（`AmountValue`） |
| `corporate_tax_interim_filing_actual` | `TEXT` | NOT NULL | `corporateTaxInterimFilingActual` |
| `consumption_tax_interim_frequency_actual` | `TEXT` | NOT NULL | `consumptionTaxInterimFrequencyActual` |
| `financial_statement_published` | `BOOLEAN` | NOT NULL DEFAULT FALSE | `financialStatementPublished` |
| `withholding_tax_cycle_actual` | `TEXT` | NULL可 | `withholdingTaxCycleActual` |
| `employee_count_at_fiscal_year_end` | `INTEGER` | NULL可 | `employeeCountAtFiscalYearEnd` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | `createdAt` |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | `updatedAt` |

**一意性制約**: `UNIQUE (company_id, fiscal_year_end_date)`。同じ決算期のエントリが重複登録されるのを防ぐ
（[CLAUDE.md](../CLAUDE.md)「一意性が必要なシードデータには必ずUNIQUE制約」の原則を、シードデータではないが
同じ考え方で適用する）。`AmountValue`系3カラムをJSONBのままにするのは、既存の`isTaxableSalesAboveExemptionThreshold`
等の判定関数（`taxReturnProfile.ts`）が`AmountValue`型をそのまま受け取る設計になっており、DB側で
個別カラムに分解すると読み出し時に毎回オブジェクトへ組み立て直す変換コードが必要になり、かつ将来
`AmountValue`の形が変わった際にマイグレーションが必要になるため（JSONBならアプリ側の型変更のみで対応できる）。

---

## 4. `workspace_timeline_events`

既存`TimelineEvent`型（`src/lib/timeline.ts`）のうち、**`manual`/`system`ソースの記録のみを保存する**
（`company_profile`/`tax_return_profile`/`event`ソースは2節・3節・5節のテーブルから都度導出するため、
二重保存しない。[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md)・[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)
8-2節が既に明記している原則をそのまま踏襲する）。

| カラム | 型 | 制約 | 対応する`TimelineEvent`フィールド |
|---|---|---|---|
| `id` | `UUID` | PK DEFAULT `gen_random_uuid()` | `id`（既存型が`crypto.randomUUID()`を使うため揃える） |
| `company_id` | `INTEGER` | NOT NULL, FK→`workspace_companies.id` ON DELETE CASCADE | |
| `occurred_at` | `DATE` | NOT NULL | `occurredAt` |
| `recorded_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | `recordedAt` |
| `title` | `TEXT` | NOT NULL | `title` |
| `description` | `TEXT` | NOT NULL DEFAULT `''` | `description` |
| `category` | `TEXT` | NOT NULL | `category` |
| `source` | `TEXT` | NOT NULL CHECK (`source IN ('manual','system')`) | `source`（本テーブルでは実質この2値のみ。他の4値は導出専用のため書き込まれない） |
| `source_id` | `TEXT` | NOT NULL | `sourceId` |
| `metadata` | `JSONB` | NOT NULL DEFAULT `'{}'` | `metadata` |

**一意性制約**: `UNIQUE (company_id, source, source_id, occurred_at, category)`。既存`timelineEventKey`
（`timeline.ts`）と全く同じ重複防止キーをDB制約としても表現する（アプリ側の判定とDB制約の二重防御）。

---

## 5. `workspace_company_events`

既存`anonymous_company_events`の`company_id`軸版。既存`RegisteredCompanyEvent`型
（`src/lib/types.ts`）を転写する。**既存`event_types`マスタテーブルはそのまま再利用する**
（マスタテーブルを複製しない）。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| `id` | `SERIAL` | PK | |
| `company_id` | `INTEGER` | NOT NULL, FK→`workspace_companies.id` ON DELETE CASCADE | |
| `event_type_id` | `INTEGER` | NOT NULL, FK→`event_types.id`（既存マスタ） | |
| `event_date` | `DATE` | NOT NULL | 期限計算の起算日（既存`calculateNextDeadline`の`eventDate`引数にそのまま渡せる） |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

`corporate_type`/`has_employees`（既存`anonymous_company_events`が非正規化して持っていた列）は、
本テーブルでは持たない。**Workspaceでは会社ごとに`workspace_companies`/`workspace_company_profiles`が
既に存在するため、イベントごとに会社属性のスナップショットを複製する必要が無い**（既存の匿名モデルが
`browser_id`だけでは会社を束ねられず非正規化せざるを得なかった制約から解放される、という
Company Workspace化の副次的なメリット）。Rule Engine評価時のコンテキスト
（`corporate_type`/`has_employees`等）は、評価の都度`workspace_company_profiles`から引く。

**既存`anonymous_company_events`との関係**: 完全に独立したテーブルとして並行稼働させる。統合・移行スクリプトは
本Sprintでは設計しない（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 9-4節の「βテストデータの扱い」判断待ち）。

---

## 6. `workspace_share_links`

経営者への共有リンク（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 6節）を表現する。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| `id` | `SERIAL` | PK | |
| `company_id` | `INTEGER` | NOT NULL, FK→`workspace_companies.id` ON DELETE CASCADE | |
| `token` | `TEXT` | NOT NULL UNIQUE DEFAULT `encode(gen_random_bytes(24), 'base64url')` | 推測困難なURLトークン（32文字程度）。**このトークン自体を主キーにはしない**（差し替え・失効の履歴を残すため、`id`とは別に保持） |
| `shared_sections` | `JSONB` | NOT NULL DEFAULT `'[]'` | 共有する項目のコード配列（例: `["roadmap","adviser"]`。[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 5-11節のトグルに対応。デフォルト空＝何も共有しない） |
| `created_by` | `TEXT` | NOT NULL, FK→`admin_users.email` | 発行した管理者・担当者 |
| `expires_at` | `TIMESTAMPTZ` | NULL可 | NULL＝無期限（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 6-1節「有効期限は任意」） |
| `revoked_at` | `TIMESTAMPTZ` | NULL可 | 手動失効日時。NULLでない場合は`expires_at`に関わらず即座に無効 |
| `last_accessed_at` | `TIMESTAMPTZ` | NULL可 | 閲覧の有無・最終アクセス確認用（不正利用の兆候把握） |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

**このテーブルへの直接の`SELECT`権限は`anon`は元より`authenticated`にも極力絞る**（12節）。
トークンの有効性チェックと実データの取得は、後述のRPC関数（12節）に一本化し、テーブルへの
直接クエリでトークン推測攻撃の足がかりを与えない設計にする。

---

## 7. `workspace_assignments` / `workspace_members`

### 7-1. `workspace_assignments`（本Sprintで設計する。MVPに含める）

管理者・担当者と会社の多対多の割り当て。[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 7-1節の
`company_staff_assignments`に相当する。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| `admin_email` | `TEXT` | NOT NULL, FK→`admin_users.email` ON DELETE CASCADE | |
| `company_id` | `INTEGER` | NOT NULL, FK→`workspace_companies.id` ON DELETE CASCADE | |
| `assigned_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

複合PK: `(admin_email, company_id)`。**「管理者」ロールかどうかは`admin_users.role`列
（新設、7-3節）で判定し、本テーブルには持たせない**（`admin_users.role = 'admin'`なら本テーブルの
行の有無に関わらず全社にアクセス可、`'staff'`なら本テーブルに行がある会社のみ、という判定にする。
役割は「人」に属する属性であって「割り当て」に属する属性ではないため）。

### 7-2. `workspace_members`（将来構想。本SprintではMVPに含めない）

「将来のログイン付き経営者アカウントへの拡張」に備えた設計イメージ。経営者・閲覧のみユーザーが
共有リンクだけでなく個別ログインを持つようになった場合の受け皿。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| `id` | `SERIAL` | PK | |
| `company_id` | `INTEGER` | NOT NULL, FK→`workspace_companies.id` ON DELETE CASCADE | |
| `email` | `TEXT` | NOT NULL | 経営者・閲覧のみユーザーのメールアドレス |
| `role` | `TEXT` | NOT NULL CHECK (`role IN ('owner','viewer')`) | [COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 7節の「経営者」「閲覧のみ」に対応 |
| `invited_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |
| `accepted_at` | `TIMESTAMPTZ` | NULL可 | 招待メールのリンクを踏んで認証を完了した日時（Supabase Authのマジックリンク等を想定） |

**本Sprintではスキーマ案の提示に留め、テーブルを作らない。** 6節の共有リンク方式で当面は十分であり、
`workspace_members`は「共有リンクでは追跡できない書き込み操作（6-2節）が必要になった時点」で
着手する（14節・最終提案でMVPスコープ外と明記）。

### 7-3. `admin_users`への追加（本Sprintで設計する）

```sql
-- 設計イメージ（本Sprintではコード化しない）
ALTER TABLE admin_users ADD COLUMN role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('admin', 'staff'));
```

既存の管理者（Sprint22.3時点で登録済みの`admin_users`行）は`DEFAULT 'staff'`のままでは
全社アクセス権を失ってしまうため、**マイグレーション実行時に既存行を`'admin'`へ一括更新する
文もあわせて用意する**（15節）。

---

## 8. `documents` / `attachments`（将来構想）

[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 5-10節が「本Sprintでは設計しない」とした通り、
本設計でも詳細スキーマは確定しない。方向性のみ示す。

| カラム（案） | 型 | 備考 |
|---|---|---|
| `id` | `SERIAL` | PK |
| `company_id` | `INTEGER` | FK→`workspace_companies.id` |
| `storage_path` | `TEXT` | Supabase Storageのオブジェクトパス（バケット名・アクセス制御は別途設計） |
| `file_name` | `TEXT` | 元のファイル名 |
| `category` | `TEXT` | 決算書／登記簿謄本／申告書控え等（値の体系は未確定） |
| `uploaded_by` | `TEXT` | FK→`admin_users.email`（将来`workspace_members`が実装されれば経営者アップロードも想定） |
| `created_at` | `TIMESTAMPTZ` | |

Supabase Storageのバケット単位のアクセス制御（RLSに相当する`storage.objects`ポリシー）の設計は
本Sprintのスコープ外とする。

---

## 9. `accounting_data`（将来構想）

[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 9節が将来構想として挙げていた
freee/MF等の会計データ連携の実現先。[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 5-7節と同様、
**本Sprintでは保持する項目の具体的なスキーマは設計しない**。

| カラム（案） | 型 | 備考 |
|---|---|---|
| `id` | `SERIAL` | PK |
| `company_id` | `INTEGER` | FK→`workspace_companies.id` |
| `source` | `TEXT` | `'freee' \| 'moneyforward' \| 'manual'`等（未確定） |
| `period` | `TEXT` | 対象期間 |
| `raw_data` | `JSONB` | 連携先APIのレスポンスをそのまま保持（スキーマが連携先ごとに異なるため） |
| `imported_at` | `TIMESTAMPTZ` | |

連携先APIの仕様が固まった時点で、`raw_data`のうちどの項目を`workspace_tax_return_profiles`等の
正規化されたカラムに反映するかを別途設計する（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)
9節「ユーザー入力→自動計算への切り替えの中間段階」という位置づけを踏襲）。

---

## 10. `workspace_procedure_statuses`（ユーザー指定の10項目には無いが、完全な移行のために追加）

0節で確認した通り、`localStorage`の`sunboo:procedure-status`（`Record<procedureId, ProcedureStatus>`）は
ユーザーが指定した10項目のいずれにも明示的には含まれていないが、これを移行しないと
「手続きの完了状況」が会社ごとに保存できなくなる。**Timelineは追記専用（イミュータブル）であり、
「進行中↔未着手」のように何度でも書き換わりうるステータスの置き場としては性質が合わない**
（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md)の設計原則）ため、独立した小さなテーブルとして追加する。

| カラム | 型 | 制約 | 備考 |
|---|---|---|---|
| `company_id` | `INTEGER` | NOT NULL, FK→`workspace_companies.id` ON DELETE CASCADE | |
| `procedure_id` | `INTEGER` | NOT NULL, FK→`procedures.id`（既存マスタ） | |
| `status` | `TEXT` | NOT NULL DEFAULT `'not_started'` CHECK (`status IN ('not_started','in_progress','done')`) | 既存`ProcedureStatus`型 |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT NOW() | |

複合PK: `(company_id, procedure_id)`。

---

## 11. RLS・権限の全体設計

0節で明記した通り、**本設計のテーブルは既存の「`anon`にSELECT許可が原則」という規約の対象外とする**。

| テーブル | `anon` | `authenticated`（`admin_users`登録者） | 備考 |
|---|---|---|---|
| `workspace_companies` | 権限なし | `role='admin'`なら全件、`role='staff'`なら`workspace_assignments`に紐づく会社のみ（SELECT/INSERT/UPDATE。DELETEは`role='admin'`のみ） | |
| `workspace_company_profiles` | 権限なし | 同上（`company_id`経由でJOIN判定） | |
| `workspace_tax_return_profiles` | 権限なし | 同上 | |
| `workspace_timeline_events` | 権限なし | 同上 | |
| `workspace_company_events` | 権限なし | 同上 | |
| `workspace_procedure_statuses` | 権限なし | 同上 | |
| `workspace_share_links` | **権限なし（テーブルへの直接アクセスは不可）** | `role='admin'`または該当`company_id`の担当`staff`のみSELECT/INSERT/UPDATE（発行・失効操作用）。DELETEなし（`revoked_at`更新で失効させ、履歴を残す） | 実際の共有閲覧は12節のRPC経由のみ |
| `workspace_assignments` | 権限なし | `role='admin'`のみ全件操作可。`staff`は自分の行のみSELECT可（自分がどの会社を担当しているか確認する用途） | |
| `admin_users`（既存＋`role`列追加） | 現状通り`self_read`のみ | 変更なし（`role`列追加のみ、ポリシー自体は不変） | |

RLSポリシーの実装イメージ（設計イメージ、本Sprintではコード化しない）:

```sql
-- 設計イメージ
CREATE POLICY "staff_or_admin_select" ON workspace_companies
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE email = auth.email() AND role = 'admin')
    OR EXISTS (
      SELECT 1 FROM workspace_assignments
      WHERE admin_email = auth.email() AND company_id = workspace_companies.id
    )
  );
```

他の`company_id`を持つテーブルも同じ判定パターン（`workspace_companies`とのJOINまたは
`company_id`の直接比較）に揃える。既存の[CLAUDE.md](../CLAUDE.md)「管理画面から書き込むテーブルは
`admin_users`照合ポリシーを`admin_schema.sql`と同じパターンで書く」「`admin_users`テーブルが
未作成の環境でも安全に動くよう`IF EXISTS`でガードする」を踏襲する。

---

## 12. 経営者への共有リンク方式（閲覧専用URL・有効期限・RPC設計）

### 12-1. 課題

[ARCHITECTURE.md](ARCHITECTURE.md)の「APIルートを作らない」制約の中で、**未認証の訪問者
（経営者）にトークン一致時のみ限定データを返す**必要がある。11節の通り`workspace_share_links`等の
テーブルには`anon`権限を与えないため、素朴なテーブル直読みでは実現できない。

### 12-2. 解決方式: `SECURITY DEFINER`のRPC関数

PostgreSQLの`SECURITY DEFINER`関数を1つ用意し、`anon`ロールにその関数の実行権限（`GRANT EXECUTE`）
のみを与える。関数内部でトークンの有効性（存在・失効・期限）を確認した上で、許可された項目
（`shared_sections`）のデータだけをJSONで組み立てて返す。**テーブル自体への`anon`権限は一切
不要**（関数は所有者＝管理者権限で実行されるため、内部でRLSをバイパスして必要なJOINができる）。

```sql
-- 設計イメージ（本Sprintではコード化しない）
CREATE FUNCTION get_shared_workspace_view(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_link workspace_share_links%ROWTYPE;
  v_result JSONB;
BEGIN
  SELECT * INTO v_link FROM workspace_share_links
    WHERE token = p_token
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > NOW());
  IF NOT FOUND THEN
    RETURN NULL; -- 無効・失効・期限切れ
  END IF;

  UPDATE workspace_share_links SET last_accessed_at = NOW() WHERE id = v_link.id;

  -- shared_sections に含まれる項目だけを組み立てる（擬似コード）
  v_result := jsonb_build_object(
    'company', (SELECT to_jsonb(c) FROM workspace_companies c WHERE c.id = v_link.company_id),
    'roadmap', CASE WHEN v_link.shared_sections ? 'roadmap'
      THEN (SELECT jsonb_agg(to_jsonb(t)) FROM workspace_tax_return_profiles t WHERE t.company_id = v_link.company_id)
      ELSE NULL END
    -- 他のセクションも shared_sections の内容に応じて同様に組み立てる
  );
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_shared_workspace_view(TEXT) TO anon;
```

**Annual Roadmap・State・AI参謀は計算結果であり保存されていない**（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)
1-2節）ため、RPCが返すのは`workspace_tax_return_profiles`等の**生データ**までに留め、
`buildAnnualRoadmap`等の計算はNext.js側（`/share/[token]`ページのServer Component）が
RPCの返り値を使って実行する。**計算ロジック自体をDB関数内に持ち込まない**（既存の
「計算ロジックは`src/lib/`のTypeScript純粋関数」という方針を維持するため）。

### 12-3. 閲覧専用URL

`/share/[token]`という新しいトップレベルルート（`(site)`にも`/admin`にも属さない）を新設する想定
（画面自体は本Sprintでは実装しない）。Server Componentが`supabase.rpc('get_shared_workspace_view',
{ p_token: token })`を呼び、`null`が返れば「リンクが無効です」を表示する。

### 12-4. 有効期限・失効

- `expires_at`: 発行時に管理者・担当者が任意で設定（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 6-1節）
- `revoked_at`: 管理者・担当者がいつでも即座に失効させられる（`workspace_share_links`の`UPDATE`権限、11節）
- 期限切れ・失効したリンクは物理削除しない（`last_accessed_at`等のアクセス履歴を残し、
  不正アクセスの兆候を後から確認できるようにする）

### 12-5. 将来のログイン付き経営者アカウントへの拡張との共存

7-2節の`workspace_members`が実装された場合も、**共有リンク方式（6節・12節）は廃止せず併存させる**。
ログインを希望しない・アカウント管理の手間を避けたい経営者にはリンク方式、より高度な権限
（書き込み等）が必要になった経営者には`workspace_members`ベースのログイン、という2方式の
併存を想定する（どちらか一方に統一する必要はない）。

---

## 13. `localStorage`からDBへの移行方法（データ取得層の置き換え）

[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 8-1節の「データ取得層のみ置き換え、計算ロジック層は
無変更」の原則を、具体的な関数単位まで落とし込む。

| 既存の`load*`/`save*`関数 | 置き換え後（イメージ） | 変更範囲 |
|---|---|---|
| `loadCompanyProfile()`（引数無し、`localStorage`直読み） | `loadCompanyProfile(client, companyId)`（`workspace_company_profiles`を1行SELECT、DB行→`CompanyProfile`型への変換関数を新設） | `companyProfile.ts`に引数追加。呼び出し元（Workspaceページ）は`companyId`をルートパラメータから渡す |
| `saveCompanyProfile(profile)` | `saveCompanyProfile(client, companyId, profile)`（UPSERT） | 同上 |
| `loadTaxReturnProfile()` | `loadTaxReturnProfile(client, companyId)`（`workspace_tax_return_profiles`をSELECT、行配列→`TaxReturnEntry[]`への変換） | `taxReturnProfile.ts`に引数追加 |
| `loadTimelineEvents()` | `loadTimelineEvents(client, companyId)`（`workspace_timeline_events`をSELECT。`manual`/`system`のみのため既存の意味論と一致） | `timeline.ts`に引数追加 |
| `loadStatusMap()`（`ScheduleList.tsx`内） | `loadStatusMap(client, companyId)`（`workspace_procedure_statuses`をSELECT） | 同上 |
| `getBrowserId()` | 不要（ルートパラメータの`companyId`が識別子の役割を担う） | `events.ts`からWorkspace用の呼び出し経路では未使用に |
| `fetchCompanyEvents(client, browserId)` | `fetchCompanyEvents(client, companyId)`（`workspace_company_events`を`event_types`とJOIN） | `events.ts`に新しい関数を追加（既存の`browser_id`版は残す、9-3節参照） |

**`buildTimelineFromSources`・`buildStateFromTimeline`・`buildAnnualRoadmap`・`runDiagnosis`・
`evaluateRules`・`adviserScore.ts`・`notificationEngine.ts`はいずれも1行も変更しない。**
渡される`CompanyProfile`/`TaxReturnProfile`/`TimelineEvent[]`/`ScheduleProcedure[]`が
「DBから読んで型に変換された値」に変わるだけで、関数のシグネチャ・戻り値は不変（14節で型変換の
対応を示す）。

---

## 14. 既存Timeline/State/Roadmap Engineへ渡すデータ形式（型マッピング）

DB行からTypeScript型への変換は、各`load*`関数の内部に薄い変換関数（`rowToCompanyProfile`等）として
実装する想定（本Sprintではコード化しない、13節の実装フェーズで行う）。

```ts
// 設計イメージ（Sprint22.4以降でコード化）
function rowToCompanyProfile(row: WorkspaceCompanyProfileRow, company: WorkspaceCompanyRow): CompanyProfile {
  return {
    prefectureCode: company.prefecture_code,
    prefectureName: /* prefectures マスタJOIN結果から */,
    municipalityCode: company.municipality_code,
    municipalityName: /* municipalities マスタJOIN結果から */,
    corporateType: company.corporate_type,
    employeeCount: row.employee_count,
    capital: row.capital,
    establishedDate: row.established_date,
    fiscalMonth: company.fiscal_month,
    stage: row.stage,
    consumptionTaxStatus: row.consumption_tax_status,
    // ...以下 CompanyProfile の全フィールドをDBカラムから復元
    advisors: row.advisors, // JSONBのままキャストで足りる
  };
}
```

**この変換関数を境に、それより上流（Reactコンポーネント・`src/lib/`の計算ロジック）は
DBの存在を一切意識しない。** `buildAnnualRoadmap(client, profile, state, horizonYears)`の
シグネチャ自体は不変（`profile`/`state`の中身がDB由来になるだけ）。この境界の明確さが、
0節で確認した「計算ロジックは`localStorage`かDBかを関知しない」設計の実利益である。

同様の変換関数を`TaxReturnEntry`（`workspace_tax_return_profiles`の1行）・`TimelineEvent`
（`workspace_timeline_events`の1行、`manual`/`system`分のみ。`company_profile`/`tax_return_profile`/
`event`ソース分は2・3・5節のテーブルからそれぞれ`buildCompanyTimelineEvents`相当のロジックで
都度生成し、`mergeTimelineEvents`で合成する——ここもロジック自体は`timelineProducer.ts`の
既存関数をそのまま使う）についても用意する。

---

## 15. Migration計画

Sprint22.4以降で段階的に実装する想定のマイグレーションファイル分割案（本Sprintではファイルを
作成しない）。

| ファイル（案） | 内容 |
|---|---|
| `migration_workspace_core.sql` | `workspace_companies`・`workspace_company_profiles`・GRANT/RLS |
| `migration_workspace_tax_returns.sql` | `workspace_tax_return_profiles`・GRANT/RLS |
| `migration_workspace_timeline.sql` | `workspace_timeline_events`・`workspace_company_events`・`workspace_procedure_statuses`・GRANT/RLS |
| `migration_workspace_sharing.sql` | `workspace_share_links`・`get_shared_workspace_view`関数・`GRANT EXECUTE TO anon` |
| `migration_workspace_roles.sql` | `admin_users.role`列追加・既存行を`'admin'`に一括更新・`workspace_assignments`テーブル・GRANT/RLS |

各ファイルは[CLAUDE.md](../CLAUDE.md)の規約通り、テーブル定義と同じファイル内でGRANT・RLS・policyを
セットで書く。`documents`/`accounting_data`/`workspace_members`（8節・9節・7-2節）は本リストに含めない
（将来構想のため）。

---

## 最終提案: A / B / C のテーブル構成と実装順序

### A. 最小MVPテーブル構成

```
workspace_companies
workspace_company_profiles
workspace_tax_return_profiles
workspace_company_events
workspace_procedure_statuses
admin_users.role 列追加 + workspace_assignments
```

**Timeline（`workspace_timeline_events`）・共有リンク（`workspace_share_links`）は含めない。**
理由: Timelineの`manual`/`system`ソースは実際にはまだβ版でほとんど使われていない
（Sprint19以降に導入されたばかりで、現行データのほとんどは`company_profile`/`tax_return_profile`/
`event`ソースから都度導出される分で占められる）。MVPでは「管理者・担当者が会社ごとにProfile・決算実績・
イベントを入力・編集でき、手続き一覧とAI参謀・Annual Roadmapが会社別に見える」ところまでで
価値検証ができる。共有リンクが無くても、管理者が画面を見せながら打ち合わせる運用で当面代替できる。

### B. v1.0向け正式テーブル構成

Aに以下を追加する。

```
+ workspace_timeline_events（manual/systemソースの記録が実際に必要になった時点）
+ workspace_share_links + get_shared_workspace_view RPC（経営者への共有を開始する時点）
```

### C. 将来拡張テーブル構成

```
+ workspace_members（ログイン付き経営者アカウント）
+ documents/attachments（ファイル添付）
+ accounting_data（会計データ連携）
```

### 実装順序の結論: **A → B → C の順で実装する**

理由:

1. **Aだけで「管理者・税理士が主利用者である」という今回の方針転換の中核（会社ごとに代行管理する）を
   検証できる。** 経営者への共有（B）・ログイン拡張（C）が無くても、まず管理者側の業務が回るかどうかを
   確認する方が、手戻りのリスクが小さい
2. **Bの2要素（Timeline・共有リンク）はAの上に無破壊で追加できる。** どちらも新規テーブル＋新規RPCの
   追加のみで、Aのスキーマを変更する必要が無い（`company_id`を軸にした素直な拡張）
3. **Cは要件そのものが今回の設計時点でまだ確定していない**（`workspace_members`はログイン方式が
   マジックリンクか他方式か未確定、`documents`はSupabase Storageのバケット設計が未着手、
   `accounting_data`は連携先APIの仕様待ち）。**A・Bの実運用を経て要件を固めてから着手する方が、
   speculativeな設計（[CLAUDE.md](../CLAUDE.md)が戒める「憶測に基づく機能追加」）を避けられる**
4. 15節のマイグレーションファイル分割も、この順序（`migration_workspace_core.sql`→
   `_tax_returns.sql`→`_roles.sql`がA相当、`_timeline.sql`→`_sharing.sql`がB相当）に自然に対応している

---

## まとめ（設計レビュー観点）

1. **11節**: 本設計のテーブルに`anon`権限を一切与えない（既存の「`anon`にSELECT許可が原則」という
   規約から意図的に外す）方針でよいか
2. **12節**: 共有リンクの閲覧を`SECURITY DEFINER`のRPC関数で実現する方式が、
   「APIルートを作らない」制約の中での適切な解でよいか。Roadmap/State/AI参謀の計算は
   Next.js側（Server Component）で行い、RPCは生データの取得のみに徹する切り分けでよいか
3. **1節**: `workspace_companies`と`workspace_company_profiles`を分離した設計（一覧用の軽い
   テーブルと詳細タブ用の重いテーブル）が妥当か。1テーブルに統合すべきという判断もありうる
4. **7節**: `workspace_assignments`（今回作る）と`workspace_members`（将来構想）を分けた設計、
   および「管理者/担当者」の判定を`admin_users.role`列で行う設計でよいか
5. **10節**: ユーザー指定に無かった`workspace_procedure_statuses`を独自に追加した判断が妥当か
6. **最終提案**: A→B→Cの実装順序、および各段階に含めるテーブルの切り分けが妥当か
