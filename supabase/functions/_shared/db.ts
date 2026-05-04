// supabase/functions/_shared/db.ts
// Supabase client + all DB write helpers

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { StartupProfile } from "./research.ts";

export function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

// ── Job management ─────────────────────────────────────────────

export async function createJob(
  supabase: ReturnType<typeof getSupabaseClient>,
  company: string,
  country: string,
  requestedBy?: string
): Promise<string> {
  const { data, error } = await supabase
    .from("profiling_jobs")
    .insert({ company_name: company, country, status: "queued", requested_by: requestedBy })
    .select("id")
    .single();
  if (error) throw new Error(`createJob failed: ${error.message}`);
  return data.id;
}

export async function updateJobProgress(
  supabase: ReturnType<typeof getSupabaseClient>,
  jobId: string,
  pct: number,
  status: "queued" | "running" | "completed" | "failed" = "running",
  startupId?: string,
  errorMessage?: string
): Promise<void> {
  await supabase
    .from("profiling_jobs")
    .update({
      progress_pct: pct,
      status,
      ...(startupId ? { startup_id: startupId } : {}),
      ...(errorMessage ? { error_message: errorMessage } : {})
    })
    .eq("id", jobId);
}

// ── Quick startup write (core fields only, no scores/signals) ──
export async function writeStartupCore(
  supabase: ReturnType<typeof getSupabaseClient>,
  profile: Partial<StartupProfile>,
  jobId: string
): Promise<string> {
  const payload = {
    brand_name:        profile.brand_name   || "Unknown",
    hq_country:        profile.hq_country   || "IN",
    legal_name:        profile.legal_name,
    cin:               profile.cin,
    website:           profile.website,
    founded_date:      profile.founded_date,
    hq_city:           profile.hq_city,
    auto_stage:        profile.auto_stage,
    auto_industry:     profile.auto_industry,
    auto_industry_sub: profile.auto_industry_sub,
    auto_region:       profile.auto_region,
    auto_biz_model:    profile.auto_biz_model,
    auto_entity_pack:  profile.auto_entity_pack,
    total_raised_usd_m:  profile.total_raised_usd_m,
    last_round_type:     profile.last_round_type,
    last_round_date:     profile.last_round_date,
    team_size:           profile.team_size,
    last_collected_at: new Date().toISOString(),
    job_id:            jobId
  };
  const { data, error } = await supabase
    .from("startups")
    .upsert(payload, { onConflict: "brand_name,hq_country", ignoreDuplicates: false })
    .select("id")
    .single();
  if (error) throw new Error(`writeStartupCore failed: ${error.message}`);
  return data.id;
}

// ── Startup + all related data write ──────────────────────────

