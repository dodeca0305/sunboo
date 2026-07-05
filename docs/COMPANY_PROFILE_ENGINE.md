# COMPANY_PROFILE_ENGINE.md — Company Profile Engine 設計（Sprint 14 Phase14.1）

**ステータス: 設計レビュー待ち。DB変更・マイグレーション・コード実装・画面実装は本Phaseでは行っていない。**
実装はレビュー後のPhase14.2で行う。

## 0. 前提として確認した既存事実

設計に入る前に、既存コードとの矛盾が無いか確認した。

- `src/lib/types.ts`に**未使用の`Company`型**が既に存在する（`id, session_id, prefecture_id,
  municipality_id, has_employees, employee_count, fiscal_month, industry_code`）。これはPhase1計画時点
  （`開発指示書_v1.md`）の`companies`テーブル案の名残で、実際のテーブルにもコードのどこにも
  接続されていない死んだ型。`CompanyProfile`はこれを**置き換える**位置づけとし、並存させない
- `docs/RULE_ENGINE.md`の「将来の拡張方針」に、資本金（`capital`）等を条件フィールドとして追加する場合の
  拡張手順が既に明記されている。`evaluateCondition`は`field`名を汎用的に扱うため、
  ルールエンジン自体のコード変更なしに新しいコンテキストキーを追加できる設計になっている
  → 本設計はこの既存方針にそのまま乗る
- 同じく`RULE_ENGINE.md`に「診断エンジン（`/start`→`/result`）へのルールエンジン展開」も将来課題として
  既に記載されている → `CompanyProfile`はこの展開の橋渡し役になる
- `docs/DATABASE.md`には「`companies`という独立エンティティは存在しない（意図的）」という明記があり、
  さらに本番DBには`companies`/`company_id`ベースの素性不明な既存スキーマが発見済み（Sprint 9の調査）。
  **`CompanyProfile`を持続化する场合、この既存の空白/謎スキーマとどう向き合うかは重大な意思決定であり、
  本設計では結論を出さず「1. 要判断事項」として明示する**

---

## 1. 要判断事項（Phase14.2着手前に必ず確認すること）

### 1-1. 永続化方式をどうするか

現状の`localStorage`ベースの匿名モデル（`sunboo:company-profile`等）のまま拡張するか、
初めて永続的な会社エンティティ（DBテーブル）を持つか、という選択。

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| A. localStorage拡張（推奨） | 既存の`sunboo:company-profile`キーの型を`CompanyProfile`に拡張するだけ | DB変更ゼロ、アカウント機構不要、既存の匿名モデルと一貫 | 端末をまたげない、ブラウザデータ消去で失われる |
| B. 新規DBテーブル | `company_profiles`等を新設し`browser_id`で束ねる（`anonymous_company_events`と同じ信頼モデル） | 複数タブ/将来のPWA等でも参照可能 | DB変更が必要（本Phase対象外）、要件的にPhase14.2でも過剰な可能性 |
| C. v0.8前倒しで認証付き永続化 | ROADMAP.mdのv0.8（顧問先管理）を前倒しし、認証必須の会社エンティティにする | 本番に既にある謎の`companies`/`company_id`スキーマを活用できる可能性 | 大設計判断（認証機構追加）を伴う。ROADMAP.mdが明記する「着手前に必ずユーザーと確認」に該当 |

**推奨: Phase14.2はA（localStorage拡張）から始める。** 診断エンジン・イベントエンジンは
現状「入力の都度サーバーへ送る」設計であり、`CompanyProfile`もまず「入力補助・判定材料」として
ブラウザ側に置き、Rule Engineへの受け渡しは実行時にcontextとして渡すだけで完結する。
永続化の本格対応はB/Cとして別途Sprintで扱う。

### 1-2. 資本金（資本金の額）が基本情報リストに無い

消費税の免税/課税判定の実際の法的基準は「資本金1,000万円未満か」と「基準期間の課税売上高が
1,000万円超か」であり、**資本金が無いと自動判定できない**。ユーザー指定の「基本情報」には
含まれていなかったため、`capital`（資本金、円）を**追加フィールドとして提案する**
（下記②の型に含めている。不要であれば削除可能）。

### 1-3. 中間申告の複数回対応は`procedures`スキーマの拡張が必要になる可能性

