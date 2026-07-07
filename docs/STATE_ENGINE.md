# STATE_ENGINE.md — State Engine設計（Sprint20 Phase20.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード実装・画面変更は本Phaseでは一切行っていない。**
実装はレビュー後、Sprint20.2以降で段階的に行う（10節参照）。

## 0. 前提として確認した既存事実

設計に入る前に、既存コード・既存設計書との整合を確認した。**本設計は「新しい概念」ではなく、
既存コードに既に部分的に存在するロジックの一般化であることを先に明確にする。**

- **`src/lib/companyProfile.ts`の`deriveConsumptionTaxStatus`・`deriveCorporateTaxInterimFiling`・
  `deriveConsumptionTaxInterimFrequency`は、既に「`TaxReturnProfile`という過去の事実から、
  今の状態を計算する」というState Engineと同じ発想の関数として存在する。** ただし対象は3項目のみ、
  入力は`TaxReturnProfile`単体（Timeline全体ではない）という制約がある。**本設計はこの3関数を
  置き換えるのではなく、対象フィールドを広げ、入力をTimeline全体に一般化したもの**という位置づけにする
- **`src/app/(site)/profile/tax-returns/page.tsx`の`detectMismatches`（Sprint17.2〜18.2で実装済み）は、
  「TaxReturnProfileから計算した推定値」と「CompanyProfileの現在値」を比較し、矛盾があれば
  ユーザーに確認する（Change Interview）という既存の実装がある。** これは本設計が指す
  「State」と「CompanyProfile」の関係そのものの**先行実装**である。State Engineは
  `detectMismatches`内に埋め込まれていたこのロジックを、`page.tsx`から独立した再利用可能な
  計算層として切り出す設計、と位置づける（4節で詳述）
