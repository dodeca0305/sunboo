# TAX_RETURN_PROFILE_ENGINE.md — Tax Return Profile Engine設計（Sprint17 Phase17.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード実装・画面実装は本Phaseでは一切行っていない。**
実装はレビュー後、Sprint17.2以降で段階的に行う（10節参照）。本ドキュメントは
[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)（Sprint16 Phase16.1）2節で素描した
「Tax Return Profile」を、独立した設計として掘り下げたもの。Sprint16文書との差分・追加点は
各節で明記する。

## 0. 前提として確認した既存事実

- **`ROADMAP_EVOLUTION_ENGINE.md` 2節で`TaxReturnEntry`/`TaxReturnProfile`の型イメージ・
  永続化方式（`localStorage`キー`sunboo:tax-return-profile`）は既に素描済み。** 本ドキュメントは
  これを正式な設計に格上げするものであり、ゼロから再設計するものではない
- **`src/lib/companyProfile.ts`の自動判定関数のうち3つ（`deriveConsumptionTaxStatus`・
  `deriveCorporateTaxInterimFiling`・`deriveConsumptionTaxInterimFrequency`）が、2期目以降は
  根拠不足で`null`を返す。** Tax Return Profileはこの`null`を埋める一次データという位置づけが
  Sprint16から継続する大前提
- **コミット`fa034f5`で追加済みの`applyCompanyProfileToProcedures`（`companyProfile.ts`）は、
  `CompanyProfile.stage`・`withholdingTaxCycle`のみを見て手続きを出し分ける実装であり、
  `TaxReturnProfile`をまだ一切参照していない。** 本Sprintの設計は、この関数を書き換えず、
  「`TaxReturnProfile`から`CompanyProfile`の該当フィールドを更新する」という前段階を
  Change Interview（6節）に担わせることで、既存関数への影響を避ける
- **`event_types`の「決算」（`fiscal_year_end`）は`is_active = false`で投入済み・未活性のまま。**
  Sprint16 10節（Phase16.2）で活性化する計画だったが、本Sprintの計画（10節）と対象が重なるため、
  実装時にどちらのSprintで行うか一本化する必要がある（10節で明記）

---

## 1. Tax Return Profileとは

### 1-1. 「前期申告書を会社の現在地として扱う」という考え方

`CompanyProfile`（Phase14.2）は、ユーザーが**自己申告した「今の認識」**を保持する現況スナップショットである。
一方、法人税・消費税の多くの判定（免税/課税の別、簡易/原則課税、中間申告の要否等）は、法律上
**過去（基準期間・前期）の実績によって機械的に決まる**。つまり、これらの判定においては
「ユーザーが今どう思っているか」よりも「前期に何を申告したか」の方が客観的で確実な情報源になる。

**Tax Return Profileは、直近の確定申告（前期分）の内容を構造化して保持し、これを「会社の現在地
（GPS的な基準点）」として扱う仕組み**として設計する。CompanyProfileが今後もRoadmapの入力であり
続けることに変わりはないが、少なくとも4節で列挙するフィールドについては、**Tax Return Profileが
「正本（source of truth）」、CompanyProfileはそこから導出された「表示用の現況値」**という上下関係を
明確にする。

### 1-2. Sprint16設計との違い

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 2節は「決算のたびに積み上がる実績ログ」
という時系列データとしての性質を中心に説明していた。本ドキュメントはこれに加えて、
**「直近1件（＝前期分）が持つ意味の大きさ」**を強調する。Roadmap計算の観点では、Tax Return Profileの
全履歴のうち、翌期の判定に直接使われるのはほぼ常に**直近1〜2件**であり（消費税の基準期間判定は
2期前を参照するため2件、中間申告判定は前期のみで足りるため1件）、「時系列データベース」というより
「今どこに立っているかを示す最新の確定事実」という捉え方の方が実務的に近い。

---

## 2. 保持項目

Sprint16 2節の`TaxReturnEntry`をベースに、実際の申告書（法人税申告書別表一・消費税及び
地方消費税の確定申告書・地方税申告書）の記載事項に照らして項目を整理し直した。

