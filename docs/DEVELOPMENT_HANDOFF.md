# DEVELOPMENT_HANDOFF.md — SUNBOO開発引き継ぎ資料

**作成日**: 2026-10-13
**作成者**: Claude Code（このセッション）
**位置づけ**: このドキュメントは「SUNBOOが今どこまで実装されているか」をコードから直接確認した事実と、会話（ユーザーからの引き継ぎ説明）由来の情報を区別して記録する。既存の[PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)・[docs/ROADMAP.md](ROADMAP.md)・[docs/PROJECT_STATUS.md](PROJECT_STATUS.md)はいずれも2026年7月時点（Sprint44前後）で更新が止まっており、**本書作成時点でそれらとコードの間に大きな drift（記述と実装の不一致）があることを確認した**。本書はその drift を埋める応急の橋渡し役であり、将来的には既存3ドキュメントの正式な同期作業（別タスク）に置き換えられるべきもの。

---

## 0. 情報源の凡例

- 【会話由来】: ユーザーの引き継ぎ説明に基づく記述（このセッションでコードを読んで直接確認していない）
- 【コード確認済み】: このセッションで実際にファイルを読み・grepし・gitログを確認して得た事実
- 【未確認】: 確認を試みたが確証が得られなかった事項

---

## 1. 目的（【会話由来】）

中小企業の売上・利益を伸ばし、適正な納税につなげる。経営支援とKSK2型の税務インテリジェンスを一体化し、経営者にとって水のように必要な経営基盤を作る。

この「経営支援」と「税務インテリジェンス」の統合という方向性は、後述2-5節の通り【コード確認済み】の実装（Tax Intelligence基盤・Workspace売上/資金繰り機能）とも整合する大きな絵として成立している。

---

## 2. 現在の実装状況（【コード確認済み】）

### 2-1. ドキュメントとコードのdrift（重要）

- `PROJECT_CONTEXT.md`・`docs/ROADMAP.md`は2026-07-11（Sprint44）時点の記述で止まっている
- `docs/PROJECT_STATUS.md`は2026-07-14時点
- `README.md`はPhase 1（東京都渋谷区MVP）時点の記述が中心
- 一方、`git log --oneline --all`で確認したマージ済みPRは**#131まで存在**し、Sprint44以降に以下の大規模な機能群が実装・マージされている（本書5節・6節で詳述）:
  - 月次売上目標・粗利・営業利益/損益分岐点・資金繰り・ロードマップ税務連携（PR#100, #107-#110）
  - 週次・日次の売上行動管理一式（PR#111〜#131、約20件）
  - Tax Intelligence基盤の本格実装（PR#54〜#74、設計から本番相当の外部連携まで）
- **したがって、既存ドキュメントの「未着手」「設計のみ」という記述は、現時点のコードに対してはもはや正しくない箇所が多い。** 今後の開発判断は本書または直接のコード確認を優先し、既存3ドキュメントの古い記述をそのまま信用しないこと

### 2-2. 会社ホーム（Company Workspace Dashboard）

- 実体ファイル: `src/app/admin/(protected)/workspaces/[id]/page.tsx`。画面内に「会社ホーム」という文言はなく、`WorkspaceSubNav`では「ホーム」タブとして扱われる
- 表示順序（上から）: `PageHeader` → `WorkspaceSubNav` → `WorkspaceCompletionFeedback` → `WorkspaceTodaySalesCard`（今日の売上目標） → `WorkspaceDashboard`（内部に「今日のポイント」「確認が必要なこと（通知センター）」「意思決定」「進捗サマリー」「AI参謀」「会社概要」） → 6枚の遷移カードグリッド → （owner限定）`WorkspaceDeleteButton`
- データ取得: `loadWorkspaceCompany`・`loadWorkspaceRoadmapContext`（`src/lib/workspaceLoader.ts`）。売上系データ（`workspace_daily_sales_activities`/`workspace_monthly_sales`）は`workspaceLoader.ts`を経由せず`page.tsx`内で直接クエリ（87〜125行目、今回の実装箇所）

### 2-3. 既存の「重要アクション」相当の仕組み

2つの既存エンジンが連携して「意思決定」「確認が必要なこと」を構成している。

