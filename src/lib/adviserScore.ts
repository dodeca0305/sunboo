import type { ProcedureStatus, ScheduleProcedure } from './scheduleProcedure';

// ── AI参謀（Phase 3.1 MVP）───────────────────────────────────
// 期限・イベント由来・提出先の重複・ステータスから優先度を決定的に算出する。
// LLM呼び出しは行わない（ルールエンジン・診断エンジンが既に確定させたデータのみを材料にする）。

export type UrgencyBucket = 'today' | 'week' | 'month' | 'later';

export function daysRemaining(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function bucketOf(days: number | null): UrgencyBucket {
  if (days === null) return 'later';
  if (days <= 0) return 'today';
  if (days <= 7) return 'week';
  if (days <= 30) return 'month';
  return 'later';
}

// procedures.timing_type のうち、経営イベントエンジン（anonymous_company_events.event_date）から
// 実際の起算日が供給されて初めて期限計算が成立する種別。診断エンジン単体では null になる
// （src/lib/diagnosis.ts の calculateNextDeadline 参照）ため、値が入っている＝イベント由来の証跡になる。
const EVENT_ORIGIN_TIMING_TYPES = new Set(['at_establishment', 'hiring_event', 'event_based']);

export type AdviserRecommendation = {
  procedure: ScheduleProcedure;
  stars: 1 | 2 | 3 | 4 | 5;
  label: string;
  reasons: string[];
};

export type AdviserSummary = {
  recommendations: AdviserRecommendation[];
  incompleteCount: number;
};

const BUCKET_LABEL: Record<UrgencyBucket, string> = {
  today: '今日中',
  week: '今週中',
  month: '今月中',
  later: '早めの着手がおすすめ',
};

function toStars(score: number): 1 | 2 | 3 | 4 | 5 {
  if (score >= 80) return 5;
  if (score >= 60) return 4;
  if (score >= 40) return 3;
  if (score >= 20) return 2;
  return 1;
}

// AdviserCard は上位N件（＝推奨する手続き）しか表示しないため、bucket が 'later'
// （期限未定）であっても「対応不要」という意味の文言にはしない（推奨と矛盾するため）。
function toLabel(bucket: UrgencyBucket, isTopPick: boolean): string {
  if (isTopPick && (bucket === 'today' || bucket === 'week')) {
    return bucket === 'today' ? '今日最優先' : '今週最優先';
  }
  return BUCKET_LABEL[bucket];
}

export function buildAdviserSummary(
  procedures: ScheduleProcedure[],
  statusMap: Record<number, ProcedureStatus>,
  topN = 3,
): AdviserSummary {
  const pending = procedures.filter((p) => (statusMap[p.id] ?? 'not_started') !== 'done');

  const officeCounts = new Map<string, number>();
  pending.forEach((p) => {
    if (p.office) officeCounts.set(p.office.name, (officeCounts.get(p.office.name) ?? 0) + 1);
  });

  const scored = pending.map((p) => {
    const status = statusMap[p.id] ?? 'not_started';
    const days = daysRemaining(p.next_deadline_date);
    const bucket = bucketOf(days);
    const reasons: string[] = [];
    let score = 0;

    // ① 期限（最大50点）
    if (days !== null) {
      if (days < 0) {
        score += 50;
        reasons.push('期限を超過しています');
      } else if (days === 0) {
        score += 48;
        reasons.push('本日が期限です');
      } else if (days <= 7) {
        score += 45 - (days - 1) * 2;
        reasons.push(`期限まで${days}日`);
      } else if (days <= 30) {
        score += Math.max(10, 25 - Math.floor((days - 7) / 2));
        reasons.push(`期限まで${days}日`);
      } else {
        score += 5;
      }
    } else {
      score += 3;
    }

    // ② イベント由来（15点）
    if (EVENT_ORIGIN_TIMING_TYPES.has(p.timing_type)) {
      score += 15;
      reasons.push('会社設立・従業員採用などのイベント由来');
    }

    // ③ 行政機関（同じ提出先の未完了手続きが他にあるか、最大10点）
    const officeCount = p.office ? (officeCounts.get(p.office.name) ?? 0) : 0;
    if (officeCount >= 2) {
      score += 10;
      reasons.push(`${p.office!.name}への手続きが他に${officeCount - 1}件あります`);
    }

    // ④ ステータス（未着手20点・進行中8点）
    if (status === 'not_started') {
      score += 20;
      reasons.push('未提出');
    } else if (status === 'in_progress') {
      score += 8;
      reasons.push('進行中');
    }

    return { procedure: p, score, bucket, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  const recommendations: AdviserRecommendation[] = scored.slice(0, topN).map((s, idx) => ({
    procedure: s.procedure,
    stars: toStars(s.score),
    label: toLabel(s.bucket, idx === 0),
    reasons: s.reasons,
  }));

  return { recommendations, incompleteCount: pending.length };
}
