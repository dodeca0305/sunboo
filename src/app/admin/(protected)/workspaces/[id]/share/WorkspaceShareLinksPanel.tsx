'use client';

import { useEffect, useState } from 'react';
import { Link2, Copy, Check, Ban } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import InformationCard from '@/components/InformationCard';
import { trackEvent } from '@/lib/analytics';
import { DEFAULT_SHARE_LINK_EXPIRY, getShareLinkExpiresAt, getShareLinkStatus, type ShareLinkExpiry } from '@/lib/shareLinkExpiry';

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
  const [expiry, setExpiry] = useState<ShareLinkExpiry>(DEFAULT_SHARE_LINK_EXPIRY);
  const [now, setNow] = useState(() => Date.now());

  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleCreate() {
    setError(null);
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError('Supabase が設定されていません。');
      return;
    }

    setCreating(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.email) {
        setError('ログイン情報を確認できませんでした。再度ログインしてください。');
        return;
      }

      const { data, error: insertError } = await supabase
        .from('workspace_share_links')
        .insert({
          company_id: companyId,
          shared_sections: SHARED_SECTIONS,
          created_by: user.email,
          expires_at: getShareLinkExpiresAt(expiry),
        })
        .select('id, token, shared_sections, expires_at, revoked_at, last_accessed_at, created_at')
        .single();

      if (insertError || !data) {
        setError(`発行に失敗しました: ${insertError?.message ?? '不明なエラー'}`);
        return;
      }
      setLinks((prev) => [data as ShareLinkRow, ...prev]);
      trackEvent('share_created', { workspace_id: companyId, company_id: companyId });
    } catch {
      setError('発行に失敗しました。通信状況を確認して再度お試しください。');
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(linkId: number) {
    if (!window.confirm('この共有リンクを失効させます。経営者はこのリンクを使えなくなります。よろしいですか？')) return;
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
      {error && <InformationCard kind="error">{error}</InformationCard>}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="share-link-expiry" className="form-label">有効期限</label>
          <select
            id="share-link-expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value as ShareLinkExpiry)}
            disabled={creating}
            className="form-select"
          >
            <option value="7">7日</option>
            <option value="30">30日</option>
            <option value="unlimited">無期限</option>
          </select>
        </div>
        <button type="button" onClick={handleCreate} disabled={creating} className="btn-primary disabled:opacity-60">
          <Link2 className="h-4 w-4" />
          {creating ? '発行中…' : '新しい共有リンクを発行'}
        </button>
      </div>
      <p className="text-xs text-sunboo-ink-muted">発行時から選択した期間だけ有効です。無期限の場合も、手動で失効させられます。</p>

      {links.length === 0 ? (
        <div className="card text-sm text-sunboo-ink-muted">
          まだ共有リンクがありません。発行すると、経営者へそのまま渡せる年間ロードマップのURLができます。
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => {
            const status = getShareLinkStatus(link, now);
            const inactive = status !== '有効';
            return (
              <div key={link.id} className="card space-y-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tag">{status}</span>
                  <span className="text-xs text-sunboo-ink-muted">発行日: {new Date(link.created_at).toLocaleDateString('ja-JP')}</span>
                  <span className="text-xs text-sunboo-ink-muted">
                    有効期限: {link.expires_at ? new Date(link.expires_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) + '（日本時間）' : '無期限'}
                  </span>
                  {link.last_accessed_at && (
                    <span className="text-xs text-sunboo-ink-muted">
                      最終アクセス: {new Date(link.last_accessed_at).toLocaleDateString('ja-JP')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={shareUrl(link.token)}
                    onFocus={(e) => e.currentTarget.select()}
                    className="form-input flex-1 text-xs text-sunboo-ink-muted"
                  />
                  <button
                    type="button"
                    onClick={() => handleCopy(link)}
                    disabled={inactive}
                    className="btn-secondary shrink-0 px-3 py-1.5 text-xs disabled:opacity-50"
                  >
                    {copiedId === link.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedId === link.id ? 'コピー済み' : 'コピー'}
                  </button>
                  {!inactive && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(link.id)}
                      className="btn-secondary shrink-0 px-3 py-1.5 text-xs text-sunboo-danger hover:border-sunboo-danger"
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
