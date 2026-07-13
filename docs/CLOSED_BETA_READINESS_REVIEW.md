# CLOSED_BETA_READINESS_REVIEW.md — Closed Beta Readiness Review（Sprint59）

**ステータス: 品質監査のみ。新機能追加は行っていない。コード変更は「本当に必要なもの」のみに限定し、
今回は0件（詳細は末尾「本Sprintでのコード変更」参照）。DB変更・migrationも無し。**

目的: Closed Beta公開前に、全画面のUI・文言・導線・一貫性・情報不足表示・資料品質を確認し、
経営者がβ公開時に迷わない状態を目指す。対象は(site)の全画面・Company Workspace（管理画面）の
全画面・Excel/PDF出力・共有ページ。

調査方法: 全対象ファイルのコードリーディング（表示文言・ラベル定数・情報不足時の分岐ロジック）と、
横断grepによる文言の重複・不一致チェック。Workspace管理画面はログイン情報を保有していないため、
実際のブラウザ操作による確認はSprint55〜58と同様に(site)側のみで行い、Workspace側はコード構造の
比較（同じ関数・同じ定数を参照しているか）で一致性を判断した。

---

## 良い点

- **Engine層（診断・Roadmap・Rule・Decision・Notification）はいずれも「既存の計算結果を再利用するだけ」の純粋関数として一貫して設計されている。** `workspaceDecisions.ts`・`workspaceNotifications.ts`は共に`nearestOccurrencePerProcedure`・`daysUntil`（`workspaceAdvice.ts`）を再利用し、新しい期限計算を一切持たない（`workspaceNotifications.ts`冒頭コメントに明記）。Notification CenterはDecision/Adviceの結果を再ラベリングするだけの経路のため、期限判定が画面ごとに食い違うリスクは構造的に低い
- **情報不足表示（Confidence: 情報不足/推定/確定）は、Roadmap・Dashboard・Share・Excel・PDFのいずれも同じ`StateConfidence`型（`confirmed`/`estimated`/`incomplete`）を起点にしており、独自に推測して表示を作っている箇所は見つからなかった**（②で詳述）
- **Excel/PDFは共通の`buildRoadmapExportRows`（`roadmapExport.ts`）が唯一のデータ生成経路であり、会社名・所在地・提出先・必要書類・期限・ステータスのいずれも同じ関数・同じフィールドから供給される**（③で詳述）。表示形式（.xlsx/.pdf）が違うだけで、判定ロジックの二重実装は無い
- **Share（`/share/[token]`）はWorkspace Roadmapと同じ`AnnualRoadmapView`コンポーネント・同じ`buildAnnualRoadmap`を使っており、表示内容が構造的に一致する**（④で詳述）
- Sprint47〜58を通じて、判定漏れ・誤案内に関する実質的な問題（`hasOfficerTerm`未接続、`WITHHOLDING_SPECIAL_EXCEPTION`の誤案内、Confidence表示バグ）はいずれも既に解消済み。今回の監査で新たに見つかったのは表示・文言・導線レベルの課題であり、「手続きの判定が誤っている」種類の問題は発見していない

---

## ① 文言監査

同じ意味の概念に対して画面ごとに異なる言葉・異なる定義が使われている箇所を一覧化する。

