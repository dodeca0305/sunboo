# LAUNCH_OPERATIONS.md — Launch Operations（Phase5）

**ステータス：ドラフト（Phase5「Launch Operations」成果物）**
コードは一切変更していない。本ドキュメントは**「Version 1.0公開後、誰が運営しても対応できる」
運営手順書**であり、公開に向けた準備状況の判定（[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md)）や
公開条件の定義（[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md)）ではなく、**公開後の日々の運営**だけを扱う。

**役割の切り分け**：[PROJECT_STATUS.md](PROJECT_STATUS.md)＝完成度ダッシュボード、
[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md)＝公開してよい条件、
[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md)＝公開直前の実務チェックリスト、
[ROADMAP.md](ROADMAP.md)＝実装履歴。本ドキュメントはこれらのいずれでもなく、**公開後に実際に手を
動かす運営者向けの手順**に絞る。新しい判定基準・新しい概念は作らず、既存文書
（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)・[BETA_BACKLOG.md](BETA_BACKLOG.md)・
[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)）が既に定めた運用ルールをVersion 1.0の運営にそのまま
つなぎ直す。

---

## 1. 運営フロー（問い合わせ対応）

```
問い合わせ受付
   ↓
分類
   ↓
対応
   ↓
解決
   ↓
記録
```

