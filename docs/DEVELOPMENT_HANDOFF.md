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

## 13. プレビューでのホーム/詳細表示不一致（第3ラウンド）

PR #132のプレビューで、会社ID17・2026年10月の実データにおいて以下の不一致が報告された。

- `workspace_monthly_sales`の当月行が未登録（月間売上目標・実績・預金残高・入出金予定がすべて空欄）
- 年間ロードマップ連携の納税予定は¥500,000
- 売上目標の詳細画面（`/growth`）は「資金不足¥500,000」を表示
- 会社ホームには資金通知が一切出ていない

### 13-1. 原因

`src/app/admin/(protected)/workspaces/[id]/page.tsx`（ホーム）の月次データ取得処理が、`workspace_tax_payment_plans`（連携納税予定）の計算を`if (monthly) { ... }`という**月次行が存在する場合のブロックの内側**に書いていたため、月次行が未登録（`monthly === null`、エラーではなく単に0件）の場合は連携納税予定のクエリ結果を参照すらせず、`monthlySalesEntry`が`null`のまま終了していた。`buildWorkspaceGrowthNotifications(null, ...)`は`entry === null`の時点で即座に`[]`を返す設計のため、既知の¥500,000の納税予定が存在するにもかかわらず、ホームは何も通知しなかった。

一方、詳細画面（`WorkspaceGrowthView.tsx`）は月次行が無い月を選択した場合、`emptyEntry()`（ローカル定義、現在は共有関数化）でcashBalance等を**0円のドラフト**として組み立てる。このドラフトの`linkedTaxPayments`だけは`workspace_tax_payment_plans`から独立して正しく渡されていたため、`calculateMonthlyCashFlow`が「預金残高0円・納税予定¥500,000」から`fundingGap=¥500,000`を算出し、確定した不足額として表示していた。

**つまり両画面とも「未入力の預金残高を実際に0円」と扱っていた点では同じだったが、ホーム側はそれ以前に連携納税予定自体を無視して終了していたため、2画面の間で「何も表示しない」と「¥500,000と断定表示する」という異なる誤りが生じていた。**

### 13-2. 修正方針

ユーザー指摘の通り、「未入力の預金残高を実際に0円と断定しない」という方針で両画面を統一した。

- `src/lib/monthlySalesProgress.ts`に2つの共有関数を追加
  - `emptyMonthlySalesEntry(yearMonth, linkedTaxPayments)`: `WorkspaceGrowthView.tsx`にローカル定義されていた`emptyEntry`を移動・共有化（会社ホームも同じ「未登録月の既定値」を使えるようにする）
  - `shouldGuideCashFlowInput(isRegistered, linkedTaxPayments)`: 「未登録かつ既知の納税予定がある」場合にのみ、fundingGapの計算・断定表示をやめて入力案内に切り替える、という判定をホーム・詳細の両方で共有する
- `page.tsx`（ホーム）: `linkedTaxPayments`の計算を`if (monthly)`の外側に移動し、月次行の有無に関わらず常に計算するよう修正。月次行が無い場合は`emptyMonthlySalesEntry(currentYearMonth, linkedTaxPayments)`でentryを組み立て、`monthlyDataRegistered`フラグ（行の有無）を`buildWorkspaceGrowthNotifications`へ渡す
- `workspaceGrowthNotifications.ts`: `monthlyDataRegistered`オプションを追加。`shouldGuideCashFlowInput`がtrueの場合、fundingGapを計算せず「納税予定¥{額}あり。預金残高・入出金予定を入力して資金繰りを確認してください。」を通知する（severity: medium。確定した問題ではなく入力待ちのため、資金不足確定時のhighとは分ける）
- `WorkspaceGrowthView.tsx`: 同じ`shouldGuideCashFlowInput`を使い、未登録月＋既知の納税予定ありの場合は資金繰りのMetricグリッド（預金見込残高・資金増減・資金不足額・資金が持つ目安）と資金対策アラートの表示を、ホームと同一の案内文言（見出し「納税予定{額}あり」＋本文「預金残高・入出金予定を入力して資金繰りを確認してください」）に置き換えた
- 売上未達側は変更していない（未登録月は`targetRevenue=0`のため`shortfall`は常に0になり、元々誤った断定は発生しない）
- **実データの書き換えは行っていない**（`workspace_monthly_sales`・`workspace_tax_payment_plans`いずれも未操作）