| カテゴリ | 項目 | 型 | 用途 | 出典（参考） |
|---|---|---|---|---|
| 基本情報 | `fiscalYearStartDate` / `fiscalYearEndDate` | ISO日付 | 対象事業年度の特定。基準期間計算の起点 | 申告書表紙の事業年度欄 |
| 基本情報 | `filedDate` | ISO日付 \| null | 実際に申告した日（未申告なら`null`） | — |
| 基本情報 | `capitalAtFiling` | number \| null | 申告時点の資本金。`CompanyProfile.capital`との乖離検出に使う（4節） | 別表一 |
| 消費税判定 | `taxableSalesAmount` | number \| null | その期の課税売上高。**2期後の免税/課税判定の基準期間データになる**最重要フィールド | 消費税申告書 |
| 消費税判定 | `consumptionTaxStatus` | `'exempt' \| 'taxable'` | その期に実際どちらだったか（確定値、推定ではない） | 消費税申告書の有無そのもの |
| 消費税判定 | `taxationMethod` | `'principle' \| 'simplified' \| null` | 実際にどちらの方式で申告したか | 消費税申告書 |
| 消費税判定 | `invoiceRegistrationStatus` | `'registered' \| 'not_registered'` | 期末時点のインボイス登録状況 | 適格請求書発行事業者登録簿 |
| 税額（中間申告判定材料） | `corporateTaxAmount` | number \| null | 確定法人税額。翌期の中間申告要否の基準 | 別表一 |
| 税額（中間申告判定材料） | `consumptionTaxAmount` | number \| null | 確定消費税額。翌期の中間申告回数区分（48万円超・400万円超・4,800万円超）の基準 | 消費税申告書 |
| 実施有無の事実 | `corporateTaxInterimFilingActual` | `'none' \| 'has'` | その期に実際に中間申告があったか | — |
| 実施有無の事実 | `consumptionTaxInterimFrequencyActual` | `'none' \| '1' \| '3' \| '11'` | その期に実際にあった中間申告の回数 | — |
| 実施有無の事実 | `financialStatementPublished` | boolean | 決算公告を実施したか（株式会社のみ意味を持つ） | — |
| 実施有無の事実 | `withholdingTaxCycleActual` | `'monthly' \| 'special_exception'` | その期の源泉所得税の納付サイクル実績 | — |
| 補足（任意） | `employeeCountAtFiscalYearEnd` | number \| null | 決算時点の従業員数。就業規則届出等の閾値判定の参考（[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md) 3節） | — |

`localTaxCollectionMethod`（住民税特別徴収/普通徴収）は決算のたびに変わる性質のものではなく
`CompanyProfile`側の現況値のままで十分なため、`TaxReturnEntry`には含めない。

```ts
// 設計イメージ（Sprint17時点ではコード化しない。Sprint16 2-1節の型を上記の表に合わせて更新したもの）

export type TaxReturnEntry = {
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
  filedDate: string | null;
  capitalAtFiling: number | null;

  taxableSalesAmount: number | null;
  consumptionTaxStatus: ConsumptionTaxStatus;
  taxationMethod: TaxationMethod | null;
  invoiceRegistrationStatus: InvoiceRegistrationStatus;

  corporateTaxAmount: number | null;
  consumptionTaxAmount: number | null;

  corporateTaxInterimFilingActual: InterimFilingStatus;
  consumptionTaxInterimFrequencyActual: ConsumptionTaxInterimFrequency;
  financialStatementPublished: boolean;
  withholdingTaxCycleActual: 'monthly' | 'special_exception';

  employeeCountAtFiscalYearEnd: number | null;
};

export type TaxReturnProfile = {
  entries: TaxReturnEntry[]; // 決算のたびに1件追加。古い順に並べる
};
```

型のうち`ConsumptionTaxStatus`・`TaxationMethod`・`InvoiceRegistrationStatus`・
`InterimFilingStatus`・`ConsumptionTaxInterimFrequency`は`src/lib/companyProfile.ts`に
既に定義済みの型をそのまま再利用する（新しい型を並行して作らない）。

---

## 3. 取得方法

### 3-1. 近い将来（Sprint17スコープ）: Change Interviewによる手入力

主たる取得経路は6節で設計する「決算」イベント登録時のChange Interview。ユーザーが
確定申告後に数問へ回答する形で1件の`TaxReturnEntry`を作る。回答しなかった項目は
`null`のまま保存し、既存の`companyProfile.ts`の設計方針（「根拠が無い場合は`null`を返して
断定しない」）をそのまま踏襲する。

