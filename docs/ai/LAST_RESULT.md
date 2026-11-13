# LAST_RESULT: accountant-guidance-emphasis (2026-11-13)

- 基点f7af5e4。表示のみ：CorporateTaxNextAction.tsxの税理士案内で、view.linesを正規表現splitし「申告の依頼」「必要な書類」「提出予定日」の3語だけ`<strong className="font-semibold">`化。文言・2行構成・選択肢・他分岐・リンク・保存は不変。新規helper/ファイル/テストなし。
- 実行した確認：`npm run lint` エラー0、既存Growth警告1のみ。`npm run build -- --webpack` 成功。
- 証跡：test-results/accountant-guidance-emphasis-lint.log、accountant-guidance-emphasis-build.log。
- 未確認：実画面の太字表示（Codexが /trial/corporate-filing-choice で目視予定）。ブラウザ/純粋テストは未実行。commit/push/PR/本番/DB変更なし。
