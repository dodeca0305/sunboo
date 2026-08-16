import type {
  TaxSourceImpactSummary,
  TaxSourceReviewSummary,
} from './actions';

export default function ImpactSummary({
  impact,
  review,
}: {
  impact?: TaxSourceImpactSummary;
  review?: TaxSourceReviewSummary;
}) {
  if (!review || !impact) {
    return null;
  }

  const hasCandidates =
    impact.ruleCandidates.length > 0 ||
    impact.controlCandidates.length > 0;

  return (
    <section className="mt-5 border-t border-green-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-gray-900">
          影響候補
        </h3>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-gray-600">
          ReviewCase {review.reviewId} / {review.status}
        </span>
      </div>

      <p className="mt-1 text-sm text-gray-600">
        直前版とその祖先版を参照しているルール・
        コントロールです。自動実行はされません。
      </p>

      {!hasCandidates ? (
        <p className="mt-4 rounded-lg bg-white/70 p-3 text-sm text-gray-600">
          影響候補は見つかりませんでした。
        </p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg bg-white/70 p-4">
            <h4 className="text-sm font-semibold text-gray-800">
              TaxRule（{impact.ruleCandidates.length}件）
            </h4>
            {impact.ruleCandidates.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                候補なし
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {impact.ruleCandidates.map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded-md border border-gray-100 bg-white p-3"
                  >
                    <p className="font-mono text-xs font-semibold text-gray-800">
                      {rule.ruleCode}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      ID {rule.id} / Version {rule.versionNo} / {rule.status}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg bg-white/70 p-4">
            <h4 className="text-sm font-semibold text-gray-800">
              TaxControl（{impact.controlCandidates.length}件）
            </h4>
            {impact.controlCandidates.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                候補なし
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {impact.controlCandidates.map(
                  (control) => (
                    <li
                      key={control.id}
                      className="rounded-md border border-gray-100 bg-white p-3"
                    >
                      <p className="font-mono text-xs font-semibold text-gray-800">
                        {control.controlCode}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        ID {control.id} / Version {control.versionNo} / {control.status}
                        {' / '}
                        {control.isEnabled
                          ? 'enabled'
                          : 'disabled'}
                      </p>
                      <p className="mt-1 break-all text-xs text-gray-500">
                        Evaluator: {control.evaluatorKey}
                      </p>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
