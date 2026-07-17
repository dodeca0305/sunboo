# MUNICIPAL_DISCOVERY_CHECKLIST.md — 市区町村提出先調査 標準作業書（SOP）

**ステータス: 運用開始前レビュー待ち。** 本書自体はコード・Migration・データ投入を一切行わない
手順書である。Phase3C-2（福岡市Pilot）・Phase3C-3（北九州市Pilot）で得た知見を一般化し、
今後すべての市区町村（政令指定都市・一般市・町村）の`municipal_tax`/`municipal_asset_tax`調査に
そのまま使えることを目的とする。

対象読者: 次の自治体（政令指定都市を含む）の提出先データを調査・投入する担当者（人間・Claude Code
セッション問わず）。

---

## 0. 本書の位置づけ

| 既存ドキュメント | 役割 | 本書との関係 |
|---|---|---|
| [ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md](ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md)（D13） | 「同一office_category内で手続き別に提出先が分かれる場合、どう表現するか」の**設計判断**（Accepted） | 本書はこの判断を**運用手順に落とし込む**。設計判断自体を再検討する場ではない |
| [PHASE3C_MUNICIPAL_TAX_DISCOVERY.md](PHASE3C_MUNICIPAL_TAX_DISCOVERY.md) | 福岡県60自治体の**一次調査結果**（部分的、50/60自治体分） | 本書のStep 1〜5は、この調査で実際に踏んだ手順を一般化したもの |
| `migration_national_submission_directory_phase3c1.sql`〜`phase3c3.sql` | 福岡県・福岡市・北九州市の**実装済み（適用待ち）Migration** | 本書5節・6節のテンプレートは、これらの実ファイルの構造をそのまま抽象化したもの |

本書は「何を確認すべきか」「確認できなかった場合どうするか」を固定し、**調査者・実装者が違っても
同じ品質のデータが投入される**ことを保証するために書く。

---

## 1. 設計原則（必読・絶対順守）

以下4点は、本書のあらゆる手順より優先する。手順とこの4点が矛盾する場合は、この4点を優先し、
本書側の記述を修正する。

### 1-1. Unknown is better than Wrong（不明は誤りより良い）

**「わからない」を`not_supported`のまま正直に残すことは失敗ではない。誤ったデータを断定して
投入することの方が、常に悪い結果である。**

理由: SUNBOOは行政手続きの提出先を案内するサービスであり、誤った窓口へ案内すると、期限徒過・
二度手間・利用者の信頼喪失に直結する（PROJECT_CONTEXT.mdの想定ユーザーは「顧問税理士がいない
中小企業」であり、誤りを自力で見抜けない層である）。一方、`not_supported`（未対応表示）は
「まだ調べていない」という正直な状態であり、利用者に実害を与えない。

**具体例（Phase3C-3、北九州市Pilot）**: 福岡市で確認できた「法人市民税と償却資産申告は別部署」
というパターンを、北九州市にも一次情報の確認なしに適用しなかった。北九州市の資産課税担当部署は
未調査のまま`municipal_asset_tax`のデータを投入せず、`DEPRECIABLE_ASSET_TAX_RETURN`は
`not_supported`のままとした。もし「福岡市と同じ構造だろう」と推測で登録していたら、
**動作はするが中身が事実と異なる誤情報**を返すリスクがあった。

### 1-2. 「スキーマの汎用性」と「データの網羅性」は独立して評価する

この2つを混同しない。

| 軸 | 意味 | 評価方法 |
|---|---|---|
| **スキーマの汎用性** | ADR D13の仕組み（`office_category`分割＋`procedure_submission_rules`の無条件上書き）が、コード変更なしに新しい自治体へ適用できるか | Resolverコードを変更せずにMigrationだけで表現できたか。福岡市・北九州市とも**成立済み**（Phase3C-2・3C-3で実証済み） |
| **データの網羅性** | その自治体の実際の部署構成・住所・電話番号が、どこまで一次情報で確認できているか | 自治体ごとに異なる。福岡市は`municipal_asset_tax`まで確認できたが二次情報止まり、北九州市は`municipal_tax`のみ確認できた |

「スキーマが汎用的である」ことは「全自治体のデータが揃う」ことを意味しない。新しい自治体の調査で
`municipal_asset_tax`のデータが見つからなくても、それは**ADRの失敗ではない**。逆に、データが
見つかったからといって、確認プロセス（3節・4節）を省略してよいわけでもない。