- **[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節「Roadmap Confidence」
  （`confirmed`/`estimated`/`incomplete`の3分類、設計済み・未実装）は、本設計の「Reason（根拠）」が
  必要とする確からしさの分類と完全に一致する。** 本設計はこの3分類を独自に再定義せず、
  そのまま再利用する（9節で詳述）
- **[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md)（Sprint19.1設計・Sprint19.2/19.3実装済み）が
  `TimelineEvent`・`buildTimelineFromSources`を既に提供している。** State Engineはこの
  `TimelineEvent[]`を唯一の入力とする（`CompanyProfile`・`TaxReturnProfile`を直接読まない）。
  これにより、将来Financial（会計データ連携）・Advisory等の新しいTimelineソースが増えても、
  State Engine側の変換ロジックは「新しいTimelineEvent種別への対応を1つ増やすだけ」で済む
- **`src/lib/ruleEngine.ts`の`evaluateRules`は`RuleContext`（`Record<string, unknown>`）という
  汎用的な入力を受け取るだけで、`CompanyProfile`由来かどうかを関知しない。** 既存の
  `buildProfileRuleContext(profile: CompanyProfile)`と同じパターンで、State由来のコンテキスト
  組み立て関数を追加するだけで済む見込み（6節）
- **`CompanyProfile`はSprint14 Phase14.2以来、`localStorage`のみで持続化され、ユーザーが`/profile`で
  直接編集する「自己申告の現況」である。** この性質は本設計後も変えない（4節）

---

## 1. Stateとは

### 1-1. 定義

**Timelineに記録された事実（`TimelineEvent[]`）から計算される、「会社の現在地」の導出結果。**
CompanyProfileと同じ「今どうなっているか」という問いに答えるが、情報源が異なる。

| | CompanyProfile（既存） | State（本設計） |
|---|---|---|
| 情報源 | ユーザーの自己申告（`/profile`での手入力） | Timelineに記録された確定事実の計算結果 |
| 更新方法 | ユーザーが能動的に編集 | Timelineが更新されるたびに再計算（都度計算、保存しない） |
| 「正しさ」の性質 | ユーザーの認識（誤りうる） | 記録された事実からの機械的な計算（事実に忠実だが、Timelineの記録が薄い項目は`incomplete`になりうる） |

### 1-2. Roadmapと同じ「都度計算・保存しない」原則

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 1-1節の原則をそのまま引き継ぐ。
Stateという名前の新しい`localStorage`キーやDBテーブルは作らない。**Stateは`TimelineEvent[]`を
入力に取り、呼ばれるたびに計算する純粋関数の戻り値**として設計する。

```
State = f( Timeline )
```

Timeline自体が`CompanyProfile`・`TaxReturnProfile`・登録済みイベントの統合ビュー
（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 2-3節）であるため、間接的には

```
State = f( buildTimelineFromSources( CompanyProfile, TaxReturnProfile, RegisteredEvents, 手動記録 ) )
```

という関係になるが、State Engine自体は`TimelineEvent[]`だけを見ればよく、元データの形式
（`CompanyProfile`か`TaxReturnProfile`か）を意識しない設計にする（0節の「新しいTimelineソースが
増えてもState側の変更を1つに抑える」という狙いに対応）。

### 1-3. 「State」という名前の意図

CompanyProfile（プロフィール＝自己紹介）に対し、State（状態＝観測結果）という名前を選んだ。
**Stateはユーザーが編集する対象ではなく、システムが「今、事実からこう認識している」という
読み取り専用の計算結果**であることを名前で表現する。

---

## 2. Stateモデル

### 2-1. 型設計（イメージ、コード未実装）

```ts
// 設計イメージ（Sprint20時点ではコード化しない）

export type StateConfidence = 'confirmed' | 'estimated' | 'incomplete'; // 6節参照（Roadmap Confidenceを再利用）

export type StateField<T> = {
  value: T;
  confidence: StateConfidence;
  basedOnEventIds: string[]; // 根拠にしたTimelineEvent.idの一覧（9節）
  asOf: string | null;       // 根拠となった最新イベントのoccurredAt。根拠が無ければnull
};

export type CompanyState = {
  stage: StateField<CompanyStage | null>;
  consumptionTaxStatus: StateField<ConsumptionTaxStatus | null>;
  corporateTaxInterimFiling: StateField<InterimFilingStatus | null>;
  consumptionTaxInterimFrequency: StateField<ConsumptionTaxInterimFrequency | null>;
  invoiceRegistrationStatus: StateField<InvoiceRegistrationStatus | null>;
  capital: StateField<number | null>;
  employeeCount: StateField<number | null>;
  calculatedAt: string; // Stateを計算したタイムスタンプ（ISO datetime）
};
```

既存の`CompanyProfile`型（`src/lib/companyProfile.ts`）と対象フィールドを意図的に揃えている
（4節「差分検出」を将来実装する際、フィールド単位で1対1比較できるようにするため）。

### 2-2. なぜ全フィールドを`StateField<T>`で包むのか

単なる`{ stage: CompanyStage, capital: number }`ではなく、値ごとに`confidence`・
`basedOnEventIds`・`asOf`を持たせる。理由は、**Stateの各フィールドはTimelineの記録密度に
よって確からしさが異なる**ため（例: 決算実績が3期分あれば`consumptionTaxStatus`は`confirmed`に
近いが、`invoiceRegistrationStatus`は登録イベントが一度も記録されていなければ`incomplete`に
なる）。1つの`CompanyState`オブジェクトの中で、フィールドごとに異なる確からしさを表現する必要がある。

---

## 3. Timeline→State変換

### 3-1. 基本方針：「直近の該当イベント」を正とする

各フィールドについて、対象カテゴリ（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 3節の
`company`/`tax`/`hr`）のTimelineEventを`occurredAt`の新しい順に走査し、**そのフィールドに
関する最も新しい事実を正とする**という単純な畳み込みルールにする（複雑な統計・推論は行わない。
Roadmap Update Engineと同じく「決定的ロジックのみ、外部AI呼び出しなし」という既存方針
（`src/lib/adviserScore.ts`冒頭コメント）を踏襲）。

| Stateフィールド | 対応するTimelineEvent | 変換ロジック |
|---|---|---|
| `stage` | `category: 'company'`、`source: 'event'`（`company_establishment`） または`tax`カテゴリの存在 | 決算関連の`tax`カテゴリイベントが1件でも存在すれば`second_term_or_later`。無ければ`company_establishment`の`occurredAt`から`first_term`。イベント自体が無ければ`incomplete` |
| `consumptionTaxStatus` | `category: 'tax'`（`tax_return_profile`由来）の`metadata.consumptionTaxStatus` | 既存`deriveConsumptionTaxStatus`と同じ基準期間ロジックを、TimelineEvent版に置き換えて適用（0節） |
| `corporateTaxInterimFiling` / `consumptionTaxInterimFrequency` | 同上 | 既存`deriveCorporateTaxInterimFiling`/`deriveConsumptionTaxInterimFrequency`と同じロジックをTimelineEvent版に置き換え |
| `invoiceRegistrationStatus` | `category: 'tax'`の`metadata.invoiceRegistrationStatus`、または将来の`invoice_registration`イベント | 直近の`tax`カテゴリイベントの値。該当イベントが無ければ`incomplete` |
| `capital` | `category: 'company'`（`company_profile`由来の設立事実、または将来の増資イベント） | 直近の資本金に関する事実。MVPのTimeline（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 3節）は設立時点の資本金しか記録していないため、増資イベントが無い間は設立時点の値がそのまま`confirmed`として使われる |
| `employeeCount` | `category: 'hr'` | 直近の`employee_hired`イベント、または`tax`カテゴリの`employeeCountAtFiscalYearEnd`のうちより新しい方 |

### 3-2. 既存`derive*`関数との実装上の関係

既存の3関数（`deriveConsumptionTaxStatus`等）は`TaxReturnProfile`を直接受け取る。State Engineの
実装時（Sprint20.2〜20.3）は、これらの関数を破棄するのではなく、**「TimelineEventから
TaxReturnProfile相当のビューを再構成してから既存関数に渡す」か「関数のシグネチャを
`TimelineEvent[]`ベースに拡張する」かのどちらかを選ぶ**必要がある。**本Sprintではこの実装方式の
選択は行わず、10節の要判断事項に残す**（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 2-3節の通り、
`TaxReturnProfile.entries`は既にTimelineEventへ1対1変換可能なため、逆変換も理論上可能）。

### 3-3. 情報が無い場合は`incomplete`のまま返す

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) の既存`derive*`関数と同じ
「根拠が無ければ`null`を返し断定しない」という原則を、Stateでも徹底する。**Timelineに該当する
イベントが無いフィールドは`value: null`・`confidence: 'incomplete'`・`basedOnEventIds: []`を返す**
（AI参謀等の消費側が「情報不足」を必ず判別できるようにするため）。

