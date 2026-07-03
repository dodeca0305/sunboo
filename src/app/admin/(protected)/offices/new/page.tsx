import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import OfficeForm, { type MunicipalityOption, type OrganizationTypeOption } from '../OfficeForm';

type RawMunicipality = { id: number; code: string; name: string; prefectures: { name: string } | null };

export default async function NewOfficePage() {
  const supabase = await createServerSupabase();

  let municipalities: MunicipalityOption[] = [];
  let organizationTypes: OrganizationTypeOption[] = [];
  if (supabase) {
    const [{ data: muniData }, { data: typeData }] = await Promise.all([
      supabase.from('municipalities').select('id, code, name, prefectures(name)').order('code'),
      supabase.from('organization_types').select('id, code, name').eq('is_active', true).order('sort_order'),
    ]);

    municipalities = ((muniData as unknown as RawMunicipality[] | null) ?? []).map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      prefecture_name: m.prefectures?.name ?? '',
    }));
    organizationTypes = (typeData as OrganizationTypeOption[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/offices" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        管轄機関一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">管轄機関を追加</h1>
      <OfficeForm municipalities={municipalities} organizationTypes={organizationTypes} />
    </div>
  );
}
