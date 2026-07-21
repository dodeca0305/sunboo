# PHASE5_2B_PLAN.md — `/result`・Share へのCutover適用 調査計画（Phase5-2b）

**作成日**: 2026-07-17
**ステータス**: 調査のみ完了。**コード変更は一切行っていない**（`git status`で本ファイル追加のみであることを確認可能）。
**目的**: Workspaceで実装済みのSubmission Directory Cutover（Phase5-2）を`/result`・Share（`/share/[token]`）へ適用するための設計調査。Overlay方式を維持し、Resolver本体（`src/lib/submissionDirectory/`）を書き換えず、対象外は必ず旧Resolverの結果を維持する（Unknown is better than Wrong）という制約の下で、実装可能性を確認する。

---

## 1. 現状（3つの画面のデータフロー）

### 1-1. Workspace（Phase5-2で対応済み、比較の基準点）

```
workspaceLoader.loadWorkspaceRoadmapContext()
  → roadmap.buildAnnualRoadmap()                    … RoadmapYear[] を生成（無変更）
  → submissionDirectoryCutover.applyCutoverToRoadmapYears()
      → 対象(municipalityCode, procedureId)のみ新Resolverを呼び出し
      → resolved のときだけ mergeOfficeOverlay で上書き
  → RoadmapYear[]（一部上書き済み）を Dashboard/Roadmap/PDF/Excel が共通利用
```

呼び出し元: `src/app/admin/(protected)/workspaces/[id]/*` 各ページ（Server Component）。Supabaseクライアントは`createServerSupabase()`（`@/lib/supabase/server`、Cookieセッション付き）。

### 1-2. `/result`（診断エンジン）

```
result/page.tsx（Server Component、'use client'なし）
  → diagnosis.runDiagnosis(supabase, DiagnosisInput)
      → resolveOffices(client, municipalityId)          … 旧jurisdictionsのみを参照
      → DiagnosisResult { offices: JurisdictionOffice[], procedures: ProcedureResult[] }
        procedures[].office は officeMap.get(procedure.office_type) で紐付け済み（JurisdictionOffice | null）
  → result.procedures.map(toScheduleProcedure)         … ScheduleProcedure[] へ変換
  → ScheduleList（Client Component）が受け取って表示
  → 別途 result.offices（JurisdictionOffice[]、手続きに紐付かないフラットな一覧）を
    ページ上部の「管轄機関」グリッドで独立して表示
```

呼び出し元のSupabaseクライアントは`@/lib/supabase`の`supabase`（Cookie無しのanonクライアント、ブラウザ用と同一インスタンスをServer Componentからそのまま呼んでいる既存パターン）。

**重要な発見**: `runDiagnosis`は`buildAnnualRoadmap`（1-1節）が内部で呼んでいるのと**同一の関数**である（`roadmap.ts`が`runDiagnosis`を呼び、その結果を`toScheduleProcedure`で変換している）。つまり`/result`とWorkspace/Shareの手続きレベルのデータ生成経路は、実は同じ2段階（`runDiagnosis` → `toScheduleProcedure`）を通っている。

### 1-3. Share（`/share/[token]`）

```
share/[token]/page.tsx（Server Component、'use client'なし）
  → supabase.rpc('get_shared_workspace_view', { p_token })   … 会社情報・ステータスのみRPC取得
  → workspaceRowsToCompanyProfile()                            … CompanyProfile組み立て
  → buildWorkspaceTimelineEvents() → buildStateFromTimeline()
  → roadmap.buildAnnualRoadmap(supabase, companyProfile, state, 3)   … RoadmapYear[] を生成（無変更）
  → AnnualRoadmapView（Client Component）へRoadmapYear[]をそのまま渡す
```

呼び出し元のSupabaseクライアントは`/result`と同じ`@/lib/supabase`の`supabase`。**`workspaceLoader.loadWorkspaceRoadmapContext`は経由していない**（`grep`で確認済み、`applyCutover`系呼び出しは本ファイルに0件）。

---

## 2. `buildAnnualRoadmap`が返すデータ構造

`RoadmapYear[]`（`src/lib/roadmap.ts`）:

```ts
type RoadmapItem = {
  procedure: ScheduleProcedure;   // scheduleProcedure.ts定義、office: {name, map_url, official_url, website_url, official_url_status, fallback_url} | null
  dueDate: string;
  confidence: StateConfidence;
};
type RoadmapYear = { year: number; items: RoadmapItem[] /* 実フィールド名は既存コード参照 */ };
```

`ScheduleProcedure.office`の型は、`submissionDirectoryCutover/decision.ts`の`mergeOfficeOverlay`が受け取る`oldOffice`・返す戻り値の型と**完全に一致**する（`name`/`official_url`/`website_url`/`map_url`/`fallback_url`/`official_url_status`の6フィールド）。これは`toScheduleProcedure`（`scheduleProcedure.ts`）が`ProcedureResult.office`（`JurisdictionOffice`）からこの6フィールドだけを抽出して作っているため。

---

## 3. Workspace Overlayとの差分

| 観点 | Workspace | `/result` | Share |
|---|---|---|---|
| データ生成経路 | `buildAnnualRoadmap` → `RoadmapYear[]` | `runDiagnosis` → `ProcedureResult[]` → `toScheduleProcedure` → `ScheduleProcedure[]`（**フラット、年展開なし**） | `buildAnnualRoadmap` → `RoadmapYear[]`（**Workspaceと完全に同一の型**） |
| Cutover適用に使える既存関数 | `applyCutoverToRoadmapYears`（実装済み） | **無し**（`RoadmapYear[]`ではなく`ScheduleProcedure[]`単体を扱う場所が無い） | `applyCutoverToRoadmapYears`（**そのまま使える**） |
| Supabaseクライアント型 | `ServerSupabaseClient`（`@/lib/supabase/server`、Cookie付き） | `SupabaseClient`（`@/lib/supabase`、Cookie無し） | 同左 |
| 会社所在地の入手元 | `WorkspaceCompanyRow.municipality_code`/`prefecture_code` | `searchParams`の`pref`/`muni`（診断フォーム入力値、DBに保存されない） | `get_shared_workspace_view`が返す`company.municipality_code`/`prefecture_code` |
| 追加の描画面 | 無し（`ScheduleProcedure.office`のみ） | **`result.offices`（`JurisdictionOffice[]`、手続きに紐付かない独立した「管轄機関」グリッド）が別途存在** | 無し |
| RSC境界 | Server Component | Server Component | Server Component |

**最大の差分は`/result`の「管轄機関」グリッド（`result.offices`）の存在**。Workspace/Shareには存在しない、`/result`固有の描画面である。

---

## 4. Overlayを共通化できる場所

### 4-1. Shareは変更不要でそのまま適用可能

Shareは`buildAnnualRoadmap`の戻り値をそのままWorkspaceと同一の`RoadmapYear[]`として受け取っているため、`workspaceLoader.ts`と全く同じ1行

```ts
const roadmapYears = await applyCutoverToRoadmapYears(supabase, roadmapYearsBeforeCutover, {
  municipalityCode: company.municipality_code,
  prefectureCode: company.prefecture_code,
});
```

を`share/[token]/page.tsx`の`buildAnnualRoadmap`呼び出し直後に挿入するだけで成立する。**`submissionDirectoryCutover`側の新規コードは不要**。

### 4-2. `/result`（手続きの提出先）には新しい薄いヘルパーが1つ必要

`result.procedures.map(toScheduleProcedure)`で得た`ScheduleProcedure[]`（フラット、年展開なし）に対して、既存の`applyCutoverToProcedure(supabase, procedure, location)`（1手続き単位、既に`ScheduleProcedure`を直接受け取る設計）を配列全体に適用するだけの薄いラッパーが無い。`applyCutoverToRoadmapYears`は`RoadmapYear[]`の入れ子構造に依存しているため、フラット配列にはそのまま使えない。

**共通化案**: `submissionDirectoryCutover/index.ts`に、`applyCutoverToRoadmapYears`と同じ重複排除方針（procedure_id単位で1回だけ新Resolverを呼ぶ）を持つ、`ScheduleProcedure[]`を直接受け取る関数を追加する。