### 13-3. 検証結果

| 項目 | 結果 |
|---|---|
| `npm run build` | ✅ TypeScriptエラー0 |
| `npm run lint` | ✅ 0 errors（既知の警告1件のみ、`WorkspaceGrowthView.tsx`、行番号は`emptyEntry`削除により変動したが内容は変更前から存在） |
| `npm test` | ✅ **327/327 PASS**（12節時点の318件＋新規9件） |
| `git diff --check` | ✅ 空白エラー0件 |

### 追加したテスト9件

| ファイル | 内容 |
|---|---|
| `src/lib/monthlySalesProgress.test.ts`（5件） | `emptyMonthlySalesEntry`が`linkedTaxPayments`以外すべて0になること／省略時0になること／`shouldGuideCashFlowInput`が未登録+納税予定あり→true、未登録+納税予定0円→false、登録済み→常にfalseを返すこと |
| `src/lib/workspaceGrowthNotifications.test.ts`（4件） | `monthlyDataRegistered=false`+納税予定¥500,000（会社17の実例）で断定せず入力案内を通知すること／納税予定も0円なら何も通知しないこと／`monthlyDataRegistered=true`では通常のfundingGap計算を使うこと／`monthlyDataRegistered=false`が`cashFlowDataAvailable=false`より優先されること |

### 13-4. 実ブラウザでの確認結果（【ユーザー確認済み】2026-10-19）

PR #132のプレビュー環境で、会社ID17・2026年10月について実ブラウザで確認済み。

- ホーム（`/admin/workspaces/17`）・売上目標詳細（`/admin/workspaces/17/growth`）の**両画面**で、納税予定¥500,000と資金情報の入力案内が表示されることを確認
- 未入力状態（`workspace_monthly_sales`未登録）での資金不足額の断定表示は解消されていることを確認

13-1節の不一致・13-2節の修正方針は実ブラウザで検証済みとなった。

---

## 14. 残る課題（【コード確認済み】の既知事項 + 今回判明した新規事項）

- 既存3ドキュメント（PROJECT_CONTEXT.md / ROADMAP.md / PROJECT_STATUS.md）とコードの同期作業が別途必要（2-1節）。本書はその場しのぎであり、正式な同期の代替にはならない
- Tax Intelligenceの本番有効化状況（Cron稼働・メール送信・Control承認）が未確認（2-6節）。経営支援とTax Intelligenceを一体化する次フェーズに進む前に、まず現状の本番稼働実態を確認するタスクが必要
- `AGENTS.md`はリポジトリ内に存在しない（確認済み、`find`で0件）
- `WorkspaceTodaySalesCard.tsx`の`fetchFailed`状態・`workspaceGrowthNotifications.ts`の`monthlyDataFetchFailed`はユニットテスト・ビルドでの型チェックのみで確認しており、実ブラウザでの表示確認は未実施のまま（13-4節で確認済みなのは`monthlyDataRegistered`の資金繰り案内表示のみ）
- 【2026-10-20追記】PR #132（本節までの内容）はmainへマージ済み・本番（`https://www.sunboo-keiei.com`）で表示確認済み。上記「mainへのマージ・本番公開はまだ行っていない」は本PR当時の状態であり、現在は解消済み。続きは15節を参照

## 15. 会社ホーム「今日のポイント」「意思決定」への売上・資金繰りアクション統合（【コード確認済み・実ブラウザ確認済み】2026-10-20、作業ブランチ`feat/workspace-home-action-priority`）

### 15-1. 背景・要件

