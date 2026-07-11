# ROADMAP.md — SUNBOO ロードマップ

**2026-07-10（Sprint29）で実装状況を実コードに合わせて全面同期した。** 本ドキュメントは長らく
Sprint21（Phase 2.6「設計資産化」）時点のまま更新されておらず、「v0.6以降は未着手」という記述が
Sprint22〜28で実装されたCompany Workspace・Timeline/State/Annual Roadmap Engine等を反映していなかった
（[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 2-1節・3-1節で指摘・確認済み）。
以下、各バージョンの実装状況を実コード確認済みの内容に更新した。

v0.1〜v0.6・v0.9・v0.14〜v0.17は実装済み（詳細は各節）。今後の開発方針・(site)配下との関係の
整理は[WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md)（Sprint29）を参照。
未着手の構想に着手する際は、引き続き必ず要件整理・設計を行うこと（[CLAUDE.md](../CLAUDE.md)の開発フロー参照）。

**2026-07-11（Sprint44）追記**: Sprint30〜41でv0.17 Company Workspaceの残タスク（周期的ステータス
再設計・アクセス制御・データ取得共通化・Tax Return Profile対応）が完了し、Sprint36〜39で通知エンジン
（画面内通知センターのみ実装、外部push配信は設計のみ）を追加した。Sprint42〜44でクローズドβ launch
計画の整備・信頼性向上（loading/error境界・Workspace削除UI）・開始前最終確認を行った。Sprint40〜44の
実装状況は「v0.19 β版準備」節（本ファイル末尾）を参照。

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

- `event_types` / `anonymous_company_events` / `event_procedures`（後にv0.5で置き換え）
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

## v0.5.5 Procedure Master拡充（Phase15.1監査完了・Phase15.2実装済み）

**狙い**: v0.6「年間スケジュール」のカレンダービューが意味を持つためには、現状20件のProcedure Master
（年次の税務・地方税申告が0件）を拡充する必要がある。Sprint15 Phase15.1でDB上の実データ
（`procedures`20件・`organization_types`13件・`rules`10件等）を直接監査し、不足手続き・カテゴリ整理・
Roadmap反映順序を整理した。詳細: [PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)

- 現状判明した最大のギャップ: 地方税（都道府県税・市区町村税）に分類できる手続きが0件。
  `organization_types`にマスタはあるが参照する手続きが無い
- 優先度「高」: 法人税・消費税・地方税（都道府県/市区町村）の決算後申告、事業開始等申告書、
  給与支払報告書、決算公告（合同会社は対象外）
- 優先度「中」: インボイス登録・簡易課税等の各種届出（v0.10 Company Profile Engineで用意した
  フィールドの実利用）、法人税・消費税の中間申告、特別徴収、36協定、賞与支払届
- 要判断事項（着手前に確認）: `category`列への「地方税」追加是非、`insurance`（社会保険）カテゴリの
  扱い、決算公告の提出先表現（行政機関前提の`office_type`に馴染まない）、新規イベント種別
  （賞与支給等）の追加是非
- **Phase15.2は実装・実行済み**（`supabase/migration_procedure_master_phase15_2.sql`をSupabase SQL
  Editorで実行済み、Playwrightで動作確認済み）。`procedures`10件（法人税確定申告・消費税確定申告・
  法人県民税/事業税/市民税申告・償却資産申告・給与支払報告書・源泉所得税の納期の特例申請・
  異動届出書・決算公告）、`event_types`5件（決算・本店移転・賞与支給・36協定・インボイス登録、
  いずれも`is_active=false`で待機）、`rules`11件を追加。コード変更は不要だった
  （詳細: [PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md](PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md)）
- Phase15.3〜15.6（地方税の管轄機関データ整備、UI表示ラベル対応等）は未着手。段階的な実装順序案は
  [PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md) 5節を参照

## v0.6 年間スケジュール ✅ 完了（v0.16として実装）

**狙い**: 「今日やること」（Phase 1.6）は単発の診断・イベント結果に閉じている。年次・月次で繰り返し発生する
手続き（源泉所得税の毎月納付、算定基礎届、労働保険年度更新、年末調整等）を含め、1年間を通じたカレンダー
ビューとして提示する。

**2026-07-10追記**: 本節が構想していた内容は、下記v0.16「Annual Roadmap Engine」として実装済み。
本節は経緯の記録として残す（実装内容は削除しない）。

検討が必要な点（設計フェーズで詰めること）:
- 繰り返し発生する手続き（`frequency = monthly` / `annual`）を、単発の`anonymous_company_events`と同じ
  「やることリスト」にどう統合するか（診断エンジン側の`procedures`は既にfrequencyを持っている）
- 会社プロフィール（`anonymous_company_events`に非正規化されている）を年間ビューでどう束ねるか。永続的な
  会社エンティティ（現状は意図的に作っていない、[DATABASE.md](DATABASE.md)参照）が必要になる可能性がある
- → 「複数年ホライズンで手続きを見せる」という狙いはv0.11「経営ロードマップ進化エンジン」がより広い
  枠組みとして引き継ぐ設計にした（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4節参照）

## v0.7 補助金・助成金（未着手）

**狙い**: `docs/開発指示書_v1.md`（Phase 1計画時点のメモ）や`README.md`の「将来の拡張計画」に構想はあるが、
実装は未着手。会社プロフィール（所在地・従業員数・法人種別・業種）に合致する補助金・助成金を、
手続きと同様に管轄機関×条件で判定できるようにする構想。**ルールエンジン（v0.5）の`condition`評価は
そのまま転用できる可能性が高い**（`rule_actions`に新しい`action_type`を追加する形、または`procedures`とは
別に`subsidies`テーブルを設けてルールエンジンから参照する形、のいずれかを設計フェーズで検討する）。

## v0.8 顧問先管理（未着手）

**狙い**: 税理士・社労士事務所が複数の顧問先企業を一括管理できるようにする。現状SUNBOOは一般ユーザーに
アカウント機能が無く、`anonymous_company_events`もブラウザ単位の`browser_id`でしか束ねられていない
（[DATABASE.md](DATABASE.md)の`anonymous_company_events`参照）。このフェーズで初めて「永続的な会社エンティティ」と
「事務所アカウント」が必要になる見込み。認証機構の追加（一般ユーザー向けSupabase Auth、または別方式）を
含む大きな設計判断が必要。着手前に必ずユーザーと設計方針を確認すること。

> **参考（2026-07-05判明）**: 本番Supabaseプロジェクトには、このフェーズが想定するものと酷似した
> `companies`（`auth_user_id`列）＋`company_events`（`company_id`列、`own_select`/`own_insert`/
> `own_update`/`own_delete`ポリシー）という認証必須マルチテナントの構成が既に存在する。ただし
> アプリケーションコードからの参照は無く、素性・作成経緯は未確認（詳細: [DATABASE.md](DATABASE.md)の
> `anonymous_company_events`注記）。本フェーズ着手時は、これを流用するか無関係として扱うかを
> まずユーザーに確認すること。

> **追記（Sprint22）**: 本節が想定していた内容は[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)
> （v0.17）として具体化された。「事務所アカウント」は「管理者・担当者・経営者・閲覧のみ」の
> 4ロール、「永続的な会社エンティティ」は`companies`テーブル（本節の注記にある既存レガシー
> テーブルを流用するか要判断）として設計を進めている。以降の詳細はv0.17を参照。

## v0.9 AI参謀β ✅ ルールベースMVP実装済み（LLM未使用）

**狙い**: 蓄積された会社データ・手続き履歴・ルール判定結果をもとに、AIが経営者に能動的な助言を行う機能。
本ドキュメント整備（Phase 2.6）自体が、このフェーズに向けた「AIが読める設計資産」を残す準備という位置づけ。
着手時は既存のルールエンジンの`context`／`rules`データをAIの判断材料としてどう連携するかが論点になる。
→ 長期見通し（Roadmap Foresight）としての発展形はv0.11で設計済み（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7節）。

**2026-07-10追記**: Sprint24.2で`generateWorkspaceAdvice`（`src/lib/workspaceAdvice.ts`）として実装済み。
Roadmap/Procedure Statusの出力をルールベースで集計し「状況説明」を行う（LLM呼び出しなし）。
Sprint27では役割を分離した`generateWorkspaceDecisions`（`src/lib/workspaceDecisions.ts`、「行動提案」）を
追加し、Workspace Dashboardの「AI参謀」「意思決定」の2区画として実装済み。LLMによる置き換えは
[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-4節の通り、明確な必要性が
確認されるまで着手しない方針。

## v0.10 Company Profile Engine（設計完了・実装未着手）

**狙い**: 会社ごとに異なる税務・労務の実態（消費税課税方式・中間申告の有無・源泉所得税の納期特例・
顧問専門家の有無等）を`CompanyProfile`として一元的に持ち、Rule Engine・AI参謀・Notification Engine・
将来の会計データ連携・経営ロードマップの共通の判断材料にする。

- 設計: [COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)（Sprint 14 Phase14.1）。CompanyProfile型・
  localStorage実装・Rule Engine連携はSprint14 Phase14.2で実装済み
- 要判断事項: 永続化方式（localStorage継続 or 新規DBテーブル or v0.8前倒し）は実装前に確認が必要
- Phase14.2以降の課題: 中間申告の複数期日対応（procedures/timing_dataのスキーマ拡張）、
  Rule Engineコンテキストの拡張、診断エンジンへのRule Engine展開
- **2026-07-06、Phase14.2の範囲を超えて`applyCompanyProfileToProcedures`（`src/lib/companyProfile.ts`）が
  追加された**（コミット`fa034f5`「fix: apply company profile filters to roadmap」、`origin/main`に
  push済み）。CompanyProfileの影響がRule Engineのcontextに留まらず、実際に表示される手続きの絞り込み
  （`stage`に応じた設立系手続きの非表示）・期限の上書き（源泉所得税の納期の特例）にまで広がった。
  Sprint16の設計プロセスを経ずに追加されたものだが、v0.11の設計と矛盾せず、その一部を先取りする
  内容と確認済み（詳細: [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 0節）
- → 「経営ロードマップの共通の判断材料にする」という狙いを引き継ぎ、具体的な設計に落としたものが
  v0.11（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)）

## v0.11 経営ロードマップ進化エンジン（設計完了・実装未着手）

**狙い**: 会社情報（CompanyProfile）・申告実績（Tax Return Profile）・変更点（Change Interview）・
イベント（経営イベントエンジン）を統合し、単年の診断結果ではなく複数年ホライズンで継続的に
更新される経営ロードマップの基盤を作る。v0.6「年間スケジュール」・v0.9「AI参謀β」・v0.10
「Company Profile Engine」の3つが向かう先を1つの設計に統合する位置づけ。

- 設計: [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)（Sprint 16 Phase16.1）
- 新規導入する概念: Tax Return Profile（決算ごとの申告実績の時系列記録、CompanyProfileの
  自動判定関数が抱える`null`返却の課題を解消する）、Change Interview（イベント発生時の
  最小限の質問フロー）、Roadmap History（入力側の変更差分ログ）、Roadmap Confidence
  （各手続きの確からしさのラベル付け）
- 要判断事項: Tax Return Profileの解釈の妥当性、Roadmapを持続化しない設計方針の妥当性、
  「決算」イベント活性化に伴う`/events`画面改修の範囲、DB移行（Roadmap History）をv0.8と
  同時に行うかどうか
- **注記**: v0.11は「設計完了・実装未着手」だが、v0.10の`applyCompanyProfileToProcedures`
  （2026-07-06追加、上記参照）が本Sprintの狙いの一部（会社ステージに応じた手続きの出し分け）を
  既に実現している。設計時にこの事実を確認し、矛盾しないこと・Roadmap Update Engineが
  この既存関数を置き換えず組み込む設計にしたことを確認済み
- Sprint16.2〜16.6の段階的な実装順序案は[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 10節を参照
- **2026-07-07追記**: Tax Return Profileの設計はSprint17 Phase17.1で独立ドキュメント化された
  （[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)、v0.12）。Sprint16.2の
  「`TaxReturnProfile`型実装・決算イベント活性化」は、より詳細な設計であるSprint17.2〜17.3に
  差し替える（重複実装を避けるため。実装時はv0.12側の計画を正とする）

## v0.12 Tax Return Profile Engine（設計完了・実装未着手）

**狙い**: 前期の確定申告実績を「会社の現在地」として扱い、CompanyProfileの自動判定関数が
抱える`null`返却の課題（2期目以降の消費税ステータス・中間申告要否判定）を解消する。
v0.11「経営ロードマップ進化エンジン」2節で素描したTax Return Profileを独立設計に格上げした位置づけ。

- 設計: [TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)（Sprint 17 Phase17.1）
- 保持項目: 課税売上高・確定法人税額/消費税額・中間申告実績・決算公告実施有無等、確定申告書の
  記載事項ベースで整理（詳細は同ドキュメント2節）
- CompanyProfileとの役割分担: `consumptionTaxStatus`等一部フィールドはTax Return Profileを
  正本とし、矛盾時も自動上書きせずChange Interviewでの確認を経る設計（同ドキュメント4節）
- 将来像として、確定申告書のOCR・AI抽出による自動取得も構想したが、本Sprintの実装計画には
  含めない（同ドキュメント9節）
- 要判断事項: 概算レンジ入力を認めるか、Confidence分類を4分類に拡張するか、OCR構想の着手是非
- Sprint17.2〜17.6の段階的な実装順序案は[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 10節を参照
- **Sprint17.2は実装済み**（`AmountValue`/`TaxReturnEntry`/`TaxReturnProfile`型、`localStorage`
  （`sunboo:tax-return-profile`）、`/profile/tax-returns`の一覧・手入力フォーム、CompanyProfileとの
  矛盾検出（3項目）と「申告書を採用/プロフィールを維持」の2択UI、Confidence3分類のタグ表示。
  Playwright確認済み。詳細: [TAX_RETURN_PROFILE_MVP_PROPOSAL.md](TAX_RETURN_PROFILE_MVP_PROPOSAL.md)）

## v0.13 決算更新フロー（設計完了・実装未着手）

**狙い**: TaxReturnProfile入力後にCompanyProfileとの差分を確認し、Roadmap・AI参謀・通知への
反映につなげる一連のフローを設計する。v0.12実装（Sprint17.2）が3項目のみに留まっていた
矛盾確認を拡張し、手入力・イベント連動・将来のPDF読取という3つの入口が同じフローに合流する
設計にした位置づけ。

- 設計: [CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md)（Sprint 18 Phase18.1）
- Sprint17.2の`detectMismatches`が未対応だった4項目（資本金・源泉所得税の納付サイクル・
  インボイス登録状況・会社ステージ）を矛盾確認の対象に追加する設計（同ドキュメント3節）
- 新規: 決算更新完了直後にのみ表示する「決算更新サマリー」コメント（同ドキュメント6節）、
  矛盾未解決の催促通知（同ドキュメント7節）
- 将来のPDF読取（v0.12 9節）は「入口を1つ追加するだけ」で済む設計にし、差分確認以降の
  ロジックは変更不要とした（同ドキュメント8節）
- 要判断事項: 会社ステージの矛盾を「維持」しても解消しない仕様でよいか、従業員数の乖離を
  矛盾ではなく注意喚起に留める整理でよいか
- Sprint18.2〜18.6の段階的な実装順序案は[CLOSING_UPDATE_FLOW.md](CLOSING_UPDATE_FLOW.md) 9節を参照

## v0.14 Timeline Engine ✅ 実装済み

**2026-07-10追記**: `src/lib/timeline.ts`（型・localStorage永続化層）と`src/lib/timelineProducer.ts`
（(site)側の4ソース統合プロデューサー：`buildTimelineFromSources`）として実装済み。Sprint23.4で
Workspace向けの`src/lib/workspaceTimelineProducer.ts`（`buildWorkspaceTimelineEvents`、
`timelineProducer.ts`の関数を直接呼び出す薄いラッパー）も追加された。現状Workspace側は
`company_profile`ソースのみ組み込み済みで、`tax_return_profile`/`event`ソースは
`workspace_tax_return_profiles`/`workspace_company_events`テーブル未実装のため保留中
（詳細は[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 1-2節）。

**狙い**: 会社に関するすべての事実の記録（会社情報の変化・決算実績・従業員の増減・将来の会計データ）を
単一の追記専用ログとして統合し、Roadmap・AI参謀・通知・将来のPDF/会計データ連携すべての共通基盤にする。
引継ぎメモの最終ゴール「税務・労務・会計・経営を一つのTimelineで管理する経営OS」に向けた最初の設計。

- 設計: [TIMELINE_ENGINE.md](TIMELINE_ENGINE.md)（Sprint 19 Phase19.1）
- 核心的な判断: [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節で設計済み・未実装の
  「Roadmap History」を単体実装せず、Timelineの`company`/`tax`カテゴリとして統合する（同ドキュメント
  0節・5節）。既存の`anonymous_company_events`（DB）・`TaxReturnProfile`（localStorage）は変更せず、
  Timelineはこれらを読み取り専用のビューとして統合し、既存データに対応しない新規記録
  （Advisoryカテゴリ等）のみ`localStorage`新規キー（`sunboo:timeline`）に追記する設計
- 新規導入する概念: `TimelineEvent`（`occurredAt`/`recordedAt`を分離した正規化イベントモデル）、
  5カテゴリ（Company/Tax/HR/Financial/Advisory）、Event-Driven設計（Timelineへの追記がRule Engine・
  Change Interview・Roadmap・AI参謀・通知を駆動する関係の整理）
- 要判断事項: Roadmap History統合の方針（Sprint16.3 Roadmap Update Engine本体の完了待ちになる点）、
  Advisory Timeline（AI参謀・通知の発信記録）の記録タイミング、事実の訂正を追記で表現する方針の妥当性
- Sprint19.2〜19.6の段階的な実装順序案は[TIMELINE_ENGINE.md](TIMELINE_ENGINE.md) 10節を参照

## v0.15 State Engine ✅ 実装済み

**2026-07-10追記**: `src/lib/state.ts`の`buildStateFromTimeline`として実装済み（Sprint20）。
`TimelineEvent[]`を入力に`CompanyState`（`StateField<T>`の集合）を都度計算する純粋関数で、保存しない
設計方針が維持されている。既知の制約（`withholdingTaxCycle`が常に`incomplete`を返す等）は
実装当時から変わっておらず、[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)でも
再確認済み。

**狙い**: Timeline（v0.14）に記録された事実から、会社の「今の状態」をフィールド単位で計算する。
CompanyProfile（ユーザーの自己申告）とは情報源が異なる「Timelineからの計算結果」を導入し、
Rule Engine・Roadmap・AI参謀が参照できる正規化された現在地を用意する。

- 設計: [STATE_ENGINE.md](STATE_ENGINE.md)（Sprint 20 Phase20.1）
- 核心的な判断: 既存の`deriveConsumptionTaxStatus`等3関数（`companyProfile.ts`）・`detectMismatches`
  （`profile/tax-returns/page.tsx`、Sprint18.2実装済み）を、State Engineが一般化する対象の
  先行実装として位置づける（同ドキュメント0節・4節）。CompanyProfileを置き換えるものではなく、
  Timelineの事実から計算した「システムの認識」を新たに追加する
- 新規導入する概念: `CompanyState`/`StateField<T>`（値・確からしさ・根拠イベントID・情報の新しさを
  1組で保持）、[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 6節のConfidence3分類
  （`confirmed`/`estimated`/`incomplete`）を再利用したReason（根拠）の保持
- 要判断事項: 既存`derive*`関数・`detectMismatches`との統合方式（置き換えの時期・範囲）、
  Timeline上で矛盾する複数の記録がある場合の優先順位、Roadmap計算式をStateベースに簡略化するか
- Sprint20.2〜20.6の段階的な実装順序案は[STATE_ENGINE.md](STATE_ENGINE.md) 10節を参照

## v0.16 Annual Roadmap Engine（設計完了・実装済み）

**狙い**: State（v0.15）・Timeline・Procedure Master・Rule Engineを統合し、経営者へ「年間ロードマップ」
（今年度〜今後2年分の手続き予定）を一覧提示する最初の画面を実装する。

- 設計: [ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md)（Sprint 21 Phase21.1）
- 核心的な判断: [STATE_ENGINE.md](STATE_ENGINE.md) 7節が予告していた将来の簡略化式
  `Roadmap = f(State, ProcedureMaster, RuleEngine, 今日の日付)`を正式採用し、`RoadmapItem`の
  Confidenceは独自計算せず`StateField.confidence`をそのまま使う設計にした。Roadmap History
  （[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節）はTimelineで代替済みと
  結論づけ、独立実装しなかった
- 実装（Sprint21.2、実施済み）: `src/lib/roadmap.ts`（`RoadmapItem`/`RoadmapYear`型、
  `buildAnnualRoadmap()`）、`/roadmap`ページ（一覧表示のみ、AI参謀・通知エンジンとは未接続）。
  既存の`runDiagnosis`/`evaluateRules`/`applyCompanyProfileToProcedures`/`calculateNextDeadline`は
  いずれも無変更のまま、「次のN回」ラッパーで複数年分に展開する設計で再利用した。あわせて
  `procedures.category`の`'local_tax'`がTypeScript型に未追加だった既知の表示バグ（地方税系5件が
  「その他」にフォールバックしていた）も解消した
- 既知の制約: `withholdingTaxCycle`のState欠落（v0.15から持ち越し）、消費税中間申告の年3回/11回の
  複数期日対応、`buildRoadmapForesight`/`buildRoadmapAlerts`は未着手のままスコープ外とした
- 複数年ホライズンはβ版として3年固定を採用（[ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md) 6-2節）

## v0.17 Company Workspace ✅ 部分実装済み（正式系として採用、Sprint29確定）

**2026-07-10追記（Sprint22〜29の実装状況）**: Sprint22〜27で以下を実装済み。

- `workspace_companies` / `workspace_company_profiles` / `workspace_members`（未使用） /
  `workspace_share_links`（Sprint22.4）、`workspace_procedure_statuses`（Sprint24.1）、
  `workspace_documents`（Sprint26）の6テーブル
- 会社一覧・新規登録・会社別Workspace（Profile / Annual Roadmap / Documents / Share の4タブ）
- Workspace Dashboard（今日やること／期限警告／意思決定／進捗サマリー／AI参謀／会社概要、Sprint25・27）
- 経営者への共有リンク（`get_shared_workspace_view` RPC、ログイン不要のトークン方式、Sprint24.0）

以下は本節が設計した10タブ構成のうち**未実装のまま**であることを確認済み
（[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 2-2節）: Tax Return Profile
（Sprint33で対応予定）、Timeline（独立画面なし、Dashboard内部の計算にのみ使用）、Events、
Accounting Data、Financial Analysis。7節が設計した4ロール権限モデル（管理者/担当者/経営者/閲覧のみ）も
**未実装**で、現状は「`admin_users`登録者なら誰でも全社アクセス可」というフラットな権限モデルのまま
運用されている（Sprint31で対応予定、5-2節参照）。

**Sprint29での確定事項**: [WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md)により、
`/admin/workspaces/*`を正式系（Primary）、`(site)`配下を互換・検証用と位置づけることが確定した
（`/start`・`/result`は匿名リード獲得の独立した役割として例外的に存続）。今後の新機能は原則Workspace側
のみに実装する。

**狙い**: SUNBOOの主利用者を「経営者本人」から「管理者・税理士」へ転換する。管理者・税理士が
会社ごとにログインし、Company Profile・Tax Return Profile・Timeline・State・Annual Roadmap・
Events・Accounting Data・Financial Analysis・AI参謀・Documentsを一元管理し、必要な情報だけを
経営者へ共有できるモデルを目指す。v0.8「顧問先管理」が置いていた構想を正式に具体化するもの。

- 設計: [COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)（Sprint 22 Phase22.1）
- 核心的な判断: 診断エンジン・Rule Engine・Timeline/State/Annual Roadmap Engine・AI参謀・
  通知エンジンはいずれも「渡されたデータに対する純粋関数」であり、`localStorage`かDBかを
  関知しない設計になっている。**Company Workspaceはこれらの計算ロジックを一切変更せず、
  「データの出どころ」と「誰が見られるか」だけを変える利用モデルの転換**と位置づけた
  （同ドキュメント1-2節）
- 新規導入する概念: 会社一覧・会社別Workspace（10タブ構成）、経営者への共有リンクモデル
  （ログイン不要、項目単位でトグル）、4段階の権限設計（管理者/担当者/経営者/閲覧のみ、
  現状の`admin_users`はロールを持たないため完全新規）
- 最重要の要判断事項: 本番に既に存在する素性不明の`companies`/`company_events`
  （`auth_user_id`/`company_id`軸、`admin_read`ポリシー付き。v0.8の注記で判明済み）を
  流用するか、無関係として扱い新規設計するか（同ドキュメント0節・8-3節）
  **→ Sprint22.2で決着済み**: [COMPANY_WORKSPACE_DB_AUDIT.md](COMPANY_WORKSPACE_DB_AUDIT.md)の調査により
  「流用しない・新規`workspace_companies`等を作る」（B案）を採用。素性不明の`companies`/`company_events`は
  触らずそのまま残置している
- その他の要判断事項: `(site)`配下の`/profile`/`/events`/`/roadmap`/`/result`を段階的共存
  させるか、Workspaceへ一本化するか（同ドキュメント9-3節）
  **→ Sprint29で決着済み**: [WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md)により
  「段階的共存」（A案）に近い中間案（Workspaceを正式系とし、`(site)`は互換・検証用として新機能停止・
  バグ修正のみに縮小、`/start`・`/result`のみ例外的に独立存続）を採用
  。経営者への共有を将来的に軽量ログインへ拡張するタイミング（同ドキュメント6-2節）は引き続き未決
- Sprint22.2〜22.6の段階的な実装順序案は[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md) 10節を参照
  （実際の実装順序はSprint22.4「4テーブルのみへのスコープ縮小」等、詳細は
  [WORKSPACE_DB_MVP_MIGRATION.md](WORKSPACE_DB_MVP_MIGRATION.md)参照）

## v0.18 Architecture Review & Migration Strategy ✅ 完了（Sprint28〜29）

**狙い**: Sprint22〜27でCompany Workspace化が急速に進んだ一方、設計ドキュメントの更新が追いつかず
（本ファイル冒頭参照）、技術的負債・権限モデルの不足・データモデルの周期性課題が蓄積していた。
これを実コード・migration・git historyの直接確認に基づいて棚卸しし、Sprint30以降の実装順序を確定する。

- Sprint28: [ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)。最重要3課題
  （設計ドキュメントと実装の同期／周期的ステータス管理の再設計／Workspace単位のアクセス制御）を特定
- Sprint29: [WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md)。`(site)`とWorkspaceの
  役割分担を確定し、本ファイル（`ROADMAP.md`）を実装状況に同期
- Sprint30以降の推奨順序: 30 周期的ステータス再設計 → 31 Workspace単位のアクセス制御 →
  32 Workspaceデータ取得共通化 → 33 Tax Return ProfileのWorkspace対応

## v0.19 β版準備 ✅ 完了（Sprint30〜42）

**狙い**: v0.18のレビューで特定した課題を解消し、Company Workspaceを実際の税理士・会計事務所に
試用してもらえる水準まで引き上げる。

- Sprint30〜32: 周期的ステータス管理を`(company_id, procedure_id, occurrence_key)`単位に再設計
  （[PERIODIC_STATUS_REDESIGN.md](PERIODIC_STATUS_REDESIGN.md)）。月次・年次で同じ手続きが複数回
  出現する場合の状態管理が正しく機能するようになった
- Sprint33: Workspace単位のアクセス制御（`workspace_members`の`owner`/`member`/`viewer`ロール、
  `admin_users`と合わせた2層モデル）を実装。従来「`admin_users`登録者なら誰でも全社アクセス可」
  だったフラットな権限モデルを解消した
- Sprint34: Dashboard・Roadmap・Profile・Documents・Shareが個別に書いていたデータ取得ロジックを
  `src/lib/workspaceLoader.ts`へ共通化
- Sprint35: Tax Return Profile（決算実績）をlocalStorageからDB（`workspace_tax_return_profiles`）へ
  対応
- Sprint36〜39: 通知エンジンの設計・実装。Notification Engine設計（Sprint36、
  [NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md)）→Notification Center MVP実装
  （Sprint37、画面内通知のみ）→Notification Settings設計（Sprint38、
  [NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md)）→Notification Delivery
  Architecture設計（Sprint39、[NOTIFICATION_DELIVERY_ARCHITECTURE.md](NOTIFICATION_DELIVERY_ARCHITECTURE.md)）。
  メール・Slack・LINE・Web Push等の外部push配信は設計のみで未実装のまま
- Sprint40: v1.0 Release Candidate Review。実コードを直接確認し、UX・RLS・セキュリティ・技術的負債を
  棚卸しした（[V1_RELEASE_CANDIDATE_REVIEW.md](V1_RELEASE_CANDIDATE_REVIEW.md)、総合評価B）
- Sprint41: Beta Polish。破壊的操作（決算実績削除・共有リンク失効）への確認ダイアログ追加、
  withholdingTaxCycle未反映・共有リンク無期限であることのUI上の注意表示を追加
- Sprint42: クローズドβ launch計画整備（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)・
  [BETA_TEST_CHECKLIST.md](BETA_TEST_CHECKLIST.md)・[BETA_FEEDBACK_TEMPLATE.md](BETA_FEEDBACK_TEMPLATE.md)）
- Sprint43: Beta Reliability Polish。Workspace関連7ルートへの`loading.tsx`、`/admin/workspaces`配下の
  `error.tsx`、owner限定のWorkspace削除UI（`WorkspaceDeleteButton.tsx`、既存の`ON DELETE CASCADE`を
  利用しmigrationなし）を実装
- Sprint44: Closed Beta Start。β開始前の最終確認（Smoke Test 14項目・既知の制約の棚卸し・住民税
  特別徴収未実装の確認）を行い、[CLOSED_BETA_DAY1_RUNBOOK.md](CLOSED_BETA_DAY1_RUNBOOK.md)（初日実行
  手順）を新設。判定は「軽微な準備後に開始可能」。β自体はSprint44時点では未実施

**未解消のまま持ち越した既知の制約**: Events・Accounting Data・Financial Analysis・4段階権限モデルの
経営者向け軽量ログイン・住民税特別徴収は引き続き未実装。詳細は
[V1_RELEASE_CANDIDATE_REVIEW.md](V1_RELEASE_CANDIDATE_REVIEW.md) 21〜25節・
[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 23節を参照。

## v1.0 福岡県版正式リリース（未着手）

**狙い**: 東京都渋谷区・福岡県全域という現状の対応エリアのうち、福岡県を軸に正式リリースする。
リリース判定基準（有料化するかどうか、対応市区町村の精度検証、`procedure_organizations`等の未参照テーブルの
扱いをどうするか等）は着手時に改めて要件整理すること。v1.0完成条件の詳細は
[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)・
[WORKSPACE_MIGRATION_STRATEGY.md](WORKSPACE_MIGRATION_STRATEGY.md)の「v1.0完成条件」節を参照。
