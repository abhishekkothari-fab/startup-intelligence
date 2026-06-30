-- The self-referential admin-check policies added in 20260701_admin_dashboard.sql
-- query allowed_emails from within a policy ON allowed_emails itself. Relying on
-- OR short-circuiting across policies to avoid recursion is fragile — Postgres
-- doesn't guarantee it won't re-evaluate admin_read_all_emails while resolving
-- the subquery, which risks "infinite recursion detected in policy for relation".
-- Standard fix: a SECURITY DEFINER function bypasses RLS for the role lookup.

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM allowed_emails WHERE email = (auth.jwt() ->> 'email') AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY "admin_read_all_emails" ON allowed_emails;
DROP POLICY "admin_read_all_pulls"  ON profile_pulls;
DROP POLICY "admin_read_feedback"   ON startup_feedback;

CREATE POLICY "admin_read_all_emails" ON allowed_emails
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "admin_read_all_pulls" ON profile_pulls
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "admin_read_feedback" ON startup_feedback
  FOR SELECT TO authenticated USING (public.is_admin());
