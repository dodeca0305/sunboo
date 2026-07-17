# NATIONAL_SUBMISSION_DIRECTORY.md — 全国提出先マスター 設計（Version 1.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード変更・データ投入は本ドキュメントでは一切行っていない。**
Version 1.0（ブランド実装・リリース基盤・法務ドラフト）は凍結済み。実装はレビュー承認後、別Sprintで行う。

## 目的

会社プロフィール（所在地・法人種別・従業員有無等）から、手続きごとの提出先を

- 提出先（どの窓口か）
- 提出方法（郵送・窓口・電子申請）
- 電子申請先（e-Tax/eLTAX/登記オンライン等のURL）
- 管轄理由（なぜその窓口が管轄なのか、根拠を追跡可能にする）

まで自動判定できる基盤を設計する。単なる提出先一覧ではなく、**「あなたの会社なら、どこへ・いつ・
どう提出するか」を判定するエンジン**として設計する（[VISION.md](../VISION.md)「調べる時間をなくす」
「やるべきことが分かる」に対応）。将来的にPDF・年間ロードマップ・Shareページ・通知機能から
共通利用できる基盤であることを前提とする。

### 具体例（既存Phase 1.5データで実際に解決できることを確認済み）

```
会社所在地: 福岡県福岡市中央区（municipality_code = 401331）

  法人税確定申告        → 福岡税務署（tax_office）
  役員変更登記          → 福岡法務局（legal_affairs_bureau）
  社会保険（新規適用等） → 中福岡年金事務所（pension_office）
  労働保険（成立届等）  → 福岡中央労働基準監督署（labor_standards）
```

上記4件は`supabase/migration_organizations.sql`に投入済みの実データから導出できる組み合わせであり、
本設計が新たに作る判定エンジンが最終的に返すべき出力の具体イメージである（推測ではなく、既存データで
裏付けが取れている例）。

### 用語について:「60市町村」と「72判定単位」

本ドキュメント以降、福岡県に関する数値表現は以下の2つを区別する。

- **福岡県の自治体数（60市町村）**: 福岡県が公式に持つ地方公共団体の数。北九州市・福岡市を
  それぞれ1自治体として数える
- **Resolverの管轄判定単位（72判定単位）**: SUNBOOの`municipalities`テーブルが実際に持つ行数。
  北九州市・福岡市は政令指定都市であり、税務署・年金事務所等の管轄が区ごとに異なるため、
  この2市は7区＋7区の計14行に分割して保持している（60自治体－2市＋14区＝72）

「福岡県72市区町村」という表現は72自治体と誤読されるため、**Resolverのデータ投入・管轄件数を
指す場合は「72判定単位」と表記し、「72市区町村」という表記は使わない**。福岡県の自治体数そのものを
指す場合は「60市町村」と表記する。

---

## 0. 前提として確認した既存事実

新しい概念を追加する前に、既存のテーブル・関数で表現できないかを確認した（`CLAUDE.md`の開発フロー2番）。

### 0-1. 提出先解決の基盤はPhase 1.5で既に一度再設計されている

現行スキーマは`organization_types`（機関種別マスタ、13種）/ `organizations`（統括組織）/
`organization_offices`（物理窓口）/ `jurisdictions`（市区町村×機関種別→窓口の解決テーブル）/
`procedure_organizations`（procedures×organization_typesの中間テーブル、**未参照**）の5テーブル構成
（`supabase/migration_organizations.sql`）。`src/lib/diagnosis.ts`の`resolveOffices(client, municipalityId)`
が`jurisdictions`を起点に窓口情報をまとめて返す、診断エンジン・経営イベントエンジン共通の解決関数として
既に機能している（[DATABASE.md](DATABASE.md)・[ARCHITECTURE.md](ARCHITECTURE.md)）。

**結論**: 「提出先を判定する」という機能自体はゼロから作る必要がない。今回のNational Submission
Directoryは、この既存基盤を**全国スケール・監査可能性・判定の柔軟性**の3点で拡張する次のフェーズ
として位置づける（Phase 1.5→今回、は`jurisdiction_offices`→`organizations`系という前回の置き換えと
同じ性質の進化）。

### 0-2. 現行モデルの実際の限界は3点に整理できる（これが新設計の根拠）

1. **都道府県単位の窓口が市区町村単位でしか表現できない。** `jurisdictions`は
   `UNIQUE(municipality_id, organization_type_id)`で、都道府県税事務所（`prefectural_tax`）のような
   本来1都道府県=1窓口の関係も、市区町村の数だけ行を複製する必要がある。福岡県は72判定単位なら72行。
   47都道府県・約1,700市区町村規模に拡張すると、この複製は運用上のボトルネックになる
   （[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md) 6節で
   既に指摘されている実データ上の傾向）。
2. **1手続き=1提出先種別が固定（`procedures.office_type`は単一値）。** 会社プロフィールの条件によって
   提出先が変わるケースを表現する拡張ポイントとして`procedure_organizations`がPhase 1.5で用意されたが、
   現状**未参照**のまま。Rule Engineの`change_office`アクションは経営イベントエンジン専用で、条件は
   `event_type_code`等のイベントコンテキストに限定される（[RULE_ENGINE.md](RULE_ENGINE.md)）。
   診断エンジン・Roadmap双方から使える汎用的な条件分岐の仕組みが無い。
3. **「窓口の情報自体がいつ・何を根拠に正しいと確認されたか」を追跡する仕組みが無い。**
   `official_url_status`/`official_url_checked_at`は**URLの生存確認**のみを追跡する
   （[全国対応データ整備ガイド.md](全国対応データ整備ガイド.md) 3節）。住所・電話番号・管轄区域自体が
   最後にいつ・どの公式情報源で検証されたかは、`migration_organizations.sql`内のSQLコメント
   （例:「情報源: houmukyoku.moj.go.jp/fukuoka」）としてしか残っておらず、**構造化データではない**。
   全国展開でデータ量が増えるほど、この非構造化コメントでは監査・再検証の運用が破綻する。

### 0-3. `procedures` / `official_links` / `organization_types` は変更不要

`procedures`（手続き本体）・`procedure_documents`・`official_links`（手続き自体の公式リンク、全国共通）
は今回のスコープ外（提出先＝機関の設計であり、手続き内容の設計ではないため）。`organization_types`
（機関種別マスタ）も**そのまま流用**する（②節）。

### 0-4. 会社プロフィールの住所情報は「都道府県コード＋市区町村コード」のみで郵便番号は保持していない

`workspace_companies`（`supabase/migration_workspace_mvp.sql`）・`CompanyProfile`型
（`src/lib/companyProfile.ts`）のいずれも、住所は`prefecture_code`・`municipality_code`のみで、
番地・郵便番号は保持していない。この設計は
[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md)（Sprint54）
で既に検討済みで、「都道府県→市区町村の連動プルダウンによる直接選択」で`municipality_code`を
確実に取得できているため、郵便番号を経由した変換は**判定精度の向上に寄与しない**という結論が出ている
（同ドキュメント5節）。本設計における郵便番号の扱いは③-4節で詳述する（会社側の判定キーとしては
採用しないが、窓口側の表示情報としては引き続き保持する）。

---

## 1. 全体構成

```
organization_types（既存・変更なし。office_categoryのFK先として再利用）
        │
        ├─ submission_offices（新規・organizations+organization_officesの後継）
        │       │
        │       ├─ office_sources（新規・情報源／検証履歴／バージョン管理）
        │       └─ submission_jurisdictions（新規・jurisdictionsの後継、市区町村/都道府県/全国スコープ対応）
        │
        └─ procedure_submission_rules（新規・procedures.office_type固定値の条件分岐版）
                │
                └─ procedures（既存・変更なし。office_typeはデフォルト値として引き続き参照される）
```

**既存の`organizations` / `organization_offices` / `jurisdictions` / `procedure_organizations`は
削除・変更しない。** `CLAUDE.md`の「旧テーブルは新設計に置き換えた後も即座には削除しない」原則に従い、
(site)側の現行診断エンジン・`/offices`・既存admin CRUDはPhase 5でカットオーバーが完了するまで
引き続きこれらを参照し続ける（8節「既存アーキテクチャとの整合性」参照）。

---

## ① Database Design

### 1-1. `submission_offices`（提出先窓口。`organizations`+`organization_offices`の統合後継）

既存`organizations`（統括組織）と`organization_offices`（物理窓口）の2層構造は、実際のアプリコードが
「統括組織単位でのグルーピング表示」を一度も行っていない（grep確認、`organizations`テーブルへの
問い合わせは`organization_offices`とのJOINでしか発生しない）ため、1テーブルに統合する
（過剰な抽象化を避ける、`CLAUDE.md`コーディング規約）。組織名でまとめて見せたい場合のための
`organization_name`列は表示用に残す。

