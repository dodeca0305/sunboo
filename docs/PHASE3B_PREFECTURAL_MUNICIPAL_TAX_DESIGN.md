# PHASE3B_PREFECTURAL_MUNICIPAL_TAX_DESIGN.md — Category B（prefectural_tax / municipal_tax）設計・調査計画

**ステータス: 設計・調査計画のみ。コード・Migration・データ投入は本ドキュメントでは一切行っていない。**

前提: Phase3A（`tax_office`/`legal_affairs_bureau`/`pension_office`/`labor_standards`/`hello_work`の
移植Migration・Resolver・RLS）は設計・実装済み（実DB適用はユーザー確認待ち）。本Phase3Bはこれを変更せず、
新4テーブル（`submission_offices`/`submission_jurisdictions`/`office_sources`/
`procedure_submission_rules`）をそのまま継続利用する。Rule Engine・Procedure Master・既存
`organizations`系テーブルは引き続き変更しない。

---

## 0. 前提として確認した事実（推測ではなく実データ・実コード確認）

設計に入る前に、Procedure Masterの実際の内容を機械的に確認した。

- `PREFECTURAL_RESIDENT_TAX_RETURN`（法人県民税申告）・`PREFECTURAL_BUSINESS_TAX_RETURN`
  （法人事業税申告）が`office_type='prefectural_tax'`として既存
- `MUNICIPAL_RESIDENT_TAX_RETURN`（法人市民税申告）・`DEPRECIABLE_ASSET_TAX_RETURN`（償却資産申告）・
  `SALARY_PAYMENT_REPORT`（給与支払報告書）・`RESIDENT_TAX_WITHHOLDING`（特別徴収税額の納付）が
  `office_type='municipal_tax'`として既存
- **「特別法人事業税」という名称のprocedureは存在しない。** 全SQLファイルを検索したが1件もヒットしない
- **「事業所税」という名称のprocedureも存在しない。** `docs/COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md`に
  将来課題として1箇所言及されているのみで、`procedures`テーブルには一度も投入されていない
- `organization_types`には`prefectural_tax`・`municipal_tax`が既に存在する（Phase1.5で定義済み。
  新規追加は不要）
