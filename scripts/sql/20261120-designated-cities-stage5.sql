-- ============================================================
-- 政令指定都市 第5弾（堺市・神戸市・岡山市）償却資産の提出先 公開マスター追加パッチ
-- ============================================================
-- 【位置づけ】手動レビュー用のデータ専用パッチ（DATA PATCH）。migrationではなく自動実行しない。本番未実行（準備のみ）。
--   ローカルの隔離PGliteでのみ試験済み（scripts/validate-designated-cities-stage5.mjs）。
-- 【内容】INSERTのみ: submission_offices 3件 / office_sources 3件 / submission_jurisdictions 20件（堺7・神戸9・岡山4）。
--   コードの接頭辞: 堺2714 / 神戸2810+2811 / 岡山3310。
--   既存行のUPDATE/DELETE、DDL、GRANT、RLS、規則(procedure_submission_rules)の変更はしない。
--   読み取りは municipalities / prefectures / procedures / procedure_submission_rules と、追加先3表のみ。
--   organization_typesは参照しない（office_categoryのFKは既存の municipal_asset_tax で暗黙に検証される）。
-- 【根拠】公式ページ/PDFで担当課・提出先・電話を確認（2026-11-20、Codex確認）。会社所在地では決めない。
--   3市とも「資産がある区ごとに書類を用意」を確認済み。
--   堺市は郵送を三国ヶ丘庁舎3階の提出先へ。持参は各区の市税の窓口でも受付可。様式ページは公式案内ページと別URL。
--   神戸市は新長田合同庁舎4階へ郵送または持参。法人市民税の提出先とは異なる。
--   岡山市は分庁舎3階へまとめて提出。区役所・市税事務所への提出ではない。区ごとの作成の根拠はR8手引PDF（1枚目）。
--   令和9年度様式は3市とも公開を確認できていない（R9未確認）。R8の資料をR9様式として扱わない。
--   税率・免税点・期限は引用しない。FAXは未確認のためNULL。
--   様式ページURLは情報源snapshotに格納し、download_page_url・e_filing_urlはNULL（第2〜4弾と同じ）。
-- 【実行方法（レビュー後・承認後のみ）】psql -v ON_ERROR_STOP=1 -f 本ファイル
--   失敗時: エラーで中断し、全体がROLLBACKされる（トランザクション内。手作業のDELETEで戻さない）。
--   再実行しても安全: 完全に適用済み（マーカー・全項目一致）ならno-op、部分適用/混在/既存衝突ならEXCEPTIONで拒否する。
-- 【画面】対応する画面（資産所在地の選択）は src/lib/assetSubmissionDestination.ts（固定値）。
-- ============================================================

BEGIN;

SET LOCAL search_path = pg_catalog, public;

LOCK TABLE submission_offices, office_sources, submission_jurisdictions IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE municipalities, prefectures, procedures, procedure_submission_rules IN SHARE MODE;

