-- 政令指定都市 第6弾（広島8区・熊本5区）公開提出先マスター追加。
-- manual DATA PATCH（migrationではない・自動実行しない・本番未実行）。
-- INSERTのみ：窓口2/出典2/管轄13。既存行・規則・永続schema・権限は変更しない。
-- 2026-11-20公式照合、2026-11-25本文再確認。資産がある区ごとに作成。
-- 広島：本庁舎8階、区役所内の市税事務所家屋係・税務室でも受付。
-- 熊本：郵送は複数区分まとめ可・本庁舎2階、eLTAXは区ごと送信。
-- R9専用様式の公開は未確認、R8をR9扱いしない。税率/免税点/期限は引用しない。
-- FAX・download_page_url・e_filing_urlは未確認NULL。両市の様式URLは公式案内と同一。
-- 単一transaction/locks/前提照合/完全一致だけno-op/部分衝突拒否/全rollback。
-- 読取は既存公開prefectures/municipalities/procedures/procedure_submission_rulesと追加先3表のみ。
-- 実行は内容レビューと今回範囲の本番例外承認後のみ。psql -v ON_ERROR_STOP=1 -f 本ファイル

BEGIN;

SET LOCAL search_path = pg_catalog, public;

LOCK TABLE submission_offices, office_sources, submission_jurisdictions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE municipalities, prefectures, procedures, procedure_submission_rules IN SHARE MODE;

