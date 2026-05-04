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
  user: (co: string, country: string) => string
  maxTokens: number
}

const PASS_SPECS: Record<PassName, PassSpec> = {
  overview: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"brand_name":"","legal_name":null,"website":null,"founded_date":null,"hq_city":null,"hq_country":"IN","auto_stage":"","auto_industry":"","auto_industry_sub":"","auto_region":"","auto_biz_model":"","auto_entity_pack":"base","team_size":null}
auto_stage: pre_seed|seed|series_a|series_b_plus|growth
auto_industry: BFSI|AI_Infra|D2C|Health|Logistics|EdTech_HRTech
auto_region: metro_t1(Mumbai/Delhi/Bengaluru)|metro_t2(Pune/Hyd/Chennai/Ahmedabad)|non_metro
auto_biz_model: enterprise_saas|usage|d2c|nbfc|deeptech_ip
auto_entity_pack: base OR base|saas OR base|d2c|consumer OR base|nbfc|lending`,
    user: (co, country) => `Search: "${co} startup ${country} company overview founders profile" — return overview JSON for ${co}.`,
    maxTokens: 1500,
  },

  founders: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"raw_fields":[{"field_name":"","field_pack":"base","applicability":"applicable","raw_value":"","source_type":"web","source_url":null,"confidence":0.85}]}
Capture these field_names: founder_1_name, founder_1_education (IIT/IIM/tier1/other), founder_1_prior_startup (yes/no), founder_1_prior_exit (yes/no), founder_1_domain_years (number), founder_2_name (if exists), founder_2_education, advisor_count (number), notable_advisors.`,
    user: (co) => `Search: "${co} founders CEO CTO leadership background education LinkedIn" — return founders raw_fields JSON.`,
    maxTokens: 2000,
  },

  glassdoor: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"glassdoor_rating":null,"glassdoor_reviews":null,"glassdoor_recommend":null,"glassdoor_wlb":null,"glassdoor_culture":null,"glassdoor_themes":null}
glassdoor_rating: float, glassdoor_reviews: int, glassdoor_recommend: int (% who recommend), glassdoor_themes: CSV string of 3-5 culture themes.
Extract from SERP snippets only — do NOT visit Glassdoor directly.`,
    user: (co) => `Search: "${co} Glassdoor rating employee reviews work culture 2024 2025" — return glassdoor JSON from snippets.`,
    maxTokens: 800,
  },

  funding: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"total_raised_usd_m":null,"last_round_type":null,"last_round_date":null,"last_round_size_inr_cr":null,"raw_fields":[]}
last_round_type: Angel|Pre-Seed|Seed|Series A|Series B|Series C|Series D|Pre-IPO|IPO
Also capture in raw_fields: investor_1_name, investor_1_tier (tier1/tier2/angel/govt), investor_2_name (if exists), round_count (number).`,
    user: (co) => `Search: "${co} funding rounds investors raised valuation 2024 2025" — return funding JSON.`,
    maxTokens: 2000,
  },

  products: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"raw_fields":[{"field_name":"","field_pack":"base","applicability":"applicable","raw_value":"","source_type":"web","source_url":null,"confidence":0.85}]}
Capture: product_count (number), product_1_name, product_1_description, has_api (yes/no), has_mobile_app (yes/no), has_technical_moat (yes/reason), patent_count (number or 0).`,
    user: (co) => `Search: "${co} products features API technology platform 2025" — return products raw_fields JSON.`,
    maxTokens: 1500,
  },

  regulatory: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"cin":null,"legal_name":null,"raw_fields":[]}
CIN format: U12345AB2020PTC123456. Capture in raw_fields: incorporation_date, registered_state, mca_status (active/struck_off), authorized_capital_cr, paid_up_capital_cr.`,
    user: (co) => `Search: "${co} MCA CIN India company registration incorporation" — return regulatory JSON.`,
    maxTokens: 1000,
  },

  signals: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"revenue_inr_cr":null,"revenue_fy":null,"revenue_yoy_pct":null,"net_profit_inr_cr":null,"is_profitable":null,"client_count":null,"raw_fields":[]}
Also capture in raw_fields: latest_news_headline, latest_news_date, award_1 (name and year), partnership_1, expansion_target_market.`,
    user: (co) => `Search: "${co} revenue financials ARR growth news 2024 2025 clients" — return signals JSON.`,
    maxTokens: 1500,
  },

  youtube: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"youtube":[{"video_title":"","video_url":null,"published_date":null,"video_type":"","channel_name":null,"is_own_channel":false,"key_quote":null,"confidence":0.9}]}
video_type: founder_on_camera|podcast_feature|product_demo|culture_content|news_coverage
Capture up to 8 videos from YouTube search results.`,
    user: (co) => `Search: "${co} site:youtube.com" — return youtube signals JSON.`,
    maxTokens: 2000,
  },

  linkedin: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"linkedin":[{"pass":9,"author_name":null,"author_org":null,"signal_type":"","post_text":null,"post_url":null,"post_date":null,"confidence":0.85}]}
