'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileUp, CheckCircle2, AlertTriangle, Download } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { importMunicipalities, importJurisdictionOffices, importOfficialLinks, type ImportSummary } from '@/lib/adminCsv';

type CsvKind = 'municipalities' | 'jurisdiction_offices' | 'official_links';

const PANELS: { kind: CsvKind; title: string; description: string; templateFile: string; columns: string[] }[] = [
  {
    kind: 'municipalities',
    title: '① 都道府県・市区町村',
    description: '新しく対応するエリアの都道府県・市区町村を登録します。',
    templateFile: 'municipalities.csv',
    columns: ['pref_code', 'pref_name', 'muni_code', 'muni_name'],
  },
  {
    kind: 'jurisdiction_offices',
    title: '② 管轄機関の基本情報',
    description: '税務署・年金事務所などの名称・住所・電話番号を登録します。①を先に取り込んでください。',
    templateFile: 'jurisdiction_offices.csv',
    columns: ['muni_code', 'office_type', 'name', 'address', 'phone', 'website_url', 'map_url'],
  },
  {
    kind: 'official_links',
    title: '③ 公式リンクの生存状況',
    description: '管轄機関の公式URL・リンク状態・フォールバックURLを更新します。②を先に取り込んでください。',
    templateFile: 'official_links.csv',
    columns: ['muni_code', 'office_type', 'official_url', 'official_url_status', 'fallback_url'],
  },
];

function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err: Error) => reject(err),
    });
  });
}

function ImportPanel({ panel }: { panel: (typeof PANELS)[number] }) {
  const [rows, setRows] = useState<Record<string, string>[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSummary(null);
    setParseError(null);
    setFileName(file.name);
    try {
      const parsed = await parseCsvFile(file);
      setRows(parsed);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'CSVの読み込みに失敗しました');
      setRows(null);
    }
  }

  async function handleImport() {
    if (!rows) return;
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setParseError('Supabase が設定されていません。');
      return;
    }

    setImporting(true);
    let result: ImportSummary;
    switch (panel.kind) {
      case 'municipalities':
        result = await importMunicipalities(supabase, rows as never);
        break;
      case 'jurisdiction_offices':
        result = await importJurisdictionOffices(supabase, rows as never);
        break;
      case 'official_links':
        result = await importOfficialLinks(supabase, rows as never);
        break;
    }
    setImporting(false);
    setSummary(result);
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-900">{panel.title}</h2>
          <p className="mt-1 text-xs text-gray-500">{panel.description}</p>
        </div>
        <a
          href={`/import_templates/${panel.templateFile}`}
          download
          className="btn-secondary shrink-0 gap-1.5 px-3 py-1.5 text-xs"
        >
          <Download className="h-3.5 w-3.5" />
          テンプレート
        </a>
      </div>

      <p className="text-xs text-gray-400">必須カラム: {panel.columns.join(', ')}</p>

      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
        <FileUp className="h-4 w-4" />
        {fileName || 'CSVファイルを選択'}
        <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      </label>

      {parseError && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {parseError}
        </div>
      )}

      {rows && !summary && (
        <div className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5 text-xs text-gray-600">
          <span>{rows.length}行を読み込みました</span>
          <button onClick={handleImport} disabled={importing} className="btn-primary px-3 py-1.5 text-xs disabled:opacity-60">
            {importing ? 'インポート中…' : 'インポート実行'}
          </button>
        </div>
      )}

      {summary && (
        <div className="space-y-2 rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs">
          <div className="flex items-center gap-2 font-medium text-gray-700">
            {summary.failed === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            )}
            {summary.succeeded} / {summary.total} 件を反映しました
          </div>
          {summary.errors.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-red-600">
              {summary.errors.slice(0, 10).map((e, i) => (
                <li key={i}>{e}</li>
              ))}
              {summary.errors.length > 10 && <li>他 {summary.errors.length - 10} 件のエラー</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminImportPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          <Upload className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">CSVインポート</h1>
          <p className="mt-1 text-sm text-gray-500">①→②→③ の順に取り込んでください。何度実行しても安全です（冪等）。</p>
        </div>
      </div>

      <div className="space-y-5">
        {PANELS.map((panel) => (
          <ImportPanel key={panel.kind} panel={panel} />
        ))}
      </div>
    </div>
  );
}