| エンジン | ファイル | 入力 | 出力 |
|---|---|---|---|
| Decision Engine | `src/lib/workspaceDecisions.ts`（`generateWorkspaceDecisions`） | CompanyProfile・State・Annual Roadmap・Procedure Status・Document Status | `actions`（`priority`/`title`/`reason`/`dueDate`）・`watchItems`・`completed`・`summary` |
| Notification Center | `src/lib/workspaceNotifications.ts`（`buildWorkspaceNotifications`） | Decisions・Advice・Procedure Status・Document Status | `WorkspaceNotification[]`（`category`/`severity`/`title`/`message`/`href`） |

**重要な確認事実**: `workspaceDecisions.ts`・`workspaceAdvice.ts`・`workspaceNotifications.ts`の3ファイルをgrepした結果、「売上」「資金」「cash」「sales」に該当する文字列は**一件もヒットしなかった**。つまり既存の「重要アクションまとめ」の仕組みは**手続き期限・書類ステータスのみを扱い、売上・資金繰りのデータを一切参照していない**。これが4節の実装対象の直接的な根拠になる。

### 2-4. 売上目標・粗利・営業利益/損益分岐点・資金繰り（PR#100, #107-#110）

- 単一テーブル`workspace_monthly_sales`（`supabase/migration_workspace_monthly_sales.sql`で新設、後続migrationでカラム追加）に、`target_revenue`/`actual_revenue`（売上）・`target_gross_profit`/`actual_cost_of_sales`（粗利）・`target_operating_profit`/`actual_fixed_costs`（営業利益・損益分岐点）・`cash_balance`/`expected_cash_inflows`/`expected_cash_outflows`/`planned_tax_payments`（資金繰り）が全部入りで保持されている
- 計算ロジックは`src/lib/monthlySalesProgress.ts`（903行）に純粋関数として集約: `calculateMonthlySalesProgress`（売上の`shortfall`/`achievementRate`/`daysRemaining`）、`calculateMonthlyGrossProfit`、`calculateMonthlyOperatingProfit`（`breakEvenRevenue`含む）、`calculateMonthlyCashFlow`（`fundingGap`/`runwayMonths`）、`buildCashFlowActions`（資金不足時のアクション候補、`title`/`description`のみで`dueDate`は持たない）
- 表示は`src/app/admin/(protected)/workspaces/[id]/growth/page.tsx` → `WorkspaceGrowthView.tsx`に集約。資金不足時は「月末までに最低¥{fundingGap}の資金対策が必要です」という警告文を**growthページ内でのみ**表示（2-3節の通り会社ホームには出ない）
- 週次（`workspace_weekly_sales_activities`）・日次（`workspace_daily_sales_activities`）の行動管理も同じ`monthlySalesProgress.ts`に実装されており、日次分のみ`WorkspaceTodaySalesCard`として会社ホームに表示される

### 2-5. 納税予定連携（PR#110 roadmap-tax-cash-flow）

- `workspace_tax_payment_plans`テーブル（`company_id, procedure_id, due_date, amount`）＋`src/lib/workspaceTaxPaymentPlan.ts`（`sumTaxPaymentPlansByMonth`）
- 年間ロードマップ画面（`AnnualRoadmapView.tsx`）の税務カテゴリ手続きに予定税額の入力欄があり、入力した税額は該当月の`calculateMonthlyCashFlow`の支出（`linkedTaxPayments`）に自動加算される
- 「納税期限」そのものは、既存の年間ロードマップ（`RoadmapYear`）の一部として既に`generateWorkspaceDecisions`の`actions`に（税務手続きの期限として）現れている。**したがって「納税期限」という重要アクションの骨格自体は既に存在しており、今回新たに作る必要があるのは「売上未達」「資金不足」の2種である**（4節参照）

### 2-6. 税務インテリジェンス（KSK2型、PR#54, #61-#74）

