# ROADMAP_REQUIRED_DOCUMENTS_GUIDE_DESIGN.md — Roadmap 必要書類ガイド 設計（Sprint53）

**ステータス: 調査・設計のみ。DB変更・マイグレーション・コード変更・画面変更は本Sprintでは一切行っていない。**
実装はレビュー後、Sprint54以降で行う。

目的: 年間ロードマップの各手続きから、必要書類・添付書類・事前準備・提出前チェックを確認できるように
する。Engine（Roadmap生成・Decision・Notification）の判定ロジックは変更せず、必要書類は表示レイヤーの
ガイド情報として扱う。将来Excel/PDF（Sprint51・52）にも再利用できる構造にする。

---

## 0. 前提として確認した既存事実

調査の結果、**当初の想定より対応範囲が狭いことが分かった**。Sprint50（提出先リンク）・Sprint47（住民税）
と同様、「データは既に取得済みだが表示されていない」というパターンに該当する部分が大きい。

### 0-1. 必要書類データは既に`procedure_documents`テーブルとして存在する

`supabase/schema.sql`で以下のテーブルが**初期スキーマ（Phase1）から既に定義済み**。

```sql
CREATE TABLE IF NOT EXISTS procedure_documents (
  id           SERIAL  PRIMARY KEY,
  procedure_id INT     NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  form_number  TEXT,
  is_required  BOOLEAN NOT NULL DEFAULT TRUE,
  notes        TEXT,
  sort_order   INT     NOT NULL DEFAULT 0,
  UNIQUE (procedure_id, name)
);
```

実データを確認したところ（2026-07-12時点、anonキーで確認）、**33件**が登録済みだが、対象は
**31手続き中13手続き（約42%）のみ**。内訳は法人設立届出書・青色申告承認申請書・社会保険新規適用届・
株式会社設立登記等、Phase1〜1.5（設立系・登記系）の手続きに偏っており、Phase15.2以降に追加した
法人税確定申告・消費税確定申告・給与支払報告書・特別徴収税額の納付等の**税務・地方税カテゴリには
1件も登録されていない**。これは新たに追加するデータモデルの問題ではなく、既存データの拡充課題として
別途扱う（5節参照）。

### 0-2. 必要書類データは既にEngineを通ってRoadmapItemまで到達している

`src/lib/diagnosis.ts`の`runDiagnosis`（193行）・`src/lib/roadmap.ts`の`buildAnnualRoadmap`内
ルール手続き取得部分（180行）の両方が、既に

```
'*, official_links(...), procedure_documents(name, form_number, is_required, notes)'
```

という形で`procedure_documents`を取得している。`src/lib/scheduleProcedure.ts`の`ScheduleProcedure`型も
`procedure_documents?: ProcedureDocumentItem[]`を既に持ち、`toScheduleProcedure()`でも
素通しで引き継いでいる（61行）。つまり**`RoadmapItem.procedure.procedure_documents`には既に
必要書類データが入っている**（Sprint50で確認した`office.official_url`と全く同じ構図）。

### 0-3. 表示側（UI・Excel・PDF）はいずれもこのデータを使っていない

- `src/components/AnnualRoadmapView.tsx`: `procedure_documents`への参照は**0件**（grep確認）
- `src/lib/roadmapExport.ts`（Sprint51の`buildRoadmapExportRows`）: 出力列に必要書類は含まれていない
- `src/lib/roadmapPdfDocument.ts`（Sprint52）: 同上

一方、**`src/app/(site)/result/ScheduleList.tsx`は既に必要書類を表示する仕組みを持っている**。
`ProcedureDetailExtra`コンポーネント（`src/components/ProcedureDetailExtra.tsx`）が`documents`propを
受け取り、「詳細を見る」展開時に書類名・様式番号・必須/任意・注記を一覧表示している（45-61行）。
このコンポーネント・表示パターンをそのまま流用できる。

### 0-4. 「documentsマスタ」に相当するものは`workspace_documents`だが、性質が異なる

