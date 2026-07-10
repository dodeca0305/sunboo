# WORKSPACE_MIGRATION_STRATEGY.md — (site)からWorkspaceへの移行戦略（Sprint29）

**ステータス: 設計・ドキュメント更新のみ。コード変更・DB変更・画面変更は一切行っていない。**

本ドキュメントは[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)（Sprint28、承認済み）が
「最重要3課題」の1つに挙げた**「設計ドキュメントと実装の同期」**、および[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)
9-3節が「本Sprintでは決定せず、レビューで方向性を確認する」として先送りにしていた**「(site)配下を段階的共存させるか、
Workspaceへ一本化するか」**という未決事項に、Sprint29として正式な決着をつけるものである。

以下の内容は、Sprint28と同様に**実際のコード・実際のgit history・実際のmigration SQLを直接確認した事実**に基づく
（設計ドキュメントの記述のみで判断していない）。確認済みの一次情報は3節・4節にまとめる。

---

## 1. 結論（先出し）

1. **`/admin/workspaces/*` を正式系（Primary）とする。** 今後の新機能はすべてWorkspace側に実装する
2. **`(site)`配下は「互換・検証用（Compatibility/Anonymous track）」として位置づけを確定する。** 廃止はしないが、
   新機能追加は行わずバグ修正のみに限定する
3. **localStorage版は「廃止」ではなく「対象読者を絞った上での存続」とする。** 理由は5節で詳述するが、
   SUNBOOの想定ユーザーには「顧問税理士・社労士がいない中小企業」（`PROJECT_CONTEXT.md`）という、
   そもそもWorkspaceを作ってもらえない（＝管理者・税理士に依頼していない）層が明確に含まれており、
   この層への提供手段として`(site)`の匿名フローには今も存在意義がある
4. **既存ユーザー向けの移行導線は現時点で1つも存在しない。** 4-4節で確認した通り、`(site)`→Workspaceの
   双方向リンクはコード上ゼロ件であり、これは早期に埋めるべきギャップとして8節に記録する

---

## 2. 前提として確認した既存事実

