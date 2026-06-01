-- Migration 003: reliability improvements
-- 1. UNIQUE constraint on raw_fields so appendRawFields can UPSERT
-- 2. pg_cron job to auto-fail stalled profiling jobs

-- Raw fields: one row per (startup, field_name). Drop dupes first, then add constraint.
DO $$
BEGIN
  -- Remove older duplicates, keeping the most recent row per (startup_id, field_name).
  DELETE FROM raw_fields rf
  WHERE rf.ctid NOT IN (
    SELECT DISTINCT ON (startup_id, field_name) ctid
    FROM raw_fields
    ORDER BY startup_id, field_name, created_at DESC NULLS LAST
  );

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'raw_fields_startup_field_uniq'
  ) THEN
    ALTER TABLE raw_fields
      ADD CONSTRAINT raw_fields_startup_field_uniq UNIQUE (startup_id, field_name);
  END IF;
END $$;

-- Stalled job detector: mark any profiling_jobs stuck in "running" for >15 min as failed.
-- Requires pg_cron extension (already available on Supabase).
SELECT cron.schedule(
  'fail-stalled-jobs',
  '*/5 * * * *',
  $$
    UPDATE profiling_jobs
    SET
      status        = 'failed',
      error_message = 'Job stalled — no progress for 15 minutes',
      updated_at    = now()
    WHERE
      status = 'running'
      AND updated_at < now() - interval '15 minutes'
  $$
);
