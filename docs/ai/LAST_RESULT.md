# 第6弾：広島・熊本13区の提出先追加（2026-11-25）

基点99ff4d8。helperへ広島8区・熊本5区を追加し19市161区に拡張。既存17市148区lookup全値不変。公式本文を11/25再確認、11/20の確認済みデータと一致。R9専用様式公開は未確認。札幌や全国対応の完了を示さない。会社情報/税務判定/期限/権限は変更なし。

- 実装はhelper・helper試験・実component合成画面QA・stage6 manual DATA PATCH・PGlite validatorと本記録の6filesのみ。既存stage1–5 SQLは無変更。
- INSERTのみ2窓口/2出典/13管轄。transaction/locks/前提照合/完全一致だけno-op/部分衝突拒否/既存指紋不変/全rollback。migrationではなく手動適用用、本番未実行。
- 対象37tests、全1157tests、PGlite15項目、実画面37項目（1280/375、新13区/旧148回帰、両URL、初期未選択/other/切替、通信0、横overflowなし）、対象eslint成功。隔離webpack build/型検査成功（compile7.1s、TS3.1s、39pages）。成功snapshotと最終5実装/検証files byte一致。広島mobile・熊本PCを画像目視。
- 初回ブラウザー起動はMachPort権限拒否、全体テスト初回は127.0.0.1のlisten EPERMで4件失敗。失敗logを保持し、許可された実行環境でコード変更なしの再実行が全成功。buildは初回実行成功。実行済み正常試験の重複なし。
- 一時worktree消失・旧process不在を確認し同branch/baseで復元。Claude会話848b3386再開は非公開ソースをAnthropicへ送信する明示承認不足として自動承認レビューが拒否。拒否された起動を再試行/迂回せず、外部AI送信を伴わないCodexローカル実装に切替して完了。二重担当なし。
- 本番未反映、PR214/215は保留。今回2市の本番例外承認は未受領。公開13区を11/25読み取り再照合し、県/コード/区名一致・対象窓口/主管轄0・有効規則1を確認。会社/customer/auth/秘密ファイル参照なし。

build snapshot: /private/tmp/sunboo-stage6-build.ut7n7tmh
