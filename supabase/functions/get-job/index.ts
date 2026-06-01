// supabase/functions/get-job/index.ts
// GET /functions/v1/get-job/{job_id}
// Returns live job status including per-pass breakdown, token consumption, and cost estimate.
// Frontend polls this every 5s until status = "completed" or "failed".

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseClient } from "../_shared/db.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

const ALL_PASSES = [
  "overview", "founders", "glassdoor", "funding",
  "products", "regulatory", "signals", "youtube", "linkedin",
];

// Blended cost estimate matching the logic in finalizeJob.
function estimateCost(tokensIn: number, tokensOut: number): number {
  const blendIn  = tokensIn  / 1_000_000 * (0.8 * 3.0  + 0.2 * 0.80);
  const blendOut = tokensOut / 1_000_000 * (0.8 * 15.0 + 0.2 * 4.0);
  return Math.round((blendIn + blendOut) * 1_000_000) / 1_000_000;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url   = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const jobId = parts[parts.length - 1];

  if (!jobId || jobId === "get-job") {
    return json({ error: "Missing job_id. Use GET /get-job/{job_id}" }, 400);
  }

  const supabase = getSupabaseClient();

  const { data: job, error } = await supabase
    .from("profiling_jobs")
    .select([
      "id", "company_name", "country", "status", "progress_pct",
      "startup_id", "error_message", "created_at", "updated_at",
      "started_at", "completed_at", "duration_ms",
      "total_tokens_in", "total_tokens_out", "estimated_cost_usd",
      "passes_completed", "passes_failed",
      "pass_field_counts", "total_fields_written",
      "waves_fired", "retry_attempted",
      "passes_status",
    ].join(", "))
    .eq("id", jobId)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!job)  return json({ error: `Job ${jobId} not found` }, 404);

  // ── Live pass breakdown (computed from passes_status every poll) ──────────
  const ps: Record<string, { status: string; tokens_in?: number; tokens_out?: number; completed_at?: string; error?: string }> = job.passes_status || {};

  const passesCompleted: string[] = [];
  const passesFailed:    string[] = [];
  const passesPending:   string[] = [];

  for (const p of ALL_PASSES) {
    const entry = ps[p];
    if (!entry)                         { passesPending.push(p); }
    else if (entry.status === "completed") { passesCompleted.push(p); }
    else if (entry.status === "failed")    { passesFailed.push(p);    }
    else                                   { passesPending.push(p);   }
  }

  // Live token totals from passes that have reported so far.
  let liveTokensIn  = 0;
  let liveTokensOut = 0;
  for (const entry of Object.values(ps)) {
    liveTokensIn  += entry.tokens_in  ?? 0;
    liveTokensOut += entry.tokens_out ?? 0;
  }

  const elapsedMs = job.started_at
    ? Date.now() - new Date(job.started_at).getTime()
    : null;

  // ── Response assembly ─────────────────────────────────────────────────────
  const resp: Record<string, unknown> = {
    job_id:       job.id,
    company_name: job.company_name,
    country:      job.country,
    status:       job.status,
    progress_pct: job.progress_pct,
    created_at:   job.created_at,
    started_at:   job.started_at   ?? null,
    updated_at:   job.updated_at,

    // Live pass breakdown — useful while running, cross-check after completion.
    passes: {
      completed: passesCompleted,
      failed:    passesFailed,
      pending:   passesPending,
    },
    passes_detail: ps,

    // Live token & cost snapshot (from passes that have finished so far).
    live_tokens_in:  liveTokensIn,
    live_tokens_out: liveTokensOut,
    live_cost_usd:   estimateCost(liveTokensIn, liveTokensOut),
    elapsed_ms:      elapsedMs,
  };

  if (job.startup_id)    resp.startup_id    = job.startup_id;
  if (job.error_message) resp.error_message = job.error_message;

  // Finalized metadata — only populated once the job reaches a terminal state.
  if (job.status === "completed" || job.status === "failed") {
    resp.completed_at        = job.completed_at;
    resp.duration_ms         = job.duration_ms;
    resp.total_tokens_in     = job.total_tokens_in;
    resp.total_tokens_out    = job.total_tokens_out;
    resp.estimated_cost_usd  = job.estimated_cost_usd;
    resp.passes_completed    = job.passes_completed;
    resp.passes_failed       = job.passes_failed;
    resp.pass_field_counts   = job.pass_field_counts;
    resp.total_fields_written = job.total_fields_written;
    resp.waves_fired         = job.waves_fired;
    resp.retry_attempted     = job.retry_attempted;
  }

  if (job.status === "completed" && job.startup_id) {
    resp.profile_url = `/functions/v1/get-startup/${job.startup_id}`;
  }

  return json(resp);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
