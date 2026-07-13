# COMPANY_PROFILE_OBLIGATION_AUDIT.md — Company Profile Obligation Audit（Sprint57）

**ステータス: 調査のみ。コード変更・DB変更・migration・package変更・画面変更は本Sprintでは一切行っていない。**
実装はレビュー後、Sprint58以降で行う。

**【Sprint58追記】本監査で発見した以下3件はSprint58で対応済み（詳細は各節参照、本文は監査当時の記録のまま残す）。**
- 4節・まとめ「現在の誤案内リスク」: `WITHHOLDING_SPECIAL_EXCEPTION`が`employeeCount`を見ずに推薦される問題 → `applyCompanyProfileToProcedures`（`companyProfile.ts`）に`0 < employeeCount < 10`のフィルタを追加し解消
- 6節「`withholdingTaxCycle`のConfidenceバッジが常に情報不足」（`docs/BETA_BACKLOG.md` M-01） → `roadmap.ts`の`confidenceForProcedure`をState経由からCompanyProfile直接判定に変更し解消（`state.ts`自体は意図的に無変更）
- 7-2節「WorkspaceProfileFormの存在しない編集画面への案内」 → 文言修正で解消
残る課題（`localTaxCollectionMethod`のWorkspace UI追加等）はSprint59以降に持ち越し。

目的: CompanyProfileを「単なる会社情報入力画面」ではなく、国・地方自治体・公的機関に対する
**義務判定の入力マスタ**として完成させるため、現在の入力項目・Engine利用状況・判定漏れを再監査する。
SUNBOOの目的（「経営者が国・地方自治体・公的機関に対して最低限果たすべき義務を、迷わず・漏れなく・
期限内に実行できるようにすること」）に照らし、便利機能・社内管理・顧客管理・担当者管理は対象外とする。

調査対象は末尾の参照ファイル一覧の通り。実データ確認は anon キーでの Supabase REST API 参照
（`procedures` 全30件、`rule_conditions` 全件、`workspace_company_profiles`）による。

---

## 0. 前提として確認した事実（サマリ）

- CompanyProfile型は23フィールド（`src/lib/companyProfile.ts` 43-97行）。うち **Engineが実際にProcedureの表示・期限を左右する判定に使うのは9フィールドのみ**（1節参照）。残りは表示専用・アドバイザリー専用・完全未使用のいずれか
- (site)/profile（`src/app/(site)/profile/page.tsx`）は23フィールド全てに入力欄を持つ「完全版」。WorkspaceProfileForm（`src/app/admin/(protected)/workspaces/[id]/profile/WorkspaceProfileForm.tsx`）は意図的にMVPとして一部を編集対象外にしている（同ファイル13-20行のコメントで明記済み）
- `required_conditions` というカラム・概念は**コードベース上に一切存在しない**（`procedures`テーブルのDDL・型定義のいずれにも無い。grep 0件）。ユーザー確認事項にあったが、現状の判定は `requires_employees` / `corporate_type` / `requires_officer_term` / Rule Engine の `rule_conditions` の組み合わせで行われている
- `applicable_industries`（`procedures.applicable_industries`）・`industryCode`（`DiagnosisInput.industryCode`）はいずれも**完全に未使用**。管理画面には入力欄があり、DBにも列があるが、実データは0件、Engineもフィルタに使っていない（3節）
- 本店移転（`hq_relocation`）に関する2件のルール（異動届出書・本店移転登記）は、`EventTypeCode`型に存在しない値をevent_type_codeとして持つため**構造的に到達不可能**（6節）。Company Profile不足ではなくRule Engine配線の問題
- Sprint56で私が`WorkspaceProfileForm.tsx`に追加したUI文言「変更する場合は会社一覧から登録情報を編集してください」は**事実と異なる**（そのような編集画面は存在しない）。本調査中に発見した実装ミスとして7節・9節で扱う

---

## 1. Company Profileの全項目一覧

凡例: UI(site)=`(site)/profile`、UI(WS)=`WorkspaceProfileForm`、DB=`workspace_company_profiles`または`workspace_companies`。
「Engine参照」は診断エンジン(`diagnosis.ts`)・Rule Engine(`ruleEngine.ts`)・`applyCompanyProfileToProcedures`・
`buildAnnualRoadmap`のいずれかで**Procedureの表示可否・期限計算に使われるか**を指す（表示専用の转記は含めない）。

