'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileClock, Plus } from 'lucide-react';
import {
  CONSUMPTION_TAX_BUCKETS, CORPORATE_TAX_BUCKETS, TAXABLE_SALES_BUCKETS,
  type TaxReturnEntry,
} from '@/lib/taxReturnProfile';
import type { ConsumptionTaxInterimFrequency } from '@/lib/companyProfile';
import {
  taxReturnEntryDraftToWorkspaceWritePayload, workspaceRowsToTaxReturnProfile,
  type WorkspaceTaxReturnProfileRow,
} from '@/lib/workspaceTaxReturnProfile';
import {
  AmountField, ToggleButtons, TaxReturnEntryCard,
  CONSUMPTION_TAX_LABEL, TAXATION_METHOD_LABEL, INVOICE_LABEL, INTERIM_FILING_LABEL,
  CONSUMPTION_INTERIM_FREQ_LABEL,
} from '@/components/TaxReturnEntryFields';
import { createBrowserSupabase } from '@/lib/supabase/browser';

// ── Company Workspace — 決算実績（Sprint 35 Tax Return Profile）─────────────
// workspace_tax_return_profiles（Sprint35 migration）のCRUD。(site)側の
// src/app/(site)/profile/tax-returns/page.tsx（localStorage運用）と入力・表示ロジックは
// src/components/TaxReturnEntryFields.tsx を共通利用する。CompanyProfileとの不整合検知
// （Change Interview、(site)側のdetectMismatches）はWorkspace側では次Sprint以降のスコープとする
// （Workspace側の会社プロフィールは/profileサブページで独立して編集するため、本ページでは
// 決算実績の記録・修正のみを扱う）。

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

export default function WorkspaceTaxReturnsView({
  companyId,
  initialEntries,
  corporateType,
  employeeCount,
}: {
  companyId: number;
  initialEntries: TaxReturnEntry[];
  corporateType: string;
  employeeCount: number;
}) {
  const [entries, setEntries] = useState<TaxReturnEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EntryDraft>(EMPTY_ENTRY_DRAFT);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  async function handleDelete(id: string) {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id)); // 楽観的更新
    const { error: deleteError } = await supabase.from('workspace_tax_return_profiles').delete().eq('id', Number(id));
    if (deleteError) {
      setEntries(previous);
      setError(`削除に失敗しました: ${deleteError.message}`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
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

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setSaving(true);
    const payload = taxReturnEntryDraftToWorkspaceWritePayload(draft);

    const result = editingId
      ? await supabase
          .from('workspace_tax_return_profiles')
          .update(payload)
          .eq('id', Number(editingId))
          .select('*')
          .single()
      : await supabase
          .from('workspace_tax_return_profiles')
          .insert({ company_id: companyId, ...payload })
          .select('*')
          .single();

    setSaving(false);

    if (result.error || !result.data) {
      const isUniqueViolation = result.error?.code === '23505';
      setError(
        isUniqueViolation
          ? 'この決算日の実績は既に登録されています。既存の実績を編集してください。'
          : `保存に失敗しました: ${result.error?.message ?? '不明なエラー'}`,
      );
      return;
    }

    const savedEntry = workspaceRowsToTaxReturnProfile([result.data as WorkspaceTaxReturnProfileRow]).entries[0];
    setEntries((prev) => {
      const next = editingId ? prev.filter((e) => e.id !== editingId) : prev;
      return [...next, savedEntry].sort((a, b) => a.fiscalYearEndDate.localeCompare(b.fiscalYearEndDate));
    });
    setShowForm(false);
  }

  const sortedEntries = [...entries].reverse(); // 新しい順に表示

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      {!showForm && (
        <button type="button" onClick={openNewForm} className="btn-primary">
          <Plus className="h-4 w-4" />
          新しい申告実績を追加
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4">
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
            {corporateType === 'kabushiki' && (
              <div className="space-y-2">
                <label className="form-label">決算公告は実施しましたか</label>
                <ToggleButtons
                  options={[{ value: 'false', label: '未実施' }, { value: 'true', label: '実施済み' }]}
                  value={String(draft.financialStatementPublished)}
                  onChange={(v) => set('financialStatementPublished', v === 'true')}
                />
              </div>
            )}

            {employeeCount > 0 && (
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
                <p className="text-xs text-amber-600">
                  現在この項目は記録のみ保存され、年間ロードマップ・Stateには反映されません。
                </p>
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

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary flex-1 disabled:opacity-60">
              {saving ? '保存中…' : editingId ? '更新する' : '追加する'}
              <CheckCircle2 className="h-4 w-4" />
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
    </div>
  );
}
