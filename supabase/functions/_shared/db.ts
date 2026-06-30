// supabase/functions/_shared/db.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { StartupProfile, PassesStatus } from "./types.ts";

// Sanitize values before DB insert to avoid PostgreSQL type-mismatch errors.
// Claude sometimes returns "2015" for dates or "500+" for integers.
function safeDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  // Accept YYYY, YYYY-MM, or YYYY-MM-DD — pad to full date
  const m = s.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!m) return null;
  const y = m[1], mo = m[2] || "01", d = m[3] || "01";
  return `${y}-${mo}-${d}`;
}

function safeInt(v: unknown): number | null {
  if (v == null) return null;
  const n = parseInt(String(v).replace(/[^\d]/g, ""), 10);
  return isNaN(n) ? null : n;
}

function safeNum(v: unknown): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}

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
  errorMessage?: string,
  setStartedAt = false
): Promise<void> {
  await supabase
    .from("profiling_jobs")
    .update({
      progress_pct: pct,
      status,
      ...(startupId    ? { startup_id:    startupId    } : {}),
      ...(errorMessage ? { error_message: errorMessage } : {}),
      ...(setStartedAt ? { started_at:    new Date().toISOString() } : {}),
    })
    .eq("id", jobId);
}

export async function finalizeJob(
  supabase: SupabaseClient,
  jobId: string,
  opts: {
    status: "completed" | "failed";
    startupId?: string;
    errorMessage?: string;
    passesStatus: PassesStatus;
    passFieldCounts: Record<string, number>;
    wavesFired: number;
    retryAttempted: boolean;
  }
): Promise<void> {
  const completedAt = new Date();

  // Read started_at so duration is accurate regardless of which wave finalizes the job.
  const { data: job } = await supabase
    .from("profiling_jobs")
    .select("started_at")
    .eq("id", jobId)
    .single();
  const durationMs = job?.started_at
    ? completedAt.getTime() - new Date(job.started_at).getTime()
    : null;

  const entries = Object.values(opts.passesStatus);
  const totalTokensIn  = entries.reduce((s, v) => s + (v.tokens_in  ?? 0) + (v.prior_tokens_in  ?? 0), 0);
  const totalTokensOut = entries.reduce((s, v) => s + (v.tokens_out ?? 0) + (v.prior_tokens_out ?? 0), 0);
  const passesCompleted = entries.filter(v => v.status === "completed").length;
  const passesFailed    = entries.filter(v => v.status === "failed").length;

  // passFieldCounts is wave-local and loses counts from earlier waves; query DB for ground truth.
  let passFieldCounts = opts.passFieldCounts;
  let totalFieldsWritten = Object.values(passFieldCounts).reduce((s, n) => s + n, 0);
  if (opts.startupId) {
    const { data: rfRows } = await supabase
      .from("raw_fields")
      .select("field_pack")
      .eq("startup_id", opts.startupId);
    if (rfRows && rfRows.length > 0) {
      passFieldCounts = {};
      for (const { field_pack } of rfRows) {
        passFieldCounts[field_pack] = (passFieldCounts[field_pack] ?? 0) + 1;
      }
      totalFieldsWritten = rfRows.length;
    }
  }

  // Blended cost estimate: products/haiku ~20% of tokens, rest Sonnet.
  // Sonnet: $3/MTok in, $15/MTok out.  Haiku: $0.80/MTok in, $4/MTok out.
  const blendIn  = totalTokensIn  / 1_000_000 * (0.8 * 3.0  + 0.2 * 0.80);
  const blendOut = totalTokensOut / 1_000_000 * (0.8 * 15.0 + 0.2 * 4.0);
  const estimatedCostUsd = Math.round((blendIn + blendOut) * 1_000_000) / 1_000_000;

  await supabase
    .from("profiling_jobs")
    .update({
      status:               opts.status,
      progress_pct:         opts.status === "completed" ? 100 : 0,
      completed_at:         completedAt.toISOString(),
      ...(durationMs !== null ? { duration_ms: durationMs } : {}),
      ...(opts.startupId    ? { startup_id:    opts.startupId    } : {}),
      ...(opts.errorMessage ? { error_message: opts.errorMessage } : {}),
      total_tokens_in:      totalTokensIn,
      total_tokens_out:     totalTokensOut,
      estimated_cost_usd:   estimatedCostUsd,
      passes_completed:     passesCompleted,
      passes_failed:        passesFailed,
      pass_field_counts:    passFieldCounts,
      total_fields_written: totalFieldsWritten,
      waves_fired:          opts.wavesFired,
      retry_attempted:      opts.retryAttempted,
    })
    .eq("id", jobId);
}

