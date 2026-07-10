# ARCHITECTURE_REVIEW_SPRINT28.md — 全体アーキテクチャレビュー（Sprint28）

**ステータス: 設計レビューのみ。コード変更・DB変更・画面変更は一切行っていない。**

本レビューは、既存の設計ドキュメント（`docs/*.md`）の記述を鵜呑みにせず、**実際のコード・実際のmigration SQL・実際のgit historyを直接確認した上で**まとめたものである。以下で「設計書は〜と書いているが、実装は〜だった」という形で乖離を明記している箇所は、すべて本Sprintで実ファイルを読んで確認済みの事実である。

調査対象: Sprint14〜27で実装されたCompany Profile Engine・Timeline Engine・State Engine・Annual Roadmap Engine・Company Workspace・Procedure Status・AI Adviser・Dashboard・Documents・Decision Engineの全体、および既存の`(site)`側ページ・管理画面・Supabase migration一式。

---

## 1. 現在の全体アーキテクチャ

### 1-1. システム構成（変更なし）

`docs/ARCHITECTURE.md`が記述する構成——Next.js 16（App Router、独自バックエンドAPIサーバーなし）が Supabase-js経由でSupabase（PostgreSQL + Auth）に直接接続する構成——は、Sprint14〜27を通じて一貫して維持されている。API Routesは1件も存在しない。これは確認済みで、設計書と実装に乖離はない。

### 1-2. 「二重構造」の実像

SUNBOOは現在、**データの出どころが異なる2つの並行フロー**を持つ。

```
[匿名フロー]                          [Workspaceフロー]
(site)/profile, /events,              admin/workspaces/[id]/profile,
(site)/roadmap, (site)/result          /roadmap, /documents, /share
       │                                      │
       ▼                                      ▼
localStorage（sunboo:company-profile他）   workspace_companies
+ anonymous_company_events（browser_id軸） + workspace_company_profiles
       │                                      │
       └──────────────┬───────────────────────┘
                       ▼
         CompanyProfile型（src/lib/companyProfile.ts）
                       │
                       ▼
     buildTimelineFromSources / buildWorkspaceTimelineEvents
       （src/lib/timelineProducer.ts / workspaceTimelineProducer.ts）
                       │
                       ▼
              TimelineEvent[]（src/lib/timeline.ts の型）
                       │
                       ▼
            buildStateFromTimeline（src/lib/state.ts、無変更）
                       │
                       ▼
              CompanyState（StateField<T>の集合）
                       │
                       ▼
          buildAnnualRoadmap（src/lib/roadmap.ts、無変更）
                       │
                       ▼
                RoadmapYear[]（年→月→手続き）
                       │
        ┌──────────────┼───────────────────────┐
        ▼              ▼                       ▼
 workspace_procedure_statuses  workspace_documents（Workspaceのみ）
        │              │
        └──────┬───────┘
               ▼
   generateWorkspaceAdvice（状況説明）+ generateWorkspaceDecisions（行動提案）
               │
               ▼
        WorkspaceDashboard（/admin/workspaces/[id]）
```

**重要な確認事実（`docs/COMPANY_WORKSPACE.md` 1-2節の主張は実装と一致している）**: Timeline/State/Annual Roadmap Engine（`timeline.ts`/`state.ts`/`roadmap.ts`）は実際に「渡されたデータに対する純粋関数」として実装されており、`CompanyProfile`という共有型が匿名フローとWorkspaceフローの結節点になっている。`src/lib/workspaceCompanyProfile.ts`は`CompanyProfile`型を**型としてのみ**importし、DB行↔`CompanyProfile`の変換関数（`workspaceRowsToCompanyProfile`/`companyProfileToWorkspaceUpdatePayload`）を提供するだけの境界層である。これにより「計算ロジックは1つ、データの出どころが2つ」という設計意図は実際に守られている。これはこのプロジェクトの数少ない「設計通りに実装された」好例である。

一方、Timelineの生成ロジック自体は完全に同一ではない。`src/lib/timelineProducer.ts`の`buildTimelineFromSources`（(site)側が使用）は CompanyProfile + TaxReturnProfile（localStorage）+ `anonymous_company_events`（Supabase）+ 手動`TimelineEvent[]`（localStorage `sunboo:timeline-events`）の4ソースを統合するのに対し、`src/lib/workspaceTimelineProducer.ts`の`buildWorkspaceTimelineEvents`は`buildCompanyTimelineEvents`（1ソースのみ、`timelineProducer.ts`から直接呼び出し）しか使っていない。**これは重複ではなく能力差**である——`workspace_tax_return_profiles`・`workspace_company_events`テーブルがまだ存在しないため、Workspace側はまだ4ソース中1ソードしか組み込めていない（`workspaceTimelineProducer.ts`冒頭コメントに明記済み）。