-- 追加内容（このトランザクション内だけの一時表）
CREATE TEMP TABLE _s5_offices (
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

INSERT INTO _s5_offices VALUES
  ('堺市', ARRAY['2714'], '27', '堺市 市税事務所 固定資産税課 償却資産係（三国ヶ丘庁舎3階）', '591-8037',
   '大阪府堺市北区百舌鳥赤畑町1丁3番地1（三国ヶ丘庁舎3階）', '072-231-9765',
   'https://www.city.sakai.lg.jp/shisei/gaiyo/annai/gyoseikiko/zaisei/shizei/kotei.html',
   '[designated-cities-stage5 2026-11-20] 償却資産は資産がある区ごとに書類を用意し、郵送はこの提出先へ提出（会社所在地では決めない）。持参は各区の市税の窓口でも受け付けている。令和9年度の様式は公開を確認できていない（R9未確認）。',
   '[designated-cities-stage5 2026-11-20] 公式ページで担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.sakai.lg.jp/benri/download/download_shimin/mokuteki/kurashi/zeikin/koteishisan/syoukyakushishanshinkoku.html',
   '[designated-cities-stage5 2026-11-20] 資産がある区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage5-20261120","checked_on":"2026-11-20","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.sakai.lg.jp/shisei/gaiyo/annai/gyoseikiko/zaisei/shizei/kotei.html","form_page_url":"https://www.city.sakai.lg.jp/benri/download/download_shimin/mokuteki/kurashi/zeikin/koteishisan/syoukyakushishanshinkoku.html"}}'::jsonb),
  ('神戸市', ARRAY['2810','2811'], '28', '神戸市 固定資産税調整課 償却資産担当（新長田合同庁舎4階）', '653-8773',
   '兵庫県神戸市長田区二葉町5丁目1番32号（新長田合同庁舎4階）', '078-647-9433',
   'https://www.city.kobe.lg.jp/a03858/kurashi/registration/shinsei/zei/koteishisan/syokyaku_sinkoku.html',
   '[designated-cities-stage5 2026-11-20] 償却資産は資産がある区ごとに書類を用意し、この提出先へ郵送または持参（会社所在地では決めない）。法人市民税の提出先とは異なる。令和9年度の様式は公開を確認できていない（R9未確認）。',
   '[designated-cities-stage5 2026-11-20] 公式ページで担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.kobe.lg.jp/a03858/kurashi/registration/shinsei/zei/koteishisan/syokyaku_sinkoku.html',
   '[designated-cities-stage5 2026-11-20] 資産がある区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage5-20261120","checked_on":"2026-11-20","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.kobe.lg.jp/a03858/kurashi/registration/shinsei/zei/koteishisan/syokyaku_sinkoku.html","form_page_url":"https://www.city.kobe.lg.jp/a03858/kurashi/registration/shinsei/zei/koteishisan/syokyaku_sinkoku.html"}}'::jsonb),
  ('岡山市', ARRAY['3310'], '33', '岡山市 課税管理課 償却資産係（分庁舎3階）', '700-8544',
   '岡山県岡山市北区大供一丁目2番3号（分庁舎3階）', '086-803-1181',
   'https://www.city.okayama.jp/kurashi/0000005379.html',
   '[designated-cities-stage5 2026-11-20] 償却資産は資産がある区ごとに書類を用意し、この提出先へまとめて提出（会社所在地では決めない）。区役所・市税事務所への提出ではない。令和9年度の様式は公開を確認できていない（R9未確認）。',
   '[designated-cities-stage5 2026-11-20] 公式ページで担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.okayama.jp/kurashi/0000031132.html 区ごとの作成の根拠: https://www.city.okayama.jp/kurashi/cmsfiles/contents/0000031/31132/R8tebiki.pdf（R8手引PDF 1枚目）',
   '[designated-cities-stage5 2026-11-20] 資産がある区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage5-20261120","checked_on":"2026-11-20","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.okayama.jp/kurashi/0000005379.html","form_page_url":"https://www.city.okayama.jp/kurashi/0000031132.html","per_ward_filing_evidence_url":"https://www.city.okayama.jp/kurashi/cmsfiles/contents/0000031/31132/R8tebiki.pdf"},"per_ward_filing_evidence_page":1}'::jsonb);

CREATE TEMP TABLE _s5_wards (
  code  TEXT PRIMARY KEY,
  city  TEXT NOT NULL REFERENCES _s5_offices(city),
  ward  TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _s5_wards VALUES
  ('271411','堺市','堺区'), ('271420','堺市','中区'), ('271438','堺市','東区'), ('271446','堺市','西区'), ('271454','堺市','南区'), ('271462','堺市','北区'), ('271471','堺市','美原区'),
  ('281018','神戸市','東灘区'), ('281026','神戸市','灘区'), ('281051','神戸市','兵庫区'), ('281069','神戸市','長田区'), ('281077','神戸市','須磨区'), ('281085','神戸市','垂水区'), ('281093','神戸市','北区'), ('281107','神戸市','中央区'), ('281115','神戸市','西区'),
  ('331015','岡山市','北区'), ('331023','岡山市','中区'), ('331031','岡山市','東区'), ('331040','岡山市','南区');

DO $stage5$
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
  -- 1. 20区が公開マスターに正規の都道府県・市接頭辞・名称で存在すること
  SELECT count(*) INTO n_ok
  FROM _s5_wards w
  JOIN _s5_offices o ON o.city = w.city
  JOIN municipalities m ON m.code = w.code
  JOIN prefectures p ON p.id = m.prefecture_id
  WHERE p.code = o.pref_code AND left(w.code, 4) = ANY (o.city_prefixes) AND m.name = w.city || w.ward;
  IF n_ok <> 20 OR (SELECT count(DISTINCT code) FROM _s5_wards) <> 20 THEN
    RAISE EXCEPTION 'stage5: 20区の公開マスター照合が一致しません（一致%件）。中止します。', n_ok;
  END IF;

  -- 2. 償却資産申告の規則が、想定どおり有効1件のみで変更されていないこと（読み取りのみ）
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage5: DEPRECIABLE_ASSET_TAX_RETURN の有効規則が%件です（1件のみ想定）。中止します。', n_ok;
  END IF;
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active
    AND r.office_category = 'municipal_asset_tax' AND r.recipient_scope = 'company'
    AND r.conditions = '[]'::jsonb AND r.priority = 0;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage5: 償却資産申告の規則が想定（municipal_asset_tax/company/[]/priority0）と異なります。中止します。';
  END IF;

  -- 3. 現在の状態の判定
  SELECT count(*) INTO n_off FROM submission_offices so
  WHERE so.office_category = 'municipal_asset_tax'
    AND (so.name IN (SELECT office_name FROM _s5_offices) OR so.organization_name IN (SELECT city FROM _s5_offices));
  SELECT count(*) INTO n_jur FROM submission_jurisdictions j
  JOIN municipalities m ON m.id = j.municipality_scope_id
  WHERE j.office_category = 'municipal_asset_tax' AND m.code IN (SELECT code FROM _s5_wards);

  IF n_off > 0 OR n_jur > 0 THEN
    -- 既に何かある。完全な最終状態（マーカー付き・全項目一致）のときだけno-op、それ以外は拒否。
    SELECT count(*) INTO n_off_exact
    FROM _s5_offices o JOIN submission_offices so
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
    WHERE s.office_id IN (SELECT so.id FROM submission_offices so JOIN _s5_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);
    SELECT count(*) INTO n_src_exact
    FROM _s5_offices o
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN office_sources s ON s.office_id = so.id
    WHERE s.source_type = 'municipal_government' AND s.publisher_name = o.city
      AND s.source_url IS NOT DISTINCT FROM o.official_url AND s.retrieved_at = DATE '2026-11-20'
      AND s.verification_method = 'official_page_check' AND s.verified_by IS NULL
      AND s.status = 'active' AND s.is_current AND s.snapshot = o.snapshot AND s.notes IS NOT DISTINCT FROM o.source_notes;

    -- 3窓口に紐づく管轄は区分・範囲を問わず全件が対象20件であること（余分な紐づけを拒否）
    SELECT count(*) INTO n_jur_off FROM submission_jurisdictions j
    WHERE j.office_id IN (SELECT so.id FROM submission_offices so JOIN _s5_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);

    SELECT count(*) INTO n_jur_exact
    FROM _s5_wards w
    JOIN _s5_offices o ON o.city = w.city
    JOIN municipalities m ON m.code = w.code
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN submission_jurisdictions j ON j.municipality_scope_id = m.id AND j.office_category = 'municipal_asset_tax'
    WHERE j.office_id = so.id AND j.scope_type = 'municipality' AND j.prefecture_scope_id IS NULL
      AND j.is_primary AND j.priority = 0 AND j.effective_from = DATE '2026-11-20' AND j.effective_to IS NULL AND j.notes IS NOT DISTINCT FROM o.juris_notes;

    IF n_off = 3 AND n_off_exact = 3 AND n_src_all = 3 AND n_src_exact = 3 AND n_jur = 20 AND n_jur_exact = 20 AND n_jur_off = 20 THEN
      RAISE NOTICE 'stage5: 既に完全に適用済みです（3/3/20）。何もしません（no-op）。';
      RETURN;
    END IF;
    RAISE EXCEPTION 'stage5: 同じ市・同じ区分の窓口または管轄が既に存在し、完全な適用済み状態ではありません（窓口%件/一致%、情報源%件/一致%、管轄%件/一致%/窓口に紐づく全管轄%件）。上書きせず中止します。',
      n_off, n_off_exact, n_src_all, n_src_exact, n_jur, n_jur_exact, n_jur_off;
  END IF;

  -- 4. 初回の追加。事前件数と既存行の指紋を控える。
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_off, h_off FROM submission_offices t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_src, h_src FROM office_sources t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_jur, h_jur FROM submission_jurisdictions t;

  FOR c IN SELECT * FROM _s5_offices ORDER BY city_prefixes[1] LOOP
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
    FROM _s5_wards w JOIN municipalities m ON m.code = w.code
    WHERE w.city = c.city;
  END LOOP;

  -- 5. 追加後の確認（+3/+3/+20、現行情報源3、既存行は不変）
  SELECT count(*) INTO a_off FROM submission_offices;
  SELECT count(*) INTO a_src FROM office_sources;
  SELECT count(*) INTO a_jur FROM submission_jurisdictions;
  IF a_off <> b_off + 3 OR a_src <> b_src + 3 OR a_jur <> b_jur + 20 THEN
    RAISE EXCEPTION 'stage5: 追加件数が想定（+3/+3/+20）と異なります（%/%/%）。', a_off - b_off, a_src - b_src, a_jur - b_jur;
  END IF;
  IF (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_offices t
        WHERE t.id NOT IN (SELECT so.id FROM submission_offices so JOIN _s5_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_off
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM office_sources t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s5_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_src
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_jurisdictions t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s5_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_jur THEN
    RAISE EXCEPTION 'stage5: 既存行が変化しています。中止します。';
  END IF;
  SELECT count(*) INTO n_ok FROM office_sources s JOIN submission_offices so ON so.id = s.office_id
  JOIN _s5_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
  WHERE s.is_current AND s.status = 'active';
  IF n_ok <> 3 THEN
    RAISE EXCEPTION 'stage5: 現行の情報源が3件ではありません（%件）。', n_ok;
  END IF;
  RAISE NOTICE 'stage5: 追加完了（窓口+3 / 情報源+3 / 管轄+20）。';
END
$stage5$;

COMMIT;
