# CLAUDE.md — SUNBOO経営ナビ 開発ルール

このファイルは、このリポジトリ（`sunboo/`）で作業するClaude Codeセッション向けの開発ルールです。
プロダクトの思想・全体像は [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) を、システム構成は
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) を、DB構造は [docs/DATABASE.md](docs/DATABASE.md) を、
ルールエンジンの詳細は [docs/RULE_ENGINE.md](docs/RULE_ENGINE.md) を参照してください。

## 守るべき思想

SUNBOOは**長期運用を前提としたプロダクト**です。速度より保守性・拡張性・実務品質を優先してください。
[VISION.md](VISION.md) の原則（調べる時間をなくす／やるべきことが分かる／一つにまとめる／現場が正しい／小さく作る）
に反する提案（過剰な抽象化、憶測に基づく機能追加、実務データの検証なしの断定）はしないこと。

このサービスは会計ソフトでも士業の代替でもない。**行政手続きの「情報を見る／自動生成する」サービス**であり、
記帳・電子申告・法的助言そのものは提供しない。手続き内容に関する記述には必ず「一般的な参考情報」である旨と
専門家への確認を促す注意書きを添えること（既存の`caution_note`パターンを踏襲する）。

## 開発フロー（必須）

機能追加・修正を行う前に、必ず以下の順で進めること。

1. **要件整理** — 何を・誰のために・なぜ作るかを言語化する
2. **設計** — 既存のアーキテクチャ（診断エンジン／経営イベントエンジン／ルールエンジン）のどこに位置づくかを決める。新しい概念を追加する前に、既存のテーブル・関数で表現できないか検討する
3. **DBへの影響確認** — 新規テーブル/カラムの要否、RLS/GRANTの設計（下記「DB変更時の注意」）
4. **既存機能への影響確認** — 変更する関数・コンポーネントが他のどこから参照されているかをGrepで確認する。特に `src/lib/diagnosis.ts` の `calculateNextDeadline` / `resolveOffices`、`src/app/(site)/result/ScheduleList.tsx` は診断エンジン・経営イベントエンジンの両方から使われる共通部品なので、シグネチャ変更時は両方の呼び出し元を確認する
5. **実装**
6. **Build確認** — `npm run build` を実行し、TypeScriptエラー0・全ルートのビルド成功を確認する
7. **Playwright確認** — 実際にブラウザを操作して機能が動くことを確認する（下記「Playwright確認ルール」）

速度より品質を優先し、上記を省略しないこと。

## UIルール

- デザイントーンは **Notion / Linear 風の「静かなB2B SaaS」**。白背景・ほぼ黒文字・Blue-600（`#2563EB`）のみアクセント。
  グラデーション・ガラス風・強い影・絵文字は使わない
- 共通クラスは `src/app/globals.css` の `.card` / `.btn-primary` / `.btn-secondary` / `.tag` / `.form-input` / `.form-select` / `.form-label` を使う。個別コンポーネントでスタイルを再発明しない
- アイコンは `lucide-react` のみ
- カテゴリ・ステータスの色分けは行わない（モノクロの `.tag` に統一）。エラー・期限超過など明確な警告のみ赤系、注意喚起は amber系を使う
- 一般ユーザー向け画面（`(site)` route group）と管理画面（`admin/(protected)`）は完全に別デザイン文脈。管理画面はテーブル＋フォーム中心のシンプルな業務画面でよい
- 新しいpublicページを追加するときは、`src/app/(site)/layout.tsx` のヘッダー・フッター両方にナビリンクを追加する

## DB変更時の注意

