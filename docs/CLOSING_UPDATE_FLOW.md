# CLOSING_UPDATE_FLOW.md — 決算更新フロー設計（Sprint18 Phase18.1）

**ステータス: 設計のみ。DB変更・マイグレーション・コード実装・画面実装は本Phaseでは一切行っていない。**
実装はレビュー後、Sprint18.2以降で段階的に行う（9節参照）。本ドキュメントは
[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md)（Sprint17 Phase17.1）6節
「Change Interview」と、Sprint17.2で実装済みの`detectMismatches`（`/profile/tax-returns/page.tsx`）を
出発点に、「TaxReturnProfile入力 → CompanyProfileとの差分確認 → Roadmap反映」という一連の流れを
独立した設計として掘り下げたもの。

## 0. 前提として確認した既存事実（Sprint17.2の実装を直接確認）

- **`/profile/tax-returns/page.tsx`の`detectMismatches`関数は、現状3項目のみを比較している**
  （`consumptionTaxStatus`・`corporateTaxInterimFiling`・`consumptionTaxInterimFrequency`）。
  いずれも`companyProfile.ts`の自動判定関数（`deriveConsumptionTaxStatus`等）が
  `TaxReturnProfile`を参照して返す推定値と、`CompanyProfile`の現在値を比較する実装になっている
- **`TaxReturnEntry`が持つ他のフィールド（`capitalAtFiling`・`withholdingTaxCycleActual`・
  `invoiceRegistrationStatus`・`employeeCountAtFiscalYearEnd`・`financialStatementPublished`）は、
  現状どれも`CompanyProfile`との突き合わせに使われていない。** 2節・3節でこの空白を埋める
- **`CompanyProfile.stage`を`second_term_or_later`へ更新する処理は、現状どこにも実装されていない。**
  [TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 6-2節で「Change Interview完了時に
  更新する」と設計されていたが、Sprint17.2の実装（手入力フォーム＋`detectMismatches`）はこの部分を
  実装していない。本Sprintで正式に設計する
- **`MismatchCard`（`/profile/tax-returns/page.tsx`）は既に「申告書を採用」「プロフィールを維持」の
  2択UIとして実装済み。** 本Sprintはこのパターンを踏襲・拡張する（3節・4節）
- **Roadmap Update Engine（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4節）・
  Roadmap History（同5節）はいずれも未実装。** 5節はこれらが実装された前提での接続方法を設計する
  （インターフェースの設計に留まる）

---

## 1. 決算更新フロー全体

### 1-1. 3つの入口が同じフローに合流する

TaxReturnEntry（決算1期分のデータ）は、将来的に3つの経路で作られうる。

| 入口 | 状態 |
|---|---|
| A. 手入力（`/profile/tax-returns`） | **実装済み（Sprint17.2）** |
| B. イベント連動（「決算」イベント登録に伴うChange Interview） | 未実装（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 9節で構想、`event_types.fiscal_year_end`は`is_active=false`のまま） |
| C. 将来のPDF読取（8節） | 将来構想（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 9節） |

**本ドキュメントの核心的な設計判断は、入口がどれであっても「TaxReturnEntry保存後に何をするか」を
1本のフローに統一すること**である。入口ごとに別々の差分確認・Roadmap反映ロジックを作らない。

```
[A.手入力] [B.イベント連動] [C.PDF読取]
     └──────────┬──────────┘
                ▼
       TaxReturnEntry 保存（済み、Sprint17.2）
                ▼
   ② 確認すべき変更点の洗い出し（2節）
                ▼
   ③ CompanyProfileとの矛盾確認（3節）
                ▼
   ④ Change Interview（採用/維持の確認、4節）
                ▼
   ⑤ Roadmapへの反映（5節）
                ▼
   ⑥ AI参謀への反映（6節）／⑦ 通知への反映（7節）
```

### 1-2. 「決算更新フロー」という名前の意味

Sprint16の「9. 毎年の更新フロー」（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)）は
決算を起点にした大枠のサイクルを9ステップで示していたが、②〜④の「差分確認」部分は概略に留まっていた。
本ドキュメントはこの②〜④を独立して深掘りし、実装済みのSprint17.2コードとの対応関係を明確にする。

---

## 2. TaxReturnProfile入力後に確認すべき変更点

TaxReturnEntryの全フィールドのうち、CompanyProfileと突き合わせる意味があるものを棚卸しする。

