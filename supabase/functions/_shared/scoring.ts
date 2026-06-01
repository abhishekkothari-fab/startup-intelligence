// supabase/functions/_shared/scoring.ts

import type { StartupProfile } from "./types.ts"

export function computeScores(merged: Partial<StartupProfile>): Partial<StartupProfile> {
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

export function mockProfile(company: string, country: string): StartupProfile {
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