| # | フィールド | UI(site) | UI(WS) | DB保存 | Engine参照（判定） | Roadmap影響 | Decision/Notification影響 | 備考 |
|---|---|---|---|---|---|---|---|---|
| 1 | `prefectureCode` | ✓ | 作成時のみ（編集UI無し） | ✓(companies) | ✗ | ✗ | ✗ | `runDiagnosis`は`input.prefectureCode`を一度も参照しない（`diagnosis.ts`192-260行）。市区町村プルダウンの絞り込み・表示ラベル用途のみ |
| 2 | `prefectureName` | ✓ | 表示のみ | ✓ | ✗ | ✗ | ✗ | 表示専用（Excel/PDF/Share、`formatCompanyAddress`経由） |
| 3 | `municipalityCode` | ✓ | 作成時のみ（編集UI無し） | ✓(companies) | **✓** | ✓ | ✓（間接） | 提出先判定の唯一の判定キー（`resolveOffices`、`diagnosis.ts`144-188行） |
| 4 | `municipalityName` | ✓ | 表示のみ | ✓ | ✗ | ✗ | ✗ | 表示専用 |
| 5 | `corporateType` | ✓ | ✓ | ✓(companies) | **✓** | ✓ | ✗ | `procedures.corporate_type`フィルタ（`diagnosis.ts`237行）、Rule Engine条件、`nextOfficerChangeDate`ガード（`roadmap.ts`160行） |
| 6 | `nextOfficerChangeDate` | ✓(kabushiki限定) | ✓(kabushiki限定) | ✓ | **✓** | ✓ | ✗ | Sprint55/56で接続済み。`LEGAL_OFFICER_CHANGE`の起算日 |
| 7 | `address` | ✓ | ✓ | ✓ | ✗（意図的） | ✗ | ✗ | Sprint56で追加。表示専用と明記済み |
| 8 | `employeeCount` | ✓ | ✓ | ✓ | **✓**（`hasEmployees()`のbool化のみ） | ✓ | ✗ | 実数（10人未満等の閾値）は一切使われない。4節・5節参照 |
| 9 | `capital` | ✓ | ✓ | ✓ | **✓** | ✓（間接、`consumptionTaxStatus`経由） | ✗ | `deriveConsumptionTaxStatus`（1,000万円以上で課税事業者）。`buildProfileRuleContext`にも含むが3節参照 |
| 10 | `establishedDate` | ✓ | ✓ | ✓ | **✓** | ✓ | ✓（間接） | `deriveStage`、Timeline唯一の起点（`buildCompanyTimelineEvents`） |
| 11 | `fiscalMonth` | ✓ | ✓ | ✓(companies) | **✓** | ✓（ゲート） | ✓（間接） | `fiscalMonth === null`で`buildAnnualRoadmap`が空配列を返す（`roadmap.ts`143行） |
| 12 | `stage` | ✓(自動+手動) | ✓(手動選択のみ) | ✓ | **✓** | ✓ | ✗ | `ESTABLISHMENT_PROCEDURE_CODES`フィルタ、Confidence判定 |
| 13 | `consumptionTaxStatus` | ✓ | ✓ | ✓ | **✓** | ✓ | ✓（間接） | Rule Engine（`CONSUMPTION_TAX_RETURN`追加条件） |
| 14 | `invoiceRegistrationStatus` | ✓ | ✓ | ✓ | **✓** | ✓ | ✗ | Rule Engine（`CONSUMPTION_TAX_RETURN`追加条件の代替条件） |
| 15 | `taxationMethod` | ✓ | ✗ | ✓ | △（3節） | ✗ | ✗ | `buildProfileRuleContext`に含むが同関数は(site) `events.ts`専用でWorkspaceは未使用。ゲートするProcedureも存在しない |
| 16 | `corporateTaxInterimFiling` | ✓ | ✗ | ✓ | △（3節） | ✗ | ✓（一過性のみ） | ゲートするProcedureなし。`adviserScore.buildClosingUpdateSummary`のアドバイザリー文言にのみ使用 |
| 17 | `consumptionTaxInterimFrequency` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | ゲートするProcedureなし。表示・保存のみ |
| 18 | `withholdingTaxCycle` | ✓ | ✓ | ✓ | **✓** | ✓ | ✗ | `PERIODIC_CYCLE_OVERRIDES`（`WITHHOLDING_TAX_CODE`の期日パターン切替）。Rule Engine条件（`WITHHOLDING_SPECIAL_EXCEPTION`）は(site) eventsのみ到達（6節） |
| 19 | `localTaxCollectionMethod` | ✓ | ✗（既定値固定） | ✓ | **✓** | ✓ | ✗ | `RESIDENT_TAX_WITHHOLDING_CODE`の表示要否を左右。WorkspaceはUI無しのため常に既定値`special_collection`のまま（2節） |
| 20 | `residentTaxPaymentCycle` | ✓ | ✓ | ✓ | **✓** | ✓ | ✗ | `RESIDENT_TAX_WITHHOLDING_CODE`のフィルタ・期日パターン |
| 21 | `eTaxEnabled` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | **完全未使用**。参照0件（3節） |
| 22 | `eLTaxEnabled` | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | **完全未使用**。参照0件（3節） |
| 23 | `advisors`（4項目） | ✓(4項目) | △(taxAccountantのみ) | ✓ | ✗ | ✗ | ✗（AI Adviserのみ） | `taxAccountant`のみ`adviserScore.ts`の文言分岐に使用。残り3項目は保存されるが参照0件（3節） |

---

