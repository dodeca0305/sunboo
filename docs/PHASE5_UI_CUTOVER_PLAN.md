# PHASE5_UI_CUTOVER_PLAN.md — Phase5「UIカットオーバー」第1段階: 調査と実装計画

**ステータス: 調査・計画のみ。コード変更はこのドキュメントでは一切行っていない。**

前提: [docs/NATIONAL_SUBMISSION_DIRECTORY.md](NATIONAL_SUBMISSION_DIRECTORY.md)がPhase5として
「呼び出し元を影響範囲の小さい順に1つずつカットオーバー」と位置づけていた段階。Phase4で
札幌市の提出先データ投入・Resolver直接検証（8件PASS）が完了したことを受け、本ドキュメントは
その第1段階（安全な接続方法の調査・設計）を扱う。`src/lib/submissionDirectory/`配下・
Migration・DBデータは変更しない。

---

## Part A. 調査結果

### A-1. 旧`resolveOffices`を呼んでいる全箇所

```
resolveOffices（src/lib/diagnosis.ts:144）
  └─ runDiagnosis（同ファイル:192、210行目で呼び出し）
       ├─ src/app/(site)/result/page.tsx（Server Component、直接呼び出し）
       └─ buildAnnualRoadmap（src/lib/roadmap.ts、runDiagnosisを内部で呼ぶ）
            └─ loadWorkspaceRoadmapContext（src/lib/workspaceLoader.ts）
                 ├─ src/app/admin/(protected)/workspaces/[id]/roadmap/page.tsx（Server Component）
                 ├─ src/app/admin/(protected)/workspaces/[id]/page.tsx（Dashboard、Server Component）
                 ├─ src/app/share/[token]/page.tsx（共有ページ、Server Component）
                 └─ RoadmapPdfExportButton/RoadmapExcelExportButton 経由のPDF/Excel出力
  └─ src/lib/events.ts:93（registerCompanyEvent、経営イベント登録。呼び出し元は
       src/app/(site)/events/page.tsx、Client Component）
```

**重要な発見**: `resolveOffices`はUIページから直接呼ばれたことは一度も無い。必ず`runDiagnosis`
（診断エンジン）または`events.ts`（経営イベントエンジン）を経由する。つまりカットオーバーの
接続点は「UIページ」ではなく「`runDiagnosis`/`buildAnnualRoadmap`が返す`ProcedureResult.office`
（またはそれを軽量化した`ScheduleProcedure.office`）」である。

### A-2. 旧Resolverの入力型・戻り値・表示先

| 項目 | 内容 |
|---|---|
| 関数 | `resolveOffices(client, municipalityId: number): Promise<JurisdictionOffice[]>` |
| 呼び出し粒度 | **市区町村単位で1回**。その市区町村の全`office_type`をまとめて取得し、`procedures.office_type`文字列でMap引きする（procedure単位の上書き機構は無い＝`procedure_submission_rules`に相当する仕組みが存在しない） |
| `JurisdictionOffice`型 | `id, municipality_id, office_type, name, address, phone, website_url, map_url, official_url, official_url_status(LinkStatus4値), official_url_checked_at, fallback_url, postal_code, fax, email, e_filing_url, download_page_url, business_hours, notes` |
| `ProcedureResult.office` | `JurisdictionOffice \| null`（procedure_typeで見つからなければnull、理由は区別されない） |
| `ScheduleProcedure.office`（UI表示用に絞込み） | `name, map_url, official_url, website_url, official_url_status, fallback_url`のみ（`src/lib/scheduleProcedure.ts`） |
| 表示先 | ① `result/page.tsx`の「管轄機関」独立セクション（`result.offices`を`JurisdictionOffice`のまま表示）／② `ScheduleList.tsx`・`AnnualRoadmapView`（procedureごとに`ScheduleProcedure.office`を表示、`buildRoadmapSubmissionInfo`でURL選択ロジックを適用） |

### A-3. 新Resolver `resolveSubmissionOfficeForCompany()` の入力型・戻り値

