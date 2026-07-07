# PROCEDURE_MASTER_PHASE15_2_PROPOSAL.md — Phase15.2 追加提案（実装前レビュー用）

**ステータス: 提案 → 承認 → 実装・実行済み。** 本ドキュメント自体は提案時点（DBマイグレーション・
コード変更は未実施の状態）に書かれたものだが、その後の承認を経て`supabase/migration_procedure_master_phase15_2.sql`
（11手続きのうち法定調書合計表を除いた10件＋`event_types`5件＋`rules`11件を投入）が作成され、
Supabase SQL Editorで実行済み・Playwrightで動作確認済みである。実行結果の詳細は
[ROADMAP.md](ROADMAP.md) v0.5.5を参照。
[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md)（Phase15.1）で承認いただいた方針に基づき、
Phase15.2で追加する11手続きの詳細設計を提案する。レビュー後、承認いただいた内容のみ実装する。

## 0. 承認済み方針（Phase15.1レビューの確認）

1. 地方税カテゴリは`local_tax`として`tax`から分離する
2. `insurance`と`labor`は現時点では統合しない
3. 決算公告は`legal`カテゴリ、提出先なしとして扱う
4. 新規イベント種別は追加可（賞与支給・36協定・本店移転・決算・インボイス登録）
5. 消費税中間申告の11回対応は今回実装しない（なし／年1回までを対象、3回／11回は別Sprint）

---

## 1. 技術的な前提確認（実装方針に影響するため先に共有）

設計に入る前に、既存スキーマ・コードを確認して分かった2点を共有する。いずれもPhase15.2の
「DBマスター追加とRule Engine連携までを優先し、既存UIを壊さない」という制約に直接関わる。

### 1-1. `category`列はPostgreSQL側にCHECK制約が無い（`TEXT NOT NULL`のみ）

`supabase/schema.sql`を確認したところ、`procedures.category`は素の`TEXT NOT NULL`で、DB側のENUM/CHECK制約は
存在しない。**`local_tax`という新しい値をINSERTすること自体はマイグレーション不要**（既存の値と同列にINSERTするだけ）。
一方、`src/lib/types.ts`の`ProcedureCategory`型（TypeScript側のUnion型）には`local_tax`が無いため、型定義の
1行追加は必要になる。UI側の表示ラベル（`ScheduleList.tsx`の`CATEGORY_LABEL`等）は`CATEGORY_LABEL[proc.category] ?? 'その他'`
という**フォールバック付き**の実装になっているため、ラベルを追加しなくても未知のカテゴリは「その他」表示に
フォールバックするだけでクラッシュはしない。

→ **提案**: 型定義（`ProcedureCategory`に`'local_tax'`を追加）のみ本Phaseで行い、表示ラベル・管理画面の
カテゴリ選択肢（`adminConstants.ts`）・フィルタ等の実際のUI対応はPhase15.3以降に回す
（該当データは一時的に「その他」表示になるが、クラッシュはしない）。

### 1-2. 決算公告の「提出先なし」は2通りの実現方法があり、リスクが異なる

`procedures.office_type`は`TEXT NOT NULL`かつ`organization_types.code`へのFK制約が付いている。

| 案 | 内容 | 必要な変更 | リスク |
|---|---|---|---|
| A. `office_type = 'other'`を流用（推奨） | `organization_types`に既に存在する`code='other'`（その他、sort_order 99）をそのまま使う。この種別に紐づく`organization_offices`/`jurisdictions`データは存在しないため、`resolveOffices`は自然に「該当する窓口なし」を返し、`office: null`になる | なし（既存マスタの範囲内） | リスクなし。ただし「その他」という意味的にはやや不正確な流用ではある |
| B. `office_type`のNOT NULL制約を外す | `ALTER TABLE procedures ALTER COLUMN office_type DROP NOT NULL`し、決算公告のみ`office_type = NULL` | マイグレーション1行 | 低リスク（`office`関連の表示は既に全箇所`null`許容で書かれている）が、制約変更を伴う |

→ **提案**: A案（`office_type = 'other'`）を推奨する。マイグレーション不要で済み、意味的にも「行政機関以外
（官報・電子公告）」を表す用途に`other`という値は違和感が少ない。B案でも実装は可能なため、意味的な正確さを
優先するならBでも問題ない（要判断）。