### 1-3. Engine層の一覧（実際にコードを確認した現状）

| Engine | ファイル | 入力 | 出力 | 保存するか |
|---|---|---|---|---|
| Company Profile | `companyProfile.ts` | DB行 or localStorage | `CompanyProfile` | 呼び出し元次第 |
| Timeline（site） | `timelineProducer.ts` | Profile+TaxReturn+Events+手動 | `TimelineEvent[]` | しない |
| Timeline（workspace） | `workspaceTimelineProducer.ts` | `CompanyProfile`のみ | `TimelineEvent[]` | しない |
| State | `state.ts` | `TimelineEvent[]` | `CompanyState` | しない |
| Annual Roadmap | `roadmap.ts` | `CompanyProfile`+`CompanyState` | `RoadmapYear[]` | しない |
| AI Adviser | `workspaceAdvice.ts` | Roadmap+ProcedureStatus+State | `WorkspaceAdvice`（状況説明） | しない |
| Decision Engine | `workspaceDecisions.ts` | Profile+State+Roadmap+ProcedureStatus+DocumentStatus | `WorkspaceDecisions`（行動提案） | しない |
| 診断エンジン | `diagnosis.ts` | `DiagnosisInput` | `ProcedureResult[]` | しない |
| Rule Engine | `ruleEngine.ts` | `RuleContext` | 追加/警告/上書き | しない |

すべて「保存しない・都度計算する純粋関数」という設計方針が徹底されている。これは高く評価できる一貫性であり、Sprint22〜27を通じて崩れていない。

---

## 2. 実装済みと未実装

### 2-1. 重大な発見: 設計ドキュメントが実装状況を反映していない

`PROJECT_CONTEXT.md`（「v0.6以降は未着手」）と`docs/ROADMAP.md`（v0.14 Timeline Engine「設計完了・実装未着手」、v0.15 State Engine「設計完了・実装未着手」、v0.16は実装済みと正しく記載されているが、v0.17 Company Workspaceは「設計完了・実装未着手」）は、**いずれも現状のコードと一致していない**。実際には：

- Timeline Engine（v0.14） → **実装済み**（`timeline.ts`/`timelineProducer.ts`/`workspaceTimelineProducer.ts`）
- State Engine（v0.15） → **実装済み**（`state.ts`、Sprint20〜）
- Company Workspace（v0.17） → **部分実装済み**（Sprint22〜27、下記2-2参照）
- AI参謀β（v0.9） → **部分実装済み**（`workspaceAdvice.ts`、ルールベース。LLMは未使用）

これらのドキュメントはSprint21時点（Phase 2.6「設計資産化」）で書かれたまま、Sprint22以降のWorkspace化の進行に合わせて更新されていない。**これは軽微な誤字ではなく、「次のセッションが最短時間で状況を把握できるようにする」というPROJECT_CONTEXT.md自身の目的を損なう技術的負債である**（4節で詳述）。

### 2-2. Company Workspace: 設計（10タブ・4ロール）と実装の差分

`docs/COMPANY_WORKSPACE.md`は以下の10タブ構成を設計していた：Profile / Tax Return Profile / Timeline / Roadmap / Events / Accounting Data / Financial Analysis / AI Adviser / Documents / Share Settings。実装状況を実ファイルで確認した結果：

| タブ（設計） | 実装状況 | 実装場所 |
|---|---|---|
| Company Profile | ✅ 実装済み | `workspaces/[id]/profile/` |
| Tax Return Profile | ❌ **未実装**（テーブル自体が存在しない） | — |
| Timeline | △ 独立画面なし（Dashboard/Roadmap内部の計算にのみ使用） | — |
| Annual Roadmap | ✅ 実装済み | `workspaces/[id]/roadmap/` |
| Events | ❌ **未実装**（`workspace_company_events`テーブルなし） | — |
| Accounting Data | ❌ 未実装（設計自体が「本Sprintではスキーマ設計しない」としていた） | — |
| Financial Analysis | ❌ 未実装 | — |
| AI Adviser | ✅ 実装済み（設計時のLLM前提ではなくルールベース） | `WorkspaceDashboard`内 |
| Documents | △ **メタデータのみ実装**（ファイルアップロード未実装、5種固定） | `workspaces/[id]/documents/` |
| Share Settings | △ 部分実装（company/profile/roadmap/statusesは共有可能、項目単位のトグルUIはない） | `workspaces/[id]/share/` |