### 3-2. 中期（Sprint17.2以降のいずれかのPhaseで検討）: 数値の相互補完

`corporateTaxAmount`・`consumptionTaxAmount`など、ユーザーが正確な数字をすぐには
把握していない場合がある（顧問税理士が別途保管しているケース等）。この場合、
**「概算レンジ」での回答**（例:「20万円以下」「20万円〜48万円」「48万円超」）を選べるようにし、
中間申告の要否判定に必要な閾値さえ跨いでいれば正確な金額が無くてもRoadmap計算は成立する
設計を想定する（具体的な選択肢設計はSprint17.3の実装時に詰める）。

### 3-3. 将来像: OCR・AI抽出、会計データ連携API

確定申告書のPDF・画像から自動抽出する構想、およびfreee/マネーフォワード等の会計データ連携APIとの
接続は、[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)「⑨将来の会計データ連携」で既出の
方向性と合流する。本ドキュメントでは9節で独立して扱う（Sprint17の実装対象には含めない）。

---

## 4. CompanyProfileとの役割分担

### 4-1. 原則: 「事実」はTax Return Profile、「現況の表示値」はCompanyProfile

| CompanyProfileフィールド | 決定権 | 理由 |
|---|---|---|
| `consumptionTaxStatus` | **Tax Return Profileが正本**（2期前のエントリの`taxableSalesAmount`から機械的に導出） | 法律上、基準期間の課税売上高で決まるため、ユーザーの主観が入る余地がない |
| `corporateTaxInterimFiling` | **Tax Return Profileが正本**（前期の`corporateTaxAmount`から導出） | 同上 |
| `consumptionTaxInterimFrequency` | **Tax Return Profileが正本**（前期の`consumptionTaxAmount`の区分から導出） | 同上 |
| `stage` | 従来通り`establishedDate`/`fiscalMonth`から導出（`deriveStage`、変更なし） | Tax Return Profileが無くても計算可能な事実のため、依存を増やさない |
| `capital` | **CompanyProfileが正本、Tax Return Profileは検証材料** | 資本金自体は登記事項でありCompanyProfile側がリアルタイムの現況を持つ。ただし前期申告時点の`capitalAtFiling`と現在値が異なれば「増資イベントの記録漏れでは」という検出材料になる（8節の通知） |
| `withholdingTaxCycle` | CompanyProfileが正本（ユーザーが選んだ現在の運用） | 特例の届出有無は事実だが、翌期に変更する意思決定はユーザー側にあるため |
| `invoiceRegistrationStatus` | CompanyProfileが正本、Tax Return Profileは実績記録 | 登録は任意の意思決定であり、期の途中でも変わりうるため「現況」はCompanyProfile側が持つ |

### 4-2. 矛盾時の扱い: 自動上書きしない

Tax Return Profileの示す値とCompanyProfileの現在値が食い違う場合（例: 2期前の課税売上高から
「課税事業者になっているはず」と計算できるのに、CompanyProfileでは`exempt`のまま）でも、
**システムが黙って`CompanyProfile`を書き換えることはしない**。[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)
以来の「断定しない」という一貫した設計方針に従い、Change Interview（6節）またはRoadmap Confidence
（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節）を通じてユーザーに提示し、
**確認を経て初めて更新する**。

---

## 5. Roadmap反映

### 5-1. Rule Engine contextへの追加

`buildProfileRuleContext`（`companyProfile.ts`）と同様の形で、Tax Return Profile由来の
コンテキストキーを追加する設計とする（Sprint17.4で実装、コード化イメージ）。

```ts
// 設計イメージ（Sprint17.4でコード化）
function buildTaxReturnRuleContext(profile: TaxReturnProfile): Record<string, unknown> {
  const latest = profile.entries.at(-1);
  return {
    prior_taxable_sales_amount: latest?.taxableSalesAmount ?? null,
    prior_corporate_tax_amount: latest?.corporateTaxAmount ?? null,
    prior_consumption_tax_amount: latest?.consumptionTaxAmount ?? null,
  };
}
```

Rule Engine自体（`evaluateRules`）はコンテキストのキー名を汎用的に扱うため、
**コード変更なしにこの拡張を取り込める**（[RULE_ENGINE.md](RULE_ENGINE.md)が既に明記している
拡張方針の通り）。