### 1-3. 推測による登録の禁止

以下はいずれも「推測による登録」であり、**明確に禁止する**。

- 他自治体（特に構造が似ている政令指定都市）で確認できたパターンを、確認していない自治体に
  そのまま適用する（1-1節の北九州市の教訓）
- 一覧ページに記載された部署名・電話番号を、目的の手続き（例: 償却資産申告）の担当部署だと
  確証なく推定する（「税務課」という名称だけで市民税・資産税の両方を扱うと断定しない）
- 複数の情報源で電話番号・住所が食い違う場合に、どちらが正しいかを独自に判断する（4-3節参照。
  判断せず両論併記し、`official_url_status='unchecked'`のまま投入する）
- 検索結果の要約やAIの推測を情報源として扱う（`office_sources.source_url`は必ず自治体公式サイトの
  実URLであること。検索は情報源URLを見つけるためだけに使う）
- 「町村なら統合されているはず」のような規模・自治体種別からの一般化（6節「町村部の注意」参照。
  傾向としては妥当でも、確認前に断定しない）

### 1-4. VISION.mdとの対応

VISION.mdの「実務データの検証なしの断定をしない」原則そのものが、本書の存在理由である。
1-1〜1-3節は、この原則を`municipal_tax`/`municipal_asset_tax`調査という具体的な作業に
落とし込んだものであり、この原則に反する近道（推測・省略・断定）は、たとえ作業速度が上がっても
採用しない。

---

## 2. 用語・スコープ定義

### 2-1. 対象手続き（`office_type='municipal_tax'`の4件）

| procedure code | 手続き名 | 会社所在地で提出先が決まるか | 本書の調査対象か |
|---|---|---|---|
| `MUNICIPAL_RESIDENT_TAX_RETURN` | 法人市民税申告 | Yes | **対象**（市民税担当部署を調査） |
| `DEPRECIABLE_ASSET_TAX_RETURN` | 償却資産申告 | Yes | **対象**（資産税担当部署を調査） |
| `SALARY_PAYMENT_REPORT` | 給与支払報告書 | No（`recipient_scope='each_employee'`、従業員住所地） | **対象外**。Phase3C-1で全国一律ルール設定済み、調査不要 |
| `RESIDENT_TAX_WITHHOLDING` | 特別徴収税額の納付 | No（同上） | **対象外**。同上 |

調査に着手する前に、この表を確認し、**市民税・資産税の2部署のみに調査対象を絞る**こと。
給与支払報告書・特別徴収の担当課情報（一覧ページに載っていることが多い）は、参考情報として
記録してよいが、`submission_offices`への投入対象ではない。

### 2-2. `office_category`の2分類

| category | 意味 | 追加要否 |
|---|---|---|
| `municipal_tax` | 市民税部門（既存、Phase1.5から存在） | 既存。新規追加不要 |
| `municipal_asset_tax` | 資産税部門（ADR D13で新設、Phase3C-1で追加済み、`organization_types.id=27`） | 既存。**新規自治体ごとに追加する必要はない**（全国共通の1カテゴリ） |

**誤解しやすい点**: 自治体ごとに新しい`office_category`を作る必要はない。`municipal_asset_tax`は
「資産税部門」という**概念**を表す全国共通のカテゴリであり、自治体ごとに追加するのは
`submission_offices`（窓口の実データ）と`submission_jurisdictions`（管轄の紐付け）のみである。

### 2-3. 部署構成の3パターン

調査の結果、各自治体は以下いずれかに分類される。

| パターン | 定義 | 投入内容 |
|---|---|---|
| **統合型** | 市民税・資産税を同一部署が扱う（例: 久留米市「市民税課」が両方を明記） | 同一の`submission_offices`行を`municipal_tax`と`municipal_asset_tax`両方の`submission_jurisdictions`から参照させる（5-3節） |
| **分割型** | 市民税・資産税で担当部署が異なる（例: 福岡市「法人税務課」対「資産課税課」） | `submission_offices`に2行、それぞれ別の`submission_jurisdictions`行を作る |
| **不明型** | 一次情報で確認できない、または統合/分割の判断がつかない（例: 北九州市の資産税担当） | **投入しない**。`municipal_tax`側だけ投入し、`municipal_asset_tax`は空のまま残す。`not_supported`が正しい結果になる |

