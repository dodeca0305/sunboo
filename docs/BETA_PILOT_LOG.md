# BETA_PILOT_LOG.md — クローズドβ パイロット記録（Sprint45）

**ステータス: 初日実施手順・記録テンプレートの準備のみ。コード変更・DB変更・migration作成は
行っていない。実際のパイロット実施（下記テンプレートへの記入）はこのSprintの対象外——運営者本人が
実際の業務フローで操作しながら、以降の日程で記入していくためのドキュメントである。**

目的: 機能追加ではなく、**運営者本人が実際の業務フローでSUNBOOを使い、運用上の問題・分かりにくさ・
不足を収集する**（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 1節と同じ趣旨を、
外部テスターを招く前の予行として運営者自身で行う）。

参照ドキュメント: [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)・
[CLOSED_BETA_DAY1_RUNBOOK.md](CLOSED_BETA_DAY1_RUNBOOK.md)・
[BETA_TEST_CHECKLIST.md](BETA_TEST_CHECKLIST.md)・[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)

---

## 0. 本パイロットのβ条件

[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 3節（1〜3名・1〜5社・2週間）の範囲内で、
**外部テスターを招く前の最小構成の予行**として位置づける。

| 項目 | 内容 |
|---|---|
| テスター | 運営者本人1名 |
| 対象会社 | 1社 |
| 期間 | 3〜5営業日 |
| データ方針 | 原則テストデータまたは匿名化データ（実在の顧問先の生データは使わない） |
| 重大障害時の対応 | 即停止（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節の定義に従う。
検知したら記録を中断し、まず状況を確認する） |

**このパイロットの結果（Blocker/High件数）は、外部テスターを実際に招くかどうかの判断材料にする**
（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 26節と同じ判断基準を、招待前の
ゲートとして先取りする）。

---

## 1. 初日実施手順（12ステップ、業務フロー準拠）

[CLOSED_BETA_DAY1_RUNBOOK.md](CLOSED_BETA_DAY1_RUNBOOK.md)のアカウント発行手順（Supabase Authユーザー
作成・`admin_users`登録）が完了していることを前提に、以下の業務フローを1社分、通しで操作する。
各ステップの実施後、すぐに2節の記録テンプレートへ記入する（まとめて後から記入しない——記憶が新しい
うちに記録する）。

| # | 業務フロー | 画面（URL） | 特に見るポイント |
|---|---|---|---|
| 1 | ログイン | `/admin/login` | ログインまでの分かりやすさ、エラー時の文言 |
| 2 | 顧問先一覧確認 | `/admin/workspaces` | 一覧の見やすさ、次に何をすべきかが分かるか |
| 3 | 新規Workspace登録 | `/admin/workspaces/new` | 入力項目の妥当性、対応エリア外の案内の分かりやすさ |
| 4 | Company Profile入力 | `/admin/workspaces/{id}/profile` | 入力の手間、編集できない項目への戸惑いの有無 |
| 5 | Tax Return Profile入力 | `/admin/workspaces/{id}/tax-returns` | 概算入力（レンジ）と正確な金額の使い分けの分かりやすさ |
| 6 | Dashboard確認 | `/admin/workspaces/{id}` | 7区画の情報量、次の行動が分かるか |
| 7 | Annual Roadmap確認 | `/admin/workspaces/{id}/roadmap` | 期限・提出先の正確さ、「推定」「情報不足」表示の納得感 |
| 8 | Procedure Status更新 | 同上（ステータスのプルダウン） | 操作のしやすさ、出現回単位の分かりやすさ |
| 9 | Documents更新 | `/admin/workspaces/{id}/documents` | ステータスの意味の分かりやすさ |
| 10 | Shareリンク発行・閲覧・失効 | `/admin/workspaces/{id}/share`、発行後のリンク | 発行〜閲覧〜失効の一連の流れ、確認ダイアログの分かりやすさ |
| 11 | Notification Center確認 | `/admin/workspaces/{id}`（最上部） | 実際に「見てよかった」と思えたか |
| 12 | Workspace削除またはテストデータ整理 | `/admin/workspaces/{id}`（「危険な操作」） | 削除UIの安心感、会社名確認の有無 |

---

## 2. 記録テンプレート（ステップごとに記入）

各ステップの実施直後にコピーして使う。空欄は「特になし」でよい。

```
### ステップ #: （業務フロー名）
- 実施日時:
- 迷った画面はあったか:
- 意味が分からなかった文言:
- 入力が面倒だった項目:
- 表示が多すぎた箇所:
- 欲しかった導線:
- 誤った期限や手続きが表示されていないか:
- 情報不足（「推定」「情報不足」タグ等）の表示は妥当だったか:
- 気づいた問題（3節の問題ログへ転記、IDを記入）:
```

以下の3項目は、該当ステップ（6: Dashboard確認、11: Notification Center確認、7: Annual Roadmap確認）の
記入時に必ず答える。

- **Dashboardだけで次の行動が分かったか**（ステップ6）:
- **AI AdviserとDecisionの違いが理解できたか**（ステップ6。両者の役割の違いが画面から伝わったか、
  それとも同じことを言っているように見えたか）:
- **Notification Centerが役立ったか**（ステップ11。無くても困らなかったか、実際に「見て良かった」と
  思えたか）:
- **住民税特別徴収が必要だったか**（ステップ7。Roadmapに出てこないことが実際に業務上困る場面が
  あったか。[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 23節の既知の制約に該当）:

---

## 3. 問題ログ（Issue Log）

気づいた問題はすべてここに集約する。**Blockerを検知した場合は、このログへの記入を待たず、
まず操作を止めて状況を確認する**（0節）。

### 分類の定義

| 分類 | 定義 |
|---|---|
| **Blocker** | 業務継続不能、他社データ閲覧、保存失敗 |
| **High** | 誤った判断・期限・手続き表示 |
| **Medium** | 導線や文言が分かりにくい |
| **Low** | 見た目や軽微な不便 |

### ログ

| ID | 日付 | ステップ# | 分類 | 画面（URL） | 内容 | 再現手順 |
|---|---|---|---|---|---|---|
| P-01 | | | | | | |

（行を追加して記入していく。IDは`P-01`から連番）

---

## 4. パイロット総括（3〜5営業日終了後に記入）

- 実施期間:
- 完了したステップ（1〜12のうちいくつ完了したか）:
- Blocker件数:
- High件数:
- Medium件数:
- Low件数:
- 総合評価（このまま外部テスターを招けるか）:
  - [ ] このまま招ける
  - [ ] 軽微な修正後に招ける
  - [ ] Blocker/High解消まで招けない
- 次のステップ:
  - Blocker/Highが0件 → [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)の本来の対象
    （1〜3名・1〜5社・2週間）で外部テスターの受け入れを開始する
  - Blocker/Highが検出された場合 → 該当項目を優先度順に整理し、対応Sprintを個別に計画する
    （本Sprintでは修正しない）
  - 住民税特別徴収について実務上の必要性が確認された場合 →
    [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 23節の記載を踏まえ、実装の優先順位を
    改めて判断する

---

## テストデータ整理・削除（ステップ12実施時のメモ）

パイロット終了後、作成したテスト会社は[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)
24節の手順（第一手段: `/admin/workspaces/{id}`の「危険な操作」からowner本人が削除、代替手段:
Supabase SQL Editor）に従って削除する。「株式会社REINE」等、本パイロットで作成していない既存の
会社は削除・変更しないこと（同ドキュメント0節）。
