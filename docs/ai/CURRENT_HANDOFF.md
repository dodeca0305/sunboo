## 2026-11-18 Current-week link implementation reviewed; preparing PR

- One Claude session finished and exited. Source review approved only href date mapping plus home passing captured today; no business data writes, save semantics or notice computation changes.22 scoped tests/lint/isolated full build pass (all real exit0); current-task idle. Source3files and LAST_RESULT only. No duplicate checks by Codex. Own temp build removed.
- Read-only live review completed home/growth/documents. With date11-01 growth opened week10-26 blank; date11-18 shows current week target5/actual5. Existing monthly sales600000/target1000000/cash forecast1090000 preserved. Document two asset forms remain準備中, appropriate official forms deferred; no status write. CUA completed, Chrome docs page. First URL native type lost an h and opened a public-URL Google search, corrected via native paste; no data/credentials exposure.
- Next one PR/CI; final reviewable production release approval, then verify home click opens actual current week without writing company23. No further paper packets or unrelated features. Prior trial setup/fictional Kanpo preparation complete on local metadata branch codex/financial-forecast-release-record25e40da and later commits; exact production PR213 main441742e.

## 2026-11-18 Active: home growth link must open the current day/week

- User continues company23 trial and asks next steps. Final read-only UI review found a concrete existing navigation bug: home "今月の売上目標" points at /growth?date=2026-11-01, which initializes week2026-10-26 and hides the saved current-week record. Opening date2026-11-18 shows target5/actual5. Data is not lost. Fix this navigation only; no new feature, schema or business write.
- Base main441742e108bb762d5ebbf5603a3a91e8bae98d58 (PR213 production). Latest main fetched/no open PR. Prior local release/preparation metadata preserved on codex/financial-forecast-release-record at25e40da. All forecast and role work complete, no further company23 writes in this task. Final review CUA completed, Chrome documents page. Official forms remain deferred; no extra packet needed.
- AGENTS/CLAUDE split applies: one Claude Sonnet/medium/manual implements/tests, Codex reviews/PR/CI/release. FirstParty claude.ai extra-usage OFF confirmed11/17 same account; checker11/18 confirms connection; no API/provider/account/billing/install changes/additional agents. No secrets/.env/auth session/customer data to worker. Public source only, synthetic local QA; node_modules existing symlink unchanged, old siblings and .next and other servers untouched.
- Proposed scope: existing notification-to-action helper may accept explicit reference day; home passes already-known Japan today. Use date only when valid and inside selected month; preserve historical/future/default month targeting and intentional date links. Do not globally change growth?date semantics because daily action links intentionally open their selected day. Notifications/reasons/priorities/calculations and all data loading/saving remain unchanged. Tests deterministic at11/18/current week11/16, same-month last day, invalid/mismatched reference dates, legacy callers. At most listed4files. Full suite CI, scoped unit/lint/isolated build locally. No user Chrome interaction by worker, no commits/push/release. See current-task.

## 2026-11-18 Forecast implementation reviewed; preparing PR/CI

- Branch codex/financial-forecast-storage. Approved forecast-only feature implemented by one Claude Sonnet/medium/manual session; implementation finished, task idle. Codex reviewed SQL/access/calculation/save recovery and 375/1280 screenshots. No production migration, release or company23 entry yet. Existing node_modules symlink and other ports remain untouched; own3121 and temporary fixture cleaned.
- Final checks: library/adapter30 and SQL10 pass exit0; actual Next + PGlite synthetic UI22 scenarios pass exit0 (e2e-run5.log), isolated full-tree webpack build exit0, final lint exit0 (existing Growth warning plus two harness warnings). Logs/screenshots in test-results/financial-forecast-*. LAST_RESULT records limitations: actual concurrent PG transactions and production auth/PostgREST not yet verified. No repeated successful checks by Codex.
- Review items1–10 in FORECAST_REVIEW resolved, including negative Enter, strict version acknowledgement, pinned draft baseline, pending ownership/recovery, full TS build parity, explicit E2E scenario selection and restored sample evidence. Legacy monthly/tax data not modified by feature. Proposed source figures and resulting 840000 net income/5040000 assets/difference0 match approved workbook.
- Next: commit named files, one PR/CI. Final reviewable production rollout approval follows the agreed plan; include scoped new migration and company23 UI entry in one batch. After approval apply only this new migration, release verified main SHA, enter exact FY2027/03 fictional sample through normal UI and read back; past return stays1 and monthly figures unchanged. Do not apply old migrations or seed production directly. No per-click permission questions.

