// 第6弾：実SQLをネットワークなしのPGlite合成データで検証。本番には接続しない。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const PATCH = readFileSync(new URL('./sql/20261120-designated-cities-stage6.sql', import.meta.url), 'utf8');
const DATA = [
  {
    "city": "広島市",
    "pref_code": "34",
    "prefixes": [
      "3410"
    ],
    "office_name": "広島市 財政局 税務部 固定資産税課 償却資産係（本庁舎8階）",
    "postal_code": "730-8586",
    "address": "広島県広島市中区国泰寺町一丁目6番34号（本庁舎8階）",
    "phone": "082-504-2127",
    "official_url": "https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html",
    "note": "資産がある区ごとに書類を用意し、この提出先へ出します。区役所内の市税事務所家屋係・税務室でも受け付けています。",
    "form_page_url": "https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html",
    "wards": [
      {
        "code": "341011",
        "label": "中区"
      },
      {
        "code": "341029",
        "label": "東区"
      },
      {
        "code": "341037",
        "label": "南区"
      },
      {
        "code": "341045",
        "label": "西区"
      },
      {
        "code": "341053",
        "label": "安佐南区"
      },
      {
        "code": "341061",
        "label": "安佐北区"
      },
      {
        "code": "341070",
        "label": "安芸区"
      },
      {
        "code": "341088",
        "label": "佐伯区"
      }
    ],
    "source_checked_on": "2026-11-20",
    "r9_form": "unconfirmed"
  },
  {
    "city": "熊本市",
    "pref_code": "43",
    "prefixes": [
      "4310"
    ],
    "office_name": "熊本市 固定資産税課 償却資産班（本庁舎2階）",
    "postal_code": "860-8601",
    "address": "熊本県熊本市中央区手取本町1番1号（本庁舎2階）",
    "phone": "096-328-2195",
    "official_url": "https://www.city.kumamoto.jp/kiji00364398/index.html",
    "note": "資産がある区ごとに書類を用意し、郵送はこの提出先へまとめて出せます。窓口は本庁舎2階です。eLTAXは資産がある区ごとに送信します。",
    "form_page_url": "https://www.city.kumamoto.jp/kiji00364398/index.html",
    "wards": [
      {
        "code": "431010",
        "label": "中央区"
      },
      {
        "code": "431028",
        "label": "東区"
      },
      {
        "code": "431036",
        "label": "西区"
      },
      {
        "code": "431044",
        "label": "南区"
      },
      {
        "code": "431052",
        "label": "北区"
      }
    ],
    "source_checked_on": "2026-11-20",
    "r9_form": "unconfirmed"
  }
];
const WARDS = DATA.map(c => [c.pref_code, c.prefixes, c.city, c.wards.map(w => [w.code, w.label])]);
const CITIES = DATA.map(c => c.city);
const CODES = DATA.flatMap(c => c.wards.map(w => w.code));
const MUNI_OFFICES = `office_category='municipal_asset_tax' AND organization_name IN ('広島市','熊本市')`;
const O = (s) => s.replace(/organization_name|office_category/g, m => 'o.' + m);
const JUR_NEW = `j.office_category='municipal_asset_tax' AND o.organization_name IN ('広島市','熊本市')`;
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
    INSERT INTO prefectures (code,name) VALUES ('34','広島県'),('43','熊本県'),('40','福岡県');
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
  for (const t of ['submission_offices', 'office_sources', 'submission_jurisdictions', 'procedure_submission_rules', 'prefectures', 'municipalities', 'procedures', 'organization_types'])
    s += (await db.query(`SELECT to_jsonb(t) AS j FROM ${t} t ORDER BY to_jsonb(t)::text`)).rows.map((r) => JSON.stringify(r.j)).join('\n') + '\n--\n';
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
await test('正常：2窓口・2出典・13区が独立公式照合値と一致、既存全行不変', async () => {
  const db = await fresh(); const before = await dump(db); await applyOk(db);
  const offices = (await db.query(`SELECT * FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows;
  const sources = (await db.query(`SELECT s.*,o.organization_name FROM office_sources s JOIN submission_offices o ON o.id=s.office_id WHERE ${O(MUNI_OFFICES)}`)).rows;
  const jur = (await db.query(`SELECT j.*,m.code FROM submission_jurisdictions j JOIN submission_offices o ON o.id=j.office_id JOIN municipalities m ON m.id=j.municipality_scope_id WHERE ${JUR_NEW}`)).rows;
  assert.equal(offices.length,2); assert.equal(sources.length,2); assert.equal(jur.length,13);
  for (const c of DATA) {
    const o = offices.find(o => o.organization_name === c.city);
    for (const [k,v] of Object.entries({name:c.office_name,postal_code:c.postal_code,address:c.address,phone:c.phone,official_url:c.official_url,fax:null,email:null,e_filing_url:null,download_page_url:null,official_url_status:'ok',official_url_checked_at:null,verification_due_at:null,update_frequency:'unknown',data_version:1,is_active:true})) assert.equal(o[k],v,`${c.city} ${k}`);
    assert.equal(o.last_verified_at.toISOString().slice(0,10),'2026-11-20');
    assert.match(o.notes,/資産がある区ごとに書類を用意/); assert.match(o.notes,/R9未確認/); assert.doesNotMatch(o.notes,/税率|免税点|期限/);
    const s = sources.find(s => s.office_id === o.id);
    assert.equal(s.source_type,'municipal_government'); assert.equal(s.publisher_name,c.city); assert.equal(s.source_url,c.official_url);
    assert.equal(s.verification_method,'official_page_check'); assert.equal(s.verified_by,null); assert.equal(s.status,'active'); assert.equal(s.is_current,true); assert.equal(s.retrieved_at.toISOString().slice(0,10),'2026-11-20');
    assert.deepEqual(s.snapshot,{patch:'designated-cities-stage6-20261120',checked_on:'2026-11-20',checked_fields:['office_name','postal_code','address','phone','official_url'],contact_status:'verified',per_ward_filing:'verified',r9_form:'unconfirmed',urls:{contact_filing_url:c.official_url,form_page_url:c.form_page_url}});
    for (const w of c.wards) {
      const j=jur.find(j => j.code===w.code); assert.ok(j,w.code); assert.equal(j.office_id,o.id); assert.equal(j.is_primary,true); assert.equal(j.priority,0); assert.equal(j.scope_type,'municipality'); assert.equal(j.prefecture_scope_id,null); assert.equal(j.effective_to,null); assert.equal(j.effective_from.toISOString().slice(0,10),'2026-11-20');
    }
  }
  const after = await dump(db); for (const l of before.split('\n').filter(l=>l&&l!=='--')) assert.ok(after.includes(l),l);
});
await test('完全一致の再実行は全表no-op', async()=>{const db=await fresh();await applyOk(db);const a=await dump(db);await applyOk(db);assert.equal(await dump(db),a);});
await test('他市の同じ区名・同じ区分と共存し既存不変', async()=>{
  const db=await fresh(); await db.exec(`INSERT INTO municipalities(prefecture_id,code,name) SELECT id,'401315','福岡市東区' FROM prefectures WHERE code='40';
    INSERT INTO submission_jurisdictions(office_id,office_category,scope_type,municipality_scope_id) SELECT o.id,o.office_category,'municipality',m.id FROM submission_offices o,municipalities m WHERE o.name='SENTINEL既存市窓口' AND m.code='401315'`);
  const before=await dump(db);await applyOk(db);const after=await dump(db);for(const l of before.split('\n').filter(l=>l&&l!=='--'))assert.ok(after.includes(l));
});
await test('各13区の欠落は失敗・全rollback', async()=>{for(const code of CODES){const db=await fresh();await db.query('DELETE FROM municipalities WHERE code=$1',[code]);await applyFails(db,/公開マスター照合/);}});
await test('都道府県の誤りは失敗（広島・熊本・一部の区・県の入替）', async()=>{
  for(const sql of [`UPDATE prefectures SET code='99' WHERE code='34'`,`UPDATE prefectures SET code='99' WHERE code='43'`,`UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='43') WHERE code='341088'`,`UPDATE municipalities SET prefecture_id=(SELECT id FROM prefectures WHERE code='40') WHERE code='431010'`]){const db=await fresh();await db.exec(sql);await applyFails(db,/公開マスター照合/);}
});
await test('名称・区名・隣接コードの誤りは失敗', async()=>{
  for(const sql of [`UPDATE municipalities SET name='広島市中区X' WHERE code='341011'`,`UPDATE municipalities SET name='熊本市北区X' WHERE code='431052'`,`UPDATE municipalities SET name='広島市東区' WHERE code='431028'`,`UPDATE municipalities SET code='341111' WHERE code='341011'`,`UPDATE municipalities SET code='431152' WHERE code='431052'`]){const db=await fresh();await db.exec(sql);await applyFails(db,/公開マスター照合/);}
});
await test('同市同区分の既存窓口は上書きせず拒否', async()=>{for(const city of CITIES){const db=await fresh();await db.query("INSERT INTO submission_offices(office_category,organization_name,name) VALUES('municipal_asset_tax',$1,'別窓口')",[city]);await applyFails(db,/既に存在/);}});
await test('同名窓口の衝突は拒否', async()=>{for(const c of DATA){const db=await fresh();await db.query("INSERT INTO submission_offices(office_category,name) VALUES('municipal_asset_tax',$1)",[c.office_name]);await applyFails(db,/既に存在/);}});
await test('各13区の主管轄の衝突は拒否', async()=>{for(const code of CODES){const db=await fresh();await db.query("INSERT INTO submission_jurisdictions(office_id,office_category,scope_type,municipality_scope_id) SELECT o.id,'municipal_asset_tax','municipality',m.id FROM submission_offices o,municipalities m WHERE o.name='SENTINEL既存市窓口' AND m.code=$1",[code]);await applyFails(db,/既に存在/);}});
await test('既存出典を持つ窓口との衝突も拒否', async()=>{for(const city of CITIES){const db=await fresh();await db.query("INSERT INTO submission_offices(office_category,organization_name,name) VALUES('municipal_asset_tax',$1,'別窓口')",[city]);await db.exec("INSERT INTO office_sources(office_id,source_type,publisher_name,retrieved_at,verification_method) SELECT id,'municipal_government','既存','2026-11-01','official_page_check' FROM submission_offices WHERE name='別窓口'");await applyFails(db,/既に存在/);}});
await test('規則の変更・複数・無効・不在は拒否', async()=>{
  for(const sql of [`UPDATE procedure_submission_rules SET office_category='tax_office'`,`UPDATE procedure_submission_rules SET conditions='[{"x":1}]'::jsonb`,`UPDATE procedure_submission_rules SET priority=1`,`UPDATE procedure_submission_rules SET recipient_scope='other'`,`UPDATE procedure_submission_rules SET is_active=false`,`DELETE FROM procedure_submission_rules`,`INSERT INTO procedure_submission_rules(procedure_id,office_category,priority) SELECT id,'tax_office',5 FROM procedures WHERE code='DEPRECIABLE_ASSET_TAX_RETURN'`]){const db=await fresh();await db.exec(sql);await applyFails(db,/規則/);}
});
await test('部分適用・属性改変・余計な紐付けは再実行で拒否', async()=>{
  for(const sql of [`DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='341011')`,`DELETE FROM submission_jurisdictions WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='431052')`,`DELETE FROM office_sources WHERE publisher_name='広島市'`,`UPDATE office_sources SET is_current=false WHERE publisher_name='熊本市'`,`UPDATE office_sources SET status='superseded' WHERE publisher_name='広島市'`,`DELETE FROM submission_offices WHERE organization_name='熊本市'`,`UPDATE submission_offices SET data_version=2 WHERE organization_name='広島市'`,`UPDATE submission_offices SET phone='000' WHERE organization_name='熊本市'`,`UPDATE submission_offices SET fax='000' WHERE organization_name='広島市'`,`UPDATE submission_offices SET download_page_url='https://x.example/' WHERE organization_name='熊本市'`,`UPDATE submission_offices SET e_filing_url='https://x.example/' WHERE organization_name='熊本市'`,`UPDATE submission_jurisdictions SET effective_from=DATE '2026-11-21' WHERE municipality_scope_id=(SELECT id FROM municipalities WHERE code='341088')`,`UPDATE office_sources SET snapshot='{}'::jsonb WHERE publisher_name='広島市'`,`UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{r9_form}','"verified"') WHERE publisher_name='熊本市'`,`UPDATE office_sources SET snapshot=jsonb_set(snapshot,'{urls,form_page_url}','"https://x.example/"') WHERE publisher_name='広島市'`,`INSERT INTO submission_jurisdictions(office_id,office_category,scope_type,municipality_scope_id,is_primary) SELECT o.id,'tax_office','municipality',m.id,false FROM submission_offices o,municipalities m WHERE o.organization_name='広島市' AND m.code='401331'`,`INSERT INTO submission_jurisdictions(office_id,office_category,scope_type,prefecture_scope_id,is_primary) SELECT o.id,'municipal_asset_tax','prefecture',p.id,false FROM submission_offices o,prefectures p WHERE o.organization_name='熊本市' AND p.code='40'`]){const db=await fresh();await applyOk(db);await db.exec(sql);await applyFails(db,/完全な適用済み状態ではありません|既に存在/);}
});
await test('2番目の窓口CHECK失敗は先の窓口・出典・管轄もrollback', async()=>{
  const db=await fresh();await db.exec("ALTER TABLE submission_offices ADD CONSTRAINT t_mid CHECK(organization_name IS DISTINCT FROM '熊本市')");await applyFails(db,/t_mid/);assert.equal((await db.query(`SELECT count(*)::int n FROM submission_offices WHERE ${MUNI_OFFICES}`)).rows[0].n,0);await db.exec('ALTER TABLE submission_offices DROP CONSTRAINT t_mid');await applyOk(db);
});
await test('2市目の管轄INSERT途中失敗も全rollback', async()=>{
  const db=await fresh();await db.exec(`CREATE FUNCTION t_fail() RETURNS trigger AS $$ BEGIN IF NEW.municipality_scope_id=(SELECT id FROM municipalities WHERE code='431036') THEN RAISE EXCEPTION 't_juris_fail'; END IF;RETURN NEW;END $$ LANGUAGE plpgsql; CREATE TRIGGER t_trg BEFORE INSERT ON submission_jurisdictions FOR EACH ROW EXECUTE FUNCTION t_fail()`);await applyFails(db,/t_juris_fail/);await db.exec('DROP TRIGGER t_trg ON submission_jurisdictions');await applyOk(db);
});
await test('手動INSERT専用・transaction/locks・本番DDLと権限変更なし', async()=>{
  const body=PATCH.split('\n').filter(l=>!l.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(body,/\b(GRANT|REVOKE|ALTER|TRUNCATE|UPDATE|DELETE)\b|ON CONFLICT|CREATE (POLICY|FUNCTION|INDEX)|DROP (TABLE|POLICY|FUNCTION|INDEX)|organization_types/i);
  assert.match(body,/BEGIN;/);assert.match(body,/COMMIT;\s*$/);assert.match(body,/SET LOCAL search_path = pg_catalog, public/);assert.match(body,/SHARE ROW EXCLUSIVE MODE/);
  assert.equal((body.match(/CREATE TEMP TABLE _s6_/g)||[]).length,2);
  for(const t of ['submission_offices','office_sources','submission_jurisdictions'])assert.equal((body.match(new RegExp('INSERT INTO '+t,'g'))||[]).length,1);
  assert.doesNotMatch(body,/stage[1-5]|_s5_/);
});
console.log(`ALL ${results.length} PASS`);
