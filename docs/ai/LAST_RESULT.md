# LAST_RESULT: designated-cities-stage2-assets (Claude Sonnet/medium, manual, 追加エージェントなし)

基点 c45f932。ローカル実装・合成試験のみ。未commit/未push。push/PR/リリースはCodex担当。本番・API・DB・.env・セッション・顧客データ・インストール・課金の操作なし。**SQLは本番未実行（準備のみ）**。本番の公開マスター/償却資産提出先への反映はしていない。

## 変更
- `assetSubmissionDestination.ts`：横浜市18区・川崎市7区・相模原市3区（計28コード、神奈川県、確認日2026-11-19）と `YOKOHAMA_WARDS/KAWASAKI_WARDS/SAGAMIHARA_WARDS` を追加。`ASSET_CITY_GROUPS`は8グループ[7,7,5,10,6,18,7,3]=63コード。旧5市35コード・既存export・日付・案内は不変。区名は公開マスターSQL（migration_designated_cities_geography.sql）と完全一致。川崎市は電話2件併記、注記「資産がある区ごとに書類を用意します。電話は川崎区・幸区が1321、その他5区が1322です。」（区ごとの書類は公式FAQで確認済み、Codex確認）。令和9年度様式は3市とも「公開を確認できていません（2026/11/19確認）」の表現（未公開とは断定しない・R8をR9扱いしない）。様式案内の遷移先は川崎市＝様式一覧 0000053635、横浜市・相模原市＝各様式ページ（公式案内URLとは別）。コンポーネント/Draft/Roadmap/ゲートは未変更。
- `scripts/sql/20261119-designated-cities-stage2.sql`（新規・手動用、INSERTのみ）：窓口3/情報源3/管轄28。stage1の保護（BEGIN/COMMIT、LOCK、全28区が都道府県14・市接頭辞（横浜は1410と1411の両方、川崎1413、相模原1415）・市名+区名で一致、規則の事前検証、version=1、effective_from=2026-11-19固定、窓口に紐づく全管轄=28、現行情報源の一意、完全適用済みのみno-op、部分/混在は拒否、追加後+3/+3/+28と既存行の指紋不変）を踏襲。情報源snapshotにマーカー designated-cities-stage2-20261119、連絡先verified、区ごとの提出verified（川崎=公式FAQ、横浜=償却資産ページを証跡URL）、R9 unconfirmed、追加URL（様式ページ、川崎R8手引PDF p22は電話の根拠にだけ使用）。stage1のSQL/スクリプトは無変更。
- `scripts/validate-designated-cities-stage2.mjs`（新規、PGlite）：成功（28/+3/+3/+28、見張り行不変）、再適用no-op、区欠落（1410側/1411側/川崎/相模原）、都道府県・市名・区名・接頭辞不一致、既存窓口/主管轄衝突、規則6種、部分/混在/version/余分な紐づけ/開始日/snapshotずれ、書込途中CHECK失敗の全ロールバック、INSERT専用の静的確認。各ケース後にDBをclose。
- テスト：helper 14→19件（63コード、28区の窓口・電話・注記・案内、公開マスタ/SQLとの照合、不正値null、旧35不変）。`playwright/verify-asset-destination.mjs`：8グループ、新3市28区をSQLパッチ/公開マスタの値と照合、旧市への切り戻し、other/空欄、独立、disabled、1280/375px（横スクロールなし）、通信遮断、各新市のスクリーンショット（test-results/asset-destination-{yokohama,kawasaki,sagamihara}-{pc,mobile}.png）。

