import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import OfficeForm, { type MunicipalityOption, type OrganizationTypeOption, type OfficeFormValues } from '../OfficeForm';

type RawMunicipality = { id: number; code: string; name: string; prefectures: { name: string } | null };

type RawOffice = {
  id: number;
  organization_id: number;
  name: string;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website_url: string | null;
  official_url: string | null;
  official_url_status: string | null;
  fallback_url: string | null;
  e_filing_url: string | null;
  download_page_url: string | null;
  map_url: string | null;
  business_hours: string | null;
  notes: string | null;
  organizations: { name: string; organization_type_id: number } | null;
};

export default async function EditOfficePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();

  if (!supabase) {
    return <p className="text-sm text-gray-500">Supabase が設定されていません。</p>;
  }

  const [{ data: municipalitiesRaw }, { data: typeData }, { data: officeRaw }, { data: jurisdictionsRaw }] =
    await Promise.all([
      supabase.from('municipalities').select('id, code, name, prefectures(name)').order('code'),
      supabase.from('organization_types').select('id, code, name').eq('is_active', true).order('sort_order'),
      supabase
        .from('organization_offices')
        .select(
          'id, organization_id, name, postal_code, address, phone, fax, email, website_url, official_url, ' +
            'official_url_status, fallback_url, e_filing_url, download_page_url, map_url, business_hours, notes, ' +
            'organizations(name, organization_type_id)',
        )
        .eq('id', id)
        .maybeSingle(),
      supabase.from('jurisdictions').select('municipality_id').eq('organization_office_id', id),
    ]);

  if (!officeRaw) notFound();

  const municipalities: MunicipalityOption[] = ((municipalitiesRaw as unknown as RawMunicipality[] | null) ?? []).map(
    (m) => ({ id: m.id, code: m.code, name: m.name, prefecture_name: m.prefectures?.name ?? '' }),
  );
  const organizationTypes: OrganizationTypeOption[] = (typeData as OrganizationTypeOption[] | null) ?? [];

  const office = officeRaw as unknown as RawOffice;
  const municipalityIds = ((jurisdictionsRaw as { municipality_id: number }[] | null) ?? []).map(
    (j) => j.municipality_id,
  );

  const initialValues: OfficeFormValues = {
    id: office.id,
    organization_id: office.organization_id,
    organization_type_id: office.organizations?.organization_type_id ?? '',
    organization_name: office.organizations?.name ?? '',
    name: office.name,
    postal_code: office.postal_code ?? '',
    address: office.address ?? '',
    phone: office.phone ?? '',
    fax: office.fax ?? '',
    email: office.email ?? '',
    website_url: office.website_url ?? '',
    official_url: office.official_url ?? '',
    official_url_status: office.official_url_status ?? 'unchecked',
    fallback_url: office.fallback_url ?? '',
    e_filing_url: office.e_filing_url ?? '',
    download_page_url: office.download_page_url ?? '',
    map_url: office.map_url ?? '',
    business_hours: office.business_hours ?? '',
    notes: office.notes ?? '',
    municipality_ids: municipalityIds,
  };

  return (
    <div className="space-y-6">
      <Link href="/admin/offices" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        管轄機関一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">管轄機関を編集</h1>
      <OfficeForm municipalities={municipalities} organizationTypes={organizationTypes} initialValues={initialValues} />
    </div>
  );
}