加えて、設計にない**Dashboard**（Sprint25）と**Decision Engine**（Sprint27）が新たに追加された。10タブ構成は「Workspaceを開いた最初の画面がタブの目次になる」という設計だったが、実際にはSprint25で「ホームダッシュボードに主要情報を集約し、タブへのリンクは補助的なグリッドとして残す」という異なるUXに変わっている（7節で評価）。

**「決算実績」タイルの実装バグ**: `workspaces/[id]/page.tsx`のSECTIONS配列で「決算実績」は`comingSoon: false`（＝実装済み表示）だが`hrefSuffix: null`（＝リンク先がない）という組み合わせになっている。他の`comingSoon: true`項目（会計分析・旧「書類」枠）は正しく「Coming Soon」バッジ付きで無効なカードとして表示されるが、「決算実績」だけはバッジなしでクリックできない静的カードとして表示される。**これはSprint23.1の実装時点のバグで、Tax Return Profileが未実装のまま7Sprint（23〜27）放置されている。**（4節・7節で再掲）

### 2-3. 権限モデル: 設計（4ロール）と実装の差分

`docs/COMPANY_WORKSPACE.md` 7節は「管理者/担当者/経営者/閲覧のみ」の4ロール・`company_staff_assignments`による多対多の担当割当を設計していたが、実装は`docs/WORKSPACE_DB_MVP_MIGRATION.md`の時点で意図的にスコープを絞り込み、**「`admin_users`登録者なら誰でも全社アクセス可」というフラットな権限モデルのみ**を実装した。`workspace_members`テーブル（`role`列を持つ）は作られたが、**アプリケーションコードから一切参照されていない**（`grep`で確認済み、0件）。これは5節で詳述する最重要のセキュリティ上のギャップである。

### 2-4. 既存(site)フローの状態

`(site)`配下の4画面（`/profile`、`/events`、`/roadmap`、`/result`）は削除されておらず、`localStorage` + `anonymous_company_events`（`browser_id`軸）で稼働し続けている。git logで確認したところ、**Sprint22以降（コミット`2a8ab1b`「feat: add company workspace shell」以降）、`(site)`配下への機能追加コミットは1件のみ**（`f110c5e`、`AnnualRoadmapView`をWorkspaceと共有化するための改修）であり、直近9コミットはすべてWorkspace関連である。事実上、新機能開発の主戦場はSprint22で(site)からWorkspaceへ完全に移った状態にある。

---

## 3. 技術的負債

優先度順（対応コストが低く影響が大きいものから）に整理する。

### 3-1. 設計ドキュメントの陳腐化（高優先度・対応コスト低）

`PROJECT_CONTEXT.md`・`docs/ROADMAP.md`がSprint21時点で止まっており、Sprint22〜27の実装（Company Workspace・Procedure Status・AI Adviser・Dashboard・Documents・Decision Engine）が一切反映されていない。CLAUDE.mdが要求する「新しいセッションが最短時間で状況を把握する」ための一次資料が機能不全に陥っている。本レビュー自体が「実コードを必ず確認せよ」と念押しされた理由もここにある。

### 3-2. 「決算実績」タイルの表示バグ（中優先度・対応コスト低）

2-2節参照。1行の設定ミス（`comingSoon: false`のままにしていた）だが、7 Sprintにわたり見過ごされている。ユーザーが実際にクリックして初めて「何も起きない」ことに気づく形になっており、Notion/Linear的な「静かなB2B SaaS」を志向するUIルールにも反する。

### 3-3. Workspace系ページ間のデータ取得ロジック重複（中優先度・対応コスト中）

実コードを行単位で突き合わせた結果、以下が確認された。

- `workspace_companies`を`id`で取得する処理が5ファイル（Dashboard・Roadmap・Documents・Share・Profile）に独立して書かれており、SELECT列リストも3パターンに分岐している（同じ意図なのに列指定がバラバラ）
- `prefectures`/`municipalities`を`code`から名称解決する処理が4ファイル（Dashboard・Roadmap・Profile・公開共有ページ）で一字一句同じコードとして重複している
- Dashboard（`workspaces/[id]/page.tsx`）とRoadmap（`workspaces/[id]/roadmap/page.tsx`）は、`workspace_company_profiles`/`prefectures`/`municipalities`/`workspace_procedure_statuses`の**4クエリを束ねる`Promise.all`が完全に一字一句同一**であり、その後の`workspaceRowsToCompanyProfile → buildWorkspaceTimelineEvents → buildStateFromTimeline → buildAnnualRoadmap`という4段パイプラインの呼び出しコードも実質同一。両ファイル合わせて約55行がほぼそのままコピーされている
- このパターンを1つにまとめる「会社のTimeline/State/Roadmapを一括取得する」共有ヘルパー関数は**存在しない**