## 2. Engineが参照しているがWorkspace UIから入力できない項目

Sprint54で発見した`hasOfficerTerm`（→`nextOfficerChangeDate`）はSprint55/56で解消済み。
再監査の結果、**判定ロジックが実際に読む値でありながらWorkspace UIに入力欄が無い項目は1件**確認した。

### 2-1. `localTaxCollectionMethod`（住民税の徴収方法）

- **Engine参照箇所**: `applyCompanyProfileToProcedures`（`src/lib/companyProfile.ts`388行）が
  `p.code === RESIDENT_TAX_WITHHOLDING_CODE && profile.localTaxCollectionMethod !== 'special_collection'`
  の場合に「特別徴収税額の納付」をロードマップから除外する
- **Workspace UI**: `WorkspaceProfileForm.tsx`には入力欄が無い（13-20行のコメントで意図的除外と明記）。
  DBのデフォルト値は`special_collection`固定（`workspaceCompanyProfile.ts`60行）
- **実際の誤案内リスク**: 低〜中。日本の実務では従業員に給与を支払う法人は原則「特別徴収」が
  義務であり、`special_collection`固定は**多くの場合たまたま正しい**。ただし条件を満たして
  市区町村の承認を得て「普通徴収」を選択している少数の会社では、Workspaceでは永久に
  `special_collection`のまま表示せざるを得ず、住民税特別徴収の納付が誤って案内され続ける
- **評価**: A（4節「代理判定」の一種に近い。既定値が実務上の原則と一致するため、βでは許容可能）

### 2-2. 参考: `municipalityCode`/`prefectureCode`は「Workspace UIから変更できない」が対象外とした理由

`municipalityCode`はEngineの唯一の判定キーだが、これは「作成後に変更できない」であって
「入力する手段自体が無い」わけではない（`WorkspaceCompanyForm.tsx`で作成時に指定する）。
本店移転等で市区町村が変わるケースの再入力手段が無いのは事実だが、これは「Company Profileの
項目が足りない」ではなく「更新（Edit）UIが無い」という別種の問題のため、本節の対象外とし
7節・9節で扱う。

---

## 3. UI・DBには存在するがEngineが参照していない項目

「保存されるだけ」「表示専用」「将来用」「実装漏れ」を区別する。

| 項目 | 区分 | 根拠 |
|---|---|---|
| `address` | **表示専用（意図的）** | Sprint56で明示的にそう設計した。Excel/PDF/Share表示のみ |
| `prefectureCode`/`prefectureName`/`municipalityName` | **表示専用（意図的）** | 判定は`municipalityCode`のみで完結する設計（`docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md` 6節） |
| `taxationMethod` | **将来用寄りの実装漏れ** | `buildProfileRuleContext`に値は渡しているが、それを読む`rule_conditions.field='taxation_method'`が1件も存在しない（grep 0件）。関数のコメント（`ruleEngine.ts`14行）が「将来capitalやindustry_code等を追加しても...」と述べる想定した拡張余地の一つが埋まっていない状態 |
| `corporateTaxInterimFiling` | **アドバイザリー専用** | ゲートするProcedureが無い。`state.corporateTaxInterimFiling`として計算はされるが、消費先は`adviserScore.buildClosingUpdateSummary`の一過性メッセージのみ |
| `consumptionTaxInterimFrequency` | **実装漏れに近い保存専用** | ゲートするProcedureが無く、Stateにも計算されず、アドバイザリーにも使われない。値を入力しても何にも影響しない |
| `eTaxEnabled` / `eLTaxEnabled` | **完全未使用（実装漏れ）** | 参照0件。SUNBOOには「e-Tax開始届出」に相当するProcedure Master項目自体が存在せず、`roadmapSubmissionInfo.ts`の提出方法表示も`procedures.submission_method`/`e_filing_system_name`（Procedure側のマスタ値）のみから決まり、会社側の`eTaxEnabled`は一切参照しない |
| `advisors.laborConsultant`/`judicialScrivener`/`administrativeScrivener` | **実装漏れ** | `advisors.taxAccountant`だけが`adviserScore.ts`210-212行で使われ、残り3項目は保存・表示されるのみで参照するコードが無い |
| `applicable_industries`（procedures側） | **未使用インフラ（Procedure Master側）** | 管理画面（`ProcedureForm.tsx`）に入力欄・DB列があるが、実データ0件かつ`diagnosis.ts`は一切フィルタに使わない。`DiagnosisInput.industryCode`（`types.ts`168行「将来用」コメント付き）も全呼び出し元で常に`undefined`。CompanyProfileには対応するindustry系フィールド自体が無い |

**「実装漏れ」と判定した項目の共通点**: いずれも一度は意図（Rule Engineの拡張性、業種別出し分け、電子申告状況の活用）を持って作られた形跡があるが、対応するProcedure MasterデータまたはRule Engineの条件行が最後まで作られなかった、いわば「片側だけ実装された」状態。CompanyProfile側を直しても解決しない（6節参照）。

