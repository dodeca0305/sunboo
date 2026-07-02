# SUNBOO経営ナビ

法人の所在地・従業員有無・決算月を入力するだけで、提出すべき書類・提出先・期限・公式リンクを一覧表示するWebサービス。

- **対象ユーザー**: 法人を設立したばかりの経営者、顧問税理士・社労士がいない中小企業
- **MVP対応エリア**: 東京都渋谷区（順次拡大予定）
- **登録不要・無料**

---

## ページ構成

| URL | 説明 |
|-----|------|
| `/` | トップページ |
| `/start` | 会社情報入力フォーム |
| `/result` | 診断結果（管轄機関・手続き一覧） |
| `/procedures` | 手続きマスタ一覧（カテゴリフィルター付き） |
| `/offices` | 管轄機関一覧（機関タイプフィルター付き） |

---

## 技術スタック

| 項目 | 技術 |
|------|------|
| フレームワーク | Next.js 16 (App Router) |
| 言語 | TypeScript |
| スタイル | Tailwind CSS v4 |
| データベース・認証 | Supabase (PostgreSQL) |
| ホスティング | Vercel |

---

## セットアップ方法

### 必要環境

- Node.js 18以上
- npm または yarn

### 手順

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd sunboo

# 2. 依存関係をインストール
npm install

# 3. 環境変数を設定（後述）
cp .env.local.example .env.local
# エディタで .env.local を開いて編集

# 4. 開発サーバーを起動
npm run dev
```

`http://localhost:3000` でアプリが起動します。

> **Supabase 未設定でも起動できます。** フォームは動作しますが、診断結果にはデータが表示されません。

---

## Supabase 設定方法

### 1. Supabase プロジェクトを作成

