# PHASE5_3_MANUAL_BROWSER_VERIFICATION.md — Phase5-3 検証データ準備計画・手動確認手順

**ステータス: 計画・手順書のみ。DBへのINSERT/UPDATE/DELETEはこのドキュメントでは一切行っていない。**

目的: 本番データ・既存ユーザーへ影響を与えず、Workspace RoadmapのCutover（Phase5-2、
`docs/PHASE5_UI_CUTOVER_PLAN.md` Part C）を実ブラウザで確認できる検証用企業データを準備し、
手動確認の手順を固定する。SQL案は[PHASE5_3_TEST_DATA_SQL.md](PHASE5_3_TEST_DATA_SQL.md)、
チェックシートは[PHASE5_3_BROWSER_CHECKLIST.md](PHASE5_3_BROWSER_CHECKLIST.md)を参照。

---

## 0. 調査結果（作成前に確認した事実）

### 0-1. `workspace_companies`のスキーマ（`supabase/migration_workspace_mvp.sql`）

| 列 | 型 | 制約 |
|---|---|---|
| `id` | SERIAL | PK |
| `name` | TEXT | NOT NULL |
| `prefecture_code` | TEXT | NOT NULL（`prefectures.code`と一致させる必要があるが、FK制約自体は無い） |
| `municipality_code` | TEXT | NOT NULL（`municipalities.code`と一致させる必要があるが、FK制約自体は無い） |
| `corporate_type` | TEXT | NOT NULL、CHECK IN ('kabushiki','godo') |
| `fiscal_month` | INTEGER | NULL可、CHECK 1〜12。**NULLだとRoadmapが空になる**（`roadmap.ts`: `if (fiscalMonth === null) return [];`）ため、検証用には必ず設定する |

### 0-2. Workspace作成に必要な親テーブル

**無い。** `workspace_companies`は他テーブルに依存しない起点テーブル（FK制約自体を持たない）。
`workspace_company_profiles`（1:1、`company_id`が主キー兼FK、`ON DELETE CASCADE`）・
`workspace_members`（多対多の担当者）・`workspace_share_links`はいずれも`workspace_companies`
作成**後**に必要に応じて作るものであり、作成**前**の前提ではない。

### 0-3. `workspace_companies`の必須カラム

`name`・`prefecture_code`・`municipality_code`・`corporate_type`の4つ（`fiscal_month`は列としては
NULL可だが、Roadmapを機能させるには実質必須）。

### 0-4. CompanyProfileへ変換されるフィールド

`workspaceRowsToCompanyProfile`（`src/lib/workspaceCompanyProfile.ts`）が、
`workspace_companies`（法人種別・決算月）と`workspace_company_profiles`（それ以外）を
合成して`CompanyProfile`型を作る。**`workspace_company_profiles`の行が無い会社は
`DEFAULT_PROFILE_FIELDS`（`employee_count: 0`等）で自動的に補われる**ため、
検証専用会社では`workspace_company_profiles`の行を省略してもRoadmap自体は計算される
（1-3節参照）。

### 0-5. `municipality_code`の保存場所・形式

`workspace_companies.municipality_code`（TEXT）に、`municipalities.code`と同じcanonical
6桁コード（ADR D14、検査数字付き）をそのまま文字列として保存する。FK制約は無いため
DBレベルでは値の妥当性チェックがされない＝**正確な値を使う責任は投入側にある**
（1-3節「実際の自治体コードはcanonical 6桁を使う」の理由）。

### 0-6. 法人種別（`corporate_type`）の保存形式

TEXT列、CHECK制約で`'kabushiki'`（株式会社）・`'godo'`（合同会社）の2値のみ許可。
今回の対象手続き（`MUNICIPAL_RESIDENT_TAX_RETURN`・`DEPRECIABLE_ASSET_TAX_RETURN`）は
`procedures.corporate_type`がいずれも`NULL`（法人種別を問わない）ことを確認済みのため、
検証用会社ではどちらを選んでも表示結果に影響しない。

