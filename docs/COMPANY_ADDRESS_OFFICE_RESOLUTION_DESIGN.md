# COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md — Company Address & Office Resolution 設計（Sprint54）

**ステータス: 調査・設計のみ。DB変更・マイグレーション・コード変更・Engine変更は本Sprintでは一切行っていない。**
実装はレビュー後、別Sprintで行う。

目的: CompanyProfileをSUNBOO全体の唯一の情報源（Single Source of Truth）として完成させ、国・地方自治体・
公的機関に対する義務を正確に判定できる基盤を作る。SUNBOOの思想（「経営者が国・地方自治体・公的機関に
対して最低限果たすべき義務を、迷わず・漏れなく・期限内に実行できるようにすること」）に沿い、
社内管理・顧客管理・ワークフロー目的の項目は対象外とする。

---

## 0. 前提として確認した既存事実

### 0-1. 会社の住所は「市区町村コード」でのみ保持されており、番地を含む住所文字列は一切存在しない

`workspace_companies`（`supabase/migration_workspace_mvp.sql` 36-45行）のスキーマ:

```sql
CREATE TABLE IF NOT EXISTS workspace_companies (
  id                SERIAL      PRIMARY KEY,
  name              TEXT        NOT NULL,
  prefecture_code   TEXT        NOT NULL,
  municipality_code TEXT        NOT NULL,
  corporate_type    TEXT        NOT NULL CHECK (corporate_type IN ('kabushiki', 'godo')),
  fiscal_month      INTEGER     CHECK (fiscal_month BETWEEN 1 AND 12),
  ...
);
```

住所に相当するのは`prefecture_code`・`municipality_code`のみ。番地・丁目・郵便番号のいずれも
保持していない。`CompanyProfile`型（`src/lib/companyProfile.ts` 44-78行）・
`workspace_company_profiles`（`supabase/migration_workspace_mvp.sql` 57-82行）にも住所文字列・
郵便番号は存在しない。`postal_code`という列名自体は存在するが、これは`organization_offices`
（**行政機関側**の郵便番号、`src/lib/types.ts` 35・68行）であり、**会社側の郵便番号ではない**。

### 0-2. `municipality_code`は住所からの逆引きではなく、都道府県→市区町村の連動プルダウンで直接選択されている

`src/app/admin/(protected)/workspaces/WorkspaceCompanyForm.tsx`（新規会社登録フォーム）を確認した。
都道府県を選ぶと`municipalities`テーブルから該当市区町村一覧を取得し（32-55行）、利用者が
**市区町村名を直接選ぶ**（171-186行）。ここで確定した`municipality_code`がそのまま
`workspace_companies.municipality_code`にINSERTされる（91-101行）。住所文字列・郵便番号を
経由した変換・逆引きの処理は一切存在しない。(site)側の`/start`・`/profile`も同じ
都道府県/市区町村プルダウン方式（`src/data/prefectures.ts`・`municipalities`テーブル参照）。

### 0-3. 住所（番地）が無くても動いている理由: 提出先解決が市区町村単位で完結する設計だから

`src/lib/diagnosis.ts`の`resolveOffices(client, municipalityId)`（121-165行）は、`jurisdictions`
テーブルを`municipality_id`のみで検索し、該当する`organization_office_id`を返す。日本の行政機関
（税務署・市区町村役場・年金事務所・労基署・ハローワーク・都道府県税事務所）の管轄は、実務上
**ほとんどの場合、市区町村単位で確定する**ため、番地までの情報が無くても管轄は決まる。加えて、
Phase1.5で`municipalities`マスタ自体が政令指定都市の区単位（例:「福岡市東区」）まで細分化されている
（`supabase/migration_organizations.sql` 119-139行）ため、区単位の粒度も既にカバーされている。

### 0-4. Rule Engineの評価コンテキストにも住所・郵便番号は使われていない

`src/lib/companyProfile.ts`の`buildProfileRuleContext()`（365-374行）が渡すキーは
`consumption_tax_status`・`invoice_registration_status`・`taxation_method`・
`withholding_tax_cycle`・`local_tax_collection_method`・`company_stage`・`capital`のみ。
`municipality_code`・住所関連の値はRule Engine側では一切参照されず、提出先解決は
`resolveOffices`という別経路（0-3節）で完結している。Dashboard・Notification・AI Adviser・
Decision Engineのいずれも、住所文字列・郵便番号を表示・参照していない（grep確認、0件）。
表示されているのは`prefectureName`・`municipalityName`という**市区町村名の文字列**のみ
（`src/app/admin/(protected)/workspaces/[id]/page.tsx` 120-127行、`src/app/share/[token]/page.tsx`）。