| 項目 | 内容 |
|---|---|
| 関数 | `resolveSubmissionOfficeForCompany(client, { procedureId, municipalityCode, prefectureCode, context? }): Promise<SubmissionOfficeResolution>` |
| 呼び出し粒度 | **procedure単位で1回**。`procedure_submission_rules`による手続き別の`office_category`上書きに対応するため、設計上procedureごとに呼ぶ必然性がある |
| 入力 | `municipalityCode`/`prefectureCode`は**公開コード文字列**（`municipalities.code`/`prefectures.code`そのもの）。旧`resolveOffices`が要求する内部`municipalityId`への変換が不要（UI側が既に持っている値をそのまま渡せる） |
| `SubmissionOfficeResolution`型 | `status(5値)、primaryOffice(PublicOfficeView\|null)、alternativeOffices、reason、source、verificationStatus(2値)、lastVerifiedAt、publicVerificationLabel、requiredAction、metadata` |
| `PublicOfficeView`型 | `officeCategory, name, organizationName, address, phone, officialUrl, websiteUrl, mapUrl, fallbackUrl`（`postalCode`/`fax`/`email`/`businessHours`等は含まれない、表示に必要な範囲のみ） |

### A-4. 両者の差分（アダプタ設計の起点）

| 観点 | 旧 | 新 | 影響 |
|---|---|---|---|
| 呼び出し粒度 | 市区町村単位（1回で全office_type取得） | procedure単位（procedureごとに1回） | 手続き数がN件ならDB問い合わせがN回に増える。Phase5-1（後述、少数procedure限定）では実害なし。将来Workspace Roadmap全体に広げる際はバッチ化を検討課題として記録する（本計画では実施しない） |
| 入力の型 | `municipalityId`（内部integer、事前に`municipalities`から引く必要あり） | `municipalityCode`/`prefectureCode`（公開コード文字列、UIが既に持つ値） | 新方式の方がUI層との親和性が高い（変換ステップが減る） |
| Office型のフィールド | `postal_code`/`fax`/`email`/`business_hours`/`notes`を含むフルセット | 表示用に絞った`PublicOfficeView`（上記フィールド無し） | 現行UI（`ScheduleProcedure.office`）は元々このフルセットを使っていない（`name/map_url/official_url/website_url/official_url_status/fallback_url`のみ）ため、実質的な表示欠落は無い |
| URLステータス表現 | `office.official_url_status`（`LinkStatus`4値: ok/broken/redirected/unchecked）がoffice自体に付く | `verificationStatus`（2値: verified/unverified）が**レスポンス全体**に付く（office内ではない）、加えて`publicVerificationLabel`（表示用文言）が別途提供される | **型が非互換。単純な値の読み替えではなく、構造ごと変換するアダプタが必要**（A-5節） |
| 「見つからない」の理由 | 常に`office: null`の1パターン（未整備なのか入力不足なのか区別不可） | 5状態（`resolved`/`multiple_candidates`/`insufficient_profile`/`requires_employee_address`/`not_supported`）で区別 | UI側に新しい分岐が必要（本計画7節） |
| brokenリンク時のfallback切替 | `official_url_status==='broken'`なら`fallback_url`へ切り替える専用ロジックが`OfficialSiteLink`にある | 新方式に`broken`相当の値が無い（`verificationStatus`は verified/unverified の2値のみ） | 新方式では現状「リンク切れ」を積極的に検知する仕組みがまだ無い。当面`fallbackUrl`はデータとして持つが、自動切替のトリガーが無い状態（アダプタでは`unverified`時に切替はしない、既存の`broken`挙動と混同しない） |

### A-5. 会社所在地・procedure codeの取得元（既存UIでの実態）

| 呼び出し元 | 会社所在地の取得元 | procedureの取得元 |
|---|---|---|
| `(site)/result/page.tsx` | URLクエリパラメータ`pref`/`muni`（`searchParams`） | `runDiagnosis`内で`procedures`テーブルを一括取得（各procedureの`id`は取得済み） |
| `(site)/events/page.tsx` | `CompanyProfile`（localStorage、`companyProfile.ts`） | 同上（`events.ts`経由） |
| Workspace（`workspaces/[id]/roadmap`等） | `workspace_companies.prefecture_code`/`municipality_code`（`loadWorkspaceCompany`） | `buildAnnualRoadmap`内で`procedures`テーブルを一括取得 |
| `/share/[token]` | Workspaceと同じ（`workspace_companies`経由） | 同上 |

**結論**: どの呼び出し元でも、新Resolverが要求する`municipalityCode`/`prefectureCode`（公開コード文字列）は**既に取得済みか、1回のDB問い合わせで容易に取得できる**。新規の入力経路を追加する必要はない。

### A-6. Server Component / Route Handler / Client Componentのどこで呼ぶべきか

**Server Component（またはRoute Handler）から呼ぶべきであり、Client Componentから直接呼んではならない。**

