# TAX_SOURCE_SCHEMA_DESIGN.md — TaxSource / TaxSourceVersion Schema Design (TI-0.2)

**ステータス: 設計のみ。DB変更・マイグレーションは本Phaseでは行わない。**

本書は `docs/TAX_INTELLIGENCE_ARCHITECTURE.md` の Phase TI-0.2 として、
`TaxSource` / `TaxSourceVersion` の永続化スキーマ、制約、RLS、更新方針を確定する。

---

## 0. 前提

SUNBOOには大きく以下2種類の既存データモデルがある。

- 公開参照マスタ
  - `submission_offices`
  - `office_sources`
  - `rules`
  - `procedures`
- 会社単位の非公開Workspaceデータ
  - `workspace_companies`
  - `workspace_company_profiles`
  - `workspace_tax_return_profiles`
  - `workspace_documents`

TaxSource / TaxSourceVersion はどちらとも完全には同じではない。

公式情報そのものは公開情報だが、
SUNBOO内部で正規化した本文、Version差分、取得状態、将来のRuleとの関連は
SUNBOOの内部税務知識基盤である。

したがってv0.1では以下とする。

```text
anon
  → 読み取り不可

authenticated
  → admin_users登録者のみ読み書き可

service_role / postgres
  → RLSの通常挙動に従う
```

公開画面から直接参照させない。

---

## 1. Design Decisions

### D1. テーブル名

```text
tax_sources
tax_source_versions
```

`workspace_*` prefix は付けない。

理由:
会社単位データではなく、SUNBOO全体で共有する公式税務情報マスタだから。

---

### D2. Primary Key

既存SUNBOOの主要マスタに合わせて `SERIAL PRIMARY KEY` を採用する。

v0.1ではUUIDへ移行しない。

---

### D3. TaxSourceとTaxSourceVersionを分離する

```text
tax_sources
    1
    │
    └── N
        tax_source_versions
```

TaxSourceは恒久的な情報源の識別子。

TaxSourceVersionは、特定時点で取得した内容・版。

現在の内容で過去Versionを上書きしない。

---

## 2. tax_sources

### 2-1. Conceptual schema

```text
id
provider
source_type
tax_type
title
canonical_locator
jurisdiction
is_active
created_at
updated_at
```

### 2-2. Proposed column types

| Column | Type | Null | Notes |
|---|---|---:|---|
| `id` | `SERIAL` | NO | PK |
| `provider` | `TEXT` | NO | 例: `nta`, `e_gov`, `tax_tribunal` |
| `source_type` | `TEXT` | NO | CHECK対象 |
| `tax_type` | `TEXT` | YES | 複数税目横断ソースを許容するためNULL可 |
| `title` | `TEXT` | NO | 公式資料名 |
| `canonical_locator` | `TEXT` | NO | 安定したURLまたは公式識別子 |
| `jurisdiction` | `TEXT` | NO | v0.1 default `JP` |
| `is_active` | `BOOLEAN` | NO | default TRUE |
| `created_at` | `TIMESTAMPTZ` | NO | default NOW() |
| `updated_at` | `TIMESTAMPTZ` | NO | default NOW() |

### 2-3. source_type

Architecture v0.1で定義した値を使用する。

```text
law
cabinet_order
ministerial_ordinance
nta_notice
interpretive_circular
administrative_guideline
written_response
q_and_a
tribunal_decision
other_official
```

DB CHECK制約で不正値を防ぐ。

### 2-4. provider

`provider` はTEXTとし、v0.1ではCHECK制約を付けない。

理由:
将来、財務省・地方自治体・最高裁等の公式情報源を追加する際に
migrationを増やさず拡張できるようにするため。

初期想定値:

```text
nta
e_gov
tax_tribunal
```

### 2-5. tax_type

`tax_type` はv0.1ではnullable TEXTとする。

理由:
国税庁のページ・告示等には複数税目を横断する情報が存在し得るため、
単一税目を強制しない。

将来、必要なら中間テーブル化する。

### 2-6. canonical identity

同一情報源の二重登録を防ぐため、

```text
UNIQUE (provider, canonical_locator)
```

を採用する。

URLそのものだけをグローバルUNIQUEにしない。

理由:
将来URL以外の公式識別子を使用する可能性を残すため。

---

## 3. tax_source_versions

### 3-1. Conceptual schema

```text
id
tax_source_id
version_label
content_hash

published_at
effective_from
effective_to

observed_at
retrieved_at

supersedes_version_id

raw_reference
normalized_text

created_at
```