## 検証
- helper 19件pass、`npm test` 1139件pass/失敗0（/private/tmp/sunboo-designated-stage2-tests.log）。
- SQL隔離検証12件pass（/private/tmp/sunboo-designated-stage2-sql.log）。
- 実コンポーネントのPlaywright 21件pass、通信試行0（/private/tmp/sunboo-designated-stage2-browser.log）。
- 対象ファイルlint 0件（exit0）。
- 隔離ビルド：初回は失敗（exit1）、指示された1回の再試行で成功（exit0、"Compiled successfully"、型検査を含むnext build完了）。各回とも新規mktempへ`git archive HEAD`＋最終の変更ファイル（helper・テスト・QA・新SQL/スクリプト）をコピー、既存node_modules symlink、env -i、`node node_modules/next/dist/bin/next build --webpack`。ソース/vendor/フォント/ロックの変更、モック、サンドボックス解除はなし。
  - 初回失敗：`next/font`のGoogle loader内で`TypeError: Cannot read properties of null (reading '1')`（拡張子の解析部分）。原因（ネットワーク無し等）は確定していない。再実行で解消したため再現性は不明。初回ログは保存：/private/tmp/sunboo-designated-stage2-build-initial-failed.log。
  - 成功ログ：/private/tmp/sunboo-designated-stage2-build.log。ビルドディレクトリはCodexのバイト比較用に保持：/private/tmp/sunboo-designated-stage2-build.JMUDKG（パスは/private/tmp/sunboo-designated-stage2-builddir.txt）。元の.nextは未変更。

## 限界・未確認
- 実DB/本番PostgREST/並行トランザクションは未検証（PGliteの最小スキーマ再現）。画面は公開マスターを読まない固定値。
- 川崎市のR8手引PDFは電話の根拠のみ。令和9年度様式は3市とも未確認。公式サイトの再取得はしていない（Codex確認値を使用）。
- 残り政令市は未実装。docs/ai/current-task.jsonの既存変更は触っていない。

---

# LAST_RESULT: designated-cities-stage1-assets (Claude Sonnet/medium, manual, 追加エージェントなし)

基点 3d565ad。ローカル実装・合成試験のみ。未commit/未push。push/PR/リリースはCodex担当。本番・API・DB・.env・セッション・顧客データ・インストール・課金の操作なし。SQLは本番未実行（準備のみ）。

## 変更
- `assetSubmissionDestination.ts`：仙台市5区・さいたま市10区・千葉市6区（Codex確認済みの窓口/電話/公式URL、確認日2026-11-19、R9様式案内11/19）を追加。`ASSET_CITY_GROUPS`（5市35コード）を新設し検索はこれを走査。旧export（ASSET_WARDS/KITAKYUSHU_WARDS等）、福岡（案内なし・11-16）・北九州（11/18案内）は不変。完全一致以外はnull。対応地域表示は5市のみ（17市対応とは書かない）。
- `AssetSubmissionDestination.tsx`：optgroupを`ASSET_CITY_GROUPS`で生成。他は不変（保存/通信なし、disabled独立）。Roadmap/Draft側は未変更。
- `scripts/sql/20261119-designated-cities-stage1.sql`：データ専用・手動レビュー用（migrationではない）。INSERTのみ 窓口3/情報源3/管轄21。BEGIN/COMMIT、SET LOCAL search_path、LOCK、21区と規則の事前検証、既存衝突は例外（ON CONFLICTなし）、完全適用済みのみno-op、部分/混在は拒否、追加後に+3/+3/+21・現行3・既存行の指紋不変を確認。FAX/e_filing/download_page/official_url_checked_at/verified_by/verification_due_atはNULL、official_url_status=ok・last_verified_at=2026-11-19・update_frequency=unknown。法人市民税の窓口データは含めない。
- `scripts/validate-designated-cities-stage1.mjs`新規（PGlite、インメモリ）：成功/再適用no-op/区欠落/都道府県・名称不一致/既存窓口衝突/既存主管轄衝突/規則不一致6種/部分適用6種/書込途中CHECK拒否（2窓口+管轄追加後でも全ロールバック）/INSERT専用の静的確認。
- テスト：helper 8→14件（35コード・窓口・日付/案内・不正値・回帰・公開マスタSQLとの照合・非保存）。`playwright/verify-asset-destination.mjs`：5グループ[7,7,5,10,6]・初期空欄・新3市全21区をSQLパッチ/公開マスタ側の値と照合・福岡/北九州の切替・other/空欄・2ウィジェット独立・disabled・375/1280px・通信遮断。

