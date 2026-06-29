-- Scoring v5: 7 dimensions, 6 scorecards, unit economics dimension
-- Rename dim_founder → dim_team (team quality, not just founder)
-- Add dim_unit_econ (capital efficiency & path to profitability)
-- Add scorecard_ids / primary_scorecard for scorecard tracking

alter table public.scores rename column dim_founder to dim_team;
alter table public.scores rename column w_founder   to w_team;

alter table public.scores
  add column dim_unit_econ    int check (dim_unit_econ between 0 and 100),
  add column w_unit_econ      numeric(4,2),
  add column scorecard_ids    text[],
  add column primary_scorecard text;

-- Update leaderboard view to expose new columns
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
  sc.dim_team,
  sc.dim_traction,
  sc.dim_capital,
  sc.dim_product,
  sc.dim_market,
  sc.dim_unit_econ,
  sc.dim_momentum,
  sc.scorecard_ids,
  sc.primary_scorecard,
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

-- Update startup_full view to use new column names
create or replace view public.startup_full as
select
  s.*,
  json_agg(distinct jsonb_build_object(
    'id', sc.id, 'composite', sc.composite_score, 'status', sc.status,
    'dim_team', sc.dim_team, 'dim_traction', sc.dim_traction,
    'dim_capital', sc.dim_capital, 'dim_product', sc.dim_product,
    'dim_market', sc.dim_market, 'dim_unit_econ', sc.dim_unit_econ,
    'dim_momentum', sc.dim_momentum,
    'scorecard_ids', sc.scorecard_ids, 'primary_scorecard', sc.primary_scorecard,
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