理由:
1. `resolveSubmissionOfficeForCompany`はSupabaseへの複数回の問い合わせを内部で行う非同期関数であり、既存の`runDiagnosis`/`buildAnnualRoadmap`と同じ「UIにロジックを書かせない、共通サービスとして提供する」方針（`src/lib/submissionDirectory/index.ts`冒頭コメント）に従う
2. **過去に実際に起きた事故（`memory: incident_result_500_rsc_boundary`）** — `'use client'`ファイルからexportされた関数を、Server Componentが直接呼び出したことで本番`/result`が500エラーになったインシデントが2026-07-04に発生している。原因は`toScheduleProcedure`が`ScheduleList.tsx`（Client Component）からexportされていたため。**この教訓を踏まえ、新Resolverとその変換用アダプタ関数は、`'use client'`が付いたファイルには絶対に置かない**。新規に作る場合は`src/lib/`配下のプレーンなモジュール（例: `src/lib/submissionDirectoryAdapter.ts`）に置く

### A-7. Supabase service role・秘密情報の露出確認

**本プロジェクトはservice role keyを一切使用していない**（`grep -rn "SERVICE_ROLE"`で0件）。
Server Component用の`createServerSupabase()`（`src/lib/supabase/server.ts`）もサイト公開用の
`supabase`（`src/lib/supabase.ts`）も、いずれも同じ`NEXT_PUBLIC_SUPABASE_ANON_KEY`を使い、RLSで
アクセス制御している。**新Resolverもこの既存方針をそのまま踏襲すればよく、追加の秘匿情報保護策は
不要**（新しい環境変数・新しいクライアント生成コードを増やす必要が無い）。

### A-8. status別のUI表示方針（D4状態モデルの表示への落とし込み）

| status | 表示方針 |
|---|---|
| `resolved` | 新提出先（`primaryOffice`）を表示。`verificationStatus==='unverified'`なら`publicVerificationLabel`（例:「（未確認）」）を添える |
| `multiple_candidates` | 主候補を表示し、「住所によっては別窓口が対象になる場合があります」等の注記（D3・既存stateModel.tsの設計通り） |
| `insufficient_profile` | 「会社情報の入力が完了すると提出先が表示されます」。**旧データにフォールバックしない** |
| `requires_employee_address` | 「従業員ごとに提出先が異なります」の定型文。窓口を断定しない（D2既存方針） |
| `not_supported` | 「対応エリア外」を明示。**ここが今回もっとも重要**: 新Resolverが`not_supported`を返した場合に、こっそり旧`resolveOffices`の結果を代わりに出す「フォールバック」は行わない（Unknown is better than Wrongの侵害になる。新旧が異なる正本を持つ場合に混在させない） |
| （新Resolverが例外を投げた場合） | procedure_idが存在しない等の前提エラー。UIとしては旧表示を維持し、サーバーログにのみ記録する（呼び出し側の実装ミスであり、業務上の状態ではないため） |

### A-9. 既存`organizations`系表示を残す必要があるケース

新Resolver（`submission_offices`等4テーブル）にデータが存在するのは、現時点で**福岡県の一部
（`tax_office`等5分類の全72判定単位、`prefectural_tax`の全72判定単位）と、`municipal_tax`/
`municipal_asset_tax`は札幌市10区・福岡市7区・北九州市7区（`municipal_asset_tax`は北九州市分は
未投入）のみ**。それ以外の地域・分類（東京都渋谷区を含む）は新Resolverだと`not_supported`に
なるが、**旧`resolveOffices`側にはデータが存在する**（渋谷区・福岡県の5分類等）。

**結論**: 新Resolverで`resolved`/`multiple_candidates`が返った場合のみ新データに差し替え、
それ以外（`not_supported`等）では**既存の旧表示（`JurisdictionOffice`ベース）をそのまま使う**、
という「重ね合わせ」方式が必須。新Resolverの`not_supported`を見て旧表示ごと消してしまうと、
渋谷区・福岡県の既存ユーザー体験を破壊する（重大な回帰）。

### A-10. Playwrightで検証可能な最小の接続単位

既存の`/result`・Workspace Roadmap・共有ページのいずれも変更せず、**新規の隔離されたプレビュー
専用ルート**（例: `/admin/(protected)/submission-directory-preview`）を1つ追加し、
`procedureId`・`municipalityCode`をクエリパラメータで受け取って新Resolverの結果だけを表示する
のが、最小かつ最も安全な接続単位である。既存ページのレンダリング結果に一切影響を与えないため、
Playwrightでも「このURLにアクセスして期待するstatusが表示される」という単純な確認で足りる。

---

## Part B. 実装計画（Phase5-1）

### B-1. 現状の呼び出しフロー図