`supabase/migration_workspace_documents.sql`で定義されている`workspace_documents`は、
`document_type`が**CHECK制約による固定5種**（`articles_of_incorporation`・
`certificate_of_registered_matters`・`corporate_tax_return`・`consumption_tax_return`・
`withholding_tax_payment_slip`、`src/lib/workspaceDocumentStatus.ts`にもハードコード）で、
`(company_id, document_type)`をキーに**会社ごとの書類の状態（未登録/登録済み/要更新）**を保持する。

これは`procedure_documents`（「この手続きにはどんな書類が必要か」という**Procedure Master側の
ガイド情報**）とは**別の層**にある。`workspace_documents`は「会社がその書類を準備できているか」という
**会社ごとの状態**であり、拡張可能な「マスタ」ではなく固定5種のハードコードにすぎない。両者は
`src/lib/workspaceDecisions.ts`の`matchingDocumentType()`（59-64行）が手続き名の**キーワード一致**
（「法人税」→`corporate_tax_return`等）で緩やかに結び付けているだけで、正式なリレーション
（外部キー等）は存在しない。

### 0-5. 管理画面から`procedure_documents`を編集するUIは存在しない

`src/app/admin/(protected)/procedures/ProcedureForm.tsx`・`[id]/page.tsx`のいずれにも
`procedure_documents`への参照は無い。現状、必要書類データは**SQLマイグレーションでのみ**投入・編集
できる（0-1節の33件も`schema.sql`/初期データ投入時のもの）。

### 0-6. 「事前準備」「提出前チェック」に相当する既存データ・概念は存在しない

`事前準備`・`提出前チェック`・`checklist`等のキーワードでリポジトリ全体を検索したが該当なし。
`procedure_documents`は「書類」（`name`・`form_number`という書式のある物理的な提出物）を前提にした
スキーマであり、「〇〇を確認しておく」「△△に相談する」といった**書類ではない準備行動・確認事項**を
表現する項目は無い。これは新規に設計が必要な部分である。

---

## 1〜4. 必須報告事項への回答

### 1. 必要書類情報は既にどこかへ保持されているか

**保持されている。** `procedure_documents`テーブル（33件、13/31手続き）。Roadmap Engineは既にこのデータを
取得済みで、表示していないだけ（0-2節・0-3節）。

### 2. Procedure Masterへ追加するのが自然か

**自然、というより既にそうなっている。** `procedure_documents`は`procedures`への外部キーを持つ
Procedure Masterの一部として最初から設計されている（`procedure_id INT NOT NULL REFERENCES
procedures(id) ON DELETE CASCADE`）。「必要書類はどの手続きに必要か」という情報の性質上、
手続き（Procedure）に従属するのが最も自然であり、これは新しい設計判断ではなく**既存設計の追認**。

### 3. documentsマスタと紐付ける方が自然か

**否。** 0-4節の通り、`workspace_documents`は「会社ごとの状態」を持つ別レイヤーであり、
「手続きに何が必要か」という静的なガイド情報とは性質が異なる。ただし、**両者を`document_type`で
緩やかに紐付ける拡張**（例: `procedure_documents`に任意の`workspace_document_type`列を追加し、
一致する場合のみDecision Engineの`matchingDocumentType()`をキーワード一致から正確なリレーションに
置き換える）は将来的に価値がある（7節「Notificationとの整合」で後述）。ただしこれは今回の
「必要書類ガイド」表示に必須ではなく、拡張の余地として設計に含めるに留める。

### 4. 新しいテーブルが必要か

**「必要書類・添付書類」については不要。** 既存`procedure_documents`をそのまま使う。

**「事前準備・提出前チェック」については、新しい独立テーブルではなく既存`procedure_documents`の
軽量な拡張（列追加）で対応することを推奨する**（詳細は次節の設計比較）。「書類」と「準備行動」は
提出先に紐づく1つの手続きガイドとして一体的に管理・表示する方が自然であり、テーブルを分けると
Roadmap/Excel/PDF側で2つのデータソースを結合する手間が生まれ、CLAUDE.mdの「3行程度の重複より
過剰な抽象化を避ける」「既存のテーブル・関数で表現できないか検討する」という原則にも反する。

---

## 5. Roadmap・Excel・PDFで共通利用できる構造

