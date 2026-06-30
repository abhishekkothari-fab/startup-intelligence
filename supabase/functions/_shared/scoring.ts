// supabase/functions/_shared/scoring.ts  —  scoring v7

import type { StartupProfile } from "./types.ts"

const USD_TO_INR      = 83                // 1 USD in INR — update here when rate changes
const USD_M_TO_INR_CR = USD_TO_INR / 10  // 1M USD = 8.3 Cr INR

// ── Scorecard selection ────────────────────────────────────────────────────

export function selectScorecards(merged: Partial<StartupProfile>): string[] {
  const pack     = (merged.auto_entity_pack || "").toLowerCase()
  const biz      = (merged.auto_biz_model   || "").toLowerCase()
  const industry = (merged.auto_industry    || "").toLowerCase()

  const cards: string[] = []

  // FinTech / NBFC
  if (pack.includes("nbfc") || industry.includes("nbfc") || biz === "lending" || biz === "nbfc")
    cards.push("fintech")
  else if (pack.includes("fintech") || industry.includes("fintech") ||
           biz.includes("payment") || biz.includes("wealth") || industry === "bfsi")
    cards.push("fintech")

  // SaaS
  if (pack.includes("saas") || biz.includes("saas") || biz === "b2b_saas")
    if (!cards.includes("saas")) cards.push("saas")

  // Marketplace
  if ((pack.includes("marketplace") || biz === "marketplace") && !cards.includes("marketplace"))
    cards.push("marketplace")

  // D2C / Consumer
  if ((pack.includes("d2c") || biz === "d2c") && !cards.includes("d2c"))
    cards.push("d2c")

  // Deep Tech
  if ((pack.includes("deeptech") || industry.includes("deeptech") ||
       industry.includes("biotech") || industry.includes("cleantech") ||
       industry.includes("hardware")) && !cards.includes("deeptech"))
    cards.push("deeptech")

  if (cards.length === 0) cards.push("base")
  return cards.slice(0, 2)  // cap at 2; blend when 2 apply
}

// ── Stage-aware weights per scorecard ─────────────────────────────────────
// Tuple: [team, traction, capital, product, market, unit_econ, momentum, defensibility]
// defensibility weight taken primarily from product (moat signals moved to dedicated dimension)

type W8 = [number, number, number, number, number, number, number, number]

const WEIGHTS: Record<string, Record<string, W8>> = {
  saas: {
    pre_seed:      [0.35, 0.05, 0.10, 0.15, 0.15, 0.05, 0.05, 0.10],
    seed:          [0.25, 0.15, 0.15, 0.12, 0.15, 0.05, 0.05, 0.08],
    series_a:      [0.15, 0.30, 0.10, 0.08, 0.15, 0.10, 0.05, 0.07],
    series_b_plus: [0.10, 0.30, 0.10, 0.08, 0.15, 0.15, 0.05, 0.07],
    growth:        [0.08, 0.32, 0.10, 0.06, 0.15, 0.18, 0.05, 0.06],
  },
  d2c: {
    pre_seed:      [0.30, 0.08, 0.10, 0.17, 0.15, 0.02, 0.10, 0.08],
    seed:          [0.25, 0.20, 0.15, 0.09, 0.15, 0.05, 0.05, 0.06],
    series_a:      [0.15, 0.30, 0.10, 0.09, 0.15, 0.10, 0.05, 0.06],
    series_b_plus: [0.10, 0.35, 0.10, 0.05, 0.15, 0.15, 0.04, 0.06],
    growth:        [0.08, 0.38, 0.10, 0.05, 0.10, 0.18, 0.06, 0.05],
  },
  marketplace: {
    pre_seed:      [0.35, 0.05, 0.10, 0.15, 0.15, 0.05, 0.05, 0.10],
    seed:          [0.25, 0.15, 0.15, 0.12, 0.15, 0.05, 0.05, 0.08],
    series_a:      [0.15, 0.30, 0.10, 0.07, 0.15, 0.10, 0.05, 0.08],
    series_b_plus: [0.10, 0.35, 0.10, 0.05, 0.13, 0.15, 0.05, 0.07],
    growth:        [0.08, 0.38, 0.10, 0.05, 0.12, 0.15, 0.05, 0.07],
  },
  fintech: {
    pre_seed:      [0.35, 0.05, 0.15, 0.10, 0.15, 0.05, 0.05, 0.10],
    seed:          [0.30, 0.15, 0.15, 0.07, 0.15, 0.05, 0.05, 0.08],
    series_a:      [0.20, 0.25, 0.15, 0.05, 0.13, 0.10, 0.05, 0.07],
    series_b_plus: [0.10, 0.30, 0.15, 0.05, 0.13, 0.15, 0.05, 0.07],
    growth:        [0.10, 0.30, 0.15, 0.05, 0.13, 0.15, 0.05, 0.07],
  },
  deeptech: {
    // Higher defensibility weight — patents and regulatory licenses are core moats here
    pre_seed:      [0.40, 0.02, 0.08, 0.18, 0.15, 0.02, 0.03, 0.12],
    seed:          [0.35, 0.10, 0.10, 0.15, 0.15, 0.02, 0.03, 0.10],
    series_a:      [0.25, 0.20, 0.15, 0.12, 0.12, 0.05, 0.03, 0.08],
    series_b_plus: [0.15, 0.30, 0.15, 0.07, 0.12, 0.10, 0.03, 0.08],
    growth:        [0.10, 0.35, 0.15, 0.07, 0.12, 0.10, 0.03, 0.08],
  },
  base: {
    pre_seed:      [0.35, 0.05, 0.10, 0.12, 0.15, 0.05, 0.10, 0.08],
    seed:          [0.25, 0.20, 0.15, 0.08, 0.10, 0.05, 0.10, 0.07],
    series_a:      [0.15, 0.25, 0.15, 0.08, 0.10, 0.10, 0.10, 0.07],
    series_b_plus: [0.10, 0.30, 0.15, 0.08, 0.10, 0.15, 0.05, 0.07],
    growth:        [0.08, 0.35, 0.15, 0.06, 0.10, 0.15, 0.05, 0.06],
  },
}

