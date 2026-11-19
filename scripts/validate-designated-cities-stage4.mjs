// 第4弾パッチ（scripts/sql/20261119-designated-cities-stage4.sql）の隔離検証。
// インメモリPGliteのみ使用（ネットワーク・本番・.envなし）。リポジトリの制約を最小限で再現した合成データで、
// 実際のパッチSQLを実行する。名古屋市16区・京都市11区・大阪市24区の計51区。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const PATCH = readFileSync(new URL('./sql/20261119-designated-cities-stage4.sql', import.meta.url), 'utf8');

const WARDS = [
  ['23', ['2310', '2311'], '名古屋市', [['231011', '千種区'], ['231029', '東区'], ['231037', '北区'], ['231045', '西区'], ['231053', '中村区'], ['231061', '中区'], ['231070', '昭和区'], ['231088', '瑞穂区'], ['231096', '熱田区'], ['231100', '中川区'], ['231118', '港区'], ['231126', '南区'], ['231134', '守山区'], ['231142', '緑区'], ['231151', '名東区'], ['231169', '天白区']]],
  ['26', ['2610', '2611'], '京都市', [['261017', '北区'], ['261025', '上京区'], ['261033', '左京区'], ['261041', '中京区'], ['261050', '東山区'], ['261068', '下京区'], ['261076', '南区'], ['261084', '右京区'], ['261092', '伏見区'], ['261106', '山科区'], ['261114', '西京区']]],
  ['27', ['2710', '2711', '2712'], '大阪市', [['271021', '都島区'], ['271039', '福島区'], ['271047', '此花区'], ['271063', '西区'], ['271071', '港区'], ['271080', '大正区'], ['271098', '天王寺区'], ['271110', '浪速区'], ['271136', '西淀川区'], ['271144', '東淀川区'], ['271152', '東成区'], ['271161', '生野区'], ['271179', '旭区'], ['271187', '城東区'], ['271195', '阿倍野区'], ['271209', '住吉区'], ['271217', '東住吉区'], ['271225', '西成区'], ['271233', '淀川区'], ['271241', '鶴見区'], ['271250', '住之江区'], ['271268', '平野区'], ['271276', '北区'], ['271284', '中央区']]],
];
const CITIES = WARDS.map((w) => w[2]);
// [窓口名, 郵便番号, 住所, 電話, 公式URL, 様式ページURL]
const EXPECT = {
  名古屋市: ['名古屋市 金山市税事務所 償却資産課税課（名鉄正木第一ビル）', '460-8626', '愛知県名古屋市中区正木三丁目5番33号（名鉄正木第一ビル）', '052-324-9809', 'https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011959.html', 'https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011956.html'],
  京都市: ['京都市 市税事務所 法人諸税室 償却資産担当（分庁舎地下1階）', '604-8571', '京都府京都市中京区寺町通御池上る上本能寺前町488番地（京都市役所分庁舎地下1階）', '075-222-3170', 'https://www.city.kyoto.lg.jp/gyozai/page/0000052941.html', 'https://www.city.kyoto.lg.jp/gyozai/page/0000052941.html'],
  大阪市: ['大阪市 船場法人市税事務所 固定資産税（償却資産）グループ（船場センタービル3号館2階北側）', '541-8551', '大阪府大阪市中央区船場中央1-4-3-203（船場センタービル3号館2階北側）', '06-4705-2941', 'https://www.city.osaka.lg.jp/zaisei/page/0000006293.html', 'https://www.city.osaka.lg.jp/zaisei/page/0000006293.html'],
};
const KYOTO_PDF = 'https://www.city.kyoto.lg.jp/gyozai/cmsfiles/contents/0000052/52941/R8tebiki2.pdf';
const OSAKA_FILING = 'https://www.city.osaka.lg.jp/zaisei/page/0000385226.html';
const OSAKA_CONTACT = 'https://www.city.osaka.lg.jp/zaisei/page/0000006614.html';
const MUNI_OFFICES = `office_category='municipal_asset_tax' AND organization_name IN ('名古屋市','京都市','大阪市')`;
const O = (s) => s.replace(/organization_name|office_category/g, (m) => 'o.' + m);
const JUR_NEW = `j.office_category='municipal_asset_tax' AND o.name <> 'SENTINEL既存市窓口'`;

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
    INSERT INTO prefectures (code,name) VALUES ('23','愛知県'),('26','京都府'),('27','大阪府'),('40','福岡県');
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

