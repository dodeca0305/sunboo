# NOTIFICATION_SETTINGS_DESIGN.md — 通知設定モデル設計（Sprint38 Phase38.1）

**ステータス: 設計のみ。コード変更・DB変更・migration作成・package変更・画面変更は一切行っていない。**

対象: 将来の画面内通知・メール・Slack・LINE通知で共通利用できる「通知設定」（誰に・何を・どのチャネルで・
いつ届けるか）のデータモデルを設計する。実コード（`src/lib/workspaceNotifications.ts`・
`src/lib/workspaceDecisions.ts`・`src/lib/workspaceAdvice.ts`・`workspace_members`・
`WorkspaceDashboard.tsx`・共有ページ・`migration_workspace_access_control.sql`）を直接確認した上で書く。

---

## 0. 前提として確認した既存事実

- **`buildWorkspaceNotifications`（`src/lib/workspaceNotifications.ts`、Sprint37実装）は完全にステートレスな
  純粋関数である。** 引数は`companyId`・`WorkspaceDecisions`・`WorkspaceAdvice`・
  `WorkspaceProcedureStatusMap`・`WorkspaceDocumentStatusMap`・`maxItems`のみで、設定・既読・送信履歴を
  読み書きする経路が一切無い。DBテーブルは新設していない（Sprint37時点のコメント「保存しない: DBテーブル
  追加なし・既読管理なし・送信ログなし」）。**本設計はこの関数のシグネチャ・判定ロジックを変更しない**
  （Sprint36・Sprint37で確立した「Notification Engineは新しい判断ロジックを持たない」という方針を
  そのまま維持する）
- **`WorkspaceNotification`の`id`は`candidateKey(category, occurrenceKey, title, dueDate)`
  （`workspaceNotifications.ts:61-68`）で組み立てられる。** `occurrenceKey`は`Advice`由来の候補
  （`fromAdviceWarnings`・`fromAdviceOpportunities`）にしか付与されない。`Decision.actions`・
  `Decision.watchItems`はprocedureIdを公開していない型（`WorkspaceDecisionAction`・
  `WorkspaceDecisionWatchItem`、いずれも`title`/`reason`/`dueDate`のみ）のため、`id`は
  `category:title:dueDate`という代替キーになる。**これは設定・既読・送信履歴の永続化キーとして
  そのまま使う予定のIDが、生成元によって安定度の異なる2種類の組み立て方をしている**という事実であり、
  9節で扱う
- **`workspace_members`（`supabase/migration_workspace_mvp.sql:124-132`）は`(id, company_id, email, role,
  invited_at, accepted_at)`、`UNIQUE(company_id, email)`。** `role`は`owner`/`member`/`viewer`の3値
  （Sprint33、`migration_workspace_access_control.sql`）。**「ユーザー」という独立したグローバルな
  エンティティ・テーブルはSUNBOOに存在せず、`email`（Supabase Authのメールアドレス）が唯一の
  ユーザー識別子である。** 会社ごとの所属・権限は`workspace_members`の1行が表す（同じemailが複数の
  会社に別々の`role`で所属しうる）
- **アクセス制御は2層構造（`migration_workspace_access_control.sql`冒頭コメント）**: `admin_users`が
  「`/admin`へのログイン可否」という大枠のゲート、`workspace_members.role`が「どの会社に、何ができるか」
  を判定する。`workspace_company_profiles`・`workspace_procedure_statuses`・`workspace_documents`・
  `workspace_share_links`はいずれも`is_workspace_member(company_id)`をRLSの`member_select`条件に
  使っている（同ファイル4節）。**Notification Center（Sprint37）自体は独自のRLSを持たず、
  `page.tsx`がこれらの既存テーブルを読んで計算した結果を表示しているだけであり、アクセス制御は
  データ取得層（既存RLS）に完全に委ねられている**（10節で詳述）
- **`get_shared_workspace_view`（`migration_workspace_mvp.sql:233-270`、Sprint24.0）は`company`・
  `profile`・`statuses`のみを返す。** `/share/[token]/page.tsx`のコメント「AI参謀・書類・会計分析は
  本Sprintでは共有しない（`docs/COMPANY_WORKSPACE.md` 5節）」の通り、Decision・Advice・
  Notification相当の情報は共有ページに一切渡っていない。共有ページは**ログイン不要・匿名アクセスであり
  `workspace_members`と意図的に独立**（同RPCコメント「Shareとの独立性」）。**経営者（共有リンクの
  受け手）にはemail/identityが存在しない**（12節で詳述）
- **`WorkspaceDashboard.tsx`（Sprint37）に設定・既読・Snooze関連のUIは一切無い。** 通知センターは
  常に`notifications`配列の内容をそのまま表示するだけで、「非表示にする」操作は今のところ存在しない