### 0-5. `hasOfficerTerm`（役員任期）はCompanyProfileから欠落しており、実際に判定漏れを起こしている

`src/lib/types.ts`の`DiagnosisInput`（170行）には`hasOfficerTerm?: boolean`が存在し、
`runDiagnosis`（`diagnosis.ts` 240行）は`requires_officer_term`が`true`の手続き
（`LEGAL_OFFICER_CHANGE`＝役員変更登記）をこの値で絞り込んでいる。しかし**`CompanyProfile`型
自体にはこのフィールドが存在せず**、`src/lib/roadmap.ts`（152行）は

```ts
hasOfficerTerm: false, // CompanyProfileは役員任期の有無を保持していないため保守的にfalse
```

と、コード内コメントで明示した上で**常に`false`を渡している**。つまり、株式会社で実際には
役員任期の定めがある会社であっても、Workspace（正式系）のAnnual Roadmapには**役員変更登記が
一度も表示されない**（(site)側の`/start`診断フローでは`hasOfficerTerm`を入力できるが、
Workspace側には対応する入力欄が無いため反映されない）。これは「入力すると便利」ではなく
**「入力しないと義務判定ができない」実例**として重要である（4節・S評価の根拠）。

### 0-6. 複数拠点（本店・事業所・支店）を表現する仕組みは存在しない

`workspace_companies`は1社1行で`(prefecture_code, municipality_code)`を1組しか持てない。
支店・事業所単位の住所を追加で保持するテーブル・列は存在しない。

---

## 1〜7. 必須回答事項への回答

### 1. 現在保持している住所情報

`prefecture_code`（都道府県コード）・`municipality_code`（市区町村コード、政令指定都市は区単位）
の2つのみ。番地・丁目・建物名・郵便番号は一切保持していない（0-1節）。

### 2. municipality_codeは現在どこから取得しているか

都道府県→市区町村の連動プルダウンでの**手動直接選択**（0-2節）。住所文字列・郵便番号からの
変換・逆引きは行っていない。

### 3. 住所が無くても現在動いている理由

提出先解決（`resolveOffices`）が市区町村コード単位で設計されており、日本の行政機関管轄が
実務上ほとんどの場合市区町村単位で確定するため（0-3節）。政令指定都市の区単位の粒度も
`municipalities`マスタで既にカバーされている。

### 4. 提出先判定で不足している情報

現行データで判明している**実際の判定漏れ**は`hasOfficerTerm`（0-5節）の1点。それ以外、
市区町村単位の判定自体は機能している。ただし、以下は**将来の精度上限として認識すべき既知の限界**
であり、今回のスコープ外として明記する。

- **一部の税務署は、同一市区町村内でも町名・丁目単位で管轄が分かれる場合がある**
  （国税庁の管轄地域指定は住所ベースであり、稀に同一市区町村が複数税務署に分割される）。
  現行の`municipality_code`単位の設計では、この分割には対応できない。番地までの住所を
  保持しても、町名・丁目と税務署管轄の対応表（国税庁が公開する住所索引）を別途保持しない限り
  精度は上がらない。大規模な追加データ整備を伴うため、本Sprintでは「既知の精度上限」として
  記録するに留める
- 複数拠点（0-6節）を持つ会社の事業所税・従業員個々の住所地（給与支払報告書の提出先は
  会社所在地ではなく**各従業員の1月1日時点の住所地市区町村**）は、現行モデル（会社1件=住所1件）
  では原理的に扱えない。これは住所欄を増やしても解決しない、別軸の設計課題（7節）

### 5. 郵便番号だけで自治体判定できるか

**技術的には可能だが、SUNBOOにとって採用する理由が無い。** 日本郵便の郵便番号は原則1つの
市区町村（まれに複数の町域にまたがる大口事業所個別番号を除く）に対応するため、日本郵便が
公開する郵便番号マスタ（KEN_ALL.CSV等）を保持すれば市区町村への変換は可能である。

ただし、SUNBOOは既に0-2節の通り**利用者が市区町村名を直接選択する方式で`municipality_code`を
確実に取得できている**。郵便番号経由の変換を挟むことは、(a)新たに全国13万件規模の郵便番号マスタの
保持・更新が必要になる、(b)郵便番号→市区町村の変換に失敗するケース（誤入力・稀な例外）への
エラーハンドリングが新たに必要になる、という**コストを追加するだけで、既に直接取得できている
`municipality_code`の精度を1ミリも上げない**。したがって郵便番号は義務判定の目的では**採用しない**
（6節候補評価でも同じ結論）。

