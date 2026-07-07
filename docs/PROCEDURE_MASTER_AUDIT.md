# PROCEDURE_MASTER_AUDIT.md — Procedure Master 監査（Sprint 15 Phase15.1）

**ステータス: 監査完了。DB変更・マイグレーション・コード変更・画面変更は本Phaseでは一切行っていない。**
本ドキュメントは[ROADMAP.md](ROADMAP.md) v0.6「年間スケジュール」着手前の現状把握・不足洗い出しが目的。
実装はレビュー後、別Phaseで行う。

## 0. 監査方法

ドキュメント上の記載ではなく、本番Supabase（`anon`キー、SELECTのみ・書き込みなし）から実データを直接取得して監査した。

| 取得先 | 件数 |
|---|---|
| `procedures` | 20件（すべて`is_active = true`） |
| `organization_types` | 13件 |
| `event_types` | 3件 |
| `rules`（`rule_conditions`/`rule_actions`含む） | 10件 |
| `procedure_documents` | 33件 |

[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)（Sprint14）で設計した`CompanyProfile`の各フィールドは、
本監査でも「④CompanyProfile条件」列の語彙としてそのまま用いる。Sprint14 Phase14.2時点では`rules`テーブルに
これらのフィールドを条件に使うルールは1件も無い（Rule Contextへの受け渡し基盤のみ用意済み、実ルールは未投入）。

---

## 1. 現在登録されている全手続き一覧（20件）

| ID | code | 名称 | DB上のcategory | office_type | frequency | timing_type |
|---|---|---|---|---|---|---|
| 1 | CORP_ESTABLISH_TAX | 法人設立届出書 | `registration` | tax_office | one_time | at_establishment |
| 2 | BLUE_RETURN_APPROVAL | 青色申告承認申請書 | `tax` | tax_office | one_time | at_establishment |
| 3 | PAYROLL_OFFICE_OPEN | 給与支払事務所等の開設届 | `tax` | tax_office | one_time | at_establishment |
| 4 | SOCIAL_INS_NEW | 社会保険新規適用届 | `insurance` | pension_office | one_time | at_establishment |
| 5 | LABOR_INS_ESTABLISH | 労働保険成立届 | `labor` | labor_standards | one_time | at_establishment |
| 6 | EMPLOY_INS_OFFICE | 雇用保険適用事業所設置届 | `labor` | hello_work | one_time | at_establishment |
| 7 | WITHHOLDING_TAX | 源泉所得税の納付 | `tax` | tax_office | monthly | monthly_10th |
| 8 | SOCIAL_INS_SANTEIKISO | 算定基礎届（社会保険） | `insurance` | pension_office | annual | period |
| 9 | LABOR_INS_RENEWAL | 労働保険年度更新 | `labor` | labor_standards | annual | period |
| 10 | YEAR_END_ADJUSTMENT | 年末調整・法定調書合計表の提出 | `tax` | tax_office | annual | fixed_date |
| 41 | LEGAL_ESTABLISH_KK | 株式会社設立登記 | `legal` | legal_affairs_bureau | one_time | at_establishment |
| 42 | LEGAL_ESTABLISH_GODO | 合同会社設立登記 | `legal` | legal_affairs_bureau | one_time | at_establishment |
| 43 | LEGAL_OFFICER_CHANGE | 役員変更登記 | `legal` | legal_affairs_bureau | one_time | event_based |
| 44 | LEGAL_HQ_RELOCATION | 本店移転登記 | `legal` | legal_affairs_bureau | one_time | event_based |
| 45 | LEGAL_PURPOSE_CHANGE | 目的変更登記 | `legal` | legal_affairs_bureau | one_time | event_based |
| 46 | LEGAL_TRADE_NAME_CHANGE | 商号変更登記 | `legal` | legal_affairs_bureau | one_time | event_based |
| 47 | LEGAL_CAPITAL_INCREASE | 増資登記 | `legal` | legal_affairs_bureau | one_time | event_based |
| 48 | LEGAL_DISSOLUTION | 解散・清算登記 | `legal` | legal_affairs_bureau | one_time | event_based |
| 49 | LEGAL_CERT_REGISTRY | 登記事項証明書取得 | `legal` | legal_affairs_bureau | as_needed | event_based |
| 50 | LEGAL_CERT_SEAL | 法人印鑑証明書取得 | `legal` | legal_affairs_bureau | as_needed | event_based |

