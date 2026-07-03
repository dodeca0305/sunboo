'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { CORPORATE_TYPES, OFFICE_TYPES, PROCEDURE_CATEGORIES, TIMING_TYPES } from '@/lib/adminConstants';

export type ProcedureFormValues = {
  id?: number;
  code: string;
  name: string;
  description: string;
  category: string;
  requires_employees: boolean;
  applicable_industries: string; // カンマ区切りテキストとして編集
  office_type: string;
  frequency: string;
  timing_label: string;
  timing_type: string;
  timing_data: string; // JSON テキストとして編集
  priority: number;
  is_active: boolean;
  corporate_type: string; // '' | 'kabushiki' | 'godo'
  requires_officer_term: boolean;
  include_in_diagnosis: boolean;
  target_note: string;
  submission_method: string;
  e_filing_system_name: string;
  e_filing_system_url: string;
  caution_note: string;
};

const EMPTY_VALUES: ProcedureFormValues = {
  code: '',
  name: '',
  description: '',
  category: PROCEDURE_CATEGORIES[0].value,
  requires_employees: false,
  applicable_industries: '',
  office_type: OFFICE_TYPES[0].value,
  frequency: 'one_time',
  timing_label: '',
  timing_type: TIMING_TYPES[0].value,
  timing_data: '',
  priority: 0,
  is_active: true,
  corporate_type: '',
  requires_officer_term: false,
  include_in_diagnosis: true,
  target_note: '',
  submission_method: '',
  e_filing_system_name: '',
  e_filing_system_url: '',
  caution_note: '',
};

