// supabase/functions/_shared/research.ts

export type PassStatus = "pending" | "completed" | "failed" | "skipped"
export type PassesStatus = Record<string, {
  status: PassStatus
  completed_at?: string
  error?: string
  tokens_in?: number
  tokens_out?: number
}>

export const PASS_NAMES = [
  "overview", "founders", "glassdoor", "funding",
  "products", "regulatory", "signals", "youtube", "linkedin_founder", "linkedin_company"
] as const
export type PassName = typeof PASS_NAMES[number]

export const PASS_PROGRESS: Record<PassName, number> = {
  overview: 10, founders: 20, glassdoor: 28, funding: 38,
  products: 48, regulatory: 55, signals: 65, youtube: 75,
  linkedin_founder: 82, linkedin_company: 90,
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
  initialMerged?: Partial<StartupProfile>
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
  auto_tagline?: string
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
  glassdoor_career_opp?: number
  glassdoor_positive_outlook_pct?: number
  glassdoor_interview_positive_pct?: number
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
  user: (co: string, country: string, ctx?: { industry?: string; stage?: string; founderName?: string; website?: string; legalName?: string }) => string
  maxTokens: number
  maxSearches?: number  // defaults to 1
  model?: string  // defaults to claude-sonnet-4-6; use Haiku for lighter passes
}

