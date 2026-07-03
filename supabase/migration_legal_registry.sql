-- ============================================================
-- SUNBOO経営ナビ — 「法務・登記」カテゴリ追加マイグレーション
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（IF NOT EXISTS / ON CONFLICT を使用）。
-- migration_link_status.sql の実行有無に関わらず単独で実行できます
-- （official_links / jurisdiction_offices の status系カラム追加も本ファイルに含む）。
-- ============================================================

-- ── 既存の未実行マイグレーション分を保険として再掲（冪等） ──────

ALTER TABLE jurisdiction_offices
  ADD COLUMN IF NOT EXISTS official_url            TEXT,
  ADD COLUMN IF NOT EXISTS official_url_status     TEXT NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS official_url_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fallback_url            TEXT;

ALTER TABLE official_links
  ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'unchecked',
  ADD COLUMN IF NOT EXISTS checked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fallback_url TEXT;

-- ── procedures に法務・登記用のカラムを追加 ──────────────────

ALTER TABLE procedures
  ADD COLUMN IF NOT EXISTS corporate_type         TEXT,                          -- 'kabushiki' | 'godo' | NULL(問わず)
  ADD COLUMN IF NOT EXISTS requires_officer_term  BOOLEAN NOT NULL DEFAULT FALSE, -- 役員変更登記のみ TRUE
  ADD COLUMN IF NOT EXISTS include_in_diagnosis   BOOLEAN NOT NULL DEFAULT TRUE,  -- FALSEは一覧/検索のみに表示し自動診断結果には出さない
  ADD COLUMN IF NOT EXISTS target_note            TEXT,                          -- 対象
  ADD COLUMN IF NOT EXISTS submission_method      TEXT,                          -- 提出方法
  ADD COLUMN IF NOT EXISTS e_filing_system_name   TEXT,                          -- 電子申請システム名
  ADD COLUMN IF NOT EXISTS e_filing_system_url    TEXT,                          -- 電子申請システムURL
  ADD COLUMN IF NOT EXISTS caution_note           TEXT;                          -- 注意点

-- ============================================================
-- 管轄機関: 東京法務局渋谷出張所（渋谷区の商業・法人登記管轄）
-- ============================================================
INSERT INTO jurisdiction_offices (
  municipality_id, office_type, name, address, phone,
  website_url, map_url,
  official_url, official_url_status, fallback_url
)
SELECT m.id, 'legal_affairs_bureau',
       '東京法務局渋谷出張所',
       '東京都渋谷区宇田川町1番10号（渋谷地方合同庁舎）',
       '03-3463-7671',
       'https://houmukyoku.moj.go.jp/tokyo/table/shikyokutou/all/shibuya.html',
       'https://maps.google.com/?q=東京法務局渋谷出張所',
       'https://houmukyoku.moj.go.jp/tokyo/table/shikyokutou/all/shibuya.html',
       'unchecked',
       'https://houmukyoku.moj.go.jp/tokyo/table/shikyokutou/all.html'
FROM municipalities m
WHERE m.code = '13113'
ON CONFLICT (municipality_id, office_type) DO UPDATE SET
  official_url = COALESCE(jurisdiction_offices.official_url, EXCLUDED.official_url),
  fallback_url = COALESCE(jurisdiction_offices.fallback_url, EXCLUDED.fallback_url);

-- ============================================================
-- 手続きマスタ（法務・登記 10手続き）
-- ============================================================
INSERT INTO procedures (
  code, name, description, category, requires_employees,
  office_type, frequency, timing_label, timing_type, timing_data, priority,
  corporate_type, requires_officer_term, include_in_diagnosis,
  target_note, submission_method, e_filing_system_name, e_filing_system_url, caution_note
) VALUES

