import { AlertTriangle, Building2, CalendarRange } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  workspaceRowsToCompanyProfile, type WorkspaceCompanyProfileRow, type WorkspaceCompanyRow,
} from '@/lib/workspaceCompanyProfile';
import { buildWorkspaceTimelineEvents } from '@/lib/workspaceTimelineProducer';
import { buildStateFromTimeline } from '@/lib/state';
import { buildAnnualRoadmap } from '@/lib/roadmap';
import { workspaceProcedureOccurrenceKey, type WorkspaceProcedureStatus, type WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';
import InformationCard from '@/components/InformationCard';

// ── Company Workspace — 経営者向け共有ページ（Sprint 24 Phase24.0・Phase24.1・Sprint 32）───
// ログイン不要・編集不可の閲覧専用ページ。get_shared_workspace_view（Sprint22.4 MVP migration、
// Sprint24.1でstatusesを追加、Sprint32でoccurrence_keyを追加、SECURITY DEFINER RPC）をanonキーで
// 呼び出し、トークンが有効な場合のみ会社情報を受け取る。Roadmap自体はRPCで計算せず（保存しない設計、
// docs/WORKSPACE_DB_DESIGN.md 12-2節）、このページがbuildAnnualRoadmap（無変更）をanonキーの
// クライアントで呼び出して都度計算する（procedures/rulesは既存の公開/roadmapページと同じく
// anonにSELECT許可済みのため成立する）。手続きステータスはRPCが返す"statuses"配列を
// そのまま表示するのみで、companyIdを渡さないため編集はできない
// （AnnualRoadmapViewのeditable判定はstatusMap+companyId両方が必要）。
// AI参謀・書類・会計分析は本Sprintでは共有しない（docs/COMPANY_WORKSPACE.md 5節、要判断事項）。
//
// 【Sprint32で出現回単位に変更】statusMapのキーをworkspaceProcedureOccurrenceKey
// （procedure_id + occurrence_key）へ変更した。RPCが返すoccurrence_keyをそのまま使い、
// 新しい採番ロジックは作らない（docs/PERIODIC_STATUS_REDESIGN.md、Sprint31設計レビューで承認済み）。

const CORPORATE_TYPE_LABEL: Record<string, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

function InvalidLinkNotice({ message }: { message: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-sunboo-mist" />
      <p className="text-sm font-medium text-sunboo-ink">{message}</p>
    </div>
  );
}

export default async function SharedWorkspacePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!supabase) {
    return <InvalidLinkNotice message="データベースに接続できませんでした。時間をおいて再度お試しください。" />;
  }

  const { data: viewData } = await supabase.rpc('get_shared_workspace_view', { p_token: token });
  const view = viewData as {
    company?: WorkspaceCompanyRow;
    profile?: WorkspaceCompanyProfileRow | null;
    statuses?: { procedure_id: number; occurrence_key: string; status: WorkspaceProcedureStatus }[];
  } | null;

  if (!view || !view.company) {
    return <InvalidLinkNotice message="このリンクは無効か、有効期限が切れています。共有元にお問い合わせください。" />;
  }

  const company = view.company;
  const profile = view.profile ?? null;
  const statusMap: WorkspaceProcedureStatusMap = {};
  for (const row of view.statuses ?? []) {
    statusMap[workspaceProcedureOccurrenceKey(row.procedure_id, row.occurrence_key)] = row.status;
  }

  const [{ data: prefData }, { data: muniData }] = await Promise.all([
    supabase.from('prefectures').select('name').eq('code', company.prefecture_code).maybeSingle(),
    supabase.from('municipalities').select('name').eq('code', company.municipality_code).maybeSingle(),
  ]);
  const prefectureName = (prefData as { name: string } | null)?.name ?? '';
  const municipalityName = (muniData as { name: string } | null)?.name ?? '';

  const companyProfile = workspaceRowsToCompanyProfile(company, profile, prefectureName, municipalityName);

  let roadmapYears: Awaited<ReturnType<typeof buildAnnualRoadmap>> = [];
  try {
    const timelineEvents = buildWorkspaceTimelineEvents(companyProfile);
    const state = buildStateFromTimeline(timelineEvents);
    roadmapYears = await buildAnnualRoadmap(supabase, companyProfile, state, 3);
  } catch {
    // ロードマップの計算に失敗しても会社概要は表示を続ける
  }
  const totalItemCount = roadmapYears.reduce((sum, y) => sum + y.items.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      {/* SUNBOOは裏方：会社名より前には小さなキャプションのみを置く（Sprint85） */}
      <p className="mb-3 flex items-center gap-1.5 text-sunboo-tiny uppercase text-sunboo-ink-muted">
        SUNBOOが作成した年間行政ロードマップ
        <span className="tag">閲覧専用</span>
      </p>

      <div className="card mb-6 flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-ink-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sunboo-card-title text-sunboo-ink">{company.name}</h1>
            <span className="tag">{CORPORATE_TYPE_LABEL[company.corporate_type] ?? company.corporate_type}</span>
          </div>
          <p className="mt-1 text-xs text-sunboo-ink-muted">
            {prefectureName}
            {municipalityName}
            {companyProfile.address ?? ''}
            {company.fiscal_month ? ` ／ 決算月: ${company.fiscal_month}月` : ''}
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <CalendarRange className="h-5 w-5 text-sunboo-ink-muted" />
        <h2 className="text-sm font-bold text-sunboo-ink">年間ロードマップ</h2>
      </div>

      {/* Confidence（情報不足・推定タグ）の説明は控えめなDisclaimerとして小さく表示する */}
      <InformationCard kind="disclaimer" className="mb-6">
        今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
        必ず顧問の専門家・各公式機関の最新情報をご確認ください。「情報不足」「推定」のタグが
        付いた手続きは、会社情報の登録状況によって内容が変わる可能性があるという意味です。
      </InformationCard>

      {totalItemCount === 0 ? (
        <InformationCard kind="info">
          今年の手続き予定はまだ登録されていません。
        </InformationCard>
      ) : (
        <AnnualRoadmapView roadmapYears={roadmapYears} statusMap={statusMap} />
      )}

      <InformationCard kind="disclaimer" className="mt-10">
        本ページの情報は一般的な参考情報です。記帳・電子申告・法的助言そのものではありません。
        税務・労務の最終判断は必ず税理士・社労士等の専門家にご確認ください。
      </InformationCard>

      <p className="mt-6 text-center text-[11px] text-sunboo-mist">Powered by SUNBOO経営ナビ</p>
    </div>
  );
}
