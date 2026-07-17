# PHASE3_FUKUOKA_DATA_EXPANSION_PLAN.md — 福岡県72判定単位 Data Expansion Plan

**ステータス: 計画のみ。データ投入・SQL実行・Migration作成は本ドキュメントでは一切行っていない。**
承認済みのNational Submission Directory基盤（Phase1設計・Phase2福岡パイロット・Phase2.6実DB検証）を、
福岡県全域へ拡張するための調査・投入計画を整理する。

---

## 0. 前提として確認した事実（実データに基づく。推測では書かない）

計画を立てる前に、既存のDB投入済みデータ（`supabase/migration_organizations.sql`）を実際に
プログラムで走査し、件数・カバレッジ・分割管轄の実例を確認した（目視・伝聞ではなく機械的カウント）。

### 0-1. 【訂正】「60」と「72」はどちらも正しい数値で、指している対象が異なる

前回、既存ドキュメント（`PROJECT_CONTEXT.md`・`DATABASE.md`・`BETA_BACKLOG.md`・
`NATIONAL_SUBMISSION_DIRECTORY.md`）の「福岡県60市区町村」という記載を「72が正しく60は誤り」と
判断して72へ一括訂正したが、**これは誤った訂正だった**。実際には以下の2つの異なる数値であり、
どちらも正しい。

- **福岡県の自治体数（60市町村）**: 福岡県が公式に持つ地方公共団体の数。北九州市・福岡市を
  それぞれ1自治体として数える（総務省の地方公共団体数の数え方と一致）
- **Resolverの管轄判定単位（72判定単位）**: SUNBOOの`municipalities`テーブルが実際に持つ行数。
  北九州市・福岡市は政令指定都市であり、税務署・年金事務所等の管轄が区ごとに異なるため、
  この2市は7区＋7区の計14行に分割して保持している（60自治体－2市＋14区＝72）

`migration_organizations.sql`の`municipalities`INSERT文をパースして得た「72行」（北九州市7区・
福岡市7区・27市・7郡41町村の合計）は**Resolverの判定単位として正しい**。一方「福岡県60市区町村」
という既存ドキュメントの記載も、**福岡県の自治体数としては正しい**。問題は「72」という数字自体では
なく、両ドキュメントとも「市区町村」という同じ単語で異なる2つの数値を指してしまい、読み手が
区別できなかったことにある。

以降、本ドキュメントおよび他の正本ドキュメントでは「福岡県の自治体数」を指す場合は**60市町村**、
Resolverのデータ投入・管轄件数を指す場合は**72判定単位**と表記し、「◯◯市区町村」という
曖昧な表記は使わない（用語の統一は[NATIONAL_SUBMISSION_DIRECTORY.md](NATIONAL_SUBMISSION_DIRECTORY.md)
「用語について」節を正本とする）。

### 0-2. Procedure Masterが実際に参照する`office_type`は7種類のみ

`procedures.office_type`の実際の値を全Migrationファイルから機械的に抽出したところ、
使用されているのは`tax_office` / `prefectural_tax` / `municipal_tax` / `pension_office` /
`labor_standards` / `hello_work` / `other`（1件のみ、決算公告など特定の窓口を持たない手続き）の
7値のみだった。`organization_types`には他に`municipal_office` / `prefectural_office` /
`health_center` / `fire_department` / `chamber_of_commerce`が定義されているが、**どの`procedures`
行からも参照されていない**。したがって本Phase3の投入対象は、要求いただいた7分類
（税務署・法務局・年金事務所・労働基準監督署・ハローワーク・都道府県税事務所・市区町村）で過不足なく、
「その他必要分類」に該当するものは無いと判断する。

### 0-3. 5分類は既にPhase1.5で調査済み・72/72判定単位分が旧スキーマに投入済み

`tax_office`（18窓口）・`legal_affairs_bureau`（2窓口）・`pension_office`（11窓口）・
`labor_standards`（12窓口）・`hello_work`（17窓口）は、いずれも**福岡県72判定単位全件を
既にカバーしている**（管轄区域配列を機械的に突合し、抜け・重複が無いことを確認済み）。
これはPhase1.5（`organizations`/`organization_offices`/`jurisdictions`、旧スキーマ）での
既存資産であり、**新規調査は不要**。Phase3での作業は「新スキーマ（`submission_offices`等）への
移植」に限定される（後述、Category A）。