('LEGAL_ESTABLISH_KK',
 '株式会社設立登記',
 '株式会社の設立には、本店所在地を管轄する法務局への設立登記が必要です。登記が完了した日が会社の成立日となります。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '出資の履行が完了した日から2週間以内（本店所在地の法務局へ申請）',
 'at_establishment', '{"days_from_event": 14}', 11,
 'kabushiki', FALSE, TRUE,
 '株式会社を新規設立する場合',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。登録免許税額・添付書類は個別事情により異なります。申請前に司法書士等の専門家または管轄法務局にご確認ください。'),

('LEGAL_ESTABLISH_GODO',
 '合同会社設立登記',
 '合同会社の設立には、本店所在地を管轄する法務局への設立登記が必要です。登記が完了した日が会社の成立日となります。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '社員の出資履行が完了した日から2週間以内（本店所在地の法務局へ申請）',
 'at_establishment', '{"days_from_event": 14}', 12,
 'godo', FALSE, TRUE,
 '合同会社を新規設立する場合',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。登録免許税額・添付書類は個別事情により異なります。申請前に司法書士等の専門家または管轄法務局にご確認ください。'),

('LEGAL_OFFICER_CHANGE',
 '役員変更登記',
 '取締役・監査役等の役員に就任・退任・任期満了による重任があった場合に必要な登記です。株式会社は役員の任期（最長10年）ごとに重任登記が必要になります。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '役員の就任・退任・重任等の変更が生じた日から2週間以内',
 'event_based', '{"days_from_event": 14}', 13,
 NULL, TRUE, TRUE,
 '株式会社で役員の任期満了・就任・退任があった場合',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '変更登記を怠ると100万円以下の過料の対象となる場合があります（会社法976条）。本情報は一般的な参考情報です。司法書士等の専門家にご確認ください。'),

('LEGAL_HQ_RELOCATION',
 '本店移転登記',
 '会社の本店所在地を変更した場合に必要な登記です。同一法務局の管轄内か管轄外かで、必要書類・登録免許税が異なります。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '本店移転の効力発生日から2週間以内（管轄外への移転の場合は旧所在地で2週間・新所在地で3週間以内）',
 'event_based', '{"days_from_event": 14}', 14,
 NULL, FALSE, FALSE,
 '本店を移転した（する予定の）会社',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。移転先が別の法務局管轄の場合は手続きが複雑になるため、司法書士等の専門家にご相談ください。'),

('LEGAL_PURPOSE_CHANGE',
 '目的変更登記',
 '定款に定めた事業目的を追加・変更した場合に必要な登記です。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '定款変更（株主総会特別決議）の効力発生日から2週間以内',
 'event_based', '{"days_from_event": 14}', 15,
 NULL, FALSE, FALSE,
 '事業目的を追加・変更した会社',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。許認可業種は目的の記載方法に注意が必要な場合があるため、司法書士等の専門家にご確認ください。'),

('LEGAL_TRADE_NAME_CHANGE',
 '商号変更登記',
 '会社の商号（社名）を変更した場合に必要な登記です。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '定款変更（株主総会特別決議）の効力発生日から2週間以内',
 'event_based', '{"days_from_event": 14}', 16,
 NULL, FALSE, FALSE,
 '商号（社名）を変更した会社',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。類似商号の調査や銀行口座・契約書名義の変更も必要になるため、司法書士等の専門家にご確認ください。'),

('LEGAL_CAPITAL_INCREASE',
 '増資登記',
 '募集株式の発行等により資本金を増加させた場合に必要な登記です。登録免許税は増加した資本金の額に応じて計算されます。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '払込期日（払込期間を定めた場合はその末日）から2週間以内',
 'event_based', '{"days_from_event": 14}', 17,
 NULL, FALSE, FALSE,
 '募集株式の発行等で資本金を増加させる会社',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。登録免許税や手続きは増資方法により異なるため、司法書士等の専門家にご確認ください。'),

('LEGAL_DISSOLUTION',
 '解散・清算登記',
 '会社を解散する場合、解散登記と清算人選任登記が、清算事務の完了後に清算結了登記が必要です。',
 'legal', FALSE, 'legal_affairs_bureau', 'one_time',
 '解散：解散事由発生日から2週間以内／清算結了：清算事務終了（決算報告の承認）から2週間以内',
 'event_based', '{"days_from_event": 14}', 18,
 NULL, FALSE, FALSE,
 '会社を解散・清算する場合',
 '管轄法務局の窓口へ持参、郵送、またはオンライン申請（登記・供託オンライン申請システム）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。解散公告や税務署等への異動届出も別途必要になるため、司法書士・税理士等の専門家にご確認ください。'),

('LEGAL_CERT_REGISTRY',
 '登記事項証明書取得',
 '会社の登記情報（履歴事項全部証明書等）を証明する書類です。銀行口座開設、許認可申請、契約締結などの際に提出を求められます。',
 'legal', FALSE, 'legal_affairs_bureau', 'as_needed',
 '随時（必要な都度取得可能）',
 'event_based', NULL, 19,
 NULL, FALSE, FALSE,
 '登記情報の証明書が必要な会社・個人',
 '法務局窓口、郵送、証明書発行請求機、オンライン申請（登記・供託オンライン申請システム、郵送受取または最寄りの法務局で受取）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。提出先によって必要な証明書の種類（履歴事項全部証明書・現在事項証明書等）が異なるため、事前に提出先へご確認ください。'),

('LEGAL_CERT_SEAL',
 '法人印鑑証明書取得',
 '法人の実印（登録印）の印影を証明する書類です。契約締結、融資、不動産取引などの際に必要になります。',
 'legal', FALSE, 'legal_affairs_bureau', 'as_needed',
 '随時（印鑑カードが必要。提出先により発行後3ヶ月以内などの有効期限指定がある場合があります）',
 'event_based', NULL, 20,
 NULL, FALSE, FALSE,
 '法人印鑑証明書が必要な会社',
 '法務局窓口、証明書発行請求機、オンライン申請（登記・供託オンライン申請システム、印鑑カードが必要）',
 '登記・供託オンライン申請システム', 'https://www.touki-kyoutaku-online.moj.go.jp/',
 '本情報は一般的な参考情報です。印鑑カードを紛失した場合は再発行手続きが必要です。詳細は管轄法務局にご確認ください。')

ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 必要書類
-- ============================================================
INSERT INTO procedure_documents (procedure_id, name, form_number, is_required, notes, sort_order)
SELECT p.id, v.name, v.form_number, v.is_required, v.notes, v.sort_order
FROM procedures p,
(VALUES
  ('LEGAL_ESTABLISH_KK', '定款（認証済み）',                 NULL, TRUE,  NULL, 1),
  ('LEGAL_ESTABLISH_KK', '発起人の同意書',                   NULL, TRUE,  NULL, 2),
  ('LEGAL_ESTABLISH_KK', '設立時取締役の就任承諾書',         NULL, TRUE,  NULL, 3),
  ('LEGAL_ESTABLISH_KK', '発起人・取締役の印鑑証明書',       NULL, TRUE,  '発行から3ヶ月以内', 4),
  ('LEGAL_ESTABLISH_KK', '出資の払込みを証する書面',         NULL, TRUE,  NULL, 5),
  ('LEGAL_ESTABLISH_KK', '印鑑届書',                         NULL, TRUE,  '法人実印の登録', 6),

  ('LEGAL_ESTABLISH_GODO', '定款',                           NULL, TRUE,  NULL, 1),
  ('LEGAL_ESTABLISH_GODO', '社員の同意書',                   NULL, TRUE,  NULL, 2),
  ('LEGAL_ESTABLISH_GODO', '代表社員の就任承諾書',           NULL, TRUE,  NULL, 3),
  ('LEGAL_ESTABLISH_GODO', '出資の払込みを証する書面',       NULL, TRUE,  NULL, 4),
  ('LEGAL_ESTABLISH_GODO', '印鑑届書',                       NULL, TRUE,  '法人実印の登録', 5),

  ('LEGAL_OFFICER_CHANGE', '株主総会議事録',                 NULL, TRUE,  NULL, 1),
  ('LEGAL_OFFICER_CHANGE', '就任承諾書',                     NULL, TRUE,  '新任役員がいる場合', 2),
  ('LEGAL_OFFICER_CHANGE', '印鑑証明書',                     NULL, FALSE, '代表取締役の重任・新任時など', 3),

  ('LEGAL_HQ_RELOCATION', '株主総会議事録または取締役会議事録', NULL, TRUE,  NULL, 1),
  ('LEGAL_HQ_RELOCATION', '本店移転を証する書面',            NULL, FALSE, '賃貸借契約書の写しなど', 2),

  ('LEGAL_PURPOSE_CHANGE', '株主総会議事録（定款変更決議）', NULL, TRUE,  NULL, 1),

  ('LEGAL_TRADE_NAME_CHANGE', '株主総会議事録（定款変更決議）', NULL, TRUE, NULL, 1),

  ('LEGAL_CAPITAL_INCREASE', '総数引受契約書または募集株式引受けの申込みを証する書面', NULL, TRUE, NULL, 1),
  ('LEGAL_CAPITAL_INCREASE', '払込みがあったことを証する書面', NULL, TRUE, NULL, 2),
  ('LEGAL_CAPITAL_INCREASE', '資本金の額の計上に関する証明書', NULL, TRUE, NULL, 3),

  ('LEGAL_DISSOLUTION', '株主総会議事録（解散決議・清算人選任）', NULL, TRUE, NULL, 1),
  ('LEGAL_DISSOLUTION', '決算報告承認議事録',               NULL, FALSE, '清算結了登記の際に必要', 2),

  ('LEGAL_CERT_REGISTRY', '交付請求書',                     NULL, TRUE,  '窓口・オンラインとも手数料が必要', 1),

  ('LEGAL_CERT_SEAL', '印鑑カード',                          NULL, TRUE,  NULL, 1),
  ('LEGAL_CERT_SEAL', '交付請求書',                          NULL, TRUE,  NULL, 2)
) AS v(code, name, form_number, is_required, notes, sort_order)
WHERE p.code = v.code
ON CONFLICT (procedure_id, name) DO NOTHING;

-- ============================================================
-- 公式リンク（法務局 商業・法人登記関連 3URL + 交付請求ページ）
-- ============================================================
INSERT INTO official_links (procedure_id, label, url, sort_order, status, fallback_url)
SELECT p.id, v.label, v.url, v.sort_order, 'unchecked', v.fallback_url
FROM procedures p
JOIN (VALUES
  ('LEGAL_ESTABLISH_KK', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_ESTABLISH_KK', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_ESTABLISH_GODO', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_ESTABLISH_GODO', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_OFFICER_CHANGE', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_OFFICER_CHANGE', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_HQ_RELOCATION', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_HQ_RELOCATION', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_PURPOSE_CHANGE', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_PURPOSE_CHANGE', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_TRADE_NAME_CHANGE', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_TRADE_NAME_CHANGE', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_CAPITAL_INCREASE', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_CAPITAL_INCREASE', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_DISSOLUTION', '商業・法人登記申請手続（法務局）',
   'https://houmukyoku.moj.go.jp/homu/touki2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),
  ('LEGAL_DISSOLUTION', '商業・法人登記の申請書様式（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-1.html', 2,
   'https://houmukyoku.moj.go.jp/homu/page_000001_00085.html'),

  ('LEGAL_CERT_REGISTRY', '登記事項証明書・印鑑証明書の交付請求（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html'),

  ('LEGAL_CERT_SEAL', '登記事項証明書・印鑑証明書の交付請求（法務局）',
   'https://houmukyoku.moj.go.jp/homu/COMMERCE_11-2.html', 1,
   'https://www.moj.go.jp/MINJI/houjintouki.html')

) AS v(code, label, url, sort_order, fallback_url) ON p.code = v.code
ON CONFLICT (procedure_id, url) DO NOTHING;

-- ── 確認クエリ ───────────────────────────────────────────────
SELECT code, name, category, corporate_type, requires_officer_term, include_in_diagnosis
FROM procedures
WHERE category = 'legal'
ORDER BY priority;