| # | 概念 | 画面A | 画面B | 実態 | 深刻度 |
|---|---|---|---|---|---|
| 1 | 「今すぐ対応すべき/直近の手続き」 | (site) `/result`（`ScheduleList.tsx`）: 「今日やること」＝**当日または期限超過**（`bucketOf`、`days <= 0`のみ） | Workspace Dashboard（`WorkspaceDashboard.tsx`）: 「今日やること」＝**4〜30日先**（`advice.priority`、`URGENT_WINDOW_DAYS(3)`超〜`PRIORITY_WINDOW_DAYS(30)`以内。3日以内は別セクション「期限警告」に回る） | **同じラベル「今日やること」が、画面によって全く違う期間を指す。** site版は文字通り「今日」、Workspace版は実質「今月」に近い | **High** |
| 2 | 決算のたびの申告実績を記録する機能 | (site): 「確定申告実績」（`/profile/tax-returns`のh1） | Workspace: 「決算実績」（`/tax-returns`のh1、`WorkspaceSubNav`のタブ名、Dashboardのカード名と統一済み） | 入力項目・ラベルは完全に同一（grep確認、フィールド名一致）だが、画面タイトルだけ2種類の言葉を使っている | Medium |
| 3 | AI参謀 | (site) `ScheduleList.tsx`: 「最重要アクション」「次に来る予定」「注意すべきリスク」「会社情報からのアドバイス」「優先度（★評価付き）」の5区画構成。独自の`adviserScore.ts`（`buildAdviserComment`・`buildRiskEntries`等）を使用 | Workspace `WorkspaceDashboard.tsx`: `summary`文＋`opportunities`一覧のみの2要素構成。別の`workspaceAdvice.ts`（`generateWorkspaceAdvice`）を使用 | 同じ「AI参謀」ブランドで、実装・情報量が大きく異なる2つの独立したEngineが存在する。両方を使うユーザー（税理士・複数社を診断で試してからWorkspace運用する経営者等）は体験の落差に戸惑いうる | Medium |
| 4 | 通知の一覧 | (site): 「通知」（`NotificationCard`見出し、`notificationEngine.ts`） | Workspace: 「通知センター」（`WorkspaceDashboard.tsx`、`workspaceNotifications.ts`） | 呼び方が異なるだけで機能は近い（が③で述べる通り実装は別Engine） | Low |
| 5 | 完了率の表示 | (site): 「手続き完了率」（1つのカードで%と件数を表示） | Workspace: 「進捗サマリー」の中に「完了率」（別カードで内訳件数タグと分離表示） | 見出しの言葉が異なる。情報量はWorkspace版の方が多い（未着手/進行中/完了/保留の内訳） | Low |
| 6 | データが無いことの表示 | Roadmap: 提出先が無い場合「提出先情報は未登録です」 | Roadmap: Confidenceが低い場合「情報不足」 | 「未登録」＝SUNBOO側のマスタデータ不足、「情報不足」＝利用者の入力不足、という区別は概念上は正しいが、利用者からは両方とも「情報が無い」としか見えず、対処法の違い（前者は待つしかない/後者は入力すれば直る）が文言だけでは伝わりにくい | Low |
| 7 | 専門家への確認を促す注記 | 「税理士・社労士等の専門家にご確認ください」（(site)profile系） / 「税理士等の専門家にご確認ください」（tax-returns系） / 「顧問の専門家・各公式機関」（Share） / 「顧問税理士にご確認ください」（消費税自動判定のヒント） | - | 文脈に応じた妥当な使い分けもあるが、統一されたテンプレート文言があるわけではなく、4パターンが並存している | Low |
| 8 | Confidenceラベルの実装 | `roadmapExport.ts`の`CONFIDENCE_LABEL`定数 | `AnnualRoadmapView.tsx`・`WorkspaceDashboard.tsx`はそれぞれ独自にif/三項演算子で同じ文字列（「推定」「情報不足」）をハードコード | 表示される文言は3箇所とも一致しているが、Single Source of Truthになっていない。将来どちらかだけ変更されると画面間で表示が食い違うリスクがある（コード上の潜在リスク、現状は症状なし） | Low（潜在リスク） |
| 9 | 手続きステータスラベルの実装 | `workspaceProcedureStatus.ts`の`WORKSPACE_PROCEDURE_STATUS_LABEL`（未着手/進行中/完了/保留） | `ScheduleList.tsx`が独自に`STATUS_LABEL`（未着手/進行中/完了の3値、保留無し）を再定義 | (site)フローに「保留」概念自体が無いため3値なのは仕様として妥当だが、実装は別々の定数。値は一致 | Low（潜在リスク） |
| 10 | 進捗集計の日数ウィンドウ | `workspaceAdvice.ts`: `URGENT_WINDOW_DAYS=3`・`PRIORITY_WINDOW_DAYS=30`・`INCOMPLETE_LOOKAHEAD_DAYS=90` | `workspaceDecisions.ts`: `URGENT_WINDOW_DAYS=3`・`ACTION_WINDOW_DAYS=30`・`WATCH_WINDOW_DAYS=90` | 値は現在すべて一致しているが、2ファイルに独立して定義されており、importで共有されていない。将来どちらかだけ変更すると「今日やること」と「意思決定」で対象手続きの基準がずれる | Medium（潜在リスク） |

