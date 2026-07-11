# CLOSED_BETA_LAUNCH_PLAN.md — クローズドβ launch計画（Sprint42）

**ステータス: 計画・ドキュメント整備のみ。コード変更・DB変更・migration作成は行っていない。**
実コード・現行画面・migration・認証導線を直接確認した上で書く（0節）。実装上の軽微な修正が
必要と判明した箇所は、この計画内で実施せず別途提案する（末尾「β前に別途提案する軽微修正」参照）。

対象読者: SUNBOOをβ提供する運営側（この計画の実行者）。テスター向けの実行手順は
[BETA_TEST_CHECKLIST.md](BETA_TEST_CHECKLIST.md)、週次フィードバック様式は
[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)を参照。

---

## 0. 前提として確認した既存事実（実コード・認証導線の確認結果）

- **管理者アカウントのサインアップ画面は存在しない。** `src/app/admin/login/page.tsx`は
  `signInWithPassword`のみで、新規登録フォームが無い。新しい管理者を追加するには
  **(a) Supabase Dashboard（Authentication → Users）でユーザーを作成し、(b) `admin_users`テーブルへ
  `INSERT`する**、という2ステップが必須（`supabase/admin_schema.sql:90`にコメントアウトされた
  `INSERT INTO admin_users`の例がある通り、SQL Editorでの手動操作が前提の設計）
- **`workspace_members`への割り当てにも専用UIが無い。** アプリコード全体で`workspace_members`を
  参照するのは`WorkspaceCompanyForm.tsx`（新規会社作成時、作成者本人を自動的に`owner`登録する）
  のみであり、**既存の会社に別の管理者を追加する手段はSupabase SQL Editorでの直接`INSERT`しかない**
  （4段階権限モデル・招待UIは`docs/ROADMAP.md`が「未実装」と明記している通り、現時点でも未実装）
- **会社（Workspace）の削除UIはSprint43で実装済み。** `/admin/workspaces/{id}`の「危険な操作」
  区画（`WorkspaceDeleteButton.tsx`）から、そのWorkspaceの`owner`のみが会社名を確認しながら削除できる
  （確認ダイアログ必須、RLSの`member_delete`ポリシーによりowner以外は実行してもDBレベルで拒否される
  二重防御）。**テスト終了後のデータ削除は、まずこのUIを第一手段とする**（24節）。UIが使えない場合
  （例: owner権限を持つ管理者アカウントが既に無効化されている等）のみ、Supabase SQL Editorでの
  直接`DELETE`を代替手段として使う
- **全ての`workspace_*`テーブルは`workspace_companies`への`ON DELETE CASCADE`を持つ**
  （`workspace_company_profiles`・`workspace_members`・`workspace_share_links`
  （`migration_workspace_mvp.sql`）・`workspace_procedure_statuses`
  （`migration_workspace_procedure_statuses.sql`）・`workspace_documents`
  （`migration_workspace_documents.sql`）・`workspace_tax_return_profiles`
  （`migration_workspace_tax_returns.sql`）、いずれも実ファイルで確認済み）。**`workspace_companies`を
  1行削除するだけで関連データは連鎖的に消える**（13節）
- **アプリ内フィードバック・問い合わせ機構は存在しない。** `src/lib/analytics.ts`に
  `feedback_link_clicked`というイベント名が定義されているが、実際にこれを発火させるUI（フィードバック
  リンク）はコードベースのどこにも実装されていない。**β期間中の問い合わせ・フィードバック収集は
  アプリ外（メール等）で行う前提とする**（14節・20節）
- **`src/lib/analytics.ts`は開発環境でのみ`console.debug`するスタブであり、本番で外部計測サービスへ
  送信する経路は無い**（コード内コメント「TODO: 実際の計測サービスと接続する際は…」）。**β期間中、
  アプリケーション独自の利用ログは事実上収集されない**（19節）
- **[V1_RELEASE_CANDIDATE_REVIEW.md](V1_RELEASE_CANDIDATE_REVIEW.md)（Sprint40）・
  [Sprint41 Beta Polish](../CLAUDE.md)で洗い出された既知の制約・技術的負債は、本計画の
  「既知の制約」（23節）にそのまま引き継ぐ**（新しい調査をやり直さない）
