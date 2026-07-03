import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import OfficesTable, { type OfficeRow } from './OfficesTable';

type RawOffice = {
  id: number;
  office_type: string;
  name: string;
  address: string | null;
  phone: string | null;
  official_url_status: string | null;
  municipalities: { name: string; prefectures: { name: string } | null } | null;
};

export default async function AdminOfficesPage() {
  const supabase = await createServerSupabase();

  let offices: OfficeRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('jurisdiction_offices')
      .select('id, office_type, name, address, phone, official_url_status, municipalities(name, prefectures(name))')
      .order('id');

    offices = ((data as unknown as RawOffice[] | null) ?? []).map((o) => ({
      id: o.id,
      office_type: o.office_type,
      name: o.name,
      address: o.address,
      phone: o.phone,
      official_url_status: o.official_url_status,
      municipality_name: o.municipalities?.name ?? null,
      prefecture_name: o.municipalities?.prefectures?.name ?? null,
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
