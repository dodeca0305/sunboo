# V1_RELEASE_PLAN.md — Version 1.0 Release Plan（Phase3）

> **ステータス：ドラフト（Phase3「Version 1.0 Release Plan」成果物）**
> コードは一切変更していない。本ドキュメントは実装計画ではなく、**「Version 1.0を公開してよいと
> 判断するための条件」を1箇所にまとめたリリース準備計画書**である。
>
> **役割の切り分け**：[ROADMAP.md](ROADMAP.md)は「各バージョンで何を実装したか」の実装履歴、
> [PROJECT_STATUS.md](PROJECT_STATUS.md)は「今どこまで完成しているか」を5分で把握する入口。
> 本ドキュメントはそのどちらでもなく、**「あと何が揃えばVersion 1.0を公開してよいか」という
> 判定基準そのもの**を扱う。実装状況の詳細はROADMAP.mdへ、完成度の概観はPROJECT_STATUS.mdへ
> リンクするに留め、ここでは重複記載しない。
>
> レビュー待ちで停止する。

---

## 1. 現在地

**現在フェーズ**：Closed Beta

### 完了済み

- Engine全体（診断エンジン・ルールエンジン・Timeline/State/Annual Roadmap Engine）は実装済みで安定稼働
- Company Workspace（会社別ワークスペース・4テーブル + アクセス制御）が正式系として稼働中
- Excel/PDF出力、共有リンク発行は実装済み・動作確認済み
- SUNBOO Design System（トークン・共通コンポーネント）・Closed Beta開始前必須のアクセシビリティ修正
  （[ACCESSIBILITY_POLISH.md](ACCESSIBILITY_POLISH.md)）は完了し「GO」判定済み
- β運営フレームワーク（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)・
  [CLOSED_BETA_DAY1_RUNBOOK.md](CLOSED_BETA_DAY1_RUNBOOK.md)・
  [BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)・[BETA_BACKLOG.md](BETA_BACKLOG.md)）は
  整備済み。RC1向けの実行スクリプト（10ステップ×記録形式）も準備完了

### 未完了

- **実際の外部参加者（税理士／会計事務所スタッフ／経営者）によるClosed Betaセッションは、
  本ドキュメント作成時点でまだ1件も実施されていない。** [BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)は
  実行可能な状態で準備済みだが、記録欄はすべて空欄のまま
- [CLOSED_BETA_FINAL_REVIEW.md](CLOSED_BETA_FINAL_REVIEW.md)（Sprint86）が「開始後で良い」とした
  High 3件（H-1 WarmPaper背景未反映／H-2 Blue-600残存／H-4 `@media print`未対応）が未着手のまま。
  **これらは[BETA_BACKLOG.md](BETA_BACKLOG.md) §2 Highへまだ転記されておらず**、現状
  `BETA_BACKLOG.md`側の集計だけを見ると「High 0件」に見えてしまう乖離がある（§2で詳述）
- `BETA_BACKLOG.md` Medium 2件（M-02 福岡県地方税窓口データ・M-03 共有リンク有効期限UI）・
  Low 4件（L-01・L-02・L-03・L-05）がConfirmed/Openのまま未対応
- v1.0の対象地域・有料化方針の判定基準は、[ROADMAP.md](ROADMAP.md) v1.0節が明記する通り
  「着手時に要件整理」のまま未確定
- アプリケーション独自の利用ログ・分析基盤が存在しない（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)
  19節、`src/lib/analytics.ts`は開発環境専用スタブ）。§3で詳述する通り、Beta Success Metricsの一部は
  現状測定手段そのものが無い

---

## 2. Release Criteria（Version 1.0 公開条件）

以下は本ドキュメントで新たに整理する提案であり、確定済みの合意事項ではない。既存文書に定義済みの
基準（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節・25節・26節）を土台とし、
Version 1.0公開という新しいゲートに合わせて拡張した。**特に「Closed Beta参加社数」「継続率」は
数値の妥当性を含めユーザーの確認が必要。**

