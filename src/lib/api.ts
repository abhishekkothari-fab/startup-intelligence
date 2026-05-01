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
  dim_traction?:       number
  dim_founder?:        number
  dim_capital?:        number
  dim_product?:        number
  dim_market?:         number
  dim_momentum?:       number
  data_quality_pct?:   number
  score_status?:       string
  updated_at?:         string
}

export interface Score {
  composite_score:    number
  dim_founder:        number
  dim_traction:       number
  dim_capital:        number
  dim_product:        number
  dim_market:         number
  dim_momentum:       number
  data_quality_pct:   number
  status:             string
  stage:              string
  r_funding_velocity?:    number
  r_founder_mkt_fit?:     number
  r_traction_velocity?:   number
  r_investor_quality?:    number
  r_product_surface?:     number
  r_recognition_momentum?: number
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
}

export interface LinkedInSignal {
  pass:         number
  author_name?: string
  author_org?:  string
  signal_type:  string
  post_text?:   string
  post_url?:    string
  confidence:   number
  post_date?:   string
}

export interface FullProfile {
  startup:      Record<string, unknown>
  latest_score: Score | null
  all_scores:   Score[]
  youtube:      YouTubeSignal[]
  linkedin:     LinkedInSignal[]
  meta: {
    youtube_count:    number
    linkedin_count:   number
    fields_collected: number
  }
}

// ── Trigger profile ──────────────────────────────────────────────

export async function triggerProfile(company: string, country = "IN"): Promise<Job> {
  const res = await fetch(`${BASE}/profile-startup`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ company, country }),
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
  onProgress: (pct: number, status: string) => void,
  intervalMs = 5000
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const job = await getJob(jobId)
        onProgress(job.progress_pct, job.status)
        if (job.status === "completed" && job.startup_id) return resolve(job.startup_id)
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

// ── Leaderboard ──────────────────────────────────────────────────

export async function getStartups(params?: {
  page?:     number
  limit?:    number
  stage?:    string
  industry?: string
  sort?:     string
}): Promise<{ data: StartupRow[]; total: number; pages: number }> {
  const qs = new URLSearchParams()
  if (params?.page)     qs.set("page",     String(params.page))
  if (params?.limit)    qs.set("limit",    String(params.limit))
  if (params?.stage)    qs.set("stage",    params.stage)
  if (params?.industry) qs.set("industry", params.industry)
  if (params?.sort)     qs.set("sort",     params.sort)
  const res = await fetch(`${BASE}/get-startups?${qs}`, { headers: headers() })
  if (!res.ok) throw new Error(`Leaderboard fetch failed: ${await res.text()}`)
  return res.json()
}
