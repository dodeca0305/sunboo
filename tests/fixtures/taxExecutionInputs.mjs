import { PRODUCTION_CONTROL_EVALUATOR_KEYS } from "../../src/lib/taxIntelligence/productionEvaluators.ts";
export const initial = {
  workspace_companies: [
    {
      id: 23,
      name: "synthetic",
      prefecture_code: "13",
      municipality_code: "131130",
      corporate_type: "kabushiki",
      fiscal_month: 3,
    },
  ],
  workspace_company_profiles: [
    {
      company_id: 23,
      employee_count: 7,
      capital: 5000000,
      established_date: "2020-04-01",
      stage: "second_term_or_later",
      consumption_tax_status: "taxable",
      invoice_registration_status: "registered",
      taxation_method: "principle",
      corporate_tax_interim_filing: "has",
      consumption_tax_interim_frequency: "3",
      withholding_tax_cycle: "monthly",
      local_tax_collection_method: "special_collection",
      resident_tax_payment_cycle: "monthly",
      next_officer_change_date: null,
      address: null,
      e_tax_enabled: true,
      e_ltax_enabled: true,
      advisors: {
        taxAccountant: true,
        laborConsultant: false,
        judicialScrivener: false,
        administrativeScrivener: false,
      },
    },
  ],
  prefectures: [{ code: "13", name: "synthetic pref" }],
  municipalities: [{ code: "131130", name: "synthetic city" }],
  workspace_tax_return_profiles: [
    {
      id: 1,
      company_id: 23,
      fiscal_year: "synthetic",
      fiscal_year_start_date: null,
      fiscal_year_end_date: "2025-03-31",
      filed_date: null,
      capital_at_filing: null,
      taxable_sales_amount: null,
      consumption_tax_status: "taxable",
      taxation_method: "principle",
      invoice_registration_status: "registered",
      corporate_tax_amount: {
        precision: "exact",
        exactValue: 0,
        rangeBucketId: null,
      },
      consumption_tax_amount: null,
      corporate_tax_interim_filing_actual: "none",
      consumption_tax_interim_frequency_actual: "none",
      financial_statement_published: false,
      withholding_tax_cycle_actual: null,
      employee_count_at_fiscal_year_end: 7,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  tax_controls: [
    {
      id: 10,
      control_code: "TI_TAX_001",
      title: "synthetic control",
      control_kind: "tax_rule",
      status: "approved",
      is_enabled: true,
      evaluator_key: PRODUCTION_CONTROL_EVALUATOR_KEYS.TI_TAX_001,
    },
  ],
  tax_control_rules: [{ tax_control_id: 10, tax_rule_id: 1 }],
  tax_rules: [{ id: 1, status: "approved" }],
  tax_rule_source_versions: [{ tax_rule_id: 1, tax_source_version_id: 1 }],
  tax_source_versions: [
    {
      id: 1,
      tax_source_id: 1,
      version_label: "synthetic",
      content_hash: "synthetic hash",
    },
  ],
  tax_sources: [
    { id: 1, provider: "e_gov", canonical_locator: "synthetic:source" },
  ],
};

export function fixture({
  failTable,
  mode = "error",
  data = structuredClone(initial),
  persist,
  failOffset = 0,
} = {}) {
  const calls = [],
    reads = [];
  const client = {
    from(table) {
      let rows = data[table] ?? [],
        single = false,
        start = 0,
        end = Infinity;
      const q = {
        select() {
          return q;
        },
        eq(k, v) {
          rows = rows.filter((r) =>
            k.includes("->")
              ? r.observed_inputs?._sunboo_execution?.id === v
              : r[k] === v,
          );
          return q;
        },
        in(k, values) {
          rows = rows.filter((r) => values.includes(r[k]));
          return q;
        },
        order() {
          return q;
        },
        range(a, b) {
          start = a;
          end = b;
          return q;
        },
        limit(n) {
          end = n - 1;
          return q;
        },
        maybeSingle() {
          single = true;
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve()
            .then(() => {
              reads.push({ table, start });
              if (table === failTable && start >= failOffset) {
                if (mode === "throw") throw Error("synthetic read exception");
                return {
                  data:
                    mode === "null" ? null : mode === "malformed" ? [{}] : null,
                  error:
                    mode === "error"
                      ? { message: "synthetic read failure" }
                      : null,
                };
              }
              const selected = rows.slice(start, end + 1);
              return {
                data: single ? (selected[0] ?? null) : selected,
                error: null,
              };
            })
            .then(resolve, reject);
        },
      };
      return q;
    },
    async rpc(name, args) {
      calls.push({ name, args });
      return persist
        ? persist(args)
        : {
            data: [
              {
                control_result_id: 100,
                review_case_id:
                  args.p_status === "unknown" || args.p_status === "review"
                    ? 200
                    : null,
              },
            ],
            error: null,
          };
    },
  };
  return { client, calls, reads, data };
}
