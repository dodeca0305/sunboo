'use client';
import { TAX_TRIAL_SCOPE } from '@/lib/trialActionGuide';
import TaxReviewActionPicker from '@/components/TaxReviewActionPicker';
import { useEffect, useRef, useState } from 'react';
import { runTaxControlAction, type EvaluationActionState } from './actions';
import {
  validPendingExecution,
  type PendingExecution,
} from '@/lib/taxIntelligence/executionRecovery';
export default function ExecutionPanel({
  companyId,
  actor,
  controls,
  loadError,
}: {
  companyId: number;
  actor: string;
  controls: Array<{ id: number; title: string }>;
  loadError: boolean;
}) {
  const key = `sunboo:tax-execution:v1:${actor}:${companyId}`;
  const [intent, setIntent] = useState<PendingExecution | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [state, setState] = useState<EvaluationActionState | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(key);
        if (raw) {
          const value: unknown = JSON.parse(raw);
          if (!validPendingExecution(value, companyId)) throw Error();
          setIntent(value);
          setState({
            status: 'unknown',
            message:
              '前の実行の保存結果を確認してください。確認が終わるまで新しい評価を停止します。',
          });
        }
        setReady(true);
      } catch {
        setStorageError(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, companyId]);
  async function send(pending: PendingExecution, mode: 'execute' | 'verify') {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      // Persist before sending. Lost responses and reloads retain the same identity.
      sessionStorage.setItem(key, JSON.stringify(pending));
      setIntent(pending);
      let result: EvaluationActionState;
      try {
        result = await runTaxControlAction(pending, mode);
      } catch {
        result = {
          status: 'unknown',
          message: '応答を取得できません。再送せず保存結果を確認してください。',
        };
      }
      setState(result);
      if (result.status === 'success') {
        sessionStorage.removeItem(key);
        setIntent(null);
      }
    } catch {
      setStorageError(true);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const blocked =
    !ready || storageError || busy || loadError || intent !== null;
  return (
    <section className="card space-y-3 border border-blue-200 bg-blue-50 p-5">
      <h2 className="font-semibold text-blue-950">新しく税金のチェックをする</h2>
      <p className="text-sm text-sunboo-ink-muted">対象：法人税申告の基本的な提出時期。税額の計算や申告は行いません。</p>
      <details className="rounded-lg border border-blue-200 bg-white p-3" data-testid="tax-execution-details">
      <summary className="cursor-pointer text-sm font-medium">対象・必要な入力を確認して進む</summary>
        <div className="mt-4">
          <TaxReviewActionPicker
            companyId={companyId}
            canEdit
            consultationSubject="法人税申告の提出時期を確認したい"
            execution={
              <div className="space-y-3">
                <p className="text-sm">使う情報：直近1件の事業年度末日・申告日</p>
                <p className="text-xs text-sunboo-ink-muted">基本の提出時期だけを確認します。延長などの個別判断は対象外です。</p>
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">実績なし・情報不足は「問題なし」ではありません。</p>
                {loadError ? <p>一覧の再取得が必要です。</p> : controls.length === 0 ? <p>実行できる承認済みの税務チェックはありません。</p> : (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (blocked) return;
            const data = new FormData(event.currentTarget);
            const pending: PendingExecution = {
              executionId: crypto.randomUUID(),
              intent: {
                companyId,
                taxControlId: Number(data.get('taxControlId')),
                asOfDate: new Intl.DateTimeFormat('sv-SE', {
                  timeZone: 'Asia/Tokyo',
                }).format(new Date()),
                liquidationResidualAssetsCase: data.get(
                  'liquidationResidualAssetsCase',
                ) as PendingExecution['intent']['liquidationResidualAssetsCase'],
              },
            };
            void send(pending, 'execute');
          }}
        >
          <label className="block text-sm">
            税務チェック
            <select
              name="taxControlId"
              className="form-select mt-1 block w-full"
              disabled={blocked}
            >
              {controls.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            清算中の残余財産確定に関する特則
            <select
              name="liquidationResidualAssetsCase"
              defaultValue="unknown"
              className="form-select mt-1 block w-full"
              disabled={blocked}
            >
              <option value="unknown">未確認・わからない</option>
              <option value="not_applicable">該当しないことを確認済み</option>
              <option value="applicable">該当する</option>
            </select>
          </label>
          <p className="text-xs text-gray-600">
            未確認の場合は推測せず、判定不能として確認対象にします。
          </p>
          <button type="submit" className="btn-primary" disabled={blocked}>
            {busy ? '確認中…' : '評価して保存'}
          </button>
        </form>
                )}
              </div>
            }
          >
            <div className="space-y-2 text-sm" aria-label="税務チェックの対象と必要入力">
              <h3 className="font-semibold">{TAX_TRIAL_SCOPE.title}</h3>
              <p>{TAX_TRIAL_SCOPE.scope}</p>
              <p className="font-medium">必要な入力・確認</p>
              <ul className="list-disc pl-5">
                {TAX_TRIAL_SCOPE.inputs.map((input) => <li key={input}>{input}</li>)}
              </ul>
              <p>{TAX_TRIAL_SCOPE.outcomes}</p>
              <p>結果の確認・最終判断は担当者と専門家が行ってください。</p>
            </div>
          </TaxReviewActionPicker>
        </div>
      </details>
      {loadError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">チェック一覧を取得できません。実行を停止しています。</p>}
      {storageError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">実行要求の記録を確認できません。安全に保存できないため実行を停止しています。</p>}
      {intent && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-950">
          <p className="text-sm">
            保存結果の確認が終わるまで、新しい評価はできません。
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || storageError}
            onClick={() => void send(intent, 'verify')}
          >
            保存結果を確認
          </button>
          {state?.status === 'missing' && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || storageError || loadError}
              onClick={() => void send(intent, 'execute')}
            >
              同じ実行IDで再試行
            </button>
          )}
        </div>
      )}
      {(loadError ||
        state?.status === 'error' ||
        state?.status === 'unknown' ||
        storageError) && (
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => window.location.reload()}
        >
          再読み込み
        </button>
      )}
      {state?.message && (
        <p
          role={
            ['error', 'unknown'].includes(state.status) ? 'alert' : 'status'
          }
          className="text-sm"
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
