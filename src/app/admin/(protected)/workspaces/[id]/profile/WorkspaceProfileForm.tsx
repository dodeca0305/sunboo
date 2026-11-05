'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import type { CorporateType } from '@/lib/types';
import type {
  CompanyProfile, CompanyStage, ConsumptionTaxStatus, InvoiceRegistrationStatus,
  ResidentTaxPaymentCycle, WithholdingTaxCycle,
} from '@/lib/companyProfile';
import { companyProfileToWorkspaceUpdatePayload, workspaceRowsToCompanyProfile } from '@/lib/workspaceCompanyProfile';
import { profileSaveKey, validProfileSaveIntent, saveCompanyProfile, reconcileProfileSave, type ProfileSaveIntent, type ProfileSnapshot } from '@/lib/workspaceProfileSave';
import InformationCard from '@/components/InformationCard';
import ManualDateInput from '@/components/ManualDateInput';
import FormattedIntegerInput from '@/components/FormattedIntegerInput';
import { missingProfileInputs, profileInputId, PROFILE_GUIDANCE_FIELDS } from '@/lib/profileInputGuidance';
import { trackEvent } from '@/lib/analytics';

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

// 「この情報を◯◯の判定に利用します」という統一パターンで入力理由を表示する（Sprint61）。
// 各項目の説明文言をここで揃え、フォーム側で個別にクラス名・トーンを書き分けない。
function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs leading-relaxed text-gray-600">{children}</p>;
}

