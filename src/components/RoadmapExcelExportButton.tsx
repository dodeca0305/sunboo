'use client';

import { useState } from 'react';
import { FileSpreadsheet, AlertTriangle } from 'lucide-react';
import type { RoadmapYear } from '@/lib/roadmap';
import type { WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import { buildRoadmapExportRows } from '@/lib/roadmapExport';

// ── Workspace Roadmap — Excel出力ボタン（Sprint 51）─────────────────────
// 管理画面（/admin/workspaces/[id]/roadmap）専用。共有ページ（/share/[token]）には配置しない。
//
// 【設計方針】親のServer Component（roadmap/page.tsx）が既に取得・計算済みのroadmapYears・
// statusMapをpropsでそのまま受け取るだけで、新しいSupabase問い合わせは一切行わない
// （docs/ROADMAP_SUBMISSION_OFFICE_LINKS_DESIGN.md・Sprint51の設計判断）。これにより
// 「Workspaceを閲覧できるユーザーのみ出力可能」「他社Workspaceのデータを出力できない」
// 「anonキーだけで管理用Excelを生成できる経路を作らない」という要件を、新しい権限チェックを
// 書くことなく構造的に満たす（このボタンは表示済みのページ内データを整形するだけ）。
//
// Excel生成本体（exceljs、ブラウザ専用ビルド）は動的importで遅延読み込みし、
// ページの初期表示バンドルサイズに影響させない。

export default function RoadmapExcelExportButton({
  roadmapYears,
  statusMap,
  companyName,
}: {
  roadmapYears: RoadmapYear[];
  statusMap: WorkspaceProcedureStatusMap;
  companyName: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport() {
    if (downloading) return; // 二重クリック防止
    setDownloading(true);
    setError(null);
    try {
      const [{ buildRoadmapExcelBuffer, buildRoadmapExcelFilename }] = await Promise.all([
        import('@/lib/roadmapExcelWorkbook'),
      ]);
      const createdAt = new Date();
      const rows = buildRoadmapExportRows(roadmapYears, statusMap);
      const buffer = await buildRoadmapExcelBuffer(rows, companyName, createdAt);
      const filename = buildRoadmapExcelFilename(companyName, createdAt);

      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Excelの出力に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleExport}
        disabled={downloading}
        className="btn-secondary shrink-0 gap-1.5 px-3 py-1.5 text-xs disabled:opacity-60"
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        {downloading ? '出力中…' : 'Excelで出力'}
      </button>
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-600">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
