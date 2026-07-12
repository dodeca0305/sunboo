# ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md — Roadmap 提出先リンク表示 設計（Sprint50）

**ステータス: 設計のみ。DB変更・マイグレーション・コード変更・画面変更は本Sprintでは一切行っていない。**
実装はレビュー後、Sprint51以降で行う。

目的: 年間ロードマップ（`AnnualRoadmapView`）に**提出先名・提出方法・公式URL**を表示し、
管理画面（Workspace Roadmap）と共有ページ（`/share/[token]`）の両方から公式ページへ遷移できるように
する。あわせて、将来のPDF/Excel出力（[ROADMAP.md](ROADMAP.md)が構想する経営ロードマップの出力機能）で
そのまま再利用できるよう、提出先情報を**表示コンポーネント固有の形（JSX）ではなく、プレーンな
データ構造**として組み立てる。

---

## 0. 前提として確認した既存事実

### 0-1. AnnualRoadmapViewは現在、提出先情報を一切表示していない

`src/components/AnnualRoadmapView.tsx`（Workspace Roadmap・共有ページ・(site)/roadmapの3画面が
共有する唯一の表示コンポーネント）のカードは、`item.procedure.name`・カテゴリタグ・`formatDueDate`・
Confidenceタグ・ステータスのみを表示している（101-144行）。提出先名・提出方法・公式URLはいずれも
**表示コードが存在しない**（データが無いのではなく、表示部分が未実装）。

### 0-2. `/result`（ScheduleList）には既に3種類の「公式リンク」表示パターンがあり、互いに独立している

同じ`ScheduleProcedure`型を扱う`src/app/(site)/result/ScheduleList.tsx`には、提出先・公式情報の
表示パターンが既に3つ存在する。Sprint50はこれを**再発明せず再利用する**方針を取る。

| パターン | データ源 | 表示箇所 | 「URLが無ければ出さない」の実装 |
|---|---|---|---|
| ① 地図リンク | `proc.office.map_url` | `ProcedureRow`（250-260行） | `{mapUrl && (...)}` |
| ② 電子申請リンク | `proc.e_filing_system_url`（Procedure単位） | `ProcedureRow`（261-271行） | `{proc.e_filing_system_url && (...)}` |
| ③ 個別公式リンク一覧 | `proc.official_links[]`（Procedure単位、`status`/`fallback_url`付き） | `ProcedureLink`コンポーネント（182-198行、展開時のみ） | `href`は`status==='broken'`なら`fallback_url`にフォールバック。`unchecked`は「（未確認）」を添えて**表示はする**（非表示にしない） |

加えて、`result/page.tsx`（サーバーコンポーネント）には**Office単位**の公式リンク表示
（`OfficialSiteLink`関数、15-34行）が存在するが、これは「管轄機関一覧」セクション専用で、
`DiagnosisResult.offices`（フル情報）を直接参照しており、**`ScheduleProcedure`経由ではない**。
`ScheduleList`側の手続きカードからは一度も呼ばれていない。

**結論**: 「Office自身の公式URL（`office.official_url`/`website_url`）」を手続きカード単位で
表示する経路は、`/result`を含め**現状どこにも存在しない**。Sprint50が埋めるべき本当のギャップは
ここにある（Procedure単位の電子申請リンク・個別公式リンクは既にあるため、それらは維持しつつ
Office自身の公式URLを新たに追加する）。

### 0-3. `ScheduleProcedure.office`はOffice情報を意図的に切り詰めている

`src/lib/scheduleProcedure.ts`の`toScheduleProcedure()`（29-49行）は、`ProcedureResult.office`
（`JurisdictionOffice`型、`postal_code`/`fax`/`email`/`official_url`/`official_url_status`/
`fallback_url`/`e_filing_url`/`download_page_url`/`business_hours`/`notes`等を含むフル情報）から
**`{ name, map_url }`の2フィールドだけを残して**`ScheduleProcedure.office`を組み立てている
（`src/lib/types.ts`の`JurisdictionOffice`定義と`src/lib/scheduleProcedure.ts`の絞り込みを対比して確認）。

