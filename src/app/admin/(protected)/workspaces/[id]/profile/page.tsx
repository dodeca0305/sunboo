import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceCompany, loadWorkspaceCompanyProfile } from '@/lib/workspaceLoader';
import WorkspaceSubNav from '@/components/WorkspaceSubNav';
import WorkspaceProfileForm from './WorkspaceProfileForm';

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
      <Link
        href={`/admin/workspaces/${companyId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {company.name} に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">会社プロフィール — {company.name}</h1>
      <WorkspaceSubNav companyId={companyId} />
      <WorkspaceProfileForm companyId={companyId} initialProfile={initialProfile} />
    </div>
  );
}