| 条件 | 基準 | 根拠・備考 | 現状 |
|---|---|---|---|
| Blocker | 0件 | [BETA_BACKLOG.md](BETA_BACKLOG.md) §1、[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節の重大障害定義と同一 | 0件（未達成ではなく「該当なし」。ただし実セッション未実施のため実証されていない） |
| High | 0件（Backlog上） | `BETA_BACKLOG.md` §2の集計値 | **表面上0件だが要注意**：`CLOSED_BETA_FINAL_REVIEW.md`のH-1/H-2/H-4が未転記のため、実質的な未解決Highは3件ある（§1参照） |
| Closed Beta実施規模 | （要確認）ユーザー例示は「5社以上」 | 現行の[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) §3は「対象人数1-3名・対象顧問先1-5社・期間2週間」を1ラウンドの規模として定義しており、「5社以上」はこの上限に近い。1ラウンドで満たすか、複数ラウンド実施を要するかは要判断 | 0社（実セッション未実施） |
| 継続利用意向 | （要確認）ユーザー例示は「継続率80%以上」 | 既存計画の成功指標（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 25節）は「実務の一部として使い続けたい、という定性的な肯定的反応が得られる」であり、定量的な継続率の定義・計測方法はまだ無い。80%という閾値を採用する場合、何を分母・分子にするか（参加社数中の継続希望社数、等）を決める必要がある | 未計測（計測方法自体が未定義） |
| 重大障害 | 0件（β期間中） | [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節の定義をそのまま使用 | 0件（実セッション未実施のため未検証） |
| 23節「既知の制約」の扱い | 実務上のブロッカーとして報告されないこと | 同計画23節の表（withholdingTaxCycle表示・共有リンク無期限・外部push無し等）が該当 | 未検証（実セッション未実施） |
| v1.0対象地域・有料化方針 | 要件整理の完了 | [ROADMAP.md](ROADMAP.md) v1.0節が要求 | 未着手 |

---

## 3. Beta Success Metrics

以下は「あれば公開判断に有用な指標」の一覧であり、**現状すべてが測定可能なわけではない**。
[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 19節が明記する通り、SUNBOOには
アプリケーション独自の利用ログ・分析基盤が無い（`src/lib/analytics.ts`は開発環境限定の
`console.debug`スタブ）。指標ごとに現実的な取得方法を分けて整理する。

| 指標 | 取得方法 | 測定可否 |
|---|---|---|
| 会社登録数 | `SELECT COUNT(*) FROM workspace_companies;`（Supabase SQL Editorで手動集計） | ○ 測定可能（手動） |
| Roadmap生成数 | Annual Roadmapは都度計算・永続化しない設計（[ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md)）のため「生成数」という概念自体がテーブルに存在しない。会社登録数・Profile入力完了数で代替するしかない | △ 代替指標のみ |
| Procedure Status更新件数 | `SELECT company_id, COUNT(*) FROM workspace_procedure_statuses GROUP BY company_id;`（同19節に既存の例） | ○ 測定可能（手動） |
| PDF出力率 / Excel出力率 | 出力操作自体を記録するイベントログが無い（`feedback_link_clicked`同様、発火する仕組み自体が未実装） | ✕ 測定不可（現状） |
| Share利用率 | `workspace_share_links`の**発行数**は`SELECT COUNT(*) FROM workspace_share_links;`で測定可能。ただし共有ページの**閲覧数**は記録されない | △ 発行数のみ測定可能 |
| 初回完了率 | セッション単位の行動ログが無いため測定不可。[BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)による人手観察でのみ把握できる | ✕ 測定不可（現状、観察記録で代替） |
| 途中離脱率 | 同上 | ✕ 測定不可（現状、観察記録で代替） |

**現時点で不足している条件として明記する**：出力率・完了率・離脱率のような行動ベースの指標を
Version 1.0公開判断の定量的根拠として使うには、`src/lib/analytics.ts`の実接続（現状スタブ）が
別途必要になる。着手する場合は本計画のスコープ外の実装作業であり、着手前に要件整理が必要
（[CLAUDE.md](../CLAUDE.md)の開発フロー参照）。

---

## 4. Beta Feedback Process

```
Observation（観察）
   ↓
Backlog（一元管理）
   ↓
Priority（優先順位付け）
   ↓
Release（公開判断への反映）
```

このパイプラインは新規設計ではなく、既存の運用ルールをそのままVersion 1.0のゲートに接続したもの。

| 段階 | 実体 | 詳細 |
|---|---|---|
| Observation | [BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)（外部参加者の1操作単位の記録）、[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)（運営者本人のリハーサル）、[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)（テスター自己申告） | 発見元は`Day1Observation`／`Pilot`／`Tester`／`Internal`の4種（[BETA_BACKLOG.md](BETA_BACKLOG.md) §0-1） |
| Backlog | [BETA_BACKLOG.md](BETA_BACKLOG.md) | Blocker/High/Medium/Lowで一元管理。Won't Fix判断も含む（§0-3） |
| Priority | `BETA_BACKLOG.md` §0-2 | Blocker即対応・High次Sprint候補・Medium/Lowはβ終了後まとめて棚卸し |
| Release | 本ドキュメント §2 Release Criteria | `BETA_BACKLOG.md`のBlocker/High件数が、そのままVersion 1.0公開条件の判定材料になる |

**現状の課題（§1で既出）**：`CLOSED_BETA_FINAL_REVIEW.md`（レビューという別経路で発見されたHigh 3件）が
このパイプラインのBacklog段階を経由せず止まっている。Version 1.0の判定を正確に行うには、まずこの
3件を`BETA_BACKLOG.md` §2へ正式に転記し、Backlog側の集計とレビュー側の指摘を一致させる必要がある。

---

## 5. Release Checklist

| 区分 | 内容 | 現状 |
|---|---|---|
| 法務 | 利用規約・プライバシーポリシー | **未整備**。[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 18節で「β時点で正式な利用規約・プライバシーポリシー・データ処理契約（DPA）を持たない」ことを確認済み。エンジニアリング作業ではなく法務面の整備が別途必要 |
| 問い合わせ | 利用者からの問い合わせ窓口 | β期間中はメール・LINE等アプリ外運用（同計画20節）。アプリ内フィードバック機構（`feedback_link_clicked`イベント）は定義のみで未実装。公開範囲が拡大するVersion 1.0で同じ運用のまま十分かは要判断 |
| バックアップ | Supabaseの自動バックアップ・Point-in-Time Recovery | 契約プランに依存し、本セッションからは確認できない（同計画16節）。運営側が契約状況を確認する必要あり |
| 監視 | アプリケーション監視・エラー検知 | アプリ独自の監視基盤は無く、Vercel/Supabaseの標準プラットフォームログのみ（同計画19節） |
| 障害対応 | ロールバック手順・重大障害の定義と停止条件 | 定義済み（同計画15節・22節）。β規模（1-3名）向けの手順であり、Version 1.0で利用者数が増えた場合の連絡フロー（「対象顧問先への案内を一時停止」に相当する運用）は再設計が必要になる可能性がある |
| 運営フロー | Beta Feedback Processの継続運用 | §4のパイプラインをVersion 1.0以降も継続する前提。追加設計は不要 |

---

## 6. Public Launch

| 項目 | 内容 |
|---|---|
| リリース日 | 未定 |
| 公開条件 | Version 1.0（§2 Release Criteriaを全て満たすこと） |
| 対象地域 | [ROADMAP.md](ROADMAP.md) v1.0節「福岡県版正式リリース」が想定する範囲。ただし対応市区町村の精度検証・有料化するか否かは同節が明記する通り「着手時に改めて要件整理」が必要で、本ドキュメントの時点でも未確定 |
| 未参照テーブルの扱い | `procedure_organizations`等、v1.0着手時に判断が必要な既存項目（[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)参照） |

---

## 7. Version 2候補

Closed Betaのスコープには含めず、Version 1.0公開後に改めて要件整理の上で着手を検討する項目。
いずれも[ROADMAP.md](ROADMAP.md)・[BETA_BACKLOG.md](BETA_BACKLOG.md)に既出で、新規に構想したものはない。

| 候補 | 現状 | 出典 |
|---|---|---|
| 補助金・助成金対応 | 未着手（v0.7） | [ROADMAP.md](ROADMAP.md) v0.7節 |
| 会計ソフト連携 | 構想段階、`TimelineSource`型に将来枠のみ確保 | [BETA_BACKLOG.md](BETA_BACKLOG.md) L-03 |
| 通知自動化（メール・Slack・LINE等の外部push配信） | 設計のみ、実装は「実要望確認後に着手する方針」 | [BETA_BACKLOG.md](BETA_BACKLOG.md) L-02、[NOTIFICATION_DELIVERY_ARCHITECTURE.md](NOTIFICATION_DELIVERY_ARCHITECTURE.md) |
| 税理士ダッシュボード強化（4段階権限モデル・経営者向け軽量ログイン） | 設計済み・未実装 | [COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 7節、[ROADMAP.md](ROADMAP.md) v0.17節 |
| AI参謀高度化（LLM活用） | ルールベースMVPのまま。「明確な必要性が確認されるまで着手しない方針」 | [ROADMAP.md](ROADMAP.md) v0.9節、[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-4節 |

---

## 8. 次にこのドキュメントを更新するタイミング

- 実際のClosed Betaセッションが実施され、[BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)に
  実データが記入された時点（§1・§2の「現状」列を実測値で更新する）
- `CLOSED_BETA_FINAL_REVIEW.md`のHigh 3件が`BETA_BACKLOG.md`へ転記され、対応方針が決まった時点
- §2の「要確認」項目（Closed Beta実施規模・継続率の定義）についてユーザーの判断が得られた時点