### 文言統一案

- 「今日やること」（#1）は最優先で名称を変える。Workspace側を「近日中の対応」等、期間が伝わる名称に改称するか、site側の粒度（当日のみ）に合わせて`URGENT_WINDOW_DAYS`以内の項目だけを指すよう再定義する（いずれもEngine変更を伴うため、本Sprintでは実施せず次Sprint候補とする）
- 「確定申告実績」と「決算実績」（#2）はどちらかに統一する。Workspace側の名称（「決算実績」）はSubNav・Dashboardカードと既に統一されているため、(site)側を「決算実績」に合わせるのが影響範囲が小さい
- Confidence/ステータスラベル（#8・#9）は、`CONFIDENCE_LABEL`・`WORKSPACE_PROCEDURE_STATUS_LABEL`を唯一の定義箇所とし、`AnnualRoadmapView.tsx`・`WorkspaceDashboard.tsx`・`ScheduleList.tsx`はそこからimportする形にリファクタリングする（表示文言自体は変えない、内部実装のみの整理）
- 日数ウィンドウ定数（#10）は`workspaceAdvice.ts`の3定数を`workspaceDecisions.ts`からimportして共有する（`ACTION_WINDOW_DAYS`等の名前は維持しつつ値の参照元を1つにする）

---

## ② 情報不足表示

Roadmap・Dashboard・Share・Excel・PDFの5箇所について、未入力時の扱いが同じ思想になっているかを確認した。

| 画面 | 情報不足の出し方 | 起点データ |
|---|---|---|
| Roadmap（site/Workspace共通、`AnnualRoadmapView.tsx`） | `item.confidence`が`estimated`/`incomplete`のときのみバッジ表示。`confirmed`は無表示（バッジが無いこと自体が「確定」を意味する） | `buildAnnualRoadmap`→`confidenceForProcedure` |
| Dashboard（`WorkspaceDashboard.tsx`の`ConfidenceTag`） | 同上のロジックを`state.stage.confidence`等に適用。`confirmed`は`null`を返し何も表示しない | `CompanyState`の各`StateField.confidence` |
| Share（`AnnualRoadmapView`をそのまま使用） | Roadmapと完全に同一（コンポーネント共有のため） | 同上 |
| Excel（`roadmapExcelWorkbook.ts`） | 「Confidence」列に`CONFIDENCE_LABEL`の文字列をそのまま出力（確定/推定/情報不足の3値、空白にはならない） | `RoadmapExportRow.confidence` |
| PDF（`roadmapPdfDocument.ts`107-110行） | `row.confidence !== '確定'`の場合のみ「※ ◯◯（登録情報が不足しているため、期限が変わる可能性があります）」という注記を追加 | 同上 |

**結論: 5画面とも同じ思想（Confidenceが下がっている場合のみ明示し、確定情報は無印で示す）で統一されている。** Excel/PDFは「常に列を出す」「注記を追加する」という表示形式の違いはあるが、判定元のデータは共通。

**「勝手に推測する箇所」の有無**: `applyCompanyProfileToProcedures`・`runDiagnosis`・`state.ts`の`derive*`関数群を確認した限り、値が不明な場合は`null`または`'incomplete'`を返して利用者に委ねる設計が一貫しており（`deriveConsumptionTaxStatus`等のコメント「根拠が無い場合はnullを返して断定しない」）、断定的な推測をしている箇所は見つからなかった。唯一グレーな点は、`WITHHOLDING_TAX_CODE`が`withholdingTaxCycle==='unset'`でも非表示にせず「毎月納付」パターンで表示し続ける既存挙動（Sprint47以前からの確立済み挙動、Sprint58でも変更していない）。これは「未入力なら表示しない」ではなく「未入力なら法定の原則（毎月納付）を保守的に表示する」という設計判断であり、"推測"ではなく"原則の適用"だが、情報不足バッジ（Sprint58で対応）が併記されるため誤解のリスクは低い。

