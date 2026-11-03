import { AlertTriangle, Building2, CalendarRange } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildWorkspaceTimelineEvents } from '@/lib/workspaceTimelineProducer';
import { buildStateFromTimeline } from '@/lib/state';
import { buildAnnualRoadmap } from '@/lib/roadmap';
import {
  loadSharedWorkspaceRead,
  loadSharedRoadmap,
} from '@/lib/workspaceSharedReadData';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import { applyCutoverToRoadmapYears } from '@/lib/submissionDirectoryCutover';
import AnnualRoadmapView from '@/components/AnnualRoadmapView';
import InformationCard from '@/components/InformationCard';
import AnalyticsPageEvent from '@/components/AnalyticsPageEvent';

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

export default async function SharedWorkspacePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const view = await loadSharedWorkspaceRead(supabase, token);
  if (view.status === 'invalid')
    return (
      <InvalidLinkNotice message="このリンクは無効か、有効期限が切れています。共有元にお問い合わせください。" />
    );
  if (view.status === 'not_shared')
    return (
      <InvalidLinkNotice message="会社概要は共有されていません。共有元に公開範囲をご確認ください。" />
    );
  if (view.status !== 'loaded' || !supabase)
    return (
      <div className="mx-auto max-w-md px-4 py-20" role="alert">
        <InformationCard kind="error" title="共有情報を取得できません">
          リンクが無効とは判定できません。通信状態をご確認のうえ再読み込みしてください。
          <WorkspaceReadReloadButton />
        </InformationCard>
      </div>
    );
  const company = view.company;
  const roadmapShared = view.sections.includes('roadmap');
  const companyProfile =
    view.profile.status === 'loaded' ? view.profile.value : null;
  const prefectureName = companyProfile?.prefectureName ?? '';
  const municipalityName = companyProfile?.municipalityName ?? '';
  const statusMap =
    view.statuses.status === 'loaded' ? view.statuses.value : undefined;
  const derived = roadmapShared
    ? await loadSharedRoadmap(
        supabase,
        view,
        async (client, profile, taxReturns) => {
          const state = buildStateFromTimeline(
            buildWorkspaceTimelineEvents(profile, taxReturns),
          );
          const years = await buildAnnualRoadmap(client, profile, state, 3);
          return applyCutoverToRoadmapYears(client, years, {
            municipalityCode: company.municipality_code,
            prefectureCode: company.prefecture_code,
          });
        },
      )
    : null;
  const roadmapYears = derived?.status === 'loaded' ? derived.value : [];
  const missingInputScope =
    roadmapShared &&
    (view.profile.status === 'not_shared' ||
      view.taxReturns.status === 'not_shared');
  const totalItemCount = roadmapYears.reduce(
    (sum, y) => sum + y.items.length,
    0,
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <AnalyticsPageEvent
        event="share_opened"
        properties={{ workspace_id: company.id, company_id: company.id }}
      />
      {/* SUNBOOは裏方：会社名より前には小さなキャプションのみを置く（Sprint85） */}
      <p className="mb-3 flex items-center gap-1.5 text-sunboo-tiny uppercase text-sunboo-ink-muted">
        SUNBOOが作成した年間行政ロードマップ
        <span className="tag">閲覧専用</span>
      </p>

      <div className="card mb-6 flex items-start gap-3">
        <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-sunboo-ink-muted" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-sunboo-card-title text-sunboo-ink">
              {company.name}
            </h1>
            <span className="tag">
              {CORPORATE_TYPE_LABEL[company.corporate_type] ??
                company.corporate_type}
            </span>
          </div>
          <p className="mt-1 text-xs text-sunboo-ink-muted">
            {prefectureName}
            {municipalityName}
            {companyProfile?.address ?? ''}
            {company.fiscal_month
              ? ` ／ 決算月: ${company.fiscal_month}月`
              : ''}
          </p>
        </div>
      </div>

      {view.profile.status === 'unavailable' && (
        <div role="alert">
          <InformationCard
            kind="error"
            title="会社プロフィール・所在地を取得できません"
          >
            会社名は表示しています。未取得の入力を既定値に置き換えず、予定の算出を保留しています。
            <WorkspaceReadReloadButton />
          </InformationCard>
        </div>
      )}
      {roadmapShared && (
        <>
          <div className="mb-4 flex items-center gap-2">
            <CalendarRange className="h-5 w-5 text-sunboo-ink-muted" />
            <h2 className="text-sm font-bold text-sunboo-ink">
              年間ロードマップ
            </h2>
          </div>

          {/* Confidence（情報不足・推定タグ）の説明は控えめなDisclaimerとして小さく表示する */}
          <InformationCard kind="disclaimer" className="mb-6">
            今年度から今後2年分の手続き予定を一覧表示する参考情報です。実際の手続き・期限・提出先は
            必ず顧問の専門家・各公式機関の最新情報をご確認ください。「情報不足」「推定」のタグが
            付いた手続きは、会社情報の登録状況によって内容が変わる可能性があるという意味です。
          </InformationCard>

          {view.statuses.status === 'unavailable' && (
            <div role="alert">
              <InformationCard kind="error" title="対応状況を取得できません">
                未着手とは表示しません。
                <WorkspaceReadReloadButton />
              </InformationCard>
            </div>
          )}
          {missingInputScope ? (
            <InformationCard
              kind="info"
              title="予定の算出に必要な入力が共有されていません"
            >
              このリンクの公開範囲では管理画面と同じ入力を確認できないため、予定を保留しています。共有元に必要な公開範囲の確認を依頼してください。決算実績を許可なく取得することはありません。
            </InformationCard>
          ) : derived?.status !== 'loaded' ? (
            <div role="alert" data-testid="shared-roadmap-unavailable">
              <InformationCard kind="error" title="予定を取得できません">
                必要な入力・診断ルール・窓口・提出先の取得が完了するまで、予定なしとは判定しません。
                <WorkspaceReadReloadButton />
              </InformationCard>
            </div>
          ) : company.fiscal_month === null ? (
            <InformationCard kind="info">
              決算月が未登録のため、予定の算出を保留しています。
            </InformationCard>
          ) : totalItemCount === 0 ? (
            <InformationCard kind="info">
              共有された入力から算出される手続き予定はありません。登録情報と対象範囲を共有元にご確認ください。
            </InformationCard>
          ) : (
            <AnnualRoadmapView
              roadmapYears={roadmapYears}
              statusMap={statusMap}
            />
          )}
        </>
      )}

      <InformationCard kind="disclaimer" className="mt-10">
        本ページの情報は一般的な参考情報です。記帳・電子申告・法的助言そのものではありません。
        税務・労務の最終判断は必ず税理士・社労士等の専門家にご確認ください。
      </InformationCard>

      <p className="mt-6 text-center text-[11px] text-sunboo-mist">
        Powered by SUNBOO経営ナビ
      </p>
    </div>
  );
}
