# CONTROL_RESULT_REVIEW_CASE_SCHEMA_DESIGN.md — ControlResult / ReviewCase Schema Design (TI-0.4)

Status: Design only
Phase: TI-0.4
Scope: company-scoped ControlResult / ReviewCase persistence and review history
Out of scope: Smoke Control evaluator implementation / Workspace Review UI / Production Tax Control / automatic source update re-evaluation

---

## 0. 前提

TI-0.1〜TI-0.3で以下を導入済み。

```text
TaxSource
  ↓
TaxSourceVersion
  ↓ many-to-many
TaxRule
  ↓ many-to-many
TaxControl
```

TI-0.4では、会社に対してTaxControlを実行した結果と、税理士が確認・解決するReviewCaseを永続化する。

TaxSource / TaxRule / TaxControlはSUNBOO全体で共有する内部Tax Intelligence知識。
ControlResult / ReviewCaseは会社固有データなので、既存Company Workspaceの会社単位アクセス制御を継承する。

基本関係:

```text
workspace_companies
       │
       ↓
workspace_tax_control_results
       │ 0..1
       ↓
workspace_tax_review_cases
       │ 1..N
       ↓
workspace_tax_review_case_events

workspace_tax_control_results
       ↑
   tax_controls
```

`workspace_tax_review_case_events` は独立したProduct Objectではなく、ReviewCaseのresolution履歴を失わないための監査用supporting tableとする。

---

## 1. Terminology Decision: PASS / REVIEW / UNKNOWN

### 1.1 Architectureを正とする

ControlResultのcanonicalな判定状態は:

```text
pass
review
unknown
```

とする。`fail` はControlResultのDB statusとして採用しない。

### 1.2 理由

税務Controlにおいて、機械検査で不整合や論点が見つかったことと、最終的な税務違反・誤申告が確定したことは同じではない。

```text
PASS    = Control上の確認事項なし
REVIEW  = 人間による確認が必要
UNKNOWN = 情報不足・根拠不足等で判定不能
```

`REVIEW` は「税務上誤りが確定した」という意味ではない。

### 1.3 TI-0.3 wording drift

TI-0.3設計書には一部 `PASS / FAIL / UNKNOWN` の表現が残っている。
TI-0.4設計ではArchitectureに合わせて `PASS / REVIEW / UNKNOWN` を正とし、TI-0.4設計PR内でTI-0.3文書の該当表現も整合させる。

`UNKNOWN != PASS` は不変条件。

---

## 2. Design Decisions

### D1. Company-scoped tableは `workspace_` prefixを付ける

採用:

```text
workspace_tax_control_results
workspace_tax_review_cases
workspace_tax_review_case_events
```

理由:

- `company_id` を持つ
- Company WorkspaceのRLSを受ける
- TaxSource / TaxRule / TaxControlの共有Knowledgeと境界を明示できる
- share link等へ誤って公開する可能性を下げる

### D2. ControlResultはappend-only

同じ会社・同じControlを再実行しても、既存結果をUPDATEしない。

```text
2026-08-11 UNKNOWN
2026-08-15 PASS
```

のように両方を保持する。

### D3. exact TaxControl VersionをFKで固定する

`tax_control_id` はVersion化された `tax_controls.id` を参照する。
TaxControlはapproved後の意味内容がimmutableなので、過去Resultから実行時Control Versionへ戻れる。

### D4. evaluator versionもResultへsnapshotする

実際にどのコードrevisionで判定したか再現できるよう、ControlResultに `evaluator_version` を保存する。

想定値:

```text
git commit SHA
build revision
application evaluator version
```

### D5. Source provenance snapshotをResultへ保持する

Production Tax Controlでは、実行時に参照対象だったTaxSourceVersionをsnapshotする。

例:

```json
[
  {
    "tax_rule_id": 12,
    "tax_source_version_id": 41,
    "content_hash": "..."
  }
]
```

Smoke Controlでは空配列を許す。

### D6. observed_inputsは「判定に使った事実」のsnapshot

`observed_inputs` はEvaluatorが実際に読んだ正規化済み入力を保存する。
巨大な原本PDFや添付ファイル本体をJSONへ複製しない。

### D7. `applicable=false` をPASSに偽装しない

Architectureには `applicable` と `status` の両方がある。

TI-0.4では:

```text
applicable = false
status     = NULL
```

を許す。

