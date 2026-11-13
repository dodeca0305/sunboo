# LAST_RESULT: select-discoverability (2026-11-13)

- 基点6f153b3。表示のみ：単一selectの常時視認性を強化。globals.css：select.form-select/form-input（multiple/size除く）に常時枠 #6b7280（:focus時は既存リングを維持）、有効時のみcursor:pointer（別セレクタ `:not(:disabled)`）、矢印色を #334155へ。既存のdisabled(not-allowed/opacity)・forced-colors auto・svg矢印/padding-right・multiple/sizeの規則は変更なし。通常のtext inputは不変。
- LinksTable.tsx：唯一のカスタムselectのclassNameのみ変更（form-select !w-auto max-w-full min-h-[44px] !py-1 text-xs font-semibold + 既存STATUS_BADGE）。border-0/rounded-full/outline-none等を除去。value/options/順序/onChange/disabled/API・保存は不変（ソース確認のみ。本番表・合成モックでの画面確認はしていない）。
- 試験拡張：verify-home-read-safety.mjs（selectArrows）。有効な単一selectの枠色/1px/cursor/矢印色/横溢れなし、合成の disabled=not-allowed+opacity0.65・multiple=矢印なし/pointerでない・text input枠が非強調、キーボードfocus時のリング、forced-colors auto、375px/desktop画像。選択肢・保存の既存試験は維持。
- 結果：`HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs`（own3118、合成）exit 0。画像 test-results/select-discoverability-{mobile,desktop}.png。lint エラー0・既存Growth警告1のみ。`npm run build -- --webpack` 成功（1回、重複キャッシュ問題なし、.next/dev退避不要）。
- AGENTS.md：dev起動の追記を原本prefix一致確認後、Editで除去済み（原本と同一）。原本退避 test-results/select-discoverability-AGENTS.orig.md。
- Codex確認：375px/desktop画像を目視、ローカル3130合成会社1の担当/状態の通常枠と矢印を実機で確認。保存操作なし、接続先/書込停止を維持。ソース上の44 select全て共通クラス使用。未確認：LinksTable実画面、全画面個別目視、他OS/ブラウザ。
- 証跡：test-results/select-discoverability-{synthetic,lint,build}.log。commit/push/PR/本番/DB変更なし。
