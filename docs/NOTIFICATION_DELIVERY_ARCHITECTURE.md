# NOTIFICATION_DELIVERY_ARCHITECTURE.md — 通知配送アーキテクチャ設計（Sprint39 Phase39.1）

**ステータス: 設計のみ。コード変更・DB変更・migration作成・package変更・画面変更は一切行っていない。**

対象: Notification Engineが生成した通知を、将来メール・Slack・LINE・Web Pushへ安全に配信するための
配送アーキテクチャ（Scheduler・Queue・Worker・Retry・Provider抽象化・権限・秘密鍵管理）を設計する。
実コード（`src/lib/workspaceNotifications.ts`・`workspaceDecisions.ts`・`workspaceAdvice.ts`・
`workspace_members`・アクセス制御migration・`WorkspaceDashboard.tsx`）と、現在のVercel/Next.js/
Supabase構成、[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md)（Sprint36）・
[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md)（Sprint38）を直接確認した上で書く。

---

## 0. 前提として確認した既存事実

### 0-1. Notification Engine・Settings（Sprint36〜38）からの継承事項

- **`buildWorkspaceNotifications`（`src/lib/workspaceNotifications.ts`、Sprint37）は完全にステートレスな
  純粋関数のままである。** 本設計はこの関数のシグネチャ・判定ロジックを一切変更しない。配送
  アーキテクチャは「この関数が返した`WorkspaceNotification[]`を、Settings（Sprint38設計）でフィルタした
  あとに、どうやって画面外へ運ぶか」だけを扱う
- **`WorkspaceNotification.id`は`category:occurrenceKey`（`Advice`由来）または
  `category:title:dueDate`（`Decision`由来、procedureId非公開のための代替キー）で組み立てられる**
  （`workspaceNotifications.ts:61-68`、[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md)
  9節で3層に整理済み）。Sprint38承認事項「Notification IDはoccurrenceKeyを最優先で安定化する」を
  そのまま引き継ぎ、配送ログ・dedupeキーにもこのIDをそのまま使う（新しい採番をしない）
