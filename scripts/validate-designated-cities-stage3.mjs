// 第2弾パッチ（scripts/sql/20261119-designated-cities-stage3.sql）の隔離検証。
// インメモリPGliteのみ使用（ネットワーク・本番・.envなし）。リポジトリの制約を最小限で再現した合成データで、
// 実際のパッチSQLを実行する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const PATCH = readFileSync(new URL('./sql/20261119-designated-cities-stage3.sql', import.meta.url), 'utf8');

const WARDS = [
  ['15', ['1510'], '新潟市', [['151017', '北区'], ['151025', '東区'], ['151033', '中央区'], ['151041', '江南区'], ['151050', '秋葉区'], ['151068', '南区'], ['151076', '西区'], ['151084', '西蒲区']]],
  ['22', ['2210'], '静岡市', [['221015', '葵区'], ['221023', '駿河区'], ['221031', '清水区']]],
  ['22', ['2213', '2214'], '浜松市', [['221384', '中央区'], ['221392', '浜名区'], ['221406', '天竜区']]],
];
const CITIES = WARDS.map((w) => w[2]);
const EXPECT = {
  新潟市: ['新潟市 資産税課 償却資産係（古町ルフル3階）', '951-8554', '新潟県新潟市中央区古町通7番町1010番地（古町ルフル3階）', '025-226-2277', 'https://lgpos.task-asp.net/cu/151009/ea/residents/procedures/apply/1d2d117d-bbdb-4325-80f1-68b6dbc01674/start'],
  静岡市: ['静岡市 固定資産税課 償却資産係（静岡庁舎新館2階）', '420-8602', '静岡県静岡市葵区追手町5番1号（静岡庁舎新館2階）', '054-221-1048', 'https://www.city.shizuoka.lg.jp/shinsei/s5724/p2536.html'],
  浜松市: ['浜松市 資産税課 償却資産グループ（元目分庁舎3階）', '430-0948', '静岡県浜松市中央区元目町120番地の1（元目分庁舎3階）', '053-457-2156', 'https://www.city.hamamatsu.shizuoka.jp/shisanze/zei/shisanze/shoukyaku2.html'],
};
// 3市とも様式ページURLは公式ページURLと同じ（正しい。別URLを要求しない）。
const NIIGATA_PDF = 'https://www.city.niigata.lg.jp/kurashi/zei/siraberu/koteishisan/sinkoku.files/2026TEBIKIZENTAI.pdf';
const MUNI_OFFICES = `office_category='municipal_asset_tax' AND organization_name IN ('新潟市','静岡市','浜松市')`;

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

