# PHASE4_GEOGRAPHY_MASTER_PLAN.md — Phase4-2: 全国地理マスタ整備計画

**ステータス: 設計のみ。コード・Migration・SQL・データ投入は本ドキュメントでは一切行っていない。**

前提: [ADR_MUNICIPALITY_CODE_CANONICAL_FORMAT.md](ADR_MUNICIPALITY_CODE_CANONICAL_FORMAT.md)（D14、
6桁統一、Accepted）・[PHASE4_GEOGRAPHY_MASTER_AUDIT.md](PHASE4_GEOGRAPHY_MASTER_AUDIT.md)（現状監査、
承認済み）を踏まえ、`prefectures`/`municipalities`を安全に全国展開するためのMigration設計を行う。
本ドキュメントの承認後、実際のMigrationファイル作成は別タスクとする。

作成日: 2026-07-17。

---

## 0. スコープの明確化

本計画がカバーするのは**政令指定都市20市の地理マスタ（都道府県14件・行政区157件）のみ**である。
[NATIONAL_SUBMISSION_DIRECTORY.md](NATIONAL_SUBMISSION_DIRECTORY.md) D12（全国約1,700市区町村への
展開データ調査体制）は引き続き保留のままであり、本計画はそれを前倒しで実施するものではない。

**福岡県との違いに注意**: 福岡県はPhase1.5で「60自治体・72判定単位」という**県内全域**を一括投入した
（政令市の区だけでなく一般市町村も含む）。本計画は逆に、**各都道府県のうち政令指定都市の行政区のみ**
を投入し、同一都道府県内の他の市町村（例: 北海道内の函館市・旭川市等）は対象外とする。この違いは
1節で理由とともに整理する。

---

## 1. 全国地理マスタ追加の方針整理

### 1-1. なぜ「政令市の区のみ」で足りるのか（福岡県方式との違い）

`municipalities`に存在しない市区町村は、会社プロフィールの都道府県→市区町村プルダウンで**選択肢
そのものに現れない**（[COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md](COMPANY_ADDRESS_OFFICE_RESOLUTION_DESIGN.md)
が確認済みの「連動プルダウンによる直接選択」方式）。つまり、ある都道府県の一部市区町村だけを
投入しても、**未投入の市区町村はユーザーが選択できないだけであり、誤った判定結果を返すリスクは
無い**（`not_supported`ではなく、そもそも選択肢に出ない）。

したがって、「県内全域を一括投入する」（福岡県方式）と「政令市の区だけ投入する」のどちらでも
安全性に差は無く、**スコープを政令市の区だけに絞ることで作業量を最小化できる**
（[CLAUDE.md](../CLAUDE.md)「小さく作る」原則）。福岡県が全域投入だったのは、Phase1.5時点で
「福岡県対応」を製品として謳う目標があったためであり、本Phase4は「政令市Discoveryを完成させる
ための前提整備」が目的であるため、スコープの取り方が異なることは正当な設計判断として記録する。

### 1-2. 段階的な全体像

```
Phase4-2（本計画）: 政令指定都市20市の地理マスタのみ
        │
        ├─ 対象14道府県の prefectures 追加
        └─ 対象18市157区の municipalities 追加（北九州市・福岡市は追加済み）
        │
        ▼
Phase4-3以降（未着手）: 各都市のDiscovery（[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md)
に従い1都市ずつ）→ 提出先Migration（`phase3c2.sql`/`phase3c3.sql`と同型）
        │
        ▼
将来（D12、保留中）: 全国約1,700市区町村への全面展開
```

本計画は「Phase4-2」の1点のみを扱う。Discoveryの進め方・提出先データの投入方針は
[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md)が正本であり、本計画では扱わない。

---

## 2. Migration分割方針

地理マスタ（本計画の対象）と提出先データ（Discovery由来、既存の`phase3c2.sql`/`phase3c3.sql`と同型）は、
**データの性質が異なるため、明確に別系統のMigrationとして分離する**。

