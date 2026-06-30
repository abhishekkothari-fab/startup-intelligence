-- Admin dashboard: lets users with role='admin' read all users' quota usage
-- and all analyst feedback, instead of just their own rows.

-- Self-referential admin check is safe here: the inner subquery resolves via
-- the existing "own_row_read" policy (a user can always read their own row),
-- so it never needs "admin_read_all_emails" itself to terminate.
CREATE POLICY "admin_read_all_emails" ON allowed_emails
  FOR SELECT TO authenticated
  USING ((SELECT role FROM allowed_emails WHERE email = (auth.jwt() ->> 'email')) = 'admin');

CREATE POLICY "admin_read_all_pulls" ON profile_pulls
  FOR SELECT TO authenticated
  USING ((SELECT role FROM allowed_emails WHERE email = (auth.jwt() ->> 'email')) = 'admin');

CREATE POLICY "admin_read_feedback" ON startup_feedback
  FOR SELECT TO authenticated
  USING ((SELECT role FROM allowed_emails WHERE email = (auth.jwt() ->> 'email')) = 'admin');

GRANT SELECT ON startup_feedback TO authenticated;

-- Per-user profiling-quota summary for the admin dashboard.
-- security_invoker so the view enforces the querying user's own RLS (admin-only
-- in practice), rather than running as the view owner and bypassing RLS.
CREATE VIEW user_usage_summary WITH (security_invoker = true) AS
SELECT
  ae.email,
  ae.name,
  ae.role,
  ae.bonus_pulls,
  ae.added_at,
  COUNT(pp.id)::int AS pulls_used,
  CASE WHEN ae.role = 'admin' THEN NULL ELSE 25 + ae.bonus_pulls END AS pulls_limit,
  MAX(pp.created_at) AS last_pull_at
FROM allowed_emails ae
LEFT JOIN profile_pulls pp ON pp.user_email = ae.email
GROUP BY ae.email, ae.name, ae.role, ae.bonus_pulls, ae.added_at;

GRANT SELECT ON user_usage_summary TO authenticated;
