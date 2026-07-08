# COMPANY_WORKSPACE_DB_AUDIT.md — companies/company_eventsテーブル実態調査（Sprint22 Phase22.2）

**ステータス: 調査のみ。DB変更・マイグレーション作成・コード変更・画面変更は一切行っていない。**
[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)（Sprint22.1、設計レビュー承認済み）8-3節・まとめ節が
「最重要の要判断事項」とした、本番に存在する素性不明の`companies`/`company_events`を流用できるか
どうかを、Sprint22.2として着手前に調査した結果をまとめる。

**調査手段の制約**: 本セッションは`anon`公開キーのみを保有し、`service_role`キー・Supabase SQL Editorへの
直接アクセス権を持たない。そのため「`anon`ロールから見た挙動」「アプリコード・マイグレーション履歴」は
本セッションで直接検証できたが、**正確なカラム一覧・RLSポリシーの正確な条件式・既存データ件数は
直接確認できていない**。該当箇所はすべて「本セッションで直接確認」と「過去の報告に基づく（未再確認）」を
明記して区別する（9節・まとめ節で再掲する要対応事項）。

## 調査結論（要約）

- `companies`/`company_events`は、**`anon`ロールにSELECT/INSERTいずれの権限も一切付与されていない**
  ことを本セッションで直接確認した（4節）。これはこのプロジェクトの他の全テーブルが従う
  「`anon`にSELECT許可が原則」（[DATABASE.md](DATABASE.md)）という自前の規約に反しており、
  **このプロジェクト自身のマイグレーションでは作られていないテーブル**であることの状況証拠になる
- **アプリケーションコード・本リポジトリの`supabase/*.sql`のいずれにも、この2テーブルへの参照や
  `CREATE TABLE`文は一切存在しない**ことを本セッションで確認した（6節・8節）
- 唯一の一次資料は`supabase/migration_event_engine.sql`のコメント（17〜24行目、Phase 2実装時の
  実際の調査結果）であり、これが[DATABASE.md](DATABASE.md)の記述の出典になっている。本セッションでは
  この一次資料と`anon`キーでの直接確認を組み合わせて調査した
- 正確なカラム一覧・RLSポリシーの正確な条件式・既存データ件数は`service_role`権限が無いと確認できない。
  本リポジトリに既にある`supabase/diagnose_company_events.sql`（読み取り専用・DDLなし）をSupabase SQL
  Editorで再実行すれば確認できるため、**まとめ節で改めてこの実行を依頼する**
- 結論（詳細は9節・10節・最終結論）: **B「新規`workspace_companies`等を作る」を推奨する**

---

## 1. `companies` テーブル

### 1-1. 紛らわしい2つの「companies」を区別する

調査の過程で、**名前が同じだが無関係な2つの`companies`構想**が本リポジトリ内に存在することが判明した。
混同を避けるため区別する。

| | (a) `docs/開発指示書_v1.md`の`companies`（Phase 1 MVP設計時の構想） | (b) 本番に実在する`companies`（2026-07-05判明） |
|---|---|---|
| 定義元 | `docs/開発指示書_v1.md` 305〜316行目の`CREATE TABLE companies` | 不明（本リポジトリのどのファイルにも定義が無い） |
| 想定スキーマ | `id UUID` PK、`session_id VARCHAR`、`prefecture_id`/`municipality_id`（FK）、`has_employees`、`employee_count`、`fiscal_month`、`industry_code`、`created_at`。**匿名セッション（`session_id`）ベースで`auth_user_id`は無い** | `auth_user_id`列を持つ（[DATABASE.md](DATABASE.md)、`migration_event_engine.sql`コメント）。**認証必須のマルチテナント設計** |
| 実際にDBへ作られたか | **作られていない**（`supabase/schema.sql`に`CREATE TABLE companies`が存在しないことを本セッションで確認。8節） | 本番に実在する（`anon`権限確認で存在自体は間接確認済み、4節） |
| `src/lib/types.ts`との関係 | `export type Company`（149行目）がこの設計と一致する型として存在するが、**アプリコードのどこからも参照されていない死んだ型**（6節で確認） | 対応する型定義は無い |

