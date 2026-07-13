'use client';

import { useState } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import type { CorporateType } from '@/lib/types';
import type {
  CompanyProfile, CompanyStage, ConsumptionTaxStatus, InvoiceRegistrationStatus,
  ResidentTaxPaymentCycle, WithholdingTaxCycle,
} from '@/lib/companyProfile';
import { companyProfileToWorkspaceUpdatePayload } from '@/lib/workspaceCompanyProfile';

// ── Company Workspace — 会社プロフィール編集フォーム（Sprint 23 Phase23.2・Sprint47）───────
// 既存 src/app/(site)/profile/page.tsx の項目・トーンを参考にしつつ、MVPとして主要項目のみを
// 編集対象にする（丸ごとコピーはしない）。taxationMethod・corporateTaxInterimFiling・
// consumptionTaxInterimFrequency・localTaxCollectionMethod・eTaxEnabled・eLTaxEnabled・
// 顧問税理士以外のadvisorsは、読み込んだ値をそのまま保持して書き戻す（このフォームでは変更しない）。
// 【Sprint47で追加】residentTaxPaymentCycleのみ例外的に編集可能にする。localTaxCollectionMethod
// 自体の編集UIはこのフォームに無いため、読み込んだ値（初期値は'special_collection'）を表示条件
// としてのみ参照する（docs/RESIDENT_TAX_SUPPORT_DESIGN.md 3-4節）。

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

const WITHHOLDING_CYCLE_LABEL: Record<WithholdingTaxCycle, string> = {
  monthly: '毎月納付',
  special_exception: '納期の特例（年2回）',
  unset: '未設定',
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

const FISCAL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function WorkspaceProfileForm({
  companyId,
  initialProfile,
}: {
  companyId: number;
  initialProfile: CompanyProfile;
}) {
  const [profile, setProfile] = useState<CompanyProfile>(initialProfile);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setSaving(true);
    const { companyFields, profileFields } = companyProfileToWorkspaceUpdatePayload(profile);

    const { error: companyError } = await supabase
      .from('workspace_companies')
      .update(companyFields)
      .eq('id', companyId);

    if (companyError) {
      setSaving(false);
      setError(`会社情報の保存に失敗しました: ${companyError.message}`);
      return;
    }

    const { error: profileError } = await supabase
      .from('workspace_company_profiles')
      .upsert({ company_id: companyId, ...profileFields }, { onConflict: 'company_id' });

    setSaving(false);
    if (profileError) {
      setError(`プロフィールの保存に失敗しました: ${profileError.message}`);
      return;
    }

    setSaved(true);
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-5">
      {error && (
        <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">法人種別</label>
          <select
            value={profile.corporateType}
            onChange={(e) => set('corporateType', e.target.value as CorporateType)}
            className="form-select"
          >
            {(['kabushiki', 'godo'] as const).map((v) => (
              <option key={v} value={v}>{CORPORATE_TYPE_LABEL[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">決算月</label>
          <select
            value={profile.fiscalMonth ?? ''}
            onChange={(e) => set('fiscalMonth', e.target.value ? Number(e.target.value) : null)}
            className="form-select"
          >
            <option value="">未設定</option>
            {FISCAL_MONTHS.map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
        </div>
      </div>

      {profile.corporateType === 'kabushiki' && (
        <div>
          <label className="form-label">次回の役員変更予定日（任意）</label>
          <input
            type="date"
            value={profile.nextOfficerChangeDate ?? ''}
            onChange={(e) => set('nextOfficerChangeDate', e.target.value || null)}
            className="form-input"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
            この日から2週間以内の登記申請期限を計算します。登記期限そのものではなく、
            任期満了に伴う重任・交代が効力を生じる日（株主総会での重任決議日等）を
            入力してください。未定の場合は空欄のままにしてください。
          </p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">設立日</label>
          <input
            type="date"
            value={profile.establishedDate ?? ''}
            onChange={(e) => set('establishedDate', e.target.value || null)}
            className="form-input"
          />
        </div>
        <div>
          <label className="form-label">資本金（円）</label>
          <input
            type="number"
            min={0}
            step={10000}
            placeholder="例: 5000000"
            value={profile.capital ?? ''}
            onChange={(e) => set('capital', e.target.value === '' ? null : Number(e.target.value))}
            className="form-input"
          />
        </div>
      </div>

      <div>
        <label className="form-label">従業員数</label>
        <input
          type="number"
          min={0}
          value={profile.employeeCount}
          onChange={(e) => set('employeeCount', Math.max(0, Number(e.target.value) || 0))}
          className="form-input"
        />
      </div>

      <div>
        <label className="form-label">会社ステージ</label>
        <select
          value={profile.stage}
          onChange={(e) => set('stage', e.target.value as CompanyStage)}
          className="form-select"
        >
          {(['pre_establishment', 'first_term', 'second_term_or_later'] as const).map((v) => (
            <option key={v} value={v}>{STAGE_LABEL[v]}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">消費税ステータス</label>
          <select
            value={profile.consumptionTaxStatus}
            onChange={(e) => set('consumptionTaxStatus', e.target.value as ConsumptionTaxStatus)}
            className="form-select"
          >
            {(['exempt', 'taxable'] as const).map((v) => (
              <option key={v} value={v}>{CONSUMPTION_TAX_LABEL[v]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">インボイス登録状況</label>
          <select
            value={profile.invoiceRegistrationStatus}
            onChange={(e) => set('invoiceRegistrationStatus', e.target.value as InvoiceRegistrationStatus)}
            className="form-select"
          >
            {(['not_registered', 'registered'] as const).map((v) => (
              <option key={v} value={v}>{INVOICE_LABEL[v]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="form-label">源泉所得税の納付サイクル</label>
        <select
          value={profile.withholdingTaxCycle}
          onChange={(e) => set('withholdingTaxCycle', e.target.value as WithholdingTaxCycle)}
          className="form-select"
        >
          {(['unset', 'monthly', 'special_exception'] as const).map((v) => (
            <option key={v} value={v}>{WITHHOLDING_CYCLE_LABEL[v]}</option>
          ))}
        </select>
      </div>

      {profile.localTaxCollectionMethod === 'special_collection' && (
        <div>
          <label className="form-label">住民税特別徴収の納期</label>
          <select
            value={profile.residentTaxPaymentCycle}
            onChange={(e) => set('residentTaxPaymentCycle', e.target.value as ResidentTaxPaymentCycle)}
            className="form-select"
          >
            {(['unknown', 'monthly', 'special'] as const).map((v) => (
              <option key={v} value={v}>{RESIDENT_TAX_CYCLE_LABEL[v]}</option>
            ))}
          </select>
          <p className="mt-1.5 text-xs leading-relaxed text-amber-700">
            「年2回納付」は、市区町村への申請が承認されている場合にのみ選択してください。従業員数だけで
            自動的に対象になるものではありません。未承認・未確認の場合は「未設定」のままにしてください。
          </p>
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <input
            type="checkbox"
            checked={profile.advisors.taxAccountant}
            onChange={(e) => set('advisors', { ...profile.advisors, taxAccountant: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          顧問税理士がいる
        </label>
      </div>

      <div className="flex items-center gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? '保存中…' : '保存する'}
        </button>
        {saved && (
          <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
            <CheckCircle2 className="h-4 w-4" />
            保存しました
          </span>
        )}
      </div>
    </form>
  );
}
