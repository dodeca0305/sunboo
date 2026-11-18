'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import FormattedIntegerInput from '@/components/FormattedIntegerInput';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import {
  FORECAST_FIELD_LABEL, FORECAST_MAX, calculateForecast, emptyForecastValues, forecastKeyId, forecastValues, formatYen, validForecastKey, validForecastPeriod,
  validForecastValues, validScenarioName, type ForecastKey, type ForecastMoneyKey, type ForecastSnapshot, type ForecastValues,
} from '@/lib/financialForecast';
import {
  forecastIntentOwned, forecastSaveKey, forecastSavePrefix, readForecast, releaseForecastIntent, reconcileForecast, saveForecast, validForecastIntent, type ForecastIntent,
} from '@/lib/workspaceFinancialForecast';

type Mode = 'checking' | 'ready' | 'saving' | 'blocked';
type Status = 'checking' | 'unchanged' | 'conflict' | 'unknown';
const NEW = '__new__';
const BASIC: ForecastMoneyKey[] = ['sales', 'cogs', 'opex', 'tax_expense'];
const EXTRA: ForecastMoneyKey[] = ['other_income', 'other_expense', 'special_gain', 'special_loss'];
const CASH: ForecastMoneyKey[] = ['opening_cash', 'opening_retained_earnings', 'capital', 'borrowing', 'collections', 'cogs_paid', 'opex_paid', 'tax_paid', 'equipment'];
const RETAINED: ForecastMoneyKey = 'opening_retained_earnings';

// マイナス可の入力は文字と値を同じ更新で保つ（Enter送信でも見えている値が使われる）。途中の「-」や不正な文字は送信を止める。
function parseSigned(raw: string): { ok: true; value: number | null } | { ok: false } {
  const t = raw.normalize('NFKC').replace(/[−ー‐]/g, '-').replace(/[,\s]/g, '');
  if (t === '') return { ok: true, value: null };
  if (!/^-?\d+$/.test(t)) return { ok: false };
  const n = Number(t);
  return Number.isSafeInteger(n) && Math.abs(n) <= FORECAST_MAX ? { ok: true, value: n === 0 ? 0 : n } : { ok: false };
}
type Draft = { key: ForecastKey; values: ForecastValues };
const draftOf = (s: ForecastSnapshot | null, def: { start: string; end: string } | null): Draft =>
  s ? { key: { fiscal_start: s.fiscal_start, fiscal_end: s.fiscal_end, scenario_name: s.scenario_name }, values: forecastValues(s) }
    : { key: { fiscal_start: def?.start ?? '', fiscal_end: def?.end ?? '', scenario_name: '標準' }, values: emptyForecastValues() };
const retainedText = (d: Draft) => (d.values[RETAINED] === null ? '' : String(d.values[RETAINED]));
const upsert = (list: ForecastSnapshot[], s: ForecastSnapshot) => [s, ...list.filter(p => forecastKeyId(p) !== forecastKeyId(s))];
const intentLabel = (i: ForecastIntent) => `${i.key.fiscal_start}〜${i.key.fiscal_end}／${i.key.scenario_name}`;

