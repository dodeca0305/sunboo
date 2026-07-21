# UAT_REPORT_PHASE5.md — Submission Directory Phase5 受け入れテスト報告

**実施日**: 2026-07-18
**実施者**: Claude Code（このセッション）
**環境**: local（`npm run dev`、`http://localhost:3000`、既存プロセスが起動中であることを確認して使用）
**接続先DB**: `.env.local`の`NEXT_PUBLIC_SUPABASE_URL`が指す実Supabaseプロジェクト（anon keyのみ）

**本書の性質**: 本セッションには (a) 管理者ログイン情報、(b) 実行可能な`playwright-core`（npmパッケージ本体が`node_modules`に存在しないことを確認済み。バイナリキャッシュのみ存在）のいずれも無い。このため**Preview・Workspace・Share・PDF・Excelの実ブラウザ確認は実施できていない**。この事実を隠さず、確認できた範囲と確認できなかった範囲を明確に分けて記録する（Unknown is better than Wrong、推測による結果の記載はしない）。

---

## 0. 実施前に確認した環境の事実

| 項目 | 結果 | 確認方法 |
|---|---|---|
| dev server起動状況 | 起動済み（`http://localhost:3000`、200応答） | `curl`・`lsof` |
| `admin/(protected)`配下の認証壁 | 有効。未ログインで`/admin/submission-directory-preview`へアクセスすると`/admin/login`へリダイレクト（200 at `/admin/login`） | `curl -L`で`final_status=200 url=.../admin/login`を確認 |
| 管理者ログイン情報 | **本セッションには無い**（`.env.local`にも記載無し、`admin_users`はanon keyでは`[]`が返りRLSにより中身を確認不可） | `.env.local`目視・REST API確認 |
| `playwright-core`（npm） | **`node_modules/playwright-core`ディレクトリが存在せず、`import('playwright-core')`が失敗する**。`node_modules/.bin/playwright-core`はバイナリのみ残存（実体無し）。前回セッションの「Chromiumキャッシュは用意されている」は`~/Library/Caches/ms-playwright`のブラウザバイナリキャッシュのみを指しており、npmパッケージ本体とは別物だった | `node -e "import('playwright-core')..."` → `Cannot find package 'playwright-core'` |
| `playwright/save-admin-storage-state.mjs`・`playwright/verify-submission-directory-preview.mjs` | 既存（前回セッションで準備済み、未実行）。手動ログイン専用設計（スクリプト自体は認証情報を一切保持しない） | ファイル内容確認 |
| `submission_offices`（新Resolverデータ） | 実DBに実在（`municipal_tax`カテゴリでSapporo/Fukuoka/Kitakyushuの3窓口を確認） | anon keyでのREST直接確認 |
| `workspace_companies`（検証用3社） | anon keyでは`REVOKE ALL FROM anon`によりRLSブロックされ`[]`が返る。**存在の有無を本セッションからは判定できない**（0件を意味しない） | REST直接確認 |

**結論**: 管理者ログインを要する画面（Preview・Workspace・PDF・Excel・Share発行操作）は本セッション単独では検証不能。`/result`（ログイン不要・公開ページ）のみ、実際に起動中のdev serverへ`curl`でリクエストしSSR（Server-Side Rendering）されたHTMLの内容を直接検証した。

---

## 1. ① Preview — **未実施（ブロッカー: 管理者ログイン情報なし）**

`/admin/submission-directory-preview`は`admin/(protected)`配下であり、`getAdminSession()`がセッション無しと判定すると`/admin/login`へ`redirect()`する設計（`src/app/admin/(protected)/layout.tsx`）。これを`curl -L`で実際に確認し、未ログイン状態では最終的に`/admin/login`（200）へ到達することを確認した（＝設計通りの認証壁が機能していることは確認できたが、Preview画面自体の中身は未確認）。

| 確認項目 | 結果 |
|---|---|
| 未ログイン時の挙動確認 | PASS（`/admin/login`へリダイレクトされることを確認。これは正しい挙動であり不具合ではない） |
| 5ケースの`resolved`/`not_supported`表示確認 | **未実施** |

---

## 2. ② Workspace — **未実施（ブロッカー: 管理者ログイン情報なし）**

`/admin/workspaces/[id]`・`/admin/workspaces/[id]/roadmap`も同じ`admin/(protected)`配下のため、同一の理由で未実施。加えて、検証用3社（`[E2E] 札幌/福岡/北九州提出先検証株式会社`）が実際に投入済みかどうかも、anon keyからは確認できなかった（RLSにより`[]`が返るのみで、0件なのか単に見えないだけなのか区別が付かない）。