- **本セッションはVercelの実行プラン・Supabaseの契約プランを確認できない**（過去のセッションと同様の
  制約、[NOTIFICATION_DELIVERY_ARCHITECTURE.md](NOTIFICATION_DELIVERY_ARCHITECTURE.md) 0-2節と同じ
  理由）。16節の確認項目は「運営側が着手前に自分で確認すべき」チェックリストとして提示する
- **Sprint44時点で、本セッションが作成していない「株式会社REINE」という会社が`workspace_companies`に
  存在することを確認した。** これがβ対象として使う会社なのか、無関係の既存データなのかは運営者のみが
  判断できるため、削除・変更は一切行わず**運営者確認待ち**として扱う（β開始前に、この会社をβ対象に
  含めるか除外するかを確認すること）

---

## 1. β版の目的

**実際の税理士・会計事務所にSUNBOOのCompany Workspaceを試用してもらい、実務で使える水準か・
何が不足しているかを実データに近い環境で検証する。** 新機能追加は目的にしない。既存機能
（Sprint22〜41で実装済み）の実務適合性の検証が主眼。

## 2. βテスト対象者

- 想定: 顧問先を持つ税理士・会計事務所のスタッフ（`admin_users`＋`workspace_members`の権限モデルが
  最初から想定している利用者像、`PROJECT_CONTEXT.md`「想定ユーザー」と同じ）
- 対象者は運営側（この計画の実行者）が個別に依頼・選定する。SUNBOO側からの一般公募は行わない
  （クローズドβ）

## 3. 必ず明記する運用条件

| 項目 | 内容 |
|---|---|
| **対象人数** | 1〜3名 |
| **対象顧問先数** | 1〜5社（Workspace） |
| **β期間** | 2週間 |
| **本番データ利用可否** | 原則不可。テストデータを基本とし、テスターが希望する場合のみ限定的な実データ利用を認める（17節） |
| **テストデータ推奨方針** | 架空の会社名・実在しない資本金/決算数値を用いる。既存の`SUNBOOテスト会社`のような命名規則を踏襲する |
| **フィードバック回収頻度** | 毎週（2週間で計2回、[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)使用） |
| **重大障害時の対応** | 即停止（22節で定義・手順を明記） |

---

## 4. 利用開始手順（全体フロー）

```
① 管理者アカウント発行（Supabase Dashboard + SQL、5節）
        ↓
② /admin/login でログイン確認
        ↓
③ 顧問先（Workspace）登録（/admin/workspaces/new、7節）
        ↓  ── 作成者は自動的にowner登録される（追加作業不要）
④ 複数人で同じ会社を担当する場合のみ：workspace_membersへの追加割り当て（6節）
        ↓
⑤ Company Profile入力（8節）→ Tax Return Profile入力（9節、任意）
        ↓
⑥ Roadmap確認（10節）→ Procedure Status操作（11節）→ Documents操作（12節）
        ↓
⑦ 必要に応じてShareリンク発行（13節）
        ↓
⑧ Dashboard（通知センター/AI Adviser/Decision）で日々の運用確認（14節）
```

## 5. 管理者アカウント発行手順

1. Supabase Dashboard → **Authentication → Users → Add user** で、テスターのメールアドレスを使って
   ユーザーを作成する（パスワードを運営側で設定して個別に伝えるか、招待メールを送る方式のいずれか。
   Supabase標準機能の範囲内で完結する、アプリ側の実装は不要）
2. Supabase Dashboard → **SQL Editor**で以下を実行する:
   ```sql
   INSERT INTO admin_users (email, name)
   VALUES ('tester@example.com', '担当者名')
   ON CONFLICT (email) DO NOTHING;
   ```
3. テスターに`/admin/login`のURLとログイン情報を共有し、ログインできることを確認してもらう
   （ログインできれば`/admin`のダッシュボードが表示される。`admin_users`未登録の場合は
   「このアカウントには管理画面へのアクセス権限がありません」というメッセージで`/admin/login`に
   差し戻される——`src/proxy.ts`の挙動、正常に機能する）

## 6. workspace_membersへの割り当て手順

- **新規に会社を作成する場合は追加作業不要**——`WorkspaceCompanyForm.tsx`が作成者自身を
  自動的に`role='owner'`として`workspace_members`に登録する
