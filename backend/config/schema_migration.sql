-- ============================================================
-- SFMS v2 Migration — run this on an EXISTING database only.
-- Safe to run multiple times (uses IF NOT EXISTS / DO NOTHING).
-- ============================================================

-- 1. Add shared_label column (display labels for "Shared To")
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS shared_label TEXT[] DEFAULT '{}';

-- 2. Add last_modified column
ALTER TABLE files
  ADD COLUMN IF NOT EXISTS last_modified TIMESTAMPTZ DEFAULT NOW();

-- 3. Back-fill last_modified from upload_timestamp for old rows
UPDATE files
  SET last_modified = upload_timestamp
  WHERE last_modified IS NULL;

-- 4. Back-fill shared_label from existing target_users + visibility
--    • public  → ['Public']
--    • private/group with no target_users → ['—']
--    • private/group with target_users → copy target_users array
UPDATE files
  SET shared_label = CASE
    WHEN visibility = 'public' THEN ARRAY['Public']
    WHEN cardinality(target_users) > 0 THEN target_users
    ELSE ARRAY['—']
  END
  WHERE shared_label = '{}' OR shared_label IS NULL;

-- 5. Auto-update last_modified trigger
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

-- 6. New performance indexes
CREATE INDEX IF NOT EXISTS idx_files_last_modified ON files(last_modified DESC);
CREATE INDEX IF NOT EXISTS idx_files_mime_type     ON files(mime_type);
CREATE INDEX IF NOT EXISTS idx_files_file_size     ON files(file_size);