await test('成功：窓口3・情報源3・管轄51が正確、無関係な行（市窓口の見張り含む）は不変', async () => {
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
    if (r.organization_name === '名古屋市') { assert.match(r.notes, /金山市税事務所に集約/); assert.match(r.notes, /旧3事務所の区別はしない/); }
    if (r.organization_name === '京都市') { assert.match(r.notes, /分庁舎地下1階/); assert.match(r.notes, /区役所・支所・出張所では受け付けていない/); }
    if (r.organization_name === '大阪市') {
      assert.equal(r.phone, '06-4705-2941'); assert.doesNotMatch(r.phone, /2948/);
      assert.match(r.notes, /総合窓口の2948とは混同しない/); assert.match(r.notes, /持参受付もある/); assert.match(r.notes, /区役所では受け付けていない/);
    }
  }
  const s = (await db.query(`SELECT s.*, o.organization_name FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE ${O(MUNI_OFFICES)}`)).rows;
  assert.equal(s.length, 3);
  for (const r of s) {
    assert.equal(r.source_type, 'municipal_government'); assert.equal(r.verification_method, 'official_page_check');
    assert.equal(r.verified_by, null); assert.equal(r.status, 'active'); assert.equal(r.is_current, true);
    assert.equal(r.source_url, EXPECT[r.organization_name][4]);
    assert.equal(r.retrieved_at.toISOString().slice(0, 10), '2026-11-19');
    const sn = r.snapshot;
    assert.equal(sn.patch, 'designated-cities-stage4-20261119'); assert.equal(sn.r9_form, 'unconfirmed');
    assert.equal(sn.contact_status, 'verified'); assert.equal(sn.checked_on, '2026-11-19');
    assert.equal(sn.per_ward_filing, 'verified');
    assert.equal(sn.urls.contact_filing_url, EXPECT[r.organization_name][4]);
    assert.equal(sn.urls.form_page_url, EXPECT[r.organization_name][5]);
    if (r.organization_name === '名古屋市') {
      assert.notEqual(sn.urls.form_page_url, sn.urls.contact_filing_url); // 名古屋は様式ページが別URL
      assert.equal(sn.urls.per_ward_filing_evidence_url, undefined);
    } else assert.equal(sn.urls.form_page_url, sn.urls.contact_filing_url); // 京都・大阪は同じで正しい
    if (r.organization_name === '京都市') {
      assert.equal(sn.urls.per_ward_filing_evidence_url, KYOTO_PDF);
      assert.equal(sn.per_ward_filing_evidence_page, 7); assert.equal(sn.per_ward_filing_evidence_printed_page, 18); assert.equal(sn.contact_evidence_pdf_page, 12);
    } else { assert.equal(sn.per_ward_filing_evidence_page, undefined); assert.equal(sn.contact_evidence_pdf_page, undefined); }
    if (r.organization_name === '大阪市') {
      assert.equal(sn.urls.per_ward_filing_evidence_url, OSAKA_FILING); assert.equal(sn.urls.contact_evidence_url, OSAKA_CONTACT);
    } else assert.equal(sn.urls.contact_evidence_url, undefined);
    assert.doesNotMatch(r.notes ?? '', /R8をR9として扱う(?!わない)/);
  }
  const j = (await db.query(`SELECT m.code, o.organization_name, j.is_primary, j.priority, j.scope_type, j.effective_to, j.effective_from::text AS ef, j.notes, j.prefecture_scope_id FROM submission_jurisdictions j
    JOIN submission_offices o ON o.id=j.office_id JOIN municipalities m ON m.id=j.municipality_scope_id WHERE ${JUR_NEW} ORDER BY m.code`)).rows;
  assert.equal(j.length, 51);
  for (const [, , city, wards] of WARDS) for (const [code] of wards) {
    const r = j.find((x) => x.code === code);
    assert.ok(r, code); assert.equal(r.organization_name, city); assert.equal(r.is_primary, true);
    assert.equal(r.priority, 0); assert.equal(r.scope_type, 'municipality'); assert.equal(r.effective_to, null); assert.equal(r.ef, '2026-11-19');
    assert.equal(r.prefecture_scope_id, null);
    assert.match(r.notes, /資産がある区ごとに書類を用意し/);
  }
  assert.deepEqual([16, 11, 24], CITIES.map((c) => j.filter((x) => x.organization_name === c).length));
  const after = await dump(db);
  for (const line of before.split('\n').filter((l) => l && l !== '--')) assert.ok(after.includes(line), '既存行が不変: ' + line.slice(0, 40));
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE name='SENTINEL既存市窓口'`)).rows[0].n, 1);
});

await test('同一パッチの再適用は完全no-op（全表が同一）', async () => {
  const db = await fresh(); await applyOk(db);
  const a = await dump(db); await applyOk(db); assert.equal(await dump(db), a);
  assert.deepEqual((await db.query(`SELECT DISTINCT effective_from::text d FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${O(MUNI_OFFICES)}`)).rows.map((r) => r.d), ['2026-11-19']);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES} AND data_version=1`)).rows[0].n, 3);
});

