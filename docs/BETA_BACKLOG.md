# BETA_BACKLOG.md — Closed Beta 改善バックログ（Sprint49）

**ステータス: バックログの器と初期登録のみ。コード変更・DB変更・migration作成・package変更は
行っていない。**[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)（Sprint45〜、Sprint48で実施中）で
発見された課題をここに転記・優先順位付けし、Sprint49以降の改善Sprintの入力にする。

目的: Closed Beta期間中に発見された課題（β運営者本人によるパイロット・今後の外部テスターからの
フィードバック・内部レビューいずれも含む）を一元管理し、Blocker/High/Medium/Lowで優先順位付けする。
[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)・[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)が
既に定義した分類ルールをそのまま踏襲する（新しい分類基準は作らない）。

---

## 0. 運用ルール

### 0-1. 転記の流れ

1. [BETA_PILOT_LOG.md](BETA_PILOT_LOG.md) 3節「問題ログ」に`P-01`から連番で記入される
2. 記入された項目のうち、Sprint計画に載せる必要があるもの（原則Blocker/High全件、Medium/Lowは
   任意）を本ファイルへ転記する。転記時に「発見元」欄へ`Pilot`（`BETA_PILOT_LOG.md`のP-IDを付記）を記録し、
   元記録との対応関係を追跡できるようにする
3. 外部テスター受け入れ後は、[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)経由で収集した
   フィードバックも同様に転記する（発見元は`Tester`）
4. 開発中に気づいた課題（ユーザー操作を経由しない、コードレビュー等での発見）は`Internal`として直接
   本ファイルに新規登録してよい（`BETA_PILOT_LOG.md`への事前記録は不要）

### 0-2. 優先順位ルール

[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md) 3節の分類定義をそのまま使う。本ファイルでは、各分類が
「見つかった後どう扱われるか」の運用ルールを明文化する。