これは動作上のバグではないが、今後Roadmap側の計算ロジックに変更が入った際、Dashboard側だけ直し忘れる／逆も然りという事故が起きやすい構造になっている。CLAUDE.md自身が「共通する処理は必ず共通関数として`src/lib/`に置き、両方から呼ぶこと」と明記している原則に反している状態。

### 3-4. `workspace_members`テーブルの死んだスキーマ（中優先度・対応コスト低だが要判断）

`workspace_members`テーブル・`role`列・`self_read`ポリシーはmigrationとして存在するが、アプリケーションコードから一切参照されない。将来の「担当者だけ会社を絞る」機能のための布石として意図的に残されたものだが（`WORKSPACE_DB_MVP_MIGRATION.md`に明記）、**このまま放置すると「権限管理機構がある」という誤った印象を後続の開発者・監査者に与える**リスクがある。5節で改めて扱う。

### 3-5. `get_shared_workspace_view`のRPC内の一貫性の欠如（中優先度・対応コスト低）

`company`・`profile`セクションは`shared_sections`（項目単位のトグル）でゲートされているが、Sprint24.1で追加された`statuses`（手続きステータス）は**`shared_sections`の判定を経由せず常に返却される**。これはmigrationファイル自身のコメントが認めている既知の非対称であり（「company/profileと異なりshared_sectionsによる判定は行わない」）、Share Settings機能が「項目単位で共有を選べる」ことを謳う設計（`COMPANY_WORKSPACE.md` 5-11節）と矛盾している。

### 3-6. その他軽微な負債

- `src/lib/types.ts`の未使用`Company`型（`docs/開発指示書_v1.md`の初期構想の残骸、`COMPANY_WORKSPACE_DB_AUDIT.md`で既に指摘済みだが未対応）
- `next lint`が既知の理由で動作しない（CLAUDE.mdでブロッカーにしない運用と明記済みだが、根本原因は未解決のまま）
- 旧`jurisdiction_offices`・`event_procedures`・本番に実在する素性不明の`companies`/`company_events`は、CLAUDE.mdの「即座に削除しない」原則通り意図的に残置されている（これ自体は負債ではなく妥当な判断だが、残置期間が伸びるほど「なぜ残っているか」を知る人が減るリスクはある）

---

## 4. 重複・責務の曖昧さ

### 4-1. AI Adviser と Decision Engine の境界（Sprint27で一度整理済み）

Sprint27のレビューで「AI Adviser＝状況説明、Decision＝行動提案」という役割分離が明文化され、Sprint27時点の実装ではPlaywrightで文単位の重複ゼロを確認済みである。ただし、この境界は**コードレベルで強制されていない**（型やlintルールで「Decisionは命令形の文言でなければならない」を機械的に検査する仕組みはなく、レビュー時の目視確認とコメントによる申し合わせのみで担保されている）。今後Sprintが進み別の担当者・別のセッションがどちらかの関数を拡張する際、この申し合わせを読まずに再び同じ事実を重複記述するリスクが残る。8節で対応案を提案する。

### 4-2. Dashboardへの情報集約度

`WorkspaceDashboard.tsx`は現在、以下6区画を1画面に集約している：今日やること／期限警告／意思決定／進捗サマリー／AI参謀／会社概要。これは「調べる時間をなくす」「一つにまとめる」というVISION.mdの原則には合致する設計判断だが、実データで見ると次の問題がある。

- 「今日やること」（Advice.priority）と「意思決定」（Decision.actions）は、**同じ手続きを別の入り口から見せている**（Sprint27で文言の重複は排除したが、同じ手続き名がカード間で2〜3回登場する構図は解消されていない）。ユーザー視点では「結局これは1個の対応事項なのか、2個の別の話なのか」が一見して分かりにくい
- 「期限警告」（Advice.warnings）と「意思決定」の高優先度アクションも、多くの場合同じ手続きを指す（意思決定側は書類ステータスとの突き合わせで初めて差別化される。書類が整っている手続きの場合、両カードはほぼ同じ内容を指したまま並ぶ）
- 6区画すべてが空でない状態（多くの手続きが未着手のアクティブな会社）では、1画面のスクロール量が大きくなる

**結論**: 現状は「情報が集まりすぎている」とまでは言えないが、**「今日やること」「期限警告」「意思決定」の3区画は将来的に統合を検討すべき候補**である。Decision Engineが成熟し、Advice由来の priority/warnings を完全に包含できる（＝Adviceの個別手続き言及をなくし、Adviceは「全体サマリーの1行」に純化する）タイミングで、3区画→1区画（意思決定）＋Adviceは要約行のみ、という再編が可能。8-9節で扱う。

