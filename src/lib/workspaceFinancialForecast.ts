import type { SupabaseClient } from './supabase';
import {
  FORECAST_MONEY_KEYS, forecastKeyId, forecastValues, sameForecastValues, validForecastKey, validForecastValues,
  type ForecastKey, type ForecastSnapshot, type ForecastValues,
} from './financialForecast.ts';

export const FORECAST_COLUMNS = ['company_id', 'fiscal_start', 'fiscal_end', 'scenario_name', 'is_fictional', 'version', 'updated_at', ...FORECAST_MONEY_KEYS].join(',');
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

export function validForecastSnapshot(v: unknown): v is ForecastSnapshot {
  if (!record(v) || !validForecastKey(v) || !validForecastValues(v)) return false;
  const r: Record<string, unknown> = v;
  return typeof r.version === 'number' && Number.isSafeInteger(r.version) && r.version >= 1
    && typeof r.updated_at === 'string' && TS.test(r.updated_at) && Number.isFinite(Date.parse(r.updated_at));
}
export const toSnapshot = (r: ForecastSnapshot): ForecastSnapshot => ({
  fiscal_start: r.fiscal_start, fiscal_end: r.fiscal_end, scenario_name: r.scenario_name, ...forecastValues(r), version: r.version, updated_at: r.updated_at,
});
const keyOf = (k: ForecastKey): ForecastKey => ({ fiscal_start: k.fiscal_start, fiscal_end: k.fiscal_end, scenario_name: k.scenario_name });

// 取得失敗・不正な応答は「空」にせず unavailable を返す。空の一覧は「保存済みの見込みがない」場合だけ。
export async function readForecasts(client: Pick<SupabaseClient, 'from'> | null, company: number): Promise<{ status: 'loaded'; snapshots: ForecastSnapshot[] } | { status: 'unavailable' }> {
  if (!client || !Number.isSafeInteger(company) || company <= 0) return { status: 'unavailable' };
  try {
    const r = await client.from('workspace_financial_forecasts').select(FORECAST_COLUMNS).eq('company_id', company)
      .order('fiscal_start', { ascending: false }).order('scenario_name', { ascending: true });
    if (r.error || !Array.isArray(r.data)) return { status: 'unavailable' };
    const rows = r.data as unknown[];
    if (rows.some(row => !validForecastSnapshot(row) || (row as Record<string, unknown>).company_id !== company)) return { status: 'unavailable' };
    const snapshots = (rows as ForecastSnapshot[]).map(toSnapshot);
    if (new Set(snapshots.map(forecastKeyId)).size !== snapshots.length) return { status: 'unavailable' };
    return { status: 'loaded', snapshots };
  } catch { return { status: 'unavailable' }; }
}
export async function readForecast(client: Pick<SupabaseClient, 'from'>, company: number, key: ForecastKey): Promise<{ snapshot: ForecastSnapshot | null } | null> {
  if (!validForecastKey(key)) return null;
  try {
    const r = await client.from('workspace_financial_forecasts').select(FORECAST_COLUMNS).eq('company_id', company)
      .eq('fiscal_start', key.fiscal_start).eq('fiscal_end', key.fiscal_end).eq('scenario_name', key.scenario_name).maybeSingle();
    if (r.error || r.data === undefined) return null;
    if (r.data === null) return { snapshot: null };
    const d = r.data as unknown;
    return validForecastSnapshot(d) && (d as Record<string, unknown>).company_id === company && forecastKeyId(d) === forecastKeyId(key) ? { snapshot: toSnapshot(d) } : null;
  } catch { return null; }
}

