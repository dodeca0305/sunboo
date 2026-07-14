# SUNBOO_DESIGN_TOKEN_AUDIT.md — Design Tokens Foundation 監査記録（Sprint81）

> **ステータス：ドラフト（Sprint81「Design Tokens Foundation」成果物）**
> 本スプリントは Design Tokens の**追加**のみを行った。Engine・Procedure・DB・migration・packageの変更、
> 既存UIの見た目・レイアウト・ブランドの変更は一切行っていない。レビュー待ちで停止する。

対象トークンの正式仕様は [SUNBOO_DESIGN_GUIDELINES.md](SUNBOO_DESIGN_GUIDELINES.md)（Sprint80）。
本書はその仕様をコード上のトークン（`src/styles/tokens.css`）として実装するにあたり、
**現状の実装がその正式値からどれだけ離れているか**を数量的に監査した記録である。

置換（既存クラスの実際の書き換え）は本スプリントの対象外。Phase1〜7はすべて「現状調査＋トークン追加」、
置換自体はSprint82以降に段階実行する（[docs/SUNBOO_DESIGN_GUIDELINES.md §17](SUNBOO_DESIGN_GUIDELINES.md#17-実装計画)の
Phase 1〜6とは別軸のスプリート番号である点に注意。本書内の「Phase」はSprint81の指示書における
Phase1〜8を指す）。

---

## Phase 1: Color Tokens

### 正式トークン（`src/styles/tokens.css` に追加済み）

| トークン名 | CSS変数 | 値 |
|---|---|---|
| WarmPaper | `--color-sunboo-warm-paper` | `#FAF9F6` |
| Surface | `--color-sunboo-surface` | `#FFFFFF` |
| Ink | `--color-sunboo-ink` | `#1F2937` |
| Muted Text※ | `--color-sunboo-ink-muted` | `#6B7280` |
| MorningSun | `--color-sunboo-morning-sun` | `#F59E0B` |
| Moss | `--color-sunboo-moss` | `#6E8B74` |
| Mist | `--color-sunboo-mist` | `#E7E5E4` |
| Danger | `--color-sunboo-danger` | `#DC2626` |

※ Sprint81指示文の「正式名称」列挙には含まれていないが、`SUNBOO_DESIGN_GUIDELINES.md §4`本文で
Muted Text（`#6B7280`）が正式トークンとして定義済みのため、8番目のトークンとして追加した。
指示書の列挙漏れと判断したが、不要と判断される場合は次スプリントで削除できる（未使用のため削除コストはゼロ）。

### 既存の近似色の調査

`src/app/globals.css` と `src/lib/roadmapPdfDocument.ts` に出現する全hexリテラルを実地に確認した。

| 現状のhex | 出現回数・箇所 | 対応する新トークン | 差分 |
|---|---|---|---|
| `#2563EB`（Blue-600） | `globals.css:4,29,119`、`roadmapPdfDocument.ts:78` | なし（MorningSunで代替すべき用途と、廃止すべき装飾用途が混在） | 用途ごとに置き換え方針が異なるため単純な色置換不可（[Phase7](#phase-7-status-colors)参照） |
| `#1D4ED8`（Blue-700） | `globals.css:5,38` | なし | 同上（hover色） |
| `#EFF6FF`（Blue-50） | `globals.css:6` | なし | 選択状態の淡色背景。MorningSunの淡色亜種が必要だが本スプリントでは未定義（[Phase7](#phase-7-status-colors)で扱う） |
| `#ffffff` | `globals.css:17,33,58,76,86,108` | **Surface** `#FFFFFF` | 完全一致（既にSurfaceとして扱ってよい値） |
| `#111111`（body既定文字色） | `globals.css:18,62,111` | **Ink** `#1F2937` に近似だが非一致 | Inkへの置換で文字色がわずかに変化する（純黒に近い#111111→やや青みがかったグレー#1F2937） |
| `#E5E7EB`（Gray-200） | `globals.css:57,78,85,107` | **Mist** `#E7E5E4` に近似だが非一致 | 境界線色。青みグレー→暖色グレーへの変化 |
| `#F9FAFB`（Gray-50） | `globals.css:67` | 未定義（WarmPaperの派生候補） | hover背景。WarmPaper系の淡色が必要（次スプリント検討） |
| `#D1D5DB`（Gray-300） | `globals.css:68` | 未定義（Mistの濃色亜種候補） | hover時境界線 |
| `#4B5563`（Gray-600） | `globals.css:90` | **Ink Muted** `#6B7280` に近似 | `.tag`文字色 |
| `#374151`（Gray-700） | `globals.css:98` | Ink寄りだが非一致 | `.form-label`文字色 |
| `#111827`（PDF独自near-black） | `roadmapPdfDocument.ts:76` | **Ink** `#1F2937` に近似だが非一致 | Web側とPDF側で近黒色が別々に定義されている（Sprint80監査§1で既出） |
| `#6B7280` | `roadmapPdfDocument.ts:77` | **Muted Text** `#6B7280` | **完全一致** |
| `#D1D5DB` | `roadmapPdfDocument.ts:79` | 未定義 | 上記と同じ |

### 差分・影響範囲・優先度

| 項目 | 優先度 |
|---|---|
| Blue-600/700/50 系（アクセント）→ MorningSun系への置換方針決定 | **High**（用途分解が必要。単純な find & replace 不可） |
| `#111111`/`#E5E7EB` 等の近似グレー → Ink/Mist への統一 | Medium（視覚差はわずかだが全画面に影響） |
| `#F9FAFB`/`#D1D5DB` の淡色・濃色亜種トークンが未定義 | Medium（Phase1のトークン追加のみでは不足。次スプリントで補完が必要） |
| PDFの`#111827`/`#2563EB`をWeb側トークンと統一 | Low（Sprint80監査で既出、`roadmapPdfDocument.ts`側は文字表記が主でシステム上の実害は小さい） |

---

## Phase 2: Typography Tokens

### 正式トークン（`src/styles/tokens.css` に追加済み）

Tailwind v4の `--text-*` に `--line-height` / `--font-weight` / `--letter-spacing` をペア指定し、
1ロール1ユーティリティ（例：`text-sunboo-page-title`）で完結するよう実装した。

| ロール | font-size | line-height | font-weight | letter-spacing |
|---|---|---|---|---|
| Hero | 48px (3rem) | 1.15 | 700 | -0.01em |
| PageTitle | 36px (2.25rem) | 1.25 | 700 | -0.01em |
| SectionTitle | 28px (1.75rem) | 1.3 | 700 | -0.005em |
| CardTitle | 22px (1.375rem) | 1.4 | 600 | 0 |
| Body | 16px (1rem) | 1.7 | 400 | 0 |
| Caption | 14px (0.875rem) | 1.6 | 400 | 0 |
| Tiny | 12px (0.75rem) | 1.5 | 400 | 0.01em |

line-height・font-weight・letter-spacingの数値は `SUNBOO_DESIGN_GUIDELINES.md §5` に明記が無いため、
本スプリントで暫定値として提案したもの（**要レビュー**）。既存コードの行間実装（`leading-relaxed`＝1.625、
`leading-tight`＝1.25 のみが使用されており全体的に疎）を踏まえ、本文は1.7、見出し系は1.15〜1.4の範囲に設定した。

### 画面ごとの現状サイズの一覧化

Tailwindの `text-*` ユーティリティ使用数（`src/` 全体、`.tsx`/`.ts`）：

| クラス | 実寸 | 使用回数 | 主な用途 |
|---|---|---|---|
| `text-xs` | 12px | 233 | キャプション・メタ情報・バッジ文字 |
| `text-sm` | 14px | 196 | 本文の大半・ラベル |
| `text-base` | 16px | 10 | 本文（一部） |
| `text-lg` | 18px | 9 | セクション見出しの一部 |
| `text-xl` | 20px | 25 | ページ見出しの一部、カード見出しの一部 |
| `text-2xl` | 24px | 11 | ページ見出しの大半（site） |
| `text-3xl` | 30px | 1 | マーケティングヒーロー（`page.tsx`） |
| `text-4xl` | 36px | 1 | 同上（`page.tsx:44`） |
| `text-5xl` | 48px | 1 | 同上（`page.tsx:44`、`md:`時） |
| `text-[10px]` / `text-[11px]` | 10px/11px | 7 | 「（未確認）」等の極小注記（Tinyの下限12pxを下回る） |

### 差分

| 観点 | 所見 | 優先度 |
|---|---|---|
| **Body(16px)の実態** | 見出しにサイズ指定なしで既定16pxを継承しているケースを除くと、実質的な本文の主力は`text-sm`（14px＝Caption相当）であり、`text-base`（16px＝Body）は10件のみ。**現状の「本文」はガイドラインのBodyより1段階小さいCaption相当のサイズで運用されている** | **High** |
| Body と Caption の視覚的未分離 | 上記の結果、本文（Body）と補助文（Caption）が同じ`text-sm`で書かれており、書体上の階層が実質1段階（xs/sm)しかない | **High** |
| PageTitle(36px)の不在 | site全体でPageTitle相当のページ見出しは存在せず、大半は`text-2xl`(24px)。36pxはマーケティングヒーロー内の`text-4xl`（1箇所）のみで、それも他要素と併用の複合表現 | Medium |
| SectionTitle(28px)の不在 | Tailwind既定スケールに28px相当のクラスが無く、コード内にも28px使用箇所は0件。新規追加した`text-sunboo-section-title`が唯一の28px供給源になる | Medium |
| CardTitle(22px)の不在 | 同上。現状は`font-semibold`のみでサイズ指定なし（既定16px）のカード見出しが大半 | Medium |
| Tiny(12px)未満の極小テキスト | `text-[10px]`/`text-[11px]`が7箇所に存在し、ガイドラインの最小刻み（Tiny=12px）を下回る | Low |
| line-height/letter-spacing未指定 | `leading-*`は44+1件（`leading-relaxed`/`leading-tight`のみ）、`tracking-*`は9+5件（`tracking-tight`/`tracking-widest`のみ）で、大半の見出し・本文は行間・字間の明示的指定がない（ブラウザ既定に依存） | Low〜Medium |

---

## Phase 3: Spacing Tokens

### スコープの判断（要レビュー）

Sprint81指示は「8px（8/16/24/32/48/64）のみ使用する方針へ」だが、実コードを計測した結果、
アイコン⇄テキスト間の間隔・チェックボックスサイズ等の**マイクロ間隔**（2px/4px/6px/10px/12px/20px等）が
数百箇所に及んで使われており、これらを厳密に6値グリッドへ強制すると、UIの細かな整列（インラインアイコン、
チップ内パディング等）を破壊しかねない。

**本書ではSprint80ガイドライン§6の推奨用途（ページ左右余白／セクション間／カード内／情報ブロック間）に
対応する「マクロ間隔」のみを8pxグリッド監査の対象とし、微細な整列間隔（マイクロ間隔）は対象外とする。**
この切り分けの妥当性は[最終報告のオープン項目](#オープン論点)として確認を仰ぐ。

### マクロ間隔の現状（file:line付き）

| 用途 | ガイドライン推奨 | 現状の値と使用箇所 | 8pxグリッド適合 |
|---|---|---|---|
| ページ左右余白 | 32〜64px | `px-4`（16px）が大半（`procedures/page.tsx:59`、`start/page.tsx:127`、`offices/page.tsx:68`、`profile/page.tsx:301`、`roadmap/page.tsx:93`、`search/page.tsx:98`、`result/page.tsx:66,107`、`help/page.tsx:40`、`events/page.tsx:186,201,266,390`、`layout.tsx:19,96` 他多数）、`sm:px-6`（24px）併用が一部 | ×（16pxは推奨レンジ32〜64pxを下回る。grid値としては合致するが用途基準に非適合） |
| セクション間 | 48px | 明示的な「セクション間」トークンは無く、`space-y-*`が各画面で個別設定（後述） | 部分的 |
| カード内パディング | 24〜32px | `.card { padding: 1.5rem }`＝24px（`globals.css:77`） | ✅ 完全適合（レンジ下限と一致） |
| ページ縦padding | （ガイドライン未規定、SUNBOO_DESIGN_GUIDELINES §6準拠なら概ねセクション間48pxに近い値が妥当） | `py-10`(40px)／`py-12`(48px)／`py-16`(64px)／`py-20`(80px) の4種が混在（`py-10`: `offices/page.tsx:68`,`procedures/page.tsx:59`,`result/page.tsx:107`,`roadmap/page.tsx:93`,`search/page.tsx:98`,`layout.tsx:96`／`py-12`: `start/page.tsx:127`,`profile/page.tsx:301`,`events/page.tsx:266,390`／`py-16`: `help/page.tsx:40`,`result/page.tsx:66`,`events/page.tsx:186`／`py-20`: `page.tsx:81,101,123`） | 混在（48px/64pxはグリッド適合、40px/80pxは非適合） |

### 差分・優先度

| 項目 | 優先度 |
|---|---|
| ページ左右余白が現状16px（推奨32〜64pxの半分以下） | **High**（紙面のような余白感というブランド意図に直接影響） |
| ページ縦paddingが40/48/64/80pxの4パターンに分散 | Medium（Sprint80監査§4で既出。今回grid適合可否を追加で明確化） |
| カード内パディングは既に適合 | 変更不要 |
| マイクロ間隔（gap-1.5等）のグリッド適用要否が未確定 | Low（要オープン論点での確認） |

---

## Phase 4: Radius

### 正式トークン（`src/styles/tokens.css` に追加済み）

| 用途 | 値 | CSS変数 |
|---|---|---|
| Card | 14px (0.875rem) | `--radius-sunboo-card` |
| Button/Input | 12px (0.75rem)※レンジ10〜12pxの上限を採用 | `--radius-sunboo-control` |
| Badge（矩形） | 8px (0.5rem) | `--radius-sunboo-badge` |

### 既存との差分

| 要素 | 現状 | 新トークン | 差分 |
|---|---|---|---|
| `.card`（`globals.css:75`） | `border-radius: 0.75rem`＝12px | 14px | **+2px**（置換時に視覚変化あり） |
| `.btn-primary`/`.btn-secondary`（同`:28,56`） | `border-radius: 0.75rem`＝12px | 12px（Control） | **差分なし**（レンジ上限と完全一致、置換しても見た目は変わらない） |
| `.form-input`/`.form-select`（同`:106`） | `border-radius: 0.75rem`＝12px | 12px（Control） | **差分なし** |
| `.tag`（同`:84`） | `rounded-full`（pill） | Badgeは「pillまたは8px」と定義されており、pillは適合 | **差分なし**（現状のまま適合） |
| その他 `rounded-lg`（46箇所）/`rounded-xl`（46箇所）/`rounded-full`（18箇所）/`rounded-md`（3箇所） | 混在 | — | ナビ・チップ用途で`lg`と`xl`が使い分け基準なく混在（Sprint80監査§4で既出）。新トークンでの吸収要否は要検討 |

### 優先度

| 項目 | 優先度 |
|---|---|
| Card角丸 12px→14px | Low（視覚差2pxは軽微だが「代表コンポーネント」であるRoadmap Card等に影響するため実装時は確認が必要） |
| Button/Input角丸 | 変更不要（既に適合） |
| Badge（pill）角丸 | 変更不要（既に適合） |
| `rounded-lg`/`rounded-xl`の使い分け基準の欠如 | Medium（トークン統一とは別軸の課題として次スプリントに引き継ぐ） |

---

## Phase 5: Shadow

### 現状調査

`box-shadow`／Tailwindの`shadow-*`ユーティリティの使用箇所を全文検索した結果：

```
src/app/globals.css:113  transition: border-color 0.15s ease, box-shadow 0.15s ease;
src/app/globals.css:120  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);  ← .form-input/.form-select のフォーカスリングのみ
```

**それ以外、`.card`を含むアプリ全体のどこにも「面の重なりを表現する」box-shadowは一切存在しない。**
`shadow-sm`/`shadow-md`/`shadow-lg`等のTailwindユーティリティクラスの使用も0件。カードの立体感は
現状すべて`border: 1px solid #E5E7EB`の境界線のみで表現されている。

複数パターンの重複という状態ではなく、**「パターンが存在しない（0パターン）」**というのが実態であり、
Sprint80監査で確認済みの内容と一致する。

### 正式トークン（`src/styles/tokens.css` に追加済み）

| 用途 | 値 |
|---|---|
| 通常カード | `--shadow-sunboo-card: 0 4px 12px rgba(15, 23, 42, 0.05)` |
| 重要カード | `--shadow-sunboo-card-important: 0 6px 20px rgba(15, 23, 42, 0.06)` |
| モーダル | `--shadow-sunboo-modal: 0 2px 8px rgba(15, 23, 42, 0.08)`（「必要最小限」の具体値がガイドラインに未記載のため暫定値。**要レビュー**） |

### 優先度

| 項目 | 優先度 |
|---|---|
| `.card`への影付与（0→通常カード影） | Medium（「紙の重なり」表現の中核。ただし影を持たないフラットデザインから影付きへの変化は全画面に及ぶため、単独の置換フェーズで慎重に検証すべき） |
| どのカードを「重要カード」とするかの選定基準が未定義 | Medium（次スプリントの設計判断事項） |
| モーダルの影の具体値が未確定 | Low |

---

## Phase 6: Transition

### 現状調査

```
src/app/globals.css:35   transition: background-color 0.15s ease, transform 0.15s ease;      (.btn-primary)
src/app/globals.css:64   transition: background-color 0.15s ease, border-color 0.15s ease;    (.btn-secondary)
src/app/globals.css:113  transition: border-color 0.15s ease, box-shadow 0.15s ease;          (.form-input/.form-select)
```

コンポーネント側では `transition-colors`/`transition-all`/`transition-transform` が約45箇所で使用されているが、
`duration-*`/`ease-*`のTailwindユーティリティ指定は**0件**——つまりTailwindの既定値（duration: 150ms、
timing-function: Tailwind既定の`cubic-bezier(0.4, 0, 0.2, 1)`）に依存している。

### 差分

| 項目 | ガイドライン | 現状 | 差分 |
|---|---|---|---|
| duration | 150ms | `globals.css`の3クラスは`0.15s`＝150msで**既に一致**。Tailwindユーティリティ側も既定値が150msのため**実質的に一致** | 差分なし（実測値としては既に150ms） |
| easing | ease-out | `globals.css`の3クラスは`ease`（`cubic-bezier(0.25, 0.1, 0.25, 1)`相当）。Tailwindユーティリティ側は既定`cubic-bezier(0.4, 0, 0.2, 1)`。いずれも`ease-out`（`cubic-bezier(0, 0, 0.2, 1)`）とは異なる曲線 | **差分あり**（duration一致・easing不一致という組み合わせ） |

Tailwind v4には`duration-150`・`ease-out`ユーティリティが標準搭載されているため、**新規トークンの追加なしで
標準化が可能**である（`className="transition-colors duration-150 ease-out"`のように既存ユーティリティを
組み合わせるだけでよい）。`tokens.css`には、`globals.css`側の素のCSS transition記述を将来書き換える際に
参照できるよう `--ease-sunboo-out`（Tailwind標準の`ease-out`と同一のcubic-bezier）を補助的に追加した。

### 優先度

| 項目 | 優先度 |
|---|---|
| `globals.css`内3箇所の`ease`→`ease-out`への統一 | Low（視覚差は非常に微小） |
| コンポーネント側`transition-colors`等への`duration-150 ease-out`の明示的併記 | Low（現状も実質的にduration 150msで動作しているため、明示は一貫性のためのドキュメンテーション目的が主） |

---

## Phase 7: Status Colors

**Sprint81の指示に従い、本Phaseはコード上のトークン追加を行わず、差分の整理のみを行う。**

`Procedure Status` / `Roadmap` / `Dashboard` / `Notification` / `Share` にまたがる状態色の使用箇所は、
Sprint80「SUNBOO Design Guidelines」策定時の画面監査（[SUNBOO_DESIGN_GUIDELINES.md §16-9](SUNBOO_DESIGN_GUIDELINES.md#9-procedure-status)）
で詳細に調査済みであり、結論は変わっていない。要点を再掲する。

| 箇所 | 表現 |
|---|---|
| `AnnualRoadmapView.tsx:146-148`（Roadmap、読み取り時） | 無色の`.tag`（状態による色分けなし） |
| `WorkspaceDashboard.tsx:83-87,92`（Dashboard／Notification） | 赤(`border-red-200 text-red-700`)/amber(`border-amber-200 text-amber-700`)/無色の3値、優先度と重要度の両方に流用 |
| `ScheduleList.tsx:160-180,232-233`（`(site)/result`の一般ツール） | 塗りつぶしBlue-600＋白チェックの丸ボタン、進行中は`border-blue-200 text-blue-600` |
| `ProceduresTable.tsx:100-108`（Admin手続きカタログ`is_active`） | 塗りつぶしpill、Blue-50/Blue-700 と Gray-100/Gray-500 |
| `WorkspaceDocumentsView.tsx:16-20,64`（Documents） | Amberが「要更新」の1状態にのみ付与、他2状態は無色 |
| `share/[token]/page.tsx`（Share） | Roadmap側のAnnualRoadmapViewをそのまま継承（無色の`.tag`） |

同一の「状態」概念に対し最低5通りの視覚表現が並存し、4値ステータス型（`not_started`/`in_progress`/`done`/`on_hold`）
はどの実際のレンダリング箇所でも一貫した色を持たない、という状況に変化はない。

### 統合案（コード未反映・提案のみ）

将来的な統合トークン名の候補として、以下を提案する（**本スプリントでは`tokens.css`に追加しない**）。

| 候補トークン名 | 想定する色 | 対応する状態 |
|---|---|---|
| `--color-sunboo-status-todo` | Ink Muted | 未着手 |
| `--color-sunboo-status-in-progress` | MorningSun | 進行中 |
| `--color-sunboo-status-done` | Moss | 完了 |
| `--color-sunboo-status-overdue` | Danger | 期限超過 |
| `--color-sunboo-status-on-hold` | Mist（濃色亜種） | 保留 |

これらは次スプリント（状態色の実置換フェーズ）で正式決定・追加する。

### 優先度

| 項目 | 優先度 |
|---|---|
| 状態色の一貫性欠如そのもの | **High**（[SUNBOO_DESIGN_GUIDELINES.md §16-9](SUNBOO_DESIGN_GUIDELINES.md#9-procedure-status)で既にHighと判定済み。本スプリントでは着手せず次スプリントへ持ち越し） |

---

## Phase 8: CSS Audit — Design Tokens違反箇所一覧

Design Tokens（新トークン）が存在する前提で、それに違反する（＝生の値を直接記述している）箇所を
file:line付きで一覧化する。**現時点では新トークンへの置換は行っていないため、以下はすべて「今後の
置換候補」であり、違反そのものを本スプリントで修正してはいない。**

### 8.1 生のhexカラー

| ファイル:行 | 値 |
|---|---|
| `src/app/globals.css:4,29,119` | `#2563EB` |
| `src/app/globals.css:5,38` | `#1D4ED8` |
| `src/app/globals.css:6` | `#EFF6FF` |
| `src/app/globals.css:17,33,58,76,86,108` | `#ffffff` |
| `src/app/globals.css:18,62,111` | `#111111` |
| `src/app/globals.css:57,78,85,107` | `#E5E7EB` |
| `src/app/globals.css:67` | `#F9FAFB` |
| `src/app/globals.css:68` | `#D1D5DB` |
| `src/app/globals.css:90` | `#4B5563` |
| `src/app/globals.css:98` | `#374151` |
| `src/lib/roadmapPdfDocument.ts:76-79` | `#111827`,`#6B7280`,`#2563EB`,`#D1D5DB` |

### 8.2 任意値のフォントサイズ（Tinyの12px下限を下回る）

| ファイル:行 |
|---|
| `src/app/(site)/procedures/ProcedureList.tsx:147` `text-[10px]` |
| `src/app/(site)/result/page.tsx:33` `text-[10px]` |
| `src/app/(site)/result/ScheduleList.tsx:195` `text-[10px]` |
| `src/app/(site)/result/ScheduleList.tsx:384` `text-[11px]` |
| `src/app/(site)/result/ScheduleList.tsx:516` `text-[11px]` |
| `src/app/(site)/offices/OfficeList.tsx:43` `text-[10px]` |
| `src/components/AnnualRoadmapView.tsx:171` `text-[10px]` |

### 8.3 任意値の固定幅（テーブル列、8pxグリッド未対応）

| ファイル:行 | 値 |
|---|---|
| `src/app/admin/(protected)/links/LinksTable.tsx:130` | `w-[760px]` |
| `src/app/admin/(protected)/links/LinksTable.tsx:159` | `w-[220px]` |
| `src/app/admin/(protected)/offices/OfficesTable.tsx:84` | `w-[800px]` |
| `src/app/admin/(protected)/offices/OfficesTable.tsx:109` | `w-[220px]` |
| `src/app/admin/(protected)/organization-types/OrganizationTypesTable.tsx:90` | `w-[760px]` |
| `src/app/admin/(protected)/procedures/ProceduresTable.tsx:79` | `w-[720px]` |
| `src/app/admin/(protected)/rules/RulesTable.tsx:60` | `w-[760px]` |

Admin管理表の横スクロール確保用`min-width`であり、Sprint80監査で既出（テーブルごとに値がバラつき、
共有定数化が推奨されている）。トークン化の優先度は低い（デザイン上の意味を持つ値ではなく、
レイアウト実装上の技術的な閾値のため）。

### 8.4 ページレベル縦paddingのグリッド逸脱

Phase 3の表を参照。`py-10`（40px）・`py-20`（80px）が6値グリッド（8/16/24/32/48/64）に非適合。

### 8.5 Shadow未使用（0パターン）

Phase 5参照。`.card`を含め、アプリ全体でelevation目的のbox-shadowが1件も存在しない。

### 8.6 Radius使い分け基準の欠如

`rounded-lg`（46件）と`rounded-xl`（46件）が用途基準なく混在（Phase4参照、Sprint80監査§4で既出）。

### 優先順位まとめ（Phase8横断）

| 分類 | 優先度 |
|---|---|
| 生のhexカラー（`globals.css`集中） | **High**（Phase1トークンへの一括置換で解消できる範囲が大きい） |
| ページ縦paddingのグリッド逸脱 | Medium |
| Tiny未満の極小フォント | Low |
| テーブル列幅の任意値 | Low |
| Shadow未実装 | Medium |
| Radius使い分け基準なし | Medium |

---

## Sprint81で追加したトークン一覧（`src/styles/tokens.css`）

| カテゴリ | トークン数 | 備考 |
|---|---|---|
| Color | 8 | WarmPaper/Surface/Ink/Ink-Muted/MorningSun/Moss/Mist/Danger |
| Typography | 7ロール × 4属性（font-size/line-height/font-weight/letter-spacing） | `--text-sunboo-*`のペア指定構文で1ロール1ユーティリティに統合 |
| Spacing | 6 | 8/16/24/32/48/64pxの意味的エイリアス（Tailwind既定スケールとの重複を明記） |
| Radius | 3 | Card/Control(Button・Input)/Badge |
| Shadow | 3 | Card/Card-Important/Modal |
| Transition | 2 | `--ease-sunboo-out`、`--transition-sunboo`（duration+easing合成） |
| Status Color | 0（意図的に未追加） | Phase7の指示により提案のみに留める |

**いずれも既存コンポーネントから未参照。** `npm run build`実行時、Tailwind v4のJIT最適化により、
実際に使用されるユーティリティクラスがコード上に存在しない`@theme`内のトークンはコンパイル後CSSから
除外されることを確認した（`.next/static/chunks/*.css`を検証、`sunboo`を含むクラス・変数が
未使用のため出力されないことを確認）。これは意図した挙動であり、Sprint82で実際に`sunboo-*`クラスを
JSXで使用開始した瞬間に、追加設定なしで自動的に出力されるようになる。

---

## 確認結果

```
$ npm run build
✓ Compiled successfully in 2.9s
  Running TypeScript ...
  Finished TypeScript in 1870ms ...
✓ Generating static pages using 9 workers (26/26)
（全26ルート、TypeScriptエラー0）

$ npx tsc --noEmit
（エラー0、exit code 0）
```

両コマンドとも成功。既存UIの表示・挙動に変化がないことは、トークンが未参照であるという実装方針
（コード上の事実）と、上記のビルド成功（構文的破壊がないという事実）の両方から確認できる。
Playwrightでの目視確認は、本スプリントが「見た目を変えない」ことを目的とするため実施していない
（変化がないことを目視で確認する意義が薄いため）。次スプリント以降、実際に置換を行うフェーズでは
CLAUDE.mdのルールに従いPlaywright確認を必須とする。

---

## オープン論点

- **Phase3のスコープ判断**：8pxグリッドの適用対象を「マクロ間隔のみ」とした判断（本書Phase3）の妥当性。
- **Typography実測値**：line-height/font-weight/letter-spacingの暫定値（Phase2表）はガイドライン未記載のため、レビューでの確定が必要。
- **Modalの影の具体値**：`SUNBOO_DESIGN_GUIDELINES.md`の「必要最小限」を`0 2px 8px rgba(15,23,42,.08)`と仮置きした値の妥当性。
- **Ink/#111111・Mist/#E5E7EB の統合方針**：完全一致ではなく近似のため、置換時に既存の黒・グレーとの視覚差をどこまで許容するか。