### 4-3. Timelineプロデューサーの分岐（今は許容できるが要注視）

1-2節で述べた通り、site側とworkspace側のTimelineプロデューサーは重複ではなく能力差だが、**`workspace_tax_return_profiles`・`workspace_company_events`が実装された時点で、workspace側プロデューサーがsite側の`buildTimelineFromSources`とほぼ同じ形になっていく**。その時点で「関数を1つに統合するか、意図的に2つのまま保つか」を再度判断する必要がある。現状のまま先延ばしにしても実害はないが、Sprint29以降でTax Return Profileに着手する際に必ず立ち返るべき論点として記録しておく。

---

## 5. セキュリティ・権限レビュー

### 5-1. 認証境界（`/admin/*`への入り口）: 問題なし

`src/proxy.ts`（`/admin/:path*`にマッチ）と`src/lib/admin.ts`（Server Component側、`layout.tsx`経由）の2箇所で、**独立して同じ判定**（Supabase Authの有効なセッション、かつ`admin_users`にそのメールアドレスの行が存在すること）を行っている。多重防御として機能しており、どちらか一方が漏れても他方が防ぐ構造になっている。ここに欠陥は見つからなかった。

### 5-2. Workspace単位のアクセス制御: 重大なギャップを確認

**実コードを直接確認した結果、`/admin/workspaces/[id]/*`には「このIDの会社にアクセスしてよいか」という制御が一切存在しないことが確定した。**

- `src/proxy.ts`は`params.id`を一切見ていない。`admin_users`の行があれば、どの`id`でも通過する
- 全ワークスペースページのサーバー側クエリは`.eq('id', companyId)`または`.eq('company_id', companyId)`のみで絞り込んでおり、**どの管理者がどの会社を担当しているかという条件は一切含まれていない**
- Postgres RLSも`admin_all`ポリシー（`auth.email() IN (SELECT email FROM admin_users)`、`FOR ALL`）が全workspace系テーブルに一律適用されており、行レベルでの会社別制限は存在しない
- `workspace_members`テーブル（会社ごとの担当者を表現できるスキーマ）は存在するが、コードからもRLSからも一切参照されていない「死んだ権限機構」である

**結果として、`admin_users`に登録されている全員が、全顧問先企業のCompany Profile・Roadmap・書類ステータス・共有リンクの発行/失効を、相互に区別なく操作できる。** これは`docs/COMPANY_WORKSPACE.md`が自ら設計した4ロールモデルが未実装のまま放置されている状態であり、**設計と実装の間で最も重大な乖離**である。

現時点の運用規模（管理者が実質1〜数名）では実害は小さいが、複数の税理士事務所スタッフや外部委託者を`admin_users`に追加した瞬間に、**顧問先Aの担当者が顧問先Bの機微な税務・労務情報を無制限に閲覧・編集できる**状態になる。これは単なる技術的負債ではなく、実際の顧客データを扱い始めた時点での情報漏洩リスクである。

### 5-3. 公開共有ページ（`/share/[token]`）: おおむね妥当、1点の不整合あり

- トークンは`gen_random_bytes(32)`（256bit CSPRNG）をhexエンコードした64文字。DBのデフォルト式で生成されており、アプリケーションコード側でトークンを組み立てる処理は存在しない。総当たりは現実的に不可能な強度
- `get_shared_workspace_view`はSECURITY DEFINER関数で、`token`が有効（`revoked_at IS NULL`かつ期限内）な場合のみデータを返す。無効時は`NULL`を返し、ページ側は「無効なリンク」表示に倒す設計になっている（安全側のデフォルト）
- ただし3-5節で述べた通り、`workspace_procedure_statuses`（`statuses`セクション）は`shared_sections`のトグルを無視して常に返却される。これは「経営者にAI参謀・書類はまだ共有できない」と明記する既存コメント（`share/page.tsx`）の精神とも矛盾しており、**項目単位の共有トグルを謳う設計に対する実装漏れ**と評価すべき
- レート制限・ブルートフォース対策は`src/`にも`supabase/`にも一切存在しない。トークンのエントロピーが十分高いため実害は限定的だが、**トークン漏洩時の失効フロー以外に「不審なアクセスパターンを検知する」手段がない**点は将来的な検討事項

### 5-4. `anon`ロールの扱い: 意図通り

全workspace系テーブルは`REVOKE ALL FROM anon`を明示しており、`DATABASE.md`が定める「全テーブルSELECT許可が原則」という既存規約からの**意図的かつ文書化された逸脱**になっている。この判断自体は`WORKSPACE_DB_DESIGN.md`のレビューで承認済みであり、妥当。

