# LAST_RESULT: designated-cities-stage4-assets (Claude Sonnet/medium, manual, 追加エージェントなし)

基点 d86d776。ローカル実装・合成試験のみ。未commit/未push。push/PR/リリースはCodex担当。本番・API・DB・.env・セッション・顧客データ・インストール・課金の操作なし。**SQLは本番未実行（準備のみ）**。追加課金OFF（2026-11-17/19 claude.ai firstParty確認）を再利用。途中で接続が切れたため、前担当の途中状態（helper/SQL/validator）を確認し、validator本体（旧stage3内容が残っていた）を差し替えて続行。

## 変更
- `src/lib/assetSubmissionDestination.ts`：`NAGOYA_WARDS`(16)/`KYOTO_WARDS`(11)/`OSAKA_WARDS`(24)＝51コードと3市の窓口を、確認済みJSONどおり`ASSET_CITY_GROUPS`末尾に追加（14グループ・128コード、確認日2026-11-19、R9未確認案内）。名古屋のみ様式URLが公式ページと別、京都/大阪は同一。既存11市77コードと対応地域文字列（追記のみ）以外は不変。componentファイルは未変更。
- `scripts/sql/20261119-designated-cities-stage4.sql`（新規・手動DATA PATCH、migrationではない）：INSERTのみ 窓口3/情報源3/管轄51。pref23/26/27、接頭辞2310+2311/2610+2611/2710+2711+2712、単一txn・lock・有効規則1件確認・衝突/部分混在拒否・完全適用のみno-op。snapshotにcontact/per-ward/evidence URL（京都PDF7枚目・印刷p18・連絡先12枚目、大阪evidence/contact URL）とR9未確認を保持。fax等・download/eFiling NULL。stage1-3は未変更。
- `scripts/validate-designated-cities-stage4.mjs`（新規、PGlite）。`assetSubmissionDestination.test.ts`と`playwright/verify-asset-destination.mjs`を14市対応に更新（既存チェックは保持）。

## 検証（ログは /tmp/sunboo-designated-stage4-*.log）
- 対象helper試験 29件pass（-tests.log）。`npm test` 全体 1149件pass/失敗0（-tests-full.log、最終変更後1回）。
- stage4 SQL PGlite 14シナリオpass（-sql.log）：正常+再適用no-op、3県×各接頭辞側のmissingward/wrongpref/wrongname/別接頭辞、同市窓口・同名窓口・主管轄・現行出典の衝突、規則変更、部分混在/余分な管轄/version/snapshot改変、途中CHECK・途中INSERT失敗の全rollback、INSERT専用。stage1-3 SQLは再実行せず。
- actual component Playwright 29件pass（既存25＋新規4、-browser.log）：1280/375、全51区をSQL/geo独立期待値と照合（連絡先/URL/formURL/note/R9/日付）、切替・旧市への切戻し・other/blank/disabled、接頭辞の端、外部通信0・横はみ出しなし。画像 `test-results/asset-destination-{nagoya,kyoto,osaka}-{pc,mobile}.png`。
- 対象eslint 0件（-lint.log）。
- 隔離build（git archive HEAD＋変更ファイルのみ、env -i、node next build --webpack、型検査含む）成功（-build.log）。snapshot: `/private/tmp/sunboo-stage4-build.JORItD`。元`.next`は未接触。

## 未確認/注意
- 公式内容の再確認はしていない（Codexの独立チェック済みJSON一致に依拠）。本番登録・配信・実ブラウザの本番画面は未実施。
- build/テストは初回成功。途中のCLI接続終了は同じ会話を再開して復旧。前半のmacOS sed -iの実行エラーはPythonで修正。
- Codexレビュー：既存77区のlookup全値不変、追加51区×10項目が公式確認済みJSON一致。SQL/validator/QA差分を確認、成功build snapshotと最終5実装/検証ファイルがbyte一致。大阪mobile・京都mobile・名古屋PCの画像を目視し問題なし。本番/PR未実施、PR214/215保留。
