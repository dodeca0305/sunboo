import type { SupabaseClient } from './supabase';
import type { DiagnosisInput, JurisdictionOffice, LinkStatus, ProcedureResult } from './types';
import { calculateNextDeadline, runDiagnosis } from './diagnosis';
import { evaluateRules, type RuleContext } from './ruleEngine';
import {
  applyCompanyProfileToProcedures, hasEmployees, ESTABLISHMENT_PROCEDURE_CODES, WITHHOLDING_TAX_CODE,
  RESIDENT_TAX_WITHHOLDING_CODE, PERIODIC_CYCLE_OVERRIDES,
  type CompanyProfile,
} from './companyProfile';
import { toScheduleProcedure, type ScheduleProcedure } from './scheduleProcedure';
import type { CompanyState, StateConfidence } from './state';

// ── Annual Roadmap Engine — MVP（Sprint 21 Phase21.2）─────────────
// Roadmap = f( State, Timeline, Procedure Master, Rule Engine, 今日の日付 )。
// 設計: docs/ANNUAL_ROADMAP_ENGINE.md（Sprint21 Phase21.1、設計レビュー承認済み）。
// 保存は行わない（呼び出しの都度この関数を実行して計算する）。
//
// 設計書3節の通り、CompanyProfile・TaxReturnProfileはTimeline/State経由で間接的に反映されるため、
// このファイルはCompanyProfileとCompanyStateのみを直接の入力として受け取る。TaxReturnProfile・
// TimelineEvent[]は、呼び出し側がbuildStateFromTimeline（src/lib/state.ts）に渡す前段階で
// 既に消費済みという整理（設計書2-3節・3節「直接は読まない」と同じ位置づけ）。
// CompanyProfileの直接参照は、既存のapplyCompanyProfileToProcedures呼び出しと、
// Stateが持たないcorporate_type等の値を補う場合に限定する（設計書2-3節）。

export type RoadmapItem = {
  procedure: ScheduleProcedure;
  dueDate: string; // ISO日付。この1回分の具体的な期限
  confidence: StateConfidence; // StateField.confidenceをそのまま使う（独自に再計算しない）
};

export type RoadmapYear = {
  year: number; // 西暦（例: 2026）
  items: RoadmapItem[]; // dueDate昇順
};

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// その手続きの表示要否・期限計算が主にどのStateFieldに依存するかに応じてConfidenceを決める。
// 依存するStateFieldが無い手続き（fiscalMonthのみで決まる等、確定した事実だけで計算できるもの）は
// confirmed固定とする（docs/ANNUAL_ROADMAP_ENGINE.md 4節）。
// 【MVPの簡略化】CONSUMPTION_TAX_RETURNはルール16(consumption_tax_status)・17(invoice_
// registration_status)のどちらでも追加されうるが、本MVPではconsumptionTaxStatus1本のみを
// 参照する（設計書7節が示す「最も確からしさが低いStateFieldを採用する」の厳密な実装は次Sprint以降）。
// 【Sprint47の設計判断】RESIDENT_TAX_WITHHOLDING_CODEはStateを経由させない。
// state.withholdingTaxCycleは常に'incomplete'を返す既知の未実装ギャップ（state.ts 189-199行）があり、
// WITHHOLDING_TAX_CODEはこの壊れた値をそのまま使っているため、CompanyProfile側で明示的に
// withholdingTaxCycleを設定してもConfidenceバッジは常に「情報不足」のままという不整合が残っている。
// 住民税特別徴収でこの不整合を複製しないよう、State経由の判定にはしない
// （docs/RESIDENT_TAX_SUPPORT_DESIGN.md 7節）。
// 【Sprint47レビュー対応】residentTaxPaymentCycle === 'unknown' の場合はそもそも
// applyCompanyProfileToProcedures（companyProfile.ts）がRESIDENT_TAX_WITHHOLDING_CODEを一覧から
// 除外するため、この関数に到達する時点で周期は必ず'monthly'か'special'のいずれかに確定している
// （毎月10日の出現をconfidence='incomplete'付きで表示すると「予定が存在するように見える」誤案内に
// なるため、unknownは「情報不足として表示」ではなく「表示しない」を選んだ）。
function confidenceForProcedure(code: string, state: CompanyState): StateConfidence {
  if (ESTABLISHMENT_PROCEDURE_CODES.has(code)) return state.stage.confidence;
  if (code === WITHHOLDING_TAX_CODE) return state.withholdingTaxCycle.confidence;
  if (code === RESIDENT_TAX_WITHHOLDING_CODE) return 'confirmed';
  if (code === 'CONSUMPTION_TAX_RETURN') return state.consumptionTaxStatus.confidence;
  return 'confirmed';
}

