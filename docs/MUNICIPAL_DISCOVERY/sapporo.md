# 札幌市 — municipal_tax / municipal_asset_tax Discovery

**ステータス: 調査結果のみ。コード・Migration・SQL・データ投入は本ドキュメントでは一切行っていない。**
[MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md)のStep 0〜6に従って実施。
調査日: 2026-07-17。

対象手続き（[MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md) 2-1節の通り、
`municipal_tax`の4手続きのうち会社所在地で提出先が決まる2件のみが対象）:

- `MUNICIPAL_RESIDENT_TAX_RETURN`（法人市民税申告）
- `DEPRECIABLE_ASSET_TAX_RETURN`（償却資産申告）

---

## 基本情報

| 項目 | 内容 |
|---|---|
| 自治体名 | 札幌市（政令指定都市） |
| 区数 | 10区（中央区・北区・東区・白石区・厚別区・豊平区・清田区・南区・西区・手稲区） |
| SUNBOO `municipalities`テーブルでの登録状況 | **未登録。**`prefectures`テーブルに北海道（コード等）自体が存在しない（REST確認済み、2026-07-17時点）。したがって札幌市10区の`municipality_code`も存在しない |
| 政令指定都市の区集約構造 | 札幌市は住民税等の一般業務では**5つの「市税事務所」**（中央・北部・東部・南部・西部）が複数区をまとめて担当する構造を持つ。ただし**法人市民税・固定資産税（償却資産分）に限っては、この5事務所分割とは別に、中央市税事務所が市内10区を一括担当**する特例がある（後述） |

## 部署構造（統合型・分割型・不明型）

**分割型。** 同一の中央市税事務所内で、法人市民税と償却資産（固定資産税）を**別の課**が担当する。

- 法人市民税: 中央市税事務所**諸税課**法人市民税係
- 償却資産: 中央市税事務所**固定資産税課**償却資産担当

両部署は同一住所（南3条西11丁目）だが、課・係名・電話番号がいずれも異なる一次情報を直接確認できた
ため、[MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md) 2-3節の「分割型」に
該当すると判定する（福岡市と同型のパターン）。

## municipal_tax の提出先（法人市民税）

| 項目 | 内容 |
|---|---|
| 部署名 | 中央市税事務所諸税課法人市民税係 |
| 住所 | 〒060-8649 札幌市中央区南3条西11丁目 |
| 電話番号 | 011-596-6796 |
| 管轄区域 | **市内10区すべて**（区ごとの分岐なし。「次の税目の申告・申請・課税内容の確認などは、市内全区を一括として中央市税事務所が担当しています。・法人市民税」と`市税事務所一覧`ページに明記されているのを直接確認済み） |
| 情報源 | 一次情報（公式ページ直接フェッチ済み） |

## municipal_asset_tax の提出先（償却資産申告）

| 項目 | 内容 |
|---|---|
| 部署名 | 中央市税事務所固定資産税課償却資産担当 |
| 住所 | 〒060-8572 札幌市中央区南3条西11丁目 |
| 電話番号 | 011-596-7303 |
| 管轄区域 | **市内10区すべて**（同じ`市税事務所一覧`ページの注記に「固定資産税（償却資産分）」も同様に一括担当と明記されているのを直接確認済み） |
| 情報源 | 一次情報（公式ページ直接フェッチ済み） |

**郵便番号についての注記**: 法人市民税係（060-8649）と償却資産担当（060-8572）で郵便番号が異なる。
同一建物内でも課ごとに専用の郵便番号を持つ大規模庁舎では一般的なパターンであり、いずれも各部署の
公式ページに明記された値をそのまま転記したものである（推測による統一はしていない）。

## 一次情報URL

| # | ページ | URL | 確認方法 |
|---|---|---|---|
| A | 市税事務所／札幌市（5事務所一覧・管轄区域・法人市民税/償却資産の一括担当に関する注記） | https://www.city.sapporo.jp/citytax/shizei_jimusho/index.html | 直接フェッチ・原文引用確認済み |
| B | 法人市民税／札幌市 | https://www.city.sapporo.jp/citytax/syurui/shiminzei/hojin.html | 直接フェッチ済み |
| C | 償却資産の固定資産税／札幌市 | https://www.city.sapporo.jp/citytax/syurui/kotei_toshi/shokyaku.html | 直接フェッチ済み |

いずれも札幌市公式サイト（`city.sapporo.jp`）内のページであり、検索結果の要約やAIの推測は情報源として
用いていない（[MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md) 1-3節）。

情報源Aの該当原文（そのまま引用）:

> 次の税目の申告・申請・課税内容の確認などは、市内全区を一括として中央市税事務所が担当しています。
> ・法人市民税
> ・固定資産税（償却資産分）

