# SUNBOO_BRAND_EXPERIENCE_REVIEW.md — SUNBOO Brand Experience（Sprint85）

> **ステータス：ドラフト（Sprint85「SUNBOO Brand Experience」成果物）**
> Engine・DB・Procedure・migration・packageは変更していない。新しい画面・新しい業務機能も追加していない。
> レビュー待ちで停止する。コミットは行っていない。

---

## 0. スコープの確認

対象画面として指定された「Workspace Dashboard／Workspace Roadmap／Share／Profile／Documents／Notification」を、
実装上の構造に照らして次のように対応づけた。

- **Workspace Dashboard** → `src/app/admin/(protected)/workspaces/[id]/page.tsx` + `src/components/WorkspaceDashboard.tsx`
- **Workspace Roadmap** → `src/app/admin/(protected)/workspaces/[id]/roadmap/page.tsx`
- **Notification** → WorkspaceDashboard内の「通知センター」区画（独立ページではなく、Dashboardの一区画）
- **Documents** → `src/app/admin/(protected)/workspaces/[id]/documents/page.tsx` + `WorkspaceDocumentsView.tsx`
- **Profile** → `src/app/admin/(protected)/workspaces/[id]/profile/page.tsx`（Workspace側の会社プロフィール編集画面。
  一般ユーザー向け`(site)/profile`は今回の対象から除外した。「Workspace Dashboard」「Workspace Roadmap」という
  명시的な接頭辞と、他の4項目がいずれもWorkspace配下のページであることから、この解釈が妥当と判断した。
  一般ユーザー向け画面まで含める意図だった場合はSprint86で追記する）
- **Share** → `src/app/admin/(protected)/workspaces/[id]/share/page.tsx`（管理画面側の発行・管理UI）＋
  `src/app/share/[token]/page.tsx`（経営者が実際に見る公開ページ、Phase9の主対象）

---

## 1. 変更ファイル

**新規（共通部品）**
- `src/components/PageHeader.tsx` — Page Title / Subtitle / Action の3段構成（Phase5）。Dashboard/Roadmapのみ☀ブランドタッチ（Phase4）
- `src/components/InformationCard.tsx` — Info / Caution / Disclaimer / Error の4種類（Phase3）

**変更（Workspace画面）**
- `src/app/admin/(protected)/workspaces/[id]/page.tsx`（Dashboardホスト、PageHeader適用・SECTIONSカード再配色）
- `src/components/WorkspaceDashboard.tsx`（Phase1/6/8、大幅再構成）
- `src/app/admin/(protected)/workspaces/[id]/roadmap/page.tsx`
- `src/app/admin/(protected)/workspaces/[id]/documents/page.tsx`
- `src/components/WorkspaceDocumentsView.tsx`
- `src/app/admin/(protected)/workspaces/[id]/profile/page.tsx`
- `src/app/admin/(protected)/workspaces/[id]/profile/WorkspaceProfileForm.tsx`
- `src/app/admin/(protected)/workspaces/[id]/share/page.tsx`
- `src/app/admin/(protected)/workspaces/[id]/share/WorkspaceShareLinksPanel.tsx`
- `src/app/share/[token]/page.tsx`

**変更（トークン基盤）**
- `src/app/globals.css`（`.information-card`系・`.page-header-brand`を追加、既存クラスは無変更）

**変更なし（本スプリントでは触れていないファイル）**
上記リストに無いファイル（`(site)/*`、Roadmap/PDF/Excel生成コード、Engine一式）はSprint82〜84の
差分がそのまま残っているのみで、Sprint85では変更していない。

---

## 2. Phase別の実施内容

### Phase1: Dashboard（優先順位の統一）
`WorkspaceDashboard.tsx`最上部に「今日のポイント」カードを新設し、指示された優先順位
（1.今日やること 2.次の期限 3.今年あと何件 4.最近完了したこと）をこの1枚に集約した。

