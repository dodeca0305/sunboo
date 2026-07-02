import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { runDiagnosis } from '@/lib/diagnosis';
import { prefectures as staticPrefectures } from '@/data/prefectures';
import type { ProcedureCategory } from '@/lib/types';
import { Building2, MapPin, Phone, ExternalLink, Clock, ChevronLeft } from 'lucide-react';

const FALLBACK_MUNI_NAMES: Record<string, string> = {
  '13113': '渋谷区',
};

const CATEGORY_CONFIG: Record<
  ProcedureCategory,
  { label: string; borderColor: string; badgeClass: string }
> = {
  tax:          { label: '税務',   borderColor: 'border-blue-500',   badgeClass: 'bg-blue-100 text-blue-700' },
  labor:        { label: '労務',   borderColor: 'border-orange-400', badgeClass: 'bg-orange-100 text-orange-700' },
  insurance:    { label: '社保',   borderColor: 'border-emerald-500', badgeClass: 'bg-emerald-100 text-emerald-700' },
  registration: { label: '登録',   borderColor: 'border-violet-500', badgeClass: 'bg-violet-100 text-violet-700' },
  other:        { label: 'その他', borderColor: 'border-gray-300',   badgeClass: 'bg-gray-100 text-gray-600' },
};

export default async function ResultPage({
  searchParams,
}: {
  searchParams: Promise<{ pref?: string; muni?: string; emp?: string; fm?: string }>;
}) {
  const sp = await searchParams;

  const prefCode = sp.pref ?? '';
  const muniCode = sp.muni ?? '';
  const hasEmployees = sp.emp === 'true';
  const fiscalMonth = Number(sp.fm) || 0;

  if (!prefCode || !muniCode || fiscalMonth < 1 || fiscalMonth > 12) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <div className="card space-y-4">
          <p className="text-4xl">⚠️</p>
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
      <div className="mb-8 rounded-2xl border border-blue-100 bg-blue-50 p-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-blue-500">
          診断結果
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-blue-900">
          <span>{prefName} {muniName}</span>
          <span className="text-blue-300">·</span>
          <span>従業員{hasEmployees ? 'あり' : 'なし'}</span>
          <span className="text-blue-300">·</span>
          <span>{fiscalMonth}月決算</span>
        </div>
      </div>

      {/* Supabase 未設定・データなし */}
      {noData && (
        <div className="card space-y-4 py-12 text-center">
          <p className="text-4xl">🔧</p>
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
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
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
                    {office.website_url && (
                      <a
                        href={office.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-3 py-1 text-xs"
                      >
                        公式サイト
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── 必要手続き ── */}
      {result.procedures.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-bold text-gray-900">
            必要手続き
            <span className="ml-2 text-sm font-normal text-gray-400">
              {result.procedures.length}件
            </span>
          </h2>

          <div className="space-y-4">
            {result.procedures.map((proc) => {
              const cat = CATEGORY_CONFIG[proc.category] ?? CATEGORY_CONFIG.other;
              const deadline = proc.next_deadline ?? proc.timing_label;

              return (
                <div
                  key={proc.id}
                  className={`card border-l-4 ${cat.borderColor}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-gray-900">{proc.name}</h3>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${cat.badgeClass}`}>
                      {cat.label}
                    </span>
                  </div>

                  <div className="mt-2 space-y-1">
                    {proc.office && (
                      <p className="flex items-center gap-1.5 text-xs text-gray-500">
                        <Building2 className="h-3.5 w-3.5 shrink-0" />
                        {proc.office.name}
                      </p>
                    )}
                    <p className="flex items-center gap-1.5 text-xs text-gray-600">
                      <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="font-medium">期限:</span> {deadline}
                    </p>
                  </div>

                  {proc.official_links.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {proc.official_links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs"
                        >
                          {link.label}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
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
        <div className="mt-8 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          ⚠️ 本サイトの情報は一般的な参考情報です。実際の手続き・期限・提出先は必ず各公式機関の最新情報をご確認ください。法改正等により内容が変更されている場合があります。
        </div>
      )}
    </div>
  );
}