// 各市の接頭辞の両側（名古屋2310/2311、京都2610/2611、大阪2710/2711/2712）の端
const EDGE = ['231011', '231096', '231100', '231169', '261017', '261092', '261106', '261114', '271021', '271098', '271110', '271195', '271209', '271284'];
await test('区が欠けている場合は失敗しロールバック（3県・各接頭辞側の端）', async () => {
  for (const code of EDGE) {
    const db = await fresh();
    await db.exec(`DELETE FROM municipalities WHERE code='${code}'`);
    await applyFails(db, /公開マスター照合/);
  }
});
await test('都道府県が愛知(23)/京都(26)/大阪(27)でない場合は失敗（全体・一部の区・県の入れ替え）', async () => {
  for (const sql of [
    `UPDATE prefectures SET code='99' WHERE code='23'`,
    `UPDATE prefectures SET code='99' WHERE code='26'`,
    `UPDATE prefectures SET code='99' WHERE code='27'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='40') WHERE code='231100'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='23') WHERE code='261106'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='26') WHERE code='271209'`,
    `UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='27') WHERE code='231011'`,
  ]) { const db = await fresh(); await db.exec(sql); await applyFails(db, /公開マスター照合/); }
});
await test('市名・区名が違う、または市の接頭辞に合わないコードは失敗', async () => {
  for (const sql of [
    `UPDATE municipalities SET name='名古屋市千種区X' WHERE code='231011'`,
    `UPDATE municipalities SET name='名古屋市緑区X' WHERE code='231142'`,
    `UPDATE municipalities SET name='京都市山科区X' WHERE code='261106'`,
    `UPDATE municipalities SET name='大阪市住吉区X' WHERE code='271209'`,
    `UPDATE municipalities SET name='大阪市天王寺区X' WHERE code='271098'`,
    `UPDATE municipalities SET name='大阪市浪速区X' WHERE code='271110'`,
    `UPDATE municipalities SET name='京都市中区' WHERE code='231061'`,
    `UPDATE municipalities SET name='大阪市北区' WHERE code='231037'`,
    `UPDATE municipalities SET name='名古屋市北区' WHERE code='261017'`,
    `UPDATE municipalities SET code='231211', name='名古屋市緑区' WHERE code='231142'`, // 2312は名古屋ではない
    `UPDATE municipalities SET code='261211', name='京都市西京区' WHERE code='261114'`, // 2612は京都ではない
    `UPDATE municipalities SET code='271311', name='大阪市中央区' WHERE code='271284'`, // 2713は大阪ではない
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
await test('51区のいずれかに既存の主管轄があれば失敗（3県・各接頭辞側）', async () => {
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
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='231011')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='231169')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='261114')`,
    `DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='271209')`,
    `DELETE FROM office_sources WHERE office_id=${ofc('京都市')}`,
    `UPDATE office_sources SET is_current=false WHERE office_id=${ofc('大阪市')}`,
    `UPDATE office_sources SET status='superseded' WHERE office_id=${ofc('名古屋市')}`,
    `DELETE FROM submission_offices WHERE organization_name='大阪市'`,
    `UPDATE submission_offices SET phone='06-4705-2948' WHERE organization_name='大阪市'`,
    `UPDATE submission_offices SET data_version=2 WHERE organization_name='京都市'`,
    `UPDATE submission_offices SET fax='000' WHERE organization_name='名古屋市'`,
    `UPDATE submission_offices SET download_page_url='https://x.example/' WHERE organization_name='京都市'`,
    `UPDATE submission_offices SET e_filing_url='https://x.example/' WHERE organization_name='大阪市'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'tax_office','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='名古屋市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','municipality',m.id,false FROM submission_offices o, municipalities m WHERE o.organization_name='大阪市' AND m.code='401331'`,
    `INSERT INTO submission_jurisdictions (office_id,office_category,scope_type,prefecture_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','prefecture',p.id,false FROM submission_offices o, prefectures p WHERE o.organization_name='京都市' AND p.code='40'`,
    `UPDATE submission_jurisdictions SET effective_from=DATE '2026-11-20' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='271284')`,
    `UPDATE submission_jurisdictions SET notes='x' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='261041')`,
    `UPDATE office_sources SET snapshot='{}'::jsonb WHERE office_id=${ofc('名古屋市')}`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{per_ward_filing}','"unconfirmed"') WHERE office_id=${ofc('京都市')}`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{urls,form_page_url}','"https://x.example/"') WHERE office_id=${ofc('名古屋市')}`,
    `UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{per_ward_filing_evidence_page}','8') WHERE office_id=${ofc('京都市')}`,
    `UPDATE office_sources SET snapshot=snapshot #- '{urls,contact_evidence_url}' WHERE office_id=${ofc('大阪市')}`,
    `UPDATE submission_offices SET notes='x' WHERE organization_name='大阪市'`,
    `UPDATE procedure_submission_rules SET priority=1`,
    `UPDATE procedure_submission_rules SET is_active=false`,
  ]) { const db = await fresh(); await applyOk(db); await db.exec(sql); await applyFails(db, /完全な適用済み状態ではありません|既に存在|規則/); }
});

