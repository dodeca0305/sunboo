# TAX_INTELLIGENCE_ARCHITECTURE.md — SUNBOO Tax Intelligence Architecture v0.1

**ステータス: 設計のみ。DB変更・マイグレーション・公式情報取得・AI実装・画面実装は本Phaseでは行わない。**

SUNBOO Tax Intelligenceは、Company Workspace上の会社データと、
対象時点で有効な公式税務情報を照合し、
税理士が申告・判断前に確認すべき事項を根拠付きで発見するための基盤である。

KSK2の非公開ロジックを再現することは目的としない。

---

## 0. 既存SUNBOOとの関係

既存Company Workspaceには以下が存在する。

- Company Profile
- Tax Return Profile
- Timeline
- State
- Annual Roadmap
- Procedure Status
- Documents
- Share

既存のTimeline / State / Roadmap / Rule Engine等は変更しない。

Tax Intelligenceは横に独立した判定系を追加する。

```text
CompanyProfile
TaxReturnProfile
Events
      ↓
Timeline
      ↓
State
      ↓
Roadmap

        ＋

Company Data
      ×
TaxSourceVersion
      ×
TaxRule
      ↓
TaxControl
      ↓
ControlResult
      ↓
ReviewCase
```

Accounting Data、Evidence Graph、AI Tax Adviserの詳細設計は後続Phaseとする。

---

## 1. Purpose

中心となる問いは次の1つである。

> この会社についてSUNBOOが把握している事実を、
> 対象時点で有効な公式税務根拠と照合すると、
> 税理士が確認すべき事項は何か。

基本フロー:

```text
公式情報
↓
Version管理
↓
TaxRule
↓
TaxControl
↓
PASS / REVIEW / UNKNOWN
↓
税理士レビュー
↓
解決
```

---

## 2. Non-goals

v0.1では以下を行わない。

- KSK2非公開ロジックの推測・再現
- 税務調査対象確率の算出
- 根拠不明な総合リスクスコア
- 税務調査回避を目的とする機能
- AI単独による最終税務判断
- AIによるTaxRuleの自動本番反映
- 全税目・全通達への一括対応
- Accounting Dataスキーマの確定
- Evidence Graphの実装
- 裁決・判例からの自動TaxRule生成

---

## 3. Design Principles

### 3-1. Official Source First

税務判定に使用するRuleは、原則として公式根拠への参照を持つ。

「AIが知っているから」は根拠として扱わない。

### 3-2. Version First

TaxRuleは常に、どのTaxSourceVersionを根拠にしたか追跡可能にする。

現在の最新版だけを保存して過去版を上書きしない。

### 3-3. Effective Time First

以下を区別する。

```text
published_at
情報が公表された時点

effective_from
そのRuleが適用され始める時点

effective_to
適用終了時点

observed_at
SUNBOOがそのVersionを認識した時点
```

### 3-4. Traceability

すべてのControlResultから以下を逆引き可能にする。

```text
ControlResult
↓
TaxControl
↓
TaxRule
↓
TaxSourceVersion
↓
TaxSource
```

### 3-5. Deterministic Before AI

数式・比較・日付・状態の組合せで判定できるものは、
AIではなく決定論的ロジックで判定する。

### 3-6. Human Approval

AIはRule変更案を作成できるが、
本番Ruleへの昇格は税理士等の人間による承認を必須とする。

### 3-7. UNKNOWN is a valid result

情報不足・根拠不足・解釈不能をPASSとして扱わない。

判定できない場合はUNKNOWNとする。

---

## 4. Source Authority Model

税務情報を単一の「通達」テーブルにまとめない。

少なくとも以下の`source_type`を区別できる設計とする。

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

初期Source System候補:

```text
e-Gov 法令検索
国税庁 法令等
国税庁 法令解釈通達
国税庁 文書回答事例
国税庁 質疑応答事例
国税不服審判所
```

単純な「Aランク > Bランク」の数値だけで法的意味を代替しない。

`source_type`、対象税目、適用期間、事実関係等を保持し、
最終判断はTaxRuleと専門家レビューで行う。

---

## 5. Core Objects

v0.1の永続化候補オブジェクトは6種類に限定する。

| Object | 役割 |
|---|---|
| `TaxSource` | 公式情報源そのものの識別 |
| `TaxSourceVersion` | 特定時点の内容・版 |
| `TaxRule` | 公式根拠から整理された税務ルール |
| `TaxControl` | 会社データに対して実行するチェック |
| `ControlResult` | Control実行結果 |
| `ReviewCase` | 税理士が確認・解決する案件 |