---

## 4. 現在の代理判定（Proxy Judgments）

| 代理判定 | 影響するProcedure | 誤案内の可能性 | 独立項目が必要か | β許容可否 |
|---|---|---|---|---|
| `employeeCount > 0` を「給与支払あり」として扱う（`hasEmployees()`、`diagnosis.ts`223-225行の`requires_employees`フィルタ） | `PAYROLL_OFFICE_OPEN`・`WITHHOLDING_TAX`・`SALARY_PAYMENT_REPORT`・`YEAR_END_ADJUSTMENT`・`RESIDENT_TAX_WITHHOLDING`（労務・地方税・税務にまたがる6件） | 低。「給与を1人にでも払っていれば対象」という判定は実務ともほぼ一致する。代表者のみの役員報酬がある会社を「従業員なし」と誤登録した場合のみ乖離しうるが、これは入力ミスの領域 | 不要 | **許容できる**。既に唯一の分岐点として機能しており、代替の独立項目を作る動機が薄い |
| `employeeCount > 0` を「社会保険・労働保険の加入対象」として扱う（`SOCIAL_INS_SANTEIKISO`・`LABOR_INS_ESTABLISH`・`LABOR_INS_RENEWAL`・`EMPLOY_INS_OFFICE`、いずれも`requires_employees=true`） | 社保4件・労務2件 | **中**。株式会社は代表者1名でも社会保険が原則強制適用（`employeeCount`が0でも役員報酬があれば対象）だが、CompanyProfileは「役員報酬の有無」を持たず`employeeCount`のみで判定するため、従業員ゼロ・役員報酬ありの1人社長株式会社は社保系Procedureが一件も表示されない可能性がある | 要検討（5節でA評価） | **βでは許容**。SUNBOOは「情報を見る」サービスであり社労士確認を促す注記が既にある前提。ただしSprint58以降の検討候補として明記すべき |
| `withholding_tax_cycle === 'unset'` のみで「源泉所得税の納期の特例申請」（`WITHHOLDING_SPECIAL_EXCEPTION`）を推奨する（Rule Engine、`migration_procedure_master_phase15_2.sql`280-283行） | `WITHHOLDING_SPECIAL_EXCEPTION`（(site) `events.ts`経由のみ、6節） | **高（実際の誤案内）**。この手続きは「常時使用する従業員が10人未満」の場合のみ選択できる制度（`target_note`にも明記）だが、Rule Engineの条件は`withholding_tax_cycle`のみで`employeeCount`を一切見ない。従業員10人以上・納期特例未設定の会社が`company_establishment`/`employee_hired`イベントを登録すると、**法的に選択できない手続きが誤って推奨される** | **必要**（`employeeCount < 10`をRule条件へ追加、またはPROCEDURE側の`target_note`をRule評価に反映する仕組みが必要） | **βでは許容しにくい**。実際に誤った手続きを推薦してしまう具体的なシナリオが存在するため、5節で優先度を検討する |
| `localTaxCollectionMethod`固定値`special_collection`をWorkspace全社に適用（2-1節） | `RESIDENT_TAX_WITHHOLDING` | 低〜中（2-1節参照） | 要検討 | **βでは許容**（既定値が実務上の原則と一致） |

---

## 5. 最低限必要な追加候補（S/A/B/除外評価）