`applicable = true` の場合のみ:

```text
pass
review
unknown
```

をstatusに入れる。

### D8. ReviewCaseはREVIEW / UNKNOWN Resultだけに作れる

ReviewCaseは次のControlResultのみ参照可能。

```text
applicable = true
status IN ('review', 'unknown')
```

PASSや判定対象外ResultにReviewCaseを作らない。DB triggerで検証する。

### D9. 1 ControlResultにつきReviewCaseは最大1件

```sql
UNIQUE (control_result_id)
```

同じCaseの再確認・再openはReviewCase自体の状態遷移とReviewCaseEvent履歴で表現する。

### D10. ReviewCase current stateとhistoryを分離する

`workspace_tax_review_cases` は現在状態。
`workspace_tax_review_case_events` はappend-only履歴。

ReviewCaseのresolutionを上書きして過去判断を消さない。

### D11. Result / Eventは通常アプリケーションからDELETEしない

ControlResult:

```text
SELECT / INSERT
UPDATE不可
DELETE不可
```

ReviewCase:

```text
SELECT / INSERT / UPDATE
DELETE不可
```

ReviewCaseEvent:

```text
SELECT
INSERT不可（自動trigger経由のみ）
UPDATE不可
DELETE不可
```

ReviewCaseEventは監査履歴なので、通常クライアントから任意Eventを追加させない。

### D12. Share Linkへ自動露出しない

Tax IntelligenceのResult / ReviewCaseは既存shared workspace RPCやshare sectionsへ自動追加しない。
外部共有が必要になった場合は別Phaseで明示的に設計する。

---

## 3. `workspace_tax_control_results`

### 3.1 Purpose

特定会社に対して、特定VersionのTaxControlを特定基準日で実行した結果をappend-onlyで保存する。

### 3.2 Columns

```sql
workspace_tax_control_results
-----------------------------
id                       SERIAL PRIMARY KEY
company_id               INT NOT NULL
tax_control_id           INT NOT NULL

as_of_date               DATE NOT NULL

applicable               BOOLEAN NOT NULL
status                   TEXT NULL

reason_code              TEXT NOT NULL
reason_summary           TEXT NOT NULL

observed_inputs          JSONB NOT NULL DEFAULT '{}'::jsonb
source_version_snapshot  JSONB NOT NULL DEFAULT '[]'::jsonb

evaluated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
evaluator_version        TEXT NOT NULL

created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 3.3 `company_id`

```sql
REFERENCES workspace_companies(id) ON DELETE CASCADE
```

会社自体を削除する場合はWorkspace全体のdata lifecycleに従う。
個別ControlResultのDELETE許可とは別の概念。

### 3.4 `tax_control_id`

```sql
REFERENCES tax_controls(id)
```

`ON DELETE CASCADE` は付けない。

### 3.5 `as_of_date`

「いつの事実・制度状態を対象として評価したか」。`evaluated_at` と異なる。

```text
as_of_date   = 2025-03-31
evaluated_at = 2026-08-11T01:30:00+09
```

### 3.6 `applicable` / `status`

制約:

```text
applicable = false
  -> status IS NULL

applicable = true
  -> status IN ('pass', 'review', 'unknown')
```

情報不足は原則 `applicable=true / status=unknown`。
明確な対象外だけ `applicable=false / status=NULL`。

### 3.7 `reason_code`

機械可読な安定理由コード。

例:

```text
duplicate_fiscal_period
date_order_invalid
state_mismatch
missing_required_input
not_applicable
consistent
```

### 3.8 `reason_summary`

人間向け短文。AIが補助説明を生成してもstatus自体は変更しない。

### 3.9 `observed_inputs`

JSON object。CHECK:

```sql
jsonb_typeof(observed_inputs) = 'object'
```

### 3.10 `source_version_snapshot`

JSON array。CHECK:

```sql
jsonb_typeof(source_version_snapshot) = 'array'
```

Smoke Controlは `[]` を許す。

### 3.11 `evaluator_version`

空文字は禁止する。

```sql
CHECK (length(trim(evaluator_version)) > 0)
```

### 3.12 No Result Deduplication

次のUNIQUEは置かない。

```text
(company_id, tax_control_id, as_of_date)
```

同日再実行も履歴として意味があるため。

---

## 4. ControlResult Immutability

### 4.1 Application privilege

authenticatedに `SELECT / INSERT` のみ付与。
`UPDATE / DELETE` はREVOKE。

### 4.2 DB trigger

v0.1からDB triggerで:

```text
UPDATE -> reject
```

する。

DELETEは通常アプリケーションにGRANTせず、RLS policyも作らない。
ただし `workspace_companies` 削除時の `ON DELETE CASCADE` を成立させるため、
child rowのDELETEを無条件に拒否するBEFORE DELETE triggerは置かない。

個別Result削除の禁止は privilege / RLS で強制し、
会社全体削除というdata lifecycleとは分離する。

### 4.3 Correction model

誤ったResultを修正する場合もUPDATEしない。新ResultをINSERTする。

将来必要なら `supersedes_result_id` を追加できるが、TI-0.4 v0.1では導入しない。

---

## 5. `workspace_tax_review_cases`

### 5.1 Purpose

REVIEWまたはUNKNOWNのControlResultについて、税理士が実務上確認し、現在の対応状態を管理する。

### 5.2 Columns

```sql
workspace_tax_review_cases
--------------------------
id                    SERIAL PRIMARY KEY
company_id            INT NOT NULL
control_result_id     INT NOT NULL

