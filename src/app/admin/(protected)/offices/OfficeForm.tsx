'use client';

import { useRef, useState, useSyncExternalStore } from 'react';
import {
  canonical,
  configurationFromValues,
  officeConfiguration,
  validOfficeIntent,
  validOfficeSnapshot,
  reconcileOfficeSave,
  type OfficeSnapshot,
  type OfficeSaveIntent,
} from '@/lib/adminOfficeData';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { LINK_STATUSES } from '@/lib/adminConstants';

export type MunicipalityOption = {
  id: number;
  code: string;
  name: string;
  prefecture_name: string;
};

export type OrganizationTypeOption = {
  id: number;
  code: string;
  name: string;
};

export type OfficeFormValues = {
  id?: number;
  organization_id?: number;
  organization_type_id: number | '';
  organization_name: string;
  name: string;
  postal_code: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  website_url: string;
  official_url: string;
  official_url_status: string;
  fallback_url: string;
  e_filing_url: string;
  download_page_url: string;
  map_url: string;
  business_hours: string;
  notes: string;
  municipality_ids: number[];
};

function emptyValues(defaultTypeId: number | ''): OfficeFormValues {
  return {
    organization_type_id: defaultTypeId,
    organization_name: '',
    name: '',
    postal_code: '',
    address: '',
    phone: '',
    fax: '',
    email: '',
    website_url: '',
    official_url: '',
    official_url_status: 'unchecked',
    fallback_url: '',
    e_filing_url: '',
    download_page_url: '',
    map_url: '',
    business_hours: '',
    notes: '',
    municipality_ids: [],
  };
}

