# TAX_RETURN_PROFILE_MVP_PROPOSAL.md — Sprint17.2 実装前提案（Tax Return Profile MVP・手入力）

**ステータス: 提案のみ。DBマイグレーション・コード変更は本ドキュメントでは一切実施していない。**
[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)（Sprint17 Phase17.1）で承認いただいた
方針に基づき、Sprint17.2「Tax Return Profile MVP（手入力）」の詳細設計を提案する。
レビュー後、承認いただいた内容のみ実装する。DB変更なし・`companies`/`company_events`には触れない。

## 0. 承認済み方針（Phase17.1レビューの確認）

1. 「前期申告書を会社の現在地として扱う」フレームで進める
2. CompanyProfile＝自己申告・現況認識／TaxReturnProfile＝申告書に基づく確定事実、として分離する
3. 概算レンジ入力を認める。ただしRoadmap Confidenceは正確な金額入力より低く扱う
4. CompanyProfileとの矛盾は自動上書きせず、Change Interview（本Phaseでは簡易的な確認バナー）で確認する
5. Roadmap Confidenceはまず3分類（高・中・低）で進める。4分類目は会計データ連携後に検討
6. OCR・AI抽出は将来構想のまま、本Phaseでは実装しない
7. Sprint16.2との重複整理はSprint17.2〜17.3を正として進める