## 検証（全て終了コード0）
- helper 14件pass、`npm test` 1134件pass（/private/tmp/sunboo-designated-stage1-tests.log）。
- SQL隔離検証12件pass（/private/tmp/sunboo-designated-stage1-sql.log）。
- 実コンポーネントのPlaywright 17件pass（test-results/asset-destination-qa.log、スクリーンショット test-results/asset-destination-*-{pc,mobile}.png）。
- 対象ファイルlint 0件。隔離ビルド（git archive HEAD＋変更ファイル、env -i、next build --webpack）成功（/private/tmp/sunboo-designated-stage1-build.log）。元の.nextは未変更。

## Codexレビュー反映（SQL堅牢化、2026-11-19）
- no-op判定に `data_version=1`、3窓口に紐づく**全**管轄（区分・範囲不問）=21件、`effective_from=DATE '2026-11-19'`を追加。初回INSERTも`effective_from`を明示。
- PGliteに各ずれの拒否を追加（data_version変更、別区分/非主/別市への余分な紐づけ、都道府県範囲の余分な紐づけ、effective_from変更）。SQL隔離検証12テスト（部分適用ケースは6→11種）全pass、対象lint 0、helper14件pass。UI/ビルド/全体test/ブラウザQAは未変更のため再実行せず（上記結果が有効）。
- Codex確認（公開マスターSELECT、読み取りのみ）：21区の名称・コード・都道府県が一致、想定の償却資産規則は不変、対象窓口・主管轄マッピングは未存在。本番書込は0のまま。

## 限界・未確認
- 実DB/本番PostgREST/実際の並行トランザクションは未検証（PGliteの最小スキーマ再現）。パッチは本番未実行で、画面は公開マスタを読まない（コード側の固定値）。
- 令和9年度様式は「公開を確認できていません（11/19確認）」の表現のみ。未公開とは断定しない。公式サイトの内容自体は再取得していない（Codex確認値を使用）。
- 残り14政令市の実装は未準備（17市対応は未リリース。今回は仙台・さいたま・千葉の3市のみ）。docs/ai/current-task.jsonは既存の未コミット変更を触っていない。

---

# LAST_RESULT: kitakyushu-asset-location-ui (Claude Sonnet/medium, manual, 追加エージェントなし)

基点 d9038be。ローカル実装・合成試験のみ。未commit/未push。push/PR/リリースはCodex担当。本番・API・DB・.env・セッション・顧客データ・インストール・課金の操作なし。

## 変更
- `assetSubmissionDestination.ts`：ASSET_WARDS（福岡7区）は据え置き、`KITAKYUSHU_WARDS`（401013門司/401030若松/401056戸畑/401064小倉北/401072小倉南/401081八幡東/401099八幡西）を追加。北九州の窓口（固定資産税課 償却資産係、803-8501、093-582-3210、確認日2026-11-18、7区同一）。任意の`formNotice`は北九州のみ：「令和9年度の様式は公開を確認できていません（2026/11/18確認）。」＋「最新の様式を公式サイトで確認」→division260list（R8様式ページ/PDFは使わない）。対応範囲表記は福岡市7区・北九州市7区のみ。福岡の窓口・確認日11-16・修正済みコード(401358西/401366城南/401374早良)は不変。
- `AssetSubmissionDestination.tsx`：福岡市の隣に北九州市optgroup、リンク名/出典名は`destination.cityLabel`、様式案内は折り畳みの外・target=_blank rel=noopener noreferrer。company props/自動選択/保存/通信なし、disabled維持。Roadmap/Draft側は未変更。
- テスト4件追加（計8件）、`playwright/verify-asset-destination.mjs`新規。

## 試験（ログ /private/tmp/sunboo-kitakyushu-ui-tests.log、test-results/asset-destination-*）
- 対象 node --test：8件成功。npm test全体：1128件成功/失敗0。eslint：エラー0（修正後、対象ファイル警告0）。`tsc --noEmit`：エラーなし。
- ブラウザQA：実コンポーネントをnext同梱webpack+TS変換で/private/tmp/sunboo-asset-destination-fixtureに束ね、全外部通信遮断のChromium（1280/375）で13項目成功：7+7選択肢、初期は結果なし、小倉北→093-582-3210・新注意・公式リンク属性、福岡城南401366へ切替で窓口/注意消去/福岡市リンク、other/blank消去、複数ウィジェット独立、disabled、通信0。画像 asset-destination-{kitakyushu,fukuoka}-{pc,mobile}.png。

