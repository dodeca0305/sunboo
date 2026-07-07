# TIMELINE_ENGINE.md — Timeline Engine設計（Sprint19 Phase19.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード実装・画面実装は本Phaseでは一切行っていない。**
実装はレビュー後、Sprint19.2以降で段階的に行う（10節参照）。

## 0. 前提として確認した既存事実

設計に入る前に、既存コード・既存設計書との整合を確認した。**本節が本設計で最も重要な確認事項を含む
（5節で詳述する「Roadmap Historyとの関係」の前提になる）。**

- **`anonymous_company_events`（DB、`src/lib/events.ts`）は、現時点でSUNBOOが持つ唯一の「本物の
  時系列DBテーブル」である。** `browser_id`・`event_type_id`・`event_date`を持ち、`/events`での
  イベント登録のたびに1行追記される（[DATABASE.md](DATABASE.md)参照）。これは本設計が目指す
  Timelineの「追記専用ログ」という性質を、現状唯一実際に満たしているデータである
- **`CompanyProfile`（`src/lib/companyProfile.ts`）・`TaxReturnProfile`（`src/lib/taxReturnProfile.ts`）は
  いずれも`localStorage`のみで持続化され、「現況の1件」または「決算ごとに追記される配列」として
  持つ。** どちらも変更前の値を保持しない（`saveCompanyProfile`は上書き、`TaxReturnProfile`は
  エントリ追記のみだが「いつ・どのフィールドが変わったか」という差分自体は記録していない）
