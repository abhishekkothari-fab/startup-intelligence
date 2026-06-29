// supabase/functions/rescore-startup/index.ts
// POST /functions/v1/rescore-startup
// Body: { "startup_id": "<uuid>" }
// Recomputes scores for an existing startup using the current scoring model
// without re-running any research passes.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { getSupabaseClient } from "../_shared/db.ts"
import { rescoreStartup } from "../_shared/rescore.ts"

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {
  if (req.method === "OPTIONS") return json("ok", 200)
  if (req.method !== "POST")   return json({ error: "POST only" }, 405)

  let startupId: string | undefined
  try {
    const body = await req.json()
    startupId = body.startup_id
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }
  if (!startupId) return json({ error: "startup_id required" }, 400)

  const supabase = getSupabaseClient()
  try {
    const result = await rescoreStartup(supabase, startupId)
    return json({ ...result, rescored_at: new Date().toISOString() })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const status = msg.includes("not found") ? 404 : 500
    return json({ error: msg }, status)
  }
})

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  })
}
