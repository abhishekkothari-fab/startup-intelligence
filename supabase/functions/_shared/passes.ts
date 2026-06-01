// supabase/functions/_shared/passes.ts

import type { PassName } from "./types.ts"

interface PassSpec {
  system: string
  user: (co: string, country: string, ctx?: { industry?: string; stage?: string; founderName?: string; website?: string; legalName?: string }) => string
  maxTokens: number
  maxSearches?: number  // defaults to 1
  model?: string  // defaults to claude-sonnet-4-6; use Haiku for lighter passes
  timeoutMs?: number  // per-pass wall-clock cap; defaults to 140_000
}

export const PASS_SPECS: Record<PassName, PassSpec> = {
  overview: {
    system: `JSON only. Start with { end with }.

Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"brand_name":"","legal_name":null,"website":null,"founded_date":null,"hq_city":null,"hq_country":"IN","auto_stage":"","auto_industry":"","auto_industry_sub":"","auto_region":"","auto_biz_model":"","auto_entity_pack":"base","team_size":null,"auto_tagline":null}
auto_stage: pre_seed|seed|series_a|series_b_plus|growth
auto_industry: BFSI|AI_Infra|D2C|Health|Logistics|EdTech_HRTech
auto_region: metro_t1(Mumbai/Delhi/Bengaluru)|metro_t2(Pune/Hyd/Chennai/Ahmedabad)|non_metro
auto_biz_model: enterprise_saas|usage|d2c|nbfc|deeptech_ip
auto_entity_pack: base OR base|saas OR base|d2c|consumer OR base|nbfc|lending
auto_tagline: one short punchy sentence (max 10 words) describing what the company does — e.g. "India's trust infrastructure company" or "AI-native compliance platform for Indian banks". Do NOT use marketing language like "revolutionizing" — use precise domain terms.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} startup company overview founders profile" — return overview JSON for the Indian company named ${co}.`
    },
    maxTokens: 1500,
    model: "claude-sonnet-4-6",
    timeoutMs: 90_000,
  },

  founders: {
    system: `JSON only. Start with { end with }.

Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON:
{"raw_fields":[{"field_name":"","field_pack":"base","applicability":"applicable","raw_value":"","source_type":"web","source_url":null,"confidence":0.85}]}
Capture these field_names (field_pack="base" for all):
Founders: founder_1_name, founder_1_role (title), founder_1_bio (2–3 sentence career narrative), founder_1_education (IIT/IIM/tier1/other — exact institution if known), founder_1_prior_startup (yes/no), founder_1_prior_exit (yes/no), founder_1_domain_years (number), founder_1_status (active/former), founder_1_linkedin_url, founder_1_is_iit_iim (yes/no). Repeat founder_2_*, founder_3_*, founder_4_* if they exist.
advisor_count (number), notable_advisors (comma-separated names).
CXO / non-founder C-suite: for each person capture cxo_N_name, cxo_N_role, cxo_N_background (one sentence: prior orgs + domain expertise — e.g. "Ex-Razorpay CTO; 14yr in payments infra"). Roles to capture: CPO, COO, CFO, CMO, CTO, Chief AI Officer, SVP, VP-level non-founders (up to cxo_6). Only real names; omit background if unknown.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} founders CEO CTO CPO COO CFO executive leadership team C-suite background education" — return founders and CXO raw_fields JSON for the Indian startup ${co}.`
    },
    maxTokens: 12000,
    maxSearches: 2,
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 120_000,
  },

  glassdoor: {
    system: `JSON only. Start with { end with }.

Startup research analyst. Do exactly 1 web search. Return ONLY valid JSON (null for unknown):
{"glassdoor_rating":null,"glassdoor_reviews":null,"glassdoor_recommend":null,"glassdoor_wlb":null,"glassdoor_culture":null,"glassdoor_career_opp":null,"glassdoor_positive_outlook_pct":null,"glassdoor_interview_positive_pct":null,"glassdoor_themes":null}
glassdoor_rating: float (overall). glassdoor_reviews: int (total count). glassdoor_recommend: int (% who recommend). glassdoor_wlb: float (work-life balance sub-score). glassdoor_culture: float (culture & values sub-score). glassdoor_career_opp: float (career opportunities sub-score). glassdoor_positive_outlook_pct: int (% positive business outlook). glassdoor_interview_positive_pct: int (% positive interview experience). glassdoor_themes: CSV of 3-5 culture themes.
Extract from SERP snippets — check both Glassdoor and AmbitionBox results. AmbitionBox (ambitionbox.com) is a primary source for Indian company ratings and often surfaces sub-scores not visible on Glassdoor snippets.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} employee rating reviews work culture career site:glassdoor.co.in OR site:ambitionbox.com" — return glassdoor JSON from snippets for the Indian company ${co}.`
    },
    maxTokens: 1000,
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 40_000,
  },

  funding: {
    system: `JSON only. Start with { end with }.

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
    {"field_name":"round_1_type","field_pack":"funding","applicability":"applicable","raw_value":"Series D","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/...","confidence":0.9},
    {"field_name":"investor_1_name","field_pack":"funding","applicability":"applicable","raw_value":"Nexus Venture Partners","data_type":"text","source_type":"web","source_url":"https://crunchbase.com/...","confidence":0.9}
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
    timeoutMs: 100_000,
  },

  products: {
    system: `JSON only. Start with { end with }.

Startup research analyst. Do up to 2 web searches. Search 1: target the company's own website or product pages. Search 2 (if product details are sparse): broaden to news/tech coverage of the company's product features.
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

Only capture products 2–5 if they actually exist. If a field is unknown, set applicability="unknown" and raw_value=null.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      const siteHint = ctx?.website ? ` site:${new URL(ctx.website).hostname}` : ""
      return `Search 1: "${co} ${cname}${sector} products features platform"${siteHint} — find product details on the company's own site.\nSearch 2 (if sparse): "${co} ${cname} product features API mobile app integrations" — return products raw_fields JSON for the Indian startup ${co}.`
    },
    maxTokens: 8000,
    maxSearches: 2,
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 90_000,
  },

  regulatory: {
    system: `JSON only. Start with { end with }.

Startup research analyst. Do up to 2 web searches targeting MCA registry sources.
Search 1: target zaubacorp.com or tofler.in for CIN and incorporation details.
Search 2 (if details incomplete): try mca.gov.in or tofler.in for registered address and capital.

Return this exact JSON structure — raw_fields MUST be populated with every field you find:
{
  "cin": "U74900MH2011PTC291275",
  "legal_name": "Baldor Technologies Private Limited",
  "raw_fields": [
    {"field_name":"incorporation_date","field_pack":"regulatory","applicability":"applicable","raw_value":"2011-05-31","data_type":"date","source_type":"web","source_url":"https://www.zaubacorp.com/...","confidence":0.95},
    {"field_name":"entity_1_name","field_pack":"regulatory","applicability":"applicable","raw_value":"IDfy","data_type":"text","source_type":"web","source_url":"https://idfy.com","confidence":0.95}
  ]
}

CIN format: [U/L][5-digit NIC][2-letter state][4-digit year][PTC/OPC/LLC][6-digit number] — exactly 21 characters.
Entity fields to capture (field_pack="regulatory"): entity_1_name through entity_6_name — the operating and legal corporate structure only. For each: entity_N_type and entity_N_description (one sentence on what this entity does or its role in the group). Only capture entities you actually found evidence for. STRICT: never output placeholder names.
entity_N_type: brand|subsidiary|holding_co|associate|product_brand. NEVER capture investors/VCs as entities — only the startup's own legal structure and brands.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const entity = ctx?.legalName || co
      return `Search 1: "${entity} CIN incorporation site:zaubacorp.com OR site:tofler.in OR site:tracxn.com" — find MCA registration, CIN, incorporation date, registered address, authorized capital, paid-up capital for the legal entity.\nSearch 2 (if address/capital not found): "${entity} registered address capital site:tofler.in OR site:mca.gov.in OR site:tracxn.com" — return full regulatory JSON for ${co} (legal entity: ${entity}).`
    },
    maxTokens: 4000,
    maxSearches: 2,
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 100_000,
  },

  signals: {
    system: `JSON only. Start with { end with }.

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
    {"field_name":"revenue_fy1_year","field_pack":"signals","applicability":"applicable","raw_value":"FY25","data_type":"text","source_type":"web","source_url":"https://entrackr.com/...","confidence":0.9},
    {"field_name":"client_1_name","field_pack":"signals","applicability":"applicable","raw_value":"HDFC Bank","data_type":"text","source_type":"web","source_url":"https://idfy.com/clients","confidence":0.9},
    {"field_name":"key_quote_1_text","field_pack":"signals","applicability":"applicable","raw_value":"We are profitable and cashflow positive.","data_type":"text","source_type":"web","source_url":"https://inc42.com/...","confidence":0.9}
  ]
}