const opened = [];
async function fresh() {
  const db = new PGlite();
  opened.push(db);
  await db.exec(SCHEMA);
  await db.exec(`INSERT INTO organization_types VALUES ('municipal_asset_tax'),('tax_office'),('municipal_tax');
    INSERT INTO procedures (code) VALUES ('DEPRECIABLE_ASSET_TAX_RETURN'),('OTHER');
    INSERT INTO procedure_submission_rules (procedure_id, office_category) SELECT id,'municipal_asset_tax' FROM procedures WHERE code='DEPRECIABLE_ASSET_TAX_RETURN';
    INSERT INTO prefectures (code,name) VALUES ('15','新潟県'),('22','静岡県'),('40','福岡県');
    INSERT INTO municipalities (prefecture_id, code, name) SELECT id,'401331','福岡市中央区' FROM prefectures WHERE code='40';`);
  for (const [pref, , city, wards] of WARDS)
    for (const [code, ward] of wards)
      await db.query('INSERT INTO municipalities (prefecture_id, code, name) SELECT id,$1,$2 FROM prefectures WHERE code=$3', [code, city + ward, pref]);
  // 無関係な窓口・情報源・管轄（変化しないことの目印）
  await db.exec(`INSERT INTO submission_offices (office_category,name,phone) VALUES ('tax_office','SENTINEL税務署','000'),('municipal_asset_tax','SENTINEL既存市窓口','111');
    INSERT INTO office_sources (office_id,source_type,publisher_name,retrieved_at,verification_method) SELECT id,'nta','国税庁','2026-07-03','official_page_check' FROM submission_offices;
    INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id) SELECT o.id,o.office_category,'municipality',m.id FROM submission_offices o, municipalities m WHERE m.code='401331';`);
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
const test = async (name, fn) => {
  try { await fn(); } finally { while (opened.length) await opened.pop().close(); }
  results.push(name); console.log('PASS', name);
};

await test('成功：窓口3・情報源3・管轄14が正確、無関係な行（市窓口の見張り含む）は不変', async () => {
  const db = await fresh();
  const before = await dump(db);
  await applyOk(db);
  const o = (await db.query(`SELECT * FROM submission_offices WHERE ${MUNI_OFFICES} ORDER BY id`)).rows;
  assert.equal(o.length, 3);
  for (const r of o) {
    const [name, postal, addr, phone, url] = EXPECT[r.organization_name];
    assert.equal(r.name, name); assert.equal(r.postal_code, postal); assert.equal(r.address, addr);
    assert.equal(r.phone, phone); assert.equal(r.official_url, url);
    assert.equal(r.fax, null); assert.equal(r.email, null); assert.equal(r.e_filing_url, null); assert.equal(r.download_page_url, null);
    assert.equal(r.official_url_status, 'ok'); assert.equal(r.official_url_checked_at, null);
    assert.equal(r.verification_due_at, null); assert.equal(r.update_frequency, 'unknown'); assert.equal(r.data_version, 1);
    assert.equal(r.last_verified_at.toISOString().slice(0, 10), '2026-11-19');
    assert.match(r.notes, /R9未確認/);
    assert.match(r.notes, /資産がある区ごとに書類を用意/);
    assert.doesNotMatch(r.notes, /法人市民税|税率|免税点|期限/);
    if (r.organization_name === '新潟市') {
      assert.match(r.notes, /区役所・出張所では受け付けていない/);
      assert.equal(r.phone, '025-226-2277'); assert.doesNotMatch(r.phone, /2266/);
    }
  }
  const s = (await db.query(`SELECT s.*, o.organization_name FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE ${MUNI_OFFICES.replace(/organization_name|office_category/g, (m) => 'o.' + m)}`)).rows;
  assert.equal(s.length, 3);
  for (const r of s) {
    assert.equal(r.source_type, 'municipal_government'); assert.equal(r.verification_method, 'official_page_check');
    assert.equal(r.verified_by, null); assert.equal(r.status, 'active'); assert.equal(r.is_current, true);
    assert.equal(r.source_url, EXPECT[r.organization_name][4]);
    assert.equal(r.retrieved_at.toISOString().slice(0, 10), '2026-11-19');
    const sn = r.snapshot;
    assert.equal(sn.patch, 'designated-cities-stage3-20261119'); assert.equal(sn.r9_form, 'unconfirmed');
    assert.equal(sn.contact_status, 'verified'); assert.equal(sn.checked_on, '2026-11-19');
    assert.equal(sn.per_ward_filing, 'verified');
    assert.equal(sn.urls.contact_filing_url, EXPECT[r.organization_name][4]);
    assert.equal(sn.urls.form_page_url, EXPECT[r.organization_name][4]); // 公式ページと同じURLで正しい
    if (r.organization_name === '新潟市') {
      assert.equal(sn.urls.per_ward_filing_evidence_url, NIIGATA_PDF); assert.equal(sn.per_ward_filing_evidence_page, 1);
    } else { assert.equal(sn.urls.per_ward_filing_evidence_url, undefined); assert.equal(sn.per_ward_filing_evidence_page, undefined); }
    assert.doesNotMatch(r.notes ?? '', /R8をR9として扱う(?!わない)/);
  }
  const j = (await db.query(`SELECT m.code, o.organization_name, j.is_primary, j.priority, j.scope_type, j.effective_to, j.effective_from::text AS ef, j.notes, j.prefecture_scope_id FROM submission_jurisdictions j
    JOIN submission_offices o ON o.id=j.office_id JOIN municipalities m ON m.id=j.municipality_scope_id WHERE j.office_category='municipal_asset_tax' AND o.name <> 'SENTINEL既存市窓口' ORDER BY m.code`)).rows;
  assert.equal(j.length, 14);
  for (const [, , city, wards] of WARDS) for (const [code] of wards) {
    const r = j.find((x) => x.code === code);
    assert.ok(r, code); assert.equal(r.organization_name, city); assert.equal(r.is_primary, true);
    assert.equal(r.priority, 0); assert.equal(r.scope_type, 'municipality'); assert.equal(r.effective_to, null); assert.equal(r.ef, '2026-11-19');
    assert.equal(r.prefecture_scope_id, null);
    assert.match(r.notes, /資産がある区ごとに書類を用意し/);
  }
  assert.deepEqual([8, 3, 3], CITIES.map((c) => j.filter((x) => x.organization_name === c).length));
  const after = await dump(db);
  for (const line of before.split('\n').filter((l) => l && l !== '--')) assert.ok(after.includes(line), '既存行が不変: ' + line.slice(0, 40));
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE name='SENTINEL既存市窓口'`)).rows[0].n, 1);
});

await test('同一パッチの再適用は完全no-op（全表が同一）', async () => {
  const db = await fresh(); await applyOk(db);
  const a = await dump(db); await applyOk(db); assert.equal(await dump(db), a);
  assert.deepEqual((await db.query(`SELECT DISTINCT effective_from::text d FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${MUNI_OFFICES.replace(/organization_name|office_category/g, (m) => 'o.' + m)}`)).rows.map((r) => r.d), ['2026-11-19']);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES} AND data_version=1`)).rows[0].n, 3);
});

