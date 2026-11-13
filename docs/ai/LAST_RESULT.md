# LAST_RESULT: roadmap-next-action（2026-11-13、Claude Code）

基点 d701a3e。実装担当はcommit/push/PR/公開をしていない。Codexが差分確認とPR/CI/公開を担当。

## 変更
- `src/lib/roadmapSubmissionInfo.ts`：純粋な`buildRoadmapNextAction`を追加。既存のURL選択/管轄判定は不変。
  リンク切れ・既知404・http(s)以外・認証情報付きは主要リンクにしない。未登録と「登録あるが使えない」を区別。
- `src/components/RoadmapNextAction.tsx`（新規、読み取り表示のみ）：手続き名の直後・電子申告入口の前に黒い主要リンク1つ。
- `src/components/AnnualRoadmapView.tsx`：入口を追加、重複する「実行先」段落を削除、
  長い提出先noticeのみ「提出先の確認ポイント」（native details、初期閉）へ。窓口名/提出方法/既存リンクは維持。
- `src/lib/roadmapNextAction.test.ts`（新規）、`playwright/verify-home-read-safety.mjs`、`docs/ROADMAP_NEXT_ACTION.md`。
- 保存/DB/期限/税務判定/権限/課金の変更なし。

## 試験（ログ: test-results/next-action-*.log、各1回）
- unit 6件成功（未確定/公式/関連/未確認/未登録/切れ・不正を区別）。
- `HOME_NAV_UI_ONLY=1 node playwright/verify-home-read-safety.mjs`：PASS（ローカル合成、既存P02/P03・提出先・一般・共有ケース含む）。
  管理・共有で主要リンク1つ、黒背景白文字、タイトル<リンク<電子入口の順、Tab到達とフォーカス表示、
  375px/desktopで横溢れ・文字切れなし、noticeは初期閉でEnter開閉、操作後の書込回数不変。
  公式/未確認/関連/リンクなし/既知404の各状態も確認。実外部サイトへのアクセスなし（hrefのみ検証）。
- `npm run lint`：エラー0、既存警告1。`npm run build -- --webpack`：成功。
- 画像：test-results/next-action-{mobile,desktop,unavailable}.png。

## 後始末
- Nextが追記したAGENTS.mdのブロックをnative Editで削除し、元（test-results/next-action-AGENTS.orig.md）と一致を確認。
- 3118は停止確認。3130は未操作。

## 未確認・限界
- 一般（利用者）画面の実画面は未試験（共通コンポーネントの構造確認のみ）。本番目視、全障害ループは未実施。