Required raw_fields — populate ALL you find evidence for (field_pack="signals" for all):
FINANCIALS: revenue_fy1_year through revenue_fy6_year (label e.g. "FY25"), revenue_fy1_inr_cr through revenue_fy6_inr_cr (number as string), revenue_cagr_5yr_pct, fy_next_target_inr_cr (next year revenue target if mentioned)
CLIENTS: client_1_name through client_5_name, client_1_sector through client_5_sector (sector e.g. "BFSI", "Insurance", "E-commerce", "Gaming")
AWARDS: award_1 through award_5 (name + year in one string)
SIGNALS: latest_news_headline, latest_news_date (YYYY-MM), expansion_target_market, volume_metric (operational scale e.g. "500M verifications/yr"), market_share (e.g. "60% Video KYC India"), ipo_signal (IPO/pre-IPO language if any)
PARTNERSHIPS (structured — capture top 4 most significant): partnership_1_partner through partnership_4_partner (company/org name), partnership_1_category through partnership_4_category (e.g. "Tier-1 bank", "Global payments", "Consumer e-commerce"), partnership_1_usecase through partnership_4_usecase (what the company does for them), partnership_1_signal through partnership_4_signal (strength of evidence — quote, event, case study). Keep partnership_1 (flat string) as a fallback if structured not possible.
QUOTES: key_quote_1_text (most insightful founder/investor quote found), key_quote_1_author, key_quote_2_text, key_quote_2_author

