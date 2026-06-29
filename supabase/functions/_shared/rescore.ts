// supabase/functions/_shared/rescore.ts
// Shared logic: read existing DB data for a startup and recompute scores.
// Used by rescore-startup edge function and the rescore-all batch script.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { computeScores } from "./scoring.ts"
import type { StartupProfile } from "./types.ts"

type SupabaseClient = ReturnType<typeof createClient>

export async function rescoreStartup(
  supabase: SupabaseClient,
  startupId: string
): Promise<{ scores: StartupProfile["scores"]; brand_name: string; composite_score: number }> {
  const [{ data: startup, error: e1 }, { data: rawFields = [] }] = await Promise.all([
    supabase.from("startups").select("*").eq("id", startupId).single(),
    supabase.from("raw_fields")
      .select("field_name,field_pack,applicability,applicability_reason,raw_value,data_type,source_type,source_url,confidence")
      .eq("startup_id", startupId),
  ])
  if (e1 || !startup) throw new Error(`Startup not found: ${startupId}`)

  const profile: Partial<StartupProfile> = {
    auto_stage:                     startup.auto_stage,
    auto_industry:                  startup.auto_industry,
    auto_industry_sub:              startup.auto_industry_sub,
    auto_region:                    startup.auto_region,
    auto_biz_model:                 startup.auto_biz_model,
    auto_entity_pack:               startup.auto_entity_pack,
    hq_country:                     startup.hq_country,
    founded_date:                   startup.founded_date,
    revenue_inr_cr:                 startup.revenue_inr_cr,
    revenue_yoy_pct:                startup.revenue_yoy_pct,
    net_profit_inr_cr:              startup.net_profit_inr_cr,
    total_raised_usd_m:             startup.total_raised_usd_m,
    last_round_date:                startup.last_round_date,
    team_size:                      startup.team_size,
    client_count:                   startup.client_count,
    is_profitable:                  startup.is_profitable,
    glassdoor_rating:               startup.glassdoor_rating,
    glassdoor_positive_outlook_pct: startup.glassdoor_positive_outlook_pct,
    raw_fields:                     rawFields as StartupProfile["raw_fields"],
  }

  const scored = computeScores(profile)
  const s = scored.scores!

  const { error } = await supabase.from("scores").insert({
    startup_id:            startupId,
    status:                "provisional",
    score_version:         "v5.0",
    stage:                 s.stage || startup.auto_stage,
    industry:              startup.auto_industry,
    industry_sub:          startup.auto_industry_sub,
    scorecard_ids:         s.scorecard_ids      ?? null,
    primary_scorecard:     s.primary_scorecard  ?? null,
    dim_team:              s.dim_team,
    dim_traction:          s.dim_traction,
    dim_capital:           s.dim_capital,
    dim_product:           s.dim_product,
    dim_market:            s.dim_market,
    dim_unit_econ:         s.dim_unit_econ,
    dim_momentum:          s.dim_momentum,
    w_team:                s.w_team,
    w_traction:            s.w_traction,
    w_capital:             s.w_capital,
    w_product:             s.w_product,
    w_market:              s.w_market,
    w_unit_econ:           s.w_unit_econ,
    w_momentum:            s.w_momentum,
    composite_score:       s.composite_score,
    fields_applicable:     s.fields_applicable,
    fields_collected:      s.fields_collected,
    fields_unknown:        s.fields_unknown,
    fields_not_applicable: s.fields_not_applicable,
    data_quality_pct:      s.data_quality_pct,
    r_funding_velocity:    s.r_funding_velocity    ?? null,
    r_traction_velocity:   s.r_traction_velocity   ?? null,
    r_founder_mkt_fit:     s.r_founder_mkt_fit     ?? null,
    r_recognition_momentum:s.r_recognition_momentum ?? null,
    r_investor_quality:    s.r_investor_quality    ?? null,
    r_product_surface:     s.r_product_surface     ?? null,
    r_capital_efficiency:  s.r_capital_efficiency  ?? null,
    r_valuation_arr_mult:  s.r_valuation_arr_mult  ?? null,
    r_team_leverage:       s.r_team_leverage       ?? null,
    r_grant_equity_ratio:  s.r_grant_equity_ratio  ?? null,
    r_round_up_ratio:      s.r_round_up_ratio      ?? null,
    r_gnpa_pct:            s.r_gnpa_pct            ?? null,
    r_nim_pct:             s.r_nim_pct             ?? null,
    r_car_pct:             s.r_car_pct             ?? null,
    r_roe_pct:             s.r_roe_pct             ?? null,
  })
  if (error) throw new Error(`Score insert failed: ${error.message}`)

  return { scores: s, brand_name: startup.brand_name, composite_score: s.composite_score }
}