### 6. 自治体コードを唯一の判定キーにできるか

**既にそうなっている。** `resolveOffices`は`municipality_id`のみを検索キーにしており
（0-3節）、都道府県税事務所（`prefectural_tax`）の解決も同じ`jurisdictions`テーブルを
`municipality_id`で引く形で行われている（`municipality_id`ごとに`prefectural_tax`の
`organization_office_id`が個別に登録されている。実データ上は同一都道府県内の全市区町村が
同じ都道府県税事務所IDを指すことが多いが、テーブル構造上は市区町村ごとに上書き可能）。
つまり`prefecture_code`は表示用ラベル（`prefectureName`）としての用途はあるが、**判定ロジック上は
`municipality_code`だけで完結している**。今回の調査で新たな判定キーを追加する必要は無いと判断する。

### 7. 将来、本店所在地・事業所所在地・支店を分離できる設計か

**現状は分離できない。** `workspace_companies`は1社1行、`(prefecture_code, municipality_code)`を
1組しか持てない構造であり、支店・複数事業所を表現する余地が無い（0-6節）。将来対応する場合は
`workspace_companies`に列を足すのではなく、`workspace_company_locations`のような別テーブルを新設し
（`company_id, location_type('headquarters'|'branch'|'office'), prefecture_code, municipality_code,
is_primary`等）、既存の`workspace_companies.prefecture_code/municipality_code`は「本店所在地の
現在値のキャッシュ」として残す形が既存設計との整合性が高い（`CLAUDE.md`の「新しい概念を追加する前に
既存のテーブル・関数で表現できないか検討する」を踏まえ、既存列は壊さず追加で表現する）。
本Sprintでは設計の方向性を示すに留め、実装は行わない（優先度は9節でB評価）。

---

## 8. 設計比較

| 評価軸 | 案A: 住所文字列だけ保持 | 案B: 住所＋自治体コード保持 | 案C: 住所＋自治体コード＋将来複数拠点対応 |
|---|---|---|---|
| **概要** | `workspace_companies`に`address`（TEXT）列を追加するのみ。`municipality_code`は使わない、または住所文字列から都度パースする | 現行の`municipality_code`方式を維持しつつ、表示・書類生成用に住所文字列（番地含む）を追加保持する | 案Bに加え、`workspace_company_locations`等で複数拠点を表現できる構造を用意する |
| **実装コスト** | 低（列追加のみ）に見えるが、住所文字列から`municipality_code`を都度パースする処理が新たに必要になり、実質的にはむしろ高い | 低。既存の`municipality_code`直接選択方式（0-2節）はそのまま、住所文字列は独立した表示専用フィールドとして追加するだけ | 中。新テーブル1つ・既存テーブルとの参照関係の設計が必要 |
| **保守性** | 住所文字列のフリーテキストからの市区町村抽出は表記ゆれ（「渋谷区」「東京都渋谷区」等）に弱く、誤判定のリスクを常に抱える | 判定は引き続き`municipality_code`（確定値）で行い、住所文字列は判定に関与しない表示専用値として分離されているため、判定ロジックの保守性は既存のまま | 案Bと同じ。新テーブルの追加によりJOINが1段増えるが、既存Engineへの影響は限定的 |
| **判定精度** | **既存より悪化しうる**（現行の直接選択方式より、フリーテキスト解析の方が誤判定リスクが高い） | 既存の精度をそのまま維持（`municipality_code`は直接選択のまま変更しない） | 同左。複数拠点固有の判定精度向上は将来の拡張がある場合のみ有効 |
| **拡張性** | 低。住所文字列だけでは複数拠点対応も「文字列を複数持つ」以上のことができず、種別（本店/支店）の区別も別途必要になる | 中。将来の複数拠点対応（案C）へは自然に接続できる | 高。本Sprintの目的（複数拠点の将来分離、7節）に直接応える |
| **Excel/PDF** | 住所文字列があれば表紙・書類欄に記載できるが、市区町村単位の判定とは無関係 | 同左。Sprint52のPDF表紙・Sprint51のExcelシートに「本店所在地」欄を追加できる（表示専用データとして`buildRoadmapExportRows`等に渡すだけで良く、Engine変更不要） | 同左。複数拠点対応後は「どの拠点の書類か」を明記する拡張ができる |
| **Notification** | 影響なし（Notification Centerは住所を参照しない、0-4節） | 影響なし | 影響なし（将来、拠点別の通知フィルタを検討する余地はあるが本Sprintのスコープ外） |
| **AI Adviser** | 影響なし | 影響なし | 影響なし |

