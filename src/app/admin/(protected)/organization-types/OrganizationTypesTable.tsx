'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Check } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export type OrganizationTypeRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

export default function OrganizationTypesTable({ types }: { types: OrganizationTypeRow[] }) {
  const router = useRouter();
  const [savingId, setSavingId] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<Record<number, Partial<OrganizationTypeRow>>>({});
  const [newRow, setNewRow] = useState({ code: '', name: '', description: '', sort_order: 0 });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function draftValue<K extends keyof OrganizationTypeRow>(row: OrganizationTypeRow, key: K): OrganizationTypeRow[K] {
    return (drafts[row.id]?.[key] as OrganizationTypeRow[K]) ?? row[key];
  }

  function setDraft(id: number, patch: Partial<OrganizationTypeRow>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function handleSave(row: OrganizationTypeRow) {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    setError(null);
    setSavingId(row.id);

    const payload = {
      name: draftValue(row, 'name'),
      description: draftValue(row, 'description') || null,
      sort_order: draftValue(row, 'sort_order'),
      is_active: draftValue(row, 'is_active'),
    };

    const { error: saveError } = await supabase.from('organization_types').update(payload).eq('id', row.id);
    setSavingId(null);

    if (saveError) {
      setError(`保存に失敗しました: ${saveError.message}`);
      return;
    }
    router.refresh();
  }

  async function handleAdd() {
    if (!newRow.code.trim() || !newRow.name.trim()) {
      setError('コードと名称は必須です。');
      return;
    }
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    setError(null);
    setAdding(true);

    const { error: saveError } = await supabase.from('organization_types').insert({
      code: newRow.code.trim(),
      name: newRow.name.trim(),
      description: newRow.description.trim() || null,
      sort_order: newRow.sort_order,
      is_active: true,
    });
    setAdding(false);

    if (saveError) {
      setError(`追加に失敗しました: ${saveError.message}`);
      return;
    }
    setNewRow({ code: '', name: '', description: '', sort_order: 0 });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">コード</th>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">説明</th>
              <th className="px-4 py-3 w-20">表示順</th>
              <th className="px-4 py-3 w-16">有効</th>
              <th className="px-4 py-3 text-right w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {types.map((row) => (
              <tr key={row.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2.5">
                  <code className="text-xs text-gray-400">{row.code}</code>
                </td>
                <td className="px-4 py-2.5">
                  <input
                    value={draftValue(row, 'name')}
                    onChange={(e) => setDraft(row.id, { name: e.target.value })}
                    className="form-input py-1.5 text-sm"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    value={draftValue(row, 'description') ?? ''}
                    onChange={(e) => setDraft(row.id, { description: e.target.value })}
                    className="form-input py-1.5 text-sm"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="number"
                    value={draftValue(row, 'sort_order')}
                    onChange={(e) => setDraft(row.id, { sort_order: Number(e.target.value) })}
                    className="form-input py-1.5 text-sm"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={draftValue(row, 'is_active')}
                    onChange={(e) => setDraft(row.id, { is_active: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => handleSave(row)}
                    disabled={savingId === row.id}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600 disabled:opacity-50"
                    aria-label="保存"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card space-y-3">
        <p className="text-xs font-semibold text-gray-500">新しい機関種別を追加</p>
        <div className="grid gap-3 sm:grid-cols-4">
          <input
            value={newRow.code}
            onChange={(e) => setNewRow((v) => ({ ...v, code: e.target.value }))}
            placeholder="code（例: chamber_of_commerce）"
            className="form-input py-2 text-sm"
          />
          <input
            value={newRow.name}
            onChange={(e) => setNewRow((v) => ({ ...v, name: e.target.value }))}
            placeholder="名称"
            className="form-input py-2 text-sm"
          />
          <input
            value={newRow.description}
            onChange={(e) => setNewRow((v) => ({ ...v, description: e.target.value }))}
            placeholder="説明（任意）"
            className="form-input py-2 text-sm"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="btn-secondary justify-center gap-1.5 text-sm disabled:opacity-60"
          >
            <Plus className="h-3.5 w-3.5" />
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