PR #132（5〜13節）で追加した売上未達・資金不足の判定（`workspaceGrowthNotifications.ts`）は「確認が必要なこと」（`workspaceNotifications.ts`）にのみ連携されており、会社ホームの「今日のポイント」（`今日やること`）と「意思決定」（`workspaceDecisions.ts`）は手続き期限・書類ステータスのみを入力としていた（売上・資金繰りのデータを一切参照しない状態だった）。本節はその欠落を埋める。要件は以下6点（会話由来）。

1. 既存の売上・資金繰り通知（`buildWorkspaceGrowthNotifications`）を再利用し、計算・判定ロジックを重複させない
2. 手続き・書類・売上・資金繰りを共通の優先順位（重要度→実際の期限の近さ）で扱う。期限のない入力案内に架空の期限を付けない
3. 「今日やること」に具体的な行動と遷移ボタンを表示する。売上・資金繰りは該当月の売上目標画面へ遷移させる
4. 「意思決定」の件数と表示項目を整合させ、同じ項目を二重計上しない
5. 未登録・取得失敗・実際の0円を区別する。入力案内や取得失敗を資金不足の確定情報として扱わない
6. 既存の手続き期限・書類通知と、PR #131の日付指定遷移（`?date=YYYY-MM-DD`）を維持する

### 15-2. 設計・実装

既存3エンジン（Decision Engine `workspaceDecisions.ts` / AI Adviser `workspaceAdvice.ts` / Notification Center `workspaceNotifications.ts`）の「既存Engineの出力を読むだけで新たな計算・DBアクセスを行わない純粋関数」という設計方針を維持し、`workspaceGrowthNotifications.ts`（PR #132、変更しない）が既に判定済みの通知を機械的に変換・合流させるだけの薄い層として実装した。

- **`workspaceDecisions.ts`**: `WorkspaceDecisionAction`に`procedureId`・`actionHref`（共に省略可）を追加。既存の`generateWorkspaceDecisions`内部でのみ使っていたソート・件数制限・サマリー生成ロジックを、`compareDecisionActions`（優先度→`dueDate ?? '9999-99-99'`の順でソート。架空の期限を作らず、期限の無い項目は同優先度内で最後方に回す）・`summarizeDecisionActions`・`mergeDecisionActions`（手続き起因と他ドメイン起因の配列を合流しソート・件数制限）・`selectUrgentDecisionActions`（high優先度があればhighのみ、無ければmedium、という既存`selectTodayActionItems`の warnings→priority フォールバックと同じ考え方をhigh/medium/lowの3階層へ一般化したもの）として抽出・export。`generateWorkspaceDecisions`自体の判定ロジックは一切変更していない
- **`workspaceNotifications.ts`**: `WorkspaceNotification`に`dueDate`（省略可）を追加。既存呼び出し元への影響なし
- **`workspaceGrowthNotifications.ts`**: 各通知に`dueDate`を設定。売上未達・計算済み資金不足（いずれも確定した計算結果）には`monthEndDate(entry.yearMonth)`を設定。取得失敗・未登録月の入力案内・資金繰り確認不能（いずれも確定した事実ではない）には`null`を設定し、架空の期限を付けない（要件2・5）
- **`workspaceGrowthActions.ts`（新規）**: `growthNotificationToDecisionAction` / `growthNotificationsToDecisionActions`。`WorkspaceNotification`の`severity`→`priority`・`title`→`title`・`message`→`reason`・`dueDate`→`dueDate`をそのまま転記するだけで、新しい判断ロジックは一切持たない。`actionHref`は`/admin/workspaces/{companyId}/growth?date={yearMonth}-01`を指す。`WorkspaceGrowthView.tsx`の既存`?date`クエリ処理（PR #131と同じ仕組み）がそのまま対象月のドラフトを開くため、新しい遷移ロジックの追加は不要だった
- **`page.tsx`（ホーム）**: `generateWorkspaceDecisions`の出力を`procedureDecisions`として保持したまま、`growthNotificationsToDecisionActions`で変換した`growthActions`と`mergeDecisionActions`で合流させ、画面表示用の`decisions`・`todayActions`（`selectUrgentDecisionActions`）を構築する。**`buildWorkspaceNotifications`には合流後の`decisions`ではなく、必ず`procedureDecisions`（手続きのみ・合流前）を渡す**。合流後の`decisions`を渡すと、`decisions.actions`に既に含まれる売上・資金繰りactionsが`buildWorkspaceNotifications`内部の`fromDecisionActions`経由で`'deadline'`カテゴリとして再度拾われ、別途渡している`growthNotifications`と二重に通知されてしまうため（要件4、実装中に自己発見・修正）
- **`WorkspaceDashboard.tsx`**: 「今日やること」の描画を、旧`selectTodayActionItems(advice)`（手続きのみ）から新しい`todayActions`プロパティ（`WorkspaceDecisionAction[]`、手続き＋売上・資金繰りが合流済み）へ差し替え。各行に遷移ボタンを表示し、`actionHref`があればそれを使い（売上・資金繰り起因）、無ければ`procedureId`＋`dueDate`から既存のRoadmap深いリンク（PR #131と同じ`?procedureId=...&dueDate=...`形式）を組み立てる（手続き起因）。「次の期限」「今年あと何件」は意図的に変更していない（手続きのみの集計のまま。売上・資金繰りには実在する「次の期限」という概念が無い項目を含むため、安易に合算すると誤解を招く）