- `docs/TAX_INTELLIGENCE_ARCHITECTURE.md`は冒頭で「ステータス: 設計のみ」と明記しているが、**この記述は現在のコードと一致しない**
- 設計書が定義する6オブジェクト（TaxSource/TaxSourceVersion/TaxRule/TaxControl/ControlResult/ReviewCase）に対応するテーブルは`supabase/migration_tax_sources.sql`・`migration_tax_rule_controls.sql`・`migration_workspace_tax_control_results_reviews.sql`等に実在する
- 設計書16節「5 Smoke Controls」は`migration_tax_intelligence_smoke_controls.sql`で投入済み、評価ロジックは`src/lib/taxIntelligence/evaluators.ts`に実装済み
- e-Govコネクタ（`src/lib/taxIntelligence/egovConnector.ts`）は実際に`https://laws.e-gov.go.jp/api/2/law_data/...`へfetchする本番相当コード。`src/app/api/cron/tax-intelligence/route.ts`がVercel Cron（`vercel.json`、毎日0:15）から呼ばれ、Resend経由のメール送信コード（`resendTaxSourceEmail.ts`）まで存在する
- Production Control第1号（TI_TAX_001、法人税確定申告の期限判定）も実装済みだが、関連migrationのコメントに「draft only, NOT approved, Control disabled」とあり、**本番有効化（承認・is_enabled=true）はまだされていない形跡**
- Review UIは`/admin/tax-intelligence`（管理画面限定）。**会社ワークスペース側（経営者向け画面）には一切露出していない**ことをgrepで確認済み
- **本番環境でCron/メール送信に必要な環境変数（`CRON_SECRET`・`RESEND_API_KEY`等）が実際に設定され稼働しているかは未確認**（コードベースからは判定不可）

### 2-7. PR #131（翌営業日の計画保存バグ）（【会話由来】＋一部【コード確認済み】）

ユーザーからの引き継ぎ: 翌営業日の計画保存後に対象日が今日へ戻る不具合をPR #131で修正し、本番で動作確認済み。

【コード確認済み】: `gh pr view 131`で`state: MERGED`・`baseRefName: main`・`mergedAt: 2026-10-08T01:25:18Z`を確認。コミット`0df6d37`（"fix: open next business day plan after save"）が該当。`origin/main`に反映済み。実装内容（`WorkspaceTodaySalesCard.tsx`内の翌営業日行動案保存ロジック）はこのセッションでは深く読み込んでいないため、修正の技術的な中身自体は未確認。

---

## 3. 今回の開発スコープの決定（4節で詳述する機能の設計判断）

次の開発候補「会社ホームに、売上未達・資金不足・納税期限などの重要アクションを理由・期限付きでまとめる」について、2節の調査結果から以下を決定した。

- **納税期限**は既存の`generateWorkspaceDecisions`の`actions`（手続き期限ベース）が既にカバーしているため、重複させない。新規実装はしない
- **売上未達**・**資金不足**の2種が、2-3節で確認した通り完全に欠落している。この2種を新規に実装する
- 既存の「意思決定」（`workspaceDecisions.ts`）ではなく、「確認が必要なこと（通知センター）」（`workspaceNotifications.ts`）を拡張する方を選んだ。理由: `workspaceNotifications.ts`は元々「複数エンジンの出力を統一表示形式へ変換するルーティング層」という役割を持ち（ファイル冒頭コメントで明記）、新しい判断ロジックを持ち込む場所として設計時点から想定されている。一方`workspaceDecisions.ts`は「CompanyProfile・State・Roadmap・Procedure/Document Status」という手続き系データのみを入力とする設計（ファイル冒頭コメントで明記）であり、売上・資金繰りという異なる系統のデータを混ぜると既存の入力契約を破る
- 計算ロジック（`calculateMonthlySalesProgress`・`calculateMonthlyCashFlow`）は**一切変更せず、そのまま再利用する**。新しい判定閾値（売上未達の緊急度・資金不足の有無）のみを新規コードに持つ

実装の詳細・変更ファイルは本書5節「変更内容」に記録する（実装完了後に追記）。

---

## 4. 検証結果（【コード確認済み】、作業ブランチ`feat/workspace-home-priority-actions`にて実施）

| 項目 | 結果 |
|---|---|
| `npm run build` | ✅ `✓ Compiled successfully`、TypeScriptエラー0、全ルート生成成功（`/admin/workspaces/[id]`含む） |
| `npm run lint`（`eslint .`） | ✅ 0 errors。警告1件のみ（`WorkspaceGrowthView.tsx:167`の`react-hooks/set-state-in-effect`）だが、これは**今回の変更前のmain/origin主ブランチにも存在する既存の警告**であることを`git stash`でコードを一時的に戻して再実行し確認済み。今回の変更による新規警告ではない |
| `npm test`（`node --test`、全`*.test.ts`） | ✅ 301/301 PASS（既存291件＋新規追加10件）。既存テストに失敗・リグレッションは無い |

