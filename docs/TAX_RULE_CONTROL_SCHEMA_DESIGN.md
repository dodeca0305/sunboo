# TAX_RULE_CONTROL_SCHEMA_DESIGN.md — TaxRule / TaxControl Schema Design (TI-0.3)

Status: Design only
Phase: TI-0.3
Scope: TaxRule / TaxControl and their minimum provenance relations
Out of scope: ControlResult / ReviewCase / UI / crawler / AI auto-approval / production control implementation

---

## 0. 前提

TI-0.2 で `tax_sources` / `tax_source_versions` を導入済み。

TI-0.3 では、公式根拠をSUNBOO内の税務ルールへ整理する `TaxRule` と、
会社データへ決定論的に実行する `TaxControl` の永続化設計を確定する。

既存の汎用 Rule Engine (`rules`, `rule_conditions`, `rule_actions`) は変更しない。

Tax Intelligence の基本関係は次のとおり。

```text
TaxSource
  ↓
TaxSourceVersion
  ↓ many-to-many
TaxRule
  ↓ many-to-many
TaxControl
  ↓
ControlResult   ← TI-0.4
```

Smoke Control はデータ品質・状態整合性チェックを含むため、
すべての TaxControl が TaxRule を必須とする設計にはしない。

---

## 1. Design Decisions

### D1. 既存 `rules` と `tax_rules` を分離する

既存 Rule Engine は汎用イベント・手続ルール用として維持する。

Tax Intelligence は次の理由で別スキーマとする。

- 公式根拠Versionへの追跡が必要
- 税法上の適用期間が必要
- 人間による承認状態が必要
- 過去判定の根拠を保持する必要
- AI提案と本番承認を分離する必要
- anon公開してはならない

### D2. TaxRule は「公式文書そのもの」ではない

TaxRule は `TaxSourceVersion` の内容から専門家が整理した、
SUNBOO上の税務ルール表現。

公式原文は `tax_source_versions.normalized_text` に保持する。

TaxRule は必ず根拠となる `TaxSourceVersion` へ追跡可能にする。

### D3. TaxControl は TaxRule と分離する

TaxRule:
- 税務上何が成立するか
- どの期間に適用されるか
- 何を根拠にしているか

TaxControl:
- SUNBOOが何を入力として読むか
- どの決定論的Evaluatorを実行するか
- どの条件で PASS / FAIL / UNKNOWN を返すか
- 既定の重要度をどう扱うか

法的意味とプログラム実装を同一レコードへ混ぜない。

### D4. Rule / Control はVersion行として扱う

同じ意味上のRule/Controlが改訂された場合、既存行を上書きしない。

安定識別子:
- `rule_code`
- `control_code`

Version識別:
- `version_no`

新Version:
- 同じ code
- `version_no + 1`
- `supersedes_*_id` で前Versionを参照

`is_current` は持たない。

### D5. 承認状態をDBで保持する

初期状態:

- `draft`
- `approved`
- `retired`

AIが生成・提案した内容も `draft` から始める。

`approved` へ昇格するには `approved_at` と `approved_by` を必須とする。

AIだけで `approved` へ変更するアプリケーション経路は作らない。

### D6. UNKNOWN を正常な判定状態として前提にする

TaxControlは入力不足・根拠不足を安全扱いしない。

評価契約は将来の `ControlResult` で:

- PASS
- FAIL
- UNKNOWN

を返す。

UNKNOWNをPASSへ自動変換しない。

### D7. TaxRule と TaxSourceVersion は many-to-many

1つのTaxRuleが複数の法令・通達・Q&Aを根拠にする場合がある。

1つのTaxSourceVersionが複数TaxRuleを支える場合もある。

したがって `tax_rule_source_versions` を置く。

### D8. TaxControl と TaxRule も many-to-many

Production Tax Control は複数TaxRuleを組み合わせる可能性がある。

一方、Smoke Controlは法的根拠を持たないデータ品質チェックもある。

したがって `tax_control_rules` を置き、Control側に `tax_rule_id` を直接必須化しない。

---

## 2. `tax_rules`

### 2.1 Purpose

公式根拠から専門家が整理・承認した税務ルールのVersionを保持する。

