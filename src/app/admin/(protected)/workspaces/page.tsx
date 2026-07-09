import Link from 'next/link';
import { Plus, Building2 } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';

// ── Company Workspace — 会社一覧（Sprint23 Phase23.1）────────────
// workspace_companies（Sprint22.4 MVP migration）を一覧表示するだけの入口画面。
// Profile/TaxReturn/Roadmap/共有等の実装は本Sprintでは行わない（docs/COMPANY_WORKSPACE.md参照）。

type WorkspaceCompanyRow = {
  id: number;
  name: string;
  corporate_type: string;
  fiscal_month: number | null;
  updated_at: string;
};

const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

export default async function WorkspacesPage() {
  const supabase = await createServerSupabase();

  let companies: WorkspaceCompanyRow[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('workspace_companies')
      .select('id, name, corporate_type, fiscal_month, updated_at')
      .order('updated_at', { ascending: false });
    companies = (data as WorkspaceCompanyRow[] | null) ?? [];
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">顧問先（Company Workspace）</h1>
          <p className="mt-1 text-sm text-gray-500">{companies.length}件</p>
        </div>
        <Link href="/admin/workspaces/new" className="btn-primary shrink-0 py-2 px-4 text-xs">
          <Plus className="h-3.5 w-3.5" />
          新しい会社を登録
        </Link>
      </div>

      {companies.length === 0 ? (
        <div className="card py-12 text-center">
          <Building2 className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="font-semibold text-gray-700">登録済みの会社がありません</p>
          <p className="mt-1 text-sm text-gray-500">「新しい会社を登録」から最初の顧問先を追加してください。</p>
        </div>
      ) : (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500">
                <th className="px-4 py-3">会社名</th>
                <th className="px-4 py-3">法人種別</th>
                <th className="px-4 py-3">決算月</th>
                <th className="px-4 py-3">更新日</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/workspaces/${c.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{CORPORATE_TYPE_LABEL[c.corporate_type] ?? c.corporate_type}</td>
                  <td className="px-4 py-3 text-gray-600">{c.fiscal_month ? `${c.fiscal_month}月` : '未設定'}</td>
                  <td className="px-4 py-3 text-gray-500">{new Date(c.updated_at).toLocaleDateString('ja-JP')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
