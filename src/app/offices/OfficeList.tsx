'use client';

import { useState } from 'react';

export type OfficeItem = {
  id: number;
  office_type: string;
  name: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  map_url: string | null;
  municipality_name: string | null;
};

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
    badgeClass: 'bg-purple-100 text-purple-700',
    duties: '法人都民税・法人事業税',
  },
  municipal_tax: {
    label: '市区町村税',
    badgeClass: 'bg-green-100 text-green-700',
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
        <p className="mb-3 text-4xl">🔧</p>
        <p className="font-semibold text-gray-700">データベース未接続</p>
        <p className="mt-2 text-sm text-gray-500">
          Supabase を設定すると管轄機関一覧が表示されます
        </p>
      </div>
    );
  }

  // データに実際に存在する機関種別のみフィルタボタンを表示
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
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            activeType === 'all'
              ? 'bg-brand-navy text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                activeType === type
                  ? 'bg-brand-navy text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
            <div key={office.id} className="card">
              <div className="flex items-start gap-3">
                <span className="shrink-0 text-2xl">🏛</span>
                <div className="min-w-0 flex-1">
                  {/* 機関名 + バッジ */}
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold text-gray-900">
                      {office.name}
                    </h2>
                    {config && (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${config.badgeClass}`}
                      >
                        {config.label}
                      </span>
                    )}
                  </div>

                  {/* 地域名（複数地域対応時のサブラベル） */}
                  {office.municipality_name && (
                    <p className="mt-0.5 text-xs text-gray-400">
                      {office.municipality_name}
                    </p>
                  )}

                  {/* 住所 */}
                  {office.address && (
                    <p className="mt-1 text-xs text-gray-500">{office.address}</p>
                  )}

                  {/* 電話 */}
                  {office.phone && (
                    <p className="mt-0.5 text-xs text-gray-500">{office.phone}</p>
                  )}

                  {/* 担当業務 */}
                  {config && (
                    <p className="mt-1 text-xs text-gray-400">
                      担当: {config.duties}
                    </p>
                  )}

                  {/* ボタン */}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {office.map_url && (
                      <a
                        href={office.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-2 py-1 text-xs"
                      >
                        地図
                      </a>
                    )}
                    {office.website_url && (
                      <a
                        href={office.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-2 py-1 text-xs"
                      >
                        公式サイト
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
