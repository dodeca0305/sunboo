'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { trackEvent } from '@/lib/analytics';

// ── Company Workspace — 新規会社登録フォーム（Sprint 23 Phase23.1・Sprint 33）─────
// 【Sprint33で追加】workspace_companiesのRLSがWorkspace単位のアクセス制御へ変更されたため
// （supabase/migration_workspace_access_control.sql）、会社を作成しただけでは作成者自身も
// その会社にアクセスできない（workspace_membersに行が無いため）。会社作成の直後、
// 作成者自身をrole='owner'としてworkspace_membersへ登録するところまでを本フォームの責務とする
// （RLSのINSERT policyは「まだ誰もメンバーがいない会社」への最初のowner登録を許可している）。

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

  async function handlePrefectureChange(code: string) {
    setPrefectureCode(code);
    setMunicipalityCode('');
    setMunicipalities([]);
    if (!code) return;

    const supabase = createBrowserSupabase();
    if (!supabase) return;

    setLoadingMunicipalities(true);
    const { data: prefData } = await supabase.from('prefectures').select('id').eq('code', code).single();
    const pref = prefData as { id: number } | null;
    if (!pref) {
      setLoadingMunicipalities(false);
      return;
    }
    const { data } = await supabase
      .from('municipalities')
      .select('code, name')
      .eq('prefecture_id', pref.id)
      .order('code');
    setMunicipalities((data as MunicipalityOption[] | null) ?? []);
    setLoadingMunicipalities(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('会社名を入力してください。');
      return;
    }
    if (!prefectureCode || !municipalityCode) {
      setError('都道府県・市区町村を選択してください。');
      return;
    }
    if (!fiscalMonth) {
      setError('決算月を選択してください。');
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setSaving(false);
      setError('ログイン状態を確認できませんでした。再度ログインしてください。');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('workspace_companies')
      .insert({
        name: name.trim(),
        prefecture_code: prefectureCode,
        municipality_code: municipalityCode,
        corporate_type: corporateType,
        fiscal_month: fiscalMonth,
      })
      .select('id')
      .single();

    if (insertError || !data) {
      setSaving(false);
      setError(`登録に失敗しました: ${insertError?.message ?? '不明なエラー'}`);
      return;
    }

    const companyId = (data as { id: number }).id;

    // 作成者自身をownerとしてworkspace_membersへ登録する。ここで失敗すると、会社は
    // 作成されたのに誰もアクセスできない「孤立した会社」が残ってしまう（DBトランザクションで
    // 一括にはしていないMVPのため）。失敗時はSprint33 migrationのDELETEポリシー特例
    // （メンバーが1人もいない会社は誰でも削除可）を使って直前の会社を削除する補償処理を行う。
    const { error: memberError } = await supabase
      .from('workspace_members')
      .insert({ company_id: companyId, email: user.email, role: 'owner' });

    if (memberError) {
      const { error: rollbackError } = await supabase.from('workspace_companies').delete().eq('id', companyId);
      setSaving(false);
      setError(
        rollbackError
          ? `会社の登録処理に失敗し、後片付けにも失敗しました（会社ID: ${companyId}）。管理者に直接お問い合わせください。`
          : `アクセス権限の設定に失敗したため、登録を取り消しました: ${memberError.message}。もう一度お試しください。`,
      );
      return;
    }

    setSaving(false);
    trackEvent('company_created', { workspace_id: companyId, company_id: companyId });
    router.push(`/admin/workspaces/${companyId}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl space-y-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      <div>
        <label className="form-label">会社名 *</label>
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="form-input"
          placeholder="例：株式会社サンプル"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="form-label">都道府県 *</label>
          <select
            required
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
            disabled={!prefectureCode || loadingMunicipalities}
          >
            <option value="">
              {loadingMunicipalities ? '読み込み中…' : municipalities.length === 0 ? '未対応のエリアです' : '選択してください'}
            </option>
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

      <div className="flex gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">
          {saving ? '登録中…' : '登録する'}
        </button>
        <button type="button" onClick={() => router.push('/admin/workspaces')} className="btn-secondary">
          キャンセル
        </button>
      </div>
    </form>
  );
}
