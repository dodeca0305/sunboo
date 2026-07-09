import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { workspaceRowsToCompanyProfile, type WorkspaceCompanyProfileRow, type WorkspaceCompanyRow } from '@/lib/workspaceCompanyProfile';
import WorkspaceProfileForm from './WorkspaceProfileForm';

export default async function WorkspaceCompanyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const { data: companyData } = await supabase
    .from('workspace_companies')
    .select('id, name, prefecture_code, municipality_code, corporate_type, fiscal_month')
    .eq('id', companyId)
    .maybeSingle();

  const company = companyData as WorkspaceCompanyRow | null;
  if (!company) notFound();

  const [{ data: profileData }, { data: prefData }, { data: muniData }] = await Promise.all([
    supabase.from('workspace_company_profiles').select('*').eq('company_id', companyId).maybeSingle(),
    supabase.from('prefectures').select('name').eq('code', company.prefecture_code).maybeSingle(),
    supabase.from('municipalities').select('name').eq('code', company.municipality_code).maybeSingle(),
  ]);

  const profile = (profileData as WorkspaceCompanyProfileRow | null) ?? null;
  const prefectureName = (prefData as { name: string } | null)?.name ?? '';
  const municipalityName = (muniData as { name: string } | null)?.name ?? '';

  const initialProfile = workspaceRowsToCompanyProfile(company, profile, prefectureName, municipalityName);

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
      <WorkspaceProfileForm companyId={companyId} initialProfile={initialProfile} />
    </div>
  );
}
