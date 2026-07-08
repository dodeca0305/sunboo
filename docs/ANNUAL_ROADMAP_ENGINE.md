# ANNUAL_ROADMAP_ENGINE.md — 年間ロードマップエンジン設計（Sprint21 Phase21.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード実装・画面実装は本Phaseでは一切行っていない。**
実装はレビュー後、Sprint21.2以降で段階的に行う（10節参照）。

## 0. 前提として確認した既存事実

設計に入る前に、既存コード・既存設計書との整合を確認した。**本設計は「新しい概念」ではなく、
[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)（Sprint16.1、Roadmap Update Engineとして
設計済み・未実装）と、[STATE_ENGINE.md](STATE_ENGINE.md)（Sprint20.1、7節で本設計を既に予告済み）の
2つの設計書が指し示していた接続を、Timeline/State実装済みの現在の状態を前提に正式化するもの**、
という位置づけを先に明確にする。

- **[STATE_ENGINE.md](STATE_ENGINE.md) 7-1節が、State Engine実装後の将来形として
  `Roadmap = f(State, ProcedureMaster, RuleEngine, 今日の日付)` という簡略化式を既に予告していた**
  （「この置き換えは本Sprintでは行わない。Roadmap Update Engine本体が先に実装されるべき」と明記）。
  本Sprintの要求式 `Roadmap = f(State + Timeline + Rule Engine)` はこの予告とほぼ一致する。
  相違点は`Timeline`が明示的に含まれている点で、これは**State（現在の1点の集約値）だけでは
  複数年分の期日を並べるための時系列データが失われるため**（4節で詳述）
- **[STATE_ENGINE.md](STATE_ENGINE.md) 7-2節が、`RoadmapConfidence`
  （[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節、`confirmed`/`estimated`/`incomplete`）
  と`StateField.confidence`は「同じ3分類を共有する」と既に明記していた。** 本設計はこれを正式に採用し、
  `RoadmapItem`のConfidenceを独自の計算式として再定義せず、**その手続きの判定に使われた`StateField`から
  そのまま導出する**設計にする（6節・7節）
- **Timeline Engine（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md)、Sprint19.2/19.3実装済み）の
  `buildTimelineFromSources`は、`CompanyProfile`（`localStorage`）・`TaxReturnProfile`（`localStorage`）・
  `anonymous_company_events`（DB、`fetchCompanyEvents`経由）という既存の永続化データから、都度
  `TimelineEvent[]`を合成する関数であり、それ自体は「新しいDB/localStorage」を持たない
  （手動記録・system記録のみ`sunboo:timeline-events`に保存される）**。State Engineの唯一の入力
  （`src/lib/state.ts`）でもある
- **State Engine（`src/lib/state.ts`、Sprint20.2実装済み、コミット`f80441c`）は`buildStateFromTimeline`
  で`CompanyState`を計算する。`stage`・`consumptionTaxStatus`・`invoiceRegistrationStatus`・
  `corporateTaxInterimFiling`の4項目は実データから導出できるが、`withholdingTaxCycle`は
  `timelineProducer.ts`の`taxReturnEntryToTimelineEvent`が`withholdingTaxCycleActual`を
  `metadata`に含めていないため、現状常に`incomplete`を返す（`state.ts:189-196`のコメントに
  既知のギャップとして明記済み）。本設計でもこのギャップは解消しない（9節でスコープ外と明記）**
- **`src/lib/ruleEngine.ts`の`evaluateRules`は現状、`src/lib/events.ts`の`registerCompanyEvent`
  内でのみ呼ばれている**（`buildProfileRuleContext(profile)`で組み立てた`context`を渡す形、
  `events.ts:104-106`）。**診断フロー（`runDiagnosis`、`diagnosis.ts`）からはRule Engineは
  呼ばれていない。** Annual Roadmap Engineは両エンジンの出力を横断的に扱う上位の計算層のため、
  Rule Engineの評価はRoadmap Engine自身が独立して呼ぶ設計にする（4節）
