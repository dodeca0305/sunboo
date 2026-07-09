import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ChevronLeft, Building2, Receipt, CalendarRange, Share2, BarChart3, Sparkles, FileStack,
} from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';

// ── Company Workspace Shell（Sprint23 Phase23.1〜23.3）─────────────
// 会社別Workspaceの「入口」と「骨組み」。会社プロフィール（23.2）・年間ロードマップ（23.3）は
// 実装済みのためリンクを張る。TaxReturn編集・ShareLink発行UIはいずれも次Sprint以降
// （docs/COMPANY_WORKSPACE.md 4節・10節）。

type WorkspaceCompanyRow = {
  id: number;
  name: string;
  corporate_type: string;
  fiscal_month: number | null;
  prefecture_code: string;
  municipality_code: string;
};

const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

const SECTIONS = [
  { icon: Building2, title: '会社プロフィール', description: '税務・労務の現況（CompanyProfile）', hrefSuffix: '/profile', comingSoon: false },
  { icon: Receipt, title: '決算実績', description: '決算のたびの申告実績（TaxReturnProfile）', hrefSuffix: null, comingSoon: false },
  { icon: CalendarRange, title: '年間ロードマップ', description: '今後の手続き予定の一覧', hrefSuffix: '/roadmap', comingSoon: false },
  { icon: Share2, title: '共有', description: '経営者への共有リンクの発行・管理', hrefSuffix: null, comingSoon: false },
  { icon: BarChart3, title: '会計分析', description: '決算実績の推移分析', hrefSuffix: null, comingSoon: true },
  { icon: Sparkles, title: 'AI参謀', description: '優先度判断・アドバイス', hrefSuffix: null, comingSoon: true },
  { icon: FileStack, title: '書類', description: '決算書・登記簿謄本等の添付', hrefSuffix: null, comingSoon: true },
] as const;

export default async function WorkspaceCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const { data } = await supabase
    .from('workspace_companies')
    .select('id, name, corporate_type, fiscal_month, prefecture_code, municipality_code')
    .eq('id', companyId)
    .maybeSingle();

  const company = data as WorkspaceCompanyRow | null;
  if (!company) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin/workspaces" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" />
        顧問先一覧に戻る
      </Link>

      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-xl font-bold text-gray-900">{company.name}</h1>
          <span className="tag">{CORPORATE_TYPE_LABEL[company.corporate_type] ?? company.corporate_type}</span>
          {company.fiscal_month && <span className="tag">決算月: {company.fiscal_month}月</span>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ icon: Icon, title, description, hrefSuffix, comingSoon }) => {
          const content = (
            <>
              <Icon className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">{title}</p>
                  {comingSoon && <span className="tag border-gray-200 text-gray-400">Coming Soon</span>}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-500">{description}</p>
              </div>
            </>
          );
          return hrefSuffix ? (
            <Link
              key={title}
              href={`/admin/workspaces/${companyId}${hrefSuffix}`}
              className="card flex items-start gap-3 transition-colors hover:border-blue-200 hover:bg-blue-50/40"
            >
              {content}
            </Link>
          ) : (
            <div key={title} className="card flex items-start gap-3">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
