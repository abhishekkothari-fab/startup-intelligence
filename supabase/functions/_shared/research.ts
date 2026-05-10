// supabase/functions/_shared/research.ts

export type PassStatus = "pending" | "completed" | "failed" | "skipped"
export type PassesStatus = Record<string, {
  status: PassStatus
  completed_at?: string
  error?: string
}>

export const PASS_NAMES = [
  "overview", "founders", "glassdoor", "funding",
  "products", "regulatory", "signals", "youtube", "linkedin"
] as const
export type PassName = typeof PASS_NAMES[number]

export const PASS_PROGRESS: Record<PassName, number> = {
  overview: 10, founders: 20, glassdoor: 28, funding: 38,
  products: 48, regulatory: 55, signals: 65, youtube: 75, linkedin: 85
}

export interface ResearchRequest {
  company: string
  country: string
  jobId: string
  onProgress?: (pct: number, note: string) => Promise<void>
  onPassComplete?: (
    passName: PassName,
    partial: Partial<StartupProfile>,
    passesStatus: PassesStatus
  ) => Promise<void>
  onPassStatusUpdate?: (passesStatus: PassesStatus) => Promise<void>
  existingPassesStatus?: PassesStatus
}

export interface StartupProfile {
  brand_name: string
  legal_name?: string
  cin?: string
  website?: string
  founded_date?: string
  hq_city?: string
  hq_country: string
  auto_stage: string
  auto_industry: string
  auto_industry_sub: string
  auto_region: string
  auto_biz_model: string
  auto_entity_pack: string
  revenue_inr_cr?: number
  revenue_fy?: string
  revenue_yoy_pct?: number
  net_profit_inr_cr?: number
  total_raised_usd_m?: number
  last_round_type?: string
  last_round_date?: string
  last_round_size_inr_cr?: number
  team_size?: number
  client_count?: number
  is_profitable?: boolean
  glassdoor_rating?: number
  glassdoor_reviews?: number
  glassdoor_recommend?: number
  glassdoor_wlb?: number
  glassdoor_culture?: number
  glassdoor_themes?: string
  scores: {
    stage: string
    dim_founder: number
    dim_traction: number
    dim_capital: number
    dim_product: number
    dim_market: number
    dim_momentum: number
    w_founder: number
    w_traction: number
    w_capital: number
    w_product: number
    w_market: number
    w_momentum: number
    composite_score: number
    fields_applicable: number
    fields_collected: number
    fields_unknown: number
    fields_not_applicable: number
    data_quality_pct: number
    r_funding_velocity?: number
    r_traction_velocity?: number
    r_founder_mkt_fit?: number
    r_recognition_momentum?: number
    r_investor_quality?: number
    r_product_surface?: number
    r_capital_efficiency?: number
    r_valuation_arr_mult?: number
    r_team_leverage?: number
    r_grant_equity_ratio?: number
    r_round_up_ratio?: number
    r_gnpa_pct?: number
    r_nim_pct?: number
    r_car_pct?: number
    r_roe_pct?: number
  }
  raw_fields: Array<{
    field_name: string
    field_pack: string
    applicability: "applicable" | "not_applicable" | "unknown"
    applicability_reason?: string
    raw_value?: string
    data_type?: string
    source_type: string
    source_url?: string
    confidence?: number
  }>
  youtube: Array<{
    video_title: string
    video_url?: string
    published_date?: string
    video_type: string
    channel_name?: string
    is_own_channel: boolean
    key_quote?: string
    signal_tags?: string[]
    confidence?: number
  }>
  linkedin: Array<{
    pass: 8 | 9
    author_name?: string
    author_org?: string
    author_role?: string
    signal_type: string
    post_text?: string
    post_url?: string
    post_date?: string
    confidence: number
  }>
}

// ── Per-pass specs ───────────────────────────────────────────────

interface PassSpec {
  system: string
  user: (co: string, country: string, ctx?: { industry?: string; stage?: string }) => string
  maxTokens: number
  maxSearches?: number  // defaults to 1
  model?: string  // defaults to claude-sonnet-4-6; use Haiku for lighter passes
}

