# ADR: 同一 office_category 内でのProcedure別提出先の表現方法（D13）

- ステータス: **Proposed**（レビュー待ち。コード・Migration・データ投入はこのADRでは一切行っていない）
- 決定日: 未定（本ドキュメントは意思決定材料の提示のみ）
- 起点: [PHASE3C_MUNICIPAL_TAX_DISCOVERY.md](PHASE3C_MUNICIPAL_TAX_DISCOVERY.md) 6-2節「設計上の懸念、未解決」
- 形式: [NATIONAL_SUBMISSION_DIRECTORY.md](NATIONAL_SUBMISSION_DIRECTORY.md) の意思決定章（D1〜D12）と同じ形式で、
  D13として位置づける。[ADR_NATIONAL_SUBMISSION_DIRECTORY.md](ADR_NATIONAL_SUBMISSION_DIRECTORY.md) は
  Version 1.0（D1〜D12）で確定済みのため、本ADRはそれとは別の追加論点として独立ファイルに記録する。

---

## 論点

`submission_jurisdictions` は `(scope, office_category)` の組み合わせに対して `is_primary=true` の行を
1件にしか確定できない（部分UNIQUEインデックス）。ところが福岡市・北九州市では、同じ `municipal_tax`
カテゴリの中で、法人市民税申告（`MUNICIPAL_RESIDENT_TAX_RETURN`）と償却資産申告
（`DEPRECIABLE_ASSET_TAX_RETURN`）の提出先部署が物理的に異なることが実データで確認された
（福岡市: 財政局法人税務課 vs 財政局資産課税課）。**「市区町村×機関種別」だけでは提出先が一意に
決まらないケースが存在する**ため、これをスキーマ上どう表現するかを決める必要がある。

## 前提として確認した実装の事実（推測ではなくコード確認）

設計に入る前に、既存の判定ロジック（`src/lib/submissionDirectory/`）と実際のMigration DDL
（`supabase/migration_national_submission_directory.sql`）を確認した。

1. **`office_category` は既に手続き単位で上書きできる仕組みが実装済み。** `resolve.ts` の
   `applyProcedureRules` は `procedure_submission_rules` を `procedure_id` で評価し、条件が成立すれば
   `procedures.office_type`（デフォルト）とは異なる `office_category` を返せる。この上書きは
   **手続きごとに完全に独立**しており、`DEPRECIABLE_ASSET_TAX_RETURN` だけを別の `office_category` に
   ルーティングすること自体は、既存のコードを一切変更せずに可能。
2. **`submission_jurisdictions.office_category` は非正規化列であり、`office_id` が指す
   `submission_offices.office_category` と一致することを強制するFKやトリガーはDDL上どこにも無い**
   （`migration_national_submission_directory.sql` 82〜135行を確認、CHECK制約は`scope_type`と
   `scope_code`列の整合のみ）。つまり**同一の`office_id`（1つの物理窓口）を、異なる`office_category`の
   `submission_jurisdictions`行から重複して参照させることが、現行スキーマで既に可能**。
3. **`findAtScope`（`resolve.ts`）は `office_category` の文字列にのみ依存する汎用実装**で、
   `organization_types.code` に何が入っているかを一切前提にしていない。新しいコード値を
   `organization_types` に追加しても、`resolve.ts`・`dataAccess.ts`・`types.ts`（`OfficeCategory = string`）
   はいずれも無変更で動く。

この3点により、「新しい `office_category` を追加する」という選択肢は、**Migration・データ投入だけで
完結し、`src/lib/submissionDirectory/` 配下のコード変更が一切不要**であることが確認できた
（Phase3Cの時点では「Procedure Master・既存分類の変更を伴うため禁止事項に抵触する可能性がある」と
慎重に留保されていたが、`organization_types` への行追加は `procedures` テーブル自体には触れておらず、
実際には「新しい分類コードを持つ行を1件追加する」というデータ操作にとどまる）。

---

## 選択肢A: `office_category` を分割する（新しい `organization_types` コードを追加）

法人市民税用の `municipal_tax` とは別に、資産課税部署を表す新カテゴリ（例: `municipal_asset_tax`、
固定資産税・償却資産税を扱う「資産課税課」相当）を `organization_types` に追加する。
`procedure_submission_rules` に `DEPRECIABLE_ASSET_TAX_RETURN → municipal_asset_tax`
（条件なし、全国一律で上書き）の1行を追加する。

