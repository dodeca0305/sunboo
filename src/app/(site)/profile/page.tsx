'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { prefectures as staticPrefectures } from '@/data/prefectures';
import type { CorporateType } from '@/lib/types';
import {
  createCompanyProfile, deriveConsumptionTaxStatus, deriveLocalTaxCollectionMethod, deriveStage,
  loadCompanyProfile, saveCompanyProfile,
  type AdvisorPresence, type CompanyProfile, type CompanyStage, type ConsumptionTaxInterimFrequency,
  type ConsumptionTaxStatus, type InterimFilingStatus, type InvoiceRegistrationStatus,
  type LocalTaxCollectionMethod, type ResidentTaxPaymentCycle, type TaxationMethod,
  type WithholdingTaxCycle,
} from '@/lib/companyProfile';
import {
  MapPin, Banknote, CalendarClock, Receipt, FileClock,
  ShieldCheck, Send, Briefcase, ArrowRight, AlertTriangle, CheckCircle2, Sparkles,
} from 'lucide-react';

const CORPORATE_TYPE_LABEL: Record<CorporateType, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

const STAGE_LABEL: Record<CompanyStage, string> = {
  pre_establishment: '設立前',
  first_term: '1期目',
  second_term_or_later: '2期目以降',
};

const CONSUMPTION_TAX_LABEL: Record<ConsumptionTaxStatus, string> = {
  exempt: '免税事業者',
  taxable: '課税事業者',
};

const INVOICE_LABEL: Record<InvoiceRegistrationStatus, string> = {
  registered: '登録済み',
  not_registered: '未登録',
};