| TaxReturnEntryのフィールド | 対応するCompanyProfileフィールド | 現状 | 本Sprintでの扱い |
|---|---|---|---|
| （2期前の`taxableSalesAmount`から導出） | `consumptionTaxStatus` | **実装済み**（0節） | 変更なし |
| （前期の`corporateTaxAmount`から導出） | `corporateTaxInterimFiling` | **実装済み** | 変更なし |
| （前期の`consumptionTaxAmount`から導出） | `consumptionTaxInterimFrequency` | **実装済み** | 変更なし |
| `capitalAtFiling` | `capital` | **未実装** | 3節で追加設計。増資イベントの記録漏れ検出 |
| `withholdingTaxCycleActual` | `withholdingTaxCycle` | **未実装** | 3節で追加設計 |
| `invoiceRegistrationStatus`（エントリ側） | `invoiceRegistrationStatus`（現況） | **未実装** | 3節で追加設計 |
| `employeeCountAtFiscalYearEnd` | `employeeCount` | **未実装** | 3節で追加設計（従業員数の乖離検出） |
| （エントリの存在そのもの） | `stage` | **未実装** | 3節で追加設計（`first_term`→`second_term_or_later`遷移） |
| `financialStatementPublished` | 対応フィールドなし | — | CompanyProfileとの矛盾ではなく、6節（AI参謀）・7節（通知）の材料として扱う |

**方針**: CompanyProfileに対応フィールドがある項目は3節の矛盾確認の対象にする。対応フィールドが
無い項目（決算公告実施の有無等）は「矛盾」ではなく「事実の記録」であり、AI参謀・通知が
そのまま参照すればよいため、無理にCompanyProfile側にフィールドを新設しない
（[COMPANY_PROFILE_ENGINE.md](COMPANY_PROFILE_ENGINE.md)以来の「必要な概念は既存の型で表現できないか
先に検討する」という開発フローの原則に沿う）。

---

## 3. CompanyProfileとの矛盾確認

### 3-1. 既存の`detectMismatches`を4種類の追加チェックで拡張する

Sprint17.2の`detectMismatches`（0節）と同じ「関数が`Mismatch[]`を返し、`MismatchCard`が
1件ずつ表示する」というパターンをそのまま踏襲し、以下4種類を追加する（設計イメージ）。

```ts
// 設計イメージ（Sprint18.2でコード化。既存の detectMismatches に追加する形）

// ① 資本金の乖離（増資イベントの記録漏れ検出）
if (latest?.capitalAtFiling !== null && latest.capitalAtFiling !== profile.capital) {
  mismatches.push({
    field: 'capital',
    label: '資本金',
    currentLabel: `${profile.capital?.toLocaleString() ?? '未入力'}円`,
    suggestedLabel: `${latest.capitalAtFiling.toLocaleString()}円`,
    apply: (p) => ({ ...p, capital: latest.capitalAtFiling }),
  });
}

// ② 源泉所得税の納付サイクルの乖離
if (latest?.withholdingTaxCycleActual && latest.withholdingTaxCycleActual !== profile.withholdingTaxCycle) {
  mismatches.push({ field: 'withholdingTaxCycle', /* ... */ });
}

// ③ インボイス登録状況の乖離
if (latest && latest.invoiceRegistrationStatus !== profile.invoiceRegistrationStatus) {
  mismatches.push({ field: 'invoiceRegistrationStatus', /* ... */ });
}

// ④ 会社ステージの遷移（stageがまだ first_term のままだが、決算実績が1件でもあれば矛盾）
if (profile.stage === 'first_term' && taxReturnProfile.entries.length > 0) {
  mismatches.push({
    field: 'stage',
    label: '会社ステージ',
    currentLabel: '1期目',
    suggestedLabel: '2期目以降',
    apply: (p) => ({ ...p, stage: 'second_term_or_later' }),
  });
}
```

### 3-2. 従業員数の乖離は「矛盾」ではなく「注意喚起」に留める

`employeeCountAtFiscalYearEnd`と`CompanyProfile.employeeCount`の差は、決算日から現在までの
自然な増減（採用・退職）でも普通に発生するため、他の項目のような「どちらかが正しい」という
二択の矛盾確認にはなじまない。**`Mismatch`としては扱わず、6節のAI参謀コメントで
「期末時点から従業員数が変わっていませんか」と軽く触れる程度に留める**（要判断事項として9節に残す）。

### 3-3. 「採用/維持」の2択という原則は本Sprintでも変えない

承認済み方針（Sprint17.2）の通り、**TaxReturnProfileを自動的に正としない**。追加した4項目も
既存の`MismatchCard`（「申告書を採用」／「プロフィールを維持」）をそのまま再利用し、
新しいUIパターンは持ち込まない。

---

## 4. Change Interviewの質問項目

### 4-1. 「入力の質問」と「確認の質問」を区別する

