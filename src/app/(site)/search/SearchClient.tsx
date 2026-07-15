'use client';

import { useMemo, useState } from 'react';
import { Search, Building2, ClipboardList, MapPin, Phone, ExternalLink, ChevronDown, X } from 'lucide-react';
import type { ProcedureCategory } from '@/lib/types';
import ProcedureDetailExtra, { type ProcedureDocumentItem } from '@/components/ProcedureDetailExtra';

export type SearchProcedure = {
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

export type SearchOffice = {
  id: number;
  office_type: string;
  name: string;
  address: string | null;
  phone: string | null;
  website_url: string | null;
  map_url: string | null;
  municipality_names: string[];
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

const OFFICE_TYPE_LABEL: Record<string, string> = {
  tax_office: '税務署',
  prefectural_tax: '都道府県税',
  municipal_tax: '市区町村税',
  pension_office: '年金事務所',
  labor_standards: '労基署',
  hello_work: 'ハローワーク',
  legal_affairs_bureau: '法務局',
};

type Row =
  | { kind: 'procedure'; key: string; data: SearchProcedure }
  | { kind: 'office'; key: string; data: SearchOffice };

export default function SearchClient({
  procedures,
  offices,
}: {
  procedures: SearchProcedure[];
  offices: SearchOffice[];
}) {
  const [query, setQuery] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const rows: Row[] = useMemo(
    () => [
      ...procedures.map((p): Row => ({ kind: 'procedure', key: `p-${p.id}`, data: p })),
      ...offices.map((o): Row => ({ kind: 'office', key: `o-${o.id}`, data: o })),
    ],
    [procedures, offices],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const haystack =
        row.kind === 'procedure'
          ? [row.data.name, row.data.description, CATEGORY_LABEL[row.data.category]]
          : [row.data.name, row.data.address, ...row.data.municipality_names, OFFICE_TYPE_LABEL[row.data.office_type]];
      return haystack.filter(Boolean).some((v) => (v as string).toLowerCase().includes(q));
    });
  }, [rows, query]);

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sunboo-ink-muted" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="手続き名・機関名で検索"
          className="form-input pl-11 pr-10"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="検索をクリア"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-sunboo-ink-muted hover:bg-gray-50 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="card mt-4 divide-y divide-gray-100 p-0">
        {filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-sunboo-ink-muted">該当する結果がありません</p>
        )}

        {filtered.map((row) => {
          const isExpanded = expandedKey === row.key;
          return (
            <div key={row.key}>
              <button
                type="button"
                onClick={() => setExpandedKey(isExpanded ? null : row.key)}
                className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-gray-50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-50">
                  {row.kind === 'procedure' ? (
                    <ClipboardList className="h-4 w-4 text-gray-500" />
                  ) : (
                    <Building2 className="h-4 w-4 text-gray-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900">{row.data.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-sunboo-ink-muted">
                    {row.kind === 'procedure'
                      ? CATEGORY_LABEL[row.data.category]
                      : (OFFICE_TYPE_LABEL[row.data.office_type] ?? row.data.office_type)}
                  </span>
                </span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {isExpanded && (
                <div className="px-5 pb-4 pl-16 text-xs text-gray-500">
                  {row.kind === 'procedure' ? (
                    <div className="space-y-2">
                      {row.data.description && <p className="leading-relaxed">{row.data.description}</p>}
                      <p>期限: {row.data.timing_label}</p>
                      {row.data.official_links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {row.data.official_links.map((link, idx) => (
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
                      <ProcedureDetailExtra
                        targetNote={row.data.target_note}
                        submissionMethod={row.data.submission_method}
                        documents={row.data.procedure_documents}
                        eFilingSystemName={row.data.e_filing_system_name}
                        eFilingSystemUrl={row.data.e_filing_system_url}
                        cautionNote={row.data.caution_note}
                      />
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {row.data.address && (
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          {row.data.address}
                        </p>
                      )}
                      {row.data.phone && (
                        <p className="flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          {row.data.phone}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        {row.data.map_url && (
                          <a
                            href={row.data.map_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary px-3 py-1 text-xs"
                          >
                            地図
                          </a>
                        )}
                        {row.data.website_url && (
                          <a
                            href={row.data.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn-secondary inline-flex items-center gap-1 px-3 py-1 text-xs"
                          >
                            公式サイト
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
