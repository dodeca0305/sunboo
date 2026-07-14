# SUNBOO_INTERACTIVE_CONTROLS_REVIEW.md — Interactive Controls & Status Foundation（Sprint83）

> **ステータス：ドラフト（Sprint83「Interactive Controls & Status Foundation」成果物）**
> Engine・DB・migration・package・Roadmap Cardの全面刷新・PDFは変更していない。
> レビュー待ちで停止する。コミットは行っていない。

---

## 1. 置換した共通クラス／新規共通部品

### 1.1 トグル・セグメントコントロール → `SegmentedControl`
`src/components/SegmentedControl.tsx`（新規）に集約した。素の`<button type="button">`を使うため、
Tab/Enter/Spaceによるキーボード操作はブラウザ標準のまま維持される。選択状態は
**色（MorningSun塗り）と`aria-pressed`属性の両方**で表現し、色だけに依存しない
（スクリーンリーダーは`aria-pressed`から選択状態を読み上げられる。旧実装にはこの属性が無かった）。

| 旧実装（独自Blue-600） | 対応状況 |
|---|---|
| `src/app/(site)/start/page.tsx`（従業員有無／法人種類／役員任期の3箇所、いずれもインライン実装） | `SegmentedControl`に置換 |
| `src/app/(site)/events/page.tsx`（法人種類／従業員有無の2箇所、インライン実装） | `SegmentedControl`に置換 |
| `src/app/(site)/events/page.tsx`（イベント種別アイコンカード、選択状態`border-blue-600 bg-blue-50`） | 形状は維持しつつ選択色のみMorningSun系に再配色（`aria-pressed`も追加） |
| `src/app/(site)/profile/page.tsx`のローカル`ToggleButtons`（11箇所で使用） | 削除し`SegmentedControl`を直接使用 |
| `src/app/(site)/profile/page.tsx`「顧問専門家」トグル（独立4択のチェック風ボタン、インライン実装） | `SegmentedControl`は単一選択が前提のため流用せず、共通CSSクラス`.segmented-option`＋`aria-pressed`を直接付与 |
| `src/components/TaxReturnEntryFields.tsx`のローカル`ToggleButtons`（`AmountField`内2箇所で使用） | 実装を`SegmentedControl`に置き換え、`WorkspaceTaxReturnsView.tsx`・`(site)/profile/tax-returns/page.tsx`が引き続き`ToggleButtons`の名前でimportできるよう後方互換の再エクスポートを残した（このファイル内2箇所の使用箇所は`SegmentedControl`に直接書き換え済み） |

### 1.2 Tag と Status Badge の分離 → `StatusBadge`
`src/lib/statusBadge.ts`（label・icon・className・printLabelの一元管理）と
`src/components/StatusBadge.tsx`（表示コンポーネント）を新規作成した。

- 一般的な分類用の`.tag`（pill形状、無彩色）はそのまま維持し、変更していない
- Status Badge（`.status-badge`、角丸8pxの矩形）を新設し、手続きの進行状態・確からしさ専用とした
- 5値「未着手・進行中・完了・情報不足・推定」に加え、`WorkspaceProcedureStatus`型に実在する
  6番目の値「保留（on_hold）」も同じ枠組みでサポートした（5値の指示に無いが、既存の型を壊さずに
  対応するために必要だったため追加）
- 各バッジは必ずlucideアイコン＋文言をセットで表示し、色だけに依存しない

| kind | label | icon | 色 |
|---|---|---|---|
| not_started | 未着手 | Circle | Ink Muted（無彩色） |
| in_progress | 進行中 | Clock | MorningSun系（「現在地」用途に該当） |
| done | 完了 | CheckCircle2 | Moss |
| on_hold | 保留 | PauseCircle | Ink Muted（無彩色） |
| info_missing | 情報不足 | CircleHelp | Ink Muted（無彩色、アイコンで意味を区別） |
| estimated | 推定 | Info | Ink Muted（無彩色、アイコンで意味を区別） |