`organization_types`には13種のマスタが存在するが、実際に`procedures.office_type`から参照されているのは
`tax_office`・`pension_office`・`labor_standards`・`hello_work`・`legal_affairs_bureau`の**5種のみ**。
`prefectural_tax`・`municipal_tax`・`prefectural_office`・`municipal_office`・`health_center`・
`fire_department`・`chamber_of_commerce`・`other`の8種は、マスタは用意されているが**参照する手続きが1件も無い**
（＝地方税・その他行政手続きの空白地帯。詳細は3節）。

---

## 2. カテゴリ別整理

ご指定の5分類（税務・地方税・労務・法務・その他）で整理する。ただしDB上の`category`列は
`tax` / `labor` / `insurance` / `registration` / `legal` / `other`の6値で、ご指定の5分類と
1対1に対応しない箇所がある。差分は各節に明記した（3節・6節で扱いを判断事項として提示）。

### 税務（国税）— 5件

| code | 名称 | 備考 |
|---|---|---|
| CORP_ESTABLISH_TAX | 法人設立届出書 | **DB上は`category='registration'`。** 提出先は税務署で内容も税務届出そのもののため、実態は「税務」。過去の分類の名残とみられる（4節⑥参照） |
| BLUE_RETURN_APPROVAL | 青色申告承認申請書 | |
| PAYROLL_OFFICE_OPEN | 給与支払事務所等の開設届 | |
| WITHHOLDING_TAX | 源泉所得税の納付 | 毎月10日固定のみ。納期の特例（年2回）の計算分岐は未実装（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-3・⑦参照） |
| YEAR_END_ADJUSTMENT | 年末調整・法定調書合計表の提出 | |

### 地方税（都道府県税・市区町村税）— **0件（空白）**

現状、地方税に分類できる手続きが1件も登録されていない。`organization_types`に`prefectural_tax`
（都道府県税事務所）・`municipal_tax`（市区町村税務課）・`prefectural_office`（都道府県庁）・
`municipal_office`（市区町村役場）のマスタは用意済みだが、これらを`office_type`に持つ`procedures`行が無い。
本監査で発見した最大のギャップ（3節で詳述）。

### 労務 — 3件（＋社会保険2件は別立て）

| code | 名称 | 備考 |
|---|---|---|
| LABOR_INS_ESTABLISH | 労働保険成立届 | |
| EMPLOY_INS_OFFICE | 雇用保険適用事業所設置届 | |
| LABOR_INS_RENEWAL | 労働保険年度更新 | |

DB上`category='insurance'`（社会保険）の2件（`SOCIAL_INS_NEW`＝社会保険新規適用届、
`SOCIAL_INS_SANTEIKISO`＝算定基礎届）は、ご指定の5分類には無いカテゴリ。実務上は労務担当者が
労働保険と一体で扱うことが多いため、本監査では便宜上「労務」節に含めて記載するが、
**DB上のカテゴリ統合（`insurance`→`labor`）は本Phaseでは判断保留**とする（6節）。

### 法務 — 10件

株式会社/合同会社設立登記・役員変更登記・本店移転登記・目的変更登記・商号変更登記・増資登記・
解散清算登記・登記事項証明書取得・法人印鑑証明書取得。Sprint4.5時点で網羅的に整備済み（詳細1節参照）。

### その他 — 0件

`category='other'`の手続きは現状1件も無い。

---

## 3. 不足している手続きの洗い出し