`RoadmapItem.procedure`（`roadmap.ts`）はこの`ScheduleProcedure`をそのまま使っているため、
Roadmap側で`office.official_url`を表示しようとしても**そもそもデータが無い**。これが本Sprintで
解決すべき1つ目のギャップ（表示側ではなくデータ側）。

### 0-4. `resolveOffices`は既に必要な全フィールドを取得済み・municipality_idで正しくスコープ済み

`src/lib/diagnosis.ts`の`resolveOffices()`（121-165行）の`select`は
`id, name, postal_code, address, phone, fax, email, website_url, official_url, e_filing_url,
download_page_url, map_url, business_hours, notes, official_url_status, official_url_checked_at,
fallback_url`と、**必要なフィールドはすべて既に取得している**。かつ`jurisdictions`テーブルを
`municipality_id`で絞り込んでおり（134行の`.eq('municipality_id', municipalityId)`）、
**特定の1市区町村分の窓口だけ**を返す設計になっている（テーブル全件を返す経路ではない）。

**結論**: 0-3節のギャップは`toScheduleProcedure()`の絞り込みだけが原因であり、`resolveOffices`・
`runDiagnosis`・`buildAnnualRoadmap`のDB問い合わせ自体には一切手を加える必要が無い。

### 0-5. `get_shared_workspace_view`はOffice/Procedure情報を含んでいない（含める設計にもなっていない）

`supabase/migration_workspace_tax_returns.sql`（最新版の`get_shared_workspace_view`定義）を確認した。
返す内容は`company`・`profile`・`tax_returns`・`statuses`（手続きステータスのみ）で、
Office/Procedure情報は一切含まれない。共有ページ（`src/app/share/[token]/page.tsx`）はこのRPCとは
**別に**、anonキーのクライアントで`buildAnnualRoadmap`を直接呼び出してRoadmapを都度計算している
（コメント22-25行に明記）。

**結論**: Office公式URLを共有ページに表示する際も、`get_shared_workspace_view`（SECURITY DEFINER
RPC）を変更する必要は無い。共有ページは`buildAnnualRoadmap`経由で`resolveOffices`をそのまま呼ぶため、
0-4節の変更（`toScheduleProcedure`の絞り込み緩和）だけで**自動的に**共有ページにも波及する。

### 0-6. `organization_offices`のRLS/GRANTは既にテーブル全体がanon読み取り可能（本Sprintで変更しない）

`supabase/migration_organizations_permissions.sql`を確認した。`organization_types` /
`organizations` / `organization_offices` / `jurisdictions` / `procedure_organizations`の5テーブルは
いずれも`GRANT SELECT TO anon` + `CREATE POLICY "public_read" ... USING (true)`が既に設定済みで、
**DBレベルでは`organization_offices`のどの行でもanonキーで直接SELECTできる**状態にある
（`/offices`公開一覧ページが成立している前提そのもの）。

これを踏まえ、「anonへ窓口マスタ全体を公開しない」という本Sprintの要件は、**DBのRLSを新たに絞る話
ではなく**（既存の`/offices`公開ページ・診断エンジンの前提を壊すため、本Sprントのスコープでは
現実的でない）、**アプリケーションコード側が「特定の1市区町村分だけを取得する」という既存の規律
（`resolveOffices`の`municipality_id`スコープ）を維持し、新しいクエリ経路でテーブル全件を
無条件に取得するコードを追加しない**という意味で解釈する。0-4節で確認した通り、本設計は
`resolveOffices`を一切変更せず、既に取得済みのデータをアプリ内で通すだけなので、この規律に反しない。

### 0-7. `municipal_tax`/`prefectural_tax`のデータ充足状況（実データで確認）

anonキーで本番Supabaseの実データを確認した（2026-07-12時点）。

| `organization_types.code` | `jurisdictions`の件数 | 対象`municipalities`73件中の割合 |
|---|---|---|
| `tax_office`（比較用） | 73件 | 100%（全市区町村で窓口確定済み） |
| `municipal_tax` | **1件** | **1.4%**（渋谷区`13113`のみ。福岡県72市区町村は0件） |
| `prefectural_tax` | **1件** | **1.4%**（同上） |

`organization_offices`67件全体の`official_url_status`内訳は`unchecked: 61件`・`ok: 6件`・
`broken: 0件`。**登録済みの窓口の91%はURLの有効性が未確認のまま**（リンク切れではなく「未確認」）。

