import Link from 'next/link';
import {
  Sunrise, ListChecks, AlertTriangle, PieChart, Sparkles, Building2, Compass,
  Bell, Clock, PauseCircle, FileStack, Receipt, Info,
} from 'lucide-react';
import type { WorkspaceAdvice, WorkspaceAdviceItem, WorkspaceProgressSummary } from '@/lib/workspaceAdvice';
import type { WorkspaceDecisions, DecisionPriority } from '@/lib/workspaceDecisions';
import type {
  WorkspaceNotification, WorkspaceNotificationCategory, WorkspaceNotificationSeverity,
} from '@/lib/workspaceNotifications';
import type { CompanyState } from '@/lib/state';
import type { CompanyStage, ConsumptionTaxStatus } from '@/lib/companyProfile';
import StatusBadge from '@/components/StatusBadge';
import { PRIORITY_TAG_CLASS, type StatusBadgeKind } from '@/lib/statusBadge';

// ── Company Workspace — ホームダッシュボード（Sprint 25・26・27・37・83・85）─────
// Workspaceを開いた最初の画面。generateWorkspaceAdvice・summarizeWorkspaceProgress
// （いずれも既存Engineの出力を集計するだけの純粋関数）と buildStateFromTimeline の結果を
// 受け取って表示するだけで、計算は一切行わない。
//
// 【Sprint85で再構成】「朝一番に開く画面」として、優先順位を
// 1)今日やること 2)次の期限 3)今年あと何件 4)最近完了したこと に統一した最上部カード
// 「今日のポイント」を新設した。ただし新しい集計・DB問い合わせは一切行わず、既存の
// advice.priority／advice.warnings／progress.total-progress.done／decisions.completed を
// 並べ替えて表示するだけ（docs/SUNBOO_BRAND_EXPERIENCE_REVIEW.md参照）。
// カード数は従来の7枚（通知/今日やること/期限警告/意思決定/進捗サマリー/AI参謀/会社概要）から
// 増やしていない（「今日のポイント」が旧「今日やること」の役割を引き継ぎ、「最近完了したこと」は
// 「意思決定」カードの中から移設した）。チャート（円グラフ・棒グラフ）は追加していない。

const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

const STAGE_LABEL: Record<CompanyStage, string> = {
  pre_establishment: '設立前',
  first_term: '1期目',
  second_term_or_later: '2期目以降',
};

const CONSUMPTION_TAX_LABEL: Record<ConsumptionTaxStatus, string> = {
  exempt: '免税事業者',
  taxable: '課税事業者',
};

function isOverdue(item: WorkspaceAdviceItem): boolean {
  return item.detail.startsWith('期限超過');
}

function AdviceItemRow({ item, tone }: { item: WorkspaceAdviceItem; tone: 'neutral' | 'amber' | 'red' }) {
  const toneClass = tone === 'red' ? 'text-sunboo-danger' : tone === 'amber' ? 'text-sunboo-morning-sun-dark' : 'text-sunboo-ink-muted';
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="font-medium text-sunboo-ink">{item.title}</span>
      <span className={`text-xs ${toneClass}`}>{item.detail}</span>
    </li>
  );
}

function ConfidenceTag({ confidence }: { confidence: CompanyState['stage']['confidence'] }) {
  if (confidence === 'confirmed') return null;
  return <StatusBadge kind={confidence === 'estimated' ? 'estimated' : 'info_missing'} />;
}

// Phase6：カード見出しの書式（アイコン+ラベル）を1箇所に集約し、全カードで統一する。
function CardEyebrow({ icon: Icon, children }: { icon: typeof ListChecks; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-sunboo-ink-muted">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {children}
    </div>
  );
}

const PROGRESS_STAT_BADGE: { key: keyof Pick<WorkspaceProgressSummary, 'notStarted' | 'inProgress' | 'done' | 'onHold'>; kind: StatusBadgeKind }[] = [
  { key: 'notStarted', kind: 'not_started' },
  { key: 'inProgress', kind: 'in_progress' },
  { key: 'done', kind: 'done' },
  { key: 'onHold', kind: 'on_hold' },
];

const DECISION_PRIORITY_LABEL: Record<DecisionPriority, string> = { high: '高', medium: '中', low: '低' };
// Sprint83でSUNBOO Tokenへ統一（high=Danger、medium=MorningSun系、low=無色）。
// 個別の色を持たず src/lib/statusBadge.ts の PRIORITY_TAG_CLASS を参照する。
const DECISION_PRIORITY_TAG_CLASS: Record<DecisionPriority, string> = PRIORITY_TAG_CLASS;

// 通知センター（Sprint37、Sprint85で「確認が必要なこと」に改称）表示用の定数。
// severityのタグ配色はDecisionと同じ規則（high=Danger、medium=MorningSun系、low=無色）を踏襲する。
const NOTIFICATION_SEVERITY_LABEL: Record<WorkspaceNotificationSeverity, string> = { high: '高', medium: '中', low: '低' };
const NOTIFICATION_SEVERITY_TAG_CLASS: Record<WorkspaceNotificationSeverity, string> = DECISION_PRIORITY_TAG_CLASS;
const NOTIFICATION_CATEGORY_ICON: Record<WorkspaceNotificationCategory, typeof Clock> = {
  deadline: Clock,
  hold: PauseCircle,
  document: FileStack,
  closing: Receipt,
  information: Info,
};