function getWeights(scorecard: string, stage: string): W8 {
  const sc = WEIGHTS[scorecard] ?? WEIGHTS.base
  return sc[stage] ?? sc.seed
}

// ── Industry TAM lookup for dim_market ────────────────────────────────────

const MARKET_TAM: Record<string, number> = {
  BFSI: 78, FinTech: 80, NBFC: 75, Payments: 78, Lending: 75,
  Health: 75, HealthTech: 76, MedTech: 74,
  AI_Infra: 85, SaaS: 78, Enterprise: 76, Cybersecurity: 74,
  D2C: 65, Consumer: 65,
  EdTech_HRTech: 67, EdTech: 68, HRTech: 65,
  Logistics: 70,
  EV: 78, CleanTech: 76, Energy: 72, DeepTech: 74,
  Biotech: 72, Hardware: 68,
  AgriTech: 65,
  Media: 58, Gaming: 60,
  Marketplace: 70,
}

// ── Shared helpers ─────────────────────────────────────────────────────────

// Graduated YoY growth bonus — replaces flat +5 across all traction scorecards
function growthBonus(yoy: number): number {
  if (yoy >= 300) return 18
  if (yoy >= 200) return 12
  if (yoy >= 100) return 7
  if (yoy >= 50)  return 3
  return 0
}

// Tier-1 institution check shared by founder_1, founder_2, and founderDepth ratio
function isTier1Edu(edu: string): boolean {
  return edu.includes("iit") || edu.includes("iim") || edu.includes("isb") ||
    edu.includes("tier1") || edu.includes("stanford") || edu.includes("wharton") ||
    edu.includes("harvard") || edu.includes("oxford") || edu.includes("mit") ||
    edu.includes("insead") || edu.includes("caltech") || edu.includes("iisc") ||
    edu.includes("bits pilani") || edu.includes("nus")
}

// ── Dimension scorers ──────────────────────────────────────────────────────

function advisorOrgBonus(org: string): number {
  const o = org.toLowerCase()
  if (/sequoia|accel|lightspeed|tiger|softbank|kleiner|a16z|y.?combinator|\byc\b/.test(o)) return 12
  if (/\bgoogle\b|microsoft|amazon|\bapple\b|\bmeta\b|facebook|netflix|\buber\b|airbnb/.test(o)) return 10
  if (/mckinsey|bain\b|bcg|deloitte|pwc|kpmg/.test(o)) return 8
  if (/\biit\b|\biim\b|\bisb\b|iisc/.test(o)) return 7
  return 5  // any named org still counts
}

