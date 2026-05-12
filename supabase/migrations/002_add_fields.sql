-- ============================================================
-- Startup Intelligence — Schema Migration v2
-- Adds: auto_tagline, glassdoor sub-scores, passes_status
-- Run via: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- Ensure passes_status exists on profiling_jobs (may have been added manually)
ALTER TABLE public.profiling_jobs
  ADD COLUMN IF NOT EXISTS passes_status jsonb default '{}';

-- Startup tagline (overview pass)
ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS auto_tagline text;

-- Glassdoor sub-score columns (pass 3)
ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS glassdoor_career_opp          numeric(3,1),
  ADD COLUMN IF NOT EXISTS glassdoor_positive_outlook_pct    int,
  ADD COLUMN IF NOT EXISTS glassdoor_interview_positive_pct  int;