---

## ③ PDF / Excel の一致確認

| 項目 | Excel | PDF | 一致 |
|---|---|---|---|
| 会社名 | `buildRoadmapExcelBuffer(rows, companyName, ...)` | `buildRoadmapPdfBlob(rows, companyName, ...)` | 呼び出し元（`RoadmapExcelExportButton`/`RoadmapPdfExportButton`）が同じ`company.name`を渡す。一致 |
| 所在地 | `companyAddress`列（`formatCompanyAddress`） | 表紙の`companyAddress`行（同じ`formatCompanyAddress`） | 呼び出し元が同じ`context.companyProfile`から同じ関数で生成。一致（Sprint56で確認済み） |
| 提出先 | `officeName`列 | 本文の「提出先: ◯◯」 | 両方とも`RoadmapExportRow.officeName`（`buildRoadmapSubmissionInfo`由来）を参照。一致 |
| 必要書類 | `documentGuide`列（`formatDocumentGuideCell`） | 本文の必要書類ブロック | 両方とも`RoadmapExportRow.documentGuide`（`buildRoadmapDocumentItems`由来）を参照。一致 |
| 期限 | `dueDate`列（日付型） | 本文の期限表示 | 両方とも`RoadmapExportRow.dueDate`。一致 |
| ステータス | `status`列 | 本文のステータス表示 | 両方とも`RoadmapExportRow.status`（`WORKSPACE_PROCEDURE_STATUS_LABEL`変換済み）。一致 |

**結論: 6項目とも`buildRoadmapExportRows`という単一の生成関数を経由するため、構造的に食い違いが起きない設計になっている。** Excel/PDF固有のコード（`roadmapExcelWorkbook.ts`/`roadmapPdfDocument.ts`）は表示形式の変換のみを担い、データ生成ロジックを重複させていない。実際に生成したファイルをバイト単位で比較する実機確認は管理画面ログインが必要なため未実施だが、コード構造上一致しない経路が無いことは確認済み。

---

## ④ Share の一致確認

`/share/[token]`（`src/app/share/[token]/page.tsx`）と Workspace Roadmap（`/admin/workspaces/[id]/roadmap`）を比較した。

- 手続き一覧の表示: 両方とも`AnnualRoadmapView`コンポーネントを共有しており、`roadmapYears`・`statusMap`の生成元（`buildAnnualRoadmap`）も同一。**構造的に一致する**
- 会社情報ヘッダー: Shareは「会社名・法人種別・都道府県+市区町村+所在地(address)・決算月」を表示（Sprint56で`address`を追加済み）。Workspace RoadmapページはWorkspaceDashboardの「会社概要」カードほど詳細な会社情報を持たず、`roadmap/page.tsx`のh1に会社名のみ表示
- **非対称点（Low〜Medium）**: Dashboardの「会社概要」カード（`WorkspaceDashboard.tsx`292-322行）は法人種別・決算月・都道府県+市区町村・会社ステージ・消費税ステータス・要更新書類件数を表示するが、**`address`（番地）は表示していない**。一方Shareページは`address`を表示する（Sprint56）。同じ会社について、社内向け（Dashboard）より社外共有向け（Share）の方が詳しい住所情報を出している状態で、意図的な設計ではなく単に「Sprint56がShare/Excel/PDFのみをスコープにし、Dashboardを含めなかった」ことによる非対称。実害は無いが一貫性の観点では揃えるべき
- Excel/PDF出力ボタン: Shareには意図的に配置されていない（コメントで明記済み、経営者への共有リンクは編集・出力機能を持たせない設計）。これは仕様として妥当

---

## ⑤ Dashboard の一致確認

「今日やること」「期限警告（≒期限切れ含む）」「意思決定」「年間ロードマップ」の4つで、同じ手続きが違う期限にならないかを確認した。

