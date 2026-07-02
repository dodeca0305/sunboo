'use client';

import { useState } from 'react';
import type { ProcedureCategory } from '@/lib/types';

type ProcedureItem = {
  id: number;
  name: string;
  description: string;
  category: ProcedureCategory;
  office_type: string;
  timing_label: string;
  official_links: { label: string; url: string }[];
};

const CATEGORY_CONFIG: Record<
  ProcedureCategory,
  { label: string; borderColor: string; badgeClass: string }
> = {
  tax:          { label: '税務',   borderColor: 'border-blue-500',   badgeClass: 'bg-blue-100 text-blue-700' },
  labor:        { label: '労務',   borderColor: 'border-orange-500', badgeClass: 'bg-orange-100 text-orange-700' },
  insurance:    { label: '社保',   borderColor: 'border-green-500',  badgeClass: 'bg-green-100 text-green-700' },
  registration: { label: '登録',   borderColor: 'border-purple-500', badgeClass: 'bg-purple-100 text-purple-700' },
  other:        { label: 'その他', borderColor: 'border-gray-400',   badgeClass: 'bg-gray-100 text-gray-700' },
};

const OFFICE_TYPE_LABELS: Record<string, string> = {
  tax_office:       '税務署',
  prefectural_tax:  '都道府県税事務所',
  municipal_tax:    '市区町村（税務課）',
  pension_office:   '年金事務所',
  labor_standards:  '労働基準監督署',
  hello_work:       'ハローワーク',
};

export default function ProcedureList({
  procedures,
}: {
  procedures: ProcedureItem[];
}) {
  const [activeCategory, setActiveCategory] = useState('all');

  if (procedures.length === 0) {
    return (
      <div className="card py-12 text-center">
        <p className="mb-3 text-4xl">🔧</p>
        <p className="font-semibold text-gray-700">データベース未接続</p>
        <p className="mt-2 text-sm text-gray-500">
          Supabase を設定すると手続き一覧が表示されます
        </p>
      </div>
    );
  }

  // データに実際に存在するカテゴリのみフィルタボタンを表示
  const availableCategories = Array.from(
    new Set(procedures.map((p) => p.category)),
  );

  const filtered =
    activeCategory === 'all'
      ? procedures
      : procedures.filter((p) => p.category === activeCategory);

  return (
    <div>
      {/* カテゴリフィルター */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
            activeCategory === 'all'
              ? 'bg-brand-navy text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          全て（{procedures.length}）
        </button>

        {availableCategories.map((cat) => {
          const config = CATEGORY_CONFIG[cat] ?? CATEGORY_CONFIG.other;
          const count = procedures.filter((p) => p.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                activeCategory === cat
                  ? 'bg-brand-navy text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {config.label}（{count}）
            </button>
          );
        })}
      </div>

      {/* 手続きカード */}
      <div className="space-y-4">
        {filtered.map((proc) => {
          const cat = CATEGORY_CONFIG[proc.category] ?? CATEGORY_CONFIG.other;

          return (
            <div key={proc.id} className={`card border-l-4 ${cat.borderColor}`}>
              {/* タイトル + バッジ */}
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold text-gray-900">{proc.name}</h2>
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${cat.badgeClass}`}
                >
                  {cat.label}
                </span>
              </div>

              {/* 提出先 + 期限 */}
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-gray-500">
                  提出先:{' '}
                  {OFFICE_TYPE_LABELS[proc.office_type] ?? proc.office_type}
                </p>
                <p className="text-xs text-gray-600">
                  <span className="font-medium">期限:</span> {proc.timing_label}
                </p>
              </div>

              {/* 説明文 */}
              {proc.description && (
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  {proc.description}
                </p>
              )}

              {/* 公式リンク */}
              {proc.official_links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {proc.official_links.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary px-3 py-1 text-xs"
                    >
                      {link.label} →
                    </a>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