`printLabel`は現時点でアイコンを描画できない文脈（title属性）向けの予備フィールドとして
`StatusBadge`コンポーネントの`title`に採用した。Excel/PDF出力への接続は本スプリントでは行っていない
（PDF変更禁止、Excelも対象外としてスコープを絞った）。

---

## 2. 状態色統合（Procedure / Roadmap / Dashboard / Notification Status）

Sprint82監査で確認した「同じ状態概念に対する5通りの異なる視覚表現」を、意味を保ったまま統合した。

| 箇所 | 旧実装 | 新実装 |
|---|---|---|
| `AnnualRoadmapView.tsx`（Roadmap Status、読み取り専用） | 無色の`.tag`（`WORKSPACE_PROCEDURE_STATUS_LABEL[status]`のみ） | `<StatusBadge kind={status} />` |
| `AnnualRoadmapView.tsx`（推定／情報不足） | `tag border-amber-200 text-amber-700` | `<StatusBadge kind="estimated" / "info_missing" />` |
| `ScheduleList.tsx`のStatusButton（Procedure Status、操作用チェック） | done/in_progressともBlue-600 | done=Moss、in_progress=MorningSun-dark（枠線・ドット） |
| `ScheduleList.tsx`の「進行中」インラインタグ | `tag border-blue-200 text-blue-600` | `<StatusBadge kind="in_progress" />` |
| `WorkspaceDashboard.tsx`のConfidenceTag | `tag border-amber-200 text-amber-700` | `<StatusBadge kind="estimated" / "info_missing" />` |
| `WorkspaceDashboard.tsx`の進捗サマリー（Dashboard Status） | 無色の`.tag`（件数のみ） | `<StatusBadge kind={...} suffix=" N件" />` |
| `WorkspaceDashboard.tsx`のDecision Priority／Notification severity（Dashboard/Notification Status） | `border-red-200 text-red-700`／`border-amber-200 text-amber-700`のハードコード | `src/lib/statusBadge.ts`の`PRIORITY_TAG_CLASS`経由で`.tag--danger`／`.tag--caution`を参照 |

### 新設したCSS（`globals.css`、追加のみ）
- `.tag--danger` / `.tag--caution` — Priority（重要度）表示専用の`.tag`修飾子。Danger/MorningSun-dark
- `.status-badge` + `--neutral` / `--muted` / `--active` / `--done` — Status Badge本体
- `.segmented-option` + `[aria-pressed='true']` — SegmentedControl本体

### 新設したToken（`tokens.css`、追加のみ）
- `--color-sunboo-morning-sun-dark`（`#D97706`）— MorningSunは境界線・ドット等の細いグラフィック要素に
  単体で使うとSurface背景に対しコントラスト比約2:1でWCAG非text-contrast推奨値（3:1）を下回るため、
  そうした用途限定で使う濃色版として追加した（計算上約3.18:1で3:1をクリア）。塗り（選択状態のボタン等）
  には引き続き通常のMorningSunを使う

### Procedure Status／Roadmap Statusで統一しなかった箇所（意図的なスコープ外）
- `ProceduresTable.tsx`の`is_active`（管理画面の手続きカタログ有効/無効） — 「Procedure Status」とは別概念（会社ごとの進行状況ではなくカタログの公開設定）のため対象外とした
- `WorkspaceDocumentsView.tsx`の書類ステータス（未登録/登録済み/要更新） — Sprint83の対象リストに明記が無いため対象外とした
- `TaxReturnEntryFields.tsx`の`ConfidenceTag`（金額の正確性：正確/概算/未入力） — Roadmap/Procedureの確からしさとは異なるドメイン（決算実績の入力精度）のため対象外とした
- `ScheduleList.tsx`のNotificationCard／RiskSection（期限超過・当日・3日前等の緊急度） — 「状態」ではなく「期限までの近さ」を表す別概念で、既に赤=超過/amber=注意という運用ができているため対象外とした
- `ScheduleList.tsx`の手続き完了率プログレスバー（Blue-600の塗り） — Sprint80ガイドラインの「Progress」コンポーネントに相当し、Status Badgeとは別の議論のため対象外とした

いずれも次スプリント以降の判断事項として引き継ぐ（§6）。