await test('区が欠けている場合は失敗しロールバック（新潟・静岡・浜松2213側/2214側）', async () => {
  for (const code of ['151017', '151084', '221015', '221031', '221384', '221406']) {
    const db = await fresh();
    await db.exec(`DELETE FROM municipalities WHERE code='${code}'`);
    await applyFails(db, /公開マスター照合/);
  }
});
await test('都道府県が新潟県(15)/静岡県(22)でない場合は失敗（全体・一部の区・県の入れ替え）', async () => {
  for (const sql of [
    `UPDATE prefectures SET code='99' WHERE code='15'`,
    `UPDATE prefectures SET code='99' WHERE code='22'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='40') WHERE code='151050'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='15') WHERE code='221392'`, // 浜松を新潟県に
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='22') WHERE code='151025'`, // 新潟を静岡県に
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /公開マスター照合/); }
});
await test('市名・区名が違う、または市の接頭辞(1510/2210/2213/2214)に合わないコードは失敗', async () => {
  for (const sql of [
    `UPDATE municipalities SET name='新潟市西蒲区X' WHERE code='151084'`,
    `UPDATE municipalities SET name='静岡市清水区X' WHERE code='221031'`,
    `UPDATE municipalities SET name='浜松市浜北区' WHERE code='221392'`, // 旧区名
    `UPDATE municipalities SET name='浜松市中央区' WHERE code='221015'`, // 静岡葵区を浜松名にする（市違い）
    `UPDATE municipalities SET name='静岡市中央区' WHERE code='151033'`, // 新潟中央区を静岡名に
    `UPDATE municipalities SET code='221211', name='浜松市天竜区' WHERE code='221406'`, // 接頭辞2212は浜松ではない
    `UPDATE municipalities SET code='221511', name='静岡市清水区' WHERE code='221031'`, // 接頭辞2215は静岡ではない
    `UPDATE municipalities SET code='151110', name='新潟市北区' WHERE code='151017'`, // 接頭辞1511は新潟ではない
    `UPDATE municipalities SET code='221301', name='静岡市葵区' WHERE code='221015'`, // 浜松(2213)接頭辞を静岡に
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /公開マスター照合/); }
});

await test('同じ市・同じ区分の既存窓口があれば失敗（上書きしない）', async () => {
  for (const city of ['新潟市', '静岡市', '浜松市']) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,organization_name,name) VALUES ('municipal_asset_tax','${city}','別名の窓口')`);
    await applyFails(db, /既に存在/);
  }
});
await test('同じ名称の既存窓口があれば失敗', async () => {
  for (const name of ['新潟市 資産税課 償却資産係（古町ルフル3階）', '浜松市 資産税課 償却資産グループ（元目分庁舎3階）']) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','${name}')`);
    await applyFails(db, /既に存在/);
  }
});
await test('14区のいずれかに既存の主管轄があれば失敗（新潟・静岡・浜松2213側/2214側）', async () => {
  for (const code of ['151041', '221023', '221392', '221406']) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','他の窓口');
      INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id)
      SELECT o.id,'municipal_asset_tax','municipality',m.id FROM submission_offices o, municipalities m WHERE o.name='他の窓口' AND m.code='${code}'`);
    await applyFails(db, /既に存在/);
  }
});
await test('同じ市の窓口に現行情報源が既にある（窓口なし/部分）場合も失敗', async () => {
  const db = await fresh();
  await db.exec(`INSERT INTO submission_offices (office_category,organization_name,name) VALUES ('municipal_asset_tax','静岡市','別窓口');
    INSERT INTO office_sources (office_id,source_type,publisher_name,retrieved_at,verification_method) SELECT id,'municipal_government','静岡市','2026-11-01','official_page_check' FROM submission_offices WHERE name='別窓口'`);
  await applyFails(db, /既に存在/);
});

await test('規則が想定と違う場合は失敗（変更・複数・無効・存在なし）', async () => {
  for (const sql of [
    `UPDATE procedure_submission_rules SET office_category='tax_office'`,
    `UPDATE procedure_submission_rules SET conditions='[{"x":1}]'::jsonb`,
    `UPDATE procedure_submission_rules SET priority=1`,
    `UPDATE procedure_submission_rules SET recipient_scope='other'`,
    `UPDATE procedure_submission_rules SET is_active=false`,
    `DELETE FROM procedure_submission_rules`,
    `INSERT INTO procedure_submission_rules (procedure_id,office_category,priority) SELECT id,'tax_office',5 FROM procedures WHERE code='DEPRECIABLE_ASSET_TAX_RETURN'`,
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /規則/); }
});

await test('部分適用・混在・version・余分な紐づけ・開始日・規則変更後の再適用は失敗しロールバック', async () => {
  for (const sql of [
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='151084')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='221406')`,
    `DELETE FROM office_sources WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='静岡市')`,
    `UPDATE office_sources SET is_current=false WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='浜松市')`,
    `UPDATE office_sources SET status='superseded' WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='新潟市')`,
    `DELETE FROM submission_offices WHERE organization_name='浜松市'`,
    `UPDATE submission_offices SET phone='025-226-2266' WHERE organization_name='新潟市'`,
    `UPDATE submission_offices SET data_version=2 WHERE organization_name='静岡市'`,
    `UPDATE submission_offices SET fax='000' WHERE organization_name='浜松市'`,
    `UPDATE submission_offices SET download_page_url='https://x.example/' WHERE organization_name='新潟市'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'tax_office','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='新潟市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='浜松市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,prefecture_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','prefecture',p.id,false FROM submission_offices o, prefectures p WHERE o.organization_name='静岡市' AND p.code='40'`,
    `UPDATE submission_jurisdictions SET effective_from=DATE '2026-11-20' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='151017')`,
    `UPDATE submission_jurisdictions SET notes='x' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='221023')`,
    `UPDATE office_sources SET snapshot='{}'::jsonb WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='新潟市')`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{per_ward_filing}','"unconfirmed"') WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='静岡市')`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{urls,form_page_url}','"https://x.example/"') WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='浜松市')`,
    `UPDATE submission_offices SET notes='x' WHERE organization_name='浜松市'`,
    `UPDATE procedure_submission_rules SET priority=1`,
    `UPDATE procedure_submission_rules SET is_active=false`,
  ]) { const db = await fresh(); await applyOk(db); await db.exec(sql); await applyFails(db, /完全な適用済み状態ではありません|既に存在|規則/); }
});

await test('書込途中のCHECK拒否（2窓口と先の管轄の追加後）でも全体がロールバック', async () => {
  const db = await fresh();
  // 実行順は市接頭辞順（新潟1510→静岡2210→浜松2213）。3件目の窓口で拒否し、先の2窓口とその管轄が残らないことを確認。
  await db.exec(`ALTER TABLE submission_offices ADD CONSTRAINT t_mid CHECK (organization_name IS DISTINCT FROM '浜松市')`);
  const err = await applyFails(db, /t_mid/);
  assert.ok(err);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE o.organization_name IN ('新潟市','静岡市','浜松市')`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE j.office_category='municipal_asset_tax' AND o.name<>'SENTINEL既存市窓口'`)).rows[0].n, 0);
  await db.exec(`ALTER TABLE submission_offices DROP CONSTRAINT t_mid`);
  await applyOk(db);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE j.office_category='municipal_asset_tax' AND o.name<>'SENTINEL既存市窓口'`)).rows[0].n, 14);
});

