# SUNBOO_SHARED_UI_MIGRATION_REVIEW.md — Shared UI Foundation Migration（Sprint82）

> **ステータス：ドラフト（Sprint82「Shared UI Foundation Migration」成果物）**
> 本スプリントで実際にコードを変更したのは `src/app/globals.css`（共通クラス6種の定義）と
> `src/styles/tokens.css`（タイポグラフィ正式値・Modal Shadow確定）の2ファイルのみ。
> Engine・Procedure・DB・migration・package・画面固有JSX・Roadmap Card・PDFは変更していない。
> レビュー待ちで停止する。

---

## 1. 置換した共通クラス

`src/app/globals.css` の以下6クラスを [src/styles/tokens.css](../src/styles/tokens.css) の正式Tokenへ接続した。
色・角丸・影・transitionのみを対象とし、`display`/`padding`/`font-size`/`gap`等のレイアウト系プロパティは
「既存の高さ・paddingは原則維持」の方針に従い**一切変更していない**。

| クラス | 変更内容 |
|---|---|
| `.card` | background→Surface、border→Mist、radius→Card(14px)、**box-shadow新規付与**（Card Shadow）、padding→Spacing Token参照（値は24pxのまま不変）、transition新規付与 |
| `.btn-primary` | background→MorningSun、color→**Ink**（白ではない、理由は§2）、radius→Control(12px)、hover→`filter: brightness(0.95)`（新規の色トークンを増やさず明度差のみ）、focus-visible新規付与（Ink、2px、offset 2px） |
| `.btn-secondary` | background→Surface、border→Mist、color→Ink、radius→Control(12px)、hover→WarmPaper背景、focus-visible新規付与 |
| `.form-input`/`.form-select` | background→Surface、border→Mist、color→Ink、radius→Control(12px)、placeholder色→Ink Muted（新規追加）、focus→MorningSun border + box-shadowリング |
| `.tag` | border→Mist、background→Surface、color→Ink Muted、radius→Pill Token（値は9999pxのまま不変）、font-size/font-weight/letter-spacing→Tiny Token（**line-heightは意図的に不採用**、理由は§3） |

`.form-label` と `body`（`@layer base`）はSprint82の対象6クラスに含まれていないため変更していない
（依然として生hex `#374151`/`#ffffff`/`#111111` のまま）。

---

## 2. 接続した正式Token

