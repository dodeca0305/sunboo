import { notFound } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany, loadWorkspaceCompanyProfile } from '@/lib/workspaceLoader';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceProfileForm from './WorkspaceProfileForm';
import PageHeader from '@/components/PageHeader';

// ── Company Workspace — 会社プロフィール（Sprint 23 Phase23.2・Sprint 34）─────────
// 【Sprint34でデータ取得を共通化】company取得・CompanyProfile変換はDashboard・Roadmapと重複していた。
// src/lib/workspaceLoader.ts（loadWorkspaceCompany・loadWorkspaceCompanyProfile）へ切り出した。
// 本ページはAnnual Roadmapの計算（診断エンジンへの追加問い合わせを伴う）を必要としないため、
// loadWorkspaceRoadmapContextではなくloadWorkspaceCompanyProfileのみを呼ぶ
// （問い合わせ回数を従来通り3件に保つ）。

export default async function WorkspaceCompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const company = await loadWorkspaceCompany(supabase, companyId);
  if (!company) notFound();

  const initialProfile = await loadWorkspaceCompanyProfile(supabase, company);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={Building2}
        title="会社プロフィール"
        subtitle={`${company.name}の税務・労務の現況。手続きの判定に使う情報を登録します。`}
      />
      <WorkspaceSubNav companyId={companyId} />
      <WorkspaceProfileForm companyId={companyId} initialProfile={initialProfile} />
    </div>
  );
}
