# LAST_RESULT: completion-confirmation-wording (2026-11-13)

- 基点d8f99ef。文言のみ：既知の完了案内の見出しを「完了にする前の確認」へ。申告+納付は「申告の受付を確認した／支払いを済ませた（納める税金がある場合）／提出・支払いの控えを保管した（常時条件：支払いの控えは、納める税金がある場合）」。申告のみ（DEPRECIABLE_ASSET_TAX_RETURN）は「申告書を提出した／受付を確認し、控えを保管した」の2つで納付要件なし。6コードの許可リスト・unconfirmed分岐・kinds/lines契約・コンポーネント/レイアウト/保存は不変。
- 変更：src/lib/procedureCompletionGuide.ts、同.test.ts、playwright/verify-home-read-safety.mjs（新文言、非納付の条件表示2件、申告のみは条件0件、旧見出し不在を確認）。
- 結果：`node --test` 4件成功。`HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs`（own3118、合成）exit 0（375px/desktop/共有、横溢れなし、書込0）。`npm run lint` エラー0・既存Growth警告1のみ。
- ビルド：1回目 `npm run build -- --webpack` は失敗（.next/dev/types内の既存重複ファイル「* 2.ts」による型の重複定義、コード起因ではない）。ログ保全：test-results/completion-confirmation-wording-build-first-failure.log。重複ファイルは削除せず、own3118停止を確認後、.next/dev全体を backups/2026-11-13-completion-confirmation/next-dev-before-rebuild へ移動（上書きなし）。再実行のwebpackビルドは成功。3130は未操作で稼働継続。
- AGENTS.md：dev起動で追記された生成suffixをEditで除去済み（差分なし）。原本退避 test-results/completion-confirmation-wording-AGENTS.orig.md。
- 証跡：test-results/completion-confirmation-wording-{unit,browser,lint,build,build-first-failure}.log。
- 未確認：Codexによる実画面の目視（スクリーンショットは test-results/completion-guide-*.png に更新）。commit/push/PR/本番/DB変更なし。