export async function updatePassStatus(
  supabase: SupabaseClient,
  jobId: string,
  passesStatus: PassesStatus
): Promise<void> {
  const { data } = await supabase
    .from("profiling_jobs")
    .select("passes_status")
    .eq("id", jobId)
    .single();
  const existing = (data?.passes_status as PassesStatus) || {};
  const merged: PassesStatus = { ...existing };
  for (const [pass, newStatus] of Object.entries(passesStatus)) {
    const prev = existing[pass];
    if (prev?.status === "failed" && prev.error && newStatus.status !== "failed") {
      console.warn(`[pass-recovery] ${pass}: "${prev.error}" → ${newStatus.status}`);
      merged[pass] = { ...newStatus, prior_error: prev.error, prior_tokens_in: prev.tokens_in ?? 0, prior_tokens_out: prev.tokens_out ?? 0 };
    } else {
      merged[pass] = newStatus;
    }
  }
  await supabase
    .from("profiling_jobs")
    .update({ passes_status: merged })
    .eq("id", jobId);
}

// ── Startup writes ────────────────────────────────────────────────

// Creates or updates a startup record from the first pass (overview); returns startup_id.
// Uses select-then-insert/update to avoid a dependency on a DB unique constraint.
export async function writeStartupCore(
  supabase: SupabaseClient,
  profile: Partial<StartupProfile>,
  jobId: string
): Promise<string> {
  const brandName = profile.brand_name || "Unknown";
  const hqCountry = profile.hq_country || "IN";

  const payload = {
    brand_name:        brandName,
    hq_country:        hqCountry,
    legal_name:        profile.legal_name        ?? null,
    cin:               profile.cin               ?? null,
    website:           profile.website           ?? null,
    founded_date:      safeDate(profile.founded_date),
    hq_city:           profile.hq_city           ?? null,
    auto_stage:        profile.auto_stage        ?? null,
    auto_industry:     profile.auto_industry     ?? null,
    auto_industry_sub: profile.auto_industry_sub ?? null,
    auto_region:       profile.auto_region       ?? null,
    auto_biz_model:    profile.auto_biz_model    ?? null,
    auto_entity_pack:  profile.auto_entity_pack  ?? null,
    auto_tagline:      profile.auto_tagline      ?? null,
    total_raised_usd_m:safeNum(profile.total_raised_usd_m),
    last_round_type:   profile.last_round_type   ?? null,
    last_round_date:   safeDate(profile.last_round_date),
    team_size:         safeInt(profile.team_size),
    last_collected_at: new Date().toISOString(),
    job_id:            jobId,
  };

  // Check for an existing record first to avoid needing a DB unique constraint
  const { data: existing } = await supabase
    .from("startups")
    .select("id")
    .ilike("brand_name", brandName)
    .eq("hq_country", hqCountry)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("startups")
      .update(payload)
      .eq("id", existing.id);
    if (error) throw new Error(`writeStartupCore update failed: ${error.message}`);
    return existing.id;
  }

  const { data, error } = await supabase
    .from("startups")
    .insert(payload)
    .select("id")
    .single();
  if (error) throw new Error(`writeStartupCore insert failed: ${error.message}`);
  return data.id;
}

// Updates only non-null scalar fields on an existing startup record.
const STARTUP_SCALAR_FIELDS: (keyof StartupProfile)[] = [
  "legal_name", "cin", "website", "founded_date", "hq_city",
  "auto_stage", "auto_industry", "auto_industry_sub", "auto_region",
  "auto_biz_model", "auto_entity_pack", "auto_tagline",
  "revenue_inr_cr", "revenue_fy", "revenue_yoy_pct", "net_profit_inr_cr",
  "total_raised_usd_m", "last_round_type", "last_round_date", "last_round_size_inr_cr",
  "team_size", "client_count", "is_profitable",
  "glassdoor_rating", "glassdoor_reviews", "glassdoor_recommend",
  "glassdoor_wlb", "glassdoor_culture", "glassdoor_themes",
  "glassdoor_career_opp", "glassdoor_positive_outlook_pct", "glassdoor_interview_positive_pct",
  "competitor_1_name", "competitor_1_funding_usd_m", "competitor_1_stage",
  "competitor_2_name", "competitor_2_funding_usd_m", "competitor_2_stage",
  "competitor_3_name", "competitor_3_funding_usd_m", "competitor_3_stage",
  "competitor_4_name", "competitor_4_funding_usd_m", "competitor_4_stage",
  "competitor_5_name", "competitor_5_funding_usd_m", "competitor_5_stage",
  "market_leader_name", "geo_analog_company", "geo_analog_country",
  "competitive_density", "differentiation_claim",
  "insights",
];

const DATE_FIELDS = new Set(["founded_date", "last_round_date"]);
const INT_FIELDS  = new Set(["team_size", "client_count", "glassdoor_reviews", "glassdoor_recommend",
  "glassdoor_positive_outlook_pct", "glassdoor_interview_positive_pct"]);
const NUM_FIELDS  = new Set(["revenue_inr_cr", "revenue_yoy_pct", "net_profit_inr_cr",
  "total_raised_usd_m", "last_round_size_inr_cr",
  "glassdoor_rating", "glassdoor_wlb", "glassdoor_culture", "glassdoor_career_opp",
  "competitor_1_funding_usd_m", "competitor_2_funding_usd_m", "competitor_3_funding_usd_m",
  "competitor_4_funding_usd_m", "competitor_5_funding_usd_m"]);