---

## 4. CompanyProfileとの役割分担

### 4-1. Stateは CompanyProfile を置き換えない

0節で確認した通り、`CompanyProfile`は「ユーザーの自己申告・意思」を表すレイヤーとして
**引き続き存在し、Rule Engineの入力（`buildProfileRuleContext`）としても使われ続ける**。
Stateは「Timelineの事実からの客観的な計算結果」であり、2つは以下のように役割が異なる。

| | CompanyProfile | State |
|---|---|---|
| 答える問い | 「ユーザーは今の状態をどう認識・申告しているか」 | 「記録された事実から、今の状態は何だと言えるか」 |
| Rule Engineでの用途 | 現状通り、判定コンテキストの直接の入力 | 将来的な追加材料（6節、本Sprintでは接続しない） |
| ユーザーへの見せ方 | `/profile`で編集可能な値 | 参考情報・矛盾確認の材料（読み取り専用） |

### 4-2. 既存`detectMismatches`パターンの一般化（将来実装、本Sprintでは行わない）

0節で確認した通り、`detectMismatches`（`page.tsx`）は既に「TaxReturnProfileから計算した値」と
「CompanyProfileの値」を比較し、矛盾があればChange Interview（採用/維持の2択）でユーザーに
確認する、というパターンを実装済みである。**State Engineが実装されれば、この比較を
「TaxReturnProfileの計算値 vs CompanyProfile」から「Stateの各フィールド vs CompanyProfileの
対応フィールド」に一般化できる**（2-1節で型のフィールドを意図的に揃えているのはこのため）。

