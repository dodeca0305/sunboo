'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { OFFICE_TYPES, LINK_STATUSES } from '@/lib/adminConstants';

export type MunicipalityOption = {
  id: number;
  code: string;
  name: string;
  prefecture_name: string;
};

export type OfficeFormValues = {
  id?: number;
  municipality_id: number | '';
  office_type: string;
  name: string;
  address: string;
  phone: string;
  website_url: string;
  map_url: string;
  official_url: string;
  official_url_status: string;
  fallback_url: string;
};

const EMPTY_VALUES: OfficeFormValues = {
  municipality_id: '',
  office_type: OFFICE_TYPES[0].value,
  name: '',
  address: '',
  phone: '',
  website_url: '',
  map_url: '',
  official_url: '',
  official_url_status: 'unchecked',
  fallback_url: '',
};

export default function OfficeForm({
  municipalities,
  initialValues,
}: {
  municipalities: MunicipalityOption[];
  initialValues?: OfficeFormValues;
}) {
  const router = useRouter();
  const [values, setValues] = useState<OfficeFormValues>(initialValues ?? EMPTY_VALUES);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = Boolean(initialValues?.id);

  function set<K extends keyof OfficeFormValues>(key: K, value: OfficeFormValues[K]) {
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
    if (!values.municipality_id) {
      setError('市区町村を選択してください。');
      return;
    }

    setSaving(true);

    const payload = {
      municipality_id: values.municipality_id,
      office_type: values.office_type,
      name: values.name,
      address: values.address || null,
      phone: values.phone || null,
      website_url: values.website_url || null,
      map_url: values.map_url || null,
      official_url: values.official_url || null,
      official_url_status: values.official_url_status,
      fallback_url: values.fallback_url || null,
    };

    const { error: saveError } = isEdit
      ? await supabase.from('jurisdiction_offices').update(payload).eq('id', values.id)
      : await supabase.from('jurisdiction_offices').insert(payload);

    setSaving(false);

    if (saveError) {
      setError(`保存に失敗しました: ${saveError.message}`);
      return;
    }

    router.push('/admin/offices');
    router.refresh();
  }

  const groupedMunicipalities = municipalities.reduce<Record<string, MunicipalityOption[]>>((acc, m) => {
    acc[m.prefecture_name] = acc[m.prefecture_name] ?? [];
    acc[m.prefecture_name].push(m);
    return acc;
  }, {});

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">市区町村 *</label>
          <select
            required
            value={values.municipality_id}
            onChange={(e) => set('municipality_id', e.target.value ? Number(e.target.value) : '')}
            className="form-select"
          >
            <option value="">選択してください</option>
            {Object.entries(groupedMunicipalities).map(([pref, list]) => (
              <optgroup key={pref} label={pref}>
                {list.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}（{m.code}）
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="form-label">機関種別 *</label>
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
      </div>

      <div>
        <label className="form-label">機関名 *</label>
        <input
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          className="form-input"
          placeholder="例：渋谷税務署"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">住所</label>
          <input value={values.address} onChange={(e) => set('address', e.target.value)} className="form-input" />
        </div>
        <div>
          <label className="form-label">電話番号</label>
          <input value={values.phone} onChange={(e) => set('phone', e.target.value)} className="form-input" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">Webサイト URL</label>
          <input
            value={values.website_url}
            onChange={(e) => set('website_url', e.target.value)}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">地図 URL</label>
          <input value={values.map_url} onChange={(e) => set('map_url', e.target.value)} className="form-input" />
        </div>
      </div>

      <div className="border-t border-gray-100 pt-5">
        <p className="mb-3 text-xs font-semibold text-gray-500">公式リンク管理</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label">公式URL</label>
            <input
              value={values.official_url}
              onChange={(e) => set('official_url', e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">リンク状態</label>
            <select
              value={values.official_url_status}
              onChange={(e) => set('official_url_status', e.target.value)}
              className="form-select"
            >
              {LINK_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4">
          <label className="form-label">フォールバックURL（リンク切れ時の案内先）</label>
          <input
            value={values.fallback_url}
            onChange={(e) => set('fallback_url', e.target.value)}
            className="form-input"
          />
        </div>
      </div>

      <div className="flex gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
        </button>
        <button type="button" onClick={() => router.push('/admin/offices')} className="btn-secondary">
          キャンセル
        </button>
      </div>
    </form>
  );
}