export default function ProcedureForm({ initialValues }: { initialValues?: ProcedureFormValues }) {
  const router = useRouter();
  const [values, setValues] = useState<ProcedureFormValues>(initialValues ?? EMPTY_VALUES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initialValues?.id);

  function set<K extends keyof ProcedureFormValues>(key: K, value: ProcedureFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    let timingData: Record<string, unknown> | null = null;
    if (values.timing_data.trim()) {
      try {
        timingData = JSON.parse(values.timing_data);
      } catch {
        setError('期限データ（JSON）の形式が正しくありません。');
        return;
      }
    }

    const applicableIndustries = values.applicable_industries
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    setSaving(true);

    const payload = {
      code: values.code,
      name: values.name,
      description: values.description || null,
      category: values.category,
      requires_employees: values.requires_employees,
      applicable_industries: applicableIndustries.length > 0 ? applicableIndustries : null,
      office_type: values.office_type,
      frequency: values.frequency,
      timing_label: values.timing_label,
      timing_type: values.timing_type,
      timing_data: timingData,
      priority: values.priority,
      is_active: values.is_active,
      corporate_type: values.corporate_type || null,
      requires_officer_term: values.requires_officer_term,
      include_in_diagnosis: values.include_in_diagnosis,
      target_note: values.target_note || null,
      submission_method: values.submission_method || null,
      e_filing_system_name: values.e_filing_system_name || null,
      e_filing_system_url: values.e_filing_system_url || null,
      caution_note: values.caution_note || null,
    };

    const { error: saveError } = isEdit
      ? await supabase.from('procedures').update(payload).eq('id', values.id)
      : await supabase.from('procedures').insert(payload);

    setSaving(false);

    if (saveError) {
      setError(`保存に失敗しました: ${saveError.message}`);
      return;
    }

    router.push('/admin/procedures');
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">手続きコード *</label>
          <input
            required
            value={values.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            className="form-input"
            placeholder="例：CORP_ESTABLISH_TAX"
          />
        </div>
        <div>
          <label className="form-label">カテゴリ *</label>
          <select
            required
            value={values.category}
            onChange={(e) => set('category', e.target.value)}
            className="form-select"
          >
            {PROCEDURE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">手続き名 *</label>
        <input required value={values.name} onChange={(e) => set('name', e.target.value)} className="form-input" />
      </div>

      <div>
        <label className="form-label">説明</label>
        <textarea
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          className="form-input"
          rows={3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">提出先（機関種別） *</label>
          <select
            required
            value={values.office_type}
            onChange={(e) => set('office_type', e.target.value)}
            className="form-select"
          >
            {OFFICE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">頻度</label>
          <input
            value={values.frequency}
            onChange={(e) => set('frequency', e.target.value)}
            className="form-input"
            placeholder="one_time / monthly / annual"
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="requires_employees"
          type="checkbox"
          checked={values.requires_employees}
          onChange={(e) => set('requires_employees', e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="requires_employees" className="text-sm text-gray-700">
          従業員がいる会社のみ対象
        </label>
      </div>

      <div>
        <label className="form-label">対象業種（カンマ区切り、空欄で全業種）</label>
        <input
          value={values.applicable_industries}
          onChange={(e) => set('applicable_industries', e.target.value)}
          className="form-input"
          placeholder="例：restaurant, construction"
        />
      </div>

      <div className="border-t border-gray-100 pt-5">
        <p className="mb-3 text-xs font-semibold text-gray-500">期限計算</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label">期限の表示ラベル *</label>
            <input
              required
              value={values.timing_label}
              onChange={(e) => set('timing_label', e.target.value)}
              className="form-input"
              placeholder="例：設立日から2ヶ月以内"
            />
          </div>
          <div>
            <label className="form-label">期限計算タイプ *</label>
            <select
              required
              value={values.timing_type}
              onChange={(e) => set('timing_type', e.target.value)}
              className="form-select"
            >
              {TIMING_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.value}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              {TIMING_TYPES.find((t) => t.value === values.timing_type)?.label}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <label className="form-label">期限データ（JSON、任意）</label>
          <textarea
            value={values.timing_data}
            onChange={(e) => set('timing_data', e.target.value)}
            className="form-input font-mono text-xs"
            rows={2}
            placeholder='例：{"months": 2}'
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">表示優先度</label>
          <input
            type="number"
            value={values.priority}
            onChange={(e) => set('priority', Number(e.target.value))}
            className="form-input"
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={values.is_active}
              onChange={(e) => set('is_active', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            有効（診断結果に表示する）
          </label>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <p className="mb-3 text-xs font-semibold text-gray-500">法務・登記オプション（任意）</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label">対象の法人形態</label>
            <select
              value={values.corporate_type}
              onChange={(e) => set('corporate_type', e.target.value)}
              className="form-select"
            >
              {CORPORATE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">電子申請システム名</label>
            <input
              value={values.e_filing_system_name}
              onChange={(e) => set('e_filing_system_name', e.target.value)}
              className="form-input"
              placeholder="例：登記・供託オンライン申請システム"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="form-label">電子申請システムURL</label>
          <input
            value={values.e_filing_system_url}
            onChange={(e) => set('e_filing_system_url', e.target.value)}
            className="form-input"
            placeholder="https://..."
          />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={values.requires_officer_term}
              onChange={(e) => set('requires_officer_term', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            役員任期の定めがある場合のみ対象
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={values.include_in_diagnosis}
              onChange={(e) => set('include_in_diagnosis', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            診断結果（スケジュール）に自動表示する（オフの場合は一覧・検索にのみ表示）
          </label>
        </div>

        <div className="mt-4">
          <label className="form-label">対象</label>
          <input
            value={values.target_note}
            onChange={(e) => set('target_note', e.target.value)}
            className="form-input"
            placeholder="例：株式会社を新規設立する場合"
          />
        </div>

        <div className="mt-4">
          <label className="form-label">提出方法</label>
          <input
            value={values.submission_method}
            onChange={(e) => set('submission_method', e.target.value)}
            className="form-input"
            placeholder="例：管轄法務局の窓口へ持参、郵送、またはオンライン申請"
          />
        </div>

        <div className="mt-4">
          <label className="form-label">注意点</label>
          <textarea
            value={values.caution_note}
            onChange={(e) => set('caution_note', e.target.value)}
            className="form-input"
            rows={2}
            placeholder="例：本情報は一般的な参考情報です。詳細は司法書士等の専門家にご確認ください。"
          />
        </div>
      </div>

      <div className="flex gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
        </button>
        <button type="button" onClick={() => router.push('/admin/procedures')} className="btn-secondary">
          キャンセル
        </button>
      </div>
    </form>
  );
}