Company Fact専用の巨大な新テーブルはv0.1では作らない。

既存CompanyProfile / TaxReturnProfile等から実行時に必要な入力を組み立てる。

---

## 6. TaxSource

TaxSourceは「情報源の恒久的な識別子」。

概念フィールド:

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
```

本文そのものはTaxSourceではなくTaxSourceVersion側に保持する。

---

## 7. TaxSourceVersion

同じTaxSourceの内容が変更されるたびにVersionを追加する。

概念フィールド:

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

既存VersionをUPDATEして履歴を消さない。

変更時は新VersionをINSERTする。

---

## 8. TaxRule

TaxRuleは公式文章そのものではない。

公式情報から、

> どの事実条件に対して、どの確認が必要になるか

をSUNBOO用に整理したRuleである。

概念フィールド:

```text
id
rule_key
tax_type
topic

title
summary

applicability_definition
expected_condition

effective_from
effective_to

status
draft
approved
retired

approved_by
approved_at

created_at
updated_at
```

TaxRuleとTaxSourceVersionは多対多で関連できるものとする。

1つのRuleが複数の法令・通達等を根拠にするケースを許容する。

---

## 9. TaxControl

TaxControlはTaxRuleを会社データに対して実行可能にしたもの。

概念フィールド:

```text
id
control_key
tax_rule_id

control_class
data_integrity
tax_rule

required_inputs
evaluator_type

deterministic
manual_assist

evaluator_version

is_enabled
created_at
updated_at
```

AIを直接evaluatorとして使用しない。

AIが必要な場合でも、AI出力は`review candidate`として扱う。

---

## 10. ControlResult

会社に対してTaxControlを実行した結果。

概念フィールド:

```text
id
company_id
tax_control_id

as_of_date

applicable

status
pass
review
unknown

reason_code
reason_summary

observed_inputs
source_version_snapshot

evaluated_at
evaluator_version
```

重要なのは、

```text
UNKNOWN != PASS
```

である。

---

## 11. ReviewCase

REVIEWまたはUNKNOWNのControlResultについて、
税理士が実務上の確認を行う単位。

概念フィールド:

```text
id
company_id
control_result_id

status
open
resolved
dismissed

title
issue_summary

resolution_summary
resolved_by
resolved_at

created_at
updated_at
```

v0.1ではTaxDecisionを独立オブジェクトとして作らない。

ReviewCaseのresolution履歴を蓄積し、
将来的にTax Decision Memoryへ発展させる。

---

## 12. Company Workspaceとの接続

Tax Intelligenceのために既存Engineを書き換えない。

実行時に以下から必要情報を読む。

```text
workspace_companies
workspace_company_profiles
workspace_tax_return_profiles
workspace_procedure_statuses
workspace_documents
```

将来は以下を追加できるようにする。

```text
Accounting Data
Payroll
Fixed Assets
e-Tax Data
Evidence
```

TaxControl入力用のRead Modelは作成してよいが、
v0.1では新しいCompany Fact永続化モデルは導入しない。

---

## 13. Time Model

税務情報では「現在のRule」だけでは不十分。

最低限、以下を保持する。

```text
TaxSourceVersion.effective_from
TaxSourceVersion.effective_to

TaxRule.effective_from
TaxRule.effective_to

ControlResult.as_of_date
```

これにより将来、

> 2025年3月31日の取引について、
> 当時有効だったRuleを使って再評価する

ことを可能にする。

完全なBitemporal Engineは将来スコープとするが、
`effective time`と`observed time`を保存する設計はv0.1から採用する。

---

## 14. Official Source Update Flow

将来の更新検知フローは次とする。

```text
Official Source
      ↓
取得
      ↓
content_hash比較
      ↓
変更あり
      ↓
TaxSourceVersion追加
      ↓
Semantic Diff
      ↓
影響TaxRule候補
      ↓
AIによる変更案
      ↓
税理士レビュー
      ↓
TaxRule approved
      ↓
関連TaxControl再評価
      ↓
影響Company抽出
      ↓
