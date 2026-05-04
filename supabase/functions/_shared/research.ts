// supabase/functions/_shared/research.ts
// Shared research engine: calls claude-sonnet-4-6 with web_search tool
// Returns structured StartupProfile JSON

export interface ResearchRequest {
  company: string;
  country: string;
  jobId: string;
  onProgress?: (pct: number, note: string) => Promise<void>;
}

export interface StartupProfile {
  // Core
  brand_name: string;
  legal_name?: string;
  cin?: string;
  website?: string;
  founded_date?: string;
  hq_city?: string;
  hq_country: string;

  // Classification
  auto_stage: string;
  auto_industry: string;
  auto_industry_sub: string;
  auto_region: string;
  auto_biz_model: string;
  auto_entity_pack: string;

  // Financials
  revenue_inr_cr?: number;
  revenue_fy?: string;
  revenue_yoy_pct?: number;
  net_profit_inr_cr?: number;
  total_raised_usd_m?: number;
  last_round_type?: string;
  last_round_date?: string;
  last_round_size_inr_cr?: number;
  team_size?: number;
  client_count?: number;
  is_profitable?: boolean;

  // Scores
  scores: {
    stage: string;
    dim_founder: number;
    dim_traction: number;
    dim_capital: number;
    dim_product: number;
    dim_market: number;
    dim_momentum: number;
    w_founder: number;
    w_traction: number;
    w_capital: number;
    w_product: number;
    w_market: number;
    w_momentum: number;
    composite_score: number;
    fields_applicable: number;
    fields_collected: number;
    fields_unknown: number;
    fields_not_applicable: number;
    data_quality_pct: number;
    r_funding_velocity?: number;
    r_traction_velocity?: number;
    r_founder_mkt_fit?: number;
    r_recognition_momentum?: number;
    r_investor_quality?: number;
    r_product_surface?: number;
    r_capital_efficiency?: number;
    r_valuation_arr_mult?: number;
    r_team_leverage?: number;
    r_grant_equity_ratio?: number;
    r_round_up_ratio?: number;
    r_gnpa_pct?: number;
    r_nim_pct?: number;
    r_car_pct?: number;
    r_roe_pct?: number;
  };

  // Raw fields
  raw_fields: Array<{
    field_name: string;
    field_pack: string;
    applicability: "applicable" | "not_applicable" | "unknown";
    applicability_reason?: string;
    raw_value?: string;
    data_type?: string;
    source_type: string;
    source_url?: string;
    confidence?: number;
  }>;

  // YouTube (Pass 7)
  youtube: Array<{
    video_title: string;
    video_url?: string;
    published_date?: string;
    video_type: string;
    channel_name?: string;
    is_own_channel: boolean;
    key_quote?: string;
    signal_tags?: string[];
  }>;

  // LinkedIn (Passes 8 + 9)
  linkedin: Array<{
    pass: 8 | 9;
    author_name?: string;
    author_org?: string;
    author_role?: string;
    signal_type: string;
    post_text?: string;
    post_url?: string;
    post_date?: string;
    confidence: number;
  }>;

  // Glassdoor
  glassdoor_rating?: number;
  glassdoor_reviews?: number;
  glassdoor_recommend?: number;
  glassdoor_wlb?: number;
  glassdoor_culture?: number;
  glassdoor_themes?: string;
}

