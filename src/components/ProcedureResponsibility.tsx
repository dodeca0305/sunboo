'use client';

import { createContext, useContext, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { RESPONSIBILITY_LABEL, isResponsibility, loadResponsibilities, mergeResponsibilityRefresh, sameResponsibilityRow, saveResponsibility,
  validResponsibilityIntent, type Responsibility, type ResponsibilityIntent, type ResponsibilityRows } from '@/lib/procedureResponsibility';
import { workspaceProcedureOccurrenceKey } from '@/lib/workspaceProcedureStatus';

const event = 'sunboo:responsibility-save';
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback); window.addEventListener(event, callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(event, callback); };
}
const Context = createContext<null | { companyId: number; busy: boolean; rows: ResponsibilityRows | null; blocked: boolean;
  choose: (id: number, date: string, role: Responsibility) => void }>(null);

export function ProcedureResponsibilityProvider({ companyId, rows: initial, statusAvailable, children }: {
  companyId: number; rows: ResponsibilityRows | null; statusAvailable: boolean; children: ReactNode;
}) {
  const [rows, setRows] = useState(initial);
  const [source, setSource] = useState(initial);
  if (source !== initial) { setSource(initial); setRows(current => mergeResponsibilityRefresh(current, initial)); }
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const key = `sunboo:workspace:${companyId}:pending-responsibility`;
  const pending = useSyncExternalStore(subscribe, () => {
    try { return localStorage.getItem(key) ?? ''; } catch { return 'storage-unavailable'; }
  }, () => null);
  let intent: ResponsibilityIntent | null = null;
  let broken = false;
  if (pending) {
    try { const v: unknown = JSON.parse(pending); if (!validResponsibilityIntent(v, companyId)) throw Error('Invalid intent'); intent = v; }
    catch { broken = true; }
  }
  function notify() { window.dispatchEvent(new Event(event)); }
  async function locked(work: () => Promise<void>) {
    if (busyRef.current) return;
    if (!navigator.locks) { setMessage('このブラウザでは安全に保存できません。対応するブラウザで再度開いてください。'); return; }
    busyRef.current = true; setBusy(true); setSuccess(null);
    try {
      await navigator.locks.request(key, { ifAvailable: true }, async lock => {
        if (!lock) { setMessage('別の画面で担当を保存中です。完了後に登録内容を確認してください。'); return; }
        await work();
      });
    } catch { setMessage('担当の保存結果を確認できません。登録内容を確認してください。'); }
    finally { busyRef.current = false; setBusy(false); notify(); }
  }
  function choose(procedureId: number, dueDate: string, role: Responsibility) {
    if (!rows || !statusAvailable || pending !== '' || busy || !isResponsibility(role)) return;
    const selectedKey = workspaceProcedureOccurrenceKey(procedureId, dueDate);
    void locked(async () => {
      if (localStorage.getItem(key)) return;
      const client = createBrowserSupabase();
      const current = client ? await loadResponsibilities(client, companyId) : null;
      if (!current) { setRows(null); setMessage('担当を取得できません。再読み込みしてください。'); return; }
      const previous = rows[selectedKey] ?? null;
      if (!sameResponsibilityRow(previous, current[selectedKey] ?? null)) {
        setRows(current); setMessage('別の画面で登録内容が変わりました。確認してから担当を選び直してください。'); return;
      }
      const next: ResponsibilityIntent = { version: 1, companyId, procedureId, dueDate, role, previous };
      // Persist before the write, so reloads and other tabs cannot blindly resend an uncertain save.
      localStorage.setItem(key, JSON.stringify(next)); notify(); setMessage(null);
      if (!client || !await saveResponsibility(client, next)) {
        setMessage('担当を保存できたか確認できません。再送せず、保存結果を確認してください。'); return;
      }
      const confirmed = await loadResponsibilities(client, companyId);
      if (!confirmed || confirmed[selectedKey]?.responsible_role !== role) {
        setMessage('担当の保存結果を確認できません。保存結果を確認してください。'); return;
      }
      setRows(confirmed); localStorage.removeItem(key); notify(); setSuccess('担当を保存しました');
    });
  }
  function confirm() {
    void locked(async () => {
      const client = createBrowserSupabase();
      const current = client ? await loadResponsibilities(client, companyId) : null;
      if (!current) { setMessage('担当を取得できません。再送せず再確認してください。'); return; }
      setRows(current); localStorage.removeItem(key); notify();
      setMessage(null); setSuccess('現在の担当を確認しました。変更する場合は選び直してください。');
    });
  }
  const blocked = !rows || !statusAvailable || pending !== '' || busy;
  return <Context.Provider value={{ companyId, busy, rows, blocked, choose }}>
    <div id={`responsibility-feedback-${companyId}`} className="mb-4 scroll-mt-24 space-y-2" data-testid="responsibility-feedback">
      {(!rows || !statusAvailable) && <p role="alert" className="text-sm text-red-700">担当または対応状況を取得できません。担当の変更を停止しています。<a className="ml-2 underline" href={`/admin/workspaces/${companyId}/roadmap`}>再読み込み</a></p>}
      {message && <p role="alert" className="text-sm text-red-700">{message}</p>}
      {busy && <p role="status" className="text-sm">担当を確認・保存中…</p>}
      {success && <p role="status" className="text-sm text-sunboo-moss">{success}</p>}
      {(intent || broken) && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
        担当の保存結果が未確認です。
        <button type="button" className="btn-secondary ml-2" disabled={busy} onClick={confirm}>担当の保存結果を確認</button>
      </div>}
    </div>
    {children}
  </Context.Provider>;
}

export function ProcedureResponsibilityField({ procedureId, dueDate, name }: { procedureId: number; dueDate: string; name: string }) {
  const context = useContext(Context);
  if (!context) return null;
  const row = context.rows?.[workspaceProcedureOccurrenceKey(procedureId, dueDate)];
  return <div><select className="form-select min-h-11 w-full text-sm" aria-label={`${name}（${dueDate}）の担当`}
    value={row?.responsible_role ?? ''} disabled={context.blocked}
    onChange={e => { if (isResponsibility(e.target.value)) context.choose(procedureId, dueDate, e.target.value); }}>
    <option value="" disabled>{context.rows ? '誰が進めますか？' : '担当を取得できません'}</option>
    {Object.entries(RESPONSIBILITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
  </select>
    {context.blocked && <p className="mt-1 text-xs text-slate-600">{context.busy ? '担当を確認・保存中…' : '担当を変更する前に登録内容を確認してください。'} <a className="underline" href={`#responsibility-feedback-${context.companyId}`}>確認欄へ</a></p>}
  </div>;
}
