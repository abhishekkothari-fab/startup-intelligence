// supabase/functions/_shared/db.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { StartupProfile, PassesStatus } from "./research.ts";

export function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

type SupabaseClient = ReturnType<typeof getSupabaseClient>;

// ── Job management ────────────────────────────────────────────────

export async function createJob(
  supabase: SupabaseClient,
  company: string,
  country: string,
  requestedBy?: string
): Promise<string> {
  const { data, error } = await supabase
    .from("profiling_jobs")
    .insert({
      company_name: company,
      country,
      status: "queued",
      requested_by: requestedBy,
      passes_status: {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`createJob failed: ${error.message}`);
  return data.id;
}

export async function updateJobProgress(
  supabase: SupabaseClient,
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
      ...(startupId    ? { startup_id:    startupId    } : {}),
      ...(errorMessage ? { error_message: errorMessage } : {}),
    })
    .eq("id", jobId);
}

export async function updatePassStatus(
  supabase: SupabaseClient,
  jobId: string,
  passesStatus: PassesStatus
): Promise<void> {
  await supabase
    .from("profiling_jobs")
    .update({ passes_status: passesStatus })
    .eq("id", jobId);
}

// ── Startup writes ────────────────────────────────────────────────

// Creates a startup record from the first pass (overview); returns startup_id.
export async function writeStartupCore(
  supabase: SupabaseClient,
  profile: Partial<StartupProfile>,
  jobId: string
): Promise<string> {
  const payload = {
    brand_name:        profile.brand_name       || "Unknown",
    hq_country:        profile.hq_country       || "IN",
    legal_name:        profile.legal_name        ?? null,
    cin:               profile.cin               ?? null,
    website:           profile.website           ?? null,
    founded_date:      profile.founded_date      ?? null,
    hq_city:           profile.hq_city           ?? null,
    auto_stage:        profile.auto_stage        ?? null,
    auto_industry:     profile.auto_industry     ?? null,
    auto_industry_sub: profile.auto_industry_sub ?? null,
    auto_region:       profile.auto_region       ?? null,
    auto_biz_model:    profile.auto_biz_model    ?? null,
    auto_entity_pack:  profile.auto_entity_pack  ?? null,
    total_raised_usd_m:profile.total_raised_usd_m ?? null,
    last_round_type:   profile.last_round_type   ?? null,
    last_round_date:   profile.last_round_date   ?? null,
    team_size:         profile.team_size         ?? null,
    last_collected_at: new Date().toISOString(),
    job_id:            jobId,
  };
  const { data, error } = await supabase
    .from("startups")
    .upsert(payload, { onConflict: "brand_name,hq_country", ignoreDuplicates: false })
    .select("id")
    .single();
  if (error) throw new Error(`writeStartupCore failed: ${error.message}`);
  return data.id;
}

// Updates only non-null scalar fields on an existing startup record.
const STARTUP_SCALAR_FIELDS: (keyof StartupProfile)[] = [
  "legal_name", "cin", "website", "founded_date", "hq_city",
  "auto_stage", "auto_industry", "auto_industry_sub", "auto_region",
  "auto_biz_model", "auto_entity_pack",
  "revenue_inr_cr", "revenue_fy", "revenue_yoy_pct", "net_profit_inr_cr",
  "total_raised_usd_m", "last_round_type", "last_round_date", "last_round_size_inr_cr",
  "team_size", "client_count", "is_profitable",
  "glassdoor_rating", "glassdoor_reviews", "glassdoor_recommend",
  "glassdoor_wlb", "glassdoor_culture", "glassdoor_themes",
];

export async function writeStartupPartial(
  supabase: SupabaseClient,
  startupId: string,
  partial: Partial<StartupProfile>
): Promise<void> {
  const payload: Record<string, unknown> = { last_collected_at: new Date().toISOString() };
  for (const field of STARTUP_SCALAR_FIELDS) {
    const val = (partial as Record<string, unknown>)[field];
    if (val !== null && val !== undefined) payload[field] = val;
  }
  if (Object.keys(payload).length > 1) {
    const { error } = await supabase.from("startups").update(payload).eq("id", startupId);
    if (error) console.warn(`writeStartupPartial: ${error.message}`);
  }
}

// ── Signals ───────────────────────────────────────────────────────