const SYSTEM_PROMPT = `You are a startup intelligence research analyst. Your job is to research a company across 9 passes of data collection, then return ALL findings as a single structured JSON object.

## Research passes to execute (use web_search for each):

PASS 1 — Company overview
- Search: "[Company] startup profile [country]"
- Search: "[Company] founded founders history"
- Sources: Crunchbase, Tracxn, YourStory, Inc42

PASS 2 — Founders & Glassdoor
- Search: "[Company] founders background MBA education"
- Search: "[Company] CEO CXO leadership team 2025 2026"
- Search: "[Company] Glassdoor rating reviews employees"
- Extract: glassdoor_rating (numeric), glassdoor_review_count, culture themes from SERP snippet only. Do NOT attempt to access Glassdoor directly.

PASS 3 — Funding
- Search: "[Company] funding rounds investors Series A B C"
- Search: "[Company] raised valuation 2024 2025 2026"
- Cross-reference: Crunchbase, Tracxn, TheKredible, VCCircle, Inc42

PASS 4 — Products
- Fetch company website directly for product pages
- Search: "[Company] products features API 2025"

PASS 5 — Regulatory (for Indian companies)
- Search: "[Company legal name] MCA CIN incorporation"
- Sources: Tofler, ZaubaCorp, FalconEbiz

PASS 6 — Strategic signals
- Search: "[Company] news 2025 2026 expansion partnership awards"
- Search: "[Company] IPO ready funding latest"

PASS 7 — YouTube
- Search: "[Company] site:youtube.com"
- Search: "[Company] [founder name] YouTube interview podcast"
- For each video found: capture title, URL, date, type (founder_on_camera/podcast_feature/product_demo/culture_content/news_coverage), channel name, is_own_channel

PASS 8 — LinkedIn founder posts (web search only, no scraping)
- Search: site:linkedin.com "[Founder Full Name]" "[Company]"
- Extract: traction claims, product announcements, hiring posts, founder philosophy, strategic themes

PASS 9 — LinkedIn company mentions (web search only, targeted)
- Search: site:linkedin.com "[Company]" "excited to announce" OR "partner" OR "portfolio company"
- Search: site:linkedin.com "[Company]" "invested" OR "proud to back"
- Extract: investor validation posts, client/partner testimonials, compliance milestone announcements

## Classification rules:

STAGE (first match wins):
- pre_idea: no equity, no grants, no live product
- pre_seed: no equity but product live or has grants
- seed: has Seed round
- series_a: last round = Series A
- series_b_plus: last round = Series B/C/D
- growth: last round = Pre-IPO, Series E+, or IPO

INDUSTRY: BFSI | AI_Infra | D2C | Health | Logistics | EdTech_HRTech

INDUSTRY_SUB: NBFC_Lending | VoiceAI_BFSI | IDP_BFSI | RegTech_Identity | CloudOptimisation | FastFashion_Denim | Skincare | FoodBev | DigitalHealth etc.

REGION: metro_t1 (Mumbai/Delhi/Bengaluru) | metro_t2 (Pune/Hyderabad/Chennai/Ahmedabad) | non_metro

BIZ_MODEL: enterprise_saas | usage | d2c | nbfc | deeptech_ip

ENTITY_PACK: base | base|saas | base|d2c|consumer | base|nbfc|lending

## Scoring weights by stage:
- pre_seed:   founder=0.35, traction=0.05, capital=0.15, product=0.20, market=0.15, momentum=0.10
- seed:       founder=0.25, traction=0.20, capital=0.20, product=0.20, market=0.10, momentum=0.05
- series_a:   founder=0.15, traction=0.30, capital=0.20, product=0.15, market=0.10, momentum=0.10
- series_b_plus: founder=0.10, traction=0.35, capital=0.20, product=0.15, market=0.10, momentum=0.10
- growth:     founder=0.05, traction=0.40, capital=0.15, product=0.15, market=0.15, momentum=0.10

## Dimension scoring (0–100):
dim_founder: IIT/IIM/equivalent (+20), prior startup (+20), prior exit (+20), domain ≥5yr (+20), tier-1 advisor (+10), known networks (+10)
dim_traction: revenue none=0, pilots=20, <1Cr=40, 1-10Cr=60, 10-50Cr=75, 50Cr+=90; cash-flow positive +10
dim_capital: Tier-1 VC (Sequoia/Accel/Matrix/Elevation)=90+, Tier-2 (Blume/3one4/Stellaris)=70-85, Angels/grants=30-50
dim_product: live product+30, technical moat+30, multiple products+20, patents+10, public demo+10
dim_market: TAM>$1Bn+30, regulatory tailwind+20, low competition+20, India-native+15, high growth+15
dim_momentum: global competition win+30, national win+20, tier-1 incubator+20, major press+15, Tracxn/CB inclusion+15

Unknown field penalty: -12% per applicable field with unknown value per dimension.

Composite = sum(dim_score × weight)

## Output format:
Return ONLY valid JSON matching the StartupProfile schema. No markdown, no explanation text, no preamble.
All monetary values in INR crore. Dates as YYYY-MM-DD strings. Confidence: 1.0=MCA/official, 0.9=tier1 media, 0.85=LinkedIn SERP, 0.7=aggregator, 0.5=inferred.`;

function mockProfile(company: string, country: string): StartupProfile {
  return {
    brand_name: company, legal_name: `${company} Pvt Ltd`, cin: "U72900MH2020PTC123456",
    website: `https://www.${company.toLowerCase().replace(/\s+/g,"")}.com`,
    founded_date: "2020-01-01", hq_city: "Mumbai", hq_country: country,
    auto_stage: "series_a", auto_industry: "Fintech", auto_industry_sub: "Payments",
    auto_region: "IN-West", auto_biz_model: "B2C", auto_entity_pack: "base",
    revenue_inr_cr: 42, revenue_fy: "FY24", revenue_yoy_pct: 35,
    net_profit_inr_cr: -8, total_raised_usd_m: 12, last_round_type: "Series A",
    last_round_date: "2023-06-01", last_round_size_inr_cr: 100,
    team_size: 120, client_count: 50000, is_profitable: false,
    glassdoor_rating: 3.8, glassdoor_reviews: 45, glassdoor_recommend: 72,
    glassdoor_wlb: 3.5, glassdoor_culture: 3.9, glassdoor_themes: ["fast-paced","good-tech"],
    scores: {
      stage: "series_a", dim_founder: 72, dim_traction: 65, dim_capital: 60,
      dim_product: 70, dim_market: 75, dim_momentum: 68,
      w_founder: 0.20, w_traction: 0.20, w_capital: 0.15,
      w_product: 0.15, w_market: 0.15, w_momentum: 0.15,
      composite_score: 69, fields_applicable: 40, fields_collected: 28,
      fields_unknown: 8, fields_not_applicable: 4, data_quality_pct: 70,
    },
    raw_fields: [
      { field_name: "revenue_inr_cr", field_pack: "base", applicability: "applicable",
        raw_value: "42", data_type: "number", source_type: "web",
        source_url: "https://entrackr.com/mock", confidence: 0.85 }
    ],
    youtube: [], linkedin: [],
  };
}