### 0-7. Roadmap生成に最低限必要な会社情報

- `workspace_companies.fiscal_month`が1〜12のいずれか（NULLだと`buildAnnualRoadmap`が
  空配列を返して打ち切られる）
- `workspace_companies.municipality_code`/`prefecture_code`が実在する
  `municipalities`/`prefectures`のcodeと一致すること（診断エンジンが
  `.eq('code', ...)`で完全一致検索するため、1文字でも違うと該当なし＝`offices: []`になる）
- 対象手続き（65・66）は`requires_employees=false`・`corporate_type=NULL`（REST確認済み）のため、
  `employee_count`や`corporate_type`の値によって表示有無は変わらない

### 0-8. RLSポリシー

`workspace_companies`等4テーブルはいずれも`anon`への`GRANT`を明示的に`REVOKE`し
（`REVOKE ALL ... FROM anon`）、`authenticated`かつ`admin_users`登録者のみ
`FOR ALL`（SELECT/INSERT/UPDATE/DELETE全て）を許可する`admin_all`ポリシーで統一されている
（`workspace_members`のみ、自分自身の行を読める`self_read`ポリシーが追加である）。

**実機確認**: anonキーで`workspace_companies`をSELECTすると`200 []`（0件、エラーではない）が
返ることを確認した。これは`anon`に実質的な参照権限が無いことの間接的な確認であり、
**この会話セッション（anonキーのみ保有）からはAPI経由で投入も削除もできない**。

### 0-9. 作成者・所有者・`workspace_id`との関連

`workspace_companies`は所有者列（`owner_id`/`auth_user_id`等）を一切持たない。
「誰が担当するか」は`workspace_members`（多対多）で表現する設計だが、**Sprint22.4時点の
権限モデルは意図的にフラットで、`admin_users`登録者なら誰でも全社にアクセスできる**
（`workspace_members`への行の有無はアクセス可否に影響しない、コード内コメントで明記）。
**したがって検証用会社に`workspace_members`行を作る必要は無い**（作らなくても管理画面から見える）。

### 0-10. 既存のseed / fixture / demo dataの仕組み

**存在しない。** `supabase/`配下・コードベース全体を検索したが、Workspace向けのseed/fixture/
demoデータ投入の仕組みは見つからなかった（`seed.sql`/`reset_and_seed.sql`は東京都渋谷区の
地理マスタのみが対象で、Workspace企業とは無関係）。

### 0-11. Supabase Dashboardから安全に作成できるか

**できる。** Supabase DashboardのSQL Editor（またはTable Editor）は、プロジェクト所有者としての
接続でRLSの影響を受けずに操作できる（0-8節の通り、anonキー経由では不可能なため、**Dashboard側の
操作が唯一の現実的な投入経路**になる）。

### 0-12. SQLで作る場合のロールバック方法

`workspace_company_profiles`・`workspace_members`・`workspace_share_links`はいずれも
`company_id`に`ON DELETE CASCADE`を張っているため、**`workspace_companies`の該当行を
`DELETE`するだけで、関連する全テーブルの行が自動的に連鎖削除される**。個別テーブルを
順番に消す必要はない（詳細は[PHASE5_3_TEST_DATA_SQL.md](PHASE5_3_TEST_DATA_SQL.md)）。

### 0-13. 旧Resolver側の実データ確認（今回追加で確認した事実）

旧`jurisdictions`テーブルを`organization_type_id`（`municipal_tax`=7）で確認したところ、
**全体で1行のみ存在し、対象は`municipality_id=1`（渋谷区）のみ**だった。札幌市・福岡市・
北九州市の`municipal_tax`データは旧スキーマに1件も存在しない。**したがって、検証用3社で
procedure 65/66に何らかの窓口が表示された場合、それは新Resolver（Cutover）由来であると
断定できる**（旧データが物理的に存在しないため、旧経路からは絶対に出てこない）。これにより
「新旧どちらの結果が表示されているか」の判別が、画面上の表示だけで曖昧にならずに済む。

