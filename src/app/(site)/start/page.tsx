'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { prefectures as staticPrefectures } from '@/data/prefectures';
import { MapPin, Users, Calendar, ArrowRight, AlertTriangle, Building2, UserCog } from 'lucide-react';
import type { CorporateType } from '@/lib/types';

const FALLBACK_MUNICIPALITIES: Record<string, { code: string; name: string }[]> = {
  '13': [{ code: '13113', name: '渋谷区' }],
};

const FISCAL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type PrefItem = { code: string; name: string };
type MuniItem = { code: string; name: string };

export default function StartPage() {
  const router = useRouter();

  const [prefList, setPrefList] = useState<PrefItem[]>([]);
  const [muniList, setMuniList] = useState<MuniItem[]>([]);

  const [prefCode, setPrefCode] = useState('');
  const [muniCode, setMuniCode] = useState('');
  const [hasEmployees, setHasEmployees] = useState<boolean | null>(null);
  const [fiscalMonth, setFiscalMonth] = useState<number | null>(null);
  const [corporateType, setCorporateType] = useState<CorporateType | null>(null);
  const [hasOfficerTerm, setHasOfficerTerm] = useState<boolean | null>(null);

  const [loadingMunis, setLoadingMunis] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'pref' | 'muni' | 'emp' | 'fm' | 'corp' | 'officerTerm', string>>>({});

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setPrefList(staticPrefectures.map((p) => ({ code: p.code, name: p.name })));
        return;
      }
      const { data } = await supabase.from('prefectures').select('code, name').order('code');
      const list = (data as PrefItem[] | null) ?? [];
      setPrefList(
        list.length > 0
          ? list
          : staticPrefectures.map((p) => ({ code: p.code, name: p.name })),
      );
    }
    load();
  }, []);

  useEffect(() => {
    if (!prefCode) {
      setMuniList([]);
      setMuniCode('');
      return;
    }

    async function load() {
      setLoadingMunis(true);
      setMuniCode('');

      if (!supabase) {
        setMuniList(FALLBACK_MUNICIPALITIES[prefCode] ?? []);
        setLoadingMunis(false);
        return;
      }

      const { data: prefData } = await supabase
        .from('prefectures')
        .select('id')
        .eq('code', prefCode)
        .single();

      const pref = prefData as { id: number } | null;
      if (!pref) {
        setMuniList([]);
        setLoadingMunis(false);
        return;
      }

      const { data } = await supabase
        .from('municipalities')
        .select('code, name')
        .eq('prefecture_id', pref.id)
        .order('code');

      setMuniList((data as MuniItem[] | null) ?? []);
      setLoadingMunis(false);
    }

    load();
  }, [prefCode]);

  function validate(): boolean {
    const errs: typeof errors = {};
    if (!prefCode) errs.pref = '都道府県を選択してください';
    if (prefCode && muniList.length === 0) errs.muni = '現在未対応のエリアです';
    else if (!muniCode) errs.muni = '市区町村を選択してください';
    if (hasEmployees === null) errs.emp = '従業員の有無を選択してください';
    if (!fiscalMonth) errs.fm = '決算月を選択してください';
    if (!corporateType) errs.corp = '法人の種類を選択してください';
    if (corporateType === 'kabushiki' && hasOfficerTerm === null) {
      errs.officerTerm = '役員任期の有無を選択してください';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const params = new URLSearchParams({
      pref: prefCode,
      muni: muniCode,
      emp: String(hasEmployees),
      fm: String(fiscalMonth),
      corp: String(corporateType),
    });
    if (corporateType === 'kabushiki') {
      params.set('officerTerm', String(hasOfficerTerm));
    }
    router.push(`/result?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      {/* ページヘッダー */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">会社情報を入力</h1>
        <p className="mt-2 text-sm text-gray-500">
          3項目を入力するだけで、提出書類・期限・提出先を一覧表示します
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ① 所在地 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              1
            </span>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-800">会社の所在地</h2>
            </div>
          </div>

          <div>
            <label className="form-label">都道府県</label>
            <div className="relative">
              <select
                className="form-select pr-9"
                value={prefCode}
                onChange={(e) => setPrefCode(e.target.value)}
              >
                <option value="">選択してください</option>
                {prefList.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                ▾
              </span>
            </div>
            {errors.pref && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errors.pref}
              </p>
            )}
          </div>

          {prefCode && (
            <div>
              <label className="form-label">市区町村</label>
              {loadingMunis ? (
                <p className="py-2 text-sm text-gray-400">読み込み中...</p>
              ) : muniList.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-medium text-gray-700">
                    このエリアは現在未対応です（順次拡大予定）
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    現在は東京都渋谷区のみ対応しています
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <select
                    className="form-select pr-9"
                    value={muniCode}
                    onChange={(e) => setMuniCode(e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {muniList.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                    ▾
                  </span>
                </div>
              )}
              {errors.muni && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {errors.muni}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ② 従業員 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              2
            </span>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-800">従業員はいますか？</h2>
            </div>
          </div>
          <div className="flex gap-3">
            {([true, false] as const).map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setHasEmployees(val)}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  hasEmployees === val
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {val ? 'あり' : 'なし'}
              </button>
            ))}
          </div>
          {errors.emp && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.emp}
            </p>
          )}
        </div>

        {/* ③ 決算月 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              3
            </span>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-800">決算月</h2>
            </div>
          </div>
          <div className="relative">
            <select
              className="form-select pr-9"
              value={fiscalMonth ?? ''}
              onChange={(e) =>
                setFiscalMonth(e.target.value ? Number(e.target.value) : null)
              }
            >
              <option value="">選択してください</option>
              {FISCAL_MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m}月
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              ▾
            </span>
          </div>
          {errors.fm && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.fm}
            </p>
          )}
        </div>

        {/* ④ 法人の種類 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              4
            </span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              <h2 className="font-semibold text-gray-800">法人の種類</h2>
            </div>
          </div>
          <div className="flex gap-3">
            {([
              { value: 'kabushiki', label: '株式会社' },
              { value: 'godo', label: '合同会社' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setCorporateType(opt.value);
                  if (opt.value === 'godo') setHasOfficerTerm(null);
                }}
                className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                  corporateType === opt.value
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {errors.corp && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.corp}
            </p>
          )}
        </div>

        {/* ⑤ 役員任期（株式会社のみ） */}
        {corporateType === 'kabushiki' && (
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                5
              </span>
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-gray-400" />
                <h2 className="font-semibold text-gray-800">役員に任期の定めがありますか？</h2>
              </div>
            </div>
            <div className="flex gap-3">
              {([true, false] as const).map((val) => (
                <button
                  key={String(val)}
                  type="button"
                  onClick={() => setHasOfficerTerm(val)}
                  className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    hasOfficerTerm === val
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {val ? 'あり' : 'なし'}
                </button>
              ))}
            </div>
            {errors.officerTerm && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />
                {errors.officerTerm}
              </p>
            )}
          </div>
        )}

        {/* 送信ボタン */}
        <button
          type="submit"
          className="btn-primary btn-primary-lg w-full text-base"
        >
          診断結果を見る
          <ArrowRight className="h-5 w-5" />
        </button>
      </form>

      <p className="mt-4 text-center text-xs text-gray-400">
        入力した情報はサーバーに保存されません
      </p>
    </div>
  );
}