消費税中間申告が「3回」「11回」の場合、1年に複数回の提出期限が発生する。現状の`procedures`テーブルは
1手続き＝1つの`timing_type`/`timing_data`という前提（`calculateNextDeadline`は「次の1回」を返す関数）
になっており、年11回のような多数の期日を表現する設計にはなっていない。
**Phase14.2で本格的に手続き生成に組み込む場合、`timing_data`の形式拡張（複数日付配列を許容する等）か、
中間申告1回ごとに`procedures`行を複数用意するかの設計判断が別途必要。** 本Phaseでは判定結果
（回数）をCompanyProfileに持たせるところまでとし、手続き生成側の対応はPhase14.2以降の課題として
切り出す。

---

## 2. ① CompanyProfile型（設計案・コード未実装）

既存の命名規約（`DiagnosisInput`等）に合わせてcamelCaseで設計する。DB化する場合は
snake_caseに変換する（マイグレーションはPhase14.2以降）。

```ts
// 設計イメージ（Phase14.1時点ではコード化しない）

export type CompanyStage = 'pre_establishment' | 'first_term' | 'second_term_or_later';

export type ConsumptionTaxStatus = 'exempt' | 'taxable';
export type InvoiceRegistrationStatus = 'registered' | 'not_registered';
export type TaxationMethod = 'principle' | 'simplified'; // 原則課税 / 簡易課税
export type InterimFilingStatus = 'none' | 'has';         // 法人税の中間申告 有無
export type ConsumptionTaxInterimFrequency = 'none' | '1' | '3' | '11';

export type WithholdingTaxCycle = 'monthly' | 'special_exception' | 'unset';
export type LocalTaxCollectionMethod = 'special_collection' | 'general_collection';

export type AdvisorPresence = {
  taxAccountant: boolean;      // 税理士
  laborConsultant: boolean;    // 社労士
  judicialScrivener: boolean;  // 司法書士
  administrativeScrivener: boolean; // 行政書士
};

export type CompanyProfile = {
  // 基本情報
  corporateType: CorporateType;         // 既存 'kabushiki' | 'godo' を再利用
  establishedDate: string | null;       // ISO日付。設立予定の場合はnull許容
  fiscalMonth: number;                  // 1-12、既存DiagnosisInputと同じ
  prefectureCode: string;
  municipalityCode: string;
  employeeCount: number;                // 既存の hasEmployees(boolean) を置き換える形で人数を持つ
  capital: number | null;               // 資本金（円）。1-2で追加提案。任意入力

  // 会社ステージ
  stage: CompanyStage;

  // 税務
  consumptionTaxStatus: ConsumptionTaxStatus;
  invoiceRegistrationStatus: InvoiceRegistrationStatus;
  taxationMethod: TaxationMethod | null;         // consumptionTaxStatus === 'taxable' のときのみ意味を持つ
  corporateTaxInterimFiling: InterimFilingStatus;
  consumptionTaxInterimFrequency: ConsumptionTaxInterimFrequency;

  // 源泉所得税
  withholdingTaxCycle: WithholdingTaxCycle;

  // 地方税
  localTaxCollectionMethod: LocalTaxCollectionMethod;

  // 電子申告
  eTaxEnabled: boolean;   // 国税electronic filing
  eLTaxEnabled: boolean;  // 地方税electronic filing

  // 顧問
  advisors: AdvisorPresence;
};
```

`hasEmployees`（既存の`DiagnosisInput`/`CompanyEventInput`）は`employeeCount > 0`から導出できるため、
`CompanyProfile`では`employeeCount`のみを持ち、既存コードとの橋渡しでは
`hasEmployees = profile.employeeCount > 0`という変換関数を1つ用意する想定（Phase14.2）。

---

## 3. ② 初期値（デフォルト）

新規プロフィール作成時の初期値案。**多くの新設法人に当てはまる一般的な値**を採用し、
実態と異なる場合はユーザーが変更する前提。