**Sprint17.2の範囲**: [TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 6節の
Change Interview（イベント登録に連動した対話フロー）は「決算」イベントの活性化を伴うため
Sprint17.3で扱う。**Sprint17.2は「決算」イベントに依存しない、独立した手入力画面**として
スコープを絞る（タイトルの「手入力」はこの意味）。

---

## 1. 追加する型

新規ファイル `src/lib/taxReturnProfile.ts` を作る（`companyProfile.ts`と同じ配置・同じ設計思想）。

### 1-1. 金額項目の精度を表す型（承認済み方針3の実装）

`taxableSalesAmount`・`corporateTaxAmount`・`consumptionTaxAmount`の3項目は、いずれも
「法律上の閾値を跨ぐかどうか」の判定に使われる（4節参照）。正確な金額の代わりに
**閾値と1対1で対応する概算レンジ（バケット）**を選べるようにすることで、「範囲がまたがっていて
判定不能」という曖昧さを避ける設計にする。

```ts
// 設計イメージ（Sprint17.2でコード化）

export type AmountPrecision = 'exact' | 'range';

export type AmountValue = {
  precision: AmountPrecision;
  exactValue: number | null;  // precision === 'exact' のとき使用
  rangeBucketId: string | null; // precision === 'range' のとき使用（下記バケット定義のid）
};

// 課税売上高：消費税の課税/免税の分岐点（1,000万円）をまたがないようバケットの境界を設定
export const TAXABLE_SALES_BUCKETS = [
  { id: 'under_500', label: '500万円未満', isAboveExemptionThreshold: false },
  { id: '500_800', label: '500万円〜800万円未満', isAboveExemptionThreshold: false },
  { id: '800_1000', label: '800万円〜1,000万円未満', isAboveExemptionThreshold: false },
  { id: '1000_1500', label: '1,000万円〜1,500万円未満', isAboveExemptionThreshold: true },
  { id: 'over_1500', label: '1,500万円以上', isAboveExemptionThreshold: true },
] as const;

// 消費税額：中間申告の回数区分（48万円・400万円・4,800万円）の境界に合わせる
export const CONSUMPTION_TAX_BUCKETS = [
  { id: 'under_48', label: '48万円以下', interimFrequency: 'none' },
  { id: '48_400', label: '48万円超400万円以下', interimFrequency: '1' },
  { id: '400_4800', label: '400万円超4,800万円以下', interimFrequency: '3' },
  { id: 'over_4800', label: '4,800万円超', interimFrequency: '11' },
] as const;

// 法人税額：中間申告の要否の目安（簡略化。実際は年税額を月数按分するが、MVPでは概算のみ）
export const CORPORATE_TAX_BUCKETS = [
  { id: 'under_20', label: '20万円以下', requiresInterimFiling: false },
  { id: 'over_20', label: '20万円超', requiresInterimFiling: true },
] as const;
```

`capitalAtFiling`（資本金）・`employeeCountAtFiscalYearEnd`（従業員数）は、通常ユーザーが正確な値を
把握しているため概算レンジの対象外とし、単純な`number | null`のままとする（スコープを広げすぎない）。

### 1-2. `TaxReturnEntry` / `TaxReturnProfile`

[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 2節の型を、上記`AmountValue`を
使う形に更新したもの。

```ts
export type TaxReturnEntry = {
  id: string; // crypto.randomUUID()。一覧の編集・削除キー
  fiscalYearStartDate: string;
  fiscalYearEndDate: string;
  filedDate: string | null;
  capitalAtFiling: number | null;

  taxableSalesAmount: AmountValue | null;
  consumptionTaxStatus: ConsumptionTaxStatus; // companyProfile.ts の既存型を再利用
  taxationMethod: TaxationMethod | null;      // 同上
  invoiceRegistrationStatus: InvoiceRegistrationStatus; // 同上

  corporateTaxAmount: AmountValue | null;
  consumptionTaxAmount: AmountValue | null;

  corporateTaxInterimFilingActual: InterimFilingStatus; // 同上
  consumptionTaxInterimFrequencyActual: ConsumptionTaxInterimFrequency; // 同上
  financialStatementPublished: boolean;
  withholdingTaxCycleActual: 'monthly' | 'special_exception' | null;

  employeeCountAtFiscalYearEnd: number | null;

  createdAt: string; // ISO datetime
  updatedAt: string;
};

export type TaxReturnProfile = {
  entries: TaxReturnEntry[]; // fiscalYearEndDate 昇順
};
```

型・列挙値（`ConsumptionTaxStatus`等）は新設せず、すべて`companyProfile.ts`から`import type`する
（同じ概念を2箇所で定義しないため、CLAUDE.mdのコーディング規約に沿う）。

---

## 2. localStorage設計

| 項目 | 内容 |
|---|---|
| キー | `sunboo:tax-return-profile`（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 2-3節で予告済みの名前） |
| 保存形式 | `TaxReturnProfile`をそのまま`JSON.stringify` |
| 存在しない場合 | `{ entries: [] }`を返す（`CompanyProfile`と異なり、`null`を返す設計にはしない。「まだ1件も申告実績が無い」ことは有効な状態であり、呼び出し側で`null`チェックを強制しない方が扱いやすいため） |

### 2-1. 公開関数（`src/lib/taxReturnProfile.ts`）

```ts
export function loadTaxReturnProfile(): TaxReturnProfile; // 常に有効なオブジェクトを返す
export function saveTaxReturnProfile(profile: TaxReturnProfile): void;

// 新規追加。fiscalYearEndDate の重複チェックは呼び出し側（UI）が事前に警告する想定（3節）
export function addTaxReturnEntry(entry: Omit<TaxReturnEntry, 'id' | 'createdAt' | 'updatedAt'>): TaxReturnProfile;
// 既存エントリの更新。id で特定
export function updateTaxReturnEntry(id: string, entry: Partial<TaxReturnEntry>): TaxReturnProfile;
export function deleteTaxReturnEntry(id: string): TaxReturnProfile;

// 直近1件（＝前期）を取得するヘルパー。1節「会社の現在地」の実装上の入口になる
export function getLatestEntry(profile: TaxReturnProfile): TaxReturnEntry | null;
// 2期前（基準期間）を取得するヘルパー。consumptionTaxStatus の導出に使う
export function getEntryTwoPeriodsAgo(profile: TaxReturnProfile): TaxReturnEntry | null;

// 承認済み方針3の実装: 金額項目のConfidence判定
export function confidenceOfAmount(amount: AmountValue | null): 'high' | 'medium' | 'low';
// exact → 'high' / range → 'medium' / null（未入力） → 'low'
```

`addTaxReturnEntry`/`updateTaxReturnEntry`は常に`entries`を`fiscalYearEndDate`昇順に整列してから保存する
（一覧表示・`getLatestEntry`/`getEntryTwoPeriodsAgo`の実装を単純に保つため）。

既存の`sunboo:company-profile`と異なり、**旧形式データが存在しないため移行（マイグレーション）処理は不要**。

---

## 3. 入力画面

### 3-1. 配置

新規ページ`/profile/tax-returns`を追加する（`/profile`のサブページという位置づけ）。

- `/profile`ページに新しいカード「確定申告実績」を1枚追加し、「記録する →」ボタンで
  `/profile/tax-returns`へ遷移させる（既存の`.card`スタイルを流用、画面追加は本Phaseのスコープ内）
- **要判断**: CLAUDE.mdのUIルールは「新しいpublicページを追加するときはヘッダー・フッター両方に
  ナビリンクを追加する」と定めているが、`/profile/tax-returns`は`/profile`の詳細機能であり
  ヘッダー直下に並べるとナビが煩雑になる。**本提案ではヘッダー・フッターへの追加は行わず、
  `/profile`からのカードリンクのみとする**代替案を取りたいが、この判断はレビューで確認したい

### 3-2. 画面構成

`/admin`の一覧＋新規/編集フォームのCRUDパターンに近い構成にする（一般ユーザー向け画面だが、
「複数件を管理する」という性質が`/admin/procedures`等と同じであるため）。

1. **一覧**: 登録済み`TaxReturnEntry`を決算日の新しい順にカード表示。決算期間・申告日・
   課税売上高（Confidenceタグ付き）・確定法人税額/消費税額・消費税ステータスを一覧表示。
   各カードに「編集」「削除」ボタン
2. **新規追加/編集フォーム**: 「＋ 新しい申告実績を追加」ボタンで開く。以下の項目を1画面で入力
   （[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 6-1節のChange Interview設計は
   Sprint17.3のイベント連動フロー向けであり、本Phaseは条件分岐の少ないシンプルなフォームとする。
   簡略化した点は3-3節に明記）

| フィールド | UI |
|---|---|
| 決算期間（開始日・終了日） | 日付入力2つ |
| 申告日 | 日付入力（任意） |
| 資本金（申告時点） | 数値入力（任意） |
| 課税売上高 | `[正確な金額]`/`[だいたいの範囲]`切り替えトグル＋対応する入力欄（既存`ToggleButtons`コンポーネントの流用） |
| 消費税ステータス | 免税/課税ボタン（既存`/profile`と同じ`ToggleButtons`パターン） |
| 課税方式 | 原則/簡易ボタン（消費税ステータス＝課税のときのみ表示） |
| インボイス登録状況 | 登録済み/未登録ボタン |
| 確定法人税額・確定消費税額 | 課税売上高と同じ「正確/概算」切り替え |
| 中間申告実績（法人税・消費税） | あり/なしボタン、回数セレクト |
| 決算公告実施 | 実施/未実施ボタン（`CompanyProfile.corporateType === 'kabushiki'`のときのみ表示） |
| 源泉所得税の納付実績 | 毎月/年2回ボタン（`CompanyProfile.employeeCount > 0`のときのみ表示、任意） |
| 期末従業員数 | 数値入力（任意） |

### 3-3. Change Interview（Sprint17.3）との違い・簡略化した点

- 質問の出し分け条件は「その時点のCompanyProfile」ではなく「フォーム入力中の値」を見て
  その場で切り替える（例: 消費税ステータスをフォーム内で「課税」に切り替えた瞬間に
  課税方式の質問が現れる）。過去の任意の期を遡って登録できるようにするため、
  6-1節にあった「`stage === 'first_term'`なら質問省略」のような**CompanyProfile依存の
  自動スキップは行わない**（過去の入力データを妨げないため）
- 対話形式（1問ずつ）ではなく、1画面のフォームにまとめる（実装コストを抑えるため）

---

## 4. CompanyProfileとの矛盾検出

### 4-1. 検出ロジック

[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 4節の役割分担表のうち、
「Tax Return Profileが正本」とした3フィールドについて、既存の3つの自動判定関数を
`TaxReturnProfile`対応に更新する（後方互換のため引数追加のみ、既存呼び出し元は無変更で動く）。

```ts
// src/lib/companyProfile.ts の既存関数を更新（設計イメージ）

export function deriveConsumptionTaxStatus(
  capital: number | null,
  stage: CompanyStage,
  taxReturnProfile?: TaxReturnProfile, // 追加。省略時は従来通りの挙動
): ConsumptionTaxStatus | null {
  if (capital === null) return null;
  if (capital >= 10_000_000) return 'taxable';
  if (stage === 'first_term') return 'exempt';

  // 追加分岐: 2期前（基準期間）の課税売上高から判定
  const baseline = taxReturnProfile ? getEntryTwoPeriodsAgo(taxReturnProfile) : null;
  if (baseline?.taxableSalesAmount) {
    const bucket = resolveTaxableSalesBucket(baseline.taxableSalesAmount); // 1節のバケット定義から解決
    if (bucket) return bucket.isAboveExemptionThreshold ? 'taxable' : 'exempt';
  }
  return null; // 従来通り、根拠が無ければ断定しない
}
```

`deriveCorporateTaxInterimFiling`・`deriveConsumptionTaxInterimFrequency`も同様に、
直近1件（`getLatestEntry`）の`corporateTaxAmount`/`consumptionTaxAmount`のバケットから
判定する分岐を追加する。

### 4-2. 矛盾があった場合の提示（自動上書きしない、承認済み方針4）

`/profile/tax-returns`でエントリを保存した直後、上記の更新後関数を実行し、結果が
現在の`CompanyProfile`の値と異なれば、保存直後の画面に確認バナーを表示する。

```
「前期の課税売上高（800万円〜1,000万円未満）から、消費税ステータスは
 引き続き「免税事業者」と判定されます。」   ← 一致時は何も表示しない（静かなトーン）

「前期の課税売上高（1,000万円〜1,500万円未満）から、消費税ステータスが
 「課税事業者」に変わる可能性があります。プロフィールを更新しますか？」
 [プロフィールを更新する]  [今はしない]
```

「プロフィールを更新する」を押した場合のみ`CompanyProfile`を書き換える（`saveCompanyProfile`）。
**Sprint17.2ではこのバナーを`/profile/tax-returns`の保存直後にのみ表示する。`/profile`本体への
常設バナー化（未解決の提案がある場合に常に表示する等）はSprint17.3以降の拡張候補とし、
本Phaseのスコープには含めない**（スコープを絞るため）。

---

## 5. Roadmap Confidenceへの反映方法

### 5-1. 前提: Roadmap Update Engine（Sprint16.3）は未実装

現時点で`RoadmapItem`・Confidenceを実際に表示するUI（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)
6節）は存在しない。そのため本Phaseでの「反映」は、**将来Sprint16.3/17.4の`roadmapEngine.ts`が
呼び出すための契約（関数インターフェース）を用意すること**が中心になる。

### 5-2. 提供するインターフェース

```ts
// src/lib/taxReturnProfile.ts に実装（設計イメージ）
export function confidenceOfAmount(amount: AmountValue | null): 'high' | 'medium' | 'low' {
  if (!amount) return 'low';
  return amount.precision === 'exact' ? 'high' : 'medium';
}
```

| 状態 | Confidence |
|---|---|
| 正確な金額が入力されている（`precision: 'exact'`） | 高 |
| 概算レンジで入力されている（`precision: 'range'`） | 中 |
| 未入力（エントリ自体が無い、または該当項目が`null`） | 低 |

これは将来`roadmapEngine.ts`が`RoadmapItem.confidence`を計算する際、Tax Return Profile由来の
判定（例: 消費税確定申告の要否）について、根拠にした`AmountValue`の精度をそのまま
Confidenceに反映する、という単純な合成ルールにする設計とする。

### 5-3. Sprint17.2で目に見える形にする最小限の表現

Roadmap側のUIが無い間も、**入力した情報の精度をその場でユーザーに伝える**ため、
`/profile/tax-returns`の一覧表示で各金額項目の横に小さなタグを添える（3節の一覧画面）。

```
課税売上高: 800万円〜1,000万円未満  [概算]
確定法人税額: 1,850,000円          [正確]
```

既存の`.tag`クラス（モノクロ、CLAUDE.mdのUIルールに準拠）をそのまま使う。これは
Roadmap Confidenceの本実装（Sprint17.4）を待たずに、**同じ考え方をユーザーに先行して
見せる**という位置づけであり、6節・6-3節（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)）
で既に述べた「既存UIとの連続性」の方針に沿う。

---

## 6. 影響範囲の確認（CLAUDE.md開発フロー4番の実施）

| 変更対象 | 変更内容 | 影響を受ける既存の呼び出し元 |
|---|---|---|
| `src/lib/companyProfile.ts` | `deriveConsumptionTaxStatus`・`deriveCorporateTaxInterimFiling`・`deriveConsumptionTaxInterimFrequency`に任意引数`taxReturnProfile`を追加 | `src/app/(site)/profile/page.tsx`（呼び出し済み、引数省略のままなら挙動不変） |
| `src/lib/taxReturnProfile.ts` | 新規ファイル | なし（新規） |
| `src/app/(site)/profile/tax-returns/page.tsx` | 新規ページ | なし（新規） |
| `src/app/(site)/profile/page.tsx` | 新規カード1枚追加 | 既存セクションの変更なし |

`applyCompanyProfileToProcedures`（コミット`fa034f5`）・`Rule Engine`・`AI参謀`・`通知エンジン`は
本Phaseでは一切変更しない（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 10節の
通りSprint17.4以降の対象）。

---

## まとめ（レビュー観点）

1. **3-1節の要判断**: `/profile/tax-returns`をヘッダー・フッターナビに追加しないという
   CLAUDE.mdルールの例外扱いでよいか
2. **1-1節のバケット設計**: 課税売上高・消費税額・法人税額のバケット境界（特に法人税額の
   「20万円以下/超」という簡略化）が実用上十分か
3. **3-3節の簡略化**: Change Interview（Sprint17.3）と異なりCompanyProfile依存の質問スキップを
   行わない設計でよいか
4. **4-2節のスコープ**: 矛盾検出バナーを`/profile/tax-returns`保存直後のみに限定し、
   `/profile`本体への常設化をSprint17.3以降に回す点でよいか
5. **5節**: Roadmap Update Engine未実装の現状で「契約の用意＋タグ表示による先行体験」に
   留める、という反映方法の落としどころで妥当か