### 2.2 Columns

```sql
tax_rules
---------
id                   SERIAL PRIMARY KEY
rule_code            TEXT NOT NULL
version_no           INT NOT NULL
tax_type             TEXT NULL
title                TEXT NOT NULL
rule_statement       TEXT NOT NULL
applicability_note   TEXT NULL

effective_from       DATE NULL
effective_to         DATE NULL

status               TEXT NOT NULL DEFAULT 'draft'
supersedes_rule_id   INT NULL REFERENCES tax_rules(id)

proposed_by_kind     TEXT NOT NULL DEFAULT 'human'
approved_by          TEXT NULL
approved_at          TIMESTAMPTZ NULL

created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 2.3 `rule_code`

意味上同じRule系列を表す安定識別子。

例:

```text
CORP_BLUE_RETURN_ELIGIBILITY
CTAX_TAXABLE_BUSINESS_STATUS
INVOICE_REGISTRATION_EFFECT
```

DB ID を業務コードとして使わない。

### 2.4 `version_no`

`rule_code` 単位のVersion番号。

```sql
UNIQUE (rule_code, version_no)
```

初版は 1。

### 2.5 `rule_statement`

専門家レビュー対象となる、SUNBOO上の明示的な税務ルール記述。

公式本文の複製ではない。

例:

```text
対象課税期間について、基準期間等の条件に基づき
消費税の納税義務判定を行う。
```

具体的な機械判定ロジックはここへ埋め込まない。

### 2.6 Effective Time

```text
effective_from
effective_to
```

Rule自体の適用期間。

SourceVersionのeffective期間と同一とは限らない。

```sql
CHECK (
  effective_to IS NULL
  OR effective_from IS NULL
  OR effective_to >= effective_from
)
```

### 2.7 `status`

許可値:

```text
draft
approved
retired
```

CHECK制約を置く。

### 2.8 Approval Invariant

`status = 'approved'` の場合:

```text
approved_by IS NOT NULL
approved_at IS NOT NULL
```

をCHECK制約で要求する。

`retired` は過去のapproved Ruleを無効化する運用状態であり、
レコード削除を意味しない。

### 2.9 `proposed_by_kind`

初期値:

```text
human
ai
system
```

CHECK制約。

AI由来かどうかを明示し、将来の監査に使う。

`proposed_by_kind = 'ai'` でも承認条件は同じ。

### 2.10 Self Supersede

```sql
CHECK (
  supersedes_rule_id IS NULL
  OR supersedes_rule_id <> id
)
```

直接自己参照は禁止。

同一 `rule_code` のVersionを参照しているかは
v0.1ではアプリケーション検証とする。

---

## 3. `tax_rule_source_versions`

### 3.1 Purpose

TaxRule と根拠 TaxSourceVersion の多対多関係。

### 3.2 Columns

```sql
tax_rule_source_versions
------------------------
tax_rule_id             INT NOT NULL REFERENCES tax_rules(id)
tax_source_version_id   INT NOT NULL REFERENCES tax_source_versions(id)
authority_role          TEXT NOT NULL DEFAULT 'primary'
citation_note           TEXT NULL
created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()

PRIMARY KEY (tax_rule_id, tax_source_version_id)
```

### 3.3 `authority_role`

初期値:

```text
primary
supporting
exception
```

CHECK制約。

意味:

- `primary`: Ruleの主要根拠
- `supporting`: 補強根拠
- `exception`: 例外・限定条件の根拠

### 3.4 Provenance Invariant

`approved` TaxRule は最低1件のSourceVersion参照を持つこと。

これは複数テーブルをまたぐため通常のCHECKでは表現しない。

v0.1では承認サービス側の必須検証とする。

後続でDB triggerへ強化可能。

---

## 4. `tax_controls`

### 4.1 Purpose

会社データに対して実行可能な、決定論的チェックVersionを保持する。

### 4.2 Columns

```sql
tax_controls
------------
id                    SERIAL PRIMARY KEY
control_code          TEXT NOT NULL
version_no            INT NOT NULL
control_kind          TEXT NOT NULL
title                 TEXT NOT NULL
description           TEXT NULL