## 制限
- 隔離ビルド：`git archive HEAD`を/private/tmp/sunboo-kitakyushu-build-snapshotへ展開、変更3ソースのみ上書き、node_modulesはsymlinkのみ（.env/session未コピー、元の.next不使用）、環境変数を空にした子プロセスで`next build --webpack` exit0（ログ /private/tmp/sunboo-kitakyushu-ui-build.log）。ブラウザQAは実Nextページ/認証画面ではなく合成フィクスチャ。令和9年度様式は「公開未確認」であり未公開の確定ではない。

# LAST_RESULT: financial-forecast-storage (Claude Sonnet/medium, manual, 追加エージェントなし)

基点 0483f45（codex/financial-forecast-storage）。実装・合成試験のみ。未commit/未push。push/PR/リリース/本番入力はCodex担当。本番接続・.env・実セッション・顧客データ・インストール・他AI/課金の操作なし。

## 変更（指定ファイルのみ）
- migration（CLI生成の雛形に記入）：`workspace_financial_forecasts`1表（会社+期間+シナリオ名が主キー、架空フラグ、version、17金額列=NULLと0を区別、日付/金額範囲CHECK、期首繰越利益のみ負数可）、版/時刻とキー不変を守るinvokerトリガー、RLS（admin+メンバー、非匿名。読取は全ロール、書込はowner/member）、authenticatedにSELECT/INSERT/UPDATEのみ、`save_workspace_financial_forecast` SECURITY INVOKER RPC（期待版+期待値のCAS、同一内容の再送は冪等、競合insertは競合安全）。DELETE/TRUNCATE/anon/PUBLIC/他表の権限なし。
- `financialForecast.ts`（検証・BigInt計算・決算月からの期間提案）、`workspaceFinancialForecast.ts`（取得/保存アダプタ、保留記録、厳密な版確認、記録の所有確認/解放）、`WorkspaceFinancialForecastView.tsx`、`/admin/workspaces/[id]/forecasts/page.tsx`、左メニュー「決算見込（試算）」、ホームの入口リンク、`playwright/verify-financial-forecast.mjs`。
- 計算：見本どおり営業利益1,200,000／純利益840,000／期末現金3,000,000／売掛金1,840,000／資産5,040,000／負債1,200,000／純資産3,840,000／差額0。調整の穴埋めなし（差額はそのまま表示）。未入力は依存項目だけ「計算できません」。税額計算ではなく、償却・税務調整は含めないと画面に明記。

## 試験（ログはtest-results/financial-forecast-*）
- 純粋/アダプタ30件成功 exit0（lib-tests.log）。実SQL(PGlite・新migrationのみ適用)10件成功 exit0、`after`でclose（sql-final.log）。SQL初回の構文エラー(sql-run1.log)は保存、修正後run2/finalは成功。
- E2E（隔離コピー /private/tmp、port3121、実Next build/start＋PGlite実SQL、Chromium）22項目成功 exit0（e2e-run5.log、e2e.json）。含む：404、空/提案期間、見本の保存・再読込、0と空欄、負数Enter/途中の「-」、二重クリック1送信、+1,000,000、応答喪失(確定/未確定)で自動再送なし・二重保存なし、同時更新の取消後に最新値(v4)が残り上書きなし、保存失敗、viewer拒否(保留はviewer内で取消し、ownerへ漏れず)、取得失敗でエディタ停止、会社切替中の保存、他アクター/会社のstorageイベント非干渉、保留2件の読取専用確認、削除失敗/別依頼置換で停止、375/1280でoverflowなし・操作44px以上・文字14px以上、既存税/月次行不変、想定外書込0、pageerror0。画像 financial-forecast-375.png / -1280.png（標準を見本に戻して撮影）。
- 隔離 `next build --webpack` exit0（build.log）。ビルドには新規TS試験3本も含め、ES2017型検査に合わせてBigInt()に修正。初回ビルド失敗は financial-forecast-build-initial.log に保存。
- lint：最終 exit0（lint-final.log）、エラー0・警告3（既存WorkspaceGrowthView1件＋新ハーネスの未使用`num`/`window.location`の2件）。初回lint失敗は lint-initial.log。
- E2E初回〜4回目の失敗は e2e-run2/3/4-failure.txt に保存（404はストリーミングで200開始のため画面で確認、J/Iの保留、details開閉のハーネス不具合。製品仕様は弱めていない）。

