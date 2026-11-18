# Company 23 financial forecast registration proposal

Status: approved for implementation by the user on 2026-11-18. Production rollout follows reviewable PR/CI. No production change yet.

## Requested behavior

The user explicitly asks to save the supplied fictional closing data in SUNBOO as a forecast and continue. The current tax-returns screen says it records past submitted returns; its model contains no forecast discriminator and no general P&L or balance-sheet data. It feeds tax guidance. A fiscal-year label containing “forecast” would not change those semantics. Do not register the example there or in monthly growth fields.

Add a dedicated Japanese “決算見込” view, reachable from company home, with company-scoped fiscal periods and a clear “架空の試用データ” marker. The current company 23 tax return remains one completed FY2026/03 record.

## Proposed persisted record

One new company-scoped storage table for forecast snapshots; no change to existing tax-return semantics. Each record has company, fiscal start/end, scenario name, fictional flag, version, timestamps, and validated structured monetary inputs. Unique company + fiscal period + scenario. Store explicit zeros and absent values separately. Names/notes are plain text, no arbitrary executable content.

Proposed example: FY2027/03, 2026-04-01 through 2027-03-31, fictional forecast, not filed. Source is the delivered 2026-11-18 workbook.

| Input | JPY |
| --- | ---: |
| Revenue | 12000000 |
| COGS | 4800000 |
| Operating expenses | 6000000 |
| Other income / expenses, special gains / losses | 0 each |
| Tax expense assumption | 360000 |
| Capital / opening cash assumption | 3000000 |
| Opening retained earnings | 0 |
| New borrowing | 500000 |
| Collections | 10160000 |
| COGS cash payments | 4800000 |
| Operating cash payments | 5300000 |
| Tax cash payments assumption | 360000 |
| Equipment purchases, depreciation excluded | 200000 |

Derived values: pre-tax profit 1200000, net profit 840000, ending cash 3000000, receivables 1840000, assets 5040000, liabilities 1200000, equity 3840000, balance difference 0. Compute from the stored inputs instead of independently editable duplicate totals. Tax expense is an arbitrary sample input, not corporate-tax computation or a roadmap payment amount. Depreciation and tax adjustments remain excluded and visible.

## Isolation and access

- Reuse the established authenticated company authorization rules. No public access, share changes, new role grants, customer data, or new paid service.
- Do not pass forecasts into tax-return confidence, consumption-tax status, deadline engines, actual revenue, actual cash balances, payment schedules, or completion percentages.
- Persist through the normal application UI with input validation, in-flight edit protection, concurrency protection, response-loss readback, and visible failure states. No direct production insert for this task.
- No deletion, bulk import of existing migrations, actual filing, payment, or external contact.

## Reviewable acceptance criteria

1. The new view identifies the period and fictional forecast before any amounts.
2. All source inputs and derived totals above are retained after a fresh read.
3. Editing revenue by +1000000 changes profit and receivables by +1000000 and keeps the balance difference 0; restore the approved example before saving company 23.
4. Missing input stays missing; explicit zero survives reload. Formula or read failures never appear as successful zeros.
5. Company authorization denies another company; public/share surfaces do not expose the new records.
6. The past return count stays 1; existing tax guidance and monthly growth values remain unchanged.
7. Targeted tests, normal CI, and a reviewable PR precede release. Production rollout approval is requested only after that concrete result exists.

## Approval boundary

The requested data-entry operation is authorized. The application currently lacks a suitable destination. Adding a new persisted store/schema requires explicit approval under AGENTS.md; do not infer it from “enter the data.” The user answered the concrete scope question: add the forecast storage feature and proceed. This authorizes the scoped new company/year forecast store, its necessary atomic save function and narrow authorization, and the dedicated UI; no legacy bulk migrations or public access. Production rollout follows final reviewable PR/CI approval.