| 系統 | 検証方法 | 更新頻度 | Migration単位 |
|---|---|---|---|
| 地理マスタ（`prefectures`/`municipalities`） | 総務省が公表する単一の公式コード表と機械的に突合するだけで足りる（3節・4節） | 稀（行政区再編時のみ、例: 浜松市2024年再編） | **本計画のスコープ。1〜数本のMigrationで一括投入可能** |
| 提出先データ（`submission_offices`等） | 自治体ごとに複数の公式ページを人手（またはAIエージェント）で個別確認する必要がある（[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md)） | 都市ごとに調査完了時点で随時 | 都市ごとに個別Migration（`phase3c2.sql`型） |

この違いにより、**地理マスタは全18市分をまとめて先に投入し、提出先データは引き続き1都市ずつ
Discovery→Migrationのペースで進める**という分離が成立する（8節「実装順序」で詳述）。これにより、
現在「札幌市Discoveryは完了しているが地理マスタが無くMigrationが書けない」状態にある残り19都市すべてが、
本計画の完了時点で一斉にブロック解除される。

### 2-1. ファイル構成案

| ファイル名（案） | 内容 | 既存Migrationとの関係 |
|---|---|---|
| `migration_shibuya_code_canonical_format.sql` | 渋谷区`code`を`13113`→`131130`へ修正（ADR D14） | 独立。他に依存しない。**最初に単独で実施** |
| `migration_designated_cities_geography.sql` | 14道府県の`prefectures`＋157区の`municipalities`を追加 | `migration_organizations.sql`（福岡県投入）と同型・並列の構成。既存ファイルは書き換えない |

2ファイルに分ける理由: 前者は**既存データの修正**（UPDATE）、後者は**新規データの追加**（INSERT）で
あり、リスクの性質が異なる（修正は既存参照を壊すリスクがあるため単独で検証したい、追加は
非破壊的でリスクが低い）。CLAUDE.mdの「マイグレーションファイルは小さく分ける」精神と、
ADR D14の移行方針（9節）で既に「別タスクとして先に実施」としていた区分を踏襲する。

`migration_designated_cities_geography.sql`をさらに都道府県ごとに分割するかは5節で扱う。

---

## 3. prefectures投入方針

### 3-1. 対象14道府県とJIS X0401都道府県コード

都道府県コード（2桁）はJIS X0401で定義された、47年以上変更の無い安定した体系であり、
[PHASE4_GEOGRAPHY_MASTER_AUDIT.md](PHASE4_GEOGRAPHY_MASTER_AUDIT.md) 6節の18市20都市リストに対応する
14道府県は以下の通り（既存2件と合わせ、投入後は16/47件になる）。

| コード | 都道府県名 | 対応する政令指定都市 |
|---|---|---|
| 01 | 北海道 | 札幌市 |
| 04 | 宮城県 | 仙台市 |
| 11 | 埼玉県 | さいたま市 |
| 12 | 千葉県 | 千葉市 |
| 14 | 神奈川県 | 横浜市・川崎市・相模原市 |
| 15 | 新潟県 | 新潟市 |
| 22 | 静岡県 | 静岡市・浜松市 |
| 23 | 愛知県 | 名古屋市 |
| 26 | 京都府 | 京都市 |
| 27 | 大阪府 | 大阪市・堺市 |
| 28 | 兵庫県 | 神戸市 |
| 33 | 岡山県 | 岡山市 |
| 34 | 広島県 | 広島市 |
| 43 | 熊本県 | 熊本市 |

