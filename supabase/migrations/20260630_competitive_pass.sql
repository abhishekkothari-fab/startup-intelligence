-- Competitive intelligence columns added by Tier 3 competitive pass
ALTER TABLE startups
  ADD COLUMN IF NOT EXISTS competitor_1_name         text,
  ADD COLUMN IF NOT EXISTS competitor_1_funding_usd_m numeric(10,2),
  ADD COLUMN IF NOT EXISTS competitor_1_stage         text,
  ADD COLUMN IF NOT EXISTS competitor_2_name         text,
  ADD COLUMN IF NOT EXISTS competitor_2_funding_usd_m numeric(10,2),
  ADD COLUMN IF NOT EXISTS competitor_2_stage         text,
  ADD COLUMN IF NOT EXISTS competitor_3_name         text,
  ADD COLUMN IF NOT EXISTS competitor_3_funding_usd_m numeric(10,2),
  ADD COLUMN IF NOT EXISTS competitor_3_stage         text,
  ADD COLUMN IF NOT EXISTS market_leader_name        text,
  ADD COLUMN IF NOT EXISTS geo_analog_company        text,
  ADD COLUMN IF NOT EXISTS geo_analog_country        text,
  ADD COLUMN IF NOT EXISTS competitive_density       text,
  ADD COLUMN IF NOT EXISTS differentiation_claim     text;
