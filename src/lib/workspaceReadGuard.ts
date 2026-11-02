import type { SupabaseClient } from './supabase';
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
// Opt-in guard for read-only consumers. A swallowed engine error still invalidates its output.
export function createWorkspaceReadGuard(
  client: SupabaseClient,
  companyId?: number,
) {
  const failures = new Set<string>();
  function query(
    target: object,
    table: string,
    single = false,
    selection = '',
    ranged = false,
    head = false,
  ): unknown {
    return new Proxy(target, {
      get(t, key) {
        if (key === 'then')
          return (
            resolve: (v: unknown) => unknown,
            reject: (e: unknown) => unknown,
          ) =>
            Promise.resolve(t)
              .then((r: unknown) => {
                if (
                  !object(r) ||
                  r.error ||
                  r.data === undefined ||
                  (!head &&
                    (single
                      ? r.data !== null && !object(r.data)
                      : !Array.isArray(r.data)))
                )
                  throw Error('Read unavailable');
                if (!single && !head) {
                  const rows = r.data as unknown[];
                  if (!ranged && rows.length >= 1000)
                    throw Error('Read may be truncated');
                  if (!rows.every(object)) throw Error('Invalid rows');
                  if (
                    companyId !== undefined &&
                    selection.includes('company_id') &&
                    rows.some(
                      (row) => !object(row) || row.company_id !== companyId,
                    )
                  )
                    throw Error('Wrong company');
                  if (
                    [
                      'tax_controls',
                      'workspace_tax_review_cases',
                      'workspace_tax_control_results',
                    ].includes(table) &&
                    rows.some(
                      (row) =>
                        !object(row) ||
                        !Number.isSafeInteger(row.id) ||
                        Number(row.id) <= 0,
                    )
                  )
                    throw Error('Invalid tax row');
                  if (
                    table === 'workspace_tax_review_cases' &&
                    rows.some(
                      (row) =>
                        !object(row) ||
                        !['open', 'resolved', 'dismissed'].includes(
                          String(row.status),
                        ) ||
                        !Number.isSafeInteger(row.control_result_id),
                    )
                  )
                    throw Error('Invalid review status');
                  if (
                    table === 'workspace_tax_control_results' &&
                    rows.some(
                      (row) =>
                        !object(row) ||
                        !Number.isSafeInteger(row.tax_control_id) ||
                        !(
                          row.status === null ||
                          ['pass', 'review', 'unknown'].includes(
                            String(row.status),
                          )
                        ) ||
                        (selection.includes('applicable') &&
                          typeof row.applicable !== 'boolean'),
                    )
                  )
                    throw Error('Invalid evaluation');
                  if (
                    table === 'rules' &&
                    selection.includes('rule_conditions') &&
                    rows.some(
                      (row) =>
                        !object(row) ||
                        !Array.isArray(row.rule_conditions) ||
                        !Array.isArray(row.rule_actions),
                    )
                  )
                    throw Error('Rule relations unavailable');
                  if (
                    table === 'procedures' &&
                    (selection.includes('*') || selection.includes('code')) &&
                    rows.some(
                      (row) =>
                        !object(row) ||
                        !Number.isSafeInteger(row.id) ||
                        typeof row.code !== 'string' ||
                        (selection.includes('official_links') &&
                          (!Array.isArray(row.official_links) ||
                            !Array.isArray(row.procedure_documents))),
                    )
                  )
                    throw Error('Procedure relations unavailable');
                  if (
                    table === 'jurisdictions' &&
                    selection.includes('organization_offices') &&
                    rows.some(
                      (row) =>
                        !object(row) ||
                        !object(row.organization_types) ||
                        !object(row.organization_offices),
                    )
                  )
                    throw Error('Office relation unavailable');
                }
                return r;
              })
              .catch((e) => {
                failures.add(table);
                throw e;
              })
              .then(resolve, reject);
        const value = Reflect.get(t, key, t);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          if (['insert', 'update', 'upsert', 'delete'].includes(String(key))) {
            failures.add(table);
            throw Error('Read guard prohibits writes');
          }
          let next;
          try {
            next = Reflect.apply(value, t, args);
          } catch (e) {
            failures.add(table);
            throw e;
          }
          return object(next)
            ? query(
                next,
                table,
                single || key === 'single' || key === 'maybeSingle',
                key === 'select' ? String(args[0]) : selection,
                ranged || key === 'range',
                head ||
                  (key === 'select' &&
                    object(args[1]) &&
                    args[1].head === true),
              )
            : next;
        };
      },
    });
  }
  const guarded = new Proxy(client, {
    get(t, key) {
      if (key === 'from') return (table: string) => query(t.from(table), table);
      if (key === 'rpc')
        return () => {
          failures.add('rpc');
          throw Error('Home read guard does not execute RPC');
        };
      const v = Reflect.get(t, key, t);
      return typeof v === 'function' ? v.bind(t) : v;
    },
  });
  return {
    client: guarded as SupabaseClient,
    failed: () => failures.size > 0,
    failures: () => [...failures],
  };
}
export type WorkspaceReadResult<T> =
  | { status: 'loaded'; value: T }
  | { status: 'unavailable' };
export async function workspaceRead<T>(
  read: () => Promise<T>,
): Promise<WorkspaceReadResult<T>> {
  try {
    return { status: 'loaded', value: await read() };
  } catch {
    return { status: 'unavailable' };
  }
}
