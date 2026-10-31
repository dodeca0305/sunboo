'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2, Copy, Check, Ban } from 'lucide-react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import InformationCard from '@/components/InformationCard';
import { trackEvent } from '@/lib/analytics';
import { DEFAULT_SHARE_LINK_EXPIRY, getShareLinkExpiresAt, getShareLinkStatus, type ShareLinkExpiry } from '@/lib/shareLinkExpiry';
import { issueWorkspaceShareLink, parseShareLinkRequest, pendingShareLinkKey, type ShareLinkRow, type ShareLinkRequest } from '@/lib/workspaceShareLinks';
export type { ShareLinkRow } from '@/lib/workspaceShareLinks';

function shareUrl(token: string): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/share/${token}`;
}

export default function WorkspaceShareLinksPanel({
  companyId,
  initialLinks,
}: {
  companyId: number;
  initialLinks: ShareLinkRow[] | null;
}) {
  const [links, setLinks] = useState<ShareLinkRow[]>(initialLinks ?? []);
  const listLoaded = initialLinks !== null;
  const [storageReady, setStorageReady] = useState(false);
  const [pending, setPending] = useState<ShareLinkRequest | null>(null);
  const pendingRef = useRef<ShareLinkRequest | null>(null);
  const busyRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const [expiry, setExpiry] = useState<ShareLinkExpiry>(DEFAULT_SHARE_LINK_EXPIRY);
  const [now, setNow] = useState(() => Date.now());

  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  // SSRではsessionStorageを読めないため、発行を無効にしたままhydration後に復元する。
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const key = pendingShareLinkKey(companyId);
      let request = parseShareLinkRequest(window.sessionStorage.getItem(key), companyId);
      if (listLoaded && request && initialLinks.some((link) => link.token === request?.token)) {
        window.sessionStorage.removeItem(key);
        request = null;
      }
      pendingRef.current = request;
      setPending(request);
      setStorageReady(true);
    } catch {
      setError('前回の発行情報をブラウザで確認できないため、発行を停止しています。ブラウザの保存設定を確認して再読み込みしてください。');
    }
  }, [companyId, initialLinks, listLoaded]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function handleCreate() {
    if (!listLoaded || !storageReady || busyRef.current) return;
    busyRef.current = true;
    setCreating(true);
    setError(null);
    try {
      const supabase = createBrowserSupabase();
      if (!supabase) {
        setError('Supabase が設定されていません。');
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError('ログイン情報を確認できませんでした。再度ログインしてください。');
        return;
      }
      let request = pendingRef.current;
      if (request && request.created_by !== user.email) {
        setError('前回発行したアカウントでログインし直して、発行状況を確認してください。');
        return;
      }
      if (!request) {
        const bytes = window.crypto.getRandomValues(new Uint8Array(32));
        request = {
          company_id: companyId,
          token: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
          created_by: user.email,
          expires_at: getShareLinkExpiresAt(expiry),
        };
        // INSERTより前に永続化する。応答喪失や再読み込み後も同じ要求で照会・再試行する。
        window.sessionStorage.setItem(pendingShareLinkKey(companyId), JSON.stringify(request));
        pendingRef.current = request;
        setPending(request);
      }
      const link = await issueWorkspaceShareLink(supabase, request);
      if (!link) {
        setError('発行結果を確認できませんでした。新しいリンクの発行を停止しています。「発行状況を確認・再試行」から同じ発行の結果を確認してください。');
        return;
      }
      setLinks((prev) => [link, ...prev.filter((item) => item.id !== link.id)]);
      window.sessionStorage.removeItem(pendingShareLinkKey(companyId));
      pendingRef.current = null;
      setPending(null);
      trackEvent('share_created', { workspace_id: companyId, company_id: companyId });
    } catch {
      setStorageReady(false);
      setError('通信またはブラウザの保存処理を確認できませんでした。再読み込み後、前回の発行が残っている場合は同じ発行の確認・再試行を行ってください。');
    } finally {
      busyRef.current = false;
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
      {!listLoaded && (
        <InformationCard kind="error" title="共有リンク一覧を読み込めませんでした">
          <p role="alert">発行済みリンクを確認できないため、新しい共有リンクの発行を停止しています。再読み込みしてください。</p>
        </InformationCard>
      )}
      {error && <InformationCard kind="error"><p role="alert">{error}</p></InformationCard>}
      {pending && (
        <InformationCard kind="caution">前回の発行結果の確認が必要です。新しく発行せず、同じ発行の確認・再試行を行います。</InformationCard>
      )}
      {(!listLoaded || pending || error) && (
        <a href={`/admin/workspaces/${companyId}/share`} className="btn-secondary">再読み込み</a>
      )}

      <div className="flex flex-wrap items-end gap-3">
        {pending ? <p className="text-sm text-sunboo-ink-muted">前回の発行条件・有効期限を維持して確認します。</p> : <div>
          <label htmlFor="share-link-expiry" className="form-label">有効期限</label>
          <select
            id="share-link-expiry"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value as ShareLinkExpiry)}
            disabled={creating || !listLoaded || !storageReady || Boolean(pending)}
            className="form-select"
          >
            <option value="7">7日</option>
            <option value="30">30日</option>
            <option value="unlimited">無期限</option>
          </select>
        </div>}
        <button type="button" onClick={handleCreate} disabled={creating || !listLoaded || !storageReady} className="btn-primary disabled:opacity-60">
          <Link2 className="h-4 w-4" />
          {creating ? '発行状況を確認中…' : pending ? '発行状況を確認・再試行' : '新しい共有リンクを発行'}
        </button>
      </div>
      <p className="text-xs text-sunboo-ink-muted">発行時から選択した期間だけ有効です。無期限の場合も、手動で失効させられます。</p>

      {listLoaded && storageReady && !pending && links.length === 0 ? (
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
