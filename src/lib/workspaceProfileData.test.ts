import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWorkspaceProfileForEditing } from './workspaceProfileData.ts';
import { workspaceRowsToCompanyProfile, companyProfileToWorkspaceUpdatePayload, type WorkspaceCompanyRow, type WorkspaceCompanyProfileRow } from './workspaceCompanyProfile.ts';

const company: WorkspaceCompanyRow = { id: 23, name: '架空テスト会社', prefecture_code: '13', municipality_code: '13113', corporate_type: 'kabushiki', fiscal_month: 3 };
const existing: WorkspaceCompanyProfileRow = {
  company_id: 23, employee_count: 7, capital: 5000000, established_date: '2020-04-01', stage: 'second_term_or_later',
  consumption_tax_status: 'taxable', invoice_registration_status: 'registered', taxation_method: 'principle',
  corporate_tax_interim_filing: 'has', consumption_tax_interim_frequency: '3', withholding_tax_cycle: 'monthly',
  local_tax_collection_method: 'special_collection', resident_tax_payment_cycle: 'monthly', next_officer_change_date: '2027-04-01',
  address: 'E2E用の架空住所', e_tax_enabled: true, e_ltax_enabled: true,
  advisors: { taxAccountant: true, laborConsultant: true, judicialScrivener: false, administrativeScrivener: false },
};
const tables = ['workspace_company_profiles', 'prefectures', 'municipalities'];
type Response = { data: unknown; error: unknown };
function fake(overrides: Record<string, Response | Error> = {}) {
  const filters: unknown[][] = [];
  const responses: Record<string, Response> = {
    workspace_company_profiles: { data: existing, error: null },
    prefectures: { data: { name: '東京都' }, error: null }, municipalities: { data: { name: '渋谷区' }, error: null },
  };
  const client = { from(table: string) {
    assert.ok(tables.includes(table));
    const query = {
      select() { return query; },
      eq(column: string, value: unknown) { filters.push([table, column, value]); return query; },
      async maybeSingle() { const value = overrides[table] ?? responses[table]; if (value instanceof Error) throw value; return value; },
    };
    return query;
  } } as unknown as Parameters<typeof loadWorkspaceProfileForEditing>[0];
  return { client, filters };
}

test('取得したプロフィールの全項目と保存payloadを維持する', async () => {
  const { client, filters } = fake();
  const result = await loadWorkspaceProfileForEditing(client, company);
  const expected = workspaceRowsToCompanyProfile(company, existing, '東京都', '渋谷区');
  assert.deepEqual(result, expected);
  assert.deepEqual(companyProfileToWorkspaceUpdatePayload(result!), companyProfileToWorkspaceUpdatePayload(expected));
  assert.deepEqual(filters, [['workspace_company_profiles', 'company_id', 23], ['prefectures', 'code', '13'], ['municipalities', 'code', '13113']]);
});

test('正常なプロフィール未登録は既定値で新規入力できる', async () => {
  const { client } = fake({ workspace_company_profiles: { data: null, error: null } });
  assert.deepEqual(await loadWorkspaceProfileForEditing(client, company), workspaceRowsToCompanyProfile(company, null, '東京都', '渋谷区'));
});

for (const table of tables) {
  for (const [kind, response] of Object.entries({
    failure: { data: null, error: { message: 'failed' } },
    partialError: { data: existing, error: { message: 'partial failure' } },
    malformed: { data: undefined, error: null },
    rejected: new Error('Network failed'),
  })) test(`${table}: ${kind}を保存可能な空プロフィールにしない`, async () => {
    const { client } = fake({ [table]: response });
    assert.equal(await loadWorkspaceProfileForEditing(client, company), null);
  });
}

test('会社が一致しない行や不正な配列も編集に渡さない', async () => {
  for (const data of [{ ...existing, company_id: 24 }, []]) {
    assert.equal(await loadWorkspaceProfileForEditing(fake({ workspace_company_profiles: { data, error: null } }).client, company), null);
  }
});