```
[URLクエリ/CompanyProfile/workspace_companies]
        │ (pref/muni コード or company_id)
        ▼
runDiagnosis / buildAnnualRoadmap（診断エンジン、無変更）
        │
        ├─ resolveOffices(client, municipalityId) ─→ organizations/organization_offices/jurisdictions
        │                                            （旧4テーブル、Phase1.5）
        └─ procedures テーブル取得 → office_typeでMap引き
        ▼
ProcedureResult[] { office: JurisdictionOffice | null }
        │ toScheduleProcedure()
        ▼
ScheduleProcedure[] { office: {name, map_url, official_url, website_url, official_url_status, fallback_url} }
        │
        ▼
ScheduleList.tsx / AnnualRoadmapView（buildRoadmapSubmissionInfoでURL選択）
        │
        ▼
/result・/admin/workspaces/[id]/roadmap・/share/[token]・PDF/Excel出力
```

### B-2. 推奨する新フロー図（Phase5-1: 隔離ルートのみ、既存フローは無変更）

```
【既存フロー（B-1）】は完全に無変更のまま並走させる。

新規追加分:
[/admin/(protected)/submission-directory-preview?procedureId=&municipalityCode=&prefectureCode=]
        │ (Server Component、新規ページ)
        ▼
createServerSupabase()（既存、無変更）
        │
        ▼
resolveSubmissionOfficeForCompany(client, params)（新Resolver、無変更）
        │
        ▼
SubmissionOfficeResolution
        │ toPreviewOfficeView()（新規adapter、src/lib/submissionDirectoryAdapter.ts、'use client'ではない）
        ▼
プレビュー専用の表示コンポーネント（新規、状態バッジ付き。既存ScheduleList/AnnualRoadmapViewとは別コンポーネント）
```

**Phase5-2以降（本計画では設計のみ、実装しない）の将来像**:

```
runDiagnosis / buildAnnualRoadmap の結果を得た後、
  procedure.id が「新Resolver対応済み」であれば
    → resolveSubmissionOfficeForCompany() を追加で呼び、
      status==='resolved' or 'multiple_candidates' の場合のみ
      ProcedureResult.office を新データで上書きする adapter を通す
  それ以外（対応外 or not_supported）は
    → 既存の JurisdictionOffice ベースの office をそのまま使う（無変更）
```

### B-3. 変更対象ファイル一覧（Phase5-1限定）

**新規追加のみ。既存ファイルは1つも変更しない。**

| ファイル（新規） | 役割 |
|---|---|
| `src/lib/submissionDirectoryAdapter.ts` | `SubmissionOfficeResolution` → プレビュー表示用の軽量ビュー型への変換関数（`'use client'`を付けない、プレーンなモジュール） |
| `src/app/admin/(protected)/submission-directory-preview/page.tsx` | Server Component。クエリパラメータを受け取り、新Resolverを呼び、結果を表示する |
| `src/components/SubmissionDirectoryPreviewCard.tsx` | 表示コンポーネント（`'use client'`は不要、Server Componentから直接JSXとして使う想定。状態バッジ表示のみで対話的操作は無いため） |

既存の`ScheduleList.tsx`・`AnnualRoadmapView.tsx`・`result/page.tsx`・`roadmap.ts`・
`diagnosis.ts`・`workspaceLoader.ts`はいずれも**変更しない**。

### B-4. 各ファイルの変更内容（設計レベル）

**`src/lib/submissionDirectoryAdapter.ts`（新規）**
- `SubmissionOfficeResolution`を受け取り、以下の構造を返す純粋関数`toPreviewView`
  - `status`, `officeName`, `address`, `phone`, `officialUrl`, `websiteUrl`, `mapUrl`, `reason`,
    `publicVerificationLabel`, `requiredAction`
- DBアクセス・JSXへの依存は一切持たない（既存の`buildRoadmapSubmissionInfo`と同じ「プレーンな
  データを返す純粋関数」の設計思想を踏襲）

**`src/app/admin/(protected)/submission-directory-preview/page.tsx`（新規）**
- `searchParams`から`procedureId`（number）・`municipalityCode`・`prefectureCode`を受け取る
- `createServerSupabase()`で接続（既存admin配下のパターンをそのまま踏襲、認証ガードも
  `admin/(protected)`配下に置くことで既存のレイアウト認可がそのまま効く）
- `resolveSubmissionOfficeForCompany`を呼び、`toPreviewView`を通して`SubmissionDirectoryPreviewCard`
  へ渡すだけ（ロジックを持たない、Server Componentは配線のみ）

