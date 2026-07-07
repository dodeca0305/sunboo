# ROADMAP_EVOLUTION_ENGINE.md — 経営ロードマップ進化エンジン設計（Sprint16 Phase16.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード実装・画面実装は本Phaseでは一切行っていない。**
実装はレビュー後、Sprint16.2以降で段階的に行う（10節参照）。

**追記（2026-07-07）**: 本設計の初稿（0節〜10節）を書いた後、コミット`fa034f5`（`fix: apply company
profile filters to roadmap`、Sprint16の設計プロセスを経ずに別途追加・`origin/main`にpush済み）により
`src/lib/companyProfile.ts`に`applyCompanyProfileToProcedures`が実装済みであることが判明した。
本設計とは矛盾しないため巻き戻さず、既存の実装として本ドキュメントに整合させる形で追記した
（該当箇所は0節・1-3節・4-1節・4-3節・9節・10節に「（2026-07-07追記）」として明記）。

## 0. 前提として確認した既存事実

設計に入る前に、既存コード・既存設計書との整合を確認した。

- **`CompanyProfile`（Sprint14 Phase14.2、`src/lib/companyProfile.ts`）は`localStorage`（`sunboo:company-profile`）
  のみで持続化されており、DBに永続化されていない。** これは意図的な設計（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)
  1-1「推奨: Phase14.2はA（localStorage拡張）から始める」）であり、本Sprintもこの前提を引き継ぐ
- **`CompanyProfile`の自動判定関数のうち3つが、根拠不足を理由に意図的に`null`を返す設計になっている**
  （`deriveConsumptionTaxStatus`は2期目以降で`null`、`deriveCorporateTaxInterimFiling`・
  `deriveConsumptionTaxInterimFrequency`も2期目以降は`null`。`src/lib/companyProfile.ts`の
  コメント「基準期間の課税売上高は会計データが無いと判定できないため、それ以外はnull」参照）。
  **本Sprintの2節「Tax Return Profile」は、まさにこの`null`を埋めるための仕組みとして設計する**
- **Procedure Master（`procedures`テーブル）は現在30件**（Sprint15 Phase15.2完了時点。既存20件＋
  法人税確定申告・消費税確定申告・地方税3種・償却資産申告・給与支払報告書・源泉所得税の特例申請・
  異動届出書・決算公告の10件）。うち`CONSUMPTION_TAX_RETURN`（消費税確定申告）は
  `include_in_diagnosis = false`で、現状Rule Engine経由でのみ表示可能（[PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md](PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md)参照）
- **`event_types`に「決算」（`fiscal_year_end`）「本店移転」（`hq_relocation`）「賞与支給」（`bonus_payment`）
  「36協定」（`labor_agreement_36`）「インボイス登録」（`invoice_registration`）の5件が、
  `is_active = false`の状態で既にマスタ投入済み**（Sprint15 Phase15.2、`/events`のUI未対応のため意図的に非活性）。
  **本Sprintの3節「Change Interview」・9節「毎年の更新フロー」は、この5件（特に「決算」）を
  活性化する前提で設計する**
- **AI参謀（`src/lib/adviserScore.ts`）・通知エンジン（`src/lib/notificationEngine.ts`）は、
  いずれも`ScheduleProcedure[]`（単年・診断1回分のフラットな手続き一覧）を入力に取る純粋関数であり、
  「複数年」「履歴」という概念を持たない。** 本Sprintで両者のコード自体を変更する必要はなく、
  「どの範囲の`ScheduleProcedure[]`を渡すか」を変えるだけで済む設計にする（7節・8節）
- **`docs/DATABASE.md`に明記の通り、永続的な`companies`エンティティは意図的に作っていない。**
  本Sprintも「Roadmap」を独立したDBエンティティとして新設する設計にはせず、既存データからの
  「導出ビュー」として設計する（1節）
- **（2026-07-07追記）`applyCompanyProfileToProcedures`（`src/lib/companyProfile.ts`、コミット
  `fa034f5`で追加済み）が既に本番相当のコードに存在する。** `ScheduleList.tsx`で
  `runDiagnosis`/`registerCompanyEvent`の結果に対して呼ばれ、①`CompanyProfile.stage ===
  'second_term_or_later'`のとき設立系手続き（法人設立届出書・青色申告承認申請書等6件）を
  一覧から除外し、②`CompanyProfile.withholdingTaxCycle === 'special_exception'`のとき
  源泉所得税の納付期限を年2回パターン（1/20・7/10）に上書きする。**単年・`ScheduleProcedure[]`
  止まりの狭い実装だが、本Sprintが目指す「CompanyProfileに応じた手続きの出し分け」を
  部分的に先取りしたもの**であり、矛盾する設計ではない。4節でRoadmap Update Engineの
  パイプラインに組み込む形で整理する