| カラム | 型 | 制約 | 役割 |
|---|---|---|---|
| `id` | SERIAL | **PK** | |
| `office_category` | TEXT | NOT NULL, **FK→`organization_types(code)`** | 提出先種別。既存マスタをそのまま参照 |
| `organization_name` | TEXT | NULL可 | 統括組織名（例:「福岡法務局」）。表示グルーピング専用、判定には使わない |
| `name` | TEXT | NOT NULL | 窓口名（例:「福岡法務局北九州支局」） |
| `postal_code` | TEXT | NULL可 | 窓口自身の郵便番号（表示用。会社側の判定キーではない） |
| `address` | TEXT | NULL可 | |
| `phone` | TEXT | NULL可 | |
| `fax` | TEXT | NULL可 | |
| `email` | TEXT | NULL可 | |
| `website_url` | TEXT | NULL可 | |
| `official_url` | TEXT | NULL可 | |
| `e_filing_url` | TEXT | NULL可 | Phase4で拡充対象。列自体はPhase1から確保 |
| `download_page_url` | TEXT | NULL可 | |
| `map_url` | TEXT | NULL可 | Phase4で拡充対象（Google Maps） |
| `business_hours` | TEXT | NULL可 | |
| `notes` | TEXT | NULL可 | 管轄の例外事項（例: 一部地域は別窓口が共同管轄）。既存`organization_offices.notes`の運用を踏襲 |
| `official_url_status` | TEXT | NOT NULL, DEFAULT `'unchecked'` | リンク生存確認のみを表す既存の4値（`ok`/`broken`/`redirected`/`unchecked`）を踏襲 |
| `official_url_checked_at` | TIMESTAMPTZ | NULL可 | URL生存確認日時（既存踏襲） |
| `fallback_url` | TEXT | NULL可 | |
| `data_version` | INT | NOT NULL, DEFAULT 1 | 内容（住所・電話等）が検証済み変更されるたびに+1。`office_sources`のスナップショットと対応 |
| `last_verified_at` | DATE | NULL可 | **窓口の内容自体**（URL生存ではなく住所・電話・管轄）を最後に情報源と照合した日 |
| `verification_due_at` | DATE | NULL可 | 次回確認予定日（`update_frequency`から算出、または手動設定） |
| `update_frequency` | TEXT | NOT NULL, DEFAULT `'annual'`, CHECK IN (`monthly`,`quarterly`,`annual`,`on_change`,`unknown`) | このレコードがどの程度の頻度で変化しうるか |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE | 廃止・統合された窓口を物理削除せず無効化する（行レベルでの「即座に削除しない」原則の適用） |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**主キー**: `id`
**外部キー**: `office_category → organization_types(code)`
**Index**: `UNIQUE(office_category, name)`（冪等な`ON CONFLICT`投入用）／単純Index: `office_category`
（種別フィルタ用、`/offices`相当ページ）／`is_active`（有効な窓口のみの絞り込み）
**更新頻度**: 行自体は`update_frequency`列で個別管理（既定`annual`）。実運用では税務署・法務局・
年金事務所・労基署・ハローワークの管轄区域変更は**年1回未満**（庁舎統合・管轄再編時のみ）、
電話番号・URLは`on_change`（変更を検知した都度）を想定。

### 1-2. `office_sources`（情報源・検証履歴。新規概念）

「URLが生きているか」（`official_url_status`）とは別軸で、**窓口の内容そのものが何を根拠に
正しいとされているか**を構造化して残す。1窓口に対して複数回の検証履歴を持てるようにし、
最新の検証を`is_current = true`の1行として特定できるようにする（バージョン管理を専用の履歴テーブル
として別建てせず、このテーブルが「情報源」と「変更履歴」を兼ねる設計）。

| カラム | 型 | 制約 | 役割 |
|---|---|---|---|
| `id` | SERIAL | **PK** | |
| `office_id` | INT | NOT NULL, **FK→`submission_offices(id)` ON DELETE CASCADE** | |
| `source_type` | TEXT | NOT NULL, CHECK IN (`nta`,`moj`,`nenkin`,`mhlw`,`pref_government`,`municipal_government`,`other`) | 情報源の発行主体カテゴリ（国税庁／法務省／日本年金機構／厚生労働省／都道府県／市区町村／その他） |
| `publisher_name` | TEXT | NOT NULL | 発行主体名（例:「国税庁」「福岡県庁」） |
| `source_url` | TEXT | NULL可 | 参照した公式ページ |
| `retrieved_at` | DATE | NOT NULL | データを取得・確認した日 |
| `verification_method` | TEXT | NOT NULL, CHECK IN (`official_page_check`,`phone_confirmation`,`pdf_document`,`csv_import`,`other`) | どうやって確認したか |
| `verified_by` | TEXT | NULL可 | 確認した担当者（`admin_users.email`または自由記述） |
| `is_current` | BOOLEAN | NOT NULL, DEFAULT TRUE | この窓口の「現在の正本」となる情報源かどうか |
| `snapshot` | JSONB | NULL可 | 検証時点の`submission_offices`主要列（住所・電話・URL等）のスナップショット。次に上書きされる際の差分監査に使う |
| `notes` | TEXT | NULL可 | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**主キー**: `id`
**外部キー**: `office_id → submission_offices(id)`
**Index**: `office_id`／部分UNIQUE `(office_id) WHERE is_current = true`
（1窓口につき「現在の正本」は常に1件に確定させる。新しい検証を追加する際は既存の`is_current`行を
`false`に更新してから新規行を追加する運用）
**更新頻度**: 窓口側`update_frequency`に連動して再検証が発生するたびに1行追加（追記型、UPDATEせず
INSERTのみで履歴を積む）。

### 1-3. `submission_jurisdictions`（管轄解決。`jurisdictions`の後継、スコープ拡張版）

既存`jurisdictions`の「市区町村単位でしか窓口を紐づけられない」制約を解消する。**都道府県単位・
全国単位のスコープを追加**し、都道府県税事務所のような「本来1都道府県=1窓口」の関係を60行に
複製せず1行で表現できるようにする（0-2節1点目の解消）。

| カラム | 型 | 制約 | 役割 |
|---|---|---|---|
| `id` | SERIAL | **PK** | |
| `office_id` | INT | NOT NULL, **FK→`submission_offices(id)` ON DELETE CASCADE** | |
| `office_category` | TEXT | NOT NULL, **FK→`organization_types(code)`** | 非正規化列。`office_id`から辿れるが、解決クエリでJOINを1段減らすため既存`jurisdictions.organization_type_id`と同じ理由で保持 |
| `scope_type` | TEXT | NOT NULL, CHECK IN (`municipality`,`prefecture`,`national`) | 解決の粒度 |
| `scope_code` | TEXT | NULL可（`scope_type='national'`の場合のみNULL） | `scope_type='municipality'`なら`municipalities.code`、`'prefecture'`なら`prefectures.code`。**ポリモーフィックなためFK制約は張らない**（⑤節「未確定事項」参照） |
| `is_primary` | BOOLEAN | NOT NULL, DEFAULT TRUE | 同一スコープ・同一種別で複数窓口が競合する場合（例: 町名・丁目単位で管轄が分かれる税務署）にどちらを既定表示するか |
| `priority` | INT | NOT NULL, DEFAULT 0 | `is_primary=false`の代替候補が複数ある場合の順序（`rules.priority`と同じ昇順評価の考え方） |
| `effective_from` | DATE | NOT NULL, DEFAULT CURRENT_DATE | 管轄が有効になった日（庁舎統合・管轄区域変更に備える） |
| `effective_to` | DATE | NULL可 | NULL=現在も有効。値がある場合は失効済み（削除せず履歴として残す） |
| `notes` | TEXT | NULL可 | 既存の「香椎/博多税務署の共同管轄」のような注記をここに構造化して残す |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**主キー**: `id`
**外部キー**: `office_id → submission_offices(id)`／`office_category → organization_types(code)`
**Index**: `(scope_type, scope_code, office_category)`（解決クエリの主経路）／`office_id`／
部分UNIQUE `(scope_type, scope_code, office_category) WHERE is_primary = true AND effective_to IS NULL`
（「現在有効な既定の解決先」は常に1件に確定させる）
**更新頻度**: 管轄区域変更は稀（庁舎統合・行政区再編時のみ、年数回未満）。`effective_to`を使った
論理失効のため、更新は基本的に「新しい行の追加＋旧行への`effective_to`設定」で行い、UPDATEでの
上書きは行わない。

### 1-4. `procedure_submission_rules`（手続き別の提出先判定ルール。新規概念）

`procedures.office_type`（単一固定値）をデフォルトとしつつ、会社プロフィールの条件によって
提出先種別を上書きできるようにする。既存Rule Engine（`rules`/`rule_conditions`/`rule_actions`）の
`change_office`アクションと同じ発想だが、**診断エンジン・Roadmap・PDF/Excel出力等、経営イベントに
限らず全ての手続き表示経路から使える**汎用の判定テーブルとして独立させる。

条件は`rule_conditions`のような子テーブルに分けず、JSONB配列列で表現する。理由:
本テーブルは1手続きあたり例外的な上書きルールが数件程度にとどまる想定であり、既存Rule Engineほどの
編集粒度（管理画面での条件単位のCRUD）を必要としない。3行程度の重複より過剰な抽象化を避けるという
方針に基づき、専用の子テーブルを新設しない（将来、管理画面での条件単位編集が本当に必要になった場合は
`rule_conditions`と同じ形の子テーブルへ分割する拡張の余地を残す）。

