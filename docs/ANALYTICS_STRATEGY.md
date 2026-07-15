# ANALYTICS_STRATEGY.md — Product Analytics Foundation（RC2）

**ステータス：実装済み。** Engine・Procedure・DBスキーマ・migration・見た目の変わるUIはいずれも変更していない。
[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §3「Beta Success Metrics」が指摘した「Roadmap生成数／PDF出力率／
Excel出力率／初回完了率等は現状測定手段が無い」というギャップのうち、**測定手段そのもの**（イベント計測基盤）
を用意するのが本ドキュメントとこのSprintの唯一の目的。「改善」ではなく「測定」を優先する。

---

## 1. イベント一覧

既存の`src/lib/analytics.ts`（Sprint11 Phase9.1、`(site)`側の匿名フローで既に稼働中）に、
Company Workspace側の8イベントを追加した。

| イベント名 | 新規/既存 | 発生する画面・操作 |
|---|---|---|
| `company_created` | 新規 | 顧問先（Workspace）の新規登録が成功した時 |
| `profile_completed` | 新規 | Company Profileの保存が成功した時 |
| `roadmap_generated` | 新規 | 年間ロードマップが1件以上の項目とともに正常に表示された時 |
| `procedure_status_changed` | **既存を再利用** | 手続きのステータスが変更・保存された時 |
| `pdf_exported` | 新規 | 年間ロードマップPDFの出力が成功した時 |
| `excel_exported` | 新規 | 年間ロードマップExcelの出力が成功した時 |
| `share_created` | 新規 | 経営者向け共有リンクの発行が成功した時 |
| `share_opened` | 新規 | 共有リンク（`/share/[token]`）が有効なトークンで開かれた時 |

**`procedure_status_changed`は新設していない。** この名前は`src/app/(site)/result/ScheduleList.tsx`
（匿名の診断結果画面、`company_id`を持たない）で既に使われており、今回はWorkspace側の呼び出し箇所
（`AnnualRoadmapView.tsx`）に同じイベント名で`workspace_id`/`company_id`付きの呼び出しを追加しただけ。
「同じ操作（ステータス変更）を指す1つのイベント名を、文脈によって持つプロパティが異なる形で共有する」
という設計判断であり、意図的な再利用である。

---

## 2. イベント発火タイミング（実装箇所）

| イベント名 | 発火箇所 | 発火条件 |
|---|---|---|
| `company_created` | `WorkspaceCompanyForm.tsx` | `workspace_companies`のINSERTと、作成者を`owner`として`workspace_members`へ登録するINSERTの**両方**が成功した直後（片方でも失敗した場合は発火しない。既存のロールバック処理と整合） |
| `profile_completed` | `WorkspaceProfileForm.tsx` | `workspace_companies`・`workspace_company_profiles`両方の保存が成功した直後（`setSaved(true)`と同時）。**「入力が完了した」という意味判定はせず、保存操作1回＝1イベントとして扱う**（項目単位の完了度は計算しない、後述4節） |
| `roadmap_generated` | `roadmap/page.tsx`（`AnalyticsPageEvent`経由） | ロードマップの計算に失敗せず（`computeError`なし）、かつ1件以上の項目がある状態で画面が表示された時のみ。エラー時・0件時は発火しない |
| `procedure_status_changed` | `AnnualRoadmapView.tsx`の`handleStatusChange` | `workspace_procedure_statuses`へのupsertが成功した直後（保存失敗時は発火しない） |
| `pdf_exported` | `RoadmapPdfExportButton.tsx` | PDFファイルのダウンロードトリガー（`a.click()`）が実行された直後。生成自体が失敗した場合は発火しない |
| `excel_exported` | `RoadmapExcelExportButton.tsx` | 同上（Excel版） |
| `share_created` | `WorkspaceShareLinksPanel.tsx` | `workspace_share_links`へのINSERTが成功した直後 |
| `share_opened` | `share/[token]/page.tsx`（`AnalyticsPageEvent`経由） | `get_shared_workspace_view` RPCが有効な会社情報を返した時のみ（無効・期限切れトークンでは発火しない） |

### サーバーコンポーネントからの発火方法

`roadmap/page.tsx`と`share/[token]/page.tsx`はいずれもServer Componentであり、`trackEvent`は
`typeof window === 'undefined'`で早期returnするクライアント専用実装のため直接呼び出せない。
既存の`TrackedLink.tsx`（クリック計測用の小さなクライアント部品、`(site)`側で稼働中）と同じ設計思想で、
新しく`src/components/AnalyticsPageEvent.tsx`を追加した。`{ event, properties }`を受け取り、
`useEffect`で初回マウント時に1度だけ`trackEvent`を呼ぶだけで、**何もDOM出力しない（`return null`）**。
ページ全体を`'use client'`にせず、計測が必要な1行だけをこの部品に置き換える、既存パターンの踏襲。
見た目には一切影響しない。

---

## 3. 保存項目

すべてのイベントで共通の最小項目のみを記録する。

| 項目 | 内容 | 付与方法 |
|---|---|---|
| `event_name` | イベント名（1節の8種のいずれか） | `trackEvent()`内部で自動付与（呼び出し側は指定するだけ） |
| `timestamp` | ISO 8601形式の発火時刻 | `trackEvent()`内部で`new Date().toISOString()`により自動付与 |
| `workspace_id` | 対象のWorkspace ID | 呼び出し側が指定 |
| `company_id` | 対象の会社ID | 呼び出し側が指定 |

**`workspace_id`と`company_id`は現状同一の値になる。** SUNBOOのDB設計では「Workspace」と「会社」は
別テーブルではなく、`workspace_companies.id`が両方の役割を兼ねている（[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)、
`workspace_members`等の関連テーブルはすべて`company_id`列で紐付く）。将来「1つのWorkspaceが複数の
会社を持つ」というモデルに変わらない限り、この2つのプロパティは同値のまま推移する。DBスキーマ変更を
伴わずに両方のフィールド名をそのまま残しているのは、外部計測サービス（2章参照）に接続する際の
汎用的なイベントスキーマ（`workspace_id`という呼び方が一般的なB2B SaaS計測の語彙）にそのまま合わせる
ためで、実装上の負債ではなく意図的な設計。

**個人情報は保存しない。** 会社名・担当者のメールアドレス・入力された税務データ・手続き名等は
一切プロパティに含めない。数値IDのみを記録する。

---

## 4. 送信方法（将来のPostHog / GA4 / Mixpanel接続を見据えた設計）

`src/lib/analytics.ts`の`trackEvent()`は、Sprint11時点から一貫して「呼び出し側は送信先を意識しない」
というインターフェースの土台を維持している。今回もこの方針を変えていない。

```ts
export function trackEvent(name: AnalyticsEventName, properties?: AnalyticsProperties): void {
  if (typeof window === 'undefined') return;

  const payload = { ...properties, event_name: name, timestamp: new Date().toISOString() };

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[analytics]', payload);
  }
  // TODO: 実際の計測サービスと接続する際はここで送信する
}
```

- **現状は外部送信を一切行わない。** 開発環境でのみ`console.debug`に出力する（Sprint11から変更なし）。
  本番でも無害（何もしない）。
- `payload`は`event_name`・`timestamp`をフラットに含むオブジェクトのため、将来PostHog（`posthog.capture(event_name, payload)`）・
  GA4（`gtag('event', event_name, payload)`）・Mixpanel（`mixpanel.track(event_name, payload)`）の
  いずれに接続する場合も、`trackEvent()`内部の送信部分を差し替えるだけで済む設計にしている
  （呼び出し元8箇所を書き換える必要はない）。
- どのサービスを採用するか、Cookie同意・プライバシーポリシーとの関係をどう整理するかは、
  [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 18節が明記する通り法務面の整備を伴う
  別の意思決定であり、本Sprintのスコープ外（引き続き未接続のまま）。

---

## 5. 利用目的

- **[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §3「Beta Success Metrics」の一部を実測可能にする。**
  同ドキュメントが「収集手段なし」としていた指標のうち、Roadmap閲覧・PDF/Excel出力・Share発行の
  発生有無は、本Sprintの実装後は`trackEvent`の呼び出し実績（本番接続後）で把握できるようになる
  （6節で具体的にどの指標が測定可能になるかを整理する）
- **Closed Betaの実利用状況の裏付け。** [BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)による
  人手の観察記録を補完し、「観察していない時間帯にも実際に使われているか」を把握する
- **将来の機能改善の優先順位付けの材料。** どの機能が実際に使われているか（例: Excel出力とPDF出力の
  どちらが多く使われるか）を定量的に把握し、[ROADMAP.md](ROADMAP.md) v1.1以降の優先順位判断に使う

**利用しない目的（明記）**：個人の行動追跡、特定の税理士・会社の監視、マーケティング目的の
第三者提供。個人情報を保存しない設計（3節）自体がこれを構造的に担保する。

---

## 6. Version 1.0 KPI

本Sprintの実装により、[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §3の指標のうち、以下が
**外部計測サービス接続後に**実測可能になる（現時点ではまだ`console.debug`止まりであり、
実際の集計・ダッシュボード化には4節の外部接続が別途必要な点に注意）。

| V1_RELEASE_PLAN.md §3の指標 | 本Sprint後の状態 |
|---|---|
| 会社登録数 | 従来通りSupabase手動集計に加え、`company_created`イベントでも把握可能に |
| Roadmap生成数 | **新規に測定可能。** `roadmap_generated`（0件・エラー時は除外、実際に手続き予定が表示された回数のみ） |
| PDF出力率 | **新規に測定可能。** `pdf_exported`件数 ÷ `roadmap_generated`件数で近似できる |
| Excel出力率 | **新規に測定可能。** `excel_exported`件数 ÷ `roadmap_generated`件数で近似できる |
| Share利用率 | 従来の`workspace_share_links`行数集計に加え、`share_created`件数、および新規に`share_opened`（**発行数だけでなく実際に開かれた回数**、従来Supabase集計では取得不可だった指標） |
| 初回完了率 / 途中離脱率 | **本Sprintでは測定可能にならない。** `company_created`→`profile_completed`→`roadmap_generated`の順序をセッション単位で追跡するには、匿名ID・セッションIDの導入が必要であり、これは「イベント計測基盤のみ」という本Sprintのスコープを超える実装判断のため、次Sprint以降の課題として残す |

**現時点での制約（正直に明記）**：上記はいずれも「イベントを正しく発火させる基盤」が整った、という
段階に留まる。実際の集計・KPIダッシュボードとしての利用には、(a) 外部計測サービスへの接続
（4節、法務整備を伴う）、(b) 本番環境でのイベント発生実績の蓄積、の両方が別途必要。

---

## 7. 確認結果

### build / tsc
```
npx tsc --noEmit → エラーなし
npm run build → ✓ Compiled successfully、TypeScriptエラー0、全26ルート成功
```

### 動作確認
`npm run dev`を起動し、影響範囲に含まれる公開ページ（`/`・`/roadmap`・`/share/[token]`（無効な
トークンで確認、正しく「リンクが無効です」に分岐しイベントも発火しないことをコード上確認済み）)が
いずれも200・コンソールエラー0で応答することを確認した。

**未確認事項**：`company_created`・`profile_completed`・`procedure_status_changed`・`pdf_exported`・
`excel_exported`・`share_created`の6イベントは管理画面（`/admin/workspaces/*`）内の操作でのみ発火する。
本セッションには管理画面へのログイン情報が無く、Sprint82以降の各Sprintと同様に実機（ブラウザでの
実操作）確認はできていない。ただし各変更は以下の理由でコード上のリスクが小さいと判断できる。

- `trackEvent`呼び出しはいずれも各コンポーネントの**保存/操作成功パスの末尾に1行追加しただけ**で、
  既存の保存ロジック・エラーハンドリング・戻り値を一切変更していない
- `RoadmapPdfExportButton`/`RoadmapExcelExportButton`への`companyId`プロップ追加は、唯一の呼び出し元
  である`roadmap/page.tsx`側も同時に更新済みであることを`tsc --noEmit`（型エラー0件）で確認済み
  （CLAUDE.md開発フロー4節の「シグネチャ変更時は呼び出し元を確認する」に対応）
- `AnnualRoadmapView.tsx`の`handleStatusChange`は、`(site)`側・`/share/[token]`側では
  `companyId`が`undefined`のため関数冒頭の`if (!companyId) return;`でそもそも呼ばれない
  （既存のガード条件を変更していないため、匿名フロー・共有ページへの影響は無い）

---

## 8. 変更ファイル

**新規**：`src/components/AnalyticsPageEvent.tsx`、`docs/ANALYTICS_STRATEGY.md`

**変更**：`src/lib/analytics.ts`（イベント名7件追加、`timestamp`/`event_name`の自動付与）、
`src/app/admin/(protected)/workspaces/WorkspaceCompanyForm.tsx`、
`src/app/admin/(protected)/workspaces/[id]/profile/WorkspaceProfileForm.tsx`、
`src/components/AnnualRoadmapView.tsx`、
`src/components/RoadmapPdfExportButton.tsx`（`companyId`プロップ追加）、
`src/components/RoadmapExcelExportButton.tsx`（`companyId`プロップ追加）、
`src/app/admin/(protected)/workspaces/[id]/roadmap/page.tsx`（`companyId`プロップの受け渡し・
`AnalyticsPageEvent`の追加）、
`src/app/admin/(protected)/workspaces/[id]/share/WorkspaceShareLinksPanel.tsx`、
`src/app/share/[token]/page.tsx`
