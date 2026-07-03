import { createServerSupabase } from '@/lib/supabase/server';
import LinksTable, { type LinkRow } from './LinksTable';

type RawOffice = {
  id: number;
  name: string;
  official_url: string | null;
  official_url_status: string | null;
  official_url_checked_at: string | null;
  fallback_url: string | null;
  organizations: { name: string } | null;
};

type RawOfficialLink = {
  id: number;
  label: string;
  url: string;
  status: string | null;
  checked_at: string | null;
  fallback_url: string | null;
  procedures: { name: string } | null;
};

export default async function AdminLinksPage() {
  const supabase = await createServerSupabase();

  let rows: LinkRow[] = [];

  if (supabase) {
    const [{ data: officesRaw }, { data: linksRaw }] = await Promise.all([
      supabase
        .from('organization_offices')
        .select('id, name, official_url, official_url_status, official_url_checked_at, fallback_url, organizations(name)')
        .order('id'),
      supabase
        .from('official_links')
        .select('id, label, url, status, checked_at, fallback_url, procedures(name)')
        .order('id'),
    ]);

    const officeRows: LinkRow[] = ((officesRaw as unknown as RawOffice[] | null) ?? [])
      .filter((o) => o.official_url)
      .map((o) => ({
        kind: 'office',
        id: o.id,
        title: o.name,
        subtitle: o.organizations?.name ?? '',
        url: o.official_url as string,
        status: o.official_url_status ?? 'unchecked',
        checked_at: o.official_url_checked_at,
        fallback_url: o.fallback_url,
      }));

    const procedureLinkRows: LinkRow[] = ((linksRaw as unknown as RawOfficialLink[] | null) ?? []).map((l) => ({
      kind: 'procedure_link',
      id: l.id,
      title: l.label,
      subtitle: l.procedures?.name ?? '',
      url: l.url,
      status: l.status ?? 'unchecked',
      checked_at: l.checked_at,
      fallback_url: l.fallback_url,
    }));

    rows = [...officeRows, ...procedureLinkRows];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">リンクチェック</h1>
        <p className="mt-1 text-sm text-gray-500">
          管轄機関の公式URLと手続きの公式リンクをまとめて確認・更新できます（{rows.length}件）
        </p>
      </div>
      <LinksTable rows={rows} />
    </div>
  );
}
