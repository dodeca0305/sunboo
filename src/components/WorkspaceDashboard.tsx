import Link from 'next/link';
import { ListChecks, AlertTriangle, PieChart, Sparkles, Building2, Compass } from 'lucide-react';
import type { WorkspaceAdvice, WorkspaceAdviceItem, WorkspaceProgressSummary } from '@/lib/workspaceAdvice';
import type { WorkspaceDecisions, DecisionPriority } from '@/lib/workspaceDecisions';
import type { CompanyState } from '@/lib/state';
import type { CompanyStage, ConsumptionTaxStatus } from '@/lib/companyProfile';

// ── Company Workspace — ホームダッシュボード（Sprint 25・Sprint 26・Sprint 27）─────
// Workspaceを開いた最初の画面。generateWorkspaceAdvice・summarizeWorkspaceProgress
// （いずれもsrc/lib/workspaceAdvice.ts、既存Engineの出力を集計するだけの純粋関数）と
// buildStateFromTimelineの結果を受け取って表示するだけで、計算は一切行わない。
// 「今日やること」「期限警告」はWorkspaceAdviceの priority/warnings をそのまま、
// 「AI参謀」は summary + opportunities（気づき）を表示する（Sprint24.2の
// WorkspaceAdviceCardを本コンポーネントに統合し、ダッシュボードの区画として再構成した）。
//
// 【Sprint26で追加】書類（workspace_documents）は一覧・状態変更を持たず、「要更新」件数のみを
// 会社概要カードに表示する（要件どおり件数だけ。詳細は/documentsへのリンクで確認する）。
//
// 【Sprint27で追加】generateWorkspaceDecisions（src/lib/workspaceDecisions.ts）の結果を
// 「意思決定」として表示する。AI参謀（情報表示）を置き換えるのではなく別セクションとして追加する
// （手続き×書類の突き合わせ・決算月からの逆算など、AI参謀より一段踏み込んだ判断を提示するため）。

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
  const toneClass = tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-gray-500';
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span className="font-medium text-gray-900">{item.title}</span>
      <span className={`text-xs ${toneClass}`}>{item.detail}</span>
    </li>
  );
}

function ConfidenceTag({ confidence }: { confidence: CompanyState['stage']['confidence'] }) {
  if (confidence === 'confirmed') return null;
  return (
    <span className="tag border-amber-200 text-amber-700">
      {confidence === 'estimated' ? '推定' : '情報不足'}
    </span>
  );
}

const PROGRESS_STAT_LABEL: { key: keyof Pick<WorkspaceProgressSummary, 'notStarted' | 'inProgress' | 'done' | 'onHold'>; label: string }[] = [
  { key: 'notStarted', label: '未着手' },
  { key: 'inProgress', label: '進行中' },
  { key: 'done', label: '完了' },
  { key: 'onHold', label: '保留' },
];

const DECISION_PRIORITY_LABEL: Record<DecisionPriority, string> = { high: '高', medium: '中', low: '低' };
const DECISION_PRIORITY_TAG_CLASS: Record<DecisionPriority, string> = {
  high: 'border-red-200 text-red-700',
  medium: 'border-amber-200 text-amber-700',
  low: '',
};

export default function WorkspaceDashboard({
  companyId,
  company,
  state,
  advice,
  progress,
  decisions,
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
  documentsNeedingUpdateCount: number;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <ListChecks className="h-3.5 w-3.5" />
            今日やること
          </div>
          {advice.priority.length > 0 ? (
            <ul className="space-y-1.5">
              {advice.priority.map((item, idx) => (
                <AdviceItemRow key={`${item.procedureId}-${idx}`} item={item} tone="neutral" />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">直近で対応が必要な手続きはありません。</p>
          )}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <AlertTriangle className="h-3.5 w-3.5" />
            期限警告
          </div>
          {advice.warnings.length > 0 ? (
            <ul className="space-y-1.5">
              {advice.warnings.map((item, idx) => (
                <AdviceItemRow key={`${item.procedureId}-${idx}`} item={item} tone={isOverdue(item) ? 'red' : 'amber'} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">警告はありません。</p>
          )}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <Compass className="h-3.5 w-3.5 text-blue-600" />
          意思決定
        </div>
        <p className="text-sm text-gray-700">{decisions.summary}</p>

        {decisions.actions.length > 0 && (
          <ul className="space-y-1.5">
            {decisions.actions.map((action, idx) => (
              <li key={idx} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
                <span className={`tag ${DECISION_PRIORITY_TAG_CLASS[action.priority]}`}>{DECISION_PRIORITY_LABEL[action.priority]}</span>
                <span className="font-medium text-gray-900">{action.title}</span>
                <span className="text-xs text-gray-500">{action.reason}</span>
              </li>
            ))}
          </ul>
        )}

        {decisions.watchItems.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-400">注視事項</div>
            <ul className="space-y-1">
              {decisions.watchItems.map((item, idx) => (
                <li key={idx} className="text-xs text-gray-500">
                  <span className="font-medium text-gray-700">{item.title}</span> — {item.reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {decisions.completed.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {decisions.completed.slice(0, 6).map((item, idx) => (
              <span key={idx} className="tag text-gray-400">{item.title}</span>
            ))}
            {decisions.completed.length > 6 && (
              <span className="text-xs text-gray-400">他{decisions.completed.length - 6}件完了</span>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <PieChart className="h-3.5 w-3.5" />
            進捗サマリー
          </div>
          {progress.total > 0 ? (
            <>
              <div>
                <div className="mb-1 flex items-baseline justify-between text-xs text-gray-500">
                  <span>完了率</span>
                  <span className="font-semibold text-gray-900">{progress.completionRate}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${progress.completionRate}%` }} />
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {PROGRESS_STAT_LABEL.map(({ key, label }) => (
                  <span key={key} className="tag">
                    {label} {progress[key]}件
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400">表示できる手続きがありません。</p>
          )}
        </div>

        <div className="card space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            AI参謀
          </div>
          <p className="text-sm text-gray-700">{advice.summary}</p>
          {advice.opportunities.length > 0 && (
            <ul className="space-y-1.5">
              {advice.opportunities.map((item, idx) => (
                <AdviceItemRow key={`${item.procedureId ?? 'general'}-${idx}`} item={item} tone="neutral" />
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <Building2 className="h-3.5 w-3.5" />
          会社概要
        </div>
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
            className={`tag hover:bg-gray-50 ${documentsNeedingUpdateCount > 0 ? 'border-amber-200 text-amber-700' : ''}`}
          >
            要更新書類 {documentsNeedingUpdateCount}件
          </Link>
        </div>
      </div>
    </div>
  );
}