**この2桁コードは都道府県コードという最も基礎的・安定した体系であり、電話番号・部署名のような
自治体ごとの調査対象とは性質が異なるため、[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md)
1-3節が禁じる「推測」には当たらないと判断する。** ただし実装Migration作成時には、念のため
[総務省｜全国地方公共団体コード](https://www.soumu.go.jp/denshijiti/code.html)の公式コード表と
機械的に突合し、誤記が無いことを確認する（4-3節の突合ステップと合わせて一度に実施）。

### 3-2. 投入方法

`migration_organizations.sql`の前例（`INSERT INTO prefectures (code, name) VALUES ('40', '福岡県')
ON CONFLICT (code) DO NOTHING;`）と同じ冪等パターンを14道府県分に拡張する。既存2件との衝突は
`code`にUNIQUE制約があるため`ON CONFLICT`で自然に回避される。

---

## 4. municipalities投入方針

### 4-1. データソース

157区の`code`（6桁、ADR D14）・`name`は、以下いずれかの一次資料で機械的に確認してから投入する
（本計画では実際の確認・投入は行わない、実装タスクへ申し送る）。

- [総務省｜全国地方公共団体コード](https://www.soumu.go.jp/denshijiti/code.html)（本監査時点では
  文字コード化けで直接フェッチできなかった。実装時は別の取得方法— 例: ダウンロード提供される
  CSV/Excelファイルを直接取得する、または[e-Stat 市区町村コードから探す](https://www.e-stat.go.jp/municipalities/cities/areacodesearch)
  で個別に突合する — を検討する）
- [e-Govデータポータル「全国地方公共団体コード（総務省所管）」](https://data.e-gov.go.jp/data/dataset/soumu_20140909_0395)
- 政令指定都市化・行政区再編があった都市（浜松市の2024年再編等）は、再編後の最新コードを使う
  ことを個別に確認する（[浜松市公式ページ「区再編に伴う全国地方公共団体コードの変更について」](https://www.city.hamamatsu.shizuoka.jp/ksh/imf/tkdk.html)
  のような自治体公式の告知ページで裏取りする）

**[PHASE4_GEOGRAPHY_MASTER_AUDIT.md](PHASE4_GEOGRAPHY_MASTER_AUDIT.md) 3節で使ったWikipediaの
行政区数（二次情報）は、区の「数」の参考情報としては有用だが、`code`の値そのものの情報源としては
使わない。** `code`は必ず総務省・e-Stat等の一次資料（またはそれに準ずる公的データセット）から取得する。

### 4-2. 検査数字の機械的検証（ADR D14 9-3節を継承）

投入前に、全157区＋14道府県内の既存コードについて、ADR D14 1-2節の算出式
（5桁本体に重み`6,5,4,3,2`を掛けて合計→`mod 11`→`11`から引く→`10`は`0`、`11`は`1`に読み替え）で
検査数字を再計算し、一次資料のコードと一致するかを確認する。不一致が1件でもあれば、その区は
投入を保留し、[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md) 1-1節
「Unknown is better than Wrong」に従って「確認不能」として記録する（本計画でも同じ原則を踏襲する）。

この検証は本計画では実施しない（実装タスクで、簡易スクリプトまたは手計算で行う）。

### 4-3. 投入方法

`migration_organizations.sql`の福岡県投入と同じ`VALUES`＋`ON CONFLICT (code) DO NOTHING`パターンを
踏襲する。`prefecture_id`は`prefectures.code`から`SELECT`で解決する（3節のprefectures投入が
このMigrationより先、または同一ファイル内で先行する必要がある。5節参照）。

### 4-4. 命名の一意性についての注意

`municipalities`には`UNIQUE(code)`はあるが`UNIQUE(name)`は無い（`schema.sql`確認済み、
`prefecture_id`が異なれば同名の市区町村が存在しうるため）。政令市の区名（例:「中央区」は
さいたま市・千葉市・福岡市など複数の政令市に存在する）は`code`で一意に区別されるため問題ないが、
投入時に`name`列だけを頼りに検索・突合するロジックを書かないよう注意する（既存コードは`code`で
検索しているため実害はない、[PHASE4_GEOGRAPHY_MASTER_AUDIT.md](PHASE4_GEOGRAPHY_MASTER_AUDIT.md) 7節の
確認結果を再掲）。

---

## 5. 政令指定都市・行政区の投入順序

### 5-1. 道府県単位でMigrationを分割するか

**分割せず、1本の`migration_designated_cities_geography.sql`に14道府県・157区をまとめて投入する
ことを推奨する。** 理由:

- 地理マスタは提出先データと異なり単一の情報源（総務省コード表）に対する機械的な突合作業であり、
  都市ごとに調査品質がばらつく提出先データ（分割・統合・不明型の判定が必要）とは性質が違う。
  1本にまとめても「都市ごとの判断の違い」が生じるリスクが無い
  （[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md) 1-2節「スキーマの汎用性と
  データの網羅性は独立」の派生: 地理マスタは「網羅性」の問題であって「品質判定」の問題ではない）
- `migration_organizations.sql`の前例（福岡県72件を1ファイルで投入）と一貫する
- レビュー時に「地理マスタが全体として整合しているか」を1回のレビューで完結できる（14道府県・157区の
  合計が[PHASE4_GEOGRAPHY_MASTER_AUDIT.md](PHASE4_GEOGRAPHY_MASTER_AUDIT.md) 6節の想定件数と
  一致するかの検証も1回で済む）

ファイルが大きくなりすぎる場合（157区分のVALUES句が読みにくくなる場合）は、**1ファイル内で
道府県ごとにSQLコメントで区切る**（`phase3c1.sql`が県税事務所12件を1つのVALUES句にまとめつつ、
コメントで論理的にグルーピングした構成を踏襲）。物理的にファイルを分割するのは、レビューの都合上
どうしても必要な場合のみとする。

### 5-2. Discovery（提出先データ）の着手順序への申し送り

地理マスタの投入順序自体に技術的な制約は無い（14道府県・157区は相互に依存しないため、どの順で
書いても良い）。ただし、**地理マスタ投入完了後にどの都市から提出先Discoveryを再開するか**は
別の意思決定であり、本計画では以下を申し送るに留める（決定はプロダクトオーナー）。

- 札幌市は既にDiscovery完了・承認済みのため、地理マスタ投入直後に最優先でMigration化できる
- 残り19都市は、[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md)に従い
  1都市ずつ進める運用（既存の合意）は変更しない
- 都市の優先順位（人口規模、顧問先の所在地の偏り等）は本計画のスコープ外

---

## 6. 既存データ（東京都・福岡県）の移行方針

| 対象 | 現状 | 方針 |
|---|---|---|
| 福岡県（`prefectures.code='40'`、`municipalities`72件） | 全件6桁、ADR D14の正規形式と一致 | **無変更。** `migration_organizations.sql`を書き換えない（既存Migrationファイルは書き換えない原則） |
| 東京都（`prefectures.code='13'`） | 変更なし | **無変更**（`prefectures`テーブル自体には桁数の概念は無く、都道府県コードは2桁で福岡県と同じ形式のため対象外） |
| 渋谷区（`municipalities.code='13113'`） | 5桁、ADR D14の正規形式と不一致 | **修正対象。** 7節で扱う |

福岡県・東京都以外の市区町村マスタは今回投入しないため、移行対象は上記3点のみである。

---

## 7. 渋谷区5桁→6桁修正方針

ADR D14（9節）の移行方針を、実装可能な粒度まで具体化する。

### 7-1. 修正内容

```
UPDATE municipalities SET code = '131130' WHERE code = '13113' AND name = '渋谷区';
```

（本計画では実行しない。実際のSQLは`migration_shibuya_code_canonical_format.sql`として別途作成する）

### 7-2. 影響確認（ADR D14 2節の再確認）

- `anonymous_company_events.municipality_id`は`municipalities.id`へのFK（integer）であり、`code`列の
  文字列値を変更しても`id`は変わらないため、既存5件（すべて福岡市中央区、渋谷区とは無関係）を含め
  **無影響**
- `workspace_companies.municipality_code`は文字列保持だが、REST確認時点で0件のため**無影響**
- ブラウザ`localStorage`（`(site)`側の匿名`CompanyProfile`）は、サーバー側から件数を確認できない
  ため影響範囲は未確定（ADR D14 2節・10節で既出のリスク）

### 7-3. 実施前後で確認すること

1. 実施前: `SELECT id FROM municipalities WHERE code = '13113'`が1件（渋谷区）であることを確認
2. 実施後: `SELECT id FROM municipalities WHERE code = '131130'`が同じ`id`で1件存在し、
   `code = '13113'`が0件になっていることを確認
3. `npm run dev`で`/start`（診断フォーム、渋谷区選択）を実際に操作し、診断結果画面
   （`/result`）が引き続き正しく表示されることをPlaywrightで確認する（[CLAUDE.md](../CLAUDE.md)の
   Playwright確認ルールに従う。地理マスタの変更は「DBに関わる変更」に該当するため必須）
4. ドキュメント3点（[全国対応データ整備ガイド.md](全国対応データ整備ガイド.md)・CSVテンプレート2ファイル）を
   ADR D14 9-1節の通り更新する

---

## 8. Rollback方針

地理マスタは提出先データより「上流」にあるテーブルであるため、**ロールバック可否は下流データの
有無に依存する**という一般則をまず明記する。

### 8-1. 本計画（Phase4-2）単独のロールバック（下流データが存在しない前提）

本計画は地理マスタのみを投入し、同じタイミングでは`submission_offices`等の提出先データを
投入しない（2節の分離方針）。したがって、本計画の直後であれば、以下の順序でロールバック可能。

```sql
-- 1. municipalities（新規追加した157区分のみ、既存73件は対象外）
DELETE FROM municipalities WHERE code IN (/* 新規投入した157区のcode一覧 */);

-- 2. prefectures（新規追加した14道府県のみ、既存2件は対象外）
DELETE FROM prefectures WHERE code IN ('01','04','11','12','14','15','22','23','26','27','28','33','34','43');
```

`municipalities`の削除を`prefectures`の削除より先に行う（FK依存の逆順、`migration_organizations.sql`
以来一貫している既存パターン）。

渋谷区の修正（7節）をロールバックする場合は単純に逆方向のUPDATEを行う。

```sql
UPDATE municipalities SET code = '13113' WHERE code = '131130' AND name = '渋谷区';
```

### 8-2. 【重要な制約】提出先データ投入後はロールバック不可になる

いずれかの都市（例: 札幌市）の提出先Migration（`phase3c2.sql`型）が適用された後は、
`submission_jurisdictions.municipality_scope_id`がその都市の`municipalities.id`を参照しているため、
**地理マスタ側の`DELETE`はFK制約違反で失敗する**（`submission_jurisdictions`が先に空にならない限り）。

この制約は事故ではなく意図した安全装置である。**地理マスタのロールバックを検討する場合は、
必ず先に該当都市の提出先データ（`submission_offices`/`office_sources`/`submission_jurisdictions`）が
投入されていないことを確認すること**（[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md) 9節の
「国レベル共有データを誤って削除しない」注意と同じ精神を、地理マスタにも適用する）。

---

## 9. 想定レコード数

| テーブル | 現状 | 追加 | 投入後 |
|---|---|---|---|
| `prefectures` | 2件（東京都・福岡県） | **+14件** | 16件（全47件中） |
| `municipalities` | 73件（渋谷区1・福岡県72） | **+157件**（政令市18市の区） | 230件 |

都市別の内訳は[PHASE4_GEOGRAPHY_MASTER_AUDIT.md](PHASE4_GEOGRAPHY_MASTER_AUDIT.md) 3節の表を正本とする
（本計画では重複記載しない）。**行政区数はWikipedia由来の二次情報に基づく暫定値であり、
実装Migration作成時に総務省一次資料での再確認を必須とする**（監査9節の申し送りを継承）。

---

## 10. リスク整理

| # | リスク | 対応方針 |
|---|---|---|
| 1 | 行政区数・区コードの情報源が二次情報（Wikipedia）に依存している（監査由来） | 4-1節の一次資料（総務省・e-Stat）で実装時に必ず突合する。突合できない区は投入を保留する（4-2節） |
| 2 | 検査数字の手計算ミス | 4-2節の機械的検証を必須とする。可能であれば簡易スクリプトを用意する（実装タスクへ申し送り） |
| 3 | 総務省コード表が経年変化する（浜松市の区再編等） | 4-1節で個別に再編履歴を確認する運用を明記した |
| 4 | 「政令市の区のみ」投入という部分的な都道府県データが、将来の全国展開（D12）時に扱いにくくならないか | 1-1節の通り、未投入の市区町村は単に選択肢に出ないだけで害が無い。将来の全国展開は**追加投入**で完結し、今回投入したデータの手戻りは発生しない設計（`ON CONFLICT`による冪等投入のため） |
| 5 | `migration_designated_cities_geography.sql`適用と、都市別提出先Migrationの適用順序を誤る（提出先データを地理マスタより先に適用しようとする） | 各都市の提出先Migrationの冒頭コメント（0節の依存データ確認）に、対象`municipality_code`の存在確認を必ず入れる運用を、[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md) 5-4節の既存ルールとして継続する |
| 6 | 地理マスタ投入後、`submission_jurisdictions`側の実装（提出先Discovery）が追いつかず「選択できるが提出先が無い（`not_supported`）都市」が増える | 想定内の状態であり、[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md) 1-1節「Unknown is better than Wrong」そのもの。UIが`not_supported`を正しく表示できることは既存State Model（D4）で担保済み |
| 7 | RLS/GRANT | `prefectures`/`municipalities`は`schema.sql`定義の既存テーブルであり、新規テーブルではない。CLAUDE.mdの「新規テーブル作成時はGRANT/RLSをセットで書く」は該当しない（既存のGRANT/RLSがそのまま適用される）。念のため実装時に`pg_tables.rowsecurity`で確認する運用は`phase3c1〜3`と同様に踏襲する |
| 8 | 渋谷区の`code`修正が`(site)`側の既存Closed Beta利用者へ影響する可能性（ADR D14で既出） | 7-3節の通りPlaywright確認を必須とし、実施前にClosed Beta運営側への事前共有を推奨する（ADR D14 10節の申し送りを継承） |

---

## 11. 実装順序

本計画・ADR D14承認後の推奨実施順序（本ドキュメントでは実行しない）。

1. **渋谷区`code`修正**（`migration_shibuya_code_canonical_format.sql`、7節）
   - 実施 → Playwright確認（7-3節） → ドキュメント3点更新（ADR D14 9-1節）
2. **地理マスタ投入**（`migration_designated_cities_geography.sql`、3節・4節）
   - 総務省・e-Stat一次資料で14道府県・157区のコードを突合（4-1節）
   - 検査数字を機械的に検証（4-2節）
   - Migration作成・適用
   - 検証SQL実行（件数・重複確認、[PHASE4_GEOGRAPHY_MASTER_AUDIT.md](PHASE4_GEOGRAPHY_MASTER_AUDIT.md) 9節の
     想定件数と一致することを確認）
3. **札幌市の提出先Migration作成**（既にDiscovery承認済みのため、地理マスタ投入完了後に最優先で着手可能。
   `phase3c2.sql`/`phase3c3.sql`と同型）
4. **残り19都市のDiscovery再開**（[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md)に
   従い1都市ずつ、5-2節の申し送り通り優先順位はプロダクトオーナー判断）

---

## まとめ

- 政令指定都市の地理マスタは**福岡県のような県内全域投入ではなく、政令市の区のみ**に意図的に
  スコープを絞る（1節、未選択の市区町村は害が無いため）
- 地理マスタ（総務省の単一コード表との機械的突合で足りる）と提出先データ（都市ごとの人手調査が
  必要）は**性質が異なるため別系統のMigrationとして分離**し、地理マスタを先にまとめて投入する
  ことで、Discovery済みの都市（札幌市）から即座にMigration化できる状態を作る（2節・5節）
- 渋谷区の`code`修正（5→6桁）は地理マスタ投入とは独立した、既存データの修正として別ファイルで
  先行実施する（6節・7節）
- ロールバックは、提出先データが未投入である限り安全に行えるが、**提出先Migration適用後は
  FK制約により不可逆になる**（8節、意図した安全装置）
- 想定レコード数は`prefectures`+14件・`municipalities`+157件（9節）。行政区数・コードは
  実装時に一次資料での再確認が必須（10節リスク#1）
- 実装順序: 渋谷区修正 → 地理マスタ投入 → 札幌市提出先Migration → 残り19都市のDiscovery再開（11節）

レビュー待ちで停止する。
