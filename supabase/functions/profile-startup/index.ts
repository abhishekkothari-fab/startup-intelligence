// supabase/functions/profile-startup/index.ts
// POST /functions/v1/profile-startup
// Body: { company: string, country?: string, requested_by?: string }
// Returns: { job_id: string, status: "queued" } immediately
// Research runs in background — poll GET /functions/v1/get-job/{job_id} for status

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { researchStartup } from "../_shared/research.ts";
import {
  getSupabaseClient,
  createJob,
  updateJobProgress,
  writeStartupToDb
} from "../_shared/db.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  let body: { company?: string; country?: string; requested_by?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const { company, country = "IN", requested_by } = body;

  if (!company || typeof company !== "string" || company.trim().length < 2) {
    return new Response(JSON.stringify({ error: "company field is required (min 2 chars)" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  const supabase = getSupabaseClient();

  // Check if a recent successful job already exists for this company
  const { data: existingJob } = await supabase
    .from("profiling_jobs")
    .select("id, status, startup_id, created_at")
    .ilike("company_name", company.trim())
    .eq("country", country)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // If profiled within the last 7 days, return the existing result
  if (existingJob) {
    const age = Date.now() - new Date(existingJob.created_at).getTime();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    if (age < sevenDays) {
      return new Response(JSON.stringify({
        job_id:     existingJob.id,
        startup_id: existingJob.startup_id,
        status:     "completed",
        cached:     true,
        message:    "Profile already exists. Use GET /functions/v1/get-startup/{startup_id}"
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
      });
    }
  }

  // Create job record and return immediately
  let jobId: string;
  try {
    jobId = await createJob(supabase, company.trim(), country, requested_by);
  } catch (e) {
    return new Response(JSON.stringify({ error: `Failed to create job: ${e.message}` }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
    });
  }

  // Run research in background — don't await
  EdgeRuntime.waitUntil(runResearch(jobId, company.trim(), country));

  return new Response(JSON.stringify({
    job_id:  jobId,
    status:  "queued",
    message: `Research started for "${company}". Poll GET /functions/v1/get-job/${jobId} for progress.`
  }), {
    status: 202,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" }
  });
});

async function runResearch(jobId: string, company: string, country: string): Promise<void> {
  const supabase = getSupabaseClient();

  try {
    await updateJobProgress(supabase, jobId, 2, "running");

    const profile = await researchStartup({
      company,
      country,
      jobId,
      onProgress: async (pct, note) => {
        console.log(`[${jobId}] ${pct}% — ${note}`);
        await updateJobProgress(supabase, jobId, pct, "running");
      }
    });

    await updateJobProgress(supabase, jobId, 85, "running");

    const startupId = await writeStartupToDb(supabase, profile, jobId);

    await updateJobProgress(supabase, jobId, 100, "completed", startupId);

    console.log(`[${jobId}] ✓ Completed. Startup ID: ${startupId}`);

  } catch (err) {
    console.error(`[${jobId}] Research failed:`, err);
    await updateJobProgress(
      supabase, jobId, 0, "failed", undefined,
      err instanceof Error ? err.message : String(err)
    );
  }
}
