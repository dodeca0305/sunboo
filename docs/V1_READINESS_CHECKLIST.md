# V1_READINESS_CHECKLIST.md — Version 1.0 Readiness Checklist（Phase4）

**ステータス：ドラフト（Phase4「Version 1.0 Readiness」成果物）**
コードは一切変更していない。本ドキュメントは「Version 1.0を公開できる状態かどうかを、
技術的な実装状況ではなく運営・法務・保守・障害対応の観点から誰でも判断できるチェックリスト」。

**役割の切り分け**：[PROJECT_STATUS.md](PROJECT_STATUS.md)は「今どこまで完成しているか」の
ダッシュボード、[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md)は「Version 1.0を公開してよいと判断する
条件（Release Criteria）」、[ROADMAP.md](ROADMAP.md)は各バージョンの実装履歴。本ドキュメントは
そのいずれでもなく、**「公開直前に、公開作業として何が揃っている必要があるか」の実務チェックリスト**
に絞る。プロダクト品質の判定基準そのもの（何をもってBlocker/Highとするか等）は
[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §2を参照し、ここでは判定結果のみをチェック項目として引用する。

凡例：✅ 完了　🟡 部分的・要確認　❌ 未着手・未確認

---

## 1. プロダクト品質

| | 項目 | 状態 | 根拠 |
|---|---|---|---|
| 🟡 | Blocker 0件 | [BETA_BACKLOG.md](BETA_BACKLOG.md) §1の集計は0件。ただし外部参加者によるClosed Betaセッションが1件も実施されていないため、「実際に0件だった」のか「まだ見つかっていないだけ」なのかを区別できない（[V1_RELEASE_PLAN.md](V1_RELEASE_PLAN.md) §2で既出） |
| ❌ | High 0件 | `BETA_BACKLOG.md` §2の集計は表面上0件だが、[CLOSED_BETA_FINAL_REVIEW.md](CLOSED_BETA_FINAL_REVIEW.md)が指摘したHigh 3件（H-1 WarmPaper未反映／H-2 Blue-600残存／H-4 `@media print`未対応）がまだBacklogへ転記されておらず、実質的な未解決Highが残っている |
| ❌ | Beta完了 | 外部参加者（税理士・会計事務所スタッフ・経営者）によるセッションが未実施。[BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)は実行可能な状態で準備済みだが記録欄は空欄のまま |
| 🟡 | Analytics稼働 | [ANALYTICS_STRATEGY.md](ANALYTICS_STRATEGY.md)（RC2）でイベント発火の実装自体は完了。ただし外部計測サービス（PostHog/GA4/Mixpanel）へは未接続で、現状は開発環境の`console.debug`止まり。集計・KPI化はできない状態 |
| 🟡 | Accessibility維持 | 公開画面（`(site)`配下）は[ACCESSIBILITY_POLISH.md](ACCESSIBILITY_POLISH.md)で必須項目を解消し「GO」判定済み。ただし管理画面（Workspace）はログイン情報が無く、Sprint82以降一貫して実機確認ができていない |

---

## 2. 運営

| | 項目 | 状態 | 根拠 |
|---|---|---|---|
| 🟡 | 問い合わせ窓口 | `/help`ページに`mailto:`形式のフィードバック導線が実装済み（`src/lib/contact.ts`の`FEEDBACK_EMAIL`）。ただし個人のGmailアドレスであり、正式リリース後の問い合わせ量・対応体制（誰が・どの時間帯に返信するか）は未整理。[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 20節の「業務用メールアドレス」もプレースホルダのまま |
| ✅ | 障害時対応 | ロールバック手順（Vercel Deploymentsから直前の正常デプロイへ）・重大障害の定義とβ停止条件は[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 15節・22節で明文化済み |
| ❌ | Beta運営終了 | 外部セッション自体が未実施のため、終了判定（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 26節の基準）を適用できる段階に達していない |
| ✅ | FAQ | `/help`ページに「SUNBOOとは」「画面の見方」「よくある質問」のFAQセクションが実装済み・公開中 |
| 🟡 | 初回サポート | Guided Beta Onboarding（Workspace新規登録・Profile・Roadmap・共有ページへの初回利用者向け案内）は実装済み（[PROJECT_STATUS.md](PROJECT_STATUS.md) §5）。ただしアプリ内UI案内のみで、人によるオンボーディング支援（導入時の説明会・サポート窓口の体制）は未整理 |

---

## 3. 法務

| | 項目 | 状態 | 根拠 |
|---|---|---|---|
| ❌ | 利用規約 | 存在しない。[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 18節で「β時点で正式な利用規約・プライバシーポリシー・DPAを持たない」ことを確認済み。着手されていない |
| ❌ | プライバシーポリシー | 同上。Company Profile・Tax Return Profile等の機微な経営情報を扱う以上、正式公開前には必須 |
| ❌ | 特定商取引法表記（必要なら） | 未整備。ただし[ROADMAP.md](ROADMAP.md) v1.0節が「有料化するか否かは着手時に要件整理」としたまま未確定であり、**要否の判断自体がまだ決まっていない**（有料化しない場合は不要になりうる） |
| ❌ | Cookie方針 | 存在しない。管理画面ログイン（`src/proxy.ts`、Supabase Authのセッションcookie）は既に稼働しているため、Cookie利用の事実自体は存在するが、利用者向けの説明文書は無い |

---

## 4. セキュリティ

| | 項目 | 状態 | 根拠 |
|---|---|---|---|
| 🟡 | Supabase設定確認 | 全`workspace_*`テーブルへの`ENABLE ROW LEVEL SECURITY`はmigrationファイル上でコードレビュー済み（[DATABASE.md](DATABASE.md)）。ただし本番Supabaseプロジェクトで実際に有効化されているかは、本セッションからは確認できず運営側の目視確認が必要（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 16節で既出の未確認事項） |
| ✅ | APIキー確認 | 全クライアントが`NEXT_PUBLIC_SUPABASE_ANON_KEY`（匿名キー）のみを使用し、`service_role`キーは導入されていないことをコードで確認済み（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 17節） |
| ✅ | Secret漏洩確認 | 本チェックリスト作成にあたり`git ls-files`・`git grep`で再確認。`.env`系ファイルは`.gitignore`で正しく除外され、追跡対象は`.env.local.example`（プレースホルダのみ、実キー無し）だけ。`SUPABASE_SERVICE_ROLE`・実際のシークレット値の追跡は見つからなかった |
| ❌ | Rate Limit | アプリケーションレベルのレート制限は実装されていないことをコード全体で確認済み（`src/proxy.ts`は認証チェックのみ）。Vercel/Supabase標準プランのプラットフォームレベルの制限に依存している状態 |
| 🟡 | 権限確認 | RLS＋`workspace_members`（owner/member/viewer）の2層モデルはSprint33以降稼働中。ただし[COMPANY_WORKSPACE.md](COMPANY_WORKSPACE.md)が設計した4段階権限モデルのうち会員追加・編集UIは未実装（SQL手動操作、[BETA_BACKLOG.md](BETA_BACKLOG.md) L-01）で、`admin_users`側は依然フラットな権限モデルのまま |

---

## 5. 監視

| | 項目 | 状態 | 根拠 |
|---|---|---|---|
| ❌ | Error Log | アプリケーション独自のエラー監視・APM基盤は無い。Vercel/Supabase標準のプラットフォームログのみ（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 19節） |
| 🟡 | Analytics | [ANALYTICS_STRATEGY.md](ANALYTICS_STRATEGY.md)（RC2）でイベント計測の基盤（8イベント）は実装済み。外部サービスへの接続・実際の集計は未着手（1節と同一の状態） |
| 🟡 | Backup | Supabaseの自動バックアップ・Point-in-Time Recoveryの可否は契約プラン依存で、本セッションからは確認できない。運営側が契約状況を確認する必要がある（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 16節） |
| ❌ | Restore手順 | 「Point-in-Time Recoveryを検討する」という方針の言及（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 15節）はあるが、実際の復旧手順（誰が・どの権限で・どの画面から実行するか）を書いたrunbookは存在しない |

---

## 6. リリース

| | 項目 | 状態 | 根拠 |
|---|---|---|---|
| 🟡 | 本番URL | 本セッションからはVercelの実デプロイ状態を確認できない（[CLOSED_BETA_LAUNCH_PLAN.md](CLOSED_BETA_LAUNCH_PLAN.md) 0節と同じ制約）。`README.md`の記載も`https://your-app.vercel.app`というプレースホルダのままで、確定した本番URLの記録が無い |
| ❌ | ドメイン | カスタムドメインを設定した形跡はコード・READMEのいずれにも無い |
| ❌ | robots | `robots.txt`・`src/app/robots.ts`のいずれも存在しないことを確認済み |
| ❌ | sitemap | `sitemap.xml`・`src/app/sitemap.ts`のいずれも存在しないことを確認済み |
| ❌ | OGP | `src/app/layout.tsx`の`metadata`は`title`・`description`のみで、`openGraph`・`twitter`プロパティは設定されていないことを確認済み。SNS等でのリンク共有時にカード表示されない |
| ❌ | favicon | `src/app/favicon.ico`・`icon.png`等、Next.js App Routerの規約に沿ったfaviconファイルがリポジトリ内に一切存在しないことを確認済み |

---

## 7. 公開判定

以下の3段階で判定する。**判定は「❌が1件でもあれば次の段階に進めない」という単純な多数決ではなく、
各段階の必須条件を満たすかどうかで判断する。**

### Ready（公開してよい）
- 1節「プロダクト品質」が全て✅（特にBlocker/High実測0件・Beta完了）
- 3節「法務」が全て✅（利用規約・プライバシーポリシーは必須、特定商取引法表記は有料化方針が
  確定した上でその判断に従う）
- 6節「リリース」の❌が0件（本番URL確定・最低限のrobots/OGP/faviconが揃っている）
- 4節「セキュリティ」に❌が無い（Rate Limitは代替の運用対応で許容可）

### Almost Ready（あと少し）
- 1節「プロダクト品質」の❌が0件（🟡は許容、ただし「Beta完了」「High 0件」は❌のままでは該当しない）
- 2節「運営」・5節「監視」に❌が無い
- 3節「法務」の利用規約・プライバシーポリシーが少なくとも🟡（着手済み・レビュー中）まで進んでいる

### Not Ready（公開判断の対象外）
- 上記いずれの基準も満たさない。特に1節「Beta完了」「High 0件」、3節「法務」が❌のままの場合は、
  他の項目の状況に関わらずNot Ready

---

## 現時点の判定：**Not Ready**

3節「法務」が4項目全て❌、1節「プロダクト品質」の「Beta完了」「High 0件」がいずれも❌のため、
Almost Readyの基準にも届いていない。

---

## 最後の報告

**Ready項目数**：4件／29件（APIキー確認・Secret漏洩確認・障害時対応・FAQ）

**未完了項目数**：25件（🟡10件・❌15件の合計）

内訳：

| 節 | ✅ | 🟡 | ❌ |
|---|---|---|---|
| 1. プロダクト品質 | 0 | 3 | 2 |
| 2. 運営 | 2 | 2 | 1 |
| 3. 法務 | 0 | 0 | 4 |
| 4. セキュリティ | 2 | 2 | 1 |
| 5. 監視 | 0 | 2 | 2 |
| 6. リリース | 0 | 1 | 5 |
| **合計** | **4** | **10** | **15** |

**Version 1.0まで残る課題**

- 法務文書（利用規約・プライバシーポリシー・Cookie方針）が一切着手されていない。機微な経営情報を
  扱うプロダクトである以上、これが無いままの正式公開はできない
- 外部参加者によるClosed Betaが1件も実施されておらず、「Blocker/High 0件」「重大障害0件」という
  プロダクト品質の根拠が実証されていない
- リリース作業そのもの（本番ドメイン確定・robots/sitemap/OGP/favicon）がほぼ手つかず（6件中5件が❌）
- Analytics・Error Log・Backupは「仕組みの一部はあるが外部接続・確認が未完了」という共通の課題を抱える
  （🟡が集中している領域）

**最優先3項目**

1. **法務文書の整備（利用規約・プライバシーポリシー）** — 3節が唯一「全項目❌」の節であり、着手判断
   自体がまだ行われていない。エンジニアリング作業ではなく法務面の意思決定が必要で、着手から完了まで
   最も時間がかかりうる領域のため、最優先で着手判断だけでも行うべき
2. **外部参加者によるClosed Betaセッションの実施** — 1節「プロダクト品質」5項目のうち3項目
   （Blocker/High/Beta完了）がこれ1つに懸かっている。[BETA_DAY1_OBSERVATION.md](BETA_DAY1_OBSERVATION.md)
   の実行スクリプトは準備済みのため、実施すること自体が次の一手になる
3. **リリース基盤の実装（robots・sitemap・OGP・favicon・本番ドメイン確定）** — 6節6項目中5件が❌。
   実装コストは他の2項目に比べて小さい一方、これが無いままでは「公開作業」そのものが完了しない
   （検索エンジン非対応・SNS共有時にカード非表示・タブにアイコンが出ない、という利用者体験にも
   直結する）

レビュー待ちで停止します。