function scoreTeam(fm: Record<string, string>): number {
  let s = 15

  // Founder 1
  const edu1 = (fm["founder_1_education"] || "").toLowerCase()
  if (isTier1Edu(edu1)) s += 12
  if (fm["founder_1_prior_startup"] === "yes") s += 10
  if (fm["founder_1_prior_exit"]    === "yes") s += 20
  const dom1 = parseInt(fm["founder_1_domain_years"] || "0")
  if      (dom1 >= 10) s += 15
  else if (dom1 >= 7)  s += 12
  else if (dom1 >= 5)  s += 8
  else if (dom1 >= 3)  s += 4

  // Founder 1 employer background (Tier 2)
  const emp1 = fm["founder_1_prior_employer_type"] || ""
  if (emp1 === "faang" || emp1 === "bigtech") s += 8
  else if (emp1 === "big4consulting")         s += 5

  // Co-founder (founder_2)
  if (fm["founder_2_name"] || fm["founder_2_role"]) {
    s += 8
    const edu2 = (fm["founder_2_education"] || "").toLowerCase()
    if (isTier1Edu(edu2)) s += 5
    if (fm["founder_2_prior_exit"]    === "yes") s += 8
    if (fm["founder_2_prior_startup"] === "yes") s += 4

    // Founder 2 employer background (Tier 2)
    const emp2 = fm["founder_2_prior_employer_type"] || ""
    if (emp2 === "faang" || emp2 === "bigtech") s += 5
    else if (emp2 === "big4consulting")         s += 3

    // Co-founder relationship depth (Tier 2)
    const overlap = parseInt(fm["cofounder_overlap_years"] || "0")
    if      (overlap >= 3) s += 8
    else if (overlap >= 1) s += 3
  }

  // Advisors: tier-weighted by org when available, count-based fallback
  const adv1Org = fm["advisor_1_org"] || ""
  const adv2Org = fm["advisor_2_org"] || ""
  const adv = parseInt(fm["advisor_count"] || "0")
  if (adv1Org) {
    s += advisorOrgBonus(adv1Org)
    if (adv2Org) s += Math.max(3, advisorOrgBonus(adv2Org) - 3)
  } else if (adv >= 3) {
    s += 10
  } else if (adv >= 1) {
    s += 5
  }

  return Math.min(100, s)
}

function scoreTraction(fm: Record<string, string>, merged: Partial<StartupProfile>, scorecard: string): number {
  const rev     = merged.revenue_inr_cr  || 0
  const gmv     = parseFloat(fm["gmv_inr_cr"]  || "0")
  const aum     = parseFloat(fm["aum_inr_cr"]  || "0")
  const yoy     = merged.revenue_yoy_pct || 0
  const prof    = merged.is_profitable
  const clients = merged.client_count    || 0

  if (scorecard === "saas") {
    let s = rev >= 50 ? 90 : rev >= 20 ? 80 : rev >= 5 ? 65 : rev >= 1 ? 50 : rev > 0 ? 35
          : clients > 20 ? 25 : 0
    if (clients > 20 && s < 80) s = Math.min(80, s + 10)
    s = Math.min(100, s + growthBonus(yoy))
    if (prof) s = Math.min(100, s + 5)
    return s
  }

  if (scorecard === "d2c") {
    // Cap GMV at 3× revenue when GMV >> revenue (prevents low-take-rate inflating score)
    const effectiveGmv = (gmv > 0 && rev > 0 && gmv > 5 * rev) ? 3 * rev : gmv
    const primary = Math.max(effectiveGmv, rev)
    let s = primary >= 500 ? 90 : primary >= 200 ? 80 : primary >= 100 ? 70 : primary >= 50 ? 60
          : primary >= 20 ? 50 : primary >= 5 ? 38 : primary >= 1 ? 25 : primary > 0 ? 15 : 0
    s = Math.min(100, s + growthBonus(yoy))
    if (prof) s = Math.min(100, s + 10)
    return s
  }

  if (scorecard === "fintech") {
    let s: number
    if (aum > 0) {
      s = aum >= 5000 ? 90 : aum >= 2000 ? 82 : aum >= 1000 ? 74 : aum >= 500 ? 65
        : aum >= 100 ? 52 : aum >= 50 ? 42 : 30
    } else {
      s = rev >= 100 ? 88 : rev >= 50 ? 78 : rev >= 20 ? 68 : rev >= 5 ? 55 : rev >= 1 ? 42 : rev > 0 ? 28 : 0
    }
    if (prof) s = Math.min(100, s + 10)
    return s
  }

  if (scorecard === "marketplace") {
    // Same GMV haircut: cap at 3× revenue when GMV >> revenue
    const effectiveGmv = (gmv > 0 && rev > 0 && gmv > 5 * rev) ? 3 * rev : gmv
    const primary = Math.max(effectiveGmv, rev)
    let s = primary >= 1000 ? 90 : primary >= 500 ? 80 : primary >= 200 ? 68 : primary >= 100 ? 57
          : primary >= 20 ? 42 : primary >= 5 ? 28 : primary > 0 ? 18 : 0
    s = Math.min(100, s + growthBonus(yoy))
    if (prof) s = Math.min(100, s + 5)
    return s
  }

  if (scorecard === "deeptech") {
    if (rev >= 10)   return 85
    if (rev >= 5)    return 75
    if (rev >= 1)    return 65
    if (rev > 0)     return 50
    if (clients > 3) return 40
    if (clients > 0) return 30
    if (fm["pilot_customer"] || fm["signed_contracts"]) return 28
    return 15
  }

  // base
  let s = rev >= 50 ? 85 : rev >= 25 ? 75 : rev >= 10 ? 65 : rev >= 5 ? 55 : rev >= 1 ? 42
        : rev > 0 ? 28 : clients > 100 ? 20 : 0
  s = Math.min(100, s + growthBonus(yoy))
  if (prof) s = Math.min(100, s + 10)
  return s
}