```ts
const DEFAULT_COMPANY_PROFILE: Partial<CompanyProfile> = {
  employeeCount: 0,
  capital: null,
  stage: 'pre_establishment',
  consumptionTaxStatus: 'exempt',              // 資本金1,000万円未満の新設法人は原則2期免税
  invoiceRegistrationStatus: 'not_registered',
  taxationMethod: null,                        // 免税のうちは未確定
  corporateTaxInterimFiling: 'none',           // 1期目は前年実績が無いため中間申告なし
  consumptionTaxInterimFrequency: 'none',
  withholdingTaxCycle: 'unset',                // 届出前提のため「未設定」を初期値にする
  localTaxCollectionMethod: 'special_collection', // 従業員がいれば原則特別徴収
  eTaxEnabled: false,
  eLTaxEnabled: false,
  advisors: {
    taxAccountant: false,
    laborConsultant: false,
    judicialScrivener: false,
    administrativeScrivener: false,
  },
};
```

---

## 4. ③ 将来自動判定できる項目 / ④ ユーザー入力が必要な項目

| 項目 | 現時点 | 自動判定の材料 | 備考 |
|---|---|---|---|
| `stage` | **自動判定可** | `establishedDate`と現在日・`fiscalMonth`から算出可能 | 設立日未定なら`pre_establishment`固定 |
| `localTaxCollectionMethod` | **自動判定可** | `employeeCount > 0` → 特別徴収が原則 | 例外（普通徴収の許可を受けている等）はユーザー上書き可にする |
| `corporateTaxInterimFiling`（1期目のみ） | **自動判定可** | `stage === 'first_term'` → 常に`'none'` | 2期目以降は前年実績が必要なため④ |
| `consumptionTaxInterimFrequency`（1期目のみ） | **自動判定可** | 同上 | 同上 |
| `consumptionTaxStatus` | 一部自動判定可 | `capital`（1,000万円未満か）と`stage` | 基準期間の課税売上高は会計データが無いと判定不可。当面はデフォルト＋ユーザー確認 |
| `invoiceRegistrationStatus` | ④ ユーザー入力 | — | 事業判断のため自動判定不可 |
| `taxationMethod` | ④ ユーザー入力（将来③） | 基準期間の課税売上高（5,000万円以下か） | 会計データ連携後に自動化可能（⑨参照） |
| `corporateTaxInterimFiling`（2期目以降） | ④ ユーザー入力（将来③） | 前年の法人税額 | 会計データ連携後に自動化可能 |
| `consumptionTaxInterimFrequency`（2期目以降） | ④ ユーザー入力（将来③） | 前年の消費税額 | 同上 |
| `withholdingTaxCycle` | ④ ユーザー入力 | — | 届出の有無という事実確認のため自動判定不可（提案は可能） |
| `eTaxEnabled` / `eLTaxEnabled` | ④ ユーザー入力 | — | 開始届出の実施有無という事実確認 |
| `advisors.*` | ④ ユーザー入力 | — | 事実確認 |
| `capital` | ④ ユーザー入力 | — | 登記事項のため本来は外部データ取得も可能だが本Phase対象外 |

---

## 5. ⑤ Rule Engineとの接続方法

`docs/RULE_ENGINE.md`が既に明記する拡張方針にそのまま従う。`evaluateCondition`は
`RuleContext`（`Record<string, unknown>`）を汎用的に扱うため、**ルールエンジン自体のコード変更は不要**。

```ts
// Phase14.2のイメージ（src/lib/events.ts の context 組み立てを拡張する形）
const context: RuleContext = {
  event_type_code: input.eventTypeCode,
  corporate_type: profile.corporateType,
  has_employees: profile.employeeCount > 0,
  prefecture_code: prefectureCode,
  // ここから追加
  consumption_tax_status: profile.consumptionTaxStatus,
  invoice_registration_status: profile.invoiceRegistrationStatus,
  taxation_method: profile.taxationMethod,
  withholding_tax_cycle: profile.withholdingTaxCycle,
  local_tax_collection_method: profile.localTaxCollectionMethod,
  company_stage: profile.stage,
};
```

管理画面（`/admin/rules`）側でこれらのフィールド名を条件に使えるように、
`rule_conditions.field`の候補として案内表示するだけでよい（DB制約変更は不要、
`field`は自由記述のTEXT列のため）。

**診断エンジン（`/start`→`/result`）への展開**もこれで初めて現実的になる。
`runDiagnosis`は現状ルールエンジンを経由していないが、`CompanyProfile`をcontextとして
`evaluateRules`に渡す形に揃えれば、イベントエンジンと同じルール定義を診断エンジンからも
再利用できる（`RULE_ENGINE.md`が将来課題として既に明記している展開そのもの）。

---

