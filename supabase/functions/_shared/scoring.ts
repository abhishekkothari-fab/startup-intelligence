// supabase/functions/_shared/scoring.ts  —  scoring v5

import type { StartupProfile } from "./types.ts"

const USD_TO_INR = 83  // update here when exchange rate needs refreshing

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
// Tuple: [team, traction, capital, product, market, unit_econ, momentum]

type W7 = [number, number, number, number, number, number, number]

const WEIGHTS: Record<string, Record<string, W7>> = {
  saas: {
    pre_seed:      [0.35, 0.05, 0.10, 0.25, 0.15, 0.05, 0.05],
    seed:          [0.25, 0.15, 0.15, 0.20, 0.15, 0.05, 0.05],
    series_a:      [0.15, 0.30, 0.10, 0.15, 0.15, 0.10, 0.05],
    series_b_plus: [0.10, 0.30, 0.10, 0.15, 0.15, 0.15, 0.05],
    growth:        [0.08, 0.32, 0.10, 0.12, 0.15, 0.18, 0.05],
  },
  d2c: {
    pre_seed:      [0.30, 0.08, 0.10, 0.25, 0.15, 0.02, 0.10],
    seed:          [0.25, 0.20, 0.15, 0.15, 0.15, 0.05, 0.05],
    series_a:      [0.15, 0.30, 0.10, 0.15, 0.15, 0.10, 0.05],
    series_b_plus: [0.10, 0.35, 0.10, 0.10, 0.15, 0.15, 0.05],
    growth:        [0.08, 0.38, 0.10, 0.08, 0.12, 0.18, 0.06],
  },
  marketplace: {
    pre_seed:      [0.35, 0.05, 0.10, 0.25, 0.15, 0.05, 0.05],
    seed:          [0.25, 0.15, 0.15, 0.20, 0.15, 0.05, 0.05],
    series_a:      [0.15, 0.30, 0.10, 0.15, 0.15, 0.10, 0.05],
    series_b_plus: [0.10, 0.35, 0.10, 0.10, 0.15, 0.15, 0.05],
    growth:        [0.08, 0.38, 0.10, 0.10, 0.12, 0.17, 0.05],
  },
  fintech: {
    pre_seed:      [0.35, 0.05, 0.15, 0.20, 0.15, 0.05, 0.05],
    seed:          [0.30, 0.15, 0.15, 0.15, 0.15, 0.05, 0.05],
    series_a:      [0.20, 0.25, 0.15, 0.10, 0.15, 0.10, 0.05],
    series_b_plus: [0.10, 0.30, 0.15, 0.10, 0.15, 0.15, 0.05],
    growth:        [0.10, 0.30, 0.15, 0.10, 0.15, 0.15, 0.05],
  },
  deeptech: {
    pre_seed:      [0.40, 0.02, 0.08, 0.30, 0.15, 0.02, 0.03],
    seed:          [0.35, 0.10, 0.10, 0.25, 0.15, 0.02, 0.03],
    series_a:      [0.25, 0.20, 0.15, 0.20, 0.12, 0.05, 0.03],
    series_b_plus: [0.15, 0.30, 0.15, 0.15, 0.12, 0.10, 0.03],
    growth:        [0.10, 0.35, 0.15, 0.15, 0.12, 0.10, 0.03],
  },
  base: {
    pre_seed:      [0.35, 0.05, 0.10, 0.20, 0.15, 0.05, 0.10],
    seed:          [0.25, 0.20, 0.15, 0.15, 0.10, 0.05, 0.10],
    series_a:      [0.15, 0.25, 0.15, 0.15, 0.10, 0.10, 0.10],
    series_b_plus: [0.10, 0.30, 0.15, 0.15, 0.10, 0.15, 0.05],
    growth:        [0.08, 0.35, 0.15, 0.12, 0.10, 0.15, 0.05],
  },
}