function scoreCapital(fm: Record<string, string>, merged: Partial<StartupProfile>): number {
  const raisedUsd = merged.total_raised_usd_m || 0
  const tier      = fm["investor_1_tier"] || ""

  let s: number
  if      (tier === "tier1")    s = 90
  else if (tier === "tier2")    s = 75
  else if (tier === "tier3")    s = 62
  else if (tier === "angel")    s = 50
  else if (tier === "govt")     s = 40
  else if (raisedUsd >= 100)    s = 85
  else if (raisedUsd >= 30)     s = 70
  else if (raisedUsd >= 10)     s = 55
  else if (raisedUsd > 0)       s = 35
  else s = merged.is_profitable ? 45 : 10

  // Strategic investor: corporate (Tata, Google, Reliance etc.) validates and signals exit path
  const isStrategic = fm["is_strategic_investor"]
  if (isStrategic === "true" || isStrategic === "yes") s = Math.min(100, s + 10)

  // Round type: debt instruments rank below equity
  const roundDetail = fm["last_round_type_detail"] || ""
  if      (roundDetail === "venture_debt")     s = Math.max(0, s - 10)
  else if (roundDetail === "convertible_note") s = Math.max(0, s - 5)

  return s
}

function scoreDefensibility(fm: Record<string, string>, merged: Partial<StartupProfile>): number {
  let s = 0

  // Network effects: platform moat is strongest; data > indirect > direct
  const netType = fm["network_effects_type"] || "none"
  if      (netType === "platform")  s += 45
  else if (netType === "indirect")  s += 35
  else if (netType === "direct")    s += 30
  else if (netType === "data")      s += 20

  // Regulatory moat: licensed businesses have structural barriers to entry
  const regLicense = (fm["regulatory_license"] || "").toLowerCase()
  if (regLicense && regLicense !== "none" && regLicense !== "not applicable" && regLicense !== "n/a") {
    const highBarrier = /nbfc|insurance|banking|rbi|sebi|spectrum|clinical/.test(regLicense)
    s += highBarrier ? 35 : 25
  }

  // Patent moat: granted >> filed; US patents are global premium signal
  const grantedPatents = parseInt(fm["patent_granted_count"] || "0")
  const usPatents      = parseInt(fm["patent_us_count"]      || "0")
  if      (grantedPatents >= 5 || usPatents >= 2) s += 30
  else if (usPatents >= 1)                        s += 20
  else if (grantedPatents >= 1)                   s += 10

  // Switching cost: ERP integrations and compliance workflows create lock-in
  const switchCost = fm["switching_cost_signal"] || ""
  if      (switchCost === "high")     s += 20
  else if (switchCost === "moderate") s += 10

  // Ecosystem embedding: published API integrations = stickiness
  const apiIntCount = parseInt(fm["api_integration_count"] || "0")
  if      (apiIntCount >= 50) s += 10
  else if (apiIntCount >= 10) s += 5

  // Model proven elsewhere: geo analog de-risks the thesis
  if (merged.geo_analog_company) s += 5

  return Math.min(100, s)
}