---

## 5. 変更内容

### 5-1. 新規実装（会社ホームの「重要アクション」拡張: 売上未達・資金不足）

| ファイル | 内容 |
|---|---|
| `src/lib/workspaceGrowthNotifications.ts`（新規） | `buildWorkspaceGrowthNotifications(entry, today)`。`calculateMonthlySalesProgress`・`calculateMonthlyCashFlow`（いずれも既存・無変更）の結果から、売上未達（`shortfall > 0`）・資金不足（`fundingGap > 0`）を`WorkspaceNotification`形式（`category: 'sales' | 'cash'`）に変換する。新しい判断ロジックは「通知を出すか・優先度（売上未達は月末まで7日以内ならhigh、資金不足は常にhigh）」のみ |
| `src/lib/workspaceGrowthNotifications.test.ts`（新規） | 6ケース（データ無し／達成済み／残り日数によるhigh・medium切替／資金不足／両方発生） |
| `src/lib/workspaceNotifications.ts` | `WorkspaceNotificationCategory`に`'sales' | 'cash'`を追加。`hrefFor`に両カテゴリ→`/growth`への遷移を追加。`buildWorkspaceNotifications`に`growthNotifications`引数（省略可、既定値`[]`）を追加し、候補配列へ合流させる。既存4カテゴリの判定ロジックは無変更 |
| `src/components/WorkspaceDashboard.tsx` | `NOTIFICATION_CATEGORY_ICON`（`Record<WorkspaceNotificationCategory, ...>`）に`sales: TrendingUp`・`cash: Wallet`を追加。TypeScriptの型チェックにより、追加を怠ると`npm run build`が失敗する構造になっている（Recordの網羅性チェック） |
| `src/app/admin/(protected)/workspaces/[id]/page.tsx` | 当月分の`workspace_monthly_sales`を列を絞らずフル取得（従来は`revenue_model`のみ）＋当月分の`workspace_tax_payment_plans`を取得し`linkedTaxPayments`を算出。`monthlySalesRowToEntry`で`MonthlySalesEntry`に変換し、`buildWorkspaceGrowthNotifications`→`buildWorkspaceNotifications`の新引数へ渡す。取得失敗時は`monthlySalesEntry = null`（既存の防御的な`try/catch`方針を維持、通知が出ないだけで画面は落ちない） |

### 5-2. 重複排除のための既存コードの整理（指示5「重複を避けて実装範囲を決める」に対応）

| ファイル | 内容 |
|---|---|
| `src/lib/monthlySalesProgress.ts` | `MonthlySalesRow`型・`monthlySalesRowToEntry(row, linkedTaxPayments)`関数・`monthEndDate(yearMonth)`関数を追加。`growth/page.tsx`に存在していた19フィールドの行→Entry変換ロジックをここへ集約（会社ホーム側も同じ変換を必要としたため） |
| `src/app/admin/(protected)/workspaces/[id]/growth/page.tsx` | ローカル定義していた`MonthlySalesRow`型・19フィールドのインライン`.map()`を削除し、上記の共通関数を呼ぶだけに変更。**挙動は変更していない**（同一の変換ロジックを移動したのみ、テスト・ビルドで確認済み） |
| `src/lib/monthlySalesProgress.test.ts` | `monthEndDate`（閏年含む）・`monthlySalesRowToEntry`（`revenue_model=null`時のフォールバック含む）のテスト4件を追加 |

### 5-3. 設計上の注意点（将来の変更者向け）

- `workspaceGrowthNotifications.ts`は`workspaceAdvice.ts`の`formatDueDate`を再利用せず、同内容を複製している。理由: `workspaceAdvice.ts`は内部で`workspaceProcedureStatus.ts`を拡張子無しでimportしており、`node --test`のネイティブESM解決ではこの拡張子無しimportを解決できず、間接的にimportしただけでテストが失敗する（`submissionDirectoryCutover/decision.ts`に残る既知の制約と同種）。3行程度の複製で済むため、依存を増やして壊れやすくするより複製を選んだ
- 「納税期限」はあえて実装していない（3節の通り、既存の`generateWorkspaceDecisions`が手続き期限として既にカバーしているため）。将来、納税予定額（`workspace_tax_payment_plans`）そのものを「期限+金額」で強調表示したい場合は、本機能の`cash`カテゴリ（資金不足通知の文言）に金額の内訳として含める形を検討するのが、新しいカテゴリを増やさない現実的な拡張点になる