export type ForecastIntent = { version: 1; id: string; actorId: string; companyId: number; key: ForecastKey; expected: ForecastSnapshot | null; values: ForecastValues };
export const forecastSavePrefix = (actor: string, company: number) => `sunboo:forecast-save:v1:${actor}:${company}:`;
export const forecastSaveKey = (actor: string, company: number, key: ForecastKey) => forecastSavePrefix(actor, company) + encodeURIComponent(forecastKeyId(key));
export function validForecastIntent(v: unknown, actor: string, company: number): v is ForecastIntent {
  return record(v) && v.version === 1 && typeof v.id === 'string' && /^[\da-f-]{36}$/i.test(v.id) && v.actorId === actor
    && v.companyId === company && Number.isSafeInteger(company) && company > 0 && validForecastKey(v.key)
    && (v.expected === null || (validForecastSnapshot(v.expected) && forecastKeyId(v.expected) === forecastKeyId(v.key))) && validForecastValues(v.values);
}
// 変更を伴う保存の確認は、期待版より厳密に新しい版だけを認める。値が同じ（変更なし）保存だけ同版を認める。古い版は常に不可。
export function versionAcknowledges(intent: ForecastIntent, version: number): boolean {
  if (intent.expected === null) return version >= 1;
  return sameForecastValues(intent.expected, intent.values) ? version >= intent.expected.version : version > intent.expected.version;
}
export function reconcileForecast(intent: ForecastIntent, current: ForecastSnapshot | null): 'saved' | 'unchanged' | 'conflict' {
  if (current && sameForecastValues(current, intent.values) && versionAcknowledges(intent, current.version)) return 'saved';
  if (current === null && intent.expected === null) return 'unchanged';
  if (current && intent.expected && current.version === intent.expected.version && sameForecastValues(current, intent.expected)) return 'unchanged';
  return 'conflict';
}

// 確認記録の所有確認と解放。別タブの記録は消さず、消せたか確認できない場合は 'failed'/'changed' を返す（呼び出し側は編集を止めたままにする）。
type KeyStorage = Pick<Storage, 'getItem' | 'removeItem'>;
export function forecastIntentOwned(storage: KeyStorage, actor: string, company: number, intent: ForecastIntent): boolean {
  try { const raw = storage.getItem(forecastSaveKey(actor, company, intent.key)); return raw !== null && JSON.parse(raw)?.id === intent.id; } catch { return false; }
}
export function releaseForecastIntent(storage: KeyStorage, actor: string, company: number, intent: ForecastIntent): 'released' | 'changed' | 'failed' {
  try {
    const k = forecastSaveKey(actor, company, intent.key);
    const raw = storage.getItem(k);
    if (raw === null) return 'changed';
    if (JSON.parse(raw)?.id !== intent.id) return 'changed';
    storage.removeItem(k);
    return storage.getItem(k) === null ? 'released' : 'failed';
  } catch { return 'failed'; }
}

export type ForecastSaveResult = { result: 'saved'; snapshot: ForecastSnapshot } | { result: 'conflict' | 'denied' | 'unavailable' };
// 保存は1回のRPC（楽観的ロック＋同一内容の再送は冪等）。応答が不正なら保存成功にしない。
export async function saveForecast(client: Pick<SupabaseClient, 'rpc'>, intent: ForecastIntent): Promise<ForecastSaveResult> {
  if (!validForecastIntent(intent, intent.actorId, intent.companyId)) return { result: 'unavailable' };
  try {
    const r = await client.rpc('save_workspace_financial_forecast', {
      p_company_id: intent.companyId, p_fiscal_start: intent.key.fiscal_start, p_fiscal_end: intent.key.fiscal_end, p_scenario_name: intent.key.scenario_name,
      p_expected: intent.expected === null ? null : { version: intent.expected.version, values: forecastValues(intent.expected) },
      p_values: forecastValues(intent.values),
    });
    if (r.error) {
      const code = (r.error as { code?: string }).code;
      return { result: code === '40001' ? 'conflict' : code === '42501' ? 'denied' : 'unavailable' };
    }
    const d = r.data as unknown;
    if (!record(d) || d.result_status !== 'saved' || !record(d.snapshot)) return { result: 'unavailable' };
    const s = d.snapshot;
    if (!validForecastSnapshot(s) || (d.snapshot as Record<string, unknown>).company_id !== intent.companyId || forecastKeyId(s) !== forecastKeyId(intent.key)
      || !sameForecastValues(s, intent.values) || !versionAcknowledges(intent, s.version)) return { result: 'unavailable' };
    return { result: 'saved', snapshot: toSnapshot(s) };
  } catch { return { result: 'unavailable' }; }
}
export { keyOf as forecastKeyOf };
