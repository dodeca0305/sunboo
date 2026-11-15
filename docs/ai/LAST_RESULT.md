# LAST_RESULT: profile-field-help-clarity (Claude Sonnet/medium)

## 変更（表示のみ・3ファイル）
- `src/components/CompanyProfileFieldHelp.tsx`: `EstablishedDateHelp` / `CapitalHelp` を追加（内部の小さな`DetailsHelp`）。常時表示は承認文言1文、下に初期閉の native `details/summary`「詳しく見る」（aria-label別）。既存の長い説明文は details 内にそのまま保持。summaryは flex 不使用（`min-h-[44px] py-3`、native marker維持）。
- `WorkspaceProfileForm.tsx`: import1行＋設立日/資本金の`FieldHint`2箇所のみ置換。入力ID/ラベル/state/保存/検証は未変更。EmployeeCountHelp/OfficerChangeDateHelp/公開フォームは未変更。

## 実行と結果
- `npm run lint`: 1回、error 0（無関係な既存warning1件: WorkspaceGrowthView）。
- `npx next build --webpack`: 1回、exit 0（log: test-results/profile-field-help-build.log）。標準build/CIは未実行。
- 合成レンダ（リポジトリ外スクリプト、実コンポーネント＋ビルド済み共通CSS、独立Chrome/playwright-core）: 初期は両details閉・短文のみ表示／summary computed display=list-item・高さ44px・▶マーカー目視確認／Enter・Spaceで開閉／開いて既存説明文あり／375px・1280pxで横溢れなし。証跡: test-results/profile-field-help-qa.log, profile-field-help-{375,desktop}-{closed,open}.png。

## 限界
- 実アプリ/サーバー/本番は未起動・未操作。永続テスト追加なし。実フォーム内での表示は合成のみ。
- 未commit。push/PR/リリースはCodex担当。docs/ai/current-task.jsonの既存変更とnode_modulesは未操作。