## 6. ⑥ AI参謀で利用する項目

`src/lib/adviserScore.ts`の`scoreProcedures`/`buildAdviserComment`等に渡す追加コンテキストとして：

- `consumptionTaxStatus`・`taxationMethod`: 「課税事業者へ切り替わるタイミング」「簡易課税の
  選択期限」等、判断理由（`reasons`）に具体的な文言を追加できる
- `advisors.taxAccountant`（税理士の有無）: 税理士がいない場合、AI参謀のコメントをより
  丁寧・具体的な行動指示にする（現状の`buildAdviserComment`の文面を条件分岐で調整）。
  税理士がいる場合は「顧問税理士にご確認ください」という一言を足す等
- `withholdingTaxCycle`: 「納期の特例」未設定なのに従業員が多い場合、AI参謀のリスクコメントで
  「納期の特例の届出を検討してはどうか」という提案を出せる（`buildRiskEntries`の追加候補）
- `stage`: 1期目特有の注意事項（消費税免税の可能性が高い等）をコメントに反映

---

## 7. ⑦ Notification Engineで利用する項目

`src/lib/notificationEngine.ts`の対象は現状「手続きの期限」のみだが、以下を通知トリガーの
判定材料として利用する：

- `withholdingTaxCycle`: `'monthly'`なら毎月10日、`'special_exception'`なら年2回
  （7/10, 1/20）の通知対象日が変わる。現状は`monthly_10th`という固定`timing_type`のみのため、
  特例用の`timing_type`（例: `withholding_special_exception`）をPhase14.2で追加する必要がある
- `consumptionTaxInterimFrequency`: 回数に応じて中間申告の通知対象日を複数生成する
  （1-3の「将来課題」参照。これは`buildNotifications`自体の変更というより、
  そもそも通知対象となる`procedures`データの生成側の課題）
- `localTaxCollectionMethod`: 特別徴収の場合のみ、住民税特別徴収に関する通知を表示する

---

## 8. ⑧ Schedule Engineで利用する項目

（`docs/DATABASE.md`注記の通り「Schedule Engine」という独立モジュールは無く、実体は
`diagnosis.ts`の`calculateNextDeadline`と`ScheduleList`のバケット表示の総称。ここでは
その実体を指す。）

- `corporateTaxInterimFiling`・`consumptionTaxInterimFrequency`: 該当する場合のみ
  中間申告の手続き（`procedures`行）を「今後やることリスト」に含める。フィルタ条件として機能する
  （既存の`requires_employees`/`corporate_type`フィルタと同じ位置づけの新しいフィルタ条件が
  `procedures`テーブルに必要になる可能性がある＝Phase14.2でのスキーマ検討事項）
- `withholdingTaxCycle`: `calculateNextDeadline`の`monthly_10th`ロジックを、特例の場合は
  別の期日パターンに切り替える分岐が必要
- `taxationMethod`: 簡易課税選択届出の期限（原則課税から切り替える際の届出期限）を
  スケジュールに含めるかどうかの判定に使う

---

## 9. ⑨ 将来の会計データ連携との接続方法

会計データ連携（freee/マネーフォワード等のAPI連携を想定）が実現した場合、以下の
CompanyProfileフィールドが「ユーザー入力」から「自動計算」に切り替わる設計にしておく：

| フィールド | 会計データから計算する内容 |
|---|---|
| `consumptionTaxStatus` | 基準期間（2期前）の課税売上高が1,000万円を超えるか |
| `taxationMethod` | 基準期間の課税売上高が5,000万円以下か（簡易課税の選択可否） |
| `corporateTaxInterimFiling` | 前年度の確定法人税額が一定基準を超えるか |
| `consumptionTaxInterimFrequency` | 前年度の確定消費税額の区分（48万円超・400万円超・4,800万円超） |

**設計上のポイント**: ③/④で切り分けた「将来自動判定できる項目」は、まさにこの会計データ連携が
実現したときに自動化される項目と一致させてある。CompanyProfileの型そのものは変更せず、
値の出所（ユーザー入力 or 会計データからの計算結果）だけが変わる、という設計にすることで、
Rule Engine・AI参謀・Notification Engine側のコードは会計データ連携の有無に関わらず
無修正で動く。

---

## 10. ⑩ 経営ロードマップとの接続方法