```ts
// 案（実装しない、シグネチャのみ提示）
export async function applyCutoverToProcedures(
  supabase: SupabaseClient,
  procedures: ScheduleProcedure[],
  location: CutoverLocation,
): Promise<ScheduleProcedure[]>
```

`applyCutoverToRoadmapYears`は内部で`RoadmapYear[]`から一意な`procedure`を集めて`applyCutoverToProcedure`を呼んでいる（`uniqueProcedures`ロジック）ため、この新関数が実質的に「その中核ロジックをフラット配列向けに切り出したもの」になる。**既存の`applyCutoverToRoadmapYears`自体を書き換えて共通化することもできるが、既にテスト済み・Workspaceで動作実績のあるコードを触るリスクの方が、新しい薄い関数を1つ追加するコストより大きいと判断する**（Resolver本体を書き換える前にデータ追加を優先、という既存方針と同じ考え方を「動作実績のあるCutoverコード」にも適用する）。

### 4-3. `result.offices`（管轄機関グリッド）は既存のCutover関数の対象外 — 設計判断が必要

`result.offices`は`JurisdictionOffice[]`型（`id`・`municipality_id`が必須フィールド）であり、新Resolverの`PublicOfficeView`（`id`を持たない）とは型が異なる。`mergeOfficeOverlay`はこの型を想定していない。

4-2節の対応だけを行った場合、Sapporo/Fukuoka/北九州市の企業が`/result`で法人市民税・償却資産を診断すると、**「必要手続き」セクションの該当行には新Resolverの窓口名が表示される一方、ページ上部の「管轄機関」グリッドには従来通り該当窓口が出現しない（旧Resolverにmunicipal_tax/municipal_asset_taxデータが無いため）**という状態になる。これは実害のある誤情報ではない（存在しない情報を表示しないだけ）が、画面内で情報の粒度が食い違って見える。

この差分をどう扱うかは実装方針の意思決定が必要（5節参照）。

---

## 5. 実装方針（案。未実装・レビュー用）

### 5-1. Share（優先度: 低リスク・高確度）

`share/[token]/page.tsx`の`buildAnnualRoadmap`呼び出し直後に`applyCutoverToRoadmapYears`を追加する。Workspaceと文字通り同じ呼び出しパターンのため、設計上の新規判断は不要。

### 5-2. `/result`（手続きの提出先欄）

1. `submissionDirectoryCutover/index.ts`に4-2節の`applyCutoverToProcedures`（仮称）を追加する
2. `result/page.tsx`で`result.procedures.map(toScheduleProcedure)`の直後に呼び出す

```ts
// 案（実装しない）
const scheduleProcedures = await applyCutoverToProcedures(
  supabase,
  result.procedures.map(toScheduleProcedure),
  { municipalityCode: muniCode, prefectureCode: prefCode },
);
// ScheduleList には scheduleProcedures を渡す
```

`muniCode`/`prefCode`は既に`searchParams`から取得済みの値をそのまま使える（新たなDB問い合わせは不要）。

### 5-3. `result.offices`グリッドの扱い（要意思決定、本書では判断しない）

以下のいずれかを選ぶ必要がある。ユーザー・設計レビューでの判断を推奨する。

| 選択肢 | 内容 | トレードオフ |
|---|---|---|
| A. 現状維持 | グリッドは旧Resolverのまま、手続き単位の欄のみ新Resolverを反映 | 実装コスト最小。ただし4-3節の情報粒度の食い違いが残る |
| B. グリッドにも個別Overlayを适用 | `result.offices`のうち`office_type`が`municipal_tax`/`municipal_asset_tax`かつCutover対象の場合、新Resolverの結果を`JurisdictionOffice`互換の形に詰め替えて追加する | 新しい変換関数が必要（`PublicOfficeView` → `JurisdictionOffice`相当、`id`をどう埋めるかという設計判断が発生する） |
| C. グリッド自体を廃止し、手続き単位の表示に一本化 | 「管轄機関」セクションを削除し、各手続きの提出先表示のみにする | UI変更であり、Phase5-2bのスコープ（Cutover適用）を超える |

**本書は選択肢を提示するのみで、Phase5-4/Phase5-2bの「調査のみ・コード変更禁止」の制約に従い、どれを採用するかは決定しない。** 実装フェーズの着手前にこの1点だけ合意を取ることを推奨する。