- **既存の会社に別のテスターを追加する場合**（例: 事務所の複数人で同じ顧問先を担当する）は、
  Supabase SQL Editorで直接`INSERT`する（0節の通りUIが無いため）:
  ```sql
  INSERT INTO workspace_members (company_id, email, role)
  VALUES (<company_id>, 'tester2@example.com', 'member')
  ON CONFLICT (company_id, email) DO UPDATE SET role = EXCLUDED.role;
  ```
  `role`は`owner`（会社設定・メンバー管理・編集・閲覧）／`member`（編集・閲覧）／`viewer`（閲覧のみ）
  の3値（`migration_workspace_access_control.sql`）。事務所の主担当には`owner`、補助担当には
  `member`を推奨する
- `<company_id>`は`/admin/workspaces`一覧の会社名クリック後のURL（`/admin/workspaces/{id}`）の
  `{id}`部分、または`SELECT id, name FROM workspace_companies;`で確認する

## 7. 顧問先登録手順

`/admin/workspaces/new`から、会社名・都道府県・市区町村・法人種別・決算月を入力して登録する
（`WorkspaceCompanyForm.tsx`）。**対応エリアは東京都渋谷区・福岡県全域のみ**（`PROJECT_CONTEXT.md`）。
対応エリア外の市区町村は市区町村セレクトが「未対応のエリアです」と表示され選択できない
——β期間中はこの制約内でテストデータを選ぶよう案内する。

## 8. Company Profile入力

`/admin/workspaces/{id}/profile`（`WorkspaceProfileForm.tsx`）で、法人種別・決算月・設立日・
資本金・従業員数・会社ステージ・消費税ステータス・インボイス登録状況・源泉所得税の納付サイクル・
顧問税理士の有無の10項目を編集できる。**`taxationMethod`等の一部項目はこのフォームからは編集できない**
（23節「既知の制約」）。

## 9. Tax Return Profile入力

`/admin/workspaces/{id}/tax-returns`（`WorkspaceTaxReturnsView.tsx`）で決算のたびの申告実績を
登録する。**Sprint41で削除操作に確認ダイアログを追加済み**（誤操作防止）。**源泉所得税の納付実績欄は
記録のみでState・Roadmapに反映されない旨がフォーム内に明記されている**（23節）。

## 10. Roadmap確認

`/admin/workspaces/{id}/roadmap`（`AnnualRoadmapView.tsx`）で今年度から今後2年分の手続き予定を
確認する。「推定」「情報不足」タグが表示される項目は、Company Profile・Tax Return Profileの
入力状況によって内容が変わりうる旨を案内する。**`at_establishment`/`hiring_event`/`event_based`
（法人設立届出書等）はRoadmapに一切表示されない既知の制約がある**（23節）。

## 11. Procedure Status操作

Roadmap上の各手続きに「未着手／進行中／完了／保留」のステータスをプルダウンで設定できる
（出現回単位、Sprint31・32で確立済み）。テスターには「実際の対応状況をこまめに更新してほしい」と
案内する（Dashboard・Notification Centerの精度に直結するため）。

## 12. Documents操作

`/admin/workspaces/{id}/documents`（`WorkspaceDocumentsView.tsx`）で定款・登記簿謄本・
各種申告書の登録状況（未登録／登録済み／要更新）を管理する。**ファイルアップロードはスコープ外
（メタデータのみ）**——実ファイルを添付する機能は無い旨をテスターに事前に案内する。

## 13. Shareリンク発行

`/admin/workspaces/{id}/share`（`WorkspaceShareLinksPanel.tsx`）で経営者への共有リンクを発行できる
（ログイン不要、閲覧専用、会社概要・年間ロードマップのみ共有）。**Sprint41で「共有リンクに有効期限が
無い」旨の注意書きを追加済み**。**失効操作には確認ダイアログが付いている**（Sprint41）。
**β版では匿名共有リンクに通知センター・AI Adviser・Decisionの内容を一切含めない**（既存の
`get_shared_workspace_view`RPCが`company`/`profile`/`statuses`のみを返す設計を維持し、変更しない）。

## 14. Dashboard / AI Adviser / Decision / Notification確認

`/admin/workspaces/{id}`（ホーム）に、通知センター・今日やること・期限警告・意思決定・進捗サマリー・
AI参謀・会社概要の7区画が表示される（Sprint37までに実装済み）。**通知センターは画面内表示のみ**
——メール・Slack・LINE等の外部push配信は未実装（Sprint38・39は設計のみ）。テスターには「Workspaceを
開いたときに見える情報」であることを明確に伝える。

