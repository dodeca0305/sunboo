'use client';

import { useState } from 'react';
import { Building2, MapPin, Phone, ExternalLink, Map, Settings, AlertTriangle } from 'lucide-react';

export type OfficeItem = {
  id: number;
  office_type: string;
  name: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  map_url: string | null;
  municipality_name: string | null;
  official_url?: string | null;
  official_url_status?: string;
  fallback_url?: string | null;
};

function OfficialSiteLink({
  websiteUrl, officialUrl, status, fallbackUrl,
}: {
  websiteUrl: string | null;
  officialUrl?: string | null;
  status?: string;
  fallbackUrl?: string | null;
}) {
  const s = status ?? 'unchecked';
  const href = s === 'broken' ? fallbackUrl : (officialUrl ?? websiteUrl);
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs"
    >
      {s === 'broken' && <AlertTriangle className="h-3 w-3 text-amber-500" />}
      {s === 'broken' ? '公式一覧で確認' : '公式サイト'}
      {s !== 'broken' && <ExternalLink className="h-3 w-3" />}
      {s === 'unchecked' && (
        <span className="ml-0.5 text-[10px] text-gray-400">（未確認）</span>
      )}
    </a>
  );
}

const OFFICE_TYPE_CONFIG: Record<
  string,
  { label: string; badgeClass: string; duties: string }
> = {
  tax_office: {
    label: '税務署',
    badgeClass: 'bg-blue-100 text-blue-700',
    duties: '法人税・源泉所得税・法人設立届出・青色申告承認申請',
  },
  prefectural_tax: {
    label: '都道府県税',
    badgeClass: 'bg-violet-100 text-violet-700',
    duties: '法人都民税・法人事業税',
  },
  municipal_tax: {
    label: '市区町村税',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    duties: '法人住民税',
  },
  pension_office: {
    label: '年金事務所',
    badgeClass: 'bg-teal-100 text-teal-700',
    duties: '健康保険・厚生年金保険の新規適用・算定基礎届',
  },
  labor_standards: {
    label: '労基署',
    badgeClass: 'bg-orange-100 text-orange-700',
    duties: '労災保険・労働保険成立届・年度更新',
  },
  hello_work: {
    label: 'ハローワーク',
    badgeClass: 'bg-yellow-100 text-yellow-700',
    duties: '雇用保険・雇用保険適用事業所設置届',
  },
};

export default function OfficeList({ offices }: { offices: OfficeItem[] }) {
  const [activeType, setActiveType] = useState('all');

  if (offices.length === 0) {
    return (
      <div className="card py-12 text-center">
        <Settings className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-semibold text-gray-700">データベース未接続</p>
        <p className="mt-2 text-sm text-gray-500">
          Supabase を設定すると管轄機関一覧が表示されます
        </p>
      </div>
    );
  }

  const availableTypes = Array.from(new Set(offices.map((o) => o.office_type)));

  const filtered =
    activeType === 'all'
      ? offices
      : offices.filter((o) => o.office_type === activeType);

  return (
    <div>
      {/* 機関タイプフィルター */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveType('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
            activeType === 'all'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          全て（{offices.length}）
        </button>

        {availableTypes.map((type) => {
          const config = OFFICE_TYPE_CONFIG[type];
          if (!config) return null;
          const count = offices.filter((o) => o.office_type === type).length;
          return (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                activeType === type
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {config.label}（{count}）
            </button>
          );
        })}
      </div>

      {/* 管轄機関カード */}
      <div className="grid gap-4 sm:grid-cols-2">
        {filtered.map((office) => {
          const config = OFFICE_TYPE_CONFIG[office.office_type];

          return (
            <div key={office.id} className="card flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100">
                <Building2 className="h-5 w-5 text-gray-500" />
              </span>

              <div className="min-w-0 flex-1">
                {/* 機関名 + バッジ */}
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-bold text-gray-900">{office.name}</h2>
                  {config && (
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${config.badgeClass}`}>
                      {config.label}
                    </span>
                  )}
                </div>

                {office.municipality_name && (
                  <p className="mt-0.5 text-xs text-gray-400">{office.municipality_name}</p>
                )}

                {office.address && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {office.address}
                  </p>
                )}

                {office.phone && (
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    {office.phone}
                  </p>
                )}

                {config && (
                  <p className="mt-1.5 text-xs leading-relaxed text-gray-400">
                    {config.duties}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {office.map_url && (
                    <a
                      href={office.map_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs"
                    >
                      <Map className="h-3 w-3" />
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
          );
        })}
      </div>
    </div>
  );
}
