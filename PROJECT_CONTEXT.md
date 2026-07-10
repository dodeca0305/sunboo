# PROJECT_CONTEXT.md — SUNBOO経営ナビ

このドキュメントは、SUNBOOというプロダクトが「何のために・どこまで進んでいて・次に何をするか」を
新しいセッション（人間・Claude Code問わず）が最短時間で把握できるようにするためのものです。

## Mission / Vision / Position

Mission・Visionの正本は [VISION.md](VISION.md) にあります。要点：

- **Mission**: 経営者の時間を取り戻す
- **Vision**: 経営の骨組みをつくる
- **Long Term**: 世界で一番、経営者の時間を生み出すプラットフォームになる

### Position（このサービスは何であり、何でないか）

SUNBOOは「行政手続きの情報を見る／自動生成するサービス」です。以下は明確にスコープ外とする（作らない）：

- 仕訳入力・記帳機能（会計ソフトの代替ではない）
- 電子申告・電子申請の代行実行（公式の電子申請システムへの**リンク**は提供するが、代理送信はしない）
- 士業（税理士・社労士・司法書士）の代替（`caution_note` で必ず専門家への確認を促す）
- ユーザーアカウント・ログイン（`/admin` を除く。一般ユーザー側は今もアカウント無し・ブラウザ単位）

### 想定ユーザー

法人を設立したばかりの経営者、顧問税理士・社労士がいない中小企業。「何を、いつまでに、どこへ提出するか」が
分からず調べる時間を失っている層。

## 完了済みPhase

実装順・実際にリリース済みの内容ベースで記載する（`docs/開発指示書_v1.md` は初期計画時点のメモであり、
実際の進行とは細部が異なる）。

### Phase 1 — MVP（東京都渋谷区）
会社所在地・従業員有無・決算月を入力すると、管轄機関・必要手続き・期限・公式リンクを一覧表示する診断エンジンの原型。
`prefectures` / `municipalities` / `jurisdiction_offices` / `procedures` / `procedure_documents` / `official_links` の
6テーブル構成。対応エリアは東京都渋谷区のみ。

### Phase 1（続き） — 管理画面（Admin）
`/admin` 配下に管理画面を新設。Supabase Auth（メール・パスワード）＋ `admin_users` テーブルによる認可。
管轄機関・手続きのCRUD、リンク健全性チェック、CSVインポート/エクスポートを実装。

### Phase 1.5 — 行政機関マスター再構築 ＋ 福岡県対応
`jurisdiction_offices`（1市区町村=1行、機関の重複あり）を、`organization_types` / `organizations` /
`organization_offices` / `jurisdictions`（多対多）の正規化構造へ再設計。福岡県60市区町村・法務局2／税務署18／
年金事務所11／労基署12／ハローワーク17を投入。旧`jurisdiction_offices`は削除せず残置。
「法務・登記」カテゴリ（株式会社/合同会社設立登記、役員変更登記など10手続き）を追加。

### Phase 1.6 — 「今日やること」ダッシュボード化
診断結果画面を「情報の一覧」から「今日/今週/今月/今後やることリスト」へ再設計。期限までの日数で自動振り分け、
未着手/進行中/完了のステータス管理（ブラウザのlocalStorage、アカウント不要）、手続き完了率スタットタイルを追加。

### Phase 2 — 経営イベントエンジン
「会社情報から手続きを表示するサービス」から「会社で起きた出来事（イベント）から必要手続きを自動生成するサービス」
へ進化。`event_types` / `anonymous_company_events` / `event_procedures` の3テーブルを追加し、`/events` ページで
会社設立・従業員採用・役員変更の3イベントを登録すると、必要手続き・提出先・期限が自動生成されるようにした。
`procedures.timing_data.days_from_event` は元々存在したが、起算日（実際のイベント発生日）が無く常に計算不可
だった期限計算を、このPhaseで初めて実用化した。

### Phase 2.5 — ルールエンジン
Phase 2で作った「イベント→固定の手続き生成」（`event_procedures` 固定マッピング＋TypeScript側のハードコードされた
`corporate_type` フィルタ）を、`rules` / `rule_conditions` / `rule_actions` による汎用ルール評価に置き換えた。
条件（法人種別・従業員有無・地域・イベント種別など）と実行内容（手続き追加・警告表示・提出先変更・期限変更）を
DBデータとして管理画面（`/admin/rules`）から編集できるようにし、TypeScript側のハードコードを排除した。
詳細は [docs/RULE_ENGINE.md](docs/RULE_ENGINE.md)。

### Phase 2.6 — 設計資産化
機能追加を一旦止め、保守・拡張・将来のAI参謀化に備えて設計ドキュメント一式（本ファイル、
[CLAUDE.md](CLAUDE.md)、`docs/` 配下）を整備。

### Phase 3（Sprint22〜27）— Company Workspace化
SUNBOOの主利用者を「経営者本人（匿名・ブラウザ単位）」から「管理者・税理士が顧問先ごとに代行管理する」
モデルへ転換。`/admin/workspaces` 配下に、顧問先一覧・会社別Workspace（Profile / Annual Roadmap /
Documents / Share の4タブ）・Dashboard（今日やること／期限警告／意思決定／進捗サマリー／AI参謀／会社概要）・
経営者への共有リンク（ログイン不要のトークン方式）を実装。診断エンジン・Rule Engine・Timeline/State/
Annual Roadmap Engineは「渡されたデータに対する純粋関数」の設計を維持したまま、データの出どころを
localStorageからDB（`workspace_*`テーブル）に差し替える形で構築した。詳細は
[COMPANY_WORKSPACE.md](docs/COMPANY_WORKSPACE.md)（設計）・各Sprintの実装。

