import { isKnownUnavailableSubmissionUrl, correctKnownSubmissionUrl } from './submissionLinkSafety.ts';
import type { ScheduleProcedure } from './scheduleProcedure';
import type { StateConfidence } from './state';
export function procedureTrialGuide(
  procedure: Pick<
    ScheduleProcedure,
    'category' | 'description' | 'target_note'
  >,
  confidence: StateConfidence,
) {
  return {
    kind:
      confidence === 'confirmed'
        ? 'しなければいけないこと（登録情報に基づく手続き候補）'
        : '確認が必要なこと',
    reason:
      procedure.target_note?.trim() ||
      procedure.description?.trim() ||
      '登録情報と既存の手続き判定に基づく案内です。公式案内で該当要否を確認してください。',
    owner: ['tax', 'local_tax'].includes(procedure.category)
      ? '社内の経理担当・顧問税理士'
      : ['labor', 'insurance'].includes(procedure.category)
        ? '社内の労務担当・顧問社労士'
        : ['registration', 'legal'].includes(procedure.category)
          ? '会社代表者・司法書士'
          : '会社の手続き担当・必要に応じて専門家',
    completion:
      '該当要否を確認し、必要な提出・納付等を行い、受付控え・対応記録を保存してから「完了」に更新してください。対象外の場合は理由を社内で確認してください。',
  };
}
export const TAX_TRIAL_SCOPE = {
  title: '法人税確定申告の基本提出時期チェック（TI_TAX_001）',
  scope:
    '法人の直近の決算実績1件について、事業年度末から2か月の基本期間と登録済み申告日を比較します。税務全般、税額計算、延長特例や個別事情を網羅するものではありません。',
  inputs: [
    '会社プロフィール・所在地を正常に取得できること',
    '決算実績の事業年度末日（既存チェックの検証範囲は2023年4月1日以降）と、提出時期を確認する場合の申告日',
    '清算中の残余財産確定に関する特則への該当有無の確認',
    '承認済み・有効なチェックと根拠ルール',
  ],
  outcomes:
    '実績が未登録なら「評価対象となる実績なし」で、問題がないという判定ではありません。申告日未登録・清算特則未確認・個別評価が必要な場合は「判定不能／要確認」とします。基本期間を超えていても延長等の確認対象であり、違反とは断定しません。必要データの取得失敗では評価も保存も停止します。',
};

// Use existing procedure links; never invent a submission office or destination URL.
export function trialExecutionLinks(procedure: Pick<ScheduleProcedure, 'official_links'>) {
  const links: {label: string; url: string; unchecked: boolean}[] = [];
  for (const link of procedure.official_links) {
    const rawUrl = link.status === 'broken' ? link.fallback_url : link.url;
    // Compare the raw value before correction so a broken original cannot return via an identical fallback.
    if (!rawUrl || isKnownUnavailableSubmissionUrl(rawUrl) || link.status === 'broken' && rawUrl === link.url) continue;
    const url = correctKnownSubmissionUrl(rawUrl);
    try {
      if (!['http:', 'https:'].includes(new URL(url).protocol) || links.some(v=>v.url===url)) continue;
      links.push({label: link.label || '手続きの案内', url,
        unchecked: link.status !== 'ok' && link.status !== 'redirected'});
    } catch { /* An invalid master URL is not an executable destination. */ }
  }
  return links;
}