- [ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 2-4節で、git logを確認した結果
  **Sprint22（コミット`2a8ab1b`「feat: add company workspace shell」）以降、`(site)`配下への機能追加コミットは
  実質1件のみ**（`f110c5e`、`AnnualRoadmapView`をWorkspaceと共有化するための抽出）であることを確認済み。
  直近9コミット（`f110c5e`〜`cea01ef`）はすべてWorkspace関連
- 同レビュー1-2節で、Timeline/State/Annual Roadmap Engine（`timeline.ts`/`state.ts`/`roadmap.ts`）が
  「渡されたデータに対する純粋関数」として実装されており、`CompanyProfile`型（`src/lib/companyProfile.ts`）が
  `(site)`のlocalStorageフローとWorkspaceのDBフローの共通の結節点になっていることを確認済み
- 同レビュー5-2節で、Workspace単位のアクセス制御が現状存在しない（`admin_users`登録者は誰でも全社アクセス可）
  ことを確認済み。これは本ドキュメントの移行方針そのものには直接影響しないが、8節「移行リスク」で参照する

---

## 3. 本Sprintで新たに確認した事実

### 3-1. `(site)`↔Workspace間のリンクは現状ゼロ件

`src/app/(site)/`配下から`/admin`へのリンク、および`src/app/admin/`配下から`(site)`側ページへのリンクを
`grep`で確認したところ、**双方向とも1件も存在しない**（唯一マッチした箇所は`workspaces/[id]/page.tsx`内の
Workspace自身のサブページへの相対リンク`/roadmap`であり、`(site)`側の`/roadmap`とは無関係）。

これは「`(site)`のユーザーがある日Workspaceの顧客になる」という導線が、コード上まったく設計されていない
ことを意味する。5節・8節で扱う。

### 3-2. Workspace新規登録フォームの入力項目は`CompanyProfile`の一部にすぎない

`WorkspaceCompanyForm.tsx`（`/admin/workspaces/new`）が集める項目は`name`・`prefecture_code`・
`municipality_code`・`corporate_type`・`fiscal_month`の5項目のみで、`(site)`の`/profile`が持つ
`CompanyProfile`の全17フィールド（資本金・設立日・消費税ステータス・インボイス登録状況・源泉所得税サイクル等）
のごく一部に留まる。つまり**現状、Workspace新規登録だけでは`(site)`の`/profile`が持つ情報量に到達できず**、
別途Workspace Profile画面（`/admin/workspaces/[id]/profile`）での追加入力が必要になる。これは移行導線を
設計する際に重要な事実（`(site)`の`/profile`データをそのままWorkspaceにコピーする一括インポートがあれば
価値が高い、という根拠になる。8節）。

### 3-3. リポジトリの時間軸

本リポジトリのgit historyは`2026-07-02`（Initial commit）から`2026-07-10`（本コミット時点）の9日間に
54コミットが記録されている。「Sprint」という単位は暦週ではなくこの短期間に凝縮された開発イテレーションを
指しており、以降の「β版」「v1.0」の時間見積もりも、この実際の開発速度感を前提に評価すべきである。

---

## 4. 整理対象ページの現状棚卸し（実コード確認済み）

指示された12ページ全てについて、現在の役割・実装の実態を記載する（判定・今後の扱いは5節）。

| ページ | 種別 | データソース | 現状の役割 |
|---|---|---|---|
| `/start` | Client Component | なし（URLクエリへ状態を渡すのみ） | 匿名診断フォーム。所在地・従業員有無・決算月等を入力し`/result`へ遷移 |
| `/profile` | Client Component | `sunboo:company-profile`（localStorage） | `CompanyProfile`全17項目のフル編集画面 |
| `/profile/tax-returns` | Client Component | `sunboo:tax-return-profile`（localStorage） | 決算実績（`TaxReturnEntry`）のCRUD、CompanyProfileとの矛盾検出 |
| `/events` | Client Component | `sunboo:company-profile`（localStorage）+ `anonymous_company_events`（Supabase、`browser_id`軸） | 会社設立・従業員採用・役員変更イベントの登録。Rule Engineで手続きを自動生成 |
| `/roadmap` | Client Component | `sunboo:company-profile`+`sunboo:tax-return-profile`（localStorage）+ `anonymous_company_events`（Supabase） | 3年分の年間ロードマップ表示。site専用の`buildTimelineFromSources`（4ソース統合）を使用 |
| `/result` | Server Component（`searchParams`駆動） | URLクエリのみ（サーバー側は無状態） | 単発の診断結果表示 + `ScheduleList`（`sunboo:procedure-status`等でステータス管理） |
| `/admin/workspaces` | Server Component | `workspace_companies` | 顧問先一覧 |
| `/admin/workspaces/[id]` | Server Component | `workspace_companies`+`workspace_company_profiles`+`workspace_procedure_statuses`+`workspace_documents` | Dashboard（今日やること/期限警告/意思決定/進捗サマリー/AI参謀/会社概要） |
| `/admin/workspaces/[id]/profile` | Server+Client | `workspace_companies`+`workspace_company_profiles` | CompanyProfileのDB版編集画面 |
| `/admin/workspaces/[id]/roadmap` | Server Component | 上記+Timeline/State/Roadmap Engine | Workspace版年間ロードマップ |
| `/admin/workspaces/[id]/documents` | Server+Client | `workspace_documents` | 書類5種のステータス管理（メタデータのみ） |
| `/admin/workspaces/[id]/share` | Server+Client | `workspace_share_links` | 共有リンクの発行・失効 |

---

## 5. 各機能の位置づけと今後の扱い

`(site)` → Workspace 対応表として整理する。

| (site)機能 | 正式系 or 互換・検証用 | 今後残すか | 段階的縮小 | 共通化 | 廃止条件 | β版での扱い | v1.0での扱い |
|---|---|---|---|---|---|---|---|
| `/start`→`/result` | **互換・検証用（ただし独立した役割）** | 残す | しない（対象読者が異なるため） | 診断エンジン（`runDiagnosis`/`calculateNextDeadline`/`resolveOffices`）はWorkspaceのRoadmapとも共通利用中、継続 | 廃止しない。無料の一次診断・リード獲得導線として存続 | 現状維持 | 現状維持。Workspaceへの導線（8節）を追加 |
| `/profile` | 互換・検証用 | 残す（バグ修正のみ） | する（新機能停止） | `CompanyProfile`型・`deriveStage`等の派生関数はWorkspace側`workspaceCompanyProfile.ts`と共通 | 「顧問税理士・社労士がいない」層向けの入口が別途用意されるまで廃止しない | 現状維持 | 機能追加なし。Workspace Profileへの「引き継ぎ」導線を追加（8節） |
| `/profile/tax-returns` | 互換・検証用（Workspace側は未実装のため実質唯一の実装） | 残す | する（Sprint33でWorkspace対応後） | `TaxReturnEntry`型はWorkspace移設時にそのまま転用予定（`WORKSPACE_DB_MVP_MIGRATION.md`未対応領域） | Sprint33でWorkspace Tax Return Profileタブが実装され次第、新規入力はWorkspace側に一本化 | 現状維持（Workspace版は未着手） | Workspace版に一本化。site版は読み取り専用または廃止を再検討 |
| `/events` | 互換・検証用（Workspace側は未実装のため実質唯一の実装） | 残す | する（将来のWorkspace Events実装後） | `registerCompanyEvent`のRule Engine評価ロジックは変更せず、将来Workspace Events実装時に流用（`COMPANY_WORKSPACE.md` 5-6節の方針を継続） | Workspace Events実装後に新規登録をWorkspace側へ一本化 | 現状維持 | Workspace Eventsが実装されていればsite版は縮小・読み取り専用化を検討 |
| `/roadmap` | 互換・検証用 | 残す | する（新機能停止） | `buildStateFromTimeline`/`buildAnnualRoadmap`/`AnnualRoadmapView`は既にWorkspace版と共通化済み（Sprint23.3で確認済み） | Workspace Roadmapで完全に代替可能なため、実質的な優先度は低い。廃止ではなく凍結を継続 | 現状維持 | 機能追加なし |
| `/result`＋`ScheduleList` | **正式系（匿名診断結果表示としては唯一の実装、Dashboardとは統合しない）** | 残す | しない | 診断エンジンは共通、`ScheduleList`のステータス管理（`sunboo:procedure-status`）はWorkspace統合の対象外 | 廃止しない。7節で理由を詳述 | 現状維持 | 現状維持 |

**判定に用いた基準**: 「Workspace側に同等以上の実装が既にあるか」で機能を2群に分けた。

- **既にWorkspace側で代替可能**（`/profile`・`/roadmap`）→ 新機能追加を止め、バグ修正のみに限定する「互換・検証用」に位置づける
- **Workspace側にまだ実装がない**（`/events`・`/profile/tax-returns`）→ Workspace版が実装されるまでは「実質唯一の実装」として維持し、Workspace版完成後に段階的縮小へ移行する
- **性質上Workspaceに統合しない**（`/start`・`/result`）→ 匿名リード獲得・一次診断という、Workspaceの「顧問先管理」とは異なる役割を持つため、独立した機能として存続する（7節で詳述）

---

## 6. 特に決めること（11項目への回答）

1. **`/admin/workspaces/*`を正式系とするか** → **する。** 1節・5節参照
2. **`(site)`側を互換・検証用へ位置づけるか** → **する。** ただし`/start`・`/result`は例外的に「正式系（独立した役割）」として存続させる（7節）
3. **新機能を今後Workspace側のみに追加するか** → **する。** 9節「開発ルール」で明文化する
4. **localStorage版をいつ縮小・廃止するか** → **廃止時期は定めない。** `/profile`・`/roadmap`は「新機能停止」の縮小を今すぐ開始する。`/events`・`/profile/tax-returns`はWorkspace側の対応実装（Events・Tax Return Profile）が完了した時点で縮小を開始する。完全廃止は「Workspaceを持たない匿名ユーザー向けの代替導線」が別途用意された場合にのみ検討する（7節）
5. **既存ユーザー向け移行導線をどうするか** → 3-1節で確認した通り現状ゼロ件。Sprint29では設計のみ行い、実装はSprint32以降（データ取得共通化のタイミング）で「`/profile`にWorkspace登録への案内バナーを追加する」形を推奨する（8節）
6. **`/result`の役割をDashboardへ統合するか** → **しない。** `/result`は`company_id`を持たない匿名ユーザー向けであり、Dashboardは`workspace_companies`の`company_id`を前提とする。データモデルが根本的に異なるため統合ではなく併存が適切（7節）
7. **`/events`の役割をTimelineへ統合するか** → **将来的にする（Sprint33以降）。** ただし「Timeline」という独立画面ではなく、Workspace側に新設する「Events」相当の入力機能に統合する。現状Workspaceは独立したTimeline画面を持たない設計（`COMPANY_WORKSPACE.md` 5-3節通り、Timelineは各タブ内のConfidence表示に埋め込む方針）のため、統合先は正しくは「Workspace Events（未実装）」である
8. **`/roadmap`の役割をWorkspace Roadmapへ統合するか** → **実質的に完了している。** 表示コンポーネント（`AnnualRoadmapView`）・計算ロジック（`buildAnnualRoadmap`）は既に共通化済み。残るのは「データの出どころ」の違いのみであり、これは設計通り（1-2節）
9. **`/profile`とWorkspace Profileの共通化方針** → 型（`CompanyProfile`）・派生ロジック（`deriveStage`等）は既に共通化済み。UIコンポーネント自体（フォームの見た目）は`COMPANY_WORKSPACE.md` 9-2節が想定した「再利用」までは行われておらず、`/profile/page.tsx`と`WorkspaceProfileForm.tsx`は別々に実装されている（実コード確認済み、フォーム項目はほぼ同一だがコンポーネントとしては非共有）。Sprint32のデータ取得共通化のタイミングで、フォームコンポーネント自体の共通化も検討対象に含めることを推奨する
10. **`/profile/tax-returns`をWorkspace対応へ移す順序** → 承認済みのSprint33「Tax Return ProfileのWorkspace対応」で実施する。本ドキュメントでは追加の順序変更を提案しない
11. **「決算実績」タイルの扱い** → **Coming Soonへ戻す。** [ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 3-2節で指摘した表示バグ（`comingSoon: false`なのにリンク先が無い）への対応として、簡易ページを新設するのではなく既存の`comingSoon: true`パターンに揃える1行修正を推奨する。理由: Sprint33でTax Return Profileの本実装が来ることが既に決定しているため、その場しのぎの簡易ページを作ると数Sprint後に使い捨てになる。「小さく作る」原則にも反する。**この修正自体はコード変更を伴うため、本Sprint（設計のみ）では実施せず、次の実装Sprintの最初の1コミットとして行うことを推奨する**

---

## 7. なぜ`/start`・`/result`・匿名`(site)`フローを廃止しないか

`PROJECT_CONTEXT.md`の想定ユーザーは「法人を設立したばかりの経営者、顧問税理士・社労士がいない中小企業」であり、
これは`COMPANY_WORKSPACE.md`が新設した「管理者・税理士が代行管理する」モデルの対象**外**の層を明確に含んでいる。
Workspaceは`/admin`配下（`admin_users`によるログイン必須）であり、**顧問税理士がいない会社は原理的に
Workspaceを持てない**（誰かが管理者としてその会社のために`workspace_companies`の行を作らない限り、
その会社の情報はWorkspaceに存在しえない）。

したがって、匿名`(site)`フローを廃止することは、「顧問税理士・社労士がいない中小企業」というPROJECT_CONTEXT.md
自身が定めた想定ユーザー層への提供手段を失うことを意味する。これは技術的負債の解消ではなく、**プロダクトの
対象読者を意図的に絞り込む事業判断**になるため、本ドキュメントの権限を超える。よって本Sprintでは
「匿名フローの入口（`/start`→`/result`）は残し、匿名フローの中でも顧問先管理と重複する部分
（`/profile`・`/roadmap`・将来的には`/events`・`/profile/tax-returns`）は機能追加を止めて縮小する」
という中間的な結論を採用する。

---

## 8. β版までの移行ステップ・移行リスク・データ移行方針

### 8-1. β版までの移行ステップ

1. （即時・次の実装Sprintの最初の1コミット）「決算実績」タイルをComing Soonへ戻す（6節11項目）
2. Sprint30: 周期的ステータス再設計（承認済み、本ドキュメントのスコープ外）
3. Sprint31: Workspace単位のアクセス制御（承認済み、本ドキュメントのスコープ外）
4. Sprint32: Workspaceデータ取得共通化（承認済み）と同時に、以下を追加スコープとして検討する
   - `/profile`ページに「顧問税理士・税理士事務所からWorkspaceへの招待を受けている場合はそちらをご利用ください」
     という案内、または管理者が`/profile`のlocalStorageデータをWorkspaceへ一括インポートできる補助機能
     （3-2節で確認した通り、Workspace新規登録フォームは`CompanyProfile`の一部しか集めないため、
     一括インポートがあれば入力の手間を大きく削減できる）
   - この案内・インポート機能の要否・詳細仕様はSprint32の設計フェーズで改めて判断する（本Sprintでは
     「検討事項として記録する」に留め、確定はしない）
5. Sprint33: Tax Return ProfileのWorkspace対応（承認済み）完了後、`/profile/tax-returns`を縮小フェーズへ

### 8-2. v1.0までの廃止計画

**明確化: 本ドキュメントは「(site)配下ページの完全廃止」を計画しない。** 7節の理由により、`/start`・`/result`は
v1.0後も存続する前提とする。`/profile`・`/roadmap`・`/events`・`/profile/tax-returns`は「新機能追加の停止」
までを本Sprintで確定し、完全廃止（コード削除・リダイレクト化）はv1.0完成条件には含めない。

v1.0のタイミングで再評価すべき条件を明記する:
- 複数の顧問先事務所が実際にWorkspaceを利用し始めた後、匿名`(site)`フロー経由の新規会社登録数が
  実質的にゼロに近づいた場合、`/profile`・`/roadmap`・`/events`をリダイレクト化（`/start`へ誘導）する
  ことを検討してよい
- ただし「顧問税理士・社労士がいない中小企業」という想定ユーザー層への提供手段を失わないよう、
  廃止の可否は必ずユーザーの事業判断を仰ぐこと（本ドキュメントの権限では決定しない）

### 8-3. 移行リスク

| リスク | 内容 | 対応方針 |
|---|---|---|
| データの孤立 | `(site)`のlocalStorageデータ（`sunboo:company-profile`等）はブラウザ単位でありSupabaseに一切送信されない。ユーザーがブラウザ・端末を変えると再入力が必要になる | 既存の設計方針（認証なし・ブラウザ単位の信頼モデル）であり、本Sprintで新たに生まれたリスクではない。8-1節のインポート機能があれば緩和できる |
| 二重実装の温存 | `/profile`・`/roadmap`を凍結（バグ修正のみ）にする一方で放置期間が伸びると、Next.js/Supabaseのメジャーバージョンアップ等でも追従漏れが起きうる | 「バグ修正のみ」を「セキュリティ・ビルド破壊のみ対応」まで明確に絞り込み、機能的な保守コストを最小化する（9節） |
| 移行導線が無いことによる機会損失 | 3-1節の通り現状`(site)`→Workspaceの導線がゼロ件。匿名ユーザーが実際に顧問税理士と契約しても、その事実がプロダクト側から見えない | 8-1節のSprint32検討事項として記録。本Sprintでは実装しない |
| Workspace単位のアクセス制御未実装のままデータ移行が進む | Sprint28で確認済みの最重要課題。移行が進むほど、1つの`admin_users`アカウントが扱う顧客データ量が増え、5-2節のリスクの実害が拡大する | 承認済みの通りSprint31で対応。データ移行（8-1節のインポート機能）はSprint31完了後に実装することを推奨する（順序が逆になると、アクセス制御が無い状態で顧客データの集約だけが先に進んでしまう） |

### 8-4. データ移行方針

- **自動一括移行は行わない。** `(site)`のlocalStorageデータは個々のブラウザにしか存在せず、サーバー側から
  横断的に検出・移行することは技術的に不可能（認証なし・ブラウザ単位の設計の裏返し）
- 8-1節で触れた「インポート機能」は、**ユーザー（管理者・税理士）がブラウザで`/profile`を開いた状態から
  能動的に「この内容でWorkspaceに会社を登録する」を選ぶ、片方向・都度手動のインポート**として設計する
  （自動同期・双方向同期は行わない。CompanyProfile型は共有だが、"正本"は常にどちらか一方に確定させる
  という既存の設計原則、`TAX_RETURN_PROFILE_ENGINE.md`のChange Interview的な考え方を踏襲する）
- `anonymous_company_events`（Supabase、`browser_id`軸）を`workspace_company_events`（未実装、`company_id`軸）へ
  移行する方針は、Workspace Events自体が未実装のため本Sprintでは設計しない。Sprint33以降、Events対応に
  着手するタイミングで改めて設計する

---

## 9. 今後の開発ルール（正式採用）

ユーザー提案の6項目をそのまま正式な開発ルールとして採用する。

1. **新機能は原則Workspace側のみに実装する。** `(site)`側への新機能追加は行わない（例外は7節の`/start`・`/result`のみで、これも「新機能」ではなく既存の一次診断機能の保守に限る）
2. **`(site)`側はバグ修正のみとする。** 「バグ修正」の範囲は、既存の挙動が壊れている場合の復旧、およびNext.js/Supabaseのバージョンアップに伴うビルド破壊への追従に限定する。UI改善・項目追加等は含まない
3. **既存Engine（診断エンジン・Rule Engine・Timeline/State/Annual Roadmap Engine・AI Adviser・Decision Engine）は共通利用する。** `(site)`用とWorkspace用で別々の計算ロジックを新設しない
4. **表示コンポーネントは可能な限り共通化する。** `AnnualRoadmapView`（Sprint23.3で共通化済み）を先例とする。6節9項目で指摘した`WorkspaceProfileForm`と`/profile`のフォーム非共有は、次にどちらかに手を入れる際の共通化候補として記録する
5. **データ取得はWorkspace境界（`company_id`）で吸収する。** Sprint32の「データ取得共通化」で、Workspace内の各ページが個別に書いている重複クエリを`src/lib/`の共有ローダーへ集約する（[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 3-3節）
6. **localStorageとDBの二重実装を増やさない。** 新しい状態（ステータス・設定等）を追加する際、`(site)`側にlocalStorageキーを新設し同時にWorkspace側にDBカラムを新設する、という二重実装を行わない。新機能はルール1の通りWorkspace側（DB）のみに実装する

---

## 10. 正式なプロダクト導線

```
[匿名ユーザー]                          [顧問税理士・管理者]
     │                                        │
     ▼                                        ▼
  /start（一次診断）                    /admin/login（認証）
     │                                        │
     ▼                                        ▼
  /result（診断結果・リード獲得）        /admin/workspaces（顧問先一覧）
     │                                        │
     │ 独立した役割として存続            ┌────┴────┐
     │ （Workspaceへ統合しない）          ▼         ▼
     │                              new（新規登録） [id]（既存顧問先）
     ▼                                             │
  /profile, /events, /roadmap,                     ▼
  /profile/tax-returns                    Dashboard（今日やること／期限警告／
  （凍結・バグ修正のみ。                    意思決定／進捗サマリー／AI参謀／会社概要）
   Workspace未対応領域は暫定存続）                  │
                                          ┌─────┼─────┬─────┐
                                          ▼     ▼     ▼     ▼
                                       Profile Roadmap Documents Share
                                                                   │
                                                                   ▼
                                                        /share/[token]
                                                    （経営者への閲覧専用共有）
```

`/admin/workspaces/*`が正式系のプロダクト導線であり、`(site)`は匿名リード獲得（`/start`→`/result`）と
「顧問税理士がいない層」への暫定的な自己管理ツール（`/profile`等、凍結状態）という2つの限定的な役割に
位置づけを確定する。

---

## β版完成条件（[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md)を継承・具体化）

Sprint28が定めた条件に加え、本Sprintで以下を追加する。

- 「決算実績」タイルがComing Soon表示に修正されている（6節11項目、次の実装Sprintで対応）
- `(site)`配下の新機能追加が停止され、9節の開発ルールがCLAUDE.mdまたは本ドキュメントとして参照可能な形で
  明文化されている（本ドキュメントの完成をもって充足）
- Sprint30（周期的ステータス再設計）・Sprint31（アクセス制御）が完了している（Sprint28の条件を再掲）

## v1.0完成条件（Sprint28を継承・具体化）

Sprint28が定めた条件に加え、本Sprintで以下を追加する。

- `/events`・`/profile/tax-returns`のWorkspace対応（Events・Tax Return Profile）が完了し、
  それぞれのsite版が「縮小フェーズ」（新規入力はWorkspace側に一本化）へ移行している
- `(site)`→Workspaceの移行導線（8-1節、Sprint32検討事項）について、実装するかしないかの最終判断が
  なされている（実装しない場合も、その判断が理由とともに記録されていること）
- 8-2節の再評価条件（匿名フロー経由の新規登録数の実績確認）が一度は実施されている

## Sprint30以降の推奨順序

ユーザー承認済みの順序をそのまま踏襲する。本ドキュメントによる追加・変更はない。

| Sprint | 目的 |
|---|---|
| 30 | 周期的ステータス管理の再設計 |
| 31 | Workspace単位のアクセス制御 |
| 32 | Workspaceデータ取得共通化（＋本ドキュメント8-1節の移行導線・インポート機能の検討） |
| 33 | Tax Return ProfileのWorkspace対応 |
| 34以降 | [ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 8節・9節を都度再評価 |