export async function writeStartupPartial(
  supabase: SupabaseClient,
  startupId: string,
  partial: Partial<StartupProfile>
): Promise<void> {
  const payload: Record<string, unknown> = { last_collected_at: new Date().toISOString() };

  // Compute total from confirmed round amounts — never trust model's aggregated total
  if (partial.raw_fields?.length) {
    let sum = 0, found = false;
    for (const f of partial.raw_fields) {
      if (/^round_\d+_amount_usd_m$/.test(f.field_name)) {
        const n = safeNum(f.raw_value);
        if (n !== null) { sum += n; found = true; }
      }
    }
    if (found) payload.total_raised_usd_m = Math.round(sum * 1000) / 1000;
  }

  for (const field of STARTUP_SCALAR_FIELDS) {
    const val = (partial as Record<string, unknown>)[field];
    if (val === null || val === undefined) continue;
    if (field === "total_raised_usd_m" && payload.total_raised_usd_m !== undefined) continue;
    if (DATE_FIELDS.has(field)) { const d = safeDate(val); if (d) payload[field] = d; }
    else if (INT_FIELDS.has(field))  { const n = safeInt(val);  if (n !== null) payload[field] = n; }
    else if (NUM_FIELDS.has(field))  { const n = safeNum(val);  if (n !== null) payload[field] = n; }
    else payload[field] = val;
  }
  if (Object.keys(payload).length > 1) {
    const { error } = await supabase.from("startups").update(payload).eq("id", startupId);
    if (error) console.warn(`writeStartupPartial: ${error.message}`);
  }
}

// ── Signals ───────────────────────────────────────────────────────

function safeApplicability(v: unknown): string {
  const s = String(v || "").toLowerCase().replace(/[\s_-]+/g, "_").trim();
  if (s === "not_applicable" || s === "not_app" || s === "n/a" || s === "na" || s === "inapplicable") return "not_applicable";
  if (s === "unknown") return "unknown";
  if (s === "applicable") return "applicable";
  return "unknown";
}

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
    applicability:        safeApplicability(f.applicability),
    applicability_reason: f.applicability_reason ?? null,
    raw_value:            f.raw_value   ?? null,
    data_type:            f.data_type   ?? null,
    source_type:          f.source_type || "web",
    source_url:           f.source_url  ?? null,
    confidence:           f.confidence  ?? null,
    skill_version:        "v4.0",
  }));
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from("raw_fields")
      .upsert(rows.slice(i, i + 100), { onConflict: "startup_id,field_name" });
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
    signal_type:     l.signal_type,
    source_platform: l.source_platform ?? null,
    post_text:       l.post_text    ?? null,
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
    score_version:         "v5.0",
    stage:                 s.stage || profile.auto_stage,
    industry:              profile.auto_industry,
    industry_sub:          profile.auto_industry_sub,
    scorecard_ids:         s.scorecard_ids    ?? null,
    primary_scorecard:     s.primary_scorecard ?? null,
    dim_team:              s.dim_team,
    dim_traction:          s.dim_traction,
    dim_capital:           s.dim_capital,
    dim_product:           s.dim_product,
    dim_market:            s.dim_market,
    dim_unit_econ:         s.dim_unit_econ,
    dim_momentum:          s.dim_momentum,
    dim_defensibility:     s.dim_defensibility,
    w_team:                s.w_team,
    w_traction:            s.w_traction,
    w_capital:             s.w_capital,
    w_product:             s.w_product,
    w_market:              s.w_market,
    w_unit_econ:           s.w_unit_econ,
    w_momentum:            s.w_momentum,
    w_defensibility:       s.w_defensibility,
    composite_score:       s.composite_score,
    covered_dimensions:    s.covered_dimensions ?? null,
    fields_applicable:     s.fields_applicable,
    fields_collected:      s.fields_collected,
    fields_unknown:        s.fields_unknown,
    fields_not_applicable: s.fields_not_applicable,
    data_quality_pct:      s.data_quality_pct,
    r_burn_multiple:       s.r_burn_multiple       ?? null,
    r_traction_velocity:   s.r_traction_velocity   ?? null,
    r_founder_mkt_fit:     s.r_founder_mkt_fit     ?? null,
    r_round_cadence:       s.r_round_cadence       ?? null,
    r_investor_quality:    s.r_investor_quality    ?? null,
    r_product_surface:     s.r_product_surface     ?? null,
    r_rev_per_head:        s.r_rev_per_head        ?? null,
    r_valuation_arr_mult:  s.r_valuation_arr_mult  ?? null,
    r_acv:                 s.r_acv                 ?? null,
    r_grant_equity_ratio:  s.r_grant_equity_ratio  ?? null,
    r_capital_productivity:s.r_capital_productivity ?? null,
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