| 候補 | 現状 | 評価 | 理由 |
|---|---|---|---|
| 給与支払の有無 | `employeeCount > 0`で完全に代替済み（4節） | **除外** | 独立フィールドを作っても判定は変わらない。現状で機能している |
| 常時使用する従業員数（正確な人数としての用途） | `employeeCount`は既存だが、閾値（10人未満等）判定には一度も使われていない | **A** | フィールド自体は既にある。使われていないのは「項目不足」ではなく「Rule Engine側の条件不足」（4節`WITHHOLDING_SPECIAL_EXCEPTION`の誤案内）。Company Profile側の追加は不要、Rule Engine側の修正が必要 |
| 社会保険加入状況 | 保持していない。`employeeCount>0`で代理判定（4節） | **A** | 1人代表者の株式会社（役員報酬あり・従業員ゼロ）で社保系Procedureが出ない可能性がある。ただし「加入状況」という結果ではなく「役員報酬の有無」という原因を追加する方が筋が良く、設計を要する。βでは現状維持が可能 |
| 労働保険加入状況 | 同上（`employeeCount>0`で代理判定） | **A** | 労働保険は従業員（役員は原則対象外）が1人でもいれば強制適用のため、社会保険よりも`employeeCount`との相関が強く、誤差は社会保険より小さい |
| 青色申告承認状況 | 保持していない。`BLUE_RETURN_APPROVAL`は`at_establishment`の一度きりの届出として存在するのみ | **除外** | 承認状況（結果）を持っても、どのProcedureの表示・期限も変えない。SUNBOOは記帳・申告方式の助言をしないスコープ外の情報 |
| 消費税課税区分 | 既存（`consumptionTaxStatus`） | 既存 | Rule Engineが直接参照する必須項目。追加不要 |
| インボイス登録状況 | 既存（`invoiceRegistrationStatus`） | 既存 | 同上 |
| e-Tax利用状況 | **既にフィールドが存在するが完全未使用**（3節） | **除外（現状）** | 「追加候補」ではなく「既存の死んだフィールド」。対応するProcedure（e-Tax開始届出等）がProcedure Masterに無いため、CompanyProfile側を直しても何も変わらない。Procedure Master側に投資しない限りS/A評価にはなり得ない |
| eLTAX利用状況 | 同上 | **除外（現状）** | 同上 |
| 源泉所得税納期区分 | 既存（`withholdingTaxCycle`） | 既存 | `PERIODIC_CYCLE_OVERRIDES`が参照する必須項目 |
| 住民税徴収方法 | 既存だが**Workspace UIから入力不可**（2-1節） | **A** | フィールドは既にある。必要なのはCompanyProfileへの追加ではなく、WorkspaceProfileFormへの入力欄追加（Sprint58の実装候補） |
| 住民税納期区分 | 既存（`residentTaxPaymentCycle`） | 既存 | `RESIDENT_TAX_WITHHOLDING_CODE`が参照する必須項目 |
| 次回役員変更予定日 | 既存（`nextOfficerChangeDate`、Sprint55/56で接続済み） | 既存（解消済み） | - |
| 本店所在地 | 既存（`address`、Sprint56で追加、表示専用） | 既存（解消済み） | - |
| 決算月 | 既存（`fiscalMonth`） | 既存 | 全期限計算の起点。追加不要 |
| 設立日 | 既存（`establishedDate`） | 既存 | Stage判定・Timeline唯一の起点。追加不要 |
| 資本金 | 既存（`capital`） | 既存 | 消費税特例判定に必須。追加不要 |
| 法人種別 | 既存（`corporateType`） | 既存 | 複数のProcedureフィルタの必須項目。追加不要 |

### 5節のまとめ

今回ユーザーが列挙した18候補のうち、**新規にCompanyProfileへ列を追加すべき候補は0件**だった。
理由は以下の2パターンに集約される。

1. **既にフィールドが存在し、DB・UIの一部にも入力欄がある**（住民税徴収方法等）→ 必要なのは
   Workspace UIへの入力欄追加（2節・7節）
2. **フィールドを追加しても判定は変わらない**（e-Tax利用状況、青色申告承認状況、給与支払の有無等）
   → Procedure Master側にそれを使うProcedureが存在しないか、既存の代理判定で十分に機能している

新たに検討が必要なのは、**役員報酬の有無**（社会保険加入状況の真の判定材料に近い）だが、
これは今回のユーザー提示候補には無く、実データに基づく確度も未検証のため、S/A評価はせず
「将来の調査候補」として9節に記載するに留める。

---

## 6. Procedure Master側の問題との切り分け

Company Profile不足ではなく、Procedure Master・Rule Engine配線・必要書類・提出先データ不足が
原因の問題を分離する。**入力項目を増やしても解決しない**。

| 問題 | 実体 | 根拠 |
|---|---|---|
| 本店移転の2手続き（`TAX_OFFICE_CHANGE_NOTICE`＝異動届出書、`LEGAL_HQ_RELOCATION`＝本店移転登記）が構造的に到達不可能 | Rule Engineの条件が`event_type_code='hq_relocation'`だが、`EventTypeCode`型（`types.ts`199行）は`'company_establishment'\|'employee_hired'\|'officer_change'`の3値のみで`hq_relocation`が存在しない。(site) `/events`にもWorkspaceにもこの値を発火させる経路が無い | `migration_procedure_master_phase15_2.sql`272-278行 vs `src/lib/types.ts`199行、`src/app/(site)/events/page.tsx`25行の`EVENT_ICON`定義 |
| 「源泉所得税の納期の特例申請」（`WITHHOLDING_SPECIAL_EXCEPTION`）がWorkspaceに一切表示されない | `include_in_diagnosis=false`のためRule Engine経由でしか追加されず、そのRuleは`event_type_code IN ('company_establishment','employee_hired')`にのみ条件を持つ。しかし`roadmap.ts`169-174行が組み立てる`RuleContext`は`event_type_code: 'fiscal_year_end'`固定のため、この手続きを追加するRuleが一度も評価されない | `roadmap.ts`169-174行、`migration_procedure_master_phase15_2.sql`280-283行 |
| `withholdingTaxCycle`のConfidenceバッジが常に「情報不足」 | `state.ts`のState Engineが値を明示的に`incomplete`固定で返す実装未了部分（`deriveWithholdingTaxCycleField`、197-199行）。CompanyProfileの値自体は正しく保存・判定に使われているが、確からしさ表示だけが追いついていない | `docs/BETA_BACKLOG.md` M-01（発見済み・Confirmed・Sprint未定） |
| 福岡県60市区町村の`municipal_tax`/`prefectural_tax`窓口データ欠落 | `jurisdictions`データが渋谷区分しか投入されていない。CompanyProfile側は正しく`municipalityCode`を保持・送信している | `docs/BETA_BACKLOG.md` M-02 |
| 必要書類ガイドが31手続き中13手続きにしか無い | `procedure_documents`のデータ投入不足。CompanyProfile・Engine判定ロジックとは無関係 | `docs/BETA_BACKLOG.md` L-05 |
| `applicable_industries`が機能しない | CompanyProfileに業種フィールドが無いことに加え、`diagnosis.ts`が業種フィルタのロジック自体を持たない（型・DB列だけ先行して存在する状態） | 3節 |