Only include years/clients/awards you actually found. Do not fabricate data.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const sector = ctx?.industry ? ` ${ctx.industry}` : ""
      const siteHint = ctx?.website ? ` OR site:${new URL(ctx.website).hostname}` : ""
      return `Search 1: "${co} ${cname}${sector} revenue FY25 FY24 FY23 financials growth clients site:entrackr.com OR site:inc42.com OR site:yourstory.com"\nSearch 2: "${co}" award OR recognition OR winner OR ranked 2022 2023 2024 site:inc42.com OR site:yourstory.com OR site:linkedin.com${siteHint}\nReturn complete signals JSON for the Indian company ${co}.`
    },
    maxSearches: 2,
    maxTokens: 6000,
    timeoutMs: 120_000,
  },

  youtube: {
    system: `JSON only. Start with { end with }.

Startup research analyst. Do exactly 1 web search for YouTube videos featuring this company. Return ONLY valid JSON:
{"youtube":[{"video_title":"","video_url":null,"published_date":null,"video_type":"","channel_name":null,"is_own_channel":false,"key_quote":null,"confidence":0.9}]}
video_type: founder_on_camera|podcast_feature|product_demo|culture_content|news_coverage
Capture up to 8 videos. Extract video_url (full youtube.com/watch?v=XXXXXXXXXXX link where XXXXXXXXXXX is the exact 11-character video ID visible in the search result). CRITICAL: if you cannot see the actual 11-character video ID in the search result, set video_url to null — never guess or fabricate an ID. Extract published_date (YYYY-MM-DD if visible) and channel_name from search results.`,
    user: (co, country) => {
      const cname = country === "IN" ? "India" : country
      return `Search: "${co} ${cname} founder interview podcast youtube 2024 2025 site:youtube.com" — find YouTube videos featuring the Indian company ${co}. Include founder talks, product demos, news coverage, and podcast appearances.`
    },
    maxTokens: 3000,
    maxSearches: 1,
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 70_000,
  },

  linkedin: {
    system: `JSON only. Start with { end with }.

Startup research analyst. Do exactly 2 web searches:
Search 1: find public statements, quotes, and interviews by the company founder.
Search 2: find company announcements, milestones, partnerships, and expansion news.

Return ONLY valid JSON:
{"linkedin":[{"pass":8,"author_name":null,"author_org":null,"author_role":null,"signal_type":"","post_text":null,"post_url":null,"post_date":null,"confidence":0.85}]}
signal_type: founder_traction_claim|hiring_signal|partnership_announcement|product_launch|culture_post|investor_validation
Capture up to 8 signals total (mix of founder and company signals). Summarise each post_text in 1–2 sentences with any numbers or claims. Set pass=8 for all entries.`,
    user: (co, country, ctx) => {
      const cname = country === "IN" ? "India" : country
      const founderQuery = ctx?.founderName ? `"${ctx.founderName}"` : `"${co}" founder`
      return `Search 1: ${founderQuery} "${co}" statement quote tweet interview 2024 2025 site:x.com OR site:twitter.com OR site:inc42.com OR site:yourstory.com OR site:economictimes.indiatimes.com — find founder social signals.\nSearch 2: "${co}" ${cname} announcement milestone expansion partnership hiring 2024 2025 site:inc42.com OR site:yourstory.com OR site:entrackr.com OR site:economictimes.indiatimes.com OR site:business-standard.com — return combined social signals JSON for the Indian company ${co}.`
    },
    maxTokens: 3000,
    maxSearches: 2,
    model: "claude-haiku-4-5-20251001",
    timeoutMs: 90_000,
  },
}
