-- ============================================================
-- 政令指定都市 第4弾（名古屋市・京都市・大阪市）償却資産の提出先 公開マスター追加パッチ
-- ============================================================
-- 【位置づけ】手動レビュー用のデータ専用パッチ（DATA PATCH）。migrationではなく自動実行しない。本番未実行（準備のみ）。
--   ローカルの隔離PGliteでのみ試験済み（scripts/validate-designated-cities-stage4.mjs）。
-- 【内容】INSERTのみ: submission_offices 3件 / office_sources 3件 / submission_jurisdictions 51件（名古屋16・京都11・大阪24）。
--   コードの接頭辞: 名古屋2310+2311 / 京都2610+2611 / 大阪2710+2711+2712。
--   既存行のUPDATE/DELETE、DDL、GRANT、RLS、規則(procedure_submission_rules)の変更はしない。
--   読み取りは municipalities / prefectures / procedures / procedure_submission_rules と、追加先3表のみ。
--   organization_typesは参照しない（office_categoryのFKは既存の municipal_asset_tax で暗黙に検証される）。
-- 【根拠】公式ページ/PDFで担当課・提出先・電話を確認（2026-11-19、Codex確認）。会社所在地では決めない。
--   3市とも「資産がある区ごとに書類を用意」を確認済み。
--   名古屋市は2026-04-01以降、全区の窓口が金山市税事務所に集約（旧3事務所の区別はしない）。様式ページは公式案内ページと別URL。
--   京都市は2025-08の移転後の分庁舎地下1階。区役所・支所・出張所では受付不可。R8手引後半PDFの7枚目（印刷p18）で区ごとの作成、
--   12枚目で移転先・電話・郵送先・区役所等受付不可を確認。
--   大阪市は直通06-4705-2941（総合2948とは混同しない）。船場センタービル3号館2階北側。市税事務所での持参受付もある。
--   令和9年度様式は3市とも公開を確認できていない（R9未確認）。R8の資料をR9様式として扱わない。
--   税率・免税点・期限は引用しない。FAXは未確認のためNULL。
--   様式ページURLは情報源snapshotに格納し、download_page_url・e_filing_urlはNULL（第2・3弾と同じ）。
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
CREATE TEMP TABLE _s4_offices (
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

INSERT INTO _s4_offices VALUES
  ('名古屋市', ARRAY['2310','2311'], '23', '名古屋市 金山市税事務所 償却資産課税課（名鉄正木第一ビル）', '460-8626',
   '愛知県名古屋市中区正木三丁目5番33号（名鉄正木第一ビル）', '052-324-9809',
   'https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011959.html',
   '[designated-cities-stage4 2026-11-19] 償却資産は資産がある区ごとに書類を用意し、この提出先へ提出（会社所在地では決めない）。2026年4月以降は全区の窓口が金山市税事務所に集約されている（旧3事務所の区別はしない）。令和9年度の様式は公開を確認できていない（R9未確認）。',
   '[designated-cities-stage4 2026-11-19] 公式ページで担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011956.html',
   '[designated-cities-stage4 2026-11-19] 資産がある区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage4-20261119","checked_on":"2026-11-19","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011959.html","form_page_url":"https://www.city.nagoya.jp/kurashi/zeikin/1037356/1011931/1011953/1011956.html"}}'::jsonb),
  ('京都市', ARRAY['2610','2611'], '26', '京都市 市税事務所 法人諸税室 償却資産担当（分庁舎地下1階）', '604-8571',
   '京都府京都市中京区寺町通御池上る上本能寺前町488番地（京都市役所分庁舎地下1階）', '075-222-3170',
   'https://www.city.kyoto.lg.jp/gyozai/page/0000052941.html',
   '[designated-cities-stage4 2026-11-19] 償却資産は資産がある区ごとに書類を用意し、この提出先へ提出（会社所在地では決めない）。2025年8月の移転後は市役所分庁舎地下1階。区役所・支所・出張所では受け付けていない。令和9年度の様式は公開を確認できていない（R9未確認）。',
   '[designated-cities-stage4 2026-11-19] 公式ページで担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.kyoto.lg.jp/gyozai/page/0000052941.html 区ごとの作成の根拠: https://www.city.kyoto.lg.jp/gyozai/cmsfiles/contents/0000052/52941/R8tebiki2.pdf（R8手引後半PDF 7枚目・印刷p18、連絡先は12枚目）',
   '[designated-cities-stage4 2026-11-19] 資産がある区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage4-20261119","checked_on":"2026-11-19","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.kyoto.lg.jp/gyozai/page/0000052941.html","form_page_url":"https://www.city.kyoto.lg.jp/gyozai/page/0000052941.html","per_ward_filing_evidence_url":"https://www.city.kyoto.lg.jp/gyozai/cmsfiles/contents/0000052/52941/R8tebiki2.pdf"},"per_ward_filing_evidence_page":7,"per_ward_filing_evidence_printed_page":18,"contact_evidence_pdf_page":12}'::jsonb),
  ('大阪市', ARRAY['2710','2711','2712'], '27', '大阪市 船場法人市税事務所 固定資産税（償却資産）グループ（船場センタービル3号館2階北側）', '541-8551',
   '大阪府大阪市中央区船場中央1-4-3-203（船場センタービル3号館2階北側）', '06-4705-2941',
   'https://www.city.osaka.lg.jp/zaisei/page/0000006293.html',
   '[designated-cities-stage4 2026-11-19] 償却資産は資産がある区ごとに書類を用意し、この提出先へ提出（会社所在地では決めない）。直通電話は06-4705-2941（総合窓口の2948とは混同しない）。郵送はこの提出先へ。区役所では受け付けていない。市税事務所への持参受付もある。令和9年度の様式は公開を確認できていない（R9未確認）。',
   '[designated-cities-stage4 2026-11-19] 公式ページで担当・提出先・電話・区ごとの作成を確認。R9様式は未確認（R8をR9として扱わない）。様式ページ: https://www.city.osaka.lg.jp/zaisei/page/0000006293.html 区ごとの作成の根拠: https://www.city.osaka.lg.jp/zaisei/page/0000385226.html 連絡先の根拠: https://www.city.osaka.lg.jp/zaisei/page/0000006614.html',
   '[designated-cities-stage4 2026-11-19] 資産がある区ごとに書類を用意し、同じ提出先へ提出。',
   '{"patch":"designated-cities-stage4-20261119","checked_on":"2026-11-19","checked_fields":["office_name","postal_code","address","phone","official_url"],"contact_status":"verified","per_ward_filing":"verified","r9_form":"unconfirmed","urls":{"contact_filing_url":"https://www.city.osaka.lg.jp/zaisei/page/0000006293.html","form_page_url":"https://www.city.osaka.lg.jp/zaisei/page/0000006293.html","per_ward_filing_evidence_url":"https://www.city.osaka.lg.jp/zaisei/page/0000385226.html","contact_evidence_url":"https://www.city.osaka.lg.jp/zaisei/page/0000006614.html"}}'::jsonb);

CREATE TEMP TABLE _s4_wards (
  code  TEXT PRIMARY KEY,
  city  TEXT NOT NULL REFERENCES _s4_offices(city),
  ward  TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _s4_wards VALUES
  ('231011','名古屋市','千種区'), ('231029','名古屋市','東区'), ('231037','名古屋市','北区'), ('231045','名古屋市','西区'), ('231053','名古屋市','中村区'), ('231061','名古屋市','中区'), ('231070','名古屋市','昭和区'), ('231088','名古屋市','瑞穂区'), ('231096','名古屋市','熱田区'), ('231100','名古屋市','中川区'), ('231118','名古屋市','港区'), ('231126','名古屋市','南区'), ('231134','名古屋市','守山区'), ('231142','名古屋市','緑区'), ('231151','名古屋市','名東区'), ('231169','名古屋市','天白区'),
  ('261017','京都市','北区'), ('261025','京都市','上京区'), ('261033','京都市','左京区'), ('261041','京都市','中京区'), ('261050','京都市','東山区'), ('261068','京都市','下京区'), ('261076','京都市','南区'), ('261084','京都市','右京区'), ('261092','京都市','伏見区'), ('261106','京都市','山科区'), ('261114','京都市','西京区'),
  ('271021','大阪市','都島区'), ('271039','大阪市','福島区'), ('271047','大阪市','此花区'), ('271063','大阪市','西区'), ('271071','大阪市','港区'), ('271080','大阪市','大正区'), ('271098','大阪市','天王寺区'), ('271110','大阪市','浪速区'), ('271136','大阪市','西淀川区'), ('271144','大阪市','東淀川区'), ('271152','大阪市','東成区'), ('271161','大阪市','生野区'), ('271179','大阪市','旭区'), ('271187','大阪市','城東区'), ('271195','大阪市','阿倍野区'), ('271209','大阪市','住吉区'), ('271217','大阪市','東住吉区'), ('271225','大阪市','西成区'), ('271233','大阪市','淀川区'), ('271241','大阪市','鶴見区'), ('271250','大阪市','住之江区'), ('271268','大阪市','平野区'), ('271276','大阪市','北区'), ('271284','大阪市','中央区');

DO $stage4$
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
  -- 1. 51区が公開マスターに正規の都道府県・市接頭辞・名称で存在すること
  SELECT count(*) INTO n_ok
  FROM _s4_wards w
  JOIN _s4_offices o ON o.city = w.city
  JOIN municipalities m ON m.code = w.code
  JOIN prefectures p ON p.id = m.prefecture_id
  WHERE p.code = o.pref_code AND left(w.code, 4) = ANY (o.city_prefixes) AND m.name = w.city || w.ward;
  IF n_ok <> 51 OR (SELECT count(DISTINCT code) FROM _s4_wards) <> 51 THEN
    RAISE EXCEPTION 'stage4: 51区の公開マスター照合が一致しません（一致%件）。中止します。', n_ok;
  END IF;

  -- 2. 償却資産申告の規則が、想定どおり有効1件のみで変更されていないこと（読み取りのみ）
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage4: DEPRECIABLE_ASSET_TAX_RETURN の有効規則が%件です（1件のみ想定）。中止します。', n_ok;
  END IF;
  SELECT count(*) INTO n_ok
  FROM procedure_submission_rules r JOIN procedures p ON p.id = r.procedure_id
  WHERE p.code = 'DEPRECIABLE_ASSET_TAX_RETURN' AND r.is_active
    AND r.office_category = 'municipal_asset_tax' AND r.recipient_scope = 'company'
    AND r.conditions = '[]'::jsonb AND r.priority = 0;
  IF n_ok <> 1 THEN
    RAISE EXCEPTION 'stage4: 償却資産申告の規則が想定（municipal_asset_tax/company/[]/priority0）と異なります。中止します。';
  END IF;

  -- 3. 現在の状態の判定
  SELECT count(*) INTO n_off FROM submission_offices so
  WHERE so.office_category = 'municipal_asset_tax'
    AND (so.name IN (SELECT office_name FROM _s4_offices) OR so.organization_name IN (SELECT city FROM _s4_offices));
  SELECT count(*) INTO n_jur FROM submission_jurisdictions j
  JOIN municipalities m ON m.id = j.municipality_scope_id
  WHERE j.office_category = 'municipal_asset_tax' AND m.code IN (SELECT code FROM _s4_wards);

  IF n_off > 0 OR n_jur > 0 THEN
    -- 既に何かある。完全な最終状態（マーカー付き・全項目一致）のときだけno-op、それ以外は拒否。
    SELECT count(*) INTO n_off_exact
    FROM _s4_offices o JOIN submission_offices so
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
    WHERE s.office_id IN (SELECT so.id FROM submission_offices so JOIN _s4_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);
    SELECT count(*) INTO n_src_exact
    FROM _s4_offices o
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN office_sources s ON s.office_id = so.id
    WHERE s.source_type = 'municipal_government' AND s.publisher_name = o.city
      AND s.source_url IS NOT DISTINCT FROM o.official_url AND s.retrieved_at = DATE '2026-11-19'
      AND s.verification_method = 'official_page_check' AND s.verified_by IS NULL
      AND s.status = 'active' AND s.is_current AND s.snapshot = o.snapshot AND s.notes IS NOT DISTINCT FROM o.source_notes;

    -- 3窓口に紐づく管轄は区分・範囲を問わず全件が対象51件であること（余分な紐づけを拒否）
    SELECT count(*) INTO n_jur_off FROM submission_jurisdictions j
    WHERE j.office_id IN (SELECT so.id FROM submission_offices so JOIN _s4_offices o
                           ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name);

    SELECT count(*) INTO n_jur_exact
    FROM _s4_wards w
    JOIN _s4_offices o ON o.city = w.city
    JOIN municipalities m ON m.code = w.code
    JOIN submission_offices so ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
    JOIN submission_jurisdictions j ON j.municipality_scope_id = m.id AND j.office_category = 'municipal_asset_tax'
    WHERE j.office_id = so.id AND j.scope_type = 'municipality' AND j.prefecture_scope_id IS NULL
      AND j.is_primary AND j.priority = 0 AND j.effective_from = DATE '2026-11-19' AND j.effective_to IS NULL AND j.notes IS NOT DISTINCT FROM o.juris_notes;

    IF n_off = 3 AND n_off_exact = 3 AND n_src_all = 3 AND n_src_exact = 3 AND n_jur = 51 AND n_jur_exact = 51 AND n_jur_off = 51 THEN
      RAISE NOTICE 'stage4: 既に完全に適用済みです（3/3/51）。何もしません（no-op）。';
      RETURN;
    END IF;
    RAISE EXCEPTION 'stage4: 同じ市・同じ区分の窓口または管轄が既に存在し、完全な適用済み状態ではありません（窓口%件/一致%、情報源%件/一致%、管轄%件/一致%/窓口に紐づく全管轄%件）。上書きせず中止します。',
      n_off, n_off_exact, n_src_all, n_src_exact, n_jur, n_jur_exact, n_jur_off;
  END IF;

  -- 4. 初回の追加。事前件数と既存行の指紋を控える。
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_off, h_off FROM submission_offices t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_src, h_src FROM office_sources t;
  SELECT count(*), coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') INTO b_jur, h_jur FROM submission_jurisdictions t;

  FOR c IN SELECT * FROM _s4_offices ORDER BY city_prefixes[1] LOOP
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
    FROM _s4_wards w JOIN municipalities m ON m.code = w.code
    WHERE w.city = c.city;
  END LOOP;

  -- 5. 追加後の確認（+3/+3/+51、現行情報源3、既存行は不変）
  SELECT count(*) INTO a_off FROM submission_offices;
  SELECT count(*) INTO a_src FROM office_sources;
  SELECT count(*) INTO a_jur FROM submission_jurisdictions;
  IF a_off <> b_off + 3 OR a_src <> b_src + 3 OR a_jur <> b_jur + 51 THEN
    RAISE EXCEPTION 'stage4: 追加件数が想定（+3/+3/+51）と異なります（%/%/%）。', a_off - b_off, a_src - b_src, a_jur - b_jur;
  END IF;
  IF (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_offices t
        WHERE t.id NOT IN (SELECT so.id FROM submission_offices so JOIN _s4_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_off
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM office_sources t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s4_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_src
     OR (SELECT coalesce(md5(string_agg(to_jsonb(t)::text, '|' ORDER BY t.id)), '') FROM submission_jurisdictions t
        WHERE t.office_id NOT IN (SELECT so.id FROM submission_offices so JOIN _s4_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name)) <> h_jur THEN
    RAISE EXCEPTION 'stage4: 既存行が変化しています。中止します。';
  END IF;
  SELECT count(*) INTO n_ok FROM office_sources s JOIN submission_offices so ON so.id = s.office_id
  JOIN _s4_offices o ON so.office_category = 'municipal_asset_tax' AND so.name = o.office_name
  WHERE s.is_current AND s.status = 'active';
  IF n_ok <> 3 THEN
    RAISE EXCEPTION 'stage4: 現行の情報源が3件ではありません（%件）。', n_ok;
  END IF;
  RAISE NOTICE 'stage4: 追加完了（窓口+3 / 情報源+3 / 管轄+51）。';
END
$stage4$;

COMMIT;
