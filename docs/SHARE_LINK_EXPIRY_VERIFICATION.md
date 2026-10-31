# 共有リンク有効期限（2026-10-31）

## 作業元と保護

- 元コード: `/Users/zeirishihoujincross-border/Documents/GitHub/sunboo`
- 開始時HEAD: `72e40d7`。追跡ファイルの変更なし。未追跡の `sunboo-date-fix.zip` は保持。
- 元フォルダは編集せず、`Documents/ChatGPT/SUNBOO/sunboo` にGit履歴・ローカル設定を含むコピーを作成。
- 作業ブランチ: `codex/share-link-expiry`。
- `Documents/ChatGPT/SUNBOO/backups` にGit bundle・開始時status・未追跡ZIPを保存。エディタのメモリ内だけにある未保存バッファの内容は、このファイルコピーでは検証・保存できない。

## 要件と実装

- 発行画面に7日・30日・無期限を追加。初期値30日。
- 発行処理で `workspace_share_links.expires_at` にUTCのISO日時、または無期限の `null` を保存。
- 日数は発行時からの経過時間（1日=24時間）で計算。
- 既存の無期限リンクを維持。一覧に日本時間の期限・無期限・期限切れ・失効済みを表示。
- 期限ちょうどから無効。画面表示中も毎秒更新。期限切れ・失効済みリンクのコピーを無効化。
- 通信例外時にも発行中状態を解除し再試行可能。
- DBカラムと匿名公開RPCの期限判定は既存実装を利用。スキーマ変更なし。
- ビルドで検出した既存不具合も修正: `profile/tax-returns/page.tsx` の外部参照のない `detectMismatches` をページの公開exportから除外。処理内容は変更なし。

## 検証

- `npm test`: 357件すべて成功（追加の期限計算・境界値テスト5件を含む）。
- `npm run lint`: エラー0、既存の `WorkspaceGrowthView.tsx` の警告1件。
- `npm run test:e2e:share-link-expiry`: Playwrightで実コンポーネントを操作。Supabaseの認証・INSERT通信のみモック。本番DBへの書き込みなし。
  - 初期値30日、選択肢3つ、各選択肢の送信日時/nullと新規リンクの表示。
  - 既存の無期限リンク、期限切れ/失効済みのコピー無効化、表示中の期限切れ。
  - 発行失敗と再試行。
- スクリーンショット: `test-results/share-link-expiry.png`（架空のテストデータのみ）。
- 通常のTurbopackビルドは実行環境の内部ポート制限で失敗したため、`npm run build -- --webpack` で検証し成功。TypeScriptエラー0・全ルート生成完了。

## 残る環境確認

本番DBに対する発行・匿名アクセスの再検証とデプロイは行っていない。公開RPCの期限拒否は既存SQLで確認したもので、本作業のブラウザテストは本番DBを使用しない。既存の `npm run test:e2e:share-link-access` は管理者セッションとDBへの書き込みを伴うため、必要時に専用の検証環境で実行する。
