-- Tier 6: analyst_inputs table + leaderboard last_collected_at / last_scored_at
-- Stores private, analyst-entered metrics (NRR, gross margin, LTV:CAC, runway, etc.)
-- that the web cannot surface. These feed into scoring once saved.

-- ── analyst_inputs table ──────────────────────────────────────────

create table if not exists public.analyst_inputs (
  id          uuid default gen_random_uuid() primary key,
  startup_id  uuid not null references public.startups(id) on delete cascade,
  field_name  text not null,
  value_num   numeric,
  entered_by  text,
  entered_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (startup_id, field_name)
);

create index if not exists idx_analyst_inputs_startup on public.analyst_inputs(startup_id);

alter table public.analyst_inputs enable row level security;

create policy "authenticated read analyst_inputs"
  on public.analyst_inputs for select
  using (auth.role() = 'authenticated');

create policy "authenticated insert analyst_inputs"
  on public.analyst_inputs for insert
  with check (auth.role() = 'authenticated');

create policy "authenticated update analyst_inputs"
  on public.analyst_inputs for update
  using (auth.role() = 'authenticated');

-- ── leaderboard view: add last_collected_at + last_scored_at ─────

drop view if exists public.startup_full;
drop view if exists public.leaderboard;

create view public.leaderboard as
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
  sc.dim_team,
  sc.dim_traction,
  sc.dim_capital,
  sc.dim_product,
  sc.dim_market,
  sc.dim_unit_econ,
  sc.dim_momentum,
  sc.dim_defensibility,
  sc.scorecard_ids,
  sc.primary_scorecard,
  sc.data_quality_pct,
  sc.status as score_status,
  s.glassdoor_rating,
  s.updated_at,
  s.last_collected_at,
  sc.scored_at as last_scored_at
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

-- startup_full unchanged; recreated because leaderboard was dropped above
create view public.startup_full as
select
  s.*,
  json_agg(distinct jsonb_build_object(
    'id', sc.id, 'composite', sc.composite_score, 'status', sc.status,
    'dim_team', sc.dim_team, 'dim_traction', sc.dim_traction,
    'dim_capital', sc.dim_capital, 'dim_product', sc.dim_product,
    'dim_market', sc.dim_market, 'dim_unit_econ', sc.dim_unit_econ,
    'dim_momentum', sc.dim_momentum, 'dim_defensibility', sc.dim_defensibility,
    'w_defensibility', sc.w_defensibility,
    'scorecard_ids', sc.scorecard_ids, 'primary_scorecard', sc.primary_scorecard,
    'data_quality_pct', sc.data_quality_pct, 'stage', sc.stage,
    'r_burn_multiple', sc.r_burn_multiple,
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
