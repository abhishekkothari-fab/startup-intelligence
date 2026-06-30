// src/lib/api.ts
// All calls to the Supabase edge functions

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL + "/functions/v1"
const KEY  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

const headers = () => ({
  "Authorization": `Bearer ${KEY}`,
  "Content-Type": "application/json",
})

export interface Job {
  job_id:        string
  company_name:  string
  status:        "queued" | "running" | "completed" | "failed"
  progress_pct:  number
  startup_id?:   string
  profile_url?:  string
  error_message?: string
  cached?:       boolean
  passes?: {
    completed: string[]
    failed:    string[]
    pending:   string[]
  }
}

export interface StartupRow {
  id:                  string
  brand_name:          string
  legal_name?:         string
  stage?:              string
  industry?:           string
  industry_sub?:       string
  hq_city?:            string
  revenue_inr_cr?:     number
  revenue_fy?:         string
  total_raised_usd_m?: number
  team_size?:          number
  is_profitable?:      boolean
  glassdoor_rating?:   number
  composite_score?:    number
  dim_team?:           number
  dim_traction?:       number
  dim_capital?:        number
  dim_product?:        number
  dim_market?:         number
  dim_unit_econ?:      number
  dim_momentum?:       number
  dim_defensibility?:  number
  scorecard_ids?:      string[]
  primary_scorecard?:  string
  data_quality_pct?:   number
  score_status?:       string
  updated_at?:         string
  last_collected_at?:  string
  last_scored_at?:     string
}

export interface AnalystInput {
  field_name:  string
  value_num:   number | null
  entered_by?: string
  updated_at?: string
}

export interface Score {
  composite_score:    number
  covered_dimensions?: number
  dim_team:           number
  dim_traction:       number
  dim_capital:        number
  dim_product:        number
  dim_market:         number
  dim_unit_econ?:      number
  dim_momentum:        number
  dim_defensibility?:  number
  w_team?:             number
  w_traction?:         number
  w_capital?:          number
  w_product?:          number
  w_market?:           number
  w_unit_econ?:        number
  w_momentum?:         number
  w_defensibility?:    number
  scorecard_ids?:     string[]
  primary_scorecard?: string
  data_quality_pct:   number
  fields_applicable?:     number
  fields_collected?:      number
  fields_unknown?:        number
  fields_not_applicable?: number
  status:             string
  stage:              string
  industry?:          string
  industry_sub?:      string
  score_version?:     string
  r_burn_multiple?:        number
  r_founder_mkt_fit?:      number
  r_traction_velocity?:    number
  r_investor_quality?:     number
  r_product_surface?:      number
  r_round_cadence?:        number
  r_rev_per_head?:         number
  r_valuation_arr_mult?:   number
  r_acv?:                  number
  r_grant_equity_ratio?:   number
  r_capital_productivity?: number
  r_gnpa_pct?:             number
  r_nim_pct?:              number
  r_car_pct?:              number
  r_roe_pct?:              number
  scored_at:          string
}

export interface YouTubeSignal {
  video_title:    string
  video_url?:     string
  published_date?: string
  video_type:     string
  channel_name?:  string
  is_own_channel: boolean
  key_quote?:     string
  signal_tags?:   string[]
  confidence?:    number
}

export interface LinkedInSignal {
  pass:         number
  author_name?: string
  author_org?:  string
  author_role?: string
  signal_type:  string
  post_text?:   string
  post_url?:    string
  confidence:   number
  post_date?:   string
}

export interface FullProfile {
  startup:        Record<string, unknown>
  latest_score:   Score | null
  all_scores:     Score[]
  youtube:        YouTubeSignal[]
  linkedin:       LinkedInSignal[]
  raw_summary:    Record<string, unknown>[]
  analyst_inputs: AnalystInput[]
  meta: {
    youtube_count:    number
    linkedin_count:   number
    fields_collected: number
    passes_completed: string[]
  }
}

// ── Trigger profile ──────────────────────────────────────────────

