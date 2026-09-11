'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { prefectures as staticPrefectures } from '@/data/prefectures';
import { MapPin, Users, Calendar, ArrowRight, AlertTriangle, Building2, UserCog } from 'lucide-react';
import type { CorporateType } from '@/lib/types';
import SegmentedControl from '@/components/SegmentedControl';

const FALLBACK_MUNICIPALITIES: Record<string, { code: string; name: string }[]> = {
  '13': [{ code: '13113', name: '渋谷区' }],
};

const FISCAL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type PrefItem = { code: string; name: string };
type MuniItem = { code: string; name: string };
type SpecificPeriodThresholdStatus = 'both_over' | 'either_not_over' | 'not_applicable_or_unknown';
type SpecifiedNewCorporationStatus = 'applies' | 'does_not_apply' | 'needs_review';
type BasePeriodTaxableSalesStatus = 'over_threshold' | 'at_or_below_threshold' | 'not_applicable' | 'unknown';

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
  const [paysOfficerCompensation, setPaysOfficerCompensation] = useState<boolean | null>(null);
  const [payrollRecipientCount, setPayrollRecipientCount] = useState<number | null>(null);
  const [establishedDate, setEstablishedDate] = useState('');
  const [firstEmployeeHireDate, setFirstEmployeeHireDate] = useState('');
  const [hasEmploymentInsuranceEligibleEmployee, setHasEmploymentInsuranceEligibleEmployee] = useState<boolean | null>(null);
  const [firstEmploymentInsuranceEligibleHireDate, setFirstEmploymentInsuranceEligibleHireDate] = useState('');
  const [hasSocialInsuranceEligibleEmployee, setHasSocialInsuranceEligibleEmployee] = useState<boolean | null>(null);
  const [firstSocialInsuranceEligibleHireDate, setFirstSocialInsuranceEligibleHireDate] = useState('');
  const [capitalAmount, setCapitalAmount] = useState<number | null>(null);
  const [isInvoiceRegistered, setIsInvoiceRegistered] = useState<boolean | null>(null);
  const [isConsumptionTaxElectionEffective, setIsConsumptionTaxElectionEffective] = useState<boolean | null>(null);
  const [specificPeriodThresholdStatus, setSpecificPeriodThresholdStatus] = useState<SpecificPeriodThresholdStatus | null>(null);
  const [specifiedNewCorporationStatus, setSpecifiedNewCorporationStatus] = useState<SpecifiedNewCorporationStatus | null>(null);
  const [basePeriodTaxableSalesStatus, setBasePeriodTaxableSalesStatus] = useState<BasePeriodTaxableSalesStatus | null>(null);

  const [loadingMunis, setLoadingMunis] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<'pref' | 'muni' | 'emp' | 'fm' | 'corp' | 'officerTerm' | 'establishedDate' | 'officerPay' | 'payrollCount' | 'hireDate' | 'employmentIns' | 'employmentInsDate' | 'socialIns' | 'socialInsDate' | 'capital' | 'invoice' | 'taxElection' | 'specificPeriod' | 'specifiedNewCorp' | 'basePeriodSales', string>>>({});

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
    if (!prefCode) return;

    async function load() {
      setLoadingMunis(true);

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
    if (hasEmployees === true && !firstEmployeeHireDate) errs.hireDate = '最初の従業員を雇った日を入力してください';
    if (hasEmployees === true && hasEmploymentInsuranceEligibleEmployee === null) {
      errs.employmentIns = '雇用保険の対象者の有無を選択してください';
    }
    if (hasEmploymentInsuranceEligibleEmployee === true && !firstEmploymentInsuranceEligibleHireDate) {
      errs.employmentInsDate = '最初の対象者を雇った日を入力してください';
    }
    if (hasEmployees === true && hasSocialInsuranceEligibleEmployee === null) {
      errs.socialIns = '社会保険の対象者の有無を選択してください';
    }
    if (hasSocialInsuranceEligibleEmployee === true && !firstSocialInsuranceEligibleHireDate) {
      errs.socialInsDate = '最初の対象者を雇った日を入力してください';
    }
    if (paysOfficerCompensation === null) errs.officerPay = '役員報酬の有無を選択してください';
    if (
      payrollRecipientCount === null ||
      payrollRecipientCount < 0 ||
      !Number.isInteger(payrollRecipientCount) ||
      ((hasEmployees === true || paysOfficerCompensation === true) && payrollRecipientCount < 1)
    ) {
      errs.payrollCount = '給与を支払う人数を0以上の整数で入力してください';
    }
    if (!fiscalMonth) errs.fm = '決算月を選択してください';
    if (!corporateType) errs.corp = '法人の種類を選択してください';
    if (capitalAmount === null || capitalAmount < 1 || !Number.isSafeInteger(capitalAmount)) {
      errs.capital = '資本金を1円以上の整数で入力してください';
    }
    if (isInvoiceRegistered === null) errs.invoice = 'インボイス登録の有無を選択してください';
    if (isConsumptionTaxElectionEffective === null) errs.taxElection = '課税事業者選択の状況を選択してください';
    if (specificPeriodThresholdStatus === null) errs.specificPeriod = '特定期間の状況を選択してください';
    if (specifiedNewCorporationStatus === null) errs.specifiedNewCorp = '特定新規設立法人の状況を選択してください';
    if (basePeriodTaxableSalesStatus === null) errs.basePeriodSales = '基準期間の課税売上高を選択してください';
    if (!establishedDate) errs.establishedDate = '設立日を入力してください';
    if (corporateType === 'kabushiki' && hasOfficerTerm === null) {
      errs.officerTerm = '役員任期の有無を選択してください';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handlePrefectureChange(nextPrefCode: string) {
    setPrefCode(nextPrefCode);
    setMuniList([]);
    setMuniCode('');
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const params = new URLSearchParams({
      pref: prefCode,
      muni: muniCode,
      emp: String(hasEmployees),
      payrollCount: String(payrollRecipientCount),
      officerPay: String(paysOfficerCompensation),
      fm: String(fiscalMonth),
      corp: String(corporateType),
      est: establishedDate,
      capital: String(capitalAmount),
      invoiceRegistered: String(isInvoiceRegistered),
      taxElectionEffective: String(isConsumptionTaxElectionEffective),
      specificPeriod: String(specificPeriodThresholdStatus),
      specifiedNewCorp: String(specifiedNewCorporationStatus),
      basePeriodSales: String(basePeriodTaxableSalesStatus),
    });
    if (corporateType === 'kabushiki') {
      params.set('officerTerm', String(hasOfficerTerm));
    }
    if (hasEmployees && firstEmployeeHireDate) {
      params.set('hired', firstEmployeeHireDate);
      params.set('employmentIns', String(hasEmploymentInsuranceEligibleEmployee));
      if (hasEmploymentInsuranceEligibleEmployee && firstEmploymentInsuranceEligibleHireDate) {
        params.set('employmentInsHired', firstEmploymentInsuranceEligibleHireDate);
      }
      params.set('socialIns', String(hasSocialInsuranceEligibleEmployee));
      if (hasSocialInsuranceEligibleEmployee && firstSocialInsuranceEligibleHireDate) {
        params.set('socialInsHired', firstSocialInsuranceEligibleHireDate);
      }
    }
    router.push(`/result?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      {/* ページヘッダー */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">会社情報を入力</h1>
        <p className="mt-2 text-sm text-gray-500">
          会社情報から、提出書類・期限・提出先を一覧表示します
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">1</span>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">会社の設立日</h2>
            </div>
          </div>
          <input
            type="date"
            className="form-input"
            value={establishedDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setEstablishedDate(e.target.value)}
          />
          <p className="text-xs text-gray-500">登記事項証明書に記載された会社成立の年月日</p>
          {errors.establishedDate && (
            <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.establishedDate}</p>
          )}
        </div>

        {/* ② 所在地 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              2
            </span>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">会社の所在地</h2>
            </div>
          </div>

          <div>
            <label className="form-label">都道府県</label>
            <div className="relative">
              <select
                className="form-select pr-9"
                value={prefCode}
                onChange={(e) => handlePrefectureChange(e.target.value)}
              >
                <option value="">選択してください</option>
                {prefList.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.name}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sunboo-ink-muted">
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
                <p className="py-2 text-sm text-sunboo-ink-muted">読み込み中...</p>
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
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sunboo-ink-muted">
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

        {/* ③ 従業員 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              3
            </span>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">従業員はいますか？</h2>
            </div>
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
          {errors.emp && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.emp}
            </p>
          )}
          {hasEmployees === true && (
            <div className="space-y-4">
              <div>
              <label className="form-label">最初の従業員を雇った日</label>
              <input
                type="date"
                className="form-input"
                value={firstEmployeeHireDate}
                min={establishedDate || undefined}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setFirstEmployeeHireDate(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-500">労働保険・雇用保険の提出期限を計算します</p>
              {errors.hireDate && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.hireDate}</p>}
              </div>
              <div>
                <label className="form-label">週20時間以上かつ31日以上雇う予定の従業員はいますか？</label>
                <SegmentedControl
                  fullWidth
                  options={[{ value: 'true', label: 'いる' }, { value: 'false', label: 'いない' }]}
                  value={hasEmploymentInsuranceEligibleEmployee === null ? null : String(hasEmploymentInsuranceEligibleEmployee)}
                  onChange={(value) => setHasEmploymentInsuranceEligibleEmployee(value === 'true')}
                />
                <p className="mt-1 text-xs text-gray-500">雇用保険の原則的な加入基準です</p>
                {errors.employmentIns && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.employmentIns}</p>}
              </div>
              {hasEmploymentInsuranceEligibleEmployee === true && (
                <div>
                  <label className="form-label">最初の雇用保険対象者を雇った日</label>
                  <input
                    type="date"
                    className="form-input"
                    value={firstEmploymentInsuranceEligibleHireDate}
                    min={establishedDate || undefined}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setFirstEmploymentInsuranceEligibleHireDate(e.target.value)}
                  />
                  {errors.employmentInsDate && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.employmentInsDate}</p>}
                </div>
              )}
              <div>
                <label className="form-label">社会保険の加入対象となる従業員はいますか？</label>
                <SegmentedControl
                  fullWidth
                  options={[{ value: 'true', label: 'いる' }, { value: 'false', label: 'いない' }]}
                  value={hasSocialInsuranceEligibleEmployee === null ? null : String(hasSocialInsuranceEligibleEmployee)}
                  onChange={(value) => setHasSocialInsuranceEligibleEmployee(value === 'true')}
                />
                <p className="mt-1 text-xs text-gray-500">原則、正社員または正社員の所定労働時間・日数の4分の3以上働く人</p>
                {errors.socialIns && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.socialIns}</p>}
              </div>
              {hasSocialInsuranceEligibleEmployee === true && (
                <div>
                  <label className="form-label">最初の社会保険対象者を雇った日</label>
                  <input
                    type="date"
                    className="form-input"
                    value={firstSocialInsuranceEligibleHireDate}
                    min={establishedDate || undefined}
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setFirstSocialInsuranceEligibleHireDate(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-gray-500">短時間労働者には別の加入要件があります</p>
                  {errors.socialInsDate && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.socialInsDate}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ④ 役員報酬 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">4</span>
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">役員報酬を支払いますか？</h2>
            </div>
          </div>
          <SegmentedControl
            fullWidth
            options={[{ value: 'true', label: '支払う' }, { value: 'false', label: '支払わない' }]}
            value={paysOfficerCompensation === null ? null : String(paysOfficerCompensation)}
            onChange={(value) => setPaysOfficerCompensation(value === 'true')}
          />
          <p className="text-xs text-gray-500">代表者・役員に毎月の報酬を支給する場合は「支払う」</p>
          {errors.officerPay && <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.officerPay}</p>}
          <div>
            <label className="form-label">給与を支払う人数（役員を含む）</label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                className="form-input pr-12"
                value={payrollRecipientCount ?? ''}
                onChange={(e) => setPayrollRecipientCount(e.target.value === '' ? null : Number(e.target.value))}
                placeholder="0"
              />
              <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">人</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">源泉所得税の納期の特例（常時10人未満）の判定に使います</p>
            {errors.payrollCount && <p className="mt-1 flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.payrollCount}</p>}
          </div>
        </div>

        {/* ⑤ 決算月 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              5
            </span>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-sunboo-ink-muted" />
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
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sunboo-ink-muted">
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

        {/* ⑥ 法人の種類 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
              6
            </span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">法人の種類</h2>
            </div>
          </div>
          <SegmentedControl
            fullWidth
            options={[
              { value: 'kabushiki', label: '株式会社' },
              { value: 'godo', label: '合同会社' },
            ]}
            value={corporateType}
            onChange={(v) => {
              setCorporateType(v);
              if (v === 'godo') setHasOfficerTerm(null);
            }}
          />
          {errors.corp && (
            <p className="flex items-center gap-1 text-xs text-red-500">
              <AlertTriangle className="h-3.5 w-3.5" />
              {errors.corp}
            </p>
          )}
        </div>

        {/* ⑦ 資本金 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">7</span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">資本金・出資金</h2>
            </div>
          </div>
          <div className="relative">
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              className="form-input pr-12"
              value={capitalAmount ?? ''}
              onChange={(e) => setCapitalAmount(e.target.value === '' ? null : Number(e.target.value))}
              placeholder="1000000"
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">円</span>
          </div>
          <p className="text-xs text-gray-500">登記事項証明書に記載された金額。1,000万円以上は設立期から消費税の課税事業者です</p>
          {errors.capital && <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.capital}</p>}
        </div>

        {/* ⑧ インボイス登録 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">8</span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">インボイス登録をしていますか？</h2>
            </div>
          </div>
          <SegmentedControl
            fullWidth
            options={[
              { value: 'true', label: '登録済み' },
              { value: 'false', label: '未登録' },
            ]}
            value={isInvoiceRegistered === null ? null : String(isInvoiceRegistered)}
            onChange={(v) => setIsInvoiceRegistered(v === 'true')}
          />
          <p className="text-xs text-gray-500">適格請求書発行事業者として登録済みの場合、消費税の申告が必要です</p>
          {errors.invoice && <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.invoice}</p>}
        </div>

        {/* ⑨ 消費税課税事業者選択 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">9</span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">課税事業者選択届出書が現在有効ですか？</h2>
            </div>
          </div>
          <SegmentedControl
            fullWidth
            options={[
              { value: 'true', label: '有効' },
              { value: 'false', label: '有効ではない' },
            ]}
            value={isConsumptionTaxElectionEffective === null ? null : String(isConsumptionTaxElectionEffective)}
            onChange={(v) => setIsConsumptionTaxElectionEffective(v === 'true')}
          />
          <p className="text-xs text-gray-500">提出済みでも適用開始前の場合があります。不明な場合は税務署または税理士に確認してください</p>
          {errors.taxElection && <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.taxElection}</p>}
        </div>

        {/* ⑩ 特定期間 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">10</span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">前事業年度の最初の6か月の売上・給与</h2>
            </div>
          </div>
          <SegmentedControl
            fullWidth
            options={[
              { value: 'both_over', label: '両方1,000万円超' },
              { value: 'either_not_over', label: 'どちらか1,000万円以下' },
              { value: 'not_applicable_or_unknown', label: '該当期間なし・不明' },
            ]}
            value={specificPeriodThresholdStatus}
            onChange={(v) => setSpecificPeriodThresholdStatus(v as SpecificPeriodThresholdStatus)}
          />
          <p className="text-xs text-gray-500">課税売上高と給与等支払額を確認します。前事業年度が1年未満の場合は期間が異なることがあります</p>
          {errors.specificPeriod && <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.specificPeriod}</p>}
        </div>

        {/* ⑪ 特定新規設立法人 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">11</span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">特定新規設立法人に該当しますか？</h2>
            </div>
          </div>
          <SegmentedControl
            options={[
              { value: 'applies', label: '該当する（確認済み）' },
              { value: 'does_not_apply', label: '該当しない（確認済み）' },
              { value: 'needs_review', label: 'わからない・要確認' },
            ]}
            value={specifiedNewCorporationStatus}
            onChange={(v) => setSpecifiedNewCorporationStatus(v as SpecifiedNewCorporationStatus)}
          />
          <p className="text-xs text-gray-500">他者による支配関係と、判定対象者の課税売上高5億円超または収益合計50億円超などを確認する複雑な判定です</p>
          {errors.specifiedNewCorp && <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.specifiedNewCorp}</p>}
        </div>

        {/* ⑫ 基準期間 */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">12</span>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-sunboo-ink-muted" />
              <h2 className="font-semibold text-gray-800">基準期間の課税売上高</h2>
            </div>
          </div>
          <SegmentedControl
            options={[
              { value: 'over_threshold', label: '1,000万円超' },
              { value: 'at_or_below_threshold', label: '1,000万円以下' },
              { value: 'not_applicable', label: '基準期間なし' },
              { value: 'unknown', label: 'わからない' },
            ]}
            value={basePeriodTaxableSalesStatus}
            onChange={(v) => setBasePeriodTaxableSalesStatus(v as BasePeriodTaxableSalesStatus)}
          />
          <p className="text-xs text-gray-500">法人は原則として2期前の事業年度です。設立1期目・2期目は通常「基準期間なし」です</p>
          {errors.basePeriodSales && <p className="flex items-center gap-1 text-xs text-red-500"><AlertTriangle className="h-3.5 w-3.5" />{errors.basePeriodSales}</p>}
        </div>

        {/* ⑬ 役員任期（株式会社のみ） */}
        {corporateType === 'kabushiki' && (
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                13
              </span>
              <div className="flex items-center gap-2">
                <UserCog className="h-4 w-4 text-sunboo-ink-muted" />
                <h2 className="font-semibold text-gray-800">役員に任期の定めがありますか？</h2>
              </div>
            </div>
            <SegmentedControl
              fullWidth
              options={[
                { value: 'true', label: 'あり' },
                { value: 'false', label: 'なし' },
              ]}
              value={hasOfficerTerm === null ? null : String(hasOfficerTerm)}
              onChange={(v) => setHasOfficerTerm(v === 'true')}
            />
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

      <p className="mt-4 text-center text-xs text-sunboo-ink-muted">
        入力した情報はサーバーに保存されません
      </p>
    </div>
  );
}