| 分類 | 定義（BETA_PILOT_LOG.mdより） | 対応方針 |
|---|---|---|
| **Blocker** | 業務継続不能、他社データ閲覧、保存失敗 | **即対応**。発見した時点で当該Sprintの他作業に優先して対応する。βパイロット中に検知した場合は[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節の重大障害対応（即停止・状況確認）に従う |
| **High** | 誤った判断・期限・手続き表示 | **次Sprint候補**。発見したSprintでは直さず、次の改善Sprint（Sprint50以降）の計画に優先的に組み込む。同一Sprintに複数件Highがある場合は影響範囲（該当会社数・見落としリスク）の大きい順に着手する |
| **Medium** | 導線や文言が分かりにくい | **β終了後検討**。Closed Beta全体（運営者パイロット＋外部テスター受け入れ）が終わり、[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 26節の判断基準で次フェーズに進む段階でまとめてレビューし、優先度を再評価する |
| **Low** | 見た目や軽微な不便 | **一定数集まったらまとめて対応**。目安は同種の指摘が3件以上集まった時点、またはMedium対応Sprintに余力がある場合に便乗して対応する。単発の指摘だけでは着手しない |

### 0-3. 「実装しない」判断（Won't Fix）の運用方針

すべての課題を実装するとは限らない。以下のいずれかに該当する場合、`Won't Fix`として**削除せず**
理由とともに残す（[CLAUDE.md](../CLAUDE.md)「旧テーブルは即座には削除しない」と同じ考え方——
判断の記録自体に価値がある）。

- **VISION.mdのPosition（会計ソフトでも士業の代替でもない）に反する要望**
  （例:「仕訳入力機能が欲しい」「電子申告を代理送信してほしい」）
- **実装コストに対して該当する会社の割合が極めて低い**、かつ代替手段（`caution_note`での案内等）で
  実務上支障が無いと判断できるもの
- **既存の意図的な設計判断を覆すことになる要望**（例: 一般ユーザー向け`(site)`配下は
  [WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md)により「互換・検証用」に
  位置づけ済みのため、新機能追加は原則行わない）

`Won't Fix`にする際は、対象項目の「暫定対応」欄に**判断理由**と**判断日**を明記する。後日状況が
変わった場合（実務上の必要性が新たに確認された等）は、`Open`に差し戻して良い（`Won't Fix`は
最終決定ではなく現時点の判断である旨をここに明記する）。

### 0-4. ステータス遷移

```
Open → Confirmed → Fixed
                 → Won't Fix
```

- **Open**: 登録されたが、まだ内容の妥当性を確認していない
- **Confirmed**: 再現手順を確認し、実際に問題があると確定した（対応するとは限らない。次のSprint候補として計画に載る前段階）
- **Fixed**: 対応が完了し、[Build / Playwright確認ルール](../CLAUDE.md)に従って確認済み
- **Won't Fix**: 0-3節の基準により対応しないと判断した

---

## 1. Blocker

現時点で該当なし（[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)のパイロット実施中に検知され次第、
即座に本節へ追記する）。

| タイトル | 発見日 | 発見元 | 対象画面 | 再現手順 | 期待動作 | 現状動作 | 暫定対応 | Sprint候補 | ステータス |
|---|---|---|---|---|---|---|---|---|---|
| （登録なし） | | | | | | | | | |

---

## 2. High

現時点で該当なし（[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)のパイロット実施中に検知され次第、
本節へ転記する）。

| タイトル | 発見日 | 発見元 | 対象画面 | 再現手順 | 期待動作 | 現状動作 | 暫定対応 | Sprint候補 | ステータス |
|---|---|---|---|---|---|---|---|---|---|
| （登録なし） | | | | | | | | | |

---

## 3. Medium

### M-01: withholdingTaxCycle（源泉所得税の納付サイクル）がState経由でConfirmedにならない

| 項目 | 内容 |
|---|---|
| 発見日 | 2026-07-11（Sprint46調査時に既存コードのコメントから判明） |
| 発見元 | Internal |
| 対象画面 | `/admin/workspaces/{id}/roadmap`（Annual Roadmapの源泉所得税の納付、Confidenceバッジ） |
| 再現手順 | 1. Workspace Profileで「源泉所得税の納期」を「毎月納付」または「納期の特例」に明示的に設定して保存する 2. Roadmapページで「源泉所得税の納付」のConfidence表示を確認する |
| 期待動作 | CompanyProfileで値を明示的に設定していれば、Confidenceは「confirmed」（確定）と表示される |
| 現状動作 | `state.withholdingTaxCycle`が常に`'incomplete'`を返す既知の未実装ギャップ（`src/lib/state.ts` 189-199行、`deriveWithholdingTaxCycleField`のコメントで明記済み）があり、CompanyProfile側で値を設定していてもRoadmap上は常に「情報不足」バッジが表示される |
| 暫定対応 | `timelineProducer.ts`の`taxReturnEntryToTimelineEvent`が生成するmetadataに`withholdingTaxCycleActual`を追加すれば、他フィールドと同様「直近のtaxイベントから読む」ロジックへ拡張できる（`state.ts`コメントが既に示唆）。住民税特別徴収（`RESIDENT_TAX_WITHHOLDING_CODE`）はこの不整合を複製しないよう、Sprint47で意図的にStateを経由しない実装にした（[RESIDENT_TAX_SUPPORT_DESIGN.md](RESIDENT_TAX_SUPPORT_DESIGN.md) 7節）。表示上の実害は「確定している情報が未確定に見える」という誤解のみで、期限計算自体は誤らない |
| Sprint候補 | 未定（β終了後検討） |
| ステータス | Confirmed |

### M-02: municipal_tax / prefectural_tax の窓口データが福岡県60市区町村に未整備

| 項目 | 内容 |
|---|---|
| 発見日 | 2026-07-11（Sprint46調査時にDB実データを確認して判明） |
| 発見元 | Internal |
| 対象画面 | Annual Roadmap・`/procedures`・`/offices`（福岡県の会社で`office_type=municipal_tax`または`prefectural_tax`の手続きを表示する箇所全般） |
| 再現手順 | 1. 福岡県内の市区町村（渋谷区`13113`以外）でWorkspaceを作成する 2. Roadmapで「特別徴収税額の納付」「給与支払報告書」「法人市民税申告」「償却資産申告」等（`office_type`が`municipal_tax`/`prefectural_tax`）を確認する |
| 期待動作 | 提出先の窓口（名称・住所・電話番号等）が表示される |
| 現状動作 | `jurisdictions`テーブルに`municipal_tax`/`prefectural_tax`の窓口データが渋谷区（`13113`）分しか投入されておらず（`supabase/migration_organizations.sql`確認）、福岡県の会社では`office: null`のまま表示される（誤案内にはならないが「情報不足」） |
| 暫定対応 | 福岡県60市区町村分の`organizations`/`organization_offices`/`jurisdictions`データ投入が必要（新規テーブル・スキーマ変更は不要、データ投入のみ）。[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)が指摘した既存の宿題であり、住民税特別徴収（Sprint47）が新たに生んだ問題ではない |
| Sprint候補 | 未定（β終了後検討。対象会社が福岡県かつ地方税カテゴリの手続きに絞られるため優先度は中） |
| ステータス | Confirmed |

### M-03: 共有リンクに有効期限設定UIが無い

| 項目 | 内容 |
|---|---|
| 発見日 | Sprint41 |
| 発見元 | Internal |
| 対象画面 | `/admin/workspaces/{id}/share` |
| 再現手順 | 1. Shareタブで共有リンクを発行する 2. 有効期限を設定できる項目が無いことを確認する |
| 期待動作 | 発行時に有効期限（例: 30日後に自動失効）を設定できる |
| 現状動作 | 発行後は運営者が手動で失効操作を行うまで無期限に有効（Sprint41で失効への確認ダイアログは追加済みだが、期限設定機能自体は未実装。`PROJECT_CONTEXT.md`「既知の制約」に記載済み） |
| 暫定対応 | 手動失効運用で当面代替（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)で既に運用上の注意として告知済み） |
| Sprint候補 | 未定（β終了後検討） |
| ステータス | Confirmed |

---

## 4. Low

### L-01: `workspace_members`への割り当て・Workspace一覧編集にUIが無い

| 項目 | 内容 |
|---|---|
| 発見日 | Sprint33〜Sprint44の間、複数回言及 |
| 発見元 | Internal |
| 対象画面 | `/admin/workspaces`（顧問先一覧・メンバー管理全般） |
| 再現手順 | 1. 新しいテスターにWorkspaceへのアクセス権を付与しようとする 2. 画面上に`workspace_members`を編集するUIが無いことを確認する |
| 期待動作 | 管理画面から`owner`/`member`/`viewer`ロールの追加・変更ができる |
| 現状動作 | 会社作成時の自動owner登録・owner本人によるWorkspace削除（Sprint43実装）以外は、Supabase Dashboard・SQL Editorでの手動操作が必要（`PROJECT_CONTEXT.md`「既知の制約」に記載済み） |
| 暫定対応 | [CLOSED_BETA_DAY1_RUNBOOK.md](CLOSED_BETA_DAY1_RUNBOOK.md)の手順（SQL Editorでの手動INSERT）で当面運用。β規模（1〜3名・1〜5社）では手動運用のコストは許容範囲と判断 |
| Sprint候補 | 未定（外部テスターの人数が増えた場合に優先度が上がる） |
| ステータス | Confirmed |

### L-02: Notification Delivery（外部push配信）が未実装

| 項目 | 内容 |
|---|---|
| 発見日 | Sprint38〜39（設計のみで実装保留） |
| 発見元 | Internal |
| 対象画面 | （画面内通知センターのみ稼働。メール・Slack・LINE・Web Push等の外部配信経路が対象） |
| 再現手順 | — （未実装機能のため再現手順ではなく設計状態の確認） |
| 期待動作 | 期限が近い手続きをメール等でも通知できる |
| 現状動作 | `/admin/workspaces/{id}`内の通知センター（画面内表示のみ）が稼働。外部配信は[NOTIFICATION_DELIVERY_ARCHITECTURE.md](NOTIFICATION_DELIVERY_ARCHITECTURE.md)で設計のみ済み、実装は「実要望確認後に着手する方針」（`PROJECT_CONTEXT.md`） |
| 暫定対応 | 画面内通知センターを毎回確認する運用で代替。β運営者本人のパイロット・外部テスターのフィードバックで実際の要望強度を確認してから優先度を判断する |
| Sprint候補 | 未定（実要望確認後） |
| ステータス | Confirmed |

### L-03: 会計データ連携（Accounting連携）が構想段階

| 項目 | 内容 |
|---|---|
| 発見日 | Phase2.6〜Sprint19（Timeline Engine設計時に将来ソースとして型のみ確保） |
| 発見元 | Internal |
| 対象画面 | （未実装。将来`freee`/マネーフォワード等のAPI連携を想定） |
| 再現手順 | — （未実装機能のため再現手順ではなく設計状態の確認） |
| 期待動作 | 会計ソフトから決算・仕訳データを取り込み、Tax Return Profile等へ自動反映する |
| 現状動作 | `TimelineSource`型（`src/lib/timeline.ts`）に`'future_accounting'`という将来構想用の値のみ確保されており、実装・連携先の選定はいずれも未着手（[ROADMAP.md](ROADMAP.md)のv0.17残タスク「Accounting Data」として言及のみ） |
| 暫定対応 | Tax Return Profileの手動入力で当面代替（Sprint35で実装済み） |
| Sprint候補 | 未定（v1.0以降の中長期構想） |
| ステータス | Open（他項目と異なり、まだ「対応方針の妥当性」自体の確認＝Confirmed化を行っていないため） |

### L-04: Roadmap Excel出力のファイル名サニタイズがWindows/Mac双方で安全な文字集合になっていない

| 項目 | 内容 |
|---|---|
| 発見日 | Sprint51（レビュー時の指摘） |
| 発見元 | Internal |
| 対象画面 | `/admin/workspaces/{id}/roadmap`（Excelで出力ボタン） |
| 再現手順 | 1. Windowsで予約デバイス名（`CON`・`PRN`・`AUX`・`NUL`・`COM1`〜`COM9`・`LPT1`〜`LPT9`等）に一致する、または末尾がピリオド・半角スペースで終わる会社名でWorkspaceを作成する 2. Excelで出力を実行し、生成されたファイル名でWindows環境に保存する |
| 期待動作 | どのOS（Windows/Mac/Linux）でもエラーなく保存できるファイル名になる |
| 現状動作 | `src/lib/roadmapExcelWorkbook.ts`の`sanitizeForFilename()`は`\ / : * ? " < > \|`のみを除去しており、Windows固有の制約（予約デバイス名、末尾のピリオド/スペース禁止）には対応していない。Mac/Linuxでは問題にならないが、Windows環境でこれらの会社名の場合に保存が失敗する可能性がある |
| 暫定対応 | 現状は該当するような特殊な会社名（予約デバイス名と完全一致、末尾がピリオド/スペース）が実際に登録されるまでは実害無し。回避策として、該当する保存エラーが起きた場合は手動でファイル名を変更して保存すれば良い |
| Sprint候補 | 未定（β運用で実際に該当ケースが発生してから優先度を判断する） |
| ステータス | Open |

---

## 5. 参考: 住民税特別徴収の将来拡張（Sprint47で対応した残タスク）

Sprint47で住民税特別徴収の中核（毎月納付・納期の特例）は実装済み。
[RESIDENT_TAX_SUPPORT_DESIGN.md](RESIDENT_TAX_SUPPORT_DESIGN.md) 8節「スコープ外」が明示した
残タスクを、実務上の必要性が確認された場合の候補として記録しておく（現時点では要望未確認のため
Blocker/High/Medium/Lowのいずれにも分類せず、この節に留め置く）。

| 残タスク | 内容 | 実装しない場合の代替 |
|---|---|---|
| 給与所得者異動届出書 | 入退社時の異動届。新イベント種別（退職イベント等）の追加が前提 | `caution_note`等での案内なし。実務上は税理士・社労士への確認を前提とする既存方針のまま |
| 特別徴収切替届出書 | 普通徴収→特別徴収への切替を促す提案的な手続き | Decision Engineの将来拡張候補として保留 |
| 特別徴収税額決定通知の独立Procedure化 | 「提出」ではなく「受領・確認」のため既存Procedureモデルに馴染まず、`RESIDENT_TAX_WITHHOLDING`の`caution_note`に情報として織り込むに留めた | Timeline Engineが「通知受領」等の事実を扱えるようになった段階で再検討（[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 10節） |
| 自治体差対応 | 納付方法（口座振替・eLTAX等）の自治体ごとの詳細差異 | `caution_note`での一般的な注記のみ |

実務上の必要性が[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)のパイロット（住民税特別徴収についての
確認項目、2節参照）で確認された場合、該当する行を2〜4節の該当分類へ昇格させる。

---

## 6. Sprint50以降への引き継ぎ方針

- Closed Betaパイロット・テスターフィードバックで新規発見された項目は、都度1〜4節へ追記する
  （発見のたびに本ファイルを更新し、Sprint末にまとめて整理する運用にはしない——記憶が新しいうちに
  記録する[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)と同じ原則）
- Sprintの計画時には、まず1節（Blocker）・2節（High）が空であることを確認してから着手する。
  空でない場合はそれらの解消を新機能開発より優先する
- 3〜4節（Medium/Low）は、0-2節の目安（β終了後・3件以上集まったら）に従って棚卸しし、
  対応する場合は対応Sprintの番号を「Sprint候補」欄へ記入してからステータスを更新する