evaluator_key         TEXT NOT NULL
parameters            JSONB NOT NULL DEFAULT '{}'::jsonb
required_inputs       JSONB NOT NULL DEFAULT '[]'::jsonb

default_severity      TEXT NOT NULL DEFAULT 'warning'

effective_from        DATE NULL
effective_to          DATE NULL

status                TEXT NOT NULL DEFAULT 'draft'
is_enabled            BOOLEAN NOT NULL DEFAULT TRUE
supersedes_control_id INT NULL REFERENCES tax_controls(id)

proposed_by_kind      TEXT NOT NULL DEFAULT 'human'
approved_by           TEXT NULL
approved_at           TIMESTAMPTZ NULL

created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 4.3 `control_code`

意味上同じControl系列を表す安定識別子。

ArchitectureのSmoke Control例:

```text
TI_DATA_001
TI_DATA_002
TI_STATE_001
TI_STATE_002
TI_STATE_003
```

### 4.4 `version_no`

```sql
UNIQUE (control_code, version_no)
```

Controlロジックが変わった場合は既存行を上書きせず新Versionを作る。

### 4.5 `control_kind`

初期値:

```text
data_quality
state_consistency
tax_rule
```

CHECK制約。

- `data_quality`: データ品質
- `state_consistency`: SUNBOO内状態整合性
- `tax_rule`: 税務ルールに基づくProduction Control

### 4.6 `evaluator_key`

DBへ任意コードやSQLを保存しない。

アプリケーション側の決定論的Evaluatorを指すキー。

例:

```text
duplicate_fiscal_period
fiscal_date_order
consumption_tax_state_consistency
invoice_registration_consistency
fiscal_month_consistency
```

Evaluator実装はGit管理する。

これにより:

- DB内文字列を動的実行しない
- 判定コードをレビュー可能にする
- E2Eを安定させる
- AIが任意ロジックを本番実行する経路を作らない

### 4.7 `parameters`

Evaluatorへ渡す設定値。

```json
{}
```

または:

```json
{
  "threshold": 10000000
}
```

自由形式JSONBだが、Evaluatorごとにアプリケーション側でschema validationする。

### 4.8 `required_inputs`

Controlが期待する入力を説明する配列。

例:

```json
[
  "company_profile.fiscal_month",
  "tax_return_profile.consumption_tax.status"
]
```

入力が不足する場合、Evaluatorは UNKNOWN を返す。

### 4.9 `default_severity`

初期値:

```text
info
warning
error
critical
```

これは税務調査確率ではない。

ControlResultの対応優先度を表す。

### 4.10 Approval

TaxRuleと同様:

```text
draft
approved
retired
```

`approved` の場合は `approved_by` / `approved_at` 必須。

### 4.11 `is_enabled`

承認状態と運用上の実行可否を分離する。

例:

- approved + enabled = 実行対象
- approved + disabled = 緊急停止
- retired = 歴史保存のみ

`is_enabled` を current-version 判定には使わない。

---

## 5. `tax_control_rules`

### 5.1 Purpose

TaxControl と TaxRule の多対多関係。

Smoke Controlは0件でもよい。

Production Tax Control (`control_kind = 'tax_rule'`) は
最低1件のapproved TaxRule参照を必須とする。

### 5.2 Columns

```sql
tax_control_rules
-----------------
tax_control_id   INT NOT NULL REFERENCES tax_controls(id)
tax_rule_id      INT NOT NULL REFERENCES tax_rules(id)
rule_role        TEXT NOT NULL DEFAULT 'primary'
created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()

PRIMARY KEY (tax_control_id, tax_rule_id)
```

### 5.3 `rule_role`

初期値:

```text
primary
supporting
exception
```

CHECK制約。

### 5.4 Production Invariant

`control_kind = 'tax_rule'` かつ `status = 'approved'` のControlは:

- 最低1件のTaxRuleリンク
- リンク先TaxRuleはapproved
- effective timeが矛盾しない

ことを承認サービス側で検証する。

v0.1ではcross-table triggerを増やしすぎない。

---

## 6. Version / Immutability Policy

### 6.1 Draft

draft中はadminが内容を修正可能。

### 6.2 Approved

approved後の意味内容は原則上書きしない。