### 1-3. 新規イベント種別を追加すると、既存`/events`ページがクラッシュしうる

`src/app/(site)/events/page.tsx`は`fetchEventTypes()`で`event_types`テーブルの`is_active = true`の行を
**全件**取得し、`EVENT_ICON[et.code]`（`Record<EventTypeCode, Icon>`、現状3種のみ定義）からアイコンを引いて
描画する。**新しい`event_types`行を`is_active = true`で追加すると、`EVENT_ICON`に対応するキーが無いため
`Icon`が`undefined`になり、既存の`/events`ページがレンダリング時にクラッシュする。**

→ **提案**: 新規5種の`event_types`は**`is_active = false`で追加**する。`fetchEventTypes`は
`is_active = true`のみ取得するため、既存`/events`のイベント選択画面には一切影響しない
（＝「既存UIを壊さない」を確実に満たす）。各イベントを実際に使う段階（`EVENT_ICON`・
`EventTypeCode`型の拡張とセット）で`is_active = true`に切り替える、という運用を提案する。

この結果、**「決算」「本店移転」イベントに紐づくRuleは今回データとしては投入するが、`/events`経由では
まだ発火しない**（イベント自体が非活性のため）。5節でこの影響範囲を手続きごとに明記する。

---

## 2. 追加するprocedure一覧（11件）

| 提案code | 名称 | category | office_type | 対象法人 | requires_employees | timing_type / timing_data | 期限（timing_label） | frequency | include_in_diagnosis |
|---|---|---|---|---|---|---|---|---|---|
| CORP_TAX_RETURN | 法人税確定申告 | tax | tax_office | 問わず | false | fiscal_offset `{months:2}` | 決算日の翌日から2ヶ月以内 | annual | **true** |
| CONSUMPTION_TAX_RETURN | 消費税確定申告 | tax | tax_office | 問わず | false | fiscal_offset `{months:2}` | 決算日の翌日から2ヶ月以内 | **false**（3節参照） | false |
| PREFECTURAL_RESIDENT_TAX_RETURN | 法人県民税申告 | local_tax | prefectural_tax | 問わず | false | fiscal_offset `{months:2}` | 決算日の翌日から2ヶ月以内 | annual | true |
| PREFECTURAL_BUSINESS_TAX_RETURN | 法人事業税申告 | local_tax | prefectural_tax | 問わず | false | fiscal_offset `{months:2}` | 決算日の翌日から2ヶ月以内 | annual | true |
| MUNICIPAL_RESIDENT_TAX_RETURN | 法人市民税申告 | local_tax | municipal_tax | 問わず | false | fiscal_offset `{months:2}` | 決算日の翌日から2ヶ月以内 | annual | true |
| DEPRECIABLE_ASSET_TAX_RETURN | 償却資産申告 | local_tax | municipal_tax | 問わず | false | fixed_date `{month:1, day:31}` | 毎年1月31日 | annual | true |
| SALARY_PAYMENT_REPORT | 給与支払報告書 | local_tax | municipal_tax | 問わず | **true** | fixed_date `{month:1, day:31}` | 毎年1月31日 | annual | true |
| STATUTORY_RECORD_SUMMARY | 法定調書合計表 | tax | tax_office | 問わず | false | fixed_date `{month:1, day:31}` | 毎年1月31日 | annual | true |
| WITHHOLDING_SPECIAL_EXCEPTION | 源泉所得税の納期の特例申請 | tax | tax_office | 問わず | true | event_based `null` | 随時（提出の翌々月納付分から適用） | as_needed | false |
| TAX_OFFICE_CHANGE_NOTICE | 異動届出書 | tax | tax_office | 問わず | false | event_based `null` | 遅滞なく（法定の日数指定なし） | one_time | false |
| FINANCIAL_STATEMENT_PUBLICATION | 決算公告 | legal | **other**（1-2節A案） | **kabushiki限定** | false | fiscal_offset `{months:3}` | 定時株主総会後、遅滞なく（目安: 決算日から3ヶ月以内） | annual | true |

### 2-a. CompanyProfile条件・イベント起点（Rule Engine連携）

