'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  CheckCircle2,
  Database,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

import ImpactSummary from './ImpactSummary';

import {
  ingestCurrentEgovAction,
  type TaxSourceIngestionActionState,
} from './actions';

const INITIAL_TAX_SOURCE_INGESTION_STATE: TaxSourceIngestionActionState = {
  status: 'idle',
  message: '',
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
    >
      <RefreshCw
        className={`h-4 w-4 ${
          pending ? 'animate-spin' : ''
        }`}
      />
      {pending
        ? 'e-Govを確認中…'
        : 'e-Gov最新版を確認・取り込み'}
    </button>
  );
}

export default function IngestionPanel() {
  const [state, formAction] = useActionState(
    ingestCurrentEgovAction,
    INITIAL_TAX_SOURCE_INGESTION_STATE,
  );

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <Database className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold text-gray-900">
              法人税法 第74条〜第75条の3
            </h2>
            <p className="mt-1 text-sm leading-6 text-gray-500">
              e-Gov法令APIから現在版を取得し、内容が変わった場合だけ
              SourceVersionを追加します。
            </p>
          </div>
        </div>

        <form action={formAction} className="mt-5">
          <SubmitButton />
        </form>
      </div>

      {state.status !== 'idle' && (
        <div
          className={`card border p-5 ${
            state.status === 'success'
              ? 'border-green-200 bg-green-50'
              : 'border-red-200 bg-red-50'
          }`}
        >
          <div className="flex items-start gap-3">
            {state.status === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            ) : (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
            )}

            <div className="min-w-0">
              <p
                className={`font-semibold ${
                  state.status === 'success'
                    ? 'text-green-800'
                    : 'text-red-800'
                }`}
              >
                {state.message}
              </p>

              {state.status === 'success' && (
                <>
                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-gray-500">改正ID</dt>
                    <dd className="mt-1 break-all font-mono text-xs text-gray-800">
                      {state.revisionId}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">
                      SourceVersion ID
                    </dt>
                    <dd className="mt-1 font-medium text-gray-800">
                      {state.taxSourceVersionId}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">
                      Content hash
                    </dt>
                    <dd className="mt-1 break-all font-mono text-xs text-gray-800">
                      {state.contentHash}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">処理結果</dt>
                    <dd className="mt-1 font-medium text-gray-800">
                      {state.wasInserted
                        ? '新版を登録'
                        : '既存版と同一'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">前版ID</dt>
                    <dd className="mt-1 font-medium text-gray-800">
                      {state.supersedesVersionId ?? 'なし'}
                    </dd>
                  </div>
                </dl>

              <ImpactSummary
                impact={state.impact}
                wasInserted={state.wasInserted}
              />
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