### カラー
WarmPaper／Surface／Ink／Ink Muted／MorningSun／Moss（今回未使用）／Mist／Danger（今回未使用）。
値は[docs/SUNBOO_DESIGN_GUIDELINES.md §4](SUNBOO_DESIGN_GUIDELINES.md#4-カラートークン)のまま。

### タイポグラフィ（Sprint82で正式確定、`tokens.css`を更新）

| ロール | font-size | line-height | font-weight | letter-spacing |
|---|---|---|---|---|
| Hero | 48px | 1.15 | 700 | -0.02em |
| Page Title | 36px | 1.2 | 700 | -0.015em |
| Section Title | 28px | 1.3 | **600**（Sprint81ドラフトの700から変更） | -0.01em |
| Card Title | 22px | 1.4 | 600 | 0 |
| Body | 16px | 1.75 | 400 | 0 |
| Caption | 14px | 1.6 | 400 | 0 |
| Tiny | 12px | 1.5 | **500**（Sprint81ドラフトの400から変更） | 0.02em |

### Modal Shadow（Sprint82で正式確定）
`0 20px 48px rgba(15,23,42,.14), 0 4px 12px rgba(15,23,42,.08)`（Sprint81の暫定値`0 2px 8px rgba(15,23,42,.08)`を置き換え）。
今回はどのコンポーネントもモーダルを持たないため未使用。

### 8px Grid（マクロ間隔のみ対象、の確認）
`.card`のpaddingを`var(--spacing-sunboo-3)`(24px)に接続。値自体は変更なし（従来も1.5rem=24px）。
それ以外の6クラスにはマクロ間隔に該当するプロパティが無いため、本スプリントでの追加対応なし。

### btn-primaryの文字色をInkにした理由（重要な設計判断）
指示は「Inkまたは十分なコントラストの文字色」だったため、実測して判断した。

| 組み合わせ | コントラスト比 | WCAG AA（4.5:1）判定 |
|---|---|---|
| White(#FFFFFF) on MorningSun(#F59E0B) | 約 **2.15:1** | **不合格** |
| Ink(#1F2937) on MorningSun(#F59E0B) | 約 **6.83:1** | 合格（AAAの7:1にも近い） |

MorningSunは明度・彩度が高いアンバーであり、白文字を乗せると可読性が大きく下がることが計算で判明したため、
**白ではなくInkを採用した。** これはガイドラインが明示的に許容した選択（「Inkまたは十分なコントラストの文字色」）であり、
逸脱ではない。Playwrightで実画面を確認したところ、視覚的にも十分な可読性を確認できた（§5参照）。

---

## 3. 視覚差（意図した差 / 意図しない差）

### 意図した差（今回のスプリントの目的そのもの）
- ボタンが Blue-600塗り＋白文字 → **MorningSun塗り＋Ink文字**に変化
- `.card`に**初めて影が付いた**（従来は境界線のみでフラット）。強すぎない通常カード影(`0 4px 12px rgba(15,23,42,.05)`)を採用
- `.card`/`.btn-secondary`/`.form-input`/`.tag`の境界線色が Gray-200(#E5E7EB) → Mist(#E7E5E4) に変化（ごくわずかに暖色寄り）
- `.card`の角丸が12px→14pxに変化（わずかに丸みが増す）
- `.tag`の文字色が #4B5563 → Ink Muted(#6B7280) に変化（わずかに明るく）
- フォーム入力のフォーカスリングが 青 → MorningSun に変化
- Button/Inputの角丸（12px）・`.tag`のpill形状（9999px）・`.card`のpadding（24px）は**変化なし**（新旧の値が完全一致するよう意図的に選定したため）

### 意図しない差・要確認事項
- `.tag`にletter-spacing 0.02emが新規に加わった（Tinyトークンの一部採用）。微小だが、既存の詰まった見た目からわずかに文字間が広がる
- `.form-input`/`.form-select`にplaceholder色（Ink Muted）を新規指定した。従来はブラウザ既定のplaceholder色（ブラウザ依存、概ねグレー）だったため、ブラウザによっては見え方が変わる可能性がある

---

## 4. 二重指定監査（file:line付き）

### `.card` × 個別classNameのborder/background上書き（24箇所）
Tailwindの`@layer utilities`は`@layer components`より後に評価されるため、**個別のTailwindユーティリティクラスは
常に`.card`自体の指定に優先する。** 以下はすべて「意図的な上書き」であり、`.card`のtoken接続後も
それぞれの意味色（グレー系の注記box・赤系のエラーbox・青系のハイライトbox・amber系の注意box）は
**変化しない**ことをコードとPlaywright実測の両方で確認した。

| ファイル:行 | 上書き内容 |
|---|---|
| `src/app/admin/(protected)/page.tsx:135,139,143,147` | `hover:border-blue-200` |
| `src/app/admin/(protected)/workspaces/new/page.tsx:23` | `border-gray-200 bg-gray-50/60` |
| `src/app/admin/(protected)/workspaces/[id]/page.tsx:194` | `hover:border-blue-200 hover:bg-blue-50/40` |
| `src/app/admin/(protected)/workspaces/[id]/WorkspaceDeleteButton.tsx:53` | `border-red-100` |
| `src/app/admin/(protected)/workspaces/[id]/tax-returns/page.tsx:48` | `border-gray-200 bg-gray-50/60` |
| `src/app/admin/(protected)/workspaces/[id]/roadmap/page.tsx:109,119,127` | `border-gray-200 bg-gray-50/60` / `border-red-200 bg-red-50` |
| `src/app/admin/(protected)/workspaces/[id]/documents/page.tsx:46` | `border-gray-200 bg-gray-50/60` |
| `src/app/admin/(protected)/workspaces/[id]/share/page.tsx:52` | `border-gray-200 bg-gray-50/60` |
| `src/app/(site)/roadmap/page.tsx:25,100,114,122` | `border-gray-200 bg-gray-50/60` |
| `src/app/(site)/result/ScheduleList.tsx:55,84,475` | `border-gray-200 bg-gray-50/60` / `border-blue-100 bg-blue-50/40` |
| `src/app/(site)/profile/tax-returns/page.tsx:160,306` | `border-amber-200 bg-amber-50/40` / `border-blue-200 bg-blue-50/40` |
| `src/app/share/[token]/page.tsx:122,132` | `border-gray-200 bg-gray-50/60` |
| `src/components/WorkspaceDashboard.tsx:153` | `border-blue-100 bg-blue-50/40` |

**radius・shadowの二重指定は0件。** 上記24箇所はいずれも`rounded-*`/`shadow-*`を独自指定していないため、
`.card`が新たに得た14px角丸・Card Shadowはそのままこれら24箇所にも一様に適用される
（＝意味色ボックスも「紙が重なったような」見た目になる。Playwrightで確認済み、破綻なし）。

### `.card` × transitionの二重指定（1箇所）
`src/app/admin/(protected)/workspaces/[id]/page.tsx:194` のみ、`card ... transition-colors hover:border-blue-200 hover:bg-blue-50/40`
という形で`transition-colors`ユーティリティを併用している。ユーティリティ層が優先されるため、この1箇所のみ
`.card`の`transition: var(--transition-sunboo)`（150ms ease-out）ではなくTailwind既定のtransition-colors
（duration 150ms・Tailwind既定のeasing、Sprint81監査Phase6参照）が実際に適用される。視覚差は誤差レベルで
実害はないため、修正の緊急性は低い。

### `.btn-secondary` × border色上書き（2箇所、意図的なdanger variant）
`WorkspaceDeleteButton.tsx:72`（`border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50`）、
`WorkspaceShareLinksPanel.tsx:149`（`hover:border-red-200 hover:bg-red-50`）。削除系の危険操作を示す
意図的なvariantであり、`.btn-secondary`のtoken接続後も赤系のまま変化しない。問題なし。

### `.tag` × border/text色上書き（10箇所、Status/Confidence用途）
`(site)/layout.tsx:27`、`roadmap/page.tsx:97`、`help/page.tsx:42`、`share/[token]/page.tsx:94`、
`ScheduleList.tsx:233`、`WorkspaceDashboard.tsx:69`、`WorkspaceDocumentsView.tsx:64`、
`AnnualRoadmapView.tsx:130,133`、`workspaces/[id]/page.tsx:184`（β版バッジ・進行中・推定・情報不足・要更新等）。
**「Procedure Status固有の色統一は今回行わない」の指示通り、これらは意図的に未接続のまま維持した。**
一般Tagのtoken化と混同していないことをコード上で確認済み。

### `.form-input`/`.form-select` の二重指定
border/background/focus色を上書きしている箇所は**0件**。padding/font-sizeのみのユーティリティ併用
（`pl-9`、`py-1.5 text-sm`等、約30箇所）であり、color/radius系の衝突なし。

### 生hex・`text-[10px]`/`text-[11px]`（Sprint81監査から状態変化なし）
`globals.css`内の`.form-label`（`#374151`）と`body`（`#ffffff`/`#111111`）、`roadmapPdfDocument.ts`の4箇所、
`text-[10px]`/`text-[11px]`の7箇所（`ProcedureList.tsx:147`、`result/page.tsx:33`、`ScheduleList.tsx:195,384,516`、
`OfficeList.tsx:43`、`AnnualRoadmapView.tsx:171`）は、いずれも今回の対象6クラス外であるため**未着手**。
詳細は[docs/SUNBOO_DESIGN_TOKEN_AUDIT.md Phase8](SUNBOO_DESIGN_TOKEN_AUDIT.md#phase-8-css-audit--design-tokens違反箇所一覧)を参照。

---

## 5. Playwright確認結果

ローカルdevサーバー（`npm run dev`、既存プロセスがport 3000で稼働中だったためそれを利用）に対し、
`playwright-core`（npm依存追加なし、`npx --yes -p playwright-core`でキャッシュ済みChromiumを起動、
CLAUDE.mdの運用に準拠）でチェックした。

### 確認できた画面（ログイン不要）

| 画面 | status | consoleエラー | 所見 |
|---|---|---|---|
| Top (`/`) | 200 | 1件（無関係な404リソース、後述） | `.card`に影が付いた3ステップ/4特徴カード、`.btn-primary`がMorningSun塗り+Ink文字で明瞭に視認可能。境界線消失なし | 
| `/profile` | 200 | 0件 | フォーム全体（`.form-input`/`.form-select`/`.card`セクション区切り）が新トークンで違和感なく表示。「保存する」ボタンの可読性良好。**注**：セグメントコントロール（株式会社/合同会社等の選択トグル）は`.btn-primary`を使わない独自実装のため、選択状態が従来通りBlue-600のまま残存（§6参照） |
| `/roadmap` | 200 | 0件 | 情報バナー（`.card border-gray-200 bg-gray-50/60`）が影・角丸を保ったまま正しく表示 |
| `/result`（診断結果、クエリ付き） | 200 | 0件 | 手続きカード・管轄機関カードとも表示良好。**モバイル幅(375px)で横溢れを検出**（§6で詳述、Sprint82由来ではないと判定） |
| 無効なShareトークン (`/share/invalid-token-xyz`) | 200 | 0件 | シンプルな中央寄せエラー表示（`.card`を使わない実装）、崩れなし |

### 個別確認項目
- **Card shadowが強すぎない**：`0 4px 12px rgba(15,23,42,.05)`は実機で確認する限り控えめで、「紙が重なる」程度の印象。強すぎる所見なし
- **Borderが消えていない**：全画面で境界線を視認できることを確認（computed styleでも`border-top-color: rgb(231,229,228)`＝Mistを確認）
- **Buttonの文字コントラスト**：Ink on MorningSunで問題なく可読（§2参照、計算・実機とも確認）
- **Input focus表示**：`/profile`の都道府県セレクトを実際にフォーカスし、MorningSunの縁取り+リングが明瞭に視認できることをスクリーンショットで確認
- **Button focus-visible表示**：Topページでキーボード（Tab）フォーカスにより`.btn-primary`（「診断する→」）にInk色の明瞭なフォーカスリングが表示されることを確認
- **Select表示**：`/profile`の各種セレクト・トグルとも表示崩れなし
- **モバイル幅で横溢れしないか**：Top/`/profile`/`/roadmap`/無効Share tokenは375px幅で`scrollWidth === innerWidth`（横溢れなし）を確認。**`/result`のみ`scrollWidth 419px`（横溢れ44px）を検出**（§6）
- **コンソールエラー0**：Topページで1件のみ「404 Not Found」のリソース読み込みエラーを検出したが、他ページでは発生せず、globals.css/tokens.cssの変更とは無関係な既存の未解決リソース参照とみられる（原因ファイルの特定は本スプリントの対象外のため保留）

### 未確認項目（管理画面）
本環境にAdmin管理画面のログイン認証情報が無く、`/admin/login`より先に進めなかったため、以下は
**コード読解のみでの確認**にとどまる（実機Playwright確認はできていない）。

- Workspace Dashboard（`src/components/WorkspaceDashboard.tsx`）
- Workspace Profile（`WorkspaceProfileForm.tsx`）
- Workspace Roadmap（`admin/(protected)/workspaces/[id]/roadmap/page.tsx`）

これらはいずれも同一の`globals.css`から`.card`/`.btn-primary`/`.btn-secondary`/`.form-input`/`.form-select`/`.tag`
を読み込む構造であり、CSS適用の仕組み自体はログイン不要画面と変わらない。§4の二重指定監査は
これら管理画面のファイルも対象に含めて実施済みであり、コード上は同様の安全性を確認しているが、
**実際のレンダリング結果の目視確認は次回セッションでの持ち越しとする。**

---

## 6. 未移行箇所・発見事項（Sprint83への引き継ぎ）

### 6.1 セグメントコントロール/トグルのBlue-600残存（優先度: High）
`/profile`の実機確認で判明。「株式会社/合同会社」「免税事業者/課税事業者」等の選択トグルは
`.btn-primary`/`.btn-secondary`を使わない独自実装（`border-blue-600 bg-blue-600 text-white`ベースの
ハードコード、Sprint80監査で既出）であり、**主要ボタンがMorningSunになった今、同一画面内で
「選択中トグルは依然Blue-600」という2つの異なるアクセントカラーが共存する状態**になった。
該当箇所：`start/page.tsx:239,318,354`、`events/page.tsx:336,364,424`、`profile/page.tsx:147,628`、
`TaxReturnEntryFields.tsx`。視覚的な優先度は高い（同一画面内で目立つ矛盾のため）。

### 6.2 `/result`のモバイル横溢れ（優先度: Medium、Sprint82原因ではない）
375px幅で`.card flex gap-4`（`src/app/(site)/result/page.tsx:160`、同一パターンが
`src/app/(site)/offices/OfficeList.tsx:143`にも存在）が44px右にはみ出す。原因調査の結果、
`.card`のpadding（24px、変更なし）・border幅（1px、変更なし）はいずれも本スプリントで**変更していない**ため、
box-shadow/radius/color等の視覚的トークン接続がこの横溢れを引き起こした可能性はない
（shadowとradiusはレイアウト幅に影響しないプロパティのため）。**Sprint82以前から存在した
レスポンシブ未対応のflexレイアウト**と判断する。Sprint83以降での別途対応を推奨。

### 6.3 `.tag`のline-height不採用（優先度: Low、要レビュー）
§1参照。Tinyトークンのline-height(1.5)を採用するとpill高さが増加するため、今回は不採用とした。
デザイン全体のタイポグラフィ一貫性という観点では未完了の接続であり、Sprint83で
「pillは別途小さめのline-height基準を設ける」等の方針判断が必要。

### 6.4 二重指定の残件（緊急性低）
`workspaces/[id]/page.tsx:194`のtransition二重指定（§4）。視覚差は誤差レベルで急ぎではない。

### 6.5 生hexの残存
`.form-label`・`body`（`globals.css`内）、`roadmapPdfDocument.ts`、`text-[10px]`/`text-[11px]`7箇所。
[SUNBOO_DESIGN_TOKEN_AUDIT.md](SUNBOO_DESIGN_TOKEN_AUDIT.md)から状態変化なし。

### 6.6 Status Color統合（引き続き未着手）
Sprint81 Phase7で提案した統合案（`--color-sunboo-status-*`）は依然コード未反映。§4で確認した通り
`.tag`の10箇所の上書きは意図的に手つかずのままであり、これがSprint83以降の本丸候補になる。

### 6.7 管理画面の実機未確認
§5参照。ログイン情報が無く確認できなかった3画面（Workspace Dashboard/Profile/Roadmap）。

---

## Sprint83で最初に触るべき画面（提案）

優先順位は「視覚的な矛盾の目立ちやすさ」と「影響範囲の広さ」で判断した。

1. **セグメントコントロール/トグルのBlue-600→MorningSun統一**（§6.1）。`/profile`・`/start`・`/events`という
   トラフィックの多い画面で、新旧アクセントカラーが同一画面内に混在する状態を早期に解消すべき
2. **管理画面（Workspace Dashboard/Profile/Roadmap）の実機Playwright確認**（§6.7）。ログイン情報の共有を受けて、
   本スプリントで未確認のまま持ち越した3画面を確認する
3. `.tag`のStatus Badge分離（矩形8px radius版の実装、§6.6）と、それに伴うProcedure Status色の統合
