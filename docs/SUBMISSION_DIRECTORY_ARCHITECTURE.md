# SUBMISSION_DIRECTORY_ARCHITECTURE.md — Submission Directory 全体構成（Phase5-4）

**作成日**: 2026-07-17
**目的**: Resolver・Adapter・Cutover・Workspace・Preview Route・Submission Rules・Geography・Office Sourcesの関係をコードから起こして図示する。[RESOLVER_COVERAGE.md](RESOLVER_COVERAGE.md)が「どこまでデータがあるか」を扱うのに対し、本書は「どういう経路でデータが画面まで届くか」を扱う。

---

## 1. レイヤー構成（コンポーネント図）

```mermaid
flowchart TB
    subgraph DB["Supabase（PostgreSQL）"]
        direction TB
        subgraph NewSchema["新スキーマ（Submission Directory）"]
            SO["submission_offices"]
            OS["office_sources"]
            SJ["submission_jurisdictions"]
            PSR["procedure_submission_rules"]
        end
        subgraph OldSchema["旧スキーマ"]
            ORG["organizations / organization_offices"]
            JUR["jurisdictions"]
        end
        subgraph Geo["Geography Master"]
            PREF["prefectures"]
            MUNI["municipalities（canonical 6桁コード）"]
        end
        PROC["procedures（office_type列でデフォルトカテゴリを保持）"]
    end

    subgraph Lib["src/lib/"]
        subgraph SDdir["submissionDirectory/（新Resolver本体・変更禁止）"]
            DA["dataAccess.ts"]
            RES["resolve.ts"]
            SM["stateModel.ts"]
            EXP["explain.ts"]
            IDX["index.ts: resolveSubmissionOfficeForCompany()"]
        end
        ADAPT["submissionDirectoryAdapter/index.ts: toPreviewView()"]
        subgraph CutoverLib["submissionDirectoryCutover/"]
            DEC["decision.ts（純粋関数・DBアクセスなし）"]
            COIDX["index.ts: applyCutoverToProcedure / applyCutoverToRoadmapYears"]
        end
        WSL["workspaceLoader.ts: loadWorkspaceRoadmapContext()"]
        DIAG["diagnosis.ts: resolveOffices()（旧Resolver）"]
        ROADMAP["roadmap.ts: buildAnnualRoadmap()（無変更）"]
    end

    subgraph UI["画面層"]
        PREVIEW["/admin/submission-directory-preview（Server Component、隔離）"]
        WSDASH["Workspace Dashboard / Roadmap（/admin/workspaces/[id]/...）"]
        RESULT["/result（診断エンジン、Cutover未接続）"]
        PDF["PDF出力"]
        EXCEL["Excel出力"]
    end

    DA --> SO & OS & SJ & PSR
    DA --> MUNI & PREF
    DA --> PROC
    RES --> DA
    SM --> RES
    EXP --> SM
    IDX --> DA & RES & SM & EXP

    ADAPT --> IDX
    PREVIEW --> ADAPT

    DEC -.型のみimport・DBアクセスなし.-> IDX
    COIDX --> DEC
    COIDX --> IDX

    WSL --> ROADMAP
    WSL --> COIDX
    WSDASH --> WSL
    PDF --> WSL
    EXCEL --> WSL

    DIAG --> JUR
    JUR --> ORG
    RESULT --> DIAG
    WSL -."対象外・resolved以外は".-> DIAG

    style CutoverLib fill:#fff3cd,stroke:#d39e00
    style SDdir fill:#d1ecf1,stroke:#0c5460
    style PREVIEW fill:#f8d7da,stroke:#842029
```

**凡例**: 黄色（Cutover）＝新旧の橋渡し層。水色（新Resolver）＝変更禁止の本体。赤（Preview）＝隔離ルート、他画面と非接続。

---

## 2. データフロー（Workspace Roadmap表示時のシーケンス）

```mermaid
sequenceDiagram
    participant U as ユーザー（管理者）
    participant Page as Workspace Roadmapページ
    participant WSL as workspaceLoader.loadWorkspaceRoadmapContext
    participant RM as roadmap.buildAnnualRoadmap（無変更）
    participant Diag as diagnosis.resolveOffices（旧Resolver）
    participant CO as submissionDirectoryCutover
    participant SD as submissionDirectory.resolveSubmissionOfficeForCompany

    U->>Page: ページアクセス
    Page->>WSL: loadWorkspaceRoadmapContext(company)
    WSL->>RM: buildAnnualRoadmap(companyProfile, state)
    RM->>Diag: resolveOffices(municipalityId)（procedure毎）
    Diag-->>RM: JurisdictionOffice[]（旧データ、municipal_tax等は渋谷区以外0件）
    RM-->>WSL: roadmapYearsBeforeCutover

    WSL->>CO: applyCutoverToRoadmapYears(roadmapYears, location)
    loop 対象procedure_idごと（重複排除済み）
        CO->>CO: isPhase5_2Target(municipalityCode, procedureId)
        alt 対象外（3都市×municipal_tax/asset_tax以外）
            CO-->>CO: 何もしない（procedureをそのまま返す）
        else 対象
            CO->>SD: resolveSubmissionOfficeForCompany(procedureId, location)
            SD-->>CO: SubmissionOfficeResolution（status等）
            CO->>CO: shouldUseCutoverResult(status)
            alt status === 'resolved'
                CO->>CO: mergeOfficeOverlay(旧office, 新primaryOffice)
                CO-->>CO: 新officeで上書きしたprocedureを返す
            else resolved以外
                CO-->>CO: procedureをそのまま返す（旧結果維持）
            end
        end
    end
    CO-->>WSL: roadmapYears（一部上書き済み）
    WSL-->>Page: WorkspaceRoadmapContext
    Page-->>U: 画面表示（PDF/Excel出力も同じroadmapYearsを再利用）
```

