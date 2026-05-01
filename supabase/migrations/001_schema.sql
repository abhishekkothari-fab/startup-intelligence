-- ============================================================
-- Startup Intelligence — Supabase Schema Migration v1.0
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ── 1. PROFILING JOBS ─────────────────────────────────────────
-- Tracks async research runs. Frontend polls this.
create table public.profiling_jobs (
  id              uuid primary key default gen_random_uuid(),
  company_name    text not null,
  country         text not null default 'IN',
  status          text not null default 'queued'
                    check (status in ('queued','running','completed','failed')),
  progress_pct    int  not null default 0 check (progress_pct between 0 and 100),
  startup_id      uuid,                          -- set when completed
  error_message   text,
  requested_by    text,                          -- optional caller identifier
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_jobs_status       on public.profiling_jobs(status);
create index idx_jobs_company      on public.profiling_jobs(lower(company_name));
create index idx_jobs_created      on public.profiling_jobs(created_at desc);

-- ── 2. STARTUPS ───────────────────────────────────────────────
-- Master record per company. One row per profiled startup.
create table public.startups (
  id                    uuid primary key default gen_random_uuid(),
  startup_code          text unique,            -- e.g. IF001, GL002
  brand_name            text not null,
  legal_name            text,
  cin                   text,                   -- India CIN number
  website               text,
  founded_date          date,
  hq_city               text,
  hq_country            text not null default 'IN',

  -- Classification (auto + override + resolved)
  auto_stage            text,
  auto_industry         text,
  auto_industry_sub     text,
  auto_region           text,
  auto_biz_model        text,
  auto_entity_pack      text,

  override_stage        text,
  override_industry     text,
  override_industry_sub text,
  override_region       text,
  override_biz_model    text,

  -- Resolved = override if present, else auto
  stage                 text generated always as (
                          coalesce(override_stage, auto_stage)
                        ) stored,
  industry              text generated always as (
                          coalesce(override_industry, auto_industry)
                        ) stored,
  industry_sub          text generated always as (
                          coalesce(override_industry_sub, auto_industry_sub)
                        ) stored,
  region                text generated always as (
                          coalesce(override_region, auto_region)
                        ) stored,
  biz_model             text generated always as (
                          coalesce(override_biz_model, auto_biz_model)
                        ) stored,

  -- Key financials (snapshot)
  revenue_inr_cr        numeric(12,2),
  revenue_fy            text,                   -- e.g. "FY25"
  revenue_yoy_pct       numeric(6,2),
  net_profit_inr_cr     numeric(12,2),
  total_raised_usd_m    numeric(10,2),
  last_round_type       text,
  last_round_date       date,
  last_round_size_inr_cr numeric(12,2),
  team_size             int,
  client_count          int,
  is_profitable         boolean,

  -- Glassdoor (Pass 2)
  glassdoor_rating      numeric(3,1),
  glassdoor_reviews     int,
  glassdoor_recommend   int,                    -- % recommend
  glassdoor_wlb         numeric(3,1),
  glassdoor_culture     numeric(3,1),
  glassdoor_themes      text,                   -- pipe-separated

  -- Profile metadata
  profile_version       text not null default 'v1',
  last_collected_at     timestamptz,
  job_id                uuid references public.profiling_jobs(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index idx_startups_brand    on public.startups(lower(brand_name));
create index idx_startups_stage    on public.startups(stage);
create index idx_startups_industry on public.startups(industry);
create index idx_startups_country  on public.startups(hq_country);

-- ── 3. SCORES ─────────────────────────────────────────────────
-- Versioned scoring history. One row per scoring run per startup.
create table public.scores (
  id                    uuid primary key default gen_random_uuid(),
  startup_id            uuid not null references public.startups(id) on delete cascade,

  scored_at             timestamptz not null default now(),
  score_version         text not null default 'v1.0',
  status                text not null default 'provisional'
                          check (status in ('provisional','reviewed','published')),

  -- Stage + classification at time of scoring
  stage                 text not null,
  industry              text,
  industry_sub          text,

  -- Dimension scores (0–100)
  dim_founder           int check (dim_founder between 0 and 100),
  dim_traction          int check (dim_traction between 0 and 100),
  dim_capital           int check (dim_capital between 0 and 100),
  dim_product           int check (dim_product between 0 and 100),
  dim_market            int check (dim_market between 0 and 100),
  dim_momentum          int check (dim_momentum between 0 and 100),

  -- Weights used (from stage config)
  w_founder             numeric(4,2),
  w_traction            numeric(4,2),
  w_capital             numeric(4,2),
  w_product             numeric(4,2),
  w_market              numeric(4,2),
  w_momentum            numeric(4,2),

  -- Composite
  composite_score       numeric(5,1),

  -- Data quality
  fields_applicable     int,
  fields_collected      int,
  fields_unknown        int,
  fields_not_applicable int,
  data_quality_pct      numeric(5,1),

  -- Universal ratios
  r_funding_velocity    numeric(10,3),
  r_traction_velocity   numeric(10,3),
  r_founder_mkt_fit     numeric(4,1),
  r_recognition_momentum numeric(10,3),
  r_investor_quality    numeric(4,1),
  r_product_surface     numeric(6,1),
  r_capital_efficiency  numeric(10,3),
  r_valuation_arr_mult  numeric(10,2),
  r_team_leverage       numeric(10,3),
  r_grant_equity_ratio  numeric(8,4),
  r_round_up_ratio      numeric(8,4),
  r_burn_multiple       numeric(8,4),

  -- NBFC ratios (null for non-NBFC)
  r_gnpa_pct            numeric(6,2),
  r_nim_pct             numeric(6,2),
  r_car_pct             numeric(6,2),
  r_roe_pct             numeric(6,2),

  created_at            timestamptz not null default now()
);

create index idx_scores_startup    on public.scores(startup_id);
create index idx_scores_composite  on public.scores(composite_score desc nulls last);
create index idx_scores_status     on public.scores(status);

-- ── 4. RAW FIELDS ─────────────────────────────────────────────
-- Every data point as an individual row. Full audit trail.
create table public.raw_fields (
  id                    uuid primary key default gen_random_uuid(),
  startup_id            uuid not null references public.startups(id) on delete cascade,

  field_name            text not null,
  field_pack            text not null default 'base',
  applicability         text not null default 'applicable'
                          check (applicability in ('applicable','not_applicable','unknown')),
  applicability_source  text not null default 'auto_rule'
                          check (applicability_source in ('auto_rule','admin_override')),
  applicability_reason  text,                   -- required if not_applicable

  raw_value             text,
  data_type             text,                   -- text, numeric, boolean, date, percentage
  source_type           text,                   -- web, mca, linkedin, youtube, glassdoor, analyst, engine
  source_url            text,
  confidence            numeric(3,2) check (confidence between 0 and 1),
  skill_version         text not null default 'v3.0',

  -- Override support
  is_overridden         boolean not null default false,
  override_value        text,
  overridden_by         text,
  overridden_at         timestamptz,
  override_note         text,

  collected_at          timestamptz not null default now()
);

create index idx_raw_startup       on public.raw_fields(startup_id);
create index idx_raw_field_name    on public.raw_fields(field_name);
create index idx_raw_applicability on public.raw_fields(applicability);
create index idx_raw_source        on public.raw_fields(source_type);

-- ── 5. YOUTUBE SIGNALS ────────────────────────────────────────
-- One row per video found in Pass 7.
create table public.youtube_signals (
  id              uuid primary key default gen_random_uuid(),
  startup_id      uuid not null references public.startups(id) on delete cascade,

  video_title     text not null,
  video_url       text,
  published_date  date,
  video_type      text,                         -- founder_on_camera, podcast_feature, product_demo, etc.
  channel_name    text,
  is_own_channel  boolean not null default false,
  key_quote       text,                         -- verbatim founder quote if found in snippet
  signal_tags     text[],                       -- e.g. {transparency, crisis, funding}
  confidence      numeric(3,2) default 0.90,

  collected_at    timestamptz not null default now()
);

create index idx_yt_startup        on public.youtube_signals(startup_id);
create index idx_yt_type           on public.youtube_signals(video_type);

-- ── 6. LINKEDIN SIGNALS ───────────────────────────────────────
-- Founder posts (Pass 8) and company mentions (Pass 9).
create table public.linkedin_signals (
  id              uuid primary key default gen_random_uuid(),
  startup_id      uuid not null references public.startups(id) on delete cascade,

  pass            int not null check (pass in (8,9)),
                                                -- 8 = founder post, 9 = company mention
  author_name     text,
  author_org      text,
  author_role     text,
  signal_type     text,                         -- traction_claim, ipo_signal, partner, client_vp, etc.
  post_text       text,                         -- extracted from SERP snippet
  post_url        text,
  post_date       text,                         -- approximate, e.g. "~1 month ago"
  confidence      numeric(3,2),

  collected_at    timestamptz not null default now()
);

create index idx_li_startup        on public.linkedin_signals(startup_id);
create index idx_li_pass           on public.linkedin_signals(pass);
create index idx_li_signal_type    on public.linkedin_signals(signal_type);

-- ── UPDATED_AT TRIGGERS ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_jobs_updated
  before update on public.profiling_jobs
  for each row execute function public.set_updated_at();

create trigger trg_startups_updated
  before update on public.startups
  for each row execute function public.set_updated_at();

-- ── ROW LEVEL SECURITY ────────────────────────────────────────
alter table public.profiling_jobs    enable row level security;
alter table public.startups          enable row level security;
alter table public.scores            enable row level security;
alter table public.raw_fields        enable row level security;
alter table public.youtube_signals   enable row level security;
alter table public.linkedin_signals  enable row level security;

-- Public read access for all tables (profiles are not private data)
create policy "public_read_jobs"       on public.profiling_jobs    for select using (true);
create policy "public_read_startups"   on public.startups          for select using (true);
create policy "public_read_scores"     on public.scores            for select using (true);
create policy "public_read_raw"        on public.raw_fields        for select using (true);
create policy "public_read_youtube"    on public.youtube_signals   for select using (true);
create policy "public_read_linkedin"   on public.linkedin_signals  for select using (true);

-- Only service role (edge functions) can write
create policy "service_write_jobs"     on public.profiling_jobs    for all using (auth.role() = 'service_role');
create policy "service_write_startups" on public.startups          for all using (auth.role() = 'service_role');
create policy "service_write_scores"   on public.scores            for all using (auth.role() = 'service_role');
create policy "service_write_raw"      on public.raw_fields        for all using (auth.role() = 'service_role');
create policy "service_write_youtube"  on public.youtube_signals   for all using (auth.role() = 'service_role');
create policy "service_write_linkedin" on public.linkedin_signals  for all using (auth.role() = 'service_role');

-- ── USEFUL VIEWS ──────────────────────────────────────────────

-- Leaderboard view — latest published score per startup
create or replace view public.leaderboard as
select
  s.id,
  s.startup_code,
  s.brand_name,
  s.legal_name,
  s.hq_city,
  s.hq_country,
  s.stage,
  s.industry,
  s.industry_sub,
  s.revenue_inr_cr,
  s.revenue_fy,
  s.total_raised_usd_m,
  s.team_size,
  s.is_profitable,
  sc.composite_score,
  sc.dim_founder,
  sc.dim_traction,
  sc.dim_capital,
  sc.dim_product,
  sc.dim_market,
  sc.dim_momentum,
  sc.data_quality_pct,
  sc.status as score_status,
  s.glassdoor_rating,
  s.updated_at
from public.startups s
left join lateral (
  select * from public.scores
  where startup_id = s.id
  order by
    case status when 'published' then 1 when 'reviewed' then 2 else 3 end,
    created_at desc
  limit 1
) sc on true
order by sc.composite_score desc nulls last;

-- Full profile view for a single startup
create or replace view public.startup_full as
select
  s.*,
  json_agg(distinct jsonb_build_object(
    'id', sc.id, 'composite', sc.composite_score, 'status', sc.status,
    'dim_founder', sc.dim_founder, 'dim_traction', sc.dim_traction,
    'dim_capital', sc.dim_capital, 'dim_product', sc.dim_product,
    'dim_market', sc.dim_market, 'dim_momentum', sc.dim_momentum,
    'data_quality_pct', sc.data_quality_pct, 'stage', sc.stage,
    'r_funding_velocity', sc.r_funding_velocity,
    'r_founder_mkt_fit', sc.r_founder_mkt_fit,
    'scored_at', sc.scored_at
  )) filter (where sc.id is not null) as scores,
  json_agg(distinct jsonb_build_object(
    'title', yt.video_title, 'url', yt.video_url,
    'date', yt.published_date, 'type', yt.video_type,
    'own_channel', yt.is_own_channel, 'quote', yt.key_quote
  )) filter (where yt.id is not null) as youtube_videos,
  json_agg(distinct jsonb_build_object(
    'pass', li.pass, 'author', li.author_name, 'org', li.author_org,
    'type', li.signal_type, 'text', li.post_text,
    'confidence', li.confidence, 'date', li.post_date
  )) filter (where li.id is not null) as linkedin_signals
from public.startups s
left join public.scores sc on sc.startup_id = s.id
left join public.youtube_signals yt on yt.startup_id = s.id
left join public.linkedin_signals li on li.startup_id = s.id
group by s.id;
