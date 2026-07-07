'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  deriveConsumptionTaxStatus, deriveCorporateTaxInterimFiling, deriveConsumptionTaxInterimFrequency,
  loadCompanyProfile, saveCompanyProfile, type CompanyProfile,
  type ConsumptionTaxInterimFrequency, type ConsumptionTaxStatus, type InterimFilingStatus,
  type InvoiceRegistrationStatus, type TaxationMethod,
} from '@/lib/companyProfile';
import {
  addTaxReturnEntry, confidenceOfAmount, deleteTaxReturnEntry, loadTaxReturnProfile,
  updateTaxReturnEntry, CONSUMPTION_TAX_BUCKETS, CORPORATE_TAX_BUCKETS, TAXABLE_SALES_BUCKETS,
  type AmountPrecision, type AmountValue, type TaxReturnEntry, type TaxReturnProfile,
} from '@/lib/taxReturnProfile';
import {
  ChevronLeft, FileClock, Plus, Pencil, Trash2, AlertTriangle, CheckCircle2,
} from 'lucide-react';

const CONSUMPTION_TAX_LABEL: Record<ConsumptionTaxStatus, string> = {
  exempt: '免税事業者',
  taxable: '課税事業者',
};

const TAXATION_METHOD_LABEL: Record<TaxationMethod, string> = {
  principle: '原則課税',
  simplified: '簡易課税',
};

const INVOICE_LABEL: Record<InvoiceRegistrationStatus, string> = {
  registered: '登録済み',
  not_registered: '未登録',
};

const INTERIM_FILING_LABEL: Record<InterimFilingStatus, string> = {
  none: 'なし',
  has: 'あり',
};

const CONSUMPTION_INTERIM_FREQ_LABEL: Record<ConsumptionTaxInterimFrequency, string> = {
  none: 'なし',
  '1': '年1回',
  '3': '年3回',
  '11': '年11回',
};

const CONFIDENCE_LABEL: Record<'high' | 'medium' | 'low', string> = {
  high: '正確',
  medium: '概算',
  low: '未入力',
};

type EntryDraft = Omit<TaxReturnEntry, 'id' | 'createdAt' | 'updatedAt'>;

const EMPTY_ENTRY_DRAFT: EntryDraft = {
  fiscalYear: '',
  fiscalYearStartDate: null,
  fiscalYearEndDate: '',
  filedDate: null,
  capitalAtFiling: null,
  taxableSalesAmount: null,
  consumptionTaxStatus: 'exempt',
  taxationMethod: null,
  invoiceRegistrationStatus: 'not_registered',
  corporateTaxAmount: null,
  consumptionTaxAmount: null,
  corporateTaxInterimFilingActual: 'none',
  consumptionTaxInterimFrequencyActual: 'none',
  financialStatementPublished: false,
  withholdingTaxCycleActual: null,
  employeeCountAtFiscalYearEnd: null,
};

function ToggleButtons<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
            value === opt.value
              ? 'border-blue-600 bg-blue-600 text-white'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ConfidenceTag({ amount }: { amount: AmountValue | null }) {
  const level = confidenceOfAmount(amount);
  const tone = level === 'high' ? 'border-blue-200 text-blue-600' : level === 'medium' ? '' : 'border-gray-200 text-gray-400';
  return <span className={`tag ${tone}`}>{CONFIDENCE_LABEL[level]}</span>;
}

function amountDisplayLabel(amount: AmountValue | null, buckets: readonly { id: string; label: string }[]): string {
  if (!amount) return '未入力';
  if (amount.precision === 'exact') {
    return amount.exactValue !== null ? `${amount.exactValue.toLocaleString()}円` : '未入力';
  }
  return buckets.find((b) => b.id === amount.rangeBucketId)?.label ?? '未入力';
}

// 「正確な金額」「だいたいの範囲」を切り替えて入力する金額項目。承認済み方針3の実装。
function AmountField({
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
      <ToggleButtons
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
        <ToggleButtons
          options={buckets.map((b) => ({ value: b.id, label: b.label }))}
          value={value?.rangeBucketId ?? null}
          onChange={(id) => onChange({ precision: 'range', exactValue: null, rangeBucketId: id })}
        />
      )}
    </div>
  );
}

