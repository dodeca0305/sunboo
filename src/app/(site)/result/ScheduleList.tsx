'use client';

import { useEffect, useState } from 'react';
import type { ProcedureCategory, LinkStatus } from '@/lib/types';
import { Building2, ChevronDown, ExternalLink, AlertTriangle, Check } from 'lucide-react';
import ProcedureDetailExtra, { type ProcedureDocumentItem } from '@/components/ProcedureDetailExtra';

export type ScheduleProcedure = {
  id: number;
  name: string;
  description: string;
  category: ProcedureCategory;
  timing_label: string;
  next_deadline: string | null;
  next_deadline_date: string | null;
  office: { name: string } | null;
  official_links: { label: string; url: string; status?: LinkStatus; fallback_url?: string | null }[];
  procedure_documents?: ProcedureDocumentItem[];
  target_note?: string | null;
  submission_method?: string | null;
  e_filing_system_name?: string | null;
  e_filing_system_url?: string | null;
  caution_note?: string | null;
};

const CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  tax: '税務',
  labor: '労務',
  insurance: '社保',
  registration: '登録',
  legal: '法務・登記',
  other: 'その他',
};

const STORAGE_KEY = 'sunboo:completed-procedures';

function loadCompleted(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as number[]) : [];
  } catch {
    return [];
  }
}

function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function RemainingBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) {
    return <span className="text-xs font-medium text-red-600">期限超過</span>;
  }
  if (days === 0) {
    return <span className="text-xs font-medium text-blue-600">本日締切</span>;
  }
  return (
    <span className={`text-xs font-medium ${days <= 14 ? 'text-blue-600' : 'text-gray-500'}`}>
      あと{days}日
    </span>
  );
}

function ProcedureLink({ link }: { link: ScheduleProcedure['official_links'][number] }) {
  const s = link.status ?? 'unchecked';
  const href = s === 'broken' ? (link.fallback_url ?? link.url) : link.url;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs"
    >
      {s === 'broken' && <AlertTriangle className="h-3 w-3 text-red-600" />}
      {link.label}
      {s !== 'broken' && <ExternalLink className="h-3 w-3" />}
      {s === 'unchecked' && <span className="ml-0.5 text-[10px] text-gray-400">（未確認）</span>}
    </a>
  );
}

export default function ScheduleList({ procedures }: { procedures: ScheduleProcedure[] }) {
  const [completed, setCompleted] = useState<number[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setCompleted(loadCompleted());
  }, []);

  function toggleCompleted(id: number) {
    setCompleted((prev) => {
      const next = prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  const sorted = [...procedures].sort((a, b) => {
    if (a.next_deadline_date && b.next_deadline_date) {
      return a.next_deadline_date.localeCompare(b.next_deadline_date);
    }
    if (a.next_deadline_date) return -1;
    if (b.next_deadline_date) return 1;
    return 0;
  });

  return (
    <div className="card divide-y divide-gray-100 p-0">
      {sorted.map((proc) => {
        const isDone = completed.includes(proc.id);
        const isExpanded = expandedId === proc.id;
        const days = daysRemaining(proc.next_deadline_date);

        return (
          <div key={proc.id} className="px-5 py-4">
            <div className="flex items-start gap-3 sm:items-center">
              <button
                type="button"
                onClick={() => toggleCompleted(proc.id)}
                aria-pressed={isDone}
                aria-label={isDone ? '完了を取り消す' : '完了にする'}
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors sm:mt-0 ${
                  isDone ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white hover:border-gray-400'
                }`}
              >
                {isDone && <Check className="h-3.5 w-3.5 text-white" />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3
                    className={`text-sm font-semibold ${
                      isDone ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}
                  >
                    {proc.name}
                  </h3>
                  <span className="tag">{CATEGORY_LABEL[proc.category] ?? 'その他'}</span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                  {proc.office && (
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      {proc.office.name}
                    </span>
                  )}
                  <span>{proc.next_deadline ?? proc.timing_label}</span>
                  <RemainingBadge days={days} />
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : proc.id)}
                className="ml-2 flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
              >
                詳細を見る
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isExpanded && (
              <div className="mt-3 border-t border-gray-100 pt-3 pl-8">
                {proc.description && (
                  <p className="text-xs leading-relaxed text-gray-500">{proc.description}</p>
                )}
                {proc.official_links.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {proc.official_links.map((link, idx) => (
                      <ProcedureLink key={idx} link={link} />
                    ))}
                  </div>
                )}
                <ProcedureDetailExtra
                  targetNote={proc.target_note}
                  submissionMethod={proc.submission_method}
                  documents={proc.procedure_documents}
                  eFilingSystemName={proc.e_filing_system_name}
                  eFilingSystemUrl={proc.e_filing_system_url}
                  cautionNote={proc.caution_note}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