export async function appendRawFields(
  supabase: SupabaseClient,
  startupId: string,
  fields: StartupProfile["raw_fields"]
): Promise<void> {
  if (!fields?.length) return;
  const rows = fields.map(f => ({
    startup_id:           startupId,
    field_name:           f.field_name,
    field_pack:           f.field_pack  || "base",
    applicability:        f.applicability || "applicable",
    applicability_reason: f.applicability_reason ?? null,
    raw_value:            f.raw_value   ?? null,
    data_type:            f.data_type   ?? null,
    source_type:          f.source_type || "web",
    source_url:           f.source_url  ?? null,
    confidence:           f.confidence  ?? null,
    skill_version:        "v4.0",
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("raw_fields").insert(rows.slice(i, i + 100));
    if (error) console.warn(`appendRawFields batch ${i}: ${error.message}`);
  }
}

export async function appendYouTubeSignals(
  supabase: SupabaseClient,
  startupId: string,
  videos: StartupProfile["youtube"]
): Promise<void> {
  if (!videos?.length) return;
  const rows = videos.map(v => ({
    startup_id:     startupId,
    video_title:    v.video_title,
    video_url:      v.video_url      ?? null,
    published_date: v.published_date ?? null,
    video_type:     v.video_type,
    channel_name:   v.channel_name   ?? null,
    is_own_channel: v.is_own_channel ?? false,
    key_quote:      v.key_quote      ?? null,
    signal_tags:    v.signal_tags    ?? null,
    confidence:     v.confidence     ?? 0.90,
  }));
  const { error } = await supabase.from("youtube_signals").insert(rows);
  if (error) console.warn(`appendYouTubeSignals: ${error.message}`);
}

export async function appendLinkedInSignals(
  supabase: SupabaseClient,
  startupId: string,
  signals: StartupProfile["linkedin"]
): Promise<void> {
  if (!signals?.length) return;
  const rows = signals.map(l => ({
    startup_id:  startupId,
    pass:        l.pass,
    author_name: l.author_name  ?? null,
    author_org:  l.author_org   ?? null,
    author_role: l.author_role  ?? null,
    signal_type: l.signal_type,
    post_text:   l.post_text    ?? null,
    post_url:    l.post_url     ?? null,
    post_date:   l.post_date    ?? null,
    confidence:  l.confidence,
  }));
  const { error } = await supabase.from("linkedin_signals").insert(rows);
  if (error) console.warn(`appendLinkedInSignals: ${error.message}`);
}

// ── Score insert ──────────────────────────────────────────────────

export async function insertScores(
  supabase: SupabaseClient,
  startupId: string,
  profile: StartupProfile
): Promise<void> {
  if (!profile.scores) return;
  const s = profile.scores;
  const { error } = await supabase.from("scores").insert({
    startup_id:            startupId,
    status:                "provisional",
    score_version:         "v4.0",
    stage:                 s.stage || profile.auto_stage,
    industry:              profile.auto_industry,
    industry_sub:          profile.auto_industry_sub,
    dim_founder:           s.dim_founder,
    dim_traction:          s.dim_traction,
    dim_capital:           s.dim_capital,
    dim_product:           s.dim_product,
    dim_market:            s.dim_market,
    dim_momentum:          s.dim_momentum,
    w_founder:             s.w_founder,
    w_traction:            s.w_traction,
    w_capital:             s.w_capital,
    w_product:             s.w_product,
    w_market:              s.w_market,
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
  });
  if (error) console.warn(`insertScores: ${error.message}`);
}

// ── Legacy full write (kept for compatibility) ────────────────────

export async function writeStartupToDb(
  supabase: SupabaseClient,
  profile: StartupProfile,
  jobId: string
): Promise<string> {
  const startupId = await writeStartupCore(supabase, profile, jobId);
  await writeStartupPartial(supabase, startupId, profile);
  await supabase.from("raw_fields").delete().eq("startup_id", startupId);
  await appendRawFields(supabase, startupId, profile.raw_fields);
  await supabase.from("youtube_signals").delete().eq("startup_id", startupId);
  await appendYouTubeSignals(supabase, startupId, profile.youtube);
  await supabase.from("linkedin_signals").delete().eq("startup_id", startupId);
  await appendLinkedInSignals(supabase, startupId, profile.linkedin);
  await insertScores(supabase, startupId, profile);
  return startupId;
}