- **期限自体の計算源は完全に同一**: 4区画すべてが同じ`buildAnnualRoadmap`の結果（`roadmapYears`）を起点にしており、`RoadmapItem.dueDate`が二重計算されることはない
- **「同じ手続きが違う日数で扱われる」ケースが1つある（Medium、①#10と同一原因）**: Advice（今日やること/期限警告）とDecision（意思決定）は独立した日数ウィンドウ定数を持つため、将来どちらかの定数だけが変更されると、同じ手続きが「今日やること」には出るが「意思決定」の`actions`には出ない（またはその逆）という食い違いが発生しうる。現状は値が一致しているため症状は出ていない
- **「年間ロードマップ」だけ数が多く見えるのは仕様通り**: Advice/Decisionはいずれも`nearestOccurrencePerProcedure`で「手続きごとに最も近い1回」だけを対象にするのに対し、年間ロードマップは今後3年分の全出現を表示する（毎月納付の源泉所得税なら36回分）。これは意図的な設計（コードコメントに明記）だが、**画面上にはこの違いを説明する注記が無い**。「Dashboardの意思決定に出ていない手続きが年間ロードマップにはたくさん出ている」と経営者が誤って“見落とし”と捉える可能性があるため、⑦のMedium項目として扱う
- 「期限切れ」という独立したセクション名はDashboardには無く、「期限警告」内で期限超過と期限接近をまとめて扱っている（`isOverdue`関数で判別し文言・色を変える）。ユーザー提示の確認観点「期限切れ」に対応する実体はこの「期限警告」内の赤色表示部分である

---

## ⑥ Company Profile UX

### 現状

- (site) `/profile`は23フィールド全てに入力欄を持つ「完全版」（6カード構成: 基本情報／会社ステージ／税務／源泉所得税・地方税／電子申告／顧問専門家）
- Workspace `WorkspaceProfileForm`はMVPとして意図的に一部フィールド（`taxationMethod`・`corporateTaxInterimFiling`・`consumptionTaxInterimFrequency`・`localTaxCollectionMethod`・`eTaxEnabled`・`eLTaxEnabled`・顧問税理士以外の`advisors`）を編集対象外にしている（ファイル冒頭コメントで明記）。**しかし画面上にはこれらのフィールドが「無いこと」を示す表示が一切無い。** 利用者からは「この項目はそもそも存在しない」のか「準備中」なのか区別がつかない
- 「この情報を使う理由」キャプションは、Sprint55（`nextOfficerChangeDate`）・Sprint56（都道府県・市区町村・`address`）で導入した4項目にのみ存在する。残り19項目（消費税ステータス・インボイス登録状況・資本金等、実際にEngineが判定に使っている項目を含む）には理由の説明が無い
- 入力順序: (site)は「基本情報→会社ステージ→税務→源泉所得税・地方税→電子申告→顧問専門家」。Workspaceは「法人種別・決算月→所在地の説明文→番地→役員変更予定日→設立日・資本金→従業員数→会社ステージ→消費税・インボイス→源泉所得税→住民税→顧問税理士」。**カード分けが無く、税務・登記・所在地の各カテゴリが視覚的に区切られないまま1つの縦長フォームになっている**

### 改善案（Sprint57監査7節を継承）

以下6カテゴリでの再編を提案する（コード変更は伴わないため、本Sprintの成果物として提案に留める）。

1. **基本情報**: 法人種別・従業員数・資本金・設立日・決算月・会社ステージ
2. **所在地**: 都道府県・市区町村（判定に使用）・番地（表示専用）— Sprint56のキャプション方針をそのまま踏襲
3. **税務**: 消費税ステータス・インボイス登録状況・課税方式・中間申告関連 — このカテゴリ内の「課税方式」「中間申告」系3項目は現状Engineの判定に使われていない（Sprint57監査3節）ため、「現在は表示・記録のみで手続きの判定には反映されません」という第三の説明文を付ける
4. **給与・源泉・住民税**: 源泉所得税の納期・住民税徴収方法・住民税納期区分
5. **社会保険・労働保険**: 現状表示するフィールドが無い（従業員数のみで代理判定）。将来項目のための枠として提示するに留める
6. **登記**: 次回役員変更予定日（株式会社限定）

