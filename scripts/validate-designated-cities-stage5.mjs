// 第5弾パッチ（scripts/sql/20261120-designated-cities-stage5.sql）の隔離検証。
// インメモリPGliteのみ使用（ネットワーク・本番・.envなし）。リポジトリの制約を最小限で再現した合成データで、
// 実際のパッチSQLを実行する。堺市7区・神戸市9区・岡山市4区の計20区。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const PATCH = readFileSync(new URL('./sql/20261120-designated-cities-stage5.sql', import.meta.url), 'utf8');

const WARDS = [
  ['27', ['2714'], '堺市', [['271411', '堺区'], ['271420', '中区'], ['271438', '東区'], ['271446', '西区'], ['271454', '南区'], ['271462', '北区'], ['271471', '美原区']]],
  ['28', ['2810', '2811'], '神戸市', [['281018', '東灘区'], ['281026', '灘区'], ['281051', '兵庫区'], ['281069', '長田区'], ['281077', '須磨区'], ['281085', '垂水区'], ['281093', '北区'], ['281107', '中央区'], ['281115', '西区']]],
  ['33', ['3310'], '岡山市', [['331015', '北区'], ['331023', '中区'], ['331031', '東区'], ['331040', '南区']]],
];
const CITIES = WARDS.map((w) => w[2]);
// [窓口名, 郵便番号, 住所, 電話, 公式URL, 様式ページURL]
const EXPECT = {
  堺市: ['堺市 市税事務所 固定資産税課 償却資産係（三国ヶ丘庁舎3階）', '591-8037', '大阪府堺市北区百舌鳥赤畑町1丁3番地1（三国ヶ丘庁舎3階）', '072-231-9765', 'https://www.city.sakai.lg.jp/shisei/gaiyo/annai/gyoseikiko/zaisei/shizei/kotei.html', 'https://www.city.sakai.lg.jp/benri/download/download_shimin/mokuteki/kurashi/zeikin/koteishisan/syoukyakushishanshinkoku.html'],
  神戸市: ['神戸市 固定資産税調整課 償却資産担当（新長田合同庁舎4階）', '653-8773', '兵庫県神戸市長田区二葉町5丁目1番32号（新長田合同庁舎4階）', '078-647-9433', 'https://www.city.kobe.lg.jp/a03858/kurashi/registration/shinsei/zei/koteishisan/syokyaku_sinkoku.html', 'https://www.city.kobe.lg.jp/a03858/kurashi/registration/shinsei/zei/koteishisan/syokyaku_sinkoku.html'],
  岡山市: ['岡山市 課税管理課 償却資産係（分庁舎3階）', '700-8544', '岡山県岡山市北区大供一丁目2番3号（分庁舎3階）', '086-803-1181', 'https://www.city.okayama.jp/kurashi/0000005379.html', 'https://www.city.okayama.jp/kurashi/0000031132.html'],
};
const OKAYAMA_PDF = 'https://www.city.okayama.jp/kurashi/cmsfiles/contents/0000031/31132/R8tebiki.pdf';
const MUNI_OFFICES = `office_category='municipal_asset_tax' AND organization_name IN ('堺市','神戸市','岡山市')`;
const O = (s) => s.replace(/organization_name|office_category/g, (m) => 'o.' + m);
const JUR_NEW = `j.office_category='municipal_asset_tax' AND o.name <> 'SENTINEL既存市窓口' AND o.organization_name IN ('堺市','神戸市','岡山市')`;

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
    INSERT INTO prefectures (code,name) VALUES ('27','大阪府'),('28','兵庫県'),('33','岡山県'),('40','福岡県');
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

