import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, Share2, Info } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany } from '@/lib/workspaceLoader';
import WorkspaceShareLinksPanel, { type ShareLinkRow } from './WorkspaceShareLinksPanel';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';

// ── Company Workspace — 共有（Sprint 24 Phase24.0・Sprint 34）───────────────
// workspace_share_links・get_shared_workspace_view（いずれもSprint22.4 MVP migrationで
// 実装済み、DBスキーマ変更なし）を利用する。共有対象は本Sprintでは
// company/profile/roadmapの3項目固定（項目単位のトグルは次Sprint以降）。
// 【Sprint34でデータ取得を共通化】company取得をsrc/lib/workspaceLoader.ts
// （loadWorkspaceCompany）へ切り出した。共有リンク自体の取得は本ページ固有のため変更なし。

export default async function WorkspaceSharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const { data: linksData } = await supabase
    .from('workspace_share_links')
    .select('id, token, shared_sections, expires_at, revoked_at, last_accessed_at, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  const links = (linksData as ShareLinkRow[] | null) ?? [];

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/workspaces/${companyId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {company.name} に戻る
      </Link>

      <div className="flex items-center gap-2.5">
        <Share2 className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">共有 — {company.name}</h1>
      </div>

      <WorkspaceSubNav companyId={companyId} />

      <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          発行したリンクを経営者に共有すると、ログイン不要で「会社概要」「年間ロードマップ」を
          閲覧できます（編集はできません）。AI参謀・書類・会計分析はまだ共有できません。
          現在、共有リンクに有効期限はありません。発行後は「失効させる」を押すまで有効なままに
          なりますので、不要になったリンクは速やかに失効させてください。
        </p>
      </div>

      <WorkspaceShareLinksPanel companyId={companyId} initialLinks={links} />
    </div>
  );
}