## 制限・未確認
- PGlite は単一接続のため、真の同時トランザクション競合は逐次の結果でのみ検証（SQLの競合分岐は実装済み・実並列は未検証）。
- 実認証/本番Supabase/PostgRESTでの動作、本番RLS環境（既存is_workspace_member/admin_users前提）は未確認。E2Eは合成応答でPostgRESTの挙動を模擬。
- ホーム入口リンクは型検査・ビルドのみ（ホーム描画はE2E未実施）。左メニューは存在確認。
- 全既存試験はCI任せ。会社23への入力・本番migration適用はCodex側で別承認後。

## 2026-11-17 Claude Code結果：cash-flow-empty-state（実装完了・未push）

- 成長画面の資金繰り4項目（預金残高/入金予定/支出予定/その他納税）に、画面内限定の未入力/0円状態(cashInputState)を追加。空欄は未入力、明示入力の0は0円。4項目すべて入力済みの時だけ資金不足/月末残高/増減/持つ目安と下流の対策・追加売上/週次目標を表示。未入力時は「資金繰りは未入力です／入力が足りないため計算できません」と不足項目、0円は0入力の案内。ロードマップ納税予定は「納税予定Xあり」で維持し、架空の不足額は出さない。
- 月切替/日付URL/会社切替(key={companyId})で状態を同期。保存成功は保存時点のスナップショットだけを記録し、保存中の編集/月切替を上書きしない。保存中に編集した値は「保存しました」を出さない。保存失敗は状態保持。保存ペイロード/DB/計算式/共通入力は未変更。
- 制限：スキーマに入力有無が無いため、保存済みの0は既定値と区別できず再訪時は未入力扱い（再入力が必要）。このセッションで明示入力して保存した月だけ0を保持。
- 試験：helper8件＋monthlySalesProgress含む対象73件成功、lint成功(既存警告1のみ)、next build --webpack成功。合成UI(実WorkspaceGrowthView+Supabaseスタブ)106 PASS/0 FAIL、pageerror0、375/1280で横overflowなし/ラベル14px以上/入力44px以上。画像 test-results/cash-flow-*.png。初回QAはサーバのクエリ文字列処理の基盤エラーで失敗（cash-ui-qa.infra-error-1.log保存）、修正後に再実行。ログ test-results/cash-*.log。フル試験はCI。
- 未確認：実認証ページ/実データの表示。push/PR/本番はCodex担当。変更：WorkspaceGrowthView.tsx、cashFlowInputState.ts/.test.ts、growth/page.tsx。

## 2026-11-17 最新：本人の「どんどん進めて」を受け残り画面を一括確認