const PASS_SPECS: Record<PassName, PassSpec> = {
  overview: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"brand_name":"","legal_name":null,"website":null,"founded_date":null,"hq_city":null,"hq_country":"IN","auto_stage":"","auto_industry":"","auto_industry_sub":"","auto_region":"","auto_biz_model":"","auto_entity_pack":"base","team_size":null}
auto_stage: pre_seed|seed|series_a|series_b_plus|growth
auto_industry: BFSI|AI_Infra|D2C|Health|Logistics|EdTech_HRTech
auto_region: metro_t1(Mumbai/Delhi/Bengaluru)|metro_t2(Pune/Hyd/Chennai/Ahmedabad)|non_metro
auto_biz_model: enterprise_saas|usage|d2c|nbfc|deeptech_ip
auto_entity_pack: base OR base|saas OR base|d2c|consumer OR base|nbfc|lending
IMPORTANT: Search specifically for the Indian company. If the name could refer to multiple companies, focus on the Indian startup.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} startup company overview founders profile" — return overview JSON for the Indian company named ${co}.`
    },
    maxTokens: 1500,
  },

  founders: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"raw_fields":[{"field_name":"","field_pack":"base","applicability":"applicable","raw_value":"","source_type":"web","source_url":null,"confidence":0.85}]}
Capture these field_names: founder_1_name, founder_1_education (IIT/IIM/tier1/other), founder_1_prior_startup (yes/no), founder_1_prior_exit (yes/no), founder_1_domain_years (number), founder_2_name (if exists), founder_2_education, advisor_count (number), notable_advisors.
IMPORTANT: Search specifically for the Indian company founders. Ignore founders of same-named companies in other countries.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} founders CEO CTO leadership background education LinkedIn" — return founders raw_fields JSON for the Indian startup ${co}.`
    },
    maxTokens: 2000,
  },

  glassdoor: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"glassdoor_rating":null,"glassdoor_reviews":null,"glassdoor_recommend":null,"glassdoor_wlb":null,"glassdoor_culture":null,"glassdoor_themes":null}
