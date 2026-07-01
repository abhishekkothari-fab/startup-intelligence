-- Add a third tier, 'basic', with a lower free-pull allowance (3) than 'standard' (25).
ALTER TABLE allowed_emails DROP CONSTRAINT allowed_emails_role_check;
ALTER TABLE allowed_emails ADD CONSTRAINT allowed_emails_role_check CHECK (role IN ('admin', 'standard', 'basic'));

-- Same columns, just adds the basic-tier branch to the pulls_limit calc — CREATE OR REPLACE is fine.
CREATE OR REPLACE VIEW user_usage_summary WITH (security_invoker = true) AS
SELECT
  ae.email,
  ae.name,
  ae.role,
  ae.bonus_pulls,
  ae.added_at,
  COUNT(pp.id)::int AS pulls_used,
  CASE
    WHEN ae.role = 'admin' THEN NULL
    WHEN ae.role = 'basic' THEN 3  + ae.bonus_pulls
    ELSE                        25 + ae.bonus_pulls
  END AS pulls_limit,
  MAX(pp.created_at) AS last_pull_at
FROM allowed_emails ae
LEFT JOIN profile_pulls pp ON pp.user_email = ae.email
GROUP BY ae.email, ae.name, ae.role, ae.bonus_pulls, ae.added_at;

GRANT SELECT ON user_usage_summary TO authenticated;