## 2026-11-18 Active: approved isolated financial forecasts

- Latest explicit user approval: add company/year financial forecast saving to SUNBOO and proceed, after the user requested entering the delivered fictional forecast. FINANCIAL_FORECAST_PLAN.md is the concrete approved scope and exact fictional dataset. New forecast-only table and necessary invoker save function/authorization are authorized additions; no bulk legacy SQL, public exposure, tax logic changes, new charges, or other features. Claude implements local code/tests only; Codex handles PR/release and normal-UI company23 entry after release.
- Latest user data-entry permission overrides the old company23 read-only line ONLY for this fictional forecast setup. Existing past FY2026/03 return stays one record. FY2027/03 forecast must never enter tax-return/actual/monthly/share paths. Tax expense 360000 is arbitrary sample input, not computed tax.
- Source base origin/main 1f52396302c0898f5fbf14e72911317ec00c0f4b, no open PR. Independent existing workdir sunboo-interim-guide; current branch codex/financial-forecast-storage. Prior metadata branch codex/trial-final-acceptance preserved at 9a30a46; copies in ../backups/2026-11-18-financial-forecast-start/. Only untracked node_modules symlink existed. Do not edit old sibling repos, node_modules, existing3130/14330 (writes disabled), or stopped3138.
- Developer latest: work autonomously in batches and do not ask for per-click approval. Schema expansion was concretely approved. Do not start a second implementation agent or use API/billing/install upgrades. Same Claude claude.ai firstParty extra usage OFF was previously confirmed 2026-11-17 and remains the authorized setup; checker confirmed login 2026-11-18, CLI2.1.326. Sonnet/medium/manual, no additional agents. Current-task will define one task.
- Supabase skill reviewed. Changelog 2026-11-18 relevant breaking changes do not require upgrades (Flutter/CLIv3 not used); modern browser TLS fine. RLS guidance: narrow grants, RLS authenticated company authorization + admin/non-anonymous checks, no user_metadata or SECURITY DEFINER bypass. Existing cached CLI2.122.0 available at /Users/zeirishihoujincross-border/.npm/_npx/91eb58246759989d/node_modules/@supabase/cli-darwin-arm64/bin/supabase; help checked. No installations/upgrades. Codex generates the one migration skeleton through CLI; Claude edits only that named file. No production DB or sessions to Claude.

# 短い現在地（2026-11-13）

- 今回：main 6f153b3fc71efeea211fc6a9b492e2856c3df7a6から、共通単一selectの通常枠と矢印を濃くして操作箇所を明確化。LinksTable1箇所も共通化、選択値/既定値/保存/DBは不変。Claude合成/lint/webpack成功、Codex375px/desktopと合成実機確認。44 select全て共通クラス、全画面個別目視は未確認。PR/CI/配信確認を継続。

- 今回：main a287ad95feef0f179fa631964d23cb4073c75d15から、ロードマップ対応状況の4選択肢に短い説明を追加。保存値・順序・ハンドラ・保護・共有バッジは不変。Claude合成画面/lint/webpack成功、Codex375px/desktopとローカル実機の開く/Escape確認、書込33/拒否1不変。利用者の理解は未確認、PR/CI/配信確認を継続。

- 今回：main d8f99ef2693bfb833402cd561dd68867ee65c423から、既知の完了案内を「完了にする前の確認／〜した」の表現へ変更。支払い・支払控えは納める税金がある場合のみ、申告だけの区分は2項目、未知の手続きは未確認のまま。保存・税務・期限・DBは不変、末尾の配置を維持。
- Claude対象4テスト・合成admin/shared375px/desktop・lint成功。生成dev型ファイルの重複で初回build失敗し、削除せずBusiness側backupへ保護後build成功。Codexは375px/desktop画像を目視済み、PR/CI/配信/本番23読取確認を継続。本人の理解確認は未完了。