**結論**: 福岡県の会社が地方税カテゴリ（`SALARY_PAYMENT_REPORT`・`MUNICIPAL_RESIDENT_TAX_RETURN`・
`PREFECTURAL_RESIDENT_TAX_RETURN`・`PREFECTURAL_BUSINESS_TAX_RETURN`・`DEPRECIABLE_ASSET_TAX_RETURN`・
`RESIDENT_TAX_WITHHOLDING`）の提出先リンクを見ようとすると、**ほぼ確実に「窓口情報なし」**になる
（[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02として既に登録済みの既知ギャップ、Sprint50が新たに
生む問題ではない）。「未登録時は推測しない」という要件は、この状態を**正直に「情報なし」と
表示する**ことで満たす（フォールバックとして別の市区町村の窓口を代用する、等は行わない）。

---

## 1. データモデル設計

### 1-1. `ScheduleProcedure.office`型の拡張

`src/lib/scheduleProcedure.ts`の`office`フィールドを、`JurisdictionOffice`が既に持つ
公式URL関連フィールドを含む形に拡張する（新規DBクエリ・新規テーブル参照は発生しない。
0-4節の通り`resolveOffices`は既にこれらを取得済み）。

```ts
// 変更イメージ（本Sprintでは適用しない）
export type ScheduleProcedure = {
  // ...既存フィールド...
  office: {
    name: string;
    map_url?: string | null;
    official_url?: string | null;        // 追加
    website_url?: string | null;         // 追加
    official_url_status?: LinkStatus;    // 追加（'ok' | 'broken' | 'redirected' | 'unchecked'）
    fallback_url?: string | null;        // 追加
  } | null;
  // ...
};
```

`toScheduleProcedure()`の絞り込みを、この4フィールド分だけ緩和する（他のOffice項目——
`postal_code`/`fax`/`email`/`business_hours`/`notes`等——は今回のRoadmap表示に不要なため、
引き続き含めない。「必要な分だけ運ぶ」という既存の`ScheduleProcedure`設計思想を維持する）。

### 1-2. 共通の「提出先表示情報」抽出関数（表示コンポーネント非依存）

**これが本Sprintの核心の設計判断である。** 現状、公式URLの「どれを優先するか・URLが無ければ
どう振る舞うか」という判定ロジックは、`OfficialSiteLink`（`result/page.tsx`内、JSXに埋め込み）・
`ProcedureLink`（`ScheduleList.tsx`内、JSXに埋め込み）にそれぞれ個別に書かれている
（0-2節）。これをUIコンポーネントの外に出し、**プレーンなデータを返す純粋関数**として
`src/lib/scheduleProcedure.ts`（または新設する`src/lib/roadmapSubmissionInfo.ts`）に置く。

```ts
// 設計イメージ（本Sprintでは適用しない）
export type RoadmapSubmissionInfo = {
  officeName: string | null;      // 提出先名
  submissionMethod: string | null; // 提出方法（procedures.submission_methodをそのまま使う）
  officialUrl: string | null;      // 公式URL（無ければnull。以下の優先順位で決定）
  officialUrlStatus: LinkStatus | null; // 呼び出し側が「未確認」等を表示するかの判断に使う
};

// 優先順位: official_url → website_url → null（推測しない。無ければnullを返すのみ）
// status==='broken'の場合のみ fallback_url があればそちらを使う（ProcedureLinkと同じ規約）
export function buildRoadmapSubmissionInfo(proc: ScheduleProcedure): RoadmapSubmissionInfo {
  const office = proc.office;
  const status = office?.official_url_status ?? null;
  const rawUrl = status === 'broken' ? (office?.fallback_url ?? null) : (office?.official_url ?? office?.website_url ?? null);
  return {
    officeName: office?.name ?? null,
    submissionMethod: proc.submission_method ?? null,
    officialUrl: rawUrl,
    officialUrlStatus: status,
  };
}
```

この関数は**DOM/JSXに一切依存しない**ため、以下のすべてから同一ロジックで呼び出せる。

- `AnnualRoadmapView`（React、リンクボタンとして描画）
- 将来のExcel出力（[ROADMAP.md](ROADMAP.md)構想。行データの1列として`officialUrl`文字列を埋め込むだけでよい）
- 将来のPDF出力（同上。テキストとして`officeName`・`submissionMethod`・`officialUrl`を並べるだけでよい）

**「共通のRoadmap表示データとして組み立てる」という要件は、この「JSXを一切生成しない純粋関数」を
唯一の変換経路にすることで満たす。** 表示側（React）・出力側（Excel/PDF、将来実装）は、いずれも
この関数の戻り値（プレーンオブジェクト）を消費するだけで、URL選択ロジックを重複させない。

### 1-3. `RoadmapItem`自体は変更しない

`RoadmapItem`（`roadmap.ts`）は`{ procedure, dueDate, confidence }`のまま変更不要。
`buildRoadmapSubmissionInfo(item.procedure)`を呼び出し側（`AnnualRoadmapView`や将来の出力関数）が
都度呼べばよく、`RoadmapItem`自体に提出先情報を事前計算して埋め込む必要は無い
（既存の「保存しない・都度計算する」というAnnual Roadmap Engineの設計原則、`roadmap.ts`冒頭コメント
と一貫させる）。

---

## 2. UI設計（AnnualRoadmapView）

### 2-1. 表示位置・形式

現在のカード（`item.procedure.name` + カテゴリタグ + 日付 + Confidenceタグ + ステータス、
1行レイアウト）に対し、提出先名を**手続き名の下に小さく追加**し、公式URLがある場合のみ
アイコンリンクボタンを追加する。ScheduleListの`ProcedureRow`（0-2節①②）と同じ「地図」「電子申請」
ボタンの並びの延長として、**新たに「公式ページ」ボタンを1つ追加する**イメージ
（新しいUIパターンを作らず、既存の`btn-secondary`ボタン群に合流させる）。

Roadmapは`/result`と異なり手続き件数が多い（3年分で数十〜100件超になりうる、Sprint47検証時に
月次手続きだけで36件を確認済み）ため、`/result`の`ProcedureRow`のような展開式の詳細セクションは
**追加しない**。1行に収まる最小限の追加（提出先名のテキスト＋公式URLがある場合のみ小さいリンク
アイコン）に留める。

### 2-2. 「URLが無ければ出さない」の実装方針

`buildRoadmapSubmissionInfo().officialUrl === null`の場合、リンクボタン自体を描画しない
（`ProcedureLink`/`OfficialSiteLink`と同じ`if (!href) return null`の思想）。**代替リンク
（別市区町村の窓口等）を推測して埋めることはしない**（0-7節・VISION.mdの「実務データの検証なしの
断定をしない」原則）。

`officialUrlStatus === 'unchecked'`の場合は、既存の`ProcedureLink`/`OfficialSiteLink`と同じく
**リンク自体は表示し**、末尾に小さく「（未確認）」を添える（0-7節の通り91%が該当するため、
「未確認だから表示しない」にすると実質ほとんどの窓口リンクが消えてしまい、機能として成立しない）。
`officialUrlStatus === 'broken'`の場合は、`fallback_url`があればそちらへのリンクに切り替える
（既存2パターンと同じ規約）。

### 2-3. 提出方法（submission_method）の表示

`ScheduleProcedure.submission_method`は**既に存在する**（`scheduleProcedure.ts`で既に運ばれている）。
表示していないのは`AnnualRoadmapView`側だけなので、こちらは型変更不要でカードに1行追加するだけで
表示できる。長文になりうるため（例:「市区町村窓口へ持参、郵送、またはeLTAX・地方税共通納税システムに
よるオンライン提出」）、Roadmapの1行カードには収まりきらない可能性がある。2-1節の「展開式にしない」
方針と合わせ、**省略表示（`truncate`等）にするか、ホバー時のみ全文表示するか**は実装Sprintでの
UI微調整事項とし、本設計では「表示する」ことのみを確定させる。

---

## 3. Engineへの影響

**期限計算ロジック（`calculateNextDeadline`・`expandOccurrences`・`applyCompanyProfileToProcedures`）
はいずれも変更しない。** 本Sprintの変更は「既に計算済みの`RoadmapItem`から、既に取得済みだが
捨てられていたOffice情報を取り出して表示する」ことに限定される。`resolveOffices`・`runDiagnosis`・
`buildAnnualRoadmap`のDB問い合わせ回数・クエリ内容もすべて既存のまま変更しない
（0-4節・0-5節で確認済み）。

---

## 4. 実装範囲（MVP、Sprint51想定）

1. `src/lib/types.ts`の`JurisdictionOffice`は変更不要（既にフル情報を持っている）
2. `src/lib/scheduleProcedure.ts`: `ScheduleProcedure.office`型に4フィールド追加、
   `toScheduleProcedure()`の絞り込みを緩和（1-1節）
3. `src/lib/scheduleProcedure.ts`（または新設ファイル）に`buildRoadmapSubmissionInfo()`を追加（1-2節）
4. `src/components/AnnualRoadmapView.tsx`: カードに提出先名・提出方法・公式URLリンクを追加（2節）。
   `buildRoadmapSubmissionInfo()`を呼ぶだけで、URL選択ロジックをコンポーネント内に書かない
5. `/result`（ScheduleList）側は変更不要（既存の3パターンはそのまま。今回追加する
   `buildRoadmapSubmissionInfo()`をScheduleList側が使うかどうかは任意——重複コード削減の
   観点では望ましいが、既存の展開式UIとは表示形式が異なるため、Sprint51のレビューで判断する）

DB変更・migrationは不要（0-4節・0-6節の通り、既存のGRANT/RLSのまま新しいクエリを追加しない設計）。

---

## 5. スコープ外（本Sprintでは扱わない）

- **福岡県`municipal_tax`/`prefectural_tax`窓口データの投入**（0-7節）: [BETA_BACKLOG.md](BETA_BACKLOG.md)
  M-02として既に登録済みの別課題。データが無い場合は「情報なし」と正直に表示するのが本Sprintの
  責務であり、データ投入自体は別Sprintで扱う
- **Excel/PDF出力機能自体の実装**: [ROADMAP.md](ROADMAP.md)の将来構想。本Sprintは
  `buildRoadmapSubmissionInfo()`という「再利用可能な部品」を用意するところまでで、出力機能本体
  （ファイル生成・レイアウト）は別Sprintのスコープ
- **`official_url_status`の一括再検証（`unchecked`→`ok`/`broken`の判定）**: `/admin/links`
  （既存のリンク健全性チェック機能）の役割であり、本Sprintでは触れない
- **`office.official_url`が無い場合の代替表示（例:「お近くの窓口を検索」等の外部検索リンク生成）**:
  推測にあたるため今回は行わない。将来検討する場合も新規の要件として別途設計する

---

## まとめ

- **現状の最大のギャップ**: `AnnualRoadmapView`は提出先情報を一切表示しておらず、加えて
  `ScheduleProcedure.office`がOffice公式URL関連フィールドを`toScheduleProcedure()`の時点で
  切り捨てている。DB問い合わせ（`resolveOffices`）自体は既に必要な情報を取得済み
- **推奨設計**: (1) `ScheduleProcedure.office`型を4フィールド拡張、(2) URL選択ロジックを
  JSXから独立した純粋関数`buildRoadmapSubmissionInfo()`に集約、(3) `AnnualRoadmapView`はその
  関数の戻り値を描画するだけにする。この3点で「共通のRoadmap表示データ」「将来のExcel/PDF再利用」
  「URLが無ければ出さない」「未登録時は推測しない」をすべて満たす
- **DB/RLSへの影響**: なし。`resolveOffices`のmunicipality_idスコープは維持し、新しい
  クエリ経路を追加しない。`organization_offices`のGRANT/RLSは既存のまま変更しない
  （0-6節、「テーブル全体をanonに新規公開する」という意味での変更は発生しない）
- **Engineへの影響**: なし。期限計算ロジックは一切変更しない
- **既知の制約として残るもの**: 福岡県の`municipal_tax`/`prefectural_tax`窓口データ不足
  （[BETA_BACKLOG.md](BETA_BACKLOG.md) M-02、対応済みではなく「正直に情報なしと表示する」対応に留まる）
- **Sprint51での実装対象**: 上記4節の5項目。型拡張・純粋関数の追加・表示コンポーネントの拡張のみで、
  migrationなし・Engine変更なしで完結する見込み
