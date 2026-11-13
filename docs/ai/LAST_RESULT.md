# LAST_RESULT: corporate-filing-choice (2026-11-13)

- 変更：コードCORP_TAX_RETURNのみ、最初の入口を「どう進めますか？」の標準select（placeholder「進め方を選ぶ」、既存form-selectの下向きシェブロン、高さ44px以上）に置換。選択肢は3つ。
  - 税理士にお願いする：「顧問税理士に、申告の依頼をしてください。」「必要な書類と提出予定日を確認しましょう。」のみ。連絡先/送信/担当割当/保存/完了の表示なし、リンク・ボタンなし。
  - 自分で電子申告する：既存electronicFilingEntryの検証済みe-Tax案内/法人ログインリンクと既存の注記（ソフト必要の場合あり）＋短い1文。missing/unavailable/不正URL/null（非税カテゴリ）は明示表示でリンクなし。新規URLなし。
  - どうすればいいか相談する：buildRoadmapNextActionの既存安全リンクを「相談先の案内を開く」で表示（リンク元表示、PR198の渋谷補正を継承）。リンク不可は既存の「リンクは未登録です。/リンクを確認中です。」のみ。未確認/関連ページ注記は維持。
- 初期表示は黒い公式案内CTAも電子申告パネルも出さない。提出先未確定の注意（submissionGuidance）は選択前でも常時表示。下部の提出先/参考/担当/完了の流れは不変。担当欄は従来のまま（選択は表示のみ、保存しない）。
- 他の手続き（CORPORATE_TAX_RETURN等の別コード含む）は既存の次の一歩/電子申告表示のまま。AnnualRoadmapViewでCORP_TAX_RETURNの重複ElectronicFilingEntryを回避。選択状態はkey（pathname＋companyId＋手続きID＋期限）で画面/会社/年度ごとに独立・初期化（effect内setStateなし）。管理/共有画面は同じ案内、書込なし。
- ソース：src/lib/corporateFilingChoice.ts（新規・純粋関数）、src/components/CorporateTaxNextAction.tsx（新規）、RoadmapNextAction.tsx（label/headingの任意propのみ追加）、AnnualRoadmapView.tsx（分岐・key）。試験：corporateFilingChoice.test.ts（新規）、playwright/verify-home-read-safety.mjs（合成CORP_TAX_RETURN追加）。
- 試験：純粋node 27件成功（新規7＋roadmapNextAction/submissionLinkSafety/electronicFilingEntry既存）。HOME_NAV_UI_ONLY=1の合成画面（own3118）成功：admin/shared両方で3選択肢、初期状態、他手続き不変（別コードは電子申告unavailable、WITHHOLDING_TAXはready）、未登録/不正/NTA補正、再読込/画面遷移で初期化、3年度の独立、書込0、外部リクエスト0、375px/desktopの初期/自分で/相談スクリーンショット（test-results/corporate-filing-choice-*.png）、JSON：corporate-filing-choice-summary.json。最終lint成功（既存警告1件のみ。途中で追加した未使用変数警告は除去済み）。webpackビルド成功。
- 制限：(1) キーボードでのselect確定（ArrowDown+Enter）はヘッドレスmacOSで確定できずUNVERIFIED。フォーカス表示と枝の表示はselectOptionで確認。実機での確認はCodex/目視に残る。(2) 会社切替は実際の切替ではなく再読込/共有画面遷移とkey設計で担保。(3) CONSUMPTION_TAX_RETURNは合成プロファイルでロードマップに出ないため、他手続きの対照にWITHHOLDING_TAXを使用。(4) 初回の失敗ログ（キーボード）：test-results/corporate-filing-choice-e2e-failed-keyboard-run.log。
- 最終修正：試験内の未使用const adminSelectをEditで除去し、lintのみ再実行（ログ：test-results/corporate-filing-choice-lint-final.log）。実際の警告は1件（WorkspaceGrowthView.tsx:144、既存・対象外）。ブラウザー/ビルドは再実行なし（前回成功のまま、変更は未使用変数の除去のみ）。
- プレビュー用fixture：playwright/fixtures/CorporateFilingChoicePreview.tsx。実際のCorporateTaxNextActionを静的な合成CORP_TAX_RETURN（e-Tax登録、NTA渋谷の確認済み正URL）で表示し「合成データ／本番ではありません」を明示。データ取得/認証/API/保存なし。Codexがtrial-environmentのapp/src/app/trial/corporate-filing-choice/page.tsxへコピーして、実機キーボード（UNVERIFIED分）を確認する用途。本番ルートは作成していない。
- AGENTS.mdはnext dev追記分のみをネイティブEditで除去し、元ファイルと一致を確認済み。commit/push/PR/本番/DB操作なし。停止。
