'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

// ── Company Workspace — 会社削除（Sprint 43 Beta Reliability Polish）───────────
// ownerのみが呼び出し元（page.tsx）から表示される想定（member/viewerには渡さない）。
// RLS側（migration_workspace_access_control.sql）もowner以外のDELETEを拒否するため、
// 万一UI側の判定をすり抜けても二重に守られる。workspace_companiesの削除だけを行えば、
// workspace_company_profiles・workspace_members・workspace_share_links・
// workspace_procedure_statuses・workspace_documents・workspace_tax_return_profilesは
// 既存のON DELETE CASCADEで連鎖削除される（新しい削除ロジック・migrationは追加しない）。

export default function WorkspaceDeleteButton({
  companyId,
  companyName,
}: {
  companyId: number;
  companyName: string;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!window.confirm(`「${companyName}」を削除します。この操作は取り消せません。よろしいですか？`)) return;

    setError(null);
    setDeleting(true);

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setDeleting(false);
      setError('Supabase が設定されていません。');
      return;
    }

    const { error: deleteError } = await supabase.from('workspace_companies').delete().eq('id', companyId);

    if (deleteError) {
      setDeleting(false);
      setError(`削除に失敗しました: ${deleteError.message}`);
      return;
    }

    router.push('/admin/workspaces');
    router.refresh();
  }

  return (
    <div className="card space-y-2.5 border-red-100">
      <div className="flex items-center gap-2 text-xs font-semibold text-red-600">
        <AlertTriangle className="h-3.5 w-3.5" />
        危険な操作
      </div>
      {error && (
        <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}
      <p className="text-xs leading-relaxed text-gray-500">
        「{companyName}」を削除すると、会社プロフィール・決算実績・年間ロードマップの状態・書類・
        共有リンクなど、この会社に紐づくすべてのデータが完全に削除されます。この操作は取り消せません。
      </p>
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="btn-secondary border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" />
        {deleting ? '削除中…' : `「${companyName}」を削除する`}
      </button>
    </div>
  );
}
