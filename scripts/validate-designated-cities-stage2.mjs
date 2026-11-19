// 第2弾パッチ（scripts/sql/20261119-designated-cities-stage2.sql）の隔離検証。
// インメモリPGliteのみ使用（ネットワーク・本番・.envなし）。リポジトリの制約を最小限で再現した合成データで、
// 実際のパッチSQLを実行する。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const PATCH = readFileSync(new URL('./sql/20261119-designated-cities-stage2.sql', import.meta.url), 'utf8');

const WARDS = [
  ['14', ['1410', '1411'], '横浜市', [['141011', '鶴見区'], ['141020', '神奈川区'], ['141038', '西区'], ['141046', '中区'], ['141054', '南区'], ['141062', '保土ケ谷区'], ['141071', '磯子区'], ['141089', '金沢区'], ['141097', '港北区'], ['141101', '戸塚区'], ['141119', '港南区'], ['141127', '旭区'], ['141135', '緑区'], ['141143', '瀬谷区'], ['141151', '栄区'], ['141160', '泉区'], ['141178', '青葉区'], ['141186', '都筑区']]],
  ['14', ['1413'], '川崎市', [['141313', '川崎区'], ['141321', '幸区'], ['141330', '中原区'], ['141348', '高津区'], ['141356', '多摩区'], ['141364', '宮前区'], ['141372', '麻生区']]],
  ['14', ['1415'], '相模原市', [['141518', '緑区'], ['141526', '中央区'], ['141534', '南区']]],
];
const CITIES = WARDS.map((w) => w[2]);
const EXPECT = {
  横浜市: ['横浜市償却資産センター（償却資産課）', '231-8343', '神奈川県横浜市中区山下町2番地（産業貿易センタービル5階）', '045-671-4384', 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/madoguchi/shoukyaku-center.html'],
  川崎市: ['かわさき市税事務所 資産税課 償却資産担当（川崎御幸ビル3階）', '210-8576', '神奈川県川崎市川崎区砂子1-8-9（川崎御幸ビル3階）', '044-200-1321／044-200-1322', 'https://www.city.kawasaki.jp/230/page/0000148698.html'],
  相模原市: ['相模原市 資産税課 賦課・償却資産班（市役所第2別館2階）', '252-5277', '神奈川県相模原市中央区中央2-11-15（市役所第2別館2階）', '042-769-8264', 'https://www.city.sagamihara.kanagawa.jp/kurashi/1026448/zeikin/1026477/shisan_keikaku/1007752.html'],
};
const FORM = {
  横浜市: 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/tebiki/shokyakushisan-dl.html',
  川崎市: 'https://www.city.kawasaki.jp/230/page/0000053635.html',
  相模原市: 'https://www.city.sagamihara.kanagawa.jp/shinseisho_menu/zei/1011360.html',
};
const YOKOHAMA_EVIDENCE = 'https://www.city.yokohama.lg.jp/kurashi/koseki-zei-hoken/zeikin/jigyosya/shizei/koteishisan/shoukyakushisan.html';
const R8_PDF = 'https://www.city.kawasaki.jp/230/cmsfiles/contents/0000020/20553/r8syoukyakutebiki.pdf';
const MUNI_OFFICES = `office_category='municipal_asset_tax' AND organization_name IN ('横浜市','川崎市','相模原市')`;

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
    INSERT INTO prefectures (code,name) VALUES ('14','神奈川県'),('40','福岡県');
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

await test('成功：窓口3・情報源3・管轄28が正確、無関係な行（市窓口の見張り含む）は不変', async () => {
  const db = await fresh();
  const before = await dump(db);
  await applyOk(db);
  const o = (await db.query(`SELECT * FROM submission_offices WHERE ${MUNI_OFFICES} ORDER BY id`)).rows;
  assert.equal(o.length, 3);
  for (const r of o) {
    const [name, postal, addr, phone, url] = EXPECT[r.organization_name];
    assert.equal(r.name, name); assert.equal(r.postal_code, postal); assert.equal(r.address, addr);
    assert.equal(r.phone, phone); assert.equal(r.official_url, url);
    assert.equal(r.fax, null); assert.equal(r.e_filing_url, null); assert.equal(r.download_page_url, null);
    assert.equal(r.official_url_status, 'ok'); assert.equal(r.official_url_checked_at, null);
    assert.equal(r.verification_due_at, null); assert.equal(r.update_frequency, 'unknown'); assert.equal(r.data_version, 1);
    assert.equal(r.last_verified_at.toISOString().slice(0, 10), '2026-11-19');
    assert.match(r.notes, /R9未確認/);
    assert.doesNotMatch(r.notes, /法人市民税|税率|免税点|期限/);
    if (r.organization_name === '川崎市') {
      assert.match(r.notes, /資産がある区ごとに書類を用意.*電話は川崎区・幸区が1321、その他5区が1322/);
      assert.doesNotMatch(r.notes, /未確認.*区|区別の提出/);
    }
    assert.match(r.notes, /資産がある区ごとに書類を用意/);
  }
  const s = (await db.query(`SELECT s.*, o.organization_name FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE ${MUNI_OFFICES.replace(/organization_name|office_category/g, (m) => 'o.' + m)}`)).rows;
  assert.equal(s.length, 3);
  for (const r of s) {
    assert.equal(r.source_type, 'municipal_government'); assert.equal(r.verification_method, 'official_page_check');
    assert.equal(r.verified_by, null); assert.equal(r.status, 'active'); assert.equal(r.is_current, true);
    assert.equal(r.source_url, EXPECT[r.organization_name][4]);
    assert.equal(r.retrieved_at.toISOString().slice(0, 10), '2026-11-19');
    const sn = r.snapshot;
    assert.equal(sn.patch, 'designated-cities-stage2-20261119'); assert.equal(sn.r9_form, 'unconfirmed');
    assert.equal(sn.contact_status, 'verified'); assert.equal(sn.checked_on, '2026-11-19');
    assert.equal(sn.per_ward_filing, 'verified');
    assert.equal(sn.urls.contact_filing_url, EXPECT[r.organization_name][4]);
    assert.equal(sn.urls.form_page_url, FORM[r.organization_name]);
    if (r.organization_name === '川崎市') {
      assert.equal(sn.urls.r8_pdf_contact_evidence_url, R8_PDF);
      assert.equal(sn.urls.per_ward_filing_evidence_url, 'https://www.city.kawasaki.jp/230/page/0000171738.html');
      assert.deepEqual(sn.phone_evidence, { '044-200-1321': '川崎区・幸区', '044-200-1322': 'その他5区', source: 'r8_pdf', page: 22, contact_evidence_only: true });
      assert.match(r.notes, /R9様式の根拠ではない/);
    } else assert.equal(sn.urls.r8_pdf_contact_evidence_url, undefined);
    if (r.organization_name === '横浜市') assert.equal(sn.urls.per_ward_filing_evidence_url, YOKOHAMA_EVIDENCE);
    if (r.organization_name === '相模原市') assert.equal(sn.urls.per_ward_filing_evidence_url, undefined);
  }
  const j = (await db.query(`SELECT m.code, o.organization_name, j.is_primary, j.priority, j.scope_type, j.effective_to, j.effective_from::text AS ef, j.notes FROM submission_jurisdictions j
    JOIN submission_offices o ON o.id=j.office_id JOIN municipalities m ON m.id=j.municipality_scope_id WHERE j.office_category='municipal_asset_tax' AND o.name <> 'SENTINEL既存市窓口' ORDER BY m.code`)).rows;
  assert.equal(j.length, 28);
  for (const [, , city, wards] of WARDS) for (const [code] of wards) {
    const r = j.find((x) => x.code === code);
    assert.ok(r, code); assert.equal(r.organization_name, city); assert.equal(r.is_primary, true);
    assert.equal(r.priority, 0); assert.equal(r.scope_type, 'municipality'); assert.equal(r.effective_to, null); assert.equal(r.ef, '2026-11-19');
    assert.match(r.notes, /資産がある区ごとに書類を用意し/);
  }
  assert.deepEqual([18, 7, 3], CITIES.map((c) => j.filter((x) => x.organization_name === c).length));
  const after = await dump(db);
  for (const line of before.split('\n').filter((l) => l && l !== '--')) assert.ok(after.includes(line), '既存行が不変: ' + line.slice(0, 40));
  const sent = (await db.query(`SELECT count(*)::int n FROM submission_offices WHERE name='SENTINEL既存市窓口'`)).rows[0].n;
  assert.equal(sent, 1);
});

await test('同一パッチの再適用は完全no-op（全表が同一）', async () => {
  const db = await fresh(); await applyOk(db);
  const a = await dump(db); await applyOk(db); assert.equal(await dump(db), a);
  assert.deepEqual((await db.query(`SELECT DISTINCT effective_from::text d FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${MUNI_OFFICES.replace(/organization_name|office_category/g, (m) => 'o.' + m)}`)).rows.map((r) => r.d), ['2026-11-19']);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES} AND data_version=1`)).rows[0].n, 3);
});

await test('区が欠けている場合は失敗しロールバック（横浜の1410側・1411側それぞれ）', async () => {
  for (const code of ['141011', '141186', '141313', '141534']) {
    const db = await fresh();
    await db.exec(`DELETE FROM municipalities WHERE code='${code}'`);
    await applyFails(db, /公開マスター照合/);
  }
});
await test('都道府県が神奈川県(14)でない場合は失敗（全体・一部の区）', async () => {
  let db = await fresh();
  await db.exec(`UPDATE prefectures SET code='99' WHERE code='14'`);
  await applyFails(db, /公開マスター照合/);
  db = await fresh();
  await db.exec(`UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='40') WHERE code='141526'`);
  await applyFails(db, /公開マスター照合/);
});
await test('市名・区名が違う、または市の接頭辞(1410/1411/1413/1415)に合わないコードは失敗', async () => {
  for (const sql of [
    `UPDATE municipalities SET name='横浜市保土ヶ谷区' WHERE code='141062'`, // 表記違い
    `UPDATE municipalities SET name='川崎市川崎区X' WHERE code='141313'`,
    `UPDATE municipalities SET name='横浜市中央区' WHERE code='141046'`,
    `UPDATE municipalities SET name='相模原市緑区' WHERE code='141135'`, // 横浜緑区を相模原名にする（市違い）
    `UPDATE municipalities SET code='141211', name='横浜市都筑区' WHERE code='141186'`, // 接頭辞1412は横浜ではない
    `UPDATE municipalities SET code='141418', name='相模原市緑区' WHERE code='141518'`, // 接頭辞1414は相模原ではない
    `UPDATE municipalities SET code='141301', name='横浜市港北区' WHERE code='141097'`, // 川崎(1413)接頭辞を横浜に
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /公開マスター照合/); }
});

await test('同じ市・同じ区分の既存窓口があれば失敗（上書きしない）', async () => {
  for (const city of ['横浜市', '川崎市', '相模原市']) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,organization_name,name) VALUES ('municipal_asset_tax','${city}','別名の窓口')`);
    await applyFails(db, /既に存在/);
  }
});
await test('同じ名称の既存窓口があれば失敗', async () => {
  const db = await fresh();
  await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','相模原市 資産税課 賦課・償却資産班（市役所第2別館2階）')`);
  await applyFails(db, /既に存在/);
});
await test('28区のいずれかに既存の主管轄があれば失敗（横浜1411側・川崎・相模原）', async () => {
  for (const code of ['141101', '141330', '141534']) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','他の窓口');
      INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id)
      SELECT o.id,'municipal_asset_tax','municipality',m.id FROM submission_offices o, municipalities m WHERE o.name='他の窓口' AND m.code='${code}'`);
    await applyFails(db, /既に存在/);
  }
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

await test('部分適用・混在・version・余分な紐づけ・開始日のずれは再適用で失敗しロールバック', async () => {
  for (const sql of [
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='141534')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='141101')`,
    `DELETE FROM office_sources WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='川崎市')`,
    `DELETE FROM submission_offices WHERE organization_name='相模原市'`,
    `UPDATE submission_offices SET phone='000' WHERE organization_name='横浜市'`,
    `UPDATE submission_offices SET data_version=2 WHERE organization_name='川崎市'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'tax_office','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='横浜市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='相模原市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,prefecture_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','prefecture',p.id,false FROM submission_offices o, prefectures p WHERE o.organization_name='川崎市' AND p.code='40'`,
    `UPDATE submission_jurisdictions SET effective_from=DATE '2026-11-20' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='141011')`,
    `UPDATE submission_jurisdictions SET notes='x' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='141313')`,
    `UPDATE office_sources SET snapshot='{}'::jsonb WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='横浜市')`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{per_ward_filing}','"unconfirmed"') WHERE office_id=(SELECT id FROM submission_offices WHERE organization_name='川崎市')`,
    `UPDATE submission_offices SET notes='x' WHERE organization_name='相模原市'`,
  ]) { const db = await fresh(); await applyOk(db); await db.exec(sql); await applyFails(db, /完全な適用済み状態ではありません|既に存在/); }
});

