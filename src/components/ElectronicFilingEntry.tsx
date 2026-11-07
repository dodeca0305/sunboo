import type { ScheduleProcedure } from '@/lib/scheduleProcedure';
import { electronicFilingEntry } from '@/lib/electronicFilingEntry';

export default function ElectronicFilingEntry({ procedure }: { procedure: ScheduleProcedure }) {
  const entry = electronicFilingEntry(procedure);
  if (!entry) return null;
  if (entry.state !== 'ready') return <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600" data-testid="electronic-filing-unavailable">
    {entry.state === 'missing' ? '電子手続きの入口は未登録です。' : '電子手続きの入口を確認できません。'}
    提出先の公式案内で確認してください。
  </p>;
  return <section aria-label={`${entry.system}の手続きの入口`} data-testid="electronic-filing-entry"
    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
    <p className="font-semibold text-slate-900">オンラインで進める（{entry.system}）</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-600">{entry.note}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {entry.links.map(link => <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
        className="btn-secondary min-h-11 text-xs">{link.label}</a>)}
    </div>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">提出先と必要な準備を確認してから進めてください。公式サイトを別タブで開きます。SUNBOOでは送信・支払いを行いません。</p>
  </section>;
}
