# 初期版DB限定適用・安全停止

対象は `20261103040320_create_workspace_company_atomic.sql` のみ。他の既存SQLや未適用履歴は一括実行しない。プロフィール保存関数は別承認の対象で、この手順の登録用関数へ混在させない。

## 適用前

1. 最新main/PRのCIとローカル合成DB試験を確認する。
2. 対象4ポリシーの定義・会社/メンバーの全ポリシー・新規対象の不存在・架空会社23のデータ指紋を保存する。現在の記録はBusiness作業フォルダの `backups/2026-11-03-initial-trial/pre-creation-metadata.json`。
3. この1マイグレーションだけを適用する。既存会社の登録要求を後付け生成しない。既存の孤立会社を削除/取得/所有者付け替えしない。
4. 関数定義/SECURITY DEFINER・固定search_path・実行ACL、台帳RLSと直接権限拒否、対象4ポリシーを読み取り確認する。架空会社23のデータ指紋が変わっていないことを確認する。本番で登録RPCを試験呼出ししない。

## 異常時

- 先に新規登録を安全停止する。下記の登録用関数1つの置換だけを使用する。既存会社や台帳を削除せず、権限を開かない。
- 台帳が残るため、通信結果が不明な要求を勝手に削除して登録し直さない。調査後、同じ要求ID/同じ入力で確認する。
- アプリだけを旧版へ戻しても、閉じた直接INSERT/孤立会社への操作権限は開かない。旧版の2要求登録は失敗して停止する。脆弱な旧ポリシー4件の自動復元は復旧手順に含めない。
- 修正版の関数本体を適用する場合は、レビュー済みマイグレーションから関数定義とACLだけを取り出す。`CREATE TABLE` を含むマイグレーション全体を再実行しない。
- 台帳の削除/ポリシー再開/別のDB対象が必要なら、理由を示して追加承認を受ける。

安全停止SQL（承認済み登録用関数だけが対象）:

```sql
CREATE OR REPLACE FUNCTION public.create_workspace_company(
  p_request_id uuid, p_values jsonb, p_mode text DEFAULT 'create'
) RETURNS TABLE(request_id uuid, result_status text, company_id integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'company registration temporarily unavailable' USING ERRCODE='55000';
END;
$$;
```

置換は既存の実行ACLを維持する。復旧判断が終わるまで登録・再試行は再開しない。本番業務データの書き込みを伴う復旧試験は行わない。