- 本人は試用中の1操作ごとの質問/停止を嫌い、継続と速度を希望。設立日/資本金の値は本人指定なしなので空欄のまま。会社23で入力/業務保存/税務チェック実行/共有発行は行わず、決算実績の空フォームをキャンセルし、売上目標→共有→ホームを読み取りで一巡。CUA終了、現在Chrome会社23ホーム。本番ソース/DB/公開設定の変更なし。
- 既に実確認：償却資産の下書き2シートのダウンロード/Excel表示、取得日2026-04-02・20万円・4年・数量1、新品、カテゴリ6。申告書側集計も20万円。会社番地/代表者/2027-01-01所有は未入力/未確認。Excelは第二シートを開いた状態、自動保存OFF、回復案内には触れず、セル編集/保存なし。
- 会社プロフィール→ホーム未入力案内→税金の確認結果→決算日の入力欄、の導線を実確認。税金の確認結果は実績未登録でチェック前の0件と明記。申告実績の対象年度/決算日/開始日/申告日の空フォームまで確認し、追加せずキャンセル。保存後/チェック後の挙動は未試験。
- 売上目標：月間目標/実績/商談数/成約率/契約単価/粗利/固定費/預金/入出金/税額/週次商談の入力欄が表示。空欄なのに計算表示が粗利益0円・営業利益0円・月末預金0円・資金不足0円・資金減少なしとなり、未入力とゼロを見分けにくい。これは実表示に基づく改善候補。取得失敗ではなく空入力の扱いで、まだソース原因/修正/試験未着手。次の改修候補はこの一点に絞る。
- 共有：会社プロフィール/手続状況が常時公開範囲、決算実績は任意チェック初期OFF、期限30日、既存5リンク全て共有停止済み・コピーdisabledを確認。URLトークンを記録/再配布せず、新規発行/期限変更/公開範囲変更なし。共有先画面/発行動作は今回未試験。
- 福岡市公式003/007の404は移転と断定不可。公式hpsyogai.htmlの2026-11-16障害案内が確認済み。リンクを推測差替えする修正はしない。復旧状況は本日未再確認。
- 画像 /private/tmp/sunboo-tax-review-2026-11-17.png、/private/tmp/sunboo-tax-return-entry-2026-11-17.png、/private/tmp/sunboo-trial-home-2026-11-17.png。試用の画面導線は一巡したが保存/共有発行/税務実行まで完了したとは言わない。current-task idle/Claudeなし。

## 2026-11-16 最新：PR #211 マージ・本番反映済み

- 本人がPR #211の本番公開を「いい」と明示承認。head af7cd436d579b3da5cd999c24bc2936a4ade753bと成功checksを照合してsquashマージ。main3727340df292c631c2c5c94fd300b3cc60d7b3e8。PR CI43860591874/main CI43861114373とも全1076件成功・標準ビルド39ページ成功。
- Vercel dpl_Hx2eRbrM4srcEZey8NYAipftf58E production/READY、mainSHAとsunboo-keiei.com/wwwのalias一致。公開rootは通常転送後wwwでHTTP200。証跡 ../backups/2026-11-16-asset-location-destination/{pr-ci,main-ci}.log とrelease-proof.json。ローカルsrcとorigin/main一致、node_modules未追跡symlinkのみ。Claude終了/current-task idle。
- 管理用償却資産のロードマップ/書類下書きで資産所在地（福岡市7区）を明示選択すると提出先・住所・電話・公式案内を表示。会社住所から推測せず、他地域は未対応。メモリのみでExcel未反映。DB/税務/期限/保存/完了/public/share未変更。実認証ページの表示は未確認、今回本番会社23の入力・状態変更なし。
- 次は本人へ現在の年度ロードマップを再読み込みし、償却資産申告の「資産の所在地」で「福岡市中央区」を選ぶ1操作を案内。本人が画面を進めたら具体的に続ける。汎用の理解確認や実申告の提出作業へ脱線しない。

# LAST_RESULT: asset-location-destination (Claude Sonnet/medium, manual)

基点 8a0c994（codex/asset-location-destination）。変更は指定6ファイルのみ（未commit）。push/PR/リリースはCodex担当。

## 変更
- `assetSubmissionDestination.ts`: 6桁文字列JIS完全一致の純粋参照（401315東/401323博多/401331中央/401340南/401358城南/401366早良/401374西）。全区同一の提出先「福岡市 財政局 資産課税課（博多区役所 9階）」〒812-8512 博多駅前2丁目8番1号 092-292-2479、公式003.html、確認日2026-11-16。空/未知/不正/他地域/東京/北九州はnull（会社所在地への代替なし）。期限の引用・計算なし。
- `AssetSubmissionDestination.tsx`: 資産所在地select（初期空、福岡市7区＋その他）、メモリのみ。選択で提出先/住所/電話/公式リンク、「その他」で旧結果を消し「この地域の案内はまだありません」。会社住所でなく資産の場所を選ぶこと・保存されないこと・Excelに含まれないことを明示。出典/確認日はdetails内。useId、44px/14px以上。disabled任意。
- `DepreciationDocumentDraft.tsx`: 展開時の上部に共有部品（disabled=busy）。モデル/出力/フォームは不変。
- `AnnualRoadmapView.tsx`: `editable && DEPRECIABLE_ASSET_TAX_RETURN`のときだけ、RoadmapNextAction（東京リンク）・旧「提出先」ブロック・「手続きの案内・様式」ブロックを非表示にして共有部品（pathname/companyId/procedure/dueDate key）を1つ表示。ElectronicFilingEntry（eLTAX）・他手続・公開/共有は不変。完了/状態に影響なし。