TaxRuleの意味内容:

- rule_statement
- applicability_note
- tax_type
- effective_from / effective_to
- SourceVersion関係

TaxControlの意味内容:

- evaluator_key
- parameters
- required_inputs
- default_severity
- effective_from / effective_to
- TaxRule関係

実質的な変更が必要なら新VersionをINSERTする。

### 6.3 v0.1 Enforcement

TI-0.3 migrationでは:

- RLS
- status CHECK
- approval metadata CHECK
- unique version constraints
- self-supersede CHECK

までDBで強制する。

「approved行の意味内容UPDATE禁止」triggerは、
migration実装前レビューで採否を最終決定する。

理由:
- 監査性は高い
- ただしinitial migrationの複雑性も増える
- status retirement等の管理更新と区別が必要

---

## 7. Current Rule / Current Control

`is_current` は保存しない。

対象日 `D` に対して:

```text
status = approved
effective_from IS NULL OR effective_from <= D
effective_to   IS NULL OR effective_to >= D
```

を満たすVersion候補から選択する。

同一codeで期間が重複するapproved Versionを許すかは
v0.1 migrationレビューで再確認する。

推奨:
同一codeのapproved適用期間重複をアプリケーションで禁止し、
必要になればDB exclusion constraintへ強化する。

---

## 8. RLS / GRANT

4テーブルすべて内部Tax Intelligenceデータ。

対象:

```text
tax_rules
tax_rule_source_versions
tax_controls
tax_control_rules
```

方針:

- RLS ENABLE
- anon: 権限なし
- PUBLIC: 権限なし
- authenticated: SELECT / INSERT / UPDATE
- policy条件: `auth.email() IN (SELECT email FROM admin_users)`
- authenticated DELETE: REVOKE
- DELETE policy: 作らない

TI-0.2と同じ内部知識マスタ方針を継続する。

SERIAL sequence:

```text
tax_rules_id_seq
tax_controls_id_seq
```

のみ authenticated admin用にUSAGE / SELECTを付与する。

junction tableは複合主キーのためsequenceなし。

---

## 9. Indexes

### 9.1 `tax_rules`

必須:

```text
UNIQUE (rule_code, version_no)
INDEX (rule_code)
INDEX (status)
INDEX (tax_type)
INDEX (effective_from)
INDEX (effective_to)
INDEX (supersedes_rule_id)
```

### 9.2 `tax_rule_source_versions`

PRIMARY KEYに加えて:

```text
INDEX (tax_source_version_id)
```

逆引き:
「このSourceVersion変更がどのRuleへ影響するか」

に使用する。

### 9.3 `tax_controls`

必須:

```text
UNIQUE (control_code, version_no)
INDEX (control_code)
INDEX (control_kind)
INDEX (status)
INDEX (is_enabled)
INDEX (effective_from)
INDEX (effective_to)
INDEX (evaluator_key)
INDEX (supersedes_control_id)
```

### 9.4 `tax_control_rules`

PRIMARY KEYに加えて:

```text
INDEX (tax_rule_id)
```

逆引き:
「このRule変更でどのControlを再評価するか」

に使用する。

---

## 10. Existing Rule Engineとの境界

既存:

```text
rules
rule_conditions
rule_actions
```

用途:
汎用手続・イベント・業務Rule Engine。

Tax Intelligence:

```text
tax_rules
tax_rule_source_versions
tax_controls
tax_control_rules
```

用途:
税務根拠・税務Control・税務監査可能性。

禁止:

- `rules` を税法マスタへ流用する
- `rule_conditions` に税法本文を埋める
- `rule_actions` でTax Intelligenceを自動承認する
- TaxRuleをpublic_readにする
- TaxSourceVersionを既存rulesへ直接FKする

---

## 11. AI Responsibility Boundary

AIが行ってよい:

- SourceVersion差分要約
- TaxRule draft候補作成
- TaxControl draft候補作成
- 影響Rule/Control候補抽出
- required_inputs候補作成
- 説明文作成

AIだけでは行ってはいけない:

- TaxRule approved
- TaxControl approved
- Source根拠なしRule作成
- arbitrary SQL / code evaluator生成物の自動実行
- UNKNOWNをPASSへ変換
- 過去approved Versionの意味内容上書き

