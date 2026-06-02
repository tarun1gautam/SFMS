-- ============================================================
-- SFMS Database Schema  (Full + Enhanced Version)
-- Run this on a fresh DB, OR run schema_migration.sql on an
-- existing DB to apply only the new columns / indexes.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     VARCHAR(50)  UNIQUE NOT NULL,
  pin         VARCHAR(255) NOT NULL,
  role        VARCHAR(10)  NOT NULL DEFAULT 'user'
                           CHECK (role IN ('admin', 'user')),
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  last_login  TIMESTAMPTZ
);

-- ── Files ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS files (
  id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_name        VARCHAR(255) NOT NULL,
  original_name    VARCHAR(255) NOT NULL,
  file_path        TEXT         NOT NULL,
  file_size        BIGINT       NOT NULL,
  mime_type        VARCHAR(100),
  uploaded_by      VARCHAR(50)  NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  uploader_ip      VARCHAR(45),
  visibility       VARCHAR(20)  NOT NULL DEFAULT 'public'
                                CHECK (visibility IN ('public', 'private', 'group')),

  -- ── NEW (v2): who the file is shared with ─────────────────
  -- Stores user_ids, group names, or the literal string "Public".
  -- Mirrors target_users but is human-readable and persisted
  -- separately so target_users logic is untouched.
  target_users     TEXT[]       DEFAULT '{}',
  shared_label     TEXT[]       DEFAULT '{}',   -- NEW: display labels for "Shared To" column

  is_pinned        BOOLEAN      DEFAULT FALSE,
  download_count   INTEGER      DEFAULT 0,
  upload_timestamp TIMESTAMPTZ  DEFAULT NOW(),

  -- ── NEW (v2): track last modification time ────────────────
  last_modified    TIMESTAMPTZ  DEFAULT NOW(),  -- NEW: updated on any UPDATE

  CONSTRAINT fk_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users(user_id)
);

-- Auto-update last_modified on every UPDATE ──────────────────
-- (PostgreSQL trigger approach — no app-layer change needed)
CREATE OR REPLACE FUNCTION update_last_modified()
RETURNS TRIGGER AS $$
BEGIN
  NEW.last_modified = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_files_last_modified ON files;
CREATE TRIGGER trg_files_last_modified
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION update_last_modified();

-- ── Download Logs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS download_logs (
  id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_id        UUID        NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id        VARCHAR(50) NOT NULL,
  downloader_ip  VARCHAR(45),
  downloaded_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_files_upload_timestamp  ON files(upload_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_files_last_modified     ON files(last_modified DESC);      -- NEW
CREATE INDEX IF NOT EXISTS idx_files_visibility        ON files(visibility);
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by       ON files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_files_is_pinned         ON files(is_pinned);
CREATE INDEX IF NOT EXISTS idx_files_mime_type         ON files(mime_type);               -- NEW
CREATE INDEX IF NOT EXISTS idx_files_file_size         ON files(file_size);               -- NEW
CREATE INDEX IF NOT EXISTS idx_files_file_name         ON files USING gin(to_tsvector('english', file_name));  -- NEW full-text
CREATE INDEX IF NOT EXISTS idx_download_logs_file_id   ON download_logs(file_id);
CREATE INDEX IF NOT EXISTS idx_download_logs_user_id   ON download_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_download_logs_at        ON download_logs(downloaded_at DESC);

-- ── Seed admin ───────────────────────────────────────────────
-- bcrypt hash of "1234" — CHANGE IN PRODUCTION
INSERT INTO users (user_id, pin, role)
  VALUES ('admin', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin')
  ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE users       IS 'Registered system users';
COMMENT ON TABLE files       IS 'Uploaded file metadata and permissions (v2: shared_label, last_modified)';
COMMENT ON TABLE download_logs IS 'Audit trail of all file downloads';
COMMENT ON COLUMN files.shared_label IS 'Human-readable list of recipients shown in Shared To column';
COMMENT ON COLUMN files.last_modified IS 'Auto-updated timestamp of last record change';