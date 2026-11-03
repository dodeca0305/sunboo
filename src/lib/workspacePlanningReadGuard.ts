import type { SupabaseClient } from './supabase';
import { createWorkspaceReadGuard } from './workspaceReadGuard.ts';
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown) => Number.isSafeInteger(v) && Number(v) > 0;
const text = (v: unknown) => typeof v === 'string' && v.trim() !== '';
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const nullableText = (v: unknown) => v === null || typeof v === 'string';
const timing = (r: Record<string, unknown>) => {
  const d = r.timing_data;
  if (!(d === null || record(d))) return false;
  if (
    record(d) &&
    [
      'months',
      'month',
      'day',
      'startMonth',
      'startDay',
      'endMonth',
      'endDay',
      'days',
      'day_of_month',
    ].some((k) => d[k] !== undefined && d[k] !== null && !number(d[k]))
  )
    return false;
  const keys =
    r.timing_type === 'fixed_date'
      ? ['month', 'day']
      : r.timing_type === 'period'
        ? ['startMonth', 'startDay', 'endMonth', 'endDay']
        : [];
  return keys.every((k) => record(d) && number(d[k]));
};
const condition = (v: unknown) =>
  record(v) &&
  text(v.field) &&
  ['eq', 'neq', 'in', 'not_in', 'gt', 'gte', 'lt', 'lte'].includes(
    String(v.operator),
  ) &&
  Object.hasOwn(v, 'value') &&
  (!['in', 'not_in'].includes(String(v.operator)) || Array.isArray(v.value));
