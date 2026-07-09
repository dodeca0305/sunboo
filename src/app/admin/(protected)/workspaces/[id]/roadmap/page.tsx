import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, CalendarRange, Info, AlertTriangle } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { workspaceRowsToCompanyProfile, type WorkspaceCompanyProfileRow, type WorkspaceCompanyRow } from '@/lib/workspaceCompanyProfile';
import { buildStateFromTimeline } from '@/lib/state';
import { buildAnnualRoadmap } from '@/lib/roadmap';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';

// ── Company Workspace — 年間ロードマップ（Sprint 23 Phase23.3）──────────
// buildAnnualRoadmap（src/lib/roadmap.ts）・buildStateFromTimeline（src/lib/state.ts）は
// いずれも無変更で再利用する。表示は AnnualRoadmapView（src/components/）を
// src/app/(site)/roadmap/page.tsx と共有する。
//
// 【Sprint23.3のスコープ】workspace_timeline_events・workspace_tax_return_profiles・
// workspace_company_events はまだ存在しない（Sprint22.4 MVP migrationの対象外）ため、
// Timelineは空配列として扱う（buildStateFromTimeline([])）。この結果、Stateの全フィールドは
// 常にincompleteになり、State経由でのみ判定される項目（消費税確定申告の追加等、
// src/lib/roadmap.ts参照）はRoadmapに反映されない。一方、CompanyProfile
// （workspace_company_profilesの値）を直接参照する項目（会社ステージによる設立系手続きの
// 除外、源泉所得税の特例、決算月・法人種別・従業員数）は本Sprintでも正しく反映される。
// この差はSprint22.4のDBスキーマを変更せずに対応する本Sprintの制約による既知の限界であり、
// workspace_timeline_events等の実装（Sprint23.4以降）で解消する見込み。

export default async function WorkspaceRoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  if (!supabase) notFound();

  const { data: companyData } = await supabase
    .from('workspace_companies')
    .select('id, name, prefecture_code, municipality_code, corporate_type, fiscal_month')
    .eq('id', companyId)
    .maybeSingle();

  const company = companyData as WorkspaceCompanyRow | null;
  if (!company) notFound();

  // buildAnnualRoadmapは診断エンジン・Rule Engineへの複数のDB問い合わせを内部で行うため、
  // 想定外のデータ（DB行の欠落・形式不一致等）で例外が出ても画面が真っ白/無反応にならないよう、
  // try/catchで捕捉してエラーカードを表示する（Sprint23.3レビューで追加した防御的措置）。
  let roadmapYears: Awaited<ReturnType<typeof buildAnnualRoadmap>> = [];
  let computeError: string | null = null;
  try {
    const [{ data: profileData }, { data: prefData }, { data: muniData }] = await Promise.all([
      supabase.from('workspace_company_profiles').select('*').eq('company_id', companyId).maybeSingle(),
      supabase.from('prefectures').select('name').eq('code', company.prefecture_code).maybeSingle(),
      supabase.from('municipalities').select('name').eq('code', company.municipality_code).maybeSingle(),
    ]);

    const profile = (profileData as WorkspaceCompanyProfileRow | null) ?? null;
    const prefectureName = (prefData as { name: string } | null)?.name ?? '';
    const municipalityName = (muniData as { name: string } | null)?.name ?? '';

    const companyProfile = workspaceRowsToCompanyProfile(company, profile, prefectureName, municipalityName);

    // Timeline未実装のため空配列扱い（本ファイル冒頭コメント参照）
    const state = buildStateFromTimeline([]);
    roadmapYears = await buildAnnualRoadmap(supabase, companyProfile, state, 3);
  } catch (err) {
    computeError = err instanceof Error ? err.message : '不明なエラー';
  }
  const totalItemCount = roadmapYears.reduce((sum, y) => sum + y.items.length, 0);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/workspaces/${companyId}`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        {company.name} に戻る
      </Link>

      <div className="flex items-center gap-2.5">
        <CalendarRange className="h-6 w-6 text-blue-600" />
        <h1 className="text-xl font-bold text-gray-900">年間ロードマップ — {company.name}</h1>
      </div>

      <div className="card flex items-start gap-3 border-gray-200 bg-gray-50/60">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
        <p className="text-xs leading-relaxed text-gray-500">
          今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
          必ず各公式機関の最新情報をご確認ください。「情報不足」「推定」の表示がある手続きは、
          会社プロフィールや決算実績の登録状況によって内容が変わる可能性があります。
        </p>
      </div>

      {computeError ? (
        <div className="card flex items-start gap-2 border-red-200 bg-red-50 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">ロードマップの計算中にエラーが発生しました</p>
            <p className="mt-1 text-xs text-red-600">{computeError}</p>
          </div>
        </div>
      ) : totalItemCount === 0 ? (
        <div className="card border-gray-200 bg-gray-50/60 text-sm text-gray-600">
          表示できる手続きがありません。会社プロフィールの決算月などの登録状況をご確認ください。
        </div>
      ) : (
        <AnnualRoadmapView roadmapYears={roadmapYears} />
      )}
    </div>
  );
}