実在する日本の法人向け行政手続きのうち、現在の20件でカバーされていないものを洗い出した。
優先度は「導入した場合の影響（該当する会社の割合・見落とした場合のリスクの大きさ）」で付けた。
すべて一般的な参考情報であり、実装時も既存の`caution_note`パターン（専門家確認を促す注記）を踏襲する前提。

### 🔴 優先度：高（ほぼ全ての法人に関係し、見落としリスクが大きい）

| 手続き | 分類 | 不足の理由 |
|---|---|---|
| 法人税・地方法人税の確定申告 | 税務 | **決算後2ヶ月以内**に税務署へ提出する、最も基本的な年次申告。現状の20件に存在しない |
| 消費税及び地方消費税の確定申告 | 税務 | 課税事業者（`CompanyProfile.consumptionTaxStatus === 'taxable'`）が対象。決算後2ヶ月以内。存在しない |
| 法人事業税・法人都道府県民税の申告 | 地方税 | 決算後2ヶ月以内、都道府県税事務所へ。地方税カテゴリが空白のため存在しない |
| 法人市区町村民税の申告 | 地方税 | 決算後2ヶ月以内、市区町村税務課へ（東京23区は都税事務所に一本化などの例外あり） |
| 事業開始等申告書（都道府県） | 地方税 | 会社設立時、都道府県税事務所へ提出。`CORP_ESTABLISH_TAX`（税務署向け）と混同されやすいが別の届出 |
| 法人設立・設置届出書（市区町村） | 地方税 | 同上、市区町村役場向け。自治体により要否・様式が異なる点は要注記 |
| 給与支払報告書 | 労務/地方税またがり | 翌年1月31日までに従業員の1月1日時点住所地市区町村へ。年末調整（`YEAR_END_ADJUSTMENT`）とセットで発生するが現状無い |
| 決算公告 | 法務 | 会社法上の義務（定時株主総会後遅滞なく実施）。**合同会社には無い義務**なので`corporate_type = 'kabushiki'`条件が必須。見落とされがちだが法令上の義務 |

### 🟡 優先度：中（該当する会社は多いが、条件次第で対象外になる）

| 手続き | 分類 | 不足の理由 |
|---|---|---|
| 消費税課税事業者選択届出書 | 税務 | 免税事業者が課税事業者を選ぶ場合の届出。適用したい課税期間の前日まで。`invoiceRegistrationStatus`との関連が深い |
| 適格請求書発行事業者の登録申請（インボイス登録） | 税務 | `CompanyProfile.invoiceRegistrationStatus`フィールドは既にあるが、対応する「登録申請手続き」自体が無い |
| 簡易課税制度選択届出書 | 税務 | `taxationMethod`フィールドに対応する届出手続きが無い |
| 源泉所得税の納期の特例の承認に関する申請書 | 税務 | `withholdingTaxCycle`フィールドに対応する「特例に切り替えるための届出」自体が無い（現状は納付手続きのみ存在） |
| 法人税の中間申告 | 税務 | `corporateTaxInterimFiling`フィールドに対応。2期目以降・前年実績超過が条件 |
| 消費税の中間申告 | 税務 | `consumptionTaxInterimFrequency`フィールドに対応。[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-3で年11回まで課題化済み（`timing_data`のスキーマ拡張が必要） |
| 特別徴収税額の納付 | 地方税 | 給与支払報告書提出後、市区町村から通知される住民税を毎月（または年2回）納付。`localTaxCollectionMethod`フィールドに対応 |
| 償却資産税の申告 | 地方税 | 毎年1月末、資産所在地の市区町村へ。対象資産の有無に依存するため、条件判定が難しい（要検討） |
| 36協定（時間外労働・休日労働に関する協定届） | 労務 | 時間外労働がある事業所は労働基準監督署への届出が必須。有効期間満了ごとの再届出（通常年1回）が発生する |
| 賞与支払届 | 労務 | 賞与支給日から5日以内、年金事務所へ。**イベント起点の新種別（賞与支給）が必要**（現状の`event_types`に無い） |

### 🟢 優先度：低（該当する会社が限定的、または汎用性の低い個別対応）

| 手続き | 分類 | 不足の理由 |
|---|---|---|
| 就業規則の届出 | 労務 | 常時10人以上雇用の事業所のみ対象。`employeeCount >= 10`という閾値条件が必要（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) ⑩「経営ロードマップ」で既に言及済みの構想と一致） |
| 支店設置・移転・廃止登記 | 法務 | 支店を持つ会社のみ対象。中小企業では該当率が低い |
| 代表者印の改印届 | 法務 | 発生頻度が非常に低い（代表者交代時のみ） |
| 各種業種別許認可（飲食店営業許可・古物商許可等） | その他 | 業種依存性が極めて高く、`industry_code`ベースの条件分岐が前提になる。Procedure Masterに載せるには業種マスタの整備が別途必要（本Phaseのスコープ外として明示） |