function getWeights(scorecard: string, stage: string): W7 {
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

// ── Dimension scorers ──────────────────────────────────────────────────────

function scoreTeam(fm: Record<string, string>): number {
  let s = 15

  // Founder 1
  const edu1 = (fm["founder_1_education"] || "").toLowerCase()
  if (edu1.includes("iit") || edu1.includes("iim") || edu1.includes("isb") ||
      edu1.includes("tier1") || edu1.includes("stanford") || edu1.includes("wharton")) s += 12
  if (fm["founder_1_prior_startup"] === "yes") s += 10
  if (fm["founder_1_prior_exit"]    === "yes") s += 20
  const dom1 = parseInt(fm["founder_1_domain_years"] || "0")
  if      (dom1 >= 10) s += 15
  else if (dom1 >= 7)  s += 12
  else if (dom1 >= 5)  s += 8
  else if (dom1 >= 3)  s += 4

  // Co-founder (founder_2)
  if (fm["founder_2_name"] || fm["founder_2_role"]) {
    s += 8
    const edu2 = (fm["founder_2_education"] || "").toLowerCase()
    if (edu2.includes("iit") || edu2.includes("iim") || edu2.includes("isb")) s += 5
    if (fm["founder_2_prior_exit"]    === "yes") s += 8
    if (fm["founder_2_prior_startup"] === "yes") s += 4
  }

  // Advisors
  const adv = parseInt(fm["advisor_count"] || "0")
  if      (adv >= 3) s += 10
  else if (adv >= 1) s += 5

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
    if (yoy > 100) s = Math.min(100, s + 5)
    if (prof)      s = Math.min(100, s + 5)
    return s
  }

  if (scorecard === "d2c") {
    const primary = gmv > rev ? gmv : rev
    let s = primary >= 500 ? 90 : primary >= 200 ? 80 : primary >= 100 ? 70 : primary >= 50 ? 60
          : primary >= 20 ? 50 : primary >= 5 ? 38 : primary >= 1 ? 25 : primary > 0 ? 15 : 0
    if (yoy > 50) s = Math.min(100, s + 5)
    if (prof)     s = Math.min(100, s + 10)
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
    const primary = gmv > rev ? gmv : rev
    let s = primary >= 1000 ? 90 : primary >= 500 ? 80 : primary >= 200 ? 68 : primary >= 100 ? 57
          : primary >= 20 ? 42 : primary >= 5 ? 28 : primary > 0 ? 18 : 0
    if (yoy > 100) s = Math.min(100, s + 5)
    if (prof)      s = Math.min(100, s + 5)
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
  if (yoy > 100) s = Math.min(100, s + 5)
  if (prof)      s = Math.min(100, s + 10)
  return s
}

function scoreCapital(fm: Record<string, string>, merged: Partial<StartupProfile>): number {
  const raisedUsd = merged.total_raised_usd_m || 0
  const tier      = fm["investor_1_tier"] || ""

  if (tier === "tier1") return 90
  if (tier === "tier2") return 75
  if (tier === "tier3") return 62
  if (tier === "angel") return 50
  if (tier === "govt")  return 40

  if (raisedUsd >= 100) return 85
  if (raisedUsd >= 30)  return 70
  if (raisedUsd >= 10)  return 55
  if (raisedUsd > 0)    return 35

  // Bootstrapped — reward profitability
  return merged.is_profitable ? 45 : 10
}

function scoreProduct(fm: Record<string, string>, scorecard: string): number {
  const moat    = (fm["has_technical_moat"] || "").startsWith("yes")
  const api     = fm["has_api"]        === "yes"
  const mobile  = fm["has_mobile_app"] === "yes"
  const patents = parseInt(fm["patent_count"]  || "0")
  const prods   = parseInt(fm["product_count"] || "0")

  if (scorecard === "saas") {
    return Math.min(100, 20 + (moat ? 30 : 0) + (api ? 20 : 0) + (patents > 0 ? 10 : 0)
      + (prods > 1 ? 10 : 0) + (mobile ? 5 : 0))
  }
  if (scorecard === "d2c") {
    return Math.min(100, 20 + (moat ? 30 : 0) + (mobile ? 15 : 0)
      + (prods > 1 ? 10 : 0) + (patents > 0 ? 10 : 0) + (api ? 5 : 0))
  }
  if (scorecard === "fintech") {
    return Math.min(100, 20 + (moat ? 30 : 0) + (api ? 20 : 0) + (mobile ? 10 : 0)
      + (patents > 0 ? 10 : 0) + (prods > 1 ? 10 : 0))
  }
  if (scorecard === "marketplace") {
    return Math.min(100, 20 + (moat ? 25 : 0) + (mobile ? 20 : 0) + (api ? 15 : 0)
      + (prods > 1 ? 10 : 0) + (patents > 0 ? 10 : 0))
  }
  if (scorecard === "deeptech") {
    const patentBonus = patents >= 5 ? 25 : patents >= 2 ? 20 : patents > 0 ? 15 : 0
    return Math.min(100, 15 + (moat ? 35 : 0) + patentBonus + (prods > 1 ? 10 : 0)
      + (api ? 5 : 0) + (mobile ? 5 : 0))
  }
  // base
  return Math.min(100, 25 + (moat ? 30 : 0) + (api ? 15 : 0) + (mobile ? 10 : 0)
    + (patents > 0 ? 10 : 0) + (prods > 1 ? 10 : 0))
}

function scoreMarket(merged: Partial<StartupProfile>): number {
  const industry = merged.auto_industry || ""
  const stage    = merged.auto_stage    || "seed"
  const region   = merged.auto_region   || ""

  let base = 60
  for (const [key, val] of Object.entries(MARKET_TAM)) {
    if (industry.toLowerCase().includes(key.toLowerCase())) { base = val; break }
  }

  // Early stage: higher TAM potential headroom
  if (stage === "pre_seed" || stage === "seed") base = Math.min(95, Math.round(base * 1.05))

  // International operations → larger accessible market
  if (region.includes("global") || (merged.hq_country && merged.hq_country !== "IN"))
    base = Math.min(95, base + 5)

  return base
}

function scoreUnitEcon(fm: Record<string, string>, merged: Partial<StartupProfile>, scorecard: string): number {
  const rev       = merged.revenue_inr_cr     || 0
  const raisedUsd = merged.total_raised_usd_m || 0
  const raisedInr = raisedUsd * USD_TO_INR
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

  // Profitability — single biggest signal
  if (prof) s += 30

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
  if (fm["award_1"])                                         s += 20
  if (fm["partnership_1"] || fm["partnership_1_partner"])    s += 20
  if (fm["latest_news_headline"])                            s += 15

  const gdr = merged.glassdoor_rating
  if      (gdr && gdr >= 4.0) s += 10
  else if (gdr && gdr >= 3.5) s += 5

  const gdOutlook = merged.glassdoor_positive_outlook_pct
  if (gdOutlook && gdOutlook >= 70) s += 5

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
  const scorecardIds    = selectScorecards(merged)
  const primaryScorecard = scorecardIds[0]

  // Compute dimensions per scorecard, then blend (average)
  const sets = scorecardIds.map(sc => ({
    w:        getWeights(sc, stage),
    team:     scoreTeam(fm),
    traction: scoreTraction(fm, merged, sc),
    capital:  scoreCapital(fm, merged),
    product:  scoreProduct(fm, sc),
    market:   scoreMarket(merged),
    unitEcon: scoreUnitEcon(fm, merged, sc),
    momentum: scoreMomentum(fm, merged),
  }))

  const n   = sets.length
  const avg = (fn: (d: typeof sets[0]) => number) => Math.round(sets.reduce((s, d) => s + fn(d), 0) / n)
  const avgW = (i: number) => Math.round(sets.reduce((s, d) => s + d.w[i], 0) / n * 100) / 100

  const dimTeam     = avg(d => d.team)
  const dimTraction = avg(d => d.traction)
  const dimCapital  = avg(d => d.capital)
  const dimProduct  = avg(d => d.product)
  const dimMarket   = avg(d => d.market)
  const dimUnitEcon = avg(d => d.unitEcon)
  const dimMomentum = avg(d => d.momentum)

  const wt   = avgW(0)  // team
  const wtr  = avgW(1)  // traction
  const wc   = avgW(2)  // capital
  const wp   = avgW(3)  // product
  const wm   = avgW(4)  // market
  const wu   = avgW(5)  // unit_econ
  const wmo  = avgW(6)  // momentum

  const composite = Math.round(
    dimTeam * wt + dimTraction * wtr + dimCapital * wc +
    dimProduct * wp + dimMarket * wm + dimUnitEcon * wu + dimMomentum * wmo
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
  const raisedInr = raisedUsd * USD_TO_INR

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
  const rInvestorQuality   = tier === "tier1" ? 5 : tier === "tier2" ? 4 : tier === "angel" ? 3
    : tier === "govt" ? 2 : raisedUsd > 0 ? 1 : undefined
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
  if (edu.includes("iit") || edu.includes("iim") || edu.includes("isb")) founderDepth = Math.min(10, founderDepth + 1)

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
      w_team:            wt,
      w_traction:        wtr,
      w_capital:         wc,
      w_product:         wp,
      w_market:          wm,
      w_unit_econ:       wu,
      w_momentum:        wmo,
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
