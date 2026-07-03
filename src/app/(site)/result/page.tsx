import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { runDiagnosis } from '@/lib/diagnosis';
import { prefectures as staticPrefectures } from '@/data/prefectures';
import { Building2, MapPin, Phone, ExternalLink, ChevronLeft, AlertTriangle, DatabaseZap } from 'lucide-react';
import type { CorporateType, LinkStatus } from '@/lib/types';
import ScheduleList from './ScheduleList';

const CORPORATE_TYPE_LABEL: Record<CorporateType, string> = {
  kabushiki: '株式会社',
  godo: '合同会社',
};

function OfficialSiteLink({
  websiteUrl, officialUrl, status, fallbackUrl,
}: {
  websiteUrl: string | null;
  officialUrl?: string | null;
  status?: LinkStatus;
  fallbackUrl?: string | null;
}) {
  const s = status ?? 'unchecked';
  const href = s === 'broken' ? fallbackUrl : (officialUrl ?? websiteUrl);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer"
       className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs">
      {s === 'broken' && <AlertTriangle className="h-3 w-3 text-red-600" />}
      {s === 'broken' ? '公式一覧で確認' : '公式サイト'}
      {s !== 'broken' && <ExternalLink className="h-3 w-3" />}
      {s === 'unchecked' && (
        <span className="ml-0.5 text-[10px] text-gray-400">（未確認）</span>
      )}
    </a>
  );
}

const FALLBACK_MUNI_NAMES: Record<string, string> = {
  '13113': '渋谷区',
};

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{
    pref?: string;
    muni?: string;
    emp?: string;
    fm?: string;
    corp?: string;
    officerTerm?: string;
  }>;
}) {
  const sp = await searchParams;

  const prefCode = sp.pref ?? '';
  const muniCode = sp.muni ?? '';
  const hasEmployees = sp.emp === 'true';
  const fiscalMonth = Number(sp.fm) || 0;
  const corporateType: CorporateType = sp.corp === 'godo' ? 'godo' : 'kabushiki';
  const hasOfficerTerm = sp.officerTerm === 'true';

  if (!prefCode || !muniCode || fiscalMonth < 1 || fiscalMonth > 12) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="card space-y-4">
          <AlertTriangle className="mx-auto h-8 w-8 text-gray-300" />
          <h1 className="text-xl font-bold text-gray-900">入力情報が不足しています</h1>
          <p className="text-sm text-gray-500">
            会社情報を入力してから診断してください。
          </p>
          <Link href="/start" className="btn-primary inline-flex justify-center">
            入力画面へ
          </Link>
        </div>
      </div>
    );
  }

  const result = await runDiagnosis(supabase, {
    prefectureCode: prefCode,
    municipalityCode: muniCode,
    hasEmployees,
    fiscalMonth,
    corporateType,
    hasOfficerTerm,
  });

  const prefName =
    staticPrefectures.find((p) => p.code === prefCode)?.name ?? prefCode;

  let muniName = FALLBACK_MUNI_NAMES[muniCode] ?? muniCode;
  if (supabase) {
    const { data } = await supabase
      .from('municipalities')
      .select('name')
      .eq('code', muniCode)
      .single();
    if (data) muniName = (data as { name: string }).name;
  }

  const noData =
    result.offices.length === 0 && result.procedures.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">

      {/* 戻るリンク */}
      <Link
        href="/start"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        <ChevronLeft className="h-4 w-4" />
        条件を変更する
      </Link>

      {/* 診断条件サマリー */}
      <div className="mb-8 rounded-xl border border-blue-100 bg-blue-50 p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-500">
          診断結果
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-blue-900">
          <span>{prefName} {muniName}</span>
          <span className="text-blue-300">·</span>
          <span>{CORPORATE_TYPE_LABEL[corporateType]}</span>
          <span className="text-blue-300">·</span>
          <span>従業員{hasEmployees ? 'あり' : 'なし'}</span>
          <span className="text-blue-300">·</span>
          <span>{fiscalMonth}月決算</span>
        </div>
      </div>

      {/* Supabase 未設定・データなし */}
      {noData && (
        <div className="card space-y-4 py-12 text-center">
          <DatabaseZap className="mx-auto h-8 w-8 text-gray-300" />
          <p className="font-semibold text-gray-700">データベース未接続</p>
          <p className="text-sm text-gray-500">
            Supabase の環境変数を設定すると、管轄機関・手続き情報が表示されます。
          </p>
          <Link href="/start" className="btn-secondary text-sm">
            ← 入力画面に戻る
          </Link>
        </div>
      )}

      {/* ── 管轄機関 ── */}
      {result.offices.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            管轄機関
            <span className="ml-2 text-sm font-normal text-gray-400">
              {result.offices.length}件
            </span>
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {result.offices.map((office) => (
              <div key={office.id} className="card flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50">
                  <Building2 className="h-5 w-5 text-gray-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">{office.name}</p>
                  {office.address && (
                    <p className="mt-1 flex items-start gap-1 truncate text-xs text-gray-500">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      {office.address}
                    </p>
                  )}
                  {office.phone && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <Phone className="h-3 w-3 shrink-0" />
                      {office.phone}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {office.map_url && (
                      <a
                        href={office.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-3 py-1 text-xs"
                      >
                        地図
                      </a>
                    )}
                    <OfficialSiteLink
                      websiteUrl={office.website_url}
                      officialUrl={office.official_url}
                      status={office.official_url_status}
                      fallbackUrl={office.fallback_url}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 必要手続き（スケジュール） ── */}
      {result.procedures.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            必要手続き
            <span className="ml-2 text-sm font-normal text-gray-400">
              {result.procedures.length}件
            </span>
          </h2>

          <ScheduleList
            procedures={result.procedures.map((proc) => ({
              id: proc.id,
              name: proc.name,
              description: proc.description,
              category: proc.category,
              timing_label: proc.timing_label,
              next_deadline: proc.next_deadline,
              next_deadline_date: proc.next_deadline_date,
              office: proc.office ? { name: proc.office.name } : null,
              official_links: proc.official_links,
              procedure_documents: proc.procedure_documents,
              target_note: proc.target_note,
              submission_method: proc.submission_method,
              e_filing_system_name: proc.e_filing_system_name,
              e_filing_system_url: proc.e_filing_system_url,
              caution_note: proc.caution_note,
            }))}
          />
        </section>
      )}

      {/* 再診断リンク */}
      {!noData && (
        <div className="mt-12 text-center">
          <Link href="/start" className="btn-secondary text-sm">
            ← 条件を変更して再診断する
          </Link>
        </div>
      )}

      {/* 注意書き */}
      {!noData && (
        <p className="mt-8 flex items-start gap-2 text-xs text-gray-400">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。法改正等により内容が変更されている場合があります。
        </p>
      )}
    </div>
  );
}
