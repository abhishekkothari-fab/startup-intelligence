// supabase/functions/_shared/types.ts

export type PassStatus = "pending" | "completed" | "failed" | "skipped"
export type PassesStatus = Record<string, {
  status: PassStatus
  completed_at?: string
  error?: string
  prior_error?: string
  tokens_in?: number
  tokens_out?: number
  prior_tokens_in?: number
  prior_tokens_out?: number
  truncated?: boolean
}>

export const PASS_NAMES = [
  "overview", "founders", "glassdoor", "funding",
  "competitive", "products", "regulatory", "signals", "youtube", "linkedin", "insights"
] as const
export type PassName = typeof PASS_NAMES[number]

export const PASS_PROGRESS: Record<PassName, number> = {
  overview: 12, founders: 22, glassdoor: 30, funding: 40,
  competitive: 47, products: 50, regulatory: 58, youtube: 65, signals: 76,
  linkedin: 88, insights: 96,
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
  forceModel?: string
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
  competitor_1_name?: string
  competitor_1_funding_usd_m?: number
  competitor_1_stage?: string
  competitor_2_name?: string
  competitor_2_funding_usd_m?: number
  competitor_2_stage?: string
  competitor_3_name?: string
  competitor_3_funding_usd_m?: number
  competitor_3_stage?: string
  market_leader_name?: string
  geo_analog_company?: string
  geo_analog_country?: string
  competitive_density?: string
  differentiation_claim?: string
  scores: {
    stage: string
    scorecard_ids: string[]
    primary_scorecard: string
    dim_team: number
    dim_traction: number
    dim_capital: number
    dim_product: number
    dim_market: number
    dim_unit_econ: number
    dim_momentum: number
    dim_defensibility: number
    w_team: number
    w_traction: number
    w_capital: number
    w_product: number
    w_market: number
    w_unit_econ: number
    w_momentum: number
    w_defensibility: number
    composite_score: number
    fields_applicable: number
    fields_collected: number
    fields_unknown: number
    fields_not_applicable: number
    data_quality_pct: number
    r_burn_multiple?: number
    r_traction_velocity?: number
    r_founder_mkt_fit?: number
    r_round_cadence?: number
    r_investor_quality?: number
    r_product_surface?: number
    r_rev_per_head?: number
    r_valuation_arr_mult?: number
    r_acv?: number
    r_grant_equity_ratio?: number
    r_capital_productivity?: number
    r_gnpa_pct?: number
    r_nim_pct?: number
    r_car_pct?: number
    r_roe_pct?: number
  }
  insights?: {
    thesis: string
    moat: string
    risks: string[]
    key_questions: string[]
    bull_case: string
    bear_case: string
    comparable: string
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
    source_platform?: string
    post_text?: string
    post_url?: string
    post_date?: string
    confidence: number
  }>
}
