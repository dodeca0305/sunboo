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

const SHARE_LINK_COLUMNS = 'id, token, shared_sections, expires_at, revoked_at, last_accessed_at, created_at';
const SHARED_SECTIONS = ['company', 'profile', 'roadmap'];
type Client = Pick<SupabaseClient, 'from'>;

export type ShareLinkRequest = {
  company_id: number;
  token: string;
  created_by: string;
  expires_at: string | null;
};

export function pendingShareLinkKey(companyId: number): string {
  return `sunboo:pending-share-link:${companyId}`;
}

export function parseShareLinkRequest(raw: string | null, companyId: number): ShareLinkRequest | null {
  if (raw === null) return null;
  const value = JSON.parse(raw) as ShareLinkRequest | null;
  if (!value || value.company_id !== companyId || typeof value.token !== 'string' || !/^[a-f0-9]{64}$/.test(value.token)
    || typeof value.created_by !== 'string' || !value.created_by
    || !(value.expires_at === null || (typeof value.expires_at === 'string' && Number.isFinite(Date.parse(value.expires_at))))) {
    // 不明な前回要求を捨てて新規発行すると、重複を作るおそれがある。
    throw new Error('Invalid pending share request');
  }
  return { company_id: companyId, token: value.token, created_by: value.created_by, expires_at: value.expires_at };
}

export async function loadWorkspaceShareLinks(client: Client, companyId: number): Promise<ShareLinkRow[] | null> {
  try {
    const { data, error } = await client.from('workspace_share_links').select(SHARE_LINK_COLUMNS)
      .eq('company_id', companyId).order('created_at', { ascending: false });
    return error || !Array.isArray(data) ? null : data as ShareLinkRow[];
  } catch {
    return null;
  }
}

export async function issueWorkspaceShareLink(client: Client, request: ShareLinkRequest): Promise<ShareLinkRow | null> {
  try {
    const existing = await client.from('workspace_share_links').select(SHARE_LINK_COLUMNS)
      .eq('company_id', request.company_id).eq('token', request.token).maybeSingle();
    if (existing.error) return null;
    if (existing.data) return existing.data.token === request.token ? existing.data as ShareLinkRow : null;

    // 毎回同じトークンでINSERTする。先行要求の確定が遅れてもDBのUNIQUE制約で二重作成しない。
    // upsertは既存リンクの失効・有効期限を変更し得るため使わない。
    const { data, error } = await client.from('workspace_share_links')
      .insert({ ...request, shared_sections: SHARED_SECTIONS }).select(SHARE_LINK_COLUMNS).single();
    return error || !data || data.token !== request.token ? null : data as ShareLinkRow;
  } catch {
    return null;
  }
}
