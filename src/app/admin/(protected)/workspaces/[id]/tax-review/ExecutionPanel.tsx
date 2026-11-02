"use client";
import { useEffect, useRef, useState } from "react";
import { runTaxControlAction, type EvaluationActionState } from "./actions";
import {
  validPendingExecution,
  type PendingExecution,
} from "@/lib/taxIntelligence/executionRecovery";
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
            status: "unknown",
            message:
              "前の実行の保存結果を確認してください。確認が終わるまで新しい評価を停止します。",
          });
        }
        setReady(true);
      } catch {
        setStorageError(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key, companyId]);
  async function send(pending: PendingExecution, mode: "execute" | "verify") {
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
          status: "unknown",
          message: "応答を取得できません。再送せず保存結果を確認してください。",
        };
      }
      setState(result);
      if (result.status === "success") {
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
    <section className="card space-y-3 p-5">
      <h2 className="font-semibold">税務チェックを実行</h2>
      <p className="text-sm text-gray-600">
        必要な会社情報・実績・根拠を取得してから評価結果を保存します。確認が必要な場合はレビューを追加します。
      </p>
      {storageError && (
        <p role="alert">
          実行要求の記録を確認できません。安全に保存できないため実行を停止しています。
        </p>
      )}
      {loadError ? (
        <p role="alert">チェック一覧を取得できません。</p>
      ) : controls.length === 0 ? (
        <p>実行できる承認済みの税務チェックはありません。</p>
      ) : (
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
                taxControlId: Number(data.get("taxControlId")),
                asOfDate: new Intl.DateTimeFormat("sv-SE", {
                  timeZone: "Asia/Tokyo",
                }).format(new Date()),
                liquidationResidualAssetsCase: data.get(
                  "liquidationResidualAssetsCase",
                ) as PendingExecution["intent"]["liquidationResidualAssetsCase"],
              },
            };
            void send(pending, "execute");
          }}
        >
          <label className="block text-sm">
            税務チェック
            <select
              name="taxControlId"
              className="mt-1 block w-full rounded border p-2"
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
              className="mt-1 block w-full rounded border p-2"
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
            {busy ? "確認中…" : "評価して保存"}
          </button>
        </form>
      )}
      {intent && (
        <div className="space-x-3">
          <p className="text-sm">
            保存結果の確認が終わるまで、新しい評価はできません。
          </p>
          <button
            type="button"
            className="btn-secondary"
            disabled={busy || storageError}
            onClick={() => void send(intent, "verify")}
          >
            保存結果を確認
          </button>
          {state?.status === "missing" && (
            <button
              type="button"
              className="btn-primary"
              disabled={busy || storageError || loadError}
              onClick={() => void send(intent, "execute")}
            >
              同じ実行IDで再試行
            </button>
          )}
        </div>
      )}
      {(loadError ||
        state?.status === "error" ||
        state?.status === "unknown" ||
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
            ["error", "unknown"].includes(state.status) ? "alert" : "status"
          }
          className="text-sm"
        >
          {state.message}
        </p>
      )}
    </section>
  );
}