- **[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md)（Sprint36）6-4節が、将来の送信ログ
  テーブル`workspace_notification_log`のイメージを既に示していた（未実装）。** 本設計はこれを
  上書きするのではなく、10節「再通知」の知見を加えて具体化する（6節）
- **同ドキュメント8-2節が「`workspace_members`が送信先解決の唯一の情報源になる想定」と既に示していた。**
  本設計はこれを正式化する（11節）
- **[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-1節が「経営者向け軽量ログイン
  （マジックリンク等）」を時期尚早として見送っていた。** 共有ページに個人化された通知を届けたい場合、
  この既存の意思決定が前提条件になる（12節）

---

## 1. Notification Settingsとは

### 1-1. 役割

**「Notification Engineが生成した通知候補（`WorkspaceNotification[]`）のうち、どれを・誰に・どの
チャネルで・いつ届けるか」を制御する設定データ。**

```
配信対象 = f( WorkspaceNotification[]（Engineの出力、無変更）, Notification Settings, 既読/Snooze状態 )
```

Notification Engine（Sprint36・37で確立済み）は「何が重要か」を判断しない配信ルーティング層だった。
**Notification Settingsも同じ原則を継承し、「何が重要か」という新しい判断を追加しない。** Settingsが
制御するのは「重要度は分かっているが、この通知を今この人に見せるかどうか」という**フィルタ**であり、
severity・categoryの計算そのものには一切関与しない。

### 1-2. アーキテクチャ上の位置づけ

`buildWorkspaceNotifications`自体は変更しない、という0節の前提から、Settingsは**Engineの外側に
後付けするフィルタ層**として設計する（設計イメージ、コード化しない）。

```
generateWorkspaceDecisions / generateWorkspaceAdvice（既存、無変更）
                    │
                    ▼
      buildWorkspaceNotifications（Sprint37実装、無変更）
                    │
                    ▼
        WorkspaceNotification[]（全候補、最大5件）
                    │
                    ▼
   applyNotificationSettings（本設計、新設イメージ）※本Sprintでは実装しない
   （category/severity/channelでの絞り込み、既読・Snoozeの反映）
                    │
        ┌───────────┼───────────────┐
        ▼           ▼               ▼
  画面内表示      メール送信       Slack/LINE
```

`applyNotificationSettings`が新しい優先順位計算をしないことを保証するため、**入力の順序（重要度順）を
変更してはならず、フィルタ（除外）としてのみ機能する**という制約を設計原則として明記する。

---

## 2. データモデルの選択：案A/B/C比較

### 2-1. 比較表

| | 案A: Workspace単位のみ | 案B: ユーザー単位のみ | 案C: Workspace既定値 + ユーザー上書き |
|---|---|---|---|
| **モデル** | 会社ごとに1セットの設定。全メンバー共通 | メンバー（email）ごとに1セットの設定。全Workspace共通 | 会社ごとの既定値（`workspace_notification_settings`）＋必要な人だけの個人上書き（`workspace_member_notification_settings`） |
| **メリット** | 単純。テーブル1つ。「この会社は通知を厳しめに」という事務所としてのガバナンスを表現できる | 単純。テーブル1つ。「自分は毎朝メールが欲しい」等、個人の働き方に合わせられる | 案A・Bの両方の要求を満たす。ほとんどのメンバーは既定値のまま（上書き行を作らない）ため実データは少なく済む |
| **デメリット** | 複数の顧問先を担当する事務所スタッフが「顧問先Aは厚く、Bは薄く」を表現できない。owner/member/viewerの立場の違いを反映できない | 「この会社は全メンバーに必ず通知してほしい」という会社としての最低ラインを誰も強制できない（税理士事務所のガバナンス要件と衝突しうる） | テーブル2つ、解決ロジック（個人上書き→無ければWorkspace既定→無ければシステムデフォルト）の3段フォールバックが必要。UIも2箇所必要 |
| **実装コスト** | 低 | 低 | 中 |
| **将来性** | 低〜中。メール配信を本格導入すると早々に限界が来る | 中。個人最適だが事務所運営上のガバナンスが表現できない | 高。8節の権限モデル（owner/member/viewer）とも自然に整合する |

### 2-2. 推奨: 案C

既存の`workspace_members`によるアクセス制御自体が「`admin_users`という大枠のデフォルト＋
`workspace_members.role`という会社ごとの上書き」という2層構造（0節）であり、**案Cはこれと同じ設計思想の
延長**として一貫性が高い。会社としての最低ラインをownerが決め、個人の事情がある場合だけ本人が
上書きする、という権限分離（8節）もそのまま表現できる。

---

## 3. 設定の粒度（ON/OFF・カテゴリ別・重要度別・チャネル別）

### 3-1. ON/OFFの適用範囲は「チャネル」であって「画面内通知センター」ではない

Notification Centerは`WorkspaceDashboard.tsx`（Sprint37）の一部として常設されている。Dashboardは
[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 4節が定義した「pull型・常設」の
チャネルであり、そもそも「開かなければ見えない」ため、**画面内通知センター自体を丸ごとOFFにする
実益は薄い**（Dashboardを開く操作自体がユーザーの能動的な選択であるため）。

**「通知のON/OFF」が実際に意味を持つのはpush型チャネル（メール・Slack・LINE）が実装されてから**、
というのが本設計の結論である。in_appチャネルのON/OFFという設定項目自体は将来のために型としては
用意しておくが、MVPで既定値はすべて`true`固定とし、UIも作らない（15節）。

### 3-2. カテゴリ別×重要度別×チャネル別を1つの行列にしない

5カテゴリ（`deadline`/`hold`/`document`/`closing`/`information`）× 3重要度（`high`/`medium`/`low`）×
4チャネル（`in_app`/`email`/`slack`/`line`）を全部組み合わせた行列（最大60マス）は、CLAUDE.mdが戒める
「過剰な抽象化」に該当するリスクが高い。**「重要度」はカテゴリ別のしきい値（`minSeverity`）として
表現し、独立した60マスのON/OFFスイッチにしない**という設計にする。

```ts
// 設計イメージ（コード未実装）
export type NotificationChannel = 'in_app' | 'email' | 'slack' | 'line';

export type NotificationCategorySetting = {
  category: WorkspaceNotificationCategory; // 既存型をそのまま再利用（新しい列挙を作らない）
  enabled: boolean;
  minSeverity: WorkspaceNotificationSeverity; // このseverity以上のみ配信する
};

// 1スコープ（Workspace既定値 or 個人上書き）あたり、カテゴリ×チャネルの組で最大20行
export type NotificationSettingRow = {
  channel: NotificationChannel;
  categorySettings: NotificationCategorySetting[]; // 5カテゴリ分
};
```

これにより「`document`カテゴリはメールでは要らないが画面内では見たい」「`information`は`high`しか
メールで欲しくない（実際には`information`は常に`low`固定なので事実上ミュートと同義）」といった要望を
表現しつつ、行数は最大でも「チャネル数×カテゴリ数」（20行）に収まる。**未設定（デフォルト）の組は
行を作らない**（4-1節のスパースモデル、[PERIODIC_STATUS_REDESIGN.md](PERIODIC_STATUS_REDESIGN.md)
4-3節が確立した「実際に操作された分だけ行が増える」という既存の設計判断を踏襲）。

---

## 4. 設定の主体（Workspace単位・ユーザー単位・workspace_membersとの関係）

### 4-1. Workspace既定値は新しいテーブル、個人上書きは`workspace_members`にぶら下げる子テーブル

**`workspace_members`自体に通知設定用の列を追加しない。** 理由: `workspace_members`は
「誰が・どの会社に・どの権限で所属するか」という認可の中核テーブルであり、Sprint33のアクセス制御
migrationの心臓部でもある。通知設定という別の関心事の列を混ぜると、将来の権限まわりの変更
（4値目のrole追加等）と通知設定の変更が同じテーブル・同じmigrationファイルで衝突しやすくなる。
**関心の分離のため、`(company_id, email)`を外部キーとする独立の子テーブルにする**（設計イメージ、
14節で正式に列挙する）。

### 4-2. 個人上書きの粒度は「グローバルな個人設定」ではなく「会社×個人」

0節で確認した通り、SUNBOOに「ユーザー」という独立エンティティは無く、`email`は会社ごとに別々の
`role`で所属しうる。**個人上書きは「emailごとに1つ」（案B型のグローバル設定）ではなく、
`(company_id, email)`単位**にする。理由: 税理士事務所スタッフが複数の顧問先を担当する場合、
「顧問先Aは頻繁にチェックするので通知量を増やしたいが、顧問先Bはviewerとして時々見るだけなので
減らしたい」という要望は会社ごとに異なるのが自然であり、グローバル1セットでは表現できない
（2-1節「案B」のデメリットと同じ理由）。

---

## 5. 既読・Snooze・再通知（同じ概念にしない）

### 5-1. 既読（Read）

**定義: 特定のNotification ID（9節）を、特定のユーザー（email）が見た、という受動的な事実の記録。**
既読は通知の生成（Engine）にも配信可否（Settings）にも影響を与えない、**表示状態のみのレイヤー**
として位置づける（例: 未読件数バッジの表示制御にのみ使う）。「見た」という記録であって、
「今後表示しない」という意思ではない——翌日以降も同じNotification IDが再計算されれば、既読済みでも
一覧には引き続き表示され続ける（次に「表示しない」ようにしたい場合は5-2節のSnoozeを使う）。

### 5-2. Snooze

**定義: 特定のNotification ID、またはカテゴリ全体を、一定期間（`snoozedUntil`）意図的に非表示にする
という能動的な操作。** 既読との違いは「見た/見ていない」という事実ではなく、「今は見せないでほしい」
という時限付きの指示である点にある。`snoozedUntil`を過ぎれば、Engineの出力に含まれる限り自動的に
一覧へ復帰する（新しい抑制ロジックは追加しない。単に「表示直前のフィルタ条件に`now < snoozedUntil`を
加える」だけ）。

Snoozeには2つの粒度がある。

| 粒度 | 意味 | 3節との関係 |
|---|---|---|
| 通知単位Snooze | この特定の出現（Notification ID）だけを、指定日時まで隠す | 個別の一時停止 |
| カテゴリ単位Snooze | このカテゴリ（例: `information`）全体を、指定日時まで隠す | 実質的に「時限付きのカテゴリOFF」。3-2節の`enabled`フラグの時限版という整理ができる |

**既読とSnoozeは別テーブル・別フラグとして持つ**（既読は「見た」ログの追記、Snoozeは「隠す」意思の
1レコード。片方の実装がもう片方の代用にならないことを明記する）。

### 5-3. 再通知（Re-notification）

画面内通知センターは都度計算・都度表示のため、そもそも「再通知」という概念を持たない
（開けば毎回表示されるのは仕様であり、重複配信ではない）。**再通知が意味を持つのはpush型チャネル
（メール等）に限られる。**

9節で述べる通り、同一のNotification IDでも**severityが変化した場合は「新しい情報」として再送する
べき**（例: `medium`のholdが翌週`high`に格上げされた場合、これを黙って抑制すると重大な見落としに
つながる）。したがって送信済み判定（6節）のキーは「Notification IDのみ」ではなく
**「Notification ID + severity」**にする、というのが本設計の結論である（`(site)`側の既存
`notificationEngine.ts`が「超過は毎日・7日前/3日前/当日のみ」という日数ベースの間引きで同種の問題を
解決していたのと同じ発想を、Workspace版では「severityの変化」という既にEngineが計算済みの粒度で
代替する——新しい日数計算をSettings側に持ち込まない）。

---

## 6. 送信履歴・重複防止・送信済み判定の違い（明確に区別する）

この3つはレイヤーが異なる。混同すると設計を誤るため、明確に切り分ける。

| | 重複表示防止（実装済み、Sprint37） | 送信済み判定（本設計、将来） |
|---|---|---|
| 何を防ぐか | 同じ瞬間の計算の中で、Decision由来とAdvice由来など複数の情報源から同じ出現の候補が重複して**生成される**こと | 過去に、あるチャネル・ある宛先に、この通知を**既に送った**かどうか |
| 時間軸 | 持たない（1回の呼び出し内で完結） | 持つ（「いつ送ったか」を記録・参照する） |
| 実装場所 | `buildWorkspaceNotifications`内の`Map`によるid去重（`workspaceNotifications.ts:175-179`、無変更） | 新設する送信ログテーブル（6-1節） |
| DBの要否 | 不要（都度計算） | 必要（送信は「起きたこと」の記録であり、再計算では復元できない） |

**「重複表示防止さえあれば送信ログは不要」という結論には至らない**——重複表示防止は「今この瞬間、
同じ内容を2回見せない」ためのものであり、「今日もう送ったかどうか」という時間をまたぐ判定には
そもそも使えない、別の関心事である。

### 6-1. 送信ログの設計（[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 6-4節の具体化）

```sql
-- 実装時のイメージ。本Sprintでは作成しない。
CREATE TABLE workspace_notification_log (
  id                BIGSERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  notification_id   TEXT NOT NULL,   -- WorkspaceNotification.id（9節、新しい採番をしない）
  severity          TEXT NOT NULL,   -- 5-3節: severityの変化は「新しい情報」として再送対象にする
  channel           TEXT NOT NULL,   -- 'email' / 'slack' / 'line'
  recipient_email   TEXT NOT NULL,
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, notification_id, severity, channel, recipient_email, (sent_at::date))
  -- 「同じ通知・同じseverity・同じチャネル・同じ宛先には1日1回まで」という間引きをUNIQUE制約で
  -- 表現する。RULE_ENGINE.md「重複防止・UNIQUE制約の注意」の教訓（アプリコード側のチェックだけに
  -- 頼らない）を送信ログにも適用する。
);
```

---

## 7. タイムゾーン・配信時間帯・休日/営業時間

### 7-1. タイムゾーン: 当面JST固定、ユーザーごとの設定は持たない

`generateWorkspaceDecisions`・`generateWorkspaceAdvice`はいずれも`today: Date = new Date()`
（実行環境のローカル日時）を基準にしており、SUNBOO全体が「日本国内の行政手続き」を扱う前提
（対象: 東京都・福岡県、[PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)）である以上、**JST固定という
暗黙の前提が既にシステム全体に通底している**。本設計もこれを踏襲し、Notification Settingsに
ユーザーごとのタイムゾーン項目は持たせない（過剰な一般化を避ける）。

**注記（本設計のスコープ外）**: Vercelの実行環境がUTCで動作している場合、`new Date()`ベースの
「今日」判定が本来のJST日付と数時間ずれる可能性があるが、これは既存の全Engine（Decision/Advice/
Roadmap）に共通する既存の制約であり、Notification Settings固有の課題ではない。本設計では扱わない。

### 7-2. 配信時間帯（時刻ウィンドウ）

in_appチャネルには無関係（開いた瞬間が配信タイミングのため）。push型チャネルにのみ適用する設定
（例: 「9:00〜18:00のみ配信」）とし、[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md)
8-3節が示したCron定期実行が、送信直前にこの設定を参照して「今は配信可能時間帯か」を判定する
（ウィンドウ外なら**送信しないのではなく、次のウィンドウまで送信を遅延させる**——high severityの
見落としを避けるため、破棄ではなく延期にする設計方針を明記する）。

### 7-3. 休日・営業日: v1.0以降、本Sprintでは設計しない

時刻ウィンドウ（7-2節）とは別軸で、「土日・祝日は配信しない」という要望も想定されるが、これには
公的祝日カレンダーというSUNBOOが現状持たないマスタデータが必要になる（procedures/jurisdiction系の
マスタとは別種のデータであり、毎年の更新運用コストを伴う）。**費用対効果が不明な段階でカレンダー
マスタを作り込むのは時期尚早と判断し、本設計では機能として提示するに留め、v1.0以降、push配信の
実運用が始まってから改めて検討する。**

---

## 8. owner/member/viewerの設定可能範囲

| 設定 | owner | member | viewer |
|---|---|---|---|
| Workspace既定値（`workspace_notification_settings`）の編集 | ○ | × | × |
| 個人上書き（自分の`workspace_member_notification_settings`）の編集 | ○（自分の分） | ○（自分の分） | ○（自分の分） |
| 他人の個人上書きの閲覧・編集 | × | × | × |
| 既読・Snoozeの操作 | ○（自分の分のみ） | ○（自分の分のみ） | ○（自分の分のみ） |

Workspace既定値の編集を`owner`限定にするのは、`workspace_members`自体のUPDATE/DELETEが`owner`限定
（`migration_workspace_access_control.sql` 6節）という既存パターンをそのまま踏襲するため（会社としての
方針決定はowner権限、という整理に統一する）。一方、**「自分がどう通知を受け取るか」という個人上書きは
会社に対する操作権限とは別の関心事であり、`viewer`であっても自分の受け取り方は自分で調整できて
よい**、という整理にする（他人の設定を覗き見・変更できないことだけを担保する）。

---

## 9. Notification IDの安定性とoccurrence_keyとの関係

0節で確認した通り、`id`の組み立て方には生成元によって3層の安定度がある。

| 層 | 生成元 | idの形 | 変化するタイミング | 安定度 |
|---|---|---|---|---|
| ① occurrenceKeyあり | `Advice.warnings`/`Advice.opportunities`（procedureId + dueDateから`workspaceProcedureOccurrenceKey`で算出） | `hold:42:2026-08-01`等 | 会社プロフィール（決算月・法人種別等）の変更でRoadmapのdueDateが変わったとき | 中〜高 |
| ② occurrenceKeyなし・procedure名ベース | `Decision.actions`/`Decision.watchItems`（procedureId非公開のためtitle+dueDateで代替、`workspaceNotifications.ts`の制約） | `deadline:title:法人税確定申告:2026-07-15`等 | 手続きマスタ（`procedures.name`）が管理画面から改名されたとき | 中（通常運用では手続き名はほぼ変わらないため実務上は十分安定） |
| ③ 会社状態ベース | `dueDate`がnullの候補（例:「基本情報の入力」「決算に向けた準備」「消費税の課税判定の確定」） | `information:title:基本情報の入力:none`等 | その会社状態が解消されるまで不変 | 高 |

### 9-1. ①のIDが変わることは意図した挙動である

[PERIODIC_STATUS_REDESIGN.md](PERIODIC_STATUS_REDESIGN.md) 2-4節は、決算月変更後に手続きステータスが
「新しいdueDateに対して未着手から再スタートする」ことを**「むしろ正しい安全側の挙動」**と既に結論づけていた。
本設計もこれを継承する——決算月変更でNotification IDが変わり、既読・Snooze・送信履歴が新しい出現に
対して振り出しに戻ることは、バグではなく一貫した設計判断として扱う。

### 9-2. ②の改名リスクは本設計では解消しない

procedureIdを`Decision.actions`/`Decision.watchItems`の型に含めるにはEngine（`workspaceDecisions.ts`）の
型変更が必要であり、Sprint37で確立した「Engineロジック・型は変更しない」制約に反する。**本設計は
この制約を解消せず、既知の限界として申し送る**（将来Engine自体を改修するタイミングでのみ解消可能）。

### 9-3. ③は「安定して繰り返し出現すること」自体がSnoozeの前提

会社状態ベースの通知は、状態が解消されない限り**毎回同じIDで再登場する**。これはSnooze
（5-2節）が正しく機能するための前提でもある——もしIDが不安定だと、Snoozeしても翌日には
「別の通知」として扱われ、Snoozeが効かなくなる。**Notification Settings・既読・Snooze・送信履歴の
永続化キーは、いずれもこのNotification IDをそのまま外部キーとして使う**（新しい採番ロジックを
作らない、Sprint37の設計哲学をそのまま継承する）。

---

## 10. 権限のないWorkspaceの通知が漏れないこと

### 10-1. 現状: アクセス制御はデータ取得層（RLS）に完全に委ねられている

`/admin/workspaces/[id]/page.tsx`は`loadWorkspaceRoadmapContext`等を呼び、その結果を
`buildWorkspaceNotifications`に渡しているだけで、**Notification Engine自体はアクセス制御を一切
行っていない**。Sprint33のRLS（`member_select`ポリシー、`is_workspace_member(company_id)`）により、
権限の無いユーザーはそもそも`companyId`のデータを取得できず、結果として通知も生成されない。
**この構造（＝Notification側では何もしない、データ取得層のRLSだけが唯一の防波堤）を、Settings導入後も
壊さないことが最重要の制約になる。**

### 10-2. Settings導入時に守るべき3点

1. **将来、複数Workspace横断の通知一覧（例: 顧問先一覧に各社の通知件数バッジを表示）を作る場合、
   会社ごとに個別のRLS判定を経由したクエリを積み上げる（Supabase-jsの通常の`.from().select()`を
   会社ごとに呼ぶ）。「全Workspaceの通知をまとめて取得するSQL」を1本のSECURITY DEFINER関数で
   書いてはいけない**（RLSをバイパスする正当な理由がない限り、`is_workspace_member`のような判定用
   関数以外でSECURITY DEFINERを使わない、という既存方針を踏襲する）
2. **Workspace既定値テーブル（`workspace_notification_settings`）のRLSも、既存の
   `workspace_company_profiles`等と同じ`is_workspace_member(company_id)`パターンにする**（新しい
   認可ロジックを発明しない）
3. **個人上書きテーブル（`workspace_member_notification_settings`）は、`email = auth.email()`を
   RLSの条件に加え、自分の行だけを読み書きできるようにする**（Workspace既定値とは異なり、
   他のメンバーの個人設定を覗き見できてはならないという、8節のプライバシー境界をDBレベルでも
   担保する）

---

## 11. メール等の送信先解決方法

0節・[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 8-2節の想定を正式化する。

1. 基本方針: そのWorkspaceの`workspace_members`全行の`email`を送信先候補の母集団とする
2. **role別の絞り込み自体もWorkspace既定値の設定項目にする**（「どのroleに送るか」をハードコードせず、
   会社ごとに方針が変わりうる設定として扱う。既定は`owner`＋`member`を対象、`viewer`は対象外——閲覧
   専用の立場に能動的な通知は必須ではないという考え方だが、これも既定値であり変更可能とする）
3. 個人上書きで「自分は受け取らない」を選んだメンバーは、Workspace既定でrole対象に含まれていても
   除外する（4節の解決順「個人上書きが最優先」と一致させる）

---

## 12. 共有ページとの関係

`/share/[token]`は匿名・ログイン不要・閲覧専用で、`workspace_members`と意図的に独立している
（0節、`get_shared_workspace_view`のコメント「Shareとの独立性」）。**経営者（共有リンクの受け手）には
emailが存在しないため、Workspace単位・ユーザー単位いずれのNotification Settingsも適用対象にならない。**

**Notification Center・Notification Settingsは共有ページには一切表示しない**、と明記する。
`get_shared_workspace_view`に通知関連の情報を追加することは本設計の範囲外であり、行うべきでもない
——Decision・AI Adviserを意図的に共有除外している既存方針（`docs/COMPANY_WORKSPACE.md` 5節）と
矛盾させないためである（経営者に「対応不要な誤情報」や、専門家の判断を介さない生の警告を直接
見せてしまうリスクを避ける、というSUNBOOの基本方針——`CLAUDE.md`の「行政手続きの情報を見る
サービスであり、記帳・電子申告・法的助言そのものは提供しない」にも通じる）。

将来、経営者本人にも個人化された通知を届けたいというニーズが出た場合は、現在の「トークンベース・
ログイン不要」という共有モデルとは別の前提（経営者向け軽量ログイン）が必要になる。これは
[ARCHITECTURE_REVIEW_SPRINT28.md](ARCHITECTURE_REVIEW_SPRINT28.md) 9-1節が既に「現場の声が確認できる
まで時期尚早」と整理済みであり、本設計もこの既存の意思決定を変更しない。

---

## 13. 将来のAccounting通知との接続

[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 9節が示した通り、将来`financial`
カテゴリ（`TimelineEvent`経由）が追加される場合、判断ロジックは将来のAccounting Engine側に持たせ、
Notification Engineはその出力を拾うだけという位置づけだった。**本設計のSettingsモデル（3節の
カテゴリ別設定）は、`WorkspaceNotificationCategory`に新しい値が増えることに対して閉じていない**
——`workspace_notification_settings`・`workspace_member_notification_settings`の
`category`列は自由に値が増えるテキスト/ENUM想定であり、`financial`カテゴリ追加時にSettingsモデル
自体の構造変更は不要という設計にする。

---

## 14. 推奨データモデル（まとめ）

**案C（2節）を採用し、以下5テーブルの設計イメージを示す（本Sprintでは作成しない）。**

```sql
-- すべて実装時のイメージ。本Sprintではmigrationを作成しない。

-- Workspace既定値。owner限定で編集。
CREATE TABLE workspace_notification_settings (
  company_id      INTEGER NOT NULL REFERENCES workspace_companies(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,   -- 'in_app' / 'email' / 'slack' / 'line'
  category        TEXT NOT NULL,   -- WorkspaceNotificationCategoryの値（13節: 将来の追加に開いている）
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  min_severity    TEXT NOT NULL DEFAULT 'low',  -- 'high' / 'medium' / 'low'
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, channel, category)
);

-- 個人上書き。本人のみ編集（(company_id, email)はworkspace_membersと同じ複合キー）。
CREATE TABLE workspace_member_notification_settings (
  company_id      INTEGER NOT NULL,
  email           TEXT NOT NULL,
  channel         TEXT NOT NULL,
  category        TEXT NOT NULL,
  enabled         BOOLEAN,        -- NULL = Workspace既定値にフォールバック
  min_severity    TEXT,           -- NULL = Workspace既定値にフォールバック
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, email, channel, category),
  FOREIGN KEY (company_id, email) REFERENCES workspace_members(company_id, email) ON DELETE CASCADE
);

-- 既読ログ。本人のみ操作。
CREATE TABLE workspace_notification_reads (
  company_id      INTEGER NOT NULL,
  email           TEXT NOT NULL,
  notification_id TEXT NOT NULL,  -- WorkspaceNotification.id（9節、新しい採番をしない）
  read_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, email, notification_id)
);

-- Snooze。本人のみ操作。通知単位／カテゴリ単位の両方を1テーブルで表現する
-- （notification_id, category のどちらか一方のみ非NULLにする、というCHECK制約を想定）。
CREATE TABLE workspace_notification_snoozes (
  id               BIGSERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL,
  email            TEXT NOT NULL,
  notification_id  TEXT,          -- 通知単位Snoozeの場合のみ
  category         TEXT,          -- カテゴリ単位Snoozeの場合のみ
  snoozed_until    TIMESTAMPTZ NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 送信履歴（6-1節、NOTIFICATION_ENGINE_DESIGN.md 6-4節の具体化）。
CREATE TABLE workspace_notification_log (
  id               BIGSERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL,
  notification_id  TEXT NOT NULL,
  severity         TEXT NOT NULL,
  channel          TEXT NOT NULL,
  recipient_email  TEXT NOT NULL,
  sent_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

RLSはいずれも既存パターン（`admin_users`ゲート＋`is_workspace_member`、10-2節）を踏襲し、
個人系4テーブルには`email = auth.email()`を追加する。GRANT/RLS/policyを同一migrationファイル内に
まとめる、UNIQUE制約＋具体的なconflict targetを使う、という`CLAUDE.md`の既存規約もそのまま適用する
（実装時に）。

---

## 15. β版スコープ

### 15-1. MVPで実装するもの

**本Sprint（Sprint38）では何も実装しない（設計のみ）。** 次にSprint39で最初に着手する候補は
17節に示す。

### 15-2. MVPでは実装しないもの

- 14節の5テーブルすべて（migrationなし）
- 休日・営業時間制御（7-3節、v1.0以降）
- 配信時間帯Cron・メール/Slack/LINE送信本体
- 経営者向け共有ページへの通知露出（12節、既存方針により見送り継続）
- procedureId欠落によるID安定性の根本解消（9-2節、Engine改修を伴うため別スコープ）

### 15-3. 検討必須事項への回答（まとめ）

| 論点 | 結論 |
|---|---|
| 画面内通知MVPでは設定保存が本当に必要か | **不要。** 現状の通知量（最大5件、実データで0〜数件）では設定が無くても実害が出ていない。先回りしてテーブルを作ることは`CLAUDE.md`が戒める「憶測に基づく機能追加」に該当するリスクがある |
| 外部push配信開始前までDBを作らずに済むか | **済む。** 画面内通知だけなら現状のステートレスな`buildWorkspaceNotifications`のままで運用でき、DBは不要 |
| 既読とSnoozeを同じ概念にしないこと | 5-1節・5-2節で別テーブル・別フラグとして分離済み |
| Notification IDの安定性 | 9節で3層に整理済み |
| occurrence_keyとの関係 | 9節（①の層がoccurrenceKeyを直接使う） |
| 送信済み判定と重複表示防止の違い | 6節で明確に区別済み |
| Cron実行時の再送制御 | 5-3節（severityの変化を再送トリガーにする） |
| 権限のないWorkspaceの通知が漏れないこと | 10節（RLSがデータ取得層で唯一の防波堤という構造を維持） |
| owner/member/viewerの設定可能範囲 | 8節 |
| メール等の送信先解決方法 | 11節 |
| 最小MVPとv1.0を分けること | 15-1節・15-2節、17節 |

---

## 16. migrationが必要になる時点

| きっかけ | 最初に作るテーブル |
|---|---|
| 「画面内通知をカテゴリ別に消したい」という実際の要望が確認された時点 | `workspace_notification_settings`（Workspace既定値のみ、案Cの半分） |
| 「複数の顧問先を担当するスタッフから、会社ごとに通知量を変えたい」という要望が出た時点 | `workspace_member_notification_settings`（個人上書き） |
| 通知センターの件数・頻度が増え、見た/見ていないの管理が実際に必要になった時点 | `workspace_notification_reads` |
| 「一時的に消したい」という要望が既読だけでは満たせないと分かった時点 | `workspace_notification_snoozes` |
| メール等のpush配信に着手する時点（[NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 8-3節と同じトリガー） | `workspace_notification_log` |

**現時点（Sprint38）ではいずれのきっかけも実データで確認されていないため、migrationは作成しない。**

---

## 17. Sprint39以降推奨順序（イメージ）

| Phase | 目的 | 前提 | 要判断事項 |
|---|---|---|---|
| **39.1** | `workspace_notification_settings`（Workspace既定値のみ）のmigration・UI（ownerのみ編集、カテゴリ別ON/OFF） | 16節の1つ目のきっかけが実際に確認されること | 個人上書きを後回しにして案Cを段階的に育てる、という順序の妥当性 |
| **39.2** | `workspace_member_notification_settings`（個人上書き） | 39.1完了、16節の2つ目のきっかけ | 上書きUIの置き場所（会社ごとのWorkspace内か、管理者個人のプロフィール的な場所か） |
| **39.3** | `workspace_notification_reads`（既読管理） | 通知件数の増加が実際に問題になった場合のみ | 既読を件数バッジ以外に使う用途があるか |
| **39.4** | `workspace_notification_snoozes` | 39.3完了 | 通知単位・カテゴリ単位の両方を同時に提供する必要があるか、まず片方に絞るか |
| **39.5** | `workspace_notification_log` + メールチャネル本体 | [NOTIFICATION_ENGINE_DESIGN.md](NOTIFICATION_ENGINE_DESIGN.md) 8節（送信先解決・Cron基盤）着手の意思決定 | 配信基盤（Resend等）の選定、Vercel Cron Jobsの利用可否 |
| **39.6** | 配信時間帯・休日制御 | 39.5完了、v1.0スコープとして再判断 | 祝日カレンダーの調達方法（静的テーブルか外部API依存か） |

---

## まとめ（設計レビュー観点）

1. **2節の核心的な判断**: 案C（Workspace既定値＋ユーザー上書き）を採用し、`workspace_members`と
   同じ「大枠のデフォルト＋会社ごとの上書き」という既存の設計思想を通知設定にも延長するという判断が
   妥当か
2. **4-1節**: 通知設定を`workspace_members`に列追加せず、独立した子テーブルに分離するという判断
3. **5節**: 既読・Snooze・再通知を明確に別概念として分離した設計（同じテーブル・同じフラグで
   代用しないこと）
4. **6節**: 重複表示防止（実装済み・時間軸なし）と送信済み判定（未実装・時間軸あり）を異なるレイヤーと
   位置づけたことの妥当性
5. **9節**: Notification IDの安定性を3層に整理し、②（Decision由来、procedure名ベース）の改名リスクを
   本設計では解消せず、将来のEngine改修時の申し送り事項とした判断
6. **10節**: Notification Settings導入後も、アクセス制御を「データ取得層のRLSのみに委ねる」既存構造を
   崩さないという制約の妥当性
7. **12節**: 共有ページへの通知露出を明確に見送り、既存の「Decision/AI Adviserを共有除外する」方針と
   整合させた判断
8. **15-3節・16節**: 「画面内通知MVPには設定保存が不要」と結論づけ、migrationを実要望が出るまで
   作らないという判断が、`CLAUDE.md`の「小さく作る」原則と整合しているか
9. **17節の実装順序**: Workspace既定値（39.1）→個人上書き（39.2）→既読・Snooze（39.3・39.4）→
   送信ログ・メール（39.5）→配信時間帯・休日（39.6）という段階分けが妥当か