---

## 1. 前提条件

- 検証実施者が管理者アカウント（`admin_users`登録済み）でログインできること
- Supabase DashboardのSQL Editorへアクセスできること（0-11節の通り、投入はDashboard経由が必須）
- `npm run dev`でローカルサーバーが起動していること（本番環境では実施しない）
- [PHASE5_3_TEST_DATA_SQL.md](PHASE5_3_TEST_DATA_SQL.md)のSQL案を確認済みであること
- 検証はローカル環境またはStaging環境を想定し、**本番環境での実施は推奨しない**
  （本番の`admin_users`一覧・Workspace一覧に検証用企業が混ざることを避けるため）

## 2. 検証用企業一覧

| # | 企業名（案） | 所在地 | municipality_code | prefecture_code | 検証内容 |
|---|---|---|---|---|---|
| A | [E2E] 札幌提出先検証株式会社 | 札幌市中央区 | `011011` | `01` | 法人市民税・償却資産の両方が新Resolverで解決される |
| B | [E2E] 福岡提出先検証株式会社 | 福岡市中央区 | `401331` | `40` | 法人市民税のみ新Resolverで解決される |
| C | [E2E] 北九州提出先検証株式会社 | 北九州市門司区 | `401013` | `40` | 法人市民税は新Resolver、償却資産は対象外のまま（`not_supported`にもならず旧結果＝窓口なしを維持） |

3社とも`corporate_type='kabushiki'`・`fiscal_month=3`（3月決算、対象手続きの表示可否には影響しないため任意の値で固定）。

## 3. 企業作成手順

1. Supabase Dashboard → SQL Editorを開く
2. [PHASE5_3_TEST_DATA_SQL.md](PHASE5_3_TEST_DATA_SQL.md)の「投入前の確認SELECT」を実行し、
   同名の企業が存在しないことを確認する
3. 同ドキュメントの「INSERT本体」を実行する（3社分）
4. 同ドキュメントの「投入後の確認SELECT」で3件のIDを控える
5. 管理者アカウントでログインし、`/admin/workspaces`一覧に3社が表示されることを確認する

## 4. Workspace Dashboard確認

各社について`/admin/workspaces/[id]`を開き、以下を確認する。

- HTTP 500エラーが発生しないこと
- Hydrationエラー（コンソールに`Hydration failed`等）が出ないこと
- `console.error`が0件であること
- 会社名・所在地（都道府県・市区町村）が正しく表示されること

## 5. Roadmap確認

各社について`/admin/workspaces/[id]/roadmap`を開き、以下を確認する。

- 正常に一覧が表示されること（真っ白・エラーカードにならないこと）
- 少なくとも法人市民税申告・償却資産申告の行が一覧に含まれること
  （`fiscal_offset`/`fixed_date`のため、`horizonYears=3`の範囲内で必ず出現するはず）
- 従来から表示されていたはずの他の手続き（法人税確定申告等、`tax_office`等5分類）の表示が
  壊れていないこと（Cutoverは`municipal_tax`/`municipal_asset_tax`かつ対象自治体のみに
  影響するため、無関係の手続きは無変化のはず）

### 5-1. 札幌市（企業A）法人市民税の期待値

| 項目 | 期待値 |
|---|---|
| 提出先 | 中央市税事務所諸税課法人市民税係 |
| 根拠 | Phase5-2 Cutover対象（`isPhase5_2Target('011011', 65) === true`）、Resolver直接検証で`resolved`確認済み |

### 5-2. 札幌市（企業A）償却資産の期待値

| 項目 | 期待値 |
|---|---|
| 提出先 | 中央市税事務所固定資産税課償却資産担当（法人市民税係とは別窓口） |
| 根拠 | 同上、対象（`isPhase5_2Target('011011', 66) === true`） |

### 5-3. 福岡市（企業B）法人市民税の期待値

| 項目 | 期待値 |
|---|---|
| 提出先 | 財政局法人税務課法人市民税係 |
| 根拠 | 対象（`isPhase5_2Target('401331', 65) === true`） |

