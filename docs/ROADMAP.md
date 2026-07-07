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

## v0.6 年間スケジュール（未着手）

**狙い**: 「今日やること」（Phase 1.6）は単発の診断・イベント結果に閉じている。年次・月次で繰り返し発生する
手続き（源泉所得税の毎月納付、算定基礎届、労働保険年度更新、年末調整等）を含め、1年間を通じたカレンダー
ビューとして提示する。

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

## v0.9 AI参謀β（未着手）

**狙い**: 蓄積された会社データ・手続き履歴・ルール判定結果をもとに、AIが経営者に能動的な助言を行う機能。
本ドキュメント整備（Phase 2.6）自体が、このフェーズに向けた「AIが読める設計資産」を残す準備という位置づけ。
着手時は既存のルールエンジンの`context`／`rules`データをAIの判断材料としてどう連携するかが論点になる。
→ 長期見通し（Roadmap Foresight）としての発展形はv0.11で設計済み（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7節）。

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

## v0.14 Timeline Engine（設計完了・実装未着手）

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

## v0.15 State Engine（設計完了・実装未着手）

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

## v1.0 福岡県版正式リリース（未着手）

**狙い**: 東京都渋谷区・福岡県全域という現状の対応エリアのうち、福岡県を軸に正式リリースする。
リリース判定基準（有料化するかどうか、対応市区町村の精度検証、`procedure_organizations`等の未参照テーブルの
扱いをどうするか等）は着手時に改めて要件整理すること。