function scoreProduct(fm: Record<string, string>, scorecard: string, stage: string): number {
  // has_technical_moat and network_effects_type moved to scoreDefensibility (Tier 5)
  const api    = fm["has_api"]        === "yes"
  const mobile = fm["has_mobile_app"] === "yes"
  const prods  = parseInt(fm["product_count"] || "0")

  // Patents: granted is primary; filed gets half credit (also scored in defensibility)
  const grantedPatents   = parseInt(fm["patent_granted_count"] || "0")
  const filedPatents     = parseInt(fm["patent_count"]         || "0")
  const effectivePatents = grantedPatents > 0 ? grantedPatents : Math.floor(filedPatents / 2)
  const usPatentBonus    = parseInt(fm["patent_us_count"] || "0") > 0 ? 5 : 0

  // App store quality signal (Tier 2)
  const appRating = parseFloat(fm["app_store_rating"] || "0")
  const appBonus  = appRating >= 4.5 ? 10 : appRating >= 4.0 ? 5 : 0

  // Third-party API integrations: ecosystem breadth as product quality signal
  const apiIntCount = parseInt(fm["api_integration_count"] || "0")
  const apiIntBonus = apiIntCount >= 50 ? 10 : apiIntCount >= 10 ? 5 : 0

  // Multiple products: breadth but penalise focus at early stages
  const prodBonus = prods > 1 ? (stage === "pre_seed" ? 0 : stage === "seed" ? 5 : 10) : 0

  if (scorecard === "saas") {
    const patentBonus = effectivePatents > 0 ? 10 : 0
    return Math.min(100, 20 + (api ? 20 : 0) + patentBonus + usPatentBonus
      + prodBonus + (mobile ? 5 : 0) + appBonus + apiIntBonus)
  }
  if (scorecard === "d2c") {
    const patentBonus = effectivePatents > 0 ? 10 : 0
    return Math.min(100, 20 + (mobile ? 15 : 0)
      + prodBonus + patentBonus + usPatentBonus + (api ? 5 : 0) + appBonus + apiIntBonus)
  }
  if (scorecard === "fintech") {
    const patentBonus = effectivePatents > 0 ? 10 : 0
    return Math.min(100, 20 + (api ? 20 : 0) + (mobile ? 10 : 0)
      + patentBonus + usPatentBonus + prodBonus + appBonus + apiIntBonus)
  }
  if (scorecard === "marketplace") {
    const patentBonus = effectivePatents > 0 ? 10 : 0
    return Math.min(100, 20 + (mobile ? 20 : 0) + (api ? 15 : 0)
      + prodBonus + patentBonus + usPatentBonus + appBonus + apiIntBonus)
  }
  if (scorecard === "deeptech") {
    const patentBonus = effectivePatents >= 5 ? 25 : effectivePatents >= 2 ? 20 : effectivePatents > 0 ? 15 : 0
    return Math.min(100, 15 + patentBonus + usPatentBonus + prodBonus
      + (api ? 5 : 0) + (mobile ? 5 : 0) + appBonus + apiIntBonus)
  }
  // base
  const patentBonus = effectivePatents > 0 ? 10 : 0
  return Math.min(100, 25 + (api ? 15 : 0) + (mobile ? 10 : 0)
    + patentBonus + usPatentBonus + prodBonus + appBonus + apiIntBonus)
}

function scoreMarket(merged: Partial<StartupProfile>): number {
  const industry = merged.auto_industry || ""
  const stage    = merged.auto_stage    || "seed"
  const region   = merged.auto_region   || ""

  // Collect all matching TAM values and average — avoids first-match ordering bias
  const tamMatches: number[] = []
  for (const [key, val] of Object.entries(MARKET_TAM)) {
    if (industry.toLowerCase().includes(key.toLowerCase())) tamMatches.push(val)
  }
  let base = tamMatches.length > 0
    ? Math.round(tamMatches.reduce((a, b) => a + b, 0) / tamMatches.length)
    : 60

  // Early stage: higher TAM potential headroom
  if (stage === "pre_seed" || stage === "seed") base = Math.min(95, Math.round(base * 1.05))

  // International operations → larger accessible market
  if (region.includes("global") || (merged.hq_country && merged.hq_country !== "IN"))
    base = Math.min(95, base + 5)

  // Competitive density (Tier 3): crowded market is harder to win
  const density = merged.competitive_density || ""
  if      (density === "crowded") base = Math.max(0,   base - 10)
  else if (density === "low")     base = Math.min(100, base + 5)

  // Geo analog: proven model in another geography de-risks the thesis
  if (merged.geo_analog_company) base = Math.min(100, base + 5)

  return base
}

