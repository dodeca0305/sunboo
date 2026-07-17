import type { SupabaseClient } from '@/lib/supabase';
import type { ScheduleProcedure } from '@/lib/scheduleProcedure';
import type { RoadmapYear } from '@/lib/roadmap';
import { resolveSubmissionOfficeForCompany } from '@/lib/submissionDirectory';
import { isPhase5_2Target, shouldUseCutoverResult, mergeOfficeOverlay } from './decision';

export { isPhase5_2Target, PHASE5_2_CUTOVER_TARGETS, shouldUseCutoverResult, mergeOfficeOverlay } from './decision';

// ── Submission Directory Cutover（Phase5-2、新旧切り替えロジックの集約）─────────
// 設計: docs/PHASE5_UI_CUTOVER_PLAN.md Part C。
//
// 責務: (1) Phase5-2対象か判定する (2) 新Resolverを実行する (3) status==='resolved' の
// ときだけ新結果を返す (4) resolved以外は旧結果をそのまま返す。この4点をこのモジュールに
// 集約し、呼び出し元（workspaceLoader.ts）・診断エンジン本体（diagnosis.ts）・
// Roadmap Engine本体（roadmap.ts）・新Resolver本体（src/lib/submissionDirectory/）は
// 一切変更しない。
//
// 判定ロジック自体（shouldUseCutoverResult・mergeOfficeOverlay・isPhase5_2Target・対象定義）は
// ./decision.ts に分離してあり、DBアクセスを一切持たない（そちらを参照。単体テストも
// decision.tsを直接importして行う）。このファイルはDBアクセスを伴うオーケストレーションのみを持つ。
//
// 【重要】この先の関数（applyCutoverToProcedure・applyCutoverToRoadmapYears）は
// Server Componentからのみ呼び出すこと。'use client'を持つファイルには置かない・そこから
// exportしない（2026-07-04のRSC境界インシデント、memory: incident_result_500_rsc_boundary
// と同じ形を避けるため）。

export type CutoverLocation = {
  municipalityCode: string | null;
  prefectureCode: string | null;
};

// 1手続き分。対象外であれば新Resolverを呼び出しすらしない（無駄なDB問い合わせを避ける）。
export async function applyCutoverToProcedure(
  supabase: SupabaseClient,
  procedure: ScheduleProcedure,
  location: CutoverLocation,
): Promise<ScheduleProcedure> {
  if (!isPhase5_2Target(location.municipalityCode, procedure.id)) return procedure;

  const resolution = await resolveSubmissionOfficeForCompany(supabase, {
    procedureId: procedure.id,
    municipalityCode: location.municipalityCode,
    prefectureCode: location.prefectureCode,
  });

  if (!shouldUseCutoverResult({
    municipalityCode: location.municipalityCode,
    procedureId: procedure.id,
    status: resolution.status,
  })) {
    return procedure;
  }

  // resolved であれば primaryOffice は非nullが保証されている（src/lib/submissionDirectory/index.ts
  // の実装契約）。念のため防御的にnullチェックし、無ければ旧結果を維持する（推測で埋めない）。
  if (!resolution.primaryOffice) return procedure;

  return {
    ...procedure,
    office: mergeOfficeOverlay(procedure.office, resolution.primaryOffice, resolution.verificationStatus),
  };
}

// buildAnnualRoadmap（roadmap.ts、無変更）が返す RoadmapYear[] に対して、Phase5-2対象の
// 手続きだけを新Resolverの結果で上書きする。同一procedure（例: 毎月納付で年12回出現）は
// 会社の所在地が固定である以上、Resolverの呼び出し結果も毎回同じになるため、procedure_id単位で
// 重複排除して1回だけ呼び出す（DB問い合わせ回数を手続き種別数に抑える、
// docs/PHASE5_UI_CUTOVER_PLAN.md B-11節#3の申し送りへの対応）。
// 対象手続きが1件も無い場合は元の配列をそのまま返す（新しい配列を作らない）。
export async function applyCutoverToRoadmapYears(
  supabase: SupabaseClient,
  roadmapYears: RoadmapYear[],
  location: CutoverLocation,
): Promise<RoadmapYear[]> {
  const uniqueProcedures = new Map<number, ScheduleProcedure>();
  for (const year of roadmapYears) {
    for (const item of year.items) {
      if (!uniqueProcedures.has(item.procedure.id)) {
        uniqueProcedures.set(item.procedure.id, item.procedure);
      }
    }
  }

  const targetProcedureIds = Array.from(uniqueProcedures.keys()).filter((id) =>
    isPhase5_2Target(location.municipalityCode, id),
  );
  if (targetProcedureIds.length === 0) return roadmapYears;

  const overlaidOfficeByProcedureId = new Map<number, ScheduleProcedure['office']>();
  for (const procedureId of targetProcedureIds) {
    const procedure = uniqueProcedures.get(procedureId)!;
    const overlaid = await applyCutoverToProcedure(supabase, procedure, location);
    if (overlaid.office !== procedure.office) {
      overlaidOfficeByProcedureId.set(procedureId, overlaid.office);
    }
  }

  if (overlaidOfficeByProcedureId.size === 0) return roadmapYears;

  return roadmapYears.map((year) => ({
    ...year,
    items: year.items.map((item) => {
      const newOffice = overlaidOfficeByProcedureId.get(item.procedure.id);
      if (newOffice === undefined) return item;
      return { ...item, procedure: { ...item.procedure, office: newOffice } };
    }),
  }));
}