Sprint50の`buildRoadmapSubmissionInfo()`・Sprint51の`buildRoadmapExportRows()`と同じ設計原則
（JSXに依存しないプレーンなデータを唯一の変換経路にする）をそのまま踏襲する。

```ts
// 設計イメージ（本Sprintでは適用しない）
export type RoadmapDocumentItem = {
  name: string;
  formNumber: string | null;
  isRequired: boolean;
  notes: string | null;
  itemType: 'document' | 'preparation' | 'checklist'; // 4節で後述する拡張列
};

// ScheduleProcedure.procedure_documents（既存、取得済み）から組み立てるだけの純粋関数。
// 新しいDBクエリは追加しない。
export function buildRoadmapDocumentItems(proc: ScheduleProcedure): RoadmapDocumentItem[] {
  return (proc.procedure_documents ?? []).map((d) => ({
    name: d.name,
    formNumber: d.form_number,
    isRequired: d.is_required,
    notes: d.notes,
    itemType: d.item_type ?? 'document', // 既存33件は列追加時にデフォルト値で'document'扱いになる
  }));
}
```

この関数の戻り値を、`AnnualRoadmapView`（Web表示）・`roadmapExport.ts`の`buildRoadmapExportRows`
（Excel、書類名を1セルに集約するか複数行に展開するかは実装Sprintで検討）・`roadmapPdfDocument.ts`
（PDF、`ProcedureDetailExtra`と同様の書類一覧ブロック）のいずれからも共通利用する。
`ProcedureDetailExtra`（`/result`で既に使われている表示パターン）をAnnualRoadmapView用に
再利用するか、Roadmapの1行あたりの表示密度に合わせた簡略版にするかは実装Sprintでの検討事項とする
（Sprint50で「Roadmapは`/result`と異なり手続き件数が多いため展開式にしない」と判断した前例に倣う
可能性が高い）。

---

## 6. 設計比較

| 評価軸 | 案A: ProcedureにJSON保持 | 案B: procedure_required_documentsテーブル新設 | 案C: documentsマスタ（workspace_documents）再利用 |
|---|---|---|---|
| **概要** | `procedures.required_documents`列（JSONB）に配列で保持 | 既存`procedure_documents`とは別に新テーブルを作る | `workspace_documents`の固定5種document_typeを手続き側の必要書類としても使う |
| **保守性** | JSON内の個別項目を管理画面から編集するには専用UIロジックが必要（配列操作・バリデーションをJS側で実装）。SQL上での一覧・検索性も低い | 既存`procedure_documents`と機能的にほぼ重複するテーブルが2つ並存し、どちらに書くべきか混乱を招く。CLAUDE.mdの「既存のテーブル・関数で表現できないか検討する」に反する | 固定5種に「事前準備」「特定手続き専用の書類」等を無理に当てはめることになり、意味的に破綻する（例:「定款のコピー」は5種のどれにも該当しない） |
| **拡張性** | 「事前準備」「チェック」等の新種別追加はJSON構造の再設計を伴い、既存データの一括マイグレーションが必要 | テーブルなので列追加（`item_type`等）は容易だが、既存`procedure_documents`との統合をどこかで迫られる | 5種固定というCHECK制約の設計思想上、`procedure_documents`のような可変長・手続き固有の項目には本質的に不向き |
| **Procedureとの整合性** | Procedure本体に直接持たせるため一見自然だが、`procedure_documents`という既存の正規化テーブルがある以上、同じ情報を2箇所（JSON列とテーブル）で表現することになりかねない | 外部キーでProcedureに従属する点は既存`procedure_documents`と同じ設計。だが屋上屋を架す | Procedureとの関連は`matchingDocumentType()`のキーワード一致のみで、正式なリレーションが無い（0-4節） |
| **Excel/PDF再利用** | JSONを都度パースする処理が1箇所増えるだけで、実現は可能 | 既存`procedure_documents`とテーブルが2つに分かれるため、5節の`buildRoadmapDocumentItems()`が2つのソースをマージする必要が生じ複雑化する | 会社ごとの状態を持つため「手続きの標準的な必要書類ガイド」という静的情報の表現に使えない（会社を跨いだRoadmap/Excel/PDFの前提と矛盾する） |
| **Notificationとの整合** | 影響なし（Notification Centerは`procedure_documents`を直接参照していない） | 影響なし。ただし将来`workspace_documents`と紐付ける場合、参照先テーブルが2つに分かれ実装が複雑化する | `matchingDocumentType()`との親和性は高いが、0-4節の通りそもそも別レイヤーの情報であり無理に一体化すべきではない |
| **Accounting連携** | 会計データ連携（[BETA_BACKLOG.md](BETA_BACKLOG.md) L-03、構想段階）が将来「提出書類の自動収集」等を検討する際、JSON列だと該当書類を横断検索しにくい | 新テーブルなら`document_type`的な分類列を将来追加しやすいが、案Bの根本問題（既存テーブルとの重複）は解消しない | 固定5種の枠内でしか会計連携を語れず、Procedure Master全体（33件・将来拡充される他手続き分）を横断した連携ができない |