- 「次の期限」「今年あと何件」は**新しい集計を追加せず**、既存の`advice.warnings`/`advice.priority`
  （dueDateが最も近い1件をそのまま採用）と`progress.total - progress.done`から表示専用に導出した
- 「最近完了したこと」は、従来「意思決定」カード内にあった`decisions.completed`のchip表示を
  そのままこのカードへ移設した（データは無変更）
- チャート（円グラフ・棒グラフ等）は追加していない
- **カード枚数は変更していない**（従来7枚：通知/今日やること/期限警告/意思決定/進捗サマリー/AI参謀/会社概要
  → 新7枚：今日のポイント/確認が必要なこと/期限警告/意思決定/進捗サマリー/AI参謀/会社概要。
  「今日のポイント」が旧「今日やること」の役割を継承し、「最近完了したこと」は意思決定カードから
  移設したのみで、カードの純増はゼロ）

### Phase2: Empty State
不安を煽らない表現に全面的に書き換えた。主な変更例：

| 旧 | 新 |
|---|---|
| 直近で対応が必要な手続きはありません。 | 直近で対応が必要な手続きはありません。安心して本業に集中してください。 |
| 現在、対応が必要な通知はありません。 | 今、確認が必要なことはありません。安心して本業に集中してください。 |
| 警告はありません。 | 期限が近い手続きや期限超過はありません。 |
| 表示できる手続きがありません。（進捗サマリー） | 今年の手続きはまだ計算できていません。 |
| ロードマップの計算中にエラーが発生しました（見出し） | ロードマップを計算できませんでした（見出し）＋「時間をおいて再度お試しください」 |
| 表示できる手続きがありません。会社プロフィールの決算月などの登録状況をご確認ください。 | 今年の手続き予定はまだ計算できません。会社プロフィールの決算月などを登録すると、年間の手続き予定を自動で作成します。 |
| 表示できる手続きがありません。（Share公開ページ） | 今年の手続き予定はまだ登録されていません。 |
| まだ共有リンクがありません。 | まだ共有リンクがありません。発行すると、経営者へそのまま渡せる年間ロードマップのURLができます。 |

### Phase3: Information Card
`InformationCard`（`kind: 'info' | 'caution' | 'disclaimer' | 'error'`）に統一した。

| 種類 | 用途 | 見た目 |
|---|---|---|
| Info | 一般的な参考情報・ガイダンス | `.card`相当、WarmPaper地、Ink Mutedの文字 |
| Caution | 要更新・注意喚起（今回は`.tag--caution`と役割分担、InformationCard自体は未使用の画面もある） | MorningSun-dark枠線、Ink文字 |
| Disclaimer | 免責・確からしさの説明等、最も控えめな注記 | 枠なし・背景なし、Tinyサイズ、Ink Muted |
| Error | 保存失敗・計算失敗などの実際のエラー | Danger枠線、Danger見出し |

Roadmapページ・Shareページ（管理画面／公開ページ）・WorkspaceProfileForm・WorkspaceShareLinksPanel・
WorkspaceDocumentsViewのエラー表示を、個別実装の`bg-red-50 border-red-200`等から置き換えた。

### Phase4: Brand
`PageHeader`に`brand`propを追加し、Dashboard・Roadmapの2画面だけ見出し上部に
小さな「☀ Morning Brief」のキャプション（MorningSun-dark、Tinyサイズ、アイコン14px）を表示するようにした。
イラストは使わず、余白と控えめなアイコン+ラベルのみで演出している。

### Phase5: Page Header
`PageHeader`（Page Title / Subtitle / Action）を、Workspace配下5画面（Dashboard/Roadmap/Documents/Profile/Share）
すべてに適用した。従来「タイトル — 会社名」をh1に直接連結していた表記を、Title＝画面の役割
（例：「年間ロードマップ」）、Subtitle＝会社名を含む説明文、という構成に統一した。Roadmapの
Excel/PDF出力ボタンは`action`スロットに統一的に配置した。