- **[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節「Roadmap History」は、本設計と
  ほぼ同じ狙いを持つ概念として既に設計済み（Sprint16 Phase16.1、実装未着手）。** 記録対象として
  「CompanyProfile変更ログ」「TaxReturnProfileエントリ追加」「イベント登録ログ（`anonymous_company_events`
  参照のみ、重複して持たない）」の3種を挙げていた。**この3種はそのまま本設計のTimelineEventの
  具体例と一致する。** つまりRoadmap Historyは「Timelineという概念を、Roadmap機能の付属物として
  先に素描したもの」であり、本設計はこれを**Roadmap専属の仕組みから、Roadmap・AI参謀・通知・将来の
  PDF/会計連携すべてが参照する共通基盤に格上げする**位置づけになる（5節で詳述）
- **[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md) 8節は「PDF読取は入口を1つ追加するだけで済む
  設計にする」という原則を決算更新フロー限定で示した。** 本設計はこの原則をTimeline全体に一般化する
  （8節で詳述）
- **Roadmap Update Engine本体（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4節）・
  Roadmap History自体（同5節）・`buildRoadmapForesight`（同7節）・`buildRoadmapAlerts`（同8節）は
  いずれも未実装。** 本設計はこれらの「まだ存在しない機能」を前提に接続方法を述べる箇所があるが、
  すべて設計上の位置づけの整理に留め、実装はしない（9節・10節）
- **永続的な`companies`エンティティは意図的に作られていない**（[DATABASE.md](DATABASE.md)、
  [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 0節で確認済みの既存方針）。本設計も
  この制約を引き継ぎ、Timelineを新しい永続的DBエンティティとして設計するのではなく、
  既存の信頼モデル（`browser_id`／`localStorage`）の上に構築する（9節）

---

## 1. Timelineとは

### 1-1. 定義

**会社に関するすべての「事実の記録」を、発生した順に並べた単一の追記専用ログ。**
SUNBOOが最終的に目指す「会社・個人の一生に伴走する経営OS」（引継ぎメモの最終ゴール）において、
税務・労務・会計・経営判断のすべての記録が最終的にここへ集約される。

### 1-2. 「現在の状態」と「時系列の記録」の違い

SUNBOOには既に「現在の状態」を持つ仕組みが複数ある（`CompanyProfile`＝現況スナップショット、
Roadmap＝都度計算される導出結果）。Timelineはこれらとは異なるレイヤーであることを明確にする。

| | 現在の状態（既存） | Timeline（本設計） |
|---|---|---|
| 例 | `CompanyProfile.capital`（今の資本金は500万円） | 「2025-06-01に資本金が300万円→500万円に増資された」という1件の記録 |
| 件数 | 常に1件（上書き） | 会社の歴史の分だけ増え続ける（追記専用） |
| 問いに答える | 「今どうなっているか」 | 「いつ・何が・なぜ変わったか」 |
| 既存の実装例 | `CompanyProfile`・Roadmap（都度計算） | `anonymous_company_events`（DB）が現状唯一の実例 |

### 1-3. 3つの原則

1. **追記のみ（イミュータブル）**: Timelineに記録された1件は編集・削除しない。事実の訂正が必要な場合も
   「訂正した」という新しい記録を追記する（会計の「訂正仕訳」と同じ発想。ただしSUNBOOは複式簿記を
   スコープ外とするCLAUDE.mdの方針と矛盾しない。Timelineは仕訳ではなく「事実のログ」だけを扱う）
2. **単一の型に正規化**: 発生源（手入力・イベント登録・将来のPDF/会計API）を問わず、すべて
   `TimelineEvent`という1つの型で表現する（2節）
3. **発生源を問わない設計**: 「誰が・どうやってこの事実を知ったか」（`source`）と「何が起きたか」
   （`type`・`payload`）を分離する。これにより将来PDF読取や会計データ連携が追加されても、
   Timelineを消費する側（Roadmap・AI参謀・通知）のロジックは変更不要になる（8節）

---

## 2. Timeline Eventモデル

### 2-1. 型設計（イメージ、コード未実装）

```ts
// 設計イメージ（Sprint19時点ではコード化しない）

export type TimelineCategory = 'company' | 'tax' | 'hr' | 'financial' | 'advisory';

export type TimelineSource =
  | 'manual'              // /profile等でユーザーが直接編集
  | 'event_registration'  // /events（既存の経営イベントエンジン、anonymous_company_events）
  | 'tax_return_entry'    // /profile/tax-returns（TaxReturnProfile）
  | 'change_interview'    // 決算更新フロー等のChange Interview（CLOSING_UPDATE_FLOW.md）
  | 'pdf_ocr'             // 将来構想（8節）
  | 'accounting_api'      // 将来構想（8節、freee/MF等）
  | 'system';             // AI参謀・通知エンジンが生成した記録（advisoryカテゴリ専用、6-2節）

export type TimelineEvent = {
  id: string;
  occurredAt: string;   // 事実が発生した日（ISO、例: 決算日そのもの）
  recordedAt: string;   // Timelineに記録された日時（システム側のタイムスタンプ）
  category: TimelineCategory;
  type: string;         // イベント種別コード。例: 'capital_change' / 'tax_return_filed' / 'employee_hired'
  source: TimelineSource;
  payload: Record<string, unknown>; // 種別ごとの詳細（型は3節で種別ごとに細分化のイメージを示す）
  relatedEntityId?: string; // 既存データへの参照（例: TaxReturnEntry.id、anonymous_company_events.id）
};
```

### 2-2. `occurredAt`と`recordedAt`を分離する理由

決算のような事実は「事実が発生した日」（例: 3月31日の決算日）と「システムに記録された日」
（例: 4月に確定申告を終えてからChange Interviewで入力した日）がずれるのが通常である。
両方を保持することで、「実際に何が起きたか」の時系列と「いつSUNBOOがそれを知ったか」の時系列を
どちらも再現できるようにする（後者はRoadmap Confidenceの「情報の新しさ」判定にも使える、6-3節）。

### 2-3. 既存の記録源との対応関係

0節で確認した既存3種の記録源は、いずれも本モデルの特殊形として表現できる。

| 既存の記録源 | 対応するTimelineEvent |
|---|---|
| `anonymous_company_events`の1行（DB） | `category: 'company'` または `'hr'`（イベント種別による）、`source: 'event_registration'`、`relatedEntityId`に元テーブルの`id` |
| `TaxReturnProfile.entries`の1件（localStorage） | `category: 'tax'`、`type: 'tax_return_filed'`、`source: 'tax_return_entry'`、`relatedEntityId`に`TaxReturnEntry.id` |
| （未実装）Roadmap Historyの「CompanyProfile変更ログ」1件 | `category: 'company'`、`type: '<field>_changed'`（例: `'capital_changed'`）、`source: 'manual'`または`'change_interview'` |

**既存データを別ストレージへ複製・移行することは本設計では想定しない。** 9節で述べる通り、
既存3種はTimelineの「ビュー（統合表示用の変換）」として扱い、Timeline専用の新規ストレージには
「既存のどのデータ源にも対応しない新しい記録」（例: Advisoryカテゴリ、6-2節）のみを追加する設計とする。

---

## 3. Company / Tax / HR / Financial / Advisory Timeline

### 3-1. 5カテゴリの位置づけ

**5つのカテゴリは別々の実装を持つ「5つのTimeline」ではなく、単一のTimelineEvent配列に対する
`category`フィルタである。** Roadmapが「都度計算される導出結果」（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
1-1節）であるのと同じ発想で、「Company Timeline」等の名称は表示・検索時の切り口にすぎない。

| カテゴリ | 記録する事実の例 | 対応する既存/将来のデータ源 |
|---|---|---|
| `company` | 会社設立・本店移転・資本金変更・会社ステージ遷移（1期目→2期目以降） | `anonymous_company_events`（設立・本店移転）、CompanyProfile変更（手入力・Change Interview） |
| `tax` | 決算・確定申告実績・消費税ステータス変更・インボイス登録 | `TaxReturnProfile.entries`、CompanyProfileの税務系フィールド変更 |
| `hr` | 従業員採用・退職・36協定締結・賞与支給 | `anonymous_company_events`（従業員採用等）、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 3-1節で構想済みの各種イベント |
| `financial` | 会計データ連携（freee/MF等API）、決算書類のPDF取込 | 未実装。8節で将来構想として整理する |
| `advisory` | AI参謀が発した助言・通知が送られた事実そのもの | 未実装。既存の`buildProfileAdvisories`等は都度生成のみで記録されない（6-2節で新設を構想） |

`company`/`tax`/`hr`の3カテゴリは**既存データの再分類（ビュー）**であり、`financial`/`advisory`の
2カテゴリは**現状データが存在しない、将来追加される記録**という違いがある。この非対称性は
実装計画（10節）に直接影響する（既存データの統合は先行して着手できるが、`financial`/`advisory`は
接続先の機能自体がまだ無いため後回しになる）。

### 3-2. カテゴリ間をまたぐイベントの扱い

「決算」は`tax`（申告実績）と`company`（会社ステージ遷移）の両方に関わる（[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md)
2節で既に「1つのTaxReturnEntryが複数のCompanyProfileフィールドに影響する」ことを確認済み）。
本設計では**1つの事実に対して複数のTimelineEventを分けて記録する**（「決算という1つの出来事」を
1件にまとめない）。理由は、カテゴリ別フィルタ（3-1節）で一覧するときに、1件のイベントが複数カテゴリに
同時に現れると表示ロジックが複雑になるため。`relatedEntityId`を同じ値にすることで、後から
「同じ決算に起因する複数の記録」であることは追跡可能にする。

---

## 4. Event-Driven設計

### 4-1. Timelineへの追記が他の仕組みを駆動する

既存のRule Engine（`rules`/`rule_conditions`/`rule_actions`、[RULE_ENGINE.md](RULE_ENGINE.md)）は
「イベント登録」を起点に評価される設計だった。本設計はこれを一般化し、**Timelineへの1件の追記が
「トリガー」となり、以下が連鎖する**という設計にする。

```
Timelineへの追記
      │
      ├─→ Rule Engine再評価（既存、company/hrカテゴリのイベントが対象）
      ├─→ Change Interview起動（[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md)、taxカテゴリが主対象）
      ├─→ Roadmap再計算（5節）
      ├─→ AI参謀コメント生成（6節）
      └─→ 通知生成（7節）
```

これは新しい実行エンジン（イベントバス等）を実装するという意味ではない。**既存の各機能
（Rule Engine・Change Interview・Roadmap・AI参謀・通知）は今後も「呼ばれた瞬間の入力から都度計算する
純粋関数」のままでよい**（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 1-1節の原則を
継承）。「Event-Driven」とは、それらの純粋関数群への**入力の一部がTimelineになる**という設計上の
関係を指す。

### 4-2. 既存の`event_types`との関係

既存の`anonymous_company_events`・`event_types`（会社設立・従業員採用・役員変更の3種が
`is_active=true`、決算・本店移転等5種が`is_active=false`で投入済み）は、**Timelineという概念の
「company/hrカテゴリにおける先行実装」**として位置づけ直す。既存テーブル・既存コード
（`src/lib/events.ts`）は変更しない。Timelineは`anonymous_company_events`を置き換えるものではなく、
これを`tax`カテゴリ（`TaxReturnProfile`）・将来の`financial`/`advisory`カテゴリと**同じ土台の上で
串刺しに見せるための統合層**である。

---

## 5. Roadmapとの関係

### 5-1. Roadmap Historyの位置づけを更新する

0節で確認した通り、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節「Roadmap History」は
未実装のまま残っている。本設計は、**Roadmap History単体としては実装せず、Timelineの`company`/`tax`
カテゴリとして実装する**ことを提案する（Roadmap専属の仕組みを新設しない）。

| Roadmap History（v0.11 5節、旧設計） | Timeline（本設計での対応） |
|---|---|
| CompanyProfile変更ログ | `category: 'company'`のTimelineEvent |
| TaxReturnProfileエントリ追加 | `category: 'tax'`のTimelineEvent |
| イベント登録ログ（`anonymous_company_events`参照のみ） | `category: 'company'`/`'hr'`のTimelineEvent（`source: 'event_registration'`、`relatedEntityId`で元行を参照する点は同じ） |

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5-2節「用途」（あの時どう変えたかの確認・
変更検出通知のトリガー元・過去時点のRoadmap再現）は、そのままTimelineの用途として引き継がれる。
5-3節「件数上限50件で古いものから切り捨てる」という制約も、Timeline全体ではなく`company`/`hr`カテゴリの
表示上の制約として引き継ぐ想定だが、**`tax`カテゴリ（決算実績）は[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
5-3節で明記の通り切り捨て対象外**という区別も引き継ぐ。

### 5-2. Roadmap計算式への位置づけ

既存の式（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 1-1節）:

```
Roadmap = f( CompanyProfile, TaxReturnProfile, ProcedureMaster, RuleEngine, RegisteredEvents, 今日の日付 )
```

Timelineはこの式の**入力そのもの（`CompanyProfile`等）を置き換えない**。`CompanyProfile`は今後も
「現況の1件」として存在し続け、Roadmap計算はそれを直接参照する。Timelineが追加するのは、
**この式の「時系列の裏付け」**である。

```
Roadmap = f( CompanyProfile, TaxReturnProfile, ProcedureMaster, RuleEngine, RegisteredEvents, 今日の日付 )
                    ↑                ↑                                          ↑
                    └────────────────┴───────── Timelineが裏付けとして記録する ─┘
```

Roadmap Confidence（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節）の
`estimated`/`incomplete`判定は、現状は「値が`null`かどうか」のみで判定する設計だったが、
Timelineがあれば「その値が**いつ**確定したか」（`occurredAt`）も判定材料に使える
（例: 3年前に確定した情報と、先週確定した情報を同じ`confirmed`として扱うかどうか。**この拡張自体は
本Sprintでは設計せず、10節の要判断事項に残す**）。

---

## 6. AI参謀との関係

### 6-1. 既存コードへの影響

`src/lib/adviserScore.ts`の`buildAdviserSummary`・`buildAdviserComment`・`buildRiskEntries`は
いずれも`ScheduleProcedure[]`のみを入力とする純粋関数であり、Timelineの有無に関知しない。
`buildProfileAdvisories`・`buildClosingUpdateSummary`（Sprint18.2で実装済み）も同様に
「現在の状態（`CompanyProfile`・`TaxReturnProfile`）の比較」のみを行う設計であり、**いずれも
コード変更は不要**という結論になる（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-1節と
同じ結論）。

### 6-2. 新規追加する概念: Advisory Timeline

現状のAI参謀は「今この瞬間、何を伝えるべきか」を都度計算するだけで、**「過去に何を伝えたか」を
一切記録していない**。このため以下が起きている（Timeline導入前の既知の制約）。

- 同じ助言（例: 「納期の特例を検討してください」）を、ユーザーが対応しないまま毎回同じ文言で
  出し続けてしまう可能性がある
- 「先週伝えた助言にユーザーがどう反応したか」を判定する材料が無い

**Advisory Timeline（`category: 'advisory'`）は、AI参謀・通知エンジンが生成したコメントそのものを
`source: 'system'`のTimelineEventとして記録する**という新設計。`buildAdviserComment`等の既存関数の
戻り値（文字列）を、呼び出し側（画面表示側）が「表示した」タイミングでTimelineに追記する想定。
これにより将来、「直近30日以内に同じ`type`の助言を出していれば抑制する」といった重複防止ロジックが
Timelineへの問い合わせだけで実現できるようになる（**このロジック自体は本Sprintでは実装しない**）。

### 6-3. `buildRoadmapForesight`との関係

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-2節で構想された`buildRoadmapForesight`
（傾向ベースの先読み助言、未実装）は、「`TaxReturnProfile`の直近エントリから傾向を見る」という
設計だったが、これは実質的に**Timelineの`tax`カテゴリを時系列でたどる処理**と同じである。
`buildRoadmapForesight`を実装する際は、`TaxReturnProfile.entries`を直接読むのではなく
Timelineの`tax`カテゴリを読む形に自然に統合できる見込み（**実装はSprint16.5待ちのまま、本Sprintでは
着手しない**）。

---

## 7. 通知との関係

### 7-1. 既存コードへの影響

`src/lib/notificationEngine.ts`の`buildNotifications`は「期限の知らせ」のみに徹する設計
（ファイル冒頭のコメントに明記）であり、本設計でもこの責務分担は変更しない。**コード変更は不要。**

### 7-2. 通知送信自体をTimelineに記録する

[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md) 7節で構想された「矛盾未解決の催促通知」
（`TaxReturnEntry`保存後、`Mismatch`が一定期間解決されない場合に催促、未実装）は、
「いつ矛盾が発生したか」「いつ催促を出したか」という2つの時系列情報が必要になる。
これは6-2節のAdvisory Timelineと同じ発想で、**「矛盾が発生した」（`category: 'tax'`、決算更新フローの
一部として記録）・「催促通知を出した」（`category: 'advisory'`、`source: 'system'`）の2件のTimelineEventを
突き合わせることで実現できる**設計にする（**実装はCLOSING_UPDATE_FLOW.md側のSprint18.4待ちのまま、
本Sprintでは着手しない**）。

---

## 8. PDF・OCR・会計データとの接続

### 8-1. [CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md) 8節の原則をTimeline全体に一般化する

決算更新フロー設計書8節は「PDF読取は入口を1つ追加するだけで済む設計にする」という原則を
決算（`TaxReturnEntry`）に限定して示した。本設計はこれをTimeline全体に一般化する。

**PDF読取・会計データ連携（freee/MF等API、CLAUDE.mdのSTEP3 Month3で構想されている範囲）が
実現した場合、やることは「その発生源用の`source`値（`pdf_ocr`／`accounting_api`）を持つ
TimelineEventを生成する変換処理を1つ追加する」だけであり、Timelineを消費する側
（Rule Engine・Change Interview・Roadmap・AI参謀・通知）のロジックは一切変更不要になる**設計とする。

```
[手入力]  [/eventsでのイベント登録]  [Change Interview]  [将来: PDF読取]  [将来: 会計API]
    └────────────┴──────────────────────┴───────────────┴───────────────┘
                                    ▼
                        TimelineEventとして正規化（2節）
                                    ▼
              Rule Engine／Change Interview／Roadmap／AI参謀／通知が参照（4節〜7節）
```

### 8-2. `TaxReturnProfile`の`AmountValue`（Confidence）との関係

[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)・[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md)
8-2節で構想された「OCR抽出値は`exact`として保存するが`verified`フラグで確認前/確認後を区別する」という
設計は、**Timelineの`source`（`pdf_ocr`か`tax_return_entry`か）が実質的にこの区別を代替できる**。
`source: 'pdf_ocr'`のTimelineEventはユーザーが編集フォームで確認・保存し直すまで「未確認」とみなし、
確認後に`source: 'tax_return_entry'`（またはそれに準ずる確認済みマーカー）へ遷移させる、という設計の
方向性が本SprintでのTimeline導入により見えてきた。**具体的な型設計・実装はTax Return Profile側の
OCR構想着手（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 9-4節、コンプライアンス方針
確定待ち）まで行わない。**

---

## 9. Timeline API構想

### 9-1. 永続化方式

`CompanyProfile`・`TaxReturnProfile`と同じ理由（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-1、
0節で再確認した「永続的な`companies`エンティティを意図的に作らない」方針）で、**新規追加する
TimelineEvent（`financial`/`advisory`カテゴリ等、既存データに対応しない記録）は`localStorage`拡張から
始める**（新規キー`sunboo:timeline`、追記型の配列）。DBへの永続化は将来のv0.8「顧問先管理」着手時に
[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5-4節と同じ判断軸で改めて検討する。

### 9-2. 関数インターフェース（設計イメージ、コード未実装）

```ts
// 設計イメージ（Sprint19.2以降でコード化）

// 新規記録の追記（既存データに対応しない、advisoryカテゴリ等）
export function appendTimelineEvent(event: Omit<TimelineEvent, 'id' | 'recordedAt'>): TimelineEvent[];

// localStorage上の新規記録を読む
export function loadTimeline(): TimelineEvent[];

// 既存データ源（anonymous_company_events・TaxReturnProfile）から「読み取り専用のビュー」として
// TimelineEventに変換する（2-3節）。DBアクセスが必要なためSupabaseClientを受け取る想定
export function buildEventRegistrationTimeline(client: SupabaseClient, browserId: string): Promise<TimelineEvent[]>;
export function buildTaxReturnTimeline(taxReturnProfile: TaxReturnProfile): TimelineEvent[];

// 統合ビュー：新規記録＋既存データ源の変換結果をマージし、category・期間で絞り込む
export function queryTimeline(
  params: { category?: TimelineCategory; from?: string; to?: string },
): Promise<TimelineEvent[]>;
```

### 9-3. 既存データを壊さない、という制約の徹底

2-3節・5-1節の通り、`anonymous_company_events`・`TaxReturnProfile`は**そのまま既存のストレージに
残す**。`buildEventRegistrationTimeline`・`buildTaxReturnTimeline`は既存データを読んで
TimelineEvent形式に**都度変換するだけの純粋関数（DB/localStorageへの書き込みは行わない）**とし、
Roadmapと同じ「都度計算・保存しない」原則をここでも適用する。これにより、Timeline導入によって
既存機能（`/events`・`/profile/tax-returns`）が二重管理・不整合のリスクを負うことを避ける。

---

## 10. Sprint19.2〜19.6実装計画

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **19.2** | `TimelineEvent`/`TimelineCategory`/`TimelineSource`型定義、`localStorage`実装（`appendTimelineEvent`/`loadTimeline`） | `src/lib/timeline.ts`（新規） | Sprint18.2完了（済み） | `sunboo:timeline`の件数上限をどう設けるか（5-1節でRoadmap History設計を引き継ぐ想定） |
| **19.3** | 既存データ源（`anonymous_company_events`・`TaxReturnProfile`）からの変換ビュー（`buildEventRegistrationTimeline`/`buildTaxReturnTimeline`）実装 | `src/lib/timeline.ts` | 19.2完了 | `anonymous_company_events`読み取りに新規クエリが必要か、既存の`fetchEventTypes`等で足りるか |
| **19.4** | Change Interview（決算更新フロー）・CompanyProfile変更時にTimelineへ追記する配線 | `src/app/(site)/profile/tax-returns/page.tsx`、`src/app/(site)/profile/page.tsx` | 19.2・19.3完了、[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md)実装（Sprint18.2、済み）との整合確認 | CompanyProfileの「どのフィールド変更をTimeline記録の対象にするか」（全フィールドか、Roadmap Confidenceに影響するものだけか） |
| **19.5** | Roadmap History（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節）をTimelineの`company`/`tax`カテゴリとして統合実装 | `src/lib/roadmapEngine.ts`（未実装、Sprint16.3待ち） | Roadmap Update Engine本体（Sprint16.3）完了 | 5節で示した統合方針の妥当性、Sprint16.3の実装順序に本統合をどう組み込むか |
| **19.6** | Advisory Timeline（6-2節）の実装、AI参謀コメント・通知の記録配線 | `src/lib/adviserScore.ts`、`src/lib/notificationEngine.ts`の呼び出し側 | 19.2完了 | 「表示した」タイミングをどう検知するか（画面側のuseEffect等）、重複防止ロジックの実装範囲 |

---

## まとめ（設計レビュー観点）

1. **0節・5節の核心的な判断**: Roadmap History（v0.11 5節、未実装）を単体実装せず、Timelineの
   `company`/`tax`カテゴリとして統合するという方針でよいか。Roadmap Update Engine本体の実装順序
   （Sprint16.3〜16.6）に影響するため、実装着手前に必ず確認する
2. **1-3節「追記のみ（イミュータブル）」**: 会計・税務データの訂正を「新しい記録の追記」で表現する
   という方針が、将来の会計データ連携（Financial Timeline）の実際のデータ形式と衝突しないか
3. **3-2節**: 「決算」のような複数カテゴリに関わる事実を、1件にまとめず複数のTimelineEventに
   分けて記録するという方針でよいか
4. **6-2節・7-2節**: Advisory Timeline（AI参謀・通知の発信記録）を新設する方針、および
   その記録タイミングを「画面表示時」とする想定の妥当性
5. **9-1節**: 新規記録（`sunboo:timeline`）の永続化を`localStorage`から始める方針、既存の
   `CompanyProfile`/`TaxReturnProfile`と同様にDB移行はv0.8まで待つという判断でよいか
6. **10節の実装順序**: 19.5（Roadmap History統合）がSprint16.3（Roadmap Update Engine本体）の
   完了待ちになっている点。Sprint16系とSprint19系、どちらを先行させるべきか
