# LAST_RESULT: procedure-completion-guide（2026-11-12、Claude Code）

基点 df2368b。commit/push/PR/公開はしていない（Codex担当）。

## 変更
- 新規 `src/lib/procedureCompletionGuide.ts`：コードだけで分類する純粋関数。
  申告のみ（DEPRECIABLE_ASSET_TAX_RETURN）2行／申告＋納付（法人税・消費税・地方税3申告）3行／それ以外は
  「まず、担当者にこの2つを確認」＋2つの質問（SYNTHETIC_TAX・源泉・未知コード・情報不足を含む）。
- 新規 `src/components/ProcedureCompletionGuide.tsx`：非操作の静的リスト。状態/保存/通信なし。
- `AnnualRoadmapView.tsx`：旧 `guide.completion` の1行を新コンポーネントに差し替え＋import。
  管理/一般/共有は共通のため同じ表示。既存の分類・trialActionGuide・注記・保存は変更なし。
- `playwright/verify-home-read-safety.mjs`、`docs/PROCEDURE_COMPLETION_GUIDE.md` を追加/更新。

## 試験（ログ: test-results/completion-guide-*.log）
- 対象unit 4件成功（申告のみ／申告＋納付と既存canPlanTaxPayment一致／未知・SYNTHETIC_TAX・詐称／情報不足）。
- `HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs`：PASS（ローカル合成、本番呼出0）。
  3種を375pxで表示、リスト件数、ガイド内input/button/aが0、旧長文なし、既存「完了」注記あり、横溢れなし、
  書込回数不変。合成共有URL（b×64）でも申告のみの2行リストとinput/button/a 0を確認。
  スクリーンショット：test-results/completion-guide-{unconfirmed,filing_only,filing_and_payment}.png。P02/P03も通過。
- `npm run lint`：エラー0、既存Growth警告1のみ。
- `npm run build -- --webpack`：成功（実行前に.next/devを.next/dev.bak-*へ退避）。3118は残存なし、3130は未操作。

## 後始末
- next buildがAGENTS.mdへ追記した10行を、元内容（test-results/AGENTS.orig.md）との接頭辞一致を確認して削除。
  AGENTS.md/CLAUDE.mdの差分なし。

## 未確認・限界
- 一般（利用者）画面は共通コンポーネントの構造確認のみで、実画面は未試験。
- キーボード操作は、ガイドが非操作（フォーカス対象なし）であることの確認にとどまる。
- 全障害ループ・実本番の目視は未実施。全手続きの完了条件は確定していない（資料に明記）。
- 目視（スクリーンショットの見た目確認）はCodexへ。