### 3-2. Proposed column types

| Column | Type | Null | Notes |
|---|---|---:|---|
| `id` | `SERIAL` | NO | PK |
| `tax_source_id` | `INT` | NO | FK → tax_sources(id) |
| `version_label` | `TEXT` | YES | 公式版表示等 |
| `content_hash` | `TEXT` | NO | 正規化本文のhash |
| `published_at` | `DATE` | YES | 公表日のみ判明するケースを想定 |
| `effective_from` | `DATE` | YES | 適用開始日 |
| `effective_to` | `DATE` | YES | 適用終了日 |
| `observed_at` | `TIMESTAMPTZ` | NO | SUNBOOが変更を初めて認識した時刻 |
| `retrieved_at` | `TIMESTAMPTZ` | NO | 実際に取得した時刻 |
| `supersedes_version_id` | `INT` | YES | self FK |
| `raw_reference` | `TEXT` | YES | 原文・snapshotへの参照 |
| `normalized_text` | `TEXT` | NO | 比較・検索用に正規化した本文 |
| `created_at` | `TIMESTAMPTZ` | NO | default NOW() |

### 3-3. Foreign key

```text
tax_source_id
  REFERENCES tax_sources(id)
```

`ON DELETE CASCADE` は付けない。

理由:
TaxSourceの誤削除でVersion履歴が消えることを防ぐ。

TaxSourceは `is_active=false` で廃止する。

### 3-4. Duplicate prevention

同一Sourceで同一内容を複数Versionとして保存しない。

```text
UNIQUE (tax_source_id, content_hash)
```

これをVersion重複防止の主制約とする。

`version_label` は公式側で欠落・再利用される可能性があるため、
主たる重複判定には使用しない。

### 3-5. Version label uniqueness

`version_label` は補助情報とし、
v0.1ではUNIQUE制約を付けない。

### 3-6. Effective date integrity

以下のCHECKを持つ。

```text
effective_to IS NULL
OR effective_from IS NULL
OR effective_to >= effective_from
```

### 3-7. supersedes_version_id

self FKを持つ。

```text
supersedes_version_id
  REFERENCES tax_source_versions(id)
```

同じ`tax_source_id`内のVersionであることは
v0.1ではアプリケーション検証とする。

DB triggerによる強制は後続Phaseで必要性を再評価する。

---

## 4. Immutability Policy

TaxSourceVersionは原則append-onlyで扱う。

以下はVersion作成後に変更しない。

```text
tax_source_id
content_hash
normalized_text
observed_at
retrieved_at
```

`effective_to`等の補助メタデータ補正が必要になる可能性があるため、
v0.1のDBレベルで完全UPDATE禁止にはしない。

ただしアプリケーション実装では、
本文変更を「UPDATE」ではなく「新Version INSERT」とする。

将来、必要ならimmutable column triggerを追加する。

---

## 5. Timestamp Policy

既存SUNBOOの慣例に合わせる。

```text
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

`tax_sources.updated_at` には既存の `update_updated_at()` を使う。

`tax_source_versions` はappend-onlyモデルなので
`updated_at` を持たない。

---

## 6. RLS / GRANT

### 6-1. RLS

両テーブルでRLSを有効化する。

```text
ALTER TABLE tax_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_source_versions ENABLE ROW LEVEL SECURITY;
```

### 6-2. anon

`anon` にはGRANTしない。

`public_read` policyも作らない。

### 6-3. authenticated

`authenticated` には必要なtable権限をGRANTするが、
RLSにより `admin_users` 登録者のみ許可する。

想定policy:

```text
admin_select
admin_insert
admin_update
admin_delete
```

ただし `tax_source_versions` のDELETEはv0.1では許可しない方針を推奨する。

### 6-4. Recommended mutation rights

```text
tax_sources

SELECT  admin only
INSERT  admin only
UPDATE  admin only
DELETE  deny


tax_source_versions

SELECT  admin only
INSERT  admin only
UPDATE  admin only
DELETE  deny
```

物理削除を通常運用にしない。

`tax_sources.is_active=false` とVersion履歴で状態を管理する。

### 6-5. Sequence

SERIALを使うため、
既存パターンに合わせて`authenticated`へsequence usage/selectを許可する。

ただしRLSでINSERT可能なのはadmin_users登録者のみ。

---

## 7. Indexes

v0.1で以下を作成する。

```text
tax_sources(provider, canonical_locator) UNIQUE

tax_sources(source_type)
tax_sources(tax_type)
tax_sources(is_active)

