'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Pencil, Trash2, ClipboardList } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { officeTypeLabel, PROCEDURE_CATEGORIES } from '@/lib/adminConstants';

export type ProcedureRow = {
  id: number;
  code: string;
  name: string;
  category: string;
  office_type: string;
  requires_employees: boolean;
  priority: number;
  is_active: boolean;
};

function categoryLabel(value: string) {
  return PROCEDURE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export default function ProceduresTable({ procedures }: { procedures: ProcedureRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return procedures;
    return procedures.filter((p) =>
      [p.name, p.code, categoryLabel(p.category), officeTypeLabel(p.office_type)]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [procedures, query]);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？関連する必要書類・公式リンクも削除されます。`)) return;

    const supabase = createBrowserSupabase();
    if (!supabase) return;

    setDeletingId(id);
    const { error } = await supabase.from('procedures').delete().eq('id', id);
    setDeletingId(null);

    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    router.refresh();
  }

  if (procedures.length === 0) {
    return (
      <div className="card py-12 text-center">
        <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-semibold text-gray-700">手続きがまだ登録されていません</p>
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
          placeholder="名称・コード・カテゴリで検索"
          className="form-input pl-9"
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">手続き名</th>
              <th className="px-4 py-3">カテゴリ</th>
              <th className="px-4 py-3">提出先</th>
              <th className="px-4 py-3">従業員要件</th>
              <th className="px-4 py-3">状態</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{p.name}</p>
                  <p className="text-xs text-gray-400">{p.code}</p>
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{categoryLabel(p.category)}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{officeTypeLabel(p.office_type)}</td>
                <td className="px-4 py-3 text-xs text-gray-500">{p.requires_employees ? 'あり' : 'なし'}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      p.is_active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {p.is_active ? '有効' : '無効'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/procedures/${p.id}`}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      aria-label="編集"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(p.id, p.name)}
                      disabled={deletingId === p.id}
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
          <p className="px-4 py-8 text-center text-sm text-gray-400">該当する手続きがありません</p>
        )}
      </div>
    </div>
  );
}