各項目に「この情報を使う理由」を、判定に使う/使わない/現在は未使用、の3パターンで表示する方針もあわせて提案する（Sprint57監査7-1節）。

**WorkspaceProfileFormについては、まず「編集できない項目が存在すること」自体を利用者に伝える一文を追加することを最優先の改善候補とする**（コード変更を伴うため次Sprintで判断）。

---

## ⑦ βで迷うポイント（5秒以上止まりそうな画面）

| # | 内容 | 画面 | 分類 |
|---|---|---|---|
| 1 | 「今日やること」の意味が(site)とWorkspaceで異なる（①#1） | (site)/result、Workspace Dashboard | **High** |
| 2 | WorkspaceProfileFormで税務系4項目が編集できないが、理由の説明が画面に無い（⑥） | Workspace Profile | **High** |
| 3 | 「AI参謀」の情報量が(site)とWorkspaceで大きく異なる（①#3） | (site)/result、Workspace Dashboard | Medium |
| 4 | Dashboardの「意思決定」に出ない手続きが年間ロードマップには多数出る理由が説明されていない（⑤） | Workspace Dashboard/Roadmap | Medium |
| 5 | 「書類」画面がファイルアップロードではなくステータス管理のみであることが、画面に入るまで分からない（アイコンが書類アップロードを連想させる） | Workspace Documents | Medium |
| 6 | Workspaceで「住民税特別徴収の納期」だけ選べるが「住民税の徴収方法」自体（特別徴収/普通徴収）は選べないため、普通徴収の会社が正しく設定できない（Sprint57監査2-1節、既知） | Workspace Profile | Medium |
| 7 | Company Profileのほとんどの項目に「なぜこれが必要か」の説明が無く、23項目中4項目にしか理由キャプションが無い（⑥） | (site)/profile、Workspace Profile | Medium |
| 8 | Dashboardの「会社概要」に所在地(address)が表示されず、Shareページとの情報量が非対称（④） | Workspace Dashboard | Low |
| 9 | 「確定申告実績」（site）と「決算実績」（Workspace）が同じ機能に見えず、初見では別物と誤解しうる（①#2） | (site)/profile/tax-returns、Workspace tax-returns | Low |
| 10 | 「会計分析」がComing Soonのまま常時表示され、クリックすると何も起きない（実際はリンク自体が無くカード表示のみだが、初見でクリックを試みる可能性） | Workspace Dashboard | Low |

---

## ⑧ 不要な画面・価値が低い画面

| 画面 | 状態 | 評価 |
|---|---|---|
| `/diagnosis`（`src/app/(site)/diagnosis/page.tsx`） | `redirect('/start')`のみのスタブ。「このページは廃止済み」とコメントに明記済み | 内部リンクからは一切参照されておらず実害は無いが、コードとして残す理由も無い。削除候補（Low、次Sprintで判断） |
| `/form`（`src/app/(site)/form/page.tsx`） | 同上、`redirect('/start')`のみ | 同上、削除候補（Low） |
| Workspace Documents（書類） | 実データ（ファイル）を保持しない、ステータスのみのMVP。画面内の注記で明記済み（「ファイルの添付は行わず、状態のみを記録します」） | 「不要」ではないが「書類」という名前・アイコンから連想される機能（アップロード・保管）を提供していない。⑦#5と合わせて名称またはUIの見直しを推奨 |
| `/admin/workspaces/[id]` の「会計分析」カード | Coming Soon固定、`hrefSuffix: null`でリンクを持たない（クリック不可） | 実装前のロードマップ告知として妥当。実害なし |

---

## 本Sprintでのコード変更

**0件。** 監査の結果、Blocker（β開始を止めるべき問題）に該当する事象は見つからず、High評価の2件（「今日やること」の意味の食い違い、WorkspaceProfileFormの編集不可項目の無説明）はいずれも複数ファイルにまたがる文言・構造変更を伴うため、レビュー無しに「必要最小限」の範囲で断定的に直せる性質ではないと判断した。今回はレビューを経てから次Sprintで対応する方針とする。

---

## まとめ

### Blocker

