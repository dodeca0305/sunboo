import { Pencil, Trash2 } from 'lucide-react';
import {
  confidenceOfAmount, CORPORATE_TAX_BUCKETS, CONSUMPTION_TAX_BUCKETS, TAXABLE_SALES_BUCKETS,
  type AmountPrecision, type AmountValue, type TaxReturnEntry,
} from '@/lib/taxReturnProfile';
import type {
  ConsumptionTaxInterimFrequency, ConsumptionTaxStatus, InterimFilingStatus,
  InvoiceRegistrationStatus, TaxationMethod, WithholdingTaxCycle,
} from '@/lib/companyProfile';
import SegmentedControl from '@/components/SegmentedControl';

// ── TaxReturnEntry 入力・表示の共通部品（Sprint 35）─────────────────────
// (site)側（src/app/(site)/profile/tax-returns/page.tsx、localStorage運用）とWorkspace側
// （admin/(protected)/workspaces/[id]/tax-returns、Supabase運用）の両方から使う表示コンポーネント。
// データの出どころ（localStorage / DB）に関わらず TaxReturnEntry の入力・表示ロジックは
// 完全に同一のため、CLAUDE.md「表示コンポーネントは可能な限り共通化」に従いここへ集約する。

export const CONSUMPTION_TAX_LABEL: Record<ConsumptionTaxStatus, string> = {
  exempt: '免税事業者',
  taxable: '課税事業者',
};

export const TAXATION_METHOD_LABEL: Record<TaxationMethod, string> = {
  principle: '原則課税',
  simplified: '簡易課税',
};

export const INVOICE_LABEL: Record<InvoiceRegistrationStatus, string> = {
  registered: '登録済み',
  not_registered: '未登録',
};

export const INTERIM_FILING_LABEL: Record<InterimFilingStatus, string> = {
  none: 'なし',
  has: 'あり',
};

export const CONSUMPTION_INTERIM_FREQ_LABEL: Record<ConsumptionTaxInterimFrequency, string> = {
  none: 'なし',
  '1': '年1回',
  '3': '年3回',
  '11': '年11回',
};

export const WITHHOLDING_CYCLE_LABEL: Record<WithholdingTaxCycle, string> = {
  monthly: '毎月納付',
  special_exception: '年2回（納期の特例）',
  unset: '未設定',
};

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: '正確',
  medium: '概算',
  low: '未入力',
};

// Sprint83「Interactive Controls & Status Foundation」でSegmentedControl（src/components/SegmentedControl.tsx）
// に実装を集約した。WorkspaceTaxReturnsView.tsx・(site)/profile/tax-returns/page.tsxが
// 引き続き`ToggleButtons`の名前でimportしているため、後方互換のためこの名前で再エクスポートする。
export { default as ToggleButtons } from '@/components/SegmentedControl';

export function ConfidenceTag({ amount }: { amount: AmountValue | null }) {
  const level = confidenceOfAmount(amount);
  const tone = level === 'high' ? 'border-blue-200 text-blue-600' : level === 'medium' ? '' : 'border-gray-200 text-gray-400';
  return <span className={`tag ${tone}`}>{CONFIDENCE_LABEL[level]}</span>;
}

export function amountDisplayLabel(amount: AmountValue | null, buckets: readonly { id: string; label: string }[]): string {
  if (!amount) return '未入力';
  if (amount.precision === 'exact') {
    return amount.exactValue !== null ? `${amount.exactValue.toLocaleString()}円` : '未入力';
  }
  return buckets.find((b) => b.id === amount.rangeBucketId)?.label ?? '未入力';
}

// 「正確な金額」「だいたいの範囲」を切り替えて入力する金額項目。承認済み方針3の実装。
export function AmountField({
  label,
  value,
  onChange,
  buckets,
}: {
  label: string;
  value: AmountValue | null;
  onChange: (v: AmountValue | null) => void;
  buckets: readonly { id: string; label: string }[];
}) {
  const precision: AmountPrecision = value?.precision ?? 'exact';
  return (
    <div className="space-y-2">
      <label className="form-label">{label}</label>
      <SegmentedControl
        options={[
          { value: 'exact' as const, label: '正確な金額' },
          { value: 'range' as const, label: 'だいたいの範囲' },
        ]}
        value={precision}
        onChange={(p) =>
          onChange(p === 'exact' ? { precision: 'exact', exactValue: null, rangeBucketId: null } : { precision: 'range', exactValue: null, rangeBucketId: null })
        }
      />
      {precision === 'exact' ? (
        <input
          type="number"
          min={0}
          className="form-input"
          placeholder="円"
          value={value?.exactValue ?? ''}
          onChange={(e) =>
            onChange({
              precision: 'exact',
              exactValue: e.target.value === '' ? null : Number(e.target.value),
              rangeBucketId: null,
            })
          }
        />
      ) : (
        <SegmentedControl
          options={buckets.map((b) => ({ value: b.id, label: b.label }))}
          value={value?.rangeBucketId ?? null}
          onChange={(id) => onChange({ precision: 'range', exactValue: null, rangeBucketId: id })}
        />
      )}
    </div>
  );
}

export function TaxReturnEntryCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: TaxReturnEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-gray-900">{entry.fiscalYear}</p>
        <div className="flex gap-1.5">
          <button type="button" onClick={onEdit} className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs">
            <Pencil className="h-3 w-3" />
            編集
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`${entry.fiscalYear}の決算実績を削除します。よろしいですか？`)) onDelete();
            }}
            className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600"
          >
            <Trash2 className="h-3 w-3" />
            削除
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        決算日: {entry.fiscalYearEndDate || '未入力'}
        {entry.filedDate && ` ・ 申告日: ${entry.filedDate}`}
      </p>
      <div className="grid gap-1.5 text-xs text-gray-600 sm:grid-cols-2">
        <p>
          課税売上高: {amountDisplayLabel(entry.taxableSalesAmount, TAXABLE_SALES_BUCKETS)}{' '}
          <ConfidenceTag amount={entry.taxableSalesAmount} />
        </p>
        <p>消費税ステータス: {CONSUMPTION_TAX_LABEL[entry.consumptionTaxStatus]}</p>
        <p>
          確定法人税額: {amountDisplayLabel(entry.corporateTaxAmount, CORPORATE_TAX_BUCKETS)}{' '}
          <ConfidenceTag amount={entry.corporateTaxAmount} />
        </p>
        <p>
          確定消費税額: {amountDisplayLabel(entry.consumptionTaxAmount, CONSUMPTION_TAX_BUCKETS)}{' '}
          <ConfidenceTag amount={entry.consumptionTaxAmount} />
        </p>
      </div>
    </div>
  );
}