[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 6-1節の10問は「TaxReturnEntry自体を
埋めるための質問」であり、Sprint17.2では対話形式ではなく1画面のフォームとして実装済み（3-3節の簡略化）。

**本ドキュメントのChange Interviewは、TaxReturnEntry保存**後**に、3節で検出した矛盾をユーザーに
確認してもらう「確認の質問」を指す。** この確認質問は既にSprint17.2で3項目分実装済みの
`MismatchCard`がそのまま担っている。本Sprintは対象を4節で追加した項目に広げるのみで、
UIパターンとしての新設は無い。

### 4-2. 質問文の一覧（追加4項目分、設計イメージ）

| 項目 | 質問文（`MismatchCard`の文面） |
|---|---|
| 資本金 | 「資本金：現在のプロフィールは○○円ですが、前期申告では△△円でした。増資などがあった場合は申告書を採用してください」 |
| 源泉所得税の納付サイクル | 「源泉所得税の納付：現在のプロフィールは「○○」ですが、前期は「△△」でした」 |
| インボイス登録状況 | 「インボイス登録：現在のプロフィールは「○○」ですが、前期申告時点では「△△」でした」 |
| 会社ステージ | 「会社ステージ：決算実績が登録されたため、2期目以降に切り替わります」（このケースのみ、実質的に確定事実に近いため「維持する」を選んでも次回decision入力時に再度表示される、という仕様を想定） |

---

## 5. Roadmapへ反映する項目

Roadmap Update Engine（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 4節）は
Sprint16.3で未実装のため、本節は「実装された際にどう繋がるか」というインターフェース設計に留まる。

| 決算更新フローで変わりうる値 | Roadmapへの影響 |
|---|---|
| `consumptionTaxStatus`が`taxable`に変わる | `CONSUMPTION_TAX_RETURN`（消費税確定申告、`include_in_diagnosis=false`）がRule Engine経由で表示対象になる（[PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md](PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md)の設計通り） |
| `corporateTaxInterimFiling`/`consumptionTaxInterimFrequency`が変わる | 中間申告手続きの要否が変わる（該当手続きは[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)優先度「中」でまだ未実装のため、実質的な反映は該当手続き追加後） |
| `stage`が`second_term_or_later`になる | 既存`applyCompanyProfileToProcedures`（コミット`fa034f5`）が設立系手続きを非表示にする。**これは既存実装のため、決算更新フローが完成すれば追加コードなしで連動する** |
| `capital`が更新される | 決算公告・消費税ステータスの自動判定（`deriveConsumptionTaxStatus`の資本金1,000万円判定）に影響 |

すべての更新はRoadmap History（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 5節）へ
「CompanyProfile変更ログ」として記録される想定（Roadmap History自体も未実装のため、Sprint16.2/18.x
いずれかで一括実装する際に反映する）。

---

## 6. AI参謀への反映

### 6-1. 「決算更新サマリー」という新しいコメント種別

既存の`buildProfileAdvisories`（Phase14.2、現況ベース）・`buildRoadmapForesight`（仮称、
[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 7-2節、傾向ベース）に加えて、
**決算更新フローが完了した直後にのみ表示する一過性のサマリーコメント**を新設する
（`buildClosingUpdateSummary`、仮称）。

例:
- 「今期から消費税の課税事業者に切り替わりました。次の消費税確定申告にご注意ください」
  （`consumptionTaxStatus`が`exempt`→`taxable`に変わった場合）
- 「法人税の中間申告が必要になりました」（`corporateTaxInterimFiling`が`none`→`has`）
- 「期末時点の従業員数（○名）が現在のプロフィール（△名）と異なるようです。最新の人数に
  更新することをおすすめします」（2節・3-2節の「注意喚起」がここで具体化される）

### 6-2. 既存関数との関係

`buildProfileAdvisories`・`buildRoadmapForesight`はどちらも「継続的に表示される」助言だが、
`buildClosingUpdateSummary`は**決算更新フロー完了直後の1回だけ**表示するという性質が異なる
（既に確認・対応済みの内容を繰り返し表示しても意味が無いため）。表示のオン/オフは
「直近のChange Interviewで確認済みかどうか」で判定する設計とし、既存2関数のコードは変更しない。

---

## 7. 通知への反映

### 7-1. 既存の責務分担を維持する

`buildNotifications`（期限のみ）・`buildRoadmapAlerts`（仮称、Confidence低下等、
[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md) 8節）の役割分担は変更しない。
決算更新フローに関する通知は、**新しい関数を追加するのではなく`buildRoadmapAlerts`に
条件を追加する**形にする（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 8節の
「前期申告未登録の催促」を踏襲・拡張）。

| 通知 | 発生条件 |
|---|---|
| 決算未入力の催促（設計済み、[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 8節） | 決算日から90日以上、対応する`TaxReturnEntry`が無い |
| 矛盾未解決の催促（本Sprintで追加） | `TaxReturnEntry`保存後、3節の`Mismatch`が一定期間（例: 7日）解決されないまま残っている |
| 決算更新完了の確認（本Sprintで追加） | 全ての`Mismatch`が解決された直後（成功のフィードバックとして一度だけ表示。既存の`saved`ステート表示パターン踏襲） |

---

## 8. 将来のPDF読取との接続

[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 9節のOCR・AI抽出構想と、
本ドキュメントの決算更新フローがどう接続するかを整理する（**本Sprintの実装対象ではない**）。

### 8-1. PDF読取は「入口Cを追加するだけ」で済む設計にする

1-1節の通り、決算更新フローは入口（手入力/イベント連動/PDF読取）を問わず同じ経路に合流する
設計にしてある。PDF読取が実現した場合、**やることは「OCR抽出結果からTaxReturnEntryのドラフトを
組み立てて、既存の`/profile/tax-returns`の編集フォームに読み込ませる」だけ**であり、
2節〜7節の差分確認・Roadmap反映・AI参謀・通知のロジックは一切変更不要になる設計とする。

### 8-2. Confidence（3分類）とOCR抽出値の関係

`AmountValue.precision`は現状`'exact' | 'range'`の2値（Sprint17.2）。OCR抽出値は「一見正確な数字だが
読み取り精度は保証されない」という、どちらとも言い切れない性質を持つ。

**本ドキュメントでの結論**: `precision`に3値目（例: `'ocr_extracted'`）を追加するのではなく、
**OCR抽出直後は`exact`として保存するが、ユーザーが編集フォームで一度確認・保存し直すまでは
`TaxReturnEntry`に`verified: boolean`（仮称）のような別軸のフラグを持たせる**方向で検討する
（Confidence計算＝`confidenceOfAmount`のロジックとは独立させる）。この設計の是非は
実装時期（Sprint18.6以降、または着手しない）が確定してから改めて検討する。

---

## 9. 実装計画

| Phase | 目的 | 主な対象ファイル（推測） | 前提 | 要判断事項 |
|---|---|---|---|---|
| **18.2** | `detectMismatches`に4項目（資本金・源泉所得税サイクル・インボイス登録状況・会社ステージ）を追加（3節） | `src/app/(site)/profile/tax-returns/page.tsx` | Sprint17.2完了（済み） | 会社ステージの矛盾は「維持」を選んでも解消されない設計でよいか（4-2節） |
| **18.3** | 従業員数の乖離をAI参謀の注意喚起として実装（3-2節・6-1節の一部） | `src/lib/adviserScore.ts`または新規関数 | 18.2完了 | Mismatchにせず注意喚起に留める設計の妥当性 |
| **18.4** | `buildClosingUpdateSummary`（6節）の実装、決算更新完了通知（7節）の実装 | `src/lib/adviserScore.ts`、`src/lib/roadmapAlerts.ts`（[ROADMAP_EVOLUTION_ENGINE.md](ROADMAP_EVOLUTION_ENGINE.md)で予告済みの新規ファイル） | 18.2・18.3完了 | 「決算更新完了直後の1回だけ表示」をどう判定・記憶するか（Roadmap History未実装のため代替手段が必要） |
| **18.5** | Roadmap Update Engine（Sprint16.3）実装後、5節の接続を実際に配線 | `src/lib/roadmapEngine.ts` | Sprint16.3完了 | 別Sprintの完了待ちのため時期未定 |
| **18.6** | PDF読取の技術検証（8節、着手するかどうかを含めて再検討） | 未定 | コンプライアンス方針の確定（[TAX_RETURN_PROFILE_ENGINE.md](TAX_RETURN_PROFILE_ENGINE.md) 9-4節） | 着手可否そのものが要判断 |

---

## まとめ（設計レビュー観点）

1. **3節の4項目追加**: 資本金・源泉所得税サイクル・インボイス登録状況・会社ステージの4つを
   矛盾確認の対象に追加するという範囲でよいか
2. **3-2節**: 従業員数の乖離を「矛盾」ではなく「AI参謀の注意喚起」に留める整理でよいか
3. **4-2節**: 会社ステージの矛盾について、「維持」を選んでも実質的に解消しない（次回も
   表示され続ける）という仕様でよいか、それとも「維持」を選んだら二度と聞かない設計にすべきか
4. **6-1節**: 「決算更新サマリー」を一過性のコメントとして新設する方針、既存2関数との3階建て構成でよいか
5. **8-2節**: OCR抽出値の確からしさを`precision`とは別軸の`verified`フラグで表現する方向性の妥当性
6. **9節**: Phase18.5（Roadmap Update Engine接続）が他Sprintの完了待ちになっている点を
   スケジュール上どう扱うか
