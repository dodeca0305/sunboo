'use client';

import { useState } from 'react';
import { FileText, AlertTriangle } from 'lucide-react';
import type { RoadmapYear } from '@/lib/roadmap';
import type { WorkspaceProcedureStatusMap } from '@/lib/workspaceProcedureStatus';
import { buildRoadmapExportRows } from '@/lib/roadmapExport';

// ── Workspace Roadmap — PDF出力ボタン（Sprint 52）───────────────────────
// 設計はRoadmapExcelExportButton（Sprint51）と同じ。管理画面（/admin/workspaces/[id]/roadmap）
// 専用、共有ページ（/share/[token]）には配置しない。
//
// 親のServer Component（roadmap/page.tsx）が既に取得・計算済みのroadmapYears・statusMapを
// propsでそのまま受け取るだけで、新しいSupabase問い合わせは一切行わない
// （「Workspaceを閲覧できるユーザーのみ出力可能」「他社Workspaceのデータを出力できない」
// 「anonキーだけで管理用PDFを生成できる経路を作らない」を、新しい権限チェックを書くことなく
// 構造的に満たす）。行データはbuildRoadmapExportRows（Sprint51、Excel出力と共通）をそのまま使うため、
// PDFとExcelで期限・提出先・ステータス等の内容が食い違うことはない。
//
// PDF生成本体（pdfmake、ブラウザ専用ビルド＋日本語フォント）は動的importで遅延読み込みし、
// ページの初期表示バンドルサイズに影響させない。税務・会社情報は外部サービスへ送信せず、
// ブラウザ内で完結する。

export default function RoadmapPdfExportButton({
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
      const { buildRoadmapPdfBlob, buildRoadmapPdfFilename } = await import('@/lib/roadmapPdfDocument');
      const createdAt = new Date();
      const rows = buildRoadmapExportRows(roadmapYears, statusMap);
      const blob = await buildRoadmapPdfBlob(rows, companyName, createdAt);
      const filename = buildRoadmapPdfFilename(companyName, createdAt);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('PDFの出力に失敗しました。時間をおいて再度お試しください。');
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
        <FileText className="h-3.5 w-3.5" />
        {downloading ? '出力中…' : 'PDFで出力'}
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
