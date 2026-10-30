// Run with PGLITE_MODULE pointing to an installed @electric-sql/pglite entry.
// Uses an isolated in-memory PostgreSQL database. No production connection.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const { PGlite } = await import(process.env.PGLITE_MODULE ?? '@electric-sql/pglite');
const sql = await readFile(new URL('../supabase/migration_ti_tax_001_draft_rule_clarification.sql', import.meta.url), 'utf8');
const oldText = sql.match(/previous_text TEXT := '([^']+)';/)[1];
const newText = sql.match(/revised_text TEXT := '([^']+)';/)[1];
const cases = [
  { name: 'draft updates only text', status: 'draft', text: oldText, version: 1, ok: true, updated: true },
  { name: 'repeated application is unchanged', status: 'draft', text: newText, version: 1, ok: true },
  { name: 'approved rule rejected', status: 'approved', text: oldText, version: 1, ok: false },
  { name: 'retired rule rejected', status: 'retired', text: oldText, version: 1, ok: false },
  { name: 'edited draft rejected', status: 'draft', text: 'other edit', version: 1, ok: false },
  { name: 'missing version rejected', status: 'draft', text: oldText, version: 2, ok: false },
];
for (const scenario of cases) {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE tax_rules (
      rule_code text NOT NULL, version_no integer NOT NULL,
      rule_statement text NOT NULL, status text NOT NULL,
      approved_by text, approved_at timestamptz,
      PRIMARY KEY(rule_code, version_no));`);
    await db.query('INSERT INTO tax_rules VALUES ($1,$2,$3,$4,NULL,NULL)', ['TI_RULE_CORP_FINAL_RETURN_DEADLINE', scenario.version, scenario.text, scenario.status]);
    await db.query('INSERT INTO tax_rules VALUES ($1,1,$2,$3,NULL,NULL)', ['UNRELATED', 'untouched', 'draft']);
    if (scenario.ok) await db.exec(sql);
    else {
      await assert.rejects(db.exec(sql));
      await db.exec('ROLLBACK');
    }
    const { rows } = await db.query("SELECT * FROM tax_rules WHERE rule_code='TI_RULE_CORP_FINAL_RETURN_DEADLINE'");
    assert.equal(rows[0].rule_statement, scenario.updated ? newText : scenario.text);
    assert.equal(rows[0].status, scenario.status);
    assert.equal(rows[0].approved_by, null);
    assert.equal(rows[0].approved_at, null);
    assert.equal((await db.query("SELECT rule_statement FROM tax_rules WHERE rule_code='UNRELATED'")).rows[0].rule_statement, 'untouched');
    if (scenario.updated) {
      await db.exec(sql);
      assert.equal((await db.query("SELECT rule_statement FROM tax_rules WHERE rule_code='TI_RULE_CORP_FINAL_RETURN_DEADLINE'")).rows[0].rule_statement, newText);
    }
    console.log(`PASS: ${scenario.name}`);
  } finally { await db.close(); }
}