glassdoor_rating: float, glassdoor_reviews: int, glassdoor_recommend: int (% who recommend), glassdoor_themes: CSV string of 3-5 culture themes.
Extract from SERP snippets only — do NOT visit Glassdoor directly.
IMPORTANT: Only return data for the Indian company. Discard any results for same-named companies in other countries.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} Glassdoor rating employee reviews work culture 2024 2025" — return glassdoor JSON from snippets for the Indian company ${co}.`
    },
    maxTokens: 800,
  },

  funding: {
    system: `Startup research analyst. Do up to 2 web searches to find comprehensive funding history for the specified Indian startup.

CRITICAL: You MUST populate raw_fields with actual investor and round data. An empty raw_fields array is WRONG.

Return ONLY valid JSON in this exact structure:
{
  "total_raised_usd_m": null,
  "last_round_type": null,
  "last_round_date": null,
  "last_round_size_inr_cr": null,
  "raw_fields": [
    {"field_name":"round_count","field_pack":"funding","applicability":"applicable","raw_value":"4","data_type":"numeric","source_type":"web","source_url":null,"confidence":0.9},
    {"field_name":"lead_investor","field_pack":"funding","applicability":"applicable","raw_value":"Accel","data_type":"text","source_type":"web","source_url":null,"confidence":0.9},
    {"field_name":"investor_1_name","field_pack":"funding","applicability":"applicable","raw_value":"Accel","data_type":"text","source_type":"web","source_url":null,"confidence":0.9},
    {"field_name":"investor_1_tier","field_pack":"funding","applicability":"applicable","raw_value":"tier1","data_type":"text","source_type":"web","source_url":null,"confidence":0.85},
    {"field_name":"investor_2_name","field_pack":"funding","applicability":"applicable","raw_value":"Tiger Global","data_type":"text","source_type":"web","source_url":null,"confidence":0.9},
    {"field_name":"round_history","field_pack":"funding","applicability":"applicable","raw_value":"[{\"type\":\"Series B\",\"date\":\"2022-06\",\"amount_usd_m\":20,\"lead\":\"Accel\",\"investors\":[\"Accel\",\"Tiger Global\"]}]","data_type":"json","source_type":"web","source_url":null,"confidence":0.85}
  ]
}

Required raw_fields (ALL must have field_pack="funding"):
- round_count: total rounds as a numeric string (e.g. "4")
- lead_investor: lead investor of the most recent round
- investor_1_name through investor_5_name: top investors by prominence
- investor_1_tier through investor_3_tier: "tier1"|"tier2"|"angel"|"govt"
- round_history: a JSON string array of all rounds, most recent first — each: {"type","date":"YYYY-MM","amount_usd_m","lead","investors":[...]}

Currency rules: ₹83 Cr ≈ $1M. Convert INR→USD for total_raised_usd_m. Never return null just because amounts are in INR.
last_round_type must be one of: Angel|Pre-Seed|Seed|Series A|Series B|Series C|Series D|Pre-IPO|IPO
Set applicability="unknown" and raw_value=null only if the information is genuinely absent after searching.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      return `Search 1: "${co} ${cname}${sector} funding history all rounds investors crunchbase tracxn inc42 total raised"\nSearch 2: "${co} ${cname} Series A B C D investors lead investor amount 2020 2021 2022 2023 2024 2025"\nReturn complete round-by-round funding history and investor list as JSON for the Indian company ${co}.`
    },
    maxTokens: 3000,
    maxSearches: 2,
  },

  products: {
    system: `Startup research analyst. Do exactly 1 web search. You MUST return a JSON object regardless of search results.
Return ONLY: {"raw_fields":[{"field_name":"","field_pack":"products","applicability":"applicable","raw_value":"","source_type":"web","source_url":null,"confidence":0.85}]}
Capture these field_names (field_pack must be "products" for all): product_count, product_1_name, product_1_description, product_1_type (B2B/B2C/B2B2C), has_api (yes/no), has_mobile_app (yes/no), has_technical_moat (yes/no — add brief reason), pricing_model, moat_type.
If you cannot find information for a field, set applicability="unknown" and raw_value=null. Always return at least one raw_field entry.
IMPORTANT: Search specifically for the Indian company's products. Discard results for same-named companies elsewhere.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      return `Search: "${co} ${cname}${sector} products features API technology platform" — return products raw_fields JSON for the Indian startup ${co}.`
    },
    maxTokens: 1500,
    model: "claude-haiku-4-5-20251001",
  },

  regulatory: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"cin":null,"legal_name":null,"raw_fields":[]}
CIN format: U12345AB2020PTC123456. Capture in raw_fields (field_pack="regulatory" for all): incorporation_date, registered_state, mca_status (active/struck_off), authorized_capital_cr, paid_up_capital_cr.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} MCA CIN India company registration incorporation" — return regulatory JSON for the Indian company ${co}.`
    },
    maxTokens: 1000,
    model: "claude-haiku-4-5-20251001",
  },

  signals: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"revenue_inr_cr":null,"revenue_fy":null,"revenue_yoy_pct":null,"net_profit_inr_cr":null,"is_profitable":null,"client_count":null,"raw_fields":[]}
Also capture in raw_fields (field_pack="signals" for all): latest_news_headline, latest_news_date, award_1 (name and year), partnership_1, expansion_target_market.
IMPORTANT: Only report financials and news for the Indian company. Discard data from same-named companies elsewhere.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      return `Search: "${co} ${cname}${sector} revenue financials ARR growth news 2024 2025 clients" — return signals JSON for the Indian company ${co}.`
    },
    maxTokens: 1500,
    model: "claude-haiku-4-5-20251001",
  },

  youtube: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"youtube":[{"video_title":"","video_url":null,"published_date":null,"video_type":"","channel_name":null,"is_own_channel":false,"key_quote":null,"confidence":0.9}]}
