-- ============================================================
-- 政令指定都市 第1弾（仙台市・さいたま市・千葉市）償却資産の提出先 公開マスター追加パッチ
-- ============================================================
-- 【位置づけ】手動レビュー用のデータ専用パッチ。migrationではなく自動実行しない。本番未実行（準備のみ）。
--   ローカルの隔離PGliteでのみ試験済み（scripts/validate-designated-cities-stage1.mjs）。
-- 【内容】INSERTのみ: submission_offices 3件 / office_sources 3件 / submission_jurisdictions 21件。
--   既存行のUPDATE/DELETE、DDL、GRANT、RLS、規則(procedure_submission_rules)の変更はしない。
--   読み取りは municipalities / prefectures / procedures / procedure_submission_rules のみ。
--   organization_typesは参照しない（office_categoryのFKは既存の municipal_asset_tax で暗黙に検証される）。
-- 【根拠】公式の償却資産申告ページで、担当課・郵送先・電話・「資産がある区ごとに書類を作成し1か所へ提出」を確認
--   （2026-11-19、Codex確認）。会社所在地では決めない。令和9年度様式の公開は確認できていない
--   （R8案内は見つかったがR9様式は未確認。R8をR9として扱わない）。税率・免税点・期限は引用しない。
--   法人市民税の窓口データは含めない（別途調査）。FAXは未確認のためNULL。
-- 【実行方法（レビュー後・承認後のみ）】psql -v ON_ERROR_STOP=1 -f 本ファイル
--   失敗時: エラーで中断し、全体がROLLBACKされる（トランザクション内。手作業のDELETEで戻さない）。
--   途中失敗後は COMMIT されないため、psqlが自動でROLLBACKする。再実行しても安全:
--   完全に適用済み（マーカー・全項目一致）ならno-op、部分適用/混在/既存衝突ならEXCEPTIONで拒否する。
-- 【画面】対応する画面（資産所在地の選択）は別途改修（src/lib/assetSubmissionDestination.ts）。
-- ============================================================

BEGIN;

SET LOCAL search_path = pg_catalog, public;

LOCK TABLE submission_offices, office_sources, submission_jurisdictions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE municipalities, prefectures, procedures, procedure_submission_rules IN SHARE MODE;

-- 追加内容（このトランザクション内だけの一時表）
CREATE TEMP TABLE _s1_offices (
  city          TEXT PRIMARY KEY,
  city_prefix   TEXT NOT NULL,
  pref_code     TEXT NOT NULL,
  office_name   TEXT NOT NULL,
  postal_code   TEXT NOT NULL,
  address       TEXT NOT NULL,
  phone         TEXT NOT NULL,
  official_url  TEXT NOT NULL,
  office_notes  TEXT NOT NULL,
  source_notes  TEXT NOT NULL,
  juris_notes   TEXT NOT NULL,
  snapshot      JSONB NOT NULL
) ON COMMIT DROP;