| 段階 | 実務 |
|---|---|
| **受付** | `/help`ページの`mailto:`リンク（`src/lib/contact.ts`の`FEEDBACK_EMAIL`）が唯一の受付窓口。[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §2で指摘済みの通り、現状は個人アドレスであり、Version 1.0公開前に業務用アドレス・返信担当者・対応時間帯（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 20節の平日9:00〜18:00をそのまま踏襲するか要確認）を確定させる |
| **分類** | 3種類に仕分ける。①**不具合報告**→2節の障害対応 or 本節の分類へ、②**分かりにくさ・要望**→[BETA_BACKLOG.md](BETA_BACKLOG.md)の重大度分類（[BETA_PILOT_LOG.md](BETA_PILOT_LOG.md)の定義をそのまま使用：**Blocker**＝業務継続不能・他社データ閲覧・保存失敗、**High**＝誤った判断・期限・手続き表示につながる、**Medium**＝導線や文言が分かりにくい、**Low**＝見た目や軽微な不便）、③**新機能の要望**→7節「Version 2」へ |
| **対応** | RC1で確立した3レベル（**運用で解決／UI軽微修正／実装変更**）で暫定対応を判断する。Blocker/Highは検知次第即座に着手、Medium/Lowは棚卸しの上でSprint計画に乗せる（[BETA_BACKLOG.md](BETA_BACKLOG.md) 0-2節の優先順位ルールをそのまま適用） |
| **解決** | 修正が本番反映され、報告者（連絡先が分かる場合）に一次回答した時点で解決とする。恒久修正までに時間がかかる場合は、暫定対応（運用回避策）を先に案内する |
| **記録** | [BETA_BACKLOG.md](BETA_BACKLOG.md)を**Version 1.0後も継続利用する**（新しい台帳を作らない）。発見元列に`PostLaunch`を追加し、Closed Beta由来（`Day1Observation`／`Pilot`／`Tester`）と区別できるようにする。Won't Fix判断の運用（同ドキュメント0-3節）もそのまま適用する |

---

## 2. 障害対応（インシデント対応）

問い合わせの中でも「サービスが正常に機能していない」ものは、1節の一般フローではなく本節の
インシデント対応フローを優先する。[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節の
「重大障害」定義（他社データ閲覧・ログイン不能・データ消失・保存継続失敗・共有トークン総当たり）を
S1として引き継ぎ、影響範囲に応じてS2〜S4へ段階化する。

| Severity | 定義 | 初動 | 報告 | 復旧 | 事後レビュー |
|---|---|---|---|---|---|
| **S1** | [CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 22節の5条件のいずれか（データ漏洩・サービス全停止・データ消失・保存操作の継続的失敗・共有トークン総当たり） | 即座に対象機能への新規操作を停止する案内を出す。データ漏洩系（他社データ閲覧・トークン総当たり）は原因究明まで全ユーザーのアクセスを一時停止することも検討する（同22節） | 影響を受けうる全ユーザーへ速やかに連絡（1節の受付窓口を発信にも使う） | Vercel Deploymentsから直前の正常デプロイへロールバック（同15節）。DB起因はmigration内容を確認し局所修正、広範な場合はSupabaseのPoint-in-Time Recovery（3節） | 必須。原因・影響範囲・恒久対応を記録し、[BETA_BACKLOG.md](BETA_BACKLOG.md) Blockerへ`PostLaunch`として登録 |
| **S2** | 特定機能が使えない・誤動作するが、S1の5条件には該当しない（例：Roadmap計算が特定条件で例外を返す、PDF/Excel出力が失敗する） | 影響範囲（全社か一部会社か）を特定し、回避策があれば案内 | 影響を受けたユーザーへ連絡。全体アナウンスは影響範囲次第で判断 | コード修正が必要な場合は次回デプロイで対応。緊急度が高い場合はS1同様ロールバックも検討 | 影響が広い場合のみ実施。[BETA_BACKLOG.md](BETA_BACKLOG.md) Highへ登録 |
| **S3** | 一部の利用者のみに影響する軽微な不具合・表示崩れ | 通常のSprint計画に乗せる | 個別回答のみ | 通常のリリースサイクルで対応 | 不要 |
| **S4** | 見た目・文言の軽微な指摘、機能への実害なし | 記録のみ | 個別回答のみ | 優先度に応じて対応 | 不要 |

**現状の制約（正直に明記）**：SUNBOOには専任の運用・オンコール体制が無い。
[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 3節の想定規模（運営1〜3名）がVersion 1.0でも
継続する前提であれば、上記「初動」「報告」はすべて同じ少人数が兼務することになる。利用者数が増える
場合、この体制で足りるかは[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §2「初回サポート」の
課題と合わせて別途判断が必要。

---

## 3. バックアップ

| 項目 | 内容 |
|---|---|
| **対象** | Supabase上の全テーブル（`workspace_companies`・`workspace_company_profiles`・`workspace_members`・`workspace_procedure_statuses`・`workspace_documents`・`workspace_share_links`・`workspace_tax_return_profiles`、および`procedures`等のマスタデータ）。Supabaseプロジェクト単位のバックアップのため、個別テーブル指定はできない |
| **頻度** | **未確定。** Supabaseの自動バックアップ・Point-in-Time Recoveryの可否・保持期間は契約プランに依存し、本セッションからは確認できない（[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §5で既出）。運営側が契約プランのバックアップ仕様を確認し、この行を実測値で埋める必要がある |
| **復元確認** | **未実施。** 復元（リストア）を実際に試したことがない。Version 1.0公開前に、テスト用のSupabaseプロジェクト（または同一プロジェクトの検証用データ）で最低1回、実際にPoint-in-Time Recoveryを実行して復元にかかる時間・手順を確認しておくことを強く推奨する。手順書自体も未整備（[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §5「Restore手順」） |

---

## 4. Beta終了

```
Observation（BETA_DAY1_OBSERVATION.md）
   ↓
Backlog（BETA_BACKLOG.md）
   ↓
修正（運用で解決／UI軽微修正／実装変更）
   ↓
Release判定（V1_RELEASE_PLAN.md §2 Release Criteria）
```

このパイプラインは[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §4「Beta Feedback Process」の
Observation→Backlog→Priority→Releaseと同一のものを指す（新設しない）。本ドキュメントでは
「Priority」の後に必ず挟まる「修正」を明示的に1段として書き出した点のみが異なる（1節の3レベル
対応方針をここでも適用する）。

**Beta終了の判定は、[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 26節の基準
（重大障害0件・継続利用意向あり→v1.0着手／軽微な不満のみ→順次対応／23節の制約がブロッカー→
最優先対応／重大障害あり・実務で使えない→設計やり直し）をそのまま使う。** Version 1.0公開が
できるかどうかは、この26節の判定結果と[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §2 Release
Criteria・[V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md) §7の3段階判定の**両方**を
満たすことが条件になる。

---

## 5. Version 1.0公開

| 項目 | 内容 |
|---|---|
| **公開日** | 未定。[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §6と同じ（本ドキュメントで新たに確定させるものではない） |
| **担当** | **未割当。** 公開作業（後述の公開手順）を実際に誰が実行するかは、本セッションでは判断できない運営側の割り当て事項。Version 1.0公開前に確定させる必要がある |
| **公開手順** | ① [V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md)の全項目が「Ready」基準（同ドキュメント§7）を満たすことを確認 ② 本番ドメイン・robots・sitemap・OGP・faviconが揃っていることを再確認（同チェックリスト§6、本ドキュメント作成時点ではいずれも未着手） ③ Vercel本番環境へのデプロイを実行し、`main`ブランチの最新コミットが反映されていることを確認 ④ Supabase側の全migrationが本番に適用済みであることを確認（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 16節のチェックリストを流用） ⑤ 利用規約・プライバシーポリシーへのリンクが実際に機能することを確認 |
| **公開後確認** | 本番URLで主要導線（`/start`→`/result`、管理画面ログイン、Workspace作成→Profile→Roadmap→PDF/Excel出力→Share発行）を一通り実施し、エラーが出ないことを確認する。[ANALYTICS_STRATEGY.md](ANALYTICS_STRATEGY.md)の8イベントが実際に発火する（開発者コンソールまたは接続済みの外部計測サービスで）ことも合わせて確認する |

---

## 6. サポート

| 区分 | 運用 |
|---|---|
| **問い合わせ** | 1節の受付フローに従う。回答期限の目安は[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 20節の対応時間（平日9:00〜18:00）をVersion 1.0でも当面維持する |
| **FAQ** | `/help`ページの「よくある質問」セクション（`src/app/(site)/help/page.tsx`）を一次情報源とする。同じ質問が3件以上寄せられた場合はFAQへの追加を検討する（新しいFAQ用ドキュメントは作らない） |
| **改善依頼** | 1節「分類」で②に振り分けられたものは[BETA_BACKLOG.md](BETA_BACKLOG.md)へ、③（新機能要望）は7節「Version 2」の受付へ回す |
| **バグ報告** | 1節「分類」で①に振り分けられたものとして扱い、2節の障害対応（S1〜S4）またはBlocker/Highとしての[BETA_BACKLOG.md](BETA_BACKLOG.md)登録のいずれかに進める |

---

## 7. Version 2

```
要求受付 → 優先順位 → 採用 / 保留 / 却下
```

| 段階 | 運用 |
|---|---|
| **要求受付** | 6節「改善依頼」経由で集まる新機能要望を蓄積する。[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §7に既に挙がっている候補（補助金・助成金対応／会計ソフト連携／通知自動化／税理士ダッシュボード強化／AI参謀高度化）を初期リストとし、新たな要望はこのリストへの追加として扱う（新しい候補台帳は作らない） |
| **優先順位** | 同じ趣旨の要望が複数の利用者から独立に寄せられた頻度、[VISION.md](../VISION.md)「現場が正しい（思いつきでは作らない。現場で困ったことだけを作る）」との合致度、実装コストの3点で判断する。単一利用者からの一度きりの要望は即採用せず、まず様子を見る |
| **採用** | 優先順位が高く、[CLAUDE.md](../CLAUDE.md)が定めるSUNBOOの範囲（行政手続きの「情報を見る／自動生成する」サービス）と矛盾しないもの。採用時はCLAUDE.mdの開発フロー（要件整理→設計→…）に従って個別Sprintとして計画する |
| **保留** | 需要はありそうだが優先順位・設計方針が固まっていないもの。[ROADMAP.md](ROADMAP.md)の該当バージョン節（例：v0.7補助金、v0.8顧問先管理相当の拡張）に追記して保管する |
| **却下** | [CLAUDE.md](../CLAUDE.md)が明記する境界を超える要望——**記帳・電子申告・法的助言そのものの提供**——は、需要の大小に関わらず却下する。SUNBOOは会計ソフトでも士業の代替でもないという製品原則そのものであり、Version 2以降でも変わらない |

---

## 最後の報告

**運営開始に必要な項目**

- 1節：問い合わせ受付窓口を業務用アドレスへ切り替え、返信担当者・対応時間を確定させる
- 2節：S1〜S4の初動・報告を実際に担当する人（複数名の場合は連絡順）を確定させる
- 5節：公開作業の担当者を確定させる
- 上記いずれも、既存の少人数運営体制（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)想定の1〜3名）を前提に組める内容であり、大掛かりな体制構築は不要

**未整備項目**

- バックアップの頻度が契約プラン依存で未確認、復元（リストア）を1度も実施したことがない（3節）
- Version 1.0公開の担当者・公開日が未定（5節）
- 支援窓口（問い合わせメール）が個人アドレスのまま、業務用への切り替えが未実施（1節・6節）
- [V1_READINESS_CHECKLIST.md](V1_READINESS_CHECKLIST.md)で指摘済みの法務文書・リリース基盤
  （robots/sitemap/OGP/favicon/本番ドメイン）が未整備のままでは、5節「公開手順」自体が実行できない

**Version 1.0公開後の最初の1週間でやること**

1. 公開後確認（5節）を初日に実施し、主要導線とAnalyticsイベントの発火を確認する
2. 問い合わせ・バグ報告を1節のフローに従って毎日棚卸しし、S1相当が無いかを最優先で確認する
   （[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md)のβ運営で確立した「重大障害は即座に
   対応」の姿勢をそのまま継続する）
3. バックアップが実際に取得されているか（3節、契約プランで確認した頻度通りに動いているか）を
   公開後1週間以内に1度確認する
4. 初週の問い合わせ・バグ報告の傾向を[BETA_BACKLOG.md](BETA_BACKLOG.md)へ記録し、公開後1週間の
   振り返りとして「最も多かった問い合わせ内容」「S1〜S2の発生有無」を軽くまとめる
   （新しい振り返りドキュメントは作らず、このLAUNCH_OPERATIONS.mdか`BETA_BACKLOG.md`への追記で足りる）

レビュー待ちで停止します。
