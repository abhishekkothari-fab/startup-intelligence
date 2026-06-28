// supabase/functions/_shared/research.ts

import type { ResearchRequest, StartupProfile, PassName, PassesStatus } from "./types.ts"
import { PASS_NAMES, PASS_PROGRESS } from "./types.ts"
import { PASS_SPECS } from "./passes.ts"
import { raceTimeout, parseJson, mergePartial, buildKnownContext, buildInsightsContext } from "./utils.ts"
import { claudeCall } from "./api.ts"
import { computeScores, mockProfile } from "./scoring.ts"

export type { PassName, PassesStatus, StartupProfile, ResearchRequest }
export { PASS_NAMES, PASS_PROGRESS }

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

  const disabledPasses = new Set(
    (Deno.env.get("DISABLED_PASSES") || "")
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
  )

  const passesStatus: PassesStatus = { ...(req.existingPassesStatus || {}) }
  // Passes that had any status when this wave started (completed OR failed in prior waves).
  // Used by toRun to prevent prior-wave failures from bleeding into this wave's budget.
  const priorWavePassNames = new Set(Object.keys(req.existingPassesStatus || {}))
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

  // Hard deadline: 145s — leaves 5s for DB cleanup before EdgeRuntime kills at 150s.
  const deadline = Date.now() + 145_000

  // Minimum remaining ms needed to START a pass. If less remains, defer to next wave
  // by breaking without marking as failed — next wave sees them as not-started and runs them.
  const PASS_MIN_MS: Partial<Record<PassName, number>> = {
    funding:   90_000,
    signals:  100_000,
    linkedin:  50_000,
    insights:  25_000,
  }

  await req.onProgress?.(5, "Starting research")

  // Three batches, passes within each batch run in parallel.
  // Batch 1: core identity. Batch 2: deeper data. Batch 3: media signals.
  // raceTimeout wraps every claudeCall so hanging passes are capped at the budget.
  const PASS_BATCHES: PassName[][] = [
    ["overview"],
    ["founders", "glassdoor"],
    ["funding", "products", "regulatory", "youtube"],
    ["signals"],
    ["linkedin"],
    ["insights"],
  ]

  for (const batch of PASS_BATCHES) {
    // Only run passes that are pending and not disabled.
    // Also skip passes that were already in a status at wave-start (prior-wave completions
    // and failures alike) — this prevents failed Wave N passes from consuming Wave N+1 budget.
    const toRun = batch.filter(p =>
      passesStatus[p]?.status !== "completed" &&
      !priorWavePassNames.has(p) &&
      !disabledPasses.has(p)
    )
    // Mark disabled ones
    for (const p of batch) {
      if (disabledPasses.has(p) && passesStatus[p]?.status !== "completed") {
        passesStatus[p] = { status: "skipped", completed_at: new Date().toISOString() }
      }
    }
    if (toRun.length === 0) continue

    // Defer batch to next wave if there isn't enough budget to run it reliably.
    // Don't mark as failed — next wave reads existingPassesStatus, won't see these,
    // and will run them fresh with a full 145s window.
    const batchMinMs = Math.max(30_000, ...toRun.map(p => PASS_MIN_MS[p] ?? 30_000))
    const remainingMs = deadline - Date.now()
    if (remainingMs < batchMinMs) {
      console.warn(`[${req.jobId}] Deferring [${toRun.join(",")}] to next wave — need ${batchMinMs / 1000}s, have ${Math.round(remainingMs / 1000)}s`)
      break
    }

    console.log(`[${req.jobId}] Batch starting: ${toRun.join(", ")}`)
    await req.onProgress?.(PASS_PROGRESS[toRun[0]] - 3, `Running: ${toRun.join(", ")}`)

    // Wave-scoped abort: credit exhaustion in any pass cancels remaining sibling passes immediately.
    const waveAbort = new AbortController()

    // Fire all passes in the batch in parallel
    const results = await Promise.all(toRun.map(async (passName) => {
      try {
        const spec = PASS_SPECS[passName]
        const budgetMs = Math.max(Math.min(spec.timeoutMs ?? 140_000, deadline - Date.now() - 5_000), 5_000)
        // Pass merged context — batch-2 uses industry/stage/website; batch-3 uses founderName
        const founderName = merged.raw_fields?.find(f => f.field_name === "founder_1_name")?.raw_value
        const ctx = { industry: merged.auto_industry, stage: merged.auto_stage, founderName, website: merged.website, legalName: merged.legal_name }
        const userMsg = spec.buildContext
          ? spec.user(req.company, req.country, ctx) + spec.buildContext(merged)
          : spec.user(req.company, req.country, ctx) + buildKnownContext(merged)
        const controller = new AbortController()
        const combinedSignal = AbortSignal.any([controller.signal, waveAbort.signal])
        let apiError: string | null = null
        const result = await raceTimeout(
          claudeCall(apiKey, spec.system, userMsg, spec.maxTokens, spec.maxSearches ?? 1, deadline, passName === "overview" ? spec.model : (req.forceModel ?? spec.model), combinedSignal)
            .catch(e => {
              apiError = String(e)
              if (apiError.includes("ANTHROPIC_CREDITS_EXHAUSTED")) waveAbort.abort()
              console.warn(`[${req.jobId}] ${passName} claudeCall error: ${e}`)
              return null
            }),
          budgetMs,
          controller
        )
        if (result === null) {
          const errMsg = apiError ? `API error: ${apiError}` : "No response from API (budget exhausted)"
          return { passName, partial: null as Partial<StartupProfile> | null, error: errMsg, tokensIn: 0, tokensOut: 0 }
        }
        if (result.text === null || result.text.trim() === "") {
          const errMsg = result.text === null ? "Correction loop exhausted (5 attempts, tokens billed)" : "Empty response from API"
          return { passName, partial: null as Partial<StartupProfile> | null, error: errMsg, tokensIn: result.tokensIn, tokensOut: result.tokensOut }
        }
        const obj = parseJson(result.text)
        if (!obj) {
          return { passName, partial: null, error: `JSON parse failed: ${result.text.slice(0, 100)}`, tokensIn: result.tokensIn, tokensOut: result.tokensOut, truncated: false }
        }
        const truncated = (obj as Record<string, unknown>)._tokens_exhausted === true
        if (truncated) delete (obj as Record<string, unknown>)._tokens_exhausted
        return { passName, partial: obj as Partial<StartupProfile>, error: null, tokensIn: result.tokensIn, tokensOut: result.tokensOut, truncated }
      } catch (e) {
        return { passName, partial: null, error: e instanceof Error ? e.message : String(e), tokensIn: 0, tokensOut: 0, truncated: false }
      }
    }))

    // Process results sequentially so merges and DB writes don't interleave.
    // overview is always first in its batch, ensuring startupId is set before
    // founders/glassdoor callbacks run.
    for (const { passName, partial, error, tokensIn, tokensOut, truncated } of results) {
      if (error || !partial) {
        passesStatus[passName] = { status: "failed", completed_at: new Date().toISOString(), error: error || "Unknown", tokens_in: tokensIn, tokens_out: tokensOut }
        console.warn(`[${req.jobId}] Pass ${passName} failed: ${error}`)
        await req.onPassStatusUpdate?.({ ...passesStatus })
      } else {
        merged = mergePartial(merged, partial)
        passesStatus[passName] = { status: "completed", completed_at: new Date().toISOString(), tokens_in: tokensIn, tokens_out: tokensOut, ...(truncated ? { truncated: true } : {}) }
        if (truncated) console.warn(`[${req.jobId}] Pass ${passName}: completed with truncated data (_tokens_exhausted)`)
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
    insights:   merged.insights,
    raw_fields: merged.raw_fields  || [],
    youtube:    merged.youtube     || [],
    linkedin:   merged.linkedin    || [],
  }
}