await test('書込途中のCHECK拒否（2窓口と先の管轄の追加後）でも全体がロールバック', async () => {
  const db = await fresh();
  // 実行順は市接頭辞順（横浜→川崎→相模原）。3件目の窓口で拒否し、先の2窓口とその管轄が残らないことを確認。
  await db.exec(`ALTER TABLE submission_offices ADD CONSTRAINT t_mid CHECK (organization_name IS DISTINCT FROM '相模原市')`);
  const err = await applyFails(db, /t_mid/);
  assert.ok(err);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE j.office_category='municipal_asset_tax' AND o.name<>'SENTINEL既存市窓口'`)).rows[0].n, 0);
  await db.exec(`ALTER TABLE submission_offices DROP CONSTRAINT t_mid`);
  await applyOk(db);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE j.office_category='municipal_asset_tax' AND o.name<>'SENTINEL既存市窓口'`)).rows[0].n, 28);
});

await test('パッチはINSERT専用（UPDATE/DELETE/DDL/GRANT/ON CONFLICTなし、本番自動実行なし）、第1弾は無変更', async () => {
  const body = PATCH.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(body, /\b(GRANT|REVOKE|ALTER|TRUNCATE|DROP (TABLE|POLICY|FUNCTION|INDEX)|CREATE (POLICY|FUNCTION|INDEX))\b/i);
  assert.doesNotMatch(body, /CREATE TABLE(?! _s2_)/i);
  assert.doesNotMatch(body, /ON CONFLICT/i);
  assert.doesNotMatch(body, /\bUPDATE\b|\bDELETE\b/i);
  assert.match(body, /^\s*BEGIN;/m); assert.match(body, /COMMIT;\s*$/);
  assert.match(body, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(body, /SHARE ROW EXCLUSIVE MODE/);
  assert.match(body, /ARRAY\['1410','1411'\]/);
  assert.doesNotMatch(PATCH, /stage1|仙台|さいたま|千葉/);
});

console.log(`ALL ${results.length} PASS`);
