import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import OfficesTable, { type OfficeRow } from './OfficesTable';

type RawOffice = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  official_url_status: string | null;
  organizations: { name: string; organization_types: { code: string; name: string } | null } | null;
};

type RawJurisdiction = {
  organization_office_id: number;
  municipalities: { name: string; prefectures: { name: string } | null } | null;
};

export default async function AdminOfficesPage() {
  const supabase = await createServerSupabase();

  let offices: OfficeRow[] = [];
  if (supabase) {
    const [{ data }, { data: jurisdictionData }] = await Promise.all([
      supabase
        .from('organization_offices')
        .select('id, name, address, phone, official_url_status, organizations(name, organization_types(code, name))')
        .order('id'),
      supabase.from('jurisdictions').select('organization_office_id, municipalities(name, prefectures(name))'),
    ]);

    const municipalitiesByOffice = new Map<number, string[]>();
    let prefectureByOffice = new Map<number, string>();
    for (const j of (jurisdictionData as unknown as RawJurisdiction[] | null) ?? []) {
      const name = j.municipalities?.name;
      if (!name) continue;
      const list = municipalitiesByOffice.get(j.organization_office_id) ?? [];
      list.push(name);
      municipalitiesByOffice.set(j.organization_office_id, list);
      const prefName = j.municipalities?.prefectures?.name;
      if (prefName) prefectureByOffice.set(j.organization_office_id, prefName);
    }

    offices = ((data as unknown as RawOffice[] | null) ?? []).map((o) => ({
      id: o.id,
      office_type: o.organizations?.organization_types?.code ?? 'other',
      office_type_name: o.organizations?.organization_types?.name ?? 'その他',
      organization_name: o.organizations?.name ?? '',
      name: o.name,
      address: o.address,
      phone: o.phone,
      official_url_status: o.official_url_status,
      municipality_names: municipalitiesByOffice.get(o.id) ?? [],
      prefecture_name: prefectureByOffice.get(o.id) ?? null,
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">管轄機関</h1>
          <p className="mt-1 text-sm text-gray-500">{offices.length}件</p>
        </div>
        <Link href="/admin/offices/new" className="btn-primary shrink-0 py-2 px-4 text-xs">
          <Plus className="h-3.5 w-3.5" />
          新規追加
        </Link>
      </div>

      <OfficesTable offices={offices} />
    </div>
  );
}