status                TEXT NOT NULL DEFAULT 'open'

title                 TEXT NOT NULL
issue_summary         TEXT NOT NULL

resolution_summary    TEXT NULL
resolved_by           TEXT NULL
resolved_at           TIMESTAMPTZ NULL

created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 5.3 Company / Result consistency

ControlResult側に:

```sql
UNIQUE (id, company_id)
```

ReviewCase側に:

```sql
FOREIGN KEY (control_result_id, company_id)
REFERENCES workspace_tax_control_results(id, company_id)
ON DELETE CASCADE
```

を置く。

通常アプリケーションからControlResult DELETEは許可しないため、
このCASCADEは主に会社全体削除時のdata lifecycleを成立させるために使う。

### 5.4 `control_result_id`

```sql
UNIQUE (control_result_id)
```

1 ResultにつきCaseは最大1件。

### 5.5 `status`

Architectureの3値:

```text
open
resolved
dismissed
```

を採用する。

### 5.6 Resolution metadata invariant

`status = 'open'`:

```text
resolution_summary IS NULL
resolved_by        IS NULL
resolved_at        IS NULL
```

`status IN ('resolved', 'dismissed')`:

```text
resolution_summary IS NOT NULL
resolved_by        IS NOT NULL
resolved_at        IS NOT NULL
```

### 5.7 `resolved_by`

TEXT。`admin_users(email)` FKにはしない。
履歴上のactor identifierをアカウント削除で壊さないため。

### 5.8 ReviewCase creation validation

INSERT時に参照Resultと初期状態を検証する。

許可:

```text
result.applicable = true
result.status IN ('review', 'unknown')
case.status = 'open'
resolution_summary IS NULL
resolved_by IS NULL
resolved_at IS NULL
```

拒否:

```text
pass
not applicable
resolved / dismissed での直接INSERT
```

DB triggerで強制する。

ReviewCaseは必ず `open` から開始し、
解決・却下は後続UPDATEとして履歴化する。

### 5.9 Status transition invariant

v0.1で許可する遷移は:

```text
open -> resolved
open -> dismissed
resolved -> open
dismissed -> open
```

のみ。

次は拒否する:

```text
resolved -> dismissed
dismissed -> resolved
```

解決結果を別の解決結果へ直接上書きせず、
必ず一度 `open` へreopenしてから再判断する。
これによりReviewCaseEventの意味を曖昧にしない。

---

## 6. `workspace_tax_review_case_events`

### 6.1 Purpose

ReviewCaseのresolution / status履歴をappend-onlyで保持する。

ReviewCase current rowだけでは:

```text
open
→ resolved
→ reopened
→ dismissed
```

の履歴が消えるためsupporting tableを持つ。

### 6.2 Columns