**0件。** 判定漏れ・誤案内につながる実質的な不具合は今回発見していない（Sprint55〜58で既知のものは解消済み）。

### High

1. 「今日やること」の意味が(site)とWorkspaceで異なる（①#1・⑦#1）
2. WorkspaceProfileFormで税務系4項目が編集できない理由が画面に説明されていない（⑥・⑦#2）

### Medium

1. 「AI参謀」の実装・情報量が(site)とWorkspaceで大きく異なる（①#3・⑦#3）
2. Advice/Decisionの日数ウィンドウ定数が別々に定義されており将来ズレるリスクがある（①#10・⑤）
3. Dashboardの「意思決定」と「年間ロードマップ」の表示範囲の違いが説明されていない（⑤・⑦#4）
4. Workspace Documents画面がファイルアップロードを連想させるが実際はステータス管理のみ（⑦#5・⑧）
5. Workspaceで住民税の徴収方法（特別徴収/普通徴収）自体を選べない（⑥・⑦#6、Sprint57から継続）
6. Company Profileの大半の項目に入力理由の説明が無い（⑥・⑦#7）

### Low

1. 「確定申告実績」/「決算実績」の名称不一致（①#2・⑦#9）
2. 「通知」/「通知センター」の名称不一致（①#4）
3. 「手続き完了率」/「進捗サマリー」の名称不一致（①#5）
4. 「未登録」/「情報不足」の使い分けが直感的に伝わりにくい（①#6）
5. 専門家への確認を促す注記の文言が4パターン並存（①#7）
6. Confidence/ステータスラベルの実装がSingle Source of Truthになっていない（①#8・#9、潜在リスク）
7. Dashboardの「会社概要」にaddressが表示されずShareと非対称（④・⑦#8）
8. `/diagnosis`・`/form`の廃止済みスタブページ（⑧）
9. Workspace Dashboardの「会計分析」Coming Soonカード（⑧）

### 文言統一案

「① 文言監査」節末尾の「文言統一案」を参照。優先度が高いのは「今日やること」の名称変更と「確定申告実績/決算実績」の統一。

### β開始可否

**条件付きでGo。** Blocker評価の項目は無く、SUNBOOの中核機能（義務判定・期限計算・提出先案内）に誤りは見つかっていない。High評価の2件は「誤った情報を与える」問題ではなく「同じ言葉が画面によって意味が違う／説明が無い」という理解のしやすさの問題であり、Closed Beta（招待制・限定人数・サポート対応が可能な運用形態）であればサポートで補える範囲と判断する。ただし、一般公開（Open Beta以降）へ進む前には、少なくとも上記High 2件は解消しておくことを推奨する。

---

## 参照ファイル一覧

`src/app/(site)/page.tsx`・`diagnosis/page.tsx`・`form/page.tsx`・`start/page.tsx`・`profile/page.tsx`・
`profile/tax-returns/page.tsx`・`events/page.tsx`・`result/page.tsx`・`result/ScheduleList.tsx`・
`roadmap/page.tsx`、`src/app/admin/(protected)/workspaces/[id]/page.tsx`・`profile/WorkspaceProfileForm.tsx`・
`roadmap/page.tsx`・`documents/page.tsx`・`tax-returns/page.tsx`・`share/page.tsx`、
`src/app/share/[token]/page.tsx`、`src/components/WorkspaceDashboard.tsx`・`AnnualRoadmapView.tsx`・
`WorkspaceSubNav.tsx`・`WorkspaceTaxReturnsView.tsx`、
`src/lib/workspaceAdvice.ts`・`workspaceDecisions.ts`・`workspaceNotifications.ts`・`notificationEngine.ts`・
`adviserScore.ts`・`roadmapExport.ts`・`roadmapExcelWorkbook.ts`・`roadmapPdfDocument.ts`・
`companyProfile.ts`・`roadmap.ts`・`state.ts`・`diagnosis.ts`・`workspaceProcedureStatus.ts`。

`docs/COMPANY_PROFILE_OBLIGATION_AUDIT.md`（Sprint57）・`docs/BETA_BACKLOG.md`（Sprint49〜58更新分）を
前提知識として参照した。
