// supabase/functions/upsert-analyst-input/index.ts
// POST /functions/v1/upsert-analyst-input
// Body: { startup_id: string, inputs: { field_name: string, value: number }[] }
// Auth: required — email extracted from JWT for audit trail.
// After upsert, triggers an immediate rescore so score reflects new data.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { getSupabaseClient } from "../_shared/db.ts"
import { rescoreStartup } from "../_shared/rescore.ts"

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ALLOWED_FIELDS = new Set([
  "nrr_pct", "gross_margin_pct", "cac_inr_l", "ltv_inr_l",
  "monthly_burn_inr_cr", "runway_months", "top3_client_revenue_pct",
  "mom_growth_pct", "annual_churn_pct",
])

serve(async (req) => {
  if (req.method === "OPTIONS") return json("ok", 200)
  if (req.method !== "POST")   return json({ error: "POST only" }, 405)

  let startupId: string
  let inputs: { field_name: string; value: number }[]
  try {
    const body = await req.json()
    startupId = body.startup_id
    inputs    = body.inputs ?? []
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }
  if (!startupId) return json({ error: "startup_id required" }, 400)

  // Extract caller email from JWT for audit trail
  const supabase = getSupabaseClient()
  let enteredBy: string | null = null
  const authHeader = req.headers.get("Authorization")
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "")
    const { data } = await supabase.auth.getUser(token)
    enteredBy = data?.user?.email ?? null
  }

  // Filter to only allowed fields with valid numeric values
  const validInputs = inputs.filter(
    i => ALLOWED_FIELDS.has(i.field_name) && typeof i.value === "number" && isFinite(i.value)
  )

  if (validInputs.length === 0) return json({ error: "No valid inputs" }, 400)

  const now = new Date().toISOString()
  const rows = validInputs.map(i => ({
    startup_id: startupId,
    field_name: i.field_name,
    value_num:  i.value,
    entered_by: enteredBy,
    entered_at: now,
    updated_at: now,
  }))

  const { error: upsertErr } = await supabase
    .from("analyst_inputs")
    .upsert(rows, { onConflict: "startup_id,field_name" })
  if (upsertErr) return json({ error: upsertErr.message }, 500)

  // Rescore immediately so leaderboard reflects new analyst data
  try {
    const result = await rescoreStartup(supabase, startupId)
    return json({
      success:         true,
      fields_saved:    validInputs.length,
      composite_score: result.composite_score,
      rescored_at:     new Date().toISOString(),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ success: true, fields_saved: validInputs.length, rescore_error: msg })
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