| カラム | 型 | 制約 | 役割 |
|---|---|---|---|
| `id` | SERIAL | **PK** | |
| `procedure_id` | INT | NOT NULL, **FK→`procedures(id)` ON DELETE CASCADE** | |
| `office_category` | TEXT | NOT NULL, **FK→`organization_types(code)`** | この条件が成立した場合に採用する提出先種別 |
| `conditions` | JSONB | NOT NULL, DEFAULT `'[]'` | `{field, operator, value}`の配列。**AND評価**。空配列=無条件（常に成立）。`field`/`operator`の語彙は既存`rule_conditions`と統一（`eq`/`neq`/`in`/`not_in`/`gt`/`gte`/`lt`/`lte`、`field`はRuleContext相当のキー） |
| `recipient_scope` | TEXT | NOT NULL, DEFAULT `'company'`, CHECK IN (`company`,`each_employee`,`other`) | 提出先を誰の所在地で判定すべきかの区分（③-5節で詳述） |
| `priority` | INT | NOT NULL, DEFAULT 0 | 複数ルールが同一`procedure_id`に成立しうる場合の優先順位（昇順評価、既存`rules.priority`と同じ規約） |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT TRUE | 無効化は削除せずこのフラグで行う（既存Rule Engineの運用ルールを踏襲） |
| `notes` | TEXT | NULL可 | |
| `created_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, DEFAULT NOW() | |

**主キー**: `id`
**外部キー**: `procedure_id → procedures(id)`／`office_category → organization_types(code)`
**Index**: `procedure_id`／**UNIQUE** `(procedure_id, office_category, priority)`
（同一手続き・同一種別・同一優先度の重複ルール投入を防ぐ。`rules.name`にUNIQUE制約が無くルールが
増殖した過去の事故、[RULE_ENGINE.md](RULE_ENGINE.md)を踏まえた設計）
**更新頻度**: 法改正・制度変更時のみ（`on_change`）。手続きマスタ（`procedures`）の改定と同じ頻度感。

**評価順序**: `procedure_id`に対し`is_active=true`の行を`priority`昇順に評価し、`conditions`が
全件AND成立した最初の行の`office_category`を採用する。**1件も無い、または1件も成立しない場合は
`procedures.office_type`（既存の単一値）をそのまま使う** — これにより、新テーブルにルールを
追加しない限り既存の全手続きの挙動は一切変わらない（非破壊的な追加専用の設計）。

---

## ② データモデル（提出先種別の整理）

提出先種別のマスタは**新設せず、既存`organization_types`（13種）をそのまま`office_category`のFK先
として再利用**する（0-4節および後述の理由）。要件にある8分類は、以下のように既存コードへの
マッピングとして整理する。

| 要件の分類 | 対応する`organization_types.code` | 備考 |
|---|---|---|
| 税務署 | `tax_office` | 国税（法人税・源泉所得税等） |
| 法務局 | `legal_affairs_bureau` | 商業・法人登記 |
| 年金事務所 | `pension_office` | 健康保険・厚生年金保険 |
| 労働基準監督署 | `labor_standards` | 労災保険・労働基準 |
| ハローワーク | `hello_work` | 雇用保険・職業紹介 |
| 都道府県税事務所 | `prefectural_tax` | 法人都道府県民税・事業税。`submission_jurisdictions`では`scope_type='prefecture'`で1行に集約可能 |
| 市区町村 | `municipal_tax`（税務窓口）／`municipal_office`（一般窓口） | 既存DBは税務窓口と一般窓口を分けて持つ。「市区町村」という1分類は表示上のグルーピングとして扱い、DB上のコードは分けたまま維持する |
| その他 | `other`（加えて`prefectural_office`/`health_center`/`fire_department`/`chamber_of_commerce`は既存の細分類として残す） | Phase2〜3の優先度は低いが削除しない |

**新しいマスタテーブルや列挙型を追加しない理由**: `procedures.office_type`は既に
`organization_types.code`へのFK（`fk_procedures_office_type`）で結ばれており、ここに新しい語彙体系を
導入すると`procedures`側との整合を取るための変換層が余分に必要になる。既存語彙をそのまま
`submission_offices.office_category`・`submission_jurisdictions.office_category`・
`procedure_submission_rules.office_category`のFK先として使うことで、変換コストをゼロにする。

---

## ③ 判定ロジック

### ③-1. 会社プロフィールから使う入力

| 入力 | 現状の保持状況 | 判定での役割 |
|---|---|---|
| `municipality_code` | `workspace_companies.municipality_code`として保持済み（都道府県→市区町村の連動プルダウンによる直接選択） | **主判定キー**。`submission_jurisdictions`の`scope_type='municipality'`照合に使う |
| `prefecture_code` | `workspace_companies.prefecture_code`として保持済み | 市区町村単位の解決が無い場合の**降格先**。`scope_type='prefecture'`照合に使う |
| 郵便番号 | **会社プロフィール側は保持していない**（③-4節で詳述） | 判定には使わない。窓口側の表示情報としてのみ`submission_offices.postal_code`に保持 |
| `corporate_type` / `has_employees` / `company_stage` / `capital` 等 | `CompanyProfile`に既存 | `procedure_submission_rules.conditions`の評価コンテキスト（RuleContext相当） |

### ③-2. 手続きごとの判定フロー

```
[procedure_id, 会社プロフィール] を入力
        │
        ▼
① procedure_submission_rules を procedure_id で検索
   is_active=true を priority 昇順で評価し、
   conditions が全件AND成立する最初の行を採用
        │
        ├─ 成立する行がある → office_category・recipient_scope を確定
        │
        └─ 1件もない／全て不成立 → procedures.office_type を office_category として採用
                                     recipient_scope = 'company'（既定）
        │
        ▼
② submission_jurisdictions を次の優先順で検索
   （office_category が一致し、is_primary=true、effective_to IS NULL のもの）
        │
        ├─ (a) scope_type='municipality' AND scope_code = 会社の municipality_code
        │        → 見つかればここで確定
        │
        ├─ (b) 見つからなければ scope_type='prefecture' AND scope_code = 会社の prefecture_code
        │        → 見つかればここで確定（都道府県税事務所等はここで解決する想定）
        │
        └─ (c) 見つからなければ scope_type='national'
                 → 見つかればここで確定
        │
        └─ (a)(b)(c) いずれも見つからない → 「提出先情報なし」として扱う
                                             （代替窓口を推測しない）
        ▼
③ 確定した office_id から submission_offices の表示用フィールドを取得
   office_sources（is_current=true）から last_verified_at・update_frequency を合わせて取得
        ▼
④ recipient_scope が 'each_employee' の場合は具体的な窓口を断定せず、
   「従業員ごとに提出先が異なる」という注意喚起フラグのみを返す（③-5節）
        ▼
出力: { office, officeCategory, submissionMethod, eFilingUrl, jurisdictionReason, dataFreshness }
```

`jurisdictionReason`（管轄理由）は、①でどのルールが適用されたか（デフォルト値か上書きルールか）と、
②でどのスコープ段階（municipality/prefecture/national）で解決したかを組み合わせた文字列として
構成する（例:「福岡市中央区の管轄として福岡税務署が確定」「都道府県単位の管轄として福岡県都税事務所
相当が確定」）。これにより、単に窓口名を出すだけでなく**なぜその窓口なのかを説明できる**エンジンにする。

### ③-3. 具体例で辿る判定フロー（①の4件を実際にトレース）

会社プロフィール: `prefecture_code='40'`（福岡県）、`municipality_code='401331'`（福岡市中央区）。

| 手続き | ①ルール適用 | ②スコープ解決 | 結果 |
|---|---|---|---|
| 法人税確定申告 | `procedure_submission_rules`に該当行なし→`procedures.office_type='tax_office'`を採用 | `scope_type='municipality', scope_code='401331', office_category='tax_office'`が一致 | 福岡税務署 |
| 役員変更登記 | 同上→`office_type='legal_affairs_bureau'` | 市区町村単位一致 | 福岡法務局 |
| 社会保険新規適用届 | 同上→`office_type='pension_office'` | 市区町村単位一致 | 中福岡年金事務所 |
| 労働保険成立届 | 同上→`office_type='labor_standards'` | 市区町村単位一致 | 福岡中央労働基準監督署 |

いずれも②の(a)市区町村スコープで解決しており、都道府県・全国への降格は発生しない
（既存Phase1.5データがそのまま新スキーマでも同じ結果を再現できることの確認）。

### ③-4. 郵便番号について（要件との整合）

要件では「都道府県・市区町村・郵便番号などから提出先を決定するルール」を求めているが、
0-4節の通り、既存の`CompanyProfile`は郵便番号を保持しておらず、
[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md)（Sprint54）
で「郵便番号は`municipality_code`の直接選択方式より判定精度を上げない」という調査結論が既に
出ている（全国約13万件規模の郵便番号マスタ保持というコストに見合う精度向上が無いため）。

本設計ではこの既存結論を踏襲し、**郵便番号を会社側の判定キーとしては採用しない**。一方で、
以下の2点は設計に反映する。

1. `submission_offices.postal_code`は**窓口側の表示情報**として引き続き保持する（PDF等の書類表示用）。
2. 将来、会社プロフィールが外部連携（名刺データ・CSVインポート等）で住所文字列や郵便番号から
   出発するケースが生じた場合に備え、③-2節の判定フロー自体は「`municipality_code`が確定していれば
   動く」設計になっている。郵便番号→`municipality_code`への変換が必要になった場合も、
   日本郵便の郵便番号マスタを別途参照する変換ステップを**判定ロジックの外側**に追加するだけで済み、
   `submission_jurisdictions`側の設計変更は不要（変換責務と解決責務を分離しているため）。

### ③-5. `recipient_scope`（会社ではなく従業員個々の所在地が提出先を左右するケース）

給与支払報告書のように、提出先が「会社の所在地」ではなく「各従業員の1月1日時点の住所地市区町村」
になる手続きがある（[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md)
4節で既に指摘済み）。`procedure_submission_rules.recipient_scope='each_employee'`でこれを明示し、
③-2節④の通り**具体的な窓口を誤って断定しない**ことを優先する。従業員ごとの住所地データモデル自体は
SUNBOOに存在しないため、本設計のスコープには含めない（⑤節「未確定事項」参照）。

---

## ④ 更新戦略（情報源・最終確認日・更新方法・バージョン管理）

| 要件項目 | 対応するカラム／テーブル |
|---|---|
| 情報源 | `office_sources.source_type` / `publisher_name` / `source_url` |
| 最終確認日 | `submission_offices.last_verified_at`（内容） / `office_sources.retrieved_at`（情報源取得日） / `official_url_checked_at`（URL生存確認、既存踏襲） |
| 更新方法 | `office_sources.verification_method`（`official_page_check`/`phone_confirmation`/`pdf_document`/`csv_import`/`other`）。実際の投入経路は既存の管理画面CRUD＋CSVインポート（`adminCsv.ts`、[全国対応データ整備ガイド.md](全国対応データ整備ガイド.md)）を踏襲し、新しいインポート基盤は作らない |
| バージョン管理 | `submission_offices.data_version`（変更のたびに+1）＋`office_sources.snapshot`（変更前スナップショット）。専用の履歴テーブルは新設せず、`office_sources`が情報源記録と変更履歴を兼ねる |

### ④-1. 運用フロー（再検証サイクル）

```
submission_offices.verification_due_at が到来
        │
        ▼
