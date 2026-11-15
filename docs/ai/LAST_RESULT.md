# LAST_RESULT: employee-count-visual-integration (Claude Sonnet/medium)

HEAD=baseSha c5180a7（codex/employee-count-visual-integration）で開始。変更は指定4ファイルのみ（未commit）。

## 変更
- `src/components/EmployeeCountExample.tsx`（新規）: 静的・表示専用（hooks/state/event/依存/globalCSSなし）。「架空の人数例」タグ、「会社が直接雇っている人を、1人ずつ数えます。」、正社員3人(人型3)＋パート・アルバイト2人(人型2)＝「入力例の合計」5人、「短時間の人も1人と数えます。」。人型は同寸のaria-hidden SVG（id無し）。常に縦積み（管理画面の列幅で横並びだと「パート・アルバイト」が折返すため）。
- `CompanyProfileFieldHelp.tsx`: `EmployeeCountHelp`に`visualExample`（既定false）を追加。true時は3段落をEmployeeCountExampleに置換し、既存の「この合計だけで…確定しない」注意を既存detailsの先頭へ移動（detailsはtext-sm、summaryはmin-h44/list-item）。既存の給与台帳/雇用契約書/専門家文言と年金機構リンクは維持。**employeeCount===0警告は両分岐でdetails外に常時表示**。既定（公開）分岐の本文・順序・text-xsは従来どおり。他のhelp/RegistryFieldExample未変更。
- `WorkspaceProfileForm.tsx`: `<EmployeeCountHelp ... visualExample />`のみ。入力/id/label/state/検証/保存は未変更。公開`profile/page.tsx`は未変更。見本の5を実値に使用しない。

## 確認
- `npm run lint` exit=0、`npx next build --webpack` exit=0（最終ソースで各1回。途中で2回ソース変更したため計3回ずつ実行: 初回ソース→text-sm修正→縦積み化。各回成功）。ログ test-results/employee-count-integration-{lint,build}.log。標準turbo buildはCI。
- QA（リポジトリ外スクリプト。実EmployeeCountHelp+EmployeeCountExampleをreact-dom/serverで静的描画＋ビルド済みCSS、独立Chrome、file URLのみ、サーバー無し）。visual/default×0/8を375/640/1280で検査: 116 PASS, failures=0, exit=0。
  - 確認項目: 横溢れ0、visual分岐の文字14px以上、人型3+2・同寸・aria-hidden・合計5人・架空表記・図内にinput/button/link/idなし、0警告はcount0のvisual/defaultで常時表示・count8で非表示、defaultに図無し＋原文3段落/注意/リンク保持、visualで注意文はdetails内のみ、summary list-item/marker/高さ≥44px、detailsは初期閉、375pxでEnter,Enter,Space,Space=開,閉,開,閉（期待true,false,true,false）、隣接readonly値(0/8)は開閉後も不変、HTTP/pageerror 0。
  - 途中の1回目QAで文字12px×6件FAIL: 原因は既存`text-xs`のdetails（図ではない）。visual分岐のみtext-smに修正し再検証でPASS（検査式の誤りではなく実際の表示指摘）。
- 証跡: test-results/employee-count-integration-*.png/.log。

## 編集方法・限界
- Codexが実行前に対象ファイル内の限定置換を許可し、依頼条件も更新済み。最初の本体編集はpython、以降はnative Edit/sedを使用。Codexが全差分を確認済み。
- 実アプリ画面・実フォーム保存・公開フォームの実描画は未試験（静的描画のみ）。他ブラウザ未確認。push/PR/リリースはCodex担当。current-task.jsonの既存変更とnode_modules symlinkは未操作。
