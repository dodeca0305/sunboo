# V1_RELEASE_CANDIDATE_REVIEW.md — v1.0 Release Candidate Review（Sprint40）

**ステータス: レビューのみ。コード変更・DB変更・migration作成・package変更・画面変更は一切行っていない。**

対象: Sprint22〜39で実装されたCompany Workspace基盤全体（Shell・Dashboard・Company Profile・
Tax Return Profile・Documents・Roadmap・Timeline・State・Decision Engine・AI Adviser・
Notification Center・Share・Access Control・Data Loader）と、Notification設計一式
（[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md)・
[NOTIFICATION_SETTINGS_DESIGN.md](NOTIFICATION_SETTINGS_DESIGN.md)・
[NOTIFICATION_DELIVERY_ARCHITECTURE.md](NOTIFICATION_DELIVERY_ARCHITECTURE.md)、設計のみ・未実装）。
β版公開前に残っている課題を洗い出す。

## 0. レビュー方法

実コードを直接確認した（推測・伝聞に基づく評価はしない）。主な確認対象:
`src/app/admin/(protected)/workspaces/**`（全ページ・全フォーム）、`src/components/Workspace*.tsx`、
`src/lib/workspace*.ts`（Loader・Advice・Decisions・Notifications・CompanyProfile・
TaxReturnProfile・ProcedureStatus・DocumentStatus・TimelineProducer）、`src/lib/state.ts`・
`src/lib/roadmap.ts`・`src/lib/timelineProducer.ts`（共通Engine）、`supabase/migration_workspace_*.sql`
全ファイル（RLS/GRANT）、`src/app/admin/(protected)/AdminShell.tsx`、`src/app/share/[token]/page.tsx`。
`grep`でTODO/FIXME/console.logの残存も確認した。

**Notification関連（Sprint36〜39）は設計のみで実装が無いため、他領域とは評価軸を分ける**
（「実装の品質」ではなく「設計の一貫性・実装着手時の準備状況」として評価する）。

---

## 1. UX

**良い点**: 全ページに一貫した注意書きカード（`caution_note`パターン、「一般的な参考情報」「専門家に
確認」の文言）が配置されている（roadmap/tax-returns/documents/shareページで確認）。保存成功時の
フィードバック（チェックマーク表示）・楽観的更新（Roadmap/Documents）が一貫して使われている。

**問題点**:
- **破壊的操作に確認ダイアログが無い。** `WorkspaceTaxReturnsView.tsx:87-97`の`handleDelete`、
  `TaxReturnEntryFields.tsx:169`の削除ボタンは、いずれも`window.confirm`等の確認を挟まず即座に
  DELETEを実行する（決算実績という重要データの削除操作）
- App Router標準の`loading.tsx`/`error.tsx`が**プロジェクト全体で1つも存在しない**
  （`find`で確認）。Server Componentのデータ取得中、ブラウザは応答なしのまま静止する

**優先順位**: 削除確認ダイアログ＝**中**、`loading.tsx`＝低（現在の応答速度では実害小、規模拡大時に再検討）

---

## 2. 情報設計