**`src/components/SubmissionDirectoryPreviewCard.tsx`（新規）**
- 状態（5値＋副次フラグ）に応じたバッジ・文言を出し分ける表示専用コンポーネント
- 対話的操作（クリックで状態変更等）が無いため`'use client'`は不要

### B-5. 型変換・adapterの設計

```ts
// src/lib/submissionDirectoryAdapter.ts（設計イメージ、未実装）
import type { SubmissionOfficeResolution } from './submissionDirectory';

export type PreviewOfficeView = {
  status: SubmissionOfficeResolution['status'];
  officeName: string | null;
  address: string | null;
  phone: string | null;
  officialUrl: string | null;
  websiteUrl: string | null;
  mapUrl: string | null;
  reason: string;
  publicVerificationLabel: string | null;
  requiredAction: SubmissionOfficeResolution['requiredAction'];
};

export function toPreviewView(resolution: SubmissionOfficeResolution): PreviewOfficeView {
  const office = resolution.primaryOffice;
  return {
    status: resolution.status,
    officeName: office?.name ?? null,
    address: office?.address ?? null,
    phone: office?.phone ?? null,
    officialUrl: office?.officialUrl ?? null,
    websiteUrl: office?.websiteUrl ?? null,
    mapUrl: office?.mapUrl ?? null,
    reason: resolution.reason,
    publicVerificationLabel: resolution.publicVerificationLabel,
    requiredAction: resolution.requiredAction,
  };
}
```

**Phase5-2以降で必要になる、より難しいアダプタ（本計画では設計のみ）**: `ScheduleProcedure.office`
（旧型）と`PublicOfficeView`（新型）を「同じ形」に統合するアダプタ。差分（A-4節）のうち特に
`official_url_status`（4値・office内）↔`verificationStatus`+`publicVerificationLabel`
（2値・レスポンス全体）の非対称性をどう吸収するかが設計上の主課題になる。素朴な変換案:
`verificationStatus==='unverified'` → 表示上は旧`official_url_status==='unchecked'`と同じ
バッジ（「（未確認）」）に対応させる、`verified` → バッジ無し。旧`broken`に相当する状態が
新方式に無いため、**新データ使用時は`fallback_url`への自動切替ロジック自体を発火させない**
（誤って「壊れていないリンク」を壊れている扱いにしないため）。この設計判断はPhase5-2着手時に
改めて確定させる。

### B-6. feature flag案

既存コードベースにfeature flag基盤は存在しない（GrowthBook等の導入なし、grep確認済み）。
Phase5-1では**「隔離ルート」自体がfeature flagの代替**になる（`/admin/(protected)`配下の
新規URLにアクセスしない限り新Resolverは一切呼ばれない。これ以上の仕組みは過剰）。

Phase5-2（既存ページへの条件付き統合）に進む際は、新しいSaaS基盤を導入するのではなく、
プロジェクトの規模に見合った最小のallowlist定数で足りると考える（設計案、未実装）。

```ts
// 将来案（Phase5-2、未実装）: どの municipality_code が新Resolverの対象かを明示的に列挙する
export const SUBMISSION_DIRECTORY_ENABLED_MUNICIPALITY_CODES: readonly string[] = [
  '011011', '011029', '011037', '011045', '011053', // 札幌市10区
  '011061', '011070', '011088', '011096', '011100',
];
```

環境変数によるON/OFFではなく地域コードのallowlistを推奨する理由: 新Resolverの`not_supported`は
「地域による」ものであり、一律ON/OFFのフラグでは「札幌市だけ新方式にしたいが渋谷区は旧方式のまま」
という要件（A-9節）を表現できない。

### B-7. エラー・状態表示仕様

| 状況 | 表示 |
|---|---|
| `resolved` | 窓口名・住所・電話・公式リンク。`unverified`なら「（未確認）」を併記 |
| `multiple_candidates` | 主候補＋「住所によっては別窓口が対象になる場合があります」 |
| `insufficient_profile` | 「会社情報の入力が完了すると提出先が表示されます」 |
| `requires_employee_address` | 「この手続きは従業員ごとに提出先が異なります」 |
| `not_supported` | 「お住まいの地域はまだ対応エリア外です」 |
| `resolveSubmissionOfficeForCompany`が例外を投げた場合 | プレビューページでは「取得に失敗しました」というエラーカードを表示し、`console.error`相当のログを残す（本番の`/result`等には影響しない、隔離ルートのみで発生しうる事象） |

