# LAST_RESULT — document-action-clarity-integration (Claude Code / Sonnet)

基点 dfa4665。ローカルのソース変更のみ（commit/push/PR/サーバー起動/本番操作なし）。

## 変更
- `src/lib/workspaceDocumentPresentation.ts`（新規）: 状態→次にすること（不明はnull）、期限→書類名で複製を並べ最も近い期限を主要/残りに分割。準備状況に依存しない。`buildWorkspaceRequiredDocuments`は未変更。
- `WorkspaceDocumentsView.tsx`: まず用意する書類（カード: 名前/使用する手続き/手続きの期限/準備状況select/次にすること）、`このあとに用意する書類（N種類）`（残り0なら非表示）、`定款など、手元の書類の記録`（初期閉・編集欄5件は常時マウント・件数・原本確認の注意・記録なしの注意）。不明状態は無効option「確認が必要」を表示し次にすることは出さない。保存処理/ロック/再読み込みリンクは未変更。次にすることは確認済みlocalRequiredStatusMapのみから導出。
- `WorkspaceDocumentEditor.tsx`: 表示のみ 未登録→記録なし / 登録済み→記録済み（保存値enum不変、要更新は維持）。操作要素のmin-h 44px。
- `documents/page.tsx`: 題名「書類を用意する」、長い案内を記録欄へ移動、`WorkspacePlanningSources`を主導線の後ろの閉じたdetails「登録情報を確認する」へ。取得失敗の分岐/読み取り専用表示は維持。エラー見出しを「書類の準備状況を取得できませんでした」に変更。
- 試験: `workspaceDocumentPresentation.test.ts`、`playwright/fixtures/document-action-integration.tsx`、`playwright/verify-document-action-integration.mjs`（バンドルはリポジトリ外の一時フォルダ）。

## 実行結果（実終了コード。全文はtest-results/document-action-integration-*.log）
- 単体 `node --test`（新helper+workspaceRequiredDocuments/DocumentData/DocumentTiming）: exit 0, 46 pass / 0 fail。
- 合成ハーネス（実View+実Editor、スタブauth/DB）: exit 0, 106 checks pass, HTTP/pageerror/consoleerror 0。空/取得不可/決算月なし/全件主要/グループ順/初期閉/保存成功・エラー・応答喪失・保存中ロック・操作者未確認/不明状態/下書き保持/enum保持/44px/375・デスクトップ横はみ出し0。スクショ: test-results/document-action-integration-{375,desktop,error,lost}.png。
- lint: exit 0（既存の警告1件 WorkspaceGrowthView、未変更ファイル）。
- `next build --webpack`: exit 0。標準turbo buildは実行していない（CIで確認）。

## 制限・未確認
- **ネイティブselectのキーボード(Space→ArrowDown→Enter)はheadless Chromeで値が変わらず**、ハーネスはLIMITATIONとして記録し以降はselectOptionで代替。キーボード合格とは扱わない（実Chromeでの確認が必要）。フォーカス到達のみ確認。
- documentsページ(サーバーコンポーネント)のdocuments===null分岐・details配置は、サーバーハーネスを起動していないためソース確認とbuildのみ。
- 既存のライブ回帰試験2本はCodex承認の範囲で互換更新済み・**未実行**（サーバー/3130/14330には触れていない）。`verify-document-load-failure.mjs`: 外側details用`expand`ヘルパーを`open`と再読み込み後の回復経路2か所に追加、エラー見出しを「書類の準備状況を取得」、件数を「1/5件記録済み」へ。`verify-home-read-safety.mjs`: 見出し「書類を用意する」、編集前に「定款など、手元の書類の記録」を開く。enum値（registered/not_registered）と失敗系・保護の検証は変更なし。確認は`node --check`2本（exit 0）とこの2本へのeslint（exit 0）のみ。実動作は未検証。
- モデル使用量の計測値は取得できず記載しない。
