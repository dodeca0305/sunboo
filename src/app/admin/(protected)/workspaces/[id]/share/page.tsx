import { notFound } from 'next/navigation';
import { Share2 } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompanyForRead } from '@/lib/workspaceHomeData';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import WorkspaceShareLinksPanel from './WorkspaceShareLinksPanel';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';
import { loadWorkspaceShareLinks } from '@/lib/workspaceShareLinks';

// ── Company Workspace — 共有（Sprint 24 Phase24.0・Sprint 34）───────────────
// workspace_share_links・get_shared_workspace_view（いずれもSprint22.4 MVP migrationで
// 実装済み、DBスキーマ変更なし）を利用する。共有対象は本Sprintでは
// company/profile/roadmapを基本範囲とし、決算実績だけ発行時に明示的に追加できる。
// 【Sprint34でデータ取得を共通化】company取得をsrc/lib/workspaceLoader.ts
// （loadWorkspaceCompany）へ切り出した。共有リンク自体の取得は本ページ固有のため変更なし。

export default async function WorkspaceSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  const result = await loadWorkspaceCompanyForRead(supabase, companyId);
  if (result.status === 'missing') notFound();
  if (!supabase || result.status !== 'loaded')
    return (
      <div role="alert">
        <InformationCard kind="error" title="会社情報を取得できません">
          <WorkspaceReadReloadButton />
        </InformationCard>
      </div>
    );
  const company = result.company;

  const links = await loadWorkspaceShareLinks(supabase, companyId);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={Share2}
        title="共有"
        subtitle={`${company.name}の年間ロードマップを、経営者へそのまま渡せる形で共有します。`}
      />


      <InformationCard kind="info">
        公開範囲を選んでリンクを発行し、相手に渡します。共有先は閲覧のみです。
        AI参謀・書類・会計分析は共有されません。
      </InformationCard>

      <WorkspaceShareLinksPanel companyId={companyId} initialLinks={links} />
    </div>
  );
}