export default function OfficeForm({
  municipalities,
  organizationTypes,
  initialValues,
  baseline = null,
}: {
  municipalities: MunicipalityOption[];
  organizationTypes: OrganizationTypeOption[];
  initialValues?: OfficeFormValues;
  baseline?: OfficeSnapshot | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<OfficeFormValues>(
    initialValues ?? emptyValues(organizationTypes[0]?.id ?? ''),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveLock = useRef(false);
  const storageKey = `sunboo:pending-office-save:${initialValues?.id ?? 'new'}`;
  const rawPending = useSyncExternalStore(
    (callback) => {
      window.addEventListener('storage', callback);
      window.addEventListener('sunboo:office-save', callback);
      return () => {
        window.removeEventListener('storage', callback);
        window.removeEventListener('sunboo:office-save', callback);
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
  let pending: OfficeSaveIntent | null = null;
  let storageBroken = false;
  if (rawPending) {
    try {
      const value: unknown = JSON.parse(rawPending);
      if (!validOfficeIntent(value) || value.id !== (initialValues?.id ?? null))
        throw Error();
      pending = value;
    } catch {
      storageBroken = true;
    }
  }
  const [checking, setChecking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const blocked =
    rawPending === null || !!rawPending || saving || checking || leaving;
  const changed = () => window.dispatchEvent(new Event('sunboo:office-save'));
  const displayedError =
    error ??
    (storageBroken
      ? '保存結果の記録を確認できません。窓口一覧で登録内容を確認してください。'
      : pending && !saving
        ? '前回の保存結果が未確認です。保存結果を確認してください。'
        : null);
  async function checkResult() {
    if (!pending || checking || saving) return;
    setChecking(true);
    try {
      const client = createBrowserSupabase();
      if (!client) throw Error();
      const result = await reconcileOfficeSave(client, pending);
      if (result === 'unavailable') {
        setError(
          '保存結果を取得できませんでした。時間をおいて再度確認してください。',
        );
        return;
      }
      setLeaving(true);
      sessionStorage.removeItem(storageKey);
      changed();
      // Reload all sources and baseline before permitting another save.
      if (result === 'saved') {
        router.push('/admin/offices');
        router.refresh();
      } else {
        window.location.reload();
      }
    } catch {
      setError(
        '保存結果を確認できませんでした。再送せず、時間をおいて再度確認してください。',
      );
    } finally {
      setChecking(false);
    }
  }
  const isEdit = Boolean(initialValues?.id);

  function set<K extends keyof OfficeFormValues>(
    key: K,
    value: OfficeFormValues[K],
  ) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function toggleMunicipality(id: number) {
    setValues((v) => ({
      ...v,
      municipality_ids: v.municipality_ids.includes(id)
        ? v.municipality_ids.filter((m) => m !== id)
        : [...v.municipality_ids, id],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (blocked || saveLock.current || storageBroken || (isEdit && !baseline))
      return;
    setError(null);
    const client = createBrowserSupabase();
    if (!client) {
      setError('Supabase が設定されていません。');
      return;
    }
    if (
      !values.organization_type_id ||
      !values.organization_name.trim() ||
      !values.name.trim()
    ) {
      setError('機関種別・統括組織名・窓口名を入力してください。');
      return;
    }
    saveLock.current = true;
    setSaving(true);
    const configuration = configurationFromValues(values);
    const intent: OfficeSaveIntent = {
      version: 1,
      id: values.id ?? null,
      configuration,
    };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(intent));
      changed();
    } catch {
      saveLock.current = false;
      setSaving(false);
      setError('保存結果の記録を保持できないため、送信していません。');
      return;
    }
    try {
      const { municipality_ids, ...payload } = configuration;
      const result = await client.rpc('save_admin_office', {
        p_office_id: intent.id,
        p_expected: baseline,
        p_values: payload,
        p_municipality_ids: municipality_ids,
      });
      if (
        result.error ||
        !result.data ||
        !Number.isSafeInteger(result.data.id) ||
        !validOfficeSnapshot(result.data.snapshot) ||
        result.data.snapshot.office.id !== result.data.id ||
        (intent.id !== null && result.data.id !== intent.id) ||
        canonical(officeConfiguration(result.data.snapshot)) !==
          canonical(configuration)
      )
        throw Error();
      setLeaving(true);
      sessionStorage.removeItem(storageKey);
      changed();
      router.push('/admin/offices');
      router.refresh();
    } catch {
      setError(
        '保存結果を確認できませんでした。再送せず、保存結果を確認してください。',
      );
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  const groupedMunicipalities = municipalities.reduce<
    Record<string, MunicipalityOption[]>
  >((acc, m) => {
    acc[m.prefecture_name] = acc[m.prefecture_name] ?? [];
    acc[m.prefecture_name].push(m);
    return acc;
  }, {});

  return (
    <form onSubmit={handleSubmit} className="card max-w-3xl space-y-5">
      {displayedError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
        >
          {displayedError}
        </div>
      )}

      {storageBroken && (
        <Link href="/admin/offices" className="btn-secondary">
          窓口一覧で確認
        </Link>
      )}
      {(pending || storageBroken) && (
        <div className="space-y-2">
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
          <p className="text-xs">確認できるまで編集と再送を停止しています。</p>
        </div>
      )}
      <fieldset disabled={blocked} className="contents">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="form-label">機関種別 *</label>
            <select
              required
              value={values.organization_type_id}
              onChange={(e) =>
                set(
                  'organization_type_id',
                  e.target.value ? Number(e.target.value) : '',
                )
              }
              className="form-select"
            >
              <option value="">選択してください</option>
              {organizationTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">統括組織名 *</label>
            <input
              required
              value={values.organization_name}
              onChange={(e) => set('organization_name', e.target.value)}
              className="form-input"
              placeholder="例：福岡法務局"
            />
            <p className="mt-1 text-xs text-gray-400">
              同じ種別・同じ名前の組織を再利用します。他の窓口の組織名は変更しません。
            </p>
          </div>
        </div>

        <div>
          <label className="form-label">窓口名 *</label>
          <input
            required
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            className="form-input"
            placeholder="例：福岡法務局北九州支局"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="form-label">郵便番号</label>
            <input
              value={values.postal_code}
              onChange={(e) => set('postal_code', e.target.value)}
              className="form-input"
              placeholder="810-0001"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="form-label">住所</label>
            <input
              value={values.address}
              onChange={(e) => set('address', e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="form-label">電話番号</label>
            <input
              value={values.phone}
              onChange={(e) => set('phone', e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">FAX</label>
            <input
              value={values.fax}
              onChange={(e) => set('fax', e.target.value)}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">メールアドレス</label>
            <input
              value={values.email}
              onChange={(e) => set('email', e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        <div>
          <label className="form-label">営業時間</label>
          <input
            value={values.business_hours}
            onChange={(e) => set('business_hours', e.target.value)}
            className="form-input"
            placeholder="例：平日8:30〜17:15"
          />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="mb-3 text-xs font-semibold text-gray-500">リンク</p>
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
              <input
                value={values.map_url}
                onChange={(e) => set('map_url', e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">電子申請URL</label>
              <input
                value={values.e_filing_url}
                onChange={(e) => set('e_filing_url', e.target.value)}
                className="form-input"
              />
            </div>
            <div>
              <label className="form-label">ダウンロードページURL</label>
              <input
                value={values.download_page_url}
                onChange={(e) => set('download_page_url', e.target.value)}
                className="form-input"
              />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="form-label">
                公式URL（リンク健全性チェック対象）
              </label>
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
            <label className="form-label">
              フォールバックURL（リンク切れ時の案内先）
            </label>
            <input
              value={values.fallback_url}
              onChange={(e) => set('fallback_url', e.target.value)}
              className="form-input"
            />
          </div>
        </div>

        <div>
          <label className="form-label">備考</label>
          <textarea
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="form-input"
            rows={2}
          />
        </div>

        <div className="border-t border-gray-100 pt-5">
          <p className="mb-3 text-xs font-semibold text-gray-500">
            対応市区町村（{values.municipality_ids.length}件選択中）
          </p>
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 p-3">
            {Object.entries(groupedMunicipalities).map(([pref, list]) => (
              <div key={pref} className="mb-3 last:mb-0">
                <p className="mb-1.5 text-xs font-semibold text-gray-500">
                  {pref}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                  {list.map((m) => (
                    <label
                      key={m.id}
                      className="flex items-center gap-1.5 text-xs text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={values.municipality_ids.includes(m.id)}
                        onChange={() => toggleMunicipality(m.id)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {m.name}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 border-t border-gray-100 pt-5">
          <button
            type="submit"
            disabled={saving}
            className="btn-primary disabled:opacity-60"
          >
            {saving ? '保存中…' : isEdit ? '更新する' : '追加する'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/admin/offices')}
            className="btn-secondary"
          >
            キャンセル
          </button>
        </div>
      </fieldset>
    </form>
  );
}