**投入パターン**:
- 税務担当課が1部署に統合されている58判定単位（想定）: 同一の `submission_offices` 行（例:
  久留米市 市民税課）を、`municipal_tax` と `municipal_asset_tax` **両方の** `submission_jurisdictions`
  行から `is_primary=true` として参照させる（上記「前提2」により可能）。窓口データの二重入力は不要。
- 福岡市・北九州市: `municipal_tax`（法人税務課）と `municipal_asset_tax`（資産課税課）で別々の
  `submission_offices` 行を作り、それぞれの `submission_jurisdictions` 行を `is_primary=true` にする。

**補足**: `municipal_asset_tax`（市民税課と資産税課の分離）は福岡市固有の便宜的な分類ではなく、日本の
市区町村行政では一般的に見られる部署構造（市民税と固定資産税を別課が扱う自治体は珍しくない）であり、
「Fukuoka特有のハックとして`office_category`を汚す」というより「元々存在した行政区分を後から
明示的にモデル化する」という性質が強い。

| 項目 | 内容 |
|---|---|
| 利点 | **コード変更ゼロ**（`resolve.ts`/`dataAccess.ts`/`types.ts`いずれも無変更）。`procedure_submission_rules`が本来「手続き条件によって提出先種別を上書きする」ために用意された仕組みそのものであり、転用ではなく設計通りの用途。データ未投入のカテゴリは既存の`not_supported`状態にそのまま落ちるため、新しい「判定不能」パターンを追加する必要もない。ロールバックも`procedure_submission_rules`の1行を`is_active=false`にするだけで済む |
| リスク | `organization_types`の語彙が「真の行政機関種別」（税務署・法務局等）と「同一機関内の部署粒度の分類」の2つの意味を持つようになり、将来的に混在が進むと管理画面（`/admin/organization-types`）でカテゴリの意味が分かりにくくなる。他の`office_category`（`labor_standards`等）でも同様の部署分岐が全国展開時に見つかった場合、同じパターンで新カテゴリが増殖しうる（現時点で他分類での実例は未確認） |
| 実装コスト | 低（Migration・データ投入のみ。既存4テーブル構成・既存判定コードを一切変更しない） |

## 選択肢B: `submission_jurisdictions`（および`procedure_submission_rules`）に手続き単位の
サブディメンションを追加する

`submission_jurisdictions`に`procedure_id`（NULL可）のような列を追加し、「特定の手続きに限り
異なる窓口を割り当てる」ことを`office_category`を汚さずに表現する。`findAtScope`は
「(office_category, procedure_id)の完全一致」を優先し、無ければ「(office_category, procedure_id=NULL)」
の汎用行にフォールバックする2段探索に変更する。

| 項目 | 内容 |
|---|---|
| 利点 | `organization_types`の語彙が「真の行政機関種別」のみを表す状態を維持できる。将来、部署分岐が`municipal_tax`以外の分類でも頻発するようになった場合に、カテゴリ増殖を防げる |
| リスク | `findAtScope`（既存ADRが「Phase2確定方針」として凍結した中核ロジック）への変更が必須になる。部分UNIQUEインデックスも「(scope, category)につき1件」から「(scope, category, procedure_id)につき1件、かつprocedure_id=NULLの汎用行との優先順位」という二階層の一意性に複雑化し、`rules.name`のUNIQUE制約漏れと同種の設計ミスが起きやすい箇所が増える。「4テーブル構成」というVersion 1.1の前提を超える変更になり、Phase2で確定済みの判定ロジックに手を入れる分、レビュー・再テストの範囲が大きい |
| 実装コスト | 中〜高（スキーマ変更＋`resolve.ts`のコアロジック変更＋既存テストの見直し） |

## 選択肢C（検討したが早期に却下）: `procedure_submission_rules`に直接`office_id`を持たせる

手続き×市区町村の例外だけをピンポイントに登録する例外テーブル的な使い方（`office_category`を
介さず、特定の`procedure_id`＋`municipality_code`条件に対して直接`office_id`を返す）。

