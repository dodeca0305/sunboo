# LAST_RESULT: completion-flow-design（2026-11-12、Claude Code）

基点 58fac93（統合済みPR #194）。実装担当はcommit/push/PR/公開をしていない。Codexが別のPRで今回の表示変更を公開する。

## 変更
- `src/lib/procedureCompletionGuide.ts`：`CompletionStep`（title/condition/note）と`steps`を追加。
  見出しを「提出から完了まで」に。`lines`・コード分類・未確認の質問は不変。
- `src/components/ProcedureCompletionGuide.tsx`：箇条書きをやめ、大きい行動を余白で並べ（狭幅は縦）、
  native details/summary（初期閉）で「確認すること」から補足を開閉。未確認は従来の2質問表示。
- `src/lib/procedureCompletionGuide.test.ts`、`playwright/verify-home-read-safety.mjs`、
  `docs/PROCEDURE_COMPLETION_GUIDE.md`を更新。全体CSS・AnnualRoadmapView・DB/権限/通信の変更なし。

## 試験（ログ: test-results/completion-flow-*.log）
- 対象unit 4件成功。
- `HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs`：PASS（P02/P03含む、ローカル合成）。
  375px/desktop/共有で初期閉、クリック/Enter開閉、Tab移動、フォーカス、文字切れ・横溢れなし、
  確定した手続きのガイド内input/button/a/リスト/アイコン0、375px縦並び・desktop横並び、操作後の書込回数不変。未確認コードは従来の質問リストを保持。
- `npm run lint`：エラー0、既存警告1（set-state-in-effect）。`npm run build -- --webpack`：成功。
- 画像：test-results/completion-guide-{unconfirmed,filing_only,filing_and_payment,desktop}.png。

## 後始末
- Nextが追記したAGENTS.mdの10行をnative Editで削除。元（test-results/completion-flow-AGENTS.orig.md）と完全一致を確認。バックアップは未変更。
- 3118は停止確認。3130は未操作。

## 未確認・限界
- 一般（利用者）画面の実画面は未試験（共通コンポーネントの構造確認のみ）。
- 全手続きの完了条件は未確定。未確認コードは質問表示のみ。全障害ループ・本番目視は未実施。