政令指定都市（区制）はさらに「区ごとに分かれず市に1〜2箇所へ集約される」という4つ目の特徴軸を
持つが、これは3パターンと直交する概念（4-4節で扱う）。

### 2-4. 情報源の一次/二次

| 区分 | 定義 | `office_sources.verification_method` |
|---|---|---|
| 一次情報 | 対象自治体の公式サイトを**直接フェッチして確認した**内容 | `official_page_check` |
| 二次情報 | 検索結果の要約・他サイトからの言及など、公式ページを直接確認していない内容 | `other`（notesに「要再確認」と明記） |
| PDF等の一次資料 | 公式サイトが公開するPDF（例: 提出先一覧PDF） | `pdf_document` |

**二次情報のみで`submission_offices`に投入することは禁止しない**（Phase3C-2の福岡市資産課税課が
実例）が、必ず`official_url_status='unchecked'`・`verification_method='other'`とし、notesに
「要再確認」である旨を明記すること。**二次情報を一次情報のように見せかける投入は禁止**（1-3節）。

---

## 3. ADR D13 運用ルールの要約

詳細は[ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md](ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md)を
正本とする。本節はMigration作成者向けに実務的な要点のみを抜粋する。

### 3-1. いつ分割し、いつ統合するか

- **分割型と確認できた場合のみ**、`submission_offices`に2行作り、それぞれ`municipal_tax`/
  `municipal_asset_tax`の`submission_jurisdictions`行を作る
- **統合型と確認できた場合**、`submission_offices`は1行のみ作り、その1行を`municipal_tax`と
  `municipal_asset_tax`の**両方**の`submission_jurisdictions`から参照させる（`submission_jurisdictions
  .office_category`は`submission_offices.office_category`と一致することを強制するFK/トリガーが
  無いため、この参照は現行スキーマで可能。ADR本文0-3節参照）
- **不明型の場合**、`municipal_tax`側（多くの場合、一覧ページ等で確認しやすい）だけ投入し、
  `municipal_asset_tax`側は投入しない

### 3-2. `procedure_submission_rules`は自治体ごとに追加しない

`DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax`への無条件上書きルールは、Phase3C-1で
**全国一律の1行**として既に投入済み（`id=3`、`conditions=[]`）。新しい自治体を調査するたびに
このルールを再投入する必要は無い。**自治体ごとの実装で触るのは`submission_offices`/
`office_sources`/`submission_jurisdictions`の3テーブルのみ**（統合型の場合は`submission_jurisdictions`
のみ、既存`submission_offices`行を再利用することもある）。

### 3-3. `organization_types`は自治体ごとに追加しない

2-2節の通り、`municipal_asset_tax`は全国共通の1カテゴリとして既に存在する。新しい自治体の調査で
`organization_types`へのINSERTが必要になることは、**通常は無い**。もし調査対象の自治体で
`municipal_tax`/`municipal_asset_tax`のどちらでも表現できない第3の分岐パターンが見つかった場合
（例: 事業所税専用の第3の部署等）、それは新しいADRが必要な事態であり、**本書の手順を超える**。
その場合は投入を中断し、ADR形式で意思決定を仰ぐこと（Phase3B/3C discoveryドキュメントと同じ扱い）。

---

## 4. 調査フロー（Discovery Procedure）

新しい自治体（または複数自治体をまとめて）を調査する際は、以下をStep 0から順に実施する。
途中でStep 4（判定不能）に到達した場合、それ以降のStepは実施せず、`not_supported`のまま
記録して次の自治体へ進んでよい（1つの自治体の不明を解消するために時間を使いすぎない）。

### Step 0: 準備

- [ ] 対象自治体の`municipalities.code`を確認する（Resolverの判定単位と自治体の対応。政令指定都市は
  区ごとに複数の`municipality_code`を持つ）
- [ ] 対象自治体が政令指定都市かどうかを確認する（4-4節の追加確認が必要になる）
- [ ] 2-1節の表を再確認し、調査対象を「市民税担当部署」「資産税担当部署」の2点に絞る

### Step 1: 一次情報源の探索

