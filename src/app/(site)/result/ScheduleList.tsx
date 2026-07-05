'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ProcedureCategory } from '@/lib/types';
import type { ProcedureStatus, ScheduleProcedure } from '@/lib/scheduleProcedure';
import {
  buildAdviserComment, buildAdviserSummary, buildLookaheadComment, buildRiskEntries,
  bucketOf, daysRemaining, type AdviserRecommendation, type RiskEntry,
} from '@/lib/adviserScore';
import {
  Building2, ChevronDown, ExternalLink, AlertTriangle, Check,
  MapPin, Send, Sun, CalendarDays, CalendarRange, Calendar, Star, Sparkles, MessageSquareText, CalendarClock, ShieldAlert,
} from 'lucide-react';
import ProcedureDetailExtra from '@/components/ProcedureDetailExtra';

export type { ProcedureStatus } from '@/lib/scheduleProcedure';
export type { ScheduleProcedure } from '@/lib/scheduleProcedure';

const CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  tax: '税務',
  labor: '労務',
  insurance: '社保',
  registration: '登録',
  legal: '法務・登記',
  other: 'その他',
};

const STATUS_ORDER: ProcedureStatus[] = ['not_started', 'in_progress', 'done'];

const STATUS_LABEL: Record<ProcedureStatus, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  done: '完了',
};

function nextStatus(current: ProcedureStatus): ProcedureStatus {
  const idx = STATUS_ORDER.indexOf(current);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

const STATUS_KEY = 'sunboo:procedure-status';
// 旧バージョン（完了/未完了の2値のみ）からの移行用
const LEGACY_COMPLETED_KEY = 'sunboo:completed-procedures';

function loadStatusMap(): Record<number, ProcedureStatus> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STATUS_KEY);
    if (raw) return JSON.parse(raw) as Record<number, ProcedureStatus>;

    const legacyRaw = window.localStorage.getItem(LEGACY_COMPLETED_KEY);
    if (legacyRaw) {
      const legacyIds = JSON.parse(legacyRaw) as number[];
      const migrated: Record<number, ProcedureStatus> = {};
      legacyIds.forEach((id) => {
        migrated[id] = 'done';
      });
      window.localStorage.setItem(STATUS_KEY, JSON.stringify(migrated));
      window.localStorage.removeItem(LEGACY_COMPLETED_KEY);
      return migrated;
    }
  } catch {
    return {};
  }
  return {};
}

