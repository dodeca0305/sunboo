import { createServerSupabase } from '@/lib/supabase/server';
import OrganizationTypesTable, { type OrganizationTypeRow } from './OrganizationTypesTable';

export default async function AdminOrganizationTypesPage() {
  const supabase = await createServerSupabase();

  let types: OrganizationTypeRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('organization_types')
      .select('id, code, name, description, sort_order, is_active')
      .order('sort_order');
    types = (data as OrganizationTypeRow[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">機関種別</h1>
        <p className="mt-1 text-sm text-gray-500">
          行政機関の種別マスタです。{types.length}件。手続き（office_type）・管轄機関（organizations）から参照されます。
        </p>
      </div>

      <OrganizationTypesTable types={types} />
    </div>
  );
}