function scoreUnitEcon(fm: Record<string, string>, merged: Partial<StartupProfile>, scorecard: string): number {
  const rev       = merged.revenue_inr_cr     || 0
  const raisedUsd = merged.total_raised_usd_m || 0
  const raisedInr = raisedUsd * USD_M_TO_INR_CR
  const teamSize  = merged.team_size          || 0
  const prof      = merged.is_profitable

  // DeepTech pre-revenue: grant efficiency is the proxy
  if (scorecard === "deeptech" && !rev) {
    const grantRatio = parseFloat(fm["grant_equity_ratio"] || "0")
    if (grantRatio > 0.5) return 55
    if (grantRatio > 0.2) return 40
    return 20
  }

  if (!rev) return 15

  let s = 20

  // Profitability — graduated by net margin when available, binary fallback otherwise
  const netProfit = merged.net_profit_inr_cr
  if (netProfit !== undefined && netProfit !== null && rev > 0) {
    const margin = netProfit / rev
    if      (margin >= 0.15) s += 30
    else if (margin >= 0.05) s += 20
    else if (margin >= 0.01) s += 10
  } else if (prof) {
    s += 15  // profitable signal but margin data not available
  }

  // Burn multiple: lifetime capital raised ÷ annual revenue (lower = more efficient)
  if (raisedInr > 0) {
    const bm = raisedInr / rev
    if      (bm < 1)  s += 35  // raised < 1× revenue: exceptional
    else if (bm < 2)  s += 25
    else if (bm < 5)  s += 15
    else if (bm < 10) s += 8
    // > 10×: no bonus
  } else {
    // Bootstrapped with revenue — strong capital efficiency signal
    s += 30
  }

  // Revenue per head (INR Lakhs): operational leverage
  if (teamSize > 0) {
    const revPerHead = (rev * 100) / teamSize
    if (revPerHead > 20) s += 10
    else if (revPerHead > 5) s += 5
  }

  return Math.min(100, s)
}

function scoreMomentum(fm: Record<string, string>, merged: Partial<StartupProfile>): number {
  let s = 10

  if (fm["award_1"]) s += 20

  // Partnership: tier-weighted when available (Tier 2), flat bonus fallback for old profiles
  const partnerTier = fm["partner_1_tier"] || ""
  const hasPartner  = !!(fm["partnership_1"] || fm["partnership_1_partner"])
  if      (partnerTier === "enterprise") s += 20
  else if (partnerTier === "mid")        s += 10
  else if (partnerTier === "small")      s += 5
  else if (hasPartner)                   s += 20

  // News quality: tier-based scoring (Tier 2) replaces flat +15
  const newsQuality = fm["news_source_quality"] || ""
  if (fm["latest_news_headline"]) {
    if      (newsQuality === "tier1") s += 15
    else if (newsQuality === "tier2") s += 8
    else if (newsQuality === "blog")  s += 3
    else                              s += 8  // unknown quality: conservative default
  }

  // Named enterprise clients (Tier 2): publicly confirmed paying clients
  const entClients = parseInt(fm["named_enterprise_client_count"] || "0")
  if      (entClients >= 4) s += 18
  else if (entClients >= 1) s += 10

  // Glassdoor
  const gdr = merged.glassdoor_rating
  if      (gdr && gdr >= 4.0) s += 10
  else if (gdr && gdr >= 3.5) s += 5

  const gdOutlook = merged.glassdoor_positive_outlook_pct
  if (gdOutlook && gdOutlook >= 70) s += 5

  // Recent fundraise (within 6 months): market endorsement signal
  if (merged.last_round_date) {
    const msAgo = Date.now() - new Date(merged.last_round_date).getTime()
    if (msAgo < 6 * 30.44 * 24 * 3600 * 1000) s += 10
  }

  return Math.min(100, s)
}

// ── Main export ────────────────────────────────────────────────────────────

