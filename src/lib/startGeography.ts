// /start の地域選択用ヘルパー。取得失敗を「未対応」「0件」に置き換えないための状態整理。
// DB問い合わせは薄いアダプターに分離し、合成の偽クエリで試験できるようにしている。
// 地域データの追加や全国対応を示すものではない。

export type GeoItem = { code: string; name: string };

export type GeographyQuery = {
  listPrefectures(): PromiseLike<unknown>;
  // 0件を成功(null)として返せる maybeSingle 相当であること
  findPrefecture(code: string): PromiseLike<unknown>;
  listMunicipalities(prefectureId: number): PromiseLike<unknown>;
};

export type LookupOutcome =
  | { kind: 'loaded'; items: GeoItem[]; source: 'live' | 'sample' }
  | { kind: 'empty'; source: 'live' | 'sample' }
  | { kind: 'unregistered' }
  | { kind: 'error'; reason: string };

export type MunicipalityState =
  | { status: 'idle' }
  | { status: 'loading'; prefCode: string; requestId: number }
  | { status: 'loaded'; prefCode: string; requestId: number; items: GeoItem[]; source: 'live' | 'sample' }
  | { status: 'empty'; prefCode: string; requestId: number; source: 'live' | 'sample' }
  | { status: 'unregistered'; prefCode: string; requestId: number }
  | { status: 'error'; prefCode: string; requestId: number; reason: string };

export type MunicipalityAction =
  | { type: 'reset' }
  | { type: 'start'; prefCode: string; requestId: number }
  | { type: 'finish'; prefCode: string; requestId: number; outcome: LookupOutcome };

type ReadResult = { ok: true; data: unknown } | { ok: false; reason: string };

function readResult(result: unknown): ReadResult {
  if (result === null || typeof result !== 'object') return { ok: false, reason: 'no_response' };
  const record = result as Record<string, unknown>;
  if (!('data' in record) || !('error' in record)) return { ok: false, reason: 'malformed_response' };
  if (record.error) return { ok: false, reason: 'query_error' };
  return { ok: true, data: record.data };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseItems(data: unknown, codePattern: RegExp, prefCode?: string): GeoItem[] | null {
  if (!Array.isArray(data)) return null;
  const seen = new Set<string>();
  const items: GeoItem[] = [];
  for (const row of data) {
    if (!isRecord(row)) return null;
    const { code, name } = row;
    if (typeof code !== 'string' || typeof name !== 'string') return null;
    if (!codePattern.test(code) || name.trim() === '') return null;
    if (prefCode !== undefined && !code.startsWith(prefCode)) return null; // 別都道府県の市区町村コード
    if (seen.has(code)) return null; // コード重複
    seen.add(code);
    items.push({ code, name });
  }
  return items;
}

const PREF_CODE = /^\d{2}$/;
const MUNI_CODE = /^\d{5,6}$/;

export async function loadPrefectures(query: GeographyQuery): Promise<LookupOutcome> {
  try {
    const result = readResult(await query.listPrefectures());
    if (!result.ok) return { kind: 'error', reason: result.reason };
    const items = parseItems(result.data, PREF_CODE);
    if (items === null) return { kind: 'error', reason: 'malformed_rows' };
    return items.length === 0 ? { kind: 'empty', source: 'live' } : { kind: 'loaded', items, source: 'live' };
  } catch {
    return { kind: 'error', reason: 'rejected' };
  }
}

export async function loadMunicipalities(query: GeographyQuery, prefCode: string): Promise<LookupOutcome> {
  try {
    const prefResult = readResult(await query.findPrefecture(prefCode));
    if (!prefResult.ok) return { kind: 'error', reason: prefResult.reason };
    // maybeSingle が成功(null)を返した場合のみ「未登録」。エラーは未登録にしない。
    if (prefResult.data === null) return { kind: 'unregistered' };
    if (
      !isRecord(prefResult.data) || !Number.isSafeInteger(prefResult.data.id) ||
      (prefResult.data.id as number) <= 0
    ) {
      return { kind: 'error', reason: 'malformed_prefecture' };
    }
    const muniResult = readResult(await query.listMunicipalities(prefResult.data.id as number));
    if (!muniResult.ok) return { kind: 'error', reason: muniResult.reason };
    const items = parseItems(muniResult.data, MUNI_CODE, prefCode);
    if (items === null) return { kind: 'error', reason: 'malformed_rows' };
    return items.length === 0 ? { kind: 'empty', source: 'live' } : { kind: 'loaded', items, source: 'live' };
  } catch {
    return { kind: 'error', reason: 'rejected' };
  }
}

// Supabase未設定のローカル開発専用。サンプルであり、実際の対応地域を示さない。
export function loadSampleMunicipalities(
  samples: Record<string, GeoItem[]>,
  prefCode: string,
): LookupOutcome {
  const items = parseItems(samples[prefCode] ?? [], MUNI_CODE, prefCode);
  if (items === null) return { kind: 'error', reason: 'malformed_sample' };
  return items.length === 0 ? { kind: 'empty', source: 'sample' } : { kind: 'loaded', items, source: 'sample' };
}

export function createSupabaseGeographyQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: { from(table: string): any },
): GeographyQuery {
  return {
    listPrefectures: () => client.from('prefectures').select('code, name').order('code'),
    findPrefecture: (code) => client.from('prefectures').select('id').eq('code', code).maybeSingle(),
    listMunicipalities: (prefectureId) =>
      client.from('municipalities').select('code, name').eq('prefecture_id', prefectureId).order('code'),
  };
}

export const INITIAL_MUNICIPALITY_STATE: MunicipalityState = { status: 'idle' };

export function municipalityReducer(state: MunicipalityState, action: MunicipalityAction): MunicipalityState {
  switch (action.type) {
    case 'reset':
      return INITIAL_MUNICIPALITY_STATE;
    case 'start':
      return { status: 'loading', prefCode: action.prefCode, requestId: action.requestId };
    case 'finish': {
      // 古い要求の応答は、現在の読み込み中の要求と一致しない限り無視する
      if (state.status !== 'loading') return state;
      if (state.requestId !== action.requestId || state.prefCode !== action.prefCode) return state;
      const base = { prefCode: action.prefCode, requestId: action.requestId };
      const { outcome } = action;
      switch (outcome.kind) {
        case 'loaded':
          return { status: 'loaded', ...base, items: outcome.items, source: outcome.source };
        case 'empty':
          return { status: 'empty', ...base, source: outcome.source };
        case 'unregistered':
          return { status: 'unregistered', ...base };
        case 'error':
          return { status: 'error', ...base, reason: outcome.reason };
      }
    }
  }
}

// 現在選択中の都道府県について読み込み済みの一覧に、選択中の市区町村が含まれる場合だけ送信できる
export function isMunicipalitySelectable(state: MunicipalityState, prefCode: string, muniCode: string): boolean {
  return (
    state.status === 'loaded' &&
    state.prefCode === prefCode &&
    muniCode !== '' &&
    state.items.some((item) => item.code === muniCode)
  );
}

export function municipalityBlockMessage(state: MunicipalityState): string {
  switch (state.status) {
    case 'loading':
    case 'idle':
      return '市区町村の読み込みが終わるまでお待ちください';
    case 'error':
      return '市区町村を取得できませんでした。再試行してください';
    case 'empty':
    case 'unregistered':
      return '選択した地域の市区町村一覧が登録されていないため、先へ進めません';
    case 'loaded':
      return '市区町村を選択してください';
  }
}