await test('書込途中のCHECK拒否（2窓口と先の管轄の追加後）でも全体がロールバック', async () => {
  const db = await fresh();
  // 実行順は市接頭辞順（名古屋2310→京都2610→大阪2710）。3件目の窓口で拒否し、先の2窓口とその管轄が残らないことを確認。
  await db.exec(`ALTER TABLE submission_offices ADD CONSTRAINT t_mid CHECK (organization_name IS DISTINCT FROM '大阪市')`);
  await applyFails(db, /t_mid/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE o.organization_name IN ('名古屋市','京都市','大阪市')`)).rows[0].n, 0);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${JUR_NEW}`)).rows[0].n, 0);
  await db.exec(`ALTER TABLE submission_offices DROP CONSTRAINT t_mid`);
  await applyOk(db);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id WHERE ${JUR_NEW}`)).rows[0].n, 51);
});
await test('途中の管轄INSERT拒否（京都の途中の区）でも全体がロールバック', async () => {
  const db = await fresh();
  await db.exec(`CREATE FUNCTION t_fail() RETURNS trigger AS $$ BEGIN IF NEW.municipality_scope_id = (SELECT id FROM municipalities WHERE code='261106') THEN RAISE EXCEPTION 't_juris_fail'; END IF; RETURN NEW; END $$ LANGUAGE plpgsql;
    CREATE TRIGGER t_trg BEFORE INSERT ON submission_jurisdictions FOR EACH ROW EXECUTE FUNCTION t_fail()`);
  await applyFails(db, /t_juris_fail/);
  assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows[0].n, 0);
  await db.exec(`DROP TRIGGER t_trg ON submission_jurisdictions`);
  await applyOk(db);
});

await test('パッチはINSERT専用（UPDATE/DELETE/DDL/GRANT/ON CONFLICTなし、organization_types参照なし）、第1〜3弾は無変更の別ファイル', async () => {
  const body = PATCH.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(body, /\b(GRANT|REVOKE|ALTER|TRUNCATE|DROP (TABLE|POLICY|FUNCTION|INDEX)|CREATE (POLICY|FUNCTION|INDEX))\b/i);
  assert.doesNotMatch(body, /CREATE TABLE(?! _s4_)/i);
  assert.doesNotMatch(body, /ON CONFLICT/i);
  assert.doesNotMatch(body, /\bUPDATE\b|\bDELETE\b/i);
  assert.doesNotMatch(body, /organization_types/i);
  assert.match(body, /^\s*BEGIN;/m); assert.match(body, /COMMIT;\s*$/);
  assert.match(body, /SET LOCAL search_path = pg_catalog, public/);
  assert.match(body, /SHARE ROW EXCLUSIVE MODE/);
  assert.match(body, /ARRAY\['2310','2311'\]/); assert.match(body, /ARRAY\['2610','2611'\]/); assert.match(body, /ARRAY\['2710','2711','2712'\]/);
  assert.equal((body.match(/INSERT INTO submission_offices/g) ?? []).length, 1);
  assert.equal((body.match(/INSERT INTO office_sources/g) ?? []).length, 1);
  assert.equal((body.match(/INSERT INTO submission_jurisdictions/g) ?? []).length, 1);
  assert.doesNotMatch(PATCH, /stage1|stage2|stage3|仙台|さいたま|千葉|横浜|川崎|相模原|新潟|静岡|浜松/);
});

console.log(`ALL ${results.length} PASS`);
