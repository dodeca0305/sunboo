# ROADMAP.md — SUNBOO ロードマップ

v0.1〜v0.5は実装済み（本ドキュメント作成時点、Phase 1〜2.5に対応）。v0.6以降は未着手の構想であり、
着手前に必ず要件整理・設計を行うこと（[CLAUDE.md](../CLAUDE.md)の開発フロー参照）。

## v0.1 基盤 ✅ 完了

- Next.js 16 + Supabase + Tailwind v4の基本構成
- `prefectures` / `municipalities` / `jurisdiction_offices` / `procedures` / `procedure_documents` /
  `official_links` の6テーブル
- 診断エンジン（`runDiagnosis`）と`/start` → `/result`フロー
- 対応エリア: 東京都渋谷区のみ、手続き10件、管轄機関6件
- 管理画面の基盤（Supabase Auth + `admin_users`、管轄機関/手続きCRUD、CSV入出力）

## v0.2 福岡県対応 ✅ 完了

- 行政機関マスターを`organization_types` / `organizations` / `organization_offices` / `jurisdictions`
  （多対多）へ正規化。旧`jurisdiction_offices`は残置・非参照化
- 福岡県60市区町村・法務局2／税務署18／年金事務所11／労基署12／ハローワーク17を投入
- 「法務・登記」カテゴリ（株式会社/合同会社設立登記・役員変更登記など10手続き）を追加
- UIをNotion/Linear風の「静かなB2B SaaS」デザインへ全面リニューアル

## v0.3 今日やること ✅ 完了

- 診断結果画面を「情報の一覧」から「今日/今週/今月/今後やることリスト」へ再設計
- 未着手/進行中/完了のステータス管理（`localStorage`、アカウント不要）
- 手続き完了率スタットタイル

## v0.4 イベントエンジン ✅ 完了

- `event_types` / `company_events` / `event_procedures`（後にv0.5で置き換え）
- `/events`ページ：会社情報登録（初回のみ）→イベント選択→登録の最小フロー
- 対応イベント: 会社設立・従業員採用・役員変更
- `procedures.timing_data.days_from_event`を使った実際の期限計算を初めて実用化
  （起算日が無く計算不可だった`at_establishment`/`event_based`タイプの手続きに、実際の`event_date`を供給）

## v0.5 ルールエンジン ✅ 完了

- `rules` / `rule_conditions` / `rule_actions`による汎用条件評価
- `event_procedures`固定マッピング＋TypeScript側のハードコードされた`corporate_type`フィルタを置き換え
- アクション種別: 手続き追加・警告表示・提出先変更・期限変更
- `/admin/rules`でルールをCRUD可能に
- 詳細: [RULE_ENGINE.md](RULE_ENGINE.md)

---

## v0.6 年間スケジュール（未着手）

**狙い**: 「今日やること」（Phase 1.6）は単発の診断・イベント結果に閉じている。年次・月次で繰り返し発生する
手続き（源泉所得税の毎月納付、算定基礎届、労働保険年度更新、年末調整等）を含め、1年間を通じたカレンダー
ビューとして提示する。

検討が必要な点（設計フェーズで詰めること）:
- 繰り返し発生する手続き（`frequency = monthly` / `annual`）を、単発の`company_events`と同じ「やることリスト」に
  どう統合するか（診断エンジン側の`procedures`は既にfrequencyを持っている）
- 会社プロフィール（`company_events`に非正規化されている）を年間ビューでどう束ねるか。永続的な会社エンティティ
  （現状は意図的に作っていない、[DATABASE.md](DATABASE.md)参照）が必要になる可能性がある

## v0.7 補助金・助成金（未着手）

**狙い**: `docs/開発指示書_v1.md`（Phase 1計画時点のメモ）や`README.md`の「将来の拡張計画」に構想はあるが、
実装は未着手。会社プロフィール（所在地・従業員数・法人種別・業種）に合致する補助金・助成金を、
手続きと同様に管轄機関×条件で判定できるようにする構想。**ルールエンジン（v0.5）の`condition`評価は
そのまま転用できる可能性が高い**（`rule_actions`に新しい`action_type`を追加する形、または`procedures`とは
別に`subsidies`テーブルを設けてルールエンジンから参照する形、のいずれかを設計フェーズで検討する）。

## v0.8 顧問先管理（未着手）

**狙い**: 税理士・社労士事務所が複数の顧問先企業を一括管理できるようにする。現状SUNBOOは一般ユーザーに
アカウント機能が無く、`company_events`もブラウザ単位の`browser_id`でしか束ねられていない
（[DATABASE.md](DATABASE.md)の`company_events`参照）。このフェーズで初めて「永続的な会社エンティティ」と
「事務所アカウント」が必要になる見込み。認証機構の追加（一般ユーザー向けSupabase Auth、または別方式）を
含む大きな設計判断が必要。着手前に必ずユーザーと設計方針を確認すること。

## v0.9 AI参謀β（未着手）

**狙い**: 蓄積された会社データ・手続き履歴・ルール判定結果をもとに、AIが経営者に能動的な助言を行う機能。
本ドキュメント整備（Phase 2.6）自体が、このフェーズに向けた「AIが読める設計資産」を残す準備という位置づけ。
着手時は既存のルールエンジンの`context`／`rules`データをAIの判断材料としてどう連携するかが論点になる。

## v1.0 福岡県版正式リリース（未着手）

**狙い**: 東京都渋谷区・福岡県全域という現状の対応エリアのうち、福岡県を軸に正式リリースする。
リリース判定基準（有料化するかどうか、対応市区町村の精度検証、`procedure_organizations`等の未参照テーブルの
扱いをどうするか等）は着手時に改めて要件整理すること。