| procedure | 診断エンジン（`/start`）での表示条件 | Rule Engine連携（`/events`） | CompanyProfile条件 |
|---|---|---|---|
| 法人税確定申告 | 常に表示（`include_in_diagnosis=true`） | 「決算」イベント発火時に`add_procedure`（無条件） | なし |
| 消費税確定申告 | **非表示**（免税事業者に誤表示しないため） | 「決算」イベント発火時、条件`consumption_tax_status = 'taxable'` | `consumptionTaxStatus === 'taxable'` |
| 法人県民税申告 | 常に表示 | 「決算」イベント発火時に`add_procedure`（無条件） | なし |
| 法人事業税申告 | 常に表示 | 同上 | なし |
| 法人市民税申告 | 常に表示 | 同上 | なし |
| 償却資産申告 | 常に表示（注記付き） | 「決算」イベントとは連動させない（暦年基準のため） | なし（対象資産の有無を判定するフィールドがCompanyProfileに無いため、一律表示＋`caution_note`で「対象資産が無ければ提出不要」と案内） |
| 給与支払報告書 | 常に表示（従業員なしの場合は`requires_employees`フィルタで自動除外） | 連動させない（暦年基準） | `employeeCount > 0` |
| 法定調書合計表 | 常に表示 | 連動させない（暦年基準） | なし |
| 源泉所得税の納期の特例申請 | 非表示（オプトインの届出のため） | **既存**の「会社設立」「従業員採用」イベント発火時、条件`withholding_tax_cycle = 'unset'` | `withholdingTaxCycle === 'unset' && employeeCount > 0` |
| 異動届出書 | 非表示（イベント起点のみ） | 「本店移転」イベント発火時に`add_procedure`（無条件）※1-3節よりイベント自体が非活性のため**今回は実質発火しない** | なし |
| 決算公告 | 常に表示（`corporate_type`フィルタで合同会社は既存ロジックにより自動除外） | 「決算」イベント発火時、条件`corporate_type = 'kabushiki'` | `corporateType === 'kabushiki'` |

**ポイント**: 「法人税確定申告」「県民税」「事業税」「市民税」「償却資産申告」「給与支払報告書」「法定調書合計表」「決算公告」は
`fiscal_offset`/`fixed_date`という**イベント不要の計算方式**を使うため、`/events`でイベントを登録しなくても
`/start`→`/result`の通常診断だけで正しく表示される。「決算」イベントへのRule紐付けは、将来`/events`経由の
経営イベントエンジンからも同じ手続きを再確認・再表示できるようにするための**保険的な二重経路**という位置づけ。

---

## 3. 消費税確定申告を非表示にする理由（要確認）

`runDiagnosis`（`/start`→`/result`）は現状ルールエンジンを経由せず、`procedures`テーブルの静的フィルタ
（`corporate_type`・`requires_employees`等）のみで絞り込む設計（[RULE_ENGINE.md](RULE_ENGINE.md)にも
明記の既知の制約）。`consumptionTaxStatus`のような`CompanyProfile`条件は、この静的フィルタの対象外のため、
`include_in_diagnosis = true`にすると**免税事業者にも一律で表示されてしまう**。

これを避けるため、消費税確定申告のみ`include_in_diagnosis = false`とし、Rule Engine経由（`/events`の
「決算」イベント、条件`consumption_tax_status='taxable'`）でのみ表示させる設計を提案する。ただし1-3節の
通り「決算」イベントは今回`is_active=false`で追加するため、**Rule自体は投入するが実際に発火する経路が
無い状態**になる（=このルールが実際に使われるのは、将来「決算」イベントを`is_active=true`にする
フェーズから）。

**代替案**: 消費税確定申告も他の4件同様`include_in_diagnosis = true`にして一律表示し、`caution_note`に
「免税事業者は対象外です」という注記を付ける、という単純な扱いも可能（Rule Engine連携を待たずに
今すぐ全ユーザーに見える状態にできる）。どちらを採用するか判断を仰ぎたい。

---

## 4. 法定調書合計表と既存`YEAR_END_ADJUSTMENT`の重複について（要確認）