function validRow(
  table: string,
  r: Record<string, unknown>,
  selection: string,
): boolean {
  if (['municipalities', 'prefectures'].includes(table))
    return selection === 'id' ? id(r.id) : typeof r.name === 'string';
  if (table === 'procedures') {
    if (selection === 'office_type') return nullableText(r.office_type);
    return (
      id(r.id) &&
      text(r.code) &&
      text(r.name) &&
      text(r.category) &&
      [
        'at_establishment',
        'hiring_event',
        'event_based',
        'fiscal_offset',
        'fixed_date',
        'event_next_month_day',
        'period',
        'monthly_10th',
      ].includes(String(r.timing_type)) &&
      timing(r) &&
      typeof r.requires_employees === 'boolean' &&
      typeof r.requires_officer_term === 'boolean' &&
      Array.isArray(r.official_links) &&
      r.official_links.every(
        (v) =>
          record(v) && typeof v.label === 'string' && typeof v.url === 'string',
      ) &&
      Array.isArray(r.procedure_documents) &&
      r.procedure_documents.every(
        (v) =>
          record(v) &&
          text(v.name) &&
          nullableText(v.form_number) &&
          nullableText(v.notes) &&
          number(v.sort_order) &&
          typeof v.is_required === 'boolean' &&
          (v.item_type === null ||
            ['document', 'preparation', 'checklist'].includes(
              String(v.item_type),
            )),
      )
    );
  }
  if (table === 'rules')
    return (
      id(r.id) &&
      text(r.name) &&
      number(r.priority) &&
      typeof r.is_active === 'boolean' &&
      Array.isArray(r.rule_conditions) &&
      r.rule_conditions.every(condition) &&
      Array.isArray(r.rule_actions) &&
      r.rule_actions.every((v) => {
        if (
          !record(v) ||
          !number(v.sort_order) ||
          !(v.payload === null || record(v.payload))
        )
          return false;
        if (v.action_type === 'add_procedure') return id(v.procedure_id);
        if (v.action_type === 'show_warning')
          return record(v.payload) && text(v.payload.message);
        if (v.action_type === 'change_office')
          return (
            id(v.procedure_id) &&
            record(v.payload) &&
            text(v.payload.office_type)
          );
        if (v.action_type === 'change_deadline')
          return (
            id(v.procedure_id) &&
            record(v.payload) &&
            number(v.payload.days_from_event)
          );
        return false;
      })
    );
  if (table === 'jurisdictions')
    return (
      record(r.organization_types) &&
      text(r.organization_types.code) &&
      record(r.organization_offices) &&
      id(r.organization_offices.id) &&
      text(r.organization_offices.name) &&
      ['official_url', 'website_url', 'fallback_url', 'address', 'phone'].every(
        (k) =>
          nullableText((r.organization_offices as Record<string, unknown>)[k]),
      )
    );
  if (table === 'procedure_submission_rules')
    return (
      id(r.id) &&
      id(r.procedure_id) &&
      text(r.office_category) &&
      Array.isArray(r.conditions) &&
      r.conditions.every(condition) &&
      ['company', 'each_employee', 'other'].includes(
        String(r.recipient_scope),
      ) &&
      number(r.priority) &&
      typeof r.is_active === 'boolean'
    );
  if (table === 'submission_jurisdictions')
    return (
      id(r.id) &&
      id(r.office_id) &&
      text(r.office_category) &&
      ['municipality', 'prefecture', 'national'].includes(
        String(r.scope_type),
      ) &&
      typeof r.is_primary === 'boolean' &&
      number(r.priority) &&
      text(r.effective_from) &&
      (r.effective_to === null || text(r.effective_to)) &&
      (r.scope_type !== 'municipality' || id(r.municipality_scope_id)) &&
      (r.scope_type !== 'prefecture' || id(r.prefecture_scope_id))
    );
  if (table === 'submission_offices')
    return (
      id(r.id) &&
      text(r.name) &&
      text(r.office_category) &&
      typeof r.is_active === 'boolean' &&
      number(r.data_version) &&
      ['monthly', 'quarterly', 'annual', 'on_change', 'unknown'].includes(
        String(r.update_frequency),
      ) &&
      ['ok', 'broken', 'redirected', 'unchecked'].includes(
        String(r.official_url_status),
      )
    );
  if (table === 'office_sources')
    return (
      id(r.id) &&
      id(r.office_id) &&
      text(r.publisher_name) &&
      ['active', 'superseded', 'retracted'].includes(String(r.status)) &&
      typeof r.is_current === 'boolean' &&
      text(r.retrieved_at)
    );
  return true;
}
// Opt-in wrapper only for roadmap/documents. Other callers keep their existing contracts.
export function createPlanningReadGuard(
  client: SupabaseClient,
  companyId?: number,
) {
  const base = createWorkspaceReadGuard(client, companyId),
    failures = new Set<string>();
  function wrap(
    target: object,
    table: string,
    selection = '',
    single = false,
    expectedIds?: unknown[],
  ): unknown {
    return new Proxy(target, {
      get(t, key) {
        if (key === 'then')
          return (
            resolve: (v: unknown) => unknown,
            reject: (e: unknown) => unknown,
          ) =>
            Promise.resolve(t)
              .then((response: unknown) => {
                if (!record(response)) throw Error('Invalid response');
                const data = response.data;
                // Referenced locations/procedures must exist; successful empty LISTS remain valid.
                if (
                  single &&
                  data === null &&
                  ['municipalities', 'prefectures', 'procedures'].includes(
                    table,
                  )
                )
                  throw Error('Missing reference');
                const rows = single ? (data === null ? [] : [data]) : data;
                if (
                  !Array.isArray(rows) ||
                  rows.some((r) => !record(r) || !validRow(table, r, selection))
                )
                  throw Error('Invalid planning data');
                const keyed = rows.filter((r) => record(r) && id(r.id));
                if (new Set(keyed.map((r) => r.id)).size !== keyed.length)
                  throw Error('Duplicate rows');
                if (
                  expectedIds &&
                  ['procedures', 'submission_offices'].includes(table) &&
                  (rows.length !== new Set(expectedIds).size ||
                    rows.some((r) => !expectedIds.includes(r.id)))
                )
                  throw Error('Missing requested rows');
                return response;
              })
              .catch((e) => {
                failures.add(table);
                throw e;
              })
              .then(resolve, reject);
        const value = Reflect.get(t, key, t);
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          try {
            const next = Reflect.apply(value, t, args);
            return record(next)
              ? wrap(
                  next,
                  table,
                  key === 'select' ? String(args[0]) : selection,
                  single || key === 'single' || key === 'maybeSingle',
                  key === 'in' && args[0] === 'id' && Array.isArray(args[1])
                    ? args[1]
                    : expectedIds,
                )
              : next;
          } catch (e) {
            failures.add(table);
            throw e;
          }
        };
      },
    });
  }
  const guarded = new Proxy(base.client, {
    get(t, key) {
      if (key === 'from')
        return (table: string) => {
          try {
            return wrap(t.from(table), table);
          } catch (error) {
            failures.add(table);
            throw error;
          }
        };
      const value = Reflect.get(t, key, t);
      return typeof value === 'function' ? value.bind(t) : value;
    },
  });
  return {
    client: guarded as SupabaseClient,
    failed: () => base.failed() || failures.size > 0,
  };
}