## 確認（最終ソース）
- `node --test src/lib/assetSubmissionDestination.test.ts` rc0, 4件pass/0 fail（7区、不正値、出典、統合ゲートの静的確認）。`npm run lint` rc0。`npx next build --webpack` rc0。ログ test-results/asset-location-destination-{unit,lint,build}.log。全体スイートはCI。
- 合成UI QA（実コンポーネント、webpack+TSローダー、既存ビルドCSS、127.0.0.1一時ポートのみ）: 375/1280で50 PASS/0 FAIL（初期空、中央区、西区、その他で旧結果消去、ID一意、remountで初期化、disabled、44px/14px、横溢れなし、非GET0、storage0、pageerror0）。ログ/画像 test-results/asset-location-destination-{ui-qa.log,initial/chuo/other-375/1280.png}。

## 限界
- 公式リンク（003.html）の到達は未確認（直接取得が404になることがあると依頼に記載）。顧客画面には記載せず、ここのみ。
- 実アプリ画面（認証/Supabase）でのロードマップ/書類ページ表示は未確認。AnnualRoadmapViewのゲートは静的テストと目視コード確認のみ。
- 選択はExcelに含まれない（案内のみ）。福岡市以外は未対応。
- node_modules・current-task.json既存変更・3130/14330/3138は未操作。

## Codex公開確認（2026-11-16）

本人の明示承認後PR #210を同じhead3af1ba2でマージ。main89ea9ae315e12490058777159b031e6d617edc0f。PR CI43822536522/main CI43836562355とも1072件成功・標準ビルド39ページ成功。Vercel dpl_CL4evJkwNnTL18KH3VPRa5X5XEex production/READY・SHA/独自ドメイン一致。公開rootは転送後wwwのHTTP200。前回の承認待ちは解消。認証付き本番画面・Excelアプリ表示は未確認。

# LAST_RESULT: asset-document-drafts (Claude Sonnet/medium, manual)

基点 9cee384（codex/asset-document-drafts）。変更は指定6ファイルのみ（未commit）。push/PR/リリースはCodex担当。

## 変更
- `src/lib/depreciationDocumentDraft.ts`（新規・純粋モデル）: 検証（正の安全整数・正しい3桁区切りのみ・実在ISO日付/うるう年・対象年1989–2100・耐用年数1–100・最大100行・文字長/制御文字除去）、行追加/削除（安定ID）、`freezeInput`、`buildCompanySource`（市区町村までは住所不完全）、`findDepreciationDocuments`（償却資産申告書＋種類別明細書が両方「償却資産申告」に紐づくときのみ。対象年は既存期限の年、ホスト時計は不使用）、種類別集計（種類内/種類をまたぐ桁あふれは合計null＋要確認、未入力は0にしない、数量を掛けない）。判定・償却・税額計算なし。
- `src/lib/depreciationDocumentDraftExcel.ts`（新規）: 既存exceljs＋`buildExportFilename`。2タブ（種類別明細書（下書き）/償却資産申告書（下書き））。各タブに「下書き・提出用ではありません」。文字は文字列セル、数値/日付は検証済みのみ型付き、無効入力は入力文字＋行ごとの警告、空欄は空欄。全セル折り返し＋行高自動。前年/増減/所有者コード等は未記入と明記。
- `src/components/DepreciationDocumentDraft.tsx`（新規）: 初期は折り畳み（開く）。会社名/住所を「登録済み」で流用、代表者は空欄1つ。資産は全項目空欄で行追加/削除、即時プレビュー、未入力サマリー、所有確認は未確認が初期値。メモリのみ（storage/ネットワーク書込なし）。同期refロック＋スナップショット、出力中は全入力/開閉/追加削除/所有確認をdisabled、await後のunmount/会社切替は中止（旧会社ファイルを出さない）、失敗時は入力保持でインライン表示、object URLは10秒後/unmountでrevoke。
- `documents/page.tsx`: 取得済みの会社名・プロフィールの都道府県/市区町村/番地を渡すのみ。PageHeader直後に`key={companyId}`で配置。documents・profile・requiredDocuments取得済み、fiscalMonthあり、対象書類ありのときだけ表示。既存の取得失敗ガード/他コンポーネントは未変更。

