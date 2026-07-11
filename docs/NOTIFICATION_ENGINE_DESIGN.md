# NOTIFICATION_ENGINE_DESIGN.md — Workspace向け通知エンジン設計（Sprint36 Phase36.1）

**ステータス: 設計のみ。コード変更・DB変更・migration作成・package変更は一切行っていない。**
実装はレビュー後、Sprint37以降で段階的に行う（11節参照）。

対象: Dashboard（`src/components/WorkspaceDashboard.tsx`）・Annual Roadmap Engine（`src/lib/roadmap.ts`）・
State Engine（`src/lib/state.ts`）・Timeline Engine（`src/lib/timeline.ts`・`workspaceTimelineProducer.ts`）・
Procedure Status（`src/lib/workspaceProcedureStatus.ts`）・AI Adviser（`src/lib/workspaceAdvice.ts`）・
Decision Engine（`src/lib/workspaceDecisions.ts`）を調査対象として、`docs/admin/workspaces`配下
（顧問先管理・正式系）向けの通知エンジンを設計する。

---

## 0. 前提として確認した既存事実

- **[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-3節が、通知エンジンを
  「今は作らないもの」として明示的に見送っていた。** 理由は「AI Adviser/Decision Engineの出力先が
  まだDashboard1箇所に限られている段階では時期尚早」「Decision Engineの`actions`配列が安定するまで
  入力形式を確定できない」の2点。**本設計はこの前提が現時点で解消していることをまず確認する必要がある**
  （後述の通り解消済みと判断する）
- **Decision Engine（`generateWorkspaceDecisions`、`src/lib/workspaceDecisions.ts`、Sprint27実装）は、
  Sprint28以降のSprint31（周期的ステータス再設計）・Sprint32（出現回単位への移行）・Sprint33
  （アクセス制御）・Sprint34（データ取得共通化）・Sprint35（決算実績プロフィール）を経ても、
  `WorkspaceDecisionAction`（`priority`/`title`/`reason`/`dueDate`）という出力の形は一度も変わっていない。**
  Sprint32の出現回移行では`statusOf`の内部実装（`workspaceAdvice.ts:54-56`）だけが変わり、
  `generateWorkspaceDecisions`のシグネチャ・戻り値は無変更だった（`workspaceDecisions.ts`のコメント
  「Engineの呼び出しコードは無変更のまま」）。**「`actions`配列が安定するまで」という条件は満たされたと判断する**
- **AI Adviser（`generateWorkspaceAdvice`、Sprint24.2実装・Sprint32でstatusOf差し替え）も同様に、
  `WorkspaceAdvice`（`priority`/`warnings`/`opportunities`/`summary`）の形は安定している**
- **既存の`notificationEngine.ts`（Sprint9実装、`src/lib/notificationEngine.ts`）は、`(site)`側
  （匿名・ブラウザ単位フロー）専用として現在も稼働中。** `buildNotifications(procedures:
  ScheduleProcedure[], statusMap: Record<number, ProcedureStatus>)`という型シグネチャで、
  呼び出し元は`src/app/(site)/result/ScheduleList.tsx`の1箇所のみ。**Workspace側
  （`WorkspaceProcedureStatusMap`、`Record<string, WorkspaceProcedureStatus>`、キーは
  `procedure_id:occurrence_key`の複合文字列、Sprint32）とは入力の型が非互換であり、そのまま
  流用できない。** 本設計は既存`notificationEngine.ts`を「置き換える」のではなく、Workspace向けに
  別モジュールとして新設する位置づけを取る（[PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)が示す通り
  `(site)`配下は互換・検証用でありバグ修正のみ、新機能は`admin/workspaces`配下に実装する方針
  （[WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md)）と整合する）
- **`workspace_members`（`company_id`, `email`, `role`）がSprint33（`migration_workspace_access_control.sql`）
  で実際の認可判定に使われるようになった。** `role`は`owner`/`member`/`viewer`の3値。これは
  「この会社のWorkspaceに誰がアクセスできるか」を表すテーブルであり、**将来メール等の送信先を
  解決する際の唯一の情報源になりうる**（本設計では送信先解決の設計イメージにのみ触れ、実装しない）
- **Timeline Engineの設計書（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 6-2節・7節）は、
  「AI参謀・通知エンジンが生成したコメントそのものを`category: 'advisory'`・`source: 'system'`の
  TimelineEventとして記録する」というAdvisory Timeline構想を既に示していた（未実装）。** しかし
  Workspace側にはTimeline永続化層自体が存在しない。`buildWorkspaceTimelineEvents`
  （`src/lib/workspaceTimelineProducer.ts`）は`CompanyProfile`・`TaxReturnProfile`から
  **都度`TimelineEvent[]`を合成するだけの純粋関数**であり、`(site)`側の`sunboo:timeline-events`
  （`localStorage`、`src/lib/timeline.ts`）に相当するWorkspace版の永続化テーブルは無い。
  [PERIODIC_STATUS_REDESIGN.md](PERIODIC_STATUS_REDESIGN.md) 3節（案C）も、Workspace向けTimeline
  永続化層が無いことを理由に「イベントソーシング化は時期尚早」と結論づけている。**本設計は
  Advisory Timelineへの記録を前提にしない**（送信記録の設計は5節で別の方法を検討する）
- **`src/lib/adviserScore.ts`冒頭のコメント「LLM呼び出しは行わない」、`notificationEngine.ts`
  冒頭のコメント「役割は期限の知らせのみ」という既存方針は、Workspace版でも踏襲する。** 通知エンジンは
  新しい判定ロジック・優先順位づけを持たず、既存のDecision Engine・AI Adviserの出力をそのまま
  ルーティングするだけの層とする（1節で式として明確化する）
- **`WorkspaceDashboard.tsx`は既にAdvice（`priority`/`warnings`/`opportunities`）とDecisions
  （`actions`/`watchItems`/`completed`）の両方を1画面に表示している。** これは「Workspaceを開けば
  見える」pull型のチャネルであり、本設計が対象とする「Workspaceを開かなくても届く」push型の
  通知（メール等）とは役割が異なる（4節で整理する）
- **Vercelはサーバーレス実行環境であり、常駐プロセスを持たない**（[ARCHITECTURE.md](ARCHITECTURE.md)）。
  既存の全Engine（State/Roadmap/Advice/Decision）は「画面が呼ばれた瞬間に都度計算・保存しない」
  という原則で統一されているが、**push型の通知は定義上「誰かが画面を開かなくても発火する」必要が
  あり、この原則をそのままでは満たせない**。本設計はこの緊張関係を6節で明示的に扱う

---

## 1. Notificationとは

### 1-1. 定義

**Decision Engine・AI Adviserが既に生成した情報のうち、「今、能動的に知らせるべきもの」を選び、
チャネル（画面内バッジ・将来のメール等）へ振り分けるルーティング層。**

```
Notification = f( Decisions, Advice, 送信記録, 今日の日付 )
```

Roadmap Engine・State Engineが「新しい事実の計算」を担うのに対し、Notification Engineは
**新しい計算を一切行わない**。[ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md) 8節が定義した
「Roadmap Engineは並べる、AI参謀は判断する」という役割分担にならい、**Notification Engineは
「AI Adviser・Decision Engineが既に判断した結果を、いつ・どれだけ押し出すか」だけを扱う**（4節・5節）。

### 1-2. なぜCompanyProfile・State・Roadmapを直接読まないか

`WorkspaceDecisions`・`WorkspaceAdvice`は、いずれも`CompanyProfile`・`CompanyState`・
`RoadmapYear[]`・`WorkspaceProcedureStatusMap`・`WorkspaceDocumentStatusMap`を横断して判断した
**最終結果**である（`workspaceDecisions.ts`冒頭コメント「Decisions = f(...)」）。Notification Engineが
これらの生データを直接読んで独自に判定してしまうと、「Decisionでは`medium`なのに通知では`urgent`」
のような**同じ状況に対する矛盾した判断が2箇所に生まれる**リスクがある。Decision Engineが既に
`priority`（`high`/`medium`/`low`）を確定させている以上、Notification Engineはこれを信頼して
**そのまま**使う（3節）。

### 1-3. 「保存しない」原則との関係

State/Roadmap/Advice/Decisionと同じ「都度計算・保存しない」原則を、**判定ロジック自体には引き続き
適用する**（Notification Engineは「今この瞬間、通知すべき候補は何か」を毎回ゼロから計算する
純粋関数として設計する。3節）。ただし0節で確認した通り、push型の配信を実現するには「何を・いつ
送ったか」という送信記録だけは保存が必要になる。**この送信記録はNotification Engine本体
（判定ロジック）とは別の層（配信ログ）として切り離す**ことで、判定ロジック自体の純粋性は保つ
（5節・6節で詳述）。

---

## 2. モデル設計（型イメージ、コード未実装）

```ts
// 設計イメージ（Sprint37以降でコード化）

export type NotificationSeverity = 'critical' | 'warning' | 'info';
// Decision.priority（high/medium/low）とAdvice.warningsの区分をそのまま写像する（3節）。
// 独自の5段階・スコアリングは作らない。

export type NotificationSourceKind = 'decision_action' | 'decision_watch' | 'advice_warning' | 'advice_opportunity';

export type NotificationCandidate = {
  companyId: number;
  procedureId: number | null;      // 会社概要系の通知（決算接近等）はnull
  occurrenceKey: string | null;    // WorkspaceProcedureStatusMapのキー相当。手続き紐づきが無い通知はnull
  sourceKind: NotificationSourceKind;
  severity: NotificationSeverity;
  title: string;                   // Decision/Adviceの title/reason/detail をそのまま転記する（3節）
  message: string;
  dueDate: string | null;
};

export type NotificationDigest = {
  companyId: number;
  generatedAt: string; // ISO datetime
  candidates: NotificationCandidate[];
};
```

`NotificationCandidate`は`Decision.actions`・`Decision.watchItems`・`Advice.warnings`・
`Advice.opportunities`の各要素を**1対1で変換しただけ**の型にする（4節）。`procedureId`・
`occurrenceKey`を持たせるのは、5節の重複防止・6節のライフサイクルで
「同じ出現（`workspaceProcedureOccurrenceKey`）に対する通知かどうか」を判定するために必要なため
（[PERIODIC_STATUS_REDESIGN.md](PERIODIC_STATUS_REDESIGN.md)で確立した出現単位の識別子をそのまま
再利用する。新しい採番ロジックは作らない）。

---

## 3. 通知種類（検討項目1）

Notification Engineは**新しい通知種類を独自に定義しない**。既存のDecision Engine・AI Adviserが
既に出力している区分を、そのまま通知候補として採用する。

| 通知種類 | 生成元 | 既存の判定ロジック（変更なし） |
|---|---|---|
| 期限が近い・超過した手続き | `Decision.actions`（`priority: 'high'`） | `workspaceDecisions.ts`の`diff <= URGENT_WINDOW_DAYS`（3日以内）または`status === 'on_hold'` |
| 早めの着手を推奨する手続き | `Decision.actions`（`priority: 'medium'`） | 同ファイルの`diff <= ACTION_WINDOW_DAYS`（30日以内） |
| 保留のまま期限が近づいている | `Advice.warnings`（`detail`が「保留のまま」を含む） | `workspaceAdvice.ts`の`status === 'on_hold' && diff <= PRIORITY_WINDOW_DAYS` |
| 書類未整備の注視事項 | `Decision.watchItems` | `matchingDocumentType`による手続き×書類の突き合わせ（`workspaceDecisions.ts`） |
| 決算接近 | `Decision.watchItems`（`title: '決算に向けた準備'`） | `monthsUntilFiscalYearEnd <= FISCAL_YEAR_END_WATCH_MONTHS`（2ヶ月以内） |
| 情報不足（Stateのconfidence低下） | `Advice.opportunities` | `state.stage.confidence === 'incomplete'`、`item.confidence === 'incomplete'` |

**新しい判定基準（例: 「同じ提出先への手続きが複数ある」「特定のカテゴリの手続きが多い」等）を
追加したい場合は、Notification Engine側にロジックを増やすのではなく、まずDecision Engine・
AI Adviser側に判定を追加し、その出力をNotification Engineが拾う**、という順序を守る
（[RULE_ENGINE.md](RULE_ENGINE.md)「将来の拡張方針」・[ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md)
8節と同じ「判断はどこか1箇所に集約する」という設計原則を踏襲）。

**採用しない通知種類の例（意図的なスコープ外）**: 「AI Adviserからのおすすめ（`Advice.priority`、
30日以内・上位5件）」はすべてpush通知にすると頻度が高すぎるため、本設計では**`Decision.actions`の
`high`のみをMVPの通知対象とする**（6-3節の頻度設計とあわせて判断する）。

---

## 4. Dashboardとの役割分担（検討項目5）

| | Dashboard（既存、`WorkspaceDashboard.tsx`） | Notification Engine（本設計） |
|---|---|---|
| 到達方法 | pull型。管理者が`/admin/workspaces/[id]`を**開いたときだけ**見える | push型。開かなくても届く（画面内バッジ・将来のメール等） |
| 表示範囲 | Advice・Decisionの**全件**（`priority`最大5件、`actions`最大8件等） | Decision `actions`のうち`high`のみ等、**絞り込んだ一部**（3節） |
| 新規性 | 毎回同じ画面。前回見たかどうかを区別しない | 「まだ知らせていないもの」を区別する必要がある（5節） |
| 目的 | 会社の状況を面で把握する（一覧性） | 見落としを防ぐ（速報性） |

**Notification EngineはDashboardの表示ロジック（`WorkspaceDashboard.tsx`）を変更しない。**
Dashboard自体を「通知チャネルの1つ」として位置づけることもできるが（画面内バッジ等、6-1節）、
既存の`priority`/`warnings`/`actions`セクションの表示条件・件数上限は変更しない
（Dashboardは「常に全件が見える」という現在の性質を維持する）。

---

## 5. AI Adviserとの役割分担（検討項目6）

[ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md) 8節が示した表を、Notification Engineを含めて
拡張する。

| | Roadmap Engine | AI Adviser（`workspaceAdvice.ts`） | Decision Engine（`workspaceDecisions.ts`） | Notification Engine（本設計） |
|---|---|---|---|---|
| 役割 | 何を・いつ、複数年分並べる（事実の整理） | 状況説明。「何が起きているか」を記述する | 行動提案。「今何をすべきか」を命令形で提案する | 配信。「これをいつ・誰に押し出すか」を決める |
| 入力 | State + Timeline + Rule Engine + Procedure Master | Roadmap + Procedure Status + State | Profile + State + Roadmap + Procedure Status + Document Status | Decision + Advice + 送信記録 |
| 出力 | `RoadmapItem[]` | 状況カード（`priority`/`warnings`/`opportunities`） | 行動提案（`actions`/`watchItems`/`completed`） | 配信候補（`NotificationCandidate[]`） |
| 判断の有無 | 判断しない（並べるだけ） | 判断する（優先度・警告の分類） | 判断する（Adviceより一段踏み込む） | **判断しない**（Decisionの判断をそのまま使う） |

**Notification Engineは新しい「判断」を加えない。** [notificationEngine.ts](../src/lib/notificationEngine.ts)
冒頭コメント「役割は期限の知らせのみ。AI参謀が担う判断・理由づけは行わない」という`(site)`版の
既存方針を、Workspace版でも文言レベルでそのまま踏襲する。文言（`title`/`message`）はDecision・Adviceが
既に生成した`title`/`reason`/`detail`をそのまま転記し、**通知専用の新しい文言テンプレートは作らない**
（3節の型設計もこれを反映している）。

---

## 6. 通知ライフサイクル（検討項目4）・重複防止（検討項目3）

### 6-1. MVPは「画面内通知」に限定する（送信記録を持たない範囲）

0節・1-3節で確認した通り、Vercelはサーバーレスで常駐プロセスを持たないため、**メール等の
真の意味でのpush配信には定期実行の仕組み（後述6-4節）が必須**になる。しかし、それを本Sprintで
一気に設計すると[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-4節が戒める
「実例に基づかない先行実装」のリスクを負う。

**本設計はMVPを「Workspace画面を開いたときに表示される、Dashboardより一段強い通知バッジ」に限定する**
ことを提案する（例: `AdminShell.tsx`のサイドバー・顧問先一覧に「要対応の会社」件数を表示する等）。
この範囲であれば：

- 送信記録は不要（Dashboardと同じpull型の一種であり、都度計算するだけでよい）
- 6節で述べる「同じ通知を繰り返し出さない」という重複防止も、**送信ログではなく「Decision Engineの
  出力が変わったかどうか」で自然に解決する**（`occurrenceKey`が変われば別の通知として扱われる、
  `status`が`done`になれば`Decision.completed`に移りDecision Engine側で自然に対象から外れる）

### 6-2. 出現単位の識別子が重複防止の土台になる

[PERIODIC_STATUS_REDESIGN.md](PERIODIC_STATUS_REDESIGN.md)（Sprint31設計・Sprint32実装）で
`workspace_procedure_statuses`が`(company_id, procedure_id, occurrence_key)`単位になったことで、
「毎月納付の7月分を通知した後、8月分は別の出現として扱われる」という性質が**既にデータモデル側で
保証されている**。Notification Engineはこの資産をそのまま使い、`procedureId + occurrenceKey`
（`workspaceProcedureOccurrenceKey`関数、`workspaceProcedureStatus.ts`）を通知の一意キーとする
（2節の型で`occurrenceKey`を持たせているのはこのため）。**新しい重複判定ロジックは作らない。**

### 6-3. MVPの範囲では「送信済みを記録しない」ことによる重複を許容する

MVP（画面内通知・6-1節）の範囲では、画面を開くたびに`generateWorkspaceDecisions`の結果から
`NotificationCandidate[]`を都度計算するため、「前回見た通知をもう一度表示する」ことは
**問題にならない**（Dashboardの`priority`/`warnings`セクションと同じ性質であり、
「毎回同じ内容が出る」ことは重複ではなく一覧性の一部）。**将来メール送信に拡張する際に初めて
「1日1回だけ送る」等の間引きが必要になる**（6-4節）。

### 6-4. 将来（メール等、送信ログが必要になる段階）の設計イメージ

送信ログを持つ場合の設計イメージ（**本Sprintでは作成しない**）:

```sql
-- 実装時のイメージ。本Sprintでは作成しない。
CREATE TABLE workspace_notification_log (
  id            BIGSERIAL PRIMARY KEY,
  company_id    INTEGER NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  procedure_id  INTEGER,
  occurrence_key TEXT,
  channel       TEXT NOT NULL,   -- 'email' / 'slack' / 'line'
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, procedure_id, occurrence_key, channel, sent_at::date)
  -- 「同じ出現・同じチャネルには1日1回まで」という間引きをUNIQUE制約で表現するイメージ。
  -- CLAUDE.md「一意性が必要なシードデータには必ずUNIQUE制約」と同じ考え方を送信記録にも適用する。
);
```

`(company_id, procedure_id, occurrence_key, channel, 送信日)`の組で「送信済みかどうか」を判定し、
既に送信済みならその日の再送をスキップする、という設計を想定する。**既存のRule Engine
（`rules.name`のUNIQUE制約、[RULE_ENGINE.md](RULE_ENGINE.md)「重複防止・UNIQUE制約の注意」）で学んだ
教訓——「重複防止はUNIQUE制約＋具体的なconflict targetで機械的に保証する、アプリコード側の
チェックだけに頼らない」——をここでも踏襲する。**

---

## 7. 優先順位（検討項目2）

Notification Engine独自の優先順位は定義しない。**`Decision.priority`（`high`/`medium`/`low`）を
`NotificationSeverity`（`critical`/`warning`/`info`）へ機械的に写像するだけ**とする。

| Decision.priority | NotificationSeverity | MVPでの扱い |
|---|---|---|
| `high` | `critical` | 通知対象（6-1節の画面内バッジに含める） |
| `medium` | `warning` | Dashboardでのみ表示（通知対象外、3節） |
| `low` | — | 現状Decision Engineは`low`を生成しない（`workspaceDecisions.ts`実装確認済み）。将来`low`が追加された場合は`info`として扱う想定 |

これにより、「Decision Engine側で優先順位のロジックを変えれば、Notification Engine側は
何も変更せずに追従する」という一方向の依存関係が保たれる（0節で確認した「`actions`配列が
安定するまで」という条件が今後も維持される限り、この設計は安定する）。

---

## 8. 将来のメール・Slack・LINE対応（検討項目7）

### 8-1. チャネル非依存の設計

`NotificationCandidate`（2節）を生成する層と、実際に送信する層（チャネルAdapter）を分離する。

```
generateWorkspaceDecisions / generateWorkspaceAdvice（既存、無変更）
                    │
                    ▼
        NotificationCandidate[]（本設計、判定のみ）
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
  画面内バッジ    メール送信       Slack/LINE Webhook
 （MVP、6-1節）  （将来）         （将来）
```

チャネルごとに`NotificationCandidate`を文言テンプレートへ変換するAdapter関数
（`toEmailBody(candidate)`等）を追加するだけで済む設計にし、**判定ロジック
（`NotificationCandidate`を作る部分）はチャネルが増えても変更しない**（0節「PDF・OCR・会計データとの
接続」で[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 8節が示した「入口を1つ追加するだけで済む設計にする」
という原則の、出口側（配信）での相似形）。

### 8-2. 送信先の解決

0節で確認した`workspace_members`（`company_id`, `email`, `role`）が、メール送信先解決の
唯一の情報源になる想定（**本設計では接続方法の提示に留め、実装しない**）。`role`による
送信対象の絞り込み（例: `viewer`には送らない、`owner`のみに送る等）は実装時に改めて検討する。
Slack/LINEは会社ごとのWebhook URL登録が別途必要になり、**新しいテーブル
（例: `workspace_notification_channels`）が必要になる**（本設計では設計イメージの提示のみ）。

### 8-3. 定期実行の必要性（既存の「都度計算」原則からの意図的な逸脱）

State/Roadmap/Advice/Decisionはいずれも「画面が呼ばれた瞬間に計算する」pull型の純粋関数として
統一されてきた。しかしメール等のpush配信は、**誰かが画面を開かなくても発火する必要がある**ため、
この原則をそのまま適用できない。Vercel環境でこれを実現するには、Vercel Cron Jobs等による
**定期実行（例: 毎日朝1回、全Workspaceを巡回して`generateWorkspaceDecisions`を呼び、`high`のみ
メール送信）**が必要になる。**これは「都度計算・保存しない」という既存Engineの設計原則に対する
唯一の例外であり、意図的な逸脱として明記しておく**（保存が必要になる理由は「Vercelの実行環境的な
制約」であり、Roadmap等の「入力が変われば結果も変わるべきもの」とは性質が異なる——送信記録は
「過去に何をしたか」の記録であり、「今の状態」の計算結果ではないため、Roadmap Historyや
Timeline導入時に議論された「保存すると不整合のリスクを負う」という問題は生じない）。

---

## 9. 将来のAccounting連携（検討項目8）

[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-2節が「会計データ連携
（freee/MF等API）は本Sprintではスキーマ設計しない」としている現状を踏まえ、本設計でも
会計データそのものの取り込み方式は設計しない。**接続点だけを示す**:

[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 3-1節の`financial`カテゴリ（未実装）が実現した場合、
「試算表に異常な数値がある」「入金予定が期日を過ぎている」等の会計由来の通知も、**本設計の
`NotificationCandidate`と同じ型（`sourceKind`に`'financial_alert'`等を追加するだけ）で表現できる**
見込みである。ただし、それを生成する判断ロジック（何が「異常」かの基準）は3節の原則に従い
Notification Engine側には持たせず、**将来のAccounting Engine（未設計）側に持たせ、
Notification Engineはそこからの出力を拾うだけ**という位置づけにする。**本Sprintでは着手しない。**

---

## 10. β版スコープ

### 10-1. MVPに含めるもの（Sprint37以降で実装検討）

- `NotificationCandidate`型定義・`Decision.actions`（`high`のみ）からの変換ロジック（3節・7節）
- 画面内通知（Dashboard・顧問先一覧への要対応バッジ表示、6-1節）
- 既存Decision/Advice出力の転記のみ（新しい文言・判定は作らない、5節）

### 10-2. MVPに含めないもの（次スプリント以降）

- メール・Slack・LINE送信（8節、送信先解決・Webhook管理・定期実行基盤が別途必要）
- 送信ログテーブル（`workspace_notification_log`、6-4節）
- Accounting連携由来の通知（9節）
- Advisory Timelineへの記録（0節で述べた通り、Workspace側Timeline永続化層が無いため前提条件が未整備）

---

## 11. Sprint37以降実装計画（イメージ）

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **37.1** | `NotificationCandidate`型定義、`Decision.actions`→`NotificationCandidate[]`変換関数（3節・7節） | `src/lib/workspaceNotification.ts`（新規） | Sprint36レビュー承認 | `medium`を含めるかどうか（3節で`high`のみと仮置き） |
| **37.2** | 顧問先一覧（`/admin/workspaces`）に「要対応」バッジを表示する画面配線（6-1節のMVP） | `src/app/admin/(protected)/workspaces/page.tsx` | 37.1完了 | 全社を巡回する際のクエリ回数（Roadmap Engine呼び出しがO(会社数)になる懸念、実データで検証） |
| **37.3** | 送信ログテーブル設計・migration作成（6-4節） | `supabase/migration_workspace_notification_log.sql` | 37.2完了、メール送信着手の意思決定 | Vercel Cron Jobsの利用可否・実行頻度 |
| **37.4** | メールチャネルAdapter実装、`workspace_members.email`からの送信先解決（8節） | `src/lib/workspaceNotificationChannels.ts` | 37.3完了 | 送信元メールアドレス・配信基盤（Resend等）の選定 |

---

## まとめ（設計レビュー観点）

1. **0節の核心的な判断**: [ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-3節が
   条件とした「Decision Engineの`actions`配列が安定するまで」が、Sprint31〜35を経て解消済みと
   判断してよいか
2. **1節・5節**: Notification Engineが新しい判断・文言を一切持たず、Decision Engine・AI Adviserの
   出力をそのまま転記する層に徹する、という役割の絞り込みが妥当か
3. **3節**: MVPの通知対象を`Decision.actions`の`priority: 'high'`のみに絞った判断（`medium`・
   `Advice.warnings`を含めない）の妥当性
4. **6-1節**: 本Sprintの実装スコープを「送信ログを持たない画面内通知」に限定し、メール等の
   真のpush配信を次段階に持ち越す判断
5. **6-2節**: 出現単位識別子（`workspaceProcedureOccurrenceKey`）をそのまま通知の重複防止キーに
   転用する設計でよいか（新しい識別子を作らない）
6. **8-3節**: push配信実現のため「都度計算・保存しない」という既存Engine群の統一原則から
   意図的に逸脱する（送信ログを永続化する）という整理が妥当か
7. **11節の実装順序**: メール送信（37.3・37.4）着手前に、画面内通知（37.1・37.2）で
   実際の運用データを見てから判断する、という段階分けが妥当か
