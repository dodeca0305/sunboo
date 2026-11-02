// Local synthetic business data only. Never forward REST mutations or persistence RPCs.
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const u = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  );
  const method = (
    init?.method ?? (input instanceof Request ? input.method : "GET")
  ).toUpperCase();
  if (
    u.origin === process.env.NEXT_PUBLIC_SUPABASE_URL &&
    u.pathname.startsWith("/rest/v1/")
  ) {
    const file = process.env.TAX_EXECUTION_CONTROL_FILE,
      c = JSON.parse(readFileSync(file, "utf8")),
      table = u.pathname.split("/").at(-1);
    // Identity/admin membership lookup is read-only; every business table is synthetic.
    if (table === "admin_users" && ["GET", "HEAD"].includes(method))
      return realFetch(input, init);
    if (
      method === "POST" &&
      table === "persist_workspace_tax_control_evaluation"
    ) {
      const body = JSON.parse(init?.body ?? (await input.text()));
      appendFileSync(file + ".calls", JSON.stringify(body) + "\n");
      if (c.saveFailure)
        return Response.json(
          { message: "synthetic rollback" },
          { status: 400 },
        );
      const id = body.p_observed_inputs._sunboo_execution.id;
      let result = c.data.workspace_tax_control_results.find(
        (r) =>
          r.observed_inputs._sunboo_execution.id === id &&
          r.company_id === body.p_company_id,
      );
      if (!result) {
        result = {
          id: 100,
          company_id: body.p_company_id,
          tax_control_id: body.p_tax_control_id,
          as_of_date: body.p_as_of_date,
          applicable: body.p_applicable,
          status: body.p_status,
          observed_inputs: body.p_observed_inputs,
        };
        c.data.workspace_tax_control_results.push(result);
        if (["unknown", "review"].includes(body.p_status))
          c.data.workspace_tax_review_cases.push({
            id: 200,
            company_id: body.p_company_id,
            control_result_id: 100,
            status: "open",
          });
        writeFileSync(file, JSON.stringify(c));
      }
      if (c.lostResponse) throw Error("synthetic response lost after commit");
      return Response.json([
        {
          control_result_id: 100,
          review_case_id: ["unknown", "review"].includes(body.p_status)
            ? 200
            : null,
        },
      ]);
    }
    if (!["GET", "HEAD"].includes(method)) {
      appendFileSync(file + ".blocked", method + " " + table + "\n");
      throw Error("Synthetic test forbids real writes");
    }
    if (c.failTable === table)
      return Response.json(
        { message: "synthetic read failure" },
        { status: 400 },
      );
    let rows = c.data[table] ?? [];
    for (const [k, v] of u.searchParams) {
      if (v.startsWith("eq."))
        rows = rows.filter(
          (r) =>
            String(
              k.includes("->")
                ? r.observed_inputs?._sunboo_execution?.id
                : r[k],
            ) === v.slice(3),
        );
      if (v.startsWith("in.(")) {
        const vs = v
          .slice(4, -1)
          .split(",")
          .map((x) => x.replace(/^"|"$/g, ""));
        rows = rows.filter((r) => vs.includes(String(r[k])));
      }
    }
    const start = Number(u.searchParams.get("offset") ?? 0),
      limit = Number(u.searchParams.get("limit") ?? 1000);
    rows = rows.slice(start, start + limit);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    return Response.json(
      headers.get("accept")?.includes("vnd.pgrst.object+json")
        ? (rows[0] ?? null)
        : rows,
    );
  }
  return realFetch(input, init);
};