## 確認（最終ソース）
- 対象unit: `node --test src/lib/depreciationDocumentDraft.test.ts` 18件 pass/0 fail（部分/不正/空欄と0、日付/うるう年、年、整数/桁あふれ（種類内・種類間）、桁区切り不正、複数種類・数量非乗算、追加/削除、住所不完全/完全、所有未確認、スナップショット、不正文字、書類特定、XLSX往復2タブ・型・式風文字列・空欄・合計一致・折り返し行高・ファイル名）。初回の行高期待値の誤り1件は期待値修正後に再実行（ソース不変）。ログ test-results/asset-document-drafts-unit.log。
- `npm run lint` returncode 0、`npx next build --webpack` returncode 0（Python subprocessで全ログ保存: asset-document-drafts-{lint,build}.log）。
- 合成UI QA（リポジトリ外ハーネス、webpack＋TSローダー、ビルド済みCSS、127.0.0.1の一時ポートのみ・終了済み、実アプリ/既存サーバー/本番なし）: 99 PASS / 0 FAIL。375/1280で、初期折り畳み、登録値の流用と番地不足、空欄/未選択、禁止文言なし、リンク/アップロードなし、コントロール高さ≥44・文字≥14px・横溢れなし、ラベル、入力/追加/削除/非乗算/プレビュー、二重クリック連打でダウンロード1件、ファイル名、XLSX(zip)、非GETリクエスト0、storage 0、pageerror 0。出力中のdisabled、遅延中の会社切替/unmountでダウンロード0件・状態リーク無し、取得失敗時のalert表示・入力保持・再試行可。ログ/画像 test-results/asset-document-drafts-{ui-qa.log,375.png,1280.png,error-375.png}。

## 最終見た目修正（componentのみ）
- 下書き表示は赤枠/赤字をやめ通常の薄い枠＋黒太字。未入力サマリーは `details`「未入力・要確認（N項目）」（初期閉、summary≥44px/14px、開くと全項目表示）。各行の警告も `details`「この資産の要確認（N項目）」（初期閉）。プレビューの未入力値表示は維持。
- 種類別集計は入力のある種類だけ表示。0件は「資産を入力すると、種類ごとに集計します。」。未分類/不完全はmissingと総合計「要確認」を維持。モデル/Excel/税務処理は不変（unit18は再実行なし）。
- 再実行（最終ソース）: lint returncode 0、`next build --webpack` returncode 0（*-final.log）。合成UI QA 125 PASS/0 FAIL（details初期閉・開いて全項目可読、バナー非赤、空集計文言、正常入力時に警告/missing無し、既存項目）。最初の4件FAILはQA側のセレクタ範囲誤り（select選択肢の文字を拾った）で、検査範囲を修正して再実行。ログ test-results/asset-document-drafts-ui-qa-final.log。初回99成功ログ/画像は *-initial-* として保護。
- 画像（架空データのみ）: test-results/asset-document-drafts-normal-{375,1280}.png（会社名・番地・代表者・資産1件・所有確認済みの正常時）、-collapsed-{375,1280}.png（初期閉パネル）、-{375,1280}.png（未入力あり）、-error-375.png。

## 限界
- 実アプリ画面（認証/Supabase）・実ブラウザのExcel表示は未確認（合成部品のみ、Chromiumのみ）。モデル/Excel不変のためunitは再実行せず、UI修正後のlint/build/UI QAは上記の最終ログで確認。
- node_modules symlink・current-task.json既存変更・3130/14330/3138は未操作。QA一時ファイルはscratchpad内。