## 電話番号（確認できた場合のみ）

- 法人市民税係: 011-596-6796（情報源B、公式ページに明記）
- 償却資産担当: 011-596-7303（情報源C、公式ページに明記）

複数情報源間での電話番号の不一致は確認されなかった（福岡県・福岡市・北九州市の調査で見られた
一覧ページと個別ページの食い違いは、今回は発生していない）。

## 実装可否

**Discoveryとしては完了（実装可能な品質のデータが揃っている）。ただし現時点で本番投入は不可。**

理由: SUNBOOの`prefectures`テーブルに北海道が存在せず、`municipalities`テーブルにも札幌市10区の
`municipality_code`が存在しない（REST APIで確認済み、東京都・福岡県の2件のみが登録されている）。
`submission_jurisdictions.municipality_scope_id`は`municipalities(id)`へのFKであるため、
札幌市の`municipality_code`が存在しない状態ではMigration自体が書けない（書いてもFK制約違反になる）。

これは今回のDiscoveryの品質問題ではなく、**全国展開の前提となる地理マスタ（`prefectures`/
`municipalities`）そのものが東京都・福岡県以外に投入されていない**という、より手前の構造的な
未整備事項である。本Phase4-1（Discoveryのみ、データ投入禁止）のスコープには含まれないが、
Phase4で政令指定都市の実装を進める前に、**都道府県・市区町村マスタの全国投入を別タスクとして
先に、または並行して計画する必要がある**（本書はこの事実の指摘に留め、対応の要否・時期は
プロダクトオーナーの判断に委ねる）。

## Resolver期待結果

`prefectures`/`municipalities`マスタが投入され、本Discoveryのデータに基づくMigrationが適用された
場合を想定した期待結果（現時点では未実装のため、あくまで想定）。

| ケース | 入力 | 期待される`ResolutionStatus` |
|---|---|---|
| 法人市民税・中央区 | `MUNICIPAL_RESIDENT_TAX_RETURN` × 札幌市中央区 | `resolved`・中央市税事務所諸税課法人市民税係 |
| 法人市民税・手稲区（10区中もっとも離れた区の1つ） | `MUNICIPAL_RESIDENT_TAX_RETURN` × 札幌市手稲区 | `resolved`・**同じ**中央市税事務所諸税課法人市民税係（10区収束の確認） |
| 償却資産・中央区 | `DEPRECIABLE_ASSET_TAX_RETURN` × 札幌市中央区 | `resolved`・中央市税事務所固定資産税課償却資産担当（法人市民税とは別窓口） |
| 償却資産・清田区 | `DEPRECIABLE_ASSET_TAX_RETURN` × 札幌市清田区 | `resolved`・**同じ**中央市税事務所固定資産税課償却資産担当 |
| 現時点（マスタ未投入） | 上記いずれも | `insufficient_profile`または`not_supported`相当（`municipality_code`自体が存在しないため、CompanyProfileで札幌市を選択すること自体ができない） |

## 実装時の注意事項

1. **前提条件**: `prefectures`（北海道）・`municipalities`（札幌市10区）のマスタ投入が本Migrationの
   前に必要（上記「実装可否」参照）。この投入自体は本Discoveryの対象外
2. **分割型として実装する**: 福岡市と同じパターンで、`submission_offices`に2行
   （`municipal_tax`＝法人市民税係、`municipal_asset_tax`＝償却資産担当）を作り、
   `submission_jurisdictions`はそれぞれ10行（10区分）×2カテゴリ＝20行、いずれも各カテゴリ内では
   同一`office_id`に収束させる（[MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md)
   5-3節のパターンをそのまま適用可能）
3. **`organization_types`/`procedure_submission_rules`の追加は不要**（[MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md)
   3-2節・3-3節の通り、全国共通のカテゴリ・ルールを福岡市・北九州市と共用する）
4. **5つの「市税事務所」（中央・北部・東部・南部・西部）を管轄区域の単位として誤用しない**。
   これらは主に個人住民税等、他の税目の管轄区分であり、法人市民税・償却資産はこの分割の**外側**で
   中央市税事務所が一括担当する特例がある。区ごとに異なる`市税事務所`を提出先として登録しないこと
   （原文引用の通り、この点は一次情報で明確に確認済み）
5. **特別徴収（`RESIDENT_TAX_WITHHOLDING`、対象外）の担当課は未調査。** 本Discoveryのスコープ外
   のため確認していない（[MUNICIPAL_DISCOVERY_CHECKLIST.md](../MUNICIPAL_DISCOVERY_CHECKLIST.md)
   2-1節の通り、`each_employee`ルールは既に全国一律で設定済みのため調査不要）

---

レビュー待ちで停止する。
