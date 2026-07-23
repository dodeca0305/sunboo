'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  deriveConsumptionTaxStatus, deriveCorporateTaxInterimFiling, deriveConsumptionTaxInterimFrequency,
  loadCompanyProfile, saveCompanyProfile, type CompanyProfile,
  type ConsumptionTaxInterimFrequency,
} from '@/lib/companyProfile';
import {
  addTaxReturnEntry, deleteTaxReturnEntry, getLatestEntry, loadTaxReturnProfile,
  updateTaxReturnEntry, CONSUMPTION_TAX_BUCKETS, CORPORATE_TAX_BUCKETS, TAXABLE_SALES_BUCKETS,
  type TaxReturnEntry, type TaxReturnProfile,
} from '@/lib/taxReturnProfile';
import {
  AmountField, ToggleButtons, TaxReturnEntryCard,
  CONSUMPTION_TAX_LABEL, TAXATION_METHOD_LABEL, INVOICE_LABEL, INTERIM_FILING_LABEL,
  CONSUMPTION_INTERIM_FREQ_LABEL, WITHHOLDING_CYCLE_LABEL,
} from '@/components/TaxReturnEntryFields';
import { buildClosingUpdateSummary } from '@/lib/adviserScore';
import {
  ChevronLeft, FileClock, Plus, AlertTriangle, CheckCircle2,
} from 'lucide-react';

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

export type MismatchField =
  | 'consumptionTaxStatus'
  | 'corporateTaxInterimFiling'
  | 'consumptionTaxInterimFrequency'
  | 'capital'
  | 'withholdingTaxCycle'
  | 'invoiceRegistrationStatus'
  | 'stage';

export type Mismatch = {
  field: MismatchField;
  label: string;
  currentLabel: string;
  suggestedLabel: string;
  apply: (profile: CompanyProfile) => CompanyProfile;
};