---

## 7. レビュー対応（5節実装後のコードレビュー指摘への修正）

5節の初版実装に対し、以下4点のレビュー指摘を受けて修正した。

### 7-1. 取得失敗を「データなし」「納税予定0円」と同一視しない

- `src/app/admin/(protected)/workspaces/[id]/page.tsx`: `dailyResult`・`monthlyResult`・`taxPaymentPlanResult`それぞれの`.error`を明示的に確認するよう変更。Supabaseはクエリ失敗時も例外を投げず`{data: null, error: {...}}`を返すため、`.error`を見ないと「未入力で0件」と「取得失敗でdataがnull」を区別できなかった（修正前の実装の不備）
- 月次売上の取得（`monthlyResult`）が成功し、納税予定の取得（`taxPaymentPlanResult`）だけが失敗した場合: `cashFlowDataAvailable = false`というフラグを立て、売上の`monthlySalesEntry`自体は構築を続ける（売上未達の判定は納税予定データに依存しないため、売上通知は維持される）
- `src/lib/workspaceGrowthNotifications.ts`: `buildWorkspaceGrowthNotifications`の第2引数を`today: Date`から`options: { today?, cashFlowDataAvailable? }`へ変更。`cashFlowDataAvailable=false`の場合、`calculateMonthlyCashFlow`を呼び出さず（＝不足額を計算・断定しない）、「資金繰りデータを確認できません。入出金の予定日を確認してください。」という金額を含まない通知に切り替える

### 7-2. 資金不足通知の文言を「確定期限」ではなく「見込み」の表現へ修正

- 修正前: `${月末}（月末）までに最低¥{fundingGap}の資金対策が必要です。`（月末を確定した対策期限として断定する表現）
- 修正後: `入力された月次見込みでは月末残高が¥{fundingGap}不足する見込みです。入出金の予定日を確認して資金対策を検討してください。`（資金繰りはユーザーが入力した入出金見込みに基づく推計であり、実際の入出金タイミングのズレを織り込める表現にした）
- 売上未達通知（`期限: ○月○日まであと○日`という表現）は変更していない。売上目標の対象期間（今月1日〜月末）は会社自身が設定した会計上のカレンダー境界であり、資金繰りの入出金タイミングのような不確実性を持たないため

### 7-3. `buildWorkspaceNotifications`の第6引数`maxItems`の互換性を修正

- 初版実装では`growthNotifications`を第6引数（`maxItems`の直前）に追加してしまい、既存呼び出し元が第6引数に`maxItems`を位置引数で渡していた場合に意味がずれる破壊的変更になっていた（コードレビューで指摘）
- 修正: `growthNotifications`を**第7引数（末尾）**に変更し、`maxItems`は引き続き第6引数のまま維持。呼び出し元（`page.tsx`）は`maxItems`を省略したい場合に`undefined`を明示的に渡す形にした（デフォルト値`DEFAULT_MAX_ITEMS`が適用される、JS/TSの標準的な挙動）
- `DEFAULT_MAX_ITEMS`を`export`し、テストから参照可能にした
- 実際には`buildWorkspaceNotifications`の呼び出し元は本機能実装時点で`page.tsx`1箇所のみだったことをgrepで確認済み（他に破壊される既存呼び出しは無かった）だが、関数の契約として今後も安全なように修正した

### 7-4. `monthEndDate`の月範囲検証・JST一貫性の確認

- `monthEndDate`に`month < 1 || month > 12`のチェックを追加。修正前は正規表現`\d{2}`が`"13"`等も通してしまい、`Date.UTC`の月ロールオーバーにより無意味な日付を例外無しで返す可能性があった
- 売上通知の日付計算（`calculateMonthlySalesProgress`内の`daysRemaining`算出、無変更）が日本時間で一貫していることをテストで確認した。UTC日付とJST日付がずれる境界時刻（例: `2026-10-31T15:30:00Z` = JST`2026-11-01T00:30`）を`today`に渡し、UTCの日付だけで判定していたら誤って「10月はまだ今月」と扱われてしまうところ、実際はJST基準で正しく「10月は終了した月」として扱われることを確認した（既存の`currentYearMonth`・`todayInJapan`がいずれも`Asia/Tokyo`タイムゾーンを明示している設計のため、バグではなく確認のみで済んだ）