const PASS_SPECS: Record<PassName, PassSpec> = {
  overview: {
    system: `Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"brand_name":"","legal_name":null,"website":null,"founded_date":null,"hq_city":null,"hq_country":"IN","auto_stage":"","auto_industry":"","auto_industry_sub":"","auto_region":"","auto_biz_model":"","auto_entity_pack":"base","team_size":null,"auto_tagline":null}
auto_stage: pre_seed|seed|series_a|series_b_plus|growth
auto_industry: BFSI|AI_Infra|D2C|Health|Logistics|EdTech_HRTech
auto_region: metro_t1(Mumbai/Delhi/Bengaluru)|metro_t2(Pune/Hyd/Chennai/Ahmedabad)|non_metro
auto_biz_model: enterprise_saas|usage|d2c|nbfc|deeptech_ip
auto_entity_pack: base OR base|saas OR base|d2c|consumer OR base|nbfc|lending
auto_tagline: one short punchy sentence (max 10 words) describing what the company does — e.g. "India's trust infrastructure company" or "AI-native compliance platform for Indian banks". Do NOT use marketing language like "revolutionizing" — use precise domain terms.
IMPORTANT: Search specifically for the Indian company. If the name could refer to multiple companies, focus on the Indian startup.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} startup company overview founders profile" — return overview JSON for the Indian company named ${co}.`
    },
    maxTokens: 1500,
  },

  founders: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after the JSON. No markdown. No explanation.

Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"raw_fields":[{"field_name":"","field_pack":"base","applicability":"applicable","raw_value":"","source_type":"web","source_url":null,"confidence":0.85}]}
Capture these field_names (field_pack="base" for all):
Founders: founder_1_name, founder_1_role (title), founder_1_bio (2–3 sentence career narrative), founder_1_education (IIT/IIM/tier1/other — exact institution if known), founder_1_prior_startup (yes/no), founder_1_prior_exit (yes/no), founder_1_domain_years (number), founder_1_status (active/former), founder_1_linkedin_url, founder_1_is_iit_iim (yes/no). Repeat founder_2_*, founder_3_*, founder_4_* if they exist.
advisor_count (number), notable_advisors (comma-separated names).
CXO / non-founder C-suite: for each person capture cxo_N_name, cxo_N_role, cxo_N_background (one sentence: prior orgs + domain expertise — e.g. "Ex-Razorpay CTO; 14yr in payments infra"). Roles to capture: CPO, COO, CFO, CMO, CTO, Chief AI Officer, SVP, VP-level non-founders (up to cxo_6). STRICT RULE: only output a cxo_N entry if you found a real name. Never write "not specified", "unknown", or any placeholder. If background is unknown, omit cxo_N_background entirely.
IMPORTANT: Search specifically for the Indian company. Ignore same-named companies in other countries.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} founders CEO CTO CPO COO CFO executive leadership team C-suite background education" — return founders and CXO raw_fields JSON for the Indian startup ${co}.`
    },
    maxTokens: 5000,
    maxSearches: 2,
    model: "claude-haiku-4-5-20251001",
  },

  glassdoor: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after the JSON. No markdown. No explanation.

Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"glassdoor_rating":null,"glassdoor_reviews":null,"glassdoor_recommend":null,"glassdoor_wlb":null,"glassdoor_culture":null,"glassdoor_career_opp":null,"glassdoor_positive_outlook_pct":null,"glassdoor_interview_positive_pct":null,"glassdoor_themes":null}
glassdoor_rating: float (overall). glassdoor_reviews: int (total count). glassdoor_recommend: int (% who recommend). glassdoor_wlb: float (work-life balance sub-score). glassdoor_culture: float (culture & values sub-score). glassdoor_career_opp: float (career opportunities sub-score). glassdoor_positive_outlook_pct: int (% positive business outlook). glassdoor_interview_positive_pct: int (% positive interview experience). glassdoor_themes: CSV of 3-5 culture themes.
Extract from SERP snippets only — do NOT visit Glassdoor directly.
IMPORTANT: Only return data for the Indian company. Discard any results for same-named companies in other countries.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} Glassdoor rating employee reviews career opportunities business outlook interview 2024 2025" — return glassdoor JSON from snippets for the Indian company ${co}.`
    },
    maxTokens: 1000,
    model: "claude-haiku-4-5-20251001",
  },

  funding: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with the character \`{\` and end with \`}\`. Do NOT write any introductory sentences, narrative text, synthesis, analysis, markdown headers, or code blocks. Output ONLY the raw JSON object — nothing else.

Startup research analyst. Do up to 2 web searches to find comprehensive funding history for the specified Indian startup.
Search 1: target crunchbase.com or tracxn.com for structured round-by-round data.
Search 2 (if round details incomplete): target inc42.com or entrackr.com for Indian funding news.

CRITICAL: You MUST populate raw_fields with actual investor and round data found in search results. An empty raw_fields array is WRONG and unacceptable.
For every raw_field entry, set source_url to the actual page URL where the data was found (not null).

Return ONLY valid JSON in this exact structure. Every field_name in raw_fields must have a plain string raw_value — NO nested JSON, NO arrays:
{
  "total_raised_usd_m": 200,
  "last_round_type": "Series D",
  "last_round_date": "2023-08",
  "last_round_size_inr_cr": 1660,
  "raw_fields": [
    {"field_name":"round_count","field_pack":"funding","applicability":"applicable","raw_value":"5","data_type":"numeric","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9},
    {"field_name":"lead_investor","field_pack":"funding","applicability":"applicable","raw_value":"Nexus Venture Partners","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9},
    {"field_name":"investor_1_name","field_pack":"funding","applicability":"applicable","raw_value":"Nexus Venture Partners","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9},
    {"field_name":"investor_1_tier","field_pack":"funding","applicability":"applicable","raw_value":"tier1","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.85},
    {"field_name":"round_1_type","field_pack":"funding","applicability":"applicable","raw_value":"Series D","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9},
    {"field_name":"round_1_date","field_pack":"funding","applicability":"applicable","raw_value":"2023-08","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9},
    {"field_name":"round_1_amount_usd_m","field_pack":"funding","applicability":"applicable","raw_value":"200","data_type":"numeric","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9},
    {"field_name":"round_1_lead","field_pack":"funding","applicability":"applicable","raw_value":"Nexus Venture Partners","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9},
    {"field_name":"round_1_investors","field_pack":"funding","applicability":"applicable","raw_value":"Nexus Venture Partners, Accel, Tiger Global","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/organization/idfy","confidence":0.9}
  ]
}

Required raw_fields (ALL must have field_pack="funding"):
- round_count: total number of funding rounds as a string (e.g. "5")
- lead_investor: lead investor of the most recent round
- investor_1_name through investor_5_name: top investors by prominence
- investor_1_tier through investor_5_tier:
    "tier1" = Sequoia/Accel/Tiger Global/SoftBank/Lightspeed/Matrix/Nexus/Elevation/SAIF/Kalaari/Blume/Stellaris/Peak XV/General Atlantic/Warburg Pincus/KKR/Temasek
    "tier2" = other institutional VCs and CVCs
    "angel" = individual angels
    "govt" = government schemes (SIDBI, DPIIT, etc.)
- round_1_type through round_5_type: "Angel"|"Pre-Seed"|"Seed"|"Series A"|"Series B"|"Series C"|"Series D"|"Pre-IPO"|"IPO" — most recent first
- round_1_date through round_5_date: "YYYY-MM" format
- round_1_amount_usd_m through round_5_amount_usd_m: amount in USD millions as a plain number string
- round_1_lead through round_5_lead: lead investor name for each round
- round_1_investors through round_5_investors: all investors comma-separated as a single string

Currency rules: ₹85 Cr ≈ $1M. Always convert INR to USD for amount_usd_m. Never return null for amount just because it is in INR.
last_round_type must be one of: Angel|Pre-Seed|Seed|Series A|Series B|Series C|Series D|Pre-IPO|IPO
Only add rounds that you actually found in search results. Add as many rounds as you find (up to 5). If a field is truly unknown after searching, set applicability="unknown" and raw_value=null.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      return `Search: "${co} ${cname}${sector} funding rounds investors site:crunchbase.com OR site:tracxn.com OR site:inc42.com OR site:entrackr.com"\nReturn complete round-by-round funding history and investor list as JSON for the Indian company ${co}.`
    },
    maxTokens: 7000,
    maxSearches: 2,
  },

  products: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after the JSON. No markdown. No explanation.

Startup research analyst. Do exactly 1 web search targeting the company's own website or product pages. You MUST return a JSON object regardless of search results.
Return ONLY: {"raw_fields":[{"field_name":"","field_pack":"products","applicability":"applicable","raw_value":"","source_type":"web","source_url":"https://actual-url-found.com","confidence":0.85}]}
Set source_url to the actual page URL where data was found — never null.

Capture these field_names (field_pack must be "products" for all):
- product_count: total number of distinct products/solutions (string number)
- product_1_name through product_5_name: product names, most prominent first
- product_1_description through product_5_description: one-sentence description of each product
- product_1_type through product_5_type: B2B|B2C|B2B2C for each product
- has_api: yes/no — does the company offer a developer API
- has_mobile_app: yes/no
- has_technical_moat: yes/no — followed by a brief reason in parentheses
- patent_count: number of patents filed or granted (string number, "0" if none found)
- integrations_count: number of third-party integrations or partners listed (string number)
- pricing_model: subscription|usage|freemium|one_time|enterprise|mixed
- moat_type: proprietary_data|network_effects|switching_cost|regulatory_moat|deep_tech|brand|none

Only capture products 2–5 if they actually exist. If a field is unknown, set applicability="unknown" and raw_value=null.
IMPORTANT: Search specifically for the Indian company's products. Discard results for same-named companies elsewhere.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      const siteHint = ctx?.website ? ` site:${new URL(ctx.website).hostname}` : ""
      return `Search: "${co} ${cname}${sector} products solutions features API integrations patents platform${siteHint}" — return products raw_fields JSON for the Indian startup ${co}.`
    },
    maxTokens: 3000,
    maxSearches: 2,
  },

  regulatory: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after the JSON. No markdown. No explanation.

Startup research analyst. Do up to 2 web searches targeting MCA registry sources.
Search 1: target zaubacorp.com or tofler.in for CIN and incorporation details.
Search 2 (if details incomplete): try mca.gov.in or tofler.in for registered address and capital.

Return this exact JSON structure — raw_fields MUST be populated with every field you find:
{
  "cin": "U74900MH2011PTC291275",
  "legal_name": "Baldor Technologies Private Limited",
  "raw_fields": [
    {"field_name":"incorporation_date","field_pack":"regulatory","applicability":"applicable","raw_value":"2011-05-31","data_type":"date","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.95},
    {"field_name":"registered_state","field_pack":"regulatory","applicability":"applicable","raw_value":"Maharashtra","data_type":"text","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.95},
    {"field_name":"mca_status","field_pack":"regulatory","applicability":"applicable","raw_value":"Active","data_type":"text","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.95},
    {"field_name":"authorized_capital_cr","field_pack":"regulatory","applicability":"applicable","raw_value":"11.59","data_type":"numeric","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.9},
    {"field_name":"paid_up_capital_cr","field_pack":"regulatory","applicability":"applicable","raw_value":"8.71","data_type":"numeric","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.9},
    {"field_name":"registered_address","field_pack":"regulatory","applicability":"applicable","raw_value":"8th Floor, Skyline Icon, Andheri-Kurla Road, Marol Andheri East, Mumbai 400059","data_type":"text","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.85},
    {"field_name":"roc","field_pack":"regulatory","applicability":"applicable","raw_value":"RoC-Mumbai","data_type":"text","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.9},
    {"field_name":"last_agm_date","field_pack":"regulatory","applicability":"applicable","raw_value":"2025-09-18","data_type":"date","source_type":"web","source_url":"https://www.zaubacorp.com/company/BALDOR-TECHNOLOGIES-PRIVATE-LIMITED/U74900MH2011PTC291275","confidence":0.85},
    {"field_name":"entity_1_name","field_pack":"regulatory","applicability":"applicable","raw_value":"IDfy","data_type":"text","source_type":"web","source_url":"https://idfy.com","confidence":0.95},
    {"field_name":"entity_1_type","field_pack":"regulatory","applicability":"applicable","raw_value":"brand","data_type":"text","source_type":"web","source_url":"https://idfy.com","confidence":0.95},
    {"field_name":"entity_1_description","field_pack":"regulatory","applicability":"applicable","raw_value":"Core identity verification and KYC platform","data_type":"text","source_type":"web","source_url":"https://idfy.com","confidence":0.9},
    {"field_name":"entity_2_name","field_pack":"regulatory","applicability":"applicable","raw_value":"CrimeCheck","data_type":"text","source_type":"web","source_url":"https://crimecheck.idfy.com","confidence":0.9},
    {"field_name":"entity_2_type","field_pack":"regulatory","applicability":"applicable","raw_value":"brand","data_type":"text","source_type":"web","source_url":"https://crimecheck.idfy.com","confidence":0.9},
    {"field_name":"entity_2_description","field_pack":"regulatory","applicability":"applicable","raw_value":"Employee background screening and verification brand","data_type":"text","source_type":"web","source_url":"https://crimecheck.idfy.com","confidence":0.85},
    {"field_name":"entity_3_name","field_pack":"regulatory","applicability":"applicable","raw_value":"Privy","data_type":"text","source_type":"web","source_url":"https://privy.idfy.com","confidence":0.85},
    {"field_name":"entity_3_type","field_pack":"regulatory","applicability":"applicable","raw_value":"brand","data_type":"text","source_type":"web","source_url":"https://privy.idfy.com","confidence":0.85},
    {"field_name":"entity_3_description","field_pack":"regulatory","applicability":"applicable","raw_value":"Consumer-facing privacy and consent management product","data_type":"text","source_type":"web","source_url":"https://privy.idfy.com","confidence":0.8}
  ]
}

CIN format: [U/L][5-digit NIC][2-letter state][4-digit year][PTC/OPC/LLC][6-digit number] — exactly 21 characters.
Entity fields to capture (field_pack="regulatory"): entity_1_name through entity_6_name — the operating and legal corporate structure only. For each: entity_N_type and entity_N_description (one sentence on what this entity does or its role in the group). Only capture entities you actually found evidence for. STRICT: never output placeholder names.
entity_N_type allowed values — pick exactly one:
- brand: a consumer/product brand operated by the legal entity (e.g. a product name or go-to-market brand distinct from the legal name)
- subsidiary: a legally separate company majority-owned by this startup
- holding_co: a holding or parent company that owns/controls the startup (majority stake, operational control) — NOT investors or VCs
- associate: a joint venture or minority-stake affiliate
- product_brand: a named product line or sub-brand
CRITICAL: investors, VCs, PE funds, angel investors, and financial shareholders are NEVER entities. Do not capture them under any type. Only capture the startup's own legal entities, brands, subsidiaries, and the holding company that directly owns it (if any).
Only return data for the Indian company — discard results for same-named entities elsewhere.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const entity = ctx?.legalName || co
      return `Search 1: "${entity} CIN incorporation site:zaubacorp.com OR site:tofler.in" — find MCA registration, CIN, incorporation date, registered address, authorized capital, paid-up capital for the legal entity.\nSearch 2 (if address/capital not found): "${entity} registered address capital site:tofler.in OR site:mca.gov.in" — return full regulatory JSON for ${co} (legal entity: ${entity}).`
    },
    maxTokens: 2500,
    maxSearches: 2,
  },

  signals: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after. No markdown. No explanation.

Startup research analyst. Do up to 2 web searches to find comprehensive financial signals for the specified Indian startup.
Search 1: target entrackr.com or inc42.com for multi-year revenue, financials, and named clients.
Search 2 (if revenue or financials not found in Search 1): broaden to site:economictimes.indiatimes.com OR site:business-standard.com OR site:moneycontrol.com OR site:thehindu.com for the same company.

CRITICAL: raw_fields MUST be populated. An empty raw_fields array is WRONG. Populate every field you find evidence for.

Return this exact JSON structure:
{
  "revenue_inr_cr": 191,
  "revenue_fy": "FY25",
  "revenue_yoy_pct": 31,
  "net_profit_inr_cr": 7.8,
  "is_profitable": true,
  "client_count": 500,
  "raw_fields": [
    {"field_name":"revenue_fy1_year","field_pack":"signals","applicability":"applicable","raw_value":"FY25","data_type":"text","source_type":"web","source_url":"https://entrackr.com/2025/10/idfy-fy25","confidence":0.9},
    {"field_name":"revenue_fy1_inr_cr","field_pack":"signals","applicability":"applicable","raw_value":"191","data_type":"numeric","source_type":"web","source_url":"https://entrackr.com/2025/10/idfy-fy25","confidence":0.9},
    {"field_name":"revenue_fy2_year","field_pack":"signals","applicability":"applicable","raw_value":"FY24","data_type":"text","source_type":"web","source_url":"https://entrackr.com/2024/10/idfy-fy24","confidence":0.9},
    {"field_name":"revenue_fy2_inr_cr","field_pack":"signals","applicability":"applicable","raw_value":"144","data_type":"numeric","source_type":"web","source_url":"https://entrackr.com/2024/10/idfy-fy24","confidence":0.9},
    {"field_name":"revenue_fy3_year","field_pack":"signals","applicability":"applicable","raw_value":"FY23","data_type":"text","source_type":"web","source_url":"https://entrackr.com/2023/10/idfy-fy23","confidence":0.85},
    {"field_name":"revenue_fy3_inr_cr","field_pack":"signals","applicability":"applicable","raw_value":"118","data_type":"numeric","source_type":"web","source_url":"https://entrackr.com/2023/10/idfy-fy23","confidence":0.85},
    {"field_name":"revenue_cagr_5yr_pct","field_pack":"signals","applicability":"applicable","raw_value":"54","data_type":"numeric","source_type":"web","source_url":"https://entrackr.com/2025/10/idfy-fy25","confidence":0.85},
    {"field_name":"client_1_name","field_pack":"signals","applicability":"applicable","raw_value":"HDFC Bank","data_type":"text","source_type":"web","source_url":"https://idfy.com/clients","confidence":0.9},
    {"field_name":"client_1_sector","field_pack":"signals","applicability":"applicable","raw_value":"BFSI","data_type":"text","source_type":"web","source_url":"https://idfy.com/clients","confidence":0.9},
    {"field_name":"award_1","field_pack":"signals","applicability":"applicable","raw_value":"Forbes Asia 100 To Watch 2023","data_type":"text","source_type":"web","source_url":"https://forbes.com/lists/asia100towatch","confidence":0.9},
    {"field_name":"award_2","field_pack":"signals","applicability":"applicable","raw_value":"Deloitte Technology Fast 50 India 2022","data_type":"text","source_type":"web","source_url":"https://deloitte.com","confidence":0.85},
    {"field_name":"volume_metric","field_pack":"signals","applicability":"applicable","raw_value":"500M+ annual verifications","data_type":"text","source_type":"web","source_url":"https://idfy.com","confidence":0.85},
    {"field_name":"market_share","field_pack":"signals","applicability":"applicable","raw_value":"~60% Video KYC market share India","data_type":"text","source_type":"web","source_url":"https://idfy.com","confidence":0.8},
    {"field_name":"latest_news_headline","field_pack":"signals","applicability":"applicable","raw_value":"IDfy raises Series F of $53M led by Neo Asset Management","data_type":"text","source_type":"web","source_url":"https://inc42.com/buzz/idfy-series-f","confidence":0.95},
    {"field_name":"latest_news_date","field_pack":"signals","applicability":"applicable","raw_value":"2026-02","data_type":"text","source_type":"web","source_url":"https://inc42.com/buzz/idfy-series-f","confidence":0.95},
    {"field_name":"ipo_signal","field_pack":"signals","applicability":"applicable","raw_value":"Blume Ventures called IDfy 'IPO-ready' at Series F — ₹256 Cr secondary component","data_type":"text","source_type":"web","source_url":"https://inc42.com/buzz/idfy-series-f","confidence":0.9},
    {"field_name":"key_quote_1_text","field_pack":"signals","applicability":"applicable","raw_value":"We are profitable and cashflow positive. We do not need cash to run the core business.","data_type":"text","source_type":"web","source_url":"https://inc42.com/buzz/idfy-series-f","confidence":0.9},
    {"field_name":"key_quote_1_author","field_pack":"signals","applicability":"applicable","raw_value":"Ashok Hariharan, Co-Founder & CEO","data_type":"text","source_type":"web","source_url":"https://inc42.com/buzz/idfy-series-f","confidence":0.9}
  ]
}

Required raw_fields — populate ALL you find evidence for (field_pack="signals" for all):
FINANCIALS: revenue_fy1_year through revenue_fy6_year (label e.g. "FY25"), revenue_fy1_inr_cr through revenue_fy6_inr_cr (number as string), revenue_cagr_5yr_pct, fy_next_target_inr_cr (next year revenue target if mentioned)
CLIENTS: client_1_name through client_5_name, client_1_sector through client_5_sector (sector e.g. "BFSI", "Insurance", "E-commerce", "Gaming")
AWARDS: award_1 through award_5 (name + year in one string)
SIGNALS: latest_news_headline, latest_news_date (YYYY-MM), expansion_target_market, volume_metric (operational scale e.g. "500M verifications/yr"), market_share (e.g. "60% Video KYC India"), ipo_signal (IPO/pre-IPO language if any)
PARTNERSHIPS (structured — capture all you find, up to 8): partnership_1_partner through partnership_8_partner (company/org name), partnership_1_category through partnership_8_category (e.g. "Tier-1 bank", "Global payments", "Consumer e-commerce"), partnership_1_usecase through partnership_8_usecase (what IDfy does for them), partnership_1_signal through partnership_8_signal (strength of evidence — quote, event, case study). Keep partnership_1 (flat string) as a fallback if structured not possible.
QUOTES: key_quote_1_text (most insightful founder/investor quote found), key_quote_1_author, key_quote_2_text, key_quote_2_author

Only include years/clients/awards you actually found. Do not fabricate data.
IMPORTANT: Only report data for the Indian company. Discard same-named companies elsewhere.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      return `Search 1: "${co} ${cname}${sector} revenue FY25 FY24 FY23 financials growth clients awards site:entrackr.com OR site:inc42.com OR site:yourstory.com"\nIf revenue/financials not found, Search 2: "${co} ${cname} revenue annual report financials 2024 2025 site:economictimes.indiatimes.com OR site:business-standard.com OR site:moneycontrol.com"\nReturn complete signals JSON for the Indian company ${co}.`
    },
    maxSearches: 2,
    maxTokens: 7000,
  },

  youtube: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after the JSON. No markdown. No explanation.

Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
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

  linkedin_founder: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after the JSON. No markdown. No explanation.

Startup research analyst. Do exactly 1 web search on LinkedIn. Return ONLY valid JSON:
{"linkedin":[{"pass":8,"author_name":null,"author_org":null,"author_role":null,"signal_type":"","post_text":null,"post_url":null,"post_date":null,"confidence":0.85}]}
signal_type: founder_traction_claim|hiring_signal|partnership_announcement|product_launch|culture_post
Capture up to 4 posts written BY the founder on LinkedIn. Summarise each post_text in 1–2 sentences with any numbers or claims. Only include posts about the Indian company.`,
    user: (co, _country, ctx) => {
      const founderQuery = ctx?.founderName ? `"${ctx.founderName}" ${co}` : `"${co}" founder`
      return `Search: "${founderQuery} site:linkedin.com" — return linkedin signals JSON for posts written by the founder of the Indian company ${co}.`
    },
    maxTokens: 1200,
    maxSearches: 1,
  },

  linkedin_company: {
    system: `CRITICAL OUTPUT FORMAT: Your response MUST begin with \`{\` and end with \`}\`. No text before or after the JSON. No markdown. No explanation.

Startup research analyst. Do exactly 1 web search on LinkedIn. Return ONLY valid JSON:
{"linkedin":[{"pass":9,"author_name":null,"author_org":null,"author_role":null,"signal_type":"","post_text":null,"post_url":null,"post_date":null,"confidence":0.85}]}
signal_type: investor_validation|hiring_signal|partnership_announcement|product_launch|culture_post
Capture up to 4 posts from LinkedIn SERP snippets — investor posts, company page announcements, third-party mentions. Summarise each post_text in 1–2 sentences with any numbers or claims. Only include posts about the Indian company.`,
    user: (co, country, _ctx) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} site:linkedin.com investment partnership announcement hiring 2024 2025" — return linkedin signals JSON for third-party mentions of the Indian company ${co}.`
    },
    maxTokens: 1200,
    maxSearches: 1,
  },
}

