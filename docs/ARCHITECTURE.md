# ARCHITECTURE.md — システム構成

## システム全体構成

```
┌─────────────┐     Supabase-js（直接呼び出し・APIルートなし）     ┌──────────────┐
│   ブラウザ   │ ───────────────────────────────────────────────▶ │   Supabase   │
│ (一般ユーザー│ ◀─────────────────────────────────────────────── │ PostgreSQL   │
│  / 管理者)   │                                                    │ + Auth       │
└──────┬──────┘                                                    └──────────────┘
       │ HTTP
       ▼
┌─────────────────────────────┐
│   Vercel（Next.js 16 実行環境）│
│  - Server Components         │
│  - Client Components         │
│  - Proxy（旧Middleware）     │
└───────────────────────────────┘
```

SUNBOOはNext.js App Router単独の構成で、**独自のバックエンドAPIサーバーを持たない**。全てのデータ取得・書き込みは
Supabase-js経由でSupabase（PostgreSQL + Auth）に対して直接行う。Server ComponentsはSSR時に、Client Components
はブラウザから直接Supabaseへ接続する。

## Next.js / Supabase / Vercel の役割

### Next.js（App Router, v16, Turbopack）
- ルーティング・レンダリング（サーバー/クライアント両方のコンポーネント）を担当
- `src/proxy.ts`（Next.js 16の新Middleware規約。旧`middleware.ts`は非推奨のため`proxy.ts`＋`export function proxy`を使用）が
  `/admin/*` へのアクセスをCookieセッションで検査し、未ログイン・非管理者を`/admin/login`へリダイレクトする
- ビジネスロジック（診断計算・ルール評価）はNext.jsのサーバー/クライアントどちらのコードからも呼べる
  `src/lib/` の純粋なTypeScript関数として実装し、APIルートは作らない

### Supabase（PostgreSQL + Auth）
- 全データの永続化先。RLS（Row Level Security）でテーブルごとのアクセス制御を行う
- 読み取り: `anon`ロールに対して原則すべての参照系テーブルに`GRANT SELECT`＋`public_read`ポリシー
- 書き込み: 一般ユーザーが書けるのは`anonymous_company_events`（経営イベント登録）のみ。それ以外の書き込みは
  `authenticated`ロール＋`admin_users`テーブルとの照合ポリシーで管理者のみに制限
- 認証: Supabase Auth（メール・パスワード）は管理画面専用。一般ユーザー側には認証機構が無い
  （完了ステータス等はブラウザの`localStorage`で管理する「認証なし・ブラウザ単位」の信頼モデル）

### Vercel
- ホスティング先。GitHubリポジトリと連携し、`main`ブランチへのpushで自動デプロイされる
- 環境変数（`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`）はVercelのProject Settings側で設定する
- **ローカルの`npm run build`成功は本番反映を意味しない。** `git push`して初めてVercel上でビルド・デプロイされる
  （過去に複数セッション分の変更が未pushのまま本番が古いコミットに取り残された事故がある）

## 主要ディレクトリ

```
sunboo/
├── src/
│   ├── proxy.ts                 # /admin/* のアクセス制御（Cookieセッション検査）
│   ├── app/
│   │   ├── layout.tsx           # ルートレイアウト（html/body・フォント）
│   │   ├── globals.css          # Tailwind v4 テーマ・共通コンポーネントクラス定義
│   │   ├── (site)/              # 一般ユーザー向け（route group、URLに影響しない）
│   │   │   ├── layout.tsx       # ヘッダー・フッター共通レイアウト
│   │   │   ├── page.tsx         # トップページ
│   │   │   ├── start/           # 診断フォーム（Client Component）
│   │   │   ├── result/          # 診断結果 + 今日やることダッシュボード（ScheduleList.tsx）
│   │   │   ├── events/          # 経営イベント登録（Client Component、会社情報登録→イベント選択→登録）
│   │   │   ├── procedures/      # 手続き一覧
│   │   │   ├── offices/         # 管轄機関一覧
│   │   │   ├── search/          # 横断検索
│   │   │   ├── diagnosis/, form/ # 廃止済み。/start へのredirectのみ残る
│   │   └── admin/
│   │       ├── login/           # ログイン画面（未保護）
│   │       └── (protected)/     # ログイン必須（layout.tsxがセッション確認 + AdminShell描画）
│   │           ├── AdminShell.tsx        # サイドバー・ナビ
│   │           ├── page.tsx              # ダッシュボード
│   │           ├── offices/              # 管轄機関CRUD
│   │           ├── organization-types/   # 機関種別CRUD
│   │           ├── procedures/           # 手続きCRUD
│   │           ├── rules/                # ルールCRUD（Phase 2.5）
│   │           ├── links/                # リンク健全性チェック
│   │           ├── import/, export/      # CSV入出力
│   ├── components/
│   │   └── ProcedureDetailExtra.tsx  # 手続き詳細（対象・提出方法・書類・電子申請）共通表示
│   ├── data/
│   │   ├── prefectures.ts       # 都道府県マスタ静的データ（Supabase未設定時のフォールバック）
│   │   └── industries.ts        # 業種マスタ静的データ
│   └── lib/
│       ├── types.ts             # 全TypeScript型定義（DBエンティティ・診断I/O・イベントI/O）
│       ├── diagnosis.ts         # 診断エンジン：resolveOffices（管轄機関解決、共通） /
│       │                          calculateNextDeadline（期限計算、共通） / runDiagnosis
│       ├── events.ts            # 経営イベントエンジン：registerCompanyEvent（イベント登録+手続き生成）
│       ├── ruleEngine.ts        # ルールエンジン：evaluateRules（条件評価の汎用ロジック）
│       ├── supabase.ts          # 一般ユーザー向けSupabaseクライアント（env未設定時はnull）
│       ├── admin.ts             # 管理者セッション確認（Server Component用）
│       ├── adminConstants.ts    # 管理画面の選択肢定義（機関種別・カテゴリ・ルール条件/演算子/アクション種別）
│       ├── adminCsv.ts          # CSVインポートのアップサートロジック
│       └── supabase/
│           ├── browser.ts       # 管理画面用ブラウザクライアント（Cookieセッション、createBrowserClient）
│           └── server.ts        # 管理画面用サーバークライアント（Server Components、createServerClient）
├── supabase/                    # DBマイグレーションSQL一式（詳細は DATABASE.md）
└── docs/                        # 設計ドキュメント（本ファイルを含む）
```

