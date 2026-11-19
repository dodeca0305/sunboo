// 第1弾パッチ（scripts/sql/20261119-designated-cities-stage1.sql）の隔離検証。
// インメモリPGliteのみ使用（ネットワーク・本番・.envなし）。リポジトリの制約を最小限で再現した合成データで、
// 実際のパッチSQLを実行する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const PATCH = readFileSync(new URL('./sql/20261119-designated-cities-stage1.sql', import.meta.url), 'utf8');

const WARDS = [
  ['04', '041', '仙台市', [['041017', '青葉区'], ['041025', '宮城野区'], ['041033', '若林区'], ['041041', '太白区'], ['041050', '泉区']]],
  ['11', '111', 'さいたま市', [['111015', '西区'], ['111023', '北区'], ['111031', '大宮区'], ['111040', '見沼区'], ['111058', '中央区'], ['111066', '桜区'], ['111074', '浦和区'], ['111082', '南区'], ['111091', '緑区'], ['111104', '岩槻区']]],
  ['12', '121', '千葉市', [['121011', '中央区'], ['121029', '花見川区'], ['121037', '稲毛区'], ['121045', '若葉区'], ['121053', '緑区'], ['121061', '美浜区']]],
];
const EXPECT = {
  仙台市: ['仙台市 財政局 資産課税課 償却資産係（北庁舎1階）', '980-8671', '宮城県仙台市青葉区二日町1番1号（仙台市役所北庁舎1階）', '022-214-8619', 'https://www.city.sendai.jp/sisanze-chose/kurashi/tetsuzuki/zekin/kekaku/tebiki/shisanze.html'],
  さいたま市: ['さいたま市 南部市税事務所 資産課税課 償却資産係（ときわ会館1階）', '330-0061', '埼玉県さいたま市浦和区常盤6丁目4番21号（ときわ会館1階）', '048-829-1186', 'https://www.city.saitama.lg.jp/001/153/004/002/002/004/p009364.html'],
  千葉市: ['千葉市 東部市税事務所 法人課 償却資産班（若葉区役所内）', '264-8582', '千葉県千葉市若葉区桜木北2丁目1番1号（若葉区役所内）', '043-233-8146', 'https://www.city.chiba.jp/zaiseikyoku/zeimu/tobushizei/hojin/syoukyakushisan.html'],
};

// リポジトリ（supabase/migration_national_submission_directory.sql, schema.sql）から転記した最小スキーマ。
const SCHEMA = `
CREATE TABLE prefectures (id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
CREATE TABLE municipalities (id SERIAL PRIMARY KEY, prefecture_id INT NOT NULL REFERENCES prefectures(id), code TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
CREATE TABLE organization_types (code TEXT PRIMARY KEY);
CREATE TABLE procedures (id SERIAL PRIMARY KEY, code TEXT NOT NULL UNIQUE);
CREATE TABLE submission_offices (
  id SERIAL PRIMARY KEY, office_category TEXT NOT NULL REFERENCES organization_types(code), organization_name TEXT,
  name TEXT NOT NULL, postal_code TEXT, address TEXT, phone TEXT, fax TEXT, email TEXT, website_url TEXT, official_url TEXT,
  e_filing_url TEXT, download_page_url TEXT, map_url TEXT, business_hours TEXT, notes TEXT,
  official_url_status TEXT NOT NULL DEFAULT 'unchecked' CHECK (official_url_status IN ('ok','broken','redirected','unchecked')),
  official_url_checked_at TIMESTAMPTZ, fallback_url TEXT, data_version INT NOT NULL DEFAULT 1, last_verified_at DATE, verification_due_at DATE,
  update_frequency TEXT NOT NULL DEFAULT 'annual' CHECK (update_frequency IN ('monthly','quarterly','annual','on_change','unknown')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (office_category, name));
CREATE TABLE office_sources (
  id SERIAL PRIMARY KEY, office_id INT NOT NULL REFERENCES submission_offices(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('nta','moj','nenkin','mhlw','pref_government','municipal_government','other')),
  publisher_name TEXT NOT NULL, source_url TEXT, retrieved_at DATE NOT NULL,
  verification_method TEXT NOT NULL CHECK (verification_method IN ('official_page_check','phone_confirmation','pdf_document','csv_import','other')),
  verified_by TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','superseded','retracted')),
  is_current BOOLEAN NOT NULL DEFAULT TRUE, snapshot JSONB, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX ux_office_sources_current ON office_sources (office_id) WHERE is_current = true;
CREATE TABLE submission_jurisdictions (
  id SERIAL PRIMARY KEY, office_id INT NOT NULL REFERENCES submission_offices(id) ON DELETE CASCADE,
  office_category TEXT NOT NULL REFERENCES organization_types(code),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('municipality','prefecture','national')),
  municipality_scope_id INT REFERENCES municipalities(id), prefecture_scope_id INT REFERENCES prefectures(id),
  is_primary BOOLEAN NOT NULL DEFAULT TRUE, priority INT NOT NULL DEFAULT 0, effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE, notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((scope_type = 'municipality' AND municipality_scope_id IS NOT NULL AND prefecture_scope_id IS NULL)
    OR (scope_type = 'prefecture' AND prefecture_scope_id IS NOT NULL AND municipality_scope_id IS NULL)
    OR (scope_type = 'national' AND municipality_scope_id IS NULL AND prefecture_scope_id IS NULL)));
CREATE UNIQUE INDEX ux_submission_jurisdictions_muni_primary ON submission_jurisdictions(municipality_scope_id, office_category)
  WHERE scope_type = 'municipality' AND is_primary = true AND effective_to IS NULL;
CREATE TABLE procedure_submission_rules (
  id SERIAL PRIMARY KEY, procedure_id INT NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  office_category TEXT NOT NULL REFERENCES organization_types(code), conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipient_scope TEXT NOT NULL DEFAULT 'company' CHECK (recipient_scope IN ('company','each_employee','other')),
  priority INT NOT NULL DEFAULT 0, is_active BOOLEAN NOT NULL DEFAULT TRUE, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (procedure_id, office_category, priority));
`;

