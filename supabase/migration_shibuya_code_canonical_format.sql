-- ============================================================
-- SUNBOO経営ナビ — Municipality Code Canonical Format Migration 1
-- 「渋谷区 自治体コード 5桁→6桁修正」
-- ============================================================
-- 根拠: docs/ADR_MUNICIPALITY_CODE_CANONICAL_FORMAT.md（D14、Accepted、選択肢A＝6桁統一）
--       docs/PHASE4_GEOGRAPHY_MASTER_PLAN.md 7節
--
-- 内容: municipalities.code の渋谷区の値を、5桁本体のみの '13113' から、
-- JIS X0402（全国地方公共団体コード）の正規形式である「5桁本体＋検査数字」の6桁
-- '131130' へ修正する。検査数字はADR D14 1-2節の算出式で計算済み・本Migration作成時に
-- 再計算しても一致することを確認済み（1×6+3×5+1×4+1×3+3×2=34, 34 mod 11=1, 11-1=10→特殊規則で0）。
--
-- 【影響範囲の確認（ADR D14 2節・本Migration作成時に再確認）】
--   - anonymous_company_events.municipality_id は municipalities(id) への FK（integer）であり、
--     code列の文字列値を変更しても既存行のidは変わらないため無影響
--   - workspace_companies.municipality_code はcode文字列を保持する列だが、本Migration作成時点で
--     0件（REST確認済み）のため無影響
--   - ブラウザlocalStorage（(site)側の匿名CompanyProfile）への影響は未確定（ADR D14で申し送り済み）
--
-- 【変更しないもの】
--   - src/lib/diagnosis.ts 等のResolverコード（完全一致検索のみのため無変更で動作する）
--   - municipalities.id（PRIMARY KEY、変更しない。UPDATEはcode列のみ）
--   - 福岡県72件（既にADR D14が定める6桁正規形式のため対象外）
--
-- 【本Migration適用後に必須の確認（CLAUDE.mdのPlaywright確認ルール）】
--   npm run dev で /start（診断フォーム、渋谷区選択）→ /result が引き続き正しく表示されることを
--   実際にブラウザ操作して確認すること。DBに関わる変更のため、ビルド確認だけで完了と報告しない。
--
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- 再実行しても安全（WHERE句で対象を絞っているため、2回目以降は0件のまま成功する）。
-- ============================================================

-- ============================================================
-- 0. 事前確認（適用前の状態を記録するSELECT。実行結果を目視で確認すること）
-- ============================================================

-- 期待値: 1行（id, '13113', '渋谷区'）
SELECT id, code, name FROM municipalities WHERE code = '13113';

-- ============================================================
-- 1. UPDATE本体
-- ============================================================

UPDATE municipalities
SET code = '131130'
WHERE code = '13113' AND name = '渋谷区';

-- ============================================================
-- 2. 検証SQL
-- ============================================================

-- 2-1. 修正後の確認（期待値: 1行、code='131130'）
SELECT id, code, name FROM municipalities WHERE name = '渋谷区';

-- 2-2. 旧コードが残っていないことの確認（期待値: 0行）
SELECT id, code, name FROM municipalities WHERE code = '13113';

-- 2-3. idが変わっていないことの確認（既存の紐付けが壊れていないことの傍証。
--      本Migration適用前のidをメモしておき、適用後も同じidであることを目視確認する）
SELECT id, code, name FROM municipalities WHERE code = '131130';

-- 2-4. anonymous_company_eventsへの影響が無いことの確認（期待値: 件数が適用前後で変化しない）
SELECT COUNT(*) AS anonymous_company_events_count FROM anonymous_company_events;

-- 2-5. workspace_companiesへの影響が無いことの確認（期待値: 0件のまま、または既存件数のまま）
SELECT COUNT(*) AS workspace_companies_count FROM workspace_companies;

-- ============================================================
-- 3. Rollback（本Migrationを取り消す場合）
-- ============================================================
-- UPDATE municipalities SET code = '13113' WHERE code = '131130' AND name = '渋谷区';
