# 初期版：会社登録の限定DB変更案（承認待ち）

2026-11-03。DB適用・既存権限変更は未実施。会社登録の確実な完了は本案の承認と検証が必要なため、初期版完成と扱わない。

## 現状の再現結果

実際の `WorkspaceCompanyForm.handleSubmit` を抽出し、使い捨てPostgreSQL/PGliteの会社/メンバーFK・CASCADEを使って検証。本番はメタデータを読んだだけで、会社登録・削除はしていない。

| 失敗 | 現行処理の結果 |
|---|---|
| 会社INSERTが確定した後に応答喪失 | 会社1件・メンバー0件の孤立会社が残る。新規再送を識別できない |
| owner INSERTが確定した後に応答喪失 | エラーと見なして会社DELETEを発行し、作成済み会社/ownerを削除する |
| owner INSERTを拒否 | 補償DELETEで会社は消えるが、DELETEも失敗した場合の原子性はない |

本番メタデータで、会社のSELECT/DELETEに `OR NOT workspace_has_any_member(id)`、メンバーINSERTに未所属会社の最初のメンバー登録例外があることを確認。実在する他社や過去の孤立会社は本番制約に従って調査/変更していない。

## 推奨する最小の変更セット

### 1. 作成要求専用の小さなテーブル1つ

`public.workspace_company_creation_requests`:

- `request_id uuid PRIMARY KEY` — ブラウザで送信前に固定し、同時送信/再送を同じ要求と識別。
- `actor_id uuid NOT NULL` — `auth.uid()`から記録。リクエストに渡された本人IDを信用しない。
- `request_payload jsonb NOT NULL` — 会社名・所在地コード・法人形態・決算月の初回入力をDBで比較するための不変記録。
- `company_id integer NULL REFERENCES workspace_companies(id) ON DELETE SET NULL` — 登録後に会社が削除されても要求IDの墓標を保ち、古い再送で会社を復活させない。
- `created_at timestamptz NOT NULL DEFAULT now()`。

RLS有効、PUBLIC/anon/authenticatedには直接のSELECT/INSERT/UPDATE/DELETE権限を付けない。既存会社表に要求IDの代用品として会社名・advisors等を流用しない。既存業務テーブルの列追加やデータの一括移行は不要。

### 2. 登録・確認用DB関数1つ

仮称 `public.create_workspace_company(p_request_id uuid, p_values jsonb, p_mode text DEFAULT 'create')`。`create` と読み取りだけの `confirm` を1関数にまとめる。

- 匿名/uidなし/非管理者を拒否。所有者メールは `auth.email()` からのみ取得し、別人をownerにする入力を受け付けない。
- 会社名・法人形態・決算月と、都道府県/市区町村の対応をDB側で検証する。
- 要求ID単位のトランザクションロックと一意キーで同時送信を直列化。READ COMMITTEDでロック後に再取得する。
- 初回のみ、要求記録・会社・ownerを同一transactionで作成。どこで失敗しても全変更を取り消す。補償DELETEは廃止。
- 同ID/同本人/同入力なら既存結果だけを返す。同IDで異なる本人/入力は拒否。既存会社の名前が後で変わっていても初回入力の不変記録と比較する。
- 保存済み結果の確認時にも、現在その会社を参照/操作できることを確認する。他社結果や権限を外された会社の情報を返さない。削除済み要求は再作成しない。
- `confirm` は会社や要求を新規作成しない。応答不明時は確認するまで新しいIDで再送しない。
- 後述の直接INSERT経路を閉じるため、この関数だけは狭い作成処理として `SECURITY DEFINER` が必要。`search_path=pg_catalog`、全テーブルをスキーマ修飾、動的SQLなし、任意IDの会社更新/削除/権限変更は実装しない。PUBLIC/anonのEXECUTEを剥奪し、authenticatedのEXECUTEだけを許可する。

### 3. 既存の4ポリシーだけを限定変更

- `workspace_companies.admin_insert`: 削除し、通常クライアントの単独会社INSERTを許可しない。新規登録は上記関数のみを使う。
- `workspace_companies.member_select`: `admin_users`照合 AND `is_workspace_member(id)` のみにし、メンバー0社の無条件閲覧を除く。
- `workspace_companies.member_delete`: `admin_users`照合 AND `is_workspace_member(id, ARRAY['owner'])` のみにし、孤立会社の無条件削除を除く。
- `workspace_members.member_insert`: `admin_users`照合 AND 現在の会社ownerだけに制限し、「メンバー0なら最初のownerを取れる」例外を除く。登録時の最初のownerは上記関数内でのみ作成する。

既存メンバーのSELECT/UPDATE/DELETE、会社UPDATE、他の業務表や共有RPCは本案で変更しない。既存の孤立会社は自動削除/自動割当しない。これらは見えなくなるため、必要なら別途、所有者確認を伴う管理対応とする。

## 検証と復旧

- 合成データのローカルDBで正常/同時送信/同ID異入力/別本人/各段階失敗/全体rollback/応答喪失後確認/会社削除後の再送拒否を検証。
- 別会社のadmin・viewer・匿名・uidなしの拒否、直接INSERT/孤立会社の取得/削除/owner取得の拒否を検証。既存の会社更新・メンバー管理・プロフィール/状態/共有の正常操作も回帰する。
- 関数は操作を限定し、定義/ACL/対象ポリシーを適用前保存。限定マイグレーションだけを適用し、既存SQLの一括適用はしない。
- 復旧では会社登録を安全停止し、旧2要求+補償DELETEを再開しない。新規要求台帳の行を勝手に消さず、適用前ポリシーの復元は漏れの再開を伴うので自動では行わない。
- 本番はDDL限定適用と架空会社23の既存画面/メタデータ読み取りのみ。本番で新規登録・登録RPCの試験・業務データ更新/削除はしない。

## 承認の範囲

新規テーブル1つ、新規関数1つ、その関数の実行権限/台帳の非公開化、上記4ポリシーの変更。既存表の列追加、既存会社の変更/削除、新規課金は含まない。追加の構造/関数/権限変更が必要なら追加分を示して再確認する。