async function fresh() {
  const db = new PGlite();
  await db.exec(SCHEMA);
  await db.exec(`INSERT INTO organization_types VALUES ('municipal_asset_tax'),('tax_office'),('municipal_tax');
    INSERT INTO procedures (code) VALUES ('DEPRECIABLE_ASSET_TAX_RETURN'),('OTHER');
    INSERT INTO procedure_submission_rules (procedure_id, office_category) SELECT id,'municipal_asset_tax' FROM procedures WHERE code='DEPRECIABLE_ASSET_TAX_RETURN';
    INSERT INTO prefectures (code,name) VALUES ('04','宮城県'),('11','埼玉県'),('12','千葉県'),('40','福岡県');
    INSERT INTO municipalities (prefecture_id, code, name) SELECT id,'401331','福岡市中央区' FROM prefectures WHERE code='40';`);
  for (const [pref, , city, wards] of WARDS)
    for (const [code, ward] of wards)
      await db.query('INSERT INTO municipalities (prefecture_id, code, name) SELECT id,$1,$2 FROM prefectures WHERE code=$3', [code, city + ward, pref]);
  // 無関係な窓口・情報源・管轄（変化しないことの目印）
  await db.exec(`INSERT INTO submission_offices (office_category,name,phone) VALUES ('tax_office','SENTINEL税務署','000');
    INSERT INTO office_sources (office_id,source_type,publisher_name,retrieved_at,verification_method) SELECT id,'nta','国税庁','2026-07-03','official_page_check' FROM submission_offices;
    INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id) SELECT o.id,'tax_office','municipality',m.id FROM submission_offices o, municipalities m WHERE m.code='401331';`);
  return db;
}
async function dump(db) {
  let s = '';
  for (const t of ['submission_offices', 'office_sources', 'submission_jurisdictions', 'procedure_submission_rules'])
    s += (await db.query(`SELECT to_jsonb(t) AS j FROM ${t} t ORDER BY id`)).rows.map((r) => JSON.stringify(r.j)).join('\n') + '\n--\n';
  return s;
}
async function applyOk(db) { await db.exec(PATCH); }
async function applyFails(db, re) {
  const before = await dump(db); // 失敗前の状態（BEGINより前）
  let err;
  try { await db.exec(PATCH); } catch (e) { err = e; }
  assert.ok(err, '失敗するはず');
  if (re) assert.match(String(err.message), re);
  try { await db.exec('ROLLBACK'); } catch { /* 既に終了 */ }
  assert.equal(await dump(db), before, '失敗後に状態が変化していない');
  return err;
}

const results = [];
const test = async (name, fn) => { await fn(); results.push(name); console.log('PASS', name); };