---

## 6. データモデルレビュー

### 6-1. Workspace系テーブル一覧（実migration確認済み）

| テーブル | 主キー | 役割 | 実装Sprint |
|---|---|---|---|
| `workspace_companies` | `id` | 会社本体 | 22.4 |
| `workspace_company_profiles` | `company_id`（1:1） | 税務・労務詳細 | 22.4 |
| `workspace_members` | 不明（未使用のため未確認） | 担当者割当（死んだスキーマ） | 22.4 |
| `workspace_share_links` | `id`、`token`にUNIQUE | 共有リンク | 22.4 |
| `workspace_procedure_statuses` | `(company_id, procedure_id)` | 手続きの進捗状態 | 24.1 |
| `workspace_documents` | `(company_id, document_type)` | 書類の登録状態（メタデータのみ） | 26 |

### 6-2. 最重要の設計ギャップ: 「単一ステータス」が繰り返し発生する手続きと衝突する

`workspace_procedure_statuses`の主キーは`(company_id, procedure_id)`であり、`RULE_ENGINE.md`・`ANNUAL_ROADMAP_ENGINE.md`が明記する通り、`procedures`テーブルには**月次・年次で繰り返し発生する手続き**（源泉所得税の毎月納付、法人税の年次確定申告等）が含まれる。Annual Roadmapはこれらを`expandOccurrences`（`roadmap.ts`）で複数年・複数回に展開して表示するが、**ステータスは手続き単位（procedure_id）で1つしか持てない**。

実際にSprint24〜27の動作確認で確認した通り、`nearestOccurrencePerProcedure`（`workspaceAdvice.ts`）は「同じ手続きが複数回出現する中から最も近い1回だけを判断材料にする」という設計になっている。これは表示上の重複を避けるための工夫だが、**根本的には「今月分の源泉所得税を"完了"にすると、翌月分もずっと"完了"のまま表示され続ける」という実運用上の欠陥を回避できていない**（今回の動作確認では単発の状態変化しか検証しておらず、月をまたいだ挙動は未検証）。これは`workspace_documents`（後述）にも同型の問題として現れている。

**`workspace_documents`も同じ根本原因を抱えている**: 「法人税申告書」の状態は`(company_id, document_type)`で1行しか持てないため、**今期の法人税申告書を「登録済み」にした翌年、前期の申告書と今期の申告書を区別できない**。実質的には「その書類の種類を一度でも登録したことがあるか」という粒度でしか管理できておらず、決算年度をまたいだ実務（毎年の申告書を年度ごとに保管する）には対応していない。

これは両テーブルに共通する1つの設計判断ミスであり、個別に直すのではなく**「単発の手続き/書類」と「周期的に繰り返す手続き/書類」を区別するスキーマ設計**として横断的に見直す必要がある（9-2節・10節で扱う）。

### 6-3. `workspace_documents`の固定5種について

現状は`corporate_type`や業種を問わず、全社一律で「定款・登記簿謄本・法人税申告書・消費税申告書・源泉所得税納付書」の5種のみを対象にしている。これはMVPとして単純だが、以下の限界がある。

- 合同会社は決算公告が不要、免税事業者は消費税申告書が不要、等、`procedures`マスタ側では既に会社属性による出し分けロジックが存在するのに、Documentsは一律固定になっている
- 6-2節の周期性問題を解決する際、書類の種類をマスタテーブル化（`procedures`のように）するなら、このタイミングで「会社属性に応じた出し分け」も同時に設計するのが合理的

### 6-4. `procedure_organizations`・`event_procedures`・旧`jurisdiction_offices`: 現状維持で問題なし

いずれも「未参照」として`DATABASE.md`に明記され、CLAUDE.mdの「即座に削除しない」原則で残置されている。Workspace化によってこれらの位置づけが変わることはなく、本レビューで追加の懸念はない。

---

## 7. UXレビュー

### 7-1. Dashboard（Sprint25〜27）は「一つにまとめる」の実践として妥当

VISION.mdの「一つにまとめる」「調べる時間をなくす」という原則に対し、Workspaceを開いた瞬間に今日やること・警告・進捗・AI助言・会社概要が見える設計は方向性として正しい。実際にPlaywright確認（Sprint25〜27）で、会社ごとに内容が動的に変わることも確認済み。

### 7-2. 未解決のUX上の課題