### 15-3. スコープ外とした判断（会話では明示されていないが実装中に決定）

- 書類単体（手続きに紐づかない定款・登記簿謄本等）を新たに「意思決定」「今日のポイント」へ追加することはしなかった。要件が「売上・資金繰りのアクションを統合」と明示していたこと、書類起因のリスクは`generateWorkspaceDecisions`内の`documentIssue`判定で既に該当手続きのaction理由文に織り込まれていること、独立項目として追加すると同じ書類課題が「手続きactionの理由文」と「書類単体の行」の両方に現れ二重計上に近い状態になりかねないことが理由
- 「確認が必要なこと」セクション自体のレイアウト・ロジックは変更していない（引き続き`procedureDecisions`＋`advice`＋`growthNotifications`から独立に構築。今回追加したのは「今日のポイント」「意思決定」への統合のみ）

### 15-4. 検証結果

| 項目 | 結果 |
|---|---|
| `npm test` | ✅ **351/351 PASS**（13節時点の327件＋新規24件） |
| `npm run build` | ✅ `✓ Compiled successfully`、TypeScriptエラー0、全ルート生成成功 |
| `npm run lint` | ✅ 0 errors（既知の警告1件のみ、`WorkspaceGrowthView.tsx`、本節の変更対象外） |

追加したテスト24件:

| ファイル | 内容 |
|---|---|
| `src/lib/workspaceDecisions.test.ts`（新規、11件） | `compareDecisionActions`（優先度順・同優先度内での期限近い順・期限無し項目が最後方になること）／`mergeDecisionActions`（手続き・成長アクションの合流順・`ACTION_MAX_ITEMS`での切り捨て）／`summarizeDecisionActions`（high件数ありなし・0件の3パターン）／`selectUrgentDecisionActions`（high優先・mediumフォールバック・該当無しで空配列） |
| `src/lib/workspaceGrowthActions.test.ts`（新規、8件） | `growthNotificationToDecisionAction`（severity/title/message転記・dueDate引き継ぎ・null/undefined双方のnull化・procedureIdが常にnull・actionHrefの`/growth?date=`形式）／`growthNotificationsToDecisionActions`（複数件変換・空配列） |
| `src/lib/workspaceGrowthNotifications.test.ts`（追記、5件） | 各通知の`dueDate`が要件5の区別どおりに設定されること（取得失敗・入力案内・確認不能はnull、売上未達・計算済み資金不足は月末） |