| 確認項目 | 結果 |
|---|---|
| Dashboard | **未実施** |
| Roadmap（Cutover対象のみ新Resolver表示） | **未実施** |

---

## 3. ③ Result — **実施・PASS**（ログイン不要のためdev serverへ直接`curl`でSSR結果を検証）

`/result?pref=...&muni=...&emp=false&fm=3&corp=kabushiki`へ実際にHTTPリクエストを送り、返ってきたHTML（Next.js Server ComponentによるSSR出力）を直接検証した。ブラウザのJS実行結果（Hydration後の状態）ではなく、**サーバーが返した初期HTMLの内容確認**である点に留意（4節参照）。

### 3-1. 必要手続き一覧（Cutover対象の提出先更新確認）

| 自治体 | municipality_code | 確認内容 | HTTP | 実結果 | PASS/FAIL |
|---|---|---|---|---|---|
| 札幌市中央区 | `011011` | 法人市民税の提出先に「中央市税事務所諸税課法人市民税係」が出現するか | 200 | 出現した | PASS |
| 札幌市中央区 | `011011` | 償却資産の提出先に「中央市税事務所固定資産税課償却資産担当」が出現するか | 200 | 出現した | PASS |
| 福岡市中央区 | `401331` | 法人市民税の提出先に「財政局法人税務課法人市民税係」が出現するか | 200 | 出現した | PASS |
| 北九州市門司区 | `401013` | 法人市民税の提出先に「財政・変革局税務部課税第一課」が出現するか | 200 | 出現した | PASS |
| 北九州市門司区 | `401013` | 償却資産が新Resolver由来の`not_supported`という文言を一切出さないか | 200 | `not_supported`の文字列は4ケース全ファイルいずれにも0件（4-3節） | PASS |

### 3-2. 管轄機関グリッド（対象外・変更なしの確認）

上記3自治体いずれについても、「管轄機関」グリッドと「必要手続き」セクションの間のHTML断片を抽出し、新Resolver由来の4窓口名（中央市税事務所諸税課法人市民税係／中央市税事務所固定資産税課償却資産担当／財政局法人税務課法人市民税係／財政・変革局税務部課税第一課）が**一切含まれていない**ことを確認した。

| 自治体 | 新Resolver窓口名の混入 | PASS/FAIL |
|---|---|---|
| 札幌市中央区 | 混入なし | PASS |
| 福岡市中央区 | 混入なし | PASS |
| 北九州市門司区 | 混入なし | PASS |

**期待通り「管轄機関グリッドは変更なし」を確認した。**

### 3-3. 回帰確認（渋谷区、Cutover対象外）

| 自治体 | municipality_code | 確認内容 | HTTP | 実結果 | PASS/FAIL |
|---|---|---|---|---|---|
| 渋谷区 | `131130` | 法人市民税の提出先が従来通り「渋谷区役所（税務課）」のままか | 200 | 「渋谷区役所（税務課）」が出現、Cutover対象外のため無変化 | PASS |

---

## 4. ④ Share — **未実施（ブロッカー: 管理者ログイン情報なし・検証用会社の存在未確認）**

共有リンク（`/share/[token]`）の発行にはWorkspace管理画面での操作が必要であり、②と同じ理由で未実施。

---

## 5. ⑤ PDF — **未実施（ブロッカー: ②に同じ、PDF出力はWorkspace Roadmap画面からのみ操作可能）**

## 6. ⑥ Excel — **未実施（ブロッカー: ②に同じ）**

---

## 7. ⑦ Browser（Console Error / Network 500）

| 項目 | 実施範囲 | 結果 |
|---|---|---|
| Console Error件数 | **未計測**。`curl`はJavaScript実行系を持たないため、ブラウザのconsole.error・Hydrationエラーは本質的に検出できない。実ブラウザ（Playwright等）が必須 | N/A（未実施） |
| Network 500件数（`/result`のSSRレスポンス自体） | 4ケースいずれもHTTP 200。レスポンスHTML内に "500" という文字列が複数出現したため個別に文脈確認したところ、すべて`text-blue-500`等のTailwind CSSクラス名であり、エラーコードとしての500ではないことを確認した | 0件（SSR初期応答に限る） |
| Network 500件数（クライアントサイドで追加発生する`/rest/v1/...`等の非同期リクエスト） | **未計測**（ブラウザが無いと発生しない） | N/A（未実施） |

---

## 8. ⑧ Regression（壊れていないことの確認）

