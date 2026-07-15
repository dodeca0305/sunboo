'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { prefectures as staticPrefectures } from '@/data/prefectures';
import { registerCompanyEvent, getBrowserId, fetchEventTypes } from '@/lib/events';
import type { CorporateType, EventType, EventTypeCode, EventRegistrationResult } from '@/lib/types';
import {
  createCompanyProfile, loadCompanyProfile, saveCompanyProfile, type CompanyProfile,
} from '@/lib/companyProfile';
import ScheduleList from '../result/ScheduleList';
import { toScheduleProcedure } from '@/lib/scheduleProcedure';
import { trackEvent } from '@/lib/analytics';
import {
  MapPin, Users, Building2, PartyPopper, UserPlus, UserCog,
  ArrowRight, AlertTriangle, CheckCircle2, DatabaseZap, RotateCcw, Pencil, Info,
} from 'lucide-react';
import SegmentedControl from '@/components/SegmentedControl';

const CORPORATE_TYPE_LABEL: Record<CorporateType, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

const EVENT_ICON: Record<EventTypeCode, typeof PartyPopper> = {
  company_establishment: PartyPopper,
  employee_hired: UserPlus,
  officer_change: UserCog,
};

function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

type PrefItem = { code: string; name: string };
type MuniItem = { code: string; name: string };