export async function writeStartupToDb(
  supabase: ReturnType<typeof getSupabaseClient>,
  profile: StartupProfile,
  jobId: string
): Promise<string> {
  // 1. Upsert startup (match on brand_name + hq_country to avoid duplicates)
  const startupPayload = {
    brand_name:             profile.brand_name,
    legal_name:             profile.legal_name,
    cin:                    profile.cin,
    website:                profile.website,
    founded_date:           profile.founded_date,
    hq_city:                profile.hq_city,
    hq_country:             profile.hq_country,
    auto_stage:             profile.auto_stage,
    auto_industry:          profile.auto_industry,
    auto_industry_sub:      profile.auto_industry_sub,
    auto_region:            profile.auto_region,
    auto_biz_model:         profile.auto_biz_model,
    auto_entity_pack:       profile.auto_entity_pack,
    revenue_inr_cr:         profile.revenue_inr_cr,
    revenue_fy:             profile.revenue_fy,
    revenue_yoy_pct:        profile.revenue_yoy_pct,
    net_profit_inr_cr:      profile.net_profit_inr_cr,
    total_raised_usd_m:     profile.total_raised_usd_m,
    last_round_type:        profile.last_round_type,
    last_round_date:        profile.last_round_date,
    last_round_size_inr_cr: profile.last_round_size_inr_cr,
    team_size:              profile.team_size,
    client_count:           profile.client_count,
    is_profitable:          profile.is_profitable,
    glassdoor_rating:       profile.glassdoor_rating,
    glassdoor_reviews:      profile.glassdoor_reviews,
    glassdoor_recommend:    profile.glassdoor_recommend,
    glassdoor_wlb:          profile.glassdoor_wlb,
    glassdoor_culture:      profile.glassdoor_culture,
    glassdoor_themes:       profile.glassdoor_themes,
    last_collected_at:      new Date().toISOString(),
    job_id:                 jobId
  };

  const { data: startupData, error: startupError } = await supabase
    .from("startups")
    .upsert(startupPayload, {
      onConflict: "brand_name,hq_country",
      ignoreDuplicates: false
    })
    .select("id")
    .single();

  if (startupError) throw new Error(`writeStartup failed: ${startupError.message}`);
  const startupId = startupData.id;

  // 2. Delete old signals for this startup (fresh re-profile replaces them)
  await supabase.from("raw_fields").delete().eq("startup_id", startupId);
  await supabase.from("youtube_signals").delete().eq("startup_id", startupId);
  await supabase.from("linkedin_signals").delete().eq("startup_id", startupId);

  // 3. Insert scores
  if (profile.scores) {
    const { error: scoreError } = await supabase
      .from("scores")
      .insert({
        startup_id:            startupId,
        status:                "provisional",
        score_version:         "v1.0",
        stage:                 profile.scores.stage || profile.auto_stage,
        industry:              profile.auto_industry,
        industry_sub:          profile.auto_industry_sub,
        dim_founder:           profile.scores.dim_founder,
        dim_traction:          profile.scores.dim_traction,
        dim_capital:           profile.scores.dim_capital,
        dim_product:           profile.scores.dim_product,
        dim_market:            profile.scores.dim_market,
        dim_momentum:          profile.scores.dim_momentum,
        w_founder:             profile.scores.w_founder,
        w_traction:            profile.scores.w_traction,
        w_capital:             profile.scores.w_capital,
        w_product:             profile.scores.w_product,
        w_market:              profile.scores.w_market,
        w_momentum:            profile.scores.w_momentum,
        composite_score:       profile.scores.composite_score,
        fields_applicable:     profile.scores.fields_applicable,
        fields_collected:      profile.scores.fields_collected,
        fields_unknown:        profile.scores.fields_unknown,
        fields_not_applicable: profile.scores.fields_not_applicable,
        data_quality_pct:      profile.scores.data_quality_pct,
        r_funding_velocity:    profile.scores.r_funding_velocity,
        r_traction_velocity:   profile.scores.r_traction_velocity,
        r_founder_mkt_fit:     profile.scores.r_founder_mkt_fit,
        r_recognition_momentum:profile.scores.r_recognition_momentum,
        r_investor_quality:    profile.scores.r_investor_quality,
        r_product_surface:     profile.scores.r_product_surface,
        r_capital_efficiency:  profile.scores.r_capital_efficiency,
        r_valuation_arr_mult:  profile.scores.r_valuation_arr_mult,
        r_team_leverage:       profile.scores.r_team_leverage,
        r_grant_equity_ratio:  profile.scores.r_grant_equity_ratio,
        r_round_up_ratio:      profile.scores.r_round_up_ratio,
        r_gnpa_pct:            profile.scores.r_gnpa_pct,
        r_nim_pct:             profile.scores.r_nim_pct,
        r_car_pct:             profile.scores.r_car_pct,
        r_roe_pct:             profile.scores.r_roe_pct
      });
    if (scoreError) throw new Error(`writeScores failed: ${scoreError.message}`);
  }

  // 4. Insert raw fields (batch insert, max 100 per call)
  if (profile.raw_fields?.length > 0) {
    const rows = profile.raw_fields.map(f => ({
      startup_id:           startupId,
      field_name:           f.field_name,
      field_pack:           f.field_pack || "base",
      applicability:        f.applicability || "applicable",
      applicability_reason: f.applicability_reason,
      raw_value:            f.raw_value,
      data_type:            f.data_type,
      source_type:          f.source_type || "web",
      source_url:           f.source_url,
      confidence:           f.confidence,
      skill_version:        "v3.0"
    }));
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await supabase.from("raw_fields").insert(rows.slice(i, i + 100));
      if (error) throw new Error(`writeRawFields batch ${i} failed: ${error.message}`);
    }
  }

  // 5. Insert YouTube signals
  if (profile.youtube?.length > 0) {
    const rows = profile.youtube.map(v => ({
      startup_id:     startupId,
      video_title:    v.video_title,
      video_url:      v.video_url,
      published_date: v.published_date,
      video_type:     v.video_type,
      channel_name:   v.channel_name,
      is_own_channel: v.is_own_channel ?? false,
      key_quote:      v.key_quote,
      signal_tags:    v.signal_tags,
      confidence:     v.confidence ?? 0.90
    }));
    const { error } = await supabase.from("youtube_signals").insert(rows);
    if (error) throw new Error(`writeYouTube failed: ${error.message}`);
  }

  // 6. Insert LinkedIn signals
  if (profile.linkedin?.length > 0) {
    const rows = profile.linkedin.map(l => ({
      startup_id:   startupId,
      pass:         l.pass,
      author_name:  l.author_name,
      author_org:   l.author_org,
      author_role:  l.author_role,
      signal_type:  l.signal_type,
      post_text:    l.post_text,
      post_url:     l.post_url,
      post_date:    l.post_date,
      confidence:   l.confidence
    }));
    const { error } = await supabase.from("linkedin_signals").insert(rows);
    if (error) throw new Error(`writeLinkedIn failed: ${error.message}`);
  }

  return startupId;
}