既存の手続き（ID:10、`YEAR_END_ADJUSTMENT`）は「年末調整・法定調書合計表の提出」という名称で、
既に税務署への法定調書合計表提出を内容として含んでいる。今回追加する`STATUTORY_RECORD_SUMMARY`
（法定調書合計表）は内容が重複する。

「既存データ・既存UIを壊さない」方針に従い、本提案では**既存ID:10は変更せず、新規`STATUTORY_RECORD_SUMMARY`を
追加する**案としている。ただしこのままだと`/result`の「今後予定」に類似の2手続きが並んで表示される
（ユーザーにとって重複感がある）。

**選択肢**:
- A. そのまま2件併存させ、Phase15.3以降でID:10の名称を「年末調整（内部処理）」等に変更し役割分担を明確化する
- B. 今回`STATUTORY_RECORD_SUMMARY`の追加を見送り、既存ID:10をそのまま「法定調書合計表」相当として扱う
- C. 今回のタイミングでID:10の名称・説明文のみ更新する（データ変更を伴うため「既存データを壊さない」の解釈次第）

いずれを採用するか判断を仰ぎたい（本提案はAを暫定案としている）。

---

## 5. `event_types`への追加（5件、いずれも`is_active = false`で追加を提案）

| 提案code | 名称 | 本Phase15.2での用途 |
|---|---|---|
| fiscal_year_end | 決算 | 上記6手続き（法人税・消費税・県民税・事業税・市民税・決算公告）のRule条件に使用。ただし`is_active=false`のため`/events`からは選択不可 |
| hq_relocation | 本店移転 | 異動届出書のRule条件に使用。同上、選択不可 |
| bonus_payment | 賞与支給 | 今回は未使用。将来「賞与支払届」追加時に活性化する想定（[PROCEDURE_MASTER_AUDIT.md](PROCEDURE_MASTER_AUDIT.md) 4-b参照） |
| labor_agreement_36 | 36協定 | 今回は未使用。将来「36協定の届出」追加時に活性化 |
| invoice_registration | インボイス登録 | 今回は未使用。将来「適格請求書発行事業者の登録申請」追加時に活性化 |

`src/lib/types.ts`の`EventTypeCode`型は**今回拡張しない**（型を拡張すると`events/page.tsx`の
`EVENT_ICON`が全ケースを網羅できているかのチェックが崩れるため、UIを一切触らない今回は型も現状維持とする）。
`event_types`テーブル自体へのINSERTのみ行い、TypeScript側からは（`is_active=false`なので）実質見えない状態にする。

---

## 6. 追加するRuleの一覧（`rules` / `rule_conditions` / `rule_actions`）

5節の通り「決算」「本店移転」イベントは`is_active=false`のため、以下のRuleは**データとしては投入するが
実際には発火しない**（将来のイベント活性化時にそのまま使える状態で待機させる、という位置づけ）。

| ルール名（提案） | 条件 | アクション |
|---|---|---|
| 決算：法人税確定申告 | `event_type_code = fiscal_year_end` | `add_procedure` → CORP_TAX_RETURN |
| 決算：法人県民税申告 | 同上 | → PREFECTURAL_RESIDENT_TAX_RETURN |
| 決算：法人事業税申告 | 同上 | → PREFECTURAL_BUSINESS_TAX_RETURN |
| 決算：法人市民税申告 | 同上 | → MUNICIPAL_RESIDENT_TAX_RETURN |
| 決算：消費税確定申告（課税事業者のみ） | `event_type_code = fiscal_year_end` ＋ `consumption_tax_status = taxable` | → CONSUMPTION_TAX_RETURN |
| 決算：決算公告（株式会社のみ） | `event_type_code = fiscal_year_end` ＋ `corporate_type = kabushiki` | → FINANCIAL_STATEMENT_PUBLICATION |
| 本店移転：異動届出書 | `event_type_code = hq_relocation` | → TAX_OFFICE_CHANGE_NOTICE |
| 本店移転：本店移転登記（既存procedure_id=44との接続） | `event_type_code = hq_relocation` | → LEGAL_HQ_RELOCATION（既存ID:44。現状`include_in_diagnosis=false`かつどのイベントにも未接続のため、これを機に接続する提案） |