### Phase6: Dashboard Cards
`WorkspaceDashboard.tsx`内の全7カードに共通の見出しコンポーネント`CardEyebrow`（アイコン+ラベル、
`text-xs font-semibold text-sunboo-ink-muted`）を導入し、見出しの書式・間隔（`space-y-3`）を統一した。
装飾目的でBlue-600に着色されていたアイコン（Compass・Sparkles・Bell・PieChart等）をすべて
Ink Mutedへ統一した（MorningSunは「現在地・近日期限の補助」に用途を限定するという方針に合わせ、
装飾用途からは撤去した）。

### Phase7: Documents
`Page Title`を「書類」から**「今年提出した書類」**に変更し、Subtitleに登録済み件数
（例：「3/5件登録済み」、既存statusMapから表示専用に集計。新しいDB問い合わせ・新しいステータス種別は
追加していない）を明示した。各行にはステータスに応じたアイコン（未登録=Circle、登録済み=CheckCircle2/Moss、
要更新=AlertTriangle/MorningSun-dark）を追加し、「一覧」ではなく「記録」であることが一目で分かるようにした。

### Phase8: Notification
WorkspaceDashboardの「通知センター」を**「確認が必要なこと」**に改称した。表示ロジック・データ源
（`buildWorkspaceNotifications`）・重要度の並びは無変更。「今日のポイント」カードの直下に配置し、
「まず見るべき場所」という既存の設計意図（`docs/NOTIFICATION_ENGINE_DESIGN.md`）を維持している。

### Phase9: Share
`src/app/share/[token]/page.tsx`を、**会社名が最優先、SUNBOOは裏方**になるよう並び替えた。

- 変更前：SUNBOOロゴバッジ＋ワードマーク（大きい masthead）が最初に表示 → 会社名カードが2番目
- 変更後：小さなキャプション「SUNBOOが作成した年間行政ロードマップ」（Tinyサイズ、ロゴバッジなし）→
  **会社名カードが最初の主役**。ページ末尾に「Powered by SUNBOO経営ナビ」を11pxの控えめな1行で追加し、
  ブランドの存在は残しつつ主役にはしない
- Confidence（情報不足・推定タグ）の説明文は、従来の`.card`ボックス表示から`InformationCard kind="disclaimer"`
  （枠なし・最小サイズ）に変更し、指示通り「小さく」した
- Building2/CalendarRangeの装飾アイコンもBlue-600からInk Mutedへ変更した

---

## 3. Phase10: Brand Audit

「初めて開いた人が5秒以内に何をすればいいか分かるか」「SUNBOOらしい静けさがあるか」
「情報を詰め込み過ぎていないか」「ブランドカラーが統一されているか」の4観点で、対象画面を監査した。

| 画面 | 5秒で分かるか | 静けさ | 詰め込み | ブランドカラー統一 |
|---|---|---|---|---|
| Workspace Dashboard | ◎「今日のポイント」が最上部にあり、次の期限・残件数・今日やることが1枚で分かる | ○ 装飾色を排除し落ち着いた。ただしカードは依然7枚あり、初見の情報量は多め | △ 7枚構成は維持しており、詰め込み感の抜本解消はできていない（カード数を減らせないという制約の中での改善） | ◎ 全カードでInk Muted/MorningSun/Moss/Danger以外の色を排除 |
| Workspace Roadmap | ◎ 期限最優先のRoadmap Card（Sprint84）に加え、ページ自体もPageHeaderで一目で分かる | ◎ | ○ | ◎ |
| Notification（Dashboard内） | ○「確認が必要なこと」で意図は明確になったが、位置的に2番目でDashboard全体を見ないと気づきにくい | ○ | ○（重要度上位5件に絞り込み済み、既存仕様） | ◎ |
| Documents | ◎「今年提出した書類」＋件数表示で意味が一目瞭然に | ◎ | ◎（5行の固定リストのみ） | ◎ |
| Profile | ○ PageHeaderでこの画面の位置づけは明確。ただしフォーム自体の情報量は多く、5秒で「何をすればいいか」より「何を聞かれるか」が先に立つ（Sprint83で個々の項目に判定用途の説明は付与済み） | ○ | △ 項目数自体は多い（フォームの性質上、削減はスコープ外） | ○（フォーカスリング等はSprint82のまま） |
| Share（公開ページ） | ◎ 会社名が最初に目に入るようになった | ◎ SUNBOOロゴが裏方に回り静けさが増した | ◎ | ◎ |
| Share（管理画面） | ○ | ○ | ○ | ◎ |

