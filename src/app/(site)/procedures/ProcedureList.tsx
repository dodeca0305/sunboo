'use client';

import { useState } from 'react';
import type { ProcedureCategory } from '@/lib/types';
import { Building2, Clock, ExternalLink, Settings, AlertTriangle } from 'lucide-react';
import ProcedureDetailExtra, { type ProcedureDocumentItem } from '@/components/ProcedureDetailExtra';

type ProcedureItem = {
  id: number;
  name: string;
  description: string;
  category: ProcedureCategory;
  office_type: string;
  timing_label: string;
  official_links: { label: string; url: string; status?: string; fallback_url?: string | null }[];
  procedure_documents?: ProcedureDocumentItem[];
  target_note?: string | null;
  submission_method?: string | null;
  e_filing_system_name?: string | null;
  e_filing_system_url?: string | null;
  caution_note?: string | null;
};

const CATEGORY_LABEL: Record<ProcedureCategory, string> = {
  tax: '税務',
  local_tax: '地方税',
  labor: '労務',
  insurance: '社保',
  registration: '登録',
  legal: '法務・登記',
  other: 'その他',
};

const OFFICE_TYPE_LABELS: Record<string, string> = {
  tax_office:      '税務署',
  prefectural_tax: '都道府県税事務所',
  municipal_tax:   '市区町村（税務課）',
  pension_office:  '年金事務所',
  labor_standards: '労働基準監督署',
  hello_work:      'ハローワーク',
  legal_affairs_bureau: '法務局',
};

export default function ProcedureList({ procedures }: { procedures: ProcedureItem[] }) {
  const [activeCategory, setActiveCategory] = useState('all');

  if (procedures.length === 0) {
    return (
      <div className="card py-12 text-center">
        <Settings className="mx-auto mb-3 h-10 w-10 text-gray-300" />
        <p className="font-semibold text-gray-700">データベース未接続</p>
        <p className="mt-2 text-sm text-gray-500">
          Supabase を設定すると手続き一覧が表示されます
        </p>
      </div>
    );
  }

  const availableCategories = Array.from(new Set(procedures.map((p) => p.category)));

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
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            activeCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
          }`}
        >
          全て（{procedures.length}）
        </button>

        {availableCategories.map((cat) => {
          const count = procedures.filter((p) => p.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'border border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {CATEGORY_LABEL[cat] ?? 'その他'}（{count}）
            </button>
          );
        })}
      </div>

      {/* 手続きカード */}
      <div className="space-y-4">
        {filtered.map((proc) => {
          return (
            <div key={proc.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold text-gray-900">{proc.name}</h2>
                <span className="tag">{CATEGORY_LABEL[proc.category] ?? 'その他'}</span>
              </div>

              <div className="mt-2 space-y-1">
                <p className="flex items-center gap-1.5 text-xs text-gray-500">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  {OFFICE_TYPE_LABELS[proc.office_type] ?? proc.office_type}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                  <span className="font-medium">期限:</span>&nbsp;{proc.timing_label}
                </p>
              </div>

              {proc.description && (
                <p className="mt-2 text-xs leading-relaxed text-gray-500">
                  {proc.description}
                </p>
              )}

              {proc.official_links.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {proc.official_links.map((link, idx) => {
                    const s = link.status ?? 'unchecked';
                    const href = s === 'broken'
                      ? (link.fallback_url ?? link.url)
                      : link.url;
                    return (
                      <a
                        key={idx}
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs"
                      >
                        {s === 'broken' && (
                          <AlertTriangle className="h-3 w-3 text-red-600" />
                        )}
                        {link.label}
                        {s !== 'broken' && <ExternalLink className="h-3 w-3" />}
                        {s === 'unchecked' && (
                          <span className="ml-0.5 text-[10px] text-gray-400">（未確認）</span>
                        )}
                      </a>
                    );
                  })}
                </div>
              )}

              <ProcedureDetailExtra
                targetNote={proc.target_note}
                submissionMethod={proc.submission_method}
                documents={proc.procedure_documents}
                eFilingSystemName={proc.e_filing_system_name}
                eFilingSystemUrl={proc.e_filing_system_url}
                cautionNote={proc.caution_note}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