---

## 1. Roadmap更新の考え方

### 1-1. Roadmapは「持続化されたモノ」ではなく「都度計算される導出結果」

```
Roadmap = f( CompanyProfile, TaxReturnProfile, ProcedureMaster, RuleEngine, RegisteredEvents, 今日の日付 )
```

現状の`/result`（`runDiagnosis`）・`/events`（`registerCompanyEvent`）は、いずれも「呼ばれた瞬間の入力」から
その場で手続き一覧を計算し、計算結果自体は保存しない（`ProcedureResult`はレスポンスとして返るだけで、
DBにもlocalStorageにも書き込まれない）。**Roadmap Evolution Engineもこの原則をそのまま踏襲する。**
「Roadmap」という名前のテーブルや`localStorage`キーを新設し、そこに完成品を保存する設計にはしない。

理由は[DATABASE.md](DATABASE.md)が明記する「永続的な`companies`エンティティを意図的に作らない」という
既存方針と、5節「Roadmap History」の設計（後述）が両立するため。計算結果を保存してしまうと、
入力（`CompanyProfile`等）が変わるたびに保存済みRoadmapを再計算して上書きする同期処理が必要になり、
「入力を書き換えたのに古いRoadmapが表示され続ける」不整合のリスクを常に抱えることになる。
**都度計算される設計であれば、この種の不整合はそもそも起こり得ない。**

### 1-2. 「リアルタイムで更新される」の意味を定義する

ユーザー要求の「リアルタイムで更新される」は、WebSocket等によるプッシュ配信を意味しない
（[ARCHITECTURE.md](ARCHITECTURE.md)の通り、SUNBOOは独自バックエンドを持たないNext.js + Supabase-js直接呼び出しの
構成であり、常時接続のプッシュ配信基盤が無い）。本設計における「リアルタイム」とは：

> **Roadmapを表示する画面を開くたびに、その時点で最新の`CompanyProfile`・`TaxReturnProfile`・
> `procedures`・`rules`・登録済みイベントを使って再計算される**（pull型）。
> 「front-endが古いキャッシュを表示し続ける」ことが無い、という意味での即時性であり、
> 「他のユーザー・他の端末に自動で通知が飛ぶ」という意味のリアルタイム性は対象外とする。

複数端末をまたいだ同期は、`CompanyProfile`自体が`localStorage`である限り原理的に実現できない
（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-1の制約がそのまま伝播する）。この制約は
10節のSprint16.6（永続化の検討）まで解消しない前提とする。

### 1-3. 既存`/result`・`/events`との関係

Roadmap Update Engine（4節）は`runDiagnosis`・`registerCompanyEvent`を置き換えるものではなく、
**両者が生成する`ProcedureResult`を「素材」として取り込み、複数年ホライズンに展開する上位の計算**、
と位置づける。既存の2エンジンのコードは変更せず、新しい計算層をその上に重ねる設計とする
（4節で詳細）。

**（2026-07-07追記）** 実はこの「上に計算層を重ねる」という形は、`applyCompanyProfileToProcedures`
（0節参照）として既に一部実装されている。`ScheduleList.tsx`は`runDiagnosis`/`registerCompanyEvent`
の結果をそのまま使わず、`applyCompanyProfileToProcedures`を通した`effectiveProcedures`を
AI参謀・通知エンジン・完了率集計のすべてに使うよう既に配線済みだった。これは本節の設計方針が
既存コードの実際の流れと整合していることの裏付けであり、Roadmap Update Engineは
この既存関数を**置き換えず、パイプラインの1ステージとして呼び出す**設計にする（4-1節）。

---

## 2. Tax Return Profile

### 2-0. 定義（本Sprintでの解釈）

ユーザー要求の「Tax Return Profile」は、`CompanyProfile`（現在の状態・現在の認識）とは別に、
**「決算のたびに確定した過去の申告実績」を時系列に積み上げる記録**と解釈して設計する
（この解釈が要求と異なる場合はレビューで指摘いただきたい）。

`CompanyProfile`は「今の会社はどういう状態か」という**現況スナップショット**（1つしか存在しない）。
`TaxReturnProfile`は「決算期ごとに何を申告し、いくらだったか」という**時系列の実績ログ**（決算回数分存在する）
という違いを明確に分ける。

