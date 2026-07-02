-- ============================================================
-- SUNBOO経営ナビ — Supabase スキーマ (PostgreSQL)
-- ============================================================
-- Supabase ダッシュボード → SQL Editor で実行してください。
-- seed.sql は このファイルの実行後に実行してください。
-- 再実行しても安全（IF NOT EXISTS / CREATE OR REPLACE を使用）
-- ============================================================

-- 都道府県マスタ
CREATE TABLE IF NOT EXISTS prefectures (
  id   SERIAL PRIMARY KEY,
  code TEXT   NOT NULL UNIQUE,
  name TEXT   NOT NULL
);

-- 市区町村マスタ
CREATE TABLE IF NOT EXISTS municipalities (
  id            SERIAL PRIMARY KEY,
  prefecture_id INT    NOT NULL REFERENCES prefectures(id),
  code          TEXT   NOT NULL UNIQUE,
  name          TEXT   NOT NULL
);

-- 管轄機関マスタ
CREATE TABLE IF NOT EXISTS jurisdiction_offices (
  id              SERIAL      PRIMARY KEY,
  municipality_id INT         NOT NULL REFERENCES municipalities(id),
  office_type     TEXT        NOT NULL,
  name            TEXT        NOT NULL,
  address         TEXT,
  phone           TEXT,
  website_url     TEXT,
  map_url         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (municipality_id, office_type)
);

-- 手続きマスタ
CREATE TABLE IF NOT EXISTS procedures (
  id                    SERIAL      PRIMARY KEY,
  code                  TEXT        NOT NULL UNIQUE,
  name                  TEXT        NOT NULL,
  description           TEXT,
  category              TEXT        NOT NULL,
  requires_employees    BOOLEAN     NOT NULL DEFAULT FALSE,
  applicable_industries TEXT[],
  office_type           TEXT        NOT NULL,
  frequency             TEXT        NOT NULL,
  timing_label          TEXT        NOT NULL,
  timing_type           TEXT        NOT NULL,
  timing_data           JSONB,
  priority              INT         NOT NULL DEFAULT 0,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 手続き必要書類
CREATE TABLE IF NOT EXISTS procedure_documents (
  id           SERIAL  PRIMARY KEY,
  procedure_id INT     NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  form_number  TEXT,
  is_required  BOOLEAN NOT NULL DEFAULT TRUE,
  notes        TEXT,
  sort_order   INT     NOT NULL DEFAULT 0,
  UNIQUE (procedure_id, name)
);

-- 公式リンク
CREATE TABLE IF NOT EXISTS official_links (
  id           SERIAL      PRIMARY KEY,
  procedure_id INT         REFERENCES procedures(id) ON DELETE CASCADE,
  label        TEXT        NOT NULL,
  url          TEXT        NOT NULL,
  sort_order   INT         NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (procedure_id, url)
);

-- ============================================================
-- インデックス
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_municipalities_prefecture ON municipalities(prefecture_id);
CREATE INDEX IF NOT EXISTS idx_jurisdiction_offices_muni  ON jurisdiction_offices(municipality_id);
CREATE INDEX IF NOT EXISTS idx_procedures_category        ON procedures(category);
CREATE INDEX IF NOT EXISTS idx_procedures_is_active       ON procedures(is_active);
CREATE INDEX IF NOT EXISTS idx_official_links_procedure   ON official_links(procedure_id);

-- ============================================================
-- 更新トリガー（procedures.updated_at の自動更新）
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_procedures_updated_at ON procedures;
CREATE TRIGGER trg_procedures_updated_at
  BEFORE UPDATE ON procedures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