### 5-4. 北九州市（企業C）法人市民税の期待値

| 項目 | 期待値 |
|---|---|
| 提出先 | 財政・変革局税務部課税第一課 |
| 根拠 | 対象（`isPhase5_2Target('401013', 65) === true`） |

### 5-5. 北九州市（企業C）償却資産が「旧結果維持」であることの確認

| 項目 | 期待値 |
|---|---|
| 提出先 | **窓口欄が空、または「提出先情報なし」に相当する表示**（0-13節の通り、旧`jurisdictions`にも
北九州市の`municipal_tax`データが存在しないため、旧経路をたどっても元々`office: null`になる） |
| 確認すべきこと | **`not_supported`という新Resolver由来の文言・状態がRoadmap画面に一切表示されないこと。** Phase5-2のCutoverはWorkspace Roadmapの表示形式（`ScheduleProcedure.office`、`JurisdictionOffice`型）に新しい状態表現を持ち込まない設計のため、`not_supported`という単語自体がこの画面に出てくること自体が想定外（Preview Route固有の表現であり、Cutover経由のWorkspace表示には現れない）。もし出てきた場合は不具合として記録する |
| 根拠 | `isPhase5_2Target('401013', 66) === false`（北九州市×償却資産はC-4節で明示的に対象外）。Cutoverは対象外の手続きに対して新Resolverを呼び出しすらしないため、`applyCutoverToProcedure`は`procedure`を無変更で返す |

## 6. PDF確認

いずれかの会社（企業Aを推奨）のRoadmap画面から「PDF出力」を実行する。

- 生成が成功すること（エラーダイアログが出ないこと）
- PDF内の該当手続き行に、5節で確認した新提出先の窓口名が表示されること
- 他の手続きの表示（レイアウト・改行等）が崩れていないこと

## 7. Excel確認

同様に「Excel出力」を実行する。

- 生成が成功すること
- Excel内の該当セルに新提出先の窓口名が表示されること
- 他の列・行のレイアウトが崩れていないこと

## 8. Console確認

各画面（Dashboard・Roadmap・PDF出力操作後・Excel出力操作後）でブラウザの開発者ツール→Consoleを
確認し、`console.error`の件数を記録する（期待値: 0件）。

## 9. Network確認

開発者ツール→Networkタブで、各画面遷移時に発生した通信のうち、ステータスコードが
500〜599のものが無いことを確認する（期待値: 0件）。

## 10. スクリーンショット保存ルール

- 保存先ディレクトリ: `test-results/phase5-3/`（`.gitignore`の`test-results/`により既に除外設定済み、
  [PHASE5_UI_CUTOVER_PLAN.md](PHASE5_UI_CUTOVER_PLAN.md)関連作業で追加したルールを流用する）
- ファイル名規則: `{会社ラベル}-{画面}.png`（例: `A-sapporo-dashboard.png`・`A-sapporo-roadmap.png`・
  `A-sapporo-pdf.png`・`A-sapporo-excel.png`）
- 4画面（Dashboard・Roadmap・PDF・Excel）× 検証に使った会社数分を撮影する

## 11. PASS / FAIL記録欄

[PHASE5_3_BROWSER_CHECKLIST.md](PHASE5_3_BROWSER_CHECKLIST.md)に記録する（本ドキュメントでは
様式のみ定義し、実際の記録は別ファイルで行う）。

## 12. 検証後のデータ削除手順

[PHASE5_3_TEST_DATA_SQL.md](PHASE5_3_TEST_DATA_SQL.md)の「ロールバックSQL」を、Supabase
DashboardのSQL Editorで実行する。`workspace_companies`の3行を`DELETE`するだけで、
`ON DELETE CASCADE`により関連テーブル（作成していれば`workspace_company_profiles`等）も
連鎖削除される（0-12節）。削除後、`/admin/workspaces`一覧から3社が消えていることを確認する。

---

レビュー待ちで停止する。