### 推奨: 案B（住所文字列は表示専用として追加、判定キーは`municipality_code`のまま変更しない）

理由:

1. 5節・6節で確認した通り、**判定精度の観点では`municipality_code`の直接選択方式が既に最適**であり、
   住所文字列を判定に使う理由が無い（案Aは判定精度を悪化させるリスクすらある）
2. 一方で、Excel/PDF出力（Sprint51・52）の表紙・本文に「本店所在地」を記載したいという実務ニーズ
   （税理士が顧問先に渡す資料としての体裁）は正当であり、**判定とは独立した表示専用フィールド**として
   住所文字列を保持する価値はある
3. 案C（複数拠点対応）は7節で述べた通り将来必要になりうるが、**現時点でSUNBOOが複数拠点を持つ会社を
   想定した機能を何一つ持っていない**（給与支払報告書の従業員住所地問題等、拠点分離だけでは解決しない
   より大きな設計課題が別にある）ため、今この場で新テーブルを先行投資する優先度は低いと判断する
   （VISION.mdの「小さく作る」原則）

---

## 9. 追加提案: 義務判定の精度に必要な会社情報（S/A/B評価）

評価基準は「入力しないと義務判定ができない」ことのみ。便利機能・書類記入用途は評価対象に含めない
（B評価に分類し、実装優先度を明確に下げる）。

| 候補 | 現状 | 評価 | 理由 |
|---|---|---|---|
| **役員任期の有無**（`hasOfficerTerm`） | `CompanyProfile`に存在せず、Workspace Roadmapは常に`false`扱い（0-5節） | **S** | 実際に判定漏れが発生している唯一の確認済みケース。株式会社で役員任期の定めがある会社に、役員変更登記の案内が一度も出ない |
| 郵便番号 | 会社側は保持していない（0-1節） | **除外/B** | 5節の通り、既に`municipality_code`を直接取得できておりこれ以上の精度向上に寄与しない。書類の見栄え目的のみ |
| 本店所在地（番地を含む住所文字列） | 保持していない | **B** | 8節の通り判定には不要（`municipality_code`で完結）。Excel/PDF表紙の体裁向上という表示目的のみで、便利機能に該当する |
| 決算月 | 既存（`fiscalMonth`、`workspace_companies.fiscal_month`） | 既存 | 全ての期限計算の起点。既に必須項目 |
| 法人番号（13桁） | 保持していない | **除外/B** | どの手続きが必要か・期限・提出先のいずれも変えない。実際の書類記入時にのみ必要（SUNBOOは代理送信をしないため、この用途自体がスコープ外） |
| インボイス登録番号（T+13桁の番号そのもの） | ステータス（`invoiceRegistrationStatus`）のみ存在、番号自体は無し | **除外/B** | 登録の有無（ステータス）が消費税確定申告の要否等を判定する材料であり、既に保持済み。番号そのものは判定に使われない |
| 消費税課税区分 | 既存（`consumptionTaxStatus`） | 既存 | 消費税確定申告の要否を直接左右する。既に必須項目 |
| 電子申告利用有無（e-Tax/eLTAX） | 既存（`eTaxEnabled`/`eLTaxEnabled`） | 既存 | 提出方法の案内（Sprint50〜52の提出方法表示）に使用中 |
| 給与支払の有無 | 既存（`employeeCount > 0`から`hasEmployees()`で導出） | 既存 | 源泉所得税・給与支払報告書等の対象判定に使用中 |
| 従業員数 | 既存（`employeeCount`） | 既存 | 社会保険・労働保険関連の対象判定に使用中 |
| 社会保険加入状況 | 保持していない（`employeeCount > 0`で代理判定） | **A** | `SOCIAL_INS_NEW`（社会保険新規適用届）は`at_establishment`の一度きりの手続きとして既に管理されており、継続的な「加入状況」フラグが無くても現行の判定は成立している。ただし将来、加入除外事由（適用除外事業所等）が絡む手続きを追加する際には判定材料として必要になる可能性がある |
| 労働保険加入状況 | 保持していない（`employeeCount > 0`で代理判定） | **A** | 社会保険加入状況と同じ理由 |
| 資本金 | 既存（`capital`） | 既存 | 消費税課税事業者の特例判定（資本金1,000万円以上）に使用中（`deriveConsumptionTaxStatus`） |
| 設立年月日 | 既存（`establishedDate`） | 既存 | 会社ステージ（1期目/2期目以降）判定の起点。既に必須項目 |
| 代表者変更日 | 保持していない。加えてWorkspaceには経営イベント（役員変更等）をTimelineへ接続する経路自体が無い（`buildWorkspaceTimelineEvents`は会社設立・決算実績のみを扱う） | **B** | 単に日付フィールドを追加しても、Workspace側にイベント接続の仕組みが無いため意味を持たない。役員変更登記の判定自体は「役員任期の有無」（S評価）で対応でき、変更日そのものは判定に必須ではない（起算日が要るのは実際にイベント登録する場合のみ、これはEngine拡張を伴う別課題） |
| 役員任期（任期年数） | 保持していない | **B** | 「役員任期の有無」（S評価）とは別に、正確な任期年数（1年/2年/10年等）まで判定に使う手続きは現行Procedure Masterには無い。将来、任期満了時期の事前通知等を作る場合に必要になる候補 |
| 青色申告承認状況 | 保持していない（青色申告承認申請書は一度きりの手続きとしてのみ存在） | **除外/B** | どの手続きが必要か・期限・提出先のいずれも変えない。税務上の実務判断（欠損金の繰越控除等）に関わる情報だが、SUNBOOの「提出先・期限」判定の対象外 |