**良い点**: Dashboard・Roadmap・Decision・Advice・Notificationの役割分担が
[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 4-5節・
[ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md) 8節で明文化され、実装
（`WorkspaceDashboard.tsx`）もその通りに構成されている。

**問題点**: 通知センターと期限警告・意思決定・AI参謀の内容重複は設計時点で許容済み（Sprint37承認事項）
だが、実際の画面（前回セッションで確認済みのスクリーンショット）でも「基本情報の入力」が通知センター・
AI参謀の2箇所に同時表示されており、初見ユーザーには冗長に映る可能性がある。

**優先順位**: 低（意図的な設計判断として承認済み。実データでの反応を見てから再検討）

---

## 3. 画面遷移

**良い点**: `WorkspaceSubNav`が全ページ共通のタブ構成を提供し、各ページに「◯◯社に戻る」の
戻りリンクが一貫して存在する。

**問題点**: 通知センターのリンク遷移先は`/roadmap`・`/documents`・`/profile`の3種のみで、
`/tax-returns`・`/share`への直接導線が無い（`workspaceNotifications.ts`の`hrefFor`関数、
`closing`カテゴリも`/roadmap`に固定されている）。決算接近の通知から決算実績の入力画面へ
ワンクリックで行けない。

**優先順位**: 低

---

## 4. Dashboard構成

**良い点**: 通知センター／今日やること・期限警告／意思決定／進捗サマリー・AI参謀／会社概要という
7区画が明確に分離され、レスポンシブグリッドで構成されている。

**問題点**: 区画数が7つと多く、初見での情報過多感がある。画面上の縦順序（通知センター→今日やること・
期限警告→意思決定→進捗サマリー・AI参謀→会社概要）が、業務上の優先順位と厳密に一致しているかは
実ユーザーテストで未検証。

**優先順位**: 中（β版フィードバックで検証すべき）

---

## 5. Roadmap体験

**良い点**: 出現回単位のステータス管理（Sprint31・32）、confidence表示（推定／情報不足タグ）が
一貫して機能している。

**問題点**: **`at_establishment`/`hiring_event`/`event_based`の手続き（法人設立届出書等）が
年間ロードマップから一律除外される**（`src/lib/roadmap.ts:58-63`のコメントで既知の制約として
明記済み）。診断エンジン単体では起算日（`eventDate`）が無く期限計算が成立しないためだが、
Workspace側には`/events`相当のイベント登録機能がまだ無い。**つまり設立時手続きが年間ロードマップに
一度も表示されないまま運用が続く**という実務上の空白がある。

**優先順位**: 中〜高（新規設立顧問先を扱う場合、実務インパクトが大きい）

---

## 6. Company Profile入力体験

**良い点**: 主要10項目にMVPとして絞り込み、`(site)`側フォームと項目表記を統一している。

**問題点**: `WorkspaceProfileForm.tsx:13-16`のコメントに明記の通り、`taxationMethod`・
`corporateTaxInterimFiling`・`consumptionTaxInterimFrequency`・`localTaxCollectionMethod`・
`eTaxEnabled`・`eLTaxEnabled`等は「読み込んだ値をそのまま保持して書き戻すのみ、このフォームでは
変更しない」。**管理者はこれらの項目をUIから一切編集できない**（DB直接操作以外に手段が無い）。
決算のたびに変わりうる項目が含まれており、運用上の制約になる。

**優先順位**: 中

---

## 7. Tax Return Profile入力体験

**良い点**: `AmountValue`（概算レンジ入力）によるConfidence表現、法人種別・従業員有無に応じた
条件表示（`WorkspaceTaxReturnsView.tsx:309-332`）。

**問題点（最重要の発見事項）**:

**源泉所得税の納付実績（`withholdingTaxCycleActual`）を入力フォームは収集しているが
（`WorkspaceTaxReturnsView.tsx:320-332`「源泉所得税の納付実績」トグル）、
`taxReturnEntryToTimelineEvent`（`src/lib/timelineProducer.ts:43-65`）が生成する
`TimelineEvent.metadata`にこの値を一切含めていない。** このため`state.ts:189-199`が既知のギャップ
として明記する通り、`deriveWithholdingTaxCycleField`は入力の有無に関わらず常に`incomplete`を返し続ける。
**ユーザーが値を入力・保存しても、Roadmap・Decision・Notificationのいずれにも一切反映されない**——
入力フォームの存在自体が、実際には機能していない項目への期待を生む「見せかけの入力」になっている。
[ANNUAL_ROADMAP_ENGINE.md](ANNUAL_ROADMAP_ENGINE.md) 0節が2Sprint以上前から同じギャップを
指摘し続けているが、解消の実装Sprintがまだ計画されていない。

その他:
- 決算実績削除に確認ダイアログが無い（1節と同一事象）
- Change Interview（`(site)`側の`detectMismatches`相当、CompanyProfileとの矛盾検知）が
  Workspace側では未実装（`WorkspaceTaxReturnsView.tsx:25-27`のコメントで明記、次Sprint以降）

**優先順位**: **高**（withholdingTaxCycleギャップ、ユーザー体験の信頼性に直接影響）、中（Change Interview欠如）

---

## 8. Notification UX

**良い点**: 5カテゴリの明確な分類、重要度タグ、0件時の適切な文言（「現在、対応が必要な通知は
ありません。」）、リンク遷移が正しく機能する（前回セッションでPlaywright実地確認済み）。

**問題点**: Settings（Sprint38設計、未実装）が無いため、通知を個人が消す・調整する手段が無い。
ただしこれはSprint38で「画面内通知MVPでは設定保存を行わない」と明示的に承認済みのスコープであり、
現時点では問題として計上しない。

**優先順位**: 低（承認済みスコープ、v1.1以降）

---

## 9. Share UX

**良い点**: トークンベースでログイン不要、閲覧専用、注意書きが明記されている。共有と`workspace_members`
の独立性が徹底されている（Sprint38・39のNotification設計でも繰り返し確認済み）。

**問題点**:
- **`workspace_share_links.expires_at`列は存在するが、`WorkspaceShareLinksPanel.tsx`のUIには
  有効期限を設定する入力欄が無い**（`handleCreate`は`expires_at`を渡さず常に`null`のまま挿入する）。
  結果として「有効期限付き共有リンク」という機能はDBスキーマ上は存在するが、実質使えない
- 共有対象セクションが`SHARED_SECTIONS`（`company`/`profile`/`roadmap`固定）で決め打ちされており、
  トグルUIが無い（コード内コメントで「次Sprint以降」と明記済み、既知のスコープ）

**優先順位**: 中（期限切れ機能の欠如はセキュリティ運用上望ましくない——一度発行した共有リンクが
無期限に有効であり続ける）

---

## 10. AI AdviserとDecisionの役割

**良い点**: `workspaceDecisions.ts`冒頭コメントで役割分担（Advice=状況説明、Decision=行動提案）が
明確に文書化され、Sprint27レビューでの整理がそのままコードコメントに残っている。

**問題点**: `WorkspaceDashboard.tsx`上での視覚的な差別化が弱い——両セクションともリスト＋タグという
似たトーンで並んでおり、コード上は役割が明確でも、画面から「なぜ2つあるのか」をユーザーが読み取り
にくい可能性がある。

**優先順位**: 低〜中

---

## 11. 命名規則

**良い点**: `Workspace*`プレフィックスがコンポーネント・関数・テーブルいずれにも一貫して使われている
（`workspace_*`テーブル、`WorkspaceXxx`コンポーネント、`loadWorkspaceXxx`/`buildWorkspaceXxx`/
`generateWorkspaceXxx`という関数命名の使い分けも一貫）。表記ゆれは発見されなかった。

**問題点**: 無し。

**優先順位**: — （良好、対応不要）

---

## 12. コンポーネント構成

**良い点**: Server Component（`page.tsx`、データ取得）とClient Component（フォーム・インタラクション）
の分離が全ページで一貫している。

**問題点**: 13節で扱う配置基準の不統一を除き、コンポーネント自体の設計（props・状態管理）は
一貫したパターン（`useState`によるローカル状態＋楽観的更新）を踏襲しており、大きな問題は無い。

**優先順位**: 低

---

## 13. ディレクトリ構成

**良い点**: `[id]/{profile,tax-returns,roadmap,documents,share}/page.tsx`という明快なルーティング構造。

**問題点**: 単一ルート専用のClient Componentの置き場所が不統一。`WorkspaceProfileForm.tsx`・
`WorkspaceShareLinksPanel.tsx`はルート直下に置かれる一方、`WorkspaceDocumentsView.tsx`・
`WorkspaceTaxReturnsView.tsx`は（他のどのルートからも使われていないにも関わらず）`src/components/`に
置かれている。実際に複数ルートで共有される`AnnualRoadmapView`（`(site)/roadmap`・
`admin/workspaces/[id]/roadmap`・`share/[token]`の3箇所、`WorkspaceSubNav`（全Workspaceページ）・
`WorkspaceDashboard`（Dashboardページのみ、これも実質単一ルート専用）との配置基準の線引きが
曖昧になっている。

**優先順位**: 低（機能に影響しない、保守性の軽微な課題）

---

## 14. Engine境界

**良い点**: 「Engine自体は無変更、Loaderで配線のみ」という原則がSprint34（Data Loader共通化）・
Sprint37（Notification Center）を通じて一貫して守られている（各コメントに明記され、実際のコードも
その通りになっている）。診断エンジン・Rule Engine・State Engine・Roadmap Engineいずれも
Workspace化にあたって計算ロジックの変更を伴っていない。

**問題点**: withholdingTaxCycleギャップ（7節）はEngine境界そのものの欠陥ではなく「Producer層
（`timelineProducer.ts`）が特定のフィールドをTimelineEventに変換していない」という接続漏れであり、
Engine境界の設計自体は健全。ただし複数の設計書（`STATE_ENGINE.md`・`ANNUAL_ROADMAP_ENGINE.md`）で
「既知のギャップ」として繰り返し言及されるだけで、解消するSprintが計画表に一度も乗っていない。

**優先順位**: 中（設計の健全性は問題ないが、放置期間が長い）

---

## 15. Workspace境界

**良い点**: `workspace_members`とRLSによる会社単位の隔離が徹底しており、レビュー中に境界侵害
（他社データの混入経路）は発見されなかった。Notification Center・Decision・Adviceもすべて
既存のRLS保護下のデータのみを参照しており、独自の権限判定を持たない（設計通り）。

**問題点**: 無し。

**優先順位**: — （良好）

---

## 16. RLS

**良い点**: 全`workspace_*`テーブルが一貫して`is_workspace_member()`ベースのポリシーパターンを
採用（`migration_workspace_access_control.sql`確立、Sprint35の`workspace_tax_return_profiles`も
同一パターンを正しく踏襲していることを実ファイルで確認済み）。`anon`への不要なGRANTは無い
（`get_shared_workspace_view`のEXECUTE権限のみ、`grep`で確認済み）。

**問題点**: `workspace_companies`のSELECT/DELETEポリシーに「メンバーが1人もいない会社は
`admin_users`登録者なら誰でもアクセス可」というbootstrap特例がある
（`migration_workspace_access_control.sql`5節）。新規作成直後の会社を正しく扱うための意図的な
設計だが、**既存の会社で何らかの理由（誤操作等）により全メンバーが削除された場合、その会社が
再び全`admin_users`に開放されてしまう**エッジケースが理論上存在する。

**優先順位**: 低（発生可能性は低いが、v1.1で「最後のownerは削除できない」制約を追加することを推奨）

---

## 17. パフォーマンス

**良い点**: `workspaceLoader.ts`が`Promise.all`による並列化を各所で行っている。Roadmapの
複数年展開は`horizonYears=3`で固定され、無制限に増える設計にはなっていない。

**問題点**: 1節で述べた`loading.tsx`の不在に加え、`buildAnnualRoadmap`は内部で複数の逐次的な
Supabase呼び出し（診断エンジン→Rule Engine評価→追加procedures取得）を行う。現在の実データ規模
（Workspace数が実質2社）では体感できる遅延は無いが、Workspace数・手続き数が増えた場合の応答時間は
未検証。

**優先順位**: 低（現在の規模では問題なし。v1.0公開後、実データでの計測を推奨）

---

## 18. 保守性

**良い点**: 各Sprintのコミットログ・コードコメントがSprint番号と対応する設計書へのリンクを
一貫して保持しており、「なぜこの実装になったか」の追跡が容易——このプロジェクト全体を通じて
際立った強み。CLAUDE.mdの開発フロー（設計→レビュー→実装→Build確認→Playwright確認）が
実際に守られてきた形跡がコメントから読み取れる。

**問題点**: `WorkspaceDashboard.tsx`はSprint25〜37の機能追加を重ねた結果、7区画・約290行の
単一コンポーネントになっている。今後さらにセクションが増える場合、分割を検討すべき規模に
近づいている。

**優先順位**: 低

---

## 19. 未使用コード

**良い点**: `grep`によるTODO/FIXME/XXX/HACK検索の結果、Workspace関連コードに未対応のTODOは
発見されなかった。旧設計（`jurisdiction_offices`・`event_procedures`等）は`DATABASE.md`が
明記する通り意図的に残置されており、Workspaceコードからは一切参照されていないことも既存ドキュメントで
確認済み。

**問題点**: 特筆すべき未使用コードは発見されなかった。

**優先順位**: — （良好）

---

## 20. TODO

`src/lib/analytics.ts:25`の1件のみ（「実際の計測サービスと接続する際はここで送信する」）。
Workspace機能とは無関係の`(site)`側の既存スタブであり、意図的に先送りされていることがコメントに
明記されている。

**優先順位**: — （スコープ外）

---

## 21. 技術的負債（累積の棚卸し）

| 負債 | 内容 | 優先順位 |
|---|---|---|
| withholdingTaxCycle Timeline未接続 | 7節・14節 | **高** |
| 設立時手続きがRoadmapから除外される制約 | 5節 | 中〜高 |
| Company Profileの一部フィールドが編集不可 | 6節 | 中 |
| Share期限設定UIの欠如 | 9節 | 中 |
| 破壊的操作の確認ダイアログ欠如 | 1節・7節 | 中 |
| Change Interview（Workspace側）未実装 | 7節 | 中 |
| Notification Settings/Delivery本体 未実装 | Sprint36〜39は設計のみ | 低（v1.1以降と既に合意済み） |
| `workspace_companies`のbootstrap特例エッジケース | 16節 | 低 |
| コンポーネント配置基準の不統一 | 13節 | 低 |
| `loading.tsx`/`error.tsx`不在 | 1節・17節 | 低 |

---

## 22. セキュリティ

**良い点**: RLSの徹底、`SECURITY DEFINER`関数の`search_path`固定（`migration_workspace_access_control.sql`
のコメントで対策理由まで明記）、`admin_users`＋`workspace_members`の2層権限モデル、
秘密鍵はサーバー専用の環境変数のみで管理され`service_role`キーは一度も導入されていない
（Sprint39レビューで確認済み）。共有ページのトークンはRLSバイパスの唯一の正当な経路として
明確に隔離されている。

**問題点**: 16節のbootstrap特例エッジケースのみ。レビュー範囲内で重大な脆弱性（他社データ漏洩・
権限昇格経路等）は発見されなかった。

**優先順位**: 低

---

## 23. β版公開に必要な最低条件

- ✅ 既に満たされている: RLS/アクセス制御（Sprint33）、Notification Center MVP（Sprint37）、
  Company Profile/Tax Return Profile/Documents/Roadmap/Shareの基本CRUD一式
- ⚠️ **公開前に対応すべき**:
  1. 決算実績・その他破壊的操作への確認ダイアログ追加（1節・7節）
  2. withholdingTaxCycleギャップについて、修正が間に合わない場合は**入力フォーム上に「現時点では
     年間ロードマップに反映されません」という案内を明記する**（機能修正が難しければ、少なくとも
     ユーザーの期待値を裏切らないようにする）
  3. Share期限設定の欠如について、少なくとも「発行済みリンクは無期限に有効です」という注意書きを
     `WorkspaceShareLinksPanel.tsx`に追加する（9節）

---

## 24. v1.0で実装すべき項目

1. **withholdingTaxCycle Timeline接続**（`timelineProducer.ts`の`taxReturnEntryToTimelineEvent`に
   `withholdingTaxCycleActual`を`metadata`へ追加する、7節）
2. Company Profile未編集項目への対応（編集可能にするか、決算実績からの自動反映である旨を
   明示的に表示するか、方針を決定する、6節）
3. 決算実績削除・その他破壊的操作の確認ダイアログ（1節）
4. Share期限設定UI（`expires_at`の入力欄追加、9節）
5. 設立時手続き（`at_establishment`等）のRoadmap反映方針の決定
   （Workspace版イベント登録機能の要否を含めて検討、5節）

## 25. v1.1以降へ回す項目

- Notification Settings/Delivery本体実装（Sprint38・39で設計済み、実要望確認後に着手）
- `loading.tsx`/`error.tsx`整備
- コンポーネント配置規約の統一（13節）
- `workspace_companies`「最後のownerは削除できない」制約の追加（16節）
- Change Interview（Workspace側の矛盾検知、7節）
- Dashboard区画の視覚的階層見直し（4節・10節、実ユーザーテストの結果を踏まえて）

---

## 総合評価

### 評価サマリ

| 観点 | 判定 |
|---|---|
| データ整合性・重大なセキュリティ欠陥 | 発見されず |
| RLS/アクセス制御 | 健全（軽微なエッジケース1件） |
| 主要機能の動作 | Dashboard/Roadmap/Notification Center実地確認済み（前回セッション）、正常動作 |
| 既知の技術的負債 | 10件（うち高優先度1件: withholdingTaxCycle） |
| 未実装領域 | Notification Settings/Delivery（設計のみ、v1.1以降と合意済み） |

### 最終評価: **B（β公開可能、軽微な修正推奨）**

**理由**: レビュー範囲内で、データ漏洩・権限昇格・データ破損につながる重大な欠陥は発見されなかった。
RLS/アクセス制御はSprint33以降一貫して健全に機能している。唯一「高」優先度とした
withholdingTaxCycleギャップも、実害は「特定1フィールドのConfidenceが`incomplete`のまま」に
留まり、他のRoadmap/Decision/Notification機能の動作を止めるものではない。

ただし、**23節に挙げた3項目（確認ダイアログ・withholdingTaxCycleの案内・Share期限の注意書き）は
β公開前に対応することを推奨する**——いずれも実装コストが小さい一方、ユーザーの信頼を損ないうる
（「入力したのに反映されない」「削除ボタンを押したら即座に消えた」「共有リンクがいつまでも
有効だと知らなかった」）種類の問題であるため。これらはコード変更を伴うため、対応する場合は
別途新しいSprintとして計画すること（本Sprintはレビューのみであり、修正は行わない）。
