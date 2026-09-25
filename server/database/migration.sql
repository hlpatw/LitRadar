CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE journals (
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

CREATE TABLE papers (
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

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username VARCHAR(100) NOT NULL UNIQUE,
  email VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  display_name VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_favorites (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  paper_id UUID NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100),
  UNIQUE (user_id, paper_id)
);

CREATE TABLE reading_checklist (
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

CREATE TABLE user_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL,
  content TEXT NOT NULL,
  paper_id UUID REFERENCES papers(id) ON DELETE SET NULL,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);

CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id VARCHAR(100) NOT NULL UNIQUE,
  field_of_study TEXT,
  interested_keywords TEXT,
  _created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by VARCHAR(100),
  _updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by VARCHAR(100)
);