export function computeScores(merged: Partial<StartupProfile>): Partial<StartupProfile> {
  // Correct stage misclassification based on capital raised
  let stage = merged.auto_stage || "seed"
  const raisedUsd = merged.total_raised_usd_m || 0
  if      (raisedUsd >= 100 && ["pre_seed","seed","series_a"].includes(stage)) stage = "series_b_plus"
  else if (raisedUsd >= 20  && ["pre_seed","seed"].includes(stage))             stage = "series_a"
  else if (raisedUsd >= 5   && stage === "pre_seed")                            stage = "seed"

  // Field lookup from raw_fields
  const fm: Record<string, string> = {}
  for (const f of (merged.raw_fields || [])) {
    if (f.raw_value && f.raw_value !== "unknown") fm[f.field_name] = f.raw_value.toLowerCase()
  }

  // Select scorecards (1–2)
  const scorecardIds     = selectScorecards(merged)
  const primaryScorecard = scorecardIds[0]

  // Compute dimensions per scorecard, then blend (average)
  const defScore = scoreDefensibility(fm, merged)

  const sets = scorecardIds.map(sc => ({
    w:            getWeights(sc, stage),
    team:         scoreTeam(fm),
    traction:     scoreTraction(fm, merged, sc),
    capital:      scoreCapital(fm, merged),
    product:      scoreProduct(fm, sc, stage),
    market:       scoreMarket(merged),
    unitEcon:     scoreUnitEcon(fm, merged, sc),
    momentum:     scoreMomentum(fm, merged),
    defensibility: defScore,
  }))

  const n    = sets.length
  const avg  = (fn: (d: typeof sets[0]) => number) => Math.round(sets.reduce((s, d) => s + fn(d), 0) / n)
  const avgW = (i: number) => Math.round(sets.reduce((s, d) => s + d.w[i], 0) / n * 100) / 100

  const dimTeam         = avg(d => d.team)
  const dimTraction     = avg(d => d.traction)
  const dimCapital      = avg(d => d.capital)
  const dimProduct      = avg(d => d.product)
  const dimMarket       = avg(d => d.market)
  const dimUnitEcon     = avg(d => d.unitEcon)
  const dimMomentum     = avg(d => d.momentum)
  const dimDefensibility = avg(d => d.defensibility)

  const wt  = avgW(0)  // team
  const wtr = avgW(1)  // traction
  const wc  = avgW(2)  // capital
  const wp  = avgW(3)  // product
  const wm  = avgW(4)  // market
  const wu  = avgW(5)  // unit_econ
  const wmo = avgW(6)  // momentum
  const wdf = avgW(7)  // defensibility

  const composite = Math.round(
    dimTeam * wt + dimTraction * wtr + dimCapital * wc +
    dimProduct * wp + dimMarket * wm + dimUnitEcon * wu + dimMomentum * wmo +
    dimDefensibility * wdf
  )

  // Data quality
  const allRaw              = merged.raw_fields || []
  const fieldsNotApplicable = allRaw.filter(f => f.applicability === "not_applicable").length
  const fieldsApplicable    = Math.max(20, allRaw.length - fieldsNotApplicable + 4)
  const rev                 = merged.revenue_inr_cr
  const fieldsCollected     = Object.keys(fm).length +
    (rev ? 1 : 0) + (raisedUsd ? 1 : 0) +
    (merged.glassdoor_rating ? 1 : 0) + (merged.team_size ? 1 : 0)
  const fieldsUnknown = Math.max(0, fieldsApplicable - fieldsCollected - fieldsNotApplicable)
  const dq            = Math.round(Math.min(95, (fieldsCollected / fieldsApplicable) * 100))

  // ── Universal ratios ──────────────────────────────────────────────────────
  const foundedMs = merged.founded_date ? new Date(merged.founded_date).getTime() : 0
  const monthsOp  = foundedMs > 0 ? Math.max(1, (Date.now() - foundedMs) / (30.44 * 24 * 3600 * 1000)) : 0
  const raisedInr = raisedUsd * USD_M_TO_INR_CR

  let productSurface = 0
  for (let i = 1; i <= 6; i++) { if (fm[`product_${i}_name`]) productSurface++ }

  // Revenue CAGR (best available window: 3yr → 2yr → 1yr YoY)
  const fy1 = parseFloat(fm["revenue_fy1_inr_cr"] || "0")
  const fy2 = parseFloat(fm["revenue_fy2_inr_cr"] || "0")
  const fy3 = parseFloat(fm["revenue_fy3_inr_cr"] || "0")
  const fy4 = parseFloat(fm["revenue_fy4_inr_cr"] || "0")
  let rRevenueCagr: number | undefined
  if      (fy1 > 0 && fy4 > 0 && fy1 !== fy4) rRevenueCagr = Math.round(((fy1 / fy4) ** (1 / 3) - 1) * 1000) / 10
  else if (fy1 > 0 && fy3 > 0 && fy1 !== fy3) rRevenueCagr = Math.round(((fy1 / fy3) ** (1 / 2) - 1) * 1000) / 10
  else if (fy1 > 0 && fy2 > 0 && fy1 !== fy2) rRevenueCagr = Math.round((fy1 / fy2 - 1) * 1000) / 10
  else if (merged.revenue_yoy_pct)              rRevenueCagr = merged.revenue_yoy_pct

  const rBurnMultiple      = (rev && raisedInr > 0) ? Math.round(raisedInr / rev * 10) / 10 : undefined
  const rRevPerHead        = (rev && merged.team_size && merged.team_size > 0)
    ? Math.round(rev * 100 / merged.team_size * 10) / 10 : undefined
  const rACV               = (rev && merged.client_count && merged.client_count > 0)
    ? Math.round(rev * 100 / merged.client_count * 10) / 10 : undefined
  const roundCount         = parseInt(fm["round_count"] || "0")
  const rRoundCadence      = (roundCount > 0 && monthsOp > 0)
    ? Math.round(roundCount / (monthsOp / 12) * 10) / 10 : undefined
  const roundSizeInr       = merged.last_round_size_inr_cr || 0
  // implied valuation = round size / assumed 18% dilution; multiple = valuation / ARR
  const rValuationArrMult  = (roundSizeInr > 0 && rev && rev > 0)
    ? Math.round(roundSizeInr / (0.18 * rev) * 10) / 10
    : undefined
  const tier               = fm["investor_1_tier"] || ""
  const rInvestorQuality   = tier === "tier1" ? 5 : tier === "tier2" ? 4 : tier === "tier3" ? 3
    : tier === "angel" ? 3 : tier === "govt" ? 2 : raisedUsd > 0 ? 1 : undefined
  const rProductSurface    = productSurface > 0 ? productSurface : undefined

  // Founder depth (0–10) for the ratio display
  let founderDepth = 3
  const domainYrs = parseInt(fm["founder_1_domain_years"] || "0")
  if      (domainYrs >= 10) founderDepth = 8
  else if (domainYrs >= 7)  founderDepth = 7
  else if (domainYrs >= 5)  founderDepth = 6
  else if (domainYrs >= 3)  founderDepth = 5
  if (fm["founder_1_prior_exit"]    === "yes") founderDepth = Math.min(10, founderDepth + 2)
  if (fm["founder_1_prior_startup"] === "yes") founderDepth = Math.min(10, founderDepth + 1)
  const edu = (fm["founder_1_education"] || "").toLowerCase()
  if (isTier1Edu(edu)) founderDepth = Math.min(10, founderDepth + 1)

  const rCapitalProductivity = (rev && raisedInr > 0)
    ? Math.round(rev / raisedInr * 1000) / 10 : undefined

  return {
    scores: {
      stage,
      scorecard_ids:     scorecardIds,
      primary_scorecard: primaryScorecard,
      dim_team:          dimTeam,
      dim_traction:      dimTraction,
      dim_capital:       dimCapital,
      dim_product:       dimProduct,
      dim_market:        dimMarket,
      dim_unit_econ:     dimUnitEcon,
      dim_momentum:      dimMomentum,
      dim_defensibility: dimDefensibility,
      w_team:            wt,
      w_traction:        wtr,
      w_capital:         wc,
      w_product:         wp,
      w_market:          wm,
      w_unit_econ:       wu,
      w_momentum:        wmo,
      w_defensibility:   wdf,
      composite_score:   composite,
      fields_applicable:     fieldsApplicable,
      fields_collected:      fieldsCollected,
      fields_unknown:        fieldsUnknown,
      fields_not_applicable: fieldsNotApplicable,
      data_quality_pct:      dq,
      r_traction_velocity:    rRevenueCagr,
      r_burn_multiple:        rBurnMultiple,
      r_rev_per_head:         rRevPerHead,
      r_acv:                  rACV,
      r_round_cadence:        rRoundCadence,
      r_valuation_arr_mult:   rValuationArrMult,
      r_investor_quality:     rInvestorQuality,
      r_product_surface:      rProductSurface,
      r_founder_mkt_fit:      founderDepth,
      r_capital_productivity: rCapitalProductivity,
    }
  }
}