**この一般化・画面への配線は本Sprintでは行わない。** 現行の`detectMismatches`（3項目→
Sprint18.2で7項目に拡張済み）はそのまま動作し続け、State Engine実装後にどちらのロジックを
正とするかは10節の要判断事項として残す（重複を避けるため、いずれ`detectMismatches`は
Stateベースの汎用比較に置き換わる可能性が高いが、既存の決算更新フロー
（[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md)）の実装（Sprint18.2）を壊さないことを優先する）。

---

## 5. TaxReturnProfileとの役割分担

### 5-1. TaxReturnProfileは「生データ」、Stateは「畳み込んだ計算結果」

`TaxReturnProfile.entries`は決算ごとの申告実績を**時系列にすべて保持する生データ**であり、
1件も欠損・上書きされない（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)）。
State（の`consumptionTaxStatus`等）は、この時系列データを**「今の1点」に畳み込んだ結果**である。

```
TaxReturnProfile.entries = [2023年度実績, 2024年度実績, 2025年度実績]  ← 生データ、全件保持
                                                ↓（Timeline経由で3節の変換ロジックを適用）
State.consumptionTaxStatus = { value: 'taxable', confidence: 'confirmed', basedOnEventIds: [...] } ← 今の1点
```

### 5-2. どちらを見るべきか（用途の違い）

- **「今、消費税は課税か免税か」を知りたい** → State（1点に畳み込まれた最新の答え）
- **「過去3期の推移を確認したい、税理士に説明したい」** → TaxReturnProfile（生データ、または
  Timelineの`tax`カテゴリをそのまま一覧表示）

State EngineはTaxReturnProfileの生データを削除・要約して失わせるものではなく、**「今の1点」を
知りたい場面（Rule Engine入力・AI参謀の判断材料等）向けの追加ビュー**という位置づけにする。

---

## 6. Rule Engineとの関係

### 6-1. 既存コードへの影響

[RULE_ENGINE.md](RULE_ENGINE.md)の`evaluateRules`（`src/lib/ruleEngine.ts`）は`RuleContext`
（`Record<string, unknown>`）という汎用的な入力を受け取るだけで、そのキーが`CompanyProfile`由来か
State由来かを関知しない。**`evaluateRules`自体のコード変更は不要**という結論になる
（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-1節と同じ結論のパターン）。

### 6-2. 新規追加する関数（設計イメージ、本Sprintでは実装しない）

既存の`buildProfileRuleContext(profile: CompanyProfile)`（`companyProfile.ts`）と同じパターンで、

```ts
// 設計イメージ（Sprint20.5でコード化）
export function buildStateRuleContext(state: CompanyState): Record<string, unknown> {
  return {
    state_consumption_tax_status: state.consumptionTaxStatus.value,
    state_company_stage: state.stage.value,
    // ...
  };
}
```

を新設し、`src/lib/events.ts`の`context`組み立て（[RULE_ENGINE.md](RULE_ENGINE.md)「条件評価の流れ」
1.）に**追加**する形を想定する。既存の`buildProfileRuleContext`の呼び出しを置き換えるのではなく
併用し、ルール側は`consumption_tax_status`（CompanyProfile由来、既存）と
`state_consumption_tax_status`（State由来、新規）のどちらでも条件を書けるようにする
（[RULE_ENGINE.md](RULE_ENGINE.md)「将来の拡張方針」に明記の通り、条件フィールドの追加はコンテキストに
キーを足すだけでよく、`ruleEngine.ts`側の変更は不要）。

---

## 7. Roadmap Engineとの関係

### 7-1. Roadmap計算式への位置づけ

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 1-1節の既存の式：

```
Roadmap = f( CompanyProfile, TaxReturnProfile, ProcedureMaster, RuleEngine, RegisteredEvents, 今日の日付 )
```

