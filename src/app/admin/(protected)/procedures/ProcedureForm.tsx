'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { OFFICE_TYPES, PROCEDURE_CATEGORIES, TIMING_TYPES } from '@/lib/adminConstants';

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