await test('パッチはINSERT専用（UPDATE/DELETE/DDL/GRANT/ON CONFLICTなし、organization_types参照なし、本番自動実行なし）、第1・2弾は無変更の別ファイル', async () => {
  const body = PATCH.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(body, /\b(GRANT|REVOKE|ALTER|TRUNCATE|DROP (TABLE|POLICY|FUNCTION|INDEX)|CREATE (POLICY|FUNCTION|INDEX))\b/i);
  assert.doesNotMatch(body, /CREATE TABLE(?! _s3_)/i);
  assert.doesNotMatch(body, /ON CONFLICT/i);
  assert.doesNotMatch(body, /\bUPDATE\b|\bDELETE\b/i);
  assert.doesNotMatch(body, /organization_types/i);
  assert.match(body, /^\s*BEGIN;/m); assert.match(body, /COMMIT;\s*$/);
  assert.match(body, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(body, /SHARE ROW EXCLUSIVE MODE/);
  assert.match(body, /ARRAY\['2213','2214'\]/);
  assert.equal((body.match(/INSERT INTO submission_offices/g) ?? []).length, 1);
  assert.equal((body.match(/INSERT INTO office_sources/g) ?? []).length, 1);
  assert.equal((body.match(/INSERT INTO submission_jurisdictions/g) ?? []).length, 1);
  assert.doesNotMatch(PATCH, /stage1|stage2|仙台|さいたま|千葉|横浜|川崎|相模原/);
});

console.log(`ALL ${results.length} PASS`);
