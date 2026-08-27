CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS agencies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  parent TEXT,
  address TEXT,
  last_verified_at DATE,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS services (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  intent TEXT NOT NULL UNIQUE,
  summary_ne TEXT NOT NULL,
  summary_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS service_aliases (
  id SERIAL PRIMARY KEY,
  service_id INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  alias TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('phone', 'email', 'website', 'social')),
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  url TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  agency_id INTEGER NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  verified_at DATE NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_notes (
  id SERIAL PRIMARY KEY,
  service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_url TEXT,
  verified_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  checksum TEXT NOT NULL,
  service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
  agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
  source_url TEXT,
  verified_at DATE,
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  service_id INTEGER REFERENCES services(id) ON DELETE CASCADE,
  agency_id INTEGER REFERENCES agencies(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1024),
  source_url TEXT,
  verified_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS guardrail_events (
  id SERIAL PRIMARY KEY,
  user_text TEXT NOT NULL,
  language TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crawl_runs (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  summary JSONB
);

CREATE TABLE IF NOT EXISTS crawl_pages (
  id SERIAL PRIMARY KEY,
  run_id INTEGER REFERENCES crawl_runs(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  agency_id INTEGER REFERENCES agencies(id) ON DELETE SET NULL,
  http_status INTEGER,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  content_hash TEXT,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT,
  kind TEXT NOT NULL DEFAULT 'html'
);

CREATE INDEX IF NOT EXISTS service_aliases_alias_trgm_idx
  ON service_aliases USING GIN (alias gin_trgm_ops);

CREATE INDEX IF NOT EXISTS services_name_trgm_idx
  ON services USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS knowledge_chunks_service_id_idx
  ON knowledge_chunks (service_id);

CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_hnsw_idx
  ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS crawl_pages_url_idx
  ON crawl_pages (url);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT 'New chat',
  subject TEXT,
  language TEXT NOT NULL DEFAULT 'ne-NP',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS chat_sessions_device_updated_idx
  ON chat_sessions (device_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS chat_messages_session_created_idx
  ON chat_messages (session_id, created_at);
