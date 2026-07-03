'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Search, Link2 } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { LINK_STATUSES } from '@/lib/adminConstants';

export type LinkRow = {
  kind: 'office' | 'procedure_link';
  id: number;
  title: string;
  subtitle: string;
  url: string;
  status: string;
  checked_at: string | null;
  fallback_url: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  ok: 'bg-gray-100 text-gray-600',
  broken: 'bg-red-50 text-red-600',
  redirected: 'bg-gray-100 text-gray-600',
  unchecked: 'bg-gray-100 text-gray-600',
};

const KIND_LABEL: Record<LinkRow['kind'], string> = {
  office: '管轄機関',
  procedure_link: '手続きリンク',
};

export default function LinksTable({ rows: initialRows }: { rows: LinkRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.title, r.subtitle, r.url].some((v) => v.toLowerCase().includes(q));
    });
  }, [rows, query, statusFilter]);

  async function updateStatus(row: LinkRow, newStatus: string) {
    const supabase = createBrowserSupabase();
    if (!supabase) return;

    const key = `${row.kind}-${row.id}`;
    setUpdatingKey(key);

    const table = row.kind === 'office' ? 'organization_offices' : 'official_links';
    const statusColumn = row.kind === 'office' ? 'official_url_status' : 'status';
    const checkedAtColumn = row.kind === 'office' ? 'official_url_checked_at' : 'checked_at';

    const { error } = await supabase
      .from(table)
      .update({ [statusColumn]: newStatus, [checkedAtColumn]: new Date().toISOString() })
      .eq('id', row.id);

    setUpdatingKey(null);

    if (error) {
      alert(`更新に失敗しました: ${error.message}`);
      return;
    }

    setRows((prev) =>
      prev.map((r) =>
        r.kind === row.kind && r.id === row.id
          ? { ...r, status: newStatus, checked_at: new Date().toISOString() }
          : r,
      ),
    );
  }

  if (rows.length === 0) {
    return (
      <div className="card py-12 text-center">
        <Link2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-semibold text-gray-700">確認対象のリンクがありません</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="名称・URLで検索"
            className="form-input pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
              statusFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            全て（{rows.length}）
          </button>
          {LINK_STATUSES.map((s) => {
            const count = rows.filter((r) => r.status === s.value).length;
            return (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  statusFilter === s.value
                    ? 'bg-blue-600 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {s.label}（{count}）
              </button>
            );
          })}
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
              <th className="px-4 py-3">種別</th>
              <th className="px-4 py-3">名称</th>
              <th className="px-4 py-3">URL</th>
              <th className="px-4 py-3">最終確認</th>
              <th className="px-4 py-3">状態</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const key = `${r.kind}-${r.id}`;
              return (
                <tr key={key} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                      {KIND_LABEL[r.kind]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{r.title}</p>
                    {r.subtitle && <p className="text-xs text-gray-400">{r.subtitle}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex max-w-[220px] items-center gap-1 truncate text-xs text-blue-600 hover:underline"
                    >
                      <span className="truncate">{r.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {r.checked_at ? new Date(r.checked_at).toLocaleDateString('ja-JP') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={r.status}
                      disabled={updatingKey === key}
                      onChange={(e) => updateStatus(r, e.target.value)}
                      className={`rounded-full border-0 px-2.5 py-1 text-xs font-semibold outline-none disabled:opacity-50 ${
                        STATUS_BADGE[r.status]
                      }`}
                    >
                      {LINK_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">該当するリンクがありません</p>
        )}
      </div>
    </div>
  );
}