video_type: founder_on_camera|podcast_feature|product_demo|culture_content|news_coverage
Capture up to 8 videos. Only include videos about the Indian company.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} site:youtube.com" — return youtube signals JSON for the Indian company ${co}.`
    },
    maxTokens: 2000,
    model: "claude-haiku-4-5-20251001",
  },

  linkedin: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"linkedin":[{"pass":9,"author_name":null,"author_org":null,"author_role":null,"signal_type":"","post_text":null,"post_url":null,"post_date":null,"confidence":0.85}]}
signal_type: founder_traction_claim|investor_validation|hiring_signal|partnership_announcement|product_launch|culture_post
Capture up to 6 posts from LinkedIn SERP snippets. Only include posts about the Indian company.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} LinkedIn announcement funding investment partnership hiring 2024 2025" — return linkedin signals JSON for the Indian company ${co}.`
    },
    maxTokens: 2000,
    model: "claude-haiku-4-5-20251001",
  },
}

// ── Helpers ───────────────────────────────────────────────────────

// Promise.race-based timeout — works even when AbortController can't cancel in-flight fetches.
// Returns null on timeout so the pass is marked failed and research continues.
function raceTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

function parseJson(text: string): Record<string, unknown> | null {
  const s = text.indexOf("{")
  const e = text.lastIndexOf("}")
  if (s === -1 || e === -1) return null
  try { return JSON.parse(text.slice(s, e + 1)) } catch { return null }
}

function mergePartial(
  base: Partial<StartupProfile>,
  incoming: Partial<StartupProfile>
): Partial<StartupProfile> {
  const result = { ...base }
  for (const [k, v] of Object.entries(incoming)) {
    if (v === null || v === undefined) continue
    if (k === "youtube" || k === "linkedin" || k === "raw_fields") {
      const existing = ((result as Record<string, unknown>)[k] as unknown[]) || []
      const arr = Array.isArray(v) ? v : []
      ;(result as Record<string, unknown>)[k] = [...existing, ...arr]
    } else {
      ;(result as Record<string, unknown>)[k] = v
    }
  }
  return result
}

// ── Claude API call ───────────────────────────────────────────────

// Uses AbortSignal.timeout() — a spec-native fetch cancellation that works
// at the runtime level rather than relying on JS event-loop timers.
function timedFetch(url: string, options: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) })
}

async function claudeCall(
  apiKey: string,
  system: string,
  userMsg: string,
  maxTokens: number,
  maxSearches: number,
  deadlineMs: number,   // absolute wall-clock deadline (Date.now()-based)
  model = "claude-sonnet-4-6"
): Promise<string | null> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: userMsg }
  ]
  const bodyBase: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system,
  }
  if (maxSearches > 0) {
    bodyBase.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }]
  }

  for (let i = 0; i < 5; i++) {
    // Per-fetch budget: remaining wall-clock minus 8s buffer, capped at 50s per call.
    const perFetchMs = Math.max(Math.min(50_000, deadlineMs - Date.now() - 8_000), 5_000)

    let res: Response
    try {
      res = await timedFetch(
        "https://api.anthropic.com/v1/messages",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ ...bodyBase, messages }),
        },
        perFetchMs
      )
    } catch (e) {
      throw new Error(`API call failed: ${e}`)
    }

    // Retry on rate limit, capped at 10s to avoid a long stall
    if (res.status === 429) {
      const retryAfter = Math.min(parseInt(res.headers.get("retry-after") || "10", 10), 10)
      console.warn(`Rate limited — waiting ${retryAfter}s`)
      await new Promise(r => setTimeout(r, retryAfter * 1000))
      continue
    }

    if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)

    const data = await res.json()

    if (data.stop_reason === "end_turn") {
      return (data.content as { type: string; text?: string }[])
        .filter(b => b.type === "text")
        .map(b => b.text || "")
        .join("")
    }

    if (data.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: data.content })
      const toolResults = (data.content as { type: string; id: string }[])
        .filter(b => b.type === "tool_use")
        .map(b => ({ type: "tool_result", tool_use_id: b.id, content: "" }))
      if (toolResults.length > 0) messages.push({ role: "user", content: toolResults })
      continue
    }

    break
  }
  return null
}