| 対象 | 確認方法 | 結果 |
|---|---|---|
| 診断（`/result`本体） | 3節の4自治体×5ケースで200応答・期待内容を確認 | PASS |
| 渋谷区（Cutover対象外）の提出先表示 | 3-3節 | PASS（無変化を確認） |
| Roadmap（`/roadmap`、Client Component） | **未実施**。`'use client'`のためSSR HTMLにはデータが含まれず、`curl`では検証できない。ブラウザ必須 | 未実施 |
| PDF / Excel / Share | 5・6・4節に同じ、未実施 | 未実施 |

---

## 9. スクリーンショット一覧

**0件。** ブラウザを起動できていないため、スクリーンショットは1枚も取得していない（Preview検証スクリプト`playwright/verify-submission-directory-preview.mjs`は`test-results/submission-directory-preview.png`を出力する設計だが、8節の理由により未実行）。

---

## 10. Console Error件数 / HTTP500件数（総括）

| 指標 | 値 | 備考 |
|---|---|---|
| Console Error件数 | **未計測** | ブラウザ未使用のため計測不能。0件と報告することは推測にあたるため行わない |
| HTTP 500件数 | 0件（`/result`のSSR初期応答4件のみを対象とした場合） | クライアントサイドの追加リクエストは未計測のため、この0件は「確認した範囲内では0件」という限定付きの事実であり、Phase5全体のHTTP 500件数ではない |

---

## 11. 発見事項

1. **`/result`の「必要手続き」一覧は、Sapporo・Fukuoka・Kitakyushuの対象procedure（法人市民税・償却資産）について、実データベースに対する実リクエストで新Resolverの窓口名を正しく表示することを確認した。** Phase5-2bの実装が実環境で機能していることの直接証拠。
2. **`/result`の「管轄機関」グリッドは、同一条件下で新Resolverの情報が一切混入していないことを確認した。** スコープ制約（管轄機関グリッドは対象外）が実際に守られている。
3. **渋谷区（Cutover対象外）の表示は無変化であることを確認した。** 対象外では旧Resolverが維持されるという設計が実際に機能している。
4. **`playwright-core`がnpmパッケージとして実体を持たず、前回セッションで準備されたPlaywright検証スクリプト2本（`save-admin-storage-state.mjs`・`verify-submission-directory-preview.mjs`）がいずれも実行不能な状態にある。** これはPhase5-3準備時点から未解消の環境課題であり、今回のUATでも同じ理由でPreview・Workspace・Share・PDF・Excelの実ブラウザ検証がブロックされた。
5. **管理者ログイン情報が本セッションに無く、`admin_users`テーブルはanon keyからは中身を確認できない（RLSにより空配列が返るのみ）。** `workspace_companies`に検証用3社が投入済みかどうかも同じ理由で判定不能だった。

---

## 12. 残課題

| # | 課題 | 対応に必要なもの |
|---|---|---|
| 1 | Preview・Workspace・Share・PDF・Excelの実ブラウザUAT未実施 | `playwright-core`のインストール（`npm install --save-dev playwright-core`相当。`package.json`/`package-lock.json`の変更を伴うため、実行の可否はユーザー判断が必要）と、管理者アカウントでの手動ログイン（`playwright/save-admin-storage-state.mjs`を人間が実行してstorageStateを保存する） |
| 2 | Workspace検証用3社（札幌・福岡・北九州）がDBに投入済みか未確認 | Supabase Dashboardでの`SELECT`確認、または管理者ログイン後の`/admin/workspaces`一覧目視確認 |
| 3 | Console Error / クライアントサイドNetwork 500の計測が未実施 | 課題1の解消（実ブラウザ）が前提 |
| 4 | `/roadmap`（Client Component）の回帰確認が未実施 | 課題1の解消が前提 |

---

## 13. 判定

**PASS / FAILEDの二択では実態を正確に表現できないため、以下の通り分けて報告する。**

- **確認できた範囲（③Result・⑧Regressionのうち`/result`関連）: PASS。** 発見された不具合は0件
- **確認できなかった範囲（①Preview・②Workspace・④Share・⑤PDF・⑥Excel・⑦Browser・⑧Regressionのうち`/roadmap`）: 未実施。** PASSともFAILEDとも判定していない（実施していないものを「問題なし」と書くことは推測にあたり、Unknown is better than Wrongの原則に反するため）

## **Submission Directory Phase5 — UAT Incomplete（未完了。確認できた範囲では不具合0件、確認できなかった範囲が残っている）**

12節の残課題1・2が解消され次第、①②④⑤⑥⑦および`/roadmap`の回帰確認を追加実施し、本書を更新した上で最終判定（PASS/FAILED）を行うことを推奨する。