await test('成功：窓口3・情報源3・管轄21が正確、無関係な行は不変', async () => {
  const db = await fresh();
  const before = await dump(db);
  await applyOk(db);
  const o = (await db.query(`SELECT * FROM submission_offices WHERE office_category='municipal_asset_tax' ORDER BY id`)).rows;
  assert.equal(o.length, 3);
  for (const r of o) {
    const [name, postal, addr, phone, url] = EXPECT[r.organization_name];
    assert.equal(r.name, name); assert.equal(r.postal_code, postal); assert.equal(r.address, addr);
    assert.equal(r.phone, phone); assert.equal(r.official_url, url);
    assert.equal(r.fax, null); assert.equal(r.e_filing_url, null); assert.equal(r.download_page_url, null);
    assert.equal(r.official_url_status, 'ok'); assert.equal(r.official_url_checked_at, null);
    assert.equal(r.verification_due_at, null); assert.equal(r.update_frequency, 'unknown');
    assert.equal(r.last_verified_at.toISOString().slice(0, 10), '2026-11-19');
    assert.match(r.notes, /区ごと.*R9未確認.*画面は別途改修/);
    assert.doesNotMatch(r.notes, /法人市民税|税率|免税点|期限/);
  }
  const s = (await db.query(`SELECT s.*, o.organization_name FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE o.office_category='municipal_asset_tax'`)).rows;
  assert.equal(s.length, 3);
  for (const r of s) {
    assert.equal(r.source_type, 'municipal_government'); assert.equal(r.verification_method, 'official_page_check');
    assert.equal(r.verified_by, null); assert.equal(r.status, 'active'); assert.equal(r.is_current, true);
    assert.equal(r.source_url, EXPECT[r.organization_name][4]);
    assert.equal(r.retrieved_at.toISOString().slice(0, 10), '2026-11-19');
    assert.equal(r.snapshot.r9_form, 'unconfirmed'); assert.equal(r.snapshot.patch, 'designated-cities-stage1-20261119');
  }
  const j = (await db.query(`SELECT m.code, o.organization_name, j.is_primary, j.priority, j.scope_type, j.effective_to FROM submission_jurisdictions j
    JOIN submission_offices o ON o.id=j.office_id JOIN municipalities m ON m.id=j.municipality_scope_id WHERE j.office_category='municipal_asset_tax' ORDER BY m.code`)).rows;
  assert.equal(j.length, 21);
  for (const [, , city, wards] of WARDS) for (const [code] of wards) {
    const r = j.find((x) => x.code === code);
    assert.ok(r, code); assert.equal(r.organization_name, city); assert.equal(r.is_primary, true);
    assert.equal(r.priority, 0); assert.equal(r.scope_type, 'municipality'); assert.equal(r.effective_to, null);
  }
  // 無関係な行は同一
  const unrelated = (t, col) => db.query(`SELECT to_jsonb(t) j FROM ${t} t WHERE ${col} NOT IN (SELECT id FROM submission_offices WHERE office_category='municipal_asset_tax') ORDER BY id`);
  const after = await dump(db);
  for (const line of before.split('\n').filter((l) => l && l !== '--')) assert.ok(after.includes(line), '既存行が不変: ' + line.slice(0, 40));
  assert.ok((await unrelated('submission_offices', 'id')).rows.length === 1);
});