---

## 15. 障害時の切り戻し

- コード起因の障害（デプロイ後の不具合等）: Vercelの**Deploymentsから直前の正常デプロイへ
  即座にロールバック**する（Vercel標準機能、Next.jsアプリ側の追加対応は不要）
- DB起因の障害（migration適用ミス等）: 直近のmigrationファイルの内容を確認し、影響範囲が
  局所的であれば該当テーブルのみ手動修正、広範であればSupabaseのPoint-in-Time Recovery
  （契約プランに依存、16節で契約状況を要確認）を検討する
- **いずれの場合も、切り戻し中はテスターに状況を共有し、対象顧問先への案内・新規操作を一時停止する**
  よう依頼する（22節の停止条件と連動）

## 16. Supabase / Vercelの確認項目（着手前チェックリスト）

**本セッションからは実際の契約プラン・デプロイ状態を確認できないため、運営側が着手前に必ず
自分で確認すること。**

- [ ] Vercel: `main`ブランチの最新コミット（本計画時点で`e906388`以降）が本番にデプロイ済みであること
      （過去に「pushし忘れて本番が古いコミットのまま」という事故が実際に発生している、
      `docs/ARCHITECTURE.md`記載）
- [ ] Vercel: Project Settingsに`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`が
      正しく設定されていること（17節）
- [ ] Supabase: `supabase/`配下の全migrationファイルが本番プロジェクトに適用済みであること
      （特に直近の`migration_workspace_tax_returns.sql`・`migration_workspace_access_control.sql`・
      `migration_workspace_procedure_statuses_occurrence.sql`）
- [ ] Supabase: 対象テスターの`admin_users`登録・`workspace_members`割り当てが完了していること
      （5節・6節）
- [ ] Supabase: バックアップ設定（自動バックアップ・Point-in-Time Recoveryの可否）を契約プランで
      確認すること（15節の切り戻し手順に直結する）
- [ ] Supabase: RLSが全`workspace_*`テーブルで有効になっていること（`ALTER TABLE ... ENABLE ROW
      LEVEL SECURITY`が全migrationに含まれることはコードレビュー済みだが、実際にSupabase側で
      有効化されているかは本番環境で目視確認すること）

## 17. 環境変数

| 変数 | 用途 | β版での要否 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase接続先 | 必須 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase匿名キー | 必須（全クライアントがこのキーのみを使用、`service_role`キーは未導入） |
| `RESEND_API_KEY`（`.env.local.example`にプレースホルダあり） | 将来のメール配信 | 不要（Notification Delivery未実装、Sprint39設計のみ） |
| `STRIPE_SECRET_KEY`等 | 将来の決済機能 | 不要（未着手） |

**β版では`NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`の2つ以外、新しい環境変数を
追加する必要はない。**

## 18. 個人情報・税務情報の取り扱い

- Company Profile・Tax Return Profileは資本金・売上高・従業員数等の機微な経営情報を扱う
  （`CLAUDE.md`が定める「行政手続きの情報を見る／自動生成するサービス」の範囲内ではあるが、
  実データを扱う以上は慎重な取り扱いが必要）
- **3節の通り、原則テストデータを使用する。** テスターが実在の顧問先データを入力したいと希望する
  場合は、**事前に運営側とテスター双方で合意した上で**、その顧問先への説明・同意取得はテスター
  （税理士・会計事務所）側の責任で行うこととする
- **SUNBOOはβ時点で正式な利用規約・プライバシーポリシー・データ処理契約（DPA）を持たない**
  （本セッションで確認した範囲に該当ドキュメントは存在しない）。実データ利用を本格化する場合は
  **エンジニアリング作業ではなく法務面の整備が別途必要**であることを明記し、本計画のスコープ外
  として扱う
- 共有リンク（13節）は誰でもURLを知っていれば閲覧できる設計のため、機微情報を含む共有リンクの
  URLを不用意に転送しないようテスターに周知する

## 19. β期間中に収集するログ

- **アプリケーション独自の利用ログ・分析基盤は存在しない**（0節）。β期間中の実態把握は
  以下の代替手段による:
  - 週次フィードバック（[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)、定性的）
  - Supabase側のテーブル行数・更新日時の目視確認（例:
    `SELECT company_id, COUNT(*) FROM workspace_procedure_statuses GROUP BY company_id;`で
    実際にステータス操作が行われているかを確認できる）
  - Vercel・Supabaseそれぞれの標準プラットフォームログ（アクセスログ・エラーログ、アプリ固有の
    加工はされていない）