---

## 4. 各手続きの詳細一覧（提出先・イベント起点・会社ステージ・CompanyProfile条件・期限）

「イベント起点」は`event_types.code`（`company_establishment`/`employee_hired`/`officer_change`）または
「診断のみ」（`/start`の3〜5項目だけで判定、イベント不要）「年次自動」（毎年決まったタイミングで発生、
起点イベント不要）を指す。「会社ステージ」は[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)の
`CompanyStage`（`pre_establishment`/`first_term`/`second_term_or_later`）に合わせた。

### 4-a. 既存20件

| 手続き | 提出先 | イベント起点 | 会社ステージ | CompanyProfile条件 | 期限 |
|---|---|---|---|---|---|
| 法人設立届出書 | 税務署 | company_establishment | pre_establishment→first_term | なし（診断のみ） | 設立から2ヶ月以内 |
| 青色申告承認申請書 | 税務署 | company_establishment | first_term | なし | 設立から3ヶ月or最初の事業年度終了日前日の早い方 |
| 給与支払事務所等の開設届 | 税務署 | company_establishment | first_term | employeeCount > 0 | 開設から1ヶ月以内 |
| 社会保険新規適用届 | 年金事務所 | company_establishment | first_term | なし | 設立後5日以内 |
| 労働保険成立届 | 労働基準監督署 | employee_hired | first_term〜 | employeeCount > 0 | 保険関係成立の翌日から10日以内 |
| 雇用保険適用事業所設置届 | ハローワーク | employee_hired | first_term〜 | employeeCount > 0 | 設置後10日以内 |
| 源泉所得税の納付 | 税務署 | 診断のみ（年次自動・毎月） | 全期間 | employeeCount > 0。**現状`withholdingTaxCycle`未接続**（特例の場合の1/20・7/10計算は3節⑦参照） | 毎月10日 |
| 算定基礎届（社会保険） | 年金事務所 | 診断のみ（年次自動） | 全期間 | employeeCount > 0 | 毎年7/1〜7/10 |
| 労働保険年度更新 | 労働基準監督署 | 診断のみ（年次自動） | 全期間 | employeeCount > 0 | 毎年6/1〜7/10 |
| 年末調整・法定調書合計表の提出 | 税務署 | 診断のみ（年次自動） | 全期間 | employeeCount > 0 | 毎年1/31 |
| 株式会社設立登記 | 法務局 | company_establishment | pre_establishment→first_term | corporateType = 'kabushiki' | 出資履行完了日から2週間以内 |
| 合同会社設立登記 | 法務局 | company_establishment | pre_establishment→first_term | corporateType = 'godo' | 出資履行完了日から2週間以内 |
| 役員変更登記 | 法務局 | officer_change | first_term〜 | corporateType = 'kabushiki'（役員任期の定めがある場合） | 変更日から2週間以内 |
| 本店移転登記 | 法務局 | （イベント種別なし。診断・イベント両方から未参照＝`include_in_diagnosis=false`） | 全期間 | なし | 効力発生日から2週間以内 |
| 目的変更登記 | 法務局 | 同上 | 全期間 | なし | 定款変更決議の効力発生日から2週間以内 |
| 商号変更登記 | 法務局 | 同上 | 全期間 | なし | 同上 |
| 増資登記 | 法務局 | 同上 | 全期間 | capital変更時（現状はcapitalの変更検知の仕組みが無い） | 払込期日から2週間以内 |
| 解散・清算登記 | 法務局 | 同上 | 全期間 | なし | 解散事由発生日または清算結了から2週間以内 |
| 登記事項証明書取得 | 法務局 | 同上（随時） | 全期間 | なし | 随時 |
| 法人印鑑証明書取得 | 法務局 | 同上（随時） | 全期間 | なし | 随時 |