function NotificationRow({ notification }: { notification: WorkspaceNotification }) {
  const Icon = NOTIFICATION_CATEGORY_ICON[notification.category];
  const content = (
    <div className="-mx-2.5 flex items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-sunboo-warm-paper">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-sunboo-ink-muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`tag ${NOTIFICATION_SEVERITY_TAG_CLASS[notification.severity]}`}>
            {NOTIFICATION_SEVERITY_LABEL[notification.severity]}
          </span>
          <span className="text-sm font-medium text-sunboo-ink">{notification.title}</span>
        </div>
        <p className="mt-0.5 text-xs leading-relaxed text-sunboo-ink-muted">{notification.message}</p>
      </div>
    </div>
  );
  return notification.href ? (
    <Link href={notification.href} className="block">
      {content}
    </Link>
  ) : (
    <div>{content}</div>
  );
}

export default function WorkspaceDashboard({
  companyId,
  company,
  state,
  advice,
  progress,
  decisions,
  notifications,
  documentsNeedingUpdateCount,
}: {
  companyId: number;
  company: {
    corporateType: string;
    fiscalMonth: number | null;
    prefectureName: string;
    municipalityName: string;
  };
  state: CompanyState;
  advice: WorkspaceAdvice;
  progress: WorkspaceProgressSummary;
  decisions: WorkspaceDecisions;
  notifications: WorkspaceNotification[];
  documentsNeedingUpdateCount: number;
}) {
  // 表示専用の並べ替え・差分計算のみ（新しい判定ロジックは追加しない）。
  // 「次の期限」は advice.warnings/advice.priority のうち最も近い1件をそのまま使う
  // （detail文言は既存Engineが生成済みのものをそのまま表示し、再フォーマットしない）。
  const upcoming = [...advice.warnings, ...advice.priority].filter(
    (item): item is WorkspaceAdviceItem & { dueDate: string } => item.dueDate !== null,
  );
  const nextDeadlineItem = upcoming.length > 0
    ? upcoming.reduce((soonest, item) => (item.dueDate < soonest.dueDate ? item : soonest))
    : null;
  const remainingCount = Math.max(progress.total - progress.done, 0);

  return (
    <div className="space-y-4">
      {progress.total === 0 && (
        <div className="information-card information-card--info flex items-start gap-3">
          <Compass className="mt-0.5 h-4 w-4 shrink-0 text-sunboo-ink-muted" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-sunboo-ink">次に行うこと</p>
            <p className="mt-1 text-xs leading-relaxed text-sunboo-ink-muted">
              {company.fiscalMonth === null
                ? '決算月が未設定のため、年間ロードマップをまだ作成できません。会社プロフィールで決算月を設定してください。'
                : '会社プロフィールを入力すると、年間ロードマップが自動作成されます。'}
            </p>
          </div>
          <Link
            href={`/admin/workspaces/${companyId}/profile`}
            className="btn-secondary shrink-0 px-3 py-1.5 text-xs whitespace-nowrap"
          >
            会社プロフィールを入力する
          </Link>
        </div>
      )}

      {/* 1〜4. 今日のポイント（今日やること／次の期限／今年あと何件／最近完了したこと） */}
      <div className="card space-y-3">
        <CardEyebrow icon={Sunrise}>今日のポイント</CardEyebrow>

        <div className="grid grid-cols-2 gap-4 border-b border-sunboo-mist pb-3">
          <div>
            <p className="text-sunboo-tiny uppercase text-sunboo-ink-muted">次の期限</p>
            {nextDeadlineItem ? (
              <>
                <p className="mt-0.5 text-sm font-semibold text-sunboo-ink">{nextDeadlineItem.title}</p>
                <p className={`text-xs ${isOverdue(nextDeadlineItem) ? 'text-sunboo-danger' : 'text-sunboo-morning-sun-dark'}`}>
                  {nextDeadlineItem.detail}
                </p>
              </>
            ) : (
              <p className="mt-0.5 text-sm font-semibold text-sunboo-ink">しばらく期限はありません</p>
            )}
          </div>
          <div>
            <p className="text-sunboo-tiny uppercase text-sunboo-ink-muted">今年あと何件</p>
            <p className="mt-0.5 text-sm font-semibold text-sunboo-ink">
              {progress.total > 0 ? `${remainingCount}件` : '計算中'}
            </p>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-sunboo-ink-muted">今日やること</p>
          {advice.priority.length > 0 ? (
            <ul className="space-y-1.5">
              {advice.priority.map((item, idx) => (
                <AdviceItemRow key={`${item.procedureId}-${idx}`} item={item} tone="neutral" />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-sunboo-ink-muted">直近で対応が必要な手続きはありません。安心して本業に集中してください。</p>
          )}
        </div>

        {decisions.completed.length > 0 && (
          <div className="border-t border-sunboo-mist pt-3">
            <p className="mb-1.5 text-xs font-semibold text-sunboo-ink-muted">最近完了したこと</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {decisions.completed.slice(0, 6).map((item, idx) => (
                <span key={idx} className="tag">{item.title}</span>
              ))}
              {decisions.completed.length > 6 && (
                <span className="text-xs text-sunboo-ink-muted">他{decisions.completed.length - 6}件完了</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 確認が必要なこと（Sprint37「通知センター」をSprint85で改称・再整理） */}
      <div className="card space-y-2">
        <CardEyebrow icon={Bell}>確認が必要なこと</CardEyebrow>
        {notifications.length > 0 ? (
          <div className="divide-y divide-sunboo-mist">
            {notifications.map((notification) => (
              <NotificationRow key={notification.id} notification={notification} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-sunboo-ink-muted">今、確認が必要なことはありません。安心して本業に集中してください。</p>
        )}
      </div>

      <div className="card space-y-3">
        <CardEyebrow icon={AlertTriangle}>期限警告</CardEyebrow>
        {advice.warnings.length > 0 ? (
          <ul className="space-y-1.5">
            {advice.warnings.map((item, idx) => (
              <AdviceItemRow key={`${item.procedureId}-${idx}`} item={item} tone={isOverdue(item) ? 'red' : 'amber'} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-sunboo-ink-muted">期限が近い手続きや期限超過はありません。</p>
        )}
      </div>

      <div className="card space-y-3">
        <CardEyebrow icon={Compass}>意思決定</CardEyebrow>
        <p className="text-sm text-sunboo-ink">{decisions.summary}</p>

        {decisions.actions.length > 0 && (
          <ul className="space-y-1.5">
            {decisions.actions.map((action, idx) => (
              <li key={idx} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className={`tag ${DECISION_PRIORITY_TAG_CLASS[action.priority]}`}>{DECISION_PRIORITY_LABEL[action.priority]}</span>
                <span className="font-medium text-sunboo-ink">{action.title}</span>
                <span className="text-xs text-sunboo-ink-muted">{action.reason}</span>
              </li>
            ))}
          </ul>
        )}

        {decisions.watchItems.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-sunboo-ink-muted">注視事項</div>
            <ul className="space-y-1">
              {decisions.watchItems.map((item, idx) => (
                <li key={idx} className="text-xs text-sunboo-ink-muted">
                  <span className="font-medium text-sunboo-ink">{item.title}</span> — {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3">
          <CardEyebrow icon={PieChart}>進捗サマリー</CardEyebrow>
          {progress.total > 0 ? (
            <>
              <div>
                <div className="mb-1 flex items-baseline justify-between text-xs text-sunboo-ink-muted">
                  <span>完了率</span>
                  <span className="font-semibold text-sunboo-ink">{progress.completionRate}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunboo-mist">
                  <div className="h-full rounded-full bg-sunboo-moss" style={{ width: `${progress.completionRate}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PROGRESS_STAT_BADGE.map(({ key, kind }) => (
                  <StatusBadge key={key} kind={kind} suffix={` ${progress[key]}件`} />
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-sunboo-ink-muted">今年の手続きはまだ計算できていません。</p>
          )}
        </div>

        <div className="card space-y-3">
          <CardEyebrow icon={Sparkles}>AI参謀</CardEyebrow>
          <p className="text-sm text-sunboo-ink">{advice.summary}</p>
          {advice.opportunities.length > 0 && (
            <ul className="space-y-1.5">
              {advice.opportunities.map((item, idx) => (
                <AdviceItemRow key={`${item.procedureId ?? 'general'}-${idx}`} item={item} tone="neutral" />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card space-y-3">
        <CardEyebrow icon={Building2}>会社概要</CardEyebrow>
        <div className="flex flex-wrap gap-1.5">
          <span className="tag">{CORPORATE_TYPE_LABEL[company.corporateType] ?? company.corporateType}</span>
          {company.fiscalMonth && <span className="tag">決算月: {company.fiscalMonth}月</span>}
          {(company.prefectureName || company.municipalityName) && (
            <span className="tag">{company.prefectureName}{company.municipalityName}</span>
          )}
          {state.stage.value && (
            <span className="tag inline-flex items-center gap-1">
              {STAGE_LABEL[state.stage.value]}
              <ConfidenceTag confidence={state.stage.confidence} />
            </span>
          )}
          {state.consumptionTaxStatus.value && (
            <span className="tag inline-flex items-center gap-1">
              {CONSUMPTION_TAX_LABEL[state.consumptionTaxStatus.value]}
              <ConfidenceTag confidence={state.consumptionTaxStatus.confidence} />
            </span>
          )}
          <Link
            href={`/admin/workspaces/${companyId}/documents`}
            className={`tag hover:bg-sunboo-warm-paper ${documentsNeedingUpdateCount > 0 ? 'tag--caution' : ''}`}
          >
            要更新書類 {documentsNeedingUpdateCount}件
          </Link>
        </div>
      </div>
    </div>
  );
}
