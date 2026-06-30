-- profile_pulls only started logging pulls from the moment the usage-limit gate
-- went live (20260701_user_roles.sql) — it doesn't retroactively include the 58+
-- historical profiling_jobs already attributed via requested_by. Backfill them so
-- the admin usage dashboard reflects all-time history, not just post-launch pulls.
-- Idempotent: skips jobs that already have a matching profile_pulls row.
INSERT INTO profile_pulls (user_email, startup_id, company_name, pull_type, created_at)
SELECT
  pj.requested_by,
  pj.startup_id,
  pj.company_name,
  CASE WHEN ROW_NUMBER() OVER (PARTITION BY lower(pj.company_name), pj.country ORDER BY pj.created_at) = 1
       THEN 'new' ELSE 'reprofile' END,
  pj.created_at
FROM profiling_jobs pj
WHERE pj.requested_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM allowed_emails ae WHERE ae.email = pj.requested_by)
  AND NOT EXISTS (
    SELECT 1 FROM profile_pulls pp
    WHERE pp.user_email = pj.requested_by AND pp.company_name = pj.company_name AND pp.created_at = pj.created_at
  );