// CompanyProfileとTaxReturnProfileが食い違う項目を検出する（申告書を自動で正としない。4節）。
export function detectMismatches(profile: CompanyProfile, taxReturnProfile: TaxReturnProfile): Mismatch[] {
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

  // ── ここから Sprint18.2 追加分（決算更新フロー設計書 3-1節）───────
  const latest = getLatestEntry(taxReturnProfile);

  // ① 資本金の乖離（増資イベントの記録漏れ検出）
  if (latest?.capitalAtFiling !== null && latest?.capitalAtFiling !== undefined && latest.capitalAtFiling !== profile.capital) {
    mismatches.push({
      field: 'capital',
      label: '資本金',
      currentLabel: profile.capital !== null ? `${profile.capital.toLocaleString()}円` : '未入力',
      suggestedLabel: `${latest.capitalAtFiling.toLocaleString()}円`,
      apply: (p) => ({ ...p, capital: latest.capitalAtFiling }),
    });
  }

  // ② 源泉所得税の納付サイクルの乖離
  if (latest?.withholdingTaxCycleActual && latest.withholdingTaxCycleActual !== profile.withholdingTaxCycle) {
    const actual = latest.withholdingTaxCycleActual;
    mismatches.push({
      field: 'withholdingTaxCycle',
      label: '源泉所得税の納付サイクル',
      currentLabel: WITHHOLDING_CYCLE_LABEL[profile.withholdingTaxCycle],
      suggestedLabel: WITHHOLDING_CYCLE_LABEL[actual],
      apply: (p) => ({ ...p, withholdingTaxCycle: actual }),
    });
  }

  // ③ インボイス登録状況の乖離
  if (latest && latest.invoiceRegistrationStatus !== profile.invoiceRegistrationStatus) {
    const suggested = latest.invoiceRegistrationStatus;
    mismatches.push({
      field: 'invoiceRegistrationStatus',
      label: 'インボイス登録状況',
      currentLabel: INVOICE_LABEL[profile.invoiceRegistrationStatus],
      suggestedLabel: INVOICE_LABEL[suggested],
      apply: (p) => ({ ...p, invoiceRegistrationStatus: suggested }),
    });
  }

  // ④ 会社ステージの遷移（決算実績が1件でもあれば1期目のままではありえない）
  if (profile.stage === 'first_term' && taxReturnProfile.entries.length > 0) {
    mismatches.push({
      field: 'stage',
      label: '会社ステージ',
      currentLabel: '1期目',
      suggestedLabel: '2期目以降',
      apply: (p) => ({ ...p, stage: 'second_term_or_later' }),
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

const subscribeNoop = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

export default function TaxReturnsPage() {
  const isClient = useSyncExternalStore(
    subscribeNoop,
    getClientSnapshot,
    getServerSnapshot,
  );
  const [profile, setProfile] = useState<CompanyProfile | null>(() => loadCompanyProfile());
  const [taxReturnProfile, setTaxReturnProfile] = useState<TaxReturnProfile>(
    () => loadTaxReturnProfile(),
  );

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_ENTRY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  // Change Interview開始時点のプロフィールを保持し、全件解決後に決算更新サマリーの before/after 比較に使う
  const [profileBeforeReview, setProfileBeforeReview] = useState<CompanyProfile | null>(null);
  const [closingSummary, setClosingSummary] = useState<string[] | null>(null);

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
    void createdAt;
    void updatedAt;
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
    setClosingSummary(null);

    if (profile) {
      const detected = detectMismatches(profile, updated);
      setMismatches(detected);
      if (detected.length > 0) {
        setProfileBeforeReview(profile);
      } else {
        // 矛盾が無い場合もChange Interviewは即座に完了したとみなし、サマリーを表示する
        setProfileBeforeReview(null);
        setClosingSummary(buildClosingUpdateSummary(profile, profile, getLatestEntry(updated)));
      }
    }
  }

  function handleResolveMismatch(field: MismatchField, adopt: boolean) {
    const mismatch = mismatches.find((m) => m.field === field);
    let finalProfile = profile;
    if (adopt && mismatch && profile) {
      finalProfile = mismatch.apply(profile);
      saveCompanyProfile(finalProfile);
      setProfile(finalProfile);
    }

    const remaining = mismatches.filter((m) => m.field !== field);
    setMismatches(remaining);

    if (remaining.length === 0 && profileBeforeReview && finalProfile) {
      setClosingSummary(buildClosingUpdateSummary(profileBeforeReview, finalProfile, getLatestEntry(taxReturnProfile)));
      setProfileBeforeReview(null);
    }
  }

  if (!isClient) return null;

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

      {mismatches.length === 0 && closingSummary && closingSummary.length > 0 && (
        <div className="card mb-6 space-y-3 border-blue-200 bg-blue-50/40">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
            <h2 className="font-semibold text-gray-800">決算更新サマリー</h2>
          </div>
          <ul className="space-y-1.5 pl-6 text-sm text-gray-700">
            {closingSummary.map((s, i) => (
              <li key={i} className="list-disc">{s}</li>
            ))}
          </ul>
          <div className="pl-6">
            <button type="button" onClick={() => setClosingSummary(null)} className="btn-secondary px-3 py-1.5 text-xs">
              閉じる
            </button>
          </div>
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
              <FileClock className="h-4 w-4 text-sunboo-ink-muted" />
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
            <TaxReturnEntryCard
              key={entry.id}
              entry={entry}
              onEdit={() => openEditForm(entry)}
              onDelete={() => handleDelete(entry.id)}
            />
          ))}
        </div>
      )}

      <p className="mt-8 flex items-start gap-2 text-xs text-sunboo-ink-muted">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        本サイトの情報は一般的な参考情報です。申告内容の最終確認は税理士等の専門家にご確認ください。入力内容はこの端末（ブラウザ）にのみ保存されます。
      </p>

      <p className="mt-4 text-center text-xs text-sunboo-ink-muted">
        <Link href="/profile" className="underline hover:text-gray-600">会社プロフィールへ戻る</Link>
      </p>
    </div>
  );
}