- **β終了後にアプリ独自の利用状況を分析したい場合は、`src/lib/analytics.ts`の実装（現状スタブ）を
  別Sprintで本接続する必要がある**——本計画では着手しない

---

## 20. 問い合わせ対応方法

**アプリ内に問い合わせ・フィードバック機構は無い（0節）。** β期間中は以下の運用とする。

- 運営名義: SUNBOO β運営
- 正式窓口: 業務用メールアドレス
- 補助窓口: LINE等
- 対応時間: 平日9:00〜18:00
- 重大障害（22節）: 即時連絡

## 21. フィードバック収集項目

詳細な様式は[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)を参照。収集する主な観点:

- 機能別の実務適合度（Company Profile／Tax Return Profile／Roadmap／Dashboard／Notification／Share）
- 23節「既知の制約」が実務上のブロッカーになっているか
- UI/UXで分かりにくかった点（[V1_RELEASE_CANDIDATE_REVIEW.md](V1_RELEASE_CANDIDATE_REVIEW.md)の
  指摘事項が実際に体感されるか）
- 「この機能があれば使い続けたい」という追加要望（ただしβでは実装しない、26節参照）

---

## 22. 重大障害の定義・β停止条件

### 重大障害の定義

以下のいずれかに該当する事象を「重大障害」と定義する。

1. **他社（他Workspace）のデータが閲覧・編集できてしまう**（RLS破綻、データ漏洩）
2. **ログインができない、または管理画面全体にアクセスできない**（サービス停止）
3. **保存したはずのデータが消失・上書きされる**（データ整合性の破綻）
4. **Company Profile・Tax Return Profile・Procedure Status等の保存操作が継続的に失敗する**
5. **共有リンクのトークンが第三者に推測・総当たりされ、他社の情報が閲覧可能になる**

### β停止条件

- 上記いずれかを検知した場合、**即座に対象顧問先への案内・新規操作の依頼を停止する**
- 特に1・5（データ漏洩系）を検知した場合は、原因究明が完了するまで**全テスターのアクセスを
  一時停止する**ことも検討する（`admin_users`から該当行を一時削除する等）
- 2週間の期間終了時点で重大障害が0件であれば、25節・26節の判断基準に従い次のステップを判断する

---

## 23. β版で利用禁止・未対応とする機能（既知の制約）

以下は本計画で必ず明記する既知の制約（ユーザー指定の最低限リストに、
[V1_RELEASE_CANDIDATE_REVIEW.md](V1_RELEASE_CANDIDATE_REVIEW.md)・Sprint41で確認済みの追加事項を含める）。

| 制約 | 詳細 | 参照 |
|---|---|---|
| withholdingTaxCycleは保存のみでState未反映 | 源泉所得税の納付実績を入力しても、年間ロードマップ・Dashboardには反映されない | Sprint41、`WorkspaceTaxReturnsView.tsx`に注意書き済み |
| Shareリンク期限設定UIなし | 発行した共有リンクは失効操作を行うまで無期限に有効 | Sprint41、`share/page.tsx`に注意書き済み |
| 外部push通知なし | メール・Slack・LINE・Web Pushはいずれも未実装（設計のみ） | Sprint38・39 |
| Accounting連携なし | freee/MF等の会計データ連携は未着手 | `ARCHITECTURE_REVIEW_SPRINT28.md` 9-2節 |
| 設立時手続きの一部制約 | `at_establishment`/`hiring_event`/`event_based`の手続きがRoadmapから除外される | `src/lib/roadmap.ts:58-63` |
| Company Profile一部項目は未編集 | `taxationMethod`等はWorkspace UIから編集できない | `WorkspaceProfileForm.tsx:13-16` |
| 匿名共有リンクに通知・AI Adviser・Decisionを含めない | 共有ページは会社概要・年間ロードマップのみ（意図的な設計） | `get_shared_workspace_view`RPC |
| workspace_members管理はSQL手動操作が必要 | 既存会社への管理者追加にUIが無い（会社作成時の自動owner登録を除く） | 本ドキュメント6節 |
| Change Interview（矛盾検知）はWorkspace側未実装 | (site)側の`detectMismatches`相当がWorkspaceには無い | `WorkspaceTaxReturnsView.tsx`コメント |
| 対応エリアが東京都渋谷区・福岡県全域のみ | それ以外の市区町村は選択不可 | `PROJECT_CONTEXT.md` |
| 住民税特別徴収は未実装 | 毎月納付・普通徴収に関するProcedureがProcedure Masterに1件も登録されていない。Engineの不具合ではなくデータ未登録が原因。実装する場合は毎月納付と納期の特例（年2回）をセットで設計する必要がある（納期の特例は`roadmap.ts`内の源泉所得税専用ハードコード分岐の拡張を伴うため、Procedure追加だけでは完結しない） | Sprint44調査、`docs/PROCEDURE_MASTER_AUDIT.md` |