- 今回：main f7af5e451f29cbe6eb5331abcb23635c2364610dから、税理士依頼の案内の3語だけ太字化（申告の依頼／必要な書類／提出予定日）。文言と2行構成、他分岐、保存は不変。Claude lint/webpack成功、Codexは静的合成プレビューで実際の太字を確認済み。新規テストや無関係の再試験はせず、通常CI/公開へ進む。
- PR200の並べ替えはCI/配信/本番23読取確認済み。ユーザーは説明なしの試用で「進め方かな」→税理士を選択→2行の案内を読み上げた。理解の確定回答はまだで、まず太字化の要望に対応。以下は以前の記録。

- 最新の依頼：main eb4b9c24c38f42acb2bf3cd03d12ad090ba5a02cから、完了案内をカード末尾の「対象・注意」の後へ移動。提出先→必要書類→対応状況→対象→完了案内。内容や保存は変更なし、PR199の3択を維持。Claude合成画面/lint/webpack成功、Codex375px/desktop目視済み。PR/CI/配信・本番23読取確認を継続。
- PR199のMac解除待ちは解消済み：合成プレビューで3案内のネイティブキーボード切替と初期化、本番23の初期表示を確認。利用者は3分岐とも「わかる」。以下の旧未確認記録は当時の状態で、最新結果はBusiness側の試用記録を参照。

- 今回：c691ff681227ec6359e1fef7bc813433328e2494（PR #198まで統合/本番読取確認済み）から、法人税確定申告の入口を3択に変更。表示だけで担当/対応状況/保存は変えない。他手続きの入口は維持。Claude対象27テスト・合成管理/共有画面・最終lint・webpack成功、Codexが差分と375px表示を確認。
- ヘッドレスでのキーボード選択確定は未確認。ローカル3130の保存なし合成プレビュー /trial/corporate-filing-choice を準備。実機はMacロックの解除待ち。本番の選択・保存はしない。PR/CI/反映は通常どおり進め、最終画面確認を継続する。詳細LAST_RESULT。以下は以前の記録。

- 最新作業：main 862c9adda8310946d1d4dff75f74afbbd0cf6de5から、実際に404になった渋谷税務署の案内URL1件だけを共用表示で補正。正URLは国税庁東京都一覧から辿り、Chrome表示も確認。DBは変更しない。
- Claude対象21テスト、合成admin/shared画面、lint、webpackビルド成功。Codexレビュー済み、PR/CI/本番反映・架空会社23読取確認を継続。詳細はLAST_RESULT.md。下記は直前作業の記録。

- 今回は『入口はわかりやすいけどダサい』への見た目調整。RoadmapNextActionのclassName 1行のみを変更し、角丸4px/太さ500/14px、高さ44px以上と黒背景白文字を維持。配置/文言/リンク/保存は不変。
- 基点main 8e6e6b9985664fa8cc083020bb84f310618734bb（PR #196）。#196の黒い入口と#195の完了フローは統合/CI/本番読取確認済み。
- Claudeが既存合成画面/lint/webpackビルドを実行し成功。Codexが375px/desktopの通常表示を目視。PR/CI/本番確認はCodexが継続。次の依頼は未割当。
- 本番は架空会社23の読み取りのみ。3130は合成データ・書込停止。旧フォルダ/不正ref/既存未追跡ファイルを整理しない。
- ホームの旧文言/未分類の個別案内等は残課題。一般単独画面の実画面は未確認。横断分析/書類整理連携は次期計画。試用結果から次を決め、新機能を先行しない。

## 接続と分担

- Claude Code 2.1.308はインストール済み。必要なOSアクセスでclaude.aiログイン/Pro契約を確認。
  制限された実行環境では認証を取得できず未ログイン表示になる場合がある。
- APIキーの運用にはしない。本人承認後、同じアカウントの使用クレジットOFFを画面で確認済み。
  今回はClaude Codeが実装/対象試験、Codexが差分/目視/PR/CI/公開を担当。起動依頼は完了後idle。
- Gemini CLIはPATHで見つからない。ブラウザー版/契約は未確認。Museの製品も未特定。
- 認証情報やトークンはここへ保存しない。

## 読む順番

AGENTS.md → current-task.json → 指定ファイル/関連箇所だけ。
INPUT_LOAD_FAILURE_AUDIT.md、BUSINESS_HANDOFF.md、DEVELOPMENT_HANDOFF.mdは必要な節だけ検索。
歴史的な未対応記録より、新しい統合済みコードと点検結果を優先する。