- 福岡県分の`prefectural_tax`/`municipal_tax`窓口データは、旧スキーマ・新スキーマともに0件
  （東京都渋谷区の1件ずつのみ）。[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02として既知のギャップ

この確認結果は、以下の設計全体の前提になる。

---

## ① 必要な提出先分類

`organization_types`に既存の`prefectural_tax`（都道府県税事務所）・`municipal_tax`（市区町村税務課）の
2分類で足りる。**新しい分類コードの追加は不要**（②③の対応表がこの2分類で完結するため）。

## ② Procedure Masterとの対応表

| procedure code | 手続き名 | 現状の`office_type` | 備考 |
|---|---|---|---|
| `PREFECTURAL_RESIDENT_TAX_RETURN` | 法人県民税申告 | `prefectural_tax` | |
| `PREFECTURAL_BUSINESS_TAX_RETURN` | 法人事業税申告 | `prefectural_tax` | **特別法人事業税は、実務上この申告書と同一の提出先・同一の手続きで扱われる**（国税ではあるが都道府県税事務所が徴収を代行する制度）。独立したprocedureは存在せず、本Phaseで新設もしない。`PREFECTURAL_BUSINESS_TAX_RETURN`の提出先解決がそのまま特別法人事業税もカバーする、という解釈で進める（⑪未確定事項で要確認） |
| `MUNICIPAL_RESIDENT_TAX_RETURN` | 法人市民税申告 | `municipal_tax` | |
| `DEPRECIABLE_ASSET_TAX_RETURN` | 償却資産申告 | `municipal_tax` | |
| `SALARY_PAYMENT_REPORT` | 給与支払報告書 | `municipal_tax` | `recipient_scope='each_employee'`（Phase2で設定済み、変更不要） |
| `RESIDENT_TAX_WITHHOLDING` | 特別徴収税額の納付 | `municipal_tax` | 同上 |
| （事業所税に対応するprocedureなし） | — | — | **Procedure Master未実装。本Phase3Bのスコープ外**（下記「リスク」参照） |

## ③ `migration_organizations.sql`から再利用できるデータ

- **`organization_types`の`prefectural_tax`/`municipal_tax`定義自体**（新規追加不要、③そのまま使う）
- **東京都渋谷区の2件**（東京都渋谷都税事務所・渋谷区役所（税務課））は、住所・電話等の**実データは
  福岡県に転用できない**（都道府県が異なるため）が、「どういう列に何を埋めるべきか」という**構造の見本**
  として参照する価値はある
- **`_sunboo_upsert_office`ヘルパー関数のパターン**（office→jurisdictions を1トランザクションで
  冪等投入する設計）は、Phase3Bのデータ投入時にも同じ設計思想を踏襲できる
- **Phase3Aで構築したCTEベースの移植パターン**（`submission_offices`→`office_sources`→
  `submission_jurisdictions`の順で投入する構成）は、投入元がSELECT文（Phase3A）かVALUES/CSV
  （Phase3B）かの違いだけで、テーブル構成・冪等化の設計はそのまま再利用できる

## ④ 新規調査が必要なデータ

| 分類 | 調査内容 | 現状 |
|---|---|---|
| `prefectural_tax` | 福岡県の県税事務所の数・名称・住所・電話・公式URL・管轄市区町村 | **全て未確認**。福岡県庁公式サイトでの一次調査が必要 |
| `municipal_tax` | 福岡県72判定単位それぞれの税務担当課の名称・住所・電話・公式URLページ | **全て未確認**。72判定単位個別の一次調査が必要 |

## ⑤ 福岡県72判定単位の調査単位

- **`prefectural_tax`**: 「県税事務所」単位。都道府県税事務所は複数の市区町村をまとめて管轄する
  広域拠点である可能性が高い（他の5分類・東京都の例と同じ構造）ため、**72回ではなく、実際の
  県税事務所数と同じ回数の調査**で済むと想定される。ただし福岡県が実際に何ヶ所の県税事務所を
  持つか（1ヶ所に集約か、複数拠点による地域分担か）は未確認であり、調査の第一歩はまず
  「福岡県庁公式サイトで県税事務所一覧ページを見つけ、拠点数を確定させること」になる
  （本Phase3B-0で実施、後述）
- **`municipal_tax`**: 原則「判定単位」単位。各市区町村（政令指定都市は区単位）が自身の
  税務担当課を持つため、72判定単位＝原則72回の個別調査になる（一部事務組合等の共同処理がある
  場合は例外、⑥参照）

## ⑥ 市町村税の共通パターン

- 郵便番号・住所表記の形式は市区町村ごとに統一されておらず、機械的な一括取得はできない
  （API等は存在しない）
- 多くの市区町村公式サイトは「税務課」「市民税課」等の部署ページに住所・電話・郵送先が
  明記されているため、調査手順自体は各分類共通で「公式サイト→組織一覧→税務担当課ページ」という
  同じ経路をたどれる可能性が高い（未検証の仮説）
- 郡単位（例: 糟屋郡7町・田川郡7町・築上郡3町等）でグルーピングして調査すると、近隣自治体の
  サイト構成が似ている場合に効率化できる可能性がある（これも未検証の仮説であり、実際に数件
  着手した時点で確認する）
- 一部事務組合等による複数町村の税務事務共同処理があるかどうかは未確認（前回のPhase3計画から
  持ち越しの未確認事項）

## ⑦ Resolverへ追加する`office_category`

**追加不要。** ①の結論の通り、既存の`prefectural_tax`/`municipal_tax`をそのまま使う。

## ⑧ Migration構成（構成の設計のみ、実際のSQLは今回書かない）

- ファイル名候補: `supabase/migration_national_submission_directory_phase3b.sql`（実装フェーズで作成）
- Phase3計画書（[PHASE3_FUKUOKA_DATA_EXPANSION_PLAN.md](PHASE3_FUKUOKA_DATA_EXPANSION_PLAN.md) 3-2節）で
  既に設計したCSV→staging→mergeパターンをそのまま使う（Phase3Aは「移植」のためDB内SQLで完結したが、
  Phase3Bは「新規調査」のためCSVテンプレートを経由する）
- 段階分割案:
  - **3B-1（`prefectural_tax`）**: 拠点数が少ないと想定されるため先に完了させる
  - **3B-2（`municipal_tax`）**: 72件規模のため、郡単位等でバッチを分けて投入する運用を想定
    （例: 政令市7区+7区、27市、7郡41町村、のようなグループ単位で数回に分割）
- Phase3Aと同様、依存データ存在確認（`organization_types`/`municipalities`の該当コードが
  存在するかのWARNINGチェック）を投入スクリプトの先頭に含める設計とする

## ⑨ Resolverで追加が必要な分岐

**基本的に追加不要という設計結論になる。** `src/lib/submissionDirectory/resolve.ts`の
`findAtScope`（市区町村→都道府県→全国の降格探索）は`office_category`に依存しない汎用実装であり、
Phase1の設計時点で`prefectural_tax`のような「都道府県単位で集約されうる」分類を見越して
`scope_type='prefecture'`を既に用意してある（D9決定）。

- `prefectural_tax`が「1都道府県=1拠点」（`scope_type='prefecture'`1行）だった場合も、
  「複数拠点による地域分担」（`scope_type='municipality'`の多対1）だった場合も、
  **どちらのケースも既存のResolverコードでそのまま処理できる**（分岐の追加は不要）
- `municipal_tax`は既存5分類と同じ`scope_type='municipality'`の1対1パターンで扱える見込み
- 唯一、実装時に再検討が必要になりうるのは、調査の結果「県税事務所が複数の管轄パターンを
  同時に持つ」ような、既存5分類にも無かった新しい構造が見つかった場合のみ（現時点では
  そのような複雑なケースの存在は確認されていない）

## ⑩ 想定テストケース

- 福岡市中央区 × 法人県民税申告 → `resolved`（`prefectural_tax`確定）
- 福岡市中央区 × 法人事業税申告 → `resolved`（同一窓口、特別法人事業税も暗黙にカバーされる想定）
- 福岡市中央区 × 法人市民税申告 → `resolved`（`municipal_tax`確定）
- 福岡市中央区 × 償却資産申告 → `resolved`（同上）
- 給与支払報告書・特別徴収税額の納付 → `requires_employee_address`のまま
  （Phase3Bのデータ投入が増えても、この2手続きの`recipient_scope='each_employee'`設定は不変。
  会社所在地の`municipal_tax`窓口を誤って代替表示しないことの回帰確認として重要）
- 分割管轄が発生する場合 → `multiple_candidates`（発生するかどうかは調査結果次第、Phase3Aの
  `pension_office`のような共同管轄が`prefectural_tax`/`municipal_tax`にもあり得るため、
  投入時に既存notesを注意深く確認する）
- 福岡県72判定単位全件で`prefectural_tax`/`municipal_tax`が`resolved`または`multiple_candidates`に
  なること（Phase3Aと同じ全件検証パターンをそのまま踏襲する）
- 事業所税に対応する手続きがProcedure Masterに存在しないことを前提に、そのテストケース自体を
  スコープ外として明記する（存在しないprocedureに対するテストは書けない）

## ⑪ 想定工数

前回のPhase3計画（[PHASE3_FUKUOKA_DATA_EXPANSION_PLAN.md](PHASE3_FUKUOKA_DATA_EXPANSION_PLAN.md) 2-6・
2-7節）と同じ目安を据え置く。新たな実測情報は今回得ていないため、数値を更新する根拠が無い。

| 分類 | 想定工数（未検証の目安） |
|---|---|
| `prefectural_tax` | 2〜3人日 |
| `municipal_tax` | 2.5〜5人日 |
| **合計** | **4.5〜8人日** |

⑨の結論（Resolverコード変更が基本的に不要）により、実装フェーズの工数は**データ調査・投入作業に
集中**でき、Resolver改修コストは見積りに含めなくてよい可能性が高い。

## ⑫ 全国展開へ繋がる設計になっているかレビュー

| 観点 | 評価 |
|---|---|
| `office_category`の語彙 | 既存コードの再利用のみで、都道府県固有の新コードを作っていない。**良好** |
| `scope_type`の3階層モデル（municipality/prefecture/national） | Phase1設計時点で全国展開・広域集約を見越して設計済み（D9）。`prefectural_tax`がどちらのパターンでも対応できる。**良好** |
| 投入形式（CSV→staging→merge） | 都道府県コード・市区町村コードをキーにしており、47都道府県のどこでも同じテンプレートを使い回せる。**良好** |
| データ量の非対称性 | `municipal_tax`は全国約1,700件規模になる見込みで、他の6分類（都道府県ごとに数十〜100件規模）と性質が異なる。今回のFukuoka72件調査の実測工数が、D12（全国展開データ調査体制）判断の一次データになる（既存合意の再確認、変更なし） |
| Procedure Master側の未整備（事業所税） | 今回新たに判明した論点。**「新しいoffice_categoryを作る前に既存を使えないか検討する」という設計原則は、Procedure Master側にも同じ規律で適用すべき**（安易に事業所税用の新設procedureを追加する前に、既存`municipal_tax`で表現できることを確認する、という方針は既に整合している） |

---

## リスク

1. **事業所税に対応するprocedureがProcedure Masterに存在しない。** ユーザーが目的として明記した
   3つの市町村税手続きのうち1つが、そもそもシステムに実装されていない。本Phase3Bのスコープ
   （Resolver・Migration設計）では解決できない（Procedure Master変更は禁止事項のため）
2. **特別法人事業税を`PREFECTURAL_BUSINESS_TAX_RETURN`に暗黙的に含める解釈**が、ユーザーの意図と
   一致しているか未確認のまま進めている。もし独立した案内が必要という意図であれば、別途
   Procedure Master側の検討が必要になる
3. **福岡県の県税事務所の実際の管轄構造が未確認**。想定より複雑な構造（例: 税目によって
   管轄が異なる等）だった場合、⑨の「Resolver変更不要」という結論を覆す可能性がある
4. `municipal_tax`の72件データ投入は、Phase3計画時点から変わらず最重量の作業であり、
   本設計フェーズだけでは実際の所要時間を確定できない

## 未確定事項

1. 事業所税をProcedure Masterへ将来追加するかどうか（追加する場合は別Phase・別スコープの
   意思決定が必要）
2. 特別法人事業税を法人事業税申告と同一提出先として扱う解釈でよいか
3. 福岡県の県税事務所の実際の数・管轄構造（未調査）
4. 市町村税務の一部事務組合等による共同処理の有無（未調査）

## 推奨方針

- ⑦⑨の設計結論により、**Phase3Bの実装フェーズはResolverコード変更を伴わず、データ調査・投入
  のみに収束する**見込みである。実装計画を立てる際はこれを前提にスコープを絞ってよい
- **事業所税は今回のPhase3Bスコープから明示的に除外**し、対応する場合は別途「Procedure Master
  拡張」の意思決定を先に得ることを推奨する（本ドキュメントの検討によって代替できるものではない）
- 実装（Migration作成・データ投入）に進む前に、まず**「福岡県の県税事務所は何ヶ所あり、
  どう地域分担しているか」を確認するだけのミニ調査タスク**を独立して挟むことを推奨する。
  これにより⑪の`prefectural_tax`工数見積り（2〜3人日）の前提を固められる
- レビュー待ちで停止する。
