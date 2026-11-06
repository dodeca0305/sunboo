import { loadWorkspaceCompanyForRead } from '@/lib/workspaceHomeData';
import {
  loadPlanningSources,
  loadPlanningDerived,
  planningRead,
} from '@/lib/workspacePlanningData';
import WorkspacePlanningSources from '@/components/WorkspacePlanningSources';
import WorkspaceReadReloadButton from '@/components/WorkspaceReadReloadButton';
import { notFound } from 'next/navigation';
import { FileStack } from 'lucide-react';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadWorkspaceRoadmapContext } from '@/lib/workspaceLoader';
import WorkspaceDocumentsView from '@/components/WorkspaceDocumentsView';
import PageHeader from '@/components/PageHeader';
import InformationCard from '@/components/InformationCard';
import {
  buildWorkspaceRequiredDocuments,
  type WorkspaceRequiredDocument,
} from '@/lib/workspaceRequiredDocuments';
import { loadWorkspaceDocumentsForEditing } from '@/lib/workspaceDocumentData';

// ── Company Workspace — 書類（Sprint 26 Workspace Documents MVP・Sprint 34・Sprint 85）───────
// workspace_documents（Sprint26新設）のステータス（メタデータのみ）を一覧表示・変更する。
// ファイルアップロードはスコープ外。ステータス変更自体はWorkspaceDocumentsView内で完結する
// （Server Componentである本ページからは関数propsを渡せないため、roadmap/page.tsxと同じ構成）。
// 【Sprint34でデータ取得を共通化】company取得・書類ステータス取得をsrc/lib/workspaceLoader.ts
// （loadWorkspaceCompany・loadWorkspaceDocumentStatuses）へ切り出した。
// 【Sprint85で追加】「単なる一覧」ではなく「今年提出した書類の記録」であることが伝わるよう、
// 既存statusMapから登録済み件数を数えるだけの表示専用の集計を追加した（新しいDB問い合わせ・
// 新しいステータス種別は追加していない）。

export default async function WorkspaceDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);
  if (!Number.isInteger(companyId)) notFound();

  const supabase = await createServerSupabase();
  const companyRead = await loadWorkspaceCompanyForRead(supabase, companyId);
  if (companyRead.status === 'missing') notFound();
  if (!supabase || companyRead.status !== 'loaded')
    return (
      <div role="alert">
        <InformationCard kind="error" title="会社情報を取得できません">
          通信状態をご確認のうえ、再読み込みしてください。
          <WorkspaceReadReloadButton />
        </InformationCard>
      </div>
    );
  const company = companyRead.company;

  const [sources, documentsRead] = await Promise.all([
    loadPlanningSources(supabase, company),
    planningRead(supabase, companyId, (c) =>
      loadWorkspaceDocumentsForEditing(c, companyId),
    ),
  ]);
  const derived = await loadPlanningDerived(
    supabase,
    companyId,
    sources,
    (client, readInputs) =>
      loadWorkspaceRoadmapContext(client, company, 3, { readInputs }),
  );
  const documents =
    documentsRead.status === 'loaded' ? documentsRead.value : null;
  const missingFiscalMonth =
    sources.profile.status === 'loaded' &&
    sources.profile.value.fiscalMonth === null;
  let requiredDocuments: WorkspaceRequiredDocument[] | null = null;
  if (
    derived.status === 'loaded' &&
    sources.statuses.status === 'loaded' &&
    !missingFiscalMonth
  ) {
    requiredDocuments = buildWorkspaceRequiredDocuments(
      derived.value.roadmapYears,
      sources.statuses.value,
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={FileStack}
        title="会社の書類"
        subtitle={
          documents === null
            ? `${company.name}の書類の登録状況を取得できませんでした。`
            : `${company.name}の代表的な書類の登録状況`
        }
      />


      <InformationCard kind="info" title="いつの書類か、手元の書類で確認してください">
        <p>書類の状態と、原本で確認した対象期間・発行日を記録できます。不明な時期は空欄のまま残せます。</p>
        <p className="mt-2">「登録済み」でも、今年分・最新版・提出済みとは限りません。申告書は対象期間、登記簿謄本は発行日を、原本で確認してください。</p>
        <p className="mt-2">ファイルの添付や行政機関への提出は行いません。</p>
      </InformationCard>

      <WorkspacePlanningSources sources={sources} />

      {documents === null ? (
        <>
          <div role="alert">
            <InformationCard
              kind="error"
              title="書類の登録状況を取得できませんでした"
            >
              登録済み・準備済みの状態を確認できないため、書類の状態変更を停止しています。
              <a
                className="mt-2 block underline"
                href={`/admin/workspaces/${companyId}/documents`}
              >
                再読み込み
              </a>
            </InformationCard>
          </div>
          {requiredDocuments !== null && requiredDocuments.length > 0 && (
            <section
              className="card p-4 space-y-2"
              data-testid="required-documents-readonly"
            >
              <h2 className="font-semibold">算出できた必要書類</h2>
              <p>準備状況は取得できません。状態の変更は停止しています。</p>
              <ul>
                {requiredDocuments.map((document) => (
                  <li key={document.name}>
                    {document.name}（最も近い期限：{document.nearestDueDate}）
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <WorkspaceDocumentsView
          key={`${companyId}:${JSON.stringify(documents)}`}
          companyId={companyId}
          snapshots={documents.snapshots}
          requiredDocuments={requiredDocuments}
          requiredDocumentsMissingFiscalMonth={
            missingFiscalMonth &&
            derived.status === 'loaded' &&
            sources.statuses.status === 'loaded'
          }
          requiredDocumentStatusMap={documents.requiredDocumentStatusMap}
        />
      )}
    </div>
  );
}
