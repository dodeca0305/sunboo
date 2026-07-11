import { Loader2 } from 'lucide-react';

// ── Company Workspace — 読み込み中表示（Sprint 43 Beta Reliability Polish）─────
// 各Workspaceページのloading.tsxから共通で使う。Server Componentのデータ取得中に
// 画面が固まったように見えないようにするための最小限の表示（Skeletonは作らない）。

export default function WorkspaceLoadingState() {
  return (
    <div className="flex items-center justify-center gap-2 py-24 text-sm text-gray-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      読み込み中…
    </div>
  );
}