// ── Programmatic scoring (no API call — runs in <1ms) ────────────

function computeScores(merged: Partial<StartupProfile>): Partial<StartupProfile> {
  const stage = merged.auto_stage || "seed"
  const WEIGHTS: Record<string, number[]> = {
    pre_seed:      [0.35, 0.05, 0.15, 0.20, 0.15, 0.10],
    seed:          [0.25, 0.20, 0.20, 0.20, 0.10, 0.05],
    series_a:      [0.15, 0.30, 0.20, 0.15, 0.10, 0.10],
    series_b_plus: [0.10, 0.35, 0.20, 0.15, 0.10, 0.10],
    growth:        [0.05, 0.40, 0.15, 0.15, 0.15, 0.10],
  }
  const [wf, wt, wc, wp, wm, wmo] = WEIGHTS[stage] || WEIGHTS.seed

  // Build a quick lookup from raw_fields
  const fm: Record<string, string> = {}
  for (const f of (merged.raw_fields || [])) {
    if (f.raw_value && f.raw_value !== "unknown") fm[f.field_name] = f.raw_value.toLowerCase()
  }

  // dim_founder (0-100)
  let dimFounder = 20
  const edu = fm["founder_1_education"] || ""
  if (edu.includes("iit") || edu.includes("iim") || edu.includes("tier1") || edu.includes("isb")) dimFounder += 20
  if (fm["founder_1_prior_startup"] === "yes") dimFounder += 20
  if (fm["founder_1_prior_exit"] === "yes") dimFounder += 20
  if (parseInt(fm["founder_1_domain_years"] || "0") >= 5) dimFounder += 20
  if (parseInt(fm["advisor_count"] || "0") >= 2) dimFounder += 10

  // dim_traction (0-100)
  let dimTraction = 0
  const rev = merged.revenue_inr_cr
  if (rev && rev >= 50) dimTraction = 90
  else if (rev && rev >= 10) dimTraction = 75
  else if (rev && rev >= 1) dimTraction = 60
  else if (rev && rev > 0) dimTraction = 40
  else if (merged.client_count && merged.client_count > 100) dimTraction = 20
  if (merged.is_profitable) dimTraction = Math.min(100, dimTraction + 10)

  // dim_capital (0-100)
  let dimCapital = 10
  const tier = fm["investor_1_tier"] || ""
  if (tier === "tier1") dimCapital = 90
  else if (tier === "tier2") dimCapital = 75
  else if (tier === "angel") dimCapital = 45
  else if (tier === "govt") dimCapital = 35
  else if (merged.total_raised_usd_m && merged.total_raised_usd_m >= 10) dimCapital = 55
  else if (merged.total_raised_usd_m && merged.total_raised_usd_m > 0) dimCapital = 35

  // dim_product (0-100)
  let dimProduct = 30
  if ((fm["has_technical_moat"] || "").startsWith("yes")) dimProduct += 30
  if (fm["has_api"] === "yes") dimProduct += 10
  if (fm["has_mobile_app"] === "yes") dimProduct += 10
  if (parseInt(fm["patent_count"] || "0") > 0) dimProduct += 10
  if (parseInt(fm["product_count"] || "0") > 1) dimProduct += 10

  // dim_market (0-100) — default moderate; most Indian SaaS/BFSI/D2C have large TAMs
  const dimMarket = 55

  // dim_momentum (0-100)
  let dimMomentum = 15
  if (fm["award_1"]) dimMomentum += 20
  if (fm["partnership_1"]) dimMomentum += 15
  if (fm["latest_news_headline"]) dimMomentum += 10

  const composite = Math.round(
    dimFounder * wf + dimTraction * wt + dimCapital * wc +
    dimProduct * wp + dimMarket * wm + dimMomentum * wmo
  )

  const fieldsCollected = Object.keys(fm).length +
    (rev ? 1 : 0) + (merged.total_raised_usd_m ? 1 : 0) +
    (merged.glassdoor_rating ? 1 : 0) + (merged.team_size ? 1 : 0)
  const fieldsApplicable = 20
  const fieldsUnknown = Math.max(0, fieldsApplicable - fieldsCollected)
  const dq = Math.round(Math.min(95, (fieldsCollected / fieldsApplicable) * 100))

  return {
    scores: {
      stage, dim_founder: dimFounder, dim_traction: dimTraction, dim_capital: dimCapital,
      dim_product: dimProduct, dim_market: dimMarket, dim_momentum: dimMomentum,
      w_founder: wf, w_traction: wt, w_capital: wc, w_product: wp, w_market: wm, w_momentum: wmo,
      composite_score: composite,
      fields_applicable: fieldsApplicable, fields_collected: fieldsCollected,
      fields_unknown: fieldsUnknown, fields_not_applicable: 0, data_quality_pct: dq,
    }
  }
}