- **全テーブルにRLSを設定し、`anon`ロールへの`GRANT SELECT`を忘れないこと。** 過去に `organization_types` 等・`event_types` 等でGRANT/RLS設定を後から追加する事故が複数回発生している（[docs/DATABASE.md](docs/DATABASE.md) 参照）。新しいマイグレーションファイルには、テーブル定義と同じファイル内で必ず GRANT + RLS + policy をセットで書くこと
- **管理画面から書き込むテーブルは `admin_users` 照合ポリシーを `admin_schema.sql` と同じパターンで書く。** `admin_users` テーブルが未作成の環境でも安全に動くよう `IF EXISTS (SELECT 1 FROM information_schema.tables ...)` でガードすること（既存マイグレーションを参照）
- **一意性が必要なシードデータには必ずUNIQUE制約を張り、`ON CONFLICT` を効かせること。** `rules.name` にUNIQUE制約を付け忘れ、マイグレーションを複数回実行してルールが増殖した実例がある（[docs/RULE_ENGINE.md](docs/RULE_ENGINE.md) 参照）。「再実行しても安全」とコメントに書く場合は、実際に2回実行しても副作用がないことを自分で検証すること
- マイグレーションファイルは `supabase/` 直下に置き、ファイル名の先頭に `migration_` を付ける。既存テーブルへの列追加は `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` で書き、`schema.sql` 本体は初回投入用として極力触らない
- 旧テーブル（例: `jurisdiction_offices`、`event_procedures`）は、新設計に置き換えた後も基本的に**即座には削除しない**。ロールバック安全性のため残置し、コメントで「新設計に置き換え済み・アプリコードからは未参照」と明記する
- DBの実DDLはこのセッションからは実行できない（anon keyのみ・service role keyなし）。マイグレーションSQLを書いたら、ユーザーにSupabase SQL Editorでの実行を依頼し、実行後にPlaywrightで反映を確認すること

## データ取得の方針

- 一般ユーザー向け・管理画面ともに、**Supabase-jsをブラウザ/サーバーコンポーネントから直接呼び出す**方針で統一している（API Routesは使っていない）。この方針を崩さないこと
- 一般ユーザー向けは `src/lib/supabase.ts`、管理画面は `src/lib/supabase/browser.ts`（クライアント）・`src/lib/supabase/server.ts`（サーバー、Cookieセッション）を使う。混同しないこと
- DBデータをそのまま表示する公開一覧・検索ページを新設する際は `export const dynamic = 'force-dynamic'` の要否を検討する（詳細は [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)）

## コーディング規約

- 金額を扱う場合は `Decimal.js` 等を使い `float` 演算を避ける（現状SUNBOOは金額を扱っていないが、将来の補助金・決済機能で必須）
- 日付はISO 8601（`YYYY-MM-DD`）で保持し、表示時のみ日本語形式に変換する
- コメントは「なぜそうしたか」が非自明な場合にのみ書く。「何をしているか」は書かない
- 3行程度の重複より過剰な抽象化を避ける。ただし、診断エンジンと経営イベントエンジンで共通する処理（管轄機関解決・期限計算・`ProcedureResult`→`ScheduleProcedure`変換）は必ず共通関数として `src/lib/` に置き、両方から呼ぶこと（重複させない）

## Build / Playwright確認ルール

- 変更後は必ず `npm run build` を実行し、`✓ Compiled successfully` と `TypeScriptエラー0` を確認する
- `npm run lint`（`next lint`）は現状プロジェクト設定の問題で動作しない既知の問題があるため、lintエラーの確認は必須要件にしない（気づいたら直してよいが、ブロッカーにはしない）
- UIやDBに関わる変更は、`npm run dev` でローカルサーバーを起動し、**Playwrightで実際にブラウザ操作して確認する**。このプロジェクトにはPlaywrightのnpm依存はまだ無いため、`npx playwright install chromium` 相当でキャッシュされたChromiumを直接 `playwright-core` から起動して確認する運用にしている
- DBマイグレーションを伴う変更は、ユーザーがSupabase側で実行した後でなければ実際の動作確認ができない。ビルド確認だけで「完了」と報告せず、マイグレーション未実行の場合はその旨を明記してユーザーに依頼すること
- 管理画面の変更を確認する際は、実際にログインしてCRUD操作（作成・編集・削除）を行い、DBへの反映と公開画面側への反映（該当する場合）まで確認すること。フォームの見た目だけの確認で済ませない

## 参照ドキュメント一覧

| ファイル | 内容 |
|---|---|
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Mission/Vision、完了済みPhase、現在の状態、ロードマップ概要 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | システム全体構成、主要ディレクトリ・ページ、データ取得方針 |
| [docs/DATABASE.md](docs/DATABASE.md) | 全テーブルの役割と関係性 |
| [docs/RULE_ENGINE.md](docs/RULE_ENGINE.md) | ルールエンジンの設計・評価フロー・拡張方針 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | v0.1〜v1.0のロードマップ |
| [VISION.md](VISION.md) | Mission / Vision / Principles |
| [README.md](README.md) | セットアップ手順（Phase 1時点の記述が中心、一部現状と差異あり） |