**結論**: (a)は「作られる予定だったが実際には一度も本番に反映されなかった構想」、(b)は「このプロジェクトの
どの設計文書にも出典が無い、完全に別由来のテーブル」。**両者は無関係**であり、(b)を調査対象とする。

### 1-2. (b) 本番`companies`について確認できたこと・できなかったこと

| 項目 | 状態 |
|---|---|
| テーブルの存在 | `anon`キーで`SELECT`/`INSERT`を試行し、いずれも`42501 permission denied for table companies`
（`GRANT`が無い旨のヒント付き）を本セッションで直接確認。**テーブルは存在する**（存在しなければ`404`相当の
「見つからない」応答になるはずが、"permission denied"＝存在するが権限が無い、という応答だった） |
| 正確なカラム一覧 | **未確認**（`service_role`が必要。過去の報告では`auth_user_id`列を持つとされている） |
| 主キー | **未確認** |
| 外部キー | **未確認** |
| RLSの有無 | 過去の報告（`migration_event_engine.sql`コメント、[DATABASE.md](DATABASE.md)）では
「`companies`テーブルとRLSで連動」とあるが、正確なポリシー定義は未確認（4節・5節） |
| 既存データ件数 | **未確認**（`anon`キーでは権限が無く`SELECT`できないため件数すら分からない） |

---

## 2. `company_events` テーブル

### 2-1. 命名の経緯

このプロジェクトは当初、経営イベントエンジン（Phase 2）用に`company_events`という名前のテーブルを
作成しようとしたが、**本番に同名の別テーブルが既に存在していたため`CREATE TABLE IF NOT EXISTS`が
無言でスキップされ、このアプリ用のテーブルが一度も作成されない事故**が起きていた
（`supabase/migration_event_engine.sql` 17〜24行目、一次資料）。この事故を受けて、このアプリの
イベントテーブルは衝突を避けるため`anonymous_company_events`に改名され、現在まで問題なく稼働している
（[DATABASE.md](DATABASE.md)「経営イベントエンジン」節）。

### 2-2. 確認できたこと・できなかったこと

| 項目 | 状態 |
|---|---|
| テーブルの存在 | `anon`キーで`SELECT`を試行し`42501 permission denied for table company_events`を
本セッションで直接確認。**テーブルは存在する** |
| 正確なカラム一覧 | **未確認**（過去の報告では`company_id`列を持つとされている） |
| `companies`との関係 | 過去の報告では「`company_id`カラムを持ち、`companies`という別テーブルとRLSで連動」
とされているが、実際の外部キー制約の有無は未確認 |
| 既存データ件数 | **未確認** |

---

## 3. `admin_users`

このプロジェクト自身が管理する、既存の管理者許可リストテーブル（`supabase/admin_schema.sql`で定義済み、
比較対象として確認した）。