// ── Mock ──────────────────────────────────────────────────────────

function mockProfile(company: string, country: string): StartupProfile {
  return {
    brand_name: company, legal_name: `${company} Pvt Ltd`, cin: "U72900MH2020PTC123456",
    website: `https://www.${company.toLowerCase().replace(/\s+/g, "")}.com`,
    founded_date: "2020-01-01", hq_city: "Mumbai", hq_country: country,
    auto_stage: "series_a", auto_industry: "D2C", auto_industry_sub: "FastFashion",
    auto_region: "metro_t1", auto_biz_model: "d2c", auto_entity_pack: "base|d2c|consumer",
    revenue_inr_cr: 42, revenue_fy: "FY24", revenue_yoy_pct: 35,
    net_profit_inr_cr: -8, total_raised_usd_m: 12, last_round_type: "Series A",
    last_round_date: "2023-06-01", last_round_size_inr_cr: 100,
    team_size: 120, client_count: 50000, is_profitable: false,
    glassdoor_rating: 3.8, glassdoor_reviews: 45, glassdoor_recommend: 72,
    glassdoor_wlb: 3.5, glassdoor_culture: 3.9, glassdoor_themes: "fast-paced,good-tech,growth-culture",
    scores: {
      stage: "series_a", dim_founder: 72, dim_traction: 65, dim_capital: 60,
      dim_product: 70, dim_market: 75, dim_momentum: 68,
      w_founder: 0.15, w_traction: 0.30, w_capital: 0.20,
      w_product: 0.15, w_market: 0.10, w_momentum: 0.10,
      composite_score: 69, fields_applicable: 40, fields_collected: 28,
      fields_unknown: 8, fields_not_applicable: 4, data_quality_pct: 70,
    },
    raw_fields: [
      {
        field_name: "revenue_inr_cr", field_pack: "base", applicability: "applicable",
        raw_value: "42", data_type: "number", source_type: "web",
        source_url: "https://entrackr.com/mock", confidence: 0.85
      }
    ],
    youtube: [], linkedin: [],
  }
}

// ── Main orchestrator ─────────────────────────────────────────────

