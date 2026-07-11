# CLOSED_BETA_DAY1_RUNBOOK.md — クローズドβ初日実行手順（Sprint44）

[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)・[BETA_TEST_CHECKLIST.md](BETA_TEST_CHECKLIST.md)の
内容を、**運営者がそのまま実行できる初日限定の手順**に絞ったもの。詳細な理由・背景は両ドキュメントを参照。
本ファイルは「何を・どの順番でやるか」だけに徹する。

前提: βテスター1名・テスト会社1社から開始する（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)
3節の1〜3名・1〜5社という範囲の最小構成）。

---

## 初日実行手順（10ステップ以内）

1. **事前確認**: [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 16節のチェックリスト
   （Vercel本番デプロイ・環境変数・Supabase migration適用状況・RLS有効化・バックアップ設定）を
   運営者自身の目でSupabase Dashboard / Vercel Dashboardから確認する。あわせて`workspace_companies`に
   存在する「株式会社REINE」（本セッションが作成したものではない）をβ対象に含めるか除外するか確認する
   （[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 0節）
2. Supabase Dashboard → **Authentication → Users → Add user** でテスターのSupabase Authユーザーを
   作成する（メール＋パスワード、または招待メール）
3. Supabase Dashboard → **SQL Editor** で`admin_users`へ登録する:
   ```sql
   INSERT INTO admin_users (email, name) VALUES ('<テスターのメール>', '<氏名>')
   ON CONFLICT (email) DO NOTHING;
   ```
4. テスターに`/admin/login`のURLとログイン情報を共有し、**実際にログインできることを本人に確認してもらう**
5. テスト会社を1社登録する（`/admin/workspaces/new`。運営者が代行してもよいし、テスター本人に
   最初の操作として依頼してもよい）。作成者は自動的に`owner`として登録される（追加のSQL操作は不要）
6. Company Profile（`/admin/workspaces/{id}/profile`）とTax Return Profile
   （`/admin/workspaces/{id}/tax-returns`）を1件ずつ試しに入力してもらう
7. Roadmap・Procedure Status（`/admin/workspaces/{id}/roadmap`）・Documents
   （`/admin/workspaces/{id}/documents`）・Dashboard（`/admin/workspaces/{id}`、通知センター含む7区画）
   を一通り操作してもらう（住民税特別徴収がRoadmapに出てこない旨を聞かれた場合は、既知の制約
   （Procedure Master未登録、Engineの不具合ではない）である旨を案内する）
8. Share（`/admin/workspaces/{id}/share`）でリンクを1件発行し、ログインしていない別ウィンドウで開いて
   会社概要・年間ロードマップのみ表示される（AI参謀・通知・意思決定が含まれない）ことを一緒に確認する
9. [BETA_TEST_CHECKLIST.md](BETA_TEST_CHECKLIST.md)一式と[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)
   （週次回収用）をテスターに送付し、週次フィードバックのサイクル（毎週◯曜日締切、等）を合意する
10. 問い合わせ窓口・重大障害時の連絡手段（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 20節）を
    テスターと相互に確認し、初日を完了とする

---

## 初日の終わりに確認すること

- [ ] テスターが自力でログイン・基本操作（Profile保存・Roadmap閲覧・ステータス変更）を一通り行えた
- [ ] 重大障害（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節）に該当する事象が
      発生していない
- [ ] 次回フィードバック回収日をカレンダーに登録した

## 想定外の事態が起きた場合

- ログインできない・データが保存できない等の機能不全 → [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)
  15節「障害時の切り戻し」を参照
- 他社データが見える等のセキュリティ事象 → 同ドキュメント22節の重大障害・停止条件に従い、直ちに対応する
