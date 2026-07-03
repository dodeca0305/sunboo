-- ============================================================
-- SUNBOO経営ナビ — rules 重複データの復旧
-- ============================================================
-- migration_rule_engine.sql の初回実行時、rules.name にUNIQUE制約が無かったため、
-- 複数回実行すると同名のルールが増殖し、条件・実行内容の件数も壊れてしまう不具合があった。
-- このファイルは rules / rule_conditions / rule_actions を一旦空にしてクリーンな状態に戻す。
-- 管理画面から作成した独自ルールがまだ無い前提（seed直後の状態）でのみ実行してください。
--
-- 実行後は、修正済みの migration_rule_engine.sql を再実行してシードデータを入れ直してください。
-- ============================================================

TRUNCATE TABLE rule_actions, rule_conditions, rules RESTART IDENTITY CASCADE;

SELECT COUNT(*) AS rules_count FROM rules;
