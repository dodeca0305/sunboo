# LAST_RESULT: procedure-status-hints (2026-11-13)

- 基点a287ad9。表示のみ：年間ロードマップの対応状況selectの選択肢に目安を追加（未着手：まだ始めていない／進行中：担当者に依頼済み・準備中／完了：必要な対応と確認を終えた／保留：事情があって一旦止めている）。コード・値・順序・aria-label・handler・disabled/error/保存/不確定保護は不変。selectに max-w-full のみ追加。
- 変更：src/lib/workspaceProcedureStatus.ts（型付きWORKSPACE_PROCEDURE_STATUS_HINT追加。既存LABELは不変）、src/components/AnnualRoadmapView.tsx、playwright/verify-home-read-safety.mjs（4選択肢の文言/値/順序、描画・focus+Escapeで保存/値変更なし、375px横溢れなし、375px/desktop画像）、本ファイル。
- 結果：`HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs`（own3118、合成）exit 0。画像 test-results/procedure-status-hints-{mobile,desktop}.png。lint エラー0・既存Growth警告1のみ。`npm run build -- --webpack` 成功（1回）。
- ビルド前：own3118停止を確認。.next/dev に重複生成ファイル「* 2.*」があったため、削除せず .next/dev 全体を backups/2026-11-13-status-hints/next-dev-before-build へ移動。
- AGENTS.md：dev起動で追記された生成suffixをEditで除去済み。原本退避 test-results/procedure-status-hints-AGENTS.orig.md。
- 共有の読取専用バッジ：StatusBadgeはWORKSPACE_PROCEDURE_STATUS_LABELのまま未変更（ソース上）。今回の新規テストで明示的には確認していない。
- Codex実機確認：ローカル3130の合成会社1でネイティブメニューを開き4説明を目視、Escapeで閉じても未着手のまま。書込停止false・業務書込33・拒否1は前後不変。自動試験のfocus/Escapeとは別に確認。コメント修正のみのため合格済み合成は再実行していない。利用者自身の再確認はまだ。
- 証跡：test-results/procedure-status-hints-{synthetic,lint,build}.log。commit/push/PR/本番/DB変更なし。
