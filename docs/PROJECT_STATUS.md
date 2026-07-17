# SUNBOO Project Status

**最終更新日**：2026-07-14
**現在フェーズ**：**Closed Beta**

> このドキュメントは「SUNBOOは今どこまで完成しているのか」を5分で把握するための唯一の入口
> （Project Dashboard）です。READMEより運営寄り、個別の設計書より概要寄りの位置づけとし、
> 詳細は各リンク先の一次ドキュメントを参照してください（本ファイルには詳細を書き写しません）。

---

## 1. 現在の完成状況

| 領域 | 状態 | 補足 |
|---|---|---|
| Engine（診断・ルール・Timeline/State） | ✅ 完成 | 診断エンジン・ルールエンジン・Timeline/State Engineはいずれも実装済みで安定稼働（[ARCHITECTURE.md](ARCHITECTURE.md)・[RULE_ENGINE.md](RULE_ENGINE.md)） |
| Procedure Master | 🟡 Beta改善中 | Phase15.2まで実装済みだが、福岡県の地方税窓口データ・必要書類データ（31手続き中13手続きのみ）に未整備分あり（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02・L-05） |
| Deadline Engine | ✅ 完成 | `calculateNextDeadline`はEngine全体で共通利用。既知の表示バグ（源泉所得税サイクルのConfidence）は解消済み（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-01） |
| Office Resolver | 🟡 Beta改善中 | 東京都渋谷区・福岡県72判定単位（自治体数60市町村）に対応。福岡県の一部窓口データが未整備（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02） |
| Company Profile | ✅ 完成 | [COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)、Workspace対応済み |
| Workspace（全体） | ✅ 完成 | 会社別Workspace・アクセス制御（`workspace_members`）まで実装済み。正式系（Primary）として運用中（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)） |
| ├ Dashboard | 🟡 Beta改善中 | 優先順位の再構成（今日のポイント）まで完了。通知センターとの役割分担は引き続き検討中（[SUNBOO_BRAND_EXPERIENCE_REVIEW.md](SUNBOO_BRAND_EXPERIENCE_REVIEW.md)） |
| ├ Annual Roadmap | 🟡 Beta改善中 | カード再設計済み（[SUNBOO_ROADMAP_CARD_REDESIGN_REVIEW.md](SUNBOO_ROADMAP_CARD_REDESIGN_REVIEW.md)）。設立系手続きが一覧から漏れる等の既知の制約が残る |
| ├ Procedure Status | ✅ 完成 | 出現回単位（`occurrence_key`）で再設計済み、StatusBadgeで表示統一済み |
| ├ Share | 🟡 Beta改善中 | 会社名優先の表示に改善済み。有効期限設定UIは未実装（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-03） |
| Excel出力 | ✅ 完成 | ファイル名サニタイズ含め安定稼働 |
| PDF出力 | ✅ 完成 | 月別グルーピング・手書きチェック欄・白黒印刷対応まで実装済み（直近で全面再設計済み） |
| Design System | 🟡 Beta改善中 | トークン・共通コンポーネント（PageHeader/InformationCard/StatusBadge等）は整備済みだが、ページ背景（WarmPaper）が未適用、一部画面（`/result`等）に旧配色が残存（[CLOSED_BETA_FINAL_REVIEW.md](CLOSED_BETA_FINAL_REVIEW.md)） |
| Accessibility | 🟡 Beta改善中 | コントラスト未達・見出し欠落など開始前必須の課題は解消済み（[ACCESSIBILITY_POLISH.md](ACCESSIBILITY_POLISH.md)）。印刷用スタイル等は今後の課題 |
| Closed Beta運営 | 🟡 Beta改善中 | 運営フレームワーク（Launch Plan／Runbook／観察記録／バックログ）は整備済み。実際の外部参加者セッションはこれから（[BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)） |

---

## 2. 現在の優先順位

1. **Closed Beta運営** — [BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)を使った実観察セッションの実施、結果の[BETA_BACKLOG.md](BETA_BACKLOG.md)への反映
2. **Blocker対応** — 現時点で既知のBlockerは0件（[BETA_BACKLOG.md](BETA_BACKLOG.md)）。検知次第最優先で対応
3. **High改善** — WarmPaper背景の適用漏れ、公開画面（特に`/result`）に残るBlue系配色、ブラウザ印刷への未対応（[CLOSED_BETA_FINAL_REVIEW.md](CLOSED_BETA_FINAL_REVIEW.md)）
4. **UX改善** — Dashboard内の情報の役割分担、Profileの情報量など、Medium相当の項目
5. **Brand Polish** — 装飾的な配色統一、文言の細部など、Low相当の項目

---

## 3. 次のマイルストーン

```
Closed Beta（現在地）→ Open Beta → 正式リリース → Version 2
```

- **Closed Beta**（現在）：税理士・会計事務所スタッフ・社長を対象に、招待制・少人数（1〜3名・1〜5社規模）で運用中
- **Open Beta**：Closed Betaで検出したBlocker/Highが解消し、外部参加者の反応が一定水準に達した段階で判断
- **正式リリース**：[ROADMAP.md](ROADMAP.md) v1.0「福岡県版正式リリース」に対応。有料化・対応市区町村の精度検証等、着手時に要件整理が必要
- **Version 2**：補助金・助成金対応（v0.7）、会計データ連携、通知の外部配信（メール・Slack・LINE等）といった、現時点で設計のみ・未着手の構想群

---