### 0-4. 2分類（`prefectural_tax`・`municipal_tax`）は福岡県分が0件

`prefectural_tax`・`municipal_tax`は、旧スキーマ・新スキーマのいずれにも福岡県分のデータが
存在しない（東京都渋谷区分の1件ずつのみ）。これは[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02として
既に記録済みの既知ギャップである。この2分類は**新規調査が必須**（Category B）。

### 0-5. 既知の分割管轄は2件（うち1件は新スキーマへ移植済み、1件は未移植）

`migration_organizations.sql`内の実際の注記（`notes`列）を機械的に検索し、以下の2件を確認した。

| 分類 | 対象市区町村 | 主候補 | 代替候補 | 新スキーマへの移植状況 |
|---|---|---|---|---|
| `tax_office` | 福岡市東区（401315） | 香椎税務署 | 博多税務署 | **移植済み**（Phase2パイロットで投入・実DB検証済み） |
| `pension_office` | 福岡市東区(401315)・宗像市(402206)・古賀市(402231)・福津市(402249)・糟屋郡7町(403415/403423/403431/403440/403458/403482/403491)の**11市区町村** | 東福岡年金事務所 | 博多年金事務所 | **未移植**（Phase3で新規に構造化が必要。データ自体は既存） |

他の3分類（`legal_affairs_bureau`・`labor_standards`・`hello_work`）には分割管轄を示す注記は
見つからなかった（0件）。ただし`hello_work`には「戸畑区・若松区は求職者向け業務と事業主向け業務で
管轄施設が異なる」という注記があり、SUNBOOが扱う手続き（雇用保険適用等、事業主向け）については
単一の管轄で問題ないことを確認済み（1-5節で詳述）。

---

## 1. スコープ区分: Category A（移植のみ）とCategory B（新規調査必須）

| Category | 分類 | 状態 | Phase3での作業内容 |
|---|---|---|---|
| **A（移植）** | `legal_affairs_bureau` / `tax_office` / `pension_office` / `labor_standards` / `hello_work` | 72/72判定単位分が旧スキーマに調査済み | 旧スキーマ（`organizations`/`organization_offices`/`jurisdictions`）から新スキーマ（`submission_offices`/`submission_jurisdictions`/`office_sources`）へのデータ移植。新規の公式情報源調査は不要 |
| **B（新規調査）** | `prefectural_tax` / `municipal_tax` | 福岡県分0件 | 公式情報源からの新規調査・投入が必須 |

この区分は、前回の設計書（`NATIONAL_SUBMISSION_DIRECTORY.md` Version 1.1推奨実装順3〜5番）で
既に示していた方針「既存データの機械的移植→不足分の新規調査」を、実際のデータで裏付けたものである。

---

## 2. カテゴリ別詳細計画

### 2-1. `legal_affairs_bureau`（法務局）— Category A

| 項目 | 内容 |
|---|---|
| 公式情報源 | 法務局ホームページ（`houmukyoku.moj.go.jp/fukuoka/`、既存データの出典コメントに実URL記載済み） |
| 調査方法 | **不要**。移植のみ。`organization_offices`（`organization_type_id`=`legal_affairs_bureau`）と`jurisdictions`から`office_category`・住所・電話・URL・管轄市区町村を読み出し、新スキーマへ変換INSERTする専用SQLスクリプトを1本作成する |
| 市区町村との紐付け方法 | `scope_type='municipality'`、72件すべて1対1（本局管轄35市区町村相当・北九州支局管轄37市区町村相当、正確な内訳は移植スクリプト実行時にSELECTで再現） |
| 分割管轄の扱い | 既知の分割なし（0件）。移植後、旧スキーマとの管轄件数（72件）が一致することを確認するのみ |
| 一括投入形式 | 新規CSV不要。`INSERT INTO submission_offices ... SELECT ... FROM organization_offices JOIN organizations ...`のようなDB内SQL（3-1節） |
| 検証方法 | 移植後、`submission_offices`の該当カテゴリが2件・`submission_jurisdictions`が72件であることをSELECT COUNT(*)で確認。既存のPhase2パイロット同様、resolverでサンプル市区町村を1〜2件スポットチェック |
| 更新責任 | 未定（4節で全カテゴリ共通の課題として整理） |
| 推定件数 | **2窓口**（実データで確認済み、推測ではない） |
| 想定工数 | 0.5人日（移植スクリプト作成・検証） |

### 2-2. `tax_office`（税務署）— Category A

| 項目 | 内容 |
|---|---|
| 公式情報源 | 国税庁（`nta.go.jp/about/organization/fukuoka/location/fukuoka.htm`） |
| 調査方法 | **不要**。移植のみ。ただし分割管轄1件（福岡市東区）は既にPhase2パイロットで新スキーマへ投入済みのため、移植スクリプトは**この1件を除く71市区町村分**を対象とする |
| 市区町村との紐付け方法 | `scope_type='municipality'`、72件（うち1件は既存投入済み） |
| 分割管轄の扱い | 福岡市東区（401315）: 香椎税務署（主候補・移植済み）／博多税務署（代替候補・移植済み）。**この1件は再投入不要**、移植スクリプトのWHERE句で明示的に除外する |
| 一括投入形式 | DB内SQL（2-1と同形式） |
| 検証方法 | 移植後、`tax_office`カテゴリが18窓口・72管轄行（うち東区分は2行、他71件は各1行）であることを確認 |
| 更新責任 | 未定 |
| 推定件数 | **18窓口**（実データで確認済み） |
| 想定工数 | 0.5人日（東区分は完了済みのため、残り71市区町村分のみ） |

### 2-3. `pension_office`（年金事務所）— Category A（構造化作業を含む）

| 項目 | 内容 |
|---|---|
| 公式情報源 | 日本年金機構（`nenkin.go.jp/section/soudan/fukuoka/index.html`） |
| 調査方法 | **不要**（データ自体は既存）。ただし0-5節の通り、11市区町村にまたがる共同管轄が既存データの`notes`に自由記述で埋もれているため、Phase3で**初めて構造化**する必要がある（`is_primary=true`/`false`の複数行として明示的にモデル化） |
| 市区町村との紐付け方法 | `scope_type='municipality'`、72件のうち11件が分割管轄 |
| 分割管轄の扱い | 博多区（401323）は博多年金事務所の単独管轄（`is_primary=true`1行のみ）。福岡市東区・宗像市・古賀市・福津市・糟屋郡7町の11市区町村は東福岡年金事務所（`is_primary=true`）・博多年金事務所（`is_primary=false`）の2行構成。**どちらか一方に勝手に一意化しない**（要求仕様通り） |
| 一括投入形式 | DB内SQL。ただし11件の分割行は自動変換ロジックでは検出しにくいため、既存の`notes`文言を人力で読み、対象市区町村コードを明示的にリスト化してからスクリプトに組み込む |
| 検証方法 | 移植後、`pension_office`が11窓口・72+11=83管轄行（1市区町村1行が基本、分割11件のみ2行）であることを確認。resolverで博多区（単独）・東区（複数候補）それぞれをスポットチェックし、`multiple_candidates`が正しく11市区町村で発生することを確認 |
| 更新責任 | 未定 |
| 推定件数 | **11窓口** |
| 想定工数 | **1人日**（他のCategory Aより重い。分割管轄11件の構造化判断・検証に時間を要するため） |

### 2-4. `labor_standards`（労働基準監督署）— Category A

| 項目 | 内容 |
|---|---|
| 公式情報源 | 福岡労働局（`jsite.mhlw.go.jp/fukuoka-roudoukyoku/`） |
| 調査方法 | **不要**。移植のみ |
| 市区町村との紐付け方法 | `scope_type='municipality'`、72件1対1 |
| 分割管轄の扱い | 既知の分割なし（0件） |
| 一括投入形式 | DB内SQL |
| 検証方法 | 12窓口・72管轄行を確認 |
| 更新責任 | 未定 |
| 推定件数 | **12窓口** |
| 想定工数 | 0.5人日 |

### 2-5. `hello_work`（ハローワーク）— Category A

| 項目 | 内容 |
|---|---|
| 公式情報源 | 福岡労働局ハローワーク管轄一覧（`jsite.mhlw.go.jp/fukuoka-roudoukyoku/hw/kankatsu_shozaichi/kikan02.html`） |
| 調査方法 | **不要**。移植のみ |
| 市区町村との紐付け方法 | `scope_type='municipality'`、72件1対1（本所・出張所混在で17窓口） |
| 分割管轄の扱い | 既知の分割なし。ただし戸畑区・若松区は「求職者向け業務は別施設、事業主向け業務（雇用保険適用等）はハローワーク八幡が管轄」という注記あり。SUNBOOが扱う手続きはいずれも事業主向けのため、既存データの事業主向け管轄（ハローワーク八幡）をそのまま`is_primary=true`単独行として採用してよいと判断する（求職者向け施設は投入対象外）。この判断根拠を`submission_offices.notes`に明記して引き継ぐ |
| 一括投入形式 | DB内SQL |
| 検証方法 | 17窓口・72管轄行を確認 |
| 更新責任 | 未定 |
| 推定件数 | **17窓口** |
| 想定工数 | 0.5人日 |

### 2-6. `prefectural_tax`（都道府県税事務所）— Category B（新規調査必須）

| 項目 | 内容 |
|---|---|
| 公式情報源 | 福岡県庁の県税事務所一覧ページ（正確なURLは**未確認**。Phase3着手時に`pref.fukuoka.lg.jp`内で確認する） |
| 調査方法 | 福岡県庁公式サイトで県税事務所の一覧・管轄区域を確認し、名称・住所・電話・公式URLを転記する。**推測で件数や名称を先取りしない**（本ドキュメントでは件数を確定値として書かない、後述） |
| 市区町村との紐付け方法 | **未確認**。既存の東京都渋谷区データは`prefectural_tax`を市区町村単位で1件登録しているが、これが東京都全体でも1事務所に集約されているのか、複数事務所が地域分担しているのかは福岡県について未調査。調査時に判明した実際の管轄構造（`scope_type='prefecture'`1行に集約できるか、`scope_type='municipality'`の多対1マッピングになるか）に応じて投入方法を決める |
| 分割管轄の扱い | 未調査のため不明。調査時に町名・丁目単位の分割が無いことを含めて確認する |
| 一括投入形式 | 新規CSV（`submission_offices.csv`・`submission_jurisdictions.csv`・`office_sources.csv`、3節で詳述）→ staging table → merge SQL |
| 検証方法 | 福岡県庁公式ページに記載の管轄区域一覧と、投入した72判定単位の割り当てを1件ずつ突合する |
| 更新責任 | 未定 |
| 推定件数 | **未確認**。他都道府県の一般的な県税事務所数（数ヶ所〜10ヶ所程度）から類推される目安はあるが、これは調査前の参考情報に過ぎず、確定値として記載しない（推測データ禁止の要求に従う） |
| 想定工数 | **2〜3人日**（目安）。一覧ページの発見・住所電話URL転記・72判定単位への割り当て突合を含む。実件数が判明した時点で補正する |

### 2-7. `municipality`（市区町村・`municipal_tax`）— Category B（新規調査必須、最大規模）

| 項目 | 内容 |
|---|---|
| 公式情報源 | 各市区町村公式サイトの税務担当課ページ（72判定単位、個別） |
| 調査方法 | 1市区町村＝1ページの個別調査が基本。福岡県庁が市町村の連絡先一覧を集約したページを持っていないか先に確認し、あればそこを一次窓口として使う（無ければ72件個別に検索する） |
| 市区町村との紐付け方法 | `scope_type='municipality'`、原則72件が1対1（各市区町村が自身の税務窓口を持つため）。ただし一部事務組合等で複数町村が税務事務を共同処理しているケースがあれば個別確認が必要（**未確認**、他分類のような広域集約型の分割管轄とは異なるパターンの可能性がある） |
| 分割管轄の扱い | 構造上「1つの窓口が複数市区町村を管轄する」パターンではなく「1市区町村=1窓口」が基本のため、他分類のような分割管轄は発生しにくいと想定されるが、これも調査前の仮説であり確定ではない |
| 一括投入形式 | 新規CSV（72行規模のため表形式管理が必須）。既存の`supabase/import_templates/`＋staging table＋mergeSQLのパターンをそのまま踏襲する（3節） |
| 検証方法 | 72判定単位**全件**について「投入済み／未投入（理由付き）」のカバレッジ表を作成し、100%の説明責任を持たせる（4節で詳述） |
| 更新責任 | 未定 |
| 推定件数 | **上限72**（1市区町村1件と仮定した場合）。実件数は調査後に確定する |
| 想定工数 | 既存Phase1.5の類似規模調査（`tax_office`18件・`pension_office`11件等）にかかった実績時間の記録が残っていないため、正確な比例計算はできない。1市区町村あたり15〜30分（市区町村サイトでの税務課の住所・電話・URL確認のみ、広域機関のような管轄区域調査は不要なため他分類より単純作業）と**仮置き**した場合、72件で18〜36時間（2.5〜5人日）。**この見積り自体が未検証の仮定であり、実際に数件着手した時点で補正が必須**（⑥節でD12判断への活用方針として詳述） |

---

## 3. 一括投入形式（全国展開に再利用できる形にする）

新規調査が必要なCategory B（`prefectural_tax`・`municipal_tax`）向けに、既存の
[全国対応データ整備ガイド.md](全国対応データ整備ガイド.md)が確立した「CSV → staging table →
SQLで本番テーブルへmerge」というパターンをそのまま踏襲する（新しい投入基盤を発明しない）。
Category A（移植のみ）はCSVを経由せず、DB内SQLの`INSERT ... SELECT`で完結させる
（旧スキーマの値をそのまま流用でき、CSVに書き出す往復コストが無駄なため）。

### 3-1. Category A: 移植専用SQL（CSV不要）

```
organization_offices + jurisdictions（旧スキーマ、Category A 5分類分）
        │  INSERT ... SELECT（office_category ごとに1本、計5本のスクリプト）
        ▼
submission_offices / submission_jurisdictions / office_sources（新スキーマ）
```

`office_sources`の`source_url`/`publisher_name`等は、`migration_organizations.sql`内の
SQLコメントに実在する引用をそのまま構造化転記する（Phase2パイロットの4-5節で既に実施した手法と同一）。

### 3-2. Category B: CSV → staging → merge（新規調査分）

```
supabase/import_templates/
├── submission_offices.csv        ← 窓口本体（office_category, organization_name, name,
│                                     postal_code, address, phone, website_url, official_url,
│                                     map_url, fallback_url, update_frequency）
├── submission_jurisdictions.csv  ← 管轄（office_category, office_name, scope_type,
│                                     municipality_code, prefecture_code, is_primary, priority, notes）
└── office_sources.csv            ← 情報源（office_name, office_category, source_type,
                                      publisher_name, source_url, retrieved_at,
                                      verification_method, notes）
        │
        ▼  staging_submission_offices / staging_submission_jurisdictions / staging_office_sources
        │  （既存 staging_jurisdiction_offices と同じ「フラットな構造にいったん受ける」設計）
        ▼
submission_offices / submission_jurisdictions / office_sources（本番、ON CONFLICTで冪等マージ）
```

CSVの`municipality_code`は総務省の全国地方公共団体コード（既存の`municipalities.csv`と同じキー）を
使う。この形式は**都道府県が変わってもキーの意味が変わらない**ため、47都道府県への全国展開時も
同じCSVテンプレート・同じstaging/merge SQLをそのまま再利用できる（「全国展開に再利用できる投入形式」
という要求に対応）。

**本Phaseではこれらのファイル自体は作成しない**（計画のみ）。実際のCSVテンプレート・staging
テーブル定義・merge SQLの作成は、Phase3着手（データ投入開始）のタイミングで行う。

---

## 4. 未対応理由の記録（72判定単位×7分類のカバレッジマトリクス）

「60市区町村（実際は72）すべてについて未対応理由を含めて記録する」という要求に対応するため、
以下の形式のカバレッジトラッカーを設計する（**本Phaseでは設計のみ、実際の72行×7列＝504セルの
全件記入は投入作業時に行う**）。

### 4-1. トラッカーの形式

| カラム | 内容 |
|---|---|
| `municipality_code` | 総務省コード |
| `municipality_name` | 市区町村名 |
| `office_category` | 7分類のいずれか |
| `status` | `confirmed`（投入済み）／`not_yet_researched`（未調査）／`shared_jurisdiction`（他市区町村と共同管轄、代表行に統合済み）／`no_dedicated_office`（調査の結果、専用窓口が存在しないと判明） |
| `reason` | `status`が`confirmed`以外の場合の理由（自由記述） |
| `source_url` | `confirmed`の場合は必須 |
| `last_verified_at` | `confirmed`の場合は必須 |
| `submission_office_id` | 投入後の実際のID（未投入時はNULL） |

### 4-2. 現時点で判明している内容（サンプル、0節の事実に基づく）

| municipality_code | municipality_name | office_category | status | reason |
|---|---|---|---|---|
| 401331 | 福岡市中央区 | tax_office | confirmed | Phase2パイロットで投入済み |
| 401331 | 福岡市中央区 | prefectural_tax | not_yet_researched | Category B、福岡県庁公式ページ未確認 |
| 401331 | 福岡市中央区 | municipal_tax | not_yet_researched | Category B、福岡市中央区公式サイト未確認 |
| 401315 | 福岡市東区 | tax_office | confirmed | 分割管轄（香椎/博多）としてPhase2で投入済み |
| 401315 | 福岡市東区 | pension_office | shared_jurisdiction | データは既存だが新スキーマへの構造化がPhase3スコープ |

72判定単位×7分類の全件は、Phase3データ投入作業と並行してこの形式で埋めていく
（**投入が完了していない組み合わせも「なぜ未対応か」を必ず記録し、空欄のまま放置しない**という
要求仕様をこのトラッカーで担保する）。

---

## 5. 全体の工数見積もり集計

| Category | 分類 | 想定工数 |
|---|---|---|
| A | legal_affairs_bureau | 0.5人日 |
| A | tax_office | 0.5人日（東区分は完了済み） |
| A | pension_office | 1人日（分割管轄11件の構造化を含む） |
| A | labor_standards | 0.5人日 |
| A | hello_work | 0.5人日 |
| **A小計** | | **約3人日** |
| B | prefectural_tax | 2〜3人日（目安） |
| B | municipal_tax | 2.5〜5人日（目安） |
| **B小計** | | **4.5〜8人日（目安）** |
| **合計** | | **約7.5〜11人日** |

Category Bの数値は「未検証の仮定」に基づく目安であり、確定値ではない（要求仕様「推測データ禁止」に
従い、確定値であるかのように書かない）。Category A（約3人日）は既存データの移植が中心のため、
比較的確度の高い見積りである。

---

## 6. D12（全国展開データ調査体制）への推奨判断

前回の意思決定章でD12は「Phase2完了後の実績を待って再評価する」として保留した。今回のPhase3計画で
判明した以下の事実は、D12の再評価に使える一次情報になる。

1. **Category A（5分類・72判定単位）は新規調査コストがほぼゼロ**（Phase1.5の既存資産の移植のみ）。
   全国展開時も、同様に「都道府県ごとに既存の`jurisdiction_offices`的な資産があるか」を先に確認する
   価値がある
2. **Category Bのうち`municipal_tax`が最大のボトルネックになる可能性が高い**。福岡県だけで72件の
   個別市区町村調査が必要であり、全国展開（約1,700市区町村）では単純比例で福岡県の約24倍の
   調査量になる。一方`prefectural_tax`は広域機関（47都道府県で合計数百ヶ所程度と推定される、
   ただしこれも未確認）のため、相対的に負荷が小さい
3. **今回の工数見積り（Category B: 4.5〜8人日）自体がまだ実測値ではない**。D12の最終判断には、
   実際にPhase3のCategory B（特に`municipal_tax`）へ着手し、数件〜十数件を実際に調査した時点での
   実測時間が必要

### 推奨

- D12は**引き続き保留**とする。ただし保留の理由を「Phase2完了待ち」から「Phase3 Category B
  （`municipal_tax`）の実測待ち」へ更新する
- Phase3実行時、`municipal_tax`調査は最初の5〜10市区町村を計測用パイロットとして実施し、
  実際にかかった時間を記録した上で、残り市区町村分・全国展開分の見積りを補正する運用を推奨する
- 構造的な方向性としては、`municipal_tax`（全国約1,700件規模）とそれ以外の6分類
  （全国でも各都道府県数十〜100件規模）は性質が異なるため、全国展開時は**`municipal_tax`だけ
  別の調査体制（分担調査・半自動化等）を検討する価値がある**という示唆に留め、具体的な体制の
  決定はしない（実測データが無いまま断定しない、VISION.mdの原則）

---

## 未確認事項

1. ~~福岡県の市区町村数が「60」ではなく「72」である可能性~~ → **解消済み**（0-1節）。
   「60市町村」（自治体数）と「72判定単位」（Resolverの管轄判定単位）はどちらも正しく、
   指す対象が異なるだけだった。既存ドキュメントの「60市区町村」表記は誤りではなかったため、
   訂正は不要と判明した。用語の統一（「60市町村」/「72判定単位」の使い分け）は完了済み
2. `prefectural_tax`が福岡県で「1事務所に集約」か「複数事務所による地域分担」かは未調査
3. `municipal_tax`で一部事務組合等による共同処理があるかどうかは未調査
4. `hello_work`の戸畑区・若松区における「求職者向け／事業主向けで管轄施設が異なる」ケースについて、
   事業主向け管轄（ハローワーク八幡）のみを採用する判断でよいか、プロダクトオーナーの確認を推奨する
5. **更新責任（データの継続的な再検証を誰が担うか）が全カテゴリ共通で未定**。現状、`office_sources`
   の`verification_due_at`はデータとしては存在するが、それを監視・対応する運用ロール・ダッシュボードは
   Phase5以降の構想であり実装されていない。Phase3のデータ量が増える前に、最低限「誰が
   `/admin`から再検証作業を行うか」だけでも決めておくことを推奨する

---

## まとめ

- **7分類のうち5分類（tax_office/legal_affairs_bureau/pension_office/labor_standards/hello_work）は
  新規調査不要**。福岡県72判定単位分が既にPhase1.5で調査済みであり、Phase3の作業は新スキーマへの
  移植（約3人日）に限定される
- **2分類（prefectural_tax/municipal_tax）は新規調査が必須**。想定工数は4.5〜8人日（未検証の目安）
- 既知の分割管轄は2件（tax_office: 東区、pension_office: 東区+宗像市+古賀市+福津市+糟屋郡7町の
  11判定単位）。いずれも「複数候補を勝手に一意化しない」設計（`is_primary`/代替候補）で扱う
- **用語訂正**: 「福岡県60市区町村」は福岡県の自治体数（60市町村）として正しい記載であり、
  誤りではなかった。SUNBOOのResolverが用いる管轄判定単位（72判定単位、政令指定都市2市を区単位に
  分割）と混同していたのは前回のPhase3計画の側であり、既存ドキュメントを訂正する必要はない
  （0-1節で訂正済み）
- 投入形式は既存の`全国対応データ整備ガイド.md`のCSV→staging→mergeパターンをそのまま踏襲し、
  全国展開でも同じテンプレートを再利用できる設計とした
- D12（全国展開データ調査体制）は引き続き保留とし、Phase3の`municipal_tax`実測を待って再評価する
- 従業員住所依存手続き（給与支払報告書・特別徴収）は、`municipal_tax`データがどれだけ充実しても
  会社所在地では解決しない（`recipient_scope='each_employee'`のまま）ことを、Phase3着手者への
  申し送り事項として明記する
- レビュー待ちで停止する。
