-- Tier 5: dim_defensibility — 8th scoring dimension
-- Consolidates moat signals (network effects, regulatory, patents, switching cost, API ecosystem)
-- Weight pulled primarily from dim_product across all scorecards.

alter table public.scores
  add column if not exists dim_defensibility int  check (dim_defensibility between 0 and 100),
  add column if not exists w_defensibility   numeric(4,2);

-- Leaderboard: add dim_defensibility (drop required — can't insert mid-list with CREATE OR REPLACE)
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

-- startup_full: add dim_defensibility to score jsonb
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