- **「決算実績」タイルのバグ**（3-2節）は実際のユーザー体験を損なう。次のSprintで最優先に直すべき
- **今日やること／期限警告／意思決定の視覚的な重複感**（4-2節）。同じ手続き名が3つのカードに分散して登場することで、実際に何件の「異なる」対応が必要なのかが一見で掴みにくい
- 管理画面（`/admin/workspaces`）とサイト側（`(site)`）は完全に別デザイン文脈という方針（CLAUDE.md）通りに実装されており、混同は見られない。これは問題なし
- 共有ページ（`/share/[token]`）に表示される`caution_note`的な注意書きパターンの継承は確認済み（`COMPANY_WORKSPACE.md` 6-3節の意図通り）

### 7-3. (site)フローの扱いが未決定なまま放置されている

`COMPANY_WORKSPACE.md` 9-3節が「段階的共存（A案）」か「Workspaceへの一本化（B案）」かをレビューで決めるとしていたが、**Sprint22〜27を通じてこの判断は一度もされていない**。実態としては2-4節で確認した通り、開発リソースは完全にWorkspace側に振られており、`(site)`側は事実上「凍結」状態にある。凍結されたコードが放置され続けると、次のSprintで`(site)`のバグ修正依頼が来た際に「もう誰も使っていないはずだが本当に安全に触れるか」を都度確認するコストが発生する。**この判断を先送りにし続けることそのものが技術的負債になりつつある**（9-1節で扱う）。

---

## 8. 今後6か月の優先順位（提案）

以下は本レビューで確認した事実に基づく推奨順位であり、最終的な採否は別途ユーザーの判断を仰ぐこと。

1. **設計ドキュメントの同期**（`PROJECT_CONTEXT.md`・`ROADMAP.md`をSprint27時点の実装に合わせて更新）— コスト最小・効果は「次のセッションの判断ミスを防ぐ」という形で複利的に効いてくるため最優先
2. **`(site)`フローの扱いの決定**（COMPANY_WORKSPACE.md 9-3節の未決事項）— これを決めないと、以降のTimeline/Roadmap拡張のたびに「site側にも反映するか」を毎回再検討するコストが乗り続ける
3. **Workspace単位のアクセス制御の実装**（5-2節）— 顧客データを扱う以上、複数担当者を追加する前に必須。技術的には`docs/COMPANY_WORKSPACE.md` 7節の設計が既にあるため、実装コスト自体は大きくない
4. **周期的な手続き/書類のステータス管理**（6-2節）— 年度をまたいだ実運用が始まった瞬間に顕在化する問題であり、顕在化してからの手戻りコストが大きい。データが少ないうちに直す方が安い
5. **Workspace系ページのデータ取得共通化**（3-3節）— 直接のバグではないが、4節の重複を放置したままDecision Engine・Dashboardのような横断機能を増やすたびに重複コードが増殖する
6. **Tax Return Profile（決算実績）タブの実装**（2-2節）— UIバグの根本解消であり、Annual Roadmapの精度向上（消費税ステータス・中間申告要否の`incomplete`解消）にも直結する
7. **Documents機能の拡張**（ファイルアップロード、会社属性による出し分け）— 6-3節。5番より優先度は下げてよい（メタデータのみのMVPでも実用上は成立している）
8. **AI Adviser / Decision / Dashboardの表示統合**（4-2節）— 6の対応後、実データでの重複感を再評価してから着手

---

## 9. 今は作らないもの

VISION.mdの「小さく作る」「現場が正しい」原則に照らし、以下は明示的にスコープ外とすることを提案する。

### 9-1. 経営者向け軽量ログイン（マジックリンク等）

`COMPANY_WORKSPACE.md` 6-2節が「将来検討」としていたもの。現状の共有リンク方式で閲覧ニーズは満たせており、経営者からの書き込み（決算数値の一次入力等）が実際に必要になったという「現場の声」が確認できるまで着手しない。

### 9-2. 会計データ連携（freee/MF等API）・Financial Analysis

`COMPANY_WORKSPACE.md` 5-7節・5-8節が既に「本Sprintではスキーマ設計しない」としていた通り。連携先APIの仕様が固まっていない現状で先行実装すると、6-2節で述べた「周期性の設計ミス」と同種の手戻りリスクを新たに抱え込むことになる。**6-2節の周期性問題を解決した後**に、その解決パターンを会計データにも適用する形で着手するのが合理的。

### 9-3. 通知エンジン（Notification Engine）

ロードマップv0.9で言及されていたが、AI Adviser/Decision Engineの出力先がまだDashboard1箇所に限られている段階では時期尚早。通知は「AI Adviser/Decisionが生成した`actions`/`warnings`のうち、どれをどのチャネル（メール等）に流すか」というルーティング層になるはずであり、**Decision Engineの`actions`配列が安定するまで**入力形式を確定できない。

