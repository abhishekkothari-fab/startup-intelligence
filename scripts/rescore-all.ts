#!/usr/bin/env -S deno run --allow-net --allow-env
// Rescore all existing startup records with the current scoring model (v5).
// No LLM calls — reads existing DB data, rewrites scores only.
//
// Usage:
//   SUPABASE_URL=https://gfcdtvpxrirkqfceleuy.supabase.co \
//   SUPABASE_ANON_KEY=eyJ... \
//   ~/.local/bin/deno.exe run --allow-net --allow-env scripts/rescore-all.ts
//
// Optional: pass a single startup_id to rescore just one record:
//   scripts/rescore-all.ts <startup_id>

const BASE          = (Deno.env.get("SUPABASE_URL") ?? "https://gfcdtvpxrirkqfceleuy.supabase.co") + "/functions/v1"
const ANON_KEY      = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const SINGLE_ID     = Deno.args[0] ?? null

if (!ANON_KEY) {
  console.error("Set SUPABASE_ANON_KEY env var before running.")
  Deno.exit(1)
}

const headers = {
  "Authorization": `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json",
}

async function rescore(startupId: string, name: string, n: number, total: number): Promise<boolean> {
  const res = await fetch(`${BASE}/rescore-startup`, {
    method: "POST",
    headers,
    body: JSON.stringify({ startup_id: startupId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`  [${n}/${total}] FAIL  ${name} — ${body.error ?? res.status}`)
    return false
  }
  const sc = body.scores
  const card = sc?.scorecard_ids?.join("+") ?? "?"
  console.log(`  [${n}/${total}] OK    ${name} — ${sc?.composite_score ?? "?"} (${card})`)
  return true
}

// ── Single startup mode ────────────────────────────────────────────────────
if (SINGLE_ID) {
  console.log(`Rescoring single startup: ${SINGLE_ID}`)
  const ok = await rescore(SINGLE_ID, SINGLE_ID, 1, 1)
  Deno.exit(ok ? 0 : 1)
}

// ── Batch mode: paginate through all startups ─────────────────────────────
const all: { id: string; brand_name: string }[] = []
let page = 1
while (true) {
  const res = await fetch(`${BASE}/get-startups?page=${page}&limit=50`, { headers })
  if (!res.ok) { console.error("Failed to fetch leaderboard"); Deno.exit(1) }
  const data = await res.json()
  if (!data.data?.length) break
  all.push(...data.data.map((r: { id: string; brand_name: string }) => ({ id: r.id, brand_name: r.brand_name })))
  if (all.length >= data.total) break
  page++
}

console.log(`\nRescoring ${all.length} startups with scoring v5.0...\n`)
let ok = 0, fail = 0

for (let i = 0; i < all.length; i++) {
  const { id, brand_name } = all[i]
  const success = await rescore(id, brand_name, i + 1, all.length)
  success ? ok++ : fail++
}

console.log(`\n── Done ──────────────────────────────────`)
console.log(`  ${ok} succeeded, ${fail} failed out of ${all.length} startups`)