- スキーマ: `email TEXT PRIMARY KEY`、`name TEXT`、`created_at TIMESTAMPTZ`。**ロール列は無い**
  （Sprint22.1で設計した「管理者/担当者/経営者/閲覧のみ」の4ロールは現状一切存在しない、
  [COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 0節で既出の確認事項の再確認）
- ポリシー: `self_read`（`USING (email = auth.email())`）のみ。`GRANT SELECT ON admin_users TO authenticated`
- 本セッションで`anon`キーにより`SELECT`を試行したところ`200 OK`・空配列`[]`が返った。これは
  `anon`にも何らかの`SELECT`権限が存在し（恐らく`grant_public_read.sql`の一括付与に巻き込まれている）、
  かつ`self_read`ポリシーが正しく機能して未認証リクエストからは0行に絞られていることを示す
  （`companies`/`company_events`の「`permission denied`」＝権限が無い、とは異なる挙動である点に注意）

---

## 4. RLS / policy（本セッションで直接確認した挙動）

`anon`キーで以下を実行した（`curl` + PostgREST、詳細はセッションログ参照）。

| 対象 | 操作 | 結果 |
|---|---|---|
| `companies` | `SELECT` | `401` / `42501 permission denied for table companies`（`GRANT SELECT ON public.companies TO anon;`が必要という旨のヒント付き） |
| `companies` | `INSERT`（空ボディ） | `401` / `42501 permission denied for table companies`（`GRANT INSERT`が必要という旨のヒント） |
| `company_events` | `SELECT` | `401` / `42501 permission denied for table company_events` |
| `admin_users` | `SELECT` | `200` / `[]`（RLSにより0行。3節） |
| `anonymous_company_events`（比較対象） | `SELECT` | `200` / 実データ1件（`public_read`相当のポリシーが機能。参照用） |

**解釈**: `permission denied`は「テーブルは存在するが`anon`ロールへの`GRANT`が一切無い」ことを意味する
（RLSが「0件に絞る」のとは異なるレベルの制限。仮にRLSが緩くても`GRANT`が無ければ`anon`は一切アクセスできない）。
**このプロジェクトの全マイグレーションは「`anon`にSELECT許可が原則」という自前の規約を徹底しており**
（[DATABASE.md](DATABASE.md)「権限（GRANT/RLS）の一般原則」、[CLAUDE.md](../CLAUDE.md)「DB変更時の注意」）、
`companies`/`company_events`がこの規約に従っていないことは、**これらがこのプロジェクトの意図した設計・
マイグレーションの産物ではない**という状況証拠を補強する。

---

## 5. `admin_read` policyの実態

**正確な条件式は本セッションでは確認できていない**（`service_role`が無いと`pg_policy`を直接見られない。
`anon`キーでは当然この確認はできない）。過去の報告（[DATABASE.md](DATABASE.md)）では
`own_select`/`own_insert`/`own_update`/`own_delete`/`admin_read`という5種のポリシー名が挙げられているが、
**`admin_read`が具体的に「誰の」`admin`権限を指しているのか（このプロジェクトの`admin_users`テーブルと
連動しているのか、それとも別の判定方法か）は未確認**。名前から推測する限り「本人以外の管理者ロールが
全件参照できる」ポリシーである可能性が高いが、**推測の域を出ない**。

この点は9節の判断（流用可否）に直結するため重要度が高い。**まとめ節で、`diagnose_company_events.sql`の
再実行に加えて`admin_read`ポリシーの条件式（`pg_get_expr(polqual, polrelid)`）を確認する依頼を含める。**

---

## 6. 既存コードからの参照箇所

本セッションで`src/`・`supabase/`・`docs/`全体を`companies`・`company_events`・`auth_user_id`で検索した
（`CompanyProfile`/`CompanyState`/`CompanyStage`等、無関係な既存概念の命名は除外）。

- **アプリケーションコード（`src/`）から`companies`/`company_events`/`auth_user_id`への参照は0件。**
  `src/lib/types.ts`の`Company`型（1-1節(a)）が唯一の関連コードだが、これ自体もアプリの他のどこからも
  使われていない
- `supabase/`配下では`migration_event_engine.sql`のコメント（一次資料）・`diagnose_company_events.sql`
  （調査用SQL、DDLなし）のみが言及しており、いずれも「触らない」という結論を記録するための文書であって
  実際にテーブルを操作するものではない
- **削除・改変すると壊れる既存の動作は無い**（参照が無いため）。ただし1-2節・2-2節の通り、テーブル自体を
  改変する行為はこのプロジェクトの管理下に無いスキーマを触ることになるため、**「壊れないはず」という
  判断も本セッションでは実データ・実スキーマを見ずに下した推測**であることは明記しておく

---

## 7. 既存データの有無

**未確認。`anon`キーでは`permission denied`のため件数すら取得できない。** `service_role`または
Supabase SQL Editor（`postgres`ロール）でなければ確認できない。まとめ節で確認を依頼する。

---

## 8. 既存マイグレーション履歴

- **本リポジトリの`supabase/*.sql`のいずれにも`CREATE TABLE companies`・`CREATE TABLE company_events`は
  存在しない**（本セッションで`grep`により確認）。`supabase/schema.sql`が定義するテーブルは
  `prefectures`/`municipalities`/`jurisdiction_offices`/`procedures`/`procedure_documents`/
  `official_links`の6つのみで、1-1節(a)の`companies`（`docs/開発指示書_v1.md`の初期構想）すら
  実際には反映されていない
- **`companies`/`company_events`（本番実在分）を作成した記録はこのリポジトリのどこにも残っていない。**
  Supabaseダッシュボードから手動作成されたか、プロジェクト作成時のテンプレート・サンプルスキーマに
  由来する可能性が高いと推測されるが、**作成経緯そのものは本調査でも特定できなかった**
- 関連する一次資料は`supabase/migration_event_engine.sql`（17〜24行目のコメント、Phase 2実装時に
  この問題が発覚した際の記録）のみ

---

## 9. Company Workspaceで流用できるか

### 9-1. 流用にあたっての具体的な懸念点

1. **所有者モデルの不一致**: 過去の報告が正しければ、`companies.auth_user_id`は「1つの`auth.users`行が
   1社を所有する」という単純な1対1の所有モデルを前提にしている可能性が高い（`own_select`等の
   ポリシー名から推測）。一方[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 7節が設計した権限モデルは
   「1社に複数の担当者を割り当てる」多対多の関係（`company_staff_assignments`相当）を必要とする。
   この不一致を`companies`側の改修で吸収しようとすると、素性不明のテーブルに対する構造変更が必要になる
2. **共有モデルとの不一致**: [COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 6節は「経営者にSUNBOOの
   フルアカウントを持たせない」ことを前提に共有リンク方式を設計した。`auth_user_id`ベースの
   `companies`は「経営者本人がSupabase Authアカウントを持つ」ことを前提にしている可能性が高く、
   この前提差も設計の手戻りを招く
3. **`company_events`の役割重複**: このプロジェクトには既に`anonymous_company_events`という、
   Rule Engine・診断エンジンと密結合した実運用中のイベントテーブルが存在する。素性不明の
   `company_events`をイベント管理に転用しようとすると、既存の`registerCompanyEvent`
   （`src/lib/events.ts`）が依存する`anonymous_company_events`と役割が競合し、
   移行コストと事故リスクの両方が高い
4. **規約不適合**: 4節で確認した通り、この2テーブルは`anon`への`GRANT`すら無く、このプロジェクトが
   徹底している「全テーブルRLS＋`anon` SELECT許可」という規約（[CLAUDE.md](../CLAUDE.md)）に
   従っていない。仮に流用する場合、GRANT・RLSをこのプロジェクトの規約に合わせて全面的に
   引き直す必要があり、「既存のものをそのまま使う」というA案本来のメリット（新規実装コストの削減）が
   ほとんど得られない
5. **未検証のスキーマに依存するリスク**: 5節・7節の通り、正確なカラム構成・既存データの有無・
   RLSの正確な条件式が未確認のまま設計を進めることは、[CLAUDE.md](../CLAUDE.md)が戒める
   「実務データの検証なしの断定」に該当する

### 9-2. 過去の前例との整合

このプロジェクトは過去に全く同じ状況（想定していた`company_events`という名前が既に別物として
存在していた）に直面し、**流用を試みず、衝突しない新しい名前（`anonymous_company_events`）で
独自に作る判断をして解決した**（2節）。この前例は現在検討している`companies`の扱いにも
そのまま当てはまる。当時の判断が正しかったこと（`anonymous_company_events`は現在まで問題なく
稼働している）は、同じ判断パターンを今回も踏襲する根拠になる。

---

## 10. 流用できない場合の新規テーブル案

詳細な項目設計は[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 8-2節に譲り、本節ではテーブル構成の
要点のみを示す。

| テーブル名（案） | 役割 | 主なカラム（既存型からの転写） |
|---|---|---|
| `workspace_companies` | 会社本体。**既存`src/lib/companyProfile.ts`の`CompanyProfile`型をほぼそのままカラムに転写**（1-1節(a)の未使用`Company`型とは別物として、新規に定義し直す） | `id`, `name`, `prefecture_code`, `municipality_code`, `corporate_type`, `employee_count`, `capital`, `established_date`, `fiscal_month`, `stage`, `consumption_tax_status`, `invoice_registration_status`, ... |
| `workspace_tax_return_entries` | 決算実績。既存`TaxReturnEntry`型を転写 | `company_id`（FK）, `fiscal_year`, `fiscal_year_end_date`, `taxable_sales_amount`（JSONB or 分解カラム）, ... |
| `workspace_timeline_events` | Timeline（manual/systemソース分のみ。company_profile/tax_return_profile/eventソースは既存テーブルから都度導出するため保存不要、[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 8-2節） | `company_id`（FK）, `occurred_at`, `category`, `source`, `metadata`（JSONB） |
| `company_staff_assignments` | 担当者の割当（多対多） | `admin_email`（FK→`admin_users.email`）, `company_id`（FK）, 複合PK |
| `admin_users`への`role`列追加 | 管理者/担当者の区別 | `ALTER TABLE admin_users ADD COLUMN role TEXT` |

命名は`companies`/`company_events`との衝突を避けるため、2節の前例に倣い**プレフィックス
（`workspace_`）で明確に区別する**。GRANT/RLSは[CLAUDE.md](../CLAUDE.md)の規約（テーブル定義と
同じマイグレーションファイル内でGRANT+RLS+policyをセットで書く）に従って新規に設計する。

---

## 最終結論: A / B / C のどれが最適か

**B「新規`workspace_companies`等を作る」を推奨する。**

| 案 | 評価 |
|---|---|
| A. 既存`companies`/`company_events`を流用する | **非推奨**。9-1節の5つの懸念（所有者モデル不一致・共有モデル不一致・`anonymous_company_events`との役割競合・規約不適合・未検証スキーマへの依存）がいずれも解消されない。GRANT/RLSを結局全面的に引き直す必要があり、流用のメリット（実装コスト削減）がほぼ得られない |
| **B. 新規`workspace_companies`等を作る** | **推奨**。①このプロジェクト自身が過去に全く同じ状況（`company_events`の衝突）を経験し、同じ判断（新規の名前で独自に作る）で解決した実績がある（9-2節）。②[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)が設計した権限モデル（多対多の担当者割当・リンク共有）に最初から整合するスキーマを、既存の`CompanyProfile`等の型をほぼそのまま転写する形で作れる。③GRANT/RLSをこのプロジェクトの規約通りに新規設計でき、他の全テーブルと一貫性が保てる |
| C. 既存テーブルを段階的に置き換える | **非推奨**。素性不明・スキーマ未確認のテーブルに対して段階的にせよ改変を加えることは、想定外の依存や制約（未確認の外部キー・トリガー等）を踏み抜くリスクがA案よりもむしろ高い。「置き換える」ためには結局まずBと同等の新規スキーマを設計する必要があり、その上で移行という追加コストが乗るだけで、Bに対する優位性が無い |

`companies`/`company_events`（本番実在分）は、[CLAUDE.md](../CLAUDE.md)「旧テーブルは即座には
削除しない」原則と2節の前例に倣い、**触らずそのまま残置する**（削除もしない。将来的に作成経緯が
判明した場合に備え、ロールバック安全性・調査可能性を残す）。

---

## まとめ（レビュー観点・要対応事項）

1. **最終結論**: B案（新規`workspace_companies`等）で進めてよいか
2. **本セッションで確認できなかった事項**（`service_role`が必要）。以下をSupabase SQL Editorで
   確認いただきたい。本リポジトリ既存の`supabase/diagnose_company_events.sql`（読み取り専用・
   DDLなし・再実行安全）がそのまま使える。加えて、5節の`admin_read`ポリシーの正確な条件式
   （`SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy WHERE polrelid IN
   ('public.companies'::regclass, 'public.company_events'::regclass)`）も確認いただけると、
   B案の設計（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 8節）をより正確に進められる
   - `companies`/`company_events`の正確なカラム一覧・主キー・外部キー
   - 既存データの有無・件数
   - `admin_read`ポリシーの正確な条件式
3. **1-1節の(a)**: `src/lib/types.ts`の未使用`Company`型（`docs/開発指示書_v1.md`の未実装構想）を
   Sprint22.x以降のどこかで削除するか、このまま残置するか（[CLAUDE.md](../CLAUDE.md)「不要なら
   完全に削除してよい」の対象になりうるが、本調査のスコープ外のため別途判断を仰ぐ）
4. **10節の新規テーブル案**の詳細スキーマは[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 8節で
   Sprint22.2以降改めて設計する（本ドキュメントは調査と方針決定のみ）
