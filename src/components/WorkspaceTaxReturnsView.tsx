'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { resolveTaxReturnFocus, type TaxReturnFocus } from '@/lib/taxReturnFocus';
import Link from 'next/link';
import {
  loadTaxReturnEditor,
  saveTaxReturn,
  reconcileTaxReturnIntent,
  validTaxReturnIntent,
  validTaxReturnPayload,
  type TaxReturnSaveIntent,
} from '@/lib/workspaceTaxReturnData';
import { AlertTriangle, CheckCircle2, FileClock, Plus } from 'lucide-react';
import {
  CONSUMPTION_TAX_BUCKETS,
  CORPORATE_TAX_BUCKETS,
  TAXABLE_SALES_BUCKETS,
  type TaxReturnEntry,
} from '@/lib/taxReturnProfile';
import type { ConsumptionTaxInterimFrequency } from '@/lib/companyProfile';
import {
  taxReturnEntryDraftToWorkspaceWritePayload,
  workspaceRowsToTaxReturnProfile,
} from '@/lib/workspaceTaxReturnProfile';
import {
  AmountField,
  ToggleButtons,
  TaxReturnEntryCard,
  CONSUMPTION_TAX_LABEL,
  TAXATION_METHOD_LABEL,
  INVOICE_LABEL,
  INTERIM_FILING_LABEL,
  CONSUMPTION_INTERIM_FREQ_LABEL,
} from '@/components/TaxReturnEntryFields';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import FormattedIntegerInput from '@/components/FormattedIntegerInput';
import ManualDateInput from '@/components/ManualDateInput';
import TaxReturnPeriodSelect from '@/components/TaxReturnPeriodSelect';
import { fiscalYearSelectionError, labelAfterEndDateChange, fiscalPeriodHeading, fiscalPeriodRange } from '@/lib/taxReturnPeriod';
import type { CompanyProfile } from '@/lib/companyProfile';
import {
  detectTaxReturnConsistencyIssues,
  type TaxReturnConsistencyIssue,
  validateTaxReturnDateOrder,
} from '@/lib/taxReturnConsistency';

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
  companyProfile,
  initialFocus = null,
}: {
  companyId: number;
  initialEntries: TaxReturnEntry[];
  companyProfile: CompanyProfile;
  initialFocus?: TaxReturnFocus | null;
}) {
  const target = resolveTaxReturnFocus(initialEntries, initialFocus);
  const [entries, setEntries] = useState<TaxReturnEntry[]>(initialEntries);
  const [showForm, setShowForm] = useState(target !== null);
  const [editingId, setEditingId] = useState<string | null>(target?.entry?.id ?? null);
  const [draft, setDraft] = useState<EntryDraft>(() => {
    if (!target?.entry) return EMPTY_ENTRY_DRAFT;
    const { id, createdAt, updatedAt, ...values } = target.entry;
    void id; void createdAt; void updatedAt;
    return values;
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [consistencyIssues, setConsistencyIssues] = useState<
    TaxReturnConsistencyIssue[]
  >([]);

  const [activeProfile, setActiveProfile] = useState(companyProfile);
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const saveLock = useRef(false);
  const storageKey = `sunboo:workspace:${companyId}:pending-tax-return`;
  const rawPending = useSyncExternalStore(
    (callback) => {
      window.addEventListener('storage', callback);
      window.addEventListener('sunboo:tax-return-save', callback);
      return () => {
        window.removeEventListener('storage', callback);
        window.removeEventListener('sunboo:tax-return-save', callback);
      };
    },
    () => {
      try {
        return sessionStorage.getItem(storageKey) ?? '';
      } catch {
        return 'unavailable';
      }
    },
    () => null,
  );
  let pending: TaxReturnSaveIntent | null = null,
    storageBroken = false;
  if (rawPending) {
    try {
      const value: unknown = JSON.parse(rawPending);
      if (!validTaxReturnIntent(value, companyId)) throw Error();
      pending = value;
    } catch {
      storageBroken = true;
    }
  }
  const blocked = rawPending === null || !!rawPending || saving || checking;
  const focusedTarget = useRef(false);
  useEffect(() => {
    if (blocked || !showForm || !target || focusedTarget.current) return;
    const input = document.getElementById(`tax-return-${target.focus.field}`);
    if (input) {
      focusedTarget.current = true;
      input.focus();
      input.scrollIntoView({ block: 'center' });
    }
  }, [blocked, showForm, target]);
  const changed = () =>
    window.dispatchEvent(new Event('sunboo:tax-return-save'));
  const displayedError =
    error ??
    (storageBroken
      ? '保存結果の記録を確認できません。再送せず、登録内容を確認してください。'
      : pending && !saving
        ? '前回の保存結果が未確認です。再送せず、保存結果を確認してください。'
        : null);
  const { corporateType, employeeCount } = activeProfile;

  async function checkResult() {
    if (!pending || checking || saving || saveLock.current) return;
    saveLock.current = true;
    setChecking(true);
    setNotice(null);
    try {
      const client = createBrowserSupabase();
      if (!client) throw Error();
      const loaded = await loadTaxReturnEditor(client, companyId);
      if (loaded.status !== 'loaded') {
        setError(
          '決算実績または会社プロフィールを再取得できませんでした。操作停止を維持しています。',
        );
        return;
      }
      const result = reconcileTaxReturnIntent(loaded.rows, pending);
      sessionStorage.removeItem(storageKey);
      changed();
      setEntries(workspaceRowsToTaxReturnProfile(loaded.rows).entries);
      setActiveProfile(loaded.companyProfile);
      setShowForm(false);
      setEditingId(null);
      setConsistencyIssues([]);
      if (result === 'saved') {
        setError(null);
        setNotice(
          pending.kind === 'delete'
            ? '削除結果を再取得して確認しました。'
            : '保存結果を再取得して確認しました。',
        );
      } else
        setError(
          '送信内容と異なる登録内容を取得しました。現在の実績を表示しています。内容を確認してから操作してください。',
        );
    } catch {
      setError('保存結果を確認できませんでした。操作停止を維持しています。');
    } finally {
      setChecking(false);
      saveLock.current = false;
    }
  }

  async function performMutation(intent: TaxReturnSaveIntent) {
    if (blocked || saveLock.current) return;
    const client = createBrowserSupabase();
    if (!client) {
      setError('Supabase が設定されていません。');
      return;
    }
    const previous =
      intent.id === null
        ? undefined
        : entries.find((e) => e.id === String(intent.id));
    if (intent.id !== null && !previous) {
      setError('対象の実績を確認できません。再読み込みしてください。');
      return;
    }
    saveLock.current = true;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(intent));
      changed();
    } catch {
      saveLock.current = false;
      setSaving(false);
      setError('保存結果の記録を保持できないため送信していません。');
      return;
    }
    try {
      const row = await saveTaxReturn(client, intent, previous?.updatedAt);
      if (!row) {
        setError(
          '保存結果を確認できませんでした。再送せず、保存結果を確認してください。',
        );
        return;
      }
      sessionStorage.removeItem(storageKey);
      changed();
      if (intent.kind === 'delete') {
        if (editingId === String(intent.id)) {
          setShowForm(false);
          setEditingId(null);
        }
        setConsistencyIssues([]);
        setEntries((prev) => prev.filter((e) => e.id !== String(intent.id)));
        setNotice('削除しました。');
      } else {
        const savedEntry = workspaceRowsToTaxReturnProfile([row]).entries[0];
        setConsistencyIssues(
          detectTaxReturnConsistencyIssues(activeProfile, savedEntry),
        );
        setEntries((prev) =>
          [...prev.filter((e) => e.id !== savedEntry.id), savedEntry].sort(
            (a, b) => a.fiscalYearEndDate.localeCompare(b.fiscalYearEndDate),
          ),
        );
        setShowForm(false);
        setNotice('保存しました。');
      }
    } catch {
      setError(
        '保存結果を確認できませんでした。再送せず、保存結果を確認してください。',
      );
    } finally {
      setSaving(false);
      saveLock.current = false;
    }
  }

  function set<K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function openNewForm() {
    if (blocked || saveLock.current) return;
    setNotice(null);
    setDraft(EMPTY_ENTRY_DRAFT);
    setEditingId(null);
    setError(null);
    setConsistencyIssues([]);
    setShowForm(true);
  }

  function openEditForm(entry: TaxReturnEntry) {
    if (blocked || saveLock.current) return;
    setNotice(null);
    const { id, createdAt, updatedAt, ...rest } = entry;
    void createdAt;
    void updatedAt;
    setDraft(rest);
    setEditingId(id);
    setError(null);
    setConsistencyIssues([]);
    setShowForm(true);
  }

  async function handleDelete(id: string) {
    await performMutation({
      version: 1,
      companyId,
      id: Number(id),
      kind: 'delete',
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked || saveLock.current) return;
    if (!draft.fiscalYear.trim()) {
      setError('対象年度を選択してください');
      return;
    }
    if (!draft.fiscalYearEndDate) {
      setError('決算日を入力してください');
      return;
    }
    const selectionError = fiscalYearSelectionError(draft.fiscalYear, draft.fiscalYearEndDate);
    if (selectionError) {
      setError(selectionError);
      return;
    }
    const dateOrderError = validateTaxReturnDateOrder(draft);
    if (dateOrderError) {
      setError(dateOrderError);
      return;
    }
    setError(null);

    const payload = taxReturnEntryDraftToWorkspaceWritePayload(draft);
    if (!validTaxReturnPayload(payload)) {
      setError(
        '入力内容を確認してください。未入力の金額は0に変換せず保存します。',
      );
      return;
    }
    await performMutation({
      version: 1,
      companyId,
      id: editingId ? Number(editingId) : null,
      kind: 'save',
      payload,
    });
  }

  const sortedEntries = [...entries].reverse(); // 新しい順に表示

  return (
    <div className="space-y-4">
      {displayedError && (
        <div
          role="alert"
          className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {displayedError}
        </div>
      )}

      {notice && (
        <p role="status" className="text-sm text-green-700">
          {notice}
        </p>
      )}
      {pending && (
        <button
          type="button"
          onClick={checkResult}
          disabled={checking || saving}
          className="btn-secondary"
        >
          {checking ? '確認中…' : '保存結果を確認'}
        </button>
      )}
      {storageBroken && (
        <Link href={`/admin/workspaces/${companyId}`} className="btn-secondary">
          会社ホームで確認
        </Link>
      )}
      <fieldset disabled={blocked} className="contents">
        {consistencyIssues.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="space-y-2">
                <p className="font-semibold">
                  会社プロフィールと異なる内容があります
                </p>
                <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
                  {consistencyIssues.map((issue) => (
                    <li key={issue.field}>{issue.message}</li>
                  ))}
                </ul>
                <p className="text-xs">
                  申告書と会社プロフィールを確認し、正しい方へ修正してください。
                </p>
              </div>
            </div>
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
                <h2 className="font-semibold text-gray-800">
                  {editingId ? '申告実績を編集' : '新しい申告実績'}
                </h2>
              </div>

              <TaxReturnPeriodSelect
                value={draft.fiscalYear}
                endDate={draft.fiscalYearEndDate}
                onChange={(value) => { set('fiscalYear', value); setError(null); }}
              />
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3" aria-live="polite">
                <p className="font-semibold text-blue-900">{fiscalPeriodHeading(draft.fiscalYearEndDate)}</p>
                <p className="mt-1 text-sm text-blue-900">対象期間：{fiscalPeriodRange(draft.fiscalYearStartDate, draft.fiscalYearEndDate)}</p>
                {!draft.fiscalYearStartDate && <p className="mt-1 text-xs text-blue-800">開始日は自動計算しません。短期決算や決算期変更の場合も、実際の期間を入力してください。</p>}
              </div>

              <div>
                <label htmlFor="tax-return-fiscalYearEndDate" className="form-label">決算日（必須）</label>
                <ManualDateInput
                  id="tax-return-fiscalYearEndDate"
                  value={draft.fiscalYearEndDate || null}
                  onChange={(value) => { setDraft((previous) => ({ ...previous, fiscalYearEndDate: value ?? '', fiscalYear: labelAfterEndDateChange(previous.fiscalYear, value ?? '') })); setError(null); }}
                  label="決算日"
                  placeholder="例: 2026/03/31"
                />
              </div>

              <div>
                <label htmlFor="tax-return-fiscalYearStartDate" className="form-label">決算の対象期間：開始日（任意）</label>
                <ManualDateInput
                  id="tax-return-fiscalYearStartDate"
                  value={draft.fiscalYearStartDate}
                  onChange={(value) => set('fiscalYearStartDate', value)}
                  label="決算の対象期間：開始日"
                  placeholder="例: 2025/04/01"
                />
              </div>

              <div>
                <label htmlFor="tax-return-filedDate" className="form-label">申告日（任意）</label>
                <ManualDateInput
                  id="tax-return-filedDate"
                  value={draft.filedDate}
                  onChange={(value) => set('filedDate', value)}
                  label="申告日"
                  placeholder="例: 2026/05/31"
                />
              </div>

              <div>
                <label className="form-label">資本金（申告時点・任意）</label>
                <FormattedIntegerInput
                  value={draft.capitalAtFiling}
                  onChange={(value) => set('capitalAtFiling', value)}
                  placeholder="例: 3,000,000"
                  ariaLabel="資本金（申告時点）"
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
                  options={(['exempt', 'taxable'] as const).map((v) => ({
                    value: v,
                    label: CONSUMPTION_TAX_LABEL[v],
                  }))}
                  value={draft.consumptionTaxStatus}
                  onChange={(v) => set('consumptionTaxStatus', v)}
                />
              </div>

              {draft.consumptionTaxStatus === 'taxable' && (
                <div className="space-y-2">
                  <label className="form-label">課税方式</label>
                  <ToggleButtons
                    options={(['principle', 'simplified'] as const).map(
                      (v) => ({ value: v, label: TAXATION_METHOD_LABEL[v] }),
                    )}
                    value={draft.taxationMethod}
                    onChange={(v) => set('taxationMethod', v)}
                  />
                </div>
              )}

              <div className="space-y-2">
                <label className="form-label">インボイス登録状況</label>
                <ToggleButtons
                  options={(['not_registered', 'registered'] as const).map(
                    (v) => ({ value: v, label: INVOICE_LABEL[v] }),
                  )}
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
                <label className="form-label">
                  今期、法人税の中間申告はありましたか
                </label>
                <ToggleButtons
                  options={(['none', 'has'] as const).map((v) => ({
                    value: v,
                    label: INTERIM_FILING_LABEL[v],
                  }))}
                  value={draft.corporateTaxInterimFilingActual}
                  onChange={(v) => set('corporateTaxInterimFilingActual', v)}
                />
              </div>

              <div className="space-y-2">
                <label className="form-label">
                  今期、消費税の中間申告は何回でしたか
                </label>
                <select
                  className="form-select"
                  value={draft.consumptionTaxInterimFrequencyActual}
                  onChange={(e) =>
                    set(
                      'consumptionTaxInterimFrequencyActual',
                      e.target.value as ConsumptionTaxInterimFrequency,
                    )
                  }
                >
                  {(['none', '1', '3', '11'] as const).map((v) => (
                    <option key={v} value={v}>
                      {CONSUMPTION_INTERIM_FREQ_LABEL[v]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="card space-y-4">
              {corporateType === 'kabushiki' && (
                <div className="space-y-2">
                  <label className="form-label">決算公告は実施しましたか</label>
                  <ToggleButtons
                    options={[
                      { value: 'false', label: '未実施' },
                      { value: 'true', label: '実施済み' },
                    ]}
                    value={String(draft.financialStatementPublished)}
                    onChange={(v) =>
                      set('financialStatementPublished', v === 'true')
                    }
                  />
                </div>
              )}

              {employeeCount > 0 && (
                <div className="space-y-2">
                  <label className="form-label">源泉所得税の納付実績</label>
                  <ToggleButtons
                    options={[
                      { value: 'monthly' as const, label: '毎月納付' },
                      {
                        value: 'special_exception' as const,
                        label: '年2回（納期の特例）',
                      },
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
                <FormattedIntegerInput
                  value={draft.employeeCountAtFiscalYearEnd}
                  onChange={(value) =>
                    set('employeeCountAtFiscalYearEnd', value)
                  }
                  placeholder="例: 5"
                  ariaLabel="期末時点の従業員数"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="btn-primary flex-1 disabled:opacity-60"
              >
                {saving ? '保存中…' : editingId ? '更新する' : '追加する'}
                <CheckCircle2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="btn-secondary px-4"
              >
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
      </fieldset>
    </div>
  );
}