await test('成功：窓口3・情報源3・管轄20が正確、無関係な行（市窓口の見張り含む）は不変', async () => {
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
    assert.equal(r.last_verified_at.toISOString().slice(0, 10), '2026-11-20');
    assert.match(r.notes, /R9未確認/);
    assert.match(r.notes, /資産がある区ごとに書類を用意/);
    assert.doesNotMatch(r.notes, /税率|免税点|期限/);
    if (r.organization_name === '堺市') { assert.match(r.notes, /郵送はこの提出先へ/); assert.match(r.notes, /持参は各区の市税の窓口でも受け付けている/); }
    if (r.organization_name === '神戸市') { assert.match(r.notes, /郵送または持参/); assert.match(r.notes, /法人市民税の提出先とは異なる/); }
    if (r.organization_name === '岡山市') { assert.match(r.notes, /まとめて提出/); assert.match(r.notes, /区役所・市税事務所への提出ではない/); }
  }
  const s = (await db.query(`SELECT s.*, o.organization_name FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE ${O(MUNI_OFFICES)}`)).rows;
  assert.equal(s.length, 3);
  for (const r of s) {
    assert.equal(r.source_type, 'municipal_government'); assert.equal(r.verification_method, 'official_page_check');
    assert.equal(r.verified_by, null); assert.equal(r.status, 'active'); assert.equal(r.is_current, true);
    assert.equal(r.source_url, EXPECT[r.organization_name][4]);
    assert.equal(r.retrieved_at.toISOString().slice(0, 10), '2026-11-20');
    const sn = r.snapshot;
    assert.equal(sn.patch, 'designated-cities-stage5-20261120'); assert.equal(sn.r9_form, 'unconfirmed');
    assert.equal(sn.contact_status, 'verified'); assert.equal(sn.checked_on, '2026-11-20');
    assert.equal(sn.per_ward_filing, 'verified');
    assert.equal(sn.urls.contact_filing_url, EXPECT[r.organization_name][4]);
    assert.equal(sn.urls.form_page_url, EXPECT[r.organization_name][5]);
    if (r.organization_name === '神戸市') assert.equal(sn.urls.form_page_url, sn.urls.contact_filing_url); // 神戸は同じで正しい
    else assert.notEqual(sn.urls.form_page_url, sn.urls.contact_filing_url); // 堺・岡山は様式ページが別URL
    if (r.organization_name === '岡山市') {
      assert.equal(sn.urls.per_ward_filing_evidence_url, OKAYAMA_PDF); assert.equal(sn.per_ward_filing_evidence_page, 1);
    } else { assert.equal(sn.urls.per_ward_filing_evidence_url, undefined); assert.equal(sn.per_ward_filing_evidence_page, undefined); }
    assert.doesNotMatch(r.notes ?? '', /R8をR9として扱う(?!わない)/);
  }
  const j = (await db.query(`SELECT m.code, o.organization_name, j.is_primary, j.priority, j.scope_type, j.effective_to, j.effective_from::text AS ef, j.notes, j.prefecture_scope_id FROM submission_jurisdictions j
    JOIN submission_offices o ON o.id=j.office_id JOIN municipalities m ON m.id=j.municipality_scope_id WHERE ${JUR_NEW} ORDER BY m.code`)).rows;
  assert.equal(j.length, 20);
  for (const [, , city, wards] of WARDS) for (const [code] of wards) {
    const r = j.find((x) => x.code === code);
    assert.ok(r, code); assert.equal(r.organization_name, city); assert.equal(r.is_primary, true);
    assert.equal(r.priority, 0); assert.equal(r.scope_type, 'municipality'); assert.equal(r.effective_to, null); assert.equal(r.ef, '2026-11-20');
    assert.equal(r.prefecture_scope_id, null);
    assert.match(r.notes, /資産がある区ごとに書類を用意し/);
  }
  assert.deepEqual([7, 9, 4], CITIES.map((c) => j.filter((x) => x.organization_name === c).length));
  const after = await dump(db);
  for (const line of before.split('\n').filter((l) => l && l !== '--')) assert.ok(after.includes(line), '既存行が不変: ' + line.slice(0, 40));
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE name='SENTINEL既存市窓口'`)).rows[0].n, 1);
});

await test('同一パッチの再適用は完全no-op（全表が同一）', async () => {
  const db = await fresh(); await applyOk(db);
  const a = await dump(db); await applyOk(db); assert.equal(await dump(db), a);
  assert.deepEqual((await db.query(`SELECT DISTINCT effective_from::text d FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${O(MUNI_OFFICES)}`)).rows.map((r) => r.d), ['2026-11-20']);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES} AND data_version=1`)).rows[0].n, 3);
});

await test('同じ大阪府(27)の既存の大阪市窓口・管轄があっても共存し、既存の大阪市の行は不変', async () => {
  const db = await fresh();
  await db.exec(`INSERT INTO municipalities (prefecture_id, code, name) SELECT id,'271021','大阪市都島区' FROM prefectures WHERE code='27';
    INSERT INTO submission_offices (office_category,organization_name,name,phone) VALUES ('municipal_asset_tax','大阪市','大阪市 既存窓口','06');
    INSERT INTO office_sources (office_id,source_type,publisher_name,retrieved_at,verification_method) SELECT id,'municipal_government','大阪市','2026-11-19','official_page_check' FROM submission_offices WHERE organization_name='大阪市';
    INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id) SELECT o.id,'municipal_asset_tax','municipality',m.id FROM submission_offices o, municipalities m WHERE o.organization_name='大阪市' AND m.code='271021'`);
  const before = await dump(db);
  await applyOk(db);
  const after = await dump(db);
  for (const line of before.split('\n').filter((l) => l && l !== '--')) assert.ok(after.includes(line), '既存行が不変: ' + line.slice(0, 40));
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE o.organization_name='大阪市'`)).rows[0].n, 1);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${JUR_NEW}`)).rows[0].n, 20);
});

