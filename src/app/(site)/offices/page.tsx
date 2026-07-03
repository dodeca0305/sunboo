import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import OfficeList from './OfficeList';
import type { OfficeItem } from './OfficeList';

type RawOffice = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  map_url: string | null;
  official_url: string | null;
  official_url_status: string | null;
  fallback_url: string | null;
  organizations: { organization_types: { code: string } | null } | null;
};

type RawJurisdiction = {
  organization_office_id: number;
  municipalities: { name: string } | null;
};

export default async function OfficesPage() {
  let offices: OfficeItem[] = [];

  if (supabase) {
    const [{ data: officeData }, { data: jurisdictionData }] = await Promise.all([
      supabase
        .from('organization_offices')
        .select(
          'id, name, address, phone, website_url, map_url, official_url, official_url_status, fallback_url, ' +
            'organizations(organization_types(code))',
        )
        .order('id'),
      supabase.from('jurisdictions').select('organization_office_id, municipalities(name)'),
    ]);

    const municipalityNamesByOffice = new Map<number, string[]>();
    for (const j of (jurisdictionData as unknown as RawJurisdiction[] | null) ?? []) {
      const name = j.municipalities?.name;
      if (!name) continue;
      const list = municipalityNamesByOffice.get(j.organization_office_id) ?? [];
      list.push(name);
      municipalityNamesByOffice.set(j.organization_office_id, list);
    }

    offices = ((officeData as unknown as RawOffice[] | null) ?? []).map((o) => ({
      id: o.id,
      office_type: o.organizations?.organization_types?.code ?? 'other',
      name: o.name,
      address: o.address,
      phone: o.phone,
      website_url: o.website_url,
      map_url: o.map_url,
      municipality_names: municipalityNamesByOffice.get(o.id) ?? [],
      official_url: o.official_url,
      official_url_status: o.official_url_status ?? undefined,
      fallback_url: o.fallback_url,
    }));
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* ページヘッダー */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">管轄機関一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            各種手続きの提出先となる行政機関の一覧です
          </p>
        </div>
        <Link href="/start" className="btn-primary shrink-0 px-4 py-2 text-xs">
          診断する →
        </Link>
      </div>

      <OfficeList offices={offices} />
    </div>
  );
}