### 5-2. Roadmap Update Engineのパイプラインでの位置づけ

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4-1節のパイプライン図に、
Tax Return Profileは「CompanyProfileの自動導出関数の入力」として関わる。**Tax Return Profile自体が
Rule Contextに直接使われる場面（5-1節）と、CompanyProfile経由で間接的に使われる場面
（4節の表の通り`consumptionTaxStatus`等を導出する場面）の2経路がある**ことを整理しておく。

```
TaxReturnProfile ──┬─→ deriveConsumptionTaxStatus 等（companyProfile.ts、Sprint17.2で更新）
                    │      └─→ CompanyProfile.consumptionTaxStatus 等を更新提案
                    │
                    └─→ buildTaxReturnRuleContext（5-1節、新設）
                           └─→ RuleContextに追加 → Rule Engineへ
```

### 5-3. 複数年ホライズンでの「先読み」

Tax Return Profileに2期分以上のエントリが蓄積すると、**課税売上高の推移から翌々期の見通しを
Confidence付きで提示できる**ようになる（例: 直近2期の課税売上高が右肩上がりで1,000万円に
近づいている場合、「来期課税事業者になる可能性」を`estimated`より弱い`forecast`相当の
確からしさで提示する）。この「Confidenceのさらに下のレベル」を新設するかどうかは
[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節のConfidence分類（`confirmed`/
`estimated`/`incomplete`）を3分類のままにするか4分類に拡張するかの判断が必要で、
本Sprintでは結論を出さず10節の要判断事項とする。

---

## 6. Change Interview

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 3節では「決算」トリガーの質問を
4問程度の粗い例として挙げていた。本節ではTax Return Profileの全項目（2節）を漏れなく埋められる
具体的な質問フローとして設計し直す。

### 6-1. 質問フロー（設計案）

| 順番 | 質問 | 対応フィールド | 分岐条件 |
|---|---|---|---|
| 1 | 決算日はいつでしたか（自動入力: `CompanyProfile.fiscalMonth`から推定、修正可） | `fiscalYearStartDate`/`fiscalYearEndDate` | 常に表示 |
| 2 | 申告は完了しましたか。完了日は | `filedDate` | 常に表示 |
| 3 | 課税売上高はいくらでしたか（概算可、3-2節） | `taxableSalesAmount` | 常に表示 |
| 4 | 消費税は課税・免税どちらで確定しましたか | `consumptionTaxStatus` | 常に表示 |
| 5 | （4で課税の場合のみ）課税方式は原則・簡易のどちらでしたか | `taxationMethod` | `consumptionTaxStatus === 'taxable'`のときのみ |
| 6 | インボイス登録は済んでいますか | `invoiceRegistrationStatus` | 常に表示（`CompanyProfile`側が`registered`なら質問省略) |
| 7 | 確定した法人税額・消費税額は（概算可） | `corporateTaxAmount`/`consumptionTaxAmount` | 常に表示 |
| 8 | 今期、中間申告はありましたか。何回でしたか | `corporateTaxInterimFilingActual`/`consumptionTaxInterimFrequencyActual` | `stage === 'first_term'`なら質問省略（前期実績が無いため自明に`none`） |
| 9 | 決算公告は実施しましたか | `financialStatementPublished` | `corporateType === 'kabushiki'`のときのみ（合同会社は義務なし、[PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md](PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md)決算公告の設計と整合） |
| 10 | 源泉所得税の納付は毎月・年2回のどちらでしたか | `withholdingTaxCycleActual` | `employeeCount > 0`のときのみ |

全10問だが、分岐条件により1期目・従業員なし・合同会社等の会社では実質5〜6問に収まる設計とする。

### 6-2. 回答後の処理

回答完了時に以下を1トランザクション的に行う（実際はクライアント側のlocalStorage書き込みが
複数回に分かれても実害はない小規模データのため、Sprint17.3実装時に厳密なアトミック性までは
求めない）。

1. `TaxReturnProfile.entries`に新規`TaxReturnEntry`を追記
2. `CompanyProfile.stage`を`second_term_or_later`へ更新（既存`applyCompanyProfileToProcedures`が
   これを見て設立系手続きを非表示にする、0節参照）