// 各市の接頭辞の両側（堺2714、神戸2810/2811、岡山3310）の端
const EDGE = ['271411', '271471', '281018', '281093', '281107', '281115', '331015', '331040'];
await test('区が欠けている場合は失敗しロールバック（3県・各接頭辞側の端）', async () => {
  for (const code of EDGE) {
    const db = await fresh();
    await db.exec(`DELETE FROM municipalities WHERE code='${code}'`);
    await applyFails(db, /公開マスター照合/);
  }
});
await test('都道府県が大阪(27)/兵庫(28)/岡山(33)でない場合は失敗（全体・一部の区・県の入れ替え）', async () => {
  for (const sql of [
    `UPDATE prefectures SET code='99' WHERE code='27'`,
    `UPDATE prefectures SET code='99' WHERE code='28'`,
    `UPDATE prefectures SET code='99' WHERE code='33'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='40') WHERE code='271471'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='27') WHERE code='281107'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='28') WHERE code='331040'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='33') WHERE code='271411'`,
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /公開マスター照合/); }
});
await test('市名・区名が違う、または市の接頭辞に合わないコードは失敗', async () => {
  for (const sql of [
    `UPDATE municipalities SET name='堺市堺区X' WHERE code='271411'`,
    `UPDATE municipalities SET name='堺市美原区X' WHERE code='271471'`,
    `UPDATE municipalities SET name='神戸市東灘区X' WHERE code='281018'`,
    `UPDATE municipalities SET name='神戸市中央区X' WHERE code='281107'`,
    `UPDATE municipalities SET name='岡山市南区X' WHERE code='331040'`,
    `UPDATE municipalities SET name='堺市北区' WHERE code='281093'`,
    `UPDATE municipalities SET name='神戸市北区' WHERE code='331015'`,
    `UPDATE municipalities SET name='岡山市北区' WHERE code='271462'`,
    `UPDATE municipalities SET code='271311', name='堺市北区' WHERE code='271462'`, // 2713は堺ではない
    `UPDATE municipalities SET code='281211', name='神戸市西区' WHERE code='281115'`, // 2812は神戸ではない
    `UPDATE municipalities SET code='331111', name='岡山市南区' WHERE code='331040'`, // 3311は岡山ではない
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /公開マスター照合/); }
});

await test('同じ市・同じ区分の既存窓口があれば失敗（上書きしない）', async () => {
  for (const city of CITIES) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,organization_name,name) VALUES ('municipal_asset_tax','${city}','別名の窓口')`);
    await applyFails(db, /既に存在/);
  }
});
await test('同じ名称の既存窓口があれば失敗', async () => {
  for (const city of CITIES) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','${EXPECT[city][0]}')`);
    await applyFails(db, /既に存在/);
  }
});
await test('20区のいずれかに既存の主管轄があれば失敗（3県・各接頭辞側）', async () => {
  for (const code of EDGE) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,name) VALUES ('municipal_asset_tax','他の窓口');
      INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id)
      SELECT o.id,'municipal_asset_tax','municipality',m.id FROM submission_offices o, municipalities m WHERE o.name='他の窓口' AND m.code='${code}'`);
    await applyFails(db, /既に存在/);
  }
});
await test('同じ市の窓口に現行情報源が既にある場合も失敗', async () => {
  for (const city of CITIES) {
    const db = await fresh();
    await db.exec(`INSERT INTO submission_offices (office_category,organization_name,name) VALUES ('municipal_asset_tax','${city}','別窓口');
      INSERT INTO office_sources (office_id,source_type,publisher_name,retrieved_at,verification_method) SELECT id,'municipal_government','${city}','2026-11-01','official_page_check' FROM submission_offices WHERE name='別窓口'`);
    await applyFails(db, /既に存在/);
  }
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

const ofc = (city) => `(SELECT id FROM submission_offices WHERE organization_name='${city}')`;
await test('部分適用・混在・version・余分な紐づけ・開始日・規則変更後の再適用は失敗しロールバック', async () => {
  for (const sql of [
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='271411')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='271471')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='281107')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='331040')`,
    `DELETE FROM office_sources WHERE office_id=${ofc('神戸市')}`,
    `UPDATE office_sources SET is_current=false WHERE office_id=${ofc('岡山市')}`,
    `UPDATE office_sources SET status='superseded' WHERE office_id=${ofc('堺市')}`,
    `DELETE FROM submission_offices WHERE organization_name='岡山市'`,
    `UPDATE submission_offices SET phone='072-231-9766' WHERE organization_name='堺市'`,
    `UPDATE submission_offices SET data_version=2 WHERE organization_name='神戸市'`,
    `UPDATE submission_offices SET fax='000' WHERE organization_name='堺市'`,
    `UPDATE submission_offices SET download_page_url='https://x.example/' WHERE organization_name='神戸市'`,
    `UPDATE submission_offices SET e_filing_url='https://x.example/' WHERE organization_name='岡山市'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'tax_office','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='堺市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='岡山市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,prefecture_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','prefecture',p.id,false FROM submission_offices o, prefectures p WHERE o.organization_name='神戸市' AND p.code='40'`,
    `UPDATE submission_jurisdictions SET effective_from=DATE '2026-11-21' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='331015')`,
    `UPDATE submission_jurisdictions SET notes='x' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='281051')`,
    `UPDATE office_sources SET snapshot='{}'::jsonb WHERE office_id=${ofc('堺市')}`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{per_ward_filing}','"unconfirmed"') WHERE office_id=${ofc('神戸市')}`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{urls,form_page_url}','"https://x.example/"') WHERE office_id=${ofc('堺市')}`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{per_ward_filing_evidence_page}','2') WHERE office_id=${ofc('岡山市')}`,
    `UPDATE office_sources SET snapshot=snapshot #- '{urls,per_ward_filing_evidence_url}' WHERE office_id=${ofc('岡山市')}`,
    `UPDATE submission_offices SET notes='x' WHERE organization_name='岡山市'`,
    `UPDATE procedure_submission_rules SET priority=1`,
    `UPDATE procedure_submission_rules SET is_active=false`,
  ]) { const db = await fresh(); await applyOk(db); await db.exec(sql); await applyFails(db, /完全な適用済み状態ではありません|既に存在|規則/); }
});