State Engineが実装されれば、`CompanyProfile`・`TaxReturnProfile`・`RegisteredEvents`という
3つの個別入力を、**Timeline経由で計算された`State`という1つの正規化された入力に置き換えられる
可能性がある**（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 5-2節で既に示した「Timelineは入力の
時系列的な裏付け」という関係の延長）。

```
Roadmap = f( State, ProcedureMaster, RuleEngine, 今日の日付 )   ← 将来的な簡略化のイメージ
```

**この置き換えは本Sprintでは行わない。** Roadmap Update Engine本体（Sprint16.3、未実装）が
先に実装されるべきであり、State Engineはその実装時に「入力をどう与えるか」の選択肢の1つとして
提示するに留める（10節）。

### 7-2. Roadmap Confidenceとの統合

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節「Roadmap Confidence」
（`RoadmapItem`単位の確からしさ）と、本設計の`StateField.confidence`（フィールド単位の確からしさ）は
**同じ3分類（`confirmed`/`estimated`/`incomplete`）を共有する**（9節）。Roadmap Update Engine実装時、
`RoadmapItem`のConfidenceは「その手続きの判定に使われた`StateField`のうち最も確からしさが低いもの」
から算出する、という接続方法が考えられる（**具体的な算出ロジックはRoadmap Update Engine実装時に
改めて設計する。本Sprintでは接続方法の提示に留める**）。

---

## 8. AI参謀との関係

### 8-1. 既存コードへの影響

`src/lib/adviserScore.ts`の各関数（`buildAdviserSummary`・`buildAdviserComment`・
`buildRiskEntries`・`buildProfileAdvisories`・`buildClosingUpdateSummary`）はいずれも
`ScheduleProcedure[]`または`CompanyProfile`を直接見る設計であり、**コード変更は不要**という
結論になる（6-1節・7-1節と同じパターン）。

### 8-2. 新規追加する助言の可能性（設計イメージ、本Sprintでは実装しない）

Stateが導入されれば、「CompanyProfile（ユーザーの自己申告）とState（Timelineからの計算結果）が
食い違っている」という事実そのものをAI参謀の助言材料にできる。例：

- 「Timelineの記録によれば決算実績が登録されているため2期目以降のはずですが、プロフィールは
  まだ1期目のままです。プロフィールの見直しをおすすめします」
- 「消費税ステータスについて、Timelineからは`incomplete`（確定申告実績が不足）と判定されています。
  確定申告実績の入力をおすすめします」

これらは4-2節で述べた「`detectMismatches`の一般化」が実装された後、その差分情報を
`buildProfileAdvisories`スタイルの関数に渡す形で実現できる見込み（**実装はState Engine本体
（Sprint20.2〜20.4）完了後、別Sprintで改めて設計する**）。

---

## 9. Reason（根拠）の保持

### 9-1. 目的

