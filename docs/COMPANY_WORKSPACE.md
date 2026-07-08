# COMPANY_WORKSPACE.md — Company Workspace設計（Sprint22 Phase22.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード実装・画面実装は本Phaseでは一切行っていない。**
実装はレビュー後、Sprint22.2以降で段階的に行う（10節参照）。

**これは方針転換の設計書である。** これまでのSprintは「経営者本人がブラウザで直接入力し、
`localStorage`に保存する匿名モデル」を前提に積み上げてきた（[DATABASE.md](DATABASE.md)
「永続的な`companies`エンティティは意図的に作らない」）。本Sprintはこの前提そのものを見直し、
**「管理者・税理士が会社ごとに代行管理し、必要な情報だけを経営者へ共有する」モデル**への転換を設計する。

## 0. 前提として確認した既存事実

設計に入る前に、既存コード・既存設計書・本番DBの状態を確認した。

- **現状の全設計ドキュメントは「永続的な`companies`エンティティを意図的に作らない」という方針を
  一貫して明記している**（[DATABASE.md](DATABASE.md)「経営イベントエンジン」節、
  [ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 0節、
  [COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md) 1-1節）。**本Sprintはこの方針を正式に転換する**
  最初の設計であり、以降の設計書はこの転換を前提に読み替える必要がある
- **`docs/ROADMAP.md` v0.8「顧問先管理」が、まさに本Sprintが着手する内容の置き場としてあらかじめ
  用意されていた。** 同節は「税理士・社労士事務所が複数の顧問先企業を一括管理できるようにする」
  「着手前に必ずユーザーと設計方針を確認すること」と明記しており、**本Sprintの開始指示（管理者・
  税理士が主利用者である、という方針転換）は、v0.8が置かれた時点で想定されていたシナリオそのもの**
  である
- **本番Supabaseプロジェクトには、素性不明ながら本Sprintの要件と酷似した`companies`
  （`auth_user_id`列）＋`company_events`（`company_id`列）というテーブルが既に存在する**
  （[DATABASE.md](DATABASE.md)「経営イベントエンジン」節の注記、2026-07-05判明）。
  `own_select`/`own_insert`/`own_update`/`own_delete`（本人の行のみ操作可）に加えて
  **`admin_read`ポリシーが既に定義されている**——これは「本人以外に管理者が全件参照できる」
  という、本Sprintが必要とする権限構造とほぼ同じ形である。ただしアプリケーションコードからの
  参照は一切なく、作成経緯・スキーマ全体は未確認。ROADMAP.md v0.8は「これを流用するか無関係として
  扱うかをまずユーザーに確認すること」と既に指示しており、**本設計でもこれを最重要の要判断事項として
  引き継ぐ**（8節・まとめ）
- **一般ユーザー向けの認証機構は存在しない。** Supabase Auth（メール・パスワード）は管理画面
  （`admin_users`との突き合わせ）専用であり、`(site)`配下の一般ユーザーは`browser_id`
  （`localStorage`生成UUID）でしか識別されない（[ARCHITECTURE.md](ARCHITECTURE.md)）
- **`admin_users`はロールを持たないフラットな全権管理者リストである。** `email`・`name`のみ
  （`supabase/admin_schema.sql`）。「担当者」「経営者」「閲覧のみ」という段階的な権限は
  現状一切存在しない。本Sprintの7節は完全に新規の設計になる
- **現状の管理画面（`/admin/(protected)/*`）は「手続きマスタ管理」専用であり、「会社」という
  概念を一切持たない。** `AdminShell.tsx`のナビは手続き・ルール・機関・CSV入出力のみ
  （[ARCHITECTURE.md](ARCHITECTURE.md)「主要ディレクトリ」）
- **経営者側の情報は現状すべて`localStorage`のみで永続化されている**（`CompanyProfile`:
  `sunboo:company-profile`、`TaxReturnProfile`: `sunboo:tax-return-profile`、手動/system記録の
  `TimelineEvent`: `sunboo:timeline-events`、完了ステータス: `ScheduleList.tsx`の`STATUS_KEY`）。
  **DBに永続化されている経営者側データは`anonymous_company_events`（`browser_id`軸）のみ**
- **State（`src/lib/state.ts`）・Annual Roadmap（`src/lib/roadmap.ts`）はいずれも「保存しない・
  都度計算する」設計であり、`TimelineEvent[]`・`CompanyProfile`・`CompanyState`のみを入力とする
  純粋関数として実装済み。** データの出どころ（`localStorage`かDBか）を一切関知しない設計に
  なっているため、**入力の取得元を差し替えるだけで計算ロジック自体は無変更のまま移行できる**
  （8節の中核的な前提）
- **診断エンジン・Rule Engine・AI参謀・通知エンジンも同様にすべて「渡されたデータに対する純粋関数」
  として設計されている**（`runDiagnosis`/`evaluateRules`/`buildAdviserSummary`等）。これらは
  「誰がデータを入力したか」「どこに保存されているか」を一切前提にしていないため、
  **Company Workspace化はこれらの計算ロジックを一切変更しない**（1節で明確化する）

---

## 1. Company Workspaceとは

**Company Workspaceとは、1社ごとに Company Profile〜Documents（5節）までのすべての情報を
1つの作業単位に集約した、管理者・税理士向けの画面群である。**

### 1-1. モデル転換の要点

| | これまで（匿名モデル） | Company Workspace以降 |
|---|---|---|
| 入力する人 | 経営者本人（`(site)`配下） | 管理者・税理士（`/admin`配下） |
| 見る人 | 入力した本人のみ | 管理者・税理士（全項目）／経営者（共有された項目のみ） |
| データの単位 | ブラウザ（`browser_id`） | 会社（`company_id`） |
| 認証 | 経営者側は認証なし | 管理者・税理士は既存のSupabase Auth。経営者側は6節で新設 |

### 1-2. 変更しないもの

**診断エンジン・Rule Engine・Timeline/State/Annual Roadmap Engine・AI参謀・通知エンジンは、
本Sprint以降も一切変更しない。** 0節で確認した通り、これらはすべて「渡されたデータに対する
純粋関数」として設計されており、「誰が入力したか」「`localStorage`かDBか」を関知しない。
**Company Workspaceは「データの出どころと、誰が見られるか」を変える利用モデルの転換であり、
計算ロジックの転換ではない。** この区別は実装フェーズ（Sprint22.2以降）で誤って計算ロジックに
手を入れないためにも重要である。

---

## 2. 管理者・税理士側の画面構成

既存の`/admin/(protected)/*`（手続きマスタ管理）とは別のセクションとして、会社ごとのWorkspaceを追加する。

```
/admin/(protected)/
├── (既存) ダッシュボード・手続き・ルール・機関・CSV入出力  ← 変更なし
└── companies/                          ← 新設（本Sprint以降）
    ├── page.tsx                        # 会社一覧（3節）
    ├── new/                            # 新規会社登録
    └── [companyId]/
        ├── page.tsx                    # Workspace概要（4節）
        ├── profile/                    # Company Profile
        ├── tax-returns/                # Tax Return Profile
        ├── timeline/                   # Timeline
        ├── roadmap/                    # Annual Roadmap（Stateは表示に内包、独立画面は持たない）
        ├── events/                     # Events
        ├── accounting/                 # Accounting Data
        ├── analysis/                   # Financial Analysis
        ├── adviser/                    # AI Adviser
        ├── documents/                  # Documents
        └── share/                      # Share Settings
```

`AdminShell.tsx`のナビ（`NAV_ITEMS`）に「顧問先」を追加し、既存の手続きマスタ管理系メニューとは
視覚的に区切る（実装時にセクション見出しを設ける想定、UIルールは既存の管理画面トーンを踏襲）。

---

## 3. 会社一覧

`/admin/(protected)/companies` で以下を表示する。

| 列 | 内容 |
|---|---|
| 会社名 | `CompanyProfile`相当の名称（現行の型に`companyName`が無いため8節で追加が必要） |
| ステージ | `stage`（State優先、無ければCompanyProfile） |
| 直近の要対応件数 | その会社のAnnual Roadmapのうち、超過・7日以内の件数（`buildAnnualRoadmap`をそのまま利用） |
| 担当者 | 7節の「担当者」ロールが割り当てられていればその名前 |
| 最終更新日 | Timelineの最新`recordedAt`（Timeline Engineの既存フィールドをそのまま利用） |
| 共有状態 | 6節のShare Settingsが1件以上有効か |

フィルタ: 担当者別・ステージ別・共有状態別。検索: 会社名。新規会社登録は「会社を追加」から
`Company Profile`の初期入力画面（既存`/events`の会社情報登録フォームと同等の項目）へ遷移する。

---

## 4. 会社別Workspace

`/admin/(protected)/companies/[companyId]` に入ると、5節の10項目に対応するタブ構成で表示する。
概要タブ（`page.tsx`）には以下を集約する。

- AI参謀サマリー（`buildAdviserSummary`/`buildAdviserComment`をそのまま利用）
- Annual Roadmapの直近3ヶ月分の抜粋
- 未解決のリスク（`buildRiskEntries`）
- 共有状態（どの情報が経営者に見えているか、6節）

**概要タブは新しい計算を行わない。** 既存のAI参謀・Roadmap Engineの出力をそのまま並べるダッシュボードであり、
`ScheduleList.tsx`の`AdviserCard`相当の表示ロジックを管理画面向けに再利用する想定（実装フェーズで判断）。

---

## 5. Workspace内で管理する情報

### 5-1. Company Profile

既存`src/lib/companyProfile.ts`の`CompanyProfile`型をそのままDBスキーマの下敷きにする（型自体は
変更しない。永続化先を`localStorage`からDBへ変える、という8節の移行が主眼）。管理者・担当者が
経営者に代わって入力する画面になる。

### 5-2. Tax Return Profile

既存`src/lib/taxReturnProfile.ts`の`TaxReturnEntry`/`TaxReturnProfile`型を下敷きにする。決算のたびに
管理者・税理士が確定申告実績を追記する運用に変わる（経営者本人が入力する運用は6節で扱う「軽微な
情報提供」に限定する）。

### 5-3. Timeline

既存`src/lib/timeline.ts`/`timelineProducer.ts`の`TimelineEvent`型・`buildTimelineFromSources`を
そのまま利用する。`company_profile`/`tax_return_profile`/`event`ソースはCompany Profile・Tax Return
Profile・Eventsの各DBテーブルから構築し、`manual`/`system`ソースのみを持つ`sunboo:timeline-events`
（`localStorage`）は company_id 軸のDBテーブルに置き換える（8節）。

### 5-4. State

既存`src/lib/state.ts`の`buildStateFromTimeline`をそのまま利用する。Stateは保存しない原則を維持し、
Workspace内では独立画面を持たず、各タブ（Roadmap・Adviserタブ等）の中でConfidence表示として
埋め込む（0節・1-2節）。

### 5-5. Annual Roadmap

既存`src/lib/roadmap.ts`の`buildAnnualRoadmap`をそのまま利用する。会社別Workspaceの`roadmap`タブで、
現行`/roadmap`と同じ年→月の一覧表示を行う（9節で現行`/roadmap`との関係を整理する）。

### 5-6. Events

既存`anonymous_company_events`相当のイベント登録・一覧を`company_id`軸に置き換える（8節）。
`registerCompanyEvent`（`src/lib/events.ts`）のRule Engine評価ロジックは変更しない。

### 5-7. Accounting Data（新規）

決算書・試算表等の会計データを保持する新しい概念。[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)
9節が将来構想として挙げていた「freee/MF等の会計データ連携」の実現先として、本タブを正式に位置づける。
本Sprintでは**保持する項目の具体的なスキーマは設計しない**（Sprint22.x以降、連携先の会計ソフトAPIの
仕様が固まった時点で改めて設計する）。MVPでは手入力またはDocuments（5-10節）へのファイル添付に留める案を提示する。

### 5-8. Financial Analysis（新規）

Tax Return Profileの時系列データ（`taxableSalesAmount`・`corporateTaxAmount`等の`AmountValue`推移）を
グラフ・増減率で表示する分析レイヤー。**新しい入力データは必要とせず、既存のTax Return Profileの
蓄積から導出する表示専用機能**という位置づけにする（Roadmap Engineと同じ「既存データからの派生」
という設計方針を踏襲）。

### 5-9. AI Adviser

既存`src/lib/adviserScore.ts`の各関数（`buildAdviserSummary`・`buildAdviserComment`・
`buildLookaheadComment`・`buildRiskEntries`・`buildProfileAdvisories`・`buildClosingUpdateSummary`）は
**一切変更しない**。会社別Workspaceのデータ（DB由来の`ScheduleProcedure[]`・`CompanyProfile`）を
渡すだけで、既存のまま動作する（0節）。

### 5-10. Documents（新規）

決算書・登記簿謄本・申告書控え等のファイル添付。Supabase Storageの利用を想定する（本Sprintでは
バケット設計・アクセス制御の詳細までは設計しない。Sprint22.x以降で改めて設計する）。

### 5-11. Share Settings

6節「経営者への共有モデル」の設定画面。5-1〜5-10の各項目ごとに「経営者に共有するか」を
トグルする（項目単位の粒度。デフォルトはすべて非共有）。

---

## 6. 経営者への共有モデル

### 6-1. 基本方針

**経営者にSUNBOOのフルアカウントを持たせる設計にはしない。** 0節で確認した「一般ユーザー向け
認証機構が存在しない」という既存方針をなるべく踏襲し、**共有リンク方式**を基本とする。

- 管理者・担当者がShare Settings（5-11節）で共有する項目を選び、共有用のURL（推測困難なトークン付き）を発行する
- 経営者はそのURLにアクセスするだけで、共有された項目のみを閲覧できる（ログイン不要）
- URLには有効期限を任意で設定できる（無期限も許容する）

### 6-2. 将来の拡張（本Sprintでは設計しない）

経営者からの軽微な情報提供（決算数値の一次入力、書類のアップロード等）を受け付けたい場合、
共有リンクだけでは「誰が書き込んだか」の追跡ができない。将来的にメールアドレスのみで完結する
簡易ログイン（マジックリンク等、パスワード不要な方式）を検討する余地があるが、**これは7節の
「経営者」ロールが編集操作を必要とすると判断された場合にのみ着手する**、次Sprint以降の課題とする。

### 6-3. 注意書きの継承

共有画面にも、既存の`caution_note`パターンと同じ「一般的な参考情報である旨」「専門家への確認を
促す注意書き」を必ず添える（[CLAUDE.md](../CLAUDE.md)の思想を踏襲。特に経営者本人が直接目にする
画面であるため、記帳・電子申告・法的助言そのものではないことを明確にする重要性が一般公開ページ以上に高い）。

---

## 7. 権限設計

0節の通り、現状`admin_users`はロールを持たない全権管理者リストのみである。本節は完全に新規の設計になる。

| ロール | 対象 | 範囲 | 主な操作 |
|---|---|---|---|
| **管理者** | SUNBOO運営・管理事務所の代表者 | 全社 | 全機能（会社の追加・削除、担当者の割当、既存の手続きマスタ管理を含む） |
| **担当者** | 顧問先を担当する税理士・スタッフ | 割り当てられた会社のみ | 担当会社のWorkspace全項目の閲覧・編集、Share Settingsの設定 |
| **経営者** | 顧問先企業の代表者・経理担当 | 自社のうち共有された項目のみ | 閲覧、将来的な軽微な情報提供（6-2節、本Sprintでは設計しない） |
| **閲覧のみ** | 経営者が追加で招待する社内関係者等 | 経営者と同じ共有範囲 | 閲覧のみ（経営者ロールとの違いは将来の書き込み権限の有無） |

### 7-1. 実装イメージ（設計イメージ、本Sprintではコード化しない）

- **管理者・担当者**: 既存の`admin_users`に`role`列（`'admin' | 'staff'`）を追加し、新設する
  `company_staff_assignments`（`admin_email`, `company_id`, 複合PK）で「誰がどの会社を担当するか」を
  表現する。RLSは`admin_users.role = 'admin'`なら全社、`'staff'`なら`company_staff_assignments`に
  自分の`email`と対象`company_id`の組が存在する場合のみ、というポリシーになる見込み
- **経営者・閲覧のみ**: `admin_users`とは別の认証系列にする（6-1節の共有リンク方式が基本のため、
  多くの場合は認証テーブル自体が不要）。将来6-2節の軽量ログインを導入する場合のみ、
  `company_viewers`（`email`, `company_id`, `role`: `'owner' | 'viewer'`）のような別テーブルを検討する

### 7-2. 既存の`admin_users`ポリシーへの影響

既存の手続きマスタ管理（procedures/rules/offices等）の`admin_insert`/`admin_update`/`admin_delete`
ポリシーは`role`に関わらず**「管理者」ロールのみに絞る**方向で見直しが必要になる見込みだが、
**この見直し自体は本Sprintのスコープ外**（既存の手続きマスタ管理機能に影響するため、
Company Workspace本体の実装が固まってから別途設計する。10節）。

---

## 8. 既存localStorage実装から将来DB実装への移行方針

### 8-1. 移行の基本方針

0節で確認した通り、**Timeline/State/Annual Roadmap Engine・診断エンジン・Rule Engine・AI参謀・
通知エンジンはすべて「渡されたデータに対する純粋関数」であり、`localStorage`かDBかを一切関知しない。**
したがって移行は次の2層に完全に分離できる。

| 層 | 内容 | 変更要否 |
|---|---|---|
| **データ取得層** | `loadCompanyProfile`/`loadTaxReturnProfile`/`loadTimelineEvents`等の`load*`/`save*`関数 | **置き換える**（`localStorage`直読み→`company_id`付きDBクエリ） |
| **計算ロジック層** | `buildTimelineFromSources`/`buildStateFromTimeline`/`buildAnnualRoadmap`/`evaluateRules`/`runDiagnosis`/`adviserScore.ts`/`notificationEngine.ts` | **変更なし**（呼び出し元が渡すデータの出どころが変わるだけ） |

### 8-2. 移行ステップ（イメージ、Sprint22.x以降で段階実装）

1. **`companies`テーブルの新設 or 既存流用の判断**（0節・まとめ節の最重要な要判断事項）
2. `company_profiles`/`tax_return_entries`/`timeline_events`をそれぞれ`company_id`外部キー付きで新設
   （既存の`CompanyProfile`/`TaxReturnEntry`/`TimelineEvent`型のフィールドをほぼそのままカラムに転写できる
   設計になっている。JSON型のまま`metadata`カラムに保持する部分と、検索・フィルタに使うため個別カラムに
   分解する部分の切り分けは実装フェーズで判断する）
3. `anonymous_company_events`を`company_id`軸に段階移行する。**`browser_id`列は当面残し、
   ロールバック安全性を確保する**（[CLAUDE.md](../CLAUDE.md)「旧テーブルは即座には削除しない」原則を踏襲）
4. `load*`/`save*`関数を、`company_id`を引数に取るDBクエリ版に置き換える。呼び出し側
   （ページコンポーネント・`roadmap.ts`等）のシグネチャ変更は「`profile`を直接渡す」形を維持し、
   「`profile`をどこから取得するか」だけを呼び出し元（Workspaceページ）に閉じ込める
5. 既存の`(site)`配下ページ（9節）との共存期間中は、DB移行後もデータ形式（型）は変えないため、
   計算ロジックへの影響はゼロという前提を保つ

### 8-3. 既存レガシーテーブルの扱い（要判断）

0節で確認した本番の`companies`/`company_events`（`auth_user_id`/`company_id`軸、`admin_read`ポリシー
付き）をそのまま流用するか、無関係として扱い新規に設計し直すかは、**ROADMAP.md v0.8が着手前の
確認事項として既に明記していた通り、本Sprintのレビューで確定させる**（まとめ節）。

---

## 9. 現在の /profile /events /roadmap /result をWorkspace配下へ移す方針

### 9-1. 現状

`(site)`配下の4画面（`/profile`、`/events`、`/roadmap`、`/result`）はいずれも`'use client'`で
`localStorage`＋`browser_id`前提で実装済み（Sprint14〜21）。

### 9-2. 移行後の位置づけ

これらの画面が持つ「入力フォーム」「表示ロジック」自体（UIコンポーネント）は再利用し、
**URLの位置と権限チェックの層をWorkspace配下に移す**。

```
(site)/profile/page.tsx         → admin/(protected)/companies/[companyId]/profile/page.tsx
(site)/events/page.tsx          → admin/(protected)/companies/[companyId]/events/page.tsx
(site)/roadmap/page.tsx         → admin/(protected)/companies/[companyId]/roadmap/page.tsx
(site)/result/ScheduleList.tsx  → 会社別Workspace概要タブ（4節）に統合
```

フォームの入力項目・バリデーション・表示コンポーネント自体はほぼそのまま移設できる想定（データの
取得元が`loadCompanyProfile()`から`company_id`付きDBクエリに変わるのみ、8-1節）。

### 9-3. 過渡期の共存方針（要判断）

以下の2案があり、**本Sprintでは決定せず、レビューで方向性を確認する**。

| 案 | 内容 | メリット | デメリット |
|---|---|---|---|
| A. 段階的共存 | `(site)`配下は「アカウントを持たない個人事業主等が自分で触れる」入口として当面残し、Workspace配下と並存させる | 既存ユーザー・既存URLへの影響がない | 2つの入力経路（`localStorage`とDB）を同時に保守するコストが生じる |
| B. 一本化 | `(site)`配下は廃止（またはWorkspaceへのリダイレクト）し、Company Workspaceに一本化する | 保守対象が1つに絞れる | 既存のβテスターが使っていた導線が失われる |

### 9-4. `browser_id`ベースのβテストデータの扱い

Sprint10〜13で実施したβテストの参加者データ（`anonymous_company_events`の既存行）をどう扱うかも、
9-3節の判断と合わせて確認が必要（会社として引き継ぐか、テストデータとして切り離すか）。

---

## 10. Sprint22.2〜22.6実装計画

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **22.2** | `companies`テーブルの新設 or 既存流用の確定、`company_profiles`/`tax_return_entries`テーブル新設、GRANT/RLS（管理者・担当者ロール） | `supabase/migration_company_workspace.sql`（新規） | Sprint22.1レビュー承認、8-3節の判断確定 | 8-3節の流用可否 |
| **22.3** | 会社一覧・会社別Workspace（Profile/Tax Returnタブ）の画面実装 | `src/app/admin/(protected)/companies/`（新規） | 22.2完了 | 3節の一覧に出す指標の優先順位 |
| **22.4** | `timeline_events`テーブル新設、`anonymous_company_events`の`company_id`軸移行、Timeline/State/Roadmapタブの実装 | `src/lib/timeline.ts`等のload/save層、Workspaceの該当タブ | 22.3完了 | 9-4節のβテストデータの扱い |
| **22.5** | Share Settings・共有リンクの実装 | `src/app/admin/(protected)/companies/[companyId]/share/`、共有用の閲覧専用ルート（新規） | 22.4完了 | 6-2節の軽量ログイン要否 |
| **22.6** | `(site)`配下4画面の扱い確定（9-3節A案/B案のいずれかを実装） | `src/app/(site)/profile/`, `events/`, `roadmap/`, `result/` | 22.5完了 | 9-3節の最終判断 |

Accounting Data（5-7節）・Financial Analysis（5-8節）・Documents（5-10節）・7-2節の既存
`admin_users`ポリシー見直しは、22.6以降の別Sprintで改めて設計する。

---

## まとめ（設計レビュー観点）

1. **最重要**: 本番に存在する素性不明の`companies`/`company_events`（`admin_read`ポリシー付き）を
   流用するか、無関係として扱い新規設計するか（0節・8-3節）。ROADMAP.md v0.8が着手前の確認事項として
   明記していた通り、ここでの判断がSprint22.2の実装内容を大きく左右する
2. **1-2節**: 「計算ロジックは変更せず、データの出どころと閲覧権限だけを変える」という切り分けが
   正しいか。既存のTimeline/State/Roadmap/AI参謀・通知エンジンを一切変更しない前提でよいか
3. **6節**: 経営者への共有をリンク方式（ログイン不要）から始める方針でよいか。将来の軽量ログイン
   （6-2節）が必要になるタイミングの見極め
4. **7節**: 4ロール（管理者/担当者/経営者/閲覧のみ）の権限範囲・実装イメージ（`company_staff_assignments`
   等）が妥当か。特に「経営者」と「閲覧のみ」の違い（将来の書き込み権限のみ、という整理）でよいか
5. **9-3節**: `(site)`配下4画面を段階的共存（A案）にするか、Workspaceへ一本化（B案）にするか。
   既存βテスターへの影響をどう扱うか（9-4節）
6. **10節**: 実装順序（22.2〜22.6）が妥当か。Accounting Data・Financial Analysis・Documentsを
   22.6以降に持ち越した判断でよいか
