-- Rename ratio columns to match what is actually computed
-- r_funding_velocity   → r_burn_multiple        (lifetime raised ÷ annual rev)
-- r_capital_efficiency → r_rev_per_head         (revenue in lakhs per employee)
-- r_team_leverage      → r_acv                  (avg contract value, lakhs per client)
-- r_recognition_momentum → r_round_cadence      (funding rounds per year)
-- r_round_up_ratio     → r_capital_productivity (annual rev ÷ lifetime raised, %)

-- startup_full view references r_funding_velocity — must drop before rename
drop view if exists public.startup_full;

alter table public.scores rename column r_funding_velocity    to r_burn_multiple;
alter table public.scores rename column r_capital_efficiency  to r_rev_per_head;
alter table public.scores rename column r_team_leverage       to r_acv;
alter table public.scores rename column r_recognition_momentum to r_round_cadence;
alter table public.scores rename column r_round_up_ratio      to r_capital_productivity;

-- Recreate startup_full with updated column name
create view public.startup_full as
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