| | CompanyProfile（Phase14.2） | TaxReturnProfile（本Sprint） |
|---|---|---|
| 性質 | 現況（1件のみ、上書き更新） | 実績履歴（決算のたびに追記、上書きしない） |
| 主な用途 | Rule Engine・AI参謀の判断材料（現在の分岐条件） | 翌期以降のCompanyProfile自動判定の根拠、Roadmap Confidenceの根拠 |
| 更新タイミング | ユーザーが`/profile`で随時編集 | 決算イベント登録時のChange Interview（3節）でのみ追記 |
| 例 | `consumptionTaxStatus: 'exempt'`（今は免税） | `{fiscalYear: '2025', taxableSalesAmount: 8000000, consumptionTaxStatus: 'exempt'}`（2025年度は課税売上800万円で免税だった） |

### 2-1. 型設計（イメージ、コード未実装）

```ts
// 設計イメージ（Sprint16時点ではコード化しない）

export type TaxReturnEntry = {
  fiscalYearEndDate: string;         // 決算日（ISO）。これが基準期間計算の起点になる
  filedDate: string | null;          // 実際に申告した日（未申告ならnull）

  // 消費税判定の材料
  taxableSalesAmount: number | null; // その期の課税売上高（円）。次々期の免税/課税判定の基準期間データになる
  consumptionTaxStatus: ConsumptionTaxStatus; // その期に実際どちらだったか（確定値、推定ではない）

  // 中間申告の要否判定の材料（翌期に引き継ぐ）
  corporateTaxAmount: number | null;    // 確定法人税額
  consumptionTaxAmount: number | null;  // 確定消費税額

  // 決算公告・法定調書等、実施有無の記録（Confidence向上のための事実確認）
  financialStatementPublished: boolean;
};

export type TaxReturnProfile = {
  entries: TaxReturnEntry[]; // 決算のたびに1件追加。古い順に並べる
};
```

`capital`（資本金）は決算のたびに変わるものではない（増資イベントで変わる）ため`TaxReturnEntry`には
含めない。`CompanyProfile.capital`のまま単一の現況値として扱う。

### 2-2. `CompanyProfile`の自動判定への還元

`TaxReturnProfile`が蓄積されることで、0節で確認した「根拠不足で`null`を返していた」3つの自動判定関数が、
2期目以降も実際の値を返せるようになる（**この関数群の実装自体はSprint16.3で行う。本節は設計方針のみ**）。

| 既存の自動判定関数（`companyProfile.ts`） | 現状（Phase14.2） | `TaxReturnProfile`導入後 |
|---|---|---|
| `deriveConsumptionTaxStatus` | `stage !== 'first_term'`なら常に`null` | 直近2期前（基準期間）の`taxableSalesAmount`が1,000万円超かで判定可能に |
| `deriveCorporateTaxInterimFiling` | `stage !== 'first_term'`なら常に`null` | 前期の`corporateTaxAmount`が一定基準（20万円超等）を超えるかで判定可能に |
| `deriveConsumptionTaxInterimFrequency` | 同上 | 前期の`consumptionTaxAmount`の区分（48万円超・400万円超・4,800万円超）で判定可能に |

これは[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)「⑨将来の会計データ連携」で示した
「ユーザー入力 → 自動計算への切り替え」の中間段階にあたる。**将来の会計データ連携（freee/MF等API）が
実現すれば`TaxReturnEntry`は自動生成されるようになるが、それまでは3節のChange Interviewで
ユーザーが手入力する**、という位置づけ。

### 2-3. 永続化方式

`CompanyProfile`と同じ理由（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-1）で、
**本Sprintも`localStorage`拡張から始める**（新規キー`sunboo:tax-return-profile`、配列をJSON保存）。
DBへの永続化は10節Sprint16.6で改めて判断する。

---

## 3. Change Interview

### 3-0. 定義

**特定のイベント発生時に、Roadmapの精度に関わる少数の質問だけをその場で聞く、短い対話フロー。**
既存の`/profile`（6セクションの詳細フォーム、Phase14.2）とは役割が異なる。

| | `/profile`（既存） | Change Interview（本Sprint） |
|---|---|---|
| 起動 | ユーザーが能動的に開く | 特定のイベント登録時にシステムが提示する |
| 範囲 | 全項目を自由に編集可能 | そのイベントに関連する2〜4問のみ |
| 目的 | 現況を包括的に整備する | そのイベントで初めて確定した事実を漏れなく記録する |

