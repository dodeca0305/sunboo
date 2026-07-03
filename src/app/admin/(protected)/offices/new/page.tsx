import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import OfficeForm, { type MunicipalityOption } from '../OfficeForm';

type RawMunicipality = { id: number; code: string; name: string; prefectures: { name: string } | null };

export default async function NewOfficePage() {
  const supabase = await createServerSupabase();

  let municipalities: MunicipalityOption[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('municipalities')
      .select('id, code, name, prefectures(name)')
      .order('code');

    municipalities = ((data as unknown as RawMunicipality[] | null) ?? []).map((m) => ({
      id: m.id,
      code: m.code,
      name: m.name,
      prefecture_name: m.prefectures?.name ?? '',
    }));
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/offices" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        管轄機関一覧に戻る
      </Link>
      <h1 className="text-xl font-bold text-gray-900">管轄機関を追加</h1>
      <OfficeForm municipalities={municipalities} />
    </div>
  );
}