const TAXATION_METHOD_LABEL: Record<TaxationMethod, string> = {
  principle: '原則課税',
  simplified: '簡易課税',
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

const WITHHOLDING_CYCLE_LABEL: Record<WithholdingTaxCycle, string> = {
  monthly: '毎月納付',
  special_exception: '納期の特例（年2回）',
  unset: '未設定',
};

const LOCAL_TAX_LABEL: Record<LocalTaxCollectionMethod, string> = {
  special_collection: '特別徴収',
  general_collection: '普通徴収',
};

// 住民税特別徴収（地方税）の納期区分。源泉所得税の納期（WITHHOLDING_CYCLE_LABEL、国税）とは
// 別制度のため、文言を「住民税特別徴収の納期」と明示し混同を避ける。
// 【Sprint47レビュー対応】「special」は従業員数等から自動的に該当するものではなく、市区町村へ
// 申請し承認を受けて初めて選べる制度のため、ラベル自体に「承認済み」であることを明記する
// （従業員数だけで自動判定しない、利用者の明示選択を維持する設計）。
const RESIDENT_TAX_CYCLE_LABEL: Record<ResidentTaxPaymentCycle, string> = {
  unknown: '未設定',
  monthly: '毎月納付',
  special: '年2回納付（納期の特例・自治体の承認済み）',
};

const ADVISOR_ITEMS: { key: keyof AdvisorPresence; label: string }[] = [
  { key: 'taxAccountant', label: '税理士' },
  { key: 'laborConsultant', label: '社労士' },
  { key: 'judicialScrivener', label: '司法書士' },
  { key: 'administrativeScrivener', label: '行政書士' },
];

const FISCAL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type PrefItem = { code: string; name: string };
type MuniItem = { code: string; name: string };

type ProfileDraft = Omit<CompanyProfile, 'corporateType' | 'establishedDate'> & {
  corporateType: CorporateType | null;
  establishedDate: string; // フォーム都合で '' = 未設定
};

const EMPTY_DRAFT: ProfileDraft = {
  prefectureCode: '',
  prefectureName: '',
  municipalityCode: '',
  municipalityName: '',
  corporateType: null,
  nextOfficerChangeDate: null,
  address: null,
  employeeCount: 0,
  capital: null,
  establishedDate: '',
  fiscalMonth: null,
  stage: 'pre_establishment',
  consumptionTaxStatus: 'exempt',
  invoiceRegistrationStatus: 'not_registered',
  taxationMethod: null,
  corporateTaxInterimFiling: 'none',
  consumptionTaxInterimFrequency: 'none',
  withholdingTaxCycle: 'unset',
  localTaxCollectionMethod: 'special_collection',
  residentTaxPaymentCycle: 'unknown',
  eTaxEnabled: false,
  eLTaxEnabled: false,
  advisors: {
    taxAccountant: false,
    laborConsultant: false,
    judicialScrivener: false,
    administrativeScrivener: false,
  },
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

function SectionHeader({ icon: Icon, title }: { icon: typeof MapPin; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-gray-400" />
      <h2 className="font-semibold text-gray-800">{title}</h2>
    </div>
  );
}

function HintText({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-1.5 text-xs leading-relaxed text-gray-400">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-400" />
      {children}
    </p>
  );
}

export default function ProfilePage() {
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);

  const [prefList, setPrefList] = useState<PrefItem[]>([]);
  const [muniList, setMuniList] = useState<MuniItem[]>([]);
  const [loadingMunis, setLoadingMunis] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = loadCompanyProfile();
    if (existing) {
      setDraft({ ...existing, establishedDate: existing.establishedDate ?? '' });
    }
    setLoaded(true);
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
    if (!draft.prefectureCode) {
      setMuniList([]);
      return;
    }
    async function load() {
      setLoadingMunis(true);
      if (!supabase) {
        setMuniList([]);
        setLoadingMunis(false);
        return;
      }
      const { data: prefData } = await supabase
        .from('prefectures')
        .select('id')
        .eq('code', draft.prefectureCode)
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
    // draft.prefectureCode が変わったときだけ市区町村一覧を再取得する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.prefectureCode]);

  // 設立日・決算月から一意に決まる事実のため、変更のたびに自動反映する
  // （消費税ステータス等の「目安」と違い、ユーザー確認を挟まなくてよい確定情報）。
  // ボタンでの手動選択はそのまま上書き可能。
  useEffect(() => {
    setDraft((d) => ({ ...d, stage: deriveStage(d.establishedDate || null, d.fiscalMonth) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.establishedDate, draft.fiscalMonth]);

  // 1期目は前年実績が無いため中間申告は確実に「なし」になる（設計書 ③）
  useEffect(() => {
    if (draft.stage === 'first_term') {
      setDraft((d) => ({ ...d, corporateTaxInterimFiling: 'none', consumptionTaxInterimFrequency: 'none' }));
    }
  }, [draft.stage]);

  function set<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  const suggestedConsumptionTaxStatus = useMemo(
    () => deriveConsumptionTaxStatus(draft.capital, draft.stage),
    [draft.capital, draft.stage],
  );
  const suggestedLocalTax = useMemo(
    () => deriveLocalTaxCollectionMethod(draft.employeeCount),
    [draft.employeeCount],
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.prefectureCode || !draft.municipalityCode) {
      setError('会社の所在地を選択してください');
      return;
    }
    if (!draft.corporateType) {
      setError('法人の種類を選択してください');
      return;
    }
    setError(null);

    const prefName = prefList.find((p) => p.code === draft.prefectureCode)?.name ?? draft.prefectureName;
    const muniName = muniList.find((m) => m.code === draft.municipalityCode)?.name ?? draft.municipalityName;

    const profile = createCompanyProfile({
      ...draft,
      prefectureName: prefName,
      municipalityName: muniName,
      corporateType: draft.corporateType,
      establishedDate: draft.establishedDate || null,
    });
    saveCompanyProfile(profile);
    setSaved(true);
  }

  if (!loaded) return null;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">会社プロフィール</h1>
        <p className="mt-2 text-sm text-gray-500">
          詳しく入力するほど、AI参謀のアドバイスが具体的になります。未入力の項目があっても保存できます
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ① 基本情報 */}
        <div className="card space-y-4">
          <SectionHeader icon={MapPin} title="基本情報" />

          <div>
            <label className="form-label">都道府県</label>
            <select
              className="form-select"
              value={draft.prefectureCode}
              onChange={(e) => set('prefectureCode', e.target.value)}
            >
              <option value="">選択してください</option>
              {prefList.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
              提出先（税務署・市区町村役場等）の判定に使用します。
            </p>
          </div>

          {draft.prefectureCode && (
            <div>
              <label className="form-label">市区町村</label>
              {loadingMunis ? (
                <p className="py-2 text-sm text-gray-400">読み込み中...</p>
              ) : muniList.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-sm font-medium text-gray-700">このエリアは現在未対応です</p>
                </div>
              ) : (
                <>
                  <select
                    className="form-select"
                    value={draft.municipalityCode}
                    onChange={(e) => set('municipalityCode', e.target.value)}
                  >
                    <option value="">選択してください</option>
                    {muniList.map((m) => (
                      <option key={m.code} value={m.code}>{m.name}</option>
                    ))}
                  </select>
                  <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                    提出先を判定する唯一の情報です。変更すると管轄機関の判定結果が変わります。
                  </p>
                </>
              )}
            </div>
          )}

          <div>
            <label className="form-label">番地・建物名（任意）</label>
            <input
              type="text"
              className="form-input"
              placeholder="例: 1丁目2番3号 ○○ビル4階"
              value={draft.address ?? ''}
              onChange={(e) => set('address', e.target.value || null)}
            />
            <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
              Excel・PDF・共有ページでの本店所在地の表示にのみ使用します。提出先の判定には
              使用しません（判定は都道府県・市区町村のみで行います）。
            </p>
          </div>

          <div>
            <label className="form-label">法人の種類</label>
            <ToggleButtons
              options={(['kabushiki', 'godo'] as const).map((v) => ({ value: v, label: CORPORATE_TYPE_LABEL[v] }))}
              value={draft.corporateType}
              onChange={(v) => set('corporateType', v)}
            />
          </div>

          {draft.corporateType === 'kabushiki' && (
            <div className="space-y-2">
              <label className="form-label">次回の役員変更予定日（任意）</label>
              <input
                type="date"
                className="form-input"
                value={draft.nextOfficerChangeDate ?? ''}
                onChange={(e) => set('nextOfficerChangeDate', e.target.value || null)}
              />
              <p className="text-xs leading-relaxed text-gray-400">
                この日から2週間以内の登記申請期限を計算します。登記期限そのものではなく、
                任期満了に伴う重任・交代が効力を生じる日（株主総会での重任決議日等）を
                入力してください。未定の場合は空欄のままにしてください。
              </p>
            </div>
          )}

          <div>
            <label className="form-label">従業員数</label>
            <input
              type="number"
              min={0}
              className="form-input"
              value={draft.employeeCount}
              onChange={(e) => set('employeeCount', Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div>
            <label className="form-label">資本金（円・任意）</label>
            <input
              type="number"
              min={0}
              step={10000}
              placeholder="例: 5000000"
              className="form-input"
              value={draft.capital ?? ''}
              onChange={(e) => set('capital', e.target.value === '' ? null : Number(e.target.value))}
            />
          </div>

          <div>
            <label className="form-label">設立日（任意）</label>
            <input
              type="date"
              className="form-input"
              value={draft.establishedDate}
              onChange={(e) => set('establishedDate', e.target.value)}
            />
          </div>

          <div>
            <label className="form-label">決算月</label>
            <select
              className="form-select"
              value={draft.fiscalMonth ?? ''}
              onChange={(e) => set('fiscalMonth', e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">選択してください</option>
              {FISCAL_MONTHS.map((m) => (
                <option key={m} value={m}>{m}月</option>
              ))}
            </select>
          </div>
        </div>

        {/* ② 会社ステージ */}
        <div className="card space-y-4">
          <SectionHeader icon={CalendarClock} title="会社ステージ" />
          <HintText>
            設立日・決算月から自動設定されています（手動での変更も可能です）
          </HintText>
          <ToggleButtons
            options={(['pre_establishment', 'first_term', 'second_term_or_later'] as const).map((v) => ({
              value: v,
              label: STAGE_LABEL[v],
            }))}
            value={draft.stage}
            onChange={(v) => set('stage', v)}
          />
        </div>

        {/* ③ 税務 */}
        <div className="card space-y-4">
          <SectionHeader icon={Receipt} title="税務" />

          <div className="space-y-2">
            <label className="form-label">消費税</label>
            {suggestedConsumptionTaxStatus && (
              <HintText>
                自動判定の目安：{CONSUMPTION_TAX_LABEL[suggestedConsumptionTaxStatus]}
                （資本金・会社ステージから。最終判断は顧問税理士にご確認ください）
              </HintText>
            )}
            <ToggleButtons
              options={(['exempt', 'taxable'] as const).map((v) => ({ value: v, label: CONSUMPTION_TAX_LABEL[v] }))}
              value={draft.consumptionTaxStatus}
              onChange={(v) => set('consumptionTaxStatus', v)}
            />
          </div>

          <div className="space-y-2">
            <label className="form-label">インボイス登録</label>
            <ToggleButtons
              options={(['not_registered', 'registered'] as const).map((v) => ({
                value: v,
                label: INVOICE_LABEL[v],
              }))}
              value={draft.invoiceRegistrationStatus}
              onChange={(v) => set('invoiceRegistrationStatus', v)}
            />
          </div>

          {draft.consumptionTaxStatus === 'taxable' && (
            <div className="space-y-2">
              <label className="form-label">消費税の課税方式</label>
              <ToggleButtons
                options={(['principle', 'simplified'] as const).map((v) => ({
                  value: v,
                  label: TAXATION_METHOD_LABEL[v],
                }))}
                value={draft.taxationMethod}
                onChange={(v) => set('taxationMethod', v)}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="form-label">法人税の中間申告</label>
            {draft.stage === 'first_term' ? (
              <p className="tag inline-flex">なし（1期目のため前年実績がありません）</p>
            ) : (
              <ToggleButtons
                options={(['none', 'has'] as const).map((v) => ({ value: v, label: INTERIM_FILING_LABEL[v] }))}
                value={draft.corporateTaxInterimFiling}
                onChange={(v) => set('corporateTaxInterimFiling', v)}
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="form-label">消費税の中間申告回数</label>
            {draft.stage === 'first_term' ? (
              <p className="tag inline-flex">なし（1期目のため前年実績がありません）</p>
            ) : (
              <select
                className="form-select"
                value={draft.consumptionTaxInterimFrequency}
                onChange={(e) => set('consumptionTaxInterimFrequency', e.target.value as ConsumptionTaxInterimFrequency)}
              >
                {(['none', '1', '3', '11'] as const).map((v) => (
                  <option key={v} value={v}>{CONSUMPTION_INTERIM_FREQ_LABEL[v]}</option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* ④ 源泉所得税・地方税 */}
        <div className="card space-y-4">
          <SectionHeader icon={Banknote} title="源泉所得税・地方税" />

          <div className="space-y-2">
            <label className="form-label">源泉所得税の納期</label>
            <ToggleButtons
              options={(['unset', 'monthly', 'special_exception'] as const).map((v) => ({
                value: v,
                label: WITHHOLDING_CYCLE_LABEL[v],
              }))}
              value={draft.withholdingTaxCycle}
              onChange={(v) => set('withholdingTaxCycle', v)}
            />
          </div>

          <div className="space-y-2">
            <label className="form-label">住民税の徴収方法</label>
            {suggestedLocalTax && (
              <HintText>
                自動判定の目安：{LOCAL_TAX_LABEL[suggestedLocalTax]}（従業員がいる場合の原則）
              </HintText>
            )}
            <ToggleButtons
              options={(['special_collection', 'general_collection'] as const).map((v) => ({
                value: v,
                label: LOCAL_TAX_LABEL[v],
              }))}
              value={draft.localTaxCollectionMethod}
              onChange={(v) => set('localTaxCollectionMethod', v)}
            />
          </div>

          {draft.localTaxCollectionMethod === 'special_collection' && (
            <div className="space-y-2">
              <label className="form-label">住民税特別徴収の納期</label>
              <ToggleButtons
                options={(['unknown', 'monthly', 'special'] as const).map((v) => ({
                  value: v,
                  label: RESIDENT_TAX_CYCLE_LABEL[v],
                }))}
                value={draft.residentTaxPaymentCycle}
                onChange={(v) => set('residentTaxPaymentCycle', v)}
              />
              <p className="text-xs leading-relaxed text-amber-700">
                「年2回納付」は、市区町村への申請が承認されている場合にのみ選択してください。従業員数だけで
                自動的に対象になるものではありません。未承認・未確認の場合は「未設定」のままにしてください。
              </p>
            </div>
          )}
        </div>

        {/* ⑤ 電子申告 */}
        <div className="card space-y-4">
          <SectionHeader icon={Send} title="電子申告" />
          <div className="space-y-2">
            <label className="form-label">国税（e-Tax）開始届出</label>
            <ToggleButtons
              options={[{ value: 'false', label: '未実施' }, { value: 'true', label: '実施済み' }]}
              value={String(draft.eTaxEnabled)}
              onChange={(v) => set('eTaxEnabled', v === 'true')}
            />
          </div>
          <div className="space-y-2">
            <label className="form-label">地方税（eLTAX）開始届出</label>
            <ToggleButtons
              options={[{ value: 'false', label: '未実施' }, { value: 'true', label: '実施済み' }]}
              value={String(draft.eLTaxEnabled)}
              onChange={(v) => set('eLTaxEnabled', v === 'true')}
            />
          </div>
        </div>

        {/* ⑥ 顧問 */}
        <div className="card space-y-4">
          <SectionHeader icon={Briefcase} title="顧問専門家" />
          <div className="grid grid-cols-2 gap-2">
            {ADVISOR_ITEMS.map((item) => {
              const isOn = draft.advisors[item.key];
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => set('advisors', { ...draft.advisors, [item.key]: !isOn })}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${
                    isOn
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {item.label}
                  {isOn && <ShieldCheck className="h-4 w-4" />}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="flex items-center gap-1 text-xs text-red-500">
            <AlertTriangle className="h-3.5 w-3.5" />{error}
          </p>
        )}

        <button type="submit" className="btn-primary btn-primary-lg w-full text-base">
          {saved ? '保存しました' : '保存する'}
          {saved ? <CheckCircle2 className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
        </button>
      </form>

      {/* 確定申告実績（Tax Return Profile、Sprint17.2） */}
      <div className="card mt-4 flex items-center gap-3">
        <FileClock className="h-5 w-5 shrink-0 text-blue-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">確定申告実績</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            前期の申告内容（課税売上高・確定税額等）を記録すると、消費税ステータス等の自動判定の精度が上がります
          </p>
        </div>
        <Link href="/profile/tax-returns" className="btn-secondary shrink-0 px-3 py-1.5 text-xs whitespace-nowrap">
          記録する →
        </Link>
      </div>

      <p className="mt-4 text-center text-xs text-gray-400">
        <Link href="/events" className="underline hover:text-gray-600">イベント登録はこちら</Link>
        {' '}・{' '}
        <Link href="/start" className="underline hover:text-gray-600">通常の診断はこちら</Link>
      </p>

      <p className="mt-8 flex items-start gap-2 text-xs text-gray-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        本サイトの情報は一般的な参考情報です。税務・労務の最終判断は必ず税理士・社労士等の専門家にご確認ください。入力内容はこの端末（ブラウザ）にのみ保存されます。
      </p>
    </div>
  );
}
