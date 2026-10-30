'use client';

import { useActionState } from 'react';
import { runTaxControlAction, type EvaluationActionState } from './actions';

export default function ExecutionPanel({ companyId, controls, loadError }: {
  companyId: number;
  controls: Array<{ id: number; title: string }>;
  loadError: boolean;
}) {
  const [state, action, pending] = useActionState<EvaluationActionState, FormData>(runTaxControlAction, { status: 'idle', message: '' });
  return (
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">税務チェックを実行</h2>
      <p className="text-sm text-gray-600">登録済みの会社情報・申告情報を使って評価します。実行ごとに結果を保存し、確認が必要な場合はレビューを追加します。</p>
      {loadError ? <p role="alert">チェック一覧を取得できませんでした。再読み込みしてください。</p> : controls.length === 0 ? (
        <p className="text-sm">実行できる承認済みの税務チェックはありません。チェックと根拠ルールの承認・有効化状況を確認してください。</p>
      ) : (
        <form action={action} className="space-y-3">
          <input type="hidden" name="companyId" value={companyId} />
          <label className="block text-sm">税務チェック
            <select name="taxControlId" className="mt-1 block w-full rounded border p-2" disabled={pending}>
              {controls.map(control => <option key={control.id} value={control.id}>{control.title}</option>)}
            </select>
          </label>
          <label className="block text-sm">清算中の残余財産確定に関する特則
            <select name="liquidationResidualAssetsCase" defaultValue="unknown" className="mt-1 block w-full rounded border p-2" disabled={pending}>
              <option value="unknown">未確認・わからない</option>
              <option value="not_applicable">該当しないことを確認済み</option>
              <option value="applicable">該当する</option>
            </select>
          </label>
          <p className="text-xs text-gray-600">未確認の場合は推測せず、判定不能として確認対象にします。</p>
          <button type="submit" className="btn-primary" disabled={pending}>{pending ? '評価中…' : '評価して保存'}</button>
        </form>
      )}
      {state.message && <p role={state.status === 'error' ? 'alert' : 'status'} className="text-sm">{state.message}</p>}
    </section>
  );
}