---

## 7. Profile UX（義務カテゴリ別の再編案）

現状、(site)/profileは①基本情報②会社ステージ③税務④源泉所得税・地方税⑤電子申告⑥顧問専門家の
6カードで構成されている（`(site)/profile/page.tsx`310-638行）。WorkspaceProfileFormはカード分けが
無く単一フォーム。ユーザー提示の分類案（基本情報／所在地／税務／給与・源泉・住民税／社会保険・
労働保険／登記）に沿って再編する場合の対応表:

| 新カテゴリ | 該当フィールド | 備考 |
|---|---|---|
| 基本情報 | `corporateType`・`employeeCount`・`capital`・`establishedDate`・`fiscalMonth`・`stage` | 現行①②の統合 |
| 所在地 | `prefectureCode/Name`・`municipalityCode/Name`・`address` | 現行①から分離。「判定に使う」（都道府県・市区町村）と「表示のみ」（address）が同じカードに混在しないよう、Sprint56のキャプション方針（判定/表示の別を明示）をカード単位でも踏襲する |
| 税務 | `consumptionTaxStatus`・`invoiceRegistrationStatus`・`taxationMethod`・`corporateTaxInterimFiling`・`consumptionTaxInterimFrequency` | 現行③のまま。ただし`taxationMethod`以下3項目は3節の通り「現在は判定に使われない」ため、その旨を明記する |
| 給与・源泉・住民税 | `withholdingTaxCycle`・`localTaxCollectionMethod`・`residentTaxPaymentCycle` | 現行④相当。`localTaxCollectionMethod`をWorkspaceにも追加する場合はこのカードに置く |
| 社会保険・労働保険 | （現状フィールド無し） | 4節・5節で述べた通り`employeeCount`のみで代理判定するため、新カードを作っても表示する独自フィールドが今は無い。将来「役員報酬の有無」等を追加する場合の置き場所として枠だけ用意する案はあるが、本Sprintでは提案に留める |
| 登記 | `nextOfficerChangeDate` | 現行①から分離。株式会社限定の表示条件は維持 |
| （分類外）電子申告・顧問専門家 | `eTaxEnabled`・`eLTaxEnabled`・`advisors` | 3節の通り義務判定に使われないため、上記6カテゴリのどこにも本質的には属さない。「参考情報」等、判定カテゴリとは別枠であることが分かる位置に残すか、Engineへの接続（3節の実装漏れ解消）とセットで扱うかは9節のSprint58検討事項とする |

### 7-1.「この情報を何の判定に使うか」表示方針

Sprint55（`nextOfficerChangeDate`）・Sprint56（`address`）で確立した「登記期限そのものではなく
効力発生日」「判定には使わない、表示のみ」というキャプション方式を、全フィールドに拡張する方針を
提案する。ただし1節の表で示した通り、フィールドごとに実際の役割が異なるため、キャプションの
文言パターンは最低3種類に分かれる。

1. **判定に使う**（例: 市区町村、`consumptionTaxStatus`）→「◯◯の判定に使用します」
2. **判定には使わない・表示専用**（例: `address`）→「表示にのみ使用します。判定には使用しません」
3. **現在は判定に使われていない**（例: `taxationMethod`）→ 誤解を避けるため、既存2パターンとは
   別に「現在は表示・記録のみで、手続きの判定には反映されません」という**正直な第三のパターン**が
   必要。これは他Sprintで前例が無い新しい文言パターンであり、Sprint58で表現を検討する

### 7-2. Sprint56の実装ミス（本調査で発見）

`WorkspaceProfileForm.tsx`153-157行の説明文「都道府県・市区町村は...変更する場合は会社一覧から
登録情報を編集してください」は、対応する編集画面が存在しないため**誤り**。`WorkspaceCompanyForm`
は`/admin/workspaces/new`（新規作成専用）でのみ使われており（grep確認）、作成後に`prefecture_code`/
`municipality_code`/`name`を編集する画面は現状無い。コード変更を伴うため本Sprintでは修正しないが、
Sprint58の最小範囲に含めるべき単純な文言修正として9節に記載する。

---

## 8. 未入力時の扱い

S/A評価項目（5節）について、非表示・情報不足・保守的表示・確認通知のいずれが適切かを整理する。
分からない情報を勝手に推測しない方針（VISION.md）を維持する前提。

