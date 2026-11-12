# LAST_RESULT: trial-tax-check-input-guidance（2026-11-11、Claude Code）

基点 743ea8b。commit/push/PRはしていない（Codex担当）。

## 変更
- 新規 `src/components/TaxCheckInputHelp.tsx`：「法人税の申告時期を確認する画面です。」＋
  「決算日と申告した日を入力してください。」「申告済みの決算がある場合だけ入力してください。」
- `ExecutionPanel.tsx`：上記を先頭に追加。既存の詳細summaryを
  「専門家向けの詳しい説明（チェックの対象）」へ改称。TAX_TRIAL_SCOPE本文は無変更。
  inputGuide/フォーム/onSubmit/実行ID/保存/再送停止は無変更。
- `playwright/verify-home-read-safety.mjs`：短い案内、詳細が閉じていること、キーボードで開いて
  TI_TAX_001/2023年4月1日/清算特則が読めること、選択値が保持されることを確認。
- `docs/TAX_CHECK_INPUT_GUIDANCE.md` 追加。

## 試験（ログ: test-results/tci-*.log）
- npm run lint：エラー0、既存Growth警告1のみ
- npx tsc --noEmit：成功
- HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs：PASS（ローカル合成データ、本番書込なし）
- npm run build -- --webpack：成功（実行前に.next/devをtimestamp別名へ退避、dev server不在を確認）

## 後始末
- next devが追記したAGENTS.mdの10行を、HEAD内容とのprefix一致を確認して`git checkout`で戻した。CLAUDE.mdに差分なし。
- 退避した.next/dev.protected-*は未コミット（.next配下）。

## 未確認
- 375px実機相当の目視スクリーンショットの新規確認はしていない（既存のscrollWidth検査は通過）。
- 公開前照合・CI・本番確認はCodex。
