# WORKSPACE_DB_MVP_MIGRATION.md — Workspace DB MVP Migration設計（Sprint22 Phase22.4）

**ステータス: 設計のみ。マイグレーションSQL（`supabase/migration_workspace_mvp.sql`）は作成したが、
Supabase側でのDB反映（DDL実行）・アプリケーションコード変更・画面変更は一切行っていない。**
このプロジェクトの標準フロー（[CLAUDE.md](../CLAUDE.md)「DBの実DDLはこのセッションからは実行できない
（anon keyのみ・service role keyなし）。マイグレーションSQLを書いたら、ユーザーにSupabase SQL
Editorでの実行を依頼し」）に従い、**実際の反映はレビュー承認後、ユーザーがSQL Editorで実行する**。

[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md)（Sprint22.3、承認済み）が設計した全体像のうち、
「会社を登録する」「会社を管理する」「会社を共有する」の3つだけを成立させる最小4テーブルに
スコープを絞り込んだもの。

## 1. 対象範囲とスコープ縮小の理由

### 1-1. 今回のスコープ（4テーブルのみ）

- `workspace_companies`
- `workspace_company_profiles`
- `workspace_members`
- `workspace_share_links`

### 1-2. 対象外（今回は作らない）

| 対象外 | 理由 |
|---|---|
| Timeline（`workspace_timeline_events`） | 「会社を登録・管理・共有する」の成立に必須ではない。Sprint22.3の最終提案でも「B: v1.0向け」に位置づけていた（[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md)最終提案） |
| State / Annual Roadmap | 保存しない設計（既存の`state.ts`/`roadmap.ts`）のため、そもそも新規テーブルを必要としない。ただし入力に必要な`workspace_tax_return_profiles`・`workspace_company_events`が無いと計算できないため、これらが揃うSprint22.5以降まで画面接続は持ち越しになる |
| Accounting Data / Documents | [WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md) 8節・9節の通り将来構想。要件未確定 |
| `workspace_tax_return_profiles` / `workspace_company_events` / `workspace_procedure_statuses` | Sprint22.3では最小MVP（A）に含めていたが、今回のユーザー指示で「会社の登録・管理・共有」に対象をさらに絞り込んだため、決算実績・イベント登録・完了ステータスは次のSprintに持ち越す |
| `admin_users.role`列 / `workspace_assignments` | 2節で述べる通り、`workspace_members`に統合し、今回は導入しない |

### 1-3. 既存Engineへの影響

**既存の診断エンジン・Rule Engine・Timeline/State/Annual Roadmap Engine・AI参謀・通知エンジンは
一切変更しない。** 今回作る4テーブルは、まだどの既存Engineからも参照されない（`workspace_companies`等を
入力に取るコードは本Sprintでは書かない、コード変更なしの制約）。次のSprintでこれらのテーブルに
データが入るようになって初めて、13節（[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md)）で設計した
「データ取得層の置き換え」に着手する。

---

## 2. `workspace_members`への設計統合（Sprint22.3からの変更点）

[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md) 7節は、担当者の割当を表す**今すぐ必要な**
`workspace_assignments`と、将来のログイン付き経営者アカウントの受け皿となる**将来構想**の
`workspace_members`を、別々の2テーブルとして提案していた。

**今回のユーザー指示が対象テーブルを4つに絞り込み、その中に`workspace_members`のみを指定した
ため、この2つを1テーブルに統合する設計に変更する。**

```sql
role TEXT NOT NULL CHECK (role IN ('admin', 'staff', 'owner', 'viewer'))
```

- `role IN ('admin', 'staff')`: 旧`workspace_assignments`相当。`admin_users`に登録済みのメールアドレスの行
- `role IN ('owner', 'viewer')`: 旧`workspace_members`（将来構想）相当。ログイン基盤が無い現時点では
  行を作らない（8節で明記する通り、共有は当面`workspace_share_links`のリンク方式のみで運用する）

`email`列は`admin_users.email`への外部キーにしない。`owner`/`viewer`の行は将来的に
`admin_users`に存在しないメールアドレスを保持する必要があるため（`admin_users`は管理画面ログイン用の
許可リストであり、経営者はそこに含まれない）。

---

## 3. 権限モデル（Sprint22.4のスコープ判断）

[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md) 11節が設計した「`admin_users.role='admin'`なら全社、
`'staff'`なら`workspace_assignments`にある会社のみ」という段階的な制限は、**今回は実装しない。**

理由: `admin_users`に`role`列を追加する変更自体が今回のスコープ外であり、かつ「担当者だけに
制限する」というRLSを検証する画面（会社一覧・Workspace個別画面）もまだ存在しない
（コード変更なし・画面変更なしの制約）。**画面が無い段階で先にRLSだけ厳しく絞ると、
動作確認ができないまま「本当に正しく機能するか分からない制限」を本番に入れることになり、
[CLAUDE.md](../CLAUDE.md)が戒める「検証なしの断定」に該当しかねない。**