| 項目 | 未入力時の現状の扱い | 適切な扱い | 理由 |
|---|---|---|---|
| `localTaxCollectionMethod`（Workspace） | 常に`special_collection`扱い（未入力状態が存在しない） | **保守的表示**を維持 | 2-1節の通り、既定値が実務上の原則と一致するため、非表示や確認通知に変える積極的理由が無い。ただし2節の通りUIが無いこと自体は将来のSprintで解消すべき |
| `residentTaxPaymentCycle === 'unknown'` | **非表示**（`applyCompanyProfileToProcedures`389行が明示的に除外） | 現状のまま | Sprint47レビューで「毎月10日の出現をconfidence='incomplete'付きで表示すると誤案内になる」という理由で非表示を選んだ既存判断（コメント366-371行）。本監査でも支持する |
| `withholdingTaxCycle === 'unset'` | **保守的表示**（`monthly_10th`の毎月パターンで表示、除外しない） | 現状のまま | 毎月納付が法定の原則（特例が無ければ全員この扱い）であるため、非表示にすると逆に「納付義務自体が無い」という誤解を招く。保守的表示が正しい |
| `employeeCount`（人数の閾値、`WITHHOLDING_SPECIAL_EXCEPTION`） | 現状は**閾値チェック無し**（4節の誤案内リスク） | **確認通知**または**Rule条件追加による非表示** | 「10人未満」という明確な法的要件があるため、要件を満たさない場合は積極的に除外する（保守的表示ではなく非表示）べき。次点で、除外までは難しい場合は「従業員10人以上の場合は対象外です」という注記の強調表示（`target_note`は既にあるが、Rule Engine経由の追加時は表示されない導線がある） |
| 社会保険・労働保険加入状況（5節A評価） | `employeeCount`のみで判定、役員報酬等は考慮しない | **情報不足**表示は現状導入していないが、將来独立フィールドを持つ場合は「未入力＝情報不足」（非表示にはしない。従業員がいる会社にとって社保・労働保険は義務であることが多いため、非表示より「確認が必要」と伝える方が安全） | 誤って除外する（非表示）と「対象外」という誤ったメッセージになりかねない。逆に保守的に「対象」と決め打ちするのも役員報酬の有無次第では誤りうる。したがって新設する場合は情報不足表示が最も安全 |

---

## まとめ

### 現在の判定漏れ

**確認された判定漏れは0件。** Sprint54で発見した`hasOfficerTerm`はSprint55/56で解消済み。
本監査で新たに発見した2-1節の`localTaxCollectionMethod`はWorkspace UIの欠落だが、既定値が
実務上の原則と一致するため「判定漏れ」（=誤って何も表示されない/常に不正確）ではなく
「精度の天井」（=非典型的なケースにのみ影響する）に分類する。

### 現在の誤案内リスク

**1件、実際に誤った手続きを推薦しうる経路を確認した。** 4節の`WITHHOLDING_SPECIAL_EXCEPTION`
（源泉所得税の納期の特例申請）が、常時使用する従業員数の要件（10人未満）を一切確認せずに
Rule Engine経由で推薦される。(site) `/events`（会社設立・従業員採用イベント登録）でのみ到達可能
（Workspaceでは6節の通りそもそも到達しない）。従業員10人以上の会社がイベント登録した場合に、
法的に選択できない手続きが案内される。

副次的に、7-2節で述べたSprint56のUI文言ミス（存在しない編集画面への案内）も「誤案内」の一種
として扱うべき（手続きの判定ではなくUI操作案内の誤りだが、経営者を誤った操作へ導く点は同じ）。

### S評価項目

**0件。** 5節の通り、CompanyProfileへ新規に追加すべき必須フィールドは無い。

### A評価項目

- 住民税徴収方法（`localTaxCollectionMethod`）のWorkspace UI追加（2-1節・5節）
- 常時使用する従業員数の閾値判定（`employeeCount`は既存、Rule Engine側の条件追加が必要。4節の誤案内解消と同一）
- 社会保険加入状況・労働保険加入状況（独立フィールドの要否は未確定。役員報酬の有無という前提調査が先）

### B評価項目

- なし（5節の通り、ユーザー提示候補はいずれもS/A/既存/除外のいずれかに収まった）

### 不要な項目（除外）

給与支払の有無、青色申告承認状況、e-Tax利用状況、eLTAX利用状況（後2者は「不要」ではなく
「既存だが対応するProcedureが無いため現状は無意味」という特殊な除外理由、3節参照）

### Profile UI再編案

7節の6カテゴリ案（基本情報／所在地／税務／給与・源泉・住民税／社会保険・労働保険／登記）を
採用しつつ、「判定に使う／表示専用／現在は未使用」の3パターンのキャプションを整備する。
社会保険・労働保険カテゴリは現時点で表示するフィールドが無く、箱だけ用意する形になる。

### Sprint58で実装する最小範囲（提案）

優先度順:

