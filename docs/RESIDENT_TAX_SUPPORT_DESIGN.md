# RESIDENT_TAX_SUPPORT_DESIGN.md — 住民税特別徴収 対応設計（Sprint46）

**ステータス: 設計のみ。DB変更・マイグレーション・コード変更・画面変更は本Sprintでは一切行っていない。**
実装はレビュー後、Sprint47以降で行う。

目的: 個人住民税の特別徴収（毎月納付・納期の特例）をSUNBOOの年間ロードマップへ正しく組み込むための
正式設計。[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 23節・
[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)・[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)が
既知の制約として明記している「住民税特別徴収がRoadmapに出てこない」というギャップに対する設計対応。

**重要な前置き**: 本ドキュメント全体を通じて、**法人住民税**（`MUNICIPAL_RESIDENT_TAX_RETURN`・
`PREFECTURAL_RESIDENT_TAX_RETURN`、会社自身が納める税・Phase15.2で実装済み）と、
**個人住民税の特別徴収**（従業員の住民税を会社が給与天引きして納める代理徴収義務、本ドキュメントの対象）は
完全に別の制度として扱う。両者は「住民税」という言葉を共有するが、納税義務者（会社 vs 従業員個人）・
根拠条文・申告書と納付書の別・発生タイミングが異なる。以降「住民税特別徴収」「特別徴収」と書く場合は
すべて後者（個人住民税の特別徴収）を指す。

---

## 0. 前提として確認した既存事実

設計に入る前に、既存コード・DBの実データを確認した。この確認により、当初想定より対応範囲が
狭いことが分かった。

1. **給与支払報告書（`SALARY_PAYMENT_REPORT`）は既にProcedure Masterに存在する**
   （`supabase/migration_procedure_master_phase15_2.sql` 110-120行）。`category='local_tax'`、
   `requires_employees=TRUE`、`office_type='municipal_tax'`、`timing_type='fixed_date'`
   （毎年1/31）、`include_in_diagnosis=TRUE`。ユーザー提示の前提と一致することを確認した。

2. **`CompanyProfile.localTaxCollectionMethod`（`'special_collection' | 'general_collection'`）は
   Sprint14.2から既に存在し、`/profile`（`src/app/(site)/profile/page.tsx` 504-518行）・
   `WorkspaceProfileForm.tsx`の両方に入力UIがあり、`buildProfileRuleContext`
   （`src/lib/companyProfile.ts` 318-328行）経由でRule Engineの評価コンテキストにも既に
   含まれている。** つまりユーザー提示の候補フィールド「`residentTaxCollectionStatus`」は
   **既存の`localTaxCollectionMethod`がほぼそのまま該当する**。新規フィールドとして追加する必要はない
   （3節で詳述）。

3. **`WITHHOLDING_TAX_CODE`（源泉所得税の納付）が、今回作ろうとしている仕組みとほぼ同じ形の
   前例として既に本番稼働している。** `companyProfile.ts`の`applyCompanyProfileToProcedures`が
   `profile.withholdingTaxCycle === 'special_exception'`のときに期限を年2回パターンへ上書きし、
   `roadmap.ts`の`expandOccurrences`が`proc.code === WITHHOLDING_TAX_CODE`を専用分岐でハンドリングして
   horizonYears分を年2回展開している（`roadmap.ts` 64-99行）。この前例をそのまま転用できるかが、
   5節のRoadmap実装方式の核心的な論点になる。

4. **`municipal_tax`（市区町村税務課）の`jurisdictions`データは東京都渋谷区（`13113`）のみ登録済みで、
   福岡県60市区町村には1件も無い**（注: 福岡県の自治体数は60市町村、Resolverの管轄判定単位は72判定単位。本節は執筆時点の記載を保持）
   （`supabase/migration_organizations.sql` 200-219行を確認。
   福岡県データは同ファイル110行以降で追加されているが`municipal_tax`の窓口投入は無い）。
   これは**既存の`SALARY_PAYMENT_REPORT`・`MUNICIPAL_RESIDENT_TAX_RETURN`が福岡県の会社に対して
   既に抱えているギャップ**であり、本Sprintで新たに作るものではない。6節で扱う。

5. **`state.withholdingTaxCycle`は常に`'incomplete'`を返す既知の未実装ギャップ**
   （`src/lib/state.ts` 189-199行、コード内コメントで明記済み）。`roadmap.ts`の
   `confidenceForProcedure`は`WITHHOLDING_TAX_CODE`のConfidence表示にこの値をそのまま使っているため、
   **`CompanyProfile.withholdingTaxCycle`を実際に`'monthly'`や`'special_exception'`に設定しても、
   Roadmap上のConfidenceバッジは常に「情報不足」のまま**という表示上の不整合が現在も残っている。
   住民税特別徴収で同じパターンをそのまま踏襲すると同じ不整合を複製することになるため、
   7節で扱う設計判断が必要。

6. **`procedures.timing_type`にDB上のCHECK制約は無い**（`TEXT NOT NULL`のみ、`schema.sql` 54行）。
   新しい`timing_type`値を追加する場合もマイグレーションでのスキーマ変更は不要（値の意味は
   `diagnosis.ts`の`calculateNextDeadline`と`roadmap.ts`の`expandOccurrences`のswitch文だけが握っている）。

---

## 1. 通常納付（毎月10日納付）

- **期日**: 当月分の給与から特別徴収した住民税を、翌月10日までに市区町村へ納入する。
  `WITHHOLDING_TAX`（源泉所得税）と全く同じ`monthly_10th`パターンで表現できる。
- **`requires_employees`の扱い**: `WITHHOLDING_TAX`と同じく`TRUE`とする。`runDiagnosis`
  （`diagnosis.ts` 199-202行）が`hasEmployees=false`の場合に`requires_employees=false`の手続きのみに
  絞り込む既存フィルタがそのまま効くため、従業員がいない会社には自動的に表示されない。
- **給与支払の有無との関係**: `requires_employees=TRUE`は「従業員がいること」を必要条件にするが、
  十分条件ではない。特別徴収は「給与支払報告書を提出し、市区町村から特別徴収税額の決定通知を受けた
  会社」が行う代理徴収であり、`localTaxCollectionMethod === 'general_collection'`（普通徴収、
  従業員本人が納付）を選んでいる会社には表示すべきでない。この絞り込みは`ESTABLISHMENT_PROCEDURE_CODES`
  が`stage`で行っているのと同じ形の、CompanyProfile値によるフィルタとして`applyCompanyProfileToProcedures`
  に追加する（3節・5節）。
- **特別徴収対象者0人の会社の扱い**: SUNBOOは従業員単位のデータを持たない（`employeeCount`という
  会社単位の人数のみ）。「従業員はいるが全員が普通徴収対象（短時間パート等）」という会社単位で見た
  「特別徴収対象者0人」のケースは、**既存の`localTaxCollectionMethod === 'general_collection'`が
  そのまま表現できる**。会社を「特別徴収を行っている／行っていない」の二値で扱うMVPの割り切りとして
  明示し、一部従業員のみ特別徴収のような混在ケースは`caution_note`で専門家確認を促すに留める
  （3節「対象外とする理由」）。

---

## 2. 納期の特例

- **適用条件**: 給与の支払を受ける従業員が常時10人未満の場合に、市区町村への申請（`特別徴収税額の
  納期の特例に関する申請書`）により選択できる。これは`WITHHOLDING_SPECIAL_EXCEPTION`
  （源泉所得税の納期の特例、税務署向け）とほぼ同じ要件だが、**提出先が別（市区町村 vs 税務署）の
  別制度**であり、源泉所得税側で特例を申請していても住民税側は自動適用されない。
- **年2回の納付時期**: **6月10日**（前年12月分〜当年5月分）と**12月10日**（当年6月分〜11月分）。
  地方税法で全国一律に定められた日付のため、`WITHHOLDING_TAX`の1/20・7/10（国税・所得税法）とは
  **日付が異なる別のパターン**である。「既存`withholdingTaxCycle`と混同しない命名」というユーザー
  指定の通り、日付そのものも混同してはならない点を明記する。
- **CompanyProfileに必要な新規フィールド**: `residentTaxPaymentCycle: 'monthly' | 'special_exception' |
  'unset'`。3節で詳述。
- **命名の整理**:
  | 概念 | 制度 | フィールド名 | 特例の日付 |
  |---|---|---|---|
  | 源泉所得税（国税） | 所得税法 | `withholdingTaxCycle`（既存） | 1/20, 7/10 |
  | 住民税特別徴収（地方税） | 地方税法 | `residentTaxPaymentCycle`（新規） | 6/10, 12/10 |
- **ロードマップの展開方法**: 5節で詳述（結論: 既存`WITHHOLDING_TAX`パターンを一般化した形で再利用）。

---

## 3. CompanyProfile設計

### 3-1. 追加するフィールド（最小構成）

MVPとして追加が必要なのは**1フィールドのみ**とする。

```ts
// src/lib/companyProfile.ts に追加
export type ResidentTaxPaymentCycle = 'monthly' | 'special_exception' | 'unset';

export type CompanyProfile = {
  // ...既存フィールド...
  residentTaxPaymentCycle: ResidentTaxPaymentCycle; // 新規
};
```

`WithholdingTaxCycle`と全く同じ3値の形にすることで、`PROFILE_DEFAULTS`・`loadCompanyProfile`の
後方互換読み込みパターン（8節）・フォームの`ToggleButtons`実装（`WITHHOLDING_CYCLE_LABEL`と同じ形で
`RESIDENT_TAX_CYCLE_LABEL`を追加するだけ）をそのまま横展開できる。

### 3-2. 追加しないフィールド（ユーザー提示候補の検討結果）

| 候補 | 判断 | 理由 |
|---|---|---|
| `residentTaxCollectionStatus` | **追加しない** | 既存`localTaxCollectionMethod`（`special_collection`/`general_collection`）がそのまま同じ意味を持つ（0節2項）。新設すると同じ意味のフィールドが2つ並存し、`buildProfileRuleContext`・両フォーム・DBカラムすべてで二重管理になる |
| `residentTaxPaymentCycle` | **追加する** | 3-1節。既存に相当するフィールドが無い |
| `hasSpecialCollectionEmployees` | **追加しない** | 1節で述べた通り、`localTaxCollectionMethod === 'general_collection'`が「特別徴収対象者が実質0人」のケースを会社単位で代替できる。従業員単位のデータをSUNBOOは持たないため、これ以上細かい粒度のフラグを追加しても実データで裏付けられず、かえって過剰な精度を装うことになる（`VISION.md`の「憶測に基づく機能追加をしない」に反する） |

### 3-3. DBスキーマ変更案（イラスト。本Sprintでは適用しない）

`workspace_company_profiles`（`migration_workspace_mvp.sql` 73-76行の`withholding_tax_cycle`・
`local_tax_collection_method`と同じ列定義パターン）に1列追加する。

```sql
-- Sprint47で作成する migration_resident_tax_payment_cycle.sql のイメージ（本Sprintでは未作成）
ALTER TABLE workspace_company_profiles
  ADD COLUMN IF NOT EXISTS resident_tax_payment_cycle TEXT NOT NULL DEFAULT 'unset';

ALTER TABLE workspace_company_profiles
  ADD CONSTRAINT workspace_company_profiles_resident_tax_payment_cycle_check
  CHECK (resident_tax_payment_cycle IN ('monthly', 'special_exception', 'unset'));
```

新規テーブルではなく既存テーブルへの列追加のため、CLAUDE.mdの「新規テーブルにはGRANT+RLS+policyを
セットで書く」は該当しない（既存の`workspace_company_profiles`のRLS・GRANTをそのまま使う）。

### 3-4. 境界変換・フォームへの接続

`workspaceCompanyProfile.ts`の`WorkspaceCompanyProfileRow`・`workspaceRowsToCompanyProfile`・
`companyProfileToWorkspaceUpdatePayload`（現在`withholding_tax_cycle`を素通しで変換しているのと
同じ形）に`resident_tax_payment_cycle`を1行追加するだけで対応できる。フォーム側は`WITHHOLDING_CYCLE_LABEL`
（`WorkspaceProfileForm.tsx` 39-43行、`profile/page.tsx`側も同型）と同じ形で`RESIDENT_TAX_CYCLE_LABEL`を
定義し、既存の「④ 源泉所得税・地方税」セクション内に「住民税特別徴収の納期」として1項目追加する
（新しいセクションは作らない。既存の`ToggleButtons`コンポーネントをそのまま再利用）。

---

## 4. Procedure Master

### 4-1. 分類

| 候補 | 分類 | 理由 |
|---|---|---|
| 特別徴収税額の納付（毎月・納期の特例を1つの手続きとして統合） | **今回実装** | 0節1項の既存事実・1節2節の設計により最小コストで実現可能。CLOSED_BETA文書群が既知の制約として明記している最重要ギャップ |
| 給与所得者異動届出書 | **将来実装** | 入社・退職に連動する届出だが、`event_types`には現在`employee_hired`（採用）のみが活性化済みで、退職イベントが存在しない（0節・[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md) 3節「賞与支払届」と同様、新イベント種別が前提）。イベントエンジンの拡張は「Engineの大幅変更は禁止」というSprint46の制約に抵触するため対象外とする |
| 特別徴収切替届出書（普通徴収→特別徴収） | **将来実装** | Rule Engine自体は`local_tax_collection_method`を既に評価コンテキストに持つため技術的には`add_procedure`ルール1件で実現できるが、「切り替えを促す」という提案的な性質はDecision Engineの役割（`generateWorkspaceDecisions`）に近く、単純な必須手続きとして一覧に出すと誤解を招く。β実際の要望を見てから判断する |
| 特別徴収税額決定通知の確認 | **対象外（独立したProcedureとしては作らない）** | 4-3節で詳述 |

### 4-2. 今回実装するProcedure（1件）

```
code:                  RESIDENT_TAX_WITHHOLDING
name:                  特別徴収税額の納付
category:              local_tax
requires_employees:    TRUE
office_type:           municipal_tax
frequency:             monthly
timing_label:          毎月10日（納期の特例の場合は年2回：6月10日・12月10日）
timing_type:           monthly_10th        -- 基準は源泉所得税と同じ「毎月」。特例展開は5節のEngine側で行う
timing_data:           NULL
priority:              31                  -- 既存最大値30（FINANCIAL_STATEMENT_PUBLICATION）の次
corporate_type:        NULL
requires_officer_term: FALSE
include_in_diagnosis:  TRUE
target_note:           従業員の住民税を特別徴収（給与天引き）している全ての法人
submission_method:     金融機関窓口への納付、または地方税お共通納税システム（eLTAX）によるオンライン納付
e_filing_system_name:  eLTAX（地方税お共通納税システム）
e_filing_system_url:   https://www.eltax.lta.go.jp/
caution_note:          本情報は一般的な参考情報です。毎年5月頃、市区町村から「特別徴収税額の決定通知書」
                        が送付され、6月分から新しい税額での天引きが始まります。金額の確認・納付方法は
                        税理士等の専門家にご確認ください。普通徴収を選択している場合は対象外です。
```

`caution_note`に決定通知書の到着時期・意味を織り込むことで、4-3節の「決定通知の確認」を独立した
Procedureにせずに実務上必要な情報を伝える（既存`caution_note`パターンの範囲内での対応）。

### 4-3. 「特別徴収税額決定通知の確認」をProcedureにしない理由

ユーザーが事前に指摘した通り、これは既存のProcedureモデル（「何を・いつまでに・どこへ提出するか」）に
馴染まない。

- **性質が「提出」ではなく「受領・確認」である。** 既存20+10件のProcedureはすべて「会社から行政機関へ
  提出する」行為をモデル化しており、`office_type`は常に「提出先」を意味する。決定通知の確認は逆方向
  （市区町村→会社）の情報伝達であり、`office_type`という概念自体が当てはまらない
  （`FINANCIAL_STATEMENT_PUBLICATION`が「提出先という概念に馴染まない」ケースとして`office_type='other'`を
  使った前例はあるが、あちらは「会社が行う対外的な行為」である点で決定通知確認とは性質が違う）。
- **期限が「会社の行為の期限」ではなく「市区町村側の発送時期の目安」である。** 5月頃という目安はあっても
  法定の確定日ではなく、`fixed_date`型で扱うと誤った確度の情報を断定することになる
  （VISION.mdの「実務データの検証なしの断定をしない」に抵触するリスク）。
- 上記の理由から、**4-2節の`RESIDENT_TAX_WITHHOLDING`の`caution_note`に情報として織り込む**方式を採用し、
  独立したProcedure行としては追加しない。将来、Timeline Engineが「市区町村からの通知を受領した」という
  事実を記録できるようになった場合（5節 案C）に、初めて独立したモデル化を検討する。

---

## 5. Roadmapへの反映方式（案A/B/Cの比較）

### 比較表

| 観点 | 案A: Procedureを2つに分ける | 案B: Procedure1つ＋CompanyProfile条件で展開切替 | 案C: TimelineEventから出現回を生成 |
|---|---|---|---|
| 概要 | `RESIDENT_TAX_WITHHOLDING_MONTHLY`と`RESIDENT_TAX_WITHHOLDING_SPECIAL`の2行を用意し、`residentTaxPaymentCycle`の値でどちらを表示するか出し分ける | 4-2節の1行のみ。`applyCompanyProfileToProcedures`と`expandOccurrences`が`residentTaxPaymentCycle`を見て展開パターンを切り替える（`WITHHOLDING_TAX_CODE`の既存実装と同じ形） | 「決定通知を受領した」という事実をTimelineEventとして記録し、そこから将来の出現回を導出する |
| メリット | 各行を管理画面から個別に編集・無効化できる。Procedure Status/Notificationのキーが手続きごとに独立し、切替時に古いステータスと混在しない | **既存の`WITHHOLDING_TAX_CODE`パターンをそのまま転用でき、実装コストが最小。本番で実績のある形**。Procedure Masterの行数が増えない | Timeline Engineの長期設計思想（すべての事実を単一ログに統合）と最も整合する。将来「特例に切り替えた日」等の履歴も自然に残せる |
| デメリット | 「今使っていない方」のcode向けにも`localTaxCollectionMethod`同様の除外フィルタが要る点は案Bと同じ手間。加えて`RESIDENT_TAX_WITHHOLDING_SPECIAL`側に新しい`timing_type`（年2回パターン）が要り、`calculateNextDeadline`への分岐追加も発生する | `expandOccurrences`・`applyCompanyProfileToProcedures`に「procedure.code === Xの場合」というハードコード分岐が**2件目**になる。放置すると3件目以降も同じ形で増殖し、[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 326行が既に懸念している「ハードコード分岐の拡張」がさらに進む | Annual Roadmap EngineはTimelineを直接の入力にしていない（`roadmap.ts`冒頭のコメント参照）。この案だけ新しい入力経路（Timeline→Roadmap直結）を追加する必要があり、Producer新設・記録UI新設まで伴う。「Engineの大幅変更は禁止」という本Sprintの制約を明確に超える |
| Engine変更量 | 中〜大（新`timing_type`追加＋`calculateNextDeadline`分岐＋フィルタ） | **小**（`expandOccurrences`・`applyCompanyProfileToProcedures`の各1箇所を、後述の設定テーブル方式で汎用化） | 大（新Producer・新State統合・新記録UI・Roadmap入力経路の新設） |
| 将来性 | 中。行が増えるほど管理画面のマスタが煩雑になる | 中〜高。今回の汎用化（下記）により3件目以降もデータ追加のみで対応可能になる | 最も高い（長期ビジョンと一致）が、時期尚早 |
| 誤案内リスク | 低〜中（2行の同期漏れ・切替時の見せ方次第） | 低（`WITHHOLDING_TAX`で実績あり） | 低（正しく実装できれば）だが、実装が大掛かりな分、β運用中に持ち込むリスクとしては中〜高 |

### 推奨: 案B（ただし2件目を機にハードコード分岐を小さく一般化する）

案Bを推奨する。理由は実装コストの低さと`WITHHOLDING_TAX`での実績に加え、**「変更しない」という
Sprint46の制約（Engineの大幅変更禁止）に最も適合する**ため。ただし、2つ目の「procedure.codeで
分岐する周期上書き」が発生するタイミングであることから、CLAUDE.mdの「診断エンジンと経営イベント
エンジンで共通する処理は共通関数として`src/lib/`に置き、重複させない」という方針に沿って、
**個別のif分岐ではなく小さな設定テーブルとして一般化する**ことを合わせて提案する（Sprint47実装時の
イラスト、本Sprintでは適用しない）。

```ts
// src/lib/companyProfile.ts への追加イメージ（Sprint47実装時）
type PeriodicCycleOverride = {
  cycleField: 'withholdingTaxCycle' | 'residentTaxPaymentCycle';
  specialExceptionDates: readonly [number, number][]; // [month(0-indexed), day][]
};

const PERIODIC_CYCLE_OVERRIDES: Record<string, PeriodicCycleOverride> = {
  [WITHHOLDING_TAX_CODE]:        { cycleField: 'withholdingTaxCycle',    specialExceptionDates: [[0, 20], [6, 10]] },
  [RESIDENT_TAX_WITHHOLDING_CODE]: { cycleField: 'residentTaxPaymentCycle', specialExceptionDates: [[5, 10], [11, 10]] },
};
```

`applyCompanyProfileToProcedures`（次回期限の上書き）と`roadmap.ts`の`expandOccurrences`
（horizonYears分の展開）の両方が、この1つのテーブルを参照する形に書き換える。**既存の
`WITHHOLDING_TAX_CODE`の挙動・出力は一切変えない**（同じ入力に対して同じ出力を返すリファクタリング）。
これにより3件目（将来、他の「毎月・年2回」パターンの手続きが出てきた場合）はテーブルに1行足すだけで
対応でき、if分岐の増殖を止められる。

案Cは長期的には最も正しい方向性だが、本Sprintの制約下では時期尚早と判断する。Timeline Engineが
「決定通知受領」等の事実を扱えるようになった段階（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 10節が
構想する将来拡張）で改めて検討する。

---

## 6. 自治体差

- **`municipality_code`をどこまで使うか**: 現状のRoadmap計算は`municipality_code`を**窓口（office）の
  解決にのみ**使っており（`resolveOffices`→`jurisdictions`）、**期限日の計算には一切使っていない**
  （`calculateNextDeadline`は`fiscalMonth`のみを受け取り、市区町村を見ない）。住民税特別徴収も
  この既存方針をそのまま踏襲し、期日計算に自治体差を持ち込まない。
- **全国一律で扱える部分**: 納期日そのもの（毎月10日、特例6/10・12/10）は地方税法で全国一律に
  定められているため、`timing_type`ベースの計算に自治体差は生じない。`requires_employees`・
  `localTaxCollectionMethod`による出し分けも会社の状態のみで決まり、自治体には依存しない。
- **自治体差がある部分**: 窓口（`office_type='municipal_tax'`の`organization_offices`）の実在情報
  （住所・電話・URL）、納付方法の詳細（金融機関窓口・口座振替・eLTAXの対応状況）。前者は0節4項で
  確認した通り**福岡県60市区町村に窓口データが1件も無いという既存ギャップ**（注: 福岡県の自治体数は
  60市町村、Resolverの管轄判定単位は72判定単位。
  本節は執筆時点の記載を保持）であり、`SALARY_PAYMENT_REPORT`
  ・`MUNICIPAL_RESIDENT_TAX_RETURN`が既に抱えている問題を`RESIDENT_TAX_WITHHOLDING`が追加で継承する
  だけで、新規に生む問題ではない。後者は既存の`caution_note`パターン（「自治体により扱いが異なる
  場合があります」、`MUNICIPAL_RESIDENT_TAX_RETURN`の`caution_note`と同文言）を踏襲すれば足りる。
- **β版で安全に一般化できる範囲**: 期日・対象条件（`requires_employees`＋`localTaxCollectionMethod`）は
  全国一律として安全に一般化できる。窓口情報の欠落は「情報不足」として`office: null`のまま表示すれば
  誤案内にはならない（`ScheduleList`等の既存コンポーネントは`office`が`null`の場合の表示に既に対応済み）。
  福岡県の`municipal_tax`窓口データ整備自体はProcedure Master拡充とは別軸の課題として切り離す
  （[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)が指摘した既存の宿題であり、本Sprintのスコープ外）。

---

## 7. 既存機能との接続

| 機能 | 変更要否 | 理由 |
|---|---|---|
| Procedure Status | **不要** | `occurrence_key = RoadmapItem.dueDate`という既存の仕組み（[PERIODIC_STATUS_REDESIGN.md](PERIODIC_STATUS_REDESIGN.md)）は、`expandOccurrences`がどんな日付を返すかに関わらずそのまま機能する。特別扱いは不要 |
| Dashboard | **不要** | `summarizeWorkspaceProgress`・`generateWorkspaceAdvice`はいずれも`RoadmapYear[]`を走査するだけの純粋関数で、新しいProcedureが増えても自動的に集計対象に入る |
| AI Adviser | **不要（ただしConfidence判定は要判断、下記）** | `generateWorkspaceAdvice`のロジック自体は無変更で動く。Confidenceの与え方は0節5項の通り要検討 |
| Decision Engine | **不要（将来拡張の余地あり）** | `generateWorkspaceDecisions`もRoadmap走査ベースで自動対応する。`matchingDocumentType`（`workspaceDecisions.ts` 59-64行）は手続き名のキーワード一致で書類種別と紐づけるが、「特別徴収」に対応する`WorkspaceDocumentType`が現状無いため、書類準備の追加コメントは出ない。実害はないが、決定通知書を書類として管理したくなった場合は`WorkspaceDocumentType`の拡張候補になる（本Sprintでは追加しない） |
| Notification Center | **不要** | `buildWorkspaceNotifications`はDecision/AdviceのMap変換のみで、下流のロジックを持たない |
| Share（共有リンク） | **不要** | `share/[token]/page.tsx`は`buildAnnualRoadmap`をそのまま呼ぶため、新しいProcedureも自動的に共有ビューへ反映される。経営者向け共有で住民税特別徴収の期限が見えることは望ましい挙動 |

**Confidence判定（AI Adviser・Decision Engineが参照する`RoadmapItem.confidence`）についての設計判断**:
0節5項で確認した通り、`state.withholdingTaxCycle`は常に`'incomplete'`を返す既知のバグがある。
`roadmap.ts`の`confidenceForProcedure`が`WITHHOLDING_TAX_CODE`をこの壊れた値にルーティングしている
現状の前例をそのまま踏襲すると、`residentTaxPaymentCycle`を明示的に設定しても常に「情報不足」
バッジが出るという同じ不具合を複製することになる。**本設計では、`RESIDENT_TAX_WITHHOLDING_CODE`は
Stateを経由させず、`CompanyProfile.residentTaxPaymentCycle`の値を`confidenceForProcedure`内で
直接判定する**（`residentTaxPaymentCycle === 'unset'`なら`'estimated'`、それ以外は`'confirmed'`）。
これは`WITHHOLDING_TAX_CODE`の実装との意図的な差分であり、既存の不具合を新規機能にまで広げない
ための判断として明記する。`state.withholdingTaxCycle`自体の修正（`timelineProducer.ts`の
`metadata`に`withholdingTaxCycleActual`を追加する対応、`state.ts` 189-196行のコメントが既に
示唆している）は、本Sprintのスコープ外の別課題として切り離す。

---

## 8. データ移行

- **既存会社への新フィールドの初期化**: `resident_tax_payment_cycle`列は
  `NOT NULL DEFAULT 'unset'`で追加する（`withholding_tax_cycle`の既存パターンと同一）。既存の全会社は
  自動的に`'unset'`（未確定）になり、断定的な値を後付けで割り当てない。
- **未入力時（`'unset'`）の表示方針**: Roadmapには**「毎月納付」として表示する**ことを推奨する。
  理由は、特例は会社側からの届出があって初めて適用される制度であり、法定のデフォルトは毎月納付だから
  （`WITHHOLDING_SPECIAL_EXCEPTION`の`caution_note`が源泉所得税側で採用している考え方と同じ）。
  「非表示にする」という選択肢は、特別徴収を行っている会社にとって最重要のRoadmap項目が
  何も出ないという方が誤案内リスクが高いため採らない。ただし7節の通りConfidenceは`'estimated'`とし、
  「会社プロフィールの情報が不足しているため、正確な期限を計算できていません」という既存の
  `opportunities`メッセージ（`workspaceAdvice.ts` 108-116行）が自動的に表示されるようにする
  （新しいメッセージ文言を追加する必要はない）。
- **localStorage版（`/profile`・`/events`）との互換性**: `loadCompanyProfile()`
  （`companyProfile.ts` 122-172行）は`parsed.xxx ?? PROFILE_DEFAULTS.xxx`という後方互換パターンを
  全フィールドに適用しているため、`residentTaxPaymentCycle`も同じ1行を追加するだけで、
  Sprint46以前に保存された既存のlocalStorageデータ（このフィールドを持たない）を安全に読み込める。
  マイグレーション処理は不要（既存パターンの横展開のみ）。

---

## 9. β投入判断

- **β前に入れるべきか**: 見送る。理由は、[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)のパイロット
  （運営者本人による1社パイロット）が本ドキュメント作成時点でまだ実施されておらず、
  Blocker/High相当の実データが無いため。CLOSED_BETA文書群が既に「既知の制約」として告知済み
  （`caution_note`相当の透明性は確保されている）であり、β開始のブロッカーではない。
- **β中に追加すべきか / β後でよいか**: **β中に追加することを推奨する**。根拠:
  1. [BETA_PILOT_LOG.md](BETA_PILOT_LOG.md) 2節・[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)
     47-52行が、この項目について**パイロット実施時に必ず確認する質問として既に組み込み済み**であり、
     運営者自身が実務上の必要性を最も早く確認できる項目である
  2. 本Sprintの設計により、実装がSprint47として独立に着手できる状態まで具体化できた
     （5節の推奨方式・4節のProcedure定義・3節のフィールド定義が確定済み）
  3. Procedure Master・DBスキーマへの追加は、既存の`ON CONFLICT DO NOTHING`パターン
     （[RULE_ENGINE.md](RULE_ENGINE.md)「重複防止・UNIQUE制約の注意」節）に従えば、稼働中のβを
     止めずに安全に追加できる実績がある（Phase15.2のマイグレーションが前例）
  4. パイロットで「住民税特別徴収が実務上不要だった」という結果が出た場合は、Sprint47実装を
     見送りβ後に先送りする判断も妨げない（本設計は実装のGoを出すものではなく、実装するとなった
     場合の設計を先に固めておくもの）

---

## まとめ

- **推奨データモデル**: `CompanyProfile`に`residentTaxPaymentCycle: 'monthly' | 'special_exception' |
  'unset'`を1件のみ新規追加する。徴収方法（特別徴収/普通徴収）は既存の`localTaxCollectionMethod`を
  流用し、専用の新規フィールド（`residentTaxCollectionStatus`・`hasSpecialCollectionEmployees`）は
  追加しない。
- **推奨Procedure構成**: `RESIDENT_TAX_WITHHOLDING`（特別徴収税額の納付）を1件のみ新規追加する
  （4-2節）。給与所得者異動届出書・特別徴収切替届出書は将来実装、決定通知の確認は独立した
  Procedureにせず`caution_note`に情報として織り込む。
- **推奨Roadmap実装方式**: 案B（Procedure1つ＋CompanyProfile条件で展開切替）。ただし
  `WITHHOLDING_TAX_CODE`と合わせて2件目のハードコード分岐になるタイミングであるため、
  `PERIODIC_CYCLE_OVERRIDES`という小さな設定テーブルに一般化してから実装する（5節）。
- **migrationの要否**: 要。`workspace_company_profiles`への列追加1件（`resident_tax_payment_cycle`）と
  `procedures`への行追加1件（`RESIDENT_TAX_WITHHOLDING`）。いずれも既存テーブルへの追加であり、
  新規テーブルのGRANT/RLS設計は不要。
- **Engine変更の有無**: 有（小規模）。`companyProfile.ts`の`applyCompanyProfileToProcedures`と
  `roadmap.ts`の`expandOccurrences`を、`WITHHOLDING_TAX_CODE`専用のif分岐から
  `PERIODIC_CYCLE_OVERRIDES`テーブル参照への小さなリファクタリングを伴って拡張する
  （既存`WITHHOLDING_TAX`の出力は変えない）。加えて`roadmap.ts`の`confidenceForProcedure`に
  `RESIDENT_TAX_WITHHOLDING_CODE`用の分岐を追加する（Stateを経由させない、7節）。
- **MVPで実装する範囲**: `residentTaxPaymentCycle`フィールド・フォーム入力（既存UIパターンの横展開）・
  `RESIDENT_TAX_WITHHOLDING`のProcedure登録・毎月/納期特例の展開ロジック・Confidence判定。
- **MVPでは実装しない範囲**: 給与所得者異動届出書（新イベント種別が前提）、特別徴収切替届出書
  （提案的性質のためβ要望確認後）、特別徴収税額決定通知の独立Procedure化（モデルが馴染まない、
  4-3節）、福岡県`municipal_tax`窓口データの整備（既存の別課題）。
- **既知の誤案内リスク**:
  1. 「特別徴収対象者0人」を`localTaxCollectionMethod`の二値でしか表現できないため、一部従業員のみ
     特別徴収のような混在ケースでは実態と異なる可能性がある（`caution_note`で専門家確認を促すことで緩和）
  2. `residentTaxPaymentCycle === 'unset'`の会社に「毎月納付」をデフォルト表示するため、実際には
     特例を選択している会社にも一時的に誤った期日が出うる（Confidence`'estimated'`表示と
     `opportunities`メッセージで注意喚起する設計だが、ゼロにはならない）
  3. 福岡県の会社では`office`が`null`のまま表示される（0節4項・6節、既存ギャップの継承）
- **Sprint47での実装手順（提案）**:
  1. `PERIODIC_CYCLE_OVERRIDES`への一般化リファクタリング（`WITHHOLDING_TAX`の出力不変を確認するテスト観点で実施）
  2. `residentTaxPaymentCycle`フィールド追加（`companyProfile.ts`・`workspaceCompanyProfile.ts`・両フォーム）
  3. `RESIDENT_TAX_WITHHOLDING`のProcedure Masterマイグレーション作成（`ON CONFLICT (code) DO NOTHING`）
  4. `workspace_company_profiles`への列追加マイグレーション作成
  5. `confidenceForProcedure`への分岐追加
  6. `npm run build`確認 → Supabase側でマイグレーション適用依頼 → Playwrightで実機能確認
     （CLAUDE.md「Build / Playwright確認ルール」に従う）
- **β投入可否**: **β開始のブロッカーではない（β開始済み前提の場合は継続可）。実装自体はβ中に
  追加することを推奨**（9節）。パイロット結果でBlocker/High認定された場合は優先着手、
  そうでなければ計画的にSprint47で実装する。