- [ ] 自治体公式サイトのトップから「組織一覧」「税務課」等のページを辿り、市民税担当部署の
  ページを見つける（`verification_method='official_page_check'`の対象）
- [ ] 都道府県が60自治体規模の一覧ページ（例: 福岡県の`個人住民税特別徴収 市町村問い合わせ先`
  ページ）を持っている場合、部署名・電話番号の一次スクリーニングに使ってよい。ただし
  **これは特別徴収（対象外の手続き）向けの一覧であることが多く、市民税・資産税の担当課と
  完全に一致するとは限らない**（Phase3C discoveryの教訓、6節参照）。あくまで足がかりとして
  使い、必ず個別ページで確認する
- [ ] 資産税（固定資産税・償却資産税）担当部署のページを同様に探す。**市民税担当部署のページに
  「資産税もこちらで扱う」という明記が無い限り、同一部署だと仮定しない**

### Step 2: 部署の統合/分割の判定

- [ ] 市民税ページと資産税ページ（またはその両方を扱うページ）を突き合わせ、2-3節の3パターン
  （統合型／分割型／不明型）のどれに該当するか判定する
- [ ] 判定根拠（該当ページのどの記述から判断したか）をメモしておく（Migrationのnotesに転記する）
- [ ] 「税務課」「市民税課」のような部署名だけで判断せず、ページ本文に**両方の税目が明記
  されているか**を確認する（久留米市の実例: 「市民税、軽自動車税、市たばこ税、入湯税及び
  事業所税」と明記 → 統合型と判定できる根拠になる）

### Step 3: 情報の相互突合

- [ ] 住所・電話番号を複数ページ（一覧ページ・個別ページ・組織図ページ等）で突き合わせる
- [ ] **一致しない場合、どちらが正しいか独自判断しない**（1-3節）。両方を`notes`に記録し、
  個別ページ（より具体的な情報源）の値を暫定的に採用した上で`official_url_status='unchecked'`
  とする（Phase3B-0・Phase3C-2・Phase3C-3で一貫して採用したパターン）
- [ ] 郵便番号は情報源に明記されている場合のみ投入する。明記が無い場合は`NULL`のまま
  （同一建物内の別部署だからといって、他部署の郵便番号を転用しない。Phase3C-2で
  資産課税課の郵便番号を空欄にした判断を踏襲する）

### Step 4: 政令指定都市の追加確認事項

対象が政令指定都市の場合、以下を追加で確認する。

- [ ] **区ごとに提出先が分かれるか、市全体で1〜2箇所に集約されるか**を確認する（福岡市・
  北九州市はいずれも「区ごとではなく市に集約」だったが、これは政令指定都市共通の性質とは
  断定しない。区ごとに分かれる政令指定都市が存在する可能性を排除しない）
- [ ] 集約されている場合、`submission_jurisdictions`は「区の数だけ行を作り、全て同一
  `office_id`を参照する」形にする（5-3節）。区ごとに別の窓口だと誤って複数の
  `submission_offices`行を作らない
- [ ] 市民税と資産税で「集約先」自体が異なる可能性（例: 市民税は財政局、資産税は別の局）を
  考慮し、2部署それぞれについて集約の有無を個別に確認する

### Step 5: 判定不能時の扱い（保留基準）

以下のいずれかに該当する場合、**その部署（市民税または資産税）の投入を保留し、`not_supported`
のまま残す**。保留は失敗ではなく、正しい運用である（1-1節）。

- 公式サイト内に該当する部署のページが見つからない
- 該当ページはあるが、対象の税目（市民税/資産税）を扱うかどうかが本文から読み取れない
- 情報源が二次情報のみで、一次情報での裏付けが取れる見込みが無い（時間をかけても見つからない）
- 統合型か分割型かの判断がページの記述だけでは付かない

保留した場合は、docsに「未確認自治体リスト」として記録し（[PHASE3C_MUNICIPAL_TAX_DISCOVERY.md](PHASE3C_MUNICIPAL_TAX_DISCOVERY.md)
の「未取得10自治体」と同じ形式）、将来の再調査に引き継ぐ。

### Step 6: 記録テンプレート（`notes`文言のひな形）

Migration作成時、`submission_offices.notes`・`office_sources.notes`には以下のいずれかの
テンプレートを使う（自由記述だが、監査可能性のため型を揃える）。