**要点**: `buildAnnualRoadmap`（Roadmap Engine本体）は一切変更されていない。新Resolverの結果は「後から上書きするオーバーレイ」として適用され、対象外・非`resolved`の場合は完全に無変化（非破壊的設計）。

---

## 3. 各コンポーネントの責務（表）

| コンポーネント | ファイル | 責務 | DBアクセス | 呼び出し可能な場所 |
|---|---|---|---|---|
| dataAccess | `submissionDirectory/dataAccess.ts` | 新4テーブル・`municipalities`/`prefectures`/`procedures`への問い合わせのみ | あり | Server Component / Server Action |
| resolve | `submissionDirectory/resolve.ts` | 会社所在地・procedure_submission_rules・submission_jurisdictionsから候補窓口を決定する純粋関数 | なし | どこでも（ユニットテスト可） |
| stateModel | `submissionDirectory/stateModel.ts` | `CandidateMatch` → `ResolutionStatus`/`VerificationStatus`への変換 | なし | どこでも |
| explain | `submissionDirectory/explain.ts` | 公開表示用の説明文・検証ラベル・requiredActionの組み立て | なし | どこでも |
| index（オーケストレーター） | `submissionDirectory/index.ts` | 上記4つを順に呼び出し`SubmissionOfficeResolution`を組み立てる、唯一の公開エントリーポイント | あり（dataAccess経由） | Server Component / Server Action |
| Adapter | `submissionDirectoryAdapter/index.ts` | `SubmissionOfficeResolution` → Preview表示用の軽量ビュー型への変換 | なし | **Server Componentのみ**（過去のRSC境界インシデント対応、後述） |
| Cutover decision | `submissionDirectoryCutover/decision.ts` | 対象判定（`isPhase5_2Target`）・採用可否判定（`shouldUseCutoverResult`）・マージ（`mergeOfficeOverlay`）の純粋関数 | なし | どこでも（ユニットテスト可、Node ESM直接実行対応） |
| Cutover orchestration | `submissionDirectoryCutover/index.ts` | decision.tsを使い、新Resolverを呼び出して`ScheduleProcedure`/`RoadmapYear[]`を上書きする | あり（新Resolver経由） | **Server Componentのみ** |
| workspaceLoader | `workspaceLoader.ts` | Workspace Dashboard/Roadmapが必要とする一式を取得し、Cutoverを適用する集約点 | あり | Server Component |
| Preview Route | `admin/(protected)/submission-directory-preview/page.tsx` | 固定4ケースで新Resolverを直接呼び出し、隔離環境で結果表示する内部確認用画面 | あり | 管理画面限定・他画面と非接続 |

---

## 4. 【重要】Server/Client Component境界のルール

`memory: incident_result_500_rsc_boundary`（2026-07-04、`/result`の500エラー実インシデント）を踏まえ、以下のルールがコード内コメントで明記されている。

- `submissionDirectoryAdapter/index.ts`・`submissionDirectoryCutover/index.ts`はいずれも**`'use client'`を付けたファイルに置かない・そこからexportしない**
- Server Component（Preview Route・`workspaceLoader.ts`経由のページ）からのみ呼び出す
- `submissionDirectoryCutover/decision.ts`は意図的に**相対importを一切持たない**（`import type`のみ）。Node 24のネイティブTS実行で`node --test`により単体テストを直接実行できるようにするための設計（本番のtsconfig.jsonは変更しない）

---

## 5. `/result`・共有ページとの関係（未接続であることの明示）

現時点でCutoverが配線されているのは`workspaceLoader.ts`経由のWorkspace Dashboard/Roadmap/PDF/Excel出力のみ。以下は**新Resolver・Cutoverのいずれとも接続していない**（[docs/PHASE5_UI_CUTOVER_PLAN.md](PHASE5_UI_CUTOVER_PLAN.md) Part C設計時点の意図的なスコープ限定）。

- `/result`（診断エンジン、`src/lib/diagnosis.ts: runDiagnosis` → `resolveOffices`が旧Resolverのみを使用）
- Workspace共有ページ（Share機能。存在すれば旧Resolver経由のデータをそのまま使う想定、本書では実装有無まで確認していない）

この2点は[TECHNICAL_DEBT_SUBMISSION_DIRECTORY.md](TECHNICAL_DEBT_SUBMISSION_DIRECTORY.md)の技術的負債として別途整理する。
