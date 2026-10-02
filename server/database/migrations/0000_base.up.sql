-- 0000_base.up.sql
-- Versioned minimal base schema so a TRULY EMPTY database can be migrated end-to-end
-- by runUp() alone, with no hand-applied deploy/migration.sql.
--
-- Every object is created IF NOT EXISTS, so on a legacy DB that already has these
-- tables this is a no-op structurally: it never re-creates tables, never changes
-- IDs, never drops data/relations. It only records HOW the base arrived:
--   * created_by_migrator -> the core tables did not exist before we ran (fresh DB).
--   * adopted_legacy      -> the core tables pre-existed (hand-provisioned prod/legacy).
-- That marker lets 0000_base.down.sql be data-preserving on legacy DBs while still
-- allowing an exact teardown on a disposable, migration-built DB.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS _schema_meta (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Detect install mode BEFORE we create anything. to_regclass sees the legacy tables
-- already present in an adopted DB; on a fresh DB it is NULL. ON CONFLICT DO NOTHING
-- keeps the first-provenance verdict even if the file is ever replayed.
DO $$
DECLARE
  existed_before boolean;
BEGIN
  SELECT to_regclass('public.journals') IS NOT NULL INTO existed_before;
  INSERT INTO _schema_meta (key, value)
  VALUES (
    'base_install_mode',
    CASE WHEN existed_before THEN 'adopted_legacy' ELSE 'created_by_migrator' END
  )
  ON CONFLICT (key) DO NOTHING;
END $$;

CREATE TABLE IF NOT EXISTS journals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(300) NOT NULL,
  abbreviation VARCHAR(100),
  source_type VARCHAR(20) NOT NULL DEFAULT 'journal',
  priority VARCHAR(10) NOT NULL DEFAULT 'P2',
  category VARCHAR(200),
  description TEXT,
  url VARCHAR(500),
  update_frequency VARCHAR(200),
  keywords_filter TEXT,
  issn VARCHAR(50),
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS papers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  journal_id UUID REFERENCES journals(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  authors TEXT,
  doi VARCHAR(200),
  keywords TEXT,
  abstract_text TEXT,
  methods TEXT,
  conclusions TEXT,
  published_date DATE,
  url VARCHAR(500),
  fetched_at TIMESTAMPTZ,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  display_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100),
  UNIQUE (user_id, paper_id)
);

CREATE TABLE IF NOT EXISTS reading_checklist (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  paper_id UUID REFERENCES papers(id) ON DELETE CASCADE,
  title_override VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'todo',
  sort_order INTEGER NOT NULL DEFAULT 0,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS user_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  paper_id UUID REFERENCES papers(id) ON DELETE SET NULL,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL UNIQUE,
  field_of_study TEXT,
  interested_keywords TEXT,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);
