# SUNBOO — Claude Code実装用の入口

まずAGENTS.mdとdocs/ai/CURRENT_HANDOFF.mdだけを読む。
依頼はdocs/ai/current-task.jsonの1件。statusがreadyでなければ実装を始めず終了する。
過去の会話全文やdocs全体は読み込まず、指定ファイルと関連箇所だけを読む。

- Claude Codeは実装/対象試験、Codexは整理/差分確認/PR/CI/リリース。
- 1件1担当。追加エージェント/別AIの起動は明示依頼がある場合だけ。
- 通常はSonnet/medium。モデル格上げ、API課金、追加利用枠購入は自動で行わない。
- 探索が広がる、同じ原因の失敗が2回、範囲外の変更が必要なら、証拠と残作業を返す。
- 完了条件を満たしたら停止し、次の機能へ進まない。
- 結果はdocs/ai/LAST_RESULT.mdへ短く記録。ログ全文はtest-resultsへ保存する。
- 詳しい分担/試験の受け渡しはdocs/ai/WORKFLOW.mdを必要時だけ参照する。

旧ルールはdocs/archive/CLAUDE.before-ai-split.2026-11-11.mdに保管。
これは履歴であり、古いGRANT/本番CRUD/全資料必読の記述を現在の許可として使わない。