export async function researchStartup(req: ResearchRequest): Promise<StartupProfile> {
  if (Deno.env.get("MOCK_ANTHROPIC") === "true") {
    await req.onProgress?.(10, "[MOCK] Simulating research...")
    await new Promise(r => setTimeout(r, 1500))
    await req.onProgress?.(80, "[MOCK] Building profile...")
    await new Promise(r => setTimeout(r, 1000))
    const mock = mockProfile(req.company, req.country)
    const mockStatus: PassesStatus = {}
    for (const p of PASS_NAMES) {
      mockStatus[p] = { status: "completed", completed_at: new Date().toISOString() }
    }
    await req.onPassComplete?.("overview", mock, mockStatus)
    return mock
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set")

  // Preflight key validation
  const pf = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    }),
  })
  if (pf.status === 401) {
    throw new Error(
      "ANTHROPIC_KEY_STALE: Go to Supabase → Edge Functions → Secrets → re-save ANTHROPIC_API_KEY"
    )
  }

  const disabledPasses = new Set(
    (Deno.env.get("DISABLED_PASSES") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  )

  const passesStatus: PassesStatus = { ...(req.existingPassesStatus || {}) }
  let merged: Partial<StartupProfile> = {
    brand_name: req.company,
    hq_country: req.country,
    youtube: [],
    linkedin: [],
    raw_fields: [],
  }

  // Hard deadline: 130s — leaves 20s for DB cleanup before EdgeRuntime kills at 150s.
  const deadline = Date.now() + 130_000

  await req.onProgress?.(5, "Starting research")

  // Two batches of 3 — reliably completes within 150s.
  // signals/youtube/linkedin require web searches that can hang indefinitely in this
  // EdgeRuntime (no JS-side timeout can cancel an in-flight fetch), so they are
  // excluded from the main job. They can be run via a separate optional function call.
  const PASS_BATCHES: PassName[][] = [
    ["overview", "founders", "glassdoor"],
    ["funding", "products", "regulatory"],
  ]

  for (const batch of PASS_BATCHES) {
    // Only run passes that are pending and not disabled
    const toRun = batch.filter(p =>
      passesStatus[p]?.status !== "completed" && !disabledPasses.has(p)
    )
    // Mark disabled ones
    for (const p of batch) {
      if (disabledPasses.has(p) && passesStatus[p]?.status !== "completed") {
        passesStatus[p] = { status: "skipped", completed_at: new Date().toISOString() }
      }
    }
    if (toRun.length === 0) continue

    // Skip batch entirely if less than 10s remains — not enough time for any API call
    if (deadline - Date.now() < 10_000) {
      for (const p of toRun) {
        passesStatus[p] = { status: "failed", completed_at: new Date().toISOString(), error: "Wall-clock budget exhausted" }
      }
      await req.onPassStatusUpdate?.({ ...passesStatus })
      console.warn(`[${req.jobId}] Skipping batch ${toRun.join(",")} — wall-clock budget exhausted`)
      break
    }

    console.log(`[${req.jobId}] Batch starting: ${toRun.join(", ")}`)
    await req.onProgress?.(PASS_PROGRESS[toRun[0]] - 3, `Running: ${toRun.join(", ")}`)

    // Fire all passes in the batch in parallel
    const results = await Promise.all(toRun.map(async (passName) => {
      try {
        const spec = PASS_SPECS[passName]
        const budgetMs = Math.max(Math.min(50_000, deadline - Date.now() - 8_000), 5_000)
        // Pass merged context so batch-2 queries can use industry/stage from batch-1 overview
        const ctx = { industry: merged.auto_industry, stage: merged.auto_stage }
        const text = await raceTimeout(
          claudeCall(apiKey, spec.system, spec.user(req.company, req.country, ctx), spec.maxTokens, spec.maxSearches ?? 1, deadline, spec.model),
          budgetMs
        )
        if (text === null || text.trim() === "") {
          return { passName, partial: null as Partial<StartupProfile> | null, error: "No response from API" }
        }
        const obj = parseJson(text)
        if (!obj) {
          return { passName, partial: null, error: `JSON parse failed: ${text.slice(0, 100)}` }
        }
        return { passName, partial: obj as Partial<StartupProfile>, error: null }
      } catch (e) {
        return { passName, partial: null, error: e instanceof Error ? e.message : String(e) }
      }
    }))

    // Process results sequentially so merges and DB writes don't interleave.
    // overview is always first in its batch, ensuring startupId is set before
    // founders/glassdoor callbacks run.
    for (const { passName, partial, error } of results) {
      if (error || !partial) {
        passesStatus[passName] = { status: "failed", completed_at: new Date().toISOString(), error: error || "Unknown" }
        console.warn(`[${req.jobId}] Pass ${passName} failed: ${error}`)
        await req.onPassStatusUpdate?.({ ...passesStatus })
      } else {
        merged = mergePartial(merged, partial)
        passesStatus[passName] = { status: "completed", completed_at: new Date().toISOString() }
        await req.onPassComplete?.(passName, partial, { ...passesStatus })
        console.log(`[${req.jobId}] Pass ${passName}: completed`)
      }
    }

    await req.onProgress?.(PASS_PROGRESS[toRun[toRun.length - 1]], `Batch done`)
  }

  // Programmatic scoring — instant, no API call
  await req.onProgress?.(88, "Computing scores")
  try {
    const scoreData = computeScores(merged)
    merged = mergePartial(merged, scoreData)
  } catch (e) {
    console.warn(`[${req.jobId}] Scoring failed (non-fatal):`, e)
  }

  await req.onProgress?.(95, "Finalizing profile")

  const stage = (merged.auto_stage || "seed") as string
  const WEIGHTS: Record<string, number[]> = {
    pre_seed:      [0.35, 0.05, 0.15, 0.20, 0.15, 0.10],
    seed:          [0.25, 0.20, 0.20, 0.20, 0.10, 0.05],
    series_a:      [0.15, 0.30, 0.20, 0.15, 0.10, 0.10],
    series_b_plus: [0.10, 0.35, 0.20, 0.15, 0.10, 0.10],
    growth:        [0.05, 0.40, 0.15, 0.15, 0.15, 0.10],
  }
  const [wf, wt, wc, wp, wm, wmo] = WEIGHTS[stage] || WEIGHTS.seed

  return {
    brand_name:            merged.brand_name         || req.company,
    legal_name:            merged.legal_name,
    cin:                   merged.cin,
    website:               merged.website,
    founded_date:          merged.founded_date,
    hq_city:               merged.hq_city,
    hq_country:            merged.hq_country         || req.country,
    auto_stage:            merged.auto_stage          || "seed",
    auto_industry:         merged.auto_industry       || "D2C",
    auto_industry_sub:     merged.auto_industry_sub   || "",
    auto_region:           merged.auto_region         || "metro_t1",
    auto_biz_model:        merged.auto_biz_model      || "d2c",
    auto_entity_pack:      merged.auto_entity_pack    || "base",
    revenue_inr_cr:        merged.revenue_inr_cr,
    revenue_fy:            merged.revenue_fy,
    revenue_yoy_pct:       merged.revenue_yoy_pct,
    net_profit_inr_cr:     merged.net_profit_inr_cr,
    total_raised_usd_m:    merged.total_raised_usd_m,
    last_round_type:       merged.last_round_type,
    last_round_date:       merged.last_round_date,
    last_round_size_inr_cr:merged.last_round_size_inr_cr,
    team_size:             merged.team_size,
    client_count:          merged.client_count,
    is_profitable:         merged.is_profitable,
    glassdoor_rating:      merged.glassdoor_rating,
    glassdoor_reviews:     merged.glassdoor_reviews,
    glassdoor_recommend:   merged.glassdoor_recommend,
    glassdoor_wlb:         merged.glassdoor_wlb,
    glassdoor_culture:     merged.glassdoor_culture,
    glassdoor_themes:      merged.glassdoor_themes,
    scores: merged.scores || {
      stage,
      dim_founder: 25, dim_traction: 25, dim_capital: 20,
      dim_product: 30, dim_market: 50, dim_momentum: 15,
      w_founder: wf, w_traction: wt, w_capital: wc,
      w_product: wp, w_market: wm, w_momentum: wmo,
      composite_score: 28, fields_applicable: 10, fields_collected: 4,
      fields_unknown: 6, fields_not_applicable: 0, data_quality_pct: 40,
    },
    raw_fields: merged.raw_fields  || [],
    youtube:    merged.youtube     || [],
    linkedin:   merged.linkedin    || [],
  }
}
