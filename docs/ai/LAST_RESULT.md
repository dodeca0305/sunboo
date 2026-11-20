# LAST_RESULT: designated-cities-stage5 (Claude Sonnet/medium, manual, 追加エージェントなし)

基点 90196d7。ローカル実装・合成試験のみ。未commit/未push。push/PR/リリースはCodex担当。本番・API・DB・.env・セッション・顧客データ・インストール・課金の操作なし。**SQLは本番未実行（準備のみ）**。追加課金OFF（2026-11-17 claude.ai firstParty確認）を再利用。

## 変更
- `src/lib/assetSubmissionDestination.ts`：`SAKAI_WARDS`(7)/`KOBE_WARDS`(9)/`OKAYAMA_WARDS`(4)＝20区と3市の窓口を`ASSET_CITY_GROUPS`末尾に追加（17グループ・148コード、確認日2026-11-20、R9未確認通知11/20と様式リンク）。堺・岡山は様式URLが公式ページと別、神戸は同一。対応地域文字列は追記のみ。component未変更。既存14市128区のlookup全値はSHA-256で旧HEADと一致（c471ff82…）。
- `scripts/sql/20261120-designated-cities-stage5.sql`（新規・手動DATA PATCH、migrationではない）：INSERTのみ 窓口3/情報源3/管轄20。接頭辞2714/2810+2811/3310（pref27/28/33）、stage4の安全構造を再利用（単一txn・lock・有効規則1件・衝突/部分適用拒否・完全一致のみno-op・既存行指紋不変）。snapshotに公式/様式URL・岡山R8手引PDF（1枚目）・R9未確認。fax=NULL、download/e_filing=NULL。stage1–4は無変更。
- `scripts/validate-designated-cities-stage5.mjs`（新規、PGlite）、`assetSubmissionDestination.test.ts`・`playwright/verify-asset-destination.mjs`を17市対応に更新（既存チェック保持）。

## 検証（ログ test-results/stage5-*.log, sunboo-stage5-*.log）
- helper試験 34件pass。`npm test` 全体 1154件pass/失敗0（最終変更後1回）。
- stage5 SQL PGlite 15シナリオpass：正常+再適用no-op、大阪市既存行との共存（pref27）、欠落/県/名称/接頭辞違い、同市・同名窓口・主管轄・現行出典の衝突、規則変更、部分混在/改変、途中CHECK/INSERT失敗の全rollback、INSERT専用。stage1–4 SQLは再実行せず。
- 実component Playwright 33件pass（1280/375）：新20区をSQL/geo独立期待値で全項目照合、両URL・R9注意、旧128回帰、切替、未選択/other、外部通信0、横overflowなし。画像 `test-results/asset-destination-{sakai,kobe,okayama}-{pc,mobile}.png`。
- 対象eslint 0件。
- 隔離build（git archive HEAD＋変更ファイルのみ、env -i（HOME指定なし）、既存node_modules参照、next build --webpack、型検査含む）成功。snapshot: `/private/tmp/sunboo-stage5-build.3ccwQL`。元`.next`は未接触。

## 未確認/注意
- 公式内容の再確認はしていない（Codexの確認済みJSON一致に依拠）。本番登録・配信・本番画面は未実施。PR214/215保留。
- 初回SQL validatorは岡山の公式案内と様式URLを同一と期待した試験側の誤りで失敗。岡山は別URLが正しいため条件を修正し、再実行15件成功。buildは実行前にCodexがHOMEの書換え案を拒否し、指定を削除した後の初回実行で成功。
- Codexレビュー：公式確認JSONと新20区全項目一致、旧128区lookup全値不変、公開20区と県/区名一致。堺PC・神戸mobile・岡山mobileを目視。成功build snapshotと最終5実装/検証ファイルはbyte一致。本番未反映、PR214/215保留。
