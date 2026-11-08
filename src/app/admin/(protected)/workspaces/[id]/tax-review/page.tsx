import ExecutionPanel from './ExecutionPanel';
import { PRODUCTION_CONTROL_EVALUATOR_KEYS } from '@/lib/taxIntelligence/productionEvaluators';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany } from '@/lib/workspaceLoader';
import {
  loadWorkspaceTaxReviewItems,
  type WorkspaceTaxReviewItem,
} from '@/lib/taxIntelligence/reviewCases';
import WorkspaceTaxReviewView from '@/components/WorkspaceTaxReviewView';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import { loadTaxInputGuide } from '@/lib/taxIntelligence/inputGuide';

export default async function WorkspaceTaxReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canManage = false;

  if (user?.email) {
    const { data: memberRow } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('company_id', companyId)
      .eq('email', user.email)
      .maybeSingle();

    const role = (memberRow as { role: string } | null)?.role;
    canManage = role === 'owner' || role === 'member';
  }

  const inputGuidePromise = canManage ? loadTaxInputGuide(supabase, company) : Promise.resolve(null);
  let items: WorkspaceTaxReviewItem[] = [];
  let loadError: string | null = null;

  try {
    items = await loadWorkspaceTaxReviewItems(supabase, companyId);
  } catch (error) {
    loadError = error instanceof Error ? error.message : '税務レビューの取得に失敗しました。';
  }

  const controls: Array<{ id: number; title: string }> = [];
  let controlLoadError = false;
  if (canManage) {
    // 実取得件数でページを進め、API側の上限が小さくても取りこぼさない。
    for (let offset = 0; ; ) {
      const { data, error } = await supabase.from('tax_controls')
        .select('id, title').eq('status', 'approved').eq('is_enabled', true)
        .eq('control_kind', 'tax_rule')
        .in('evaluator_key', Object.values(PRODUCTION_CONTROL_EVALUATOR_KEYS))
        .order('id').range(offset, offset + 99);
      if (error || !data) { controlLoadError = true; break; }
      if (data.length === 0) break;
      controls.push(...data);
      offset += data.length;
    }
  }

  const inputGuide = await inputGuidePromise;
  const openCount = items.filter((item) => item.caseStatus === 'open').length;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={ShieldCheck}
        title="税金の確認結果"
        subtitle={loadError ? `${company.name}の確認結果を取得できません` : `${company.name}のまだ確認が終わっていない項目：${openCount}件`}
      />


      <p className="text-sm text-sunboo-ink-muted">
        登録情報をもとに、税金について確認したい項目を表示します。
        一般的な参考情報です。最終判断は税理士などの専門家へ。
      </p>

      {loadError ? (
        <InformationCard kind="error">
          <p>確認結果を取得できませんでした。項目が0件かどうかはまだ分かりません。</p>
          <WorkspaceReadReloadButton />
        </InformationCard>
      ) : (
        <WorkspaceTaxReviewView
          key={items.map((item) => item.caseId).join(',')}
          companyId={companyId}
          companyName={company.name}
          initialItems={items}
          canManage={canManage}
        />
      )}

      {canManage && inputGuide && <ExecutionPanel key={`${user?.id}:${companyId}`} actor={user?.id ?? ""} companyId={companyId} controls={controls} loadError={controlLoadError} inputGuide={inputGuide} />}
    </div>
  );
}
