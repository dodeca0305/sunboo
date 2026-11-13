'use client';
import { useId, useState } from 'react';
import type { ScheduleProcedure } from '@/lib/scheduleProcedure';
import {
  CONSULT_BUTTON_LABEL, CORPORATE_FILING_CHOICES, corporateDestinationNotice, corporateFilingView,
  isCorporateFilingChoice, type CorporateFilingChoice,
} from '@/lib/corporateFilingChoice';
import RoadmapNextAction from '@/components/RoadmapNextAction';

// 表示の切り替えだけ。選択は保存せず、担当者・状況・分析にも反映しない。
// 呼び出し側が会社/手続き/期限をkeyにして、切り替え時に選択を初期化する。
export default function CorporateTaxNextAction({ procedure }: { procedure: ScheduleProcedure }) {
  const [choice, setChoice] = useState<CorporateFilingChoice | ''>('');
  const id = useId();
  const view = choice ? corporateFilingView(choice, procedure) : null;
  const notice = corporateDestinationNotice(procedure);
  return (
    <section className="space-y-2" aria-label="法人税申告の進め方" data-testid="corporate-filing-choice">
      <label htmlFor={id} className="block text-sm font-semibold text-sunboo-ink">どう進めますか？</label>
      <select
        id={id}
        value={choice}
        onChange={(event) => setChoice(isCorporateFilingChoice(event.target.value) ? event.target.value : '')}
        className="form-select min-h-11 w-full text-sm sm:w-72"
        data-testid="corporate-filing-select"
      >
        <option value="">進め方を選ぶ</option>
        {CORPORATE_FILING_CHOICES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {notice && <p className="text-sm text-sunboo-ink" data-testid="corporate-filing-destination-notice">{notice}</p>}
      <div aria-live="polite" className="space-y-2">
        {view?.kind === 'accountant' && (
          <div className="space-y-1 text-sm text-sunboo-ink" data-testid="corporate-filing-accountant">
            {view.lines.map((line) => <p key={line}>{line}</p>)}
          </div>
        )}
        {view?.kind === 'self' && (view.entry?.state === 'ready' ? (
          <div className="space-y-2" data-testid="electronic-filing-entry">
            <div className="flex flex-wrap gap-2">
              {view.entry.links.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer"
                  className="btn-secondary min-h-11 text-sm">{link.label}</a>
              ))}
            </div>
            <p className="text-sm text-sunboo-ink">{view.entry.note}</p>
            <p className="text-xs text-sunboo-ink-muted">{view.entry.system}の公式サイトを別のタブで開きます。SUNBOOでは送信・支払いを行いません。</p>
          </div>
        ) : (
          <p className="text-sm text-sunboo-ink" data-testid="electronic-filing-unavailable">
            {view.entry?.state === 'missing' ? '電子手続きの入口は未登録です。' : '電子手続きの入口を確認できません。'}
            提出先の公式案内で確認してください。
          </p>
        ))}
        {view?.kind === 'consult' && <RoadmapNextAction procedure={procedure} label={CONSULT_BUTTON_LABEL} heading={false} />}
      </div>
    </section>
  );
}
