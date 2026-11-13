# LAST_RESULT: nta-office-link (2026-11-13)

- 変更：確認済みの1件のみ補正。NTA渋谷 /about/organization/tokyo/shokatsu/shibuya/index.htm → /about/organization/tokyo/location/tokyo/shibuya/index.htm（Chrome実機でNTA404と、NTA東京一覧からの正URLを確認）。NTA全体の書換えではない。DB/税務/期限/保存/見た目は不変。
- 共通純粋関数 correctKnownSubmissionUrl（submissionLinkSafety.ts）：http(s)・host nta.go.jp/www.nta.go.jp・認証情報なし・既定ポートのみ、pathは完全一致（末尾スラッシュ/query/hash許容）。入力は不変。roadmap CTA/下部/export（roadmapSubmissionInfo経由）、診断の共有参照（selectProcedureReference）、試用リンク（trialExecutionLinks）で使用。
- 既存の市区町村リンク切れ除外とbrokenポリシーを維持：補正前の生URLでbroken同一fallbackを比較し、補正で復活しない。
- 試験：node --test（submissionLinkSafety/roadmapNextAction/diagnosisSubmissionInfo）21件成功。偽装host・別ポート・認証情報・別署/別path・不変性・broken同一URLの回帰を追加。HOME_NAV_UI_ONLY=1 verify-home-read-safety（own dev 3118）PASS。共通変換を使う合成窓口（市民税カードのURL差替）でadmin/shared両方、補正後hrefのみ・誤href0件（test-results/nta-office-link-href.json）。lint成功（既存warning1件のみ）、build --webpack成功。ログ：test-results/nta-office-link-*.log。
- 後始末：3118停止確認。Nextが追記したAGENTS.md末尾をnative Editで除去（原本test-results/nta-office-link-AGENTS.orig.md、先頭は一致確認）。コミット/push/本番操作なし。
- 限界：合成ブラウザ試験はhref文字列の検証で、外部URLの実在/到達性は未検証（過去の合成href試験も同様）。補正後URLの実到達はChromeでの手動確認のみ。DB上の旧URLは未変更。PR/CI/本番確認はCodex。
