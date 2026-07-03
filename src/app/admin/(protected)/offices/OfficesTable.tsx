'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Pencil, Trash2, Building2 } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { linkStatusLabel } from '@/lib/adminConstants';

export type OfficeRow = {
  id: number;
  office_type: string;
  office_type_name: string;
  organization_name: string;
  name: string;
  address: string | null;
  phone: string | null;
  official_url_status: string | null;
  municipality_names: string[];
  prefecture_name: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  ok: 'bg-gray-100 text-gray-600',
  broken: 'bg-red-50 text-red-600',
  redirected: 'bg-gray-100 text-gray-600',
  unchecked: 'bg-gray-100 text-gray-600',
};

export default function OfficesTable({ offices }: { offices: OfficeRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return offices;
    return offices.filter((o) =>
      [o.name, o.organization_name, o.address, o.phone, o.prefecture_name, o.office_type_name, ...o.municipality_names]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [offices, query]);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？対応する市区町村の管轄設定も削除されます。この操作は取り消せません。`)) return;

    const supabase = createBrowserSupabase();
    if (!supabase) return;

    setDeletingId(id);
    const { error } = await supabase.from('organization_offices').delete().eq('id', id);
    setDeletingId(null);

    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    router.refresh();
  }

  if (offices.length === 0) {
    return (
      <div className="card py-12 text-center">
        <Building2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-semibold text-gray-700">管轄機関がまだ登録されていません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名称・住所・市区町村で検索"
          className="form-input pl-9"
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[800px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">窓口名</th>
              <th className="px-4 py-3">種別</th>
              <th className="px-4 py-3">所在地</th>
              <th className="px-4 py-3">対応市区町村</th>
              <th className="px-4 py-3">リンク状態</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{o.name}</p>
                  {o.organization_name !== o.name && (
                    <p className="text-xs text-gray-400">{o.organization_name}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{o.office_type_name}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  <p>{o.address ?? '—'}</p>
                  <p className="text-gray-400">{o.phone ?? ''}</p>
                </td>
                <td className="px-4 py-3 max-w-[220px] text-xs text-gray-500">
                  {o.municipality_names.length > 0 ? (
                    <span className="line-clamp-2">{o.municipality_names.join('、')}</span>
                  ) : (
                    <span className="text-gray-300">未設定</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      STATUS_BADGE[o.official_url_status ?? 'unchecked']
                    }`}
                  >
                    {linkStatusLabel(o.official_url_status)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/offices/${o.id}`}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      aria-label="編集"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(o.id, o.name)}
                      disabled={deletingId === o.id}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-red-600 disabled:opacity-50"
                      aria-label="削除"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">該当する機関がありません</p>
        )}
      </div>
    </div>
  );
}
