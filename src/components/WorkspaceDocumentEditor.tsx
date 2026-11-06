'use client';
import { useEffect, useRef, useState } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { WORKSPACE_DOCUMENT_STATUSES, WORKSPACE_DOCUMENT_STATUS_LABEL, WORKSPACE_DOCUMENT_TYPE_LABEL, type WorkspaceDocumentStatus, type WorkspaceDocumentType } from '@/lib/workspaceDocumentStatus';
import { EMPTY_DOCUMENT, documentSaveKey, documentValues, readDocument, reconcileDocument, saveDocument, validDocumentIntent, validDocumentValues, type DocumentIntent, type DocumentSnapshot, type DocumentValues } from '@/lib/workspaceDocumentTiming';

const timingLabel = (type: WorkspaceDocumentType) => type === 'articles_of_incorporation' ? '作成・変更日' : type === 'certificate_of_registered_matters' ? '発行日' : '対象期間';
export default function WorkspaceDocumentEditor({companyId, documentType, initial, actorId, disabled, onSafetyBlock, onConfirmed}: {
  companyId: number; documentType: WorkspaceDocumentType; initial: DocumentSnapshot | null; actorId: string | null; disabled: boolean; onSafetyBlock: () => void; onConfirmed: (snapshot: DocumentSnapshot) => void;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [draft, setDraft] = useState<DocumentValues>(documentValues(initial ?? EMPTY_DOCUMENT));
  const [mode, setMode] = useState<'checking' | 'ready' | 'saving' | 'unknown' | 'retry' | 'conflict'>('checking');
  const [message, setMessage] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(true);
  const pending = useRef<DocumentIntent | null>(null);
  const busy = useRef(false);
  const label = WORKSPACE_DOCUMENT_TYPE_LABEL[documentType];
  const period = timingLabel(documentType) === '対象期間';
  const key = actorId ? documentSaveKey(actorId, companyId, documentType) : null;
  const summary = snapshot ? (period ? snapshot.period_start && snapshot.period_end ? `${snapshot.period_start} ～ ${snapshot.period_end}` : '未記録' : snapshot.document_date ?? '未記録') : '未記録';

  async function confirm(intent: DocumentIntent) {
    setMode('checking'); setNoticeIsError(true);
    try {
      const client = createBrowserSupabase();
      if (!client || !key || !actorId) throw new Error('unavailable');
      const identity = await client.auth.getUser();
      if (identity.error || identity.data.user?.id !== actorId) throw new Error('identity');
      const r = await readDocument(client, companyId, documentType);
      if (!r) throw new Error('read');
      const result = reconcileDocument(intent, r.snapshot);
      // Another tab may have replaced the pending record. Never clear its request.
      const raw = localStorage.getItem(key);
      if (raw !== null && JSON.parse(raw).id !== intent.id) throw new Error('pending changed');
      setSnapshot(r.snapshot);
      if (result === 'saved') {
        localStorage.removeItem(key); pending.current = null;
        onConfirmed(r.snapshot!); setDraft(documentValues(r.snapshot!)); setMode('ready'); setNoticeIsError(false); setMessage('保存済みの内容を再取得して確認しました。');
      } else if (result === 'unchanged') {
        setMode('retry'); setMessage('現在の記録は保存前のままです。変更内容は編集せず、同じ内容で再試行できます。自動で再送はしません。');
      } else {
        setMode('conflict'); setMessage('別の更新があります。上書きしていません。最新の内容を確認してから編集し直してください。');
      }
    } catch { setMode('unknown'); setMessage('保存結果を取得できません。再取得して確認するまで、編集・再送を止めています。'); }
  }
  useEffect(() => {
    if (!key || !actorId) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
    if (cancelled) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) {
        const intent: unknown = JSON.parse(raw);
        if (!validDocumentIntent(intent, actorId, companyId, documentType)) throw new Error('invalid pending');
        pending.current = intent;
        // Use a fresh authenticated read, not a cached page snapshot, after reload.
        void confirm(intent);
      } else { if (!cancelled) setMode('ready'); }
    } catch { setMode('unknown'); setMessage('保存確認用の記録を読み取れないため、編集・保存を止めています。ブラウザーの保存設定をご確認ください。'); }
    });
    const changed = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        setMode('unknown'); setMessage('別のタブで操作がありました。再読み込みして保存結果を確認してください。');
      }
    };
    window.addEventListener('storage', changed);
    return () => { cancelled = true; window.removeEventListener('storage', changed); };
    // Identity/document scope remounts this editor; confirmation does not run on every draft edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, actorId, companyId, documentType]);

  async function submit(retry = false) {
    if (busy.current || !key || !actorId || (!retry && (disabled || mode !== 'ready'))) return;
    setNoticeIsError(true);
    if (!retry && !validDocumentValues(draft)) { setMessage('対象期間は開始日・終了日を両方入力し、開始日を終了日以前にしてください。日付もご確認ください。'); return; }
    if (!navigator.locks) { setMode('unknown'); setMessage('安全な保存に必要なブラウザー機能が利用できません。新しいChromeなどで開いてください。'); return; }
    busy.current = true;
    try {
      await navigator.locks.request(key, {ifAvailable: true}, async lock => {
        if (!lock) { setMode('unknown'); setMessage('別のタブで保存中です。再読み込みして結果を確認してください。'); return; }
        const client = createBrowserSupabase();
        if (!client) throw new Error('client');
        const identity = await client.auth.getUser();
        if (identity.error || identity.data.user?.id !== actorId) throw new Error('identity');
        const raw = localStorage.getItem(key);
        if (raw !== null && (!retry || !pending.current || JSON.parse(raw).id !== pending.current.id)) {
          const intent: unknown = JSON.parse(raw);
          if (!validDocumentIntent(intent, actorId, companyId, documentType)) throw new Error('invalid pending');
          pending.current = intent; await confirm(intent); return;
        }
        if (retry && (!pending.current || raw === null)) throw new Error('missing pending');
        const intent: DocumentIntent = retry ? pending.current! : {version: 1, id: crypto.randomUUID(), actorId, companyId, documentType, expected: snapshot, values: documentValues(draft)};
        localStorage.setItem(key, JSON.stringify(intent));
        pending.current = intent;
        setMode('saving'); setMessage('');
        const r = await saveDocument(client, intent);
        if (r.result === 'saved') {
          if (localStorage.getItem(key) !== JSON.stringify(intent)) throw new Error('pending changed');
          localStorage.removeItem(key); pending.current = null;
          setSnapshot(r.snapshot); onConfirmed(r.snapshot); setDraft(documentValues(r.snapshot)); setMode('ready'); setNoticeIsError(false); setMessage('保存しました。');
        } else {
          setMode(r.result === 'conflict' ? 'conflict' : 'unknown'); onSafetyBlock();
          setMessage(r.result === 'conflict' ? '別の更新、または保存権限の変更がありました。上書きせず停止しました。保存結果を再取得してください。' : '保存結果を確認できません。再取得するまで編集・再送を止めています。');
        }
      });
    } catch { setMode('unknown'); onSafetyBlock(); setMessage('通信・保存確認用の記録に問題があるため停止しました。保存結果を再取得してください。'); }
    finally { busy.current = false; }
  }
  const locked = disabled || mode !== 'ready';
  return <li className="card space-y-3 py-4" data-testid={`document-editor-${documentType}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">{label}</h3><span className={snapshot?.status === 'registered' ? 'tag tag--success' : 'tag'}>{WORKSPACE_DOCUMENT_STATUS_LABEL[snapshot?.status ?? 'not_registered']}</span></div>
    <p className="text-sm text-sunboo-ink-muted" data-testid={`document-timing-${documentType}`}>{timingLabel(documentType)}：{summary}</p>
    <details className="rounded-lg border border-sunboo-mist p-3"><summary className="cursor-pointer text-sm font-semibold">状態・{timingLabel(documentType)}を編集する</summary>
      <form className="mt-3 space-y-3" onSubmit={event => {event.preventDefault(); void submit();}}>
        <label className="block text-sm">登録状況<select className="form-select mt-1" aria-label={`${label}の登録状況`} value={draft.status} disabled={locked} onChange={event => setDraft({...draft, status:event.target.value as WorkspaceDocumentStatus})}>{WORKSPACE_DOCUMENT_STATUSES.map(s => <option key={s} value={s}>{WORKSPACE_DOCUMENT_STATUS_LABEL[s]}</option>)}</select></label>
        <p className="text-xs leading-relaxed text-sunboo-ink-muted">{period ? '書類に書かれた対象期間を入力してください。提出日・登録日ではありません。開始日と終了日は両方入力するか、両方空欄にしてください。' : documentType === 'certificate_of_registered_matters' ? '登記簿謄本に書かれた発行日を入力してください。取得した日や登録日ではありません。' : '手元の定款に書かれた作成日、変更している場合は変更日を入力してください。'} 不明なら空欄のまま保存できます。</p>
        {period ? <div className="grid gap-3 sm:grid-cols-2">{(['period_start','period_end'] as const).map((field,index) => <label className="block text-sm" key={field}>{index === 0 ? '対象期間の開始日' : '対象期間の終了日'}<input className="form-input mt-1" type="date" aria-label={`${label}の${index === 0 ? '対象期間の開始日' : '対象期間の終了日'}`} disabled={locked} value={draft[field] ?? ''} onChange={event => setDraft({...draft,[field]:event.target.value || null})}/></label>)}</div> : <label className="block text-sm">{timingLabel(documentType)}<input className="form-input mt-1" type="date" aria-label={`${label}の${timingLabel(documentType)}`} disabled={locked} value={draft.document_date ?? ''} onChange={event => setDraft({...draft,document_date:event.target.value || null})}/></label>}
        <p className="text-xs text-sunboo-ink-muted">この種類の現在の書類を1件記録します。過年度・複数版の履歴や、提出済みの証明にはなりません。</p>
        <button type="submit" className="btn-primary text-sm" disabled={locked}>{mode === 'saving' ? '保存中…' : `${label}を保存する`}</button>
      </form>
    </details>
    {disabled && mode === 'ready' && <a className="block text-sm underline" href={`/admin/workspaces/${companyId}/documents`}>再読み込みして編集を再開する</a>}
    {message && <p role={noticeIsError ? 'alert' : 'status'} className="text-sm leading-relaxed">{message}</p>}
    {(mode === 'unknown' || mode === 'conflict') && <div className="flex flex-wrap gap-3 text-sm"><button className="underline" type="button" onClick={() => {if (pending.current) void confirm(pending.current); else window.location.reload();}}>保存結果を再取得する</button><a className="underline" href={`/admin/workspaces/${companyId}/documents`}>再読み込み</a></div>}
    {mode === 'retry' && <button className="btn-secondary text-sm" type="button" onClick={() => void submit(true)}>確認した同じ内容で再試行する</button>}
    {mode === 'conflict' && snapshot && <button className="underline text-sm" type="button" onClick={() => {try {if (key && pending.current && localStorage.getItem(key) === JSON.stringify(pending.current)) localStorage.removeItem(key); window.location.reload();} catch {setMessage('確認記録を更新できません。編集を停止しています。');}}}>送信予定を取り消し、最新の記録を開く</button>}
  </li>;
}
