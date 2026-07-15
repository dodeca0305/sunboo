import type { Metadata } from 'next';
import { supabase } from '@/lib/supabase';
import SearchClient, { type SearchOffice, type SearchProcedure } from './SearchClient';

// 手続き・機関データはSupabase側で随時更新されるため、ビルド時に静的化せず常に最新状態を取得する。
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '検索',
  description: '手続き名・提出先から、必要な行政手続き・管轄機関をキーワードで検索できます。',
  alternates: { canonical: '/search' },
};

type RawProcedure = {
  id: number;
  name: string;
  description: string;
  category: SearchProcedure['category'];
  office_type: string;
  timing_label: string;
  official_links: { label: string; url: string; status?: string; fallback_url?: string | null }[] | null;
  procedure_documents: { name: string; form_number: string | null; is_required: boolean; notes: string | null }[] | null;
  target_note: string | null;
  submission_method: string | null;
  e_filing_system_name: string | null;
  e_filing_system_url: string | null;
  caution_note: string | null;
};

type RawOffice = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  map_url: string | null;
  organizations: { organization_types: { code: string } | null } | null;
};

type RawJurisdiction = {
  organization_office_id: number;
  municipalities: { name: string } | null;
};

export default async function SearchPage() {
  let procedures: SearchProcedure[] = [];
  let offices: SearchOffice[] = [];

  if (supabase) {
    const [{ data: procData }, { data: officeData }, { data: jurisdictionData }] = await Promise.all([
      supabase
        .from('procedures')
        .select(
          'id, name, description, category, office_type, timing_label, ' +
            'official_links(label, url, status, fallback_url), procedure_documents(name, form_number, is_required, notes), ' +
            'target_note, submission_method, e_filing_system_name, e_filing_system_url, caution_note',
        )
        .eq('is_active', true)
        .order('priority'),
      supabase
        .from('organization_offices')
        .select('id, name, address, phone, website_url, map_url, organizations(organization_types(code))')
        .order('id'),
      supabase.from('jurisdictions').select('organization_office_id, municipalities(name)'),
    ]);

    procedures = ((procData as RawProcedure[] | null) ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      category: p.category,
      office_type: p.office_type,
      timing_label: p.timing_label,
      official_links: p.official_links ?? [],
      procedure_documents: p.procedure_documents ?? [],
      target_note: p.target_note,
      submission_method: p.submission_method,
      e_filing_system_name: p.e_filing_system_name,
      e_filing_system_url: p.e_filing_system_url,
      caution_note: p.caution_note,
    }));

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
    }));
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900">検索</h1>
        <p className="mt-2 text-sm text-gray-500">手続き・管轄機関を名前で横断検索できます</p>
      </div>

      <SearchClient procedures={procedures} offices={offices} />
    </div>
  );
}
