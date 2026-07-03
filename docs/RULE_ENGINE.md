# RULE_ENGINE.md — ルールエンジン設計

対象実装: `src/lib/ruleEngine.ts`（評価ロジック）、`src/lib/events.ts`（呼び出し元）、
`supabase/migration_rule_engine.sql`（スキーマ・初期データ）、`src/app/admin/(protected)/rules/`（管理画面）。

## 目的

Phase 2（経営イベントエンジン）では、「どのイベントにどの手続きが該当するか」を`event_procedures`という
固定の中間テーブル＋TypeScript側にハードコードされた`corporate_type`フィルタで実現していた。この方式には
2つの限界があった。

1. 新しい条件（従業員数・地域・資本金など）を追加するたびにTypeScriptのコード変更が必要
2. 「必要手続きを追加する」以外のアクション（警告表示、提出先の変更、期限の変更）を表現できない

ルールエンジンはこれを解消し、**「会社情報・イベント情報から何を実行するか」を全てDBデータとして表現し、
管理画面からのルール追加・編集だけで判定ロジックを拡張できる**ようにするために作られた。
新しい条件フィールドや新しいルールを追加する作業に、原則コード変更は不要（詳細は「将来の拡張方針」）。

## `rules` / `rule_conditions` / `rule_actions` の役割

| テーブル | 役割 |
|---|---|
| `rules` | ルールの器。名前・優先度（`priority`）・有効フラグ（`is_active`）のみを持つ |
| `rule_conditions` | そのルールが成立する条件。`field`（コンテキストのキー名）・`operator`・`value`（JSONB）の組。1ルールに0〜複数件 |
| `rule_actions` | 条件が成立したときに実行する内容。`action_type`・`procedure_id`・`payload`（JSONB）の組。1ルールに1〜複数件 |

## 条件評価の流れ

1. 呼び出し元（`src/lib/events.ts`の`registerCompanyEvent`）が、登録されたイベントから**評価コンテキスト**
   （`RuleContext`、`Record<string, unknown>`）を組み立てる。MVPで使っているキーは
   `event_type_code` / `corporate_type` / `has_employees` / `prefecture_code`
2. `evaluateRules(client, context)`（`ruleEngine.ts`）が`is_active = true`の全ルールを`priority`昇順で取得し、
   各ルールについて`rule_conditions`を**全件AND評価**する（1件でも不成立ならそのルールは不成立）
3. 条件が0件のルールは常に成立する（全体共通の警告等に使える）
4. 成立したルールの`rule_actions`を`sort_order`順に処理し、結果を集約する：
   - `add_procedure` → 追加する`procedure_id`の集合（重複除去）
   - `show_warning` → 表示する警告メッセージの配列
   - `change_office` / `change_deadline` → `procedure_id`をキーにした上書き用`Map`
     （複数ルールが同じ`procedure_id`を上書きする場合、`priority`が大きい＝後に評価されたルールが勝つ）
5. `registerCompanyEvent`は`add_procedure`で集まった`procedure_id`群を`procedures`テーブルから取得し、
   `change_deadline`/`change_office`の上書きがあれば適用したうえで、既存の`calculateNextDeadline`・
   `officeMap`（`resolveOffices`の結果）と組み合わせて最終的な`ProcedureResult[]`を組み立てる

**OR条件が必要な場合**は、1ルールに複数条件を入れず、条件の異なるルールを複数作成する
（例:「東京都または福岡県」なら、`prefecture_code eq "13"`のルールと`prefecture_code eq "40"`のルールを別々に作る）。
ルールエンジンはネストした条件グループ（AND/ORの混在）をサポートしない。これはMVPとしての意図的な単純化であり、
複雑な条件はルールを分割することで表現する。

## アクションの説明

| `action_type` | `procedure_id` | `payload` | 効果 |
|---|---|---|---|
| `add_procedure` | 必須 | 不要 | 結果の手続き一覧にこの`procedure_id`を追加する |
| `show_warning` | 不要（NULL可） | `{"message": "文言", "severity": "info"｜"warning"}` | イベント登録結果画面の上部に警告/案内メッセージを表示する |
| `change_office` | 必須 | `{"office_type": "organization_types.code の値"}` | 該当手続きの提出先を、`procedures.office_type`の代わりにこの`office_type`で解決する（`resolveOffices`が返す`officeMap`のキーを差し替えるだけで、機関解決ロジック自体は共通のものを再利用） |
| `change_deadline` | 必須 | `{"days_from_event": 数値}` | 該当手続きの期限を、`procedures.timing_data`の代わりにこの日数で計算する（`calculateNextDeadline`はそのまま再利用） |

`change_office`・`change_deadline`はいずれも**既存の計算ロジックへの入力を差し替えるだけ**で実現しており、
アクション種別ごとに専用の計算コードを新設していない。これがハードコードを避けるための設計上の要点。

## 初期投入ルール（`migration_rule_engine.sql`）

Phase 2の`event_procedures`固定マッピングをそのままルールとして再現した9件＋動作確認用デモ1件、計10件。

