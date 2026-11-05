import { Building2, FileText, ShieldAlert } from 'lucide-react';

export default function WorkspaceShareScopeSettings({
  includeTaxReturns,
  disabled,
  pending,
  onChange,
}: {
  includeTaxReturns: boolean;
  disabled: boolean;
  pending: boolean;
  onChange: (included: boolean) => void;
}) {
  return (
    <section aria-labelledby="share-scope-heading" className="card space-y-4 p-4 sm:p-5">
      <h2 id="share-scope-heading" className="text-base font-bold">
        {pending ? '確認中のリンクの公開範囲' : '新しいリンクの公開範囲'}
      </h2>

      <div className="rounded-xl border border-sky-200 border-l-4 border-l-sky-500 bg-sky-50 p-4 text-sm text-slate-900">
        <h3 className="mb-2 flex items-center gap-2 font-semibold text-sky-900">
          <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          いつも共有する情報
        </h3>
        <ul className="list-disc space-y-1 pl-5 leading-relaxed">
          <li>会社プロフィール（会社名・所在地・資本金・従業員数など）</li>
          <li>手続きの対応状況</li>
        </ul>
      </div>

      <div className={`rounded-xl border-2 p-4 text-sm text-slate-900 ${includeTaxReturns ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
          追加で共有する情報（任意）
        </h3>
        <label htmlFor="share-include-tax-returns" className="flex items-start gap-3 font-semibold">
          <input
            id="share-include-tax-returns"
            type="checkbox"
            checked={includeTaxReturns}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
            aria-describedby="share-financial-warning share-roadmap-effect"
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
          />
          決算実績も共有する
        </label>
        <p id="share-financial-warning" className="mt-2 leading-relaxed">
          選ぶと、<strong>税額を含む決算実績</strong>も相手が閲覧できます。
        </p>
        <div className="mt-3 space-y-2 border-t border-slate-200 pt-3" aria-live="polite">
          <p className="font-semibold">
            決算実績：{includeTaxReturns ? '共有する' : '共有しない'}
          </p>
          <p id="share-roadmap-effect" className="leading-relaxed">
            {includeTaxReturns
              ? '共有先の予定の算出にも、決算実績を使います。'
              : '共有先では会社概要を確認できます。決算実績は非公開のため、手続きの予定は保留になります。'}
          </p>
        </div>
      </div>

      <aside aria-labelledby="share-link-warning" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <h3 id="share-link-warning" className="mb-2 flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          リンクを渡す相手に注意
        </h3>
        <p className="leading-relaxed"><strong>リンクを知る人は、ログインなしで閲覧できます。</strong>編集はできません。</p>
        <p className="mt-1 leading-relaxed">必要な相手にだけ渡し、不要になったら「失効させる」で無効にしてください。</p>
      </aside>
      <p className="text-sm leading-relaxed text-slate-600">
        {pending ? '前回の発行条件で結果を確認します。発行済みの別のリンクは変わりません。' : 'この設定は、新しく発行するリンクだけに適用されます。発行済みのリンクは変わりません。'}
      </p>
    </section>
  );
}
