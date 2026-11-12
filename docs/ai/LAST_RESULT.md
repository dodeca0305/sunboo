# LAST_RESULT: home-first-step（2026-11-12、Claude Code）

基点 3e88fd5。commit/push/PRはしていない（Codex担当）。

## 変更
- 新規 `src/lib/workspaceFirstStep.ts`：第一歩の選択だけを行う純粋関数。
  順は 取得失敗 → 既存todayActions先頭がhigh → 必須未入力（先頭の入力欄へ深いリンク）→ 既存先頭1件 → 0件はロードマップ案内。
  `actionHrefFor` はDashboardから移して共用（挙動は変更なし）。
- 新規 `src/components/WorkspaceFirstStep.tsx`：会社見出しの直後に配置。リンク1つ。取得失敗時は再読み込みボタンのみ。
  ボタンの黒は `bg-sunboo-ink text-white` をこのボタンだけに指定。共通の `btn-primary` CSSは変更なし。
- `page.tsx`：第一歩を追加。PageHeaderのsubtitleを削除（第一歩と競合するため）。
  failedのalertは本文を維持し、再読み込みボタンは最上部へ集約。
- `WorkspaceDashboard.tsx`：必須未入力が第一歩のときだけ、home-missing-profile内の重複リンクを出さない。
  それ以外（highの急ぐ対応が先頭のとき等）は未入力カードとリンクを維持。
- `playwright/verify-home-read-safety.mjs`、`docs/HOME_FIRST_STEP.md` を更新・追加。

## 試験（ログ: test-results/home-first-step-*.log）
- 対象unit（workspaceFirstStep.test.ts）：8件成功
  （取得不可／必須未入力／既存high／high以外の先頭／正常先頭／0件／actionHref／別会社リンク）
- npm run lint：エラー0、既存Growth警告1のみ
- HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs：PASS（ローカル合成データ、本番書込なし）
  - 第一歩が今日やることより上、リンク1つ、CTAが初期画面内（デスクトップ/375px）
  - CTAの背景rgb(31,41,55)・文字白（computedStyle）、キーボード移動
  - 取得失敗で「取得できません」＋再読み込みのみ、復旧後に通常表示へ戻る
  - P02/P03（条件ブロック外）：未入力時にkind=profile、「入力を始める」から該当の入力欄へ移動
- npm run build -- --webpack：成功（実行前に.next/devを退避。起動中の3130はtrial-environment/appで別コピー、未操作）

## 後始末
- next devが追記したAGENTS.mdの生成ブロックを、元内容とのprefix一致を確認して削除。CLAUDE.mdに差分なし。
- .next/dev退避分は.next配下で未コミット。

## 未確認
- 3130（別コピー）や実環境での表示は未確認。
- スクリーンショット（test-results/home-first-step-*.png、profile-next-step-home.png）の目視はCodex。
- 全障害ループ・公開前照合・CI・本番確認は対象外／Codex。