## 主要ページ

| URL | レンダリング | 説明 |
|---|---|---|
| `/` | Static | トップページ |
| `/start` | Static + Client | 診断フォーム（3〜5項目入力） |
| `/result?pref=&muni=&emp=&fm=&corp=&officerTerm=` | Dynamic Server | 診断結果。「今日/今週/今月/今後やること」に自動振り分け表示 |
| `/events` | Static + Client | 経営イベント登録。localStorageに会社プロフィールをキャッシュし、初回のみ入力・以降は「イベント選択→登録」の2ステップ |
| `/procedures` | Dynamic Server | 手続き一覧（カテゴリフィルタ） |
| `/offices` | Dynamic Server | 管轄機関一覧（機関タイプフィルタ） |
| `/search` | Dynamic Server | 手続き＋機関の横断検索 |
| `/admin/*` | Dynamic Server | 管理画面（`cookies()`使用により自動的にDynamic） |

## データ取得方針

1. **APIルートを作らない。** Server ComponentsまたはClient Componentsから`supabase-js`を直接呼ぶ
2. **一般ユーザー向けと管理画面でSupabaseクライアントを使い分ける。**
   - 一般ユーザー向け: `src/lib/supabase.ts`（環境変数未設定時は`null`を返し、呼び出し側で「データベース未接続」を表示する）
   - 管理画面: `src/lib/supabase/browser.ts`（Client Component、フォーム送信等の書き込みに使う）と
     `src/lib/supabase/server.ts`（Server Component、`cookies()`でセッションを読む）
3. **診断エンジン・経営イベントエンジンで共有するロジックは`src/lib/diagnosis.ts`に集約する。**
   `resolveOffices`（管轄機関解決）と`calculateNextDeadline`（期限計算）は`runDiagnosis`（診断）と
   `registerCompanyEvent`（イベント登録、`src/lib/events.ts`）の両方から呼ばれる。片方だけ直して
   もう片方が古いロジックのまま、という状態を作らないこと
4. **手続き結果の型は`ProcedureResult`（`src/lib/types.ts`）に統一する。** 診断結果もイベント登録結果も
   最終的にこの型に正規化してから`toScheduleProcedure`（`ScheduleList.tsx`）で表示用の`ScheduleProcedure`型に
   変換する。表示コンポーネント（`ScheduleList`）は診断・イベントの両方から再利用している

## force-dynamicが必要なページの説明

Next.jsはデフォルトで、`fetch`や`cookies()`等の動的APIを使わないページを**ビルド時に静的プリレンダリング**する。
SUNBOOでは以下の理由から、DBの最新データを表示すべきページに明示的に`export const dynamic = 'force-dynamic'`を
付けている（対象: `src/app/(site)/offices/page.tsx`、`procedures/page.tsx`、`search/page.tsx`）。

- これらのページはSupabaseから取得したデータをそのまま一覧表示する
- 管理画面からのデータ更新やマイグレーション実行は、Vercelの**再デプロイ**とは独立したタイミングで起こる
- 静的プリレンダリングのままだと、`next build`実行時点（＝直近のデプロイ時点）のDB状態がHTMLに焼き付けられ、
  その後DB側でデータを更新しても**再デプロイするまで反映されない**という事故が過去に実際に発生した
  （2026-07-03、`/offices`が渋谷の旧データを表示し続けた本番障害。原因はforce-dynamic未設定だったこと）

`/result`は`searchParams`（Promise）を受け取るため、Next.jsが自動的に動的レンダリングとして扱う
（明示的な`force-dynamic`指定は不要）。`/events`はClient Componentでサーバー側のDB読み取りを行わないため
Staticのままでよい（データ取得は全てマウント後のブラウザ側`useEffect`で行う）。

**新しく「DBデータを一覧表示するページ」を追加する場合は、`force-dynamic`の要否を都度検討すること。**