### 5-4. スコープ外として明示的に除外する箇所

調査中に`buildAnnualRoadmap`のもう1つの呼び出し元として**`src/app/(site)/roadmap/page.tsx`**（`/roadmap`、ログイン不要のブラウザ側ロードマップ画面）を発見した。この画面は**`'use client'`のClient Componentであり、ブラウザ上で直接`buildAnnualRoadmap`を呼び出している**。

`submissionDirectoryCutover/index.ts`・`submissionDirectoryAdapter/index.ts`はいずれも「Server Componentからのみ呼び出す」という設計上の制約がある（2026-07-04のRSC境界インシデントを踏まえた意図的な制限、コード内コメントに明記）。したがって**この画面へCutoverを適用する場合、既存のCutover関数をそのまま呼ぶことはできず**、Server Action・Route Handler等でラップする別設計が必要になる。

ユーザーの今回の指示は「`/result`」「Share」の2画面に限定されているため、**`/roadmap`は本Phase5-2bのスコープ外として扱い、着手しない**。将来的にこの画面にもCutoverを適用する場合は、RSC境界の制約により追加の設計検討（別Phase）が必要になることをここに記録しておく。

---

## 6. リスク

| # | リスク | 深刻度 | 対応の方向性 |
|---|---|---|---|
| 1 | `result.offices`グリッドと手続き欄の情報粒度が食い違って見える（4-3節） | 中 | 5-3節で事前に選択肢を決定してから実装する |
| 2 | `applyCutoverToProcedures`（新関数）にバグがあった場合、`/result`の対象外の手続き・自治体にまで影響が波及する | 低（設計上は`isPhase5_2Target`の判定が最初の関門のため、対象外は必ずno-opになる） | Workspaceと同じテスト方針（純粋関数のユニットテスト）を新関数にも適用する（8節） |
| 3 | `/result`は`searchParams`由来の`muniCode`/`prefCode`をそのままCutoverの`location`に渡す設計になる。Workspace/Shareは共に「DBに保存された会社の所在地」が入力元だが、`/result`はユーザーがフォームで直接入力した値であり、入力値の形式（6桁canonical化されているか等）がWorkspace/Shareと完全に一致する保証をこの調査だけでは確認していない | 中 | 実装前に`/start`（診断フォーム）が`muni`パラメータへ渡す値の形式（`municipalities.code`と同じ6桁canonical形式か）を追加確認する必要がある |
| 4 | Shareは`buildAnnualRoadmap`の`try/catch`で囲まれている（`roadmapYears = []`にフォールバック、43行目付近）。`applyCutoverToRoadmapYears`をこの`try`ブロックの内側に置くか外側に置くかで、Cutover自体が失敗した場合の挙動が変わる | 低 | Workspaceの`loadWorkspaceRoadmapContext`では`try/catch`の外側で呼んでいる（`applyCutoverToRoadmapYears`自体は失敗時に例外を投げる設計）。Shareでも同じ位置関係（`buildAnnualRoadmap`の`try`の外、かつ`roadmapYears`が空配列でない場合のみ呼ぶ）に合わせるのが一貫性がある |
| 5 | PDF/Excel出力 | 該当なし | `/result`・Shareのいずれにも現在PDF/Excel出力機能が無いことを確認済み（`RoadmapExcelExportButton`・`roadmapPdfDocument`の呼び出し元はWorkspaceの`roadmap/page.tsx`のみ）。Phase5-2b実装時点では影響が発生しない |

---

## 7. ロールバック

Workspace（Phase5-2）と同じ「1行を戻すだけ」の設計をそのまま踏襲できる。

- **Share**: `applyCutoverToRoadmapYears`呼び出し1行を削除すれば、`buildAnnualRoadmap`の結果がそのまま使われる旧経路に戻る（Workspaceの`workspaceLoader.ts`コメントと同じロールバック手順）
- **`/result`**: `applyCutoverToProcedures`呼び出し1行を削除し、`result.procedures.map(toScheduleProcedure)`の結果をそのまま`ScheduleList`へ渡す形に戻す
- 新規追加する`applyCutoverToProcedures`関数自体は`submissionDirectoryCutover/index.ts`に追加するのみで、`decision.ts`・`submissionDirectory/`本体には一切変更が及ばないため、関数を削除するだけで完全に無かった状態に戻せる
- Resolver本体・Migration・DBスキーマへの変更は本Phaseで一切発生しない設計のため、DBロールバックは不要