type MismatchField = 'consumptionTaxStatus' | 'corporateTaxInterimFiling' | 'consumptionTaxInterimFrequency';

type Mismatch = {
  field: MismatchField;
  label: string;
  currentLabel: string;
  suggestedLabel: string;
  apply: (profile: CompanyProfile) => CompanyProfile;
};

// CompanyProfileとTaxReturnProfileが食い違う項目を検出する（申告書を自動で正としない。4節）。
function detectMismatches(profile: CompanyProfile, taxReturnProfile: TaxReturnProfile): Mismatch[] {
  const mismatches: Mismatch[] = [];

  const suggestedConsumptionTaxStatus = deriveConsumptionTaxStatus(profile.capital, profile.stage, taxReturnProfile);
  if (suggestedConsumptionTaxStatus && suggestedConsumptionTaxStatus !== profile.consumptionTaxStatus) {
    mismatches.push({
      field: 'consumptionTaxStatus',
      label: '消費税ステータス',
      currentLabel: CONSUMPTION_TAX_LABEL[profile.consumptionTaxStatus],
      suggestedLabel: CONSUMPTION_TAX_LABEL[suggestedConsumptionTaxStatus],
      apply: (p) => ({ ...p, consumptionTaxStatus: suggestedConsumptionTaxStatus }),
    });
  }

  const suggestedInterimFiling = deriveCorporateTaxInterimFiling(profile.stage, taxReturnProfile);
  if (suggestedInterimFiling && suggestedInterimFiling !== profile.corporateTaxInterimFiling) {
    mismatches.push({
      field: 'corporateTaxInterimFiling',
      label: '法人税の中間申告',
      currentLabel: INTERIM_FILING_LABEL[profile.corporateTaxInterimFiling],
      suggestedLabel: INTERIM_FILING_LABEL[suggestedInterimFiling],
      apply: (p) => ({ ...p, corporateTaxInterimFiling: suggestedInterimFiling }),
    });
  }

  const suggestedInterimFrequency = deriveConsumptionTaxInterimFrequency(profile.stage, taxReturnProfile);
  if (suggestedInterimFrequency && suggestedInterimFrequency !== profile.consumptionTaxInterimFrequency) {
    mismatches.push({
      field: 'consumptionTaxInterimFrequency',
      label: '消費税の中間申告回数',
      currentLabel: CONSUMPTION_INTERIM_FREQ_LABEL[profile.consumptionTaxInterimFrequency],
      suggestedLabel: CONSUMPTION_INTERIM_FREQ_LABEL[suggestedInterimFrequency],
      apply: (p) => ({ ...p, consumptionTaxInterimFrequency: suggestedInterimFrequency }),
    });
  }

  return mismatches;
}

function MismatchCard({
  mismatch,
  onResolve,
}: {
  mismatch: Mismatch;
  onResolve: (field: MismatchField, adopt: boolean) => void;
}) {
  return (
    <div className="card border-amber-200 bg-amber-50/40 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <p className="text-sm text-gray-800">
          <span className="font-semibold">{mismatch.label}</span>：現在のプロフィールは
          「{mismatch.currentLabel}」ですが、申告実績からは「{mismatch.suggestedLabel}」と判定されます。
        </p>
      </div>
      <div className="flex gap-2 pl-6">
        <button
          type="button"
          onClick={() => onResolve(mismatch.field, true)}
          className="btn-primary px-3 py-1.5 text-xs"
        >
          申告書を採用
        </button>
        <button
          type="button"
          onClick={() => onResolve(mismatch.field, false)}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          プロフィールを維持
        </button>
      </div>
    </div>
  );
}

