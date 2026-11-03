'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { trackEvent } from '@/lib/analytics';
import { createOrConfirmCompany, loadCreationMunicipalities, validCompanyCreationIntent, type CompanyCreationIntent } from '@/lib/workspaceCompanyCreation';

// 会社・所有者は同一要求で一括登録する。結果不明時は同じ要求の確認だけを行う。

export type PrefectureOption = { code: string; name: string };
type MunicipalityOption = { code: string; name: string };

const FISCAL_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function WorkspaceCompanyForm({ prefectures }: { prefectures: PrefectureOption[] }) {
  const router = useRouter();

  const [name, setName] = useState('');
  const [prefectureCode, setPrefectureCode] = useState('');
  const [municipalities, setMunicipalities] = useState<MunicipalityOption[]>([]);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false);
  const [municipalityCode, setMunicipalityCode] = useState('');
  const [corporateType, setCorporateType] = useState<'kabushiki' | 'godo'>('kabushiki');
  const [fiscalMonth, setFiscalMonth] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ready,setReady]=useState(false);
  const [pending,setPending]=useState<CompanyCreationIntent|null>(null);
  const [knownMissing,setKnownMissing]=useState(false);
  const [municipalityError,setMunicipalityError]=useState(false);
  const storageKey=useRef(''),lock=useRef(false),municipalityRequest=useRef(0);
  useEffect(()=>{
    let active=true;
    void (async()=>{
      try{
        const client=createBrowserSupabase();if(!client)throw Error();
        const user=await client.auth.getUser();if(user.error||!user.data.user?.id)throw Error();
        const key=`sunboo:company-create:v1:${user.data.user.id}`;
        const raw=sessionStorage.getItem(key);const saved:unknown=raw?JSON.parse(raw):null;
        if(saved!==null&&!validCompanyCreationIntent(saved))throw Error();
        if(!active)return;storageKey.current=key;
        if(saved){setPending(saved);setName(saved.values.name);setPrefectureCode(saved.values.prefecture_code);setMunicipalityCode(saved.values.municipality_code);setCorporateType(saved.values.corporate_type);setFiscalMonth(saved.values.fiscal_month);setError('前回の登録結果を確認してください。新しい要求での登録は停止しています。');}
        setReady(true);
      }catch{if(active)setError('ログイン状態または前回の登録記録を確認できません。登録を停止しています。再ログイン後に再読み込みしてください。');}
    })();return()=>{active=false};
  },[]);
  async function handlePrefectureChange(code:string){
    const request=++municipalityRequest.current;setPrefectureCode(code);setMunicipalityCode('');setMunicipalities([]);setMunicipalityError(false);setLoadingMunicipalities(false);
    if(!code)return;
    setLoadingMunicipalities(true);
    try{const client=createBrowserSupabase();const rows=client?await loadCreationMunicipalities(client,code):null;if(request!==municipalityRequest.current)return;
      if(rows===null)setMunicipalityError(true);else setMunicipalities(rows);
    }catch{if(request===municipalityRequest.current)setMunicipalityError(true);}
    finally{if(request===municipalityRequest.current)setLoadingMunicipalities(false);}
  }
  async function send(intent:CompanyCreationIntent,mode:'create'|'confirm'){
    if(lock.current||!ready)return;lock.current=true;setSaving(true);setError(null);
    try{
      sessionStorage.setItem(storageKey.current,JSON.stringify(intent));setPending(intent);setKnownMissing(false);
      const client=createBrowserSupabase();const result=client?await createOrConfirmCompany(client,intent,mode):{status:'unavailable' as const};
      if(result.status==='saved'){
        sessionStorage.removeItem(storageKey.current);setPending(null);trackEvent('company_created',{workspace_id:result.companyId,company_id:result.companyId});router.push(`/admin/workspaces/${result.companyId}`);router.refresh();
      }else if(result.status==='not_found'){
        setKnownMissing(true);setError('この要求の登録は見つかりませんでした。同じ入力・要求IDでのみ再試行できます。');
      }else if(result.status==='deleted'){
        sessionStorage.removeItem(storageKey.current);setPending(null);setMunicipalityCode('');setPrefectureCode('');setMunicipalities([]);setError('前回の要求に対応する会社は削除済みです。古い要求では再作成しません。必要なら新しい登録内容を確認して開始してください。');
      }else setError('登録結果を確認できません。新しい要求で再送せず、「登録結果を確認」で保存済みか確認してください。');
    }catch{setError('通信または登録記録を確認できません。再送せず、再読み込み後に登録結果を確認してください。');}
    finally{lock.current=false;setSaving(false);}
  }
  async function handleSubmit(e:React.FormEvent){
    e.preventDefault();if(!ready||saving||pending||lock.current)return;
    const intent:CompanyCreationIntent={requestId:crypto.randomUUID(),values:{name:name.trim(),prefecture_code:prefectureCode,municipality_code:municipalityCode,corporate_type:corporateType,fiscal_month:Number(fiscalMonth)}};
    if(!validCompanyCreationIntent(intent)||municipalityError){setError('会社名・所在地・法人種別・決算月を確認してください。');return;}
    await send(intent,'create');
  }
  const blocked=!ready||saving||pending!==null;

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-5">
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      <div>
        <label className="form-label">会社名 *</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-input"
          placeholder="例：株式会社サンプル"
          disabled={blocked}
        />
      </div>

      {municipalityError && <div role="alert">市区町村を取得できません。未対応とは判定しません。<button type="button" className="btn-secondary" disabled={saving} onClick={()=>handlePrefectureChange(prefectureCode)}>所在地を再読み込み</button></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">都道府県 *</label>
          <select
            required
            disabled={blocked}
            value={prefectureCode}
            onChange={(e) => handlePrefectureChange(e.target.value)}
            className="form-select"
          >
            <option value="">選択してください</option>
            {prefectures.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="form-label">市区町村 *</label>
          <select
            required
            value={municipalityCode}
            onChange={(e) => setMunicipalityCode(e.target.value)}
            className="form-select"
            disabled={blocked || !prefectureCode || loadingMunicipalities || municipalityError}
          >
            <option value="">
              {loadingMunicipalities ? '読み込み中…' : municipalityError ? '取得できません' : municipalities.length === 0 ? '市区町村を選択してください' : '選択してください'}
            </option>
            {pending && !municipalities.some(m=>m.code===municipalityCode) && <option value={municipalityCode}>前回選択した市区町村（登録結果の確認中）</option>}
            {municipalities.map((m) => (
              <option key={m.code} value={m.code}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">法人種別 *</label>
          <select
            required
            disabled={blocked}
            value={corporateType}
            onChange={(e) => setCorporateType(e.target.value as 'kabushiki' | 'godo')}
            className="form-select"
          >
            <option value="kabushiki">株式会社</option>
            <option value="godo">合同会社</option>
          </select>
        </div>
        <div>
          <label className="form-label">決算月 *</label>
          <select
            required
            disabled={blocked}
            value={fiscalMonth}
            onChange={(e) => setFiscalMonth(e.target.value ? Number(e.target.value) : '')}
            className="form-select"
          >
            <option value="">選択してください</option>
            {FISCAL_MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </div>
      </div>

      {pending && <div className="space-y-2"><p>登録結果を確認するまで入力の変更と新規登録は停止しています。</p><button type="button" className="btn-secondary" disabled={saving || !ready} onClick={()=>send(pending,'confirm')}>登録結果を確認</button>{knownMissing && <button type="button" className="btn-primary" disabled={saving} onClick={()=>send(pending,'create')}>同じ要求IDで再試行</button>}</div>}
      {!ready && <button type="button" className="btn-secondary" onClick={()=>window.location.reload()}>再読み込み</button>}
      <div className="flex gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={blocked || loadingMunicipalities || municipalityError} className="btn-primary disabled:opacity-60">
          {saving ? '登録中…' : '登録する'}
        </button>
        <button type="button" onClick={() => router.push('/admin/workspaces')} className="btn-secondary">
          {pending ? '一覧へ戻る（登録結果の確認は保持）' : 'キャンセル'}
        </button>
      </div>
    </form>
  );
}