### 7-5. 副次的な修正: `workspaceNotifications.ts`を`node --test`で直接テスト可能にした

- `workspaceNotifications.ts`は内部で`workspaceProcedureStatus`・`workspaceDocumentStatus`を拡張子無しでimportしており、`node --test`のネイティブESM解決では（型のみimportではなく値のimportのため）解決に失敗し、本ファイルをテストで直接importすることができなかった（7-3節のテスト追加で発覚）
- `workspaceTaxPaymentPlan.ts`に既にある「拡張子を明示する」という既存パターンに合わせ、該当2箇所のimportに`.ts`拡張子を追加。ビルド結果・実行時の挙動には影響しない（Next.js/TypeScriptのモジュール解決は拡張子明示の有無を問わず解決できることを`npm run build`で確認済み）

---

## 8. 検証結果（レビュー対応後、再実施）

| 項目 | 結果 |
|---|---|
| `npm run build` | ✅ `✓ Compiled successfully`、TypeScriptエラー0 |
| `npm run lint`（`eslint .`） | ✅ 0 errors。警告1件（`WorkspaceGrowthView.tsx:167`）は変更前から存在する既知の警告（5節で確認済み、今回も再確認） |
| `npm test`（`node --test`） | ✅ **315/315 PASS**（5節時点の301件＋レビュー対応で追加した14件）。既存テストに失敗・リグレッションは無い |

### 追加したテスト14件の内訳

| ファイル | 追加数 | 検証した条件 |
|---|---|---|
| `src/lib/monthlySalesProgress.test.ts` | 2件 | `monthEndDate`の月が01〜12の範囲外（`"00"`・`"13"`・`"99"`）なら例外になること／範囲の両端（`"01"`・`"12"`）では正しく末日を返すこと |
| `src/lib/workspaceGrowthNotifications.test.ts` | 5件 | `cashFlowDataAvailable=false`時に金額を含まない「確認できません」通知になること／同条件でも売上未達通知は維持されること／資金に余裕があってもデータ未確認なら「問題なし」と断定しないこと／UTC・JSTの日付がずれる2つの境界時刻でも対象月の残り日数がJST基準で計算されること（**この2件は10節のレビュー対応で月替わり直前・直後の正しい組み合わせに差し替えた**） |
| `src/lib/workspaceNotifications.test.ts`（新規ファイル） | 7件 | 既存の5引数・6引数（`maxItems`を位置引数で渡す形）呼び出しが従来通り動作すること／`maxItems`に`undefined`を渡すとデフォルト値が適用され第7引数`growthNotifications`のみ指定できること／第6・第7引数を両方指定できること／`growthNotifications`の`sales`/`cash`カテゴリに`/growth`への`href`が付与されること／既存のDecision/Advice由来の通知と`growthNotifications`が重要度順に正しく合流すること |

---

## 10. 最終レビュー対応（第2ラウンド）

8節時点の実装に対し、さらに以下2点のレビュー指摘を受けて修正した。

### 10-1. 日次・月次データの取得失敗を「未登録」と区別する

- **日次（`WorkspaceTodaySalesCard.tsx`）**: 取得失敗（`dailyResult.error`または例外）と「まだ一度も計画を作っていない（`activity===null`だが取得自体は成功）」を区別するため、`fetchFailed`propを追加した。`fetchFailed=true`の場合、従来の「今日の実行計画はまだ作られていません／売上目標を設定する」という**新規作成を促す文言・CTA**は一切表示せず、赤枠のエラー表示（「今日の売上データを取得できませんでした。既存の計画が無いとは限らないため、新しい計画を作る前に再読み込みしてください。」）と再読み込みボタン（`router.refresh()`）に切り替える。既存の計画を見失ったまま新規作成を誘発する事故を防ぐ
- **月次（`workspaceGrowthNotifications.ts`）**: `workspace_monthly_sales`自体の取得失敗を`monthlyDataFetchFailed`オプションで表現した。`true`の場合、`entry`の値（null/非null問わず）に関わらず売上未達・資金不足の個別判定を行わず、「今月の売上・資金繰り」というタイトルで「売上・資金繰りデータを取得できません。時間をおいて再度お試しください。」という1件の通知のみを返す。これにより「通知が0件＝問題なし」という誤読を防ぐ（`cashFlowDataAvailable=false`との同時発生時も、`monthlyDataFetchFailed`が優先され通知が重複しないことをテストで確認済み）
- **例外発生時**: `page.tsx`の`catch`ブロックでも`todaySalesFetchFailed`・`monthlySalesFetchFailed`を両方`true`にし、`.error`チェック経路と同じ「取得失敗」扱いにした（以前は例外時に無条件で`null`（未登録相当）にしていた）
- **既存の手続き・書類の通知の維持**: `decisions`（`generateWorkspaceDecisions`）・`advice`・`documentStatusMap`は元々別のtry/catchブロックで独立に計算されており、今回の変更が影響する範囲（日次・月次売上データの取得try/catchブロック）とは分離されている。`buildWorkspaceNotifications`も、`growthNotifications`が1件の「取得失敗」通知になった場合でも、既存の`fromDecisionActions`等の候補はそのまま合流するため、手続き期限・書類ステータスの通知は影響を受けない（構造上保証されており、修正は不要だった）