担当者が情報源（国税庁・法務省・日本年金機構・厚労省・自治体の公式ページ）を確認
        │
        ├─ 内容に変更なし
        │     → office_sources に新規行を追加（is_current=true、既存行はfalseへ）
        │     → submission_offices.last_verified_at / verification_due_at を更新
        │     → data_version は変更なし（内容が変わっていないため）
        │
        └─ 内容に変更あり（住所・電話・管轄区域等）
              → office_sources.snapshot に変更前の値を記録した上で新規行を追加
              → submission_offices を更新し、data_version を +1
              → 管轄区域が変わった場合は submission_jurisdictions の旧行に
                 effective_to を設定し、新しい行を effective_from とともに追加
                 （UPDATEで上書きせず、履歴として両方残す）
```

### ④-2. 鮮度の運用ルール

- `update_frequency`はカテゴリ横断の目安として次を推奨する（実装時に管理画面の初期値候補とする）:
  `tax_office`/`legal_affairs_bureau`/`pension_office`/`labor_standards`/`hello_work` → `annual`
  （管轄区域変更は稀）、`prefectural_tax`/`municipal_tax`/`municipal_office` → `annual`、
  電話番号・URL単体の変化は`on_change`として個別に扱う。
- `official_url_status`（URL生存）と`last_verified_at`（内容の正確性）は**意図的に別軸**として扱う。
  URLが生きていても、庁舎移転・電話番号変更等が反映されていない可能性があるため、UI表示上も
  混同しない（⑤節「未確定事項」参照）。

---

## ⑤ Version 1.1 Roadmap（段階導入）

| Phase | 内容 | 本ドキュメントとの関係 |
|---|---|---|
| **Phase 1** | データモデル設計・マイグレーション作成・GRANT/RLS設定（データ投入なし） | 本ドキュメントが対象とする範囲 |
| **Phase 2** | 福岡県100%（72判定単位×該当分類）のデータ投入。既存`organizations`系データの機械的移植＋不足分（`municipal_tax`/`prefectural_tax`、[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02）の新規調査投入 | 未着手 |
| **Phase 3** | 全国展開（47都道府県）。データ量・調査体制の見積りが必要な別スコープ。スクレイピングを前提とせず、公式一次情報源（国税庁・法務省・日本年金機構・厚労省・自治体）を人手または将来の半自動フローで確認する運用を維持する | 未着手 |
| **Phase 4** | Google Maps・電話番号・公式サイト・電子申請URLの拡充 | スキーマは既にPhase1で保持済み（`map_url`/`phone`/`website_url`/`e_filing_url`）のため、Phase4は列追加ではなく**データの充実のみ** |
| **Phase 5** | PDF・年間ロードマップ・Shareページへの自動表示統合 | 5節「共通利用」で設計した解決関数の実装・呼び出し元の段階的カットオーバー |

### 実装順（Phase1着手時の推奨タスク順）

1. 本ドキュメントのレビュー（現在地）
2. マイグレーション作成: 4テーブル＋GRANT/RLSを1ファイルにまとめて実装（`organization_types`は
   変更しない）。`supabase/migration_national_submission_directory.sql`のような命名を想定
3. 東京都渋谷区＋福岡県72判定単位分を、既存`organizations`/`organization_offices`/`jurisdictions`
   データから**機械的に移植**（新規調査ではなく既存データのコピー）し、Phase1.5相当の
   カバレッジをまず新スキーマ上で再現する
4. 移植したデータに対応する`office_sources`を、`migration_organizations.sql`内のSQLコメントに
   既に残っている情報源引用を構造化転記する形で投入する（新規調査は不要）
5. 福岡県`municipal_tax`/`prefectural_tax`の未整備分（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02）を、
   新スキーマの`scope_type='prefecture'`（都道府県税事務所は1行で足りる）を使って解消する
6. ③節の解決ロジックを`src/lib/`に新規追加関数として実装（既存`resolveOffices`は変更しない）。
   移植済みデータに対して、既存`resolveOffices`の出力と一致することを確認する
7. 呼び出し元を影響範囲の小さい順に1つずつカットオーバー（`/offices`→診断エンジン→Roadmap→
   PDF/Excel→Share）し、都度Playwrightで確認する
8. 全カットオーバー完了後、`organizations`/`organization_offices`/`jurisdictions`/
   `procedure_organizations`を`DATABASE.md`に「新設計に置き換え済み」と明記した上で残置する

---

## PDF / Roadmap / Share / 通知からの共通利用（設計）

③節の解決ロジックを1つの共通関数に集約し、以下の全経路が同一ロジックを再利用する設計とする
（新しいUIパターン・新しい判定ロジックを経路ごとに作らない。`resolveOffices`・
`buildRoadmapSubmissionInfo`と同じ「DOM/JSXに依存しないプレーンなデータを返す純粋関数」の設計思想）。

| 利用経路 | 現在の相当部品 | 想定される接続方法 |
|---|---|---|
| 診断エンジン（`/result`） | `resolveOffices`（`diagnosis.ts`） | 段階的にカットオーバー（⑤節）。当面は並行稼働 |
| Annual Roadmap | `buildRoadmapSubmissionInfo`（`roadmapSubmissionInfo.ts`、Sprint50実装済み） | `ScheduleProcedure.office`の取得元を将来差し替え。URL選択ロジック自体は変更不要 |
| PDF/Excel出力 | `roadmapPdfDocument.ts`/`roadmapExcelWorkbook.ts` | Roadmap経由で取得した`office`情報をそのまま渡すだけで済む設計（既存と同じ「表示専用データを渡すだけ」の原則） |
| 共有ページ（`/share/[token]`） | `buildAnnualRoadmap`経由 | Roadmapと同じ経路のため自動的に波及（[ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md](ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md) 0-5節と同じ構造） |
| 通知エンジン | 画面内通知センターのみ稼働中 | 現状、通知は窓口情報を参照していない。将来「期限が近い＋提出先未確定」等の通知を作る場合の拡張点として設計上は接続可能にしておく |

**Engineへの影響**: `calculateNextDeadline`・Rule Engineの条件評価・`ProcedureResult`→
`ScheduleProcedure`変換のいずれも変更しない。本設計は「提出先の解決元データと解決ロジックを
差し替え可能にする」ことに限定され、期限計算・必要書類判定には影響しない。

---

## GRANT / RLS（設計のみ、実際のDDLは書かない）

**RLS方針**: 提出先・管轄・情報源は公開行政情報のため匿名SELECTを許可し、更新系操作は管理者のみに制限する。

`CLAUDE.md`の必須ルールに従い、4テーブルすべてに以下を同一マイグレーションファイル内で
セットにする必要がある（実装時の備忘として明記。今回は適用しない）。

- `anon`ロールに`GRANT SELECT`（`public_read`ポリシー、`USING (true)`）— 既存
  `organization_offices`等と同じ「一般公開の参照系マスタ」として扱う
- `authenticated`かつ`admin_users`登録者に`INSERT`/`UPDATE`/`DELETE`
  （`admin_schema.sql`と同じ`IF EXISTS (SELECT 1 FROM information_schema.tables ...)`ガード必須）
- シードデータを投入する場合は、`submission_offices(office_category, name)`・
  `office_sources`の部分UNIQUE・`submission_jurisdictions`の部分UNIQUE・
  `procedure_submission_rules(procedure_id, office_category, priority)`のいずれも
  具体的なconflict targetを指定した`ON CONFLICT`にする（`rules.name`増殖事故の再発防止）

---

## 既存アーキテクチャとの整合性

- **`procedures` / `procedure_documents` / `official_links` / `organization_types`**: 変更なし。
  `organization_types`は`office_category`のFK先として継続利用する
- **`organizations` / `organization_offices` / `jurisdictions` / `procedure_organizations`**:
  削除・変更しない。Phase 5でのカットオーバー完了まで、現行(site)診断エンジン・`/offices`・
  既存admin CRUD（`/admin/offices`・`/admin/organization-types`）はこれらを参照し続ける。
  カットオーバー完了後は`DATABASE.md`に「新設計に置き換え済み・アプリコードからは未参照」と
  明記した上で残置する（`jurisdiction_offices`と同じ扱い）
- **Rule Engine（`rules`/`rule_conditions`/`rule_actions`）**: 変更なし。`change_office`アクションは
  経営イベントエンジン専用のオーバーライドとして引き続き機能する。`procedure_submission_rules`は
  対象範囲（診断エンジン・Roadmap等イベントに限らない全経路）が異なる並行の仕組みであり、
  互いを置き換えるものではない
- **`resolveOffices` / `calculateNextDeadline` / `ScheduleList.tsx`**: 変更なし。
  `CLAUDE.md`が指定する「シグネチャ変更時は両方の呼び出し元を確認する」共通部品には、
  本設計の段階では一切手を加えない（Phase 5で初めて接続を検討する）
- **CompanyProfile**: `municipality_code`が唯一の判定キーであるという既存の設計判断
  （[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md)）を
  維持する。本設計は判定キー自体を増やさず、判定キーから窓口を導く**解決テーブル側**を拡張する

---

## 未確定事項（レビューで判断してほしい点）

1. **`organizations`/`organization_offices`の2層構造を`submission_offices`1テーブルへ統合したこと。**
   統括組織単位でのグルーピング表示（例:「福岡法務局とその支局一覧」）が将来UI要件として
   出てきた場合、`organization_name`の単純な文字列一致では取りこぼしうる（表記ゆれ等）。
   その要件が具体化した時点で、別テーブルへの分割を再検討する前提でよいか
2. **`submission_jurisdictions.scope_code`のポリモーフィズム。** `scope_type`によって
   `municipalities.code`か`prefectures.code`のどちらかを指す1つのTEXT列とし、厳密なFK制約を
   張っていない（`rule_conditions.field`が自由記述である前例を踏襲した設計判断）。より厳格な
   参照整合性（`municipality_scope_id`・`prefecture_scope_id`の2列＋CHECK制約）を優先すべきか
3. **`procedure_submission_rules.conditions`をJSONB配列にし、`rule_conditions`のような子テーブルに
   分割しなかったこと。** 将来、管理画面で条件を1件ずつ編集するUIが必要になった場合は、
   `rule_conditions`と同じ形の子テーブルへ分割する変更が必要になる
4. **郵便番号を会社側の判定キーとして採用しなかったこと（③-4節）。** 既存調査結論
   （[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md)）を
   踏襲したが、今回の要件で改めて郵便番号が挙げられているため、この結論を維持してよいか再確認したい
5. **`recipient_scope='each_employee'`（給与支払報告書等、従業員の住所地が提出先を左右する手続き）は、
   本設計では「誤った窓口を断定しない」ための注意フラグまでしか解決しない。** 実際に従業員ごとの
   提出先を判定するには、SUNBOOに存在しない「従業員の住所地」データモデルが別途必要
   （[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md) 4節で
   既に指摘済みの別軸の課題）。本設計のスコープには含めない
6. **`official_url_status`（URL生存）と`last_verified_at`/`office_sources`（内容の正確性）を
   意図的に別軸として分離したこと。** 将来UIで両者を1つの「信頼度」表示に統合すべきか、
   別々に表示すべきか（推奨: 別軸のまま。URLが生きていても内容が古い可能性があるため）
7. **全国展開（Phase 3）のデータ調査体制。** 47都道府県規模の一次情報源確認を、現状の
   「管理者が公式ページを人手で確認してCRUD/CSV投入する」運用のまま続けるか、何らかの
   半自動化（公開APIの有無調査等）を検討するかは、本設計のスコープ外として別途整理が必要

---

## まとめ

- **既存基盤（`organization_types`/`organizations`/`organization_offices`/`jurisdictions`）は
  そのまま残し、`organization_types`のみ再利用する形で、次の4テーブルを新設する**:
  `submission_offices`（窓口本体、組織階層は統合）・`office_sources`（情報源・検証履歴・
  バージョン管理）・`submission_jurisdictions`（市区町村/都道府県/全国スコープに対応した管轄解決）・
  `procedure_submission_rules`（手続き別の条件付き提出先判定）
- **解消する既存の限界**: 都道府県単位窓口の市区町村数分の複製・1手続き=1提出先の硬直性・
  情報源/検証履歴の非構造化
- **郵便番号**: 会社側の判定キーとしては既存調査結論を踏襲し不採用。窓口側の表示情報としては保持し、
  将来の住所文字列由来の入力にも判定ロジック自体は対応できる構造にした（③-4節）
- **解決しない・スコープ外として明記した課題**: 従業員ごとの提出先判定（給与支払報告書等）、
  全国規模データ調査体制の具体案
- **既存Engine（`resolveOffices`・`calculateNextDeadline`・Rule Engine）への影響: 本設計段階ではゼロ**。
  非破壊的な追加専用設計とし、カットオーバーは将来のSprintで段階的に行う

---

# 意思決定章（Decision Register）— Version 1.1向け

**本章は既存の設計内容（①〜⑤節・GRANT/RLS節・既存アーキテクチャとの整合性節・未確定事項節）を
書き換えるものではなく、上記「未確定事項」節で提起した論点を実装者が独自判断せずに済む形へ
追加で整理したものである。** コード・SQL・Migration・データ投入は本章でも一切行わない。

対象は、前回の「未確定事項7点」（D8〜D12として本章に引き継ぐ）に加え、今回改めて指定された
7点（D1〜D7）を合わせた計12項目。推測で決められない項目は「保留」として明確に残し、
覆い隠さない。

## 決定事項一覧（サマリ）

| ID | 論点 | 推奨案 | Version 1.1で対応 | 最終判断が必要な人 |
|---|---|---|---|---|
| D1 | 郵便番号を判定へ使うか | 不採用（現状維持） | ○（不採用の明記） | プロダクトオーナー |
| D2 | 従業員住所ごとに提出先が変わる手続きの扱い | フラグ表示のみ（窓口断定なし） | ○ | プロダクトオーナー |
| D3 | 複数提出先候補の返却方法 | 主候補＋代替候補をmetadataで保持 | ○（スキーマ・ロジック） | プロダクトオーナー／実装者 |
| D4 | 判定不能時の状態設計 | 6状態モデルを採用 | ○ | プロダクトオーナー |
| D5 | 既存organizations系と新4テーブルの正本関係 | Phase2〜4は新4テーブルのみ正本 | ○（運用ルール明記） | 開発運営担当／プロダクトオーナー |
| D6 | 情報源が更新・削除された場合の扱い | 物理削除せず`status`列で撤回を表現 | ○（列追加） | プロダクトオーナー／実装者 |
| D7 | 判定結果の根拠表示と最終確認日の公開範囲 | 理由は公開、確認日は定性ラベルのみ公開 | ○（方針決定） | プロダクトオーナー／デザイン担当 |
| D8 | organizations/organization_offices統合の是非 | 統合のまま確定 | ○ | プロダクトオーナー |
| D9 | scope_codeポリモーフィズム | 2列＋CHECK制約に変更 | ○ | 実装者／プロダクトオーナー |
| D10 | conditions JSONB vs 子テーブル | JSONB配列のまま確定 | ○ | 実装者 |
| D11 | official_url_status vs last_verified_at分離 | 分離維持 | ○ | デザイン担当／プロダクトオーナー |
| D12 | 全国展開データ調査体制 | **保留**（Phase2実績を待つ） | ✕ | プロダクトオーナー（Phase2完了後） |

---

## D1. 郵便番号を判定へ使うか

| 項目 | 内容 |
|---|---|
| 論点 | `submission_jurisdictions`の解決キー、または`CompanyProfile`の入力項目として郵便番号を採用するか |
| 背景 | 今回の要件定義で郵便番号が判定候補として明示された。一方、既存調査（[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md) Sprint54）は「都道府県→市区町村の連動プルダウンによる直接選択で`municipality_code`を確実に取得できており、郵便番号経由の変換はこの精度を上げない」と結論済み |
| 選択肢A: 不採用（現状維持） | 判定キーは`municipality_code`/`prefecture_code`のみ。`postal_code`は窓口側の表示情報としてのみ`submission_offices.postal_code`に保持 |
| 選択肢Aの利点 | 追加コストゼロ。既存精度を維持。実装リスクなし |
| 選択肢Aのリスク | 同一市区町村内で町丁目単位に管轄が分かれる稀なケース（例: 香椎/博多税務署）には対応できないまま（既知の精度上限として容認） |
| 選択肢B: 補助的併用 | `CompanyProfile`に郵便番号列を追加し、`municipality_code`未設定時のみ全国郵便番号マスタ経由でフォールバック解決する |
| 選択肢Bの利点 | 外部連携（名刺データ・CSVインポート等）で`municipality_code`が不明な場合の受け皿になる |
| 選択肢Bのリスク | 全国郵便番号マスタ（約13万件規模）の保持・更新コストが新たに発生。郵便番号→市区町村の変換失敗時のエラーハンドリングも必要。`CompanyProfile`のスキーマ変更を伴う |
| 選択肢C: 全面採用 | 郵便番号を主判定キーに格上げし、町丁目単位の管轄分割まで解決する |
| 選択肢Cの利点 | 現行best-effort精度の上限（町丁目分割）を将来的に超えられる可能性 |
| 選択肢Cのリスク | 郵便番号だけでは町丁目単位の機関管轄は決まらず、国税庁等が個別公開する住所索引との突合が別途必要になる。最大のデータ整備コストに対し、精度が上がる保証が無い |
| 推奨案 | **A（不採用、現状維持）** |
| 推奨理由 | 既存調査結論を覆す新しい実データ根拠が無い。B・Cはいずれも「精度が上がる」根拠なしにコストのみ増える。VISION.mdの「実務データの検証なしの断定をしない」に照らし、根拠が無い変更は行わない |
| Version 1.1で対応するか | する（「不採用」であることを設計として確定する） |
| 将来対応へ送るか | Bのみ、外部連携の実需要が具体化した時点で再評価対象として送る |
| 最終判断が必要な人 | プロダクトオーナー。ただし新たな精度向上の実データ根拠が無い限り、A採用で確定してよいと判断する |

## D2. 従業員住所ごとに提出先が変わる手続きの扱い

| 項目 | 内容 |
|---|---|
| 論点 | 給与支払報告書等、`recipient_scope='each_employee'`に該当する手続きをVersion 1.1でどこまで実装するか |
| 背景 | 現行`CompanyProfile`に従業員個々の住所データは存在しない。給与支払報告書が代表例だが、他手続きにも同種の構造が生じうる |
| 選択肢A: フラグのみ実装 | 窓口を返さず「従業員ごとにご確認ください」という注意喚起のみ表示する（前回設計の原案） |
| 選択肢Aの利点 | 誤情報を出さない（VISION.mdの原則に忠実）。実装コスト最小 |
| 選択肢Aのリスク | ユーザーから見て「結局どこに出せばいいか分からない」という物足りなさが残りうる |
| 選択肢B: 会社所在地窓口を代替表示 | 従業員住所データが無いため、便宜上「会社所在地の市区町村役場」を仮の窓口として表示する |
| 選択肢Bの利点 | 画面に何かしら窓口が表示されるためUXの落差が緩和される |
| 選択肢Bのリスク | **誤った窓口を提示するリスクが高い**。給与支払報告書の提出先は会社所在地ではなく従業員居住地であり、会社所在地窓口の案内は明確な誤案内になりうる（VISION.mdの断定禁止に抵触） |
| 選択肢C: 従業員住所データモデルを新規設計 | `workspace_employees`等を新設し、真の従業員ごと解決を実装する |
| 選択肢Cの利点 | 真に正しい判定が可能になる |
| 選択肢Cのリスク | Version 1.1のスコープを大幅に超える新規データモデル。従業員個人情報を保持することになり、個人情報保護対応という別プロジェクト相当の論点が新たに発生する |
| 推奨案 | **A** |
| 推奨理由 | Bは誤案内リスクが高くVISION.mdの原則に反する。Cは本設計（提出先マスター）のスコープを大幅に超え、個人情報保護の論点まで波及する別プロジェクトになる |
| Version 1.1で対応するか | する（Aのフラグ表示のみ） |
| 将来対応へ送るか | Cは、従業員データ機能自体がVersion 2以降で構想された場合に再評価 |
| 最終判断が必要な人 | プロダクトオーナー（Aで実質確定と考えられるが、注意喚起文言のトーンは⑤節「状態候補」定義時に最終レビューが必要） |

## D3. 複数提出先候補が存在する場合の返却方法

| 項目 | 内容 |
|---|---|
| 論点 | `submission_jurisdictions`に同一（スコープ・種別）で複数の`is_primary=false`代替候補が並ぶ場合、判定エンジンは何を呼び出し元に返すか |
| 背景 | 実データに既に「香椎/博多税務署」のような分割管轄の実例がある。旧`jurisdictions`はUNIQUE制約でどちらか一方に強制確定し、注記は`notes`の自由記述に頼っていた |
| 選択肢A: 主候補のみ返す | `is_primary=true`の1件のみ返し、他候補は`notes`表示のみ（現状踏襲） |
| 選択肢Aの利点 | 既存(site)側UIの表示契約（`office`は1件）を壊さない。実装コスト最小 |
| 選択肢Aのリスク | 分割管轄の実態を構造化せず、今回の設計の主目的である「監査可能性の向上」が活きない |
| 選択肢B: 全候補を配列で返す | 呼び出し側（UI）が「複数の窓口が該当する可能性があります」という状態を表示する |
| 選択肢Bの利点 | 最も正直な情報提供 |
| 選択肢Bのリスク | 既存`ScheduleProcedure.office`型が単一オブジェクト前提のため、呼び出し側の型・UIを全面変更する必要があり、Version 1.1のカットオーバー範囲を超える |
| 選択肢C: 主候補＋代替候補をmetadataで保持（ハイブリッド） | 既存の型契約（単一`office`）は壊さず、代替候補情報は`metadata`として付随させる |
| 選択肢Cの利点 | 既存呼び出し元を壊さずに済み、将来Bへ拡張する際のデータは既に保持できている |
| 選択肢Cのリスク | 現時点でmetadataを使わない呼び出し元では実質Aと同じ効果（当面は活きない） |
| 推奨案 | **C** |
| 推奨理由 | 既存`ScheduleProcedure.office`型・呼び出し元を壊さない非破壊的設計を優先しつつ、将来の拡張データを捨てない。状態としては`multiple_candidates`（後述）を用い、主候補を返しながら「他に候補がある」ことを状態として明示する |
| Version 1.1で対応するか | する（スキーマ・解決ロジックの設計まで）。UI側で代替候補一覧を表示する実装自体はPhase 5以降の任意実装とする |
| 将来対応へ送るか | 代替候補のUI表示（選択肢B相当）はPhase 5以降 |
| 最終判断が必要な人 | プロダクトオーナー（方針）／実装者（Phase5のUI設計時にBへ拡張するか判断） |

## D4. 判定不能時の状態設計

| 項目 | 内容 |
|---|---|
| 論点 | 「判定できない」状態にはどのようなパターンがあり、それぞれをどう区別して返すか |
| 背景 | 現行`resolveOffices`は「見つからなければ`office: null`」という単一の失敗状態しかなく、原因（市区町村未整備／プロフィール不足）を区別できない。全国展開でデータが薄い地域が増えるほど、この区別が運営上重要になる（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02で既に「データ未整備が不具合と誤解される」経験がある） |
| 選択肢A: 単一のnull状態のみ | 現状踏襲 |
| 選択肢Aの利点 | 実装最小 |
| 選択肢Aのリスク | 福岡県以外でnullが返った場合に「バグかデータ未整備か」を運営者もユーザーも区別できず、M-02と同種の誤解を再発させる |
| 選択肢B: 状態モデルを導入 | ⑥節で定義する6状態（`resolved`/`multiple_candidates`/`insufficient_profile`/`requires_employee_address`/`not_supported`/`unverified`）で原因別に区別する |
| 選択肢Bの利点 | 原因別に画面文言・運営者アクションを変えられ、誤解を防げる。実装コストは既存`official_url_status`（4値）と同程度の規模 |
| 選択肢Bのリスク | 状態が増える分、UI実装時の分岐が増える |
| 選択肢C: Bに加え運営ダッシュボード連携 | 状態別の発生件数を運営者向けダッシュボードに集計する |
| 選択肢Cの利点 | 運営効率が上がる |
| 選択肢Cのリスク | Version 1.1のスコープを超える（運営ダッシュボードは別機能） |
| 推奨案 | **B** |
| 推奨理由 | 全国展開は段階的にしか進まない前提（Phase2→3）であり、「未整備」「入力不足」「原理的に非対応」を区別できないとユーザー・運営者双方が混乱する。Cは現時点で必須ではない |
| Version 1.1で対応するか | する（状態モデル自体の設計・実装） |
| 将来対応へ送るか | Cの運営ダッシュボード連携は将来 |
| 最終判断が必要な人 | プロダクトオーナー（状態一覧・文言は⑥節で確定案を提示。表示文言のトーンのみ最終レビューが必要） |

## D5. 既存organizations系テーブルと新4テーブルの正本関係

| 項目 | 内容 |
|---|---|
| 論点 | Phase2〜4の間、実際にどちらのテーブル群が「正本（Single Source of Truth）」なのか。両方に同種のデータが存在する期間、運営者はどちらを更新すべきか |
| 背景 | 前回設計は「Phase5カットオーバー完了まで(site)・既存admin CRUDは旧テーブルを参照し続ける」とだけ記載しており、その間の更新運用（二重管理の防止策）を明記していなかった |
| 選択肢A: 新4テーブルを正本化 | Phase2〜4の間、新4テーブルのみを正本とし、旧`organizations`系は「Phase1.5時点のスナップショットとして凍結・更新しない」 |
| 選択肢Aの利点 | 新規データ整備（福岡県未整備分・全国展開）作業が新テーブルに一本化され、無駄な二重入力が発生しない |
| 選択肢Aのリスク | Phase5カットオーバーが完了するまで、(site)側の表示は「旧テーブルの凍結データ」のままで、新規投入した最新データがすぐには反映されない（タイムラグが生じる） |
| 選択肢B: 旧テーブルを正本のまま維持 | Phase2〜4の間は旧テーブルを更新し続け、新4テーブルへはPhase5カットオーバー直前に一括移行する |
| 選択肢Bの利点 | (site)側の表示は常に最新のまま |
| 選択肢Bのリスク | Phase5直前の一括移行が「一度に大量データを移す一大作業」になり、「小さく作る」段階導入の利点が失われる。移行時の不整合リスクも高い |
| 選択肢C: 両テーブルを並行更新 | Phase2〜4の間、両方のテーブル群を同時に更新する |
| 選択肢Cの利点 | 常にどちらも最新の状態を維持できる |
| 選択肢Cのリスク | 二重メンテナンスコストが最も高く、更新漏れによるデータ不整合が最も起きやすい（`CLAUDE.md`が警告する「GRANT設定の後付け忘れ」と同種の、更新漏れ事故を新たに生む構造） |
| 推奨案 | **A** |
| 推奨理由 | VISION.mdの「小さく作る」原則に合致し、Phase2〜4のデータ整備作業を新テーブルへ一本化できる。(site)側反映のタイムラグは、Phase5を「データ整備完了後すぐ」に前倒しで着手する運用（前回設計の実装順そのもの）で緩和する |
| Version 1.1で対応するか | する（この正本関係の運用ルールをドキュメントに明記する） |
| 将来対応へ送るか | なし（Version 1.1内で確定すべき運用ルール） |
| 最終判断が必要な人 | 開発運営担当（データ投入の実務）／プロダクトオーナー（タイムラグの許容可否） |

## D6. 情報源が更新・削除された場合の扱い

| 項目 | 内容 |
|---|---|
| 論点 | `office_sources`の元になった情報源（公式ページ等）が後から改版・削除された、または記載内容が誤りだったと判明した場合、どう扱うか |
| 背景 | 前回設計は「再検証のたびに新規行を追加し`is_current`を切り替える」という追記型のみを定義しており、「単なる更新」と「過去の内容が誤りだったと判明した撤回」を区別していなかった |
| 選択肢A: 物理削除しない（現状踏襲） | `is_current`をfalseにするのみで、誤りだった行には`notes`に自由記述で注記する |
| 選択肢Aの利点 | シンプル。追加スキーマ変更不要 |
| 選択肢Aのリスク | 「新しい情報で自然に更新された」のか「過去の内容が誤りだった」のかが`notes`の自由記述に依存し、構造化された検索・監査がしにくい |
| 選択肢B: 誤りと判明した行を物理削除 | 撤回された行はDBから削除し、履歴を残さない |
| 選択肢Bの利点 | 表示上のノイズが減る |
| 選択肢Bのリスク | **監査可能性という新設計の主目的そのものを損なう**。過去に誤った情報を表示していた経緯を後から追跡できなくなる。`CLAUDE.md`の「旧テーブルは即座に削除しない」精神にも反する |
| 選択肢C: `status`列を追加 | `office_sources`に`status`（`active`/`superseded`/`retracted`）を追加し、「自然な世代交代」と「誤りだったことが判明した撤回」を区別する |
| 選択肢Cの利点 | 更新理由を区別でき、将来の監査・品質分析に使える |
| 選択肢Cのリスク | Aよりスキーマがわずかに複雑になる（列1つの追加） |
| 推奨案 | **C** |
| 推奨理由 | 本設計はそもそも「情報源・検証履歴を構造化する」ことが目的であり、Bはその目的に反する。Aは実装コストは最小だが、全国展開で誤り訂正が相応の頻度で起きることを考えると自由記述だけでは監査に耐えない。Cの追加コストは小さく、リスク低減効果が大きい |
| Version 1.1で対応するか | する（`office_sources.status`列をPhase1のスキーマに含める） |
| 将来対応へ送るか | なし |
| 最終判断が必要な人 | プロダクトオーナー（コスト対効果として妥当か）／実装者（`status`値のCHECK制約の語彙確定） |

## D7. 判定結果の根拠表示と最終確認日の公開範囲

| 項目 | 内容 |
|---|---|
| 論点 | `jurisdictionReason`（管轄理由）・`last_verified_at`（最終確認日）を一般ユーザー向け画面（(site)・Share・PDF）まで公開するか、admin限定に留めるか |
| 背景 | 既存`official_url_status`の「（未確認）」ラベルは既に一般ユーザーにも表示されている前例がある（[全国対応データ整備ガイド.md](全国対応データ整備ガイド.md) 6節）。一方、確認日の生の日付表示は「この情報は古いのでは」という不安をユーザーに与えかねない（[PROJECT_STATUS.md](PROJECT_STATUS.md)のプロジェクト原則「不安を煽らない」） |
| 選択肢A: 一般公開 | `jurisdictionReason`・`last_verified_at`ともに(site)・Share・PDFに表示する |
| 選択肢Aの利点 | 情報の透明性が最も高い |
| 選択肢Aのリスク | 生の確認日付が「半年前の情報だが大丈夫か」という不要な不安を煽りうる |
| 選択肢B: admin限定 | 一般ユーザー向け画面には一切表示せず、admin管理画面のみで確認できる |
| 選択肢Bの利点 | ユーザーに不安を与えない |
| 選択肢Bのリスク | 「なぜこの窓口なのか」という説明が無くなり、VISION.mdの「調べる時間をなくす」に資する安心材料を提供する機会を失う |
| 選択肢C: 段階的公開 | `jurisdictionReason`は一般公開し、`last_verified_at`の生の日付は非公開、代わりに`official_url_status`由来の定性的なラベル（「（未確認）」等）のみ一般公開する |
| 選択肢Cの利点 | 「なぜこの窓口か」という安心材料は提供しつつ、生の日付による不要な不安を避けられる。既存の`official_url_status`表示という前例と一貫する |
| 選択肢Cのリスク | 定性ラベルの粒度（「未確認」のみで十分か、経過期間に応じた段階表現が必要か）は別途UI検討が必要 |
| 推奨案 | **C** |
| 推奨理由 | 理由表示は安心材料として一般公開する価値が高い一方、生の日付表示はブランド原則（不安を煽らない）と衝突するリスクがある。既存の表示パターン（定性ラベル）を踏襲するのが一貫している |
| Version 1.1で対応するか | する（表示方針の決定のみ。実際の文言デザインはPhase5のUI実装時） |
| 将来対応へ送るか | なし（方針自体はVersion 1.1で確定） |
| 最終判断が必要な人 | プロダクトオーナー／デザイン担当（[SUNBOO_DESIGN_GUIDELINES.md](SUNBOO_DESIGN_GUIDELINES.md)との整合性の最終確認） |

## D8. `organizations`/`organization_offices` 2層→1層統合の是非

| 項目 | 内容 |
|---|---|
| 論点 | 前回設計で`submission_offices`へ統合したことを正式決定とするか |
| 背景 | grep確認で、現状アプリコードは「統括組織単位でのグルーピング表示」を一度も行っていないことを確認済み |
| 選択肢A: 統合のまま確定 | `submission_offices`1テーブルに統合し、`organization_name`は表示用の文字列列として保持する |
| 選択肢Aの利点 | シンプル。テーブル数最小 |
| 選択肢Aのリスク | 将来「法務局とその支局一覧」のようなグルーピングUIが必要になった場合、`organization_name`の文字列一致は表記ゆれに弱い |
| 選択肢B: 2層構造を維持 | `organizations`相当のテーブルを新設し、統合しない |
| 選択肢Bの利点 | 将来のグルーピングUIに強い |
| 選択肢Bのリスク | 現状使われない抽象化を先行投資することになる（`CLAUDE.md`の過剰な抽象化を避ける規約に反する） |
| 推奨案 | **A** |
| 推奨理由 | 実需要の無い抽象化を先行して持たない。将来必要になれば、その時点で正規化を追加する増分対応が可能 |
| Version 1.1で対応するか | する（確定） |
| 将来対応へ送るか | 実需要が具体化した時点で`organization_name`の正規化を再検討 |
| 最終判断が必要な人 | プロダクトオーナー（実質確定でよいと考えられる） |

## D9. `scope_code`のポリモーフィズム

| 項目 | 内容 |
|---|---|
| 論点 | `submission_jurisdictions.scope_code`について、厳密なFK制約を諦めてTEXT列1本にするか、2列＋CHECK制約にするか |
| 背景 | 前回設計は`rule_conditions.field`が自由記述である前例を踏襲し、FK制約なしのTEXT列1本としていた |
| 選択肢A: TEXT列1本（FK無し） | アプリ側で整合性を担保する |
| 選択肢Aの利点 | 既存パターンを踏襲でき、シンプル |
| 選択肢Aのリスク | DBレベルの参照整合性が無く、誤ったコードが混入しても検出されない |
| 選択肢B: 2列＋CHECK制約 | `municipality_scope_id`・`prefecture_scope_id`の2列を持ち、`scope_type`と整合する列のみが埋まることをCHECK制約で強制する |
| 選択肢Bの利点 | DBレベルで参照整合性を保証できる |
| 選択肢Bのリスク | 列が増え、`scope_type='national'`の場合は両方NULLという扱いが必要になり、CHECK制約がやや複雑になる |
| 推奨案 | **B** |
| 推奨理由 | `submission_jurisdictions`は「管轄の正本」という監査対象データであり、`rule_conditions`（条件が誤っても単に不成立になるだけ）より整合性要求が高い。誤ったコード混入時の実害（会社を誤った窓口に案内する）が大きいため、FK保証のコストを払う価値がある |
| Version 1.1で対応するか | する（2列＋CHECK制約に変更して確定） |
| 将来対応へ送るか | なし |
| 最終判断が必要な人 | 実装者（DB設計）／プロダクトオーナー（追認） |

## D10. `conditions` JSONB vs 子テーブル

| 項目 | 内容 |
|---|---|
| 論点 | `procedure_submission_rules`の条件をJSONB配列のままにするか、`rule_conditions`に合わせて子テーブル化するか |
| 背景 | 前回設計はJSONB配列を採用。理由は「想定件数が少なく、専用の子テーブルを新設するコストに見合わない」 |
| 選択肢A: JSONB配列のまま | 前回設計を維持する |
| 選択肢Aの利点 | テーブル数を増やさず（ユーザー指定の4テーブル構成を維持）、想定件数（手続きあたり数件程度）には十分な表現力 |
| 選択肢Aのリスク | 管理画面で条件を1件ずつCRUD編集したくなった場合、JSONBエディタ相当のUIが必要になり、既存`rule_conditions`編集UI（フォーム）パターンを流用できない |
| 選択肢B: 子テーブル化 | `procedure_submission_rule_conditions`を新設し、`rule_conditions`と同じ構造にする |
| 選択肢Bの利点 | 既存Rule Engine管理画面のUIパターンをそのまま流用できる |
| 選択肢Bのリスク | テーブル数が増える（今回指定された4テーブル構成を超える） |
| 推奨案 | **A（ただし将来Bへ移行しやすい形を維持する）** |
| 推奨理由 | 指定された4テーブル構成を維持しつつ、現時点の要件はJSONBで表現可能。UI実装時にJSONBエディタが使いにくいと判明すれば、その時点でBへ移行する（JSONB→子テーブルへのデータ移行は比較的容易な部類） |
| Version 1.1で対応するか | する（JSONB案で確定） |
| 将来対応へ送るか | 管理画面UI実装（Phase5前後）時に再評価 |
| 最終判断が必要な人 | 実装者（admin UI担当）。Phase5着手時に再判断 |

## D11. `official_url_status` vs `last_verified_at` 分離

| 項目 | 内容 |
|---|---|
| 論点 | リンク生存確認（`official_url_status`）と内容の正確性検証（`last_verified_at`/`office_sources`）を統合するか、分離を維持するか |
| 背景 | 前回設計で「別軸のまま」と仮の推奨を示していたが、正式な決定として再確認する |
| 選択肢A: 分離維持 | 現状踏襲。2つの指標をそれぞれ独立して管理する |
| 選択肢Aの利点 | 失敗モードが異なる（リンク切れ vs 内容の陳腐化）ため、原因を区別できる |
| 選択肢Aのリスク | UI上、2つの指標を両方見せると情報過多になりうる |
| 選択肢B: 統合 | 単一の「信頼度スコア」にまとめる |
| 選択肢Bの利点 | UIがシンプルになる |
| 選択肢Bのリスク | 「リンクは生きているが内容が古い」という実際に起こりうるケース（庁舎移転後もリダイレクトが正しく設定され旧ページが表示され続ける等）を隠してしまう |
| 推奨案 | **A（分離維持）** |
| 推奨理由 | 前回設計時の判断を維持する。実害（誤情報の隠蔽）を避けることをUIのシンプルさより優先する |
| Version 1.1で対応するか | する（分離のまま確定） |
| 将来対応へ送るか | UI表示の見せ方（1つの複合バッジにまとめる等の表現上の工夫）はPhase5のデザイン検討課題として送る |
| 最終判断が必要な人 | デザイン担当（表示方法）／プロダクトオーナー（方針自体は分離で確定） |

## D12. 全国展開データ調査体制

| 項目 | 内容 |
|---|---|
| 論点 | Phase3（47都道府県展開）のデータ調査をどのように行うか |
| 背景 | 福岡県1県で72判定単位・数十窓口規模の調査を要した実績がある。47都道府県規模は単純計算でその約8倍のデータ量になる |
| 選択肢A: 現行の人手CRUD/CSV運用を継続 | 既存の管理画面CRUD＋CSVインポート運用をそのまま拡大する |
| 選択肢Aの利点 | 既存運用の延長でリスクが低い |
| 選択肢Aのリスク | 47都道府県規模では人手のみでの調査コスト・時間が大きくなる可能性が高い（未検証） |
| 選択肢B: 半自動化 | 公式機関のオープンデータ・APIの有無を調査し、活用できないか検討する |
| 選択肢Bの利点 | コスト削減の可能性がある |
| 選択肢Bのリスク | 公式機関がオープンデータ・APIを提供しているか自体が未調査であり、調査そのものが新たな工数になりうる |
| 選択肢C: 外部データベンダーとの提携 | 住所・行政機関データを提供する外部ベンダーとの提携を検討する |
| 選択肢Cの利点 | コスト・スピード両面で有利な可能性がある |
| 選択肢Cのリスク | データの正確性・更新頻度をベンダーに依存することになり、本設計冒頭の「公式情報を正本とする」原則との整合性を個別に検証する必要がある |
| 推奨案 | **保留（今回は選定しない）** |
| 推奨理由 | Phase3自体がVersion 1.1のスコープ外（未着手フェーズ）であり、現時点で調査体制を決め打ちすると、Phase2（福岡県）の実績が出る前の推測になる。VISION.mdの「実務データの検証なしの断定をしない」原則に照らし、Phase2完了後の実工数実績を基に再評価するのが適切 |
| Version 1.1で対応するか | **しない** |
| 将来対応へ送るか | 送る（Phase2完了後に再評価） |
| 最終判断が必要な人 | プロダクトオーナー（Phase2実績確認後） |

---

## ⑥ 判定結果の状態候補（State Model）

D3・D4の決定を受け、判定エンジンが返す状態を6種類に定義する。**状態は排他的に評価される（後述の
優先順位で最初に該当したものを採用する）が、`unverified`のみは例外で、`resolved`/`multiple_candidates`
に付随する副次フラグ（`dataFreshness: 'verified' | 'unverified'`）として扱う。** これは「情報源が古い
かどうか」と「窓口が何件確定するか」が独立した軸だからである（D11で分離を維持した判断と一貫させる）。

### 状態の評価優先順位（実装者が独自判断しないための固定順序）

1. `insufficient_profile`（会社プロフィール不足）— 最初に判定。プロフィールが揃っていなければ以降のテーブル参照自体を行わない
2. `requires_employee_address`（`procedure_submission_rules.recipient_scope='each_employee'`が採用された）
3. `not_supported`（`submission_jurisdictions`が municipality/prefecture/national いずれのスコープでも0件）
4. `multiple_candidates`（`is_primary=true`1件＋`is_primary=false`の代替候補が存在）
5. `resolved`（`is_primary=true`1件のみ、代替候補なし）

上記4・5に対し、`office_sources.is_current=true`行の`last_verified_at`が
`submission_offices.verification_due_at`を超過している場合、または`official_url_status='unchecked'`
の場合は、`dataFreshness='unverified'`を付随させる（超過していなければ`'verified'`）。

### 状態定義表

| 状態 | 意味 | 発生条件 | 画面表示文言（(site)/Workspace） | PDF表示 | Share表示 | 運営者が取るべき行動 |
|---|---|---|---|---|---|---|
| `resolved` | 提出先窓口が一意に確定した | ①`office_category`確定、②いずれかのスコープで`is_primary=true`が1件のみヒット | 窓口名・住所・電話・（あれば）公式URLをそのまま表示。特別な注意書きは無し | 窓口名・提出方法を通常表示 | 通常表示（site/adminと同一情報） | 特になし（正常系）。`verification_due_at`超過時は再検証タスクの対象 |
| `multiple_candidates` | 主候補は確定できるが代替候補が存在する | 同一（スコープ・種別）に`submission_jurisdictions`行が複数存在 | 「主な窓口は◯◯ですが、住所によっては別窓口が対象になる場合があります。詳しくは公式サイトでご確認ください」 | 主候補のみ表示（代替候補の注記は紙面制約により省略可、Phase5実装時に判断） | site同様、注記付きで表示 | 分割条件（町丁目等）が`notes`に正しく記載されているか定期確認。住所細分化データが得られれば`resolved`への格上げを検討 |
| `insufficient_profile` | 会社プロフィールの入力が不足している | `municipality_code`/`prefecture_code`未入力、または`procedure_submission_rules.conditions`が参照する項目が未入力 | 「会社情報の入力が完了すると提出先が表示されます」 | 該当行を「情報未入力」として空欄表示（推測で埋めない） | 同左（共有先が「プロフィール未完成」と分かる表示） | 特になし（ユーザー入力待ち）。頻発する場合はプロフィール入力UIの改善対象として記録 |
| `requires_employee_address` | 従業員ごとに提出先が異なる（D2） | `procedure_submission_rules.recipient_scope='each_employee'`が採用された | 「この手続きは従業員ごとに提出先が異なります。各従業員の1月1日時点のお住まいの市区町村にご確認ください」 | 窓口欄を定型文で埋める（空欄にしない、能動的な注意喚起） | 同左 | 特になし（D2でC案=真の判定実装は将来送りとしたため、現状は文言運用のみ） |
| `not_supported` | 全国展開が未達のエリア | `submission_jurisdictions`にmunicipality/prefecture/nationalいずれのスコープでも該当`office_category`の行が0件 | 「お住まいの地域はまだSUNBOOの対応エリア外です。対応エリア拡大まで今しばらくお待ちください」 | 「対応エリア外」の定型文 | 同左 | **重要**: 発生頻度・地域を集計し、Phase3全国展開の優先順位付けの入力データとする（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02の集計手法を踏襲） |
| `unverified`（副次フラグ） | 窓口は確定したが検証情報が古い／未確認 | `official_url_status='unchecked'`、または`last_verified_at`が`verification_due_at`を超過 | 既存「（未確認）」表示を踏襲。「※最新情報は公式サイトでご確認ください」（D7でC案とした定性ラベルのみ公開） | 窓口情報表示＋末尾に控えめな「※要確認」注記 | 同左 | 再検証タスクのバックログ化（Phase5以降の運営ダッシュボード構想への入力） |

---

## 本章の報告

### 推奨決定事項（D1〜D11、D12を除く全11項目）

- D1: 郵便番号は判定キーとして不採用。窓口側表示情報としてのみ保持
- D2: 従業員ごとに提出先が変わる手続きは「窓口断定なし・注意喚起フラグのみ」
- D3: 複数候補は「主候補を返しつつ代替候補をmetadataで保持」（`multiple_candidates`状態）
- D4: 判定不能時は6状態モデル（`resolved`/`multiple_candidates`/`insufficient_profile`/
  `requires_employee_address`/`not_supported`/`unverified`）を採用し、固定の優先順位で評価する
- D5: Phase2〜4の間は新4テーブルのみを正本とし、旧`organizations`系は凍結する
- D6: `office_sources`に`status`（`active`/`superseded`/`retracted`）列を追加し、撤回を構造化する
- D7: 判定理由は一般公開、最終確認日は定性ラベルのみ公開（生の日付は非公開）
- D8: `organizations`/`organization_offices`の統合は確定のまま維持
- D9: `submission_jurisdictions.scope_code`はTEXT1列からポリモーフィズムを解消し、2列＋CHECK制約に変更
- D10: `procedure_submission_rules.conditions`はJSONB配列のまま確定
- D11: `official_url_status`と`last_verified_at`は分離維持

### 保留事項

- D12（全国展開データ調査体制）: Phase2（福岡県）完了後の実工数実績を待って再評価する。
  今回は選定しない

### Version 1.1で必須のもの

D1〜D11のすべて。いずれも①節のテーブル設計（特にD6の`status`列追加、D9の`scope_code`2列化）・
③節の判定ロジック（D2・D3・D4）・④節の更新戦略（D6）・GRANT/RLS節に直接影響するため、
マイグレーション作成前に確定させる必要がある。

### Phase2（福岡県）実装前に確定すべきもの

- **D5**（正本関係の運用ルール）: データ投入をどちらのテーブル群に対して行うかが定まっていないと、
  Phase2の作業自体を開始できない
- **D9**（`scope_code`の2列化）: Phase2で福岡県72判定単位分の`submission_jurisdictions`を投入する際の
  データ形式に直結する
- **D6**（`office_sources.status`列）: Phase2で情報源データを投入する際のテーブル定義に直結する
- **D1**（郵便番号不採用の確定）: `CompanyProfile`側のスキーマに触れないことを確認しておく
  （Phase2着手後の手戻りを防ぐ）
- **D3・D4**（複数候補・状態モデル）: 福岡県データには既に「香椎/博多税務署」のような分割管轄の実例が
  含まれるため、72判定単位規模でも`multiple_candidates`が実際に発生する。Phase2のデータ投入時点で
  状態モデルが定まっていないと、分割管轄データの投入方法自体が決められない

### レビュー待ちで停止する。