// ── Helpers ───────────────────────────────────────────────────────

// Promise.race-based timeout. Aborts the controller on timeout so in-flight fetches are cancelled.
function raceTimeout<T>(promise: Promise<T>, ms: number, controller?: AbortController): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => {
      controller?.abort()
      resolve(null)
    }, ms)),
  ])
}

function parseJson(text: string): Record<string, unknown> | null {
  text = text.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, "$1")
  text = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/g, "")
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
  model = "claude-sonnet-4-6",
  abortSignal?: AbortSignal
): Promise<{ text: string; tokensIn: number; tokensOut: number } | null> {
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

  let totalTokensIn = 0
  let totalTokensOut = 0

  for (let i = 0; i < 5; i++) {
    if (abortSignal?.aborted) return null

    // Per-fetch budget: remaining wall-clock minus 8s buffer, capped at 110s per call.
    // 110s accommodates 7000-token synthesis even at ~64 tok/s; waves give each batch a fresh 140s window.
    const perFetchMs = Math.max(Math.min(110_000, deadlineMs - Date.now() - 8_000), 5_000)

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
    totalTokensIn += data.usage?.input_tokens ?? 0
    totalTokensOut += data.usage?.output_tokens ?? 0

    if (data.stop_reason === "end_turn" || data.stop_reason === "stop_sequence") {
      console.log(`[tokens] model=${model} in=${totalTokensIn} out=${totalTokensOut} limit=${maxTokens}`)
      const text = (data.content as { type: string; text?: string }[])
        .filter(b => b.type === "text")
        .map(b => b.text || "")
        .join("")
      return { text, tokensIn: totalTokensIn, tokensOut: totalTokensOut }
    }

    // Extract partial text even on max_tokens — JSON may still be parseable
    if (data.stop_reason === "max_tokens") {
      console.log(`[tokens] TRUNCATED model=${model} in=${totalTokensIn} out=${totalTokensOut} limit=${maxTokens}`)
      const partial = (data.content as { type: string; text?: string }[])
        .filter(b => b.type === "text")
        .map(b => b.text || "")
        .join("")
      if (partial.trim()) return { text: partial, tokensIn: totalTokensIn, tokensOut: totalTokensOut }
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
  // Correct stage misclassification based on total funding raised.
  // The overview pass may under-classify a late-stage company on sparse SERP data.
  let stage = merged.auto_stage || "seed"
  const raisedUsd = merged.total_raised_usd_m || 0
  if (raisedUsd >= 100 && (stage === "pre_seed" || stage === "seed" || stage === "series_a")) stage = "series_b_plus"
  else if (raisedUsd >= 20 && (stage === "pre_seed" || stage === "seed")) stage = "series_a"
  else if (raisedUsd >= 5 && stage === "pre_seed") stage = "seed"

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

  // dim_capital (0-100) — tier from raw_fields first, then fall back to total raised
  let dimCapital = 10
  const tier = fm["investor_1_tier"] || ""
  if (tier === "tier1") dimCapital = 90
  else if (tier === "tier2") dimCapital = 75
  else if (tier === "angel") dimCapital = 45
  else if (tier === "govt") dimCapital = 35
  else if (raisedUsd >= 100) dimCapital = 85
  else if (raisedUsd >= 30) dimCapital = 70
  else if (raisedUsd >= 10) dimCapital = 55
  else if (raisedUsd > 0) dimCapital = 35

  // dim_product (0-100)
  let dimProduct = 30
  if ((fm["has_technical_moat"] || "").startsWith("yes")) dimProduct += 30
  if (fm["has_api"] === "yes") dimProduct += 10
  if (fm["has_mobile_app"] === "yes") dimProduct += 10
  if (parseInt(fm["patent_count"] || "0") > 0) dimProduct += 10
  if (parseInt(fm["product_count"] || "0") > 1) dimProduct += 10

  // dim_market (0-100) — default moderate; most Indian SaaS/BFSI/D2C have large TAMs
  const dimMarket = 55

  // dim_momentum (0-100) — check both flat partnership_1 and structured partnership_1_partner
  let dimMomentum = 15
  if (fm["award_1"]) dimMomentum += 20
  if (fm["partnership_1"] || fm["partnership_1_partner"]) dimMomentum += 15
  if (fm["latest_news_headline"]) dimMomentum += 10

  const composite = Math.round(
    dimFounder * wf + dimTraction * wt + dimCapital * wc +
    dimProduct * wp + dimMarket * wm + dimMomentum * wmo
  )

  // Dynamic applicable fields: count raw_fields that are applicable or unknown, plus key scalars
  const allRaw = merged.raw_fields || []
  const fieldsNotApplicable = allRaw.filter(f => f.applicability === "not_applicable").length
  const fieldsApplicable = Math.max(20, allRaw.length - fieldsNotApplicable + 4)
  const fieldsCollected = Object.keys(fm).length +
    (rev ? 1 : 0) + (raisedUsd ? 1 : 0) +
    (merged.glassdoor_rating ? 1 : 0) + (merged.team_size ? 1 : 0)
  const fieldsUnknown = Math.max(0, fieldsApplicable - fieldsCollected - fieldsNotApplicable)
  const dq = Math.round(Math.min(95, (fieldsCollected / fieldsApplicable) * 100))

  // ── Universal Ratios ──────────────────────────────────────────────
  const foundedMs = merged.founded_date ? new Date(merged.founded_date).getTime() : 0
  const monthsOp  = foundedMs > 0 ? Math.max(1, (Date.now() - foundedMs) / (30.44 * 24 * 3600 * 1000)) : 0
  const raisedInr = raisedUsd * 83  // approx INR Cr

  let productSurface = 0
  for (let i = 1; i <= 6; i++) { if (fm[`product_${i}_name`]) productSurface++ }

  // Revenue CAGR from multi-year raw_fields (best available window, up to 3yr)
  const fy1 = parseFloat(fm["revenue_fy1_inr_cr"] || "0")
  const fy2 = parseFloat(fm["revenue_fy2_inr_cr"] || "0")
  const fy3 = parseFloat(fm["revenue_fy3_inr_cr"] || "0")
  const fy4 = parseFloat(fm["revenue_fy4_inr_cr"] || "0")
  let rRevenueCagr: number | undefined
  if (fy1 > 0 && fy4 > 0 && fy1 !== fy4) {
    rRevenueCagr = Math.round(((fy1 / fy4) ** (1 / 3) - 1) * 1000) / 10  // 3yr CAGR
  } else if (fy1 > 0 && fy3 > 0 && fy1 !== fy3) {
    rRevenueCagr = Math.round(((fy1 / fy3) ** (1 / 2) - 1) * 1000) / 10  // 2yr CAGR
  } else if (fy1 > 0 && fy2 > 0 && fy1 !== fy2) {
    rRevenueCagr = Math.round((fy1 / fy2 - 1) * 1000) / 10               // 1yr YoY
  } else if (merged.revenue_yoy_pct) {
    rRevenueCagr = merged.revenue_yoy_pct                                  // fallback scalar
  }

  // Burn Multiple: lifetime capital deployed ÷ annual revenue (lower = more efficient)
  const rBurnMultiple = (rev && raisedInr > 0)
    ? Math.round(raisedInr / rev * 10) / 10 : undefined

  // Rev per Head: revenue in INR Lakhs per employee (operational leverage)
  const rRevPerHead = (rev && merged.team_size && merged.team_size > 0)
    ? Math.round(rev * 100 / merged.team_size * 10) / 10 : undefined

  // ACV Proxy: revenue in INR Lakhs per client (B2B enterprise depth)
  const rACV = (rev && merged.client_count && merged.client_count > 0)
    ? Math.round(rev * 100 / merged.client_count * 10) / 10 : undefined

  // Round Cadence: funding rounds per year (fundraising frequency)
  const roundCount = parseInt(fm["round_count"] || "0")
  const rRoundCadence = (roundCount > 0 && monthsOp > 0)
    ? Math.round(roundCount / (monthsOp / 12) * 10) / 10 : undefined

  // Last Round Age: months since last close (capital freshness)
  const lastRoundMs = merged.last_round_date ? new Date(merged.last_round_date).getTime() : 0
  const rLastRoundAge = lastRoundMs > 0
    ? Math.round((Date.now() - lastRoundMs) / (30.44 * 24 * 3600 * 1000)) : undefined

  // Investor Tier: 1–5 ordinal (5=Tier 1, 4=Tier 2, 3=Angel, 2=Govt, 1=other-backed)
  const rInvestorQuality = tier === "tier1" ? 5 : tier === "tier2" ? 4 : tier === "angel" ? 3
    : tier === "govt" ? 2 : raisedUsd > 0 ? 1 : undefined

  // Product Lines: distinct product families found
  const rProductSurface = productSurface > 0 ? productSurface : undefined

  // Founder Depth: nuanced 0–10 from domain tenure + track record + pedigree
  let founderDepth = 3
  const domainYrs = parseInt(fm["founder_1_domain_years"] || "0")
  if (domainYrs >= 10) founderDepth = 8
  else if (domainYrs >= 7) founderDepth = 7
  else if (domainYrs >= 5) founderDepth = 6
  else if (domainYrs >= 3) founderDepth = 5
  if (fm["founder_1_prior_exit"]    === "yes") founderDepth = Math.min(10, founderDepth + 2)
  if (fm["founder_1_prior_startup"] === "yes") founderDepth = Math.min(10, founderDepth + 1)
  if (edu.includes("iit") || edu.includes("iim") || edu.includes("isb")) founderDepth = Math.min(10, founderDepth + 1)
  const rFounderDepth = founderDepth

  // Capital Productivity: annual revenue as % of total capital raised (higher = efficient)
  const rCapitalProductivity = (rev && raisedInr > 0)
    ? Math.round(rev / raisedInr * 1000) / 10 : undefined

  return {
    scores: {
      stage, dim_founder: dimFounder, dim_traction: dimTraction, dim_capital: dimCapital,
      dim_product: dimProduct, dim_market: dimMarket, dim_momentum: dimMomentum,
      w_founder: wf, w_traction: wt, w_capital: wc, w_product: wp, w_market: wm, w_momentum: wmo,
      composite_score: composite,
      fields_applicable: fieldsApplicable, fields_collected: fieldsCollected,
      fields_unknown: fieldsUnknown, fields_not_applicable: fieldsNotApplicable, data_quality_pct: dq,
      r_traction_velocity:    rRevenueCagr,
      r_funding_velocity:     rBurnMultiple,
      r_capital_efficiency:   rRevPerHead,
      r_team_leverage:        rACV,
      r_recognition_momentum: rRoundCadence,
      r_valuation_arr_mult:   rLastRoundAge,
      r_investor_quality:     rInvestorQuality,
      r_product_surface:      rProductSurface,
      r_founder_mkt_fit:      rFounderDepth,
      r_round_up_ratio:       rCapitalProductivity,
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
  // Seed merged with pre-loaded DB data when resuming a failed job, so computeScores
  // has the full picture even if some passes are skipped (already completed).
  let merged: Partial<StartupProfile> = {
    brand_name: req.company,
    hq_country: req.country,
    youtube: [],
    linkedin: [],
    raw_fields: [],
    ...(req.initialMerged || {}),
  }

  // Hard deadline: 140s — leaves 10s for DB cleanup before EdgeRuntime kills at 150s.
  const deadline = Date.now() + 140_000

  await req.onProgress?.(5, "Starting research")

  // Three batches, passes within each batch run in parallel.
  // Batch 1: core identity. Batch 2: deeper data. Batch 3: media signals.
  // raceTimeout wraps every claudeCall so hanging passes are capped at the budget.
  const PASS_BATCHES: PassName[][] = [
    ["overview", "founders", "glassdoor"],
    ["funding", "products", "regulatory", "youtube"],
    ["signals"],
    ["linkedin_founder", "linkedin_company"],
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
        const budgetMs = Math.max(Math.min(130_000, deadline - Date.now() - 8_000), 5_000)
        // Pass merged context — batch-2 uses industry/stage/website; batch-3 uses founderName
        const founderName = merged.raw_fields?.find(f => f.field_name === "founder_1_name")?.raw_value
        const ctx = { industry: merged.auto_industry, stage: merged.auto_stage, founderName, website: merged.website, legalName: merged.legal_name }
        const controller = new AbortController()
        let apiError: string | null = null
        const result = await raceTimeout(
          claudeCall(apiKey, spec.system, spec.user(req.company, req.country, ctx), spec.maxTokens, spec.maxSearches ?? 1, deadline, spec.model, controller.signal)
            .catch(e => { apiError = String(e); console.warn(`[${req.jobId}] ${passName} claudeCall error: ${e}`); return null }),
          budgetMs,
          controller
        )
        if (result === null) {
          const errMsg = apiError ? `API error: ${apiError}` : "No response from API (budget exhausted)"
          return { passName, partial: null as Partial<StartupProfile> | null, error: errMsg, tokensIn: 0, tokensOut: 0 }
        }
        if (result.text.trim() === "") {
          return { passName, partial: null as Partial<StartupProfile> | null, error: "Empty response from API", tokensIn: result.tokensIn, tokensOut: result.tokensOut }
        }
        const obj = parseJson(result.text)
        if (!obj) {
          return { passName, partial: null, error: `JSON parse failed: ${result.text.slice(0, 100)}`, tokensIn: result.tokensIn, tokensOut: result.tokensOut }
        }
        return { passName, partial: obj as Partial<StartupProfile>, error: null, tokensIn: result.tokensIn, tokensOut: result.tokensOut }
      } catch (e) {
        return { passName, partial: null, error: e instanceof Error ? e.message : String(e), tokensIn: 0, tokensOut: 0 }
      }
    }))

    // Process results sequentially so merges and DB writes don't interleave.
    // overview is always first in its batch, ensuring startupId is set before
    // founders/glassdoor callbacks run.
    for (const { passName, partial, error, tokensIn, tokensOut } of results) {
      if (error || !partial) {
        passesStatus[passName] = { status: "failed", completed_at: new Date().toISOString(), error: error || "Unknown" }
        console.warn(`[${req.jobId}] Pass ${passName} failed: ${error}`)
        await req.onPassStatusUpdate?.({ ...passesStatus })
      } else {
        merged = mergePartial(merged, partial)
        passesStatus[passName] = { status: "completed", completed_at: new Date().toISOString(), tokens_in: tokensIn, tokens_out: tokensOut }
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
    auto_tagline:          merged.auto_tagline,
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
    glassdoor_rating:               merged.glassdoor_rating,
    glassdoor_reviews:              merged.glassdoor_reviews,
    glassdoor_recommend:            merged.glassdoor_recommend,
    glassdoor_wlb:                  merged.glassdoor_wlb,
    glassdoor_culture:              merged.glassdoor_culture,
    glassdoor_career_opp:           merged.glassdoor_career_opp,
    glassdoor_positive_outlook_pct: merged.glassdoor_positive_outlook_pct,
    glassdoor_interview_positive_pct: merged.glassdoor_interview_positive_pct,
    glassdoor_themes:               merged.glassdoor_themes,
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
