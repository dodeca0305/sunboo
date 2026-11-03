import type { SupabaseClient } from './supabase';

export type ShareLinkRow = {
  id: number;
  token: string;
  shared_sections: string[];
  expires_at: string | null;
  revoked_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

const SHARE_LINK_COLUMNS =
  'id, token, shared_sections, expires_at, revoked_at, last_accessed_at, created_at';
const SHARED_SECTIONS = ['company', 'profile', 'roadmap'];
type Client = Pick<SupabaseClient, 'from'>;

export type ShareLinkRequest = {
  company_id: number;
  token: string;
  created_by: string;
  expires_at: string | null;
  include_tax_returns?: boolean;
};

export function pendingShareLinkKey(companyId: number): string {
  return `sunboo:pending-share-link:${companyId}`;
}

export function parseShareLinkRequest(
  raw: string | null,
  companyId: number,
): ShareLinkRequest | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as ShareLinkRequest | null;
  if (
    !value ||
    value.company_id !== companyId ||
    typeof value.token !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.token) ||
    typeof value.created_by !== 'string' ||
    !value.created_by ||
    !(
      value.expires_at === null ||
      (typeof value.expires_at === 'string' &&
        Number.isFinite(Date.parse(value.expires_at)))
    )
  ) {
    // 不明な前回要求を捨てて新規発行すると、重複を作るおそれがある。
    throw new Error('Invalid pending share request');
  }
  if (
    value.include_tax_returns !== undefined &&
    typeof value.include_tax_returns !== 'boolean'
  )
    throw Error('Invalid share scope');
  return {
    company_id: companyId,
    token: value.token,
    created_by: value.created_by,
    expires_at: value.expires_at,
    ...(value.include_tax_returns === undefined
      ? {}
      : { include_tax_returns: value.include_tax_returns }),
  };
}

function validShareRow(v: unknown): v is ShareLinkRow {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as ShareLinkRow;
  const date = (x: unknown) =>
    x === null || (typeof x === 'string' && Number.isFinite(Date.parse(x)));
  return (
    Number.isSafeInteger(r.id) &&
    r.id > 0 &&
    typeof r.token === 'string' &&
    /^[a-f0-9]{64}$/.test(r.token) &&
    Array.isArray(r.shared_sections) &&
    r.shared_sections.every((s) =>
      ['company', 'profile', 'roadmap', 'tax_returns'].includes(s),
    ) &&
    new Set(r.shared_sections).size === r.shared_sections.length &&
    date(r.expires_at) &&
    date(r.revoked_at) &&
    date(r.last_accessed_at) &&
    typeof r.created_at === 'string' &&
    Number.isFinite(Date.parse(r.created_at))
  );
}
export async function loadWorkspaceShareLinks(
  client: Client,
  companyId: number,
): Promise<ShareLinkRow[] | null> {
  try {
    const { data, error } = await client
      .from('workspace_share_links')
      .select(SHARE_LINK_COLUMNS)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    return error ||
      !Array.isArray(data) ||
      data.length >= 1000 ||
      !data.every(validShareRow) ||
      new Set(data.map((r) => r.id)).size !== data.length
      ? null
      : (data as ShareLinkRow[]);
  } catch {
    return null;
  }
}

export async function issueWorkspaceShareLink(
  client: Client,
  request: ShareLinkRequest,
): Promise<ShareLinkRow | null> {
  try {
    const sections = request.include_tax_returns
      ? [...SHARED_SECTIONS, 'tax_returns']
      : SHARED_SECTIONS;
    const matches = (v: ShareLinkRow) =>
      v.token === request.token &&
      (v.expires_at === request.expires_at || (v.expires_at !== null && request.expires_at !== null && Date.parse(v.expires_at) === Date.parse(request.expires_at))) &&
      Array.isArray(v.shared_sections) &&
      v.shared_sections.length === sections.length &&
      sections.every((s) => v.shared_sections.includes(s));
    const existing = await client
      .from('workspace_share_links')
      .select(SHARE_LINK_COLUMNS)
      .eq('company_id', request.company_id)
      .eq('token', request.token)
      .maybeSingle();
    if (existing.error || existing.data === undefined) return null;
    if (existing.data)
      return validShareRow(existing.data) &&
        matches(existing.data as ShareLinkRow)
        ? (existing.data as ShareLinkRow)
        : null;

    // 毎回同じトークンでINSERTする。先行要求の確定が遅れてもDBのUNIQUE制約で二重作成しない。
    // upsertは既存リンクの失効・有効期限を変更し得るため使わない。
    const { data, error } = await client
      .from('workspace_share_links')
      .insert({
        company_id: request.company_id,
        token: request.token,
        created_by: request.created_by,
        expires_at: request.expires_at,
        shared_sections: sections,
      })
      .select(SHARE_LINK_COLUMNS)
      .single();
    return error || !validShareRow(data) || !matches(data as ShareLinkRow)
      ? null
      : (data as ShareLinkRow);
  } catch {
    return null;
  }
}

export async function confirmShareRevocation(
  client: Client,
  companyId: number,
  link: ShareLinkRow,
): Promise<'revoked' | 'active' | 'unavailable'> {
  try {
    const r = await client
      .from('workspace_share_links')
      .select('id,company_id,token,revoked_at')
      .eq('company_id', companyId)
      .eq('id', link.id)
      .maybeSingle();
    if (
      r.error ||
      !r.data ||
      r.data.company_id !== companyId ||
      r.data.id !== link.id ||
      r.data.token !== link.token
    )
      return 'unavailable';
    return r.data.revoked_at === null
      ? 'active'
      : typeof r.data.revoked_at === 'string' &&
          Number.isFinite(Date.parse(r.data.revoked_at))
        ? 'revoked'
        : 'unavailable';
  } catch {
    return 'unavailable';
  }
}
export async function revokeShareLink(
  client: Client,
  companyId: number,
  link: ShareLinkRow,
): Promise<boolean> {
  try {
    const revokedAt = new Date().toISOString();
    const r = await client
      .from('workspace_share_links')
      .update({ revoked_at: revokedAt })
      .eq('company_id', companyId)
      .eq('id', link.id)
      .eq('token', link.token)
      .select('id,company_id,token,revoked_at')
      .maybeSingle();
    return (
      !r.error &&
      r.data?.id === link.id &&
      r.data.company_id === companyId &&
      r.data.token === link.token &&
      typeof r.data.revoked_at === 'string' &&
      Date.parse(r.data.revoked_at) === Date.parse(revokedAt)
    );
  } catch {
    return false;
  }
}
