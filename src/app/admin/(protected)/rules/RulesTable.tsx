'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Pencil, Trash2, Workflow } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export type RuleRow = {
  id: number;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  condition_count: number;
  action_count: number;
};

export default function RulesTable({ rules }: { rules: RuleRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rules;
    return rules.filter((r) => [r.name, r.description ?? ''].some((v) => v.toLowerCase().includes(q)));
  }, [rules, query]);

  async function handleDelete(id: number, name: string) {
    if (!confirm(`ルール「${name}」を削除しますか？条件・実行内容も削除されます。`)) return;

    const supabase = createBrowserSupabase();
    if (!supabase) return;

    setDeletingId(id);
    const { error } = await supabase.from('rules').delete().eq('id', id);
    setDeletingId(null);

    if (error) {
      alert(`削除に失敗しました: ${error.message}`);
      return;
    }
    router.refresh();
  }

  if (rules.length === 0) {
    return (
      <div className="card py-12 text-center">
        <Workflow className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-semibold text-gray-700">ルールがまだ登録されていません</p>
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
          placeholder="ルール名・説明で検索"
          className="form-input pl-9"
        />
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">ルール名</th>
              <th className="px-4 py-3 w-24">優先度</th>
              <th className="px-4 py-3 w-24">条件数</th>
              <th className="px-4 py-3 w-24">実行内容数</th>
              <th className="px-4 py-3 w-20">状態</th>
              <th className="px-4 py-3 text-right w-20">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{r.name}</p>
                  {r.description && <p className="text-xs text-gray-400">{r.description}</p>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-600">{r.priority}</td>
                <td className="px-4 py-3 text-xs text-gray-600">{r.condition_count}件</td>
                <td className="px-4 py-3 text-xs text-gray-600">{r.action_count}件</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      r.is_active ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {r.is_active ? '有効' : '無効'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/rules/${r.id}`}
                      className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-blue-600"
                      aria-label="編集"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={() => handleDelete(r.id, r.name)}
                      disabled={deletingId === r.id}
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
          <p className="px-4 py-8 text-center text-sm text-gray-400">該当するルールがありません</p>
        )}
      </div>
    </div>
  );
}
