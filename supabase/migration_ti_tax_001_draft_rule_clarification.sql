-- 承認前の本文補足。人間による本文レビュー後に適用する。承認・有効化はしない。
-- 他の編集を上書きしないよう、確認済み本文・版・状態を条件にする。
BEGIN;
DO $$
DECLARE
  previous_text TEXT := '内国法人の確定申告書は、原則として各事業年度終了の日の翌日から2月以内に提出する。ただし、清算中の内国法人につき残余財産が確定した場合には1月以内となり、その期間内に残余財産の最後の分配又は引渡しが行われる場合にはその前日までとなる。提出期限の延長その他の例外が適用される場合は、その適用後の期限を別途確認する。';
  revised_text TEXT := '内国法人の確定申告書は、原則として各事業年度終了の日の翌日から2月以内に提出する。清算中の内国法人の残余財産が確定した場合は、原則としてその確定日の翌日から1月以内（その期間内に残余財産の最後の分配又は引渡しが行われる場合はその前日まで）となる。ただし、通算子法人の残余財産確定日が通算親法人の事業年度終了日と一致する場合には原則2月以内となる例外がある。提出期限の延長その他の例外が適用される場合は、その適用後の期限を別途確認する。TI_TAX_001は清算中の残余財産確定に関する案件を自動判定せず、確認対象とする。';
  actual_text TEXT;
  actual_status TEXT;
BEGIN
  SELECT rule_statement, status INTO actual_text, actual_status
  FROM tax_rules
  WHERE rule_code = 'TI_RULE_CORP_FINAL_RETURN_DEADLINE' AND version_no = 1
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Expected rule v1 is missing'; END IF;
  IF actual_status <> 'draft' THEN RAISE EXCEPTION 'Only a draft rule may be clarified'; END IF;
  IF actual_text = revised_text THEN RETURN; END IF;
  IF actual_text IS DISTINCT FROM previous_text THEN
    RAISE EXCEPTION 'Rule text changed since review; inspect before applying';
  END IF;
  UPDATE tax_rules SET rule_statement = revised_text
  WHERE rule_code = 'TI_RULE_CORP_FINAL_RETURN_DEADLINE' AND version_no = 1;
END $$;
COMMIT;