### 10-2. JST境界テストの名前・日時の食い違いを修正

- 修正前の2件は、タイムスタンプがいずれも「JSTで11月1日」になっており（`2026-10-31T15:30:00Z`・`2026-10-31T20:00:00Z`）、2件目のテスト名「JSTでまだ当日中（当月の残り日数として計算される）」が実際の検証内容（どちらも「終了しました」という同じ結果）と矛盾していた
- 月替わりの境界（JST`2026-11-01T00:00:00` = UTC`2026-10-31T15:00:00Z`）を挟んで**前後1秒**の時刻に差し替え、直前・直後が対になるよう修正した
  - 直前: `2026-10-31T14:59:59Z`（JST`10/31 23:59:59`、まだ10月） → `daysRemaining=1`（「あと1日」、「終了しました」ではない）ことを確認
  - 直後: `2026-10-31T15:00:00Z`（JST`11/01 00:00:00`、11月に入った瞬間） → 10月分は終了した月として扱われる（「不足したまま今月が終了しました」）ことを確認

---

## 11. 検証結果（第2ラウンド、再実施）

| 項目 | 結果 |
|---|---|
| `npm run build` | ✅ TypeScriptエラー0 |
| `npm run lint` | ✅ 0 errors（既知の警告1件のみ、`WorkspaceGrowthView.tsx`、変更前から存在） |
| `npm test` | ✅ **318/318 PASS**（8節時点の315件のうちJST境界2件を差し替え＋新規3件追加） |
| `git diff --check` | ✅ 空白エラー0件 |

### 第2ラウンドで追加・差し替えたテスト

| ファイル | 内容 |
|---|---|
| `src/lib/workspaceGrowthNotifications.test.ts` | 新規3件: `monthlyDataFetchFailed=true`時に`entry`の値に関わらず取得失敗の通知1件のみ返すこと（`entry=null`時・`entry`が売上未達/資金不足を含む時の両方）／`monthlyDataFetchFailed`が`cashFlowDataAvailable=false`より優先され通知が重複しないこと。既存2件（JST境界）を10-2節の通り正しい前後1秒の組み合わせに差し替え |

---

## 12. 残る課題（【コード確認済み】の既知事項 + 今回判明した新規事項）

- 既存3ドキュメント（PROJECT_CONTEXT.md / ROADMAP.md / PROJECT_STATUS.md）とコードの同期作業が別途必要（2-1節）。本書はその場しのぎであり、正式な同期の代替にはならない
- Tax Intelligenceの本番有効化状況（Cron稼働・メール送信・Control承認）が未確認（2-6節）。経営支援とTax Intelligenceを一体化する次フェーズに進む前に、まず現状の本番稼働実態を確認するタスクが必要
- `AGENTS.md`はリポジトリ内に存在しない（確認済み、`find`で0件）
- `WorkspaceTodaySalesCard.tsx`の`fetchFailed`状態・`workspaceGrowthNotifications.ts`の`monthlyDataFetchFailed`はいずれもユニットテスト（純粋関数）・ビルドでの型チェックのみで確認しており、実ブラウザでの表示確認（Supabase接続を実際に失敗させた場合の見た目）は行っていない
- 本書作成時点でmainへのマージ・本番公開はまだ行っていない（作業ブランチ`feat/workspace-home-priority-actions`上での変更に留まる）
