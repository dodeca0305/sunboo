import type { TimelineEvent } from './timeline';
import type {
  CompanyStage, ConsumptionTaxStatus, InvoiceRegistrationStatus, InterimFilingStatus, WithholdingTaxCycle,
} from './companyProfile';
import {
  isTaxableSalesAboveExemptionThreshold, corporateTaxRequiresInterimFiling, type AmountValue,
} from './taxReturnProfile';

// ── State Engine — MVP（Sprint 20 Phase20.2）──────────────────────
// 「会社の現在地」をTimelineEvent[]から都度計算する。設計: docs/STATE_ENGINE.md（Sprint20 Phase20.1、
// 設計レビュー承認済み）。State = f(Timeline) の原則により、Stateという名前のlocalStorageキーや
// DBテーブルは作らない（この関数はTimelineEvent[]を受け取り、CompanyStateを返す純粋関数のみ）。
//
// 既存の src/lib/companyProfile.ts の deriveConsumptionTaxStatus / deriveCorporateTaxInterimFiling /
// deriveConsumptionTaxInterimFrequency、src/app/(site)/profile/tax-returns/page.tsx の
// detectMismatches は置き換えない。本ファイルはMVPとして並行実装する
// （docs/STATE_ENGINE.md 0節・4節、10節Phase20.4で統合方針を改めて検討する）。

export type StateConfidence = 'confirmed' | 'estimated' | 'incomplete';

export type StateField<T> = {
  value: T;
  confidence: StateConfidence;
  basedOnEventIds: string[]; // 根拠にしたTimelineEvent.idの一覧
  asOf: string | null; // 根拠となった最新イベントのoccurredAt。根拠が無ければnull
};

export type CompanyState = {
  stage: StateField<CompanyStage | null>;
  consumptionTaxStatus: StateField<ConsumptionTaxStatus | null>;
  invoiceRegistrationStatus: StateField<InvoiceRegistrationStatus | null>;
  withholdingTaxCycle: StateField<WithholdingTaxCycle | null>;
  corporateTaxInterimFiling: StateField<InterimFilingStatus | null>;
  calculatedAt: string; // Stateを計算したタイムスタンプ（ISO datetime）
};

function incompleteField<T>(): StateField<T | null> {
  return { value: null, confidence: 'incomplete', basedOnEventIds: [], asOf: null };
}

// ── Timeline走査ヘルパー ─────────────────────────────────────────