```sql
workspace_tax_review_case_events
--------------------------------
id                  SERIAL PRIMARY KEY
company_id          INT NOT NULL
review_case_id      INT NOT NULL

event_type          TEXT NOT NULL
from_status         TEXT NULL
to_status           TEXT NULL

event_summary       TEXT NULL
actor_email         TEXT NULL

case_snapshot       JSONB NOT NULL DEFAULT '{}'::jsonb

created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 6.3 `event_type`

```text
opened
resolution
dismissal
reopened
```

CHECK制約。

v0.1ではmanual `note` eventを作らない。
任意メモが必要になった場合は、監査Eventを偽装できない専用経路を別設計する。

### 6.4 Company / Case consistency

ReviewCase側に:

```sql
UNIQUE (id, company_id)
```

Event側に:

```sql
FOREIGN KEY (review_case_id, company_id)
REFERENCES workspace_tax_review_cases(id, company_id)
ON DELETE CASCADE
```

を置く。

通常アプリケーションからReviewCase DELETEは許可しない。
このCASCADEも会社全体削除時のdata lifecycle用。

### 6.5 `case_snapshot`

イベント発生後のReviewCase主要状態をJSON snapshotする。

```sql
CHECK (jsonb_typeof(case_snapshot) = 'object')
```

### 6.6 Append-only / write boundary

authenticatedには `SELECT` のみ付与する。

通常クライアントからの:

```text
INSERT
UPDATE
DELETE
```

は許可しない。

EventはReviewCase triggerだけが作る。
これによりクライアントが `resolution` や `dismissal` Eventを任意に捏造できない。

### 6.7 Automatic events

ReviewCaseの以下操作はDB triggerから自動Eventを作る。

```text
INSERT                     -> opened
open -> resolved           -> resolution
open -> dismissed          -> dismissal
resolved/dismissed -> open -> reopened
```

5.9でその他のstatus遷移自体を拒否するため、
`status_changed` の汎用Eventはv0.1では持たない。

自動Event INSERT用trigger functionは `SECURITY DEFINER` とし、
`SET search_path = public, pg_temp` を固定する。
通常authenticated roleにはEvent INSERT policyを作らない。

UIがEventを書き忘れてもresolution historyが欠落せず、
UIが履歴を作り替えることもできないようにする。

### 6.8 Transaction rule

ReviewCase更新とEvent追加は同一transactionで成功または失敗させる。
履歴だけ欠落した状態を作らない。

---

## 7. Reopen Policy

resolved / dismissed Caseを再確認する必要がある場合、同じReviewCaseを `open` へ戻すことを許可する。

その際current rowは:

```text
resolution_summary = NULL
resolved_by        = NULL
resolved_at        = NULL
```

へ戻す。

過去resolutionはReviewCaseEventに残る。

新しいControlResultが原因で新しい論点が発生した場合は、新Resultに対して新ReviewCaseを作る。

---

## 8. Workspace RLS

### 8.1 General gate

すべて:

```text
authenticated
+
auth.email() IN (SELECT email FROM admin_users)
+
is_workspace_member(company_id, ...)
```

を使用する。

### 8.2 ControlResult

SELECT:

```sql
is_workspace_member(company_id)
```

INSERT:

```sql
is_workspace_member(company_id, ARRAY['owner', 'member'])
```

UPDATE / DELETEは許可しない。

### 8.3 ReviewCase

SELECT: owner / member / viewer

INSERT / UPDATE: owner / member

DELETE: 不可

### 8.4 ReviewCaseEvent

SELECT: owner / member / viewer

INSERT / UPDATE / DELETE: 通常authenticatedには不可

INSERTはReviewCaseの自動history triggerのみが行う。

### 8.5 anon / PUBLIC

3テーブルすべて:

```text
REVOKE ALL FROM anon
REVOKE ALL FROM PUBLIC
```

public read policyを作らない。

---

## 9. Share Link Boundary

TI-0.4では次をshare RPCへ追加しない。

```text
workspace_tax_control_results
workspace_tax_review_cases
workspace_tax_review_case_events
```

未確定の税務論点、observed_inputs、resolution履歴を外部共有へ意図せず露出させないため。

---

## 10. Indexes

### 10.1 `workspace_tax_control_results`

```text
INDEX (company_id)
INDEX (tax_control_id)
INDEX (company_id, as_of_date DESC)
INDEX (company_id, tax_control_id, as_of_date DESC, evaluated_at DESC)
INDEX (company_id, status)
INDEX (evaluated_at DESC)
```

### 10.2 `workspace_tax_review_cases`

```text
UNIQUE (control_result_id)
UNIQUE (id, company_id)
INDEX (company_id)
INDEX (company_id, status)
INDEX (company_id, updated_at DESC)
INDEX (resolved_at)
```

### 10.3 `workspace_tax_review_case_events`

```text
INDEX (company_id)
INDEX (review_case_id, created_at)
INDEX (company_id, created_at DESC)
INDEX (event_type)
```

---

## 11. Query Model

### 11.1 Latest Result per Control

保存上はappend-only。UIの「現在の結果」はqueryで導出する。
`is_current` はResultにも持たない。

### 11.2 Historical Result

過去Resultは:

```text
ControlResult
→ exact tax_control_id
→ TaxControl Version
→ TaxRule
→ TaxSourceVersion
```

まで追跡できる。

### 11.3 Review queue

```text
workspace_tax_review_cases
WHERE company_id = ?
  AND status = 'open'