| ルール名 | 条件 | アクション |
|---|---|---|
| 会社設立：法人設立届出書 | `event_type_code = company_establishment` | `add_procedure` → `CORP_ESTABLISH_TAX` |
| 会社設立：青色申告承認申請書 | 同上 | → `BLUE_RETURN_APPROVAL` |
| 会社設立：社会保険新規適用届 | 同上 | → `SOCIAL_INS_NEW` |
| 会社設立：給与支払事務所等の開設届 | 同上 ＋ `has_employees = true` | → `PAYROLL_OFFICE_OPEN` |
| 会社設立：株式会社設立登記 | 同上 ＋ `corporate_type = kabushiki` | → `LEGAL_ESTABLISH_KK` |
| 会社設立：合同会社設立登記 | 同上 ＋ `corporate_type = godo` | → `LEGAL_ESTABLISH_GODO` |
| 従業員採用：労働保険成立届 | `event_type_code = employee_hired` | → `LABOR_INS_ESTABLISH` |
| 従業員採用：雇用保険適用事業所設置届 | 同上 | → `EMPLOY_INS_OFFICE` |
| 役員変更：役員変更登記 | `event_type_code = officer_change` | → `LEGAL_OFFICER_CHANGE` |
| 福岡県：創業支援の案内（デモ） | `event_type_code = company_establishment` ＋ `prefecture_code = "40"` | `show_warning`（`prefecture_code`条件・警告アクションの動作サンプル） |

1手続き＝1ルールを基本単位にしているのは、管理画面から個別に無効化・編集しやすくするため。

## ルール追加時の注意

- **「必要手続きを追加」する新しい対象procedureは、`procedures`テーブルに存在している必要がある。** ルールは
  既存の`procedures`行を参照するだけで、新しい手続き内容自体（説明文・必要書類・提出方法等）は
  `/admin/procedures`側で先に作成すること
- **条件の`field`は自由記述だが、実際に評価コンテキストに存在するキーでなければ常に不成立になる。** MVPで
  評価コンテキストに含まれるのは`event_type_code` / `corporate_type` / `has_employees` / `prefecture_code`の4つ
  （`src/lib/events.ts`の`context`組み立て箇所を参照）。新しいフィールド（資本金・業種など）を条件に使いたい
  場合は、まずコンテキストにそのキーを追加する必要がある（「将来の拡張方針」参照）
- **`value`はJSON形式で入力する。** 文字列は`"kabushiki"`のようにダブルクォートで囲む。真偽値は`true`/`false`
  （クォート無し）。`in`/`not_in`演算子の値は配列（例: `["13","40"]`）
- **`change_office`/`change_deadline`で複数ルールが同じ手続きを上書きする場合は`priority`で決着する。**
  意図しない上書きを避けるため、同一procedure_idを対象にする`change_*`アクションは極力1ルールにまとめる
- ルールを無効化したいだけなら削除せず`is_active`をオフにすること（履歴として残せる）

## 重複防止・UNIQUE制約の注意

`rules.name`には**UNIQUE制約**がある。これは実装時に一度、次の事故を起こして学んだ教訓による：

> 初回の`migration_rule_engine.sql`は`rules.name`にUNIQUE制約が無いまま`ON CONFLICT DO NOTHING`で
> シードしていたため、ファイルを2回実行した際に同名のルールが増殖し（10件→20件）、
> `rule_conditions`/`rule_actions`もルールごとの件数が壊れる不具合が発生した。

このため、マイグレーションでシードデータを投入する際は必ず：

1. 一意性が必要なカラムにUNIQUE制約を張る
2. `INSERT ... ON CONFLICT (対象カラム) DO NOTHING`のように**具体的な conflict target を指定する**
   （target無しの`ON CONFLICT DO NOTHING`は、対象のUNIQUE制約が無ければ何も防がない）
3. 子テーブル（`rule_conditions`/`rule_actions`など）への再投入も、同じルールに対して二重挿入されないよう
   事前に`DELETE ... WHERE rule_id IN (...)`してから入れ直す、などの冪等化を行う
4. 「このファイルは再実行しても安全」とコメントに書く場合は、実際に2回実行して結果を確認すること

管理画面からの通常のルール作成（`RuleForm.tsx`）はUNIQUE制約により同名ルールの重複作成を防げるが、
それでもDB側の`unique_violation`エラーを保存時にハンドリングし、ユーザーにエラーメッセージを表示している。

## 将来の拡張方針

- **条件フィールドの拡張**: 資本金（`capital`）・業種（`industry_code`）などを条件に使いたい場合、
  (1) `company_events`に該当カラムを追加し、(2) `src/lib/events.ts`の`context`組み立てにそのキーを追加すれば、
  `ruleEngine.ts`側のコード変更は不要（`evaluateCondition`は`field`名を汎用的に扱っているため）
- **新しいアクション種別の追加**: `action_type`のCHECK制約とTypeScript側の`switch`文（`ruleEngine.ts`の
  `evaluateRules`内）の両方に新しいケースを追加する必要がある。これは「ルールのデータ（条件・対象手続き）を
  ハードコードしない」という目的とは別軸で、新しい**種類の効果**を実装する作業であり、通常のコード変更を伴う
  （例: 「特定の書類テンプレートを表示する」action_typeを新設する場合など）
- **診断エンジン（`/start`→`/result`）への展開**: 現状ルールエンジンは経営イベントエンジン
  （`/events`）専用。`runDiagnosis`（通常の診断フロー）は従来どおり`procedures`テーブルの
  `corporate_type`/`requires_employees`カラムによる静的フィルタのままで、ルールエンジンを介していない。
  将来的に診断フローもルールエンジンに寄せる場合は、`context`に診断入力（`hasEmployees`,
  `fiscalMonth`等）を渡す形で`evaluateRules`をそのまま再利用できる設計にしてある
- **OR条件・条件グループ**: 現状「1ルール＝AND条件の集合」のみ。ネストした条件式が本当に必要になった場合は
  `rule_conditions`に`group_id`/`group_operator`を追加する拡張が考えられるが、MVPでは意図的に見送っている