tax_source_versions(tax_source_id)
tax_source_versions(tax_source_id, retrieved_at DESC)
tax_source_versions(effective_from)
tax_source_versions(content_hash)

tax_source_versions(tax_source_id, content_hash) UNIQUE
```

`content_hash`単独UNIQUEにはしない。

異なるTaxSourceが同一本文を持つ可能性を許容する。

---

## 8. Current Version

`is_current`列はv0.1では持たない。

理由:

- 同一Sourceでも将来施行Versionと現行Versionが同時存在し得る
- 「最新取得」と「現在適用中」は意味が異なる
- boolean 1列では時間モデルを正しく表現できない

必要なVersionはクエリ時に、

```text
as_of_date
effective_from
effective_to
observed_at
```

から導出する。

---

## 9. raw_reference / normalized_text

### raw_reference

v0.1ではTEXT。

用途:

```text
公式URL
snapshot path
取得ファイル参照
将来のobject storage key
```

生HTMLそのものを必ずDBへ保存する設計にはしない。

### normalized_text

TaxSourceVersionの比較・検索・将来のSemantic Diff入力に使用する。

元サイトのnavigation、広告、footer等を除いた
「税務上意味のある本文」を保持する想定。

---

## 10. content_hash

hash対象は `normalized_text` とする。

原則SHA-256を使用する。

```text
SHA256(normalized_text)
```

目的:

- 更新有無の高速判定
- 同一内容Versionの重複防止
- Source取得処理のidempotency

v0.1ではDB側でhashを生成せず、
ingestion側で計算した値を保存する。

---

## 11. Update Detection Model

将来の取得処理:

```text
公式Source取得
      ↓
本文正規化
      ↓
content_hash計算
      ↓
既存tax_source_versionsを検索
      ↓

同hashあり
  → 新Versionを作らない
  → retrieved/health telemetryは別途将来設計

同hashなし
  → 新TaxSourceVersionをINSERT
  → supersedes_version_idを設定
  → 後続Semantic Diff候補
```

「取得した回数」と「Version」は分離する。

同じ本文を毎日取得してもVersionを毎日増やさない。

---

## 12. Delete Policy

通常アプリケーションから物理DELETEしない。

理由:

- 過去TaxRuleの根拠追跡が壊れる
- 将来ControlResultのsource snapshotと不整合になる
- Architecture Invariant「過去Versionを破壊しない」に反する

誤登録の物理削除が必要な場合は、
管理者によるSQL Editor等の保守操作として扱う。

---

## 13. Relationship to Future TaxRule

TI-0.2ではTaxRuleテーブルを作らない。

将来:

```text
tax_sources
      ↓
tax_source_versions
      ↓
tax_rule_source_versions
      ↑
tax_rules
```

の多対多relationを追加する。

TaxSourceVersion側に `tax_rule_id` を直接持たせない。

1つのRuleが複数Sourceを根拠にでき、
1つのSourceVersionが複数Ruleを支えられるため。

---

## 14. Migration Scope for TI-0.2

後続migrationで作るもの:

```text
tax_sources
tax_source_versions

CHECK constraints
UNIQUE constraints
indexes
tax_sources updated_at trigger
RLS
admin policies
sequence grants
validation queries
```

作らないもの:

```text
tax_rules
tax_controls
crawler
source fetcher
Semantic Diff
AI
Workspace UI
seed data
```

最初の公式Source投入はPhase TI-0.7で行う。

---

## 15. Validation Criteria

Migration実行後に最低限確認する。

```text
1. tax_sources / tax_source_versions が存在する
2. RLSが両テーブルで有効
3. anonがSELECTできない
4. admin authenticatedがSELECTできる
5. admin authenticatedがINSERTできる
6. 非admin authenticatedがSELECT/INSERTできない
7. 同一(provider, canonical_locator)を二重登録できない
8. 同一(tax_source_id, content_hash)を二重登録できない
9. source削除でversionがCASCADE削除されない
10. tax_sources.updated_at triggerが動作する
```

---

## 16. Decision Summary

TI-0.2の確定方針:

```text
TaxSource
  = 恒久的な公式情報源

TaxSourceVersion
  = 特定時点の内容

公開情報だがSUNBOO内部マスタとして扱う
  → anonには公開しない

Version履歴
  → append-only

重複判定
  → (tax_source_id, content_hash)

現在Version
  → is_currentを保存せず時点から導出

削除
  → 通常運用では禁止

既存Company Workspace
  → 変更しない
```

この設計をレビュー・確定後、
`migration_tax_sources.sql` の実装へ進む。