INSERT INTO _s1_offices VALUES
  ('仙台市', '041', '04', '仙台市 財政局 資産課税課 償却資産係（北庁舎1階）', '980-8671',
   '宮城県仙台市青葉区二日町1番1号（仙台市役所北庁舎1階）', '022-214-8619',
   'https://www.city.sendai.jp/sisanze-chose/kurashi/tetsuzuki/zekin/kekaku/tebiki/shisanze.html',
   '[designated-cities-stage1 2026-11-19] 償却資産は資産の所在地の区ごとに書類を用意し、この提出先へ提出（会社所在地では決めない）。令和9年度の様式は公開を確認できていない（R9未確認）。画面は別途改修。',
   '[designated-cities-stage1 2026-11-19] 公式の償却資産申告ページで担当・郵送先・電話・区ごとの作成を確認。R9様式は未確認。',
   '[designated-cities-stage1 2026-11-19] 資産の所在地の区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage1-20261119","checked_fields":["office_name","postal_code","address","phone","official_url","per_ward_filing"],"r9_form":"unconfirmed","checked_on":"2026-11-19"}'::jsonb),
  ('さいたま市', '111', '11', 'さいたま市 南部市税事務所 資産課税課 償却資産係（ときわ会館1階）', '330-0061',
   '埼玉県さいたま市浦和区常盤6丁目4番21号（ときわ会館1階）', '048-829-1186',
   'https://www.city.saitama.lg.jp/001/153/004/002/002/004/p009364.html',
   '[designated-cities-stage1 2026-11-19] 償却資産は資産の所在地の区ごとに書類を用意し、この提出先へ提出（会社所在地では決めない）。令和9年度の様式は公開を確認できていない（R9未確認）。画面は別途改修。',
   '[designated-cities-stage1 2026-11-19] 公式の償却資産申告ページで担当・郵送先・電話・区ごとの作成を確認。R9様式は未確認。',
   '[designated-cities-stage1 2026-11-19] 資産の所在地の区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage1-20261119","checked_fields":["office_name","postal_code","address","phone","official_url","per_ward_filing"],"r9_form":"unconfirmed","checked_on":"2026-11-19"}'::jsonb),
  ('千葉市', '121', '12', '千葉市 東部市税事務所 法人課 償却資産班（若葉区役所内）', '264-8582',
   '千葉県千葉市若葉区桜木北2丁目1番1号（若葉区役所内）', '043-233-8146',
   'https://www.city.chiba.jp/zaiseikyoku/zeimu/tobushizei/hojin/syoukyakushisan.html',
   '[designated-cities-stage1 2026-11-19] 償却資産は資産の所在地の区ごとに書類を用意し、この提出先へ提出（会社所在地では決めない）。令和9年度の様式は公開を確認できていない（R9未確認）。画面は別途改修。',
   '[designated-cities-stage1 2026-11-19] 公式の償却資産申告ページで担当・郵送先・電話・区ごとの作成を確認。R9様式は未確認。',
   '[designated-cities-stage1 2026-11-19] 資産の所在地の区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage1-20261119","checked_fields":["office_name","postal_code","address","phone","official_url","per_ward_filing"],"r9_form":"unconfirmed","checked_on":"2026-11-19"}'::jsonb);

