import { readFileSync } from "node:fs";
export const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20261102232415_protect_tax_execution_requests.sql",
    import.meta.url,
  ),
  "utf8",
);
const legacy = readFileSync(
  new URL(
    "../../supabase/migration_workspace_tax_control_results_reviews.sql",
    import.meta.url,
  ),
  "utf8",
);
const baseline = readFileSync(
  new URL(
    "../../supabase/migration_tax_intelligence_atomic_evaluation_persistence.sql",
    import.meta.url,
  ),
  "utf8",
);
export const claims = {
  sub: "00000000-0000-0000-0000-000000000001",
  email: "admin@example.invalid",
  is_anonymous: false,
};
// Local fixture only. Production applies ONLY the single function migration.
export const setup = `CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$SELECT auth.jwt()->>'email'$$;
CREATE TABLE admin_users(email text primary key); INSERT INTO admin_users VALUES('admin@example.invalid');
CREATE TABLE workspace_companies(id integer primary key); INSERT INTO workspace_companies VALUES(23),(24);
CREATE TABLE workspace_members(company_id integer, email text, role text);
INSERT INTO workspace_members VALUES(23,'admin@example.invalid','owner');
CREATE FUNCTION is_workspace_member(p_company_id integer,p_roles text[] DEFAULT ARRAY['owner','member','viewer']) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT EXISTS(SELECT 1 FROM workspace_members WHERE company_id=p_company_id AND email=auth.email() AND role=ANY(p_roles))$$;
CREATE TABLE tax_controls(id integer primary key); INSERT INTO tax_controls VALUES(10),(11);
CREATE FUNCTION update_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN NEW.updated_at=clock_timestamp();RETURN NEW;END$$;
GRANT USAGE ON SCHEMA auth,public TO authenticated,anon;
GRANT SELECT ON admin_users,workspace_members,workspace_companies,tax_controls TO authenticated;
${legacy}
${baseline}
${migration}
CREATE FUNCTION synthetic_fail_tax() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF current_setting('test.fail',true)=TG_TABLE_NAME THEN RAISE EXCEPTION 'synthetic stage failure'; END IF; RETURN NEW;END$$;
${["workspace_tax_control_results", "workspace_tax_review_cases", "workspace_tax_review_case_events"].map((t) => `CREATE TRIGGER z_fail AFTER INSERT ON ${t} FOR EACH ROW EXECUTE FUNCTION synthetic_fail_tax();`).join("\n")}`;
export const intent = {
  companyId: 23,
  taxControlId: 10,
  asOfDate: "2026-11-03",
  liquidationResidualAssetsCase: "unknown",
};
export const executionId = "11111111-1111-4111-8111-111111111111";
export const args = [
  23,
  10,
  "2026-11-03",
  true,
  "unknown",
  "synthetic",
  "synthetic summary",
  {
    value: 1,
    _sunboo_execution: {
      id: executionId,
      intent,
      inputSnapshot: { synthetic: true },
    },
  },
  [{ contentHash: "synthetic" }],
  "synthetic-v1",
  "synthetic title",
  "synthetic summary",
];
export const sql =
  "SELECT * FROM public.persist_workspace_tax_control_evaluation($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)";
export const parameters = (a = args) =>
  a.map((v, i) => ([7, 8].includes(i) ? JSON.stringify(v) : v));
export const snapshotSQL = `SELECT jsonb_build_object('results',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from workspace_tax_control_results x),'reviews',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from workspace_tax_review_cases x),'events',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from workspace_tax_review_case_events x)) as data`;
export async function identity(db, jwt = claims, role = "authenticated") {
  await db.exec("RESET ROLE; SET ROLE " + role);
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify(jwt),
  ]);
}