### Phase 4（Sprint28〜29）— アーキテクチャレビュー・移行戦略確定
Phase 3で急速に進んだWorkspace化に対し、実コード・migration・git historyを直接確認した棚卸しを実施。
技術的負債・重複・Workspace単位のアクセス制御の欠如・データモデルの周期性課題を特定し
（[ARCHITECTURE_REVIEW_SPRINT28.md](docs/ARCHITECTURE_REVIEW_SPRINT28.md)）、`/admin/workspaces/*`を
正式系、`(site)`配下を互換・検証用と位置づける方針を確定した
（[WORKSPACE_MIGRATION_STRATEGY.md](docs/WORKSPACE_MIGRATION_STRATEGY.md)）。本ドキュメント自体も
この2つのレビューを受けて更新している。

## 現在の状態（2026-07-10時点、Sprint29で同期）

- **技術スタック**: Next.js 16（App Router / Turbopack）、TypeScript、Tailwind CSS v4、Supabase
  （PostgreSQL + Auth）、lucide-react、Papa Parse。ホスティングはVercel想定
- **対応エリア**: 東京都渋谷区（Phase 1）＋ 福岡県全域60市区町村（Phase 1.5）
- **一般ユーザー向けページ（(site)配下、匿名・ブラウザ単位）**: `/`（トップ）、`/start`（診断フォーム）、
  `/result`（診断結果・今日やることダッシュボード）、`/events`（経営イベント登録）、`/profile`（会社プロフィール編集）、
  `/profile/tax-returns`（決算実績）、`/roadmap`（年間ロードマップ）、`/procedures`（手続き一覧）、
  `/offices`（管轄機関一覧）、`/search`（横断検索）。**Sprint29で「互換・検証用」に位置づけを確定**
  （新機能追加は停止、バグ修正のみ。`/start`・`/result`のみ匿名リード獲得の独立した役割として存続。
  詳細は[WORKSPACE_MIGRATION_STRATEGY.md](docs/WORKSPACE_MIGRATION_STRATEGY.md)）
- **顧問先管理画面（`/admin/workspaces`配下、Supabase Auth必須）**: 顧問先一覧・新規登録・会社別
  Workspace（Dashboard / Profile / Annual Roadmap / Documents / Share）・経営者への共有リンク発行。
  **Sprint29で正式系（Primary）と位置づけを確定**。今後の新機能は原則こちらにのみ実装する
- **既存の管理画面（手続きマスタ管理）**: `/admin` 配下。ダッシュボード、管轄機関CRUD、機関種別CRUD、
  手続きCRUD、ルールCRUD、リンクチェック、CSVインポート/エクスポート（Workspace機能とは別区画）
- **認証**: 一般ユーザー側（`(site)`）は認証なし（匿名・ブラウザ単位のlocalStorageで完了ステータス等を管理）。
  管理画面（既存の手続きマスタ管理・Workspace管理いずれも）はSupabase Auth + `admin_users` 許可リストで保護。
  **既知の制約**: `admin_users`はロールを持たないフラットな全権リストであり、Workspace単位のアクセス制御
  （どの管理者がどの顧問先を担当するか）は未実装（Sprint31で対応予定）
- **データ取得方式**: API Routesは使わず、Supabase-jsをブラウザ/サーバーコンポーネントから直接呼び出す方式で統一
- **未着手・既知の制約**:
  - 東京都・福岡県以外の都道府県は未対応
  - `procedure_organizations` テーブルは定義済みだがアプリコードから未参照（将来、1手続き複数提出先対応に使う想定）
  - `README.md` はPhase 1時点の記述が多く残っており、現状と一部乖離がある（セットアップ手順自体は有効）
  - `next lint` がプロジェクト設定の問題で動作しない既知の問題がある
  - Workspaceの手続きステータス・書類ステータスは年度・出現回を区別できない（Sprint30で再設計予定、
    詳細は[ARCHITECTURE_REVIEW_SPRINT28.md](docs/ARCHITECTURE_REVIEW_SPRINT28.md) 6-2節）
  - Workspace単位のアクセス制御が未実装（Sprint31で対応予定、同ドキュメント5-2節）

## 今後のロードマップ

詳細は [docs/ROADMAP.md](docs/ROADMAP.md) を参照。概要：

v0.1（基盤）→ v0.2（福岡県対応）→ v0.3（今日やること）→ v0.4（イベントエンジン）→
v0.5（ルールエンジン）→ v0.6（年間スケジュール）→ v0.9（AI参謀β）→ v0.14（Timeline Engine）→
v0.15（State Engine）→ v0.16（Annual Roadmap Engine）→ v0.17（Company Workspace）→
v0.18（Architecture Review & Migration Strategy）→ v0.7（補助金・助成金、未着手）→
v0.8（顧問先管理、v0.17へ統合済み）→ v1.0（福岡県版正式リリース、未着手）

v0.1〜v0.6・v0.9・v0.14〜v0.18はSprint29時点で実装済み（v0.17 Company Workspaceは10タブ構成のうち
4タブ・Dashboard・共有機能が実装済みで、Tax Return Profile・Events・Accounting Data・Financial Analysis・
4段階権限モデルは未実装）。Sprint30以降の推奨順序（周期的ステータス再設計→アクセス制御→
データ取得共通化→Tax Return Profile対応）は[ROADMAP.md](docs/ROADMAP.md)・
[WORKSPACE_MIGRATION_STRATEGY.md](docs/WORKSPACE_MIGRATION_STRATEGY.md)を参照。v0.7・v1.0は未着手。