ReviewCase
```

重要:

**AIによる変更案を自動でapprovedにしない。**

---

## 15. AI Responsibility Boundary

AIに許可する役割:

```text
公式文書の要約
旧Versionと新Versionの差分説明
論点分類
TaxRule変更候補の作成
影響するControl候補の抽出
ReviewCaseの説明文作成
税理士向け確認質問の作成
```

AIに許可しない役割:

```text
根拠のないTaxRule作成
TaxRuleの自動承認
最終的な税務判断
UNKNOWNをPASSへ変更
出典の捏造
```

---

## 16. MVP Smoke Controls

Architecture実装の最初は、
複雑な税法判定より先に既存データだけでControl Engineを検証する。

以下5件をSmoke Control候補とする。

### TI_DATA_001 — Duplicate Fiscal Period

同一`company_id`について同じ決算期のTaxReturnProfileが重複していないか確認する。

### TI_DATA_002 — Fiscal Date Order

```text
fiscal_year_start_date
<=
fiscal_year_end_date
<=
filed_date
```

として矛盾する入力がないか確認する。

未入力値はFAILではなく判定対象外またはUNKNOWNとして扱う。

### TI_STATE_001 — Consumption Tax State Consistency

CompanyProfile側の消費税状態と、
最新TaxReturnProfileから導出される状態に不整合がある場合にREVIEWとする。

### TI_STATE_002 — Invoice Registration Consistency

CompanyProfile側とTaxReturnProfile側で
インボイス登録状態に不整合がある場合にREVIEWとする。

### TI_STATE_003 — Fiscal Month Consistency

Workspace会社情報の決算月と、
最新TaxReturnProfileの決算日の月が異なる場合にREVIEWとする。

これら5件はTax Intelligence基盤の動作確認用であり、
「税法上問題がある」と断定するControlではない。

---

## 17. Production Tax Controls

実際の税法判定を行うProduction Controlは、
Architecture実装後に別途Control Catalogとして設計する。

選定条件:

1. 公式一次情報または公式解釈情報を特定できる
2. 対象事業年度を特定できる
3. 必要入力をSUNBOOが取得できる
4. 判定条件を説明可能にできる
5. REVIEWになった理由を人間へ表示できる

最初のProduction Control群は、
国税庁が提供する最新の申告書確認表・自主点検情報等を調査し、
法人税から少数選定する。

---

## 18. MVP Implementation Order

実装順序は以下とする。

```text
Phase TI-0.1
Architecture確定
        ↓
Phase TI-0.2
TaxSource / TaxSourceVersion schema
        ↓
Phase TI-0.3
TaxRule / TaxControl schema
        ↓
Phase TI-0.4
ControlResult / ReviewCase schema
        ↓
Phase TI-0.5
5 Smoke Controls
        ↓
Phase TI-0.6
Workspace Review UI
        ↓
Phase TI-0.7
公式TaxSource 1系統を手動登録
        ↓
Phase TI-0.8
Production Tax Control 1件
        ↓
Phase TI-0.9
Source Version変更 → 再評価E2E
```

自動監視・AI Semantic Diffは、
上記の一連が安定してから追加する。

---

## 19. Long-term Direction

本Architectureが成立した後、段階的に以下へ拡張する。

```text
Tax Decision Memory
Evidence Graph
Accounting Data
申告書データ
給与
固定資産
銀行データ
Tax Preflight
Continuous Tax Control
Pre-Transaction Tax Review
Tax Rule Change Impact Analysis
AI Tax Adviser
```

最終的には、

```text
Company History
       ×
Tax Law History
       ×
Tax Decision History
```

を時点指定で照合できる状態を目指す。

---

## 20. Architecture Invariants

今後の実装で必ず維持する。

1. 税務判定の根拠をTaxSourceVersionまで追跡できること。
2. TaxSourceの変更で過去Versionを破壊しないこと。
3. 現在のRuleを過去取引へ無条件に適用しないこと。
4. UNKNOWNを安全・問題なしと解釈しないこと。
5. AIがTaxRuleを無承認で本番反映できないこと。
6. 既存Timeline / State / Roadmap EngineをTax Intelligence都合で汚染しないこと。
7. 「税務調査される確率」のようにSUNBOOが観測不能な値を確定値として表示しないこと。

---

## まとめ

SUNBOO Tax Intelligenceは、

**会社の事実と、対象時点で有効な公式税務情報を継続的に照合し、
税理士が申告・判断前に確認すべき事項を根拠付きで発見・解決するための基盤**

として設計する。

v0.1では巨大なAI税務システムを作らない。

まず、

```text
Source
↓
Version
↓
Rule
↓
Control
↓
Result
↓
Review
```

という最小の一本を完成させる。

この一本が成立して初めて、
国税庁情報の継続監視、Tax Decision Memory、Evidence Graph、
Accounting Data、AI Tax Adviserへ拡張する。