function taxEventsByOccurredAtAsc(events: TimelineEvent[]): TimelineEvent[] {
  return events.filter((e) => e.category === 'tax').sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

function latestTaxEvent(events: TimelineEvent[]): TimelineEvent | null {
  const tax = taxEventsByOccurredAtAsc(events);
  return tax.length > 0 ? tax[tax.length - 1] : null;
}

// 基準期間（2期前）に相当するtaxイベント。deriveConsumptionTaxStatusのgetEntryTwoPeriodsAgoと
// 同じ考え方をTimelineEvent版に置き換えたもの（docs/STATE_ENGINE.md 3-2節）。
function taxEventTwoPeriodsAgo(events: TimelineEvent[]): TimelineEvent | null {
  const tax = taxEventsByOccurredAtAsc(events);
  const idx = tax.length - 2;
  return idx >= 0 ? tax[idx] : null;
}

// 会社設立の事実に対応するTimelineEvent（companyカテゴリ、company_profile由来の設立イベント、
// または/eventsで登録されたcompany_establishmentイベント）を、発生日が最も古いもの1件で返す。
function findEstablishmentEvent(events: TimelineEvent[]): TimelineEvent | null {
  const candidates = events
    .filter(
      (e) =>
        e.category === 'company' &&
        ((e.source === 'company_profile' && e.sourceId === 'establishment') ||
          (e.source === 'event' && e.metadata.eventTypeCode === 'company_establishment')),
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return candidates.length > 0 ? candidates[0] : null;
}

function amountConfidence(amount: AmountValue): StateConfidence {
  return amount.precision === 'exact' ? 'confirmed' : 'estimated';
}

// ── フィールドごとの導出ロジック（docs/STATE_ENGINE.md 3-1節の畳み込みルール）───

// taxカテゴリのイベントが1件でも存在すれば「2期目以降」（決算実績があるということは、
// 少なくとも1期は完了している）。無ければ設立イベントのoccurredAtから「1期目」。
// どちらの根拠も無ければincomplete（'pre_establishment'はStateでは導出しない。
// 「設立予定」は起きていない事実であり、Timelineは確定した事実のみを扱うため）。
function deriveStageField(events: TimelineEvent[]): StateField<CompanyStage | null> {
  const latestTax = latestTaxEvent(events);
  if (latestTax) {
    return {
      value: 'second_term_or_later',
      confidence: 'confirmed',
      basedOnEventIds: [latestTax.id],
      asOf: latestTax.occurredAt,
    };
  }

  const establishment = findEstablishmentEvent(events);
  if (establishment) {
    return {
      value: 'first_term',
      confidence: 'confirmed',
      basedOnEventIds: [establishment.id],
      asOf: establishment.occurredAt,
    };
  }

  return incompleteField();
}

// 資本金1,000万円以上は設立事業年度から課税事業者（最優先の根拠）。それ以外はstageが1期目なら
// 免税、2期目以降は基準期間（2期前）の課税売上高から判定する。既存deriveConsumptionTaxStatusと
// 同じ優先順位をTimelineEvent版で再現する（docs/STATE_ENGINE.md 3-1節）。
function deriveConsumptionTaxStatusField(
  events: TimelineEvent[],
  stage: CompanyStage | null,
): StateField<ConsumptionTaxStatus | null> {
  const establishment = findEstablishmentEvent(events);
  const capital = establishment && typeof establishment.metadata.capital === 'number'
    ? (establishment.metadata.capital as number)
    : null;

  if (capital !== null && capital >= 10_000_000 && establishment) {
    return { value: 'taxable', confidence: 'confirmed', basedOnEventIds: [establishment.id], asOf: establishment.occurredAt };
  }

  if (stage === 'first_term') {
    return establishment
      ? { value: 'exempt', confidence: 'confirmed', basedOnEventIds: [establishment.id], asOf: establishment.occurredAt }
      : incompleteField();
  }

  const baseline = taxEventTwoPeriodsAgo(events);
  const amount = baseline?.metadata.taxableSalesAmount as AmountValue | null | undefined;
  if (baseline && amount) {
    const isAbove = isTaxableSalesAboveExemptionThreshold(amount);
    if (isAbove !== null) {
      return {
        value: isAbove ? 'taxable' : 'exempt',
        confidence: amountConfidence(amount),
        basedOnEventIds: [baseline.id],
        asOf: baseline.occurredAt,
      };
    }
  }

  return incompleteField();
}

// 直近のtaxイベント（前期の確定申告実績）に記録されたインボイス登録状況をそのまま採用する。
// 既存のTaxReturnEntry.invoiceRegistrationStatusは「その期の事実」であり、閾値計算を伴わない
// 単純な転記のため、confidenceは常にconfirmed（根拠となる実績が存在する場合）。
function deriveInvoiceRegistrationStatusField(events: TimelineEvent[]): StateField<InvoiceRegistrationStatus | null> {
  const latest = latestTaxEvent(events);
  const status = latest?.metadata.invoiceRegistrationStatus as InvoiceRegistrationStatus | undefined;
  if (latest && status) {
    return { value: status, confidence: 'confirmed', basedOnEventIds: [latest.id], asOf: latest.occurredAt };
  }
  return incompleteField();
}

// 1期目は前年実績が存在しないため確実に「なし」。2期目以降は直近のtaxイベントの確定法人税額
// （corporateTaxAmount）から判定する。既存deriveCorporateTaxInterimFilingと同じ優先順位。
function deriveCorporateTaxInterimFilingField(
  events: TimelineEvent[],
  stage: CompanyStage | null,
): StateField<InterimFilingStatus | null> {
  if (stage === 'first_term') {
    const establishment = findEstablishmentEvent(events);
    return establishment
      ? { value: 'none', confidence: 'confirmed', basedOnEventIds: [establishment.id], asOf: establishment.occurredAt }
      : incompleteField();
  }

  const latest = latestTaxEvent(events);
  const amount = latest?.metadata.corporateTaxAmount as AmountValue | null | undefined;
  if (latest && amount) {
    const requiresFiling = corporateTaxRequiresInterimFiling(amount);
    if (requiresFiling !== null) {
      return {
        value: requiresFiling ? 'has' : 'none',
        confidence: amountConfidence(amount),
        basedOnEventIds: [latest.id],
        asOf: latest.occurredAt,
      };
    }
  }

  return incompleteField();
}

// 【なぜStateを使わないのか】withholdingTaxCycleはTimelineから導出できない。
// TaxReturnEntry.withholdingTaxCycleActual（納期の特例の実績）は timelineProducer.ts の
// taxReturnEntryToTimelineEvent が生成するmetadataに含まれていない（他の実績項目——
// consumptionTaxStatus・invoiceRegistrationStatus・各種AmountValue・
// employeeCountAtFiscalYearEnd——はすべてmetadataに含まれる中、この項目のみ欠落している）。
// そのためTimelineには現時点でこのフィールドの根拠となる事実が一切存在せず、
// 「State = f(Timeline)」の原則（docs/STATE_ENGINE.md）に従う限りincompleteを返すのが唯一
// 正直な値である（timelineProducer.tsの変更はSprint58のスコープ外）。
//
// この値については、CompanyProfile.withholdingTaxCycleの明示入力値こそが唯一の真実
// （source of truth）である。Timeline上の実績記録（withholdingTaxCycleActual）を待たずとも、
// 利用者が「毎月納付」「納期の特例」を明示的に選んでいれば、それは既に確定した事実であり、
// TimelineEvent化されていないというEngine側の実装都合によってConfidenceが「情報不足」に
// 格下げされるべきではない。そのため、この値を実際に画面へ表示する側（roadmap.ts の
// confidenceForProcedure、WITHHOLDING_TAX_CODEのConfidenceバッジ計算）は、Stateではなく
// CompanyProfileを直接参照する設計にした（Sprint58）。
//
// 【Sprint58で確認した実際の運用】このState値を直接消費していたのはroadmap.tsの
// confidenceForProcedureのみだった（grep確認、他の消費者は無し）。RESIDENT_TAX_WITHHOLDING_CODE
// がSprint47で既に選んだのと同じ方針（このState値をそもそも経由しない）をWITHHOLDING_TAX_CODEにも
// 適用し、roadmap.ts側でCompanyProfile.withholdingTaxCycleから直接Confidenceを判定するよう変更した
// （docs/COMPANY_PROFILE_OBLIGATION_AUDIT.md 6節）。
//
// 本関数（State側）は「Timeline単体としては根拠が無い」という事実自体は変わらないため、
// 返り値はincompleteのまま維持する。State ≠ CompanyProfileの直接反映という原則を保つことで、
// 「Stateは常にTimelineに基づく確からしさだけを表す」という他フィールドとの一貫性を崩さない。
// 将来、直接このState値を表示に使う新しい呼び出し元を追加する場合は、まずCompanyProfileを
// 直接参照する方式（本Sprintと同じ）を検討し、それでも足りない場合にのみ
// timelineProducer.tsのmetadata拡張を検討すること。
function deriveWithholdingTaxCycleField(_events: TimelineEvent[]): StateField<WithholdingTaxCycle | null> {
  return incompleteField();
}

// ── エントリーポイント ────────────────────────────────────────────

// TimelineEvent[]から会社の現在地（CompanyState）を計算する。保存は行わない
// （呼び出し側が必要なときにその都度呼ぶ。docs/STATE_ENGINE.md 1-2節）。
export function buildStateFromTimeline(events: TimelineEvent[]): CompanyState {
  const stageField = deriveStageField(events);
  return {
    stage: stageField,
    consumptionTaxStatus: deriveConsumptionTaxStatusField(events, stageField.value),
    invoiceRegistrationStatus: deriveInvoiceRegistrationStatusField(events),
    withholdingTaxCycle: deriveWithholdingTaxCycleField(events),
    corporateTaxInterimFiling: deriveCorporateTaxInterimFilingField(events, stageField.value),
    calculatedAt: new Date().toISOString(),
  };
}
