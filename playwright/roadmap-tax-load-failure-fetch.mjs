// ローカル専用。認証以外の全DB読み取りを合成データへ置き換え、全書き込みを遮断。
import { readFileSync, appendFileSync } from 'node:fs';
const file = process.env.ROADMAP_TAX_CONTROL_FILE;
if (!file) throw new Error('Roadmap tax test control file required');
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin === process.env.NEXT_PUBLIC_SUPABASE_URL && url.pathname.startsWith('/rest/v1/')) {
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'HEAD'].includes(method)) { appendFileSync(file + '.mutations', 'blocked\n'); throw new Error('DB writes forbidden'); }
    const c = JSON.parse(readFileSync(file, 'utf8'));
    const table = url.pathname.split('/').at(-1);
    if (table === 'workspace_tax_payment_plans') {
      if (c.mode === 'error') return Response.json({ message: 'Injected failure' }, { status: 400 });
      if (c.mode === 'throw') throw new Error('Injected network error');
      if (c.mode === 'null') return Response.json(null);
      return Response.json(c.rows);
    }
    const rows = {
      admin_users: [{ email: (url.searchParams.get('email') ?? 'eq.test@example.com').slice(3), name: '合成管理者' }],
      workspace_companies: [{ id: c.companyId, name: 'ローカル合成テスト会社', prefecture_code: '13', municipality_code: '131130', fiscal_month: 3, corporate_type: 'kabushiki' }],
      workspace_company_profiles: [{ company_id: c.companyId, employee_count: 0, capital: 1000000, established_date: '2020-04-01' }],
      prefectures: [{ id: 13, code: '13', name: '東京都' }],
      municipalities: [{ id: 1, code: '131130', name: '合成市' }],
      procedures: [{ id: 90001, code: 'SYNTHETIC_TAX', name: '合成納税手続き', description: '合成データ', category: 'tax', timing_type: 'fixed_date', timing_data: { month: 12, day: 31 }, timing_label: '12月31日', office_type: 'tax_office', is_active: true, include_in_diagnosis: true, requires_employees: false, requires_officer_term: false, official_links: [], procedure_documents: [] }],
    };
    return Response.json(rows[table] ?? []);
  }
  return originalFetch(input, init);
};