### S評価（今回のスコープに含めるべき）

- **役員任期の有無**（`hasOfficerTerm`）の1点のみ。これが本Sprintで確認された、実際に義務判定の
  精度を下げている唯一の確認済みギャップである

### A評価（できれば）

- 社会保険加入状況・労働保険加入状況。現行の`employeeCount`による代理判定で当面は成立するが、
  将来の精度向上余地として記録する

### B評価（将来・スコープ外）

- 本店所在地（番地を含む住所文字列）・郵便番号・法人番号・インボイス登録番号（番号そのもの）・
  代表者変更日・役員任期年数・青色申告承認状況・複数拠点対応（`workspace_company_locations`）

---

## 10. Engineへの影響整理

| 機能 | 影響 |
|---|---|
| `resolveOffices`・Rule Engine（提出先・条件判定） | 無変更。`municipality_code`が既に唯一の判定キーとして機能しており、変更の必要は無い（6節） |
| Annual Roadmap Engine | `hasOfficerTerm`をCompanyProfileに追加し、`roadmap.ts`のハードコード`false`（152行）を実際の値に差し替える変更が将来必要（S評価、Engineの小さな修正を伴う。本Sprintでは実施しない） |
| Excel/PDF出力 | 本店所在地を追加する場合（B評価、将来）、`buildRoadmapExportRows`等に表示専用データとして渡すだけで済み、判定ロジックへの影響は無い |
| Dashboard・Notification・Decision・AI Adviser | 無変更。住所・郵便番号を参照していない（0-4節） |

---

## まとめ

- **現在保持している住所情報**: `prefecture_code`・`municipality_code`のみ。番地・郵便番号は無い
- **`municipality_code`は住所からの逆引きではなく、都道府県→市区町村の連動プルダウンによる直接選択**
  で取得している。これが「住所が無くても動いている」理由そのものである
- **提出先判定で実際に不足している情報は`hasOfficerTerm`（役員任期の有無）の1点**。それ以外の
  市区町村単位の判定は既に機能しており、新たな判定キーの追加は不要
- **郵便番号は義務判定の精度向上に寄与しない**（既に`municipality_code`を直接取得できているため）。
  採用しない
- **自治体コード（`municipality_code`）は既に唯一の判定キーとして機能している**
- **本店・事業所・支店の分離は現状不可能**。将来対応する場合は新テーブル（`workspace_company_locations`）
  が既存設計との整合性が高いが、本Sprintでは方向性の提示に留める
- **推奨設計**: 案B（住所文字列は判定に使わず、表示専用フィールドとして将来追加する余地を残す）
- **S評価（今回スコープに含めるべき）**: 役員任期の有無（`hasOfficerTerm`）の1点のみ
- **A評価**: 社会保険・労働保険加入状況
- **B評価（将来）**: 本店所在地・郵便番号・法人番号・インボイス登録番号・代表者変更日・役員任期年数・
  青色申告承認状況・複数拠点対応
- **Engineへの影響**: 本Sprintでは無し。将来`hasOfficerTerm`を追加実装する際は`roadmap.ts`の
  ハードコード`false`を実値に差し替える小さな修正が必要（別Sprintで扱う）