（対象機能一覧にある「経営ロードマップ」は、`docs/ROADMAP.md`＝開発計画とは別物で、
将来ユーザー向けに提供する「自社の今後の経営判断ポイントを時系列で示す機能」を指すと解釈する。
Phase14.1時点では未着手のため、接続方法の設計方針のみ示す。）

CompanyProfileの`stage`・`employeeCount`・`consumptionTaxStatus`等が一定の閾値を超えた
タイミングで、以下のような「今後検討すべき経営判断」を提示できる：

- 免税事業者が課税売上高の基準に近づいたら「インボイス登録・課税事業者選択の検討時期」を提示
- `employeeCount`が10名を超える見込みなら「就業規則の作成・届出義務」を提示
- `stage`が`first_term`から`second_term_or_later`に変わるタイミングで「中間申告の要否確認」を提示

これらは実質的に「Rule Engine（⑤）の条件×アクションの一種」として実装できる可能性が高く、
経営ロードマップ専用の新エンジンを作るのではなく、既存Rule Engineの`action_type`に
`show_roadmap_item`のようなアクション種別を追加する形が既存アーキテクチャと整合する
（`RULE_ENGINE.md`の「新しいアクション種別の追加」に該当する作業）。

---

## 11. ⑪ UI構成案

既存デザイン方針（Notion/Linear風、`.card`/`.form-input`/`.form-label`等の既存クラス、
Blue-600のみアクセント）を維持する前提でのセクション構成案。

- 既存の`/start`（3項目のみの簡易診断）とは別に、**任意で詳細を入力できる「会社プロフィール」画面**
  （例: `/profile`）を新設する案。`/start`は現状の3項目のままにして離脱率を上げない
- セクション構成（アコーディオンまたはステップ形式）:
  1. 基本情報（既存`/start`と同じ項目＋設立日・資本金）
  2. 会社ステージ（自動判定結果を表示しつつ手動で上書き可能にする）
  3. 税務（消費税ステータスに応じて課税方式等を条件表示＝該当しない項目は非表示にする）
  4. 源泉所得税・地方税
  5. 電子申告
  6. 顧問（税理士・社労士・司法書士・行政書士をチェックボックスで）
- 診断結果画面（`/result`）に「プロフィールを詳しく入力すると精度が上がります」という
  控えめな誘導カード（既存のAI参謀カード・通知カードと同じトーン）を追加する案
- 入力途中で離脱しても困らないよう、全項目を必須にせず、未入力項目は「初期値＋概算」として
  扱う（③④の切り分けとも整合）

---

## 12. ⑫ ROADMAP.mdへ追加する内容（案）

`docs/ROADMAP.md`のv0.6〜v0.9の並びに合わせて、以下を追記する案（実際の追記はレビュー後に反映）。

```markdown
## v0.10 Company Profile Engine（設計完了・実装未着手）

**狙い**: 会社ごとに異なる税務・労務の実態（消費税課税方式・中間申告の有無・源泉所得税の納期特例・
顧問専門家の有無等）を`CompanyProfile`として一元的に持ち、Rule Engine・AI参謀・Notification Engine・
将来の会計データ連携・経営ロードマップの共通の判断材料にする。

- 設計: [COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)（Sprint 14 Phase14.1）
- 要判断事項: 永続化方式（localStorage継続 or 新規DBテーブル or v0.8前倒し）は実装前に確認が必要
- Phase14.2以降の課題: 中間申告の複数期日対応（procedures/timing_dataのスキーマ拡張）、
  Rule Engineコンテキストの拡張、診断エンジンへのRule Engine展開
```

---

## まとめ（レビュー観点）

設計レビューでは特に以下を確認いただきたい:

1. **1-1（永続化方式）**: localStorage拡張案で進めてよいか、それとも先にDB永続化方針を決めるか
2. **1-2（資本金の追加）**: `capital`フィールドを追加してよいか、それとも当面は消費税判定を
   ユーザー入力に委ねてよいか
3. **1-3（中間申告の複数回対応）**: Phase14.2の対象に含めるか、別Phaseに切り出すか
4. ②の初期値が実態と合っているか（特に`withholdingTaxCycle`を`'unset'`にした点、
   `consumptionTaxStatus`を`'exempt'`デフォルトにした点）
5. ⑪のUI構成案（`/start`とは別に`/profile`を新設する案）で問題ないか
