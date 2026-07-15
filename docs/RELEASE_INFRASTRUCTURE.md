# RELEASE_INFRASTRUCTURE.md — Release Infrastructure（Phase8）

> **ステータス：実装済み。** Engine・Procedure・DBスキーマ・migrationはいずれも変更していない。
> 新規パッケージも追加していない（`next/og`はNext.js本体に同梱済みのAPI）。UI変更は「ページの
> 見た目には影響しない」metadata・favicon・OG画像・robots/sitemapのみに限定した。
> レビュー待ちで停止する。

本ドキュメントは、[docs/V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §6「リリース」で
❌だった5項目（robots・sitemap・OGP・favicon・本番URL）のうち、コードで対応可能な4項目
（本番ドメイン確定自体を除く）を実装した記録である。値の重複記載はせず、実装内容・確認結果・
残課題のみをここに書く。

---

## 1. 構成

### 1-1. 新規ファイル

| ファイル | 役割 |
|---|---|
| `src/lib/siteUrl.ts` | 本番URLの単一情報源。`NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → `localhost:3000`の優先順位でURLを解決する。robots/sitemap/canonical/OGすべてがここを参照する |
| `src/app/robots.ts` | Next.js Metadata APIの規約ファイル。`/robots.txt`として配信される |
| `src/app/sitemap.ts` | 同上。`/sitemap.xml`として配信される。公開静的ページ10件のみを列挙 |
| `src/app/icon.tsx` | ブラウザファビコン（64×64、`next/og`の`ImageResponse`で動的生成、`/icon`として配信） |
| `src/app/apple-icon.tsx` | iOS「ホーム画面に追加」用アイコン（180×180、`/apple-icon`として配信） |
| `src/app/opengraph-image.tsx` | SNS共有時のOGP画像（1200×630、`/opengraph-image`として配信。Next.jsの規約により`twitter:image`にも自動流用される） |
| `src/app/manifest.ts` | Web App Manifest（`/manifest.webmanifest`として配信） |
| `src/app/(site)/start/layout.tsx`、`events/layout.tsx`、`profile/layout.tsx`、`profile/tax-returns/layout.tsx`、`roadmap/layout.tsx` | 対応する`page.tsx`が`'use client'`のため、metadataだけを持たせるための最小限のServer Component layout。`{children}`を返すのみで見た目には影響しない |

### 1-2. 変更ファイル

| ファイル | 変更内容 |
|---|---|
| `src/app/layout.tsx` | `metadataBase`・`title`（`default`/`template`）・`keywords`・`openGraph`・`twitter`を追加 |
| `src/app/(site)/page.tsx` | `alternates.canonical: '/'`を追加 |
| `src/app/(site)/help/page.tsx` | ページ固有の`title`/`description`/`canonical`を追加 |
| `src/app/(site)/procedures/page.tsx` | 同上 |
| `src/app/(site)/offices/page.tsx` | 同上 |
| `src/app/(site)/search/page.tsx` | 同上 |
| `src/app/(site)/result/page.tsx` | `title`追加、および`robots: { index: false, follow: true }`を追加（2節で理由を詳述） |
| `.env.local.example` | `NEXT_PUBLIC_SITE_URL`の説明とプレースホルダーを追記（コメントアウト状態、値は未設定のまま） |

### 1-3. なぜこの設計にしたか

- **Next.jsのMetadata API制約**：`export const metadata`はServer Componentからしかexportできない。
  `start`・`events`・`profile`・`profile/tax-returns`・`roadmap`の各`page.tsx`は既存のまま
  `'use client'`（フォーム状態管理のため）であり、そのpage.tsx自体は変更せず、同階層に
  metadata専用の`layout.tsx`を追加する方式を採った。これにより「UI変更は最小限」という
  制約を守りつつ、全公開ページにタイトル・descriptionを持たせられる
- **OG画像は静的な画像ファイルを新規追加せず、`next/og`の`ImageResponse`で動的生成した**。
  新規パッケージの追加なしに（`next/og`はNext.js本体に同梱）、既存ヘッダーの「S」ロゴバッジ
  （`bg-blue-600`・白文字・角丸、[src/app/(site)/layout.tsx](../src/app/(site)/layout.tsx)と同一）
  をそのまま流用したデザインにできるため、新しいブランド要素の追加を避けられた

---

## 2. 確認項目

### 2-1. `robots.txt`

```
User-Agent: *
Allow: /
Disallow: /admin
Disallow: /share

Sitemap: http://localhost:3000/sitemap.xml
```

（`npm run dev`実機確認時点。本番では`Sitemap:`行が本番ドメインに切り替わる。1-1のSITE_URL解決順に従う）

管理画面（`/admin`配下）・共有ページ（`/share`配下、閲覧に有効なトークンが必要で検索結果に
載せる意味が無い）をクロール対象外にした。

### 2-2. `sitemap.xml`

実機確認（`curl http://localhost:3000/sitemap.xml`）で、3節「SEO対象ページ」の10件がすべて
絶対URLで出力されることを確認した。`/result`・`/admin/*`・`/share/[token]`・`/diagnosis`・
`/form`（後者2件は`/start`へのリダイレクトのみを行う廃止済みページ）はいずれも含まれない。

### 2-3. metadata（title/description/keywords/OG/twitter/canonical）

実機確認（`curl`でHTML `<head>`を取得）で、以下を確認した。

- トップページ（`/`）：`title`・`description`・`keywords`・`og:*`一式（`og:image`は
  `/opengraph-image`を指す）・`twitter:*`一式・`canonical`・`manifest`・`icon`/`apple-touch-icon`の
  すべてが出力されている
- `/help`・`/procedures`・`/offices`・`/search`（Server Component、page.tsx直接）：
  ページ固有の`title`（`〇〇 | SUNBOO経営ナビ`という`template`が正しく適用されている）・
  `canonical`が出力されている
- `/start`・`/events`・`/profile`・`/roadmap`（Client Component、layout.tsx経由）：
  同様にページ固有の`title`・`canonical`が出力されている（layout.tsx方式が機能することを確認）
- `/profile/tax-returns`（親`/profile/layout.tsx`と子`/profile/tax-returns/layout.tsx`の
  metadataマージ）：`npm run build`で`○ /profile/tax-returns`として静的プリレンダリングが
  成功していることを確認した（`npm run dev`はTurbopackの再コンパイル負荷でメモリ閾値に達し
  リクエスト中に再起動が発生したため、本番相当の`next build`側の成功を根拠として採用した）
- `/result`：`title`が「診断結果 | SUNBOO経営ナビ」、かつ`<meta name="robots" content="noindex, follow">`が
  出力されていることを確認した（3節で理由を詳述）

### 2-4. OG画像・favicon

- `/opengraph-image`（1200×630）・`/icon`（64×64）・`/apple-icon`（180×180）はいずれも
  `Content-Type: image/png`で200を返すことを確認し、実際に画像を取得して目視確認した。
  ヘッダーの「S」ロゴバッジと同一のデザイン（Blue-600角丸背景＋白文字）で、新しいブランド要素は
  追加していない
- `/manifest.webmanifest`が正しいJSON（`name`/`short_name`/`icons`等）を返すことを確認した

### 2-5. `npx tsc --noEmit` / `npm run build`

```
npx tsc --noEmit → エラーなし
npm run build → ✓ Compiled successfully、TypeScriptエラー0
```

ビルド出力に`/robots.txt`・`/sitemap.xml`・`/icon`・`/apple-icon`・`/opengraph-image`・
`/manifest.webmanifest`が静的ルート（○）として追加され、既存32ルート（Phase7時点の26ルート＋
今回追加分）すべてがビルド成功することを確認した。

---

## 3. SEO対象ページ

`sitemap.xml`に含まれる10件。優先度はトップページを最高（1.0）とし、診断入口・手続き/機関一覧を
次点、申告実績・検索・ヘルプを補助的な扱いとした。

| ページ | パス | 優先度 |
|---|---|---|
| トップ | `/` | 1.0 |
| 会社情報を入力 | `/start` | 0.9 |
| 手続き一覧 | `/procedures` | 0.8 |
| 管轄機関一覧 | `/offices` | 0.7 |
| 年間ロードマップ | `/roadmap` | 0.7 |
| イベント登録 | `/events` | 0.6 |
| 会社プロフィール | `/profile` | 0.6 |
| 申告実績 | `/profile/tax-returns` | 0.5 |
| 検索 | `/search` | 0.5 |
| ヘルプ | `/help` | 0.4 |

## SEO対象外ページ

| ページ | 理由 |
|---|---|
| `/result` | クエリパラメータ（`pref`/`muni`/`emp`/`fm`/`corp`）依存で無数のURLが存在し、
  パラメータ無しでは空の薄いコンテンツになるため。sitemapから除外し、かつ`robots: { index: false }`を
  設定した（クロール自体は許可し、`follow`でリンクは辿らせる） |
| `/diagnosis`・`/form` | `/start`へのリダイレクトのみを行う廃止済みページ。ナビゲーションからも
  リンクされていない |
| `/admin`配下全体 | 税理士・会計事務所スタッフ向けの認証必須の管理画面。`robots.txt`で
  `Disallow: /admin`を設定しクロール自体を禁止 |
| `/share/[token]`配下 | 閲覧に有効なトークンが必要な非公開の共有ページ。`robots.txt`で
  `Disallow: /share`を設定 |

---

## 4. 公開URL・環境変数整理

| 変数 | 用途 | 現状 |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | robots/sitemap/canonical/OGの絶対URL生成（`src/lib/siteUrl.ts`） | 未設定（`.env.local.example`にプレースホルダーをコメントアウトで追記済み） |

### 本番URL切替方法

1. 本番ドメインが確定したら、Vercelのプロジェクト設定（Environment Variables）に
   `NEXT_PUBLIC_SITE_URL=https://（確定した本番ドメイン）`を追加する
2. 未設定の間は`src/lib/siteUrl.ts`が`VERCEL_URL`（Vercelが各デプロイに自動付与するURL）を
   自動的に使うため、プレビュー環境・本番環境のいずれでも robots/sitemap/canonical/OG が
   壊れた絶対URLを出力することはない
3. `NEXT_PUBLIC_SUPABASE_URL`・`NEXT_PUBLIC_SUPABASE_ANON_KEY`は本Phaseでは変更していない
   （既存の運用のまま）

---

## 5. 公開手順（本Phaseの範囲）

1. Vercelのプロジェクト設定で本番ドメイン・`NEXT_PUBLIC_SITE_URL`を確定させる
2. デプロイ後、`https://（本番ドメイン）/robots.txt`・`/sitemap.xml`・`/manifest.webmanifest`が
   正しい本番URLで返ることを確認する
3. Google Search Console等に本番ドメインを登録し、`sitemap.xml`を送信する（本Phaseのスコープ外、
   運営側の作業）
4. SNS共有カード（OGP）の表示確認：Facebook Sharing Debugger・X（Twitter）のカードバリデータ等で
   本番URLの`/opengraph-image`が正しく表示されることを確認する（本セッションからは外部サービスへの
   実際の送信確認はできない）

---

## Version 1.0で残る技術課題

1. **本番ドメイン自体の確定は本Phaseのスコープ外。** [docs/V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §6の
   「本番URL」「ドメイン」項目は、運営側がドメインを取得・Vercelに設定し、
   `NEXT_PUBLIC_SITE_URL`を設定するまで❌のまま残る（本ドキュメント4節の手順に従えば
   コード側の対応は完了している）
2. **Web Manifestのアイコンは192×192/512×512の専用アセットを用意していない。**
   既存の`icon.tsx`（64×64）・`apple-icon.tsx`（180×180）をそのまま流用しており、
   Chrome/Androidの「ホーム画面に追加」インストールバナー表示の推奨サイズ要件までは
   満たしていない。ブランド用の静的画像アセットが用意され次第、専用サイズのアイコンに
   差し替えることを推奨する
3. **`/result`のnoindex設定は本Phaseで追加したが、Google Search Console等での実際の
   クロール・インデックス除外の反映確認は本番ドメイン確定後でなければ実施できない**
4. **OGP画像のSNS上での実際の表示確認（Facebook/X等の外部キャッシュ）は、本番URLが
   確定してからでなければ実施できない。** 本ドキュメント2-4節はローカル環境での画像生成・
   HTTPヘッダーの確認に留まる
5. **`favicon.ico`（レガシーブラウザ向けの静的ファイル）は用意していない。**
   `icon.tsx`によるNext.js標準の動的favicon配信で現行ブラウザは問題なく対応できるが、
   `favicon.ico`を明示的に参照する古いクローラー・ツールへの対応が必要になった場合は
   `public/favicon.ico`の追加を別途検討する

---

レビュー待ちで停止します。