// 診断エンジンが返す「次の1回」（calculateNextDeadline）を基準に、手続きの周期性に応じて
// horizonYears分の具体的な期限を展開する。calculateNextDeadline自体は変更せず、既に計算済みの
// 1回分を年・月単位でずらして複製するラッパー（docs/ANNUAL_ROADMAP_ENGINE.md 6-3節）。
// 【既知の制約】at_establishment/hiring_event/event_basedの手続き（法人設立届出書等）は、
// calculateNextDeadlineが起算日（eventDate）を要求する設計だが、runDiagnosisはeventDateを
// 渡さないため next_deadline_date は常にnullになる（診断エンジン単体の既存の挙動、
// docs/ANNUAL_ROADMAP_ENGINE.md 4節「Timeline経由で間接反映」の対象外）。年・月のグリッドに
// 配置できる期限が無い以上、本MVPではこれらを一覧から除外する（/eventsで実際にイベント登録した
// 場合の反映は本Sprintのスコープ外。9節参照）。
function expandOccurrences(proc: ScheduleProcedure, profile: CompanyProfile, horizonYears: number): string[] {
  if (!proc.next_deadline_date) return [];
  const first = new Date(`${proc.next_deadline_date}T00:00:00`);

  // 納期の特例（年2回）を持つ手続き（源泉所得税・住民税特別徴収）は、companyProfile.tsの
  // nextPeriodicCycleDeadline()が「次の1回」しか返さないため、ここでhorizonYears分を
  // 年2回パターンで独自に展開する（nextPeriodicCycleDeadline自体は変更しない）。
  // 【Sprint47で一般化】PERIODIC_CYCLE_OVERRIDES（companyProfile.ts）を参照する形にし、
  // WITHHOLDING_TAX_CODE専用のif分岐を廃止した。RESIDENT_TAX_WITHHOLDING_CODEもこのテーブル経由で
  // 同じロジックに乗る。
  const cycleOverride = PERIODIC_CYCLE_OVERRIDES[proc.code];
  if (cycleOverride && (profile[cycleOverride.cycleField] as string) === cycleOverride.specialValue) {
    const dates: string[] = [];
    const startYear = first.getFullYear();
    for (let i = 0; i < horizonYears; i++) {
      for (const [month, day] of cycleOverride.specialDates) {
        const d = new Date(startYear + i, month, day);
        if (d.getTime() >= first.getTime()) dates.push(toIsoDate(d));
      }
    }
    return dates;
  }

  // 毎月10日納付（源泉所得税・通常の月次サイクル）は月次で展開する
  if (proc.timing_type === 'monthly_10th') {
    return Array.from({ length: horizonYears * 12 }, (_, i) =>
      toIsoDate(new Date(first.getFullYear(), first.getMonth() + i, first.getDate())),
    );
  }

  // 決算・固定日・期間指定の手続きは年次で繰り返す
  if (proc.timing_type === 'fiscal_offset' || proc.timing_type === 'fixed_date' || proc.timing_type === 'period') {
    return Array.from({ length: horizonYears }, (_, i) =>
      toIsoDate(new Date(first.getFullYear() + i, first.getMonth(), first.getDate())),
    );
  }

  // at_establishment / hiring_event / event_based: 単発の手続きのため繰り返さない
  return [proc.next_deadline_date];
}

function groupByYear(items: RoadmapItem[]): RoadmapYear[] {
  const byYear = new Map<number, RoadmapItem[]>();
  for (const item of items) {
    const year = Number(item.dueDate.slice(0, 4));
    const bucket = byYear.get(year);
    if (bucket) bucket.push(item);
    else byYear.set(year, [item]);
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, yearItems]) => ({
      year,
      items: yearItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    }));
}