### 3-1. トリガーと質問セット（設計案）

| トリガー（イベント） | 対応する`event_types.code` | 聞く質問（例） | 更新先 |
|---|---|---|---|
| 決算を迎えた | `fiscal_year_end`（Phase15.2で`is_active=false`投入済み。本Sprintで活性化） | 「課税売上高はいくらでしたか」「消費税は課税・免税どちらで確定しましたか」「法人税額・消費税額は」「決算公告は実施しましたか」 | `TaxReturnProfile`に1件追加＋`CompanyProfile.stage`を`second_term_or_later`へ |
| 本店移転 | `hq_relocation`（同上） | 「移転先の都道府県・市区町村は」「移転日は」 | `CompanyProfile.prefectureCode`/`municipalityCode`更新＋`RoadmapHistory`（5節）に記録 |
| 従業員採用（既存イベント） | `employee_hired` | （既存の質問に追加）「常時雇用人数は10人を超えましたか」 | `CompanyProfile.employeeCount`更新。10人超なら就業規則届出の要否判定に使う（[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md) 3節「就業規則の届出」） |
| 賞与支給 | `bonus_payment`（Phase15.2で投入済み、本Sprintでは活性化しない。手続き自体が未実装のため） | （Sprint16では未実装。Phase15.3以降で「賞与支払届」手続き追加後に設計） | — |
| インボイス登録 | `invoice_registration`（同上） | 「登録日は」「登録番号は」 | `CompanyProfile.invoiceRegistrationStatus = 'registered'`に更新 |

**「賞与支給」「36協定」は本Sprintの質問セット設計対象外とする**（対応する`procedures`行が
まだ存在しないため、Change Interviewを設計しても接続先が無い。[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)
3節の優先度「中」項目が実装された後、別途設計する）。

### 3-2. UI上の位置づけ（画面変更は本Sprintでは行わないため、あくまで設計イメージ）

`/events`の既存フロー（「会社情報登録 → イベント選択 → 登録」）の「登録」直後に、
イベント種別ごとの追加質問を差し込む形を想定する。既存の`EventRegistrationResult`表示
（`result.warnings`等）と同じ場所に、質問カードを表示するイメージ。

---

## 4. Roadmap Update Engine

### 4-1. 位置づけ

既存の`runDiagnosis`（`src/lib/diagnosis.ts`）・`registerCompanyEvent`（`src/lib/events.ts`）は
**「単年・単発」の計算**（呼び出し時点の`fiscalMonth`や`event_date`から次の1回分の期限を計算する）。
Roadmap Update Engineは、これらが返す`ProcedureResult`を素材にしつつ、**複数年・複数手続きを
1つの時系列ビューにまとめる**上位の計算層として設計する。既存2エンジンのコードは変更しない。

```
CompanyProfile ─┐
TaxReturnProfile ─┼─→ RuleContext（buildProfileRuleContext等の既存の仕組みをそのまま利用）
登録済みイベント ─┘         │
                            ▼
                    Rule Engine（evaluateRules、既存コード変更なし）
                            │
                            ▼
        Procedure Master（procedures、既存30件＋今後の追加分）
                            │
                            ▼
      applyCompanyProfileToProcedures（既存実装済み、companyProfile.ts）
      ── stage・withholdingTaxCycleによる出し分け・期限上書き ──
                            │
                            ▼
              Roadmap Update Engine（本Sprintで新設）
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
        RoadmapItem[]   Confidence   History追記
      （複数年ホライズン）  （6節）      （5節）
```

**（2026-07-07追記）** 図中の`applyCompanyProfileToProcedures`は既存実装（0節参照）。Roadmap Update
Engineはこの関数を「単年分の下ごしらえ」として毎年分の生成前に呼び出し、その結果を4-3節の
「次のN回」展開にかける設計とする。`stage`による設立系手続きの除外は年に依存しないため1回呼べば
足りるが、`withholdingTaxCycle === 'special_exception'`の期限上書きは複数年分それぞれに必要になる
（4-3節で詳述）。

### 4-2. `RoadmapItem`（設計イメージ）

既存`ProcedureResult`/`ScheduleProcedure`（`src/lib/scheduleProcedure.ts`）を単年から複数年に
拡張したイメージ。**既存の型は変更せず、新しい型として別途定義する**（既存コンポーネントへの
影響を避けるため）。