**`matchedRuleId`（Phase5-1実装で追加表示した項目）の仕様**: `resolution.metadata.matchedRuleId`は
`procedure_submission_rules`のどの行が適用されたかを示す診断用の値であり、値の有無自体が
成功/失敗を意味するものではない。

| 値 | 意味 | Preview画面での扱い |
|---|---|---|
| `null` | `procedure_submission_rules`に一致する行が無かったため、`submission_jurisdictions`に登録された既定の提出先（procedureのデフォルト`office_category`）を使用したことを示す。**Resolverの失敗やデータ欠損を意味しない** | 「（なし）」と表示する。これは正常状態であり、異常を示す表示ではない |
| 数値（`procedure_submission_rules.id`） | 該当IDの手続き別ルール（ADR D13、[ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md](ADR_MUNICIPAL_TAX_OFFICE_CATEGORY_SPLIT.md)参照）が一致し、既定の提出先とは異なる（または手続き別に定義された）提出先が使用されたことを示す | 該当ID（例:「3」）をそのまま表示する |

例: 現時点の登録データでは、償却資産申告（`DEPRECIABLE_ASSET_TAX_RETURN`）は
`procedure_submission_rules.id=3`（`municipal_asset_tax`への無条件上書き）が適用されるため
`matchedRuleId=3`となり、法人市民税申告（`MUNICIPAL_RESIDENT_TAX_RETURN`）には対応するルール行が
無いため`matchedRuleId=null`（＝「（なし）」表示）となる。**これは現在の`procedure_submission_rules`
の登録内容による結果であり、将来ルールが追加・変更されればこれらの値も変わりうる**（例えば
法人市民税申告に新しいルールが追加されれば`matchedRuleId`が非nullになる）。仕様として固定的に
重要なのは個々の値そのものではなく、「`null`なら既定提出先が使われた」「値があれば手続き別ルールが
適用された」という意味の対応関係である。

## B-8. Playwrightテストケース

隔離ルート（`/admin/(protected)/submission-directory-preview`）に対して実施する。

| # | URL（例） | 期待する画面表示 |
|---|---|---|
| 1 | `?procedureId=65&municipalityCode=011011&prefectureCode=01` | 「中央市税事務所諸税課法人市民税係」・resolvedバッジ |
| 2 | `?procedureId=66&municipalityCode=011100&prefectureCode=01` | 「中央市税事務所固定資産税課償却資産担当」・resolvedバッジ |
| 3 | `?procedureId=66&municipalityCode=401013&prefectureCode=40` | 「対応エリア外」表示（北九州市の資産税、not_supported） |
| 4 | `?procedureId=67&municipalityCode=011011&prefectureCode=01` | 「従業員ごとに提出先が異なります」表示 |
| 5 | `?municipalityCode=&prefectureCode=` （未入力） | 「会社情報の入力が完了すると」表示（insufficient_profile） |
| 6 | 既存`/result?pref=13&muni=13113&...`（渋谷区、無変更確認） | **本Migration前と全く同じ表示**（新ルートが既存ページに影響していないことの回帰確認） |
| 7 | 既存`/admin/workspaces/[id]/roadmap`（Fukuoka所在のWorkspace企業がもしあれば） | 同上、無変更であることの回帰確認 |

いずれもブラウザコンソールエラー・ネットワークエラーが無いことを併せて確認する。

## B-9. ロールバック方法

Phase5-1は新規ファイル3点の追加のみであるため、ロールバックは該当ファイルを削除するだけで
完結する。

```
rm src/lib/submissionDirectoryAdapter.ts
rm -r src/app/admin/\(protected\)/submission-directory-preview
rm src/components/SubmissionDirectoryPreviewCard.tsx
```

既存ファイルを一切変更していないため、他機能への影響は無い。DBデータ・Migrationのロールバックは
不要（本計画はDB変更を伴わない）。

## B-10. Phase5-1として実装してよい最小差分

- 新規3ファイルの追加のみ（B-3節）
- `/admin/(protected)/submission-directory-preview`は認証必須（既存`admin/(protected)`レイアウトの
  認可をそのまま利用）とし、一般公開はしない
- 既存の`/result`・`/admin/workspaces/*`・`/share/*`・PDF/Excel出力・診断エンジン・経営イベント
  エンジン・Resolverコード・Migration・DBデータのいずれも変更しない
- `npm run build`でTypeScriptエラー0を確認し、Playwrightで隔離ルートの動作確認（B-8節）と
  既存ページの無変更確認（B-8節#6・#7）を行う

## B-11. 実装前に判断が必要な事項

