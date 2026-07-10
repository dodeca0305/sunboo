# PERIODIC_STATUS_REDESIGN.md — 周期的ステータス管理の再設計（Sprint31）

**ステータス: 設計のみ。コード変更・DB変更・migration作成は一切行っていない。**

[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 6-2節・最重要3課題2が指摘した
「`workspace_procedure_statuses`が年度・出現回を区別できない」という設計ギャップに対し、実コード
（`src/lib/roadmap.ts`・`src/lib/workspaceAdvice.ts`・`src/lib/workspaceDecisions.ts`・
`src/components/AnnualRoadmapView.tsx`・`supabase/migration_workspace_procedure_statuses.sql`）を
直接確認した上で、再設計案を比較・推奨する。

---

## 1. 問題の正確な切り分け（実コード確認済み）

### 1-1. 現行スキーマ

`supabase/migration_workspace_procedure_statuses.sql`で確認した現行の`workspace_procedure_statuses`は：

```sql
CREATE TABLE workspace_procedure_statuses (
  company_id   INTEGER     NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  procedure_id INTEGER     NOT NULL REFERENCES procedures(id),
  status       TEXT        NOT NULL DEFAULT 'not_started'
                 CHECK (status IN ('not_started', 'in_progress', 'done', 'on_hold')),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, procedure_id)
);
```

主キーが`(company_id, procedure_id)`であるため、**1つの手続きにつき会社ごとに状態を1つしか
持てない**。

### 1-2. Annual Roadmap Engineは、そもそも1手続きを複数回出現させる設計になっている

`src/lib/roadmap.ts`の`expandOccurrences`（64〜99行目）を確認した結果、`timing_type`に応じて
以下のように1つの`procedure`から複数の`dueDate`を展開している。

| `timing_type` | 展開のされ方 | 具体例 |
|---|---|---|
| `monthly_10th` | `horizonYears * 12`回、毎月10日 | 源泉所得税の毎月納付 |
| `monthly_10th`＋`special_exception` | 年2回（1/20・7/10）× `horizonYears`年 | 源泉所得税の納期の特例 |
| `fiscal_offset` / `fixed_date` / `period` | `horizonYears`回、年1回 | 法人税確定申告・算定基礎届・決算公告等 |
| `at_establishment` / `hiring_event` / `event_based` | 1回のみ（展開しない） | 法人設立届出書等 |

つまり、Roadmapは`RoadmapItem { procedure, dueDate, confidence }`という単位で
**「手続き×具体的な期限日」の組を配列として持つ**のに対し、Procedure Statusは
「手続き」だけをキーにしている。**この2つの粒度の不一致が問題の本質**であり、
「年度をまたぐと壊れる」というのはその症状の一例にすぎない（月次手続きでも同じ問題が起きる）。

### 1-3. 既存コードは、実はこの粒度の不一致を認識して回避している

- `src/lib/workspaceAdvice.ts`の`nearestOccurrencePerProcedure`は「同じ手続きが複数回出現する中から
  最も近い1回だけを判断材料にする」という重複排除を行っている。これは**表示上の重複を避けるための
  ワークアラウンドであり、根本解決ではない**——最も近い1回のdueDateがどれであっても、参照する
  `status`は常に同じ1行（`(company_id, procedure_id)`）である
- `src/components/AnnualRoadmapView.tsx`108行目の`key={`${item.procedure.id}-${item.dueDate}-${idx}`}`
  は、**Reactの描画キーとして`procedure.id`＋`dueDate`の組を既に「出現の一意な識別子」として
  扱っている**。つまりUI層では暗黙的に「procedure_id + dueDateが1つの出現を特定する」という
  前提が既に存在しており、これをDBスキーマ側にも正式に反映するのが自然な帰結である

---

## 2. 検討事項ごとの整理

### 2-1. 月次手続き（例: 源泉所得税の毎月納付）

現行（案A）: 7月分を「完了」にすると、8月分・9月分…もすべて「完了」として表示され続ける
（`nearestOccurrencePerProcedure`が最も近い出現を選ぶだけで、その出現に紐づく専用の状態が
存在しないため）。**実運用が始まった瞬間に致命的な誤表示になる、最も深刻なケース。**

### 2-2. 年次手続き（例: 法人税確定申告・算定基礎届）

現行（案A）: 2026年度分を「完了」にすると、2027年度分も「完了」のまま表示される。月次ほど
頻度は高くないが、決算のたびに必ず発生する既知の不具合になる。

### 2-3. 単発手続き（例: 法人設立届出書、`at_establishment`）

現行（案A）でも実害はない。`expandOccurrences`が1回しか展開しないため、`procedure_id`単位の
ステータスと「出現」が実質的に一致している。**この区分だけは案Aのままで十分**という点は
再設計の判断材料として重要（3節で再掲）。

### 2-4. 決算期依存（会社プロフィールの決算月変更等でdueDateが変わるケース）

決算月を変更すると、`buildAnnualRoadmap`が生成する`dueDate`群がすべて再計算される。
現行（案A）では、変更前に付けていた「完了」ステータスが、変更後も`procedure_id`単位で
そのまま残り続け、新しい決算スケジュールに対して「本当に完了しているのか」を検証する手段がない
（決算月変更前の完了実績を新スケジュールに引き継いでよいかは、そもそも業務的に自明ではない）。

### 2-5. Dashboard（`summarizeWorkspaceProgress`）

`nearestOccurrencePerProcedure`で1手続き1件に絞ってから集計している（`src/lib/workspaceAdvice.ts`）。
現行の粒度不一致により、**進捗サマリーの「完了○件」が実態と乖離する**（本来は「今月分は完了・
来月分は未着手」の2件であるべきところ、常に1件としてしか数えられない）。

### 2-6. Decision（`generateWorkspaceDecisions`）

`statusOf`（`workspaceAdvice.ts`からexport、`workspaceDecisions.ts`が共有利用）が
`statusMap[item.procedure.id]`という`procedure_id`のみのlookupになっている。
「今月分は書類が未整備なので優先度を上げる」という判断（Sprint27で実装した書類との突き合わせ）も、
月をまたぐと「先月完了にしたから今月はもう何もしなくていい」という誤判定を招きうる。

### 2-7. AI Adviser（`generateWorkspaceAdvice`）

Decisionと同じ`statusOf`を共有しているため、同じ問題を抱える。

### 2-8. Share（`get_shared_workspace_view` RPC）

`supabase/migration_workspace_procedure_statuses.sql`で確認した通り、`statuses`セクションは
`jsonb_agg(jsonb_build_object('procedure_id', s.procedure_id, 'status', s.status))`で
`procedure_id`単位のまま経営者向け共有ページに渡している。経営者が見る共有ページでも
「今月の源泉所得税、去年完了にしたままずっと完了表示」という同じ誤表示が起きる。

### 2-9. Notification（v0.9、未実装）

[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-3節の通り、通知エンジンは
「Decision Engineの`actions`配列が安定するまで着手しない」方針だが、**着手する前提条件として
「今月分がまだ完了していない」を正確に判定できるステータス管理が必須**である。現行の粒度不一致を
放置したまま通知機能を作ると、「もう完了しているのに督促が飛ぶ」「完了していないのに督促が飛ばない」
という信頼性の低い通知になる。**本Sprintの再設計は、実質的に通知エンジンの前提条件を満たす作業でもある。**

### 2-10. 将来の会計データ

[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-2節が指摘した通り、会計データ
連携（月次試算表・決算書等）も本質的に周期的なデータであり、本Sprintで採用するパターンが
将来の会計データテーブル設計の先例になる。ここで妥当な設計を確立しておく価値は、Procedure Status
単体の修正に留まらない。

---

## 3. 案の比較

### 案A: `(company_id, procedure_id)`（現状維持）

| 観点 | 評価 |
|---|---|
| メリット | 実装済み・追加コストゼロ。単発手続き（2-3節）には十分。スキーマ・クエリが最も単純 |
| デメリット | 月次・年次手続き（2-1・2-2節）で誤表示が発生する。Dashboard/Decision/AI Adviser/Shareすべてに同じ誤りが伝播する。Notification機能の前提条件を満たせない |
| 移行コスト | ゼロ（何もしない） |
| 将来性 | 低い。周期的な会計データにも同じ欠陥を持ち込むことになる |

### 案B: `(company_id, procedure_id, occurrence_key)`

`occurrence_key`は**`RoadmapItem.dueDate`（ISO日付文字列）をそのまま使う**ことを提案する
（新しい採番ロジックを作らない）。理由は1-3節で確認した通り、`AnnualRoadmapView.tsx`が既に
`procedure.id + dueDate`をUI上の出現識別子として扱っており、それをDBスキーマに正式反映するだけで
済むため。単発手続きも「その1回のdueDate」を`occurrence_key`とすることで、月次・年次・単発すべてを
同一スキーマで統一的に扱える（特殊分岐が不要）。

| 観点 | 評価 |
|---|---|
| メリット | 月次・年次手続き（2-1・2-2節）を正しく区別できる。単発手続きも同じスキーマで扱え、特殊分岐が不要。`RoadmapItem.dueDate`という既存の計算結果をそのままキーに使うため、新しい計算ロジックが不要（Engine変更なし要件と両立する）。決算期依存（2-4節）のケースでは、決算月変更後は新しいdueDateに対して「未着手」から再スタートする挙動になり、これは古いスケジュールの完了実績を誤って引き継がないという意味で**むしろ正しい安全側の挙動**になる |
| デメリット | `statusOf`（`workspaceAdvice.ts`・`workspaceDecisions.ts`で共有）のlookupキーを`procedure_id`のみから`procedure_id + dueDate`に変更する必要がある（本Sprintでは設計のみ、実装はSprint32以降）。`get_shared_workspace_view`のJSON構造・`AnnualRoadmapView.tsx`のupsert処理（`onConflict`パラメータ）も同様に変更が必要。行数が増える（ただし4節で述べる通り実質的な増加は限定的） |
| 移行コスト | 中。既存`workspace_procedure_statuses`の主キーをALTER（`company_id, procedure_id`→`company_id, procedure_id, occurrence_key`）し、`occurrence_key`列を追加する必要がある。既存データの扱いは4-2節で扱う |
| 将来性 | 中〜高。将来の会計データ（2-10節）にも同じ`(company_id, subject_id, occurrence_key)`パターンを適用できる。Timeline Engineへの統合（案C）は後からでも追加可能（5節で述べる） |

### 案C: `WorkspaceTimelineEvent`由来（イベントソーシング）

手続きの完了を「ステータスを上書きする1行」としてではなく、「完了した」という**事実（イベント）を
追記する**形でモデル化する。`workspace_timeline_events`（未実装、`TIMELINE_ENGINE.md`が構想する
`company`/`tax`カテゴリと同様の位置づけ）に`{ occurredAt, category: 'procedure', metadata: { procedureId, occurrenceKey, status } }`を追記し、「現在のステータス」は「そのoccurrence_keyに対する
最新のイベント」から都度導出する。

| 観点 | 評価 |
|---|---|
| メリット | `TIMELINE_ENGINE.md`が掲げる「すべての事実の記録を単一の追記専用ログに統合する」という長期設計と最も整合する。誰が・いつ・どう状態を変えたかの履歴が自然に残る（監査性）。将来の会計データ（2-10節）・通知エンジン（2-9節）もすべて同じTimelineを参照でき、根本的な統一が実現する |
| デメリット | **Workspace向けのTimeline永続化層（`workspace_timeline_events`テーブル）がまだ存在しない**（`WORKSPACE_DB_MVP_MIGRATION.md` 1-2節で「Sprint22.4では対象外」と明記済み、`COMPANY_WORKSPACE.md` 5-3節も「Timelineは各タブ内のConfidence表示に埋め込む方針、独立テーブルは持たない」としている）。案Cを採用すると、Procedure Statusの再設計だけで済むはずが、Timeline永続化層という別プロジェクトを同時に始めることになる。「現在のステータス」を得るために「最新のイベントを検索する」集計クエリが必要になり、単純な主キー検索だった案A/Bより実装・パフォーマンス面で複雑になる |
| 移行コスト | 高。新テーブル設計・Timeline統合・`buildWorkspaceTimelineEvents`の拡張・状態導出クエリの新設が必要。CLAUDE.mdが戒める「過剰な抽象化」「検証なしの断定」に該当するリスクが高い（Timeline永続化の必要性・設計がまだ検証されていない段階で作り込むことになる） |
| 将来性 | 最も高い。ただしその将来性を今すぐ刈り取る必要があるかは別問題（5節） |

---

## 4. 案Bの詳細設計（実装イメージ、本Sprintでは作成しない）

### 4-1. スキーマ差分（イメージ）

```sql
-- 実装時のイメージ。本Sprintでは作成しない。

ALTER TABLE workspace_procedure_statuses ADD COLUMN occurrence_key TEXT;
-- occurrence_key = RoadmapItem.dueDate（ISO日付、例: '2026-07-10'）をそのまま格納する。
-- 新しい採番ロジックは作らない。

ALTER TABLE workspace_procedure_statuses DROP CONSTRAINT workspace_procedure_statuses_pkey;
ALTER TABLE workspace_procedure_statuses ALTER COLUMN occurrence_key SET NOT NULL;
ALTER TABLE workspace_procedure_statuses
  ADD PRIMARY KEY (company_id, procedure_id, occurrence_key);
```

RLS・GRANT・admin_usersポリシーは既存パターン（`admin_all`、`auth.email() IN (SELECT email FROM admin_users)`）をそのまま維持でき、変更不要（主キーの変更はRLSポリシーの条件式に影響しない）。

### 4-2. 既存データの扱い（要判断）

現行`workspace_procedure_statuses`の既存行は「どのdueDateに対する状態か」という情報を持っていない
ため、機械的な移行はできない。以下の3案を提示する（最終判断はレビューで確認）。

| 案 | 内容 | 評価 |
|---|---|---|
| a. 破棄 | 既存の全行を削除し、ゼロから再スタートする | 最もシンプル。本サービスは開発初期（実データがβテスト参加者の少数の会社に限られる）であり、実害は小さい |
| b. 最新出現へ引き継ぎ | 移行時点で`nearestOccurrencePerProcedure`を計算し、その`dueDate`を`occurrence_key`として既存の`status`をそのまま引き継ぐ | ユーザーが直近付けたステータスを失わずに済むが、「本当にその出現に対する状態だったか」は保証できない（1-2節の通り、そもそも案Aはどの出現の状態かを記録していないため、引き継ぎ自体が推測に基づく） |
| c. `occurrence_key = 'legacy'`として保持 | 既存行は特殊な`occurrence_key`のまま残し、新規行と共存させる | 移行は最も安全だが、`'legacy'`行がいつまでも residual として残り、3-6節で触れた技術的負債の再生産になりうる |

**本ドキュメントの推奨は(a)破棄**。理由: 現行のβテストデータ量は限定的であり（[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)が確認した通りリポジトリは9日間の開発期間）、(b)(c)いずれも「不正確な前提に基づくデータを正確なものであるかのように見せる」リスクがあり、CLAUDE.mdの「実務データの検証なしの断定をしない」原則に反する。最終判断はSprint32（実装Sprint）のレビューで確定する。

### 4-3. 行数増加の実態

「行が増える」というデメリットは、`RoadmapItem`が生成する**すべての出現**に対して事前に行を
作成するわけではなく、既存の`AnnualRoadmapView`のupsertパターン（ユーザーが実際にステータスを
変更した時だけ`upsert`する）をそのまま踏襲すれば、**実際に操作された出現の分だけ行が増える**。
未操作の出現（デフォルト`not_started`）は行として存在しなくてよい（現行の`statusMap[id] ?? 'not_started'`
というデフォルト値パターンをそのまま維持できる）。したがって行数増加は実運用に比例するのみで、
horizonYears分を先回りして埋める必要はない。

---

## 5. 最終推奨案

**案B（`(company_id, procedure_id, occurrence_key)`、`occurrence_key = RoadmapItem.dueDate`）を推奨する。**

理由:

1. **2節で確認した全ての問題（月次・年次・決算期依存・Dashboard・Decision・AI Adviser・Share・
   Notification前提条件）を解決できる**。単発手続きも同一スキーマで扱え、特殊分岐が不要
2. **既存の計算結果（`RoadmapItem.dueDate`）をそのまま鍵に使うため、Engine変更なしという制約を
   満たしながら実現できる**。新しい期限計算・採番ロジックを一切必要としない
3. **案Cが目指す長期像（Timeline Engineへの統合）を将来的に妨げない**。案Bで`occurrence_key`という
   出現の一意識別子がテーブルに正式導入されれば、後日Timeline統合（案C）に移行する際も
   「`occurrence_key`付きの状態変更履歴」としてそのままTimelineイベントに転写できる（案Bは
   案Cへの踏み台として設計する）
4. **移行コストが実装可能な範囲に収まる**。新テーブル・新Engine層を必要とせず、既存テーブルへの
   ALTER TABLEと、`statusOf`（2箇所で共有）・`get_shared_workspace_view`・`AnnualRoadmapView`の
   upsert呼び出し3箇所の改修で完結する
5. **案Cは時期尚早**。Workspace向けTimeline永続化層自体がまだ存在せず、その設計・検証を経ずに
   Procedure Statusの再設計と同時に持ち込むことは、CLAUDE.mdが戒める「過剰な抽象化」に該当する
   リスクが高い。Timeline永続化が実際に必要になるタイミング（Tax Return Profile・Events対応、
   Sprint33以降）で改めて評価する

`workspace_documents`（書類ステータス）も[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)
6-2節で同型の問題（年度をまたぐ申告書を区別できない）が指摘されている。本Sprintのスコープは
`workspace_procedure_statuses`に限定するが、**同じ`occurrence_key`パターンを将来`workspace_documents`
にも適用できる**ことを記録しておく（`occurrence_key`は書類の場合「対象年度」等、文脈に応じた値になる。
procedure_statusesとは異なり書類には`RoadmapItem.dueDate`に相当する既存の計算結果が無いため、
別途「年度」の定義が必要になる点は書類側の再設計時に個別に検討する）。

---

## 6. Sprint32以降への申し送り事項

本Sprintは設計のみのため、以下はSprint32（実装Sprint）で改めて着手時に確認・実施する。

- 4-1節のスキーマ差分をmigrationファイル（`supabase/migration_workspace_procedure_statuses_occurrence.sql`
  等の命名を想定）として作成し、CLAUDE.mdの規約（GRANT+RLS+policyを同一ファイル内に含める）に従う
- 4-2節の既存データ移行方針（推奨: 破棄）の最終確認
- `src/lib/workspaceAdvice.ts`の`statusOf`を`(procedureId, dueDate)`ベースのlookupに変更
  （`workspaceDecisions.ts`は`statusOf`を共有しているため自動的に追従する）
- `src/lib/workspaceDocumentStatus.ts`型定義とは別物であることに注意しつつ、
  `src/lib/workspaceProcedureStatus.ts`の`WorkspaceProcedureStatusMap`型を
  `Record<number, WorkspaceProcedureStatus>`から`Record<string, WorkspaceProcedureStatus>`
  （キーを`` `${procedureId}:${occurrenceKey}` ``等の複合文字列にする）へ変更
- `src/components/AnnualRoadmapView.tsx`の`handleStatusChange`呼び出し・`upsert`の`onConflict`を
  `'company_id,procedure_id'`から`'company_id,procedure_id,occurrence_key'`へ変更
- `get_shared_workspace_view`のRPC定義に`occurrence_key`（または`due_date`という名前の方が
  経営者向け共有ページでは分かりやすい可能性がある、実装時に検討）をJSON出力に追加
- `src/lib/workspaceAdvice.ts`の`summarizeWorkspaceProgress`が正しく「出現単位」で集計されることを
  Playwrightで確認（特に、同一手続きの過去出現を「完了」にした後、次回出現が正しく「未着手」で
  表示されることを月次手続きで実地確認する）