---

## 3. モバイル横溢れの修正

### 原因
`/result`（`src/app/(site)/result/page.tsx:160`）と`/offices`（`src/app/(site)/offices/OfficeList.tsx:143`）の
管轄機関カード一覧が `className="grid gap-4 sm:grid-cols-2"` だった。Tailwindの`grid`ユーティリティは
`display: grid`を設定するだけで、明示的な`grid-cols-N`が無いとカラムトラックに`minmax(0, 1fr)`が
適用されない。そのため、375px幅（`sm:`未満）でもグリッドの唯一の暗黙カラムが**コンテンツの
最大幅（office名・住所等の文字列の合計幅）まで広がってしまい**、カード内の`min-w-0 flex-1`が
効かず右に44pxはみ出していた。

### 修正
両ファイルとも `grid grid-cols-1 gap-4 sm:grid-cols-2` に変更した。`grid-cols-1`が
`grid-template-columns: repeat(1, minmax(0, 1fr))`を明示することで、カラムがコンテナ幅に
正しく収まるようになる。**情報は一切削っていない**（住所・電話番号・地図/公式サイトリンクは
そのまま全て表示される。単にカードが折り返して縦に積まれるようになるだけ）。

### 確認結果
Playwrightで375px幅の`bodyScrollWidth`を計測し、修正前44px→修正後0pxの横溢れ解消を確認した
（詳細は§5）。

### 残存する同種パターン（対象外・参考情報）
`grid gap-4 sm:grid-cols-2`と同じ書き方は他に14箇所（主に管理画面のフォーム項目グリッド）に
存在するが、そのほとんどは`width:100%`の入力欄で構成されており今回のような文字列由来の
横溢れは起きにくい。`WorkspaceDashboard.tsx:188,266`のみ、カード内容によっては同種のリスクが
将来的にあり得るため、次スプリントでの点検候補として引き継ぐ（§6）。

---

## 4. 視覚差

### 意図した差
- `/start`・`/events`・`/profile`の全トグルが Blue-600塗り＋白文字 → **MorningSun塗り＋Ink文字**に変化
- 全トグルに`aria-pressed`が付与された（視覚に加えて意味的にも選択状態が伝わるようになった）
- Roadmap／Procedure／Dashboardの状態表示が、無色・青・amberが混在した状態から
  アイコン付きの統一されたStatus Badgeに変化
- `/result`・`/offices`のモバイル表示で、管轄機関カードが1カラムに折り返されるようになった（375px幅）

### 意図しない差・要確認事項
- `/start`・`/events`のトグルは元々`px-4 py-3`（縦padding 12px）だったが、`.segmented-option`は
  `/profile`の`ToggleButtons`と同じ`px-4 py-2.5`（縦padding 10px）に統一したため、
  **`/start`・`/events`のトグルの高さがわずかに縮んだ**（2px程度、Playwrightのスクリーンショットでは
  目立った破綻は確認できなかったが、レビューで確認を推奨）
- Status Badgeの導入により、Roadmap（管理画面・公開ページ・Share共通）の読み取り専用ステータス表示に
  初めて色が付いた（従来は無色）。これは「状態色統合」の意図した変化だが、Roadmap Card自体の
  レイアウト・情報優先順位には一切手を加えていない（全面刷新禁止の指示を遵守）

---

## 5. Playwright確認結果

devサーバー（既存プロセス、port 3000）に対し`playwright-core`（npm依存追加なし）で確認した。

### 対象画面 × ビューポート（375px / 768px / 1280px）

| 画面 | 375px横溢れ | 768px横溢れ | 1280px横溢れ | consoleエラー |
|---|---|---|---|---|
| `/start` | なし | なし | なし | 1件（`/start`のみ、無関係なリソース404。globals.css/tokens.css起因ではない） |
| `/profile` | なし | なし | なし | 0件 |
| `/events` | なし | なし | なし | 0件 |
| `/roadmap` | なし | なし | なし | 0件 |
| `/result` | **修正前44px→修正後なし** | なし | なし | 0件 |
| `/offices` | なし | なし | なし | 0件 |