**総評：** Dashboard・Roadmap・Documents・Shareは明確に改善した。Notificationは文言・位置づけは改善したが、
Dashboard内の2番目という位置自体は変えていないため「本当に最優先か」という点でPhase1の「今日のポイント」との
役割分担が今後の検討課題として残る。Profileは情報量そのものが多い画面のため、静けさの実現には
入力体験自体の見直し（別スプリント）が必要と判断する。

---

## 4. Playwright / build / tsc確認

### build / tsc
```
npx tsc --noEmit → エラーなし
npm run build → ✓ Compiled successfully, TypeScriptエラー0, 全26ルート成功
```

### Playwright（ログイン不要画面）
| 画面 | 結果 |
|---|---|
| `/share/無効token` | 200、コンソールエラー0、崩れなし |
| `/result`（回帰） | 200、コンソールエラー0 |
| `/offices`（回帰） | 200、コンソールエラー0 |
| `(site)/roadmap`（回帰） | 200、コンソールエラー0 |
| `(site)/profile`（回帰） | 200、コンソールエラー0 |
| `/admin/login` | 200（フォーム自体は今回変更対象外） |

### 未確認項目（重要）
Sprint85の対象6画面のうち、実際に新しい`PageHeader`/`InformationCard`が使われている画面
（Workspace Dashboard／Workspace Roadmap／Documents／Profile／Share管理画面）は
**すべて管理画面ログインが必要**であり、本セッションではログイン情報が無いため実機確認できなかった。
公開`/share/[token]`も、有効なトークンを発行するには管理画面ログインが必要なため、実データでの
レンダリング確認ができなかった（無効トークン時の表示のみ確認済み）。

このため、Phase1・4・5・6・7・8・9の視覚的な結果は**コードレビューとSprint82〜84で確立済みの
同一トークンクラス（`text-sunboo-*`・`.card`・`.tag`・`.information-card`系）の実績**に基づく判断であり、
実機スクリーンショットでの最終確認はできていない。Sprint86で最優先に行うべき作業として引き継ぐ。

---

## 5. Sprint86への引き継ぎ

- **管理画面の実機確認（最優先）**：Workspace Dashboard・Roadmap・Documents・Profile・Shareの5画面と、
  有効な共有トークンでの`/share/[token]`表示を、ログイン可能な環境で確認する
- **Notificationの位置づけ再検討**：「今日のポイント」と「確認が必要なこと」の役割分担（両方とも
  「今すぐ見るべきもの」を扱っており、統合の余地があるかもしれない）
- **Profile画面の情報量**：フォーム項目数自体の多さは今回のスコープ外としたため、入力体験の
  改善（複数ステップ化等）を独立したテーマとして検討する
- **一般ユーザー向け`(site)/profile`のPageHeader化**：「Profile」の解釈をWorkspace側に限定した
  判断が違う場合、`(site)/profile`にも同様の構成を適用する
- **InformationCardの適用範囲拡大**：今回はWorkspace対象5画面＋Shareのみに適用した。
  `(site)/*`配下の同種の注意書き（Sprint80監査で指摘済み）は依然未統一のまま