1. **`WITHHOLDING_SPECIAL_EXCEPTION`のRule条件に従業員数10人未満を追加**（誤案内の直接解消、Rule Engine側のみの変更でCompanyProfile変更不要）
2. **`WorkspaceProfileForm.tsx`の誤った説明文を修正**（7-2節、コード1行程度の文言修正）
3. **`localTaxCollectionMethod`のWorkspace UI追加**（2-1節、`residentTaxPaymentCycle`の表示条件と合わせて追加。新規DB列は不要、既存列の編集UIを追加するのみ）

上記3件はいずれも**新規DB列・migrationを伴わない**。社会保険・労働保険加入状況（A評価の残り）は
役員報酬の有無という前提の設計検討が必要なため、Sprint58ではなく別Sprintで扱うことを推奨する。

### migrationの要否

**無し。** 3件とも既存列・既存Rule Engineデータの修正で完結する。

### Engine変更の要否

**1件のみ、小規模な変更が必要。** `WITHHOLDING_SPECIAL_EXCEPTION`のRule条件（`rule_conditions`への
1行追加、`employeeCount`を評価するには`RuleContext`へ`employee_count`を渡す配線がRule Engine呼び出し元
（`events.ts`）に必要）。`applyCompanyProfileToProcedures`・`runDiagnosis`・`buildAnnualRoadmap`
本体のロジック変更は不要。

### β開始を止める問題か

**止めない。** 誤案内リスクは1件確認したが、影響範囲は「常時従業員10人以上の会社が(site)の
イベント登録機能を使った場合」に限定され、Workspace（正式系）には到達しない（6節）。
`localTaxCollectionMethod`の精度天井も非典型ケースに限定される。SUNBOOは「一般的な参考情報」
であり専門家確認を促す注記が既に全面的に敷かれているため、両者ともβ運用の中でフィードバックを
見ながら対応する運用リスクの範囲内と判断する。ただし4節の`WITHHOLDING_SPECIAL_EXCEPTION`は
実際に法的要件を満たさない手続きを名指しで推薦する具体的ケースのため、Sprint58での早期対応を推奨する。

---

## 参照ファイル一覧

| ファイル | 確認内容 |
|---|---|
| `src/lib/companyProfile.ts` | CompanyProfile型・PROFILE_DEFAULTS・`applyCompanyProfileToProcedures`・`buildProfileRuleContext`・`formatCompanyAddress` |
| `src/lib/types.ts` | `DiagnosisInput`・`Procedure`・`EventTypeCode`・`ProcedureResult` |
| `src/lib/diagnosis.ts` | `runDiagnosis`・`resolveOffices`・`calculateNextDeadline` |
| `src/lib/roadmap.ts` | `buildAnnualRoadmap`・`expandOccurrences`・`confidenceForProcedure` |
| `src/lib/ruleEngine.ts` | `evaluateRules`・`RuleContext` |
| `src/lib/state.ts` | `buildStateFromTimeline`・各`derive*Field` |
| `src/lib/workspaceTimelineProducer.ts` / `src/lib/timelineProducer.ts` | `buildWorkspaceTimelineEvents`・`buildCompanyTimelineEvents` |
| `src/lib/workspaceDecisions.ts` | `generateWorkspaceDecisions` |
| `src/lib/notificationEngine.ts` | `buildNotifications` |
| `src/lib/adviserScore.ts` | `buildAdviserComment`・`buildProfileAdvisories` |
| `src/lib/workspaceCompanyProfile.ts` | `WorkspaceCompanyProfileRow`・`workspaceRowsToCompanyProfile`・`companyProfileToWorkspaceUpdatePayload` |
| `src/app/(site)/profile/page.tsx` | (site) Profile UI全項目 |
| `src/app/admin/(protected)/workspaces/[id]/profile/WorkspaceProfileForm.tsx` | Workspace Profile UI全項目・除外コメント |
| `src/app/admin/(protected)/workspaces/WorkspaceCompanyForm.tsx` | 会社新規作成時のみの入力項目 |
| `supabase/schema.sql`・`supabase/migration_workspace_mvp.sql`・`supabase/migration_procedure_master_phase15_2.sql`・`supabase/migration_rule_engine.sql`・`supabase/migration_event_engine.sql` | `procedures`・`workspace_companies`・`workspace_company_profiles`・`rules`/`rule_conditions`・`event_types`のDDL・seedデータ |
| Supabase REST API（anonキー） | `procedures`全30件の実データ（`code`/`category`/`requires_employees`/`corporate_type`/`requires_officer_term`/`timing_type`/`include_in_diagnosis`）、`applicable_industries`非null件数（0件） |
| `docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md`（Sprint54） | 所在地・`municipality_code`唯一判定キーの既存結論 |
| `docs/BETA_BACKLOG.md`（Sprint49） | M-01（`withholdingTaxCycle`のConfidence未実装）・M-02（福岡県窓口データ欠落）・L-05（必要書類データ欠落） |