### インタラクション確認
- **キーボード操作**：`/start`でTabキーによりSegmentedControlのボタンにフォーカスを移動し、
  Enterキーで選択できることを確認（`aria-pressed="true"`に変化、背景`rgb(245,158,11)`＝MorningSun、
  文字色`rgb(31,41,55)`＝Ink）
- **focus-visible**：上記と同時に`outline-style: solid`を確認（Inkの明瞭なアウトライン）
- **`/profile`の23個のSegmentedControl**：クリックで`aria-pressed`が正しく切り替わることを確認
- **Status Badge実表示**：`/result`でStatusButtonをクリックし、`in_progress`時に「進行中」バッジ
  （Clockアイコン付き、MorningSun系の淡色背景＋Ink文字、角丸8px）、`done`時にStatusButton自体が
  Moss塗りになることを実際にスクリーンショットで確認（`/roadmap`は会社プロフィール未登録の
  フレッシュなブラウザコンテキストのため空状態表示となり、Status Badgeの実データ確認は
  `/result`側で代替した）
- **顧問専門家トグル（`/profile`）**：当初の実装漏れ（Blue-600ハードコードの見落とし）をこの確認工程で
  発見し、`.segmented-option`＋`aria-pressed`に修正。修正後、クリックでMorningSun塗りに変化し
  `aria-pressed="true"`になることを再確認した
- **フォームフォーカスリング**：Sprint82で実装したMorningSunフォーカスリングに回帰が無いことを確認

### 未確認項目
- 管理画面（Workspace Dashboard／Profile／Roadmap）はログイン情報が無く、Sprint82に続き
  実機Playwright確認ができていない。`WorkspaceDashboard.tsx`のコード変更（ConfidenceTag・
  進捗サマリー・Priority Tag）はコード読解とビルド成功でのみ確認しており、実際のレンダリング結果の
  目視確認は次回セッションに持ち越す

---

## 6. Sprint84への引き継ぎ

- **管理画面の実機確認**：`WorkspaceDashboard.tsx`のStatus Badge／Priority Tag変更を、ログイン可能な
  環境で目視確認する（最優先）
- **`/start`・`/events`のトグル高さの微小な変化**：`.segmented-option`のpaddingを`py-3`に合わせて
  拡張するか、現状の`py-2.5`で統一のまま進めるかの意思決定
- **状態色統合の残り**：`ProceduresTable.tsx`の`is_active`、`WorkspaceDocumentsView.tsx`の書類ステータス、
  `ScheduleList.tsx`の完了率プログレスバーのBlue-600（§2「統一しなかった箇所」参照）
- **`grid gap-4 sm:grid-cols-2`の残存箇所**：`WorkspaceDashboard.tsx:188,266`を中心に、同種の
  横溢れリスクが無いか次スプリントで点検する
- **Status BadgeのprintLabel**：現状`StatusBadge`のtitle属性でのみ使用。Excel出力（`roadmapExcelWorkbook.ts`）
  等への接続は今回のスコープ外としたため、必要になった時点で改めて設計する
- **`.segmented-option`のフォーカスリング**：ボタン系はInkのoutlineで統一したが、Sprint82の
  `.form-input`同様、MorningSun単体のコントラスト比の限界（§2参照）についての継続的なレビューが必要

---

## 変更ファイル一覧

**変更（既存ファイル）**
`src/app/globals.css`、`src/styles/tokens.css`、
`src/app/(site)/start/page.tsx`、`src/app/(site)/events/page.tsx`、`src/app/(site)/profile/page.tsx`、
`src/app/(site)/result/page.tsx`、`src/app/(site)/result/ScheduleList.tsx`、`src/app/(site)/offices/OfficeList.tsx`、
`src/components/AnnualRoadmapView.tsx`、`src/components/TaxReturnEntryFields.tsx`、`src/components/WorkspaceDashboard.tsx`

**新規**
`src/components/SegmentedControl.tsx`、`src/components/StatusBadge.tsx`、`src/lib/statusBadge.ts`、
`docs/SUNBOO_INTERACTIVE_CONTROLS_REVIEW.md`
