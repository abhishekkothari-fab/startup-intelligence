-- Admin vs standard roles, plus a per-user free-pull allowance.
ALTER TABLE allowed_emails ADD COLUMN role text NOT NULL DEFAULT 'standard' CHECK (role IN ('admin', 'standard'));
-- Extra pulls granted on top of the 25 free ones (e.g. after a standard user pays).
ALTER TABLE allowed_emails ADD COLUMN bonus_pulls integer NOT NULL DEFAULT 0;

INSERT INTO allowed_emails (email, role)
VALUES ('abhishek.kothari@gmail.com', 'admin'), ('sneha@andmarketing.co', 'admin')
ON CONFLICT (email) DO UPDATE SET role = 'admin';

-- Authenticated users can read their own row (role + bonus_pulls) for the usage badge.
CREATE POLICY "own_row_read" ON allowed_emails
  FOR SELECT TO authenticated
  USING (email = (auth.jwt() ->> 'email'));

GRANT SELECT ON allowed_emails TO authenticated;

-- One row per accepted profile pull (new profile, re-profile, or sub-section re-run).
-- Inserted even on a cache hit, since the user still consumed a pull request.
-- This is what the 25-free-pulls limit is enforced against for standard users.
CREATE TABLE IF NOT EXISTS profile_pulls (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email   text        NOT NULL REFERENCES allowed_emails(email),
  startup_id   uuid        REFERENCES startups(id),
  company_name text        NOT NULL,
  pull_type    text        NOT NULL CHECK (pull_type IN ('new', 'reprofile', 'subsection')),
  passes       text[],
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profile_pulls_user_email ON profile_pulls(user_email);

ALTER TABLE profile_pulls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_pulls_read" ON profile_pulls
  FOR SELECT TO authenticated
  USING (user_email = (auth.jwt() ->> 'email'));

GRANT SELECT ON profile_pulls TO authenticated;