### 4-b. 追加候補（3節の洗い出し分）

| 手続き（優先度） | 提出先 | イベント起点 | 会社ステージ | CompanyProfile条件 | 期限 |
|---|---|---|---|---|---|
| 法人税・地方法人税の確定申告（高） | 税務署 | 診断のみ（年次自動、決算月起点） | first_term〜 | なし（全法人共通） | 決算日の翌日から2ヶ月以内 |
| 消費税及び地方消費税の確定申告（高） | 税務署 | 診断のみ（年次自動） | first_term〜 | consumptionTaxStatus = 'taxable' | 決算日の翌日から2ヶ月以内 |
| 法人事業税・法人都道府県民税の申告（高） | 都道府県税事務所 | 診断のみ（年次自動） | first_term〜 | なし | 決算日の翌日から2ヶ月以内 |
| 法人市区町村民税の申告（高） | 市区町村税務課 | 診断のみ（年次自動） | first_term〜 | なし（東京23区等は例外あり、要注記） | 決算日の翌日から2ヶ月以内 |
| 事業開始等申告書・都道府県（高） | 都道府県税事務所 | company_establishment | pre_establishment→first_term | なし | 自治体により設立後15日〜1ヶ月以内 |
| 法人設立・設置届出書・市区町村（高） | 市区町村役場 | company_establishment | pre_establishment→first_term | なし | 自治体により設立後1ヶ月前後（要個別確認の注記必須） |
| 給与支払報告書（高） | 市区町村役場 | 診断のみ（年次自動、年末調整と同時） | first_term〜 | employeeCount > 0 | 翌年1/31 |
| 決算公告（高） | 官報／日刊紙／電子公告（提出先という概念に馴染まないため`office_type='other'`または新設が必要） | 診断のみ（年次自動） | first_term〜 | corporateType = 'kabushiki'（合同会社は対象外） | 定時株主総会後、遅滞なく |
| 消費税課税事業者選択届出書（中） | 税務署 | 診断のみ | first_term〜 | consumptionTaxStatus = 'exempt'（切替検討） | 適用したい課税期間開始日の前日まで |
| 適格請求書発行事業者の登録申請（中） | 税務署 | 診断のみ | 全期間 | invoiceRegistrationStatus = 'not_registered' | 随時（登録希望日の15日前まで） |
| 簡易課税制度選択届出書（中） | 税務署 | 診断のみ | first_term〜 | consumptionTaxStatus = 'taxable' かつ taxationMethod未確定 | 適用したい課税期間開始日の前日まで |
| 源泉所得税の納期の特例の承認に関する申請書（中） | 税務署 | 診断のみ | 全期間 | withholdingTaxCycle = 'unset' かつ employeeCount > 0 | 随時（提出の翌々月納付分から適用） |
| 法人税の中間申告（中） | 税務署 | 診断のみ（年次自動） | second_term_or_later | corporateTaxInterimFiling = 'has' | 事業年度開始から6ヶ月経過日から2ヶ月以内 |
| 消費税の中間申告（中） | 税務署 | 診断のみ（年次自動、回数に応じ複数期日） | second_term_or_later | consumptionTaxInterimFrequency ∈ {'1','3','11'} | 回数により複数（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-3の課題） |
| 特別徴収税額の納付（中） | 市区町村役場 | 診断のみ（年次自動・毎月） | first_term〜 | localTaxCollectionMethod = 'special_collection' | 毎月10日（特例は年2回） |
| 償却資産税の申告（中） | 市区町村役場 | 診断のみ（年次自動） | first_term〜 | 対象資産の有無（現状のCompanyProfileに該当フィールド無し、要追加検討） | 毎年1/31 |
| 36協定の届出（中） | 労働基準監督署 | 診断のみ（年次自動・更新制） | first_term〜 | employeeCount > 0 かつ 時間外労働の有無（要フィールド追加） | 有効期間満了ごと（通常年1回） |
| 賞与支払届（中） | 年金事務所 | **新イベント種別が必要（bonus_payment）** | first_term〜 | employeeCount > 0 | 支給日から5日以内 |
| 就業規則の届出（低） | 労働基準監督署 | 診断のみ | first_term〜 | employeeCount >= 10 | 常時10人以上使用に至った場合、遅滞なく |
| 支店設置・移転・廃止登記（低） | 法務局 | 新イベント種別候補（branch_change） | first_term〜 | なし | 変更日から2週間以内（本店・支店所在地で異なる） |
| 代表者印の改印届（低） | 法務局 | officer_change（代表者変更時） | first_term〜 | なし | 随時 |