ORDER BY created_at
```

Priority / SLAはTI-0.4 v0.1では追加しない。

---

## 12. Evaluator Contract

EvaluatorはControlResult INSERTに必要なpayloadを返す。

```ts
{
  applicable: boolean
  status: 'pass' | 'review' | 'unknown' | null
  reasonCode: string
  reasonSummary: string
  observedInputs: object
  sourceVersionSnapshot: array
  evaluatorVersion: string
}
```

不変条件:

```text
applicable=false
  => status=null

applicable=true
  => status=pass|review|unknown

unknown
  => passへ自動変換しない
```

AIは説明補助には使えるが、statusを書き換えたりReviewCaseをresolvedにしたりしない。

---

## 13. Result Creation / Review Flow

```text
Company Workspace facts
       ↓
Read Model
       ↓
TaxControl evaluator
       ↓
ControlResult INSERT
       │
       ├── applicable=false -> no ReviewCase
       ├── pass             -> no ReviewCase
       ├── review           -> ReviewCase create
       └── unknown          -> ReviewCase create
```

Review:

```text
ReviewCase open
       ↓
税理士確認
       ↓
resolved / dismissed
       ↓
ReviewCaseEvent append
```

新事実・新Control Versionで再評価する場合は新ControlResultをINSERTし、旧Resultは変更しない。

---

## 14. Delete / Data Lifecycle Policy

通常アプリケーションでは:

```text
ControlResult DELETE   = denied
ReviewCase DELETE      = denied
ReviewCaseEvent DELETE = denied
```

ただし、child tableに無条件DELETE拒否triggerは置かない。

cascade chain:

```text
workspace_companies
  -> workspace_tax_control_results
  -> workspace_tax_review_cases
  -> workspace_tax_review_case_events
