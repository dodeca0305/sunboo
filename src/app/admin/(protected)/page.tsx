import Link from 'next/link';
import {
  Landmark,
  MapPin,
  Building2,
  ClipboardList,
  FileText,
  Link2,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
} from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';

async function getCount(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  table: string,
) {
  const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
  return count ?? 0;
}

async function getStatusBreakdown(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>,
  table: string,
  column: string,
) {
  const { data } = await supabase.from(table).select(column);
  const rows = (data as Record<string, string | null>[] | null) ?? [];
  const breakdown: Record<string, number> = { ok: 0, broken: 0, redirected: 0, unchecked: 0 };
  for (const row of rows) {
    const status = (row[column] as string | null) ?? 'unchecked';
    breakdown[status] = (breakdown[status] ?? 0) + 1;
  }
  return breakdown;
}

const STAT_CARDS = [
  { table: 'prefectures', label: '都道府県', icon: Landmark },
  { table: 'municipalities', label: '市区町村', icon: MapPin },
  { table: 'organization_offices', label: '管轄機関', icon: Building2 },
  { table: 'procedures', label: '手続き', icon: ClipboardList },
  { table: 'procedure_documents', label: '必要書類', icon: FileText },
  { table: 'official_links', label: '公式リンク（手続き）', icon: Link2 },
] as const;

const STATUS_CONFIG = {
  ok: { label: '正常', icon: CheckCircle2, className: 'text-gray-600 bg-gray-50' },
  broken: { label: 'リンク切れ', icon: AlertTriangle, className: 'text-red-600 bg-red-50' },
  redirected: { label: 'リダイレクト', icon: RefreshCw, className: 'text-gray-600 bg-gray-50' },
  unchecked: { label: '未確認', icon: HelpCircle, className: 'text-gray-500 bg-gray-50' },
} as const;

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabase();

  if (!supabase) {
    return (
      <div className="card py-12 text-center">
        <p className="font-semibold text-gray-700">Supabase が設定されていません</p>
        <p className="mt-2 text-sm text-gray-500">環境変数を確認してください。</p>
      </div>
    );
  }

  const [counts, officeStatus, linkStatus] = await Promise.all([
    Promise.all(STAT_CARDS.map((c) => getCount(supabase, c.table))),
    getStatusBreakdown(supabase, 'organization_offices', 'official_url_status'),
    getStatusBreakdown(supabase, 'official_links', 'status'),
  ]);

  const combinedStatus: Record<string, number> = { ok: 0, broken: 0, redirected: 0, unchecked: 0 };
  for (const key of Object.keys(combinedStatus)) {
    combinedStatus[key] = (officeStatus[key] ?? 0) + (linkStatus[key] ?? 0);
  }
  const totalLinks = Object.values(combinedStatus).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-gray-900">ダッシュボード</h1>
        <p className="mt-1 text-sm text-gray-500">データ件数とリンク健全性の概況です</p>
      </div>

      {/* ── データ件数 ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">データ件数</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {STAT_CARDS.map((c, i) => (
            <div key={c.table} className="card p-4">
              <c.icon className="h-4 w-4 text-blue-500" />
              <p className="mt-2 text-2xl font-bold text-gray-900">{counts[i]}</p>
              <p className="text-xs text-gray-500">{c.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── リンク健全性 ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            リンク健全性
            <span className="ml-2 font-normal text-gray-400">
              （管轄機関の公式URL + 手続きの公式リンク　計{totalLinks}件）
            </span>
          </h2>
          <Link href="/admin/links" className="text-xs font-medium text-blue-600 hover:text-blue-700">
            リンクチェック一覧へ →
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(STATUS_CONFIG) as (keyof typeof STATUS_CONFIG)[]).map((key) => {
            const cfg = STATUS_CONFIG[key];
            return (
              <div key={key} className="card flex items-center gap-3 p-4">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cfg.className}`}>
                  <cfg.icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-lg font-bold text-gray-900">{combinedStatus[key]}</p>
                  <p className="text-xs text-gray-500">{cfg.label}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── クイックリンク ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-gray-700">よく使う操作</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link href="/admin/offices/new" className="card flex items-center gap-3 p-4 hover:border-blue-200">
            <Building2 className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">管轄機関を追加</span>
          </Link>
          <Link href="/admin/procedures/new" className="card flex items-center gap-3 p-4 hover:border-blue-200">
            <ClipboardList className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">手続きを追加</span>
          </Link>
          <Link href="/admin/import" className="card flex items-center gap-3 p-4 hover:border-blue-200">
            <Building2 className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">CSVで一括インポート</span>
          </Link>
          <Link href="/admin/export" className="card flex items-center gap-3 p-4 hover:border-blue-200">
            <FileText className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-gray-700">CSVをエクスポート</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
