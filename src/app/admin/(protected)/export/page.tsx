'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Download, FileDown } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

type RawMunicipality = { code: string; name: string; prefectures: { code: string; name: string } | null };
type RawOffice = {
  id: number;
  name: string;
  postal_code: string | null;
  address: string | null;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website_url: string | null;
  official_url: string | null;
  official_url_status: string | null;
  fallback_url: string | null;
  e_filing_url: string | null;
  download_page_url: string | null;
  map_url: string | null;
  business_hours: string | null;
  notes: string | null;
  organizations: { name: string; organization_types: { code: string } | null } | null;
};
type RawJurisdiction = {
  organization_office_id: number;
  municipalities: { code: string } | null;
};
type RawProcedure = {
  code: string;
  name: string;
  description: string | null;
  category: string;
  requires_employees: boolean;
  applicable_industries: string[] | null;
  office_type: string;
  frequency: string;
  timing_label: string;
  timing_type: string;
  timing_data: Record<string, unknown> | null;
  priority: number;
  is_active: boolean;
};

function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const EXPORTS = [
  {
    key: 'municipalities',
    title: '都道府県・市区町村',
    filename: 'municipalities_export.csv',
    run: async (supabase: NonNullable<ReturnType<typeof createBrowserSupabase>>) => {
      const { data } = await supabase.from('municipalities').select('code, name, prefectures(code, name)').order('code');
      return ((data as unknown as RawMunicipality[] | null) ?? []).map((m) => ({
        pref_code: m.prefectures?.code ?? '',
        pref_name: m.prefectures?.name ?? '',
        muni_code: m.code,
        muni_name: m.name,
      }));
    },
  },
  {
    key: 'organization_offices',
    title: '管轄機関の基本情報',
    filename: 'organization_offices_export.csv',
    run: async (supabase: NonNullable<ReturnType<typeof createBrowserSupabase>>) => {
      const [{ data }, { data: jurisdictionData }] = await Promise.all([
        supabase
          .from('organization_offices')
          .select(
            'id, name, postal_code, address, phone, fax, email, website_url, official_url, official_url_status, ' +
              'fallback_url, e_filing_url, download_page_url, map_url, business_hours, notes, ' +
              'organizations(name, organization_types(code))',
          )
          .order('id'),
        supabase.from('jurisdictions').select('organization_office_id, municipalities(code)'),
      ]);

      const muniCodesByOffice = new Map<number, string[]>();
      for (const j of (jurisdictionData as unknown as RawJurisdiction[] | null) ?? []) {
        const code = j.municipalities?.code;
        if (!code) continue;
        const list = muniCodesByOffice.get(j.organization_office_id) ?? [];
        list.push(code);
        muniCodesByOffice.set(j.organization_office_id, list);
      }

      return ((data as unknown as RawOffice[] | null) ?? []).map((o) => ({
        org_type_code: o.organizations?.organization_types?.code ?? '',
        org_name: o.organizations?.name ?? '',
        office_name: o.name,
        muni_codes: (muniCodesByOffice.get(o.id) ?? []).join('|'),
        postal_code: o.postal_code ?? '',
        address: o.address ?? '',
        phone: o.phone ?? '',
        fax: o.fax ?? '',
        email: o.email ?? '',
        website_url: o.website_url ?? '',
        official_url: o.official_url ?? '',
        e_filing_url: o.e_filing_url ?? '',
        download_page_url: o.download_page_url ?? '',
        map_url: o.map_url ?? '',
        business_hours: o.business_hours ?? '',
        notes: o.notes ?? '',
      }));
    },
  },
  {
    key: 'official_links',
    title: '公式リンクの生存状況',
    filename: 'official_links_export.csv',
    run: async (supabase: NonNullable<ReturnType<typeof createBrowserSupabase>>) => {
      const { data } = await supabase
        .from('organization_offices')
        .select('name, official_url, official_url_status, fallback_url, organizations(organization_types(code))')
        .order('id');
      return ((data as unknown as RawOffice[] | null) ?? []).map((o) => ({
        org_type_code: o.organizations?.organization_types?.code ?? '',
        office_name: o.name,
        official_url: o.official_url ?? '',
        official_url_status: o.official_url_status ?? 'unchecked',
        fallback_url: o.fallback_url ?? '',
      }));
    },
  },
  {
    key: 'procedures',
    title: '手続きマスタ',
    filename: 'procedures_export.csv',
    run: async (supabase: NonNullable<ReturnType<typeof createBrowserSupabase>>) => {
      const { data } = await supabase.from('procedures').select('*').order('priority');
      return ((data as unknown as RawProcedure[] | null) ?? []).map((p) => ({
        code: p.code,
        name: p.name,
        description: p.description ?? '',
        category: p.category,
        requires_employees: p.requires_employees,
        applicable_industries: (p.applicable_industries ?? []).join('|'),
        office_type: p.office_type,
        frequency: p.frequency,
        timing_label: p.timing_label,
        timing_type: p.timing_type,
        timing_data: p.timing_data ? JSON.stringify(p.timing_data) : '',
        priority: p.priority,
        is_active: p.is_active,
      }));
    },
  },
] as const;

export default function AdminExportPage() {
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(item: (typeof EXPORTS)[number]) {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }
    setError(null);
    setLoadingKey(item.key);
    try {
      const rows = await item.run(supabase);
      downloadCsv(item.filename, rows as Record<string, unknown>[]);
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Download className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">CSVエクスポート</h1>
          <p className="mt-1 text-sm text-gray-500">
            現在のデータをCSVでダウンロードします。municipalities / organization_offices / official_links は
            CSVインポートの形式と同じなので、そのまま編集して再インポートできます。
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">{error}</div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {EXPORTS.map((item) => (
          <div key={item.key} className="card flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900">{item.title}</p>
              <p className="mt-0.5 text-xs text-gray-400">{item.filename}</p>
            </div>
            <button
              onClick={() => handleExport(item)}
              disabled={loadingKey === item.key}
              className="btn-secondary shrink-0 gap-1.5 px-3 py-1.5 text-xs disabled:opacity-60"
            >
              <FileDown className="h-3.5 w-3.5" />
              {loadingKey === item.key ? '出力中…' : 'ダウンロード'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
