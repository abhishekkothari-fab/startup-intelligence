// supabase/functions/get-job/index.ts
// GET /functions/v1/get-job/{job_id}
// Returns: { job_id, status, progress_pct, startup_id?, error_message?, company_name }
// Frontend polls this every 5s until status = "completed" or "failed"

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseClient } from "../_shared/db.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

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
    .select("id, company_name, country, status, progress_pct, startup_id, error_message, created_at, updated_at")
    .eq("id", jobId)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);
  if (!job)  return json({ error: `Job ${jobId} not found` }, 404);

  const resp: Record<string, unknown> = {
    job_id:       job.id,
    company_name: job.company_name,
    country:      job.country,
    status:       job.status,
    progress_pct: job.progress_pct,
    created_at:   job.created_at,
    updated_at:   job.updated_at
  };

  if (job.startup_id)    resp.startup_id    = job.startup_id;
  if (job.error_message) resp.error_message = job.error_message;

  // If completed, include a convenience link to the full profile endpoint
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