export default function EventsPage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);

  // ── 会社情報登録フォーム（プロフィール未登録時のみ表示） ──
  const [prefList, setPrefList] = useState<PrefItem[]>([]);
  const [muniList, setMuniList] = useState<MuniItem[]>([]);
  const [loadingMunis, setLoadingMunis] = useState(false);
  const [prefCode, setPrefCode] = useState('');
  const [muniCode, setMuniCode] = useState('');
  const [corporateType, setCorporateType] = useState<CorporateType | null>(null);
  const [hasEmployees, setHasEmployees] = useState<boolean | null>(null);
  const [profileErrors, setProfileErrors] = useState<Partial<Record<'pref' | 'muni' | 'corp' | 'emp', string>>>({});

  // ── イベント選択 ──
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [selectedCode, setSelectedCode] = useState<EventTypeCode | null>(null);
  const [eventDate, setEventDate] = useState(todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<EventRegistrationResult | null>(null);

  useEffect(() => {
    setProfile(loadCompanyProfile());
    setProfileLoaded(true);
  }, []);

  useEffect(() => {
    async function load() {
      if (!supabase) {
        setPrefList(staticPrefectures.map((p) => ({ code: p.code, name: p.name })));
        return;
      }
      const { data } = await supabase.from('prefectures').select('code, name').order('code');
      const list = (data as PrefItem[] | null) ?? [];
      setPrefList(list.length > 0 ? list : staticPrefectures.map((p) => ({ code: p.code, name: p.name })));
    }
    load();
  }, []);

  useEffect(() => {
    if (!supabase) return;
    fetchEventTypes(supabase).then(setEventTypes);
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
        setMuniList([]);
        setLoadingMunis(false);
        return;
      }
      const { data: prefData } = await supabase.from('prefectures').select('id').eq('code', prefCode).single();
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

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof profileErrors = {};
    if (!prefCode) errs.pref = '都道府県を選択してください';
    if (prefCode && muniList.length === 0) errs.muni = '現在未対応のエリアです';
    else if (!muniCode) errs.muni = '市区町村を選択してください';
    if (!corporateType) errs.corp = '法人の種類を選択してください';
    if (hasEmployees === null) errs.emp = '従業員の有無を選択してください';
    setProfileErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const prefName = prefList.find((p) => p.code === prefCode)?.name ?? prefCode;
    const muniName = muniList.find((m) => m.code === muniCode)?.name ?? muniCode;
    const newProfile: CompanyProfile = createCompanyProfile({
      prefectureCode: prefCode,
      prefectureName: prefName,
      municipalityCode: muniCode,
      municipalityName: muniName,
      corporateType: corporateType as CorporateType,
      // この簡易フォームは「あり/なし」しか聞かないため、正確な人数は /profile での入力に委ねる
      employeeCount: hasEmployees ? 1 : 0,
    });
    saveCompanyProfile(newProfile);
    setProfile(newProfile);
  }

  function handleEditProfile() {
    setProfile(null);
    setResult(null);
    setSelectedCode(null);
  }

  async function handleRegister() {
    if (!profile || !selectedCode || !supabase) return;
    setSubmitting(true);
    setSubmitError(null);
    const browserId = getBrowserId();
    const registration = await registerCompanyEvent(
      supabase,
      browserId,
      {
        eventTypeCode: selectedCode,
        eventDate,
        municipalityCode: profile.municipalityCode,
        corporateType: profile.corporateType,
        hasEmployees: profile.employeeCount > 0,
      },
      profile,
    );
    setSubmitting(false);
    if (!registration) {
      setSubmitError('イベントの登録に失敗しました。時間をおいて再度お試しください。');
      return;
    }
    trackEvent('event_registered', { eventTypeCode: selectedCode });
    setResult(registration);
  }

  function handleRegisterAnother() {
    setResult(null);
    setSelectedCode(null);
    setEventDate(todayIso());
  }

  if (!profileLoaded) return null;

  if (!supabase) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="card space-y-4 py-12">
          <DatabaseZap className="mx-auto h-8 w-8 text-gray-300" />
          <p className="font-semibold text-gray-700">データベース未接続</p>
          <p className="text-sm text-gray-500">
            Supabase の環境変数を設定すると、イベント登録機能が利用できます。
          </p>
        </div>
      </div>
    );
  }

  // ── 結果表示 ──
  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-8 rounded-xl border border-blue-100 bg-blue-50 p-6">
          <div className="flex items-center gap-2 text-blue-700">
            <CheckCircle2 className="h-5 w-5" />
            <p className="text-sm font-semibold">{result.eventType.name}を登録しました</p>
          </div>
          <p className="mt-2 text-sm text-blue-900">
            {profile?.prefectureName} {profile?.municipalityName} ・ 発生日 {eventDate}
          </p>
        </div>

        {result.warnings.length > 0 && (
          <div className="mb-8 space-y-2">
            {result.warnings.map((w, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                  w.severity === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-800'
                    : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}
              >
                {w.severity === 'warning' ? (
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                ) : (
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                )}
                {w.message}
              </div>
            ))}
          </div>
        )}

        {result.procedures.length > 0 ? (
          <section>
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              必要手続き
              <span className="ml-2 text-sm font-normal text-sunboo-ink-muted">{result.procedures.length}件</span>
            </h2>
            <ScheduleList procedures={result.procedures.map(toScheduleProcedure)} />
          </section>
        ) : (
          <div className="card py-10 text-center text-sm text-gray-500">
            該当する手続きが見つかりませんでした。
          </div>
        )}

        <div className="mt-10 flex justify-center gap-3">
          <button type="button" onClick={handleRegisterAnother} className="btn-secondary inline-flex items-center gap-1.5 text-sm">
            <RotateCcw className="h-4 w-4" />
            別のイベントを登録する
          </button>
        </div>

        <p className="mt-8 flex items-start gap-2 text-xs text-sunboo-ink-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。
        </p>
      </div>
    );
  }

  // ── ① 会社情報登録（初回のみ） ──
  if (!profile) {
    return (
      <div className="mx-auto max-w-xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">会社情報を登録</h1>
          <p className="mt-2 text-sm text-gray-500">
            最初に一度だけ入力すれば、次回以降はイベントを選ぶだけで登録できます
          </p>
        </div>

        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">会社の所在地</h2>
            </div>
            <div>
              <label className="form-label">都道府県</label>
              <select className="form-select" value={prefCode} onChange={(e) => setPrefCode(e.target.value)}>
                <option value="">選択してください</option>
                {prefList.map((p) => (
                  <option key={p.code} value={p.code}>{p.name}</option>
                ))}
              </select>
              {profileErrors.pref && (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                  <AlertTriangle className="h-3.5 w-3.5" />{profileErrors.pref}
                </p>
              )}
            </div>
            {prefCode && (
              <div>
                <label className="form-label">市区町村</label>
                {loadingMunis ? (
                  <p className="py-2 text-sm text-sunboo-ink-muted">読み込み中...</p>
                ) : muniList.length === 0 ? (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-sm font-medium text-gray-700">このエリアは現在未対応です</p>
                  </div>
                ) : (
                  <select className="form-select" value={muniCode} onChange={(e) => setMuniCode(e.target.value)}>
                    <option value="">選択してください</option>
                    {muniList.map((m) => (
                      <option key={m.code} value={m.code}>{m.name}</option>
                    ))}
                  </select>
                )}
                {profileErrors.muni && (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                    <AlertTriangle className="h-3.5 w-3.5" />{profileErrors.muni}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">法人の種類</h2>
            </div>
            <SegmentedControl
              fullWidth
              options={[
                { value: 'kabushiki', label: '株式会社' },
                { value: 'godo', label: '合同会社' },
              ]}
              value={corporateType}
              onChange={setCorporateType}
            />
            {profileErrors.corp && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />{profileErrors.corp}
              </p>
            )}
          </div>

          <div className="card space-y-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">従業員はいますか？</h2>
            </div>
            <SegmentedControl
              fullWidth
              options={[
                { value: 'true', label: 'あり' },
                { value: 'false', label: 'なし' },
              ]}
              value={hasEmployees === null ? null : String(hasEmployees)}
              onChange={(v) => setHasEmployees(v === 'true')}
            />
            {profileErrors.emp && (
              <p className="flex items-center gap-1 text-xs text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" />{profileErrors.emp}
              </p>
            )}
          </div>

          <button type="submit" className="btn-primary btn-primary-lg w-full text-base">
            次へ：イベントを選ぶ
            <ArrowRight className="h-5 w-5" />
          </button>
        </form>
      </div>
    );
  }

  // ── ② イベント選択 → ③ 登録 ──
  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">イベントを登録</h1>
        <p className="mt-2 text-sm text-gray-500">起きた出来事を選ぶだけで、必要な手続きを自動生成します</p>
      </div>

      <div className="card mb-6 flex items-center justify-between text-sm">
        <div className="text-gray-600">
          <p className="font-medium text-gray-900">
            {profile.prefectureName} {profile.municipalityName}
          </p>
          <p className="mt-0.5 text-xs text-sunboo-ink-muted">
            {CORPORATE_TYPE_LABEL[profile.corporateType]} ・ 従業員{profile.employeeCount > 0 ? 'あり' : 'なし'}
          </p>
        </div>
        <button type="button" onClick={handleEditProfile} className="btn-secondary inline-flex items-center gap-1 px-3 py-1.5 text-xs">
          <Pencil className="h-3 w-3" />
          変更する
        </button>
      </div>

      <div className="card space-y-4">
        <h2 className="font-semibold text-gray-800">どのイベントが発生しましたか？</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {eventTypes.map((et) => {
            const Icon = EVENT_ICON[et.code];
            const isSelected = selectedCode === et.code;
            return (
              <button
                key={et.code}
                type="button"
                onClick={() => setSelectedCode(et.code)}
                aria-pressed={isSelected}
                className={`flex flex-col items-center gap-2 rounded-xl border px-4 py-5 text-center transition-colors ${
                  isSelected
                    ? 'border-[var(--color-sunboo-morning-sun)] bg-[color-mix(in_srgb,var(--color-sunboo-morning-sun)_12%,white)]'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Icon className={`h-6 w-6 ${isSelected ? 'text-[var(--color-sunboo-ink)]' : 'text-sunboo-ink-muted'}`} />
                <span className={`text-sm font-semibold ${isSelected ? 'text-[var(--color-sunboo-ink)]' : 'text-gray-800'}`}>
                  {et.name}
                </span>
              </button>
            );
          })}
        </div>

        {selectedCode && (
          <div>
            <label className="form-label">発生日</label>
            <input
              type="date"
              className="form-input"
              value={eventDate}
              max={todayIso()}
              onChange={(e) => setEventDate(e.target.value)}
            />
          </div>
        )}

        {submitError && (
          <p className="flex items-center gap-1 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />{submitError}
          </p>
        )}

        <button
          type="button"
          disabled={!selectedCode || submitting}
          onClick={handleRegister}
          className="btn-primary btn-primary-lg w-full text-base disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? '登録中...' : '登録する'}
          <ArrowRight className="h-5 w-5" />
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-sunboo-ink-muted">
        <Link href="/start" className="underline hover:text-gray-600">通常の診断はこちら</Link>
      </p>
    </div>
  );
}