```

には `ON DELETE CASCADE` を採用する。

個別履歴DELETEは privilege / RLS で拒否し、
会社全体削除時だけWorkspace data lifecycleとして連鎖削除できるようにする。

---

## 15. Constraints Summary

### ControlResult

```text
FK company_id -> workspace_companies
FK tax_control_id -> tax_controls
UNIQUE (id, company_id)
CHECK applicable/status consistency
CHECK observed_inputs is JSON object
CHECK source_version_snapshot is JSON array
CHECK evaluator_version not blank
immutable UPDATE trigger
DELETE denied by privilege / RLS; company cascade remains possible
```

### ReviewCase

```text
composite FK (control_result_id, company_id)
UNIQUE (control_result_id)
UNIQUE (id, company_id)
CHECK status open/resolved/dismissed
CHECK resolution metadata consistency
trigger: Result must be review/unknown and initial status must be open
trigger: only open->resolved/dismissed and resolved/dismissed->open
updated_at trigger
```

### ReviewCaseEvent

```text
composite FK (review_case_id, company_id)
CHECK event_type
CHECK case_snapshot is JSON object
no direct authenticated INSERT / UPDATE / DELETE
automatic SECURITY DEFINER event creation from ReviewCase status changes
```

---

## 16. TI-0.4 Migration Scope

migrationで作る:

```text
workspace_tax_control_results
workspace_tax_review_cases
workspace_tax_review_case_events
```

含める:

- tables
- foreign keys
- composite company consistency foreign keys
- CHECK constraints
- indexes
- ControlResult UPDATE immutability trigger
- ReviewCase creation validation trigger
- ReviewCase status transition validation trigger
- ReviewCase updated_at trigger
- ReviewCase automatic history trigger (`SECURITY DEFINER`, pinned search_path)
- ReviewCaseEvent direct write denial
- lifecycle-safe `ON DELETE CASCADE` chain
- RLS
- explicit anon / PUBLIC revoke
- Workspace member policies
- sequence grants
- validation queries

含めない:

- Control evaluator implementation
- 5 Smoke Control seed
- automatic ReviewCase creation service
- Review UI
- AI explanation generation
- Evidence model
- attachment storage
- Tax Decision object
- SLA / assignment system
- notification
- source update re-evaluation

---

## 17. Validation Criteria

TI-0.4 migration適用後、最低限次を検証する。

1. 3テーブルが存在する
2. 3テーブルすべてRLS=true
3. anonにSELECT権限がない
4. PUBLICに権限がない
5. workspace viewerは自社Result / Case / EventをSELECT可能
6. workspace viewerはINSERT / UPDATE不可
7. owner/memberは自社ControlResultをINSERT可能
8. owner/memberは他社ControlResultをINSERT不可
9. ControlResult UPDATEが拒否される
10. ControlResult DELETEが拒否される
11. applicable=false + status!=NULLが拒否される
12. applicable=true + invalid statusが拒否される
13. observed_inputsがobject以外なら拒否される
14. source_version_snapshotがarray以外なら拒否される
15. evaluator_version空文字が拒否される
16. pass ResultにReviewCaseを作れない
17. not applicable ResultにReviewCaseを作れない
18. review Resultにopen ReviewCaseを作れる
19. unknown Resultにopen ReviewCaseを作れる
20. resolved / dismissed ReviewCaseの直接INSERTが拒否される
21. Resultと異なるcompany_idのReviewCaseが拒否される
22. 同一Resultに2つ目のReviewCaseを作れない
23. open Caseにresolution metadataを入れた不整合が拒否される
24. resolved Caseでresolution metadata不足が拒否される
25. resolved -> dismissed / dismissed -> resolved の直接遷移が拒否される
26. reopen時にcurrent resolution metadataがNULLへ戻る
27. ReviewCase status変更でEventが自動追加される
28. authenticatedからReviewCaseEventを直接INSERTできない
29. ReviewCaseEvent UPDATEが拒否される
30. ReviewCaseEvent DELETEが拒否される
31. 他社memberからResult / Case / Eventが見えない
32. share link経由でTI-0.4データが露出しない
33. 過去Resultからexact TaxControl Versionを逆引きできる
34. company deletion時にResult -> Case -> EventがCASCADEできる

---

## 18. TI-0.5 Handoff

TI-0.4完了後、TI-0.5で5 Smoke Controlsを実装する。

```text
1. company data read
2. approved/enabled Control取得
3. evaluator_keyでdeterministic evaluator実行
4. ControlResult INSERT
5. review / unknownならReviewCase作成
```

最初の5件:

```text
TI_DATA_001
TI_DATA_002
TI_STATE_001
TI_STATE_002
TI_STATE_003
```

TI-0.5でappend-only / UNKNOWN / Review flowをE2E検証する。

---

## 19. Decision Summary

1. company固有データなので `workspace_` prefixを採用する
2. ControlResultはappend-only
3. canonical statusはPASS / REVIEW / UNKNOWN
4. FAILはDB outcomeとして採用しない
5. applicable=falseをPASS扱いしない
6. Resultはexact TaxControl Versionを参照する
7. as_of_dateとevaluated_atを分離する
8. evaluator_versionをResultへsnapshotする
9. observed_inputsをResultへsnapshotする
10. source_version_snapshotで実行時根拠集合を保存する
11. REVIEW / UNKNOWNのみReviewCaseを作れる
12. 1 ResultにつきReviewCaseは最大1件
13. ReviewCase current stateと履歴を分離する
14. ReviewCaseEventをappend-only監査履歴として持つ
15. ReviewCaseは必ずopenから開始し、許可された状態遷移だけを通す
16. ReviewCase status変更はDB triggerでEvent化する
17. ReviewCaseEventは通常クライアントから直接INSERTさせない
18. Result / EventはUPDATEしない
19. Result / Case / Eventは通常アプリからDELETEしない
20. DELETE禁止はprivilege/RLSで行い、会社全体CASCADEを壊すDELETE triggerは置かない
21. Workspaceのmember-scoped RLSを継承する
22. viewerはread-only、owner/memberが実務操作する
23. share linkにはTI-0.4データを自動露出しない
24. AIは説明補助までで、status / resolutionの最終判断を行わない
25. 過去判定・根拠・resolution履歴の再現性を最優先する
