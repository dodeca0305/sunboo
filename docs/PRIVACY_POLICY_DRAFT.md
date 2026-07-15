# PRIVACY_POLICY_DRAFT.md — プライバシーポリシードラフト（Phase7「Legal Foundation」）

> **ステータス：ドラフト（Phase7「Legal Foundation」成果物）。法的助言ではない。**
> 本書は弁護士による正式レビュー前の**たたき台**であり、Version 1.0公開・Closed Beta実施に向けて
> 「実際にコードが何を取得・保存・送信しているか」を正確に棚卸しすることを目的とする。
> 個人情報保護法上の適法性・要件充足（第三者提供の同意取得方法、開示等請求への実務対応体制等）は
> 一切保証しない。**公開前に必ず弁護士のレビューを受けること。** レビュー待ちで停止する。

以下の記載は、[docs/DATABASE.md](DATABASE.md)・[docs/COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)・
[docs/ANALYTICS_STRATEGY.md](ANALYTICS_STRATEGY.md)・`src/lib/supabase.ts`・
`src/lib/supabase/browser.ts`・`src/lib/supabase/server.ts`・`src/lib/analytics.ts`を
本セッションで実際に確認した内容に基づく。断定できない箇所は`【要確定】`と明記する。

---

## 1. 取得する情報

本サービスは、利用形態によって取得する情報が異なる。

### 1-1. 匿名診断機能（`/start`・`/events`・`/profile`・`/roadmap`等、`(site)`配下）

- 会社の所在地（都道府県・市区町村）、法人の種類、従業員の有無、決算月、役員任期の有無等、
  診断に必要な入力項目
- **これらは利用者の端末（ブラウザ）のlocalStorageにのみ保存され、運営者のサーバー
  （Supabaseデータベース）には送信・保存されない。** 手続きマスタデータの取得（読み取り専用）
  にはSupabase匿名キーを使用するが、これは公開されている手続き情報を取得するためのものであり、
  利用者の入力内容を送信するものではない
- 氏名・メールアドレス・会社名等、利用者個人を特定できる情報の入力欄はこの機能には存在しない

### 1-2. Company Workspace機能（`/admin/workspaces`配下、税理士・会計事務所スタッフ向け）

ログイン（Supabase Auth、メールアドレス）した上で、以下の情報をSupabaseデータベースへ
登録・保存する。

- ログイン用メールアドレス（`admin_users`、`workspace_members`）
- 顧問先の会社名・所在地（都道府県・市区町村・住所）・法人の種類・従業員数・決算月・
  役員任期に関する日付（`workspace_companies`・`workspace_company_profiles`）
- 申告実績（決算日・申告日等、`workspace_tax_return_profiles`）
- 手続きの進捗ステータス（`workspace_procedure_statuses`）
- 発行した共有リンクのトークン（`workspace_share_links`）

### 1-3. 共有ページ（`/share/[token]`）

ログイン不要・閲覧専用。有効なトークンで開かれた際に、対応する会社の年間ロードマップ情報を
表示する。閲覧者（顧問先の経営者等）に関する情報は取得・保存しない。

---

## 2. 利用目的

取得した情報は、以下の目的にのみ利用する。

1. 診断結果・年間ロードマップの計算・表示
2. Company Workspace機能における顧問先情報の管理、Excel/PDF出力、共有リンクの発行
3. 問い合わせ対応（`/help`ページの`mailto:`リンク経由で任意に送られた場合のみ）
4. サービス改善のための利用状況の把握（3節「Analyticsイベント」参照）

上記以外の目的（第三者への販売、本人の同意なきマーケティング利用等）には利用しない。

---

## 3. Analyticsイベント

[docs/ANALYTICS_STRATEGY.md](ANALYTICS_STRATEGY.md)で整備した利用状況計測の仕組み
（`src/lib/analytics.ts`の`trackEvent()`）について、現状を正確に記載する。

- **記録するイベント**：`company_created`（顧問先登録）、`profile_completed`（プロフィール保存）、
  `roadmap_generated`（ロードマップ表示）、`procedure_status_changed`（ステータス変更）、
  `pdf_exported`／`excel_exported`（出力）、`share_created`／`share_opened`（共有リンク発行・閲覧）、
  `event_registered`（イベント登録）、`feedback_link_clicked`（問い合わせリンククリック）
- **記録する項目**：イベント名・発生時刻（ISO 8601）・数値の`workspace_id`/`company_id`のみ。
  会社名・氏名・メールアドレス・入力された税務データ・手続き名等の内容は一切記録しない
- **現状の送信先：外部への送信は行っていない。** 開発環境でのブラウザコンソールへの出力
  （`console.debug`）のみで、本番環境では何もしない no-op として動作する
  （[docs/ANALYTICS_STRATEGY.md](ANALYTICS_STRATEGY.md) 4節）
