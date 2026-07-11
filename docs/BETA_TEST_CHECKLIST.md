# BETA_TEST_CHECKLIST.md — クローズドβ実行チェックリスト（Sprint42）

計画の背景・理由は[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)を参照。本ファイルは
**実際にβを開始・運用する際にそのままなぞって使う実行用チェックリスト**。

対象読者: 運営側（前半「開始前」「運営側の作業」）、テスター本人（後半「テスターに依頼する操作」）。
テスターにはこのファイルのうち該当セクションのみ抜粋して渡してもよい。

---

## A. 開始前チェック（運営側、Supabase / Vercel）

- [ ] `main`ブランチの最新コミットが本番Vercelにデプロイ済み
- [ ] Vercel Project Settingsに`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`が
      設定されている
- [ ] Supabase本番プロジェクトに`supabase/`配下の全migrationが適用済み
      （特に`migration_workspace_tax_returns.sql`・`migration_workspace_access_control.sql`・
      `migration_workspace_procedure_statuses_occurrence.sql`）
- [ ] 対象の全`workspace_*`テーブルでRLSが有効になっていることをSupabase Dashboard上で目視確認
- [ ] Supabaseのバックアップ設定（自動バックアップ／Point-in-Time Recoveryの可否）を確認済み
- [ ] 問い合わせ窓口（メール／チャット）を確定し、テスターに事前共有済み
- [ ] 重大障害発生時の緊急連絡手段（電話・チャット等）を確定済み

## B. 管理者アカウント発行（運営側、テスター1名につき実施）

- [ ] Supabase Dashboard → Authentication → Users で新規ユーザーを作成（メール＋パスワード、
      または招待メール）
- [ ] SQL Editorで`admin_users`へ登録:
      ```sql
      INSERT INTO admin_users (email, name) VALUES ('<email>', '<氏名>')
      ON CONFLICT (email) DO NOTHING;
      ```
- [ ] テスターに`/admin/login`のURLとログイン情報を共有
- [ ] テスター自身に`/admin/login`でログインできることを確認してもらう
      （ログイン後`/admin`のダッシュボードが表示されればOK）

## C. 顧問先（Workspace）ごとの初期設定（運営側 or テスター）

会社1件につき以下を実施する（対象1〜5社、繰り返す）。

- [ ] `/admin/workspaces/new`から会社を登録（会社名・都道府県・市区町村・法人種別・決算月）
      — 対応エリアは東京都渋谷区・福岡県全域のみ
- [ ] 作成者は自動的に`owner`として登録されることを確認（追加作業不要）
- [ ] 同じ会社を複数人で担当する場合のみ、SQL Editorで追加メンバーを登録:
      ```sql
      INSERT INTO workspace_members (company_id, email, role)
      VALUES (<company_id>, '<email>', 'member')
      ON CONFLICT (company_id, email) DO UPDATE SET role = EXCLUDED.role;
      ```

---

## D. テスターに依頼する操作（実際の試用フロー）

### D-1. Company Profile

- [ ] `/admin/workspaces/{id}/profile`を開き、法人種別・決算月・設立日・資本金・従業員数・
      会社ステージ・消費税ステータス・インボイス登録状況・源泉所得税の納付サイクル・
      顧問税理士の有無を入力し保存する
- [ ] 保存後「保存しました」の表示が出ることを確認する

### D-2. Tax Return Profile（決算実績）

- [ ] `/admin/workspaces/{id}/tax-returns`を開き、「新しい申告実績を追加」から1件登録する
      （対象年度・決算日は必須）
- [ ] 一覧に反映されることを確認する
- [ ] 「源泉所得税の納付実績」欄を入力しても、Roadmap・Dashboardには反映されない旨の注意書きが
      表示されていることを確認する（既知の制約、意図した挙動）
- [ ] 試しに1件削除し、**確認ダイアログが表示されること**・**キャンセルすると削除されないこと**を
      確認する

### D-3. Roadmap

- [ ] `/admin/workspaces/{id}/roadmap`を開き、今年度〜今後2年分の手続き予定が表示されることを
      確認する
- [ ] 「推定」「情報不足」タグが付いている項目があれば、Company Profile・Tax Return Profileの
      入力状況との関係を確認する
- [ ] 法人設立届出書等の設立時手続きが一覧に表示されない場合があることを確認する
      （既知の制約、意図した挙動）

### D-4. Procedure Status

- [ ] Roadmap上の手続きのステータス（未着手／進行中／完了／保留）を実際の対応状況に合わせて
      更新する
- [ ] 同じ手続きが複数回（毎月・毎年）出現する場合、出現ごとに個別のステータスを持てることを
      確認する

### D-5. Documents

- [ ] `/admin/workspaces/{id}/documents`を開き、定款・登記簿謄本・各種申告書のステータスを
      更新する
- [ ] ファイルアップロード機能が無い（ステータス管理のみ）ことを確認する

### D-6. Dashboard / 通知センター / AI Adviser / 意思決定

- [ ] `/admin/workspaces/{id}`（ホーム）を開き、通知センター・今日やること・期限警告・意思決定・
      進捗サマリー・AI参謀・会社概要の7区画が表示されることを確認する
- [ ] 通知センターの表示内容が、Procedure Status・Documents操作の結果と連動して変化することを
      確認する（例: 手続きを「完了」にすると該当の通知が消える）
- [ ] 通知はメール等では届かず、画面を開いたときのみ表示されることを理解した上で運用してもらう

### D-7. Share（共有リンク）

- [ ] `/admin/workspaces/{id}/share`から共有リンクを発行する
- [ ] 「共有リンクに有効期限は無い」旨の注意書きが表示されていることを確認する
- [ ] 発行したリンクをブラウザのシークレットウィンドウ等（ログインしていない状態）で開き、
      会社概要・年間ロードマップが閲覧できる（編集はできない）ことを確認する
- [ ] AI参謀・通知センター・意思決定の内容が共有ページに含まれないことを確認する（意図した挙動）
- [ ] リンクを「失効させる」を押し、**確認ダイアログが表示されること**・**キャンセルすると
      失効しないこと**を確認する
- [ ] 実際に失効させた後、同じリンクにアクセスすると「このリンクは無効か、有効期限が切れています」
      と表示されることを確認する

---

## E. 週次（毎週）

- [ ] [BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)をテスターに送付し回答を回収する
- [ ] 回収したフィードバックを確認し、[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)
      22節「重大障害の定義」に該当する報告が無いかを確認する
- [ ] Supabaseで各Workspaceのテーブル行数・更新日時を確認し、実際に操作が行われているかを
      把握する（例: `SELECT company_id, COUNT(*) FROM workspace_procedure_statuses GROUP BY
      company_id;`）

## F. 終了時（2週間後）

- [ ] 最終フィードバックを回収する
- [ ] [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 25節「成功指標」と照らして評価する
- [ ] 26節「次Sprintへの判断基準」に従い、次の対応方針を決定する
- [ ] テストデータの削除が必要な場合、同ドキュメント24節のSQLを実行する
- [ ] テスターアカウントを継続利用しない場合、`admin_users`からの削除・Supabase Auth側の
      ユーザー削除を検討する