function ProfileFieldLabel({ field, children, kind, missing = false }: {
  field: string; children: React.ReactNode; kind: 'required' | 'guidance' | 'optional' | 'confirm'; missing?: boolean;
}) {
  return <label htmlFor={profileInputId(field)} className="form-label flex flex-wrap items-center gap-2">
    <span>{children}</span>
    <span className={`rounded px-1.5 py-0.5 text-xs ${kind === 'required' ? 'bg-blue-50 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
      {{required:'必須',guidance:'案内に使う情報',optional:'任意',confirm:'内容を確認'}[kind]}
    </span>
    {missing && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-900">未入力</span>}
  </label>;
}

export default function WorkspaceProfileForm({
  companyId,
  initialProfile,
  initialSnapshot,
}: {
  companyId: number;
  initialProfile: CompanyProfile;
  initialSnapshot: ProfileSnapshot;
}) {
  const [profile, setProfile] = useState<CompanyProfile>(initialProfile);
  const [employeeCountText, setEmployeeCountText] = useState(
    String(initialProfile.employeeCount),
  );
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof CompanyProfile>(key: K, value: CompanyProfile[K]) {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
  }

  const [expected,setExpected]=useState(initialSnapshot);
  const [ready,setReady]=useState(false);
  const [pending,setPending]=useState<ProfileSaveIntent|null>(null);
  const [mayRetry,setMayRetry]=useState(false);
  const lock=useRef(false),storageKey=useRef('');
  useEffect(()=>{let active=true;void(async()=>{
    try{const client=createBrowserSupabase();if(!client)throw Error();
      const user=await client.auth.getUser();if(user.error||!user.data.user?.id)throw Error();
      const key=profileSaveKey(companyId,user.data.user.id);const raw=sessionStorage.getItem(key);const previous:unknown=raw?JSON.parse(raw):null;
      if(previous!==null&&!validProfileSaveIntent(previous,companyId))throw Error();
      if(!active)return;storageKey.current=key;
      if(previous){setPending(previous);setError('前回の保存結果を確認してください。再取得で確認するまで編集・再送を停止しています。');}
      setReady(true);
    }catch{if(active)setError('ログイン状態または前回の保存記録を確認できません。編集・保存を停止しています。再ログイン後に再読み込みしてください。');}
  })();return()=>{active=false};},[companyId]);
  function acknowledge(intent:ProfileSaveIntent){
    setProfile(p=>workspaceRowsToCompanyProfile({id:companyId,name:'',prefecture_code:p.prefectureCode,municipality_code:p.municipalityCode,...intent.values.companyFields},{company_id:companyId,...intent.values.profileFields},p.prefectureName,p.municipalityName));
    setEmployeeCountText(String(intent.values.profileFields.employee_count));
    sessionStorage.removeItem(storageKey.current);setPending(null);setMayRetry(false);setExpected(intent.values);setError(null);setSaved(true);
    trackEvent('profile_completed',{workspace_id:companyId,company_id:companyId});
  }
  async function send(intent:ProfileSaveIntent,confirm=false){
    if(lock.current||!ready)return;lock.current=true;setSaving(true);setSaved(false);setError(null);setMayRetry(false);
    try{
      sessionStorage.setItem(storageKey.current,JSON.stringify(intent));setPending(intent);
      const client=createBrowserSupabase();if(!client)throw Error();
      const result=confirm?await reconcileProfileSave(client,intent):await saveCompanyProfile(client,intent);
      if(result==='saved')acknowledge(intent);
      else if(result==='unchanged'){setMayRetry(true);setError('再取得した結果、保存前の値のままでした。入力と保存前の値を固定したまま、同じ内容を再試行できます。');}
      else if(result==='conflict')setError('別の更新があるため上書きを停止しました。現在の情報を再読み込みし、内容を確認してください。');
      else setError('保存結果を確認できません。成功とは表示せず再送を停止しています。「保存結果を確認」で再取得してください。');
    }catch{setError('通信または保存記録を確認できません。再送せず、再読み込み後に保存結果を確認してください。');}
    finally{lock.current=false;setSaving(false);}
  }
  async function handleSubmit(e:React.FormEvent){
    e.preventDefault();if(!ready||saving||pending||lock.current)return;
    const intent:ProfileSaveIntent={version:1,companyId,expected,values:companyProfileToWorkspaceUpdatePayload(profile)};
    if(!validProfileSaveIntent(intent,companyId)){setError('入力内容を確認してください。保存は行っていません。');return;}
    await send(intent);
  }
  const blocked=!ready||saving||pending!==null;
  const missing = missingProfileInputs(profile);
  const focusedAnchor = useRef(false);
  useEffect(() => {
    if (blocked || focusedAnchor.current) return;
    focusedAnchor.current = true;
    const target = PROFILE_GUIDANCE_FIELDS.find(field => window.location.hash === `#${profileInputId(field.key)}`);
    if (target) document.getElementById(profileInputId(target.key))?.focus();
  }, [blocked]);


  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-5">
      {error && <div role="alert"><InformationCard kind="error">{error}</InformationCard></div>}
      {!ready && <button type="button" className="btn-secondary" onClick={()=>window.location.reload()}>再読み込み</button>}
      {pending && <div className="space-y-2">
        <p>保存したい内容：決算月 {pending.values.companyFields.fiscal_month??'未設定'}、従業員 {pending.values.profileFields.employee_count}人。保存結果の確認中は編集できません。</p>
        <button type="button" className="btn-secondary" disabled={saving||!ready} onClick={()=>send(pending,true)}>保存結果を確認</button>
        {mayRetry && <button type="button" className="btn-secondary" disabled={saving} onClick={()=>send(pending)}>確認した同じ内容で再試行</button>}
        <button type="button" className="btn-secondary" disabled={saving||!ready} onClick={()=>{sessionStorage.removeItem(storageKey.current);window.location.reload();}}>現在の情報を再読み込みして編集し直す</button>
        <p className="text-xs">再読み込みは保存を取り消しません。再送せず現在の保存値を取得してから編集し直します。</p>
      </div>}
      <section aria-label="入力する項目の案内" className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <h2 className="font-semibold">まず、分かる会社情報から入力してください</h2>
        <p>「必須」は保存に必要な項目です。「案内に使う情報」は空欄でも途中保存できます。分からない内容を推測して埋める必要はありません。</p>
        <p>選択済みの項目や初期値も、実際の会社情報と合っているか確認してください。</p>
        <p aria-live="polite" className="font-semibold">案内に使う基本情報：{missing.length > 0 ? `未入力 ${missing.length}項目` : '3項目とも入力されています'}</p>
        {missing.length > 0 && <ul className="space-y-2">
          {missing.map(field => <li key={field.key}>
            <a href={`#${profileInputId(field.key)}`} className="font-medium underline underline-offset-2">{field.label}の入力欄へ</a>
            <span className="ml-2">— {field.reason}</span>
          </li>)}
        </ul>}
        <p className="text-xs">入力しただけでは保存されません。確認したら、下の「保存する」を押してください。</p>
      </section>
      <fieldset disabled={blocked} className="space-y-5 [&_input]:scroll-mt-28 [&_select]:scroll-mt-28">

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <ProfileFieldLabel field="corporateType" kind="required">法人種別</ProfileFieldLabel>
          <select
            id={profileInputId("corporateType")}
            value={profile.corporateType}
            onChange={(e) => set('corporateType', e.target.value as CorporateType)}
            className="form-select"
          >
            {(['kabushiki', 'godo'] as const).map((v) => (
              <option key={v} value={v}>{CORPORATE_TYPE_LABEL[v]}</option>
            ))}
          </select>
          <FieldHint>この情報は提出先・登記関連手続きの判定に利用します。</FieldHint>
        </div>
        <div>
          <ProfileFieldLabel field="fiscalMonth" kind="guidance" missing={profile.fiscalMonth === null}>決算月</ProfileFieldLabel>
          <select
            id={profileInputId("fiscalMonth")}
            value={profile.fiscalMonth ?? ''}
            onChange={(e) => set('fiscalMonth', e.target.value ? Number(e.target.value) : null)}
            className="form-select"
          >
            <option value="">未設定</option>
            {FISCAL_MONTHS.map((m) => (
              <option key={m} value={m}>{m}月</option>
            ))}
          </select>
          <FieldHint>この情報はすべての手続きの期限計算に利用します。</FieldHint>
        </div>
      </div>

      <div>
        <p className="text-xs leading-relaxed text-gray-400">
          都道府県・市区町村（{profile.municipalityName || '未設定'}）は会社登録時に確定しています。
          登録内容を変更する機能は現在準備中です。
        </p>
        <FieldHint>この情報は提出先（税務署・市区町村役場等）の判定に利用します。</FieldHint>
      </div>

      <div>
        <ProfileFieldLabel field="address" kind="optional">番地・建物名</ProfileFieldLabel>
        <input
          id={profileInputId("address")}
          type="text"
          placeholder="例: 1丁目2番3号 ○○ビル4階"
          value={profile.address ?? ''}
          onChange={(e) => set('address', e.target.value || null)}
          className="form-input"
        />
        <FieldHint>
          この情報はExcel・PDF・共有ページでの本店所在地の表示にのみ利用します。提出先の判定には
          利用しません（判定は都道府県・市区町村のみで行います）。
        </FieldHint>
      </div>

      {profile.corporateType === 'kabushiki' && (
        <div>
          <ProfileFieldLabel field="nextOfficerChangeDate" kind="optional">次回の役員変更予定日</ProfileFieldLabel>
          <ManualDateInput
            id={profileInputId("nextOfficerChangeDate")}
            value={profile.nextOfficerChangeDate}
            onChange={(value) => set('nextOfficerChangeDate', value)}
            label="次回の役員変更予定日"
          />
          <FieldHint>
            この情報は役員変更登記の期限判定に利用します（登記期限そのものではなく、この日から
            2週間以内が登記申請期限になります）。任期満了に伴う重任・交代が効力を生じる日
            （株主総会での重任決議日等）を入力してください。未定の場合は空欄のままにしてください。
          </FieldHint>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <ProfileFieldLabel field="establishedDate" kind="guidance" missing={profile.establishedDate === null}>設立日</ProfileFieldLabel>
          <ManualDateInput
            id={profileInputId("establishedDate")}
            value={profile.establishedDate}
            onChange={(value) => set('establishedDate', value)}
            label="設立日"
          />
          <FieldHint>この情報は会社ステージ（1期目/2期目以降）の判定に利用します。</FieldHint>
        </div>
        <div>
          <ProfileFieldLabel field="capital" kind="guidance" missing={profile.capital === null}>資本金（円）</ProfileFieldLabel>
          <FormattedIntegerInput
            id={profileInputId("capital")}
            value={profile.capital}
            onChange={(value) => set('capital', value)}
            placeholder="例: 5,000,000"
            ariaLabel="資本金"
          />
          <FieldHint>
            この情報は消費税の課税事業者判定に利用します（1,000万円以上は設立初年度から課税事業者）。
          </FieldHint>
        </div>
      </div>

      <div>
        <ProfileFieldLabel field="employeeCount" kind="required">従業員数</ProfileFieldLabel>
        <FormattedIntegerInput
          id={profileInputId("employeeCount")}
          value={
            employeeCountText === ''
              ? null
              : Number(employeeCountText)
          }
          onChange={(value) => {
            if (value === null) {
              setEmployeeCountText('');
              setSaved(false);
              return;
            }

            setEmployeeCountText(String(value));
            set('employeeCount', value);
          }}
          onBlur={() => {
            if (employeeCountText === '') {
              setEmployeeCountText('0');
              set('employeeCount', 0);
            }
          }}
          placeholder="例: 5"
          ariaLabel="従業員数"
        />
        <FieldHint>この情報は源泉所得税・社会保険関連手続きの判定に利用します。</FieldHint>
      </div>

      <div>
        <ProfileFieldLabel field="stage" kind="required">会社ステージ</ProfileFieldLabel>
        <select
          id={profileInputId("stage")}
          value={profile.stage}
          onChange={(e) => set('stage', e.target.value as CompanyStage)}
          className="form-select"
        >
          {(['pre_establishment', 'first_term', 'second_term_or_later'] as const).map((v) => (
            <option key={v} value={v}>{STAGE_LABEL[v]}</option>
          ))}
        </select>
        <FieldHint>
          この情報は設立系手続きの表示可否の判定に利用します（設立日・決算月から自動設定されます）。
        </FieldHint>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <ProfileFieldLabel field="consumptionTaxStatus" kind="required">消費税ステータス</ProfileFieldLabel>
          <select
            id={profileInputId("consumptionTaxStatus")}
            value={profile.consumptionTaxStatus}
            onChange={(e) => set('consumptionTaxStatus', e.target.value as ConsumptionTaxStatus)}
            className="form-select"
          >
            {(['exempt', 'taxable'] as const).map((v) => (
              <option key={v} value={v}>{CONSUMPTION_TAX_LABEL[v]}</option>
            ))}
          </select>
          <FieldHint>この情報は消費税確定申告の要否判定に利用します。</FieldHint>
        </div>
        <div>
          <ProfileFieldLabel field="invoiceRegistrationStatus" kind="required">インボイス登録状況</ProfileFieldLabel>
          <select
            id={profileInputId("invoiceRegistrationStatus")}
            value={profile.invoiceRegistrationStatus}
            onChange={(e) => set('invoiceRegistrationStatus', e.target.value as InvoiceRegistrationStatus)}
            className="form-select"
          >
            {(['not_registered', 'registered'] as const).map((v) => (
              <option key={v} value={v}>{INVOICE_LABEL[v]}</option>
            ))}
          </select>
          <FieldHint>この情報は消費税確定申告の要否判定に利用します。</FieldHint>
        </div>
      </div>

      <div>
        <ProfileFieldLabel field="withholdingTaxCycle" kind="confirm">源泉所得税の納付サイクル</ProfileFieldLabel>
        <select
          id={profileInputId("withholdingTaxCycle")}
          value={profile.withholdingTaxCycle}
          onChange={(e) => set('withholdingTaxCycle', e.target.value as WithholdingTaxCycle)}
          className="form-select"
        >
          {(['unset', 'monthly', 'special_exception'] as const).map((v) => (
            <option key={v} value={v}>{WITHHOLDING_CYCLE_LABEL[v]}</option>
          ))}
        </select>
        <FieldHint>この情報は源泉所得税の納付期限の判定に利用します。</FieldHint>
      </div>

      {profile.localTaxCollectionMethod === 'special_collection' && (
        <div>
          <ProfileFieldLabel field="residentTaxPaymentCycle" kind="confirm">住民税特別徴収の納期</ProfileFieldLabel>
          <select
            id={profileInputId("residentTaxPaymentCycle")}
            value={profile.residentTaxPaymentCycle}
            onChange={(e) => set('residentTaxPaymentCycle', e.target.value as ResidentTaxPaymentCycle)}
            className="form-select"
          >
            {(['unknown', 'monthly', 'special'] as const).map((v) => (
              <option key={v} value={v}>{RESIDENT_TAX_CYCLE_LABEL[v]}</option>
            ))}
          </select>
          <FieldHint>この情報は住民税特別徴収の納付期限の判定に利用します。</FieldHint>
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
        <FieldHint>この情報はAI参謀の案内文言に利用します（手続きの判定には利用しません）。</FieldHint>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={blocked} className="btn-primary disabled:opacity-60">
          {saving ? '保存中…' : '保存する'}
        </button>
        {saved && (
          <>
            <span className="flex items-center gap-1 text-xs font-medium text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
              会社情報を保存しました
            </span>
            <Link
              href={`/admin/workspaces/${companyId}/roadmap`}
              className="btn-secondary ml-auto inline-flex items-center gap-1 px-3 py-1.5 text-xs"
            >
              年間ロードマップを見る
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </div>
      </fieldset>
    </form>
  );
}