3. `deriveConsumptionTaxStatus`等（Sprint17.2で更新）を新しい`TaxReturnProfile`込みで再評価し、
   結果が現在の`CompanyProfile`の値と異なれば「更新しますか」という確認を提示（4-2節、自動上書きしない）
4. Roadmap History（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節）に
   「TaxReturnProfileエントリ追加」として記録（同ドキュメント5-1節の表に既に定義済みの記録種別）

### 6-3. UI上の位置づけ

画面変更は本Sprintでは行わないため設計イメージに留める。[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
3-2節と同じ想定（`/events`の「決算」イベント登録直後に質問フローを差し込む）を踏襲する。

---

## 7. AI参謀との関係

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-2節で構想した`buildRoadmapForesight`
（仮称）が、Tax Return Profileを主な入力にする想定で、より具体的な例文を設計する。

| 条件（Tax Return Profileのデータから） | 助言例 | Confidence |
|---|---|---|
| 直近期の`taxableSalesAmount`が800万円〜1,000万円の間 | 「前期の課税売上高が1,000万円に近づいています。来々期に課税事業者へ切り替わる可能性があります」 | `estimated` |
| 直近2期の`taxableSalesAmount`が連続増加し1,000万円に接近 | 「課税売上高が2期連続で増加しています。早めに顧問税理士へ今後の見通しをご確認ください」 | 5-3節の「forecast」相当（要判断） |
| 直近期の`corporateTaxAmount`が中間申告の基準に近い | 「前期の法人税額から、来期は中間申告が必要になる可能性があります」 | `estimated` |
| `corporateType === 'kabushiki'`かつ直近期`financialStatementPublished === false` | 「前期の決算公告が未実施のようです。会社法上の義務のため、今期は実施をご検討ください」 | `confirmed`（実施有無は事実） |

**既存の`buildProfileAdvisories`（Phase14.2、`CompanyProfile`のみ参照）とは別関数として実装する**
という[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-2節の方針を継続する。
`adviserScore.ts`本体（`scoreProcedures`等）への変更は本Sprintでも不要。

---

## 8. 通知との関係

[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 8-2節「Confidence低下通知」の
具体化として、以下をTax Return Profile起点の通知として設計する（`buildRoadmapAlerts`、
Sprint16.5で新設予定の関数に統合する想定、新たな関数を並行して作らない）。

| 通知 | 発生条件 |
|---|---|
| 前期申告未登録の催促 | `CompanyProfile.fiscalMonth`から計算される決算日を90日以上過ぎているのに、その期に対応する`TaxReturnEntry`が無い |
| 基準期間データ更新のお知らせ | Change Interview完了により`consumptionTaxStatus`の推定値が変わった（4-2節の確認プロセスを経て実際に更新された場合） |
| 決算公告未実施の注意喚起 | `corporateType === 'kabushiki'`かつ直近`TaxReturnEntry.financialStatementPublished === false`のまま一定期間経過 |

いずれも既存`buildNotifications`（期限の知らせ専用）とは別軸・別関数として扱う方針を維持する。

---

## 9. OCR・AI抽出の将来像

**本節は将来構想であり、Sprint17.2〜17.6の実装計画（10節）には含めない。**

### 9-1. 想定シナリオ

ユーザーが確定申告書一式（法人税申告書別表一、消費税及び地方消費税の確定申告書、
地方税申告書等のPDFまたはスキャン画像）をアップロードすると、OCR・AIによる構造化データ抽出で
2節の`TaxReturnEntry`が自動生成され、Change Interviewでの手入力を省略できる、という将来像。

### 9-2. 抽出対象と申告書上の位置（参考マッピング）

| `TaxReturnEntry`フィールド | 主な出典書類 |
|---|---|
| `fiscalYearStartDate`/`fiscalYearEndDate` | 法人税申告書別表一 表紙 |
| `taxableSalesAmount` | 消費税及び地方消費税の確定申告書 |
| `corporateTaxAmount` | 法人税申告書別表一 |
| `consumptionTaxAmount` | 消費税及び地方消費税の確定申告書 |
| `capitalAtFiling` | 法人税申告書別表一 または法人事業概況説明書 |

### 9-3. 技術的な選択肢（検討候補、結論は出さない）

- LLM（Claude等）によるPDF/画像の直接解析（マルチモーダル入力で構造化JSON抽出）
- 専用OCRサービス＋ルールベースのフィールドマッピング
- いずれの場合も**抽出結果はConfidence `estimated`扱いとし、ユーザーが確認・訂正して
  初めて`confirmed`扱いに格上げする**設計にする（6節のChange Interviewを「確認画面」として
  再利用できる可能性がある）

### 9-4. コンプライアンス・プライバシー上の考慮

CLAUDE.mdが明記する通りSUNBOOは「記帳・電子申告そのものは提供しない」思想のサービスであり、
確定申告書という機密性の高い書類を扱う機能を追加する場合、**保存方針（アップロード後に原本を
保持するか、抽出後は破棄するか）・アクセス制御・保持期間**を独立した設計判断として別途行う
必要がある。本節では方向性の提示に留め、具体的な設計はSprint17の対象外とする。

---

## 10. Sprint17.2〜17.6実装計画

**Sprint16 10節との重複に関する注記**: Sprint16.2は「`TaxReturnProfile`型・`localStorage`実装」
「決算イベントの活性化」を含んでいたが、本ドキュメントの方がTax Return Profile自体の設計としては
詳細である。**実装時はSprint16.2ではなく本ドキュメントのSprint17.2〜17.3を正とし、
Sprint16 10節の該当行は本ドキュメントへのポインタに差し替えることを推奨する**
（重複実装を避けるため。ROADMAP.md更新時に反映する）。

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **17.2** | `TaxReturnEntry`/`TaxReturnProfile`型・`localStorage`実装（2節）。`deriveConsumptionTaxStatus`等3関数をTax Return Profile対応に更新（4節） | `src/lib/taxReturnProfile.ts`（新規）、`src/lib/companyProfile.ts`（既存関数の更新） | Sprint16.1完了（済み） | 既存3関数のシグネチャ変更が呼び出し元（`/profile`ページ等）に与える影響の確認 |
| **17.3** | Change Interview実装（6節、全10問・分岐ロジック）。「決算」イベントの活性化（`is_active=true`化）とそれに伴う`/events`側の最小改修 | `src/app/(site)/events/page.tsx`、`src/lib/types.ts`（`EventTypeCode`拡張） | 17.2完了 | Sprint16.2で計画していた同種の改修と重複するため、本Phaseに一本化してよいか |
| **17.4** | Rule Contextの拡張（`buildTaxReturnRuleContext`、5-1節）、Roadmap Update Engine（Sprint16.3）への配線 | `src/lib/companyProfile.ts`または新規`taxReturnProfile.ts`、`src/lib/roadmapEngine.ts` | Sprint16.3着手済みであること | Roadmap Update Engine側の実装が先か、本Phaseが先か（順序の入れ替え可否） |
| **17.5** | AI参謀Foresightの拡張（7節の例文実装）、通知エンジンの拡張（8節の催促通知） | `src/lib/adviserScore.ts`または`buildRoadmapForesight`実装先、`buildRoadmapAlerts` | 17.4完了、Sprint16.5着手済みであること | Sprint16.5の実装と統合するか別関数のままにするか |
| **17.6** | OCR・AI抽出のプロトタイプ検討（9節の将来像のうち、着手する価値がある部分の見極め） | 未定 | 17.2〜17.5完了、コンプライアンス方針の確定 | 本当に着手するか、v1.0以降に先送りするか |

---

## まとめ（設計レビュー観点）

1. **1節「前期申告書を会社の現在地として扱う」というフレーム**: この比喩・位置づけで
   意図と合っているか
2. **2節の保持項目**: 概算レンジ入力（3-2節）を認める設計でよいか、正確な金額のみを
   受け付けるべきか
3. **4節「矛盾時は自動上書きしない」という方針**: Change Interviewでの確認を必須にすることで
   ユーザーの手間が増える点をどう評価するか
4. **5-3節のConfidence分類拡張**: `confirmed`/`estimated`/`incomplete`の3分類のままにするか、
   トレンド予測用に4分類目（`forecast`等）を設けるか
5. **9節のOCR・AI抽出構想**: 将来像として妥当か、Sprint17の実装計画（10節）に一切含めない
   という切り分けでよいか
6. **10節のSprint16との重複整理**: Sprint16.2をSprint17.2〜17.3に差し替えるという提案が
   妥当か。ROADMAP.md側の記載も合わせて整理する必要がある