### 9-4. LLMベースのAI Adviser/Decision置き換え

現状のルールベース実装は、会社ごとに内容が動的に変わることを含め、意図した最小限の価値を提供できている。LLM化は「ルールベースでは表現できない判断が明確に必要になった」時点で着手すべきで、今それを裏付ける実例はない。

### 9-5. Workspace 10タブ構成の完全実現

Events・Accounting Data・Financial Analysisタブを機械的に埋めることは目的化しやすい。8節の優先順位に従い、実データ・実運用で必要性が確認された順に追加する。

---

## 10. Sprint29以降の推奨実装計画

| Sprint | 目的 | 主な対象 | 前提 |
|---|---|---|---|
| **29** | ドキュメント同期＋`(site)`フローの扱い決定 | `PROJECT_CONTEXT.md`/`ROADMAP.md`更新、COMPANY_WORKSPACE.md 9-3節の最終判断 | 本レビュー承認 |
| **30** | Workspace単位のアクセス制御実装 | `admin_users.role`列追加、`workspace_members`の実利用化、RLS厳格化、Sprint29の判断確定 | 29完了 |
| **31** | 周期的ステータス管理の再設計 | `workspace_procedure_statuses`/`workspace_documents`のスキーマ見直し（年度・出現回単位への拡張） | 実データでの実害確認 |
| **32** | Workspaceデータ取得の共通化 | `src/lib/`への共有ローダー関数抽出、Dashboard/Roadmap/Profile/Shareの重複排除 | 31完了後（スキーマが固まってからの方がやり直しが少ない） |
| **33** | Tax Return Profile（決算実績）タブ実装 | `workspace_tax_return_profiles`新設、決算実績入力画面、Roadmap/State/Adviceの精度向上 | 30・31完了 |
| **34以降** | Documents拡張・Financial Analysis等 | 8節優先順位・9節「今は作らないもの」を都度再評価 | 実需の確認 |

---

## 最重要3課題

1. **Workspace単位のアクセス制御が存在しない**（5-2節）。`admin_users`登録者全員が全顧問先の機微データに無制限アクセスできる状態であり、担当者を複数名追加する前に必ず解消すべき、実データを扱う上での最優先課題
2. **周期的な手続き/書類のステータスが年度・出現回を区別できない**（6-2節）。現状はまだ実害が顕在化していないが、初めて年度をまたぐ顧問先が出た瞬間に「先月完了にしたのに今月も完了と表示される」という致命的な体験不良になる
3. **設計ドキュメントの陳腐化**（2-1節・3-1節）。`PROJECT_CONTEXT.md`/`ROADMAP.md`が実装状況を反映しておらず、「必ず実コードを確認せよ」という指示なしには次のセッションが誤った前提で作業してしまうリスクが常態化している

## β版完成条件

以下をすべて満たした時点で「顧問先を実際に預かる税理士事務所に限定的に使ってもらえる」β版とみなせると判断する。

- 最重要課題1（Workspace単位のアクセス制御）が解決済み
- 「決算実績」タイルのバグが解消済み（少なくともComing Soon表示に修正、理想はTax Return Profile実装済み）
- `(site)`フローの扱いが決定済み（凍結を継続するにせよ一本化するにせよ、方針が明文化されている）
- Workspace系ページのデータ取得重複が解消済み（バグの温床を減らした状態でユーザーに渡す）
- Documents・Procedure Statusの周期性問題について、少なくとも「既知の制約」として利用者に明示されている（完全解決していなくても、誤った完了表示をしないような回避策があること）

## v1.0完成条件

β版完成条件に加え、以下を満たすことを提案する。

- 最重要課題2（周期的ステータス管理）が根本解決済み（年度・出現回単位でのステータス管理）
- Tax Return Profileタブが実装され、Annual Roadmap/StateのConfidenceが「情報不足」に留まっている項目（消費税ステータス・中間申告要否等）が、2期目以降の顧問先で大部分`confirmed`/`estimated`に改善している
- 複数担当者・複数顧問先事務所での実運用を経て、Workspace単位のアクセス制御が実際に機能することが確認されている（権限テストのシナリオが最低1回以上実施されている）
- `docs/ROADMAP.md`のv1.0が掲げる「福岡県版正式リリース」の対応エリア精度検証が完了している（本レビューのスコープ外だが、既存のロードマップ上の条件として引き継ぐ）
- 設計ドキュメント一式が実装と同期した状態を維持できる運用（例: Sprint終了時にPROJECT_CONTEXT.mdを更新するチェックリスト化）が定着している