- **将来の外部接続【要確定】**：PostHog・Google Analytics・Mixpanel等の外部計測サービスへの
  接続は、現時点では未実施。接続する場合は、接続先・取得項目の見直し・本ポリシーの改訂・
  Cookie同意バナーの要否（4節）を接続前に必ず行う

---

## 4. Cookie

- **匿名診断機能（`(site)`配下）**：Cookieを一切使用しない。手続きマスタデータの取得は
  Supabase匿名キーによるAPI呼び出し（`src/lib/supabase.ts`）であり、Cookieベースのセッションを
  持たない
- **Company Workspace機能（管理画面ログイン）**：Supabase Auth（`@supabase/ssr`、
  `src/lib/supabase/browser.ts`・`src/lib/supabase/server.ts`）によるログインセッションの
  維持のためにCookieを使用する。この用途は「サービスの提供に必要なCookie」であり、
  広告・トラッキング目的のCookieではない
- **広告・マーケティング目的のCookie・第三者Cookieは使用していない**
- 【要確定】Cookie同意バナーの要否は、個人情報保護法・電気通信事業法上のCookie規制の
  適用範囲を弁護士に確認した上で判断する。本ポリシー時点では「ログインに必須なCookieのみ」
  という整理で運用している

---

## 5. 第三者提供

1. 法令に基づく場合を除き、取得した情報を本人の同意なく第三者に提供しない。
2. 以下は「第三者提供」ではなく「委託」として扱う（本サービスの基盤として利用しているため）。

| 委託先 | 用途 | 保存場所 |
|---|---|---|
| Supabase（データベース・認証基盤） | データベース（PostgreSQL）・認証（Supabase Auth）の提供 | 【要確定：Supabaseプロジェクトのリージョン設定を確認】 |
| Vercel（ホスティング） | アプリケーションのホスティング・実行 | 【要確定：Vercelのデプロイリージョン設定を確認】 |

3. 共有リンク（`/share/[token]`）を通じて顧問先の経営者へロードマップ情報を開示する行為は、
   利用者（税理士・会計事務所スタッフ）自身の判断で行う情報共有であり、運営者による
   第三者提供には該当しない【要確定：この整理で法的に問題ないか要確認】。

---

## 6. 安全管理措置

1. データベースへのアクセスは、Supabaseの行レベルセキュリティ（RLS）により制御している。
   全テーブルにRLSを設定し、匿名キーでの書き込みを制限する方針を採っている
   （[docs/DATABASE.md](DATABASE.md)、[CLAUDE.md](../CLAUDE.md)「DB変更時の注意」）。
2. クライアントが使用するAPIキーは匿名キー（`NEXT_PUBLIC_SUPABASE_ANON_KEY`）のみであり、
   全権限を持つservice roleキーはアプリケーションに組み込んでいない
   （[docs/V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §4で確認済み）。
3. 管理画面へのログインは、許可リスト（`admin_users`）に登録されたメールアドレスのみに
   制限している。
4. 【要確定】通信の暗号化（HTTPS）はVercel・Supabaseの標準機能により提供される想定だが、
   本セッションからは本番環境の設定を直接確認できない。
5. 【要確定】バックアップ・障害復旧体制は、Supabaseの契約プランに依存し、
   [docs/LAUNCH_OPERATIONS.md](LAUNCH_OPERATIONS.md) §3の通り本セッションからは確認できない。

---

## 7. 開示・訂正・削除等の請求への対応

1. 利用者は、自己に関する登録情報の開示・訂正・削除を求めることができる。
2. 現状、専用の請求フォームは存在しない。8節の問い合わせ窓口宛にメールで請求すること。
3. 【要確定】請求を受けてから対応するまでの期間・本人確認の方法は、正式なプロセスとして
   未整備。Version 1.0公開前に運用フローとして整理する必要がある
   （[docs/V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §3「法務」参照）。

---

## 8. お問い合わせ

本ポリシーに関するお問い合わせは、以下の窓口まで連絡すること。

- 現状の窓口：`sunboo.hasegawa@gmail.com`（`src/lib/contact.ts`の`FEEDBACK_EMAIL`と同一）
- 【要確定】個人アドレスのため、Version 1.0公開前に業務用アドレスへの切り替えを検討する
  （[docs/LAUNCH_OPERATIONS.md](LAUNCH_OPERATIONS.md) §1で既出の課題と同一。
  [docs/TERMS_OF_SERVICE_DRAFT.md](TERMS_OF_SERVICE_DRAFT.md)第9条と同じ課題を重複整備しない）

---

## 附則

- 制定日：【要確定】
- 最終改訂日：【要確定】

改訂履歴は[LEGAL_CHECKLIST.md](LEGAL_CHECKLIST.md)の「改訂履歴」項目で一元管理し、
本ファイル内には改訂ログを重複記載しない。

---

**本ドラフトは弁護士による正式レビューを受けていない。** 特に5節（第三者提供）・7節
（開示等請求への対応）は、個人情報保護法上の要件を満たすかどうかの法的判断を伴うため、
公開前に必ず弁護士のレビューを受けること。

レビュー待ちで停止します。