export async function researchStartup(req: ResearchRequest): Promise<StartupProfile> {
  if (Deno.env.get("MOCK_ANTHROPIC") === "true") {
    await req.onProgress?.(10, "[MOCK] Simulating research...");
    await new Promise(r => setTimeout(r, 2000));
    await req.onProgress?.(80, "[MOCK] Building profile...");
    await new Promise(r => setTimeout(r, 1000));
    return mockProfile(req.company, req.country);
  }

  const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not set");

  await req.onProgress?.(5, "Starting research");

  const userMessage = `Research this company and return the complete StartupProfile JSON:

Company: ${req.company}
Country: ${req.country}

Run all 9 passes. Collect as much data as possible. Return ONLY the JSON object — no markdown, no preamble.`;

  // Initial Claude call — runs all 9 passes using web_search tool
  let messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: userMessage }
  ];

  let finalJson: string | null = null;
  let iterations = 0;
  const MAX_ITERATIONS = 20;
  const DEADLINE = Date.now() + 300_000; // 5-minute hard deadline

  await req.onProgress?.(10, "Running research passes 1–6");

  while (!finalJson && iterations < MAX_ITERATIONS) {
    if (Date.now() > DEADLINE) {
      throw new Error("Research timed out after 5 minutes — partial data not saved. Try again.");
    }
    iterations++;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        tools: [{
          type: "web_search_20250305",
          name: "web_search"
        }],
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${err}`);
    }

    const data = await response.json();

    if (data.stop_reason === "end_turn") {
      const textBlocks = data.content.filter((b: { type: string }) => b.type === "text");
      if (textBlocks.length > 0) {
        const rawText = textBlocks.map((b: { text: string }) => b.text).join("");
        // Strip markdown fences if present
        const stripped = rawText.replace(/^```json\s*/m, "").replace(/^```\s*/m, "").replace(/```\s*$/m, "").trim();
        // Extract the outermost JSON object — ignore any prose before/after
        const start = stripped.indexOf("{");
        const end = stripped.lastIndexOf("}");
        finalJson = start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
      }
      break;
    }

    if (data.stop_reason === "tool_use") {
      // Progress updates based on which pass we're likely on
      const pct = Math.min(20 + (iterations * 6), 75);
      const passNote = iterations <= 3 ? "passes 1–3 (overview, founders, funding)" :
                       iterations <= 6 ? "passes 4–6 (products, regulatory, signals)" :
                       "passes 7–9 (YouTube, LinkedIn, Glassdoor)";
      await req.onProgress?.(pct, `Research in progress — ${passNote}`);

      // Append assistant message with all content blocks
      messages.push({ role: "assistant", content: data.content });

      // Build tool results for all tool_use blocks
      const toolResults = data.content
        .filter((b: { type: string }) => b.type === "tool_use")
        .map((b: { id: string; name: string }) => ({
          type: "tool_result",
          tool_use_id: b.id,
          content: "" // Anthropic handles the actual search execution
        }));

      if (toolResults.length > 0) {
        messages.push({ role: "user", content: toolResults });
      }
    } else {
      // Unexpected stop reason — try to extract any text
      const textBlocks = data.content?.filter((b: { type: string }) => b.type === "text") || [];
      if (textBlocks.length > 0) {
        finalJson = textBlocks.map((b: { text: string }) => b.text).join("");
      }
      break;
    }
  }

  await req.onProgress?.(80, "Parsing research results");

  if (!finalJson) {
    throw new Error("Research failed: no JSON output from Claude after all passes");
  }

  try {
    const profile = JSON.parse(finalJson) as StartupProfile;
    // Ensure required fields
    if (!profile.brand_name) profile.brand_name = req.company;
    if (!profile.hq_country) profile.hq_country = req.country;
    if (!profile.youtube) profile.youtube = [];
    if (!profile.linkedin) profile.linkedin = [];
    if (!profile.raw_fields) profile.raw_fields = [];
    return profile;
  } catch (e) {
    throw new Error(`Failed to parse research JSON: ${e}. Raw output (first 500 chars): ${finalJson.slice(0, 500)}`);
  }
}
