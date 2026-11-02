import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migration = readFileSync(
  new URL(
    '../supabase/migrations/20261102113709_save_admin_office_atomic.sql',
    import.meta.url,
  ),
  'utf8',
);
const legacy = readFileSync(
  new URL('../supabase/migration_organizations.sql', import.meta.url),
  'utf8',
);
const tables = legacy.slice(
  legacy.indexOf('CREATE TABLE IF NOT EXISTS organization_types'),
  legacy.indexOf('CREATE TABLE IF NOT EXISTS procedure_organizations'),
);
const claims = {
  sub: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.invalid',
  is_anonymous: false,
};
const textFields =
  'postal_code address phone fax email website_url official_url fallback_url e_filing_url download_page_url map_url business_hours notes'.split(
    ' ',
  );
const values = {
  name: 'changed',
  organization_type_id: 1,
  organization_name: 'new org',
  official_url_status: 'unchecked',
  ...Object.fromEntries(textFields.map((k) => [k, ''])),
};
test('PostgreSQL office atomic save and authorization', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT (auth.jwt()->>'sub')::uuid$$;
 CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql AS $$SELECT auth.jwt()->>'email'$$;
 CREATE TABLE public.admin_users(email text PRIMARY KEY);INSERT INTO public.admin_users VALUES('admin@example.invalid');
 CREATE TABLE public.municipalities(id integer PRIMARY KEY);INSERT INTO public.municipalities VALUES(1),(2),(3);
 ${tables}
 GRANT USAGE ON SCHEMA auth,public TO anon,authenticated;
 GRANT SELECT ON public.admin_users,public.municipalities,public.organization_types TO authenticated;
 GRANT SELECT,INSERT,UPDATE,DELETE ON public.organizations,public.organization_offices,public.jurisdictions TO authenticated;
 GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
 ${['organizations', 'organization_offices', 'jurisdictions'].map((table) => `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;CREATE POLICY public_read ON public.${table} FOR SELECT USING(true);CREATE POLICY admin_write ON public.${table} FOR ALL USING(auth.email() IN (SELECT email FROM public.admin_users)) WITH CHECK(auth.email() IN (SELECT email FROM public.admin_users));`).join('\n')}
 CREATE FUNCTION public.synthetic_fail() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF current_setting('test.fail',true)=TG_TABLE_NAME||'.'||TG_OP THEN RAISE EXCEPTION 'synthetic stage failure';END IF;RETURN NULL;END$$;
 ${['organizations', 'organization_offices', 'jurisdictions'].map((table) => `CREATE TRIGGER synthetic_fail AFTER INSERT OR UPDATE OR DELETE ON public.${table} FOR EACH STATEMENT EXECUTE FUNCTION public.synthetic_fail();`).join('\n')}
 ${migration}`);
    async function identity(role = 'authenticated', jwt = claims) {
      await db.exec('RESET ROLE;SET ROLE ' + role);
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify(jwt),
      ]);
    }
    async function reset() {
      await db.exec(`RESET ROLE;select set_config('test.fail','',false);TRUNCATE public.organization_types,public.organizations,public.organization_offices,public.jurisdictions RESTART IDENTITY CASCADE;
 INSERT INTO public.organization_types(id,code,name) VALUES(1,'test','Test');INSERT INTO public.organizations(id,organization_type_id,name,official_url) VALUES(1,1,'shared','https://example.invalid');
 INSERT INTO public.organization_offices(id,organization_id,name) VALUES(1,1,'target'),(2,1,'untouched');
 INSERT INTO public.jurisdictions(municipality_id,organization_type_id,organization_office_id) VALUES(1,1,1),(3,1,2);
 SELECT setval('organizations_id_seq',1);SELECT setval('organization_offices_id_seq',2);`);
      await identity();
    }
    async function baseline(id = 1) {
      return (
        await db.query(
          `select jsonb_build_object('office',to_jsonb(o),'organization',to_jsonb(g),'jurisdictions',coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from public.jurisdictions j where j.organization_office_id=o.id),'[]')) as data from public.organization_offices o join public.organizations g on g.id=o.organization_id where o.id=$1`,
          [id],
        )
      ).rows[0]?.data;
    }
    async function snapshot() {
      return (
        await db.query(
          `select jsonb_build_object('organizations',(select jsonb_agg(to_jsonb(x) order by id) from public.organizations x),'offices',(select jsonb_agg(to_jsonb(x) order by id) from public.organization_offices x),'regions',(select jsonb_agg(to_jsonb(x) order by id) from public.jurisdictions x)) as data`,
        )
      ).rows[0].data;
    }
    async function call(id = 1, expected = null, v = values, ids = [2]) {
      return (
        await db.query(
          'select public.save_admin_office($1,$2,$3,$4) as result',
          [id, expected, JSON.stringify(v), ids],
        )
      ).rows[0].result;
    }
    for (const stage of [
      'organizations.INSERT',
      'organization_offices.UPDATE',
      'jurisdictions.DELETE',
      'jurisdictions.INSERT',
    ])
      await t.test('rollback ' + stage, async () => {
        await reset();
        const before = await snapshot(),
          b = await baseline();
        await db.query("select set_config('test.fail',$1,false)", [stage]);
        await assert.rejects(call(1, b), /synthetic stage failure/);
        assert.deepEqual(await snapshot(), before);
      });
    for (const stage of [
      'organizations.INSERT',
      'organization_offices.INSERT',
      'jurisdictions.DELETE',
      'jurisdictions.INSERT',
    ])
      await t.test('new rollback ' + stage, async () => {
        await reset();
        const before = await snapshot();
        await db.query("select set_config('test.fail',$1,false)", [stage]);
        await assert.rejects(call(null, null), /synthetic stage failure/);
        assert.deepEqual(await snapshot(), before);
      });
    await t.test(
      'save isolates shared organization and other office',
      async () => {
        await reset();
        const other = await baseline(2),
          old = (await snapshot()).organizations[0];
        const r = await call(1, await baseline());
        assert.equal(r.id, 1);
        assert.equal(r.snapshot.jurisdictions[0].municipality_id, 2);
        assert.deepEqual(await baseline(2), other);
        assert.deepEqual((await snapshot()).organizations[0], old);
      },
    );
    await t.test(
      'reuse shared organization without rewriting any fields; empty regions valid',
      async () => {
        await reset();
        const orgs = (await snapshot()).organizations;
        await call(
          1,
          await baseline(),
          { ...values, organization_name: 'shared' },
          [],
        );
        assert.deepEqual((await snapshot()).organizations, orgs);
        assert.deepEqual((await baseline()).jurisdictions, []);
      },
    );
    await t.test(
      'normal new and lost-response duplicate resend rejected',
      async () => {
        await reset();
        const r = await call(null, null, values, []);
        assert.equal(r.id, 3);
        const s = await snapshot();
        await assert.rejects(
          call(null, null, values, []),
          (e) => e.code === '23505',
        );
        assert.deepEqual(await snapshot(), s);
      },
    );
    await t.test(
      'stale editor refuses overwrite after successful save',
      async () => {
        await reset();
        const b = await baseline();
        await call(1, b);
        const s = await snapshot();
        await assert.rejects(call(1, b), (e) => e.code === '40001');
        assert.deepEqual(await snapshot(), s);
      },
    );
    await t.test(
      'simultaneous submissions from same baseline accept only one',
      async () => {
        await reset();
        const b = await baseline();
        const r = await Promise.allSettled([
          call(1, b),
          call(1, b, { ...values, name: 'other change' }),
        ]);
        assert.equal(r.filter((x) => x.status === 'fulfilled').length, 1);
        assert.equal(
          r.filter((x) => x.status === 'rejected' && x.reason.code === '40001')
            .length,
          1,
        );
      },
    );
    await t.test(
      'region-only concurrent change without timestamp change refused',
      async () => {
        await reset();
        const b = await baseline();
        await db.exec(
          'RESET ROLE;UPDATE public.jurisdictions SET municipality_id=2 WHERE organization_office_id=1',
        );
        await identity();
        const s = await snapshot();
        await assert.rejects(call(1, b), (e) => e.code === '40001');
        assert.deepEqual(await snapshot(), s);
      },
    );
    await t.test('shared organization concurrent change refused', async () => {
      await reset();
      const b = await baseline();
      await db.exec(
        "RESET ROLE;UPDATE public.organizations SET official_url='changed'",
      );
      await identity();
      const s = await snapshot();
      await assert.rejects(call(1, b), (e) => e.code === '40001');
      assert.deepEqual(await snapshot(), s);
    });
    await t.test('no reassignment of another office region', async () => {
      await reset();
      const s = await snapshot();
      await assert.rejects(
        call(1, await baseline(), values, [3]),
        (e) => e.code === '40001',
      );
      assert.deepEqual(await snapshot(), s);
    });
    for (const [label, role, jwt] of [
      ['anon', 'anon', {}],
      [
        'ordinary',
        'authenticated',
        { ...claims, email: 'other@example.invalid' },
      ],
      ['anonymous sign-in', 'authenticated', { ...claims, is_anonymous: true }],
      ['missing uid', 'authenticated', { email: claims.email }],
      ['service role', 'service_role', claims],
    ])
      await t.test('deny ' + label, async () => {
        await reset();
        const s = await snapshot(),
          b = await baseline();
        await identity(role, jwt);
        await assert.rejects(call(1, b), (e) => e.code === '42501');
        await identity();
        assert.deepEqual(await snapshot(), s);
      });
    await t.test(
      'invalid municipality, duplicate IDs and malformed input do not write',
      async () => {
        await reset();
        const s = await snapshot(),
          b = await baseline();
        for (const ids of [[999], [2, 2], [null]])
          await assert.rejects(call(1, b, values, ids));
        await assert.rejects(call(1, b, { ...values, name: '' }));
        assert.deepEqual(await snapshot(), s);
      },
    );
    await t.test('RLS denied DELETE cannot create mixed regions', async () => {
      await reset();
      await db.exec(
        'RESET ROLE;DROP POLICY admin_write ON public.jurisdictions;CREATE POLICY admin_insert ON public.jurisdictions FOR INSERT WITH CHECK(true)',
      );
      await identity();
      const s = await snapshot();
      await assert.rejects(
        call(1, await baseline()),
        (e) => e.code === '42501',
      );
      assert.deepEqual(await snapshot(), s);
    });
    await t.test('rollback removes only this function', async () => {
      await db.exec('RESET ROLE');
      const before = await snapshot();
      await db.exec(
        readFileSync(
          new URL(
            '../supabase/rollback/save_admin_office_atomic.sql',
            import.meta.url,
          ),
          'utf8',
        ),
      );
      assert.deepEqual(await snapshot(), before);
      assert.equal(
        (
          await db.query(
            "select to_regprocedure('public.save_admin_office(integer,jsonb,jsonb,integer[])') as f",
          )
        ).rows[0].f,
        null,
      );
    });
  } finally {
    await db.close();
  }
});
