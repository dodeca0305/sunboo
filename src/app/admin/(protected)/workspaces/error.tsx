'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, ChevronLeft } from 'lucide-react';

// ── Company Workspace — エラー境界（Sprint 43 Beta Reliability Polish）───────────
// /admin/workspaces配下（顧問先一覧・会社別Workspaceの全ページ）で捕捉されなかった例外を
// まとめて受け止める。error.tsxはNext.js App Routerの規約上Client Componentである必要がある
// （'use client'必須）。画面には機密情報・スタックトレースを一切出さず、簡潔な文言・再試行・
// 一覧への導線のみを表示する。詳細はconsole.errorで開発・調査用に残すのみに限定する。

export default function WorkspacesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 開発・調査用のログ出力。画面上にはこの内容を表示しない。
    console.error('[admin/workspaces]', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-4 py-24 text-center">
      <AlertTriangle className="mb-3 h-8 w-8 text-gray-300" />
      <p className="font-semibold text-gray-700">エラーが発生しました</p>
      <p className="mt-1 text-sm text-gray-500">
        時間をおいて再度お試しください。解消しない場合は運営までお問い合わせください。
      </p>
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => reset()} className="btn-primary">
          <RotateCcw className="h-4 w-4" />
          再試行
        </button>
        <Link href="/admin/workspaces" className="btn-secondary">
          <ChevronLeft className="h-4 w-4" />
          顧問先一覧へ戻る
        </Link>
      </div>
    </div>
  );
}