node --testのネイティブESM解決対応として、`workspaceDecisions.ts`→`workspaceAdvice.ts`、`workspaceAdvice.ts`→`workspaceProcedureStatus.ts`/`workspaceAdvicePresentation.ts`のimportに`.ts`拡張子を明示した（既存の`workspaceTaxPaymentPlan.ts`・`workspaceNotifications.ts`と同じパターン。value importのみ対象、type-only importは対象外）。

### 15-5. 実ブラウザでの確認結果（Playwright、会社ID17・株式会社REINE・2026年10月、未登録月＋連携納税予定¥500,000の実例）

ローカル`npm run dev`環境に管理者アカウントでログインし、Playwright（`playwright-core`＋キャッシュ済みChromium）で`/admin/workspaces/17`を操作して確認した。

- **要件1・5（重複排除・未登録区別）**: 「今日のポイント」の「今日やること」、「確認が必要なこと」、「意思決定」のいずれでも、資金繰り項目の文言は「納税予定¥500,000あり。預金残高・入出金予定を入力して資金繰りを確認してください。」で統一されており、未登録月を資金不足確定として断定する表示は無かった
- **要件2（共通の優先順位）**: 「今日やること」「意思決定」とも、同じ優先度（中/medium）内で「特別徴収税額の納付」（期限: 11月10日、実際の期限あり）が「今月の資金繰り」（期限: 無し、入力案内）より先に表示された。架空の期限は表示されていない
- **要件3（遷移ボタン）**: 「今日やること」の2項目双方に「対応内容を確認」ボタンが表示された。手続き項目のhrefは`/admin/workspaces/17/roadmap?procedureId=71&dueDate=2026-11-10`（PR #131と同じRoadmap深いリンク形式）、売上・資金繰り項目のhrefは`/admin/workspaces/17/growth?date=2026-10-01`。実際にクリックして売上目標画面（2026年10月）へ遷移し、ホームと同じ「納税予定¥500,000あり」の案内が表示されることを確認した
- **要件4（件数整合）**: 「意思決定」のサマリーは「対応が必要な項目が2件あります。」で、実際に表示された項目も2件（特別徴収税額の納付・今月の資金繰り）で一致していた。「確認が必要なこと」も3件（手続き・資金繰り案内・消費税の課税判定watch）のまま重複は無かった
- **要件6（既存機能の維持）**: 「確認が必要なこと」の既存3項目の表示・Roadmap深いリンクは変更前と同じ内容のまま維持されていた

スクリーンショット・ページ本文テキストはいずれもローカルの一時ディレクトリに保存し、リポジトリには含めていない。管理者ログインに使用した認証情報はコマンド内の環境変数として渡しただけで、スクリプトファイル・リポジトリには一切書き込んでいない。

### 15-6. 実施していないこと

- 実データ（`workspace_monthly_sales`・`workspace_tax_payment_plans`等）の書き換えは行っていない（閲覧・ログインのみ）
- mainへのマージ・本番公開は行っていない（作業ブランチ`feat/workspace-home-action-priority`上での変更に留まる）

### 15-7. PR #133レビュー対応: `generateWorkspaceDecisions`の早期件数制限の見直し

**指摘内容**: `generateWorkspaceDecisions`は内部で`actions.sort(compareDecisionActions); actions.splice(ACTION_MAX_ITEMS);`を行っており、`page.tsx`が売上・資金繰りactionsと合流する**前**に、手続きactionsを単独で8件へ絞っていた。これは「手続きと売上・資金繰りの全候補を合流・ソートした後に表示件数を制限する」という設計意図（15-2節）に構成上は反しており、合流前の早期カットに見えるため指摘を受けた。

**検証**: 合流に使う`mergeDecisionActions`と、合流前の早期カットに使う`ACTION_MAX_ITEMS`（旧コードでは両方とも同じ8）が常に同一の値である限り、数学的には「先に手続き側だけ上位8件に絞ってから合流・再ソート・再度上位8件」と「手続き＋成長の全候補を合流・ソートしてから一度だけ上位8件」は同じ結果になる（手続き側で8位より下位の候補は、どのような成長候補を追加で混ぜても、合流後の全体順位でも8位以内に入り得ないため）。そのため、今回の修正前の`feat/workspace-home-action-priority`時点の実装は、出力結果としては誤っていなかった。