-- 追加内容（このトランザクション内だけの一時表）
CREATE TEMP TABLE _s6_offices (
  city          TEXT PRIMARY KEY,
  city_prefixes TEXT[] NOT NULL,
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

INSERT INTO _s6_offices VALUES
  ('広島市', ARRAY['3410'], '34', '広島市 財政局 税務部 固定資産税課 償却資産係（本庁舎8階）', '730-8586', '広島県広島市中区国泰寺町一丁目6番34号（本庁舎8階）', '082-504-2127', 'https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html', '[designated-cities-stage6 2026-11-20] 資産がある区ごとに書類を用意し、この提出先へ出します。区役所内の市税事務所家屋係・税務室でも受け付けています。 会社所在地では決めない。令和9年度の様式は公開を確認できていない（R9未確認）。', '[designated-cities-stage6 2026-11-20] 公式本文で担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html', '[designated-cities-stage6 2026-11-20] 資産がある区ごとに書類を用意し、同じ提出先へ提出。', '{"patch":"designated-cities-stage6-20261120","checked_on":"2026-11-20","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html","form_page_url":"https://www.city.hiroshima.lg.jp/living/zei/1006021/1025589/1019210.html"}}'::jsonb),
  ('熊本市', ARRAY['4310'], '43', '熊本市 固定資産税課 償却資産班（本庁舎2階）', '860-8601', '熊本県熊本市中央区手取本町1番1号（本庁舎2階）', '096-328-2195', 'https://www.city.kumamoto.jp/kiji00364398/index.html', '[designated-cities-stage6 2026-11-20] 資産がある区ごとに書類を用意し、郵送はこの提出先へまとめて出せます。窓口は本庁舎2階です。eLTAXは資産がある区ごとに送信します。 会社所在地では決めない。令和9年度の様式は公開を確認できていない（R9未確認）。', '[designated-cities-stage6 2026-11-20] 公式本文で担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.kumamoto.jp/kiji00364398/index.html', '[designated-cities-stage6 2026-11-20] 資産がある区ごとに書類を用意し、同じ提出先へ提出。', '{"patch":"designated-cities-stage6-20261120","checked_on":"2026-11-20","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.kumamoto.jp/kiji00364398/index.html","form_page_url":"https://www.city.kumamoto.jp/kiji00364398/index.html"}}'::jsonb);

CREATE TEMP TABLE _s6_wards (
  code  TEXT PRIMARY KEY,
  city  TEXT NOT NULL REFERENCES _s6_offices(city),
  ward  TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _s6_wards VALUES
  ('341011','広島市','中区'),
  ('341029','広島市','東区'),
  ('341037','広島市','南区'),
  ('341045','広島市','西区'),
  ('341053','広島市','安佐南区'),
  ('341061','広島市','安佐北区'),
  ('341070','広島市','安芸区'),
  ('341088','広島市','佐伯区'),
  ('431010','熊本市','中央区'),
  ('431028','熊本市','東区'),
  ('431036','熊本市','西区'),
  ('431044','熊本市','南区'),
  ('431052','熊本市','北区');

DO $stage6$
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
  -- 1. 13区が公開マスターに正規の都道府県・市接頭辞・名称で存在すること
  SELECT count(*) INTO n_ok
  FROM _s6_wards w
  JOIN _s6_offices o ON o.city = w.city
  JOIN municipalities m ON m.code = w.code
  JOIN prefectures p ON p.id = m.prefecture_id
  WHERE p.code = o.pref_code AND left(w.code, 4) = ANY (o.city_prefixes) AND m.name = w.city || w.ward;
  IF n_ok <> 13 OR (SELECT count(DISTINCT code) FROM _s6_wards) <> 13 THEN
    RAISE EXCEPTION 'stage6: 13区の公開マスター照合が一致しません（一致%件）。中止します。', n_ok;
  END IF;

  -- 2. 償却資産申告の規則が、想定どおり有効1件のみで変更されていないこと（読み取りのみ）
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage6: DEPRECIABLE_ASSET_TAX_RETURN の有効規則が%件です（1件のみ想定）。中止します。', n_ok;
  END IF;
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active
    AND r.office_category = 'municipal_asset_tax' AND r.recipient_scope = 'company'
    AND r.conditions = '[]'::jsonb AND r.priority = 0;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage6: 償却資産申告の規則が想定（municipal_asset_tax/company/[]/priority0）と異なります。中止します。';
  END IF;

  -- 3. 現在の状態の判定
  SELECT count(*) INTO n_off FROM submission_offices so
  WHERE so.office_category = 'municipal_asset_tax'
    AND (so.name IN (SELECT office_name FROM _s6_offices) OR so.organization_name IN (SELECT city FROM _s6_offices));
  SELECT count(*) INTO n_jur FROM submission_jurisdictions j
  JOIN municipalities m ON m.id = j.municipality_scope_id
  WHERE j.office_category = 'municipal_asset_tax' AND m.code IN (SELECT code FROM _s6_wards);

  IF n_off > 0 OR n_jur > 0 THEN
    -- 既に何かある。完全な最終状態（マーカー付き・全項目一致）のときだけno-op、それ以外は拒否。
    SELECT count(*) INTO n_off_exact
    FROM _s6_offices o JOIN submission_offices so
      ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    WHERE so.organization_name IS NOT DISTINCT FROM o.city
      AND so.postal_code IS NOT DISTINCT FROM o.postal_code AND so.address IS NOT DISTINCT FROM o.address
      AND so.phone IS NOT DISTINCT FROM o.phone AND so.official_url IS NOT DISTINCT FROM o.official_url
      AND so.fax IS NULL AND so.email IS NULL AND so.website_url IS NULL AND so.e_filing_url IS NULL
      AND so.download_page_url IS NULL AND so.map_url IS NULL AND so.business_hours IS NULL AND so.fallback_url IS NULL
      AND so.notes IS NOT DISTINCT FROM o.office_notes
      AND so.official_url_status = 'ok' AND so.official_url_checked_at IS NULL
      AND so.last_verified_at = DATE '2026-11-20' AND so.verification_due_at IS NULL
      AND so.update_frequency = 'unknown' AND so.is_active AND so.data_version = 1;

    SELECT count(*) INTO n_src_all FROM office_sources s
    WHERE s.office_id IN (SELECT so.id FROM submission_offices so JOIN _s6_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);
    SELECT count(*) INTO n_src_exact
    FROM _s6_offices o
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN office_sources s ON s.office_id = so.id
    WHERE s.source_type = 'municipal_government' AND s.publisher_name = o.city
      AND s.source_url IS NOT DISTINCT FROM o.official_url AND s.retrieved_at = DATE '2026-11-20'
      AND s.verification_method = 'official_page_check' AND s.verified_by IS NULL
      AND s.status = 'active' AND s.is_current AND s.snapshot = o.snapshot AND s.notes IS NOT DISTINCT FROM o.source_notes;

    -- 2窓口に紐づく管轄は区分・範囲を問わず全件が対象13件であること（余分な紐づけを拒否）
    SELECT count(*) INTO n_jur_off FROM submission_jurisdictions j
    WHERE j.office_id IN (SELECT so.id FROM submission_offices so JOIN _s6_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);

    SELECT count(*) INTO n_jur_exact
    FROM _s6_wards w
    JOIN _s6_offices o ON o.city = w.city
    JOIN municipalities m ON m.code = w.code
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN submission_jurisdictions j ON j.municipality_scope_id = m.id AND j.office_category = 'municipal_asset_tax'
    WHERE j.office_id = so.id AND j.scope_type = 'municipality' AND j.prefecture_scope_id IS NULL
      AND j.is_primary AND j.priority = 0 AND j.effective_from = DATE '2026-11-20' AND j.effective_to IS NULL AND j.notes IS NOT DISTINCT FROM o.juris_notes;

    IF n_off = 2 AND n_off_exact = 2 AND n_src_all = 2 AND n_src_exact = 2 AND n_jur = 13 AND n_jur_exact = 13 AND n_jur_off = 13 THEN
      RAISE NOTICE 'stage6: 既に完全に適用済みです（2/2/13）。何もしません（no-op）。';
      RETURN;
    END IF;
    RAISE EXCEPTION 'stage6: 同じ市・同じ区分の窓口または管轄が既に存在し、完全な適用済み状態ではありません（窓口%件/一致%、情報源%件/一致%、管轄%件/一致%/窓口に紐づく全管轄%件）。上書きせず中止します。',
      n_off, n_off_exact, n_src_all, n_src_exact, n_jur, n_jur_exact, n_jur_off;
  END IF;

  -- 4. 初回の追加。事前件数と既存行の指紋を控える。
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_off, h_off FROM submission_offices t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_src, h_src FROM office_sources t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_jur, h_jur FROM submission_jurisdictions t;

  FOR c IN SELECT * FROM _s6_offices ORDER BY city_prefixes[1] LOOP
    INSERT INTO submission_offices (
      office_category, organization_name, name, postal_code, address, phone, fax,
      official_url, e_filing_url, download_page_url, notes,
      official_url_status, official_url_checked_at, update_frequency, last_verified_at, verification_due_at
    ) VALUES (
      'municipal_asset_tax', c.city, c.office_name, c.postal_code, c.address, c.phone, NULL,
      c.official_url, NULL, NULL, c.office_notes,
      'ok', NULL, 'unknown', DATE '2026-11-20', NULL
    ) RETURNING id INTO v_office_id;

    INSERT INTO office_sources (
      office_id, source_type, publisher_name, source_url, retrieved_at, verification_method,
      verified_by, status, is_current, snapshot, notes
    ) VALUES (
      v_office_id, 'municipal_government', c.city, c.official_url, DATE '2026-11-20', 'official_page_check',
      NULL, 'active', true, c.snapshot, c.source_notes
    );

    INSERT INTO submission_jurisdictions (
      office_id, office_category, scope_type, municipality_scope_id, is_primary, priority, effective_from, notes
    )
    SELECT v_office_id, 'municipal_asset_tax', 'municipality', m.id, true, 0, DATE '2026-11-20', c.juris_notes
    FROM _s6_wards w JOIN municipalities m ON m.code = w.code
    WHERE w.city = c.city;
  END LOOP;

  -- 5. 追加後の確認（+2/+2/+13、現行情報源2、既存行は不変）
  SELECT count(*) INTO a_off FROM submission_offices;
  SELECT count(*) INTO a_src FROM office_sources;
  SELECT count(*) INTO a_jur FROM submission_jurisdictions;
  IF a_off <> b_off + 2 OR a_src <> b_src + 2 OR a_jur <> b_jur + 13 THEN
    RAISE EXCEPTION 'stage6: 追加件数が想定（+2/+2/+13）と異なります（%/%/%）。', a_off - b_off, a_src - b_src, a_jur - b_jur;
  END IF;
  IF (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_offices t
        WHERE t.id NOT IN (SELECT so.id FROM submission_offices so JOIN _s6_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_off
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM office_sources t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s6_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_src
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_jurisdictions t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s6_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_jur THEN
    RAISE EXCEPTION 'stage6: 既存行が変化しています。中止します。';
  END IF;
  SELECT count(*) INTO n_ok FROM office_sources s JOIN submission_offices so ON so.id = s.office_id
  JOIN _s6_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
  WHERE s.is_current AND s.status = 'active';
  IF n_ok <> 2 THEN
    RAISE EXCEPTION 'stage6: 現行の情報源が2件ではありません（%件）。', n_ok;
  END IF;
  RAISE NOTICE 'stage6: 追加完了（窓口+3 / 情報源+3 / 管轄+20）。';
END
$stage6$;

COMMIT;