// State + Timeline(State経由) + Procedure Master + Rule Engine + 今日の日付から、
// horizonYears分の年間ロードマップを計算する。保存は行わない（呼び出し側が必要な都度呼ぶ）。
export async function buildAnnualRoadmap(
  client: SupabaseClient,
  profile: CompanyProfile,
  state: CompanyState,
  horizonYears = 3,
): Promise<RoadmapYear[]> {
  const fiscalMonth = profile.fiscalMonth;
  if (fiscalMonth === null) return []; // 決算月未確定では期限計算そのものが成立しない

  // 1. Procedure Master + 既存の診断エンジン（is_active・include_in_diagnosis等の既存フィルタを再利用）
  const diagnosisInput: DiagnosisInput = {
    prefectureCode: profile.prefectureCode,
    municipalityCode: profile.municipalityCode,
    hasEmployees: hasEmployees(profile),
    fiscalMonth,
    corporateType: profile.corporateType,
    hasOfficerTerm: false, // CompanyProfileは役員任期の有無を保持していないため保守的にfalse
  };
  const diagnosisResult = await runDiagnosis(client, diagnosisInput);
  const diagnosisProcedures = diagnosisResult.procedures.map(toScheduleProcedure);

  // 2. Rule Engine: 「決算」を仮想的に評価し、include_in_diagnosis=falseのため診断単体では
  // 出てこない手続き（消費税確定申告等）をStateの値から判定する。event_types.fiscal_year_endの
  // is_active化を待たず、Roadmap Engineが直接コンテキストを組み立てて評価する。
  // corporate_typeはStateに存在しないためCompanyProfileを例外的に直接参照する（設計書2-3節）。
  const context: RuleContext = {
    event_type_code: 'fiscal_year_end',
    corporate_type: profile.corporateType,
    consumption_tax_status: state.consumptionTaxStatus.value,
    invoice_registration_status: state.invoiceRegistrationStatus.value,
  };
  const ruleResult = await evaluateRules(client, context);

  const existingIds = new Set(diagnosisProcedures.map((p) => p.id));
  const newIds = ruleResult.addProcedureIds.filter((id) => !existingIds.has(id));

  let ruleProcedures: ScheduleProcedure[] = [];
  if (newIds.length > 0) {
    const officeMap = new Map<string, JurisdictionOffice>(
      diagnosisResult.offices.map((o) => [o.office_type, o]),
    );
    const { data: procsRaw } = await client
      .from('procedures')
      .select(
        '*, official_links(label, url, status, fallback_url), procedure_documents(name, form_number, is_required, notes)',
      )
      .in('id', newIds);

    ruleProcedures = ((procsRaw as Record<string, unknown>[] | null) ?? []).map((p) => {
      const deadline = calculateNextDeadline(
        p.timing_type as string,
        p.timing_data as Record<string, unknown> | null,
        fiscalMonth,
      );
      const result = {
        ...(p as ProcedureResult),
        next_deadline: deadline.label,
        next_deadline_date: deadline.date,
        office: officeMap.get(p.office_type as string) ?? null,
        official_links:
          (p.official_links as { label: string; url: string; status?: LinkStatus; fallback_url?: string | null }[]) ?? [],
        procedure_documents:
          (p.procedure_documents as { name: string; form_number: string | null; is_required: boolean; notes: string | null }[]) ?? [],
      };
      return toScheduleProcedure(result);
    });
  }

  // 3. 単年分の下ごしらえ（既存関数をそのまま利用。置き換えない）
  const effectiveProcedures = applyCompanyProfileToProcedures(
    [...diagnosisProcedures, ...ruleProcedures],
    profile,
  );

  // 4. 複数年ホライズンの展開 + Confidence付与
  const items: RoadmapItem[] = effectiveProcedures.flatMap((proc) =>
    expandOccurrences(proc, profile, horizonYears).map((dueDate) => ({
      procedure: proc,
      dueDate,
      confidence: confidenceForProcedure(proc.code, state),
    })),
  );

  return groupByYear(items);
}