await test('同一パッチの再適用は完全no-op（全表が同一）', async () => {
  const db = await fresh(); await applyOk(db);
  const a = await dump(db); await applyOk(db); assert.equal(await dump(db), a);
  assert.deepEqual((await db.query(`SELECT DISTINCT effective_from::text d FROM submission_jurisdictions WHERE office_category='municipal_asset_tax'`)).rows.map((r) => r.d), ['2026-11-19']);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE office_category='municipal_asset_tax' AND data_version=1`)).rows[0].n, 3);
});

await test('区が欠けている場合は失敗しロールバック', async () => {
  const db = await fresh();
  await db.exec(`DELETE FROM municipalities WHERE code='111104'`);
  await applyFails(db, /公開マスター照合/);
});
await test('都道府県が正規コードでない場合は失敗', async () => {
  const db = await fresh();
  await db.exec(`UPDATE prefectures SET code='99' WHERE code='12'`);
  await applyFails(db, /公開マスター照合/);
});
await test('市接頭辞や名称が違う区は失敗', async () => {
  const db = await fresh();
  await db.exec(`UPDATE municipalities SET name='千葉市中央区X' WHERE code='121011'`);
  await applyFails(db, /公開マスター照合/);
});

await test('同じ市・同じ区分の既存窓口があれば失敗（上書きしない）', async () => {
  const db = await fresh();
  await db.exec(`INSERT INTO submission_offices (office_category,organization_name,name) VALUES ('municipal_asset_tax','仙台市','別名の窓口')`);
  await applyFails(db, /既に存在/);
});
await test('同じ名称の既存窓口があれば失敗', async () => {
  const db = await fresh();
  await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','千葉市 東部市税事務所 法人課 償却資産班（若葉区役所内）')`);
  await applyFails(db, /既に存在/);
});
await test('21区のいずれかに既存の主管轄があれば失敗', async () => {
  const db = await fresh();
  await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','他の窓口');
    INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id)
    SELECT o.id,'municipal_asset_tax','municipality',m.id FROM submission_offices o, municipalities m WHERE o.name='他の窓口' AND m.code='111058'`);
  await applyFails(db, /既に存在/);
});

await test('規則が想定と違う場合は失敗（変更・複数・無効のみ）', async () => {
  for (const sql of [
    `UPDATE procedure_submission_rules SET office_category='tax_office'`,
    `UPDATE procedure_submission_rules SET conditions='[{"x":1}]'::jsonb`,
    `UPDATE procedure_submission_rules SET priority=1`,
    `UPDATE procedure_submission_rules SET recipient_scope='other'`,
    `UPDATE procedure_submission_rules SET is_active=false`,
    `INSERT INTO procedure_submission_rules (procedure_id,office_category,priority) SELECT id,'tax_office',5 FROM procedures WHERE code='DEPRECIABLE_ASSET_TAX_RETURN'`,
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /規則/); }
});

await test('部分適用・内容が変わった状態は再適用で失敗', async () => {
  for (const sql of [
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='041050')`,
    `DELETE FROM office_sources WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='千葉市')`,
    `DELETE FROM submission_offices WHERE organization_name='さいたま市'`,
    `UPDATE submission_offices SET phone='000' WHERE organization_name='仙台市'`,
    `UPDATE submission_offices SET data_version=2 WHERE organization_name='千葉市'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'tax_office','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='仙台市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='さいたま市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,prefecture_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','prefecture',p.id,false FROM submission_offices o, prefectures p WHERE o.organization_name='千葉市' AND p.code='40'`,
    `UPDATE submission_jurisdictions SET effective_from=DATE '2026-11-20' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='111015')`,
    `UPDATE submission_jurisdictions SET notes='x' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='121011')`,
    `UPDATE office_sources SET snapshot='{}'::jsonb WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='仙台市')`,
  ]) { const db = await fresh(); await applyOk(db); await db.exec(sql); await applyFails(db, /完全な適用済み状態ではありません|既に存在/); }
});

await test('書込途中のCHECK拒否（2窓口と先の管轄の追加後）でも全体がロールバック', async () => {
  const db = await fresh();
  // 実行順は市接頭辞順（仙台→さいたま→千葉）。3件目の窓口で拒否し、先の2窓口とその管轄が残らないことを確認。
  await db.exec(`ALTER TABLE submission_offices ADD CONSTRAINT t_mid CHECK (organization_name IS DISTINCT FROM '千葉市')`);
  const err = await applyFails(db, /t_mid/);
  assert.ok(err);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE office_category='municipal_asset_tax'`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions WHERE office_category='municipal_asset_tax'`)).rows[0].n, 0);
  // 原因を除けば同じDBへ正常に適用できる
  await db.exec(`ALTER TABLE submission_offices DROP CONSTRAINT t_mid`);
  await applyOk(db);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions WHERE office_category='municipal_asset_tax'`)).rows[0].n, 21);
});

await test('パッチはINSERT専用（UPDATE/DELETE/DDL/GRANT/ON CONFLICTなし、本番自動実行なし）', async () => {
  const body = PATCH.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(body, /\b(GRANT|REVOKE|ALTER|TRUNCATE|DROP (TABLE|POLICY|FUNCTION|INDEX)|CREATE (POLICY|FUNCTION|INDEX|TABLE))\b/i);
  assert.doesNotMatch(body, /ON CONFLICT/i);
  assert.doesNotMatch(body, /\bUPDATE\b|\bDELETE\b/i);
  assert.match(body, /^\s*BEGIN;/m); assert.match(body, /COMMIT;\s*$/);
  assert.match(body, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(body, /SHARE ROW EXCLUSIVE MODE/);
});

console.log(`ALL ${results.length} PASS`);
