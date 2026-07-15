# ACCESSIBILITY_POLISH.md — Accessibility Polish（Sprint87）

> **ステータス：ドラフト（Sprint87「Accessibility Polish」成果物）**
> Engine・Procedure・DB・migration・packageは変更していない。新機能・UI刷新は行っていない。
> `docs/CLOSED_BETA_FINAL_REVIEW.md`（Sprint86）で「開始前に直すべきもの」とした2件（H-3・M-1）のみを
> 対象にした。レビュー待ちで停止する。

---

## 1. 対応内容

### 1-1. `text-gray-400` → Design Token（`text-sunboo-ink-muted`）へ置換

**対象**：Sprint86監査で特定した19ファイルのうち、実際に`text-gray-400`を含んでいた17ファイル。
置換後に実測した結果、置換箇所は**73箇所**だった（Sprint86監査時の速報値「77箇所」は、
検索に使ったglobパターンの重複マッチにより一部ファイルが二重集計されていたための誤差。
本スプリントで`grep -c`により正確な件数を再計測し、この文書では実測値を正とする）。

| ファイル | 置換数 |
|---|---|
| `src/app/(site)/events/page.tsx` | 9 |
| `src/app/(site)/help/page.tsx` | 2 |
| `src/app/(site)/layout.tsx` | 2 |
| `src/app/(site)/offices/OfficeList.tsx` | 3 |
| `src/app/(site)/page.tsx` | 2 |
| `src/app/(site)/procedures/ProcedureList.tsx` | 2 |
| `src/app/(site)/profile/page.tsx` | 9 |
| `src/app/(site)/profile/tax-returns/page.tsx` | 3 |
| `src/app/(site)/result/ScheduleList.tsx` | 10 |
| `src/app/(site)/result/page.tsx` | 4 |
| `src/app/(site)/roadmap/page.tsx` | 3 |
| `src/app/(site)/search/SearchClient.tsx` | 4 |
| `src/app/(site)/start/page.tsx` | 10 |
| `src/components/ProcedureDetailExtra.tsx` | 6 |
| `src/components/TaxReturnEntryFields.tsx` | 2 |
| `src/components/WorkspaceLoadingState.tsx` | 1 |
| `src/components/WorkspaceTaxReturnsView.tsx` | 1 |
| **合計** | **73** |

`text-gray-400`（`#9CA3AF`）と`text-sunboo-ink-muted`（`#6B7280`、`src/styles/tokens.css`で
Sprint82から定義済みの既存Token）はいずれも「補足・キャプション用の控えめなグレー」という
同一の意味的役割で使われていたため、単純な文字列置換（全箇所とも修飾子なしの`text-gray-400`
単体で、`hover:`等の組み合わせは無かったため置換ミスマッチのリスクは無し）で完全に対応できた。

**実測コントラスト比の確認：** Playwrightで実際にブラウザが計算した色を取得し、WCAG相対輝度式で検証した。

| | 色 | 白背景に対する実測コントラスト比 | WCAG AA（4.5:1）判定 |
|---|---|---|---|
| 置換前（`text-gray-400`） | `#9CA3AF` | 約2.54:1（Sprint86算出値） | 不合格 |
| 置換後（`text-sunboo-ink-muted`） | `rgb(107, 114, 128)` = `#6B7280` | **4.83:1**（本スプリントで実機計測） | **合格** |

新しいトークンや新しい色は追加していない（既存のSprint82 Design Tokenをそのまま使い回した）。

### 1-2. `/result`成功時ビューへの`<h1>`追加（見た目変更なし）

`src/app/(site)/result/page.tsx`の成功時ビューには、Sprint86監査の時点で`<h1>`が存在せず、
いきなり`<h2>`（「管轄機関」）から始まっていた。

**対応方法：** 診断結果ビュー最上部に既にあった「診断結果」というラベル（`<p className="mb-2
text-xs font-semibold uppercase tracking-widest text-blue-500">`）を、**className を一切変更せず**
`<p>`から`<h1>`にタグだけを差し替えた。この要素は元々「このページの主題」を示す事実上の
見出し的役割を担っていたため、新しい文言・新しいUI要素を追加することなく、既存の表示内容を
そのまま正しいセマンティクスに昇格させる形で対応した。