1. **隔離ルートの設置場所**: `/admin/(protected)`配下（認証必須、社内確認用）を提案しているが、
   `(site)`側に置く案（例: `/debug/submission-directory`）は一般公開になり得るため推奨しない。
   この方針で良いか
2. **Phase5-2（既存ページへの統合）の対象順序**: A-9節の通り、新Resolverがデータを持つのは
   札幌市・福岡市・北九州市の一部のみ。どの画面（`/result`か、Workspace Roadmapか）から
   統合するかは、Workspace側が「正式系」（PROJECT_CONTEXT.md）である以上Workspace優先が
   自然だと考えられるが、最終判断はプロダクトオーナーに委ねる
3. **DB問い合わせ回数増加への対応要否**（A-4節）: procedure単位の呼び出しはPhase5-1の
   プレビュー用途では問題にならないが、Phase5-2でWorkspace Roadmap全体（手続き数十件）に
   広げる場合、N回の逐次呼び出しが体感速度に影響しないか検証が必要（本計画では未検証）
4. **`verificationStatus`↔`official_url_status`の表示統一方針**（B-5節後半）: 新旧混在時に
   バッジの見た目をどこまで揃えるか、デザイン担当の確認が必要
5. **`organizations`系（旧4テーブル）とのデータ二重管理の終了時期**: ADR_NATIONAL_SUBMISSION_DIRECTORY.md
   のD5（新4テーブルを正本とする）に基づき、Phase5-2以降で旧テーブルへの更新を止める
   タイミングをどこで区切るか、別途整理が必要（本計画のスコープ外）

---

## Part C. Phase5-2 適用範囲（スコープ定義）

**ステータス: 適用範囲の定義のみ。コード・DB・Migrationは本節でも一切変更しない。** Phase5-1
（隔離プレビュールート）とは別に、既存ページ（`/result`・Workspace Roadmap等）へ新Resolverを
条件付きで組み込む段階に進む際、**何を対象にし、何を対象にしないか**を先に固定する。実装自体は
本計画のスコープ外（B-11節「実装前に判断が必要な事項」の通り、着手時期はプロダクトオーナー判断）。

### C-1. 新Resolverを使う条件（すべてAND条件）

以下3条件を**すべて**満たした場合にのみ、新Resolverの結果をUIに反映してよい。1つでも欠ければ
C-2節の「既存挙動を維持」に従う。

1. **対象手続きであること**（C-3節の初期対象手続きのみ）
2. **対象自治体であること**（C-3節の初期対象自治体のみ）
3. **`resolveSubmissionOfficeForCompany()`の結果が`resolved`であること**（`multiple_candidates`を
   含む他の状態は対象外。A-8節の状態表示方針とは別に、Phase5-2の「切り替え可否」判定としては
   `resolved`のみを許可する、より保守的な基準とする）

### C-2. `resolved`以外の扱い

以下はいずれも**新Resolverへ切り替えず、既存の`resolveOffices`（旧4テーブル）の結果をそのまま
維持する**。A-9節「重ね合わせ」の原則をPhase5-2の具体的な判定基準に落とし込んだもの。

| status | 扱い |
|---|---|
| `not_supported` | 既存`resolveOffices`の結果を維持する |
| `requires_employee_address` | 既存`resolveOffices`の結果を維持する |
| `insufficient_profile` | 既存`resolveOffices`の結果を維持する |
| `multiple_candidates` | 既存`resolveOffices`の結果を維持する（C-1節の通り、Phase5-2では`resolved`のみ切替対象） |
| その他、型上存在するが未分類のstatus | 既存`resolveOffices`の結果を維持する（未知の状態を「安全側」に倒す。新しいstatusが将来追加された場合も、明示的に対象へ加えるまでは自動的に対象外とする） |

### C-3. Phase5-2初期対象

| # | 自治体 | 手続き | 現状のResolver結果（Resolver直接検証・Preview Route実装時点で確認済み） |
|---|---|---|---|
| 1 | 札幌市 | 法人市民税申告（`MUNICIPAL_RESIDENT_TAX_RETURN`） | `resolved` |
| 2 | 札幌市 | 償却資産申告（`DEPRECIABLE_ASSET_TAX_RETURN`） | `resolved` |
| 3 | 福岡市 | 法人市民税申告（`MUNICIPAL_RESIDENT_TAX_RETURN`） | `resolved` |
| 4 | 北九州市 | 法人市民税申告（`MUNICIPAL_RESIDENT_TAX_RETURN`） | `resolved` |

### C-4. Phase5-2初期対象外

