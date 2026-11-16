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
import DepreciationDocumentDraft from '@/components/DepreciationDocumentDraft';
import { findDepreciationDocuments } from '@/lib/depreciationDocumentDraft';

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

  // 償却資産申告の下書き：書類・プロフィール・必要書類がすべて取得済みで、
  // 既存の必要書類が償却資産申告書と種類別明細書（償却資産申告）を示すときだけ表示する。
  const depreciation =
    documents !== null &&
    sources.profile.status === 'loaded' &&
    !missingFiscalMonth
      ? findDepreciationDocuments(requiredDocuments)
      : null;
  const depreciationProfile =
    sources.profile.status === 'loaded' ? sources.profile.value : null;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={`/admin/workspaces/${companyId}`}
        backLabel={`${company.name} に戻る`}
        icon={FileStack}
        title="書類を用意する"
        subtitle={
          documents === null
            ? `${company.name}の書類の準備状況を取得できませんでした。`
            : `${company.name}の手続きに必要な書類と、用意の進み具合を確認します。`
        }
      />

      {depreciation && depreciationProfile && (
        <DepreciationDocumentDraft
          key={companyId}
          companyName={company.name}
          prefectureName={depreciationProfile.prefectureName}
          municipalityName={depreciationProfile.municipalityName}
          street={depreciationProfile.address}
          suggestedYear={depreciation.suggestedYear}
        />
      )}

      {documents === null ? (
        <>
          <div role="alert">
            <InformationCard
              kind="error"
              title="書類の準備状況を取得できませんでした"
            >
              記録済み・準備済みの状態を確認できないため、書類の状態変更を停止しています。
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

      <details className="rounded-lg border border-sunboo-mist" data-testid="planning-sources-details">
        <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-bold text-sunboo-ink">
          登録情報を確認する
        </summary>
        <div className="px-4 pb-4">
          <WorkspacePlanningSources sources={sources} />
        </div>
      </details>
    </div>
  );
}