---

## 5. Roadmapへの反映順序（設計）

[ROADMAP.md](ROADMAP.md)のv0.6「年間スケジュール」は、繰り返し発生する手続き（毎月・毎年）を
カレンダービューとして提示する構想だが、**現状の20件には年次の税務申告（法人税・消費税・地方税）が
1件も無く**、カレンダーを作っても中身がスカスカになる。そのため、Procedure Master拡充を
v0.6の前提作業として位置づけ、`v0.5.5`として割り込ませる設計とした（詳細は本ファイル末尾の
ROADMAP.md差分案を参照）。

拡充作業自体は影響範囲・リスクが異なるため、以下の順で段階的に行うことを提案する。

1. **Phase15.2（最優先）**: 決算後に必須となる4大申告＋地方税の届出を追加
   - 法人税・地方法人税の確定申告／消費税及び地方消費税の確定申告／法人事業税・法人都道府県民税の申告／
     法人市区町村民税の申告
   - `category='地方税'`をDBに新設するか、既存`tax`に統合するかの判断が必要（6節①）。ここで初めて
     「都道府県税事務所」「市区町村税務課」という`office_type`が実際に使われることになるため、
     `jurisdictions`側の対応関係（現状は法務局・税務署・年金事務所・労基署・ハローワークの5種のみ投入）
     も合わせて整備が必要になる
2. **Phase15.3**: 会社設立時の地方税届出＋給与支払報告書
   - 事業開始等申告書（都道府県・市区町村）／給与支払報告書／特別徴収税額の納付
   - 自治体ごとに様式・期限が異なる点の注記方針（既存`caution_note`パターンの踏襲）を決める
3. **Phase15.4**: 会社法上の見落とされがちな義務
   - 決算公告（`corporate_type='kabushiki'`限定）。「提出先」が行政機関ではなく官報・電子公告になる
     初めてのケースのため、`office_type`の扱い（新設 or NULL許容）を設計する必要がある
4. **Phase15.5**: CompanyProfile（Phase14.2）で用意済みのフィールドを実際に使う届出群
   - インボイス登録／簡易課税・課税事業者選択の各届出書／源泉所得税の納期の特例の届出
   - これらはPhase14.2で作った`buildProfileRuleContext`のフィールドを、初めて`rules`テーブルの
     実データとして使う回になる（基盤は用意済み、ルール投入と対象手続きの追加のみで完結する見込み）