```
【一次情報・単一情報源】
公式ページを直接フェッチして確認済み（<出典ドキュメント> <節番号>）。

【一次情報・複数情報源で不一致】
情報源A（<ページ種別>）とB（<ページ種別>）で<項目>の記載が異なる（A=<値>／B=<値>）。
<採用した情報源>を暫定値として採用、要一次確認。

【二次情報のみ】
【要再確認】検索結果からの二次情報のみで、公式ページの直接フェッチによる一次確認ができていない
（<出典ドキュメント> <節番号>）。実装（本番反映）前に公式ページでの一次確認を推奨する。

【統合型】
<税目1>・<税目2>を同一部署が扱うことをページ本文で確認済み（「<引用文>」<出典>）。

【不明型・保留】
<税目>の担当部署が一次情報・二次情報とも確認できていない。<類似自治体>のパターンを
確認なしに適用しない（本書1-3節）。<office_category>側は投入せず、not_supportedのまま残す。
```

---

## 5. 実装ルール（Migrationの書き方）

### 5-1. `submission_offices`

- `office_category`は`municipal_tax`または`municipal_asset_tax`のいずれか（新カテゴリの追加は
  原則不要、3-3節）
- `UNIQUE(office_category, name)`があるため、`name`は部署名まで含めて自治体間で衝突しない
  一意な文字列にする（例: 単に「税務課」ではなく「福岡市財政局法人税務課法人市民税係」）
- `official_url_status`は、一次情報で直接確認していても**デフォルトは`'unchecked'`**とする
  （既存Migrationの一貫した方針。「リンクが生きているか」の生存確認はまた別の作業であり、
  内容確認したことをもって`'ok'`にしない）
- `postal_code`・`phone`等、情報源に明記の無い項目は`NULL`のまま。他部署・他ページの値を
  転用しない（4節Step3）

### 5-2. `office_sources`

- 1窓口につき1件（`ON CONFLICT (office_id) WHERE is_current = true`で冪等）
- `source_type`は`municipal_government`（市区町村）または`pref_government`（都道府県、一覧ページを
  情報源にした場合）
- `verification_method`は2-4節の区分に従う。一次情報なら`official_page_check`、二次情報なら`other`
- `retrieved_at`は調査を実施した日（investigate当日の日付）

### 5-3. `submission_jurisdictions`

- 統合型: 同一`office_id`を`municipal_tax`と`municipal_asset_tax`の両方の行から参照させる
  （2つのINSERT文、`office_category`だけが異なる）
- 分割型: 別々の`office_id`をそれぞれのカテゴリの行から参照させる
- 政令指定都市で集約されている場合: 区の数だけ行を作り、全て同一`office_id`を参照させる
  （`WITH <city>_wards(municipality_code) AS (VALUES (...), ...)`パターン、
  `migration_national_submission_directory_phase3c2.sql`/`phase3c3.sql`と同じ書き方）
- `ON CONFLICT (municipality_scope_id, office_category) WHERE scope_type = 'municipality' AND
  is_primary = true AND effective_to IS NULL`で冪等にする
- **不明型のカテゴリについては、この節のINSERT自体を書かない**（空のままにする。5-4節の
  検証SQLで「意図した空」であることを確認する）

### 5-4. ファイル冒頭の記載事項（必須）

新しいMigrationファイルには、`migration_national_submission_directory_phase3c2.sql`/
`phase3c3.sql`と同じ形式で、冒頭コメントに以下を明記する。

- 対象自治体・対象判定単位
- 前提Migration（`phase3c1.sql`が適用済みであること）と、依存関係の有無
- 変更しないもの（`resolve.ts`等・Procedure Master・`organization_types`・
  `procedure_submission_rules`は通常は不変）
- **統合型/分割型/不明型のどれに該当したか、その根拠**
- 不明型の場合、「なぜ投入しないか」を明記する（1-1節の原則を踏まえた説明）

---

## 6. 検証SQLテンプレート

新しいMigrationには、対象自治体のプレースホルダを埋めた以下のクエリ群を含めること
（`phase3c2.sql`/`phase3c3.sql`の4節を一般化したもの）。

