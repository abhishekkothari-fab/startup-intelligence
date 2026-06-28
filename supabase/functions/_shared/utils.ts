// supabase/functions/_shared/utils.ts

import type { StartupProfile } from "./types.ts"

// Promise.race-based timeout. Aborts the controller on timeout so in-flight fetches are cancelled.
export function raceTimeout<T>(promise: Promise<T>, ms: number, controller?: AbortController): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>(resolve => setTimeout(() => {
      controller?.abort()
      resolve(null)
    }, ms)),
  ])
}

export function parseJson(text: string): Record<string, unknown> | null {
  text = text.replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, "$1")
  text = text.replace(/```(?:json)?\s*/gi, "").replace(/```\s*$/g, "")
  const s = text.indexOf("{")
  const e = text.lastIndexOf("}")
  if (s === -1 || e === -1) return null
  try { return JSON.parse(text.slice(s, e + 1)) } catch { return null }
}

export function mergePartial(
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

// Builds a compact full-profile context block for the insights synthesis pass.
// Only includes applicable fields with non-null values to keep token count low.
export function buildInsightsContext(merged: Partial<StartupProfile>): string {
  const lines: string[] = []

  // Scalars
  const scalars: [string, unknown][] = [
    ["Stage",        merged.auto_stage],
    ["Industry",     merged.auto_industry],
    ["Biz model",    merged.auto_biz_model],
    ["Founded",      merged.founded_date],
    ["HQ",           merged.hq_city],
    ["Team size",    merged.team_size],
    ["Website",      merged.website],
    ["Tagline",      merged.auto_tagline],
    ["Revenue",      merged.revenue_inr_cr != null ? `₹${merged.revenue_inr_cr} Cr (${merged.revenue_fy ?? ""}) YoY ${merged.revenue_yoy_pct ?? "?"}%` : null],
    ["Net profit",   merged.net_profit_inr_cr != null ? `₹${merged.net_profit_inr_cr} Cr` : null],
    ["Profitable",   merged.is_profitable],
    ["Total raised", merged.total_raised_usd_m != null ? `$${merged.total_raised_usd_m}M` : null],
    ["Last round",   merged.last_round_type ? `${merged.last_round_type} ${merged.last_round_date ?? ""}`.trim() : null],
    ["Clients",      merged.client_count],
    ["Glassdoor",    merged.glassdoor_rating != null ? `${merged.glassdoor_rating}/5 (${merged.glassdoor_reviews ?? "?"} reviews, ${merged.glassdoor_recommend ?? "?"}% recommend)` : null],
  ]
  for (const [label, val] of scalars) {
    if (val !== null && val !== undefined) lines.push(`${label}: ${val}`)
  }

  // Scores summary
  if (merged.scores) {
    const s = merged.scores
    lines.push(`Scores: founder=${s.dim_founder} traction=${s.dim_traction} capital=${s.dim_capital} product=${s.dim_product} market=${s.dim_market} momentum=${s.dim_momentum} composite=${s.composite_score}`)
  }

  // Raw fields — applicable only, grouped by pack
  if (merged.raw_fields?.length) {
    const byPack: Record<string, string[]> = {}
    for (const f of merged.raw_fields) {
      if (f.applicability !== "applicable" || !f.raw_value) continue
      if (!byPack[f.field_pack]) byPack[f.field_pack] = []
      byPack[f.field_pack].push(`  ${f.field_name}: ${f.raw_value}`)
    }
    for (const [pack, entries] of Object.entries(byPack)) {
      lines.push(`[${pack}]`)
      lines.push(...entries)
    }
  }

  // Top linkedin signals (key quotes / traction claims only)
  const usefulSignals = (merged.linkedin ?? [])
    .filter(s => s.post_text && ["founder_traction_claim", "investor_validation", "partnership_announcement"].includes(s.signal_type))
    .slice(0, 4)
  if (usefulSignals.length) {
    lines.push("[social signals]")
    for (const s of usefulSignals) lines.push(`  ${s.signal_type}: ${s.post_text}`)
  }

  return "\n\n--- RESEARCH DATA ---\n" + lines.join("\n")
}

// Injects already-known scalar facts into subsequent pass prompts so Claude
// doesn't waste searches re-discovering what prior passes already found.
export function buildKnownContext(merged: Partial<StartupProfile>): string {
  const parts: string[] = []
  if (merged.brand_name) parts.push(`Brand: ${merged.brand_name}`)
  if (merged.legal_name) parts.push(`Legal name: ${merged.legal_name}`)
  if (merged.website) parts.push(`Website: ${merged.website}`)
  if (merged.auto_stage) parts.push(`Stage: ${merged.auto_stage}`)
  if (merged.auto_industry) parts.push(`Industry: ${merged.auto_industry}`)
  if (merged.founded_date) parts.push(`Founded: ${merged.founded_date}`)
  if (merged.hq_city) parts.push(`HQ: ${merged.hq_city}`)
  if (merged.total_raised_usd_m) parts.push(`Raised: $${merged.total_raised_usd_m}M`)
  if (merged.revenue_inr_cr) parts.push(`Revenue: ₹${merged.revenue_inr_cr} Cr (${merged.revenue_fy || ""})`)
  const founderName = merged.raw_fields?.find(f => f.field_name === "founder_1_name")?.raw_value
  if (founderName) parts.push(`Founder: ${founderName}`)
  if (parts.length === 0) return ""
  return `\n\nKnown context from prior research: ${parts.join(" | ")}`
}