export async function triggerProfile(company: string, country = "IN", requestedBy?: string): Promise<Job> {
  const res = await fetch(`${BASE}/profile-startup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ company, country, ...(requestedBy ? { requested_by: requestedBy } : {}) }),
  })
  if (!res.ok) throw new Error(`Trigger failed: ${await res.text()}`)
  return res.json()
}

// ── Poll job status ──────────────────────────────────────────────

export async function getJob(jobId: string): Promise<Job> {
  const res = await fetch(`${BASE}/get-job/${jobId}`, { headers: headers() })
  if (!res.ok) throw new Error(`Job poll failed: ${await res.text()}`)
  return res.json()
}

export async function pollJob(
  jobId: string,
  onProgress: (pct: number, status: string, job: Job) => void,
  intervalMs = 5000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await getJob(jobId)
        onProgress(job.progress_pct, job.status, job)
        if (job.startup_id) return resolve(job.startup_id)
        if (job.status === "failed") return reject(new Error(job.error_message ?? "Research failed"))
        setTimeout(tick, intervalMs)
      } catch (e) {
        reject(e)
      }
    }
    tick()
  })
}

// ── Fetch full profile ───────────────────────────────────────────

export async function getStartup(id: string): Promise<FullProfile> {
  const res = await fetch(`${BASE}/get-startup/${id}`, { headers: headers() })
  if (!res.ok) throw new Error(`Profile fetch failed: ${await res.text()}`)
  return res.json()
}

// ── Analyst inputs ───────────────────────────────────────────────

export async function upsertAnalystInputs(
  startupId: string,
  inputs: { field_name: string; value: number }[]
): Promise<{ composite_score?: number; fields_saved: number }> {
  const res = await fetch(`${BASE}/upsert-analyst-input`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ startup_id: startupId, inputs }),
  })
  if (!res.ok) throw new Error(`Analyst input save failed: ${await res.text()}`)
  return res.json()
}

// ── Fill missing passes ──────────────────────────────────────────

export async function triggerFill(
  companyName: string,
  passes: string[],
  clearSignals: string[],
  requestedBy?: string
): Promise<Job> {
  const res = await fetch(`${BASE}/profile-startup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      company: companyName,
      only_passes: passes,
      ...(clearSignals.length ? { clear_signals: clearSignals } : {}),
      ...(requestedBy ? { requested_by: requestedBy } : {}),
    }),
  })
  if (!res.ok) throw new Error(`Fill trigger failed: ${await res.text()}`)
  return res.json()
}

// ── Rescore ──────────────────────────────────────────────────────

export async function rescoreStartup(id: string): Promise<{ composite_score: number; primary_scorecard: string }> {
  const res = await fetch(`${BASE}/rescore-startup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ startup_id: id }),
  })
  if (!res.ok) throw new Error(`Rescore failed: ${await res.text()}`)
  return res.json()
}

// ── Leaderboard ──────────────────────────────────────────────────

export async function getStartups(params?: {
  page?:        number
  limit?:       number
  sort?:        string
  dir?:         string
  search?:      string
  stage?:       string[]
  industry?:    string[]
  scorecard?:   string[]
  profiled_by?: string
}): Promise<{ data: StartupRow[]; total: number; pages: number }> {
  const qs = new URLSearchParams()
  if (params?.page)                    qs.set("page",        String(params.page))
  if (params?.limit)                   qs.set("limit",       String(params.limit))
  if (params?.sort)                    qs.set("sort",        params.sort)
  if (params?.dir)                     qs.set("dir",         params.dir)
  if (params?.search)                  qs.set("search",      params.search)
  if (params?.stage?.length)           qs.set("stage",       params.stage.join(","))
  if (params?.industry?.length)        qs.set("industry",    params.industry.join(","))
  if (params?.scorecard?.length)       qs.set("scorecard",   params.scorecard.join(","))
  if (params?.profiled_by)             qs.set("profiled_by", params.profiled_by)
  const res = await fetch(`${BASE}/get-startups?${qs}`, { headers: headers() })
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${await res.text()}`)
  return res.json()
}