## 4. 主要ドキュメント

網羅的な一覧ではなく、各カテゴリの入口となるドキュメントのみを挙げる（全ファイルは`docs/`参照）。

| カテゴリ | ドキュメント |
|---|---|
| **Vision** | [VISION.md](../VISION.md)（Mission/Vision/Principles）、[PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)（プロダクト全体の要点） |
| **Architecture** | [ARCHITECTURE.md](ARCHITECTURE.md)、[DATABASE.md](DATABASE.md)、[RULE_ENGINE.md](RULE_ENGINE.md)、[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)、[WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md) |
| **Design** | [SUNBOO_DESIGN_GUIDELINES.md](SUNBOO_DESIGN_GUIDELINES.md)（トーン・トークンの正本）、[SUNBOO_BRAND_EXPERIENCE_REVIEW.md](SUNBOO_BRAND_EXPERIENCE_REVIEW.md)（最新の適用状況） |
| **Beta** | [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)（運営方針の正本）、[CLOSED_BETA_DAY1_RUNBOOK.md](CLOSED_BETA_DAY1_RUNBOOK.md)（初日手順）、[BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)（観察記録）、[BETA_BACKLOG.md](BETA_BACKLOG.md)（フィードバック集約） |
| **Quality** | [CLOSED_BETA_FINAL_REVIEW.md](CLOSED_BETA_FINAL_REVIEW.md)（β開始前最終監査）、[ACCESSIBILITY_POLISH.md](ACCESSIBILITY_POLISH.md)、[V1_RELEASE_CANDIDATE_REVIEW.md](V1_RELEASE_CANDIDATE_REVIEW.md) |
| **Release** | [ROADMAP.md](ROADMAP.md)（v0.1〜v1.0の実装バージョン一覧） |

---

## 5. リリース履歴（Sprint60以降）

実際のコミット順に、直近の主要な取り組みを1行ずつ記載する。

| 取り組み | 概要 |
|---|---|
| Beta First Experience | Closed Beta参加者が初回5分で「何をするサービスか」を理解できるかを監査（[BETA_FIRST_EXPERIENCE_REVIEW.md](BETA_FIRST_EXPERIENCE_REVIEW.md)） |
| Guided Beta Onboarding | Workspace新規登録・Profile・Roadmap・共有ページ等に初回利用者向けの案内を追加 |
| Printable PDF | 年間ロードマップPDFを、月別グルーピング・大きな期限表示・手書きチェック欄・白黒印刷対応で全面再設計 |
| Design Guidelines | SUNBOOの正式デザイン言語（Warm Paper／MorningSun／静けさ）を定義（[SUNBOO_DESIGN_GUIDELINES.md](SUNBOO_DESIGN_GUIDELINES.md)） |
| Design Tokens | カラー・タイポグラフィ・余白・角丸・影のDesign Tokensを追加（既存UIへの適用はまだ） |
| Shared UI | `.card`/`.btn-primary`等の共通クラスをDesign Tokensへ接続 |
| Roadmap Card | SUNBOOの代表コンポーネントを「期限最優先」の構造に再設計（[SUNBOO_ROADMAP_CARD_REDESIGN_REVIEW.md](SUNBOO_ROADMAP_CARD_REDESIGN_REVIEW.md)） |
| Interactive Controls | トグル・セグメントコントロール・Status Badgeを共通コンポーネント化（[SUNBOO_INTERACTIVE_CONTROLS_REVIEW.md](SUNBOO_INTERACTIVE_CONTROLS_REVIEW.md)） |
| Brand Experience | Page Header・Information Cardの統一、Dashboard最上部の情報優先順位を再構成（[SUNBOO_BRAND_EXPERIENCE_REVIEW.md](SUNBOO_BRAND_EXPERIENCE_REVIEW.md)） |
| Closed Beta Review | β開始前の最終品質レビュー。Critical 0件・High 4件・Medium 6件・Low 3件を検出し「条件付きGO」と判定（[CLOSED_BETA_FINAL_REVIEW.md](CLOSED_BETA_FINAL_REVIEW.md)）※ |
| Accessibility Polish | コントラスト未達・見出し欠落という開始前必須の2件を解消し、「GO」に再判定（[ACCESSIBILITY_POLISH.md](ACCESSIBILITY_POLISH.md)）※ |
| Beta Operations | 外部参加者向けの観察記録テンプレートを整備し、既存のβ運営フレームワークに統合（[BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)）※ |

※ Closed Beta Review・Accessibility Polish・Beta Operationsの3件は、作業自体は完了しているが本ファイル
更新時点ではまだgitコミットされていない（`git status`で確認可能）。

---

## 6. 技術構成

| 項目 | 内容 |
|---|---|
| Framework | Next.js 16（App Router / Turbopack）、React 19、TypeScript |
| Database | Supabase（PostgreSQL + Auth、RLSで全テーブル保護） |
| Hosting | Vercel |
| UI | Tailwind CSS v4、lucide-react、SUNBOO Design Tokens（自社デザインシステム） |
| PDF / Excel | pdfmake（年間ロードマップPDF）、exceljs（Excel出力） |

---

## 7. プロジェクト原則

---

SUNBOOは
行政手続きを管理するためのソフトではない。

経営者と税理士が、
一年を安心して過ごすための
「行政手帳」である。

迷わせない。

不安を煽らない。

必要なことだけを、
必要なタイミングで届ける。

静かで、

温かく、

信頼できる体験を提供する。

---