CREATE TEMP TABLE _s1_wards (
  code  TEXT PRIMARY KEY,
  city  TEXT NOT NULL REFERENCES _s1_offices(city),
  ward  TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _s1_wards VALUES
  ('041017','仙台市','青葉区'), ('041025','仙台市','宮城野区'), ('041033','仙台市','若林区'),
  ('041041','仙台市','太白区'), ('041050','仙台市','泉区'),
  ('111015','さいたま市','西区'), ('111023','さいたま市','北区'), ('111031','さいたま市','大宮区'),
  ('111040','さいたま市','見沼区'), ('111058','さいたま市','中央区'), ('111066','さいたま市','桜区'),
  ('111074','さいたま市','浦和区'), ('111082','さいたま市','南区'), ('111091','さいたま市','緑区'),
  ('111104','さいたま市','岩槻区'),
  ('121011','千葉市','中央区'), ('121029','千葉市','花見川区'), ('121037','千葉市','稲毛区'),
  ('121045','千葉市','若葉区'), ('121053','千葉市','緑区'), ('121061','千葉市','美浜区');

DO $stage1$
DECLARE
  n_ok            INT;
  n_off           INT;
  n_jur           INT;
  n_off_exact     INT;
  n_src_all       INT;
  n_src_exact     INT;
  n_jur_exact     INT;
  n_jur_off       INT;
  c               RECORD;
  v_office_id     INT;
  b_off  INT; b_src INT; b_jur INT;
  h_off  TEXT; h_src TEXT; h_jur TEXT;
  a_off  INT; a_src INT; a_jur INT;
BEGIN
  -- 1. 21区が公開マスターに正規の都道府県・市接頭辞・名称で存在すること
  SELECT count(*) INTO n_ok
  FROM _s1_wards w
  JOIN _s1_offices o ON o.city = w.city
  JOIN municipalities m ON m.code = w.code
  JOIN prefectures p ON p.id = m.prefecture_id
  WHERE p.code = o.pref_code AND left(w.code, 3) = o.city_prefix AND m.name = w.city || w.ward;
  IF n_ok <> 21 OR (SELECT count(DISTINCT code) FROM _s1_wards) <> 21 THEN
    RAISE EXCEPTION 'stage1: 21区の公開マスター照合が一致しません（一致%件）。中止します。', n_ok;
  END IF;

  -- 2. 償却資産申告の規則が、想定どおり有効1件のみで変更されていないこと（読み取りのみ）
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage1: DEPRECIABLE_ASSET_TAX_RETURN の有効規則が%件です（1件のみ想定）。中止します。', n_ok;
  END IF;
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active
    AND r.office_category = 'municipal_asset_tax' AND r.recipient_scope = 'company'
    AND r.conditions = '[]'::jsonb AND r.priority = 0;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage1: 償却資産申告の規則が想定（municipal_asset_tax/company/[]/priority0）と異なります。中止します。';
  END IF;

  -- 3. 現在の状態の判定
  SELECT count(*) INTO n_off FROM submission_offices so
  WHERE so.office_category = 'municipal_asset_tax'
    AND (so.name IN (SELECT office_name FROM _s1_offices) OR so.organization_name IN (SELECT city FROM _s1_offices));
  SELECT count(*) INTO n_jur FROM submission_jurisdictions j
  JOIN municipalities m ON m.id = j.municipality_scope_id
  WHERE j.office_category = 'municipal_asset_tax' AND m.code IN (SELECT code FROM _s1_wards);

  IF n_off > 0 OR n_jur > 0 THEN
    -- 既に何かある。完全な最終状態（マーカー付き・全項目一致）のときだけno-op、それ以外は拒否。
    SELECT count(*) INTO n_off_exact
    FROM _s1_offices o JOIN submission_offices so
      ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    WHERE so.organization_name IS NOT DISTINCT FROM o.city
      AND so.postal_code IS NOT DISTINCT FROM o.postal_code AND so.address IS NOT DISTINCT FROM o.address
      AND so.phone IS NOT DISTINCT FROM o.phone AND so.official_url IS NOT DISTINCT FROM o.official_url
      AND so.fax IS NULL AND so.email IS NULL AND so.website_url IS NULL AND so.e_filing_url IS NULL
      AND so.download_page_url IS NULL AND so.map_url IS NULL AND so.business_hours IS NULL AND so.fallback_url IS NULL
      AND so.notes IS NOT DISTINCT FROM o.office_notes
      AND so.official_url_status = 'ok' AND so.official_url_checked_at IS NULL
      AND so.last_verified_at = DATE '2026-11-19' AND so.verification_due_at IS NULL
      AND so.update_frequency = 'unknown' AND so.is_active AND so.data_version = 1;

    SELECT count(*) INTO n_src_all FROM office_sources s
    WHERE s.office_id IN (SELECT so.id FROM submission_offices so JOIN _s1_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);
    SELECT count(*) INTO n_src_exact
    FROM _s1_offices o
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN office_sources s ON s.office_id = so.id
    WHERE s.source_type = 'municipal_government' AND s.publisher_name = o.city
      AND s.source_url IS NOT DISTINCT FROM o.official_url AND s.retrieved_at = DATE '2026-11-19'
      AND s.verification_method = 'official_page_check' AND s.verified_by IS NULL
      AND s.status = 'active' AND s.is_current AND s.snapshot = o.snapshot AND s.notes IS NOT DISTINCT FROM o.source_notes;

    -- 3窓口に紐づく管轄は区分・範囲を問わず全件が対象21件であること（余分な紐づけを拒否）
    SELECT count(*) INTO n_jur_off FROM submission_jurisdictions j
    WHERE j.office_id IN (SELECT so.id FROM submission_offices so JOIN _s1_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);

    SELECT count(*) INTO n_jur_exact
    FROM _s1_wards w
    JOIN _s1_offices o ON o.city = w.city
    JOIN municipalities m ON m.code = w.code
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN submission_jurisdictions j ON j.municipality_scope_id = m.id AND j.office_category = 'municipal_asset_tax'
    WHERE j.office_id = so.id AND j.scope_type = 'municipality' AND j.prefecture_scope_id IS NULL
      AND j.is_primary AND j.priority = 0 AND j.effective_from = DATE '2026-11-19' AND j.effective_to IS NULL AND j.notes IS NOT DISTINCT FROM o.juris_notes;

    IF n_off = 3 AND n_off_exact = 3 AND n_src_all = 3 AND n_src_exact = 3 AND n_jur = 21 AND n_jur_exact = 21 AND n_jur_off = 21 THEN
      RAISE NOTICE 'stage1: 既に完全に適用済みです（3/3/21）。何もしません（no-op）。';
      RETURN;
    END IF;
    RAISE EXCEPTION 'stage1: 同じ市・同じ区分の窓口または管轄が既に存在し、完全な適用済み状態ではありません（窓口%件/一致%、情報源%件/一致%、管轄%件/一致%/窓口に紐づく全管轄%件）。上書きせず中止します。',
      n_off, n_off_exact, n_src_all, n_src_exact, n_jur, n_jur_exact, n_jur_off;
  END IF;

  -- 4. 初回の追加。事前件数と既存行の指紋を控える。
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_off, h_off FROM submission_offices t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_src, h_src FROM office_sources t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_jur, h_jur FROM submission_jurisdictions t;

  FOR c IN SELECT * FROM _s1_offices ORDER BY city_prefix LOOP
    INSERT INTO submission_offices (
      office_category, organization_name, name, postal_code, address, phone, fax,
      official_url, e_filing_url, download_page_url, notes,
      official_url_status, official_url_checked_at, update_frequency, last_verified_at, verification_due_at
    ) VALUES (
      'municipal_asset_tax', c.city, c.office_name, c.postal_code, c.address, c.phone, NULL,
      c.official_url, NULL, NULL, c.office_notes,
      'ok', NULL, 'unknown', DATE '2026-11-19', NULL
    ) RETURNING id INTO v_office_id;

    INSERT INTO office_sources (
      office_id, source_type, publisher_name, source_url, retrieved_at, verification_method,
      verified_by, status, is_current, snapshot, notes
    ) VALUES (
      v_office_id, 'municipal_government', c.city, c.official_url, DATE '2026-11-19', 'official_page_check',
      NULL, 'active', true, c.snapshot, c.source_notes
    );

    INSERT INTO submission_jurisdictions (
      office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, effective_from, notes
    )
    SELECT v_office_id, 'municipal_asset_tax', 'municipality', m.id, true, 0, DATE '2026-11-19', c.juris_notes
    FROM _s1_wards w JOIN municipalities m ON m.code = w.code
    WHERE w.city = c.city;
  END LOOP;

  -- 5. 追加後の確認（+3/+3/+21、現行情報源3、既存行は不変）
  SELECT count(*) INTO a_off FROM submission_offices;
  SELECT count(*) INTO a_src FROM office_sources;
  SELECT count(*) INTO a_jur FROM submission_jurisdictions;
  IF a_off <> b_off + 3 OR a_src <> b_src + 3 OR a_jur <> b_jur + 21 THEN
    RAISE EXCEPTION 'stage1: 追加件数が想定（+3/+3/+21）と異なります（%/%/%）。', a_off - b_off, a_src - b_src, a_jur - b_jur;
  END IF;
  IF (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_offices t
        WHERE t.id NOT IN (SELECT so.id FROM submission_offices so JOIN _s1_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_off
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM office_sources t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s1_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_src
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_jurisdictions t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s1_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_jur THEN
    RAISE EXCEPTION 'stage1: 既存行が変化しています。中止します。';
  END IF;
  SELECT count(*) INTO n_ok FROM office_sources s JOIN submission_offices so ON so.id = s.office_id
  JOIN _s1_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
  WHERE s.is_current AND s.status = 'active';
  IF n_ok <> 3 THEN
    RAISE EXCEPTION 'stage1: 現行の情報源が3件ではありません（%件）。', n_ok;
  END IF;
  RAISE NOTICE 'stage1: 追加完了（窓口+3 / 情報源+3 / 管轄+21）。';
END
$stage1$;

COMMIT;