修正後の見出し順は `h1「診断結果」→ h2「管轄機関」→ h2「必要手続き」→ h3「今後予定」→
h3（各手続き名）` となり、レベルの飛び番なく自然な階層になっていることをPlaywrightで確認した。

---

## 2. 確認結果

### build / tsc
```
npx tsc --noEmit → エラーなし
npm run build → ✓ Compiled successfully, TypeScriptエラー0, 全26ルート成功
```

### Playwright
| 確認項目 | 結果 |
|---|---|
| `/result`の見出し順 | `H1「診断結果」→H2→H2→H3→H3...` を実機で確認。飛び番なし |
| コントラスト比の実測 | `text-sunboo-ink-muted`が実際に`rgb(107,114,128)`で描画され、白背景に対し4.83:1（AA合格）を確認 |
| 見た目の同一性 | `/result`のスクリーンショット（Desktop）をSprint86時点のものと比較し、レイアウト・配色の
  体感差が無いことを目視確認（キャプション類がわずかに濃くなった程度で、崩れ・ズレは無し） |
| `/result`モバイル(375px) | 横溢れなし（Sprint83の修正が継続して有効） |
| 公開8画面の回帰確認 | `/`・`/start`・`/events`・`/offices`・`/procedures`・`/help`・`/roadmap`・`/search`を
  Desktopで確認し、全て200・コンソールエラー0（Sprint86までに見えていた無関係な404も今回は発生せず） |

### 未確認事項
管理画面（Dashboard/Roadmap/Profile/Documents/Share）はログイン情報が無く、Sprint82以降と同様に
実機確認はできていない。ただし本スプリントの変更（`text-gray-400`置換・`/result`のh1追加）は
いずれも管理画面のファイルに影響しない（対象19ファイルはすべて`(site)/`配下または公開側で
共有されるコンポーネントのみ）ため、管理画面への影響はコード上も無いと判断できる。

---

## 3. 変更ファイル

`src/app/(site)/events/page.tsx`、`src/app/(site)/help/page.tsx`、`src/app/(site)/layout.tsx`、
`src/app/(site)/offices/OfficeList.tsx`、`src/app/(site)/page.tsx`、
`src/app/(site)/procedures/ProcedureList.tsx`、`src/app/(site)/profile/page.tsx`、
`src/app/(site)/profile/tax-returns/page.tsx`、`src/app/(site)/result/ScheduleList.tsx`、
`src/app/(site)/result/page.tsx`（h1追加を含む）、`src/app/(site)/roadmap/page.tsx`、
`src/app/(site)/search/SearchClient.tsx`、`src/app/(site)/start/page.tsx`、
`src/components/ProcedureDetailExtra.tsx`、`src/components/TaxReturnEntryFields.tsx`、
`src/components/WorkspaceLoadingState.tsx`、`src/components/WorkspaceTaxReturnsView.tsx`
（新規ファイルなし、17ファイル変更、+75/-75行）

---

## 4. Closed Beta開始可否の再判定

`docs/CLOSED_BETA_FINAL_REVIEW.md`（Sprint86）で「開始前に直すべきもの」とされた2件は
いずれも解消した。

| Sprint86時点の指摘 | 状態 |
|---|---|
| H-3: `text-gray-400`のコントラスト未達（約2.54:1） | **解消**（4.83:1、AA合格を実測で確認） |
| M-1: `/result`成功時ビューにh1が無い | **解消**（h1追加、見出し階層を実機で確認） |

Sprint86時点で「開始後で良い」と分類していたH-1（WarmPaper未適用）・H-2（Blue-600の一部残存）・
H-4（`@media print`未対応）、およびMedium/Low各件は、いずれも機能上のブロッカーではなく
今回もスコープ外のまま据え置いている（これらは引き続きSprint86の`docs/CLOSED_BETA_FINAL_REVIEW.md`
§8「開始後で良いもの」の対象として扱う）。

**再判定：Closed Beta開始可能（GO）。**
Sprint86で唯一「開始前に直すべき」とされていたアクセシビリティ上の実害（コントラスト未達・
見出し階層の欠落）が解消され、それ以外にCriticalな不具合は見つかっていない。残るHigh/Medium/Low
項目はいずれもブランド体験の完成度に関わるものであり、Closed Beta中の並行改善（Sprint88以降）で
対応して差し支えないと判断する。