---

## 12. Smoke Controlsとの対応

TI-0.5で最初に実装する5件:

### TI_DATA_001 Duplicate Fiscal Period

```text
control_kind = data_quality
TaxRule link = 0件可
```

### TI_DATA_002 Fiscal Date Order

```text
control_kind = data_quality
TaxRule link = 0件可
```

### TI_STATE_001 Consumption Tax State Consistency

```text
control_kind = state_consistency
TaxRule link = 0件可（MVP）
```

### TI_STATE_002 Invoice Registration Consistency

```text
control_kind = state_consistency
TaxRule link = 0件可（MVP）
```

### TI_STATE_003 Fiscal Month Consistency

```text
control_kind = state_consistency
TaxRule link = 0件可
```

Production Tax Controlでは `control_kind = tax_rule` とし、
approved TaxRuleリンクを必須にする。

---

## 13. TI-0.3 Migration Scope

migrationで作る:

```text
tax_rules
tax_rule_source_versions
tax_controls
tax_control_rules
```

含める:

- tables
- foreign keys
- CHECK constraints
- unique constraints
- indexes
- updated_at triggers
- RLS
- explicit REVOKE
- admin SELECT / INSERT / UPDATE policies
- sequence grants
- validation queries

含めない:

- ControlResult
- ReviewCase
- Smoke Control seed
- Production Control seed
- Source crawler
- Semantic Diff
- AI draft generator
- Control evaluator implementation
- Workspace UI
- automatic re-evaluation

---

## 14. Migration Validation Criteria

TI-0.3 migration適用後、最低限次を確認する。

1. 4テーブルが存在する
2. 4テーブルすべてRLS=true
3. anonにSELECT権限がない
4. authenticated adminがSELECT可能
5. authenticated adminがINSERT可能
6. non-admin authenticatedがSELECT / INSERT不可
7. authenticated DELETEが不可
8. `(rule_code, version_no)` 重複が拒否される
9. `(control_code, version_no)` 重複が拒否される
10. effective date逆転が拒否される
11. approvedでapproval metadataなしが拒否される
12. self-supersedeが拒否される
13. TaxRule → SourceVersion逆引きが可能
14. TaxControl → TaxRule逆引きが可能
15. `updated_at` triggerがRule / Controlで動作する

---

## 15. Open Decisions Before Migration

migration実装前に次の2点だけ最終レビューする。

### O1. approved content immutability trigger

候補:

- 採用: approved後の意味内容UPDATEをDB triggerで拒否
- 非採用: v0.1はアプリケーション規約、TI-0.4以降で強化

推奨:
**採用寄り。**

Tax Intelligenceは過去判定の再現性が重要であり、
Rule/Control Versionを導入する以上、
approved内容の上書きをDBでも防ぐ価値が高い。

ただし `status -> retired` や `is_enabled` の運用更新は許可する。

### O2. approved effective-range overlap

同一 `rule_code` / `control_code` で
approved Versionの有効期間重複をDBで禁止するか。

推奨:
**v0.1ではアプリケーション検証。**

PostgreSQL exclusion constraintまで導入すると、
nullable rangeとfuture version管理がmigrationの主目的を超えて複雑になる。

---

## 16. Decision Summary

TI-0.3の中心判断:

1. 既存`rules`は変更しない
2. `tax_rules`を独立させる
3. `tax_controls`を独立させる
4. RuleとSourceVersionはmany-to-many
5. ControlとRuleもmany-to-many
6. Smoke ControlはRuleリンク0件を許す
7. Production Tax Controlはapproved Ruleを必須にする
8. Rule / Controlはcode + version_noでVersion化する
9. `is_current`は保存しない
10. AI提案はdraftまで
11. approvedには人間のapproval metadata必須
12. ControlはDB内任意コードではなく`evaluator_key`でGit管理Evaluatorを呼ぶ
13. UNKNOWNを正式な評価状態として扱う
14. anon/publicへTax Intelligence内部データを公開しない
15. DELETEは通常アプリケーションから許可しない
16. 過去の根拠・Version・判定再現性を優先する