| 項目 | 内容 |
|---|---|
| 却下理由 | 市区町村スコープ→都道府県スコープ→全国スコープの降格探索（`findAtScope`）を完全にバイパスするため、対象自治体が増えるたびに市区町村ごとの個別ルール行が必要になり、政令指定都市20市規模で線形に増殖する。「ルールが提出先種別を決める」「ジャリスディクションが窓口を決める」という現行の2段責務分離を崩し、`procedure_submission_rules`の役割を肥大化させる |

---

## 推奨案

**選択肢A（`office_category`分割）を推奨する。**

### 推奨理由

1. **コスト非対称性が大きい。** Aは実装コストゼロ（データ投入のみ）で、B・Cはいずれも判定エンジンの
   コア（`findAtScope`または`procedure_submission_rules`の責務）への変更を伴う。B・Cが解決する
   「`organization_types`語彙の純粋性」は、現時点で実害が確認されているわけではない（今のところ
   実例は`municipal_tax`の1件のみ）。
2. **VISION.mdの「小さく作る」「実務データの検証なしの断定をしない」に整合する。** 全国展開で
   同種の部署分岐が他の`office_category`でも頻発するかどうかは、福岡県1県のデータだけでは分からない
   （Phase3Cの調査は`municipal_tax`のみ、他5分類では未確認）。Bのコストを先行して払う根拠が、
   現時点では憶測の域を出ない。
3. **選択肢Aは選択肢Bへの移行を妨げない。** 将来、部署分岐パターンが複数の`office_category`で
   多発すると判明した場合、その時点でBへ切り替える判断ができる。逆にBを先に実装しても、
   Aで先に運用していたデータの移行コストは大きく変わらない（`submission_jurisdictions`の行数は
   どちらの設計でも同程度になる）。

### 採用条件・再評価のトリガー（D12と同型の「保留条件」）

以下のいずれかが観測された時点で、選択肢Bへの切り替えを再評価する。

- 全国展開（Phase 3）で、`municipal_tax`以外の`office_category`（`labor_standards`・`pension_office`等）
  でも同種の「同一カテゴリ内・手続き別の部署分岐」が複数件確認された場合
- `organization_types`に追加された「部署粒度」のコードが、真の機関種別と見分けがつかなくなり
  管理画面の運用に支障が出た場合（実際にadmin担当者から混乱の報告があった場合）

### この決定が変えないもの

- `resolve.ts` / `dataAccess.ts` / `stateModel.ts` / `explain.ts`（[ADR_NATIONAL_SUBMISSION_DIRECTORY.md](ADR_NATIONAL_SUBMISSION_DIRECTORY.md)がPhase2確定方針として凍結した判定ロジック）
- `procedures` テーブル・Procedure Master本体
- 4テーブル構成（`submission_offices`/`office_sources`/`submission_jurisdictions`/`procedure_submission_rules`）

### 実装時の注意（このADR自体は実装しないが、次フェーズへの申し送り）

- `municipal_asset_tax`（仮称）の投入は、`SALARY_PAYMENT_REPORT`・`RESIDENT_TAX_WITHHOLDING`と同じ
  `procedure_submission_rules`パターンで表現できる（条件なし・全国一律の上書き）
- Phase3Cの72判定単位調査で「1部署に統合」と確認できた自治体は、既存の`municipal_tax`窓口データを
  そのまま`municipal_asset_tax`の`submission_jurisdictions`行としても登録すればよく、新規の窓口調査は
  不要（久留米市のように「市民税課がまとめて扱う」と明記されている自治体が該当）
- 「未確認」（Phase3C 1-2節の10自治体、または住所は取れたが部署分岐の有無が未確認な自治体）は、
  分割の有無を確認できるまで`municipal_asset_tax`側の投入を保留してよい。保留中は
  `not_supported`として正直に表示されるため、誤った窓口を案内するリスクはない

---

## 未確定事項（レビューで判断してほしい点）

1. 新カテゴリのコード名（`municipal_asset_tax`は仮称）。福岡市・北九州市以外の自治体で異なる
   命名慣習（「資産税課」「固定資産税課」等）が主流だった場合、コード自体は行政実務に依存しない
   抽象名のままでよいか
2. `organization_types`に「部署粒度」のコードを追加する際、既存13分類（機関種別）と区別するための
   命名規則やメタデータ（例: 分類の粒度を示すコメント欄）を今のうちに整備すべきか、それとも
   実例が増えるまでは不要か

レビュー待ちで停止する。