export function mockProfile(company: string, country: string): StartupProfile {
  return {
    brand_name: company, legal_name: `${company} Pvt Ltd`, cin: "U72900MH2020PTC123456",
    website: `https://www.${company.toLowerCase().replace(/\s+/g, "")}.com`,
    founded_date: "2020-01-01", hq_city: "Mumbai", hq_country: country,
    auto_stage: "series_a", auto_industry: "SaaS", auto_industry_sub: "B2B",
    auto_region: "metro_t1", auto_biz_model: "b2b_saas", auto_entity_pack: "base|saas|b2b",
    auto_tagline: `AI-powered platform for modern teams`,
    revenue_inr_cr: 42, revenue_fy: "FY24", revenue_yoy_pct: 65,
    net_profit_inr_cr: -8, total_raised_usd_m: 12, last_round_type: "Series A",
    last_round_date: "2023-06-01", last_round_size_inr_cr: 100,
    team_size: 120, client_count: 50, is_profitable: false,
    glassdoor_rating: 3.8, glassdoor_reviews: 45, glassdoor_recommend: 72,
    glassdoor_wlb: 3.5, glassdoor_culture: 3.9, glassdoor_themes: "fast-paced,good-tech,growth-culture",
    scores: {
      stage: "series_a",
      scorecard_ids: ["saas"], primary_scorecard: "saas",
      dim_team: 72, dim_traction: 65, dim_capital: 60,
      dim_product: 70, dim_market: 78, dim_unit_econ: 45, dim_momentum: 55,
      w_team: 0.15, w_traction: 0.30, w_capital: 0.10,
      w_product: 0.15, w_market: 0.15, w_unit_econ: 0.10, w_momentum: 0.05,
      composite_score: 66, fields_applicable: 40, fields_collected: 28,
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