1. [supabase.com](https://supabase.com) にアクセスしてアカウントを作成
2. 「New project」でプロジェクトを作成（Regionは `Northeast Asia (Tokyo)` 推奨）
3. プロジェクトの設定画面から以下を取得:
   - **Project URL** (`https://xxxxxxxxxxxx.supabase.co`)
   - **anon public key**

### 2. 環境変数を設定

`.env.local` を編集:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 3. データベースを構築

Supabase ダッシュボードの「SQL Editor」で以下を順番に実行:

```
1. supabase/schema.sql   → テーブル・インデックスの作成
2. supabase/seed.sql     → MVP初期データの投入（東京都渋谷区）
```

### 4. Row Level Security（RLS）の設定

現在のMVPはRLS未設定で動作します。本番リリース前に以下を検討してください:

```sql
-- 例: jurisdiction_offices を全員に読み取り許可
ALTER TABLE jurisdiction_offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON jurisdiction_offices FOR SELECT USING (true);
```

---

## Supabase 接続テスト

セットアップ後、以下のチェックリストで接続を確認してください。

### ステップ 1: 環境変数の確認

開発サーバー起動後、ブラウザの DevTools コンソールにエラーがないことを確認します。

```bash
npm run dev
# → http://localhost:3000 を開いてコンソールを確認
# エラーなし: 環境変数が正しく読み込まれています
```

または、一時的なデバッグとして `src/lib/supabase.ts` の `supabase` 変数が `null` でないことを確認:

```typescript
// src/lib/supabase.ts の supabase が null でないか確認する方法
// （本番ではログ出力しないこと）
console.log('Supabase:', supabase !== null ? '接続済み' : '未設定');
```

### ステップ 2: テーブルの確認

Supabase ダッシュボード → **Table Editor** を開き、以下のテーブルが存在することを確認:

| テーブル | 期待するレコード数（seed後） |
|----------|---------------------------|
| `prefectures` | 1件（東京都） |
| `municipalities` | 1件（渋谷区） |
| `jurisdiction_offices` | 6件 |
| `procedures` | 10件 |
| `procedure_documents` | 7件 |
| `official_links` | 10件 |

> テーブルが存在しない場合 → `supabase/schema.sql` を SQL Editor で再実行  
> データが空の場合 → `supabase/seed.sql` を SQL Editor で再実行

### ステップ 3: アプリで動作確認

以下の URL を順番に開いて表示を確認:

```
# 1. トップページ
http://localhost:3000/

# 2. 入力フォーム → 都道府県「東京都」→ 市区町村「渋谷区」を選択できること
http://localhost:3000/start

# 3. 診断結果（MVPパラメータで直接アクセス）
http://localhost:3000/result?pref=13&muni=13113&emp=true&fm=3

# 4. 手続き一覧（10件表示されること）
http://localhost:3000/procedures

# 5. 管轄機関一覧（6件表示されること）
http://localhost:3000/offices
```

### ステップ 4: 接続成功の判定基準

| 確認項目 | 成功の状態 |
|----------|-----------|
| `/start` 都道府県セレクト | 「東京都」が選択肢に表示される |
| `/start` 市区町村セレクト | 東京都選択後「渋谷区」が表示される |
| `/result` 管轄機関 | 「渋谷税務署」など6機関が表示される |
| `/result` 手続き一覧 | 「法人設立届出書」など10件が表示される |
| `/procedures` | 10件の手続きが表示され、カテゴリフィルターが動作する |
| `/offices` | 6機関が表示され、タイプフィルターが動作する |

### トラブルシューティング

| 症状 | 原因と対処 |
|------|-----------|
| `🔧 データベース未接続` と表示される | `.env.local` の変数名・値を再確認。変数名は `NEXT_PUBLIC_` で始まること |
| 開発サーバー再起動後も直らない | `npm run dev` を一度停止して再起動（env変数はサーバー起動時に読み込まれる） |
| テーブルは存在するがデータが空 | `supabase/seed.sql` を Supabase SQL Editor で実行 |
| `permission denied` エラー | Supabase の anon key が正しいか、RLSポリシーを確認 |

---

## Vercel デプロイ手順

### 前提条件

- GitHub アカウントがあること
- このリポジトリが GitHub に push 済みであること
- Supabase のセットアップが完了していること（schema.sql + seed.sql 実行済み）

### ステップ 1: GitHub にプッシュ

```bash
git init
git add .
git commit -m "Initial commit: SUNBOO経営ナビ MVP"
git branch -M main
git remote add origin https://github.com/<your-username>/sunboo.git
git push -u origin main
```

> `.env.local` は `.gitignore` で除外済みのため、**絶対にコミットされません**。

### ステップ 2: Vercel にインポート

1. [vercel.com](https://vercel.com) にログイン
2. **「Add New → Project」** をクリック
3. GitHub リポジトリ `sunboo` を選択して **「Import」**
4. Framework は **Next.js** が自動検出される
5. **「Deploy」前に「Environment Variables」を設定**（次のステップ）

### ステップ 3: 環境変数を設定（重要）

Vercel の「Environment Variables」セクションに以下を追加:

| 変数名 | 値の取得元 |
|--------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public key |

**設定対象環境**: `Production` + `Preview` + `Development` すべてにチェック

### ステップ 4: デプロイ実行

「Environment Variables」設定後、**「Deploy」** をクリック。

ビルドログに以下が表示されれば成功:
```
✓ Compiled successfully
✓ Generating static pages (9/9)
```

### デプロイ後の確認 URL

本番 URL を `https://your-app.vercel.app` とした場合:

| 確認内容 | URL |
|---------|-----|
| トップページ | `https://your-app.vercel.app/` |
| 入力フォーム | `https://your-app.vercel.app/start` |
| 診断結果（東京都渋谷区・従業員あり・3月決算） | `https://your-app.vercel.app/result?pref=13&muni=13113&emp=true&fm=3` |
| 手続き一覧（10件表示されること） | `https://your-app.vercel.app/procedures` |
| 管轄機関一覧（6件表示されること） | `https://your-app.vercel.app/offices` |

### 本番確認チェックリスト

| 確認項目 | 期待する状態 |
|---------|------------|
| `/` トップページ | 正常表示・「診断する」ボタンが機能する |
| `/start` 都道府県 | 「東京都」が選択肢に表示される |
| `/start` 市区町村 | 東京都選択後「渋谷区」が表示される |
| `/result` 管轄機関 | 渋谷税務署など **6件** 表示 |
| `/result` 手続き | 法人設立届出書など **10件** 表示 |
| `/result` 公式リンク | 各手続きのリンクが開ける |
| `/procedures` | 10件・カテゴリフィルターが動作する |
| `/offices` | 6件・タイプフィルターが動作する |
| `データベース未接続` 表示 | **表示されないこと** |

### トラブルシューティング（本番）

| 症状 | 原因と対処 |
|------|-----------|
| ビルドエラー | Vercel のビルドログを確認。TypeScript エラーがないか確認 |
| `データベース未接続` と表示 | Vercel の Environment Variables に `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` が設定されているか確認 |
| データが表示されない | Supabase の RLS ポリシーを確認（`supabase/grant_public_read.sql` を実行） |
| `permission denied` エラー | Supabase の anon key が正しいか確認 |

---

## データ更新時の注意

### 新しいエリア（市区町村）を追加する場合

```sql
-- 1. 市区町村を追加
INSERT INTO municipalities (prefecture_id, code, name)
SELECT id, '13104', '新宿区' FROM prefectures WHERE code = '13';

-- 2. その市区町村の管轄機関を追加
INSERT INTO jurisdiction_offices (municipality_id, office_type, name, address, phone, website_url, map_url)
SELECT m.id, 'tax_office', '新宿税務署', '東京都新宿区...', '03-xxxx-xxxx',
       'https://...', 'https://maps.google.com/?q=新宿税務署'
FROM municipalities m WHERE m.code = '13104';
```

### 手続きマスタを更新する場合

`procedures` テーブルの `is_active` フラグで手続きの有効・無効を切り替えられます。

```sql
-- 手続きを無効化（削除せずに非表示）
UPDATE procedures SET is_active = false WHERE code = 'PROCEDURE_CODE';
```

### 注意事項

- **本番データを直接編集する前にバックアップを取ること**（Supabase ダッシュボード → Database → Backups）
- `procedures` テーブルの `timing_data` は JSONB 形式。`timing_type` と対応していることを確認すること
- 既存の `company` レコードに影響する変更は慎重に行うこと

---

## ディレクトリ構成

```
sunboo/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # ヘッダー・フッター共通レイアウト
│   │   ├── page.tsx                # トップページ
│   │   ├── globals.css             # Tailwind v4 テーマ・コンポーネント定義
│   │   ├── start/
│   │   │   └── page.tsx            # 会社情報入力フォーム（クライアントコンポーネント）
│   │   ├── result/
│   │   │   └── page.tsx            # 診断結果（サーバーコンポーネント・Dynamic）
│   │   ├── procedures/
│   │   │   ├── page.tsx            # 手続き一覧（サーバーコンポーネント）
│   │   │   └── ProcedureList.tsx   # カテゴリフィルターUI（クライアントコンポーネント）
│   │   └── offices/
│   │       ├── page.tsx            # 管轄機関一覧（サーバーコンポーネント）
│   │       └── OfficeList.tsx      # タイプフィルターUI（クライアントコンポーネント）
│   ├── data/
│   │   ├── industries.ts           # 業種マスタ（静的）
│   │   └── prefectures.ts          # 都道府県マスタ 47件（静的・Supabase未設定時のフォールバック）
│   └── lib/
│       ├── types.ts                # TypeScript 型定義
│       ├── diagnosis.ts            # 診断エンジン（DB クエリ・期限計算）
│       └── supabase.ts             # Supabase クライアント（env未設定時は null）
├── supabase/
│   ├── schema.sql                  # DB スキーマ（テーブル・インデックス・UNIQUE制約）
│   ├── seed.sql                    # MVP 初期データ（冪等: 何度実行しても重複しない）
│   ├── fix_duplicates.sql          # 重複データ削除 & UNIQUE制約追加（初回のみ）
│   └── grant_public_read.sql       # anon ロールへの SELECT 権限付与
├── docs/
│   └── 開発指示書_v1.md            # 設計・実装ドキュメント
├── .env.local.example              # 環境変数のテンプレート（APIキーなし）
├── .gitignore                      # .env.local 等を除外
├── .gitattributes                  # 改行コード統一（LF）
└── README.md
```

---

## 将来の拡張計画

| フェーズ | 内容 |
|---------|------|
| Phase 2 | 全47都道府県・主要市区町村への対応拡大 |
| Phase 3 | 業種フィルター（飲食・建設・医療など）追加 |
| Phase 4 | AI自然文検索「社員を雇ったら何が必要？」 |
| Phase 5 | ユーザー登録・ログイン → 手続きステータス管理 |
| Phase 6 | リマインダーメール（Resend連携） |
| Phase 7 | 専門家相談依頼（Stripe決済） |

---

## 免責事項

- 本サイトの情報は一般的な参考情報であり、法的アドバイスではありません。
- 実際の手続き・期限・提出先は、必ず各公式機関の最新情報をご確認ください。
- 法改正等により、手続きの内容・期限・提出先が変更される場合があります。
- 本サービスの利用により生じた損害について、運営者は一切の責任を負いません。

---

© 2026 SUNBOO経営ナビ
