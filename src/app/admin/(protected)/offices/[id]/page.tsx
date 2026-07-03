import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import OfficeForm, { type MunicipalityOption, type OfficeFormValues } from '../OfficeForm';

type RawMunicipality = { id: number; code: string; name: string; prefectures: { name: string } | null };

export default async function EditOfficePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  if (!supabase) {
    return <p className="text-sm text-gray-500">Supabase が設定されていません。</p>;
  }

  const [{ data: municipalitiesRaw }, { data: officeRaw }] = await Promise.all([
    supabase.from('municipalities').select('id, code, name, prefectures(name)').order('code'),
    supabase.from('jurisdiction_offices').select('*').eq('id', id).maybeSingle(),
  ]);

  if (!officeRaw) notFound();

  const municipalities: MunicipalityOption[] = ((municipalitiesRaw as unknown as RawMunicipality[] | null) ?? []).map(
    (m) => ({ id: m.id, code: m.code, name: m.name, prefecture_name: m.prefectures?.name ?? '' }),
  );

  const office = officeRaw as {
    id: number;
    municipality_id: number;
    office_type: string;
    name: string;
    address: string | null;
    phone: string | null;
    website_url: string | null;
    map_url: string | null;
    official_url: string | null;
    official_url_status: string | null;
    fallback_url: string | null;
  };

  const initialValues: OfficeFormValues = {
    id: office.id,
    municipality_id: office.municipality_id,
    office_type: office.office_type,
    name: office.name,
    address: office.address ?? '',
    phone: office.phone ?? '',
    website_url: office.website_url ?? '',
    map_url: office.map_url ?? '',
    official_url: office.official_url ?? '',
    official_url_status: office.official_url_status ?? 'unchecked',
    fallback_url: office.fallback_url ?? '',
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/offices" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        管轄機関一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">管轄機関を編集</h1>
      <OfficeForm municipalities={municipalities} initialValues={initialValues} />
    </div>
  );
}