function EntryCard({
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
          <button type="button" onClick={onDelete} className="btn-secondary inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600">
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

export default function TaxReturnsPage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [taxReturnProfile, setTaxReturnProfile] = useState<TaxReturnProfile>({ entries: [] });
  const [loaded, setLoaded] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_ENTRY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);

  useEffect(() => {
    setProfile(loadCompanyProfile());
    setTaxReturnProfile(loadTaxReturnProfile());
    setLoaded(true);
  }, []);

  function set<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function openNewForm() {
    setDraft(EMPTY_ENTRY_DRAFT);
    setEditingId(null);
    setError(null);
    setShowForm(true);
  }

  function openEditForm(entry: TaxReturnEntry) {
    const { id, createdAt, updatedAt, ...rest } = entry;
    setDraft(rest);
    setEditingId(id);
    setError(null);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    setTaxReturnProfile(deleteTaxReturnEntry(id));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.fiscalYear.trim()) {
      setError('対象年度を入力してください');
      return;
    }
    if (!draft.fiscalYearEndDate) {
      setError('決算日を入力してください');
      return;
    }
    setError(null);

    const updated = editingId ? updateTaxReturnEntry(editingId, draft) : addTaxReturnEntry(draft);
    setTaxReturnProfile(updated);
    setShowForm(false);

    if (profile) {
      setMismatches(detectMismatches(profile, updated));
    }
  }

  function handleResolveMismatch(field: MismatchField, adopt: boolean) {
    const mismatch = mismatches.find((m) => m.field === field);
    if (adopt && mismatch && profile) {
      const updatedProfile = mismatch.apply(profile);
      saveCompanyProfile(updatedProfile);
      setProfile(updatedProfile);
    }
    setMismatches((prev) => prev.filter((m) => m.field !== field));
  }

  if (!loaded) return null;

  const sortedEntries = [...taxReturnProfile.entries].reverse(); // 新しい順に表示

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <Link href="/profile" className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700">
        <ChevronLeft className="h-4 w-4" />
        会社プロフィールへ戻る
      </Link>

      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">確定申告実績</h1>
        <p className="mt-2 text-sm text-gray-500">
          前期の申告内容を記録すると、消費税ステータス等の自動判定に使われます
        </p>
      </div>

      {mismatches.length > 0 && (
        <div className="mb-6 space-y-3">
          {mismatches.map((m) => (
            <MismatchCard key={m.field} mismatch={m} onResolve={handleResolveMismatch} />
          ))}
        </div>
      )}

      {!showForm && (
        <button type="button" onClick={openNewForm} className="btn-primary btn-primary-lg mb-6 w-full text-base">
          <Plus className="h-5 w-5" />
          新しい申告実績を追加
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-8 space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <FileClock className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-800">{editingId ? '申告実績を編集' : '新しい申告実績'}</h2>
            </div>

            <div>
              <label className="form-label">対象年度（必須）</label>
              <input
                type="text"
                className="form-input"
                placeholder="例: 2025年3月期"
                value={draft.fiscalYear}
                onChange={(e) => set('fiscalYear', e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">決算日（必須）</label>
              <input
                type="date"
                className="form-input"
                value={draft.fiscalYearEndDate}
                onChange={(e) => set('fiscalYearEndDate', e.target.value)}
              />
            </div>

            <div>
              <label className="form-label">事業年度開始日（任意）</label>
              <input
                type="date"
                className="form-input"
                value={draft.fiscalYearStartDate ?? ''}
                onChange={(e) => set('fiscalYearStartDate', e.target.value || null)}
              />
            </div>

            <div>
              <label className="form-label">申告日（任意）</label>
              <input
                type="date"
                className="form-input"
                value={draft.filedDate ?? ''}
                onChange={(e) => set('filedDate', e.target.value || null)}
              />
            </div>

            <div>
              <label className="form-label">資本金（申告時点・任意）</label>
              <input
                type="number"
                min={0}
                className="form-input"
                placeholder="例: 3000000"
                value={draft.capitalAtFiling ?? ''}
                onChange={(e) => set('capitalAtFiling', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </div>

          <div className="card space-y-4">
            <AmountField
              label="課税売上高"
              value={draft.taxableSalesAmount}
              onChange={(v) => set('taxableSalesAmount', v)}
              buckets={TAXABLE_SALES_BUCKETS}
            />

            <div className="space-y-2">
              <label className="form-label">消費税ステータス（確定値）</label>
              <ToggleButtons
                options={(['exempt', 'taxable'] as const).map((v) => ({ value: v, label: CONSUMPTION_TAX_LABEL[v] }))}
                value={draft.consumptionTaxStatus}
                onChange={(v) => set('consumptionTaxStatus', v)}
              />
            </div>

            {draft.consumptionTaxStatus === 'taxable' && (
              <div className="space-y-2">
                <label className="form-label">課税方式</label>
                <ToggleButtons
                  options={(['principle', 'simplified'] as const).map((v) => ({ value: v, label: TAXATION_METHOD_LABEL[v] }))}
                  value={draft.taxationMethod}
                  onChange={(v) => set('taxationMethod', v)}
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="form-label">インボイス登録状況</label>
              <ToggleButtons
                options={(['not_registered', 'registered'] as const).map((v) => ({ value: v, label: INVOICE_LABEL[v] }))}
                value={draft.invoiceRegistrationStatus}
                onChange={(v) => set('invoiceRegistrationStatus', v)}
              />
            </div>
          </div>

          <div className="card space-y-4">
            <AmountField
              label="確定法人税額"
              value={draft.corporateTaxAmount}
              onChange={(v) => set('corporateTaxAmount', v)}
              buckets={CORPORATE_TAX_BUCKETS}
            />
            <AmountField
              label="確定消費税額"
              value={draft.consumptionTaxAmount}
              onChange={(v) => set('consumptionTaxAmount', v)}
              buckets={CONSUMPTION_TAX_BUCKETS}
            />

            <div className="space-y-2">
              <label className="form-label">今期、法人税の中間申告はありましたか</label>
              <ToggleButtons
                options={(['none', 'has'] as const).map((v) => ({ value: v, label: INTERIM_FILING_LABEL[v] }))}
                value={draft.corporateTaxInterimFilingActual}
                onChange={(v) => set('corporateTaxInterimFilingActual', v)}
              />
            </div>

            <div className="space-y-2">
              <label className="form-label">今期、消費税の中間申告は何回でしたか</label>
              <select
                className="form-select"
                value={draft.consumptionTaxInterimFrequencyActual}
                onChange={(e) => set('consumptionTaxInterimFrequencyActual', e.target.value as ConsumptionTaxInterimFrequency)}
              >
                {(['none', '1', '3', '11'] as const).map((v) => (
                  <option key={v} value={v}>{CONSUMPTION_INTERIM_FREQ_LABEL[v]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="card space-y-4">
            {profile?.corporateType === 'kabushiki' && (
              <div className="space-y-2">
                <label className="form-label">決算公告は実施しましたか</label>
                <ToggleButtons
                  options={[{ value: 'false', label: '未実施' }, { value: 'true', label: '実施済み' }]}
                  value={String(draft.financialStatementPublished)}
                  onChange={(v) => set('financialStatementPublished', v === 'true')}
                />
              </div>
            )}

            {profile && profile.employeeCount > 0 && (
              <div className="space-y-2">
                <label className="form-label">源泉所得税の納付実績</label>
                <ToggleButtons
                  options={[
                    { value: 'monthly' as const, label: '毎月納付' },
                    { value: 'special_exception' as const, label: '年2回（納期の特例）' },
                  ]}
                  value={draft.withholdingTaxCycleActual}
                  onChange={(v) => set('withholdingTaxCycleActual', v)}
                />
              </div>
            )}

            <div>
              <label className="form-label">期末時点の従業員数（任意）</label>
              <input
                type="number"
                min={0}
                className="form-input"
                value={draft.employeeCountAtFiscalYearEnd ?? ''}
                onChange={(e) => set('employeeCountAtFiscalYearEnd', e.target.value === '' ? null : Number(e.target.value))}
              />
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />{error}
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-primary-lg flex-1 text-base">
              {editingId ? '更新する' : '追加する'}
              <CheckCircle2 className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary px-4">
              キャンセル
            </button>
          </div>
        </form>
      )}

      {sortedEntries.length === 0 ? (
        <div className="card py-10 text-center text-sm text-gray-500">
          まだ申告実績が登録されていません。
        </div>
      ) : (
        <div className="space-y-3">
          {sortedEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => openEditForm(entry)}
              onDelete={() => handleDelete(entry.id)}
            />
          ))}
        </div>
      )}

      <p className="mt-8 flex items-start gap-2 text-xs text-gray-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        本サイトの情報は一般的な参考情報です。申告内容の最終確認は税理士等の専門家にご確認ください。入力内容はこの端末（ブラウザ）にのみ保存されます。
      </p>

      <p className="mt-4 text-center text-xs text-gray-400">
        <Link href="/profile" className="underline hover:text-gray-600">会社プロフィールへ戻る</Link>
      </p>
    </div>
  );
}