### 推奨: 案Bの変形（新テーブルではなく既存`procedure_documents`の拡張）

案A・B・Cのいずれも単独では採用しない。**既存`procedure_documents`テーブルに`item_type`列
（`'document' | 'preparation' | 'checklist'`、デフォルト`'document'`）を追加する拡張**を推奨する。

理由:

1. 0-1節〜0-3節で確認した通り、「必要書類・添付書類」に相当するデータ・取得経路・表示パターン
  （`ProcedureDetailExtra`）は**既に完成している**。案A・Bのように新しい保持先を作ることは、
  既に動いている仕組みを複製するだけで実質的な価値を生まない
2. 「事前準備」「提出前チェック」は`procedure_documents`のスキーマ（`name`・`form_number`・
  `is_required`・`notes`・`sort_order`）とほぼ同じ形で表現できる（例:
  `item_type='preparation', name='資本金の払込みを確認する', form_number=NULL, notes='...'`）。
  性質が異なるのは「物理的な書類かどうか」だけであり、そのためだけに別テーブル・別JSON構造を
  持つ必要は無い
3. `item_type`列はNULL許容にせずデフォルト値`'document'`を持たせることで、既存33件は
  マイグレーション後も無変更で「書類」として扱われる（CLAUDE.mdの「既存テーブルへの列追加は
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`で書く」パターンに合致）
4. Roadmap・Excel・PDFはいずれも単一のクエリ・単一の型（`ScheduleProcedure.procedure_documents`）を
  そのまま使い続けられ、5節の`buildRoadmapDocumentItems()`はソースを1つに保てる
5. 案Cのような`workspace_documents`との統合は、0-4節で述べた「将来の拡張の余地」として設計には
  含めるが、今回のスコープには入れない（会社ごとの状態管理と手続きの静的ガイドは責務が異なるため、
  無理に一体化しない）

---

## 7. 既存機能への影響整理

| 機能 | 影響 |
|---|---|
| Roadmap Engine（期限計算・occurrence展開） | **無変更**。`procedure_documents`は表示専用データであり、期限計算ロジックには一切関与しない |
| Decision Engine | **無変更**。`matchingDocumentType()`は`workspace_documents`ベースのままとし、`procedure_documents`の`item_type`拡張とは独立させる（0-4節で述べた将来拡張の余地は残すが、今回は接続しない） |
| Notification Center | **無変更**。同上 |
| Procedure Status | **無変更**。書類チェックはoccurrenceのステータス（未着手/進行中/完了等）とは別軸の情報として並記するだけで、書類ごとの完了状態は持たない（MVPスコープ外、9節） |
| AnnualRoadmapView | 追加。`buildRoadmapDocumentItems()`の結果を表示する行・アイコンを追加（Sprint50の提出先表示と同じ「1行に収まる最小限の追加」方針を踏襲する想定） |
| Excel出力（Sprint51） | 追加。列を増やすか、既存の「注意事項」列と統合するかは実装Sprintで検討 |
| PDF出力（Sprint52） | 追加。`ProcedureDetailExtra`相当のブロックを`procedureBlock()`に追加する想定 |
| 管理画面（Procedure編集） | 0-5節の通り現状CRUD UIが無い。データ拡充は当面SQLマイグレーションで行う（Phase15.2以降の税務・地方税手続きへの必要書類データ投入は別課題として`BETA_BACKLOG.md`に登録することを推奨、9節） |

---

## 8. 実装前レビュー確認事項（正式方針決定後の追加確認）

### 8-1. `procedure_documents`に既存の並び順列があるか

**ある。** `schema.sql`で`sort_order INT NOT NULL DEFAULT 0`が最初から定義されている。実データ
（33件）を確認したところ、各手続き内で`1, 2, 3...`という意味のある値が付与されている（例:
procedure_id=41「株式会社設立登記」は`定款（認証済み）=1, 発起人の同意書=2, ...印鑑届書=6`のように
提出書類の自然な準備順に並んでいる）。**全て0埋めの未使用列ではなく、実際に運用されているデータ**
であることを確認した。

### 8-2. 無ければ`display_order`追加の要否

9-1節の通り`sort_order`が既に同じ目的で存在するため、**`display_order`列の新規追加は不要**。
`item_type`列を追加した後も、表示順は「`item_type`でグルーピング→各グループ内は`sort_order`昇順」と
いう組み立てで対応できる（`item_type`ごとのグループ順序自体は表示側で固定順
`document → preparation → checklist`とすればよく、これも新しい列を必要としない）。

### 8-3. 既存33件を安全に`document`へ補完できること

実データ33件全件の内容を確認した（9-1節のクエリ結果と同一）。すべて「〇〇届出書」「〇〇のコピー」
「〇〇証明書」「〇〇議事録」等、**物理的な書類・証明書類そのもの**であり、「事前準備」や
「チェック項目」に該当する内容は1件も無い。したがって`item_type TEXT NOT NULL DEFAULT 'document'`
という列追加は、既存33件の意味を一切変えずに安全に補完できる（Sprint47の
`resident_tax_payment_cycle`列追加と同じ、PostgreSQLの「定数DEFAULT付き列追加は既存行にも
その値を持つものとして扱う」という挙動に依拠する）。

### 8-4. migrationが再実行安全であること

Sprint47（`migration_resident_tax_withholding.sql`）と同じパターンを踏襲する。

- 列追加: `ALTER TABLE procedure_documents ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL
  DEFAULT 'document';`（`IF NOT EXISTS`により2回目以降は何もしない）
- CHECK制約: `DO $$ ... IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '...') THEN
  ALTER TABLE ... ADD CONSTRAINT ... END IF; END $$;`という事前存在確認パターンで、
  `duplicate_object`エラーを避ける
- 新規テーブルを作らないため、GRANT/RLSの追加設定は不要（既存`procedure_documents`のポリシーを
  そのまま使う）

草案は10節に用意した（本Sprintでは実行しない）。

### 8-5. `/result`の`ProcedureDetailExtra`と表示責務が重複しないこと

重複しない設計とする。

- **`ProcedureDetailExtra`（既存、`/result`専用）は無変更のまま維持する。** `item_type`を意識せず、
  受け取った`documents`配列をこれまで通りフラットに一覧表示する。既存33件は全て`document`型に
  補完されるため、表示結果は今回の変更前後で一切変わらない（回帰なし）
- **AnnualRoadmapView側は新しい表示（`buildRoadmapDocumentItems()`の結果を使う）を追加する。**
  Sprint50で「Roadmapは`/result`と異なり手続き件数が多いため展開式にしない」と判断した前例に倣い、
  `ProcedureDetailExtra`をそのまま流用せず、Roadmapの1行カードに収まる簡略表示（例:
  書類件数バッジ、または`item_type`ごとに小さくグルーピングした短いリスト）を別途用意する
- 両者は**同じデータソース（`ScheduleProcedure.procedure_documents`→`buildRoadmapDocumentItems()`）
  を参照するが、表示コンポーネントは別**という整理にする。これは「共通データ生成」と「表示形式」を
  分離するSprint50〜52の一貫した設計方針（`buildRoadmapSubmissionInfo`・`buildRoadmapExportRows`と
  同様）と一致する

### 8-6. Excel/PDFへ追加した場合の列・レイアウト影響

**Excel（Sprint51）**: 新しい列を1列追加する（例:「必要書類・準備事項」）。**書類ごとに行を分けない
（occurrence単位で1行、という既存の不変条件を崩さない）。** `item_type`のラベルを角括弧等で
プレフィックスし、`、`区切りで1セルに結合する想定（例: `[書類] 定款のコピー、[書類] 登記事項証明書の
コピー`）。列幅は既存の「注意事項」列（44）と同程度を想定。書類が無い手続きは空欄（推測しない、
既存方針を踏襲）。

**PDF（Sprint52）**: `procedureBlock()`内に、`caution_note`と同様の追加`stack`要素として書類一覧を
追加する。`unbreakable: true`で1件のoccurrenceブロック全体が改ページで分断されない設計は維持されるが、
書類件数が多い手続き（最大6件、procedure_id=41の例）ではブロックの縦の高さが増える点は許容する
（1ページに収まる件数が減るだけで、レイアウト崩れやテキストの重なりは発生しない）。`item_type`ごとに
小見出し（「必要書類」「事前準備」「提出前チェック」）を分けて表示するかは実装Sprintでの
UI微調整事項とする。

---

## 9. データ拡充状況について（実装とは別の既知の課題）

0-1節で確認した通り、`procedure_documents`は31手続き中13手続きにしかデータが無い。本Sprintの
スコープ（表示レイヤーの追加）を実装しても、**Phase15.2以降に追加した税務・地方税手続き
（法人税確定申告・消費税確定申告・給与支払報告書・特別徴収税額の納付等）では「必要書類は
登録されていません」という表示になる**。これはSprint50の福岡県`municipal_tax`窓口データ不足と
同種の「表示は正しく動くが、データが薄い」という状態であり、実装のバグではない。データ拡充は
実装Sprintとは別に`BETA_BACKLOG.md`への登録を推奨する（本Sprintで登録済み、`docs/BETA_BACKLOG.md`
L-05参照）。

---

## 10. Migration草案（本Sprintでは未実行）

`supabase/migration_procedure_documents_item_type.sql`として別ファイルに用意した（8-4節の方針通り、
`ADD COLUMN IF NOT EXISTS` + CHECK制約の事前存在確認による再実行安全パターン）。実行はSprint54の
実装レビュー時に依頼する想定で、本Sprintでは作成のみに留める。

---

## まとめ

- **必要書類情報は既に`procedure_documents`テーブルに存在し、Roadmap Engineまで既に取得済み。
  表示側（AnnualRoadmapView・Excel・PDF）が使っていないだけ**（Sprint50の提出先リンクと同型の
  ギャップ）
- **Procedure Masterへの従属は既存設計そのもの**であり、新たな判断ではない
- **documentsマスタ（`workspace_documents`）との統合は不適切**。会社ごとの状態管理と手続きの
  静的ガイドはレイヤーが異なる
- **新しい独立テーブルは不要**。案A（JSON列）・案B（新テーブル）はいずれも既存`procedure_documents`
  との重複を生むため不採用。**既存`procedure_documents`への`item_type`列追加（`document` /
  `preparation` / `checklist`）を推奨**する
- **共通構造**: `buildRoadmapDocumentItems(proc: ScheduleProcedure)`という、Sprint50・51と同じ
  「JSXに依存しない純粋関数」パターンで、Web/Excel/PDFの3経路から共通利用する
- **Engineへの影響なし**。期限計算・Decision・Notificationはいずれも無変更
- **既知の制約**: 31手続き中13手続きにしかデータが無く、税務・地方税カテゴリは特に薄い。
  これは実装とは別のデータ拡充課題として`BETA_BACKLOG.md`への登録を推奨する
- **Sprint54での実装対象（提案）**: (1) `procedure_documents`への`item_type`列追加マイグレーション、
  (2) `buildRoadmapDocumentItems()`の実装、(3) AnnualRoadmapView・Excel・PDFへの表示追加。
  いずれもEngine変更を伴わない見込み
