import {
  DiagnosisInput,
  DiagnosisResult,
  JurisdictionOffice,
  ProcedureResult,
} from './types';
import type { SupabaseClient } from './supabase';

// ── 期限計算 ───────────────────────────────────────────────────

export function calculateNextDeadline(
  timingType: string,
  timingData: Record<string, unknown> | null,
  fiscalMonth: number,
): string | null {
  const today = new Date();
  const year = today.getFullYear();

  switch (timingType) {
    case 'at_establishment':
    case 'hiring_event':
      return null; // イベント起算は計算不可

    case 'fiscal_offset': {
      const months = (timingData?.months as number) ?? 2;
      const rawMonth = fiscalMonth + months;
      const monthIndex = (rawMonth - 1) % 12;
      const deadlineMonth = monthIndex + 1;
      let deadlineYear = year;
      const d = new Date(year, monthIndex + 1, 0); // その月の末日
      if (d < today) deadlineYear = year + 1;
      const lastDay = new Date(deadlineYear, monthIndex + 1, 0).getDate();
      return `${deadlineYear}年${deadlineMonth}月${lastDay}日`;
    }

    case 'fixed_date': {
      const m = timingData?.month as number;
      const day = timingData?.day as number;
      let d = new Date(year, m - 1, day);
      if (d < today) d = new Date(year + 1, m - 1, day);
      return `${d.getFullYear()}年${m}月${day}日`;
    }

    case 'period': {
      const sm = timingData?.startMonth as number;
      const sd = timingData?.startDay as number;
      const em = timingData?.endMonth as number;
      const ed = timingData?.endDay as number;
      const endDate = new Date(year, em - 1, ed);
      const targetYear = endDate < today ? year + 1 : year;
      return `${targetYear}年${sm}月${sd}日〜${em}月${ed}日`;
    }

    case 'monthly_10th': {
      const nextM = today.getMonth() + 2; // 来月（1-indexed）
      const m = nextM > 12 ? 1 : nextM;
      const y = nextM > 12 ? year + 1 : year;
      return `${y}年${m}月10日`;
    }

    default:
      return null;
  }
}

// ── メイン診断関数 ────────────────────────────────────────────

export async function runDiagnosis(
  client: SupabaseClient | null,
  input: DiagnosisInput,
): Promise<DiagnosisResult> {
  if (!client) return { offices: [], procedures: [] };

  // 1. 市区町村を特定
  const { data: muniRaw } = await client
    .from('municipalities')
    .select('id')
    .eq('code', input.municipalityCode)
    .single();

  // Supabase クライアント無型版では data が never に推論されるためキャスト
  const muni = muniRaw as { id: number } | null;
  if (!muni) return { offices: [], procedures: [] };

  // 2. 管轄機関を取得
  const { data: officesRaw } = await client
    .from('jurisdiction_offices')
    .select('*')
    .eq('municipality_id', muni.id)
    .order('id');

  const offices: JurisdictionOffice[] = (officesRaw as JurisdictionOffice[] | null) ?? [];

  // 3. 手続きを取得・フィルタ
  let query = client
    .from('procedures')
    .select('*, official_links(label, url)')
    .eq('is_active', true)
    .order('priority');

  // 従業員なしの場合は requires_employees=false の手続きのみ
  if (!input.hasEmployees) {
    query = query.eq('requires_employees', false);
  }

  const { data: procsRaw } = await query;

  // 4. 各手続きに管轄機関を紐づけ・期限計算
  const officeMap = new Map<string, JurisdictionOffice>(
    offices.map((o) => [o.office_type, o]),
  );

  const procedures: ProcedureResult[] = ((procsRaw as Record<string, unknown>[] | null) ?? []).map(
    (p: Record<string, unknown>) => ({
      ...(p as ProcedureResult),
      next_deadline: calculateNextDeadline(
        p.timing_type as string,
        p.timing_data as Record<string, unknown> | null,
        input.fiscalMonth,
      ),
      office: officeMap.get(p.office_type as string) ?? null,
      official_links:
        (p.official_links as { label: string; url: string }[]) ?? [],
    }),
  );

  return { offices, procedures };
}
