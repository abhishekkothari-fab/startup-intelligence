-- Whitelist table for email-OTP login
CREATE TABLE IF NOT EXISTS allowed_emails (
  email      text        PRIMARY KEY,
  name       text,
  added_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;

-- Anon can read the whitelist (needed for frontend check before sending OTP)
CREATE POLICY "anon_read" ON allowed_emails
  FOR SELECT TO anon USING (true);

-- Expose to Data API
GRANT SELECT ON allowed_emails TO anon;
