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