- **[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 8-3節が既に「push配信の実現には
  Vercel Cron Jobs等の定期実行が必要」「これは『都度計算・保存しない』という既存Engine群の設計原則への
  唯一の意図的な逸脱」と整理していた。** 本設計はこの逸脱を具体的なアーキテクチャに落とし込む
- **[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 14節が、送信ログ
  `workspace_notification_log`を含む5テーブルの設計イメージを既に示していた（未実装）。** 本設計は
  これをベースに配送固有の要件（dedupeキー・provider・ステータス）を具体化する（6節）
- **同ドキュメント11節が「送信先解決は`workspace_members`のemailが唯一の情報源」と既に示していた。**
  ただしSlack/LINE/Web Pushは`email`だけでは宛先を表現できない（16〜19節で詳述、新たな登録先テーブルが
  必要になる）

### 0-2. 現在のVercel/Next.js構成（今回新たに確認した事実）

- **`vercel.json`は存在しない。Cron設定は一切無い。** `package.json`にもqueue/email/cron関連の
  依存は無い（`@supabase/ssr`・`@supabase/supabase-js`・`lucide-react`・`next`・`papaparse`・
  `react`のみ）
- **プロジェクトは「APIルートを作らない、Supabase-jsを直接呼ぶ」という原則を持つ**
  （[ARCHITECTURE.md](ARCHITECTURE.md)データ取得方針1）。**この原則は「フロントエンドがどうやって
  自分のデータを取得するか」という文脈で定められたものであり、Vercel Cronのような
  「システムがHTTPで叩く定期実行トリガー」は文脈が異なる。** Next.js App RouterでVercel Cronが
  呼び出せる対象はRoute Handler（`app/api/.../route.ts`）以外に無いため、**本設計で導入するCron
  トリガー用エンドポイントは、既存の「データ取得用APIルートを作らない」原則の例外ではなく、
  そもそも別カテゴリ（システムトリガー用ルート）として扱う**、という整理を明記する
  （2-3節で詳述。実装時にはCLAUDE.mdへの追記も検討事項として申し送る）
- **`src/proxy.ts`のmatcherは`/admin/:path*`のみ。** Cron用エンドポイント（`/api/...`配下）は
  この保護の対象外であり、別の認可機構（Vercelの標準パターンである`CRON_SECRET`ヘッダ検証）が
  必要になる（2-2節）
- **本セッション・過去のセッションいずれも`service_role`キーを保有していない**
  （[COMPANY_WORKSPACE_DB_AUDIT.md](COMPANY_WORKSPACE_DB_AUDIT.md) 冒頭「調査手段の制約」）。
  **`.env.local`・`.env.local.example`のいずれにも`SUPABASE_SERVICE_ROLE_KEY`は存在せず、
  プロジェクト全体を通じて`service_role`キーが一度も使われたことが無い。** 全クライアント
  （`src/lib/supabase.ts`・`supabase/server.ts`・`supabase/browser.ts`）は`NEXT_PUBLIC_SUPABASE_ANON_KEY`
  のみを使う
- **[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md) 0節が、経営者向け共有リンク（認証されていない
  訪問者への限定データ返却）を実現する際に「`SECURITY DEFINER`関数（RPC）をSupabase-js経由で
  呼び出す方式」を選び、「APIルート・`service_role`キーの露出のいずれも不要」と明記していた。**
  これは`get_shared_workspace_view`（Sprint24.0）として実装済みであり、`migration_workspace_access_control.sql`
  の`is_workspace_member`・`workspace_has_any_member`（Sprint33）も同じ`SECURITY DEFINER`パターンを
  踏襲している。**「ログインしていない/していないのに等しい呼び出し元に、限定された権限でDBアクセスさせる」
  という課題を、このプロジェクトは一貫して`SECURITY DEFINER`関数で解決してきた**、という事実は、
  Cron/Workerの認可設計（14節）に直接引き継ぐべき前例である
- **`.env.local.example`に、Phase 6以降の想定として`RESEND_API_KEY`（コメントアウト済み、未使用）が
  既に用意されていた。** これはメール配信プロバイダの候補としてResendが既に想定されていたことを示す
  一次情報であり、本設計のメールチャネル選定（16節）はこれを踏まえる
- **Vercelは常駐プロセスを持たないサーバーレス実行環境**（[ARCHITECTURE.md](ARCHITECTURE.md)）。
  **Vercel Cron Jobsの実行頻度・本数はVercelのプラン（Hobby/Pro等）に依存するが、現在のプロジェクトが
  どのプランかは本セッションから確認できない。** 実際の配信頻度要件を決める際は、実装着手前に
  プランの制約を確認する必要がある、と申し送る（検証なしの断定をしない）

---

## 1. 配信パイプライン全体像

```
generateWorkspaceDecisions / generateWorkspaceAdvice（既存、無変更）
                    │
                    ▼
      buildWorkspaceNotifications（Sprint37実装、無変更）
                    │
                    ▼
        WorkspaceNotification[]（Engineの出力、無変更）
                    │
                    ▼
   Settings Filter（Sprint38設計、未実装）
   ── Workspace既定値 → 個人上書き の順で解決し、カテゴリ/重要度/チャネルで絞る
                    │
                    ▼
   ═══════════ 本Sprintの設計対象（配送アーキテクチャ）═══════════
                    │
        ┌───────────┼────────────────────┐
        ▼                                 ▼
  画面内通知（既存、pull型）      Delivery Pipeline（push型、本設計）
  WorkspaceDashboard.tsxが         Scheduler → Worker → Provider抽象化 → 各チャネル
  都度計算・都度表示（無変更）      → Delivery Log（送信履歴・dedupe・retry）
```

**画面内通知と外部pushの関係（必ず決めること）**: 両者は別システムではなく、**同じ
`WorkspaceNotification[]`を入力とする2つの独立した「消費者（consumer）」**である。画面内通知は
Sprint37のまま「Route Handler/Server Componentが呼ぶたびに計算するpull型」であり続け、本設計は
これに触れない。外部pushは「Cronがトリガーする瞬間に同じ計算をもう一度実行し、Settings Filterと
Delivery Pipelineを通してから配信するpush型」という新しい消費者を追加するだけであり、**Engine
（Sprint36・37）にもSettings（Sprint38）にも新しい分岐や判断は増やさない**。

---

## 2. 案A/B/C比較：Scheduler/Worker基盤

### 2-1. 比較表

| | 案A: Vercel Cron + Next.js API Route + Supabase | 案B: Supabase Edge Functions + pg_cron | 案C: 外部Queue/Worker基盤 |
|---|---|---|---|
| **構成** | Vercel Cron JobsがRoute Handler（`/api/cron/notifications`等）を定時HTTP呼び出し。Route Handler内でSupabase-jsを呼び、送信まで完結させる | Supabaseの`pg_cron`拡張がDB内から定期的にEdge Function（Deno）を起動、または直接SQL関数を実行する | Cloud Tasks/SQS等の外部Queueに通知候補を積み、専用のWorker（Lambda等）が消費してメール等を送信する |
| **メリット** | 既存スタック（Vercel/Next.js/Supabase）だけで完結。新しい実行環境・新しい言語（Deno）を学ぶ必要が無い。Route Handler内は既存の`src/lib/`関数（Decision/Advice/Engine）をそのままimportして再利用できる | DB側で完結するため、Vercel側のCronプラン制約（0-2節）を気にしなくてよい。DBに近く、レイテンシが小さい | スループット・信頼性が最も高い。将来Workspace数が数百〜数千に増えても耐えられる |
| **デメリット** | 0-2節の通り、初のAPI Route新設を伴う（ただしシステムトリガー用として区別する、2-3節）。Vercel Cronのプラン制約次第で実行頻度に上限がある | `pg_cron`のセットアップ自体がSupabase側のSQL実行を要し、**このセッションが持つ`anon`キーだけでは設定できない**（0-2節、`service_role`同様ユーザー側の作業が必須）。Deno/Edge Functionsという新しい実行環境の学習コストが発生し、`src/lib/`のNode/TypeScript資産をそのまま呼べない（重複実装または移植が必要になる） | 新しい外部サービスの契約・監視・秘密鍵管理が増える。現在の実データ規模（Workspace数は実質2社、[前回セッションで確認済み](NOTIFICATION_ENGINE_DESIGN.md)）に対して明らかに過剰投資であり、CLAUDE.mdの「小さく作る」原則に反する |
| **運用コスト** | 低（追加の外部サービス無し、既存Vercel/Supabase契約内で完結） | 中（Supabase側の追加設定・監視項目が増える） | 高（別サービスの契約・運用・監視） |
| **障害時の挙動** | Route Handlerが例外を投げれば、そのCron実行回だけ失敗する（Vercel側にログが残る）。次回Cron実行時にリトライ相当の再試行が自然に起きる（7節） | Edge Function障害はSupabase側のログに残るが、Vercel側からは可視性が低く、監視の一元化が難しい | Queueが障害を吸収しやすい（メッセージが失われにくい）が、障害箇所がVercel・Supabase・外部Queueの3箇所に分散し、切り分けが複雑になる |
| **MVP適合性** | 高。既存コードの再利用が最大化でき、実装コストが最小 | 低。DDL実行がこのプロジェクトの開発フロー（Claude Codeセッション→ユーザーがSQL Editorで実行）と二重の手間になり、CLAUDE.mdの開発フローと相性が悪い | 低。現在の規模に見合わない |
| **将来性** | 中〜高。Workspace数が大きく増えるまでは十分にスケールする | 中。DB内完結のメリットはあるが、学習コスト・二重実装コストが将来も残り続ける | 高。ただし「今すぐ要る」規模になるまでは投資対効果が低い |

### 2-2. 推奨: 案A

現在の技術スタック（Next.js on Vercel + Supabase、[ARCHITECTURE.md](ARCHITECTURE.md)）に最も自然に
乗り、`src/lib/workspaceDecisions.ts`等の既存Engineをそのまま`import`して再利用できる。案Bは
DDL実行の手間が二重になる（0-2節でも確認した通り、このプロジェクトのマイグレーションは「Claude Codeが
SQLを書く→ユーザーがSupabase SQL Editorで実行する」フローを取っており、`pg_cron`の設定もこの
フローに乗るが、Edge Functions自体のデプロイ・言語移植という追加負担が発生する）。案Cは現状の
実データ規模に見合わない。

### 2-3. Vercel Cronエンドポイントの位置づけ（必ず決めること）

`/api/cron/notifications`（仮称）は、**「フロントエンドのためのデータ取得API」ではなく
「システム（Vercel Cronスケジューラ）専用のトリガーエンドポイント」として、既存の「APIルートを
作らない」原則とは別カテゴリのものとして扱う**。ブラウザから直接叩かれることを想定せず、
Vercelが送る`Authorization: Bearer <CRON_SECRET>`ヘッダ（Vercel標準パターン）を検証し、
一致しなければ即座に401を返す。実装時にはCLAUDE.mdの「データ取得の方針」節に、この例外を
明記する追記を検討事項として申し送る（本Sprintでは追記しない）。

---

## 3. Scheduler / Cron設計

- トリガー: Vercel Cron Jobsが`/api/cron/notification-digest`（仮称）を定時実行
- 頻度: MVPでは**1日1回**（10節でDigest通知中心に設計する理由と接続）。実際の頻度はVercelプラン確認後に決定（0-2節）
- 認可: `CRON_SECRET`（Vercel環境変数、後述17節「秘密鍵の管理方法」）
- べき等性: 同じCron実行が万一2重に走っても、送信ログのUNIQUE制約（6節）が実際の重複送信を防ぐ
  最終防波堤になる（Schedulerレベルでの二重起動防止に頼り切らない設計にする）

---

## 4. Queue設計（MVPでは「真のQueue」を導入しない）

現在の実データ規模（Workspace数が実質2社）では、SQS/Cloud Tasks等の専用Queueミドルウェアを導入する
運用コストに見合わない（2-1節）。**MVPでは「Cron実行のたびに全Workspaceを走査し、その場で送信まで
完了するバッチ処理」とし、Queueという独立したコンポーネントを持たない。**

将来Workspace数が増え、1回のCron実行時間内（Vercel Route Handlerには実行時間の上限がある）に
全社の処理が収まらなくなった場合の拡張ポイントとして、**送信ログテーブル
（`workspace_notification_log`、6節）自体が「処理済みマーカー」を兼ねる**設計にしておく——
1回のCron実行で全社を処理しきれなくても、次回の実行が「まだログに無い組み合わせ」だけを拾えば
自然に再開できる（真のQueueが無くても、送信ログが簡易的な処理状態管理を代替する）。

---

## 5. Delivery Worker設計

Route Handler内の処理フロー（設計イメージ）:

1. `CRON_SECRET`検証（2-3節）
2. 対象Workspace一覧の取得（14節：権限の再解決を都度行う設計）
3. 各社ごとに、既存の`loadWorkspaceRoadmapContext`等と同じ計算パイプラインを呼び、
   `generateWorkspaceDecisions`・`generateWorkspaceAdvice`・`buildWorkspaceNotifications`を
   **無変更のまま**再実行する（Engine自体はWorkerからもDashboardからも同じ関数を呼ぶ、という
   一貫性を保つ。Worker専用の計算ロジックを新設しない）
4. Settings Filter（Sprint38設計、`applyNotificationSettings`イメージ）を適用し、配信対象を絞る
5. dedupe/idempotencyチェック（9節）: 送信ログに同一キーが無いかを確認
6. Provider抽象化層（13節）経由でチャネルごとに送信
7. 成否を送信ログへ記録（6節）

**「重い処理をWorkerが1つのHTTPリクエストの中で全部やる」ことのリスク**（Vercelの実行時間上限）は
既知の制約として明記するが、4節で述べた通りWorkspace数が少ない現状ではMVPとして許容する。

---

## 6. Delivery Log（送信履歴）

[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 14節の`workspace_notification_log`を
配送アーキテクチャの要件で具体化する（実装時のイメージ、本Sprintでは作成しない）。

```sql
-- 実装時のイメージ。本Sprintではmigrationを作成しない。
CREATE TABLE workspace_notification_log (
  id                BIGSERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  notification_id   TEXT NOT NULL,     -- WorkspaceNotification.id（0-1節、新しい採番をしない）
  severity          TEXT NOT NULL,     -- 再送判定に使う（NOTIFICATION_SETTINGS_DESIGN.md 5-3節）
  channel           TEXT NOT NULL,     -- 'email' / 'slack' / 'line' / 'web_push'
  recipient         TEXT NOT NULL,     -- emailアドレス、またはSlack/LINE/WebPushの宛先識別子（16〜19節）
  status             TEXT NOT NULL,     -- 'sent' / 'failed' / 'bounced'（8節・11節）
  provider_message_id TEXT,            -- プロバイダ側の送信ID（バウンス追跡・監査用、11節）
  attempt_count      INTEGER NOT NULL DEFAULT 1, -- retry回数（7節）
  error_detail        TEXT,             -- 失敗時の詳細（25節の監査ログを兼ねる）
  sent_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, notification_id, severity, channel, recipient, (sent_at::date))
  -- 同じ通知・同じseverity・同じチャネル・同じ宛先には1日1回まで、という間引きをUNIQUE制約で表現する
  -- （RULE_ENGINE.mdの教訓「重複防止はUNIQUE制約＋具体的なconflict targetで機械的に保証する」を踏襲）
);
```

**「同じ通知を複数チャネルへ送る場合の記録単位」（必ず決めること）**: **1行 = 1(通知×チャネル×宛先)**
とする。1つの`WorkspaceNotification`をメールとSlackの両方に送る場合、送信ログは2行に分かれる。
理由: チャネルごとに成否が独立している（メールは成功したがSlackは失敗した、というケースを正しく
表現する必要がある）ことと、宛先（emailアドレス、Slackはチャネル単位、等）がチャネルによって
粒度が異なる（16〜19節）ため、1通知1行にまとめると成否・宛先の情報が失われる。

---

## 7. Retry・Backoff

- **retry回数: 最大3回**（送信失敗時、指数バックオフで再試行。1回目失敗→数分後に2回目→さらに後に
  3回目、という間隔を想定。具体的な秒数はプロバイダのレート制限次第で実装時に調整）
- **3回失敗した通知は「dead letter」として扱う**: 送信ログに`status = 'failed'`のまま記録し続け、
  **サイレントに削除・破棄はしない**（11節「失敗時に通知を捨てるか、再送するか」で最終結論）
- Retryは同一Cron実行内で完結させるのではなく、**次回以降のCron実行が「まだ`status = 'sent'`に
  なっていない候補」を再度拾う**という設計にする（Workerの実装を複雑にしない。Queueを持たない
  MVP構成（4節）と一貫させる）

---

## 8. Rate Limit

- プロバイダ側のレート制限（例: Resendの1分あたり送信数上限）に対しては、Worker側で
  `company_id`単位・全体単位の送信間隔を空ける簡易的なスロットリングを設計イメージとして持つ
  （具体的な数値は導入するプロバイダのプラン次第、実装時に決定）
- **現在の実データ規模（数社・1社あたり最大5件）では、Rate Limitが実際に問題になる可能性は低い。**
  本節は「将来Workspace数が増えたときに壁にぶつからないための設計上の備え」であり、MVPでは
  実測してから対応するという方針にする（憶測に基づく過剰な事前実装を避ける）

---

## 9. Idempotency・重複送信防止（必ず決めること）

- **delivery dedupe key = `(company_id, notification_id, severity, channel, recipient)` + 送信日**
  （6節のUNIQUE制約と同一）。[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 6節が
  既に整理した「重複表示防止（Engineの内部、時間軸なし）」と「送信済み判定（本設計、時間軸あり）」の
  区別をそのまま踏襲し、**送信直前に必ず送信ログを照会し、当日分の同一キーが既にあればスキップする**
- **severityの変化は新しい送信対象とみなす**
  （[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 5-3節）。dedupeキーに
  `severity`を含めているのはこのため——`medium`のholdが`high`に格上げされた場合、dedupeキーが変わり
  新しい送信として扱われる（見落とし防止を優先する）

---

## 10. 即時通知とDigest通知の分離（必ず決めること）

**MVPはDigest通知（1日1回まとめて配信）のみとし、即時通知（severity変化やcategory発生を検知した
瞬間に即座に送る仕組み）は実装しない。**

理由:
- 即時通知には「変化を検知する」ための追加の仕組み（前回計算結果との差分比較、または
  Webhookのようなイベント駆動のトリガー）が必要になり、Cronベースの単純なバッチ処理（3節・4節）
  では実現できない。これは`applyNotificationSettings`同様、Engineの外側に新しい状態管理
  （「前回はどうだったか」を覚えておく仕組み）を持ち込むことになり、設計・実装コストが
  Digestより大きく跳ね上がる
- 現在の通知量（最大5件/社）であれば、1日1回のDigestで実務上十分な速報性を確保できる
  （`high` severityの期限超過等も、翌日には確実に届く）
- v1.0以降、実際に「`high`だけは即座に知りたい」という要望が確認された場合、**即時通知は
  Digestとは別トリガー（例えば手続きステータス変更のタイミングでWebhook的に発火する等）として
  後から追加できる設計にしておく**（Delivery Worker・Provider抽象化層（13節）はDigest/即時どちらの
  トリガーからも同じインターフェースで呼べるようにする）

---

## 11. タイムゾーン・配信時間帯・休日

[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 7節の結論をそのまま継承し、
Cron実行との接続を具体化する。

- **タイムゾーン: JST固定**（7-1節の結論を継承。Cronのトリガー時刻自体はVercel側でUTC基準になる点に
  注意し、「JSTの朝◯時に送りたい」という要件がある場合はCron式（`cron`構文）をUTCへ変換して設定する
  ——これはVercel Cronの設定値の話であり、アプリケーションロジック側でタイムゾーン変換を持つ必要はない）
- **配信時間帯: Digest送信自体を「1日1回、決まった時刻」に固定するため、7-2節が想定していた
  「時刻ウィンドウ内かどうかの判定」はMVPでは不要になる**（Digestという配信方式そのものが、
  時間帯コントロールの簡易版を兼ねる）。即時通知（10節、v1.0以降）を導入する際に改めて必要になる
- **休日・営業日: 7-3節の結論を継承し、本Sprintでは設計しない**（v1.0以降、祝日カレンダーマスタの
  調達方法とあわせて再検討）

---

## 12. メール（16節: チャネル詳細①）

- **プロバイダ候補: Resend**（0-2節で確認した`.env.local.example`の既存想定を踏襲、新しい選定作業は
  行わない）
- 送信先解決: `workspace_members.email`をそのまま使う（[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md)
  11節、14節で詳述）
- 本文: Digest形式（1通に複数の`WorkspaceNotification`をまとめる）。件名は「◯◯社: 対応が必要な項目が
  N件あります」等、`WorkspaceDecisions.summary`（既存、無変更）をそのまま転用できる

---

## 13. Slack（17節: チャネル詳細②）

- Slackは`workspace_members.email`だけでは宛先を表現できない。**Incoming Webhook URLを会社ごとに
  1つ登録する（チーム全体が見るチャネルへ投稿する想定）**、という設計にする。個人宛DMではなく
  チーム共有チャンネルへの投稿が実務上自然なため
- 送信先は**Workspace単位**（`workspace_members`のようなメンバー単位ではない）——14節で導入する
  `workspace_notification_channels`（会社ごとのチャネル設定登録テーブル、設計イメージ）に
  Webhook URLを保存する想定

---

## 14. LINE（18節: チャネル詳細③）

- LINEは実装方式によって粒度が変わる: LINE公式アカウント経由のグループ通知（Slackと同じく
  **Workspace単位**）と、LINE Notify的な個人トークン（**メンバー単位**）の両方のパターンが
  存在しうる。**本設計ではどちらか一方に決め打ちせず、13節の`workspace_notification_channels`
  （会社単位）と、メンバー単位の設定（`workspace_member_notification_settings`、
  [NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 14節）の両方から参照できる
  設計にし、実装時にどちらの方式を採るか判断する**、と申し送る（時期尚早な断定を避ける）

---

## 15. Web Push（19節: チャネル詳細④）

- Web Pushはブラウザの「プッシュ通知の許可」を得た上で、デバイスごとの購読情報（Push Subscription、
  endpoint URL + 暗号鍵）を保存する必要があり、他の3チャネルと性質が大きく異なる（**必ずメンバー単位**、
  かつ**デバイス単位**——同じ人が複数のブラウザ/端末を使えば複数の購読が並行して存在しうる）
- 実装コストが最も高い（Service Workerの追加実装、ブラウザ許可UIのフロー設計が必要）。
  **対象ユーザー（税理士事務所スタッフ、既存の想定利用者像）にとって、メールで十分実務が回る
  可能性が高く、Web Pushの優先度は他チャネルより低いと判断する**（16節の推奨順序に反映）
- 実装する場合は`workspace_notification_push_subscriptions(company_id, email, endpoint, keys, created_at)`
  相当の新テーブルが必要になる（設計イメージ、20節「migrationが必要になる時点」で申し送る）

---

## 16. Provider抽象化（必ず決めること）

```ts
// 設計イメージ（コード未実装）
export interface NotificationChannelAdapter {
  channel: 'email' | 'slack' | 'line' | 'web_push';
  send(notification: WorkspaceNotification, recipient: string, context: DeliveryContext): Promise<DeliveryResult>;
}

export type DeliveryResult =
  | { status: 'sent'; providerMessageId: string }
  | { status: 'failed'; errorDetail: string };
```

**「provider変更時にEngineを触らない設計」（必ず決めること）**: `NotificationChannelAdapter`は
`WorkspaceNotification`（Sprint37のEngine出力そのもの）を受け取るだけの薄いインターフェースにし、
`workspaceNotifications.ts`・`workspaceDecisions.ts`・`workspaceAdvice.ts`のいずれもimportしない
（依存の向きは常にDelivery→Engineの一方向）。ResendからSendGridに乗り換える、SlackのWebhook形式が
変わる、といった変更は`EmailChannelAdapter`・`SlackChannelAdapter`の実装差し替えだけで完結し、
Engine・Settings・Worker本体のロジックには一切影響しない。

### 16-1. Provider障害時のフォールバック（21節）

**MVPでは、あるチャネルのProviderが落ちていても他のチャネルには影響させない**（Adapterごとに
独立して例外を捕捉し、1チャネルの失敗が他チャネルの送信をブロックしない設計）。**「メールが
失敗したらSlackに自動フォールバックする」といったチャネル間の代替ロジックは、本設計のスコープ外
とし、v1.0以降、実際にそのニーズが確認されてから設計する**（3節同様、判断ロジックを増やしすぎない）。

---

## 17. 秘密鍵・APIキーの管理方法（必ず決めること）

| 種類 | 保存場所 | 備考 |
|---|---|---|
| `CRON_SECRET`（Vercel Cron認可） | Vercel環境変数（`NEXT_PUBLIC_`プレフィックスを付けない、サーバー専用） | 2-3節 |
| メールプロバイダAPIキー（例: `RESEND_API_KEY`） | Vercel環境変数 | 0-2節で確認済みの既存プレースホルダをそのまま使う |
| LINE Messaging APIのchannel access token等、プロバイダ共通の鍵 | Vercel環境変数 | 全社共通で1つ |
| 会社ごとに異なる値（Slack Webhook URL、LINE個人トークン等） | DBの`workspace_notification_channels`（14節・13節） | プロジェクト共通の鍵ではないためVercel環境変数に置けない。将来的にSupabase Vault等での暗号化保存を検討（本Sprintでは方式決定しない） |
| （検討したが採用しない）`service_role`キー | — | 14節で詳述。第一候補は既存の`SECURITY DEFINER` + admin_users/workspace_members再利用方式であり、`service_role`キーの新規導入は次点の代替案とする |

**原則: プロジェクト全体で共通の鍵はVercel環境変数、会社ごとに異なる値はDBに保存する。**
`NEXT_PUBLIC_`プレフィックスの環境変数はブラウザに露出するため、Delivery関連の鍵には
**絶対に使わない**（既存の`NEXT_PUBLIC_SUPABASE_ANON_KEY`とは性質が異なることを明記する）。

---

## 18. 権限を失ったメンバーへ送らない仕組み・RLSとの関係（必ず決めること）

### 18-1. 送信直前に都度再解決する（スナップショットを持たない）

`workspace_members`の`role`は随時変更されうる（Sprint33のアクセス制御機能で管理者が編集可能）。
**Delivery Workerは送信先リストをキャッシュ・スナップショットせず、Cron実行のたびに
`workspace_members`を再クエリして「現在の」所属・roleを確認する**（[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md)
11節「role別の絞り込み」・個人上書きの解決と合わせて、送信直前の1回で完結させる）。これにより、
「昨日はmemberだったが今日削除された人にメールが届く」という事故を防ぐ。

### 18-2. Cron/WorkerがどうやってRLSの壁を越えて全社データを読むか

Worker（Route Handler）はブラウザセッションを持たないサーバー間処理であり、通常のSupabase-js呼び出し
（`anon`キー＋Cookieセッション）では`is_workspace_member`ベースのRLSを通過できない。0-2節で確認した
「このプロジェクトは`service_role`キーを一度も使っていない」という事実を踏まえ、以下の2案を比較する。

| | 案(a): システム管理者アカウント方式 | 案(b): `service_role`キー方式 |
|---|---|---|
| 概要 | `admin_users`に登録された専用の「システム」アカウント（Supabase Auth、email+password）を、Sprint33の`workspace_members`補完（既存の全社×全admin_usersにowner補完、`migration_workspace_access_control.sql` 2節）と同じ要領で全Workspaceの`member`として登録する。Route Handlerがこのアカウントで都度ログインし、通常の`anon`キー＋認証済みセッションとして各社のデータをRLS越しに取得する | Vercel環境変数に`SUPABASE_SERVICE_ROLE_KEY`を追加し、RLSを完全にバイパスしてクエリする |
| 既存パターンとの整合性 | 高い。既存の`admin_users`＋`workspace_members`のRLSモデルを一切拡張せず、そのまま再利用する。[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md) 0節が明記した「APIルート・`service_role`キーの露出のいずれも不要」という既存方針とも整合する | 低い。プロジェクトとして初めて`service_role`キーを導入することになり、既存方針からの逸脱になる |
| 運用コスト | 中。Cron実行のたびにログイン（またはリフレッシュトークンの管理）が必要になり、認証状態の保持がやや煩雑 | 低。鍵1つをVercel環境変数に置くだけで完結する、業界標準の「バックエンドジョブ用の管理者鍵」パターン |
| セキュリティ上の性質 | 通常のRLSポリシーの枠内で動くため、ポリシーのバグがあってもその影響範囲は他の管理者と同じ（新しい攻撃対象面を増やさない） | RLSを完全にバイパスするため、鍵が漏洩した場合の被害範囲が最大になる（全テーブル・全社データに無制限アクセス可能）。ただし本設計ではブラウザに一切露出しないサーバー専用の鍵として扱う前提であり、外部公開ページ（Shareページ等）が使う`anon`キーとはリスクの質が異なる |
| 推奨 | **第一候補** | 案(a)の運用コストが実装時に高すぎると判明した場合の代替案 |

**推奨: 案(a)。** ただし最終判断は実装時（Sprint40）に、Supabase Authのサーバーサイド・セッション
管理の実装コストを検証した上で確定する（本Sprintでは設計方針の提示に留める）。

### 18-3. 複数Workspace横断クエリの書き方（既存原則の継承）

[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 10-2節が既に明記した通り、
**「全Workspaceの通知をまとめて取得するSQLを1本のSECURITY DEFINER関数で書いてはいけない」**という
原則を、Delivery Workerでもそのまま踏襲する。18-2節の案(a)を採る場合、Workerは会社ごとに個別の
（RLSを通過する）クエリをループで積み上げる（`Promise.all`または逐次実行）。

### 18-4. 共有ページ利用者は通知対象外（必ず決めること）

[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 12節の結論をそのまま継承する。
`/share/[token]`の閲覧者（経営者本人）にはemail/identityが存在せず、`workspace_members`にも
登録されない。**Delivery Workerが送信先を解決する経路（18-1節）は常に`workspace_members`
起点であり、共有トークン経由で経営者へ通知が届く経路は存在しない**（設計上、混入しようが無い
——共有リンクの情報とNotification Delivery Pipelineは最初から交わらない別経路である）。

---

## 19. 監査ログ・個人情報/税務情報の取り扱い

- 6節の送信ログ（`error_detail`列を含む）が、実質的な監査ログを兼ねる（いつ・誰に・何を・
  どのチャネルで送ったか、失敗の詳細も含めて記録される）
- **メール本文・Slack投稿本文に含める情報の範囲は、既存の`caution_note`パターン
  （[CLAUDE.md](../CLAUDE.md)「手続き内容に関する記述には必ず『一般的な参考情報』である旨と
  専門家への確認を促す注意書きを添える」）を踏襲する。** 通知本文（例:
  「法人税確定申告の期限を超過しています」）は事実の通知であり、記帳・電子申告・法的助言そのものを
  含まないため既存方針とは矛盾しないが、**メールというより広く転送されうる媒体である性質を踏まえ、
  本文の末尾に共有ページ・画面内通知と同じ注意書きを必ず添える**、という運用ルールを実装時に定める
- 決算金額・従業員数等の具体的な税務・労務データそのものは、通知本文に含めない
  （`WorkspaceNotification.message`は既にDecision/Adviceが生成した抽象化済みの文言であり、
  生データを直接転記する設計にはなっていない——現状のEngine出力を踏襲する限り、この点は
  自動的に満たされる）

---

## 20. 配信停止・unsubscribe・バウンス

- **配信停止**: [NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md)の個人上書き
  （`workspace_member_notification_settings`、channel別`enabled=false`）がそのまま配信停止の
  実現手段になる。Delivery固有の追加テーブルは不要（Settings側の責務のまま）
- **unsubscribe（メール内のワンクリック停止リンク）**: メール特有の要件のため、Delivery側で
  対応する。実装イメージ: メールのフッターに、当該メンバーの`(company_id, email)`を特定できる
  署名付きトークン付きリンクを含め、クリック時に該当メンバーの`workspace_member_notification_settings`
  （email channelのみ）を`enabled=false`に更新する。**このリンクの実行にも認証を要求しない
  （メール受信者本人であることをトークンの署名で担保する）——Shareページのトークン方式
  （[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md)）と同じ設計パターンの再利用**として位置づける
- **バウンス・失敗**: 6節の送信ログに`status='bounced'`として記録する。3回連続でバウンスした
  宛先は、それ以降の送信対象から自動的に除外する（無限に送り続けてプロバイダの評判を落とさない
  ための安全策）、という設計方針をv1.0以降の実装時に確定する

---

## 21. 将来のAccounting通知との接続

[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 9節・
[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 13節の結論を継承する。将来
`financial`カテゴリの`WorkspaceNotification`が追加されても、本設計のDelivery Pipeline
（Scheduler→Worker→Settings Filter→Provider抽象化）は**一切変更不要**——Providerアダプタは
`WorkspaceNotification`の`category`の値を関知せず、Settingsのカテゴリ別設定（Sprint38 3節）も
新しい値の追加に対して閉じていない設計になっているため、**Delivery層は`category`の中身を
関知しない汎用的な配送レイヤーとして、新カテゴリの追加をそのまま吸収できる**。

---

## 22. 必ず決めること（まとめ）

| 項目 | 決定内容 | 参照節 |
|---|---|---|
| Notification ID | Sprint37の`WorkspaceNotification.id`をそのまま使う。occurrenceKeyを最優先で安定化（Sprint38承認事項の継続） | 0-1節 |
| delivery dedupe key | `(company_id, notification_id, severity, channel, recipient)` + 送信日 | 9節 |
| send logの一意制約 | `UNIQUE (company_id, notification_id, severity, channel, recipient, sent_at::date)` | 6節 |
| retry回数 | 最大3回、指数バックオフ | 7節 |
| dead letterの扱い | 3回失敗後は`status='failed'`のまま記録し続ける。サイレント削除しない | 7節・23節 |
| 即時通知とDigestの分離 | MVPはDigest（1日1回）のみ。即時通知はv1.0以降、別トリガーとして追加 | 10節 |
| 画面内通知と外部pushの関係 | 同じ`WorkspaceNotification[]`を消費する2つの独立した経路。互いに依存しない | 1節 |
| 同じ通知を複数チャネルへ送る場合の記録単位 | 1行 = 1(通知×チャネル×宛先) | 6節 |
| provider変更時にEngineを触らない設計 | `NotificationChannelAdapter`インターフェースで分離。Delivery→Engineの一方向依存のみ | 16節 |
| 権限を失ったメンバーへ送らない仕組み | 送信直前に`workspace_members`を都度再解決。スナップショットしない | 18-1節 |
| 共有ページ利用者は通知対象外 | 送信先解決は常に`workspace_members`起点。共有トークン経由の経路は存在しない | 18-4節 |
| 外部push配信開始時に必要なmigration | 23節 | 23節 |
| 秘密鍵・APIキーの管理方法 | プロジェクト共通鍵はVercel環境変数、会社ごとの値はDB。`NEXT_PUBLIC_`は絶対に使わない | 17節 |

---

## 23. migrationが必要になる時点

[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md) 16節の5テーブルに加え、
Delivery固有で新たに必要になるテーブルを整理する。

| きっかけ | 必要なテーブル |
|---|---|
| Sprint38 16節の5テーブル（設定・既読・Snooze・送信ログの基礎） | `workspace_notification_settings`・`workspace_member_notification_settings`・`workspace_notification_reads`・`workspace_notification_snoozes`・`workspace_notification_log` |
| メール配信に着手する時点 | 上記`workspace_notification_log`のみで足りる（宛先は`workspace_members.email`を直接参照するため追加テーブル不要） |
| Slack配信に着手する時点 | `workspace_notification_channels`（会社単位のWebhook URL登録、13節） |
| LINE配信に着手する時点 | `workspace_notification_channels`の拡張、またはメンバー単位トークン用の追加列（14節、方式未確定） |
| Web Push配信に着手する時点 | `workspace_notification_push_subscriptions`（15節） |
| システム管理者アカウント方式（18-2節案(a)）を採る場合 | 新規テーブルは不要（既存`admin_users`・`workspace_members`への1行追加のみ） |

**現時点（Sprint39）ではいずれのきっかけも実現していないため、migrationは作成しない。**

---

## 24. β版スコープ

### 24-1. MVP構成（実装するとしたら最初に作るもの）

Sprint38 16節・本節の結論を統合すると、実装順序は次の通り。

1. `workspace_notification_settings`（Workspace既定値のみ）
2. Cron + Route Handler（`CRON_SECRET`認可のみ、まだ何も送らないログ出力のみのダミー実装で疎通確認）
3. 18-2節の送信先解決方式（案(a)推奨）の実装・検証
4. `workspace_notification_log`
5. メールチャネル（Resend）のみを実装し、Slack/LINE/Web Pushは後回しにする

### 24-2. v1.0構成

- 個人上書き設定（`workspace_member_notification_settings`）
- 既読・Snooze
- Slack（13節）
- 即時通知（10節、`high` severityのみ）
- 配信時間帯・休日制御（11節）

### 24-3. 今は実装しないもの

- 本Sprint（Sprint39）では一切のコード・DB変更を行わない（設計のみ）
- 案B（Supabase Edge Functions + pg_cron）・案C（外部Queue基盤）は不採用
- LINE・Web Push（14節・15節、優先度は他チャネルより低い）
- チャネル間の自動フォールバック（16-1節）
- Provider障害時の高度なCircuit Breaker等（本設計のRetry/Backoff（7節）の範囲を超えるもの）

---

## 25. Sprint40以降推奨順序（イメージ）

| Phase | 目的 | 前提 | 要判断事項 |
|---|---|---|---|
| **40.1** | `workspace_notification_settings`のmigration・UI（Sprint38 17節39.1と同じ） | Sprint38の実要望確認 | — |
| **40.2** | Cronトリガー用Route Handlerの疎通確認（送信は行わずログ出力のみ） | 40.1完了、Vercelプランのcron頻度確認 | CRON_SECRETの発行・管理方法 |
| **40.3** | 送信先解決方式の確定（18-2節、案(a) vs 案(b)の実装検証） | 40.2完了 | システム管理者アカウント方式の運用コストが許容範囲か |
| **40.4** | `workspace_notification_log` + Resendによるメール配信本体 | 40.3完了 | 実際のメール文面・件名フォーマットの確定 |
| **40.5** | Digest配信の実運用開始、β版フィードバック収集 | 40.4完了 | 配信頻度（1日1回で十分か）の実運用での検証 |
| **40.6** | 個人上書き設定・既読・Snoozeの実装着手判断 | 40.5完了、実要望確認 | Sprint38 17節の39.2〜39.4と同じ |

---

## 26. 最終結論（明記事項）

| 項目 | 結論 | 参照節 |
|---|---|---|
| **推奨アーキテクチャ** | 案A: Vercel Cron + Next.js Route Handler + Supabase。送信先解決はシステム管理者アカウント方式（18-2節案(a)）を第一候補とする | 2-2節・18-2節 |
| **MVP構成** | Workspace既定値設定 → Cron疎通確認 → 送信先解決方式の確定 → 送信ログ → メール（Resend）のみ。Slack/LINE/Web Pushは含めない | 24-1節 |
| **v1.0構成** | 個人上書き設定・既読・Snooze・Slack・即時通知（highのみ）・配信時間帯/休日制御 | 24-2節 |
| **今は実装しないもの** | 本Sprintは設計のみで一切のコード/DB変更を行わない。加えて案B・案C、LINE・Web Push、チャネル間フォールバック、高度なCircuit Breakerは対象外 | 24-3節 |
| **migrationが必要になる時点** | Sprint38 5テーブルの実要望確認時点が最初のトリガー。チャネル追加（Slack/LINE/Web Push）ごとに個別のタイミングで追加テーブルが必要になる | 23節 |
| **Sprint40以降の推奨順序** | 40.1設定migration → 40.2 Cron疎通 → 40.3送信先解決確定 → 40.4メール配信本体 → 40.5実運用開始 → 40.6個人設定/既読/Snooze着手判断 | 25節 |
| **失敗時に通知を捨てるか、再送するか** | **再送する（最大3回、指数バックオフ）。3回失敗後もサイレントに捨てず、送信ログに`status='failed'`として記録し続ける。** 見落としより「記録が残らないこと」のほうがリスクが大きいと判断する | 7節・22節 |
| **β版で外部push配信を入れるべきか** | **入れない。** 現在の実データ規模（Workspace数が実質2社、画面内通知は最大5件/社）では画面内通知（Sprint37実装済み）で実務上十分であり、外部push配信は「実際に見落としが発生した」という現場の声が確認されてから着手すべき（`CLAUDE.md`「小さく作る」「実務データの検証なしの断定をしない」原則）。本Sprintは次に着手する場合の設計を用意しただけであり、着手の可否自体は別途判断する | 24節 |

---

## まとめ（設計レビュー観点）

1. **2-2節の核心的な判断**: 案A（Vercel Cron + Next.js Route Handler + Supabase）を採用し、
   案B（Edge Functions + pg_cron）・案C（外部Queue基盤）を退けた判断が妥当か
2. **2-3節**: Cronトリガー用エンドポイントを「データ取得用APIルートを作らない」原則の例外ではなく
   別カテゴリ（システムトリガー）として整理したことの妥当性。実装時にCLAUDE.mdへの追記が必要か
3. **10節**: MVPをDigest通知（1日1回）のみに限定し、即時通知をv1.0以降に持ち越した判断
4. **18-2節**: 権限を持たないCron/WorkerがどうやってRLSを越えて全社データを読むか——
   システム管理者アカウント方式（案(a)、既存`admin_users`/`workspace_members`の再利用）を第一候補とし、
   `service_role`キー方式（案(b)）を次点の代替案とした判断。このプロジェクトが一度も`service_role`
   キーを使っていないという事実（0-2節）をどこまで重く見るか
5. **6節・9節**: 送信ログの一意制約・dedupeキーにseverityを含め、「severityの変化は新しい送信対象」
   として扱う設計（見落とし防止を重複防止より優先する判断）
6. **13〜15節**: メール（Resend）→Slack→LINE/Web Pushという優先順位付けの妥当性。特に
   LINE配信方式（会社単位のWebhook的な通知 vs 個人単位のトークン）を本Sprintで確定しなかった判断
7. **20節**: unsubscribeリンクをShareページと同じトークン方式で実現する設計、バウンス3回で
   自動除外するという安全策の妥当性
8. **23節・24節**: 「今は何も作らない」「実要望が出てから最小単位で着手する」という段階分けが、
   `CLAUDE.md`の「小さく作る」原則と整合しているか
