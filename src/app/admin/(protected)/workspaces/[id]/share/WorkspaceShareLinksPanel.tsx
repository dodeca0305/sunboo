'use client';

import { useState } from 'react';
import { Link2, Copy, Check, Ban, AlertTriangle } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';

export type ShareLinkRow = {
  id: number;
  token: string;
  shared_sections: string[];
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

// 本Sprintでは共有対象を固定にする（項目単位のトグルUIは次Sprint以降、
// docs/COMPANY_WORKSPACE.md 5-11節「Share Settings」参照）。
const SHARED_SECTIONS = ['company', 'profile', 'roadmap'];

function shareUrl(token: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/share/${token}`;
}

export default function WorkspaceShareLinksPanel({
  companyId,
  initialLinks,
}: {
  companyId: number;
  initialLinks: ShareLinkRow[];
}) {
  const [links, setLinks] = useState<ShareLinkRow[]>(initialLinks);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  async function handleCreate() {
    setError(null);
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setCreating(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) {
      setCreating(false);
      setError('ログイン情報を確認できませんでした。再度ログインしてください。');
      return;
    }

    const { data, error: insertError } = await supabase
      .from('workspace_share_links')
      .insert({ company_id: companyId, shared_sections: SHARED_SECTIONS, created_by: user.email })
      .select('id, token, shared_sections, expires_at, revoked_at, last_accessed_at, created_at')
      .single();

    setCreating(false);
    if (insertError || !data) {
      setError(`発行に失敗しました: ${insertError?.message ?? '不明なエラー'}`);
      return;
    }
    setLinks((prev) => [data as ShareLinkRow, ...prev]);
  }

  async function handleRevoke(linkId: number) {
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const revokedAt = new Date().toISOString();
    const { error: updateError } = await supabase
      .from('workspace_share_links')
      .update({ revoked_at: revokedAt })
      .eq('id', linkId);
    if (updateError) {
      setError(`失効に失敗しました: ${updateError.message}`);
      return;
    }
    setLinks((prev) => prev.map((l) => (l.id === linkId ? { ...l, revoked_at: revokedAt } : l)));
  }

  async function handleCopy(link: ShareLinkRow) {
    try {
      await navigator.clipboard.writeText(shareUrl(link.token));
      setCopiedId(link.id);
      setTimeout(() => setCopiedId((id) => (id === link.id ? null : id)), 2000);
    } catch {
      setError('コピーに失敗しました。URLを手動で選択してコピーしてください。');
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </div>
      )}

      <button type="button" onClick={handleCreate} disabled={creating} className="btn-primary disabled:opacity-60">
        <Link2 className="h-4 w-4" />
        {creating ? '発行中…' : '新しい共有リンクを発行'}
      </button>

      {links.length === 0 ? (
        <div className="card text-sm text-gray-500">まだ共有リンクがありません。</div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const revoked = Boolean(link.revoked_at);
            return (
              <div key={link.id} className="card space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`tag ${revoked ? 'border-gray-200 text-gray-400' : 'border-blue-200 text-blue-600'}`}>
                    {revoked ? '失効済み' : '有効'}
                  </span>
                  <span className="text-xs text-gray-400">発行日: {new Date(link.created_at).toLocaleDateString('ja-JP')}</span>
                  {link.last_accessed_at && (
                    <span className="text-xs text-gray-400">
                      最終アクセス: {new Date(link.last_accessed_at).toLocaleDateString('ja-JP')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl(link.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="form-input flex-1 text-xs text-gray-600"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(link)}
                    disabled={revoked}
                    className="btn-secondary shrink-0 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === link.id ? 'コピー済み' : 'コピー'}
                  </button>
                  {!revoked && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(link.id)}
                      className="btn-secondary shrink-0 px-3 py-1.5 text-xs text-red-600 hover:border-red-200 hover:bg-red-50"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      失効させる
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
