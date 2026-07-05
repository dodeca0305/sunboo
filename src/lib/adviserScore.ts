import type { ProcedureCategory } from '@/lib/types';
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

type ScoredProcedure = {
  procedure: ScheduleProcedure;
  score: number;
  bucket: UrgencyBucket;
  days: number | null;
  status: ProcedureStatus;
  reasons: string[];
};

// buildAdviserSummary（優先度カード）・buildAdviserComment（参謀コメント）共通のスコアリング。
// 期限・イベント由来・提出先の重複・ステータスから優先度を決定的に算出する。
function scoreProcedures(
  procedures: ScheduleProcedure[],
  statusMap: Record<number, ProcedureStatus>,
): ScoredProcedure[] {
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

    return { procedure: p, score, bucket, days, status, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

export function buildAdviserSummary(
  procedures: ScheduleProcedure[],
  statusMap: Record<number, ProcedureStatus>,
  topN = 3,
): AdviserSummary {
  const scored = scoreProcedures(procedures, statusMap);

  const recommendations: AdviserRecommendation[] = scored.slice(0, topN).map((s, idx) => ({
    procedure: s.procedure,
    stars: toStars(s.score),
    label: toLabel(s.bucket, idx === 0),
    reasons: s.reasons,
  }));

  return { recommendations, incompleteCount: scored.length };
}

// ── AI参謀コメント（Phase 3.1.1 MVP）─────────────────────────
// 上位手続きから「次に何をすべきか」を一文で伝えるコメントを決定的ロジックで生成する。
// 外部AI APIは呼ばない（このファイル冒頭の方針と同じ）。

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

function officePhrase(s: ScoredProcedure): string {
  return s.procedure.office ? `${s.procedure.office.name}への提出が必要です。` : '';
}

function reasonPhrase(s: ScoredProcedure): string {
  if (EVENT_ORIGIN_TIMING_TYPES.has(s.procedure.timing_type)) {
    return '会社設立・従業員採用などのイベントに伴う手続きです。';
  }
  const officeReason = s.reasons.find((r) => r.includes('他に'));
  return officeReason ? `${officeReason}。` : '';
}

type PrimaryPick = { target: ScoredProcedure; isOverdue: boolean };

// buildAdviserComment・buildLookaheadComment 共通の「今、最優先で伝えるべき対象」選定ロジック。
// ⑤ 期限超過は他の要因に関わらず最優先で警告する。⑥ それが無ければ期限が最も近いものを選ぶ。
function pickPrimaryTarget(scored: ScoredProcedure[]): PrimaryPick | null {
  if (scored.length === 0) return null;

  const overdue = scored
    .filter((s) => s.days !== null && (s.days as number) < 0)
    .sort((a, b) => (a.days as number) - (b.days as number)); // 超過日数が大きい順
  if (overdue.length > 0) {
    return { target: overdue[0], isOverdue: true };
  }

  const withDeadline = [...scored]
    .filter((s) => s.days !== null)
    .sort((a, b) => (a.days as number) - (b.days as number));

  return { target: withDeadline.length > 0 ? withDeadline[0] : scored[0], isOverdue: false };
}

export function buildAdviserComment(
  procedures: ScheduleProcedure[],
  statusMap: Record<number, ProcedureStatus>,
): string {
  const scored = scoreProcedures(procedures, statusMap);
  const pick = pickPrimaryTarget(scored);

  // ⑦ すべて完了している場合
  if (!pick) {
    return 'すべての手続きが完了しています。お疲れさまでした。';
  }

  if (pick.isOverdue) {
    const s = pick.target;
    const overdueDays = Math.abs(s.days as number);
    return [
      `【要注意】${s.procedure.name}の期限を${overdueDays}日超過しています。`,
      officePhrase(s),
      '至急ご対応ください。',
    ]
      .filter(Boolean)
      .join('');
  }

  const target = pick.target;
  const status = target.status;

  const actionPhrase =
    status === 'in_progress' ? '提出まで完了させましょう。' : 'まずは必要書類を確認し、準備を始めましょう。';

  if (target.days === null) {
    // 期限が確定している手続きが一つも無い（=会社設立イベント由来の手続きのみ等）場合の案内
    return [
      `次に対応をおすすめするのは${target.procedure.name}です。`,
      reasonPhrase(target),
      officePhrase(target),
      actionPhrase,
    ]
      .filter(Boolean)
      .join('');
  }

  const deadlineLabel = target.procedure.next_deadline_date ? formatDate(target.procedure.next_deadline_date) : '';

  if (target.bucket === 'today') {
    return [
      `本日が${target.procedure.name}の提出期限です。`,
      officePhrase(target),
      '最優先で本日中に対応してください。',
    ]
      .filter(Boolean)
      .join('');
  }
  if (target.bucket === 'week') {
    return [
      `今週は${target.procedure.name}を最優先で進めてください。`,
      `期限まで${target.days}日です。`,
      officePhrase(target),
    ]
      .filter(Boolean)
      .join('');
  }
  if (target.bucket === 'month') {
    return [
      `今月中に${target.procedure.name}を進めておきましょう。`,
      `期限まで${target.days}日です。`,
      officePhrase(target),
    ]
      .filter(Boolean)
      .join('');
  }
  // later（30日超）だが期限は確定している
  return [
    `次に期限が近いのは${target.procedure.name}です。`,
    `期限は${deadlineLabel}（あと${target.days}日）です。`,
    officePhrase(target),
    actionPhrase,
  ]
    .filter(Boolean)
    .join('');
}

// ── 先読み参謀（Phase 3.2 MVP）───────────────────────────────
// buildAdviserComment が伝える「今の最優先」の次に来る予定を案内する。
// 「今やっておくべき準備」はカテゴリ別の一般的な準備内容（決定的ロジック、DB追加なし）。
const PREP_PHRASE: Record<ProcedureCategory, string> = {
  tax: '必要書類・金額を整理しておきましょう。',
  labor: '賃金・勤怠関係の資料を整理しておきましょう。',
  insurance: '対象者・保険料の情報を確認しておきましょう。',
  registration: '必要な証明書・書類を準備しておきましょう。',
  legal: '登記に必要な書類を準備しておきましょう。',
  other: '関連資料を確認しておきましょう。',
};

type DeadlineCandidate = { procedure: ScheduleProcedure; days: number };

function toDeadlineCandidate(p: ScheduleProcedure): DeadlineCandidate | null {
  const days = daysRemaining(p.next_deadline_date);
  return days === null ? null : { procedure: p, days };
}

export function buildLookaheadComment(
  procedures: ScheduleProcedure[],
  statusMap: Record<number, ProcedureStatus>,
): string | null {
  const scored = scoreProcedures(procedures, statusMap);
  const mainId = pickPrimaryTarget(scored)?.target.procedure.id ?? null;

  // ① まず未完了の中から、今の最優先（mainId）以外で次に期限が近いものを探す
  const pendingCandidates = scored
    .filter((s) => s.procedure.id !== mainId && s.days !== null)
    .map((s) => ({ procedure: s.procedure, days: s.days as number }))
    .sort((a, b) => a.days - b.days);

  // ② 見つからない場合（全件完了時など）は、完了済みも含めた全件から探す
  //    （要件: すべて完了していても次回発生予定があれば案内する）
  const candidates =
    pendingCandidates.length > 0
      ? pendingCandidates
      : procedures
          .filter((p) => p.id !== mainId)
          .map(toDeadlineCandidate)
          .filter((c): c is DeadlineCandidate => c !== null)
          .sort((a, b) => a.days - b.days);

  if (candidates.length === 0) return null;

  const next = candidates[0];
  const office = next.procedure.office ? `${next.procedure.office.name}への提出が必要です。` : '';
  const prep = `今のうちに${PREP_PHRASE[next.procedure.category] ?? PREP_PHRASE.other}`;

  if (next.days < 0) {
    return [
      `続けて${next.procedure.name}も期限を${Math.abs(next.days)}日超過しています。`,
      office,
      '至急あわせてご確認ください。',
    ]
      .filter(Boolean)
      .join('');
  }
  if (next.days === 0) {
    return [`続いて本日、${next.procedure.name}の期限も来ます。`, office, prep].filter(Boolean).join('');
  }
  return [`次は${next.days}日後に${next.procedure.name}があります。`, office, prep]
    .filter(Boolean)
    .join('');
}
