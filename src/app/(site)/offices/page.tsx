import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import OfficeList from './OfficeList';
import type { OfficeItem } from './OfficeList';

// Supabase の JOIN 結果型（municipalities は REFERENCES から自動 JOIN）
type RawOffice = {
  id: number;
  office_type: string;
  name: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  map_url: string | null;
  official_url?: string | null;
  official_url_status?: string;
  fallback_url?: string | null;
  municipalities: { name: string } | null;
};

export default async function OfficesPage() {
  let offices: OfficeItem[] = [];

  if (supabase) {
    const { data } = await supabase
      .from('jurisdiction_offices')
      .select('*, municipalities(name)')
      .order('id');

    offices = ((data as RawOffice[] | null) ?? []).map((o) => ({
      id: o.id,
      office_type: o.office_type,
      name: o.name,
      address: o.address,
      phone: o.phone,
      website_url: o.website_url,
      map_url: o.map_url,
      municipality_name: o.municipalities?.name ?? null,
      official_url: o.official_url,
      official_url_status: o.official_url_status,
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
        <Link href="/start" className="btn-primary shrink-0 py-2 px-4 text-xs">
          診断する →
        </Link>
      </div>

      <OfficeList offices={offices} />
    </div>
  );
}