function RemainingBadge({ days }: { days: number | null }) {
  if (days === null) {
    return <span className="text-xs font-medium text-gray-400">期限なし</span>;
  }
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

type UrgencyBucket = 'today' | 'week' | 'month' | 'later';

const BUCKET_LABEL: Record<UrgencyBucket, string> = {
  today: '今日やること',
  week: '今週やること',
  month: '今月やること',
  later: '今後予定',
};

const BUCKET_ICON: Record<UrgencyBucket, typeof Sun> = {
  today: Sun,
  week: CalendarDays,
  month: CalendarRange,
  later: Calendar,
};

const BUCKET_ORDER: UrgencyBucket[] = ['today', 'week', 'month', 'later'];

function StatusButton({ status, onClick }: { status: ProcedureStatus; onClick: () => void }) {
  const isDone = status === 'done';
  const isInProgress = status === 'in_progress';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`ステータス: ${STATUS_LABEL[status]}（クリックで変更）`}
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors sm:mt-0 ${
        isDone
          ? 'border-blue-600 bg-blue-600'
          : isInProgress
            ? 'border-blue-600 bg-white'
            : 'border-gray-300 bg-white hover:border-gray-400'
      }`}
    >
      {isDone && <Check className="h-3.5 w-3.5 text-white" />}
      {isInProgress && <span className="h-2 w-2 rounded-full bg-blue-600" />}
    </button>
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

function ProcedureRow({
  proc,
  status,
  onCycleStatus,
  isExpanded,
  onToggleExpand,
}: {
  proc: ScheduleProcedure;
  status: ProcedureStatus;
  onCycleStatus: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) {
  const isDone = status === 'done';
  const isInProgress = status === 'in_progress';
  const days = daysRemaining(proc.next_deadline_date);
  const mapUrl = proc.office?.map_url ?? null;

  return (
    <div className="px-5 py-4">
      <div className="flex items-start gap-3 sm:items-center">
        <StatusButton status={status} onClick={onCycleStatus} />

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
            {isInProgress && <span className="tag border-blue-200 text-blue-600">進行中</span>}
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
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 pl-8">
        {mapUrl && (
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
          >
            <MapPin className="h-3 w-3" />
            地図
          </a>
        )}
        {proc.e_filing_system_url && (
          <a
            href={proc.e_filing_system_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs"
          >
            <Send className="h-3 w-3" />
            電子申請
          </a>
        )}
        <button
          type="button"
          onClick={onToggleExpand}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
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
}

function StarRating({ stars }: { stars: 1 | 2 | 3 | 4 | 5 }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`優先度 ${stars} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${n <= stars ? 'fill-blue-600 text-blue-600' : 'text-gray-200'}`}
        />
      ))}
    </div>
  );
}

function AdviserRecommendationCard({ rec }: { rec: AdviserRecommendation }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StarRating stars={rec.stars} />
        <span className="tag border-blue-200 text-blue-600">{rec.label}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-gray-900">{rec.procedure.name}</p>
      {rec.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
          {rec.reasons.map((reason, idx) => (
            <li key={idx}>・{reason}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

const RISK_STYLE: Record<RiskEntry['severity'], { border: string; icon: string }> = {
  overdue: { border: 'border-red-200', icon: 'text-red-600' },
  soon: { border: 'border-amber-200', icon: 'text-amber-600' },
  watch: { border: 'border-amber-100', icon: 'text-amber-500' },
};

function RiskSection({ risks }: { risks: RiskEntry[] }) {
  if (risks.length === 0) return null;
  return (
    <div className="mt-2 rounded-lg border border-gray-100 bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">注意すべきリスク</p>
      <ul className="mt-1.5 space-y-2">
        {risks.map((risk) => {
          const style = RISK_STYLE[risk.severity];
          return (
            <li key={risk.procedure.id} className={`flex items-start gap-2 rounded-md border ${style.border} px-3 py-2`}>
              <ShieldAlert className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${style.icon}`} />
              <p className="text-xs leading-relaxed text-gray-700">
                <span className="font-semibold text-gray-900">{risk.procedure.name}</span>：{risk.message}
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function AdviserCard({
  recommendations,
  incompleteCount,
  comment,
  lookahead,
  risks,
}: {
  recommendations: AdviserRecommendation[];
  incompleteCount: number;
  comment: string;
  lookahead: string | null;
  risks: RiskEntry[];
}) {
  if (recommendations.length === 0 && !comment && !lookahead && risks.length === 0) return null;

  return (
    <div className="card border-blue-100 bg-blue-50/40">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-500">
          AI参謀
        </p>
      </div>

      {comment && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-blue-100 bg-white px-4 py-3">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <p className="text-sm font-medium leading-relaxed text-gray-900">{comment}</p>
        </div>
      )}

      {lookahead && (
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-gray-100 bg-white px-4 py-3">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">次に来る予定</p>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-700">{lookahead}</p>
          </div>
        </div>
      )}

      <RiskSection risks={risks} />

      {recommendations.length > 0 && (
        <>
          <p className="mt-4 text-xs text-gray-500">
            未着手・進行中の{incompleteCount}件から、優先度が高い手続きを選びました
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {recommendations.map((rec) => (
              <AdviserRecommendationCard key={rec.procedure.id} rec={rec} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ScheduleList({ procedures }: { procedures: ScheduleProcedure[] }) {
  const [statusMap, setStatusMap] = useState<Record<number, ProcedureStatus>>({});
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setStatusMap(loadStatusMap());
  }, []);

  function cycleStatus(id: number) {
    setStatusMap((prev) => {
      const current = prev[id] ?? 'not_started';
      const updated = { ...prev, [id]: nextStatus(current) };
      window.localStorage.setItem(STATUS_KEY, JSON.stringify(updated));
      return updated;
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

  const buckets: Record<UrgencyBucket, ScheduleProcedure[]> = {
    today: [],
    week: [],
    month: [],
    later: [],
  };
  sorted.forEach((proc) => {
    buckets[bucketOf(daysRemaining(proc.next_deadline_date))].push(proc);
  });

  const total = procedures.length;
  const doneCount = procedures.filter((p) => statusMap[p.id] === 'done').length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const adviser = useMemo(
    () => buildAdviserSummary(procedures, statusMap),
    [procedures, statusMap],
  );
  const adviserComment = useMemo(
    () => buildAdviserComment(procedures, statusMap),
    [procedures, statusMap],
  );
  const lookaheadComment = useMemo(
    () => buildLookaheadComment(procedures, statusMap),
    [procedures, statusMap],
  );
  const riskEntries = useMemo(
    () => buildRiskEntries(procedures, statusMap),
    [procedures, statusMap],
  );

  return (
    <div className="space-y-8">
      <AdviserCard
        recommendations={adviser.recommendations}
        incompleteCount={adviser.incompleteCount}
        comment={adviserComment}
        risks={riskEntries}
        lookahead={lookaheadComment}
      />

      <div className="card">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          手続き完了率
        </p>
        <div className="mt-2 flex items-end gap-3">
          <span className="text-3xl font-bold text-gray-900">{pct}%</span>
          <span className="pb-1 text-sm text-gray-500">
            {total}件中{doneCount}件完了
          </span>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-blue-50">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {BUCKET_ORDER.map((bucket) => {
        const items = buckets[bucket];
        if (items.length === 0) return null;
        const Icon = BUCKET_ICON[bucket];
        return (
          <section key={bucket}>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-gray-900">
              <Icon className="h-4 w-4 text-gray-400" />
              {BUCKET_LABEL[bucket]}
              <span className="font-normal text-gray-400">（{items.length}件）</span>
            </h3>
            <div className="card divide-y divide-gray-100 p-0">
              {items.map((proc) => (
                <ProcedureRow
                  key={proc.id}
                  proc={proc}
                  status={statusMap[proc.id] ?? 'not_started'}
                  onCycleStatus={() => cycleStatus(proc.id)}
                  isExpanded={expandedId === proc.id}
                  onToggleExpand={() => setExpandedId(expandedId === proc.id ? null : proc.id)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
