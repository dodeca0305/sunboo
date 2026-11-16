# LAST_RESULT: asset-document-drafts (Claude Sonnet/medium, manual)

基点 9cee384（codex/asset-document-drafts）。変更は指定6ファイルのみ（未commit）。push/PR/リリースはCodex担当。

## 変更
- `src/lib/depreciationDocumentDraft.ts`（新規・純粋モデル）: 検証（正の安全整数・正しい3桁区切りのみ・実在ISO日付/うるう年・対象年1989–2100・耐用年数1–100・最大100行・文字長/制御文字除去）、行追加/削除（安定ID）、`freezeInput`、`buildCompanySource`（市区町村までは住所不完全）、`findDepreciationDocuments`（償却資産申告書＋種類別明細書が両方「償却資産申告」に紐づくときのみ。対象年は既存期限の年、ホスト時計は不使用）、種類別集計（種類内/種類をまたぐ桁あふれは合計null＋要確認、未入力は0にしない、数量を掛けない）。判定・償却・税額計算なし。
- `src/lib/depreciationDocumentDraftExcel.ts`（新規）: 既存exceljs＋`buildExportFilename`。2タブ（種類別明細書（下書き）/償却資産申告書（下書き））。各タブに「下書き・提出用ではありません」。文字は文字列セル、数値/日付は検証済みのみ型付き、無効入力は入力文字＋行ごとの警告、空欄は空欄。全セル折り返し＋行高自動。前年/増減/所有者コード等は未記入と明記。
- `src/components/DepreciationDocumentDraft.tsx`（新規）: 初期は折り畳み（開く）。会社名/住所を「登録済み」で流用、代表者は空欄1つ。資産は全項目空欄で行追加/削除、即時プレビュー、未入力サマリー、所有確認は未確認が初期値。メモリのみ（storage/ネットワーク書込なし）。同期refロック＋スナップショット、出力中は全入力/開閉/追加削除/所有確認をdisabled、await後のunmount/会社切替は中止（旧会社ファイルを出さない）、失敗時は入力保持でインライン表示、object URLは10秒後/unmountでrevoke。
- `documents/page.tsx`: 取得済みの会社名・プロフィールの都道府県/市区町村/番地を渡すのみ。PageHeader直後に`key={companyId}`で配置。documents・profile・requiredDocuments取得済み、fiscalMonthあり、対象書類ありのときだけ表示。既存の取得失敗ガード/他コンポーネントは未変更。

## 確認（最終ソース）
- 対象unit: `node --test src/lib/depreciationDocumentDraft.test.ts` 18件 pass/0 fail（部分/不正/空欄と0、日付/うるう年、年、整数/桁あふれ（種類内・種類間）、桁区切り不正、複数種類・数量非乗算、追加/削除、住所不完全/完全、所有未確認、スナップショット、不正文字、書類特定、XLSX往復2タブ・型・式風文字列・空欄・合計一致・折り返し行高・ファイル名）。初回の行高期待値の誤り1件は期待値修正後に再実行（ソース不変）。ログ test-results/asset-document-drafts-unit.log。
- `npm run lint` returncode 0、`npx next build --webpack` returncode 0（Python subprocessで全ログ保存: asset-document-drafts-{lint,build}.log）。
- 合成UI QA（リポジトリ外ハーネス、webpack＋TSローダー、ビルド済みCSS、127.0.0.1の一時ポートのみ・終了済み、実アプリ/既存サーバー/本番なし）: 99 PASS / 0 FAIL。375/1280で、初期折り畳み、登録値の流用と番地不足、空欄/未選択、禁止文言なし、リンク/アップロードなし、コントロール高さ≥44・文字≥14px・横溢れなし、ラベル、入力/追加/削除/非乗算/プレビュー、二重クリック連打でダウンロード1件、ファイル名、XLSX(zip)、非GETリクエスト0、storage 0、pageerror 0。出力中のdisabled、遅延中の会社切替/unmountでダウンロード0件・状態リーク無し、取得失敗時のalert表示・入力保持・再試行可。ログ/画像 test-results/asset-document-drafts-{ui-qa.log,375.png,1280.png,error-375.png}。

## 最終見た目修正（componentのみ）
- 下書き表示は赤枠/赤字をやめ通常の薄い枠＋黒太字。未入力サマリーは `details`「未入力・要確認（N項目）」（初期閉、summary≥44px/14px、開くと全項目表示）。各行の警告も `details`「この資産の要確認（N項目）」（初期閉）。プレビューの未入力値表示は維持。
- 種類別集計は入力のある種類だけ表示。0件は「資産を入力すると、種類ごとに集計します。」。未分類/不完全はmissingと総合計「要確認」を維持。モデル/Excel/税務処理は不変（unit18は再実行なし）。
- 再実行（最終ソース）: lint returncode 0、`next build --webpack` returncode 0（*-final.log）。合成UI QA 125 PASS/0 FAIL（details初期閉・開いて全項目可読、バナー非赤、空集計文言、正常入力時に警告/missing無し、既存項目）。最初の4件FAILはQA側のセレクタ範囲誤り（select選択肢の文字を拾った）で、検査範囲を修正して再実行。ログ test-results/asset-document-drafts-ui-qa-final.log。初回99成功ログ/画像は *-initial-* として保護。
- 画像（架空データのみ）: test-results/asset-document-drafts-normal-{375,1280}.png（会社名・番地・代表者・資産1件・所有確認済みの正常時）、-collapsed-{375,1280}.png（初期閉パネル）、-{375,1280}.png（未入力あり）、-error-375.png。

## 限界
- 実アプリ画面（認証/Supabase）・実ブラウザのExcel表示は未確認（合成部品のみ、Chromiumのみ）。モデル/Excel不変のためunitは再実行せず、UI修正後のlint/build/UI QAは上記の最終ログで確認。
- node_modules symlink・current-task.json既存変更・3130/14330/3138は未操作。QA一時ファイルはscratchpad内。