export default function WorkspaceFinancialForecastView({ companyId, companyName, initial, proposed }: {
  companyId: number; companyName: string; initial: ForecastSnapshot[]; proposed: { start: string; end: string } | null;
}) {
  const [snapshots, setSnapshots] = useState(initial);
  const latest = initial[0] ?? null;
  // 編集中の入力が読み込まれた時点の保存内容（楽観的ロックの基準）。別の版を黙って付け替えない。
  const [baseline, setBaseline] = useState<ForecastSnapshot | null>(latest);
  const [draft, setDraft] = useState<Draft>(() => draftOf(latest, proposed));
  const [reText, setReText] = useState(() => retainedText(draftOf(latest, proposed)));
  const [reInvalid, setReInvalid] = useState(false);
  const [actorId, setActorId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('checking');
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(true);
  const [pendings, setPendings] = useState<ForecastIntent[]>([]);
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [invalidKeys, setInvalidKeys] = useState<string[]>([]);
  const busy = useRef(false);
  const selected = baseline ? forecastKeyId(baseline) : NEW;
  const locked = mode !== 'ready' || pendings.length > 0 || invalidKeys.length > 0;
  const calc = useMemo(() => calculateForecast(draft.values), [draft.values]);
  const dirty = baseline ? JSON.stringify(forecastValues(baseline)) !== JSON.stringify(draft.values) : true;

  function show(next: Mode, text: string, error = true) { setMode(next); setMessage(text); setIsError(error); }
  function load(s: ForecastSnapshot | null) {
    const d = draftOf(s, proposed);
    setBaseline(s); setDraft(d); setReText(retainedText(d)); setReInvalid(false);
  }
  const setStatus = (i: ForecastIntent, s: Status) => setStatuses(prev => ({ ...prev, [i.id]: s }));
  // 確認記録を解放できた場合だけ画面の保留も外す。別の依頼に置き換わった・消せない場合は保留を残して止める。
  function dropIntent(actor: string, i: ForecastIntent): boolean {
    if (releaseForecastIntent(localStorage, actor, companyId, i) !== 'released') {
      setStatus(i, 'unknown'); show('blocked', '確認記録を安全に更新できません（別のタブの操作の可能性があります）。編集を止めたままにします。再読み込みして確認してください。');
      return false;
    }
    setPendings(prev => prev.filter(p => p.id !== i.id));
    return true;
  }
  async function cancelIntent(actor: string, i: ForecastIntent) {
    try {
      const client = createBrowserSupabase();
      if (!client) throw new Error('client');
      const who = await client.auth.getUser();
      if (who.error || who.data.user?.id !== actor) throw new Error('identity');
      const r = await readForecast(client, companyId, i.key);
      if (!r) throw new Error('read');
      if (!dropIntent(actor, i)) return;
      if (r.snapshot) setSnapshots(prev => upsert(prev, r.snapshot!));
      load(r.snapshot); // 取り消し後は最新の保存内容を開く。古い入力に新しい版を付けない。
      if (pendings.length <= 1 && invalidKeys.length === 0) show('ready', '送信予定を取り消し、最新の保存内容を開きました。必要なら入力し直してください。', false);
    } catch { setStatus(i, 'unknown'); show('blocked', '最新の記録を取得できないため、取り消しできません。'); }
  }
  // 読み取り専用の確認。保存済みなら記録を消すだけで、再送・上書きはしない。
  async function check(actor: string, i: ForecastIntent, client = createBrowserSupabase()) {
    setStatus(i, 'checking');
    try {
      if (!client) throw new Error('client');
      const who = await client.auth.getUser();
      if (who.error || who.data.user?.id !== actor) throw new Error('identity');
      const r = await readForecast(client, companyId, i.key);
      if (!r) throw new Error('read');
      if (!forecastIntentOwned(localStorage, actor, companyId, i)) throw new Error('pending changed');
      const result = reconcileForecast(i, r.snapshot);
      if (r.snapshot) setSnapshots(prev => upsert(prev, r.snapshot!));
      if (result === 'saved' && r.snapshot) {
        if (!dropIntent(actor, i)) return;
        load(r.snapshot);
        setMode('ready'); setMessage('保存済みの内容を再取得して確認しました（二重保存・自動再送はしていません）。'); setIsError(false);
      } else setStatus(i, result === 'saved' ? 'unknown' : result);
    } catch { setStatus(i, 'unknown'); }
  }

  useEffect(() => {
    let cancelled = false;
    const client = createBrowserSupabase();
    const fail = () => { if (!cancelled) show('blocked', 'ログイン状態を確認できないため、編集を止めています。再読み込みしてください。'); };
    if (!client) { fail(); return; }
    void client.auth.getUser().then(({ data, error }) => {
      if (cancelled) return;
      if (error || !data.user) { fail(); return; }
      const actor = data.user.id; setActorId(actor);
      try {
        const prefix = forecastSavePrefix(actor, companyId);
        const found: ForecastIntent[] = []; const bad: string[] = [];
        for (let n = 0; n < localStorage.length; n++) {
          const k = localStorage.key(n);
          if (!k || !k.startsWith(prefix)) continue;
          try { const v: unknown = JSON.parse(localStorage.getItem(k) ?? 'null'); if (validForecastIntent(v, actor, companyId) && forecastSaveKey(actor, companyId, v.key) === k) found.push(v); else bad.push(k); } catch { bad.push(k); }
        }
        if (found.length === 0 && bad.length === 0) { show('ready', ''); return; }
        setPendings(found); setInvalidKeys(bad);
        show('blocked', '保存の結果を確認できていない記録があります。結果を確認するまで編集を止めています。');
        for (const i of found) void check(actor, i, client);
      } catch { show('blocked', '保存確認用の記録を読み取れないため、編集・保存を止めています。'); }
    }).catch(fail);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // 他タブの操作のうち、この利用者・この会社の保存記録だけを対象にする。
  useEffect(() => {
    if (!actorId) return;
    const prefix = forecastSavePrefix(actorId, companyId);
    const changed = (e: StorageEvent) => { if (e.key === null || e.key.startsWith(prefix)) show('blocked', '別のタブで操作がありました。再読み込みして保存結果を確認してください。'); };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [actorId, companyId]);

  async function submit(retry: ForecastIntent | null = null) {
    if (busy.current || !actorId) return;
    if (!retry && locked) return;
    setIsError(true);
    if (!retry) {
      if (reInvalid) { setMessage('期首の繰越利益は、数字（マイナス可）で入力するか、空欄にしてください。'); return; }
      if (!validScenarioName(draft.key.scenario_name)) { setMessage('シナリオ名は1〜60文字で、前後に空白を入れないでください。'); return; }
      if (!validForecastPeriod(draft.key.fiscal_start, draft.key.fiscal_end)) { setMessage('期間は実在する日付で、開始日を終了日以前（最長2年以内）にしてください。'); return; }
      if (!validForecastValues(draft.values) || !validForecastKey(draft.key)) { setMessage('入力内容を確認してください。'); return; }
      if (baseline && !dirty) { setMessage('変更はありません。'); return; }
    }
    if (!navigator.locks) { show('blocked', '安全な保存に必要なブラウザー機能が利用できません。新しいChromeなどで開いてください。'); return; }
    const key = retry ? retry.key : draft.key;
    busy.current = true;
    try {
      await navigator.locks.request(forecastSaveKey(actorId, companyId, key), { ifAvailable: true }, async lock => {
        if (!lock) { show('blocked', '別のタブで保存中です。再読み込みして結果を確認してください。'); return; }
        const client = createBrowserSupabase();
        if (!client) throw new Error('client');
        const who = await client.auth.getUser();
        if (who.error || who.data.user?.id !== actorId) throw new Error('identity');
        const k = forecastSaveKey(actorId, companyId, key);
        const raw = localStorage.getItem(k);
        let intent: ForecastIntent;
        if (retry) { if (raw === null || JSON.parse(raw).id !== retry.id) throw new Error('missing pending'); intent = retry; }
        else {
          if (raw !== null) { const other: unknown = JSON.parse(raw); if (!validForecastIntent(other, actorId, companyId)) throw new Error('invalid'); setPendings([other]); show('blocked', '同じ期間の未確認の保存があります。結果を確認してください。'); void check(actorId, other, client); return; }
          intent = { version: 1, id: crypto.randomUUID(), actorId, companyId, key, expected: baseline, values: forecastValues(draft.values) };
          localStorage.setItem(k, JSON.stringify(intent));
        }
        setPendings(prev => [intent, ...prev.filter(p => p.id !== intent.id)]); setStatus(intent, 'checking');
        show('saving', '保存中です…', false);
        const r = await saveForecast(client, intent);
        if (r.result === 'saved') {
          if (localStorage.getItem(k) !== JSON.stringify(intent) || !dropIntent(actorId, intent)) throw new Error('pending changed');
          setSnapshots(prev => upsert(prev, r.snapshot)); load(r.snapshot); show('ready', '保存しました。', false);
        } else if (r.result === 'conflict') { setStatus(intent, 'conflict'); show('blocked', '別の更新があります。上書きせず停止しました。結果を確認してください。'); }
        else { setStatus(intent, 'unknown'); show('blocked', r.result === 'denied' ? '保存する権限を確認できませんでした。保存していない可能性があります。結果を確認するまで編集を止めています。' : '保存結果を確認できません。結果を確認するまで編集・再送を止めています。'); }
      });
    } catch { show('blocked', '通信・保存確認用の記録に問題があるため停止しました。保存結果を確認してください。'); }
    finally { busy.current = false; }
  }

  const keyLocked = locked || baseline !== null;
  const setValue = (k: ForecastMoneyKey, v: number | null) => setDraft(d => ({ ...d, values: { ...d.values, [k]: v } }));
  const field = (k: ForecastMoneyKey) => <label key={k} className="block text-sm">{FORECAST_FIELD_LABEL[k]}
    {k === RETAINED
      ? <input className="form-input mt-1 min-h-11 w-full" type="text" inputMode="text" autoComplete="off" placeholder="円（マイナス可）" disabled={locked} value={reText} aria-invalid={reInvalid}
        onChange={e => { const t = e.target.value; setReText(t); const p = parseSigned(t); setReInvalid(!p.ok); if (p.ok) setValue(RETAINED, p.value); }} />
      : <fieldset disabled={locked} className="mt-1 min-w-0 border-0 p-0"><FormattedIntegerInput ariaLabel={FORECAST_FIELD_LABEL[k]} value={draft.values[k]} onChange={v => setValue(k, v)} className="min-h-11 w-full" /></fieldset>}
  </label>;
  const recovering = pendings.length > 0 || invalidKeys.length > 0;
  return <div className="space-y-5 text-sm" data-testid="forecast-view" data-mode={mode}>
    <section className="card space-y-2" aria-label="見込みであることの表示">
      <p className="font-bold" data-testid="forecast-banner">これは「決算見込（予測）」です。実績・申告済みの数字ではありません。</p>
      <p className="leading-relaxed text-sunboo-ink-muted">税金・償却は入力した仮定の金額による試算で、税額計算ではありません。減価償却と税務調整は含めていません。</p>
    </section>
    {recovering && <section className="card space-y-3" aria-label="保存結果の確認" data-testid="forecast-recovery">
      <h2 className="font-bold">保存結果の確認</h2>
      <p className="leading-relaxed">自動では再送しません。確認した結果に応じて、同じ内容での再試行か、取り消しを選べます。</p>
      <ul className="space-y-3">{pendings.map(i => <li key={i.id} className="space-y-2 border-t border-sunboo-mist pt-3" data-testid="forecast-pending">
        <p className="font-semibold">{intentLabel(i)}</p>
        <p data-testid="forecast-pending-status">{statuses[i.id] === 'checking' || statuses[i.id] === undefined ? '確認中です…' : statuses[i.id] === 'unchanged' ? '保存は反映されていません。' : statuses[i.id] === 'conflict' ? '別の更新があるため、上書きできません。' : '結果を取得できませんでした。'}</p>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn-secondary min-h-11 text-sm" disabled={mode === 'saving' || statuses[i.id] === 'checking'} onClick={() => actorId && void check(actorId, i)}>保存結果を再取得する</button>
          {statuses[i.id] === 'unchanged' && <button type="button" className="btn-secondary min-h-11 text-sm" data-testid="forecast-retry" onClick={() => void submit(i)}>確認した同じ内容で再試行する</button>}
          {(statuses[i.id] === 'unchanged' || statuses[i.id] === 'conflict') && <button type="button" className="inline-flex min-h-11 items-center underline" onClick={() => { if (actorId) void cancelIntent(actorId, i); }}>この送信予定を取り消す</button>}
        </div></li>)}</ul>
      {invalidKeys.length > 0 && <div className="space-y-2 border-t border-sunboo-mist pt-3"><p>読み取れない確認記録が{invalidKeys.length}件あります。</p>
        <button type="button" className="btn-secondary min-h-11 text-sm" onClick={() => { try { invalidKeys.forEach(k => localStorage.removeItem(k)); setInvalidKeys([]); if (pendings.length === 0) show('ready', '読み取れない確認記録を削除しました。', false); } catch { setMessage('確認記録を削除できません。'); } }}>読み取れない記録を削除する</button></div>}
    </section>}
    <section className="card space-y-3">
      <label className="block">見込みの選択
        <select className="form-select mt-1 min-h-11 w-full" aria-label="見込みの選択" value={selected} disabled={locked}
          onChange={e => load(e.target.value === NEW ? null : snapshots.find(s => forecastKeyId(s) === e.target.value) ?? null)}>
          <option value={NEW}>新しい見込みを作成</option>
          {snapshots.map(s => <option key={forecastKeyId(s)} value={forecastKeyId(s)}>{s.fiscal_start}〜{s.fiscal_end}／{s.scenario_name}{s.is_fictional ? '（架空）' : ''}</option>)}
        </select>
      </label>
      {snapshots.length === 0 && <p className="text-sunboo-ink-muted" data-testid="forecast-empty">保存済みの決算見込はありません。</p>}
    </section>
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); void submit(); }} aria-label={`${companyName}の決算見込`}>
      <section className="card space-y-3">
        <h2 className="font-bold">期間とシナリオ{draft.values.is_fictional && <span className="tag ml-2" data-testid="forecast-fictional-tag">架空の試用データ</span>}</h2>
        {baseline === null && proposed && draft.key.fiscal_start === proposed.start && draft.key.fiscal_end === proposed.end && <p className="text-sunboo-ink-muted">登録の決算月から提案した期間です。変更できます。</p>}
        {baseline === null && !proposed && <p className="text-sunboo-ink-muted">決算月が未登録のため、期間は自動で入れていません。入力してください。</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">期間の開始日<input className="form-input mt-1 min-h-11" type="date" aria-label="期間の開始日" value={draft.key.fiscal_start} disabled={keyLocked} onChange={e => setDraft(d => ({ ...d, key: { ...d.key, fiscal_start: e.target.value } }))} /></label>
          <label className="block">期間の終了日<input className="form-input mt-1 min-h-11" type="date" aria-label="期間の終了日" value={draft.key.fiscal_end} disabled={keyLocked} onChange={e => setDraft(d => ({ ...d, key: { ...d.key, fiscal_end: e.target.value } }))} /></label>
        </div>
        <label className="block">シナリオ名<input className="form-input mt-1 min-h-11 w-full" type="text" maxLength={60} aria-label="シナリオ名" value={draft.key.scenario_name} disabled={keyLocked} onChange={e => setDraft(d => ({ ...d, key: { ...d.key, scenario_name: e.target.value } }))} /></label>
        {baseline !== null && <p className="text-sunboo-ink-muted">保存済みの期間とシナリオ名は変更できません。別の見込みは「新しい見込みを作成」から追加します。</p>}
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={draft.values.is_fictional} disabled={locked} onChange={e => setDraft(d => ({ ...d, values: { ...d.values, is_fictional: e.target.checked } }))} />架空の試用データとして扱う</label>
      </section>
      <section className="card space-y-3"><h2 className="font-bold">損益の見込み（円）</h2>
        <p className="text-sunboo-ink-muted">空欄は未入力、0は0円として区別します。</p>
        <div className="grid gap-3 sm:grid-cols-2">{BASIC.map(field)}</div>
        <details className="rounded-lg border border-sunboo-mist p-3"><summary className="min-h-11 cursor-pointer py-2.5 font-semibold">営業外・特別の損益を入力する</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">{EXTRA.map(field)}</div></details>
      </section>
      <section className="card space-y-3"><h2 className="font-bold">期首残高と資金の動き（円）</h2>
        <div className="grid gap-3 sm:grid-cols-2">{CASH.map(field)}</div></section>
      <section className="card space-y-2" aria-label="計算結果" data-testid="forecast-results">
        <h2 className="font-bold">計算結果</h2>
        <dl className="space-y-2">{calc.map(r => <div key={r.key} className="border-b border-sunboo-mist pb-2" data-testid={`calc-${r.key}`}>
          <dt className="font-semibold">{r.label}</dt>
          <dd data-value={r.value === null ? '' : String(r.value)}>{r.value === null ? <span>計算できません（未入力：{r.missing.join('、')}）</span> : <strong>{formatYen(r.value)}</strong>}</dd></div>)}</dl>
        <details className="rounded-lg border border-sunboo-mist p-3"><summary className="min-h-11 cursor-pointer py-2.5 font-semibold">計算の内訳を見る</summary>
          <ul className="mt-2 space-y-1">{calc.map(r => <li key={r.key}>{r.label}＝{r.formula}</li>)}</ul>
          <p className="mt-2 text-sunboo-ink-muted">貸借の差額は調整で隠さず表示しています。0以外なら期首残高などを見直してください。</p></details>
      </section>
      <button type="submit" className="btn-primary min-h-11 w-full text-sm" disabled={locked} data-testid="forecast-save">{mode === 'saving' ? '保存中…' : '決算見込を保存する'}</button>
    </form>
    {message && <p role={isError ? 'alert' : 'status'} className="leading-relaxed" data-testid="forecast-message">{message}</p>}
    {mode === 'blocked' && <a className="inline-flex min-h-11 items-center underline" href={`/admin/workspaces/${companyId}/forecasts`}>再読み込み</a>}
  </div>;
}