```ts
// 設計イメージ（Sprint16.3でコード化）

export type RoadmapOccurrence = {
  dueDate: string;        // ISO。1件の具体的な期限
  fiscalYear: string;     // どの決算期に属するか（'2026'等）
  status: ProcedureStatus; // 既存 scheduleProcedure.ts の型を再利用
};

export type RoadmapItem = {
  procedure: ScheduleProcedure; // 既存型をそのまま埋め込む（表示ロジックの再利用のため）
  occurrences: RoadmapOccurrence[]; // 複数年分の期限（例: 法人税確定申告なら今後3期分）
  confidence: RoadmapConfidence;    // 6節
  source: 'diagnosis' | 'event' | 'rule'; // どの経路で採用されたか（デバッグ・説明用）
};
```

### 4-3. 複数年ホライズン生成という新規課題

現状の`calculateNextDeadline`（`diagnosis.ts`）は「次の1回」しか計算しない設計
（関数名の通り）。Roadmap Update Engineが複数年分（例: 今後3期）を提示するには、
**「次のN回」を計算する拡張が必要**になる。これは`calculateNextDeadline`を書き換えるのではなく、
「計算した1回の結果を、期間をずらして複数回呼び出す」ラッパー関数として実装できる見込み
（`fiscal_offset`/`fixed_date`/`period`/`monthly_10th`はいずれも「今日」を基準に計算しているため、
基準日を1年ずつ進めて複数回呼べば複数年分が得られる。**既存関数の内部ロジック変更は不要**）。

