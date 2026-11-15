// ローカル合成試験専用。実AnnualRoadmapView（と実ProcedureCompletionFlow）を合成データで描画する。
// 認証・実データ・本番通信なし。supabase/next-navigation/analytics/担当欄はverify-document-completion-flow.mjsが
// ビルド時にスタブへ差し替える（このファイルは本番ルートではない）。
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';
import type { RoadmapYear } from '@/lib/roadmap';
import type { ScheduleProcedure } from '@/lib/scheduleProcedure';
import type { WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';

type Doc = NonNullable<ScheduleProcedure['procedure_documents']>[number];
export type HarnessConfig = {
  mode: 'editable' | 'share' | 'public';
  companyId: number;
  docs: Doc[] | undefined;
  statusMap: WorkspaceProcedureStatusMap;
  version: number;
  dueDate?: string;
};

const DUE = '2027-01-31';
const CORP_DUE = '2027-02-28';

function procedure(id: number, code: string, name: string, docs: Doc[] | undefined): ScheduleProcedure {
  return {
    id, code, name, description: '', category: 'tax', timing_label: '', timing_type: 'fixed',
    next_deadline: null, next_deadline_date: null, office: null, official_links: [], procedure_documents: docs,
  };
}

function years(docs: Doc[] | undefined, due: string): RoadmapYear[] {
  return [{
    year: Number(due.slice(0, 4)),
    items: [
      { procedure: procedure(101, 'DEPRECIABLE_ASSET_TAX_RETURN', '合成償却資産申告', docs), dueDate: due, confidence: 'confirmed' },
      { procedure: procedure(102, 'CORP_TAX_RETURN', '合成法人税申告', [
        { name: '合成の別書類', form_number: null, is_required: true, notes: null, item_type: 'document', sort_order: 0 },
      ]), dueDate: CORP_DUE, confidence: 'confirmed' },
    ],
  }] as unknown as RoadmapYear[];
}

function Harness() {
  const [cfg, setCfg] = useState<HarnessConfig>(() => (window as unknown as { __initial: HarnessConfig }).__initial);
  useEffect(() => {
    (window as unknown as { __setCfg: typeof setCfg }).__setCfg = setCfg;
  }, []);
  const editable = cfg.mode === 'editable';
  const shared = cfg.mode === 'share';
  return (
    <main className="mx-auto max-w-3xl p-4" data-version={cfg.version}>
      <AnnualRoadmapView
        roadmapYears={years(cfg.docs, cfg.dueDate ?? DUE)}
        statusMap={editable || shared ? cfg.statusMap : undefined}
        companyId={editable ? cfg.companyId : undefined}
        taxPaymentPlanMap={editable ? {} : undefined}
      />
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(<Harness />);
