'use client';
import { useEffect, useRef, useState } from 'react';
import {
  advanceToConfirm, allDocsChecked, backToDocs, canAdvanceToConfirm, canCompleteFlow,
  initialCompletionFlowState, toggleCompletionConfirm, toggleCompletionDoc,
  type CompletionDocCondition,
} from '@/lib/procedureCompletionFlow';

// 書類準備→提出後の確認→明示完了。チェックは画面内の確認だけで、保存・自動完了はしない。
// 状態は親が付けるkey（画面・会社・手続き・期限・書類条件）が変わると破棄される。
// 保存は onComplete（既存のdone送信1回）だけ。disabled中は全操作を止める。
export default function ProcedureCompletionFlow({
  name, condition, confirmSteps, disabled, focusToken, onComplete,
}: {
  name: string;
  condition: CompletionDocCondition;
  confirmSteps: { title: string; note: string }[];
  disabled: boolean;
  focusToken: number;
  onComplete: () => void;
}) {
  const [state, setState] = useState(initialCompletionFlowState);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const requiredIds = condition.kind === 'ready' ? condition.required.map((d) => d.id) : [];
  const flowOk = condition.kind === 'ready' && confirmSteps.length === 2;

  useEffect(() => {
    if (focusToken > 0) headingRef.current?.focus();
  }, [focusToken]);

  return (
    <section aria-label={`${name}の完了までの確認`} data-testid="completion-flow" className="space-y-3 border-t border-sunboo-mist pt-3">
      <h5 ref={headingRef} tabIndex={-1} className="text-sm font-semibold text-sunboo-ink outline-none focus-visible:underline">
        {state.step === 'docs' || !flowOk ? '書類を用意' : '提出後の確認'}
      </h5>

      {!flowOk ? (
        <p role="status" data-testid="completion-flow-blocked" className="text-sm text-sunboo-ink">
          {condition.kind === 'blocked' && condition.reason === 'no_documents'
            ? '必要書類の登録を確認できないため、この画面からは完了にできません。'
            : condition.kind === 'blocked'
              ? '必須の書類が登録されていないため、この画面からは完了にできません。'
              : '完了の確認項目を確認できないため、この画面からは完了にできません。'}
        </p>
      ) : state.step === 'docs' ? (
        <>
          <fieldset className="space-y-1" disabled={disabled}>
            <legend className="sr-only">必須書類</legend>
            {condition.required.map((d) => (
              <label key={d.id} className="flex min-h-11 cursor-pointer items-start gap-2 py-1.5 text-sm text-sunboo-ink">
                <input
                  type="checkbox" className="mt-0.5 h-5 w-5 shrink-0"
                  checked={state.docs.includes(d.id)}
                  onChange={(e) => setState((s) => toggleCompletionDoc(s, requiredIds, d.id, e.target.checked))}
                />
                <span>{d.name}{d.notes && <span className="text-sunboo-ink-muted">　{d.notes}</span>}</span>
              </label>
            ))}
          </fieldset>
          {condition.optional.length > 0 && (
            <p className="text-xs text-sunboo-ink-muted">任意：{condition.optional.map((d) => d.name).join('、')}（完了の条件ではありません）</p>
          )}
          <p role="status" data-testid="completion-docs-status" className="text-sm text-sunboo-ink">
            {allDocsChecked(state, requiredIds) ? '準備できました' : `${state.docs.length}/${requiredIds.length}件を確認済み`}
          </p>
          <button
            type="button" className="btn-secondary min-h-11"
            disabled={disabled || !canAdvanceToConfirm(state, requiredIds)}
            onClick={() => setState((s) => advanceToConfirm(s, requiredIds))}
          >提出後の確認へ</button>
        </>
      ) : (
        <>
          <fieldset className="space-y-1" disabled={disabled}>
            <legend className="sr-only">提出後の確認</legend>
            {confirmSteps.map((step, i) => (
              <label key={step.title} className="flex min-h-11 cursor-pointer items-start gap-2 py-1.5 text-sm text-sunboo-ink">
                <input
                  type="checkbox" className="mt-0.5 h-5 w-5 shrink-0"
                  checked={state.confirms[i as 0 | 1]}
                  onChange={(e) => setState((s) => toggleCompletionConfirm(s, requiredIds, i as 0 | 1, e.target.checked))}
                />
                <span>{step.title}<span className="block text-xs text-sunboo-ink-muted">{step.note}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary min-h-11" disabled={disabled} onClick={() => setState(backToDocs)}>戻る</button>
            <button
              type="button" className="btn-primary min-h-11"
              disabled={!canCompleteFlow(state, requiredIds, disabled)}
              onClick={onComplete}
            >完了にする</button>
          </div>
        </>
      )}
      <p className="text-xs text-sunboo-ink-muted">
        確認はこの画面を開いている間だけです。再読込や移動で消えます。完了にするまで状態は保存されません。
      </p>
    </section>
  );
}