一方、以下2件は**既存の活性化済みイベント**を使うため、今回から実際に発火する。

| ルール名（提案） | 条件 | アクション |
|---|---|---|
| 会社設立：源泉所得税の納期の特例申請（提案） | `event_type_code = company_establishment` ＋ `withholding_tax_cycle = unset` | `add_procedure` → WITHHOLDING_SPECIAL_EXCEPTION |
| 従業員採用：源泉所得税の納期の特例申請（提案） | `event_type_code = employee_hired` ＋ `withholding_tax_cycle = unset` | 同上 |

`rules.name`にはUNIQUE制約があるため（[RULE_ENGINE.md](RULE_ENGINE.md)既知の教訓）、マイグレーション実装時は
`ON CONFLICT (name) DO NOTHING`で冪等化する。

---

## 7. 本提案で見送るもの（Phase15.1監査の範囲外・別Sprint）

- 消費税中間申告の3回／11回対応（承認済み方針5の通り、今回は「なし／年1回まで」のみ）
- `CATEGORY_LABEL`等UI表示ラベルの`local_tax`対応、管理画面のカテゴリ選択肢追加（1-1節、Phase15.3候補）
- `event_types`の活性化（`is_active=true`化）とそれに伴う`/events`ページのUI拡張（`EVENT_ICON`・`EventTypeCode`型拡張）
- 36協定・賞与支払届・インボイス登録申請そのものの手続き追加（`event_types`のみ今回先行投入）
- 就業規則の届出（`employeeCount >= 10`判定）

---

## 8. 実装時のチェックリスト（承認後の作業範囲の確認用）

承認いただいた場合、Phase15.2の実装は以下のみに限定する。

- [ ] `supabase/migration_procedure_master_phase15_2.sql`の新規作成
  - `procedures`へ11件INSERT（`ON CONFLICT (code) DO NOTHING`で冪等化）
  - `event_types`へ5件INSERT（`is_active = false`、`ON CONFLICT (code) DO NOTHING`）
  - `rules`/`rule_conditions`/`rule_actions`へ8件のルール投入（[RULE_ENGINE.md](RULE_ENGINE.md)の冪等化パターンに従う）
  - 新規`office_type`（`prefectural_tax`・`municipal_tax`・`other`）は既存`organization_types`の範囲内のため
    マスタ追加は不要
  - **実データを確認したところ、`prefectural_tax`/`municipal_tax`の`jurisdictions`は東京都渋谷区
    （`municipality_id=1`、「東京都渋谷都税事務所」「渋谷区役所（税務課）」）の1件ずつしか登録されておらず、
    福岡県60市区町村には1件も無い。** 現状のままlocal_tax系5手続き（県民税・事業税・市民税・償却資産・
    給与支払報告書）を追加すると、**福岡県の対応市区町村では手続き自体は表示されるが「管轄機関」欄が
    空（`office: null`）になる**（既存コードは`office`が`null`でも表示上クラッシュしないため、動作は壊れない）。
    地方税の管轄機関データ投入（都道府県税事務所・市区町村役場の住所等）はPhase15.2のスコープ外とし、
    別Sprintで対応することを提案する（本Phaseは「手続きが存在し、期限が計算される」ところまで）
- [ ] `src/lib/types.ts`の`ProcedureCategory`型に`'local_tax'`を追加（1行のみ）
- [ ] `npm run build`でTypeScriptエラー0・既存ページのビルド成功を確認
- [ ] Playwrightで`/start`→`/result`の診断結果に新規手続きが正しいカテゴリ・期限で表示されることを確認
      （特に「その他」フォールバック表示になっていないか、`local_tax`のUI対応を待つ間の見え方を確認）
- [ ] 既存の`/events`ページが新規`event_types`追加後もクラッシュせず動作することを確認（1-3節の検証）
- [ ] 福岡県の市区町村で地方税系手続きの「管轄機関」欄が空表示（クラッシュではなく単に情報欄が出ない）に
      なることを確認し、その旨を報告（上記で判明済み、データ投入は別Sprint）

**画面変更は行わない**ため、`/profile`・`ScheduleList.tsx`・管理画面等の既存UIコードは一切変更しない
（`ProcedureCategory`型定義の1行追加のみ）。