ただし[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-3・[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)
6節-7で既出の「消費税中間申告（年3回・11回）の複数期日対応」は、この複数年ホライズン計算とは
別軸の課題（1期の中で複数回発生する）として残る。Sprint15.2の決定通り、本Sprintでも
3回/11回対応はスコープ外とし、Sprint16.3の実装時に改めて別課題として扱う。

**（2026-07-07追記）** 既存の`applyCompanyProfileToProcedures`内の`specialExceptionDeadline()`
（源泉所得税の納期の特例の次回期日を計算する関数）も、この「次のN回」課題と同じ制約を持つ。
現状は`today`基準で次の1回（1/20 or 7/10）しか返さない実装のため、複数年ホライズンで使うには
`calculateNextDeadline`と同様「次のN回」を返せるよう一般化する必要がある。**この一般化は
`applyCompanyProfileToProcedures`自体を書き換えるのではなく、同じ計算式を複数年分ループで
呼び出すラッパーとしてRoadmap Update Engine側に追加する**方針とする（既存関数への変更を
最小限にするため）。

---

## 5. Roadmap History

### 5-1. 記録するもの・しないもの

1-1節の通り「Roadmap自体（計算結果）」は保存しない。**Roadmap Historyが記録するのは
「入力側で何が変わったか」という差分ログ**であり、以下の3種類とする。

| 種類 | 記録内容 | 発生源 |
|---|---|---|
| CompanyProfile変更ログ | フィールド名・変更前値・変更後値・日時 | `/profile`での保存、Change Interviewでの更新 |
| TaxReturnProfileエントリ追加 | 2節の`TaxReturnEntry`そのもの | 決算のChange Interview |
| イベント登録ログ | `event_type_code`・`event_date`・登録日時 | 既存の`anonymous_company_events`（DBに既に記録されている）を参照するだけで、重複して持たない |

**イベント登録ログについては新規の記録を作らず、既存の`anonymous_company_events`テーブルを
そのまま参照する**（DB変更なしの制約にも合致し、二重管理を避けられる）。CompanyProfile変更ログと
TaxReturnProfileエントリのみが新規に記録が必要な対象。

### 5-2. 用途

- **「あの時プロフィールをどう変えたか」の確認**（信頼性・説明可能性のため。特に税理士等の
  専門家が確認する場面を想定）
- 8節「変更検出通知」のトリガー元データ（例: 資本金が1,000万円を超える変更があった、という
  差分を検出して通知を出す）
- 過去時点のRoadmapを**再現**したい場合、Historyのタイムスタンプまでの`CompanyProfile`変更を
  巻き戻して4節のEngineに再度通せば、その時点のRoadmapを再計算できる（保存はしないが再現は可能、
  という設計）

### 5-3. 永続化方式

`CompanyProfile`・`TaxReturnProfile`と同様、本Sprintは`localStorage`（新規キー`sunboo:roadmap-history`、
追記型の配列）から始める。無制限に増え続けると`localStorage`の容量制約（一般に5MB程度）に
抵触するため、**件数上限（例: 直近50件）を設け、古いものから切り捨てる設計とする**。

**この上限方式はTaxReturnProfileには適用しない**（決算実績は年1件程度で増加ペースが緩やかであり、
かつ2節の通りRoadmap計算に直接使う重要データのため、切り捨てると自動判定の精度が下がる）。

### 5-4. 将来のDB移行

[ROADMAP.md](ROADMAP.md) v0.8「顧問先管理」で認証機構・永続的な会社エンティティが導入された際、
Roadmap History（特にTaxReturnProfile）は**真っ先にDBへ移行すべき候補**になる
（税理士が複数期にわたる申告実績を端末をまたいで参照する必要が生じるため）。本Sprintでは
移行タイミングの判断のみ10節に残し、実装はしない。

---

## 6. Roadmap Confidence

### 6-1. 目的

同じ「Roadmap上の1手続き」でも、根拠の確かさには差がある。例えば：

- 法人税確定申告（`fiscal_offset`、`fiscalMonth`さえ分かれば期日は確定）と、
- 消費税確定申告（`consumptionTaxStatus`が`null`＝未確定の場合、表示すべきかどうかも怪しい）

を同列に並べると、ユーザーは「どれが確実で、どれが仮の情報か」を区別できない。
**Roadmap Confidenceは、各`RoadmapItem`に「どの程度信頼できる情報か」のラベルを付与する仕組み**として設計する。

### 6-2. 分類（設計案）

| Confidence | 意味 | 判定基準（例） |
|---|---|---|
| `confirmed`（確定） | 事実として確定している | `corporateType`・`fiscalMonth`等ユーザー入力済みの事実のみで期日が決まる手続き |
| `estimated`（推定） | ヒューリスティックによる推定で、外れる可能性がある | `deriveConsumptionTaxStatus`等の自動判定関数が非`null`を返した場合（≒推定値を採用している） |
| `incomplete`（情報不足） | 判定に必要な情報が無く、表示要否すら確定できない | 自動判定関数が`null`を返した場合。または管轄機関データが存在しない場合（[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)で判明した、福岡県の地方税系`jurisdictions`データ欠落等） |

### 6-3. 既存UIとの連続性

Phase14.2で既に「プロフィールを詳しく入力すると、精度が上がります」という控えめな誘導カード
（`ScheduleList.tsx`の`ProfileGuidanceCard`）を実装済み。**Roadmap Confidenceはこの発想を
手続き単位に細分化したもの**であり、全く新しいUIパターンを持ち込むわけではない。
実装時（Sprint16.4）は、`incomplete`/`estimated`の手続きに「詳しく入力すると確定します」という
同トーンの控えめな注記を添える設計を想定する（バッジ等の具体的なUIは実装フェーズで検討）。

### 6-4. 計算方法

Confidenceは`RoadmapItem`に保存する値ではなく、**Roadmap Update Engineが計算する都度、
その時点の入力（どのフィールドが`null`だったか等）から導出する純粋関数**として設計する
（1節の「都度計算」の原則をConfidenceにも適用する）。

---

## 7. AI参謀との関係

### 7-1. 既存コードへの影響

`src/lib/adviserScore.ts`の`scoreProcedures`・`buildAdviserSummary`・`buildAdviserComment`・
`buildRiskEntries`はいずれも`ScheduleProcedure[]`＋ステータスマップのみを入力とする純粋関数であり、
**その手続き一覧が「単年診断由来」か「複数年Roadmap由来のうち直近90日分」かを関知しない**。
そのため、**これら既存関数のコード変更は不要**という結論になる。Roadmap Update Engineが
生成した`RoadmapItem[]`から「直近の期限が近いものだけ」を`ScheduleProcedure[]`に変換して
渡せば、既存のAI参謀ロジックがそのまま使える。

### 7-2. 新規追加する機能: Roadmap Foresight（長期見通し）

一方、Phase14.2で追加した`buildProfileAdvisories`（`CompanyProfile`のみを見て「1期目は免税の
可能性」等の助言を出す関数）は、**Roadmap History・TaxReturnProfileという「時系列」情報を
持たない**ため、単発の現況判定しかできていない。本Sprintでは、この発展形として
**`buildRoadmapForesight`（仮称、Sprint16.5で実装）**を新設する設計とする。

`buildRoadmapForesight`は以下のような、[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 10節
「経営ロードマップとの接続方法」で既に構想されていた項目を実現する：

- 免税事業者の`taxableSalesAmount`が基準（1,000万円）に近づいている（`TaxReturnProfile`の
  直近エントリから算出）→「来期、課税事業者に切り替わる可能性があります」
- `employeeCount`が10名に近づいている → 「就業規則の作成・届出義務が生じる可能性があります」
- `stage`が`first_term`から`second_term_or_later`に変わるタイミング → 「中間申告の要否確認をおすすめします」

**位置づけの整理**: `buildProfileAdvisories`（現況ベース、Phase14.2）はそのまま残し、
`buildRoadmapForesight`（履歴・傾向ベース、Sprint16.5）を追加する2階建て構成とする
（既存のAI参謀カードに新しいセクションを足す形を想定。画面変更は本Sprintでは行わない）。

---

## 8. 通知との関係

### 8-1. 既存コードへの影響

`src/lib/notificationEngine.ts`の`buildNotifications`は、ファイル冒頭のコメントに明記の通り
「役割は『期限の知らせ』のみ」（超過・当日・3日前・7日前の4種のみ）に徹する設計であり、
**この責務分担は本Sprintでも変更しない**。AI参謀と同様、渡す`ScheduleProcedure[]`が
Roadmapの直近スライスに変わるだけで、既存コードは無変更で動く。

### 8-2. 新規追加する通知系統: 変更検出・Confidence低下通知

Roadmap History（5節）・Roadmap Confidence（6節）が新設されることで、**既存の「期限ベース」とは
軸の異なる新しい通知が可能になる**。これは既存`buildNotifications`を拡張するのではなく、
**別の関数（例: `buildRoadmapAlerts`、Sprint16.5で設計・実装）として新設し、既存の
`Notification`型とは別の型を持つ**設計とする（既存の「期限の知らせ」という単一責務を守るため）。

| 通知の種類 | 発生条件（例） |
|---|---|
| 変更検出通知 | Roadmap History上でCompanyProfileの特定フィールドが変化した（例: 資本金が1,000万円を跨いだ） |
| Confidence低下通知 | 決算時期が近づいているのに`TaxReturnProfile`の該当期エントリがまだ無い（＝Change Interview未実施） |

既存の`NotificationCard`（`ScheduleList.tsx`）とは別カードとして表示する案を想定するが、
UI設計そのものはSprint16.5以降、画面変更を行うフェーズで検討する。

---

## 9. 毎年の更新フロー

決算を起点にした一連の流れを整理する（新設・既存双方のコンポーネントを明記）。

1. **決算日が近づく** → Roadmap ConfidenceがCORP_TAX_RETURN等の`fiscal_offset`系手続きについて
   「そろそろ`TaxReturnProfile`の入力が必要」と判定（6節・8節のConfidence低下通知の対象）
2. **ユーザーが`/events`で「決算」イベントを登録**（Phase15.2で投入済みの`fiscal_year_end`を
   Sprint16.2で`is_active = true`に活性化。`EVENT_ICON`等のUI対応も併せて必要、既存の`/events`
   ページへの影響範囲は実装フェーズで確認）
3. **Rule Engineが評価**（既存`evaluateRules`、コード変更なし）→ Phase15.2で投入済みの
   「決算：法人税確定申告」等7ルールが発火し、該当手続きが`add_procedure`される
4. **Change Interviewが起動**（3節）→ 課税売上高・確定税額等を質問
5. **`TaxReturnProfile`に新規エントリを追記**（2節）
6. **`CompanyProfile`の該当フィールドを更新**（`stage`を`second_term_or_later`へ、
   `deriveConsumptionTaxStatus`等の自動判定関数を`TaxReturnProfile`込みで再実行し、
   `consumptionTaxStatus`等を更新提案）。**（2026-07-07追記）このうち「`stage`が
   `second_term_or_later`になると設立系手続きが一覧から消える」という部分は、
   既存の`applyCompanyProfileToProcedures`により既に動作する**（0節参照）。本フローの
   他のステップ（TaxReturnProfile追記・Confidence再計算等）が実装されるまでの間も、
   この1点だけは既に機能している
7. **Roadmap Update Engineが再計算**（4節）→ 来期以降の`RoadmapItem[]`が更新される
   （中間申告の要否が変わる、消費税確定申告の要否が変わる等）
8. **Roadmap Historyに追記**（5節）→ 「いつ・何が変わったか」のログが残る
9. **AI参謀・通知が新しいRoadmapを参照**（7節・8節）→ 次期の見通し・変更検出通知が更新される

このサイクルが決算のたびに1回まわる、というのが「毎年の更新フロー」の実体である。
本店移転・従業員採用等の中間イベントは、このサイクルの外側で随時`CompanyProfile`・
Roadmap Historyを更新するだけで、`TaxReturnProfile`（決算時のみ追記）には影響しない。

---

## 10. Sprint16.2〜16.6実装計画

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **16.2** | `TaxReturnProfile`型・`localStorage`実装。「決算」イベントの活性化（`is_active=true`化）とそれに伴う`/events`側の最小改修（`EVENT_ICON`・`EventTypeCode`型拡張）。決算・本店移転向けの最小Change Interview（3〜4問） | `src/lib/taxReturnProfile.ts`（新規）、`src/app/(site)/events/page.tsx`、`src/lib/types.ts`（`EventTypeCode`拡張） | Sprint15.2完了（済み） | `EventTypeCode`型を拡張すると`EVENT_ICON`の網羅性チェックが変わるため、既存3種以外のアイコン・文言をどうするか |
| **16.3** | Roadmap Update Engine本体の実装（複数年ホライズン生成、`RoadmapItem`型、`calculateNextDeadline`の「次のN回」ラッパー化）。**既存の`applyCompanyProfileToProcedures`（`companyProfile.ts`、コミット`fa034f5`）を置き換えずパイプラインに組み込み、内部の`specialExceptionDeadline()`を複数年分呼び出すラッパーを追加**。消費税中間申告の3回/11回対応もここで併せて検討するか改めて判断 | `src/lib/roadmapEngine.ts`（新規、`companyProfile.ts`の既存関数を呼び出す） | 16.2完了、`TaxReturnProfile`にデータが1件以上存在すること | 複数年ホライズンの長さ（3年？5年？）、中間申告の複数期日対応をどこまで含めるか |
| **16.4** | Roadmap Confidenceの実装・UI表示（`incomplete`/`estimated`のバッジ表示等） | `src/lib/roadmapEngine.ts`（Confidence算出部）、`ScheduleList.tsx`またはそれに準ずる新規表示コンポーネント | 16.3完了 | Confidenceの表示をどこまで細かく出すか（手続き単位 vs フィールド単位） |
| **16.5** | AI参謀のForesight機能拡張（`buildRoadmapForesight`）、通知エンジンの変更検出・Confidence低下通知（`buildRoadmapAlerts`） | `src/lib/adviserScore.ts`への追加関数、`src/lib/roadmapAlerts.ts`（新規） | 16.3・16.4完了 | 既存AI参謀カード・通知カードとの表示上の統合方法（新セクション追加 vs 別カード） |
| **16.6** | Roadmap History（および`TaxReturnProfile`）の永続化方式見直し（`localStorage`→DB移行の要否・タイミング） | 該当なし（設計判断のみ、[ROADMAP.md](ROADMAP.md) v0.8との整合確認） | v0.8「顧問先管理」の着手方針が固まっていること | v0.8を待たずに先行してDB化するか、v0.8と同時に行うか |

---

## まとめ（設計レビュー観点）

1. **2節「Tax Return Profile」の解釈**: 「決算ごとの申告実績の時系列記録」という解釈で進めてよいか。
   もし「確定申告書そのもののテンプレート・様式管理」等、別の意図であれば設計をやり直す必要がある
2. **1節「Roadmapを持続化しない」という設計方針**: 都度計算のコストが将来的に問題にならないか
   （手続き件数・ホライズン年数が増えた場合のクライアント側計算負荷は実装フェーズで要検証）
3. **3節のChange Interviewの対象イベント**: 「賞与支給」「36協定」を本Sprintの質問設計対象外とした点
   （対応する手続き自体が未実装のため）でよいか
4. **9節の「決算」イベント活性化**: Sprint16.2で`event_types.is_active`を`true`に切り替える際、
   `EVENT_ICON`等`/events`ページの改修が必須になる（Sprint15.2で意図的に非活性化した理由と表裏）。
   この改修をSprint16.2に含めてよいか、別途「Change Interview対応の/events画面刷新」として
   切り出すか
5. **10節の実装順序**: 16.2〜16.6の順序・粒度が適切か。特に16.6（DB移行）をv0.8と紐付けている点
6. **（2026-07-07追記）`fa034f5`との整合**: `applyCompanyProfileToProcedures`をRoadmap Update Engineの
   既存部品として組み込む（置き換えない）という整理でよいか。今後同種の「設計を経ない先行実装」が
   別セッションで発生した場合の扱い（都度この設計書に反映するか等）も含めて確認したい