- **`calculateNextDeadline`（`diagnosis.ts:42`）は「次の1回」のみを計算する設計** （関数名の通り。
  `at_establishment`/`hiring_event`/`event_based`は起算日が要る、`fiscal_offset`は`today`基準）。
  複数年ホライズンには「次のN回」ラッパーが必要という、
  [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4-3節の結論をそのまま踏襲する
- **`applyCompanyProfileToProcedures`（`companyProfile.ts`、`ScheduleList.tsx`で実際に使用中）は、
  単年・`ScheduleProcedure[]`のみを対象にした既存実装がある。** ①`stage === 'second_term_or_later'`
  で設立系手続きを除外、②`withholdingTaxCycle === 'special_exception'`で源泉所得税の期限を
  年2回パターンに上書き、の2点を行う。**Roadmap Engineはこの関数を置き換えず、複数年分の
  各年についてループで呼び出す「単年分の下ごしらえ」として使う**
  （[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4-1節追記と同じ結論）
- **Procedure Master（`procedures`テーブル）は現在30件。DBの`category`列には`'local_tax'`という値が
  存在するが、TypeScript側の`ProcedureCategory`型（`src/lib/types.ts:94`）には含まれておらず、
  該当5件（地方税系）は表示時に「その他」へフォールバックする未修正の表示バグがある。** 5節の
  年間表示レイアウトでカテゴリ別に手続きを並べる場合に直接影響するため、実装フェーズ（Sprint21.2）で
  型定義の修正が必要と明記するが、**本設計フェーズではコード変更を行わない**
- **AI参謀（`src/lib/adviserScore.ts`）・通知エンジン（`src/lib/notificationEngine.ts`）は、
  いずれも`ScheduleProcedure[]`＋ステータスマップのみを受け取る純粋関数のままであることを
  改めて確認した（現在のexport一覧: `buildAdviserSummary`・`buildAdviserComment`・
  `buildLookaheadComment`・`buildRiskEntries`・`buildProfileAdvisories`・
  `buildClosingUpdateSummary`、`buildNotifications`）。** 「複数年」「履歴」という概念を
  持たないため、Roadmap Engineが「直近スライス」を`ScheduleProcedure[]`として渡せば
  既存コードの変更は不要という、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-1節・8-1節、
  [STATE_ENGINE.md](STATE_ENGINE.md) 8-1節と同じ結論になる（8節）
- **永続的な`companies`エンティティは意図的に作らない方針（[DATABASE.md](DATABASE.md)）が
  現在も維持されている。** 本設計も「Roadmap」という名前のDBテーブル・`localStorage`キーを
  新設しない（1節・2節）

---

## 1. 目的

経営者が`/result`（1回分の診断）・`/events`（1回分のイベント登録）を超えて、**「今年・来年・
再来年、何をいつまでにやる必要があるか」を1つの年間ロードマップとして一望できる**ようにする
ための、計算エンジン部分を設計する。

本Sprintは**計算ロジック（エンジン）の設計のみ**を対象とする。画面（UI）そのものの設計・実装は
Sprint21.4以降（10節）に持ち越す。

現状の制約（0節で確認した事実の裏返し）:

- `/result`・`/events`はいずれも「呼ばれた瞬間」の1回分の手続き一覧しか返さず、来年・再来年の
  見通しを提示できない
- `CompanyProfile`・`TaxReturnProfile`・登録済みイベントという3つの入力がバラバラに存在し、
  「今の会社の状態」を1箇所から参照する手段がない（Sprint20 State Engineがこの一部を解決済み）
- Rule Engineが持つ「条件×手続き」の判断力が、`/events`の1回分の評価にしか使われていない

---

## 2. Roadmapとは何か

### 2-1. 定義

```
Roadmap = f( State + Timeline + Rule Engine )
```

**Roadmapは「持続化されたモノ」ではなく、画面を開くたびに都度計算される導出結果である。**
「Roadmap」という名前のテーブルや`localStorage`キーを新設し、完成品を保存する設計にはしない
（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 1-1節の原則をそのまま維持する）。

保存しない理由も同じ: 保存してしまうと、入力（State・Timeline）が変わるたびに保存済みRoadmapを
再計算して上書きする同期処理が必要になり、「入力を書き換えたのに古いRoadmapが表示され続ける」
不整合のリスクを常に抱える。**都度計算される設計であれば、この種の不整合はそもそも起こり得ない。**

### 2-2. 3つの入力それぞれの役割

| 入力 | 役割 | 時間軸 |
|---|---|---|
| **State** | 「今、会社がどういう状態か」という正規化された1点（`stage`・`consumptionTaxStatus`等）。手続きの出し分け判定に使う | 現在の1点（confidence付き） |
| **Timeline** | 会社に関するすべての確定した事実の時系列。過去の決算実績・登録済みイベント等、複数年分の生データ | 過去〜現在の時系列 |
| **Rule Engine** | 条件×手続きのマスタ判定ロジック（`evaluateRules`）。Stateの値を条件として渡し、追加すべき手続き・警告・提出先/期限の上書きを決定する | 現在の1点に対する判定 |

**Stateだけでは複数年分の期日を並べられない。** 例えば「消費税の中間申告回数」は前期の確定消費税額
（`TaxReturnEntry.consumptionTaxAmount`、Timeline上は`tax`カテゴリのイベントの`metadata`）から
決まるが、3年先まで見通すには複数期分のTimelineイベントを行き来する必要があり、Stateという
「現在の1点」だけでは表現できない。**このため、StateとTimelineの両方を独立した入力として持つ。**

「今日の日付」は式には明示していないが、複数年オフセット計算（`fiscal_offset`等）の基準点として
暗黙に必須の第4入力である（6節・7節）。

### 2-3. CompanyProfile・TaxReturnProfileとの関係

`CompanyProfile`・`TaxReturnProfile`は、上記の式には直接登場しない。**両者はTimelineの生成元
（`timelineProducer.ts`の`buildCompanyTimelineEvents`/`buildTaxReturnTimelineEvents`）であり、
Timeline経由で間接的にRoadmapへ反映される。** ただし例外が1つある: `applyCompanyProfileToProcedures`
（0節参照）は`CompanyProfile`を直接読む既存関数であり、Roadmap Engineはこれを置き換えずそのまま
呼び出すため、`CompanyProfile`の一部（`stage`・`withholdingTaxCycle`）は**Timeline/State経由と
直接呼び出し経由の2経路**でRoadmapに影響する（4節で詳述）。この二重経路は意図的なもので、
State Engine自体が`withholdingTaxCycle`を導出できていない現状のギャップ（0節）を、既存の
直接呼び出しが暫定的に埋めている、という位置づけになる。

---

## 3. 入力

| 入力 | 実装状況 | Roadmap Engineでの使い方 |
|---|---|---|
| **CompanyProfile** | 実装済み（`localStorage`、`src/lib/companyProfile.ts`） | 直接は読まない。ただし`applyCompanyProfileToProcedures`呼び出し時にのみ直接参照する（2-3節） |
| **TaxReturnProfile** | 実装済み（`localStorage`、`src/lib/taxReturnProfile.ts`） | 直接は読まない。`buildTimelineFromSources`経由でTimelineEventの生成元になる |
| **Timeline** | 実装済み（`buildTimelineFromSources`、`src/lib/timelineProducer.ts`） | 複数年分の実績（過去の決算・登録済みイベント）を参照し、State計算の材料にする。MVPでは主にState計算の入力として間接利用し、Roadmap Engineからの直接参照は限定的（将来、複数期ローリング判定等が必要になれば直接参照を増やす） |
| **State** | 実装済み（`buildStateFromTimeline`、`src/lib/state.ts`） | `stage`・`consumptionTaxStatus`・`withholdingTaxCycle`等、手続きの出し分け・Confidence判定に使う「今の1点」の正規化された入力 |
| **Procedure Master** | 実装済み（`procedures`テーブル、30件） | 手続きの雛形（`timing_type`/`timing_data`/`office_type`等）。`runDiagnosis`が現況の`ProcedureResult[]`を生成する際の材料として既に使われている |
| **Rule Engine** | 実装済み（`evaluateRules`、`src/lib/ruleEngine.ts`） | 条件（Stateの値を含む`RuleContext`）に応じて手続きの追加・警告・提出先/期限の上書きを決定する |

---

## 4. 出力

既存`ProcedureResult`/`ScheduleProcedure`（`src/lib/scheduleProcedure.ts`）を単年から複数年に
拡張したイメージ。**既存の型は変更せず、新しい型として別途定義する**（既存コンポーネントへの
影響を避けるため、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4-2節と同じ方針）。

```ts
// 設計イメージ（Sprint21.2〜21.3でコード化）

export type RoadmapOccurrence = {
  dueDate: string;         // ISO。1件の具体的な期限
  fiscalYear: string;      // どの年度に属するか（'2026'等）
  status: ProcedureStatus; // 既存 scheduleProcedure.ts の型を再利用
};

export type RoadmapItem = {
  procedure: ScheduleProcedure;      // 既存型をそのまま埋め込む（表示ロジックの再利用のため）
  occurrences: RoadmapOccurrence[];  // 複数年分の期限（例: 法人税確定申告なら今後3期分）
  confidence: StateConfidence;       // 'confirmed' | 'estimated' | 'incomplete'。独自定義しない（0節・7節）
  confidenceBasis: string[];         // 根拠にした StateField.basedOnEventIds の合算（説明可能性のため）
  source: 'diagnosis' | 'event' | 'rule'; // どの経路で採用されたか（デバッグ・説明用）
};

export type AnnualRoadmap = {
  items: RoadmapItem[];
  horizonYears: number;  // MVPは3固定（6節）
  calculatedAt: string;  // 計算したタイムスタンプ（State.calculatedAtと同じ考え方）
};
```

`AnnualRoadmap`自体も`CompanyState`と同様、**保存せず、呼び出し側が必要な都度計算する純粋関数の
戻り値**として設計する（`calculatedAt`は「いつ計算したか」の記録であって、永続化の根拠ではない）。

---

## 5. 年間表示レイアウト

**画面そのものの実装はSprint21.4（10節）で行う。本節は情報設計のみを扱う。**

### 5-1. 基本構造

- 横軸: 今年度〜今後2年分（6節で3年固定と決定）
- 手続き単位でカード化し、各カードに以下を表示するイメージ:
  - 手続き名・カテゴリ（`procedure.category`）
  - 直近の期限日（`occurrences[0].dueDate`）
  - Confidenceの表示: `incomplete`/`estimated`のみ控えめな注記を添え、`confirmed`は無表示にする
    （既存`ProfileGuidanceCard`と同じ「控えめな誘導」トーンを踏襲。
    [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6-3節がすでに同じ方針を明記済み）
  - ステータス（未着手/進行中/完了）

### 5-2. カテゴリ別グルーピングの前提条件

`procedure.category`でグルーピングする場合、0節で確認した`'local_tax'`のTypeScript型欠落バグが
直接影響する（地方税系5件が「その他」に混在してしまう）。**この修正はSprint21.2（実装フェーズ）で
先に行う必要がある**とここに明記するが、本設計フェーズではコードを変更しない。

### 5-3. モバイル対応

`ScheduleList.tsx`のモバイル対応（v0.8.1 UX磨きSprintで得た教訓: 横スクロールよりも縦積みの方が
崩れにくい）を踏襲し、年間ロードマップも横スクロールのタイムラインではなく、年度ごとに縦積みの
セクションを基本とする案を提示する。**最終的なUIコンポーネントの選定は実装フェーズ（Sprint21.4）で
判断する。**

---

## 6. 優先順位アルゴリズム

### 6-1. 「並び順」と「優先度判断」を分離する

Roadmap Engineは**時系列に並べることに徹し**、「今どれを優先すべきか」という判断そのものは
AI参謀（`adviserScore.ts`）に委ねる（8節で役割分担を明確化）。したがってRoadmap Engine自体の
並び順は単純に「直近の期限が近い順」（`occurrences[0].dueDate`昇順）とし、AI参謀が持つ
`UrgencyBucket`・星評価のロジックを重複実装しない。

### 6-2. 複数年ホライズンは3年固定

MVPでは今年度＋来年度＋再来年度の3年分を固定でRoadmapItemに含める
（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 10節16.3で「3年か5年か」を
要判断事項として残していた点への回答）。3年とする理由:

- 消費税・法人税の中間申告要否判定に必要な「基準期間（2期前）」の参照が安定して機能する期間であること
- `localStorage`ベースの実データ量（1エントリ = 1決算期分）に対して、クライアント側の計算負荷が
  過大にならない範囲であること

延長の要否はSprint21.5以降、実際のβデータで再検討する。

### 6-3. 「次のN回」の生成方法

`calculateNextDeadline`（0節参照）の内部ロジックは変更せず、**基準日を1年ずつ進めて複数回
呼び出すラッパー関数**をRoadmap Engine側に新設する
（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4-3節を踏襲）。同様に
`applyCompanyProfileToProcedures`内の`specialExceptionDeadline()`（源泉所得税の特例、`today`基準で
次の1回のみ返す）も、同じ考え方で複数年分ループするラッパーを追加する（既存関数自体は変更しない）。

消費税中間申告（年3回・11回）の複数期日対応は、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
4-3節から引き続き**本Sprintではスコープ外**とする（9節）。

---

## 7. Roadmap更新条件

### 7-1. 「保存しない」ことによる不整合の不在

2-1節の原則の帰結として、Roadmapは**画面を開くたび・関連する入力が変わるたびにゼロから
再計算する**（pull型）。保存済みのRoadmapを持たないため、「入力を書き換えたのに古いRoadmapが
表示され続ける」という不整合は設計上発生し得ない
（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 1-1節の結論の再確認）。

### 7-2. 実装上の再計算トリガー（画面実装時の設計メモ）

「保存しない」ことと「画面が実際にいつ再描画すべきか」は別の問題であるため、実装フェーズ
（Sprint21.4）向けに再計算トリガーを整理しておく。

- `CompanyProfile`/`TaxReturnProfile`の保存操作 → 次に`buildTimelineFromSources`を呼んだ瞬間に
  自動的に反映される（Timelineが中間キャッシュを持たないため）
- 登録済みイベント（`anonymous_company_events`）の変更 → 同上
- **日付が変わったこと自体** → 「今日の日付」はRoadmap計算の暗黙の入力（6節）であるため、
  日をまたいだセッションでは再計算が必要。既存`ScheduleList.tsx`の`effectiveProcedures =
  useMemo(...)`パターンと同様、依存配列に「今日の日付を日単位に丸めた値」を含める設計を想定する

### 7-3. Roadmap Historyは新設しない

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節が設計していた「Roadmap History
（入力側の変更差分ログ）」は、**Timeline Engineの実装によって実質的に代替済みと結論づける。**
Timelineは「会社に関する確定した事実の時系列」そのものであり、CompanyProfile変更ログ・
TaxReturnProfileエントリ追加・イベント登録ログという5節が挙げた3種類の記録内容は、いずれも
Timelineのソース（`company_profile`/`tax_return_profile`/`event`）としてすでに表現できている。
**5節を独立実装として追加する必要はない**（9節でスコープ外と明記）。

---

## 8. AI参謀との役割分担

| | Roadmap Engine（本設計） | AI参謀（既存、`adviserScore.ts`） | 通知エンジン（既存、`notificationEngine.ts`） |
|---|---|---|---|
| 役割 | 何を・いつ、複数年分並べる（事実の整理） | 数ある手続きの中から「今何を優先すべきか」を1つに絞り、理由を添える（判断） | 「期限が近い」ことを機械的に知らせる（アラート） |
| 入力 | State + Timeline + Rule Engine + Procedure Master | `ScheduleProcedure[]` + statusMap（単年スライス） | 同左 |
| 出力 | `RoadmapItem[]`（複数年） | 星評価・コメント1文 | 通知カード |
| 時間軸 | 複数年 | 単年（現在） | 単年（現在） |

### 8-1. 既存コードへの影響

0節で確認した通り、AI参謀・通知エンジンのいずれも**コード変更は不要**という結論になる。
Roadmap Engineが`RoadmapItem[]`から「直近スライス（例: 今後90日以内）」を`ScheduleProcedure[]`に
変換する関数（仮称`roadmapItemsToScheduleProcedures`）を新設し、既存のAI参謀・通知エンジンの
呼び出しにそのまま渡せばよい（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-1節・8-1節、
[STATE_ENGINE.md](STATE_ENGINE.md) 8-1節と同じ結論）。

### 8-2. 将来の拡張（本Sprintではスコープ外）

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-2節・8-2節が予告していた
`buildRoadmapForesight`（長期見通しのAI参謀拡張）・`buildRoadmapAlerts`（変更検出・Confidence低下
通知）は、**Roadmap Engine本体（Sprint21.2〜21.3）が実装された後**でなければ入力（`RoadmapItem[]`）
自体が存在しないため、本Sprintでは設計しない。10節Sprint21.6で改めて着手時期を判断する。

---

## 9. β版スコープ

### 9-1. MVPに含めるもの

- `RoadmapItem[]`生成（3年分、6節）
- Confidence算出（`StateField.confidence`をそのまま再利用、7節・0節）
- AI参謀・通知エンジンへの直近スライス連携（8節）
- `procedures.category`のTypeScript型修正（`local_tax`追加、5-2節・10節）

### 9-2. MVPに含めないもの（次スプリント以降）

- 年間ロードマップ画面そのもののUI実装（Sprint21.4、10節）
- `buildRoadmapForesight`・`buildRoadmapAlerts`（8-2節、Roadmap Engine本体完了後に別途設計）
- Roadmap Historyの独立実装（7-3節、Timelineで代替済みと結論）
- 消費税中間申告の年3回/11回、複数期日対応（6-3節、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
  から継続してスコープ外）
- `withholdingTaxCycle`のState欠落ギャップの解消（0節、`state.ts`の既知の制約。別Sprintで
  `timelineProducer.ts`側の対応を検討する）

### 9-3. 対象ユーザー

既存のβテスター（Sprint13相当）と同じ想定。DB・画面変更を伴わない本Sprintの成果物自体は
ユーザーには見えない（内部設計のみ）。

---

## 10. Sprint21.2〜21.6実装計画

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **21.2** | `ProcedureCategory`型に`'local_tax'`を追加（`types.ts`、5-2節の前提解消）。`RoadmapItem`/`AnnualRoadmap`型定義、`calculateNextDeadline`の「次のN回」ラッパー実装 | `src/lib/types.ts`、`src/lib/roadmapEngine.ts`（新規） | Sprint21.1レビュー承認 | `horizonYears`を設定可能にするか3固定にするか |
| **21.3** | Roadmap Engine本体（State + Timeline + Rule Engineを統合し`RoadmapItem[]`を生成）、Confidence算出ロジック（`StateField.confidence`からの導出） | `src/lib/roadmapEngine.ts` | 21.2完了 | Rule Engineの複数年評価方法（年ごとに`today`をずらして複数回`evaluateRules`を呼ぶか、1回評価した結果を複数年に使い回すか） |
| **21.4** | 年間ロードマップ画面の実装（新規ルート、5節のレイアウト方針を反映） | `src/app/(site)/roadmap/page.tsx`（新規） | 21.3完了 | 既存`/result`との導線（置き換えるか、並存させるか） |
| **21.5** | AI参謀・通知エンジンへの直近スライス連携配線（`roadmapItemsToScheduleProcedures`） | `ScheduleList.tsx`または`roadmap/page.tsx` | 21.4完了 | 既存`/result`のAI参謀カードを残すか、ロードマップ画面に一本化するか |
| **21.6** | `buildRoadmapForesight`・`buildRoadmapAlerts`の設計着手要否の判断 | 別途設計書 | 21.5完了 | [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-2節・8-2節の設計をどこまで踏襲するか |

---

## まとめ（設計レビュー観点）

1. **2節の核心的な判断**: `Roadmap = f(State + Timeline + Rule Engine)`という式の解釈
   （`CompanyProfile`/`TaxReturnProfile`は直接の入力にせず、Timeline/State経由で間接的に反映する。
   ただし`applyCompanyProfileToProcedures`呼び出し時のみ`CompanyProfile`を直接読む二重経路を
   許容する）でよいか
2. **4節・7節**: `RoadmapItem.confidence`を独自に再計算せず、`StateField.confidence`から
   （最も確からしさが低いものを採用する形で）そのまま導出する設計でよいか
3. **6-2節**: 複数年ホライズンを3年固定とした判断（5年ではなく3年とした根拠）
4. **7-3節**: Roadmap History（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節）を
   独立実装せず、Timelineで代替済みと結論づけた点
5. **9節**: MVPスコープ（特に`buildRoadmapForesight`/`buildRoadmapAlerts`を21.6まで持ち越し、
   本体実装を優先する順序）が妥当か
6. **10節**: 実装順序（21.2〜21.6）、特に`local_tax`のカテゴリ型修正を21.2の最初のタスクとして
   含めた点でよいか