そのため、`migration_workspace_mvp.sql`の4テーブルはすべて**「`admin_users`に登録されている人なら
誰でも全社にアクセス可」というフラットな権限モデル**（既存の`procedures`/`rules`等の管理者書き込み
ポリシーと全く同じパターン）にする。`workspace_members`のレコード自体は今回から記録を開始するが、
**RLSの絞り込みには使わない**（次のSprintで画面と一緒に段階的に厳格化する）。

`workspace_members`にのみ、`admin_users`の`self_read`ポリシーと同じパターンの`self_read`
（`email = auth.email()`で自分の行だけ見える）を追加している。これは将来のログイン付き
経営者アカウントが「自分がどの会社のメンバーか」を確認する用途を先回りしたもので、
現状は画面が無いため未使用だが、追加コストがほぼ無い（既存パターンの複製のみ）ため今回含めた。

---

## 4. `anon`権限を一切与えない方針（再確認）

[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md) 11節・レビュー時のユーザー承認の通り、
4テーブルいずれにも`anon`への`GRANT`を一切行わない。これは[DATABASE.md](DATABASE.md)が定める
「全テーブルRLS有効・`anon`にSELECT許可が原則」という既存規約からの**意図的な逸脱**であり、
承認済みの方針として`migration_workspace_mvp.sql`冒頭にもコメントで明記した。

---

## 5. 共有リンクのRPC実装（スコープを合わせて縮小）

[WORKSPACE_DB_DESIGN.md](WORKSPACE_DB_DESIGN.md) 12節で設計した`get_shared_workspace_view`関数を、
今回のスコープ（Timeline/Roadmap無し）に合わせて実装した。`shared_sections`に`"company"`・`"profile"`が
含まれる場合のみ、それぞれ`workspace_companies`・`workspace_company_profiles`の該当行を返す。
将来Timeline/Roadmapタブが実装された際は、この関数に`ELSIF`相当の分岐を追加するだけで拡張できる
（関数のシグネチャ・呼び出し側は変更不要）。

**前提として確認が必要な点（レビューで確認いただきたい）**: `SECURITY DEFINER`関数がRLSを
バイパスできるのは、関数の所有者ロールが`BYPASSRLS`権限を持つ場合である。Supabase SQL Editorで
実行した場合、関数の所有者は通常`postgres`ロール（`BYPASSRLS`相当の権限を持つ）になるため
正しく機能する想定だが、**実際にSQL Editorで実行した後、`anon`キーから`get_shared_workspace_view`を
呼び出して意図通りJSONが返るか、動作確認をお願いしたい**（本セッションでは`service_role`が無く
DDLを実行できないため、事前の動作確認ができていない）。

---

## 6. インデックス設計の要点

| テーブル | インデックス | 目的 |
|---|---|---|
| `workspace_companies` | `(prefecture_code, municipality_code)` | 会社一覧の地域フィルタ |
| `workspace_companies` | `(name)` | 会社一覧の検索・並び替え |
| `workspace_company_profiles` | PK（`company_id`）のみ | 1:1のためPK参照で十分 |
| `workspace_members` | `(company_id)` | 「この会社のメンバー一覧」照会 |
| `workspace_members` | `(email)` | 「自分が所属する会社一覧」照会（`self_read`ポリシーと組み合わせて使う想定） |
| `workspace_share_links` | `(company_id)` | 「この会社の共有リンク一覧」照会 |
| `workspace_share_links` | `token`（UNIQUE制約による自動インデックス） | `get_shared_workspace_view`のトークン検索 |

---

## 7. `updated_at`トリガー

`workspace_companies`・`workspace_company_profiles`は`updated_at`列を持つため、既存
`schema.sql`で定義済みの`update_updated_at()`トリガー関数（`procedures.updated_at`で
既に使われているもの）をそのまま再利用する（新しいトリガー関数を重複定義しない）。

---

## 8. マイグレーションファイル

`supabase/migration_workspace_mvp.sql`として作成済み（本ドキュメントと合わせてレビューしてください）。
[CLAUDE.md](../CLAUDE.md)の規約通り、テーブル定義・GRANT・RLS・policyを同一ファイル内に含め、
`admin_users`が存在しない環境でも安全に動くようガードしている（`migration_rule_engine.sql`と
同じ`DO $$ ... IF EXISTS ... $$`パターン）。承認後、Supabase SQL Editorでの実行をお願いします。
実行後、5節の`get_shared_workspace_view`の動作確認と、`pg_policies`の確認クエリ（ファイル末尾に
同梱）の結果共有をお願いします。

---

## まとめ（設計レビュー観点）

1. **2節**: `workspace_assignments`と将来の`workspace_members`を1テーブルに統合した設計でよいか
2. **3節**: 今回は「`admin_users`登録者なら誰でも全社アクセス可」というフラットな権限モデルに
   留め、「担当者だけに制限する」RLSを次のSprint（画面実装と同時）に持ち越す判断でよいか
3. **5節**: `SECURITY DEFINER`関数の所有者ロールに関する前提（`postgres`ロールで実行される想定）が
   実際に正しいか、SQL Editorでの実行後に動作確認をお願いしたい
4. **1-2節**: 今回対象外とした`workspace_tax_return_profiles`・`workspace_company_events`・
   `workspace_procedure_statuses`を次のSprintでどう扱うか（Sprint22.3のA構成に戻すか、
   さらに細かく分割するか）
