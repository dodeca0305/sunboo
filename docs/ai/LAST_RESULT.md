# LAST_RESULT: registry-field-visual-integration (Claude Sonnet/medium)

## 変更（product 3ファイル）
- `src/components/RegistryFieldExample.tsx`（新規）: 表示専用の静的コンポーネント。`field: 'establishedDate' | 'capital'`。caption付きsemantic table（商号/会社成立の年月日/資本金の額、架空値）、「見本・架空・説明用」タグ、該当行のみ赤枠＋「この日付」/「この金額」、静的「入力例」、位置差の注意文。hooks/state/fetch/イベント/依存/globalCSSなし。三角・矢印なし。標準バナー（入力・保存不可）は本番に持ち込んでいない。
- `src/components/CompanyProfileFieldHelp.tsx`: `DetailsHelp`のshortTextを`RegistryFieldExample`に置換（常時表示）。元の詳しい説明は`<details>`内にそのまま維持。EmployeeCountHelp/OfficerChangeDateHelp/公開フォーム未変更。
- `WorkspaceProfileForm.tsx`: 資本金placeholderのみ `例: 5,000,000` → `例: 3,000,000`。入力/label/id/onChange/検証/保存系は未変更。
- 見本値は実フィールドの初期化・書込に使っていない。

## 確認
- lint 1回: `npm run lint` exit=0（test-results/registry-field-integration-lint.log）
- build 1回: `npx next build --webpack` exit=0（test-results/registry-field-integration-build.log）。標準turbo buildはCI側。
- QA（リポジトリ外スクリプト、react-dom/server＋ビルド済みCSS＋独立Chrome、file URLのみ、サーバー/業務書込なし。実EstablishedDateHelp/CapitalHelpを合成readonly入力と並べて描画）。
  - 1回目: 375/640/1280pxの表示検査は全PASS（横溢れ0、最小12px、赤枠は該当行のみ、バッジ枠内、見本/架空表記、見本内に操作要素0、HTTP/pageerror 0、summary初期閉・高44px）。ただし**failures=2**（「Space toggles」2件）。
  - 原因: QAスクリプトの検証式の誤り（`o===false?false:true`）。Enterで開いた後にSpaceで閉じるのは正しい動作だが、式が誤ってFAIL扱いにした。製品不具合ではない。
  - 修正: 式を `k==='Enter' ? o===true : o===false` に訂正、fail>0で`process.exitCode=1`を設定。1回目ログは証拠として `registry-field-integration-qa.first-run-harness-bug.log`（および元の `registry-field-integration-qa.log`）に保存。
  - 再実行は375pxのキーボード開閉・readonly入力保持・元説明保持のみ（表示/lint/buildは再実行せず）: failures=0、exit=0。Enter/Spaceで開→閉→開→閉を2箇所とも確認、readonly入力値（1999-09-09 / 12345）は開閉後も不変、元の詳しい説明文保持。
  - 証跡（test-results）: registry-field-integration-qa-375-keyboard-rerun.log, -375-open-rerun.png, -375-open.png, -375-closed.png, -640-closed.png, -1280-closed.png。
  - 注: 全体として「全PASS」ではなく、1回目は検証式の誤りで2 FAIL、訂正後の再検証でPASSの経緯。

## 限界
- 実フォーム全体の業務保存、実アプリ画面は未試験（静的表示のため）。marker表示はChromeでlist-item確認のみ（他ブラウザ未確認）。
- product source変更は上記3ファイルのみ。未commit。push/PR/リリースはCodex担当。current-task.jsonの既存変更とnode_modules symlinkは未操作。