await test('書込途中のCHECK拒否（2窓口と先の管轄の追加後）でも全体がロールバック', async () => {
  const db = await fresh();
  // 実行順は市接頭辞順（堺2714→神戸2810→岡山3310）。3件目の窓口で拒否し、先の2窓口とその管轄が残らないことを確認。
  await db.exec(`ALTER TABLE submission_offices ADD CONSTRAINT t_mid CHECK (organization_name IS DISTINCT FROM '岡山市')`);
  await applyFails(db, /t_mid/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE o.organization_name IN ('堺市','神戸市','岡山市')`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${JUR_NEW}`)).rows[0].n, 0);
  await db.exec(`ALTER TABLE submission_offices DROP CONSTRAINT t_mid`);
  await applyOk(db);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${JUR_NEW}`)).rows[0].n, 20);
});
await test('途中の管轄INSERT拒否（神戸の途中の区）でも全体がロールバック', async () => {
  const db = await fresh();
  await db.exec(`CREATE FUNCTION t_fail() RETURNS trigger AS $$ BEGIN IF NEW.municipality_scope_id = (SELECT id FROM municipalities WHERE code='281107') THEN RAISE EXCEPTION 't_juris_fail'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER t_trg BEFORE INSERT ON submission_jurisdictions FOR EACH ROW EXECUTE FUNCTION t_fail()`);
  await applyFails(db, /t_juris_fail/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows[0].n, 0);
  await db.exec(`DROP TRIGGER t_trg ON submission_jurisdictions`);
  await applyOk(db);
});

await test('パッチはINSERT専用（UPDATE/DELETE/DDL/GRANT/ON CONFLICTなし、organization_types参照なし）、第1〜4弾は無変更の別ファイル', async () => {
  const body = PATCH.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(body, /\b(GRANT|REVOKE|ALTER|TRUNCATE|DROP (TABLE|POLICY|FUNCTION|INDEX)|CREATE (POLICY|FUNCTION|INDEX))\b/i);
  assert.doesNotMatch(body, /CREATE TABLE(?! _s5_)/i);
  assert.doesNotMatch(body, /ON CONFLICT/i);
  assert.doesNotMatch(body, /\bUPDATE\b|\bDELETE\b/i);
  assert.doesNotMatch(body, /organization_types/i);
  assert.match(body, /^\s*BEGIN;/m); assert.match(body, /COMMIT;\s*$/);
  assert.match(body, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(body, /SHARE ROW EXCLUSIVE MODE/);
  assert.match(body, /ARRAY\['2714'\]/); assert.match(body, /ARRAY\['2810','2811'\]/); assert.match(body, /ARRAY\['3310'\]/);
  assert.equal((body.match(/INSERT INTO submission_offices/g) ?? []).length, 1);
  assert.equal((body.match(/INSERT INTO office_sources/g) ?? []).length, 1);
  assert.equal((body.match(/INSERT INTO submission_jurisdictions/g) ?? []).length, 1);
  assert.doesNotMatch(PATCH, /stage[1-4]|仙台|さいたま|千葉|横浜|川崎|相模原|新潟|静岡|浜松|名古屋|京都|大阪市|福岡|北九州/);
});

console.log(`ALL ${results.length} PASS`);