ただし、この等価性は「`generateWorkspaceDecisions`内の早期カット件数」と「`mergeDecisionActions`の`maxItems`」が常に同じ値であることに暗黙に依存しており、どちらかが将来ズレた場合に静かに壊れる構成だった（テストで直接検知できない前提に依存していた）。指摘のとおり、コード構成自体を「全候補を合流・ソートした後に1回だけ件数制限する」形に修正した。

**修正内容**:
- `generateWorkspaceDecisions`（`src/lib/workspaceDecisions.ts`）に、7番目の引数`maxActions: number = ACTION_MAX_ITEMS`を追加。内部の`actions.splice(ACTION_MAX_ITEMS)`を`actions.splice(maxActions)`に変更した。既定値は従来と同じ`ACTION_MAX_ITEMS`のため、**本引数を省略する呼び出しの動作は一切変わらない**
- `page.tsx`: `generateWorkspaceDecisions(..., undefined, Number.POSITIVE_INFINITY)`で呼び出し、手続きactionsの**全候補**（件数制限なし）を取得するよう変更。`Array.prototype.splice(Infinity)`はECMA-262仕様上、`start`が配列長を超える場合は配列末尾にクランプされ要素が1件も削除されない安全なno-opであることを確認済み（`node -e`で実測確認: `[1,2,3,4,5].splice(Infinity)`は`[1,2,3,4,5]`のまま）
  - この全候補（`procedureDecisions.actions`）を`growthActions`と`mergeDecisionActions`で合流・ソートし、`mergeDecisionActions`内で初めて（1回だけ）`ACTION_MAX_ITEMS`件へ制限する。これが「意思決定」「今日やること」の最終的な表示件数になる
  - `buildWorkspaceNotifications`（「確認が必要なこと」、Sprint37の既存Engine）には、**既存の呼び出し元の動作を変えないため**、全候補ではなく`procedureDecisions.actions.slice(0, ACTION_MAX_ITEMS)`（従来の内部`splice(ACTION_MAX_ITEMS)`と全く同じ内容の配列）を渡すよう明示的に切り出した

**検証したこと**:
- `src/lib/workspaceDecisions.test.ts`に新規テスト「手続き側の候補だけで上限を超える場合でも、全候補を合流・ソートした後に正しい優先順位で上位ACTION_MAX_ITEMS件が選ばれる」を追加。手続き側のみでhigh優先度12件（ACTION_MAX_ITEMSの8を超える件数）、成長側にそれら全てより期限の早いhigh優先度1件を用意し、`mergeDecisionActions`の出力が全13件中の正しい上位8件（成長1件＋手続き01〜07、手続き08〜12は除外）になることを確認した
- `MONTHLY_DATA_FETCH_FAILED_NOTIFICATION`（`workspaceGrowthNotifications.ts`、取得失敗時の実際の通知）の`severity`が今回の修正・レビュー対応を通じて`'medium'`のまま変更されていないことを確認した（レビュー時に提示した「期限なしの高優先度」の混在ソート例は、comparatorの挙動を示すための人工的なテストデータであり、実際の取得失敗通知の優先度ではない）
- `npm test`: ✅ **352/352 PASS**（15-4節時点の351件＋本節の新規1件）
- `npm run build`: ✅ TypeScriptエラー0
- `npm run lint`: ✅ 0 errors（既知の警告1件のみ、本節の変更対象外）

**実ブラウザでの再確認**: 行っていない（15-5節で確認済みの会社ID17のケースは手続きactionsが13件中2件のみで、ACTION_MAX_ITEMS=8を超えないため、本節の修正による表示上の差分は無い。ユーザー指示により再実行していない）。