```sql
-- (a) 窓口数（期待値: 統合型=1、分割型=2、不明型=市民税のみ1・資産税0）
SELECT office_category, COUNT(*) AS office_count
FROM submission_offices
WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND name IN (/* 対象自治体の窓口名 */);

-- (b) 対象判定単位の収束確認（政令指定都市の場合は区の数、それ以外は1）
--     期待値: distinct_offices=1（1つの窓口に収束）、jurisdiction_rows=対象判定単位数
SELECT sj.office_category, COUNT(DISTINCT sj.office_id) AS distinct_offices, COUNT(*) AS jurisdiction_rows
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE m.code IN (/* 対象判定単位のcode一覧 */)
  AND sj.is_primary = true AND sj.effective_to IS NULL
GROUP BY sj.office_category;

-- (c) 不明型カテゴリが「意図した空」であることの確認（不明型がある場合のみ。期待値: 0行）
SELECT sj.* FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE m.code IN (/* 対象判定単位 */) AND sj.office_category = /* 不明型のカテゴリ */;

-- (d) 対象判定単位の網羅チェック（投入したカテゴリのみ。期待値: 0行＝欠落なし）
SELECT m.code, m.name
FROM municipalities m
WHERE m.code IN (/* 対象判定単位 */)
  AND NOT EXISTS (
    SELECT 1 FROM submission_jurisdictions sj
    WHERE sj.municipality_scope_id = m.id AND sj.office_category = /* 投入したカテゴリ */
      AND sj.is_primary = true AND sj.effective_to IS NULL
  );

-- (e) ガードレール①: 対象外の自治体に影響していないこと（期待値: 0行）
SELECT sj.office_category, m.code, m.name
FROM submission_jurisdictions sj
JOIN municipalities m ON m.id = sj.municipality_scope_id
WHERE sj.office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND m.code NOT IN (/* これまでに投入済み・かつ今回投入する全判定単位の合計リスト */);

-- (f) ガードレール②: organization_types / procedure_submission_rules が
--     新規追加されていないこと（3-2節・3-3節、通常のMigrationでは不要な操作のため）
SELECT COUNT(*) AS organization_types_count FROM organization_types;
SELECT COUNT(*) AS procedure_submission_rules_count FROM procedure_submission_rules;

-- (g) RLS健全性
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('submission_offices', 'office_sources', 'submission_jurisdictions');
```

---

## 7. Resolver確認ケーステンプレート

Migration適用後、以下のパターンを最低限確認する（`src/lib/submissionDirectory/`は変更しないため、
確認は「データが正しく解決に反映されるか」のみを見る。Resolverのロジック自体のテストは不要）。

| ケース | 入力 | 期待される`ResolutionStatus` | 目的 |
|---|---|---|---|
| 統合型/分割型・市民税 | `MUNICIPAL_RESIDENT_TAX_RETURN` × 対象判定単位の1つ | `resolved` | 基本ケース |
| 統合型/分割型・資産税 | `DEPRECIABLE_ASSET_TAX_RETURN` × 同上 | `resolved`（統合型なら市民税と同一窓口、分割型なら別窓口） | 基本ケース |
| 政令指定都市の収束確認 | 同一手続き × 対象都市の**別の**判定単位（区） | `resolved`・**同一窓口** | 集約パターンの確認（6節(b)のSQLで機械的に確認可） |
| 不明型（該当する場合） | `DEPRECIABLE_ASSET_TAX_RETURN`（または未投入側） × 対象判定単位 | **`not_supported`** | 「不明を正直に返す」ことの確認。**これがresolvedになっていたら、意図せず何かのデータが投入されている疑いがあるため要調査** |

---

## 8. 回帰確認テンプレート

新しい自治体を投入しても、以下が変化しないことを確認する。

- [ ] これまでに投入済みの他自治体（例: 福岡市・北九州市）の解決結果が変わっていない
- [ ] `prefectural_tax`（Phase3C-1）の解決結果が変わっていない
- [ ] `SALARY_PAYMENT_REPORT`・`RESIDENT_TAX_WITHHOLDING`は引き続き`requires_employee_address`
- [ ] 今回投入していない自治体（例: 久留米市等）は引き続き`not_supported`
- [ ] `organization_types`の行数・`procedure_submission_rules`の行数が変化していない（3-2・3-3節）

---

## 9. Rollbackルール（国レベル共有データの取り扱い注意）

**重要な注意**: 特定の自治体1件分のデータをロールバックする際、以下は**絶対に削除しない**。