Stateの各フィールドが「なぜその値なのか」を説明可能にする。[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
5-2節でRoadmap Historyの用途として挙げた「あの時どう変わったかの確認（特に税理士等の専門家が
確認する場面を想定）」と同じ動機であり、State Engineではこれを**フィールド単位の根拠**として
実現する。

### 9-2. `basedOnEventIds`・`asOf`・`confidence`の役割分担

- `basedOnEventIds`: そのフィールドの値を決定づけた1件以上の`TimelineEvent.id`。**「なぜ」を
  具体的な記録まで遡って追跡できるようにする**（画面表示は本Sprントでは行わないが、将来
  「この値の根拠になった記録を見る」というUIリンクの実装を可能にする）
- `asOf`: 根拠になった最新イベントの`occurredAt`。**「情報の新しさ」を表す**
  （[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 5-2節で示した「その値がいつ確定したか」の実装がこれにあたる）
- `confidence`: [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節の3分類を再利用。
  「根拠が0件」なら`incomplete`、「TimelineEventはあるが確度の低い情報源（例: 概算レンジの
  `AmountValue`、[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)）」なら`estimated`、
  「確定した事実（`exact`のAmountValue等）」なら`confirmed`

### 9-3. `confidence`判定に`AmountValue.precision`を使う

[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)で設計済みの`AmountValue`
（`exact`/`range`の2値、`confidenceOfAmount`関数で`high`/`medium`/`low`に変換済み、
`src/lib/taxReturnProfile.ts`に実装済み）は、Stateの`confidence`判定にそのまま使える
（`taxableSalesAmount`が`range`精度で入力されていれば、そこから導出される`consumptionTaxStatus`の
`confidence`は`confirmed`ではなく`estimated`にする、等）。**この対応関係の具体的な実装は
Sprint20.3で行う。本Sprintでは方針の確認に留める。**

---

## 10. Sprint20.2〜20.6実装計画

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **20.2** | `CompanyState`/`StateField`/`StateConfidence`型定義、`stage`・`invoiceRegistrationStatus`・`capital`・`employeeCount`（比較的単純な畳み込みロジックのフィールド）の変換実装 | `src/lib/state.ts`（新規） | Sprint19.3完了（済み） | 3-1節の畳み込みルール（「直近の該当イベントを正とする」）の妥当性 |
| **20.3** | `consumptionTaxStatus`・`corporateTaxInterimFiling`・`consumptionTaxInterimFrequency`（既存`derive*`関数と重複するフィールド）の変換実装、`AmountValue.precision`との連携（9-3節） | `src/lib/state.ts` | 20.2完了 | 3-2節「既存derive*関数を再利用するか、置き換えるか」の実装方式選定 |
| **20.4** | CompanyProfileとの差分検出をStateベースに一般化（`detectMismatches`の一般化、4-2節） | `src/lib/state.ts`、`src/app/(site)/profile/tax-returns/page.tsx` | 20.2・20.3完了 | 既存`detectMismatches`（Sprint18.2実装済み）とどう共存・統合するか |
| **20.5** | Rule Engine連携（`buildStateRuleContext`、6-2節） | `src/lib/state.ts`、`src/lib/events.ts` | 20.2完了 | 既存`consumption_tax_status`条件とState由来の条件が両方使える状態でのルール設計ガイドライン |
| **20.6** | Roadmap Engine接続（7-1節・7-2節） | `src/lib/roadmapEngine.ts`（未実装、Sprint16.3待ち） | Roadmap Update Engine本体（Sprint16.3）完了 | Roadmap計算式をStateベースに簡略化するかどうか |

---

## まとめ（設計レビュー観点）

1. **0節・4節の核心的な判断**: State Engineを、既存の`derive*`関数（`companyProfile.ts`）・
   `detectMismatches`（`page.tsx`）の一般化として位置づける方針でよいか。既存コードを
   置き換える時期・範囲（特に10節20.4）は別途要判断
2. **1-1節**: CompanyProfile（自己申告）とState（Timelineからの計算結果）という役割分担の妥当性。
   両者が食い違う場合に「どちらを正とするか」は既存の決算更新フロー
   （[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md)）と同じ「ユーザーに確認を求める」方針を
   踏襲する想定でよいか
3. **3-1節**: 「直近の該当イベントを正とする」という単純な畳み込みルールで十分か。複数の
   矛盾する記録がTimeline上に存在する場合（例: 手動記録と決算実績が食い違う）の優先順位は
   未設計のまま10節に持ち越している
4. **9節**: Reason（`basedOnEventIds`/`asOf`/`confidence`）の設計が、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
   6節のRoadmap Confidenceと整合しているか。同じ3分類を共有する設計判断の妥当性
5. **10節の実装順序**: 20.4（CompanyProfileとの差分検出の一般化）が既存の`detectMismatches`
   （Sprint18.2、稼働中）と重複する可能性がある点。既存実装を壊さずに移行する具体的な手順は
   20.4着手時に改めて設計が必要
6. **7節**: Roadmap Update Engine本体（Sprint16.3）が引き続き未着手のまま、Timeline Engine
   （Sprint19系）・State Engine（Sprint20系）という「入力側の整理」が先行している点。
   Roadmap Update Engine本体の着手時期をどう位置づけるか