| 対象外 | 理由 |
|---|---|
| 北九州市 償却資産申告（`DEPRECIABLE_ASSET_TAX_RETURN`） | 資産税担当部署のデータが未投入のため`not_supported`（`phase4_sapporo.sql`/Kitakyushu Pilotの申し送り事項どおり） |
| 給与支払報告書（`SALARY_PAYMENT_REPORT`） | `recipient_scope='each_employee'`、常に`requires_employee_address` |
| employee addressが必要な手続き全般（例: 特別徴収税額の納付`RESIDENT_TAX_WITHHOLDING`） | 同上 |
| 未対応自治体（札幌市・福岡市・北九州市以外の全市区町村） | 新Resolverにデータが存在せず`not_supported`。C-1節の「対象自治体であること」を満たさない |
| Resolverが`resolved`以外（unresolved系含む）を返したケース | C-1節・C-2節の通り、そもそも切り替え条件を満たさない |

### C-5. フォールバック原則

**新Resolverが`resolved`を返したときだけ新結果を採用する。それ以外は既存挙動（`resolveOffices`
ベースの表示）を維持する。** 新Resolver側の状態を理由に既存表示を消したり、空欄・推測値で埋めたり
しない（A-9節・C-6節と同じ原則の再掲）。

### C-6. 禁止事項

Phase5-2（既存ページへの組み込み）着手時に、以下を行わない。

- **既存Resolver（`resolveOffices`・`runDiagnosis`）の削除** — 新Resolverが未対応の地域・手続きが
  大多数を占める間は、既存Resolverが正本であり続ける
- **全自治体への一括切替** — C-3節の初期対象4ケースを超えて機械的に対象を広げない。対象拡大は
  自治体ごとのDiscovery完了（[MUNICIPAL_DISCOVERY_CHECKLIST.md](MUNICIPAL_DISCOVERY_CHECKLIST.md)）を
  都度経てから、明示的にC-3節の表を更新する形で行う
- **`not_supported`を空窓口として表示する** — 「窓口が見つからない」ことと「窓口欄を空白にする」は
  異なる。`not_supported`は理由付きの状態として扱い、空の`office`オブジェクトで黙って表示しない
- **unresolved時の推測** — `insufficient_profile`等で確定情報が無い場合に、類似自治体のデータや
  旧Resolverのデータを推測で代入しない（Unknown is better than Wrong）
- **service roleの利用** — A-7節の結論通り、既存のanon key+RLS構成を維持する。Phase5-2で
  service role keyを新たに導入しない
- **Client Component内へのResolver実装** — A-6節・過去の実インシデント（`incident_result_500_rsc_boundary`）
  の教訓を踏まえ、`resolveSubmissionOfficeForCompany()`・変換用adapterは`'use client'`を持つ
  ファイルに置かない・そこからexportしない

### C-7. ロールバック方針

**Phase5-2の変更（新Resolverへの切り替えロジック）を外せば、即座に旧Resolverのみの挙動へ戻せる
構造にする。** 具体的には、C-1節の判定（対象手続き×対象自治体×`resolved`）を1箇所の条件分岐
（またはそれに相当する小さな関数）に集約し、既存の`runDiagnosis`/`buildAnnualRoadmap`本体・
`ScheduleProcedure`/`JurisdictionOffice`の型・`ScheduleList.tsx`/`AnnualRoadmapView.tsx`の
レンダリングロジックには一切手を入れない設計とする。この条件分岐を無効化（削除、またはC-3節の
対象リストを空にする）するだけで、Phase5-1と同じ「新Resolverは呼ばれるが表示には一切反映されない」
状態へ即座に戻せることを、実装時の受け入れ条件とする（B-9節のPhase5-1ロールバック方針と同じ
「新規追加分を無効化するだけで完結する」設計思想を踏襲する）。

---

## まとめ

- 旧Resolverの接続点は「UIページ」ではなく`runDiagnosis`/`buildAnnualRoadmap`の内部（A-1節）
- 新旧の型差分のうち最も設計が難しいのは`official_url_status`（4値・office内）と
  `verificationStatus`（2値・レスポンス全体）の非対称性（A-4節・B-5節）
- Service role等の追加保護は不要（既存方針で十分、A-7節）
- **Phase5-1として提案する最小差分は、既存ページを一切変更しない隔離プレビュールートの新設のみ**
  （B-3〜B-10節）。旧Resolverは削除せず、新Resolverが`resolved`/`multiple_candidates`を返す
  場合にのみ新データを使うという「重ね合わせ」の原則（A-9節）は、Phase5-2着手時の設計にも
  引き継ぐ

レビュー待ちで停止する。