- `organization_types`の`municipal_asset_tax`行 — 全国共通のカテゴリであり、他の自治体（例: 福岡市・
  北九州市）のデータが同じカテゴリを参照している可能性がある
- `procedure_submission_rules`の`DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax`ルール —
  同様に全国一律のルールであり、他自治体のデータもこのルール経由で解決されている

削除してよいのは、その自治体固有の`submission_offices`・`office_sources`・
`submission_jurisdictions`の行のみ（`office_category`と`name`で対象自治体の窓口を特定し、
外部キー依存の逆順で削除する）。

```sql
-- テンプレート（<窓口名>・<対象判定単位code>を実際の値に置き換える）
DELETE FROM office_sources WHERE office_id IN (
  SELECT id FROM submission_offices WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
    AND name IN (/* 対象自治体の窓口名一覧 */)
);
DELETE FROM submission_jurisdictions
  WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND municipality_scope_id IN (
    SELECT id FROM municipalities WHERE code IN (/* 対象判定単位 */)
  );
DELETE FROM submission_offices
  WHERE office_category IN ('municipal_tax', 'municipal_asset_tax')
  AND name IN (/* 対象自治体の窓口名一覧 */);
```

ロールバック後は、6節(f)のクエリで`organization_types`・`procedure_submission_rules`の行数が
**変化していない**ことを確認すること（誤って全国共有データまで削除していないかの最終確認）。

---

## 10. 完了判定チェックリスト（付録・コンパクト版）

1つの自治体の調査・実装が完了したと言えるのは、以下すべてを満たした時点。

- [ ] Step 0〜6（4節）を実施し、統合型/分割型/不明型のいずれかに分類した
- [ ] 分類の根拠を`notes`に記録した（Step 6のテンプレートに従う）
- [ ] 情報源の不一致があれば両論併記し、独自判断で片方を「正」としていない
- [ ] 給与支払報告書・特別徴収（対象外の2手続き）の窓口調査をしていない（範囲外作業をしていない）
- [ ] `organization_types`・`procedure_submission_rules`へのINSERTを追加していない（3-2・3-3節、
  新カテゴリが本当に必要な例外的ケースを除く）
- [ ] Migration冒頭コメントに5-4節の必須記載事項がある
- [ ] 6節の検証SQL・7節のResolver確認ケース・8節の回帰確認・9節のRollback SQLをMigrationまたは
  報告に含めた
- [ ] 不明型がある場合、「未確認自治体リスト」に記録し、投入していない事実を隠していない

---

## 11. スケーラビリティ・今後の適用範囲

本書は福岡市・北九州市（政令指定都市2市）のPilotから一般化したものであり、以下の展開を
想定している。

| 展開範囲 | 想定される追加確認事項 |
|---|---|
| 福岡県の残り58判定単位（一般市・町村） | 政令指定都市特有の「区の集約」確認（4-4節）は不要。ただし人口規模の小さい町村では「住民課」等の複合部署が税務を兼務するケースがある（[PHASE3C_MUNICIPAL_TAX_DISCOVERY.md](PHASE3C_MUNICIPAL_TAX_DISCOVERY.md) 2節）ため、統合型と判定する際は特に本文確認を丁寧に行う |
| 他の政令指定都市（全国20市） | 4-4節の追加確認が必須。福岡市・北九州市のいずれとも異なる集約パターン・分岐パターンを持つ可能性を最初から想定し、**どちらの都市のパターンも前提にせず**ゼロから調査する（1-3節） |
| 全国の一般市区町村（約1,700） | `office_sources`のCSV一括投入等、効率化の余地はあるが、本書のStep 2（統合/分割判定）・Step 3（相互突合）・Step 5（保留基準）は自動化せず、人手（またはAIエージェントによる個別確認）を維持する。ここを自動化すると1-1〜1-3節の原則が保てなくなる |

**全国展開のデータ調査体制自体**（人手を維持するか、半自動化するか）は
[NATIONAL_SUBMISSION_DIRECTORY.md](NATIONAL_SUBMISSION_DIRECTORY.md) D12で「Phase2実績を待って
再評価、保留」とされたままであり、本書はその判断を先取りしない。本書はあくまで
「人手（またはAIエージェント）が調査する際の手順」を固定するものである。

---

レビュー待ちで停止する。