---

## 8. テスト計画

### 8-1. 既存テストへの影響

- `src/lib/submissionDirectory/resolve.test.ts`（8ケース）・`src/lib/submissionDirectoryAdapter/index.test.ts`（5ケース）・`src/lib/submissionDirectoryCutover/index.test.ts`（12ケース、`decision.ts`の純粋関数のみを検証し`index.ts`はimportしていないことを確認済み）は、いずれも**変更不要**。Phase5-2bは`decision.ts`を一切変更しない設計のため、既存23ケースは無改変で回帰しない

### 8-2. 新規追加が必要なテスト

- `applyCutoverToProcedures`（4-2節、仮称）を追加する場合、`applyCutoverToRoadmapYears`と同様に**DBアクセスを伴うため、既存の`node --test`パターン（`decision.ts`の型のみimportで軽量に実行する方式）では単体テストできない**。既存の`applyCutoverToRoadmapYears`・`applyCutoverToProcedure`自体もユニットテストが無く（DBアクセスを伴うため）、Resolver直接検証・Playwrightでの実ブラウザ確認で担保している方針と同じ扱いになる見込み
- 新規関数を追加する場合、`decision.ts`側の重複排除ロジックを共通化できるなら、その部分だけを`decision.ts`に切り出してユニットテスト可能にする余地はある（本書では設計案の提示に留め、実装しない）

### 8-3. 実ブラウザでの確認計画（Phase5-3と同じ形式を踏襲）

Phase5-3の`docs/PHASE5_3_MANUAL_BROWSER_VERIFICATION.md`と同じ検証用企業データ（札幌・福岡・北九州、Supabase Dashboardでの投入が必要）を使い、以下を追加で確認する。

| 画面 | 確認内容 |
|---|---|
| `/result` | `pref`/`muni`/`fm`等のクエリパラメータを検証用3社相当の値に設定してアクセスし、「必要手続き」の法人市民税・償却資産欄に新Resolverの窓口名が表示されることを確認。「管轄機関」グリッドの扱いは5-3節の決定に従って期待値を確定してから確認する |
| Share | 検証用3社のいずれかでShare Linkを発行し、`/share/[token]`で法人市民税・償却資産の提出先がWorkspace Roadmap画面と一致することを確認 |
| 対象外の回帰確認 | 渋谷区・対象外自治体で`/result`・Shareの結果が変化していないこと（Phase5-3の「回帰確認テンプレート」と同じ観点） |

---

## 9. 判定

## **Phase5-2b Ready**

判定根拠:

- ShareはWorkspaceと完全に同一のデータ構造（`RoadmapYear[]`）を経由しており、既存の`applyCutoverToRoadmapYears`をそのまま1行追加するだけで成立することを確認した。新規設計判断は不要
- `/result`はデータ生成の中核（`runDiagnosis`）がWorkspace/Shareと同じ関数を共有していることを確認し、`ScheduleProcedure[]`への変換後に既存の`applyCutoverToProcedure`を配列適用する薄いラッパー1関数を追加すれば成立する設計を具体的に特定できた
- Resolver本体（`src/lib/submissionDirectory/`）・`decision.ts`のいずれも変更不要であることを確認し、Overlay方式・対象外は旧Resolver維持という制約を満たせる設計であることを確認した
- RSC境界の制約に抵触する箇所（`/roadmap`、Client Component）を発見し、Phase5-2bのスコープ（`/result`・Share）には該当しないことを確認・除外した
- PDF/Excelへの影響が無いことを確認した
- 既存テスト23ケースへの影響が無いことを確認した

**ただし、実装着手前に5-3節（`result.offices`グリッドの扱い）とリスク#3（`/result`の`muniCode`入力値の形式確認）の2点は、調査ではなく意思決定・追加確認が必要な項目として残っている。** これらはブロッカーではなく「実装方針の中で最初に決めるべき1〜2点」として扱うことを推奨する。