---

## 24. テスト終了後のデータ削除手順

### 第一手段: Workspace削除UI（Sprint43実装済み）

対象会社の`owner`としてログインし、`/admin/workspaces/{id}`の「危険な操作」区画から
「『会社名』を削除する」を実行する。会社名を確認しながらの操作・確認ダイアログ必須で、
削除後は自動的に`/admin/workspaces`へ遷移する。`workspace_companies`の削除により、
`workspace_company_profiles`・`workspace_members`・`workspace_share_links`・
`workspace_procedure_statuses`・`workspace_documents`・`workspace_tax_return_profiles`は
既存の`ON DELETE CASCADE`ですべて連鎖削除される（0節で確認済み）。**通常はこのUIで完結し、
SQL操作は不要。**

### 代替手段: Supabase SQL Editor（UIが使えない場合のみ）

owner権限を持つアカウントが既に無効化されている等、UIから削除できない場合に限り、
Supabase SQL Editorで以下を実行する。

```sql
-- 削除対象の確認
SELECT id, name, created_at FROM workspace_companies ORDER BY created_at DESC;

-- 会社（Workspace）を1件削除する。連鎖削除される点はUI削除と同じ。
DELETE FROM workspace_companies WHERE id = <company_id>;
```

### テスターアカウントの無効化（任意）

テスター自身のアカウントもβ終了後に無効化する場合は、追加で以下を行う（β終了後も継続関係が
続く場合は不要）。

```sql
DELETE FROM admin_users WHERE email = 'tester@example.com';
```

Supabase Dashboard → Authentication → Usersから該当ユーザーを削除することも合わせて検討する
（`admin_users`から削除するだけでも`/admin`へのアクセスは遮断されるため、Auth側のユーザー削除は
必須ではない）。

---

## 25. 成功指標

- 全テスター（1〜3名）が最低1社のWorkspaceを実際に作成し、Company Profile・Roadmap・Dashboardを
  一通り操作できた
- 重大障害（22節）が期間中0件
- 週次フィードバックで「実務の一部として使い続けたい」という定性的な肯定的反応が得られる
- 23節「既知の制約」が実務上の致命的なブロッカーとして報告されない
  （報告された場合は26節の判断に反映する）

## 26. 次Sprintへの判断基準

| 結果 | 次の判断 |
|---|---|
| 重大障害0件・継続利用意向あり | [V1_RELEASE_CANDIDATE_REVIEW.md](V1_RELEASE_CANDIDATE_REVIEW.md) 24節「v1.0で実装すべき項目」に着手する |
| 軽微な不満はあるが致命的でない | 該当項目を24節の優先順位表に反映し、順次対応するSprintを計画する |
| 23節の制約が実務上のブロッカーと判明 | 該当制約の解消を最優先タスクとして次Sprintの計画に組み込む |
| 重大障害あり、または「実務では使えない」という評価 | 該当領域（Engine境界・データモデル等）を設計段階からやり直す。拡大βへは進まない |

---

## β前に別途提案する軽微修正

実コード確認の過程で見つかった、コード変更を伴う軽微な改善候補。

- `workspace_members`の追加・一覧をUIから行えるようにする（現状SQL手動操作、6節）。β規模
  （1〜5社）では許容範囲だが、テスター自身がSQL操作を行うことは想定していないため、運営側が
  代行する前提である旨をチェックリストに明記する
- ~~会社（Workspace）の削除をUIから行えるようにする~~ → **Sprint43で対応済み**（24節）
- ~~`loading.tsx`/`error.tsx`の追加~~ → **Sprint43で対応済み**