5. **Phase15.6**: 従業員数閾値・新イベント種別が絡むもの
   - 36協定／就業規則の届出（`employeeCount`閾値）／賞与支払届（`bonus_payment`イベント新設）
   - `event_types`にイベントを追加する初のケースになるため、`/events`のUI・`registerCompanyEvent`双方への
     影響範囲確認が必要（実装時に既存フローとの整合を要検討）
6. **v0.6 年間スケジュール**: 上記で拡充した「毎月・毎年発生する手続き」を束ねたカレンダービューを設計・実装

低優先度の3件（就業規則以外の支店登記・改印届・業種別許認可）はv1.0以降の後続対応候補とし、
今回のRoadmap反映順序には含めない。

---

## 6. 未決事項・レビューが必要な点

実装着手前に、以下は方針を確定させる必要がある。

1. **地方税をDB上の新カテゴリ（`category`列にENUM値追加）にするか、既存`tax`に統合するか。**
   ご指定の5分類（税務・地方税・労務・法務・その他）に厳密に従うなら新カテゴリ追加が自然だが、
   `category`列がPostgreSQLのCHECK制約かENUM型かによって影響範囲が変わる（要確認）。
2. **DB上の`insurance`（社会保険）カテゴリを維持するか、`labor`に統合するか。**
   本監査ではご指定の5分類に合わせて便宜上「労務」節に含めたが、実データは独立したカテゴリのまま。
3. **`CORP_ESTABLISH_TAX`（法人設立届出書）の`category='registration'`は`'tax'`に是正すべきか。**
   実態は税務署への届出であり、現状の値は分類の一貫性を損なっている。
4. **給与支払報告書・特別徴収税額の納付は「労務」「地方税」のどちらの主カテゴリに属するか。**
   実務上は両方にまたがる（年末調整とセットで発生するが、提出先・性質は地方税）。
5. **決算公告の「提出先」をどう表現するか。**
   `office_type`は現状すべて行政機関を前提にした設計（`organization_types`経由）だが、決算公告は
   官報・日刊紙・電子公告のいずれかであり、既存の`resolveOffices`の枠組みに乗らない可能性がある。
6. **賞与支払届・36協定を追加する場合、新しい`event_types`（`bonus_payment`等）の追加が必要か、
   既存の「診断のみ（年次自動）」区分で足りるか。**
   賞与は発生タイミングが会社ごとに不定期なため、既存の3イベント種別（設立・採用・役員変更）とは
   性質が異なる。
7. **消費税の中間申告（年最大11回）の期日をどう表現するか。**
   [COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-3で既出の課題。`procedures.timing_data`の
   スキーマ拡張（複数日付配列）か、中間申告1回ごとに`procedures`行を複数用意するかの判断が必要。
8. **償却資産税・36協定の「対象資産の有無」「時間外労働の有無」は、CompanyProfileに新規フィールドが
   必要になる。** Phase14.2で設計した型に無い項目のため、追加要否を含め要判断。

---

## 付録: ROADMAP.md への追記案

本監査に合わせ、[ROADMAP.md](ROADMAP.md)へ以下を追記した（v0.5とv0.6の間、実装未着手のv0.5.5として追加）。

```markdown
## v0.5.5 Procedure Master拡充（監査完了・実装未着手）

**狙い**: v0.6「年間スケジュール」のカレンダービューが意味を持つためには、現状20件のProcedure Master
（年次の税務・地方税申告が0件）を拡充する必要がある。監査で判明した不足手続き・カテゴリ整理・
Roadmap反映順序は [PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)（Sprint15 Phase15.1）参照。

- 優先度「高」: 法人税・消費税・地方税（都道府県/市区町村）の決算後申告、事業開始等申告書、
  給与支払報告書、決算公告
- 優先度「中」: インボイス登録・簡易課税等の各種届出（Phase14.2 CompanyProfileの実利用）、
  中間申告、特別徴収、36協定、賞与支払届
- 要判断事項: `category`列への「地方税」追加是非、`insurance`カテゴリの扱い、決算公告の提出先表現、
  新規イベント種別（賞与支給等）の追加是非
```