signal_type: founder_traction_claim|investor_validation|hiring_signal|partnership_announcement|product_launch|culture_post
Capture up to 6 posts from LinkedIn SERP snippets.`,
    user: (co) => `Search: site:linkedin.com "${co}" "excited to announce" OR "proud to back" OR "invested" OR "partner" — return linkedin signals JSON.`,
    maxTokens: 2000,
  },
}

// ── Helpers ───────────────────────────────────────────────────────

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
      ;(result as Record<string, unknown>)[k] = [...existing, ...(v as unknown[])]
    } else {
      ;(result as Record<string, unknown>)[k] = v
    }
  }
  return result
}

// ── Claude API call ───────────────────────────────────────────────

async function claudeCall(
  apiKey: string,
  system: string,
  userMsg: string,
  maxTokens: number,
  maxSearches: number
): Promise<string | null> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: userMsg }
  ]
  const bodyBase: Record<string, unknown> = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
  }
  if (maxSearches > 0) {
    bodyBase.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }]
  }

  const timeoutMs = maxSearches > 0 ? 50_000 : 30_000

  for (let i = 0; i < 4; i++) {
    const abort = new AbortController()
    const timer = setTimeout(() => abort.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({ ...bodyBase, messages }),
        signal: abort.signal,
      })
    } catch (e) {
      throw new Error(`API call failed: ${e}`)
    } finally {
      clearTimeout(timer)
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

// ── Scoring pass (no web search) ─────────────────────────────────

async function computeScores(
  apiKey: string,
  company: string,
  merged: Partial<StartupProfile>
): Promise<Partial<StartupProfile>> {
  const system = `Startup scoring analyst. Compute scores based on collected data. Return ONLY valid JSON.
Stage weights → pre_seed: f=0.35,t=0.05,c=0.15,p=0.20,m=0.15,mo=0.10 | seed: f=0.25,t=0.20,c=0.20,p=0.20,m=0.10,mo=0.05 | series_a: f=0.15,t=0.30,c=0.20,p=0.15,m=0.10,mo=0.10 | series_b_plus: f=0.10,t=0.35,c=0.20,p=0.15,m=0.10,mo=0.10 | growth: f=0.05,t=0.40,c=0.15,p=0.15,m=0.15,mo=0.10
dim_founder(0-100): IIT/IIM+20, prior_startup+20, prior_exit+20, domain≥5yr+20, tier1_advisor+10, network+10
dim_traction(0-100): no_rev=0,pilots=20,<1Cr=40,1-10Cr=60,10-50Cr=75,50Cr+=90; cash_flow_positive+10
dim_capital(0-100): tier1_VC(Sequoia/Accel/Matrix/Elevation)=90+, tier2=70-85, angels=30-50, no_funding=10
dim_product(0-100): live+30, technical_moat+30, multi_products+20, patents+10, public_demo+10
dim_market(0-100): TAM>$1Bn+30, reg_tailwind+20, low_competition+20, india_native+15, high_growth+15
dim_momentum(0-100): global_win+30, national_win+20, tier1_incubator+20, major_press+15, tracxn_inclusion+15
Unknown_field_penalty: -12% per unknown applicable field per dimension.
composite = sum(dim * weight).`

  const userMsg = `Company: ${company}
Stage: ${merged.auto_stage || "seed"}
Collected data:
${JSON.stringify(merged, null, 2)}

Return ONLY:
{"scores":{"stage":"","dim_founder":0,"dim_traction":0,"dim_capital":0,"dim_product":0,"dim_market":0,"dim_momentum":0,"w_founder":0,"w_traction":0,"w_capital":0,"w_product":0,"w_market":0,"w_momentum":0,"composite_score":0,"fields_applicable":0,"fields_collected":0,"fields_unknown":0,"fields_not_applicable":0,"data_quality_pct":0}}`

  const text = await claudeCall(apiKey, system, userMsg, 1500, 0)
  if (!text) return {}
  const obj = parseJson(text)
  return (obj as Partial<StartupProfile>) || {}
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

  await req.onProgress?.(5, "Starting research")

  for (const passName of PASS_NAMES) {
    if (passesStatus[passName]?.status === "completed") {
      console.log(`[${req.jobId}] Pass ${passName}: already completed, skipping`)
      continue
    }

    if (disabledPasses.has(passName)) {
      passesStatus[passName] = { status: "skipped", completed_at: new Date().toISOString() }
      console.log(`[${req.jobId}] Pass ${passName}: disabled`)
      continue
    }

    await req.onProgress?.(PASS_PROGRESS[passName] - 3, `Running: ${passName}`)
    console.log(`[${req.jobId}] Pass ${passName}: starting`)

    try {
      const spec = PASS_SPECS[passName]
      const text = await claudeCall(
        apiKey,
        spec.system,
        spec.user(req.company, req.country),
        spec.maxTokens,
        1
      )

      if (!text) {
        passesStatus[passName] = {
          status: "failed",
          completed_at: new Date().toISOString(),
          error: "No response from API",
        }
        console.warn(`[${req.jobId}] Pass ${passName}: no response`)
        continue
      }

      const obj = parseJson(text)
      if (!obj) {
        passesStatus[passName] = {
          status: "failed",
          completed_at: new Date().toISOString(),
          error: "JSON parse failed",
        }
        console.warn(`[${req.jobId}] Pass ${passName}: JSON parse failed — ${text.slice(0, 200)}`)
        continue
      }

      const partial = obj as Partial<StartupProfile>
      merged = mergePartial(merged, partial)

      passesStatus[passName] = { status: "completed", completed_at: new Date().toISOString() }
      await req.onPassComplete?.(passName, partial, { ...passesStatus })
      await req.onProgress?.(PASS_PROGRESS[passName], `Done: ${passName}`)
      console.log(`[${req.jobId}] Pass ${passName}: completed`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      passesStatus[passName] = {
        status: "failed",
        completed_at: new Date().toISOString(),
        error: msg,
      }
      console.error(`[${req.jobId}] Pass ${passName} failed:`, msg)
      // Continue to next pass rather than aborting entire research
    }
  }

  // Scoring pass (no web search)
  await req.onProgress?.(88, "Computing scores")
  try {
    const scoreData = await computeScores(apiKey, req.company, merged)
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
