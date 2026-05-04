// supabase/functions/profile-startup/index.ts
// POST /functions/v1/profile-startup
// Body: { company: string, country?: string, requested_by?: string }
// Returns immediately with job_id; research runs in background.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { researchStartup, PASS_PROGRESS, type PassesStatus } from "../_shared/research.ts";
import {
  getSupabaseClient,
  createJob,
  updateJobProgress,
  updatePassStatus,
  writeStartupCore,
  writeStartupPartial,
  appendRawFields,
  appendYouTubeSignals,
  appendLinkedInSignals,
  insertScores,
} from "../_shared/db.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: { company?: string; country?: string; requested_by?: string };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const { company, country = "IN", requested_by } = body;
  if (!company || typeof company !== "string" || company.trim().length < 2) {
    return json({ error: "company field is required (min 2 chars)" }, 400);
  }

  const supabase = getSupabaseClient();

  // Return cached result if profiled within 7 days
  const { data: existing } = await supabase
    .from("profiling_jobs")
    .select("id, status, startup_id, created_at")
    .ilike("company_name", company.trim())
    .eq("country", country)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const age = Date.now() - new Date(existing.created_at).getTime();
    if (age < 7 * 24 * 60 * 60 * 1000) {
      return json({
        job_id:     existing.id,
        startup_id: existing.startup_id,
        status:     "completed",
        cached:     true,
      });
    }
  }

  let jobId: string;
  try {
    jobId = await createJob(supabase, company.trim(), country, requested_by);
  } catch (e) {
    return json({ error: `Failed to create job: ${(e as Error).message}` }, 500);
  }

  EdgeRuntime.waitUntil(runResearch(jobId, company.trim(), country));

  return json({
    job_id:  jobId,
    status:  "queued",
    message: `Research started for "${company}". Poll GET /functions/v1/get-job/${jobId}`,
  }, 202);
});

async function runResearch(jobId: string, company: string, country: string): Promise<void> {
  const supabase = getSupabaseClient();
  let startupId: string | undefined;
  let passesStatus: PassesStatus = {};

  try {
    await updateJobProgress(supabase, jobId, 2, "running");

    // Resume from a failed job within the last 24 h for the same company
    const { data: failedJob } = await supabase
      .from("profiling_jobs")
      .select("passes_status, startup_id")
      .ilike("company_name", company)
      .eq("country", country)
      .eq("status", "failed")
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (failedJob?.passes_status) {
      passesStatus = failedJob.passes_status as PassesStatus;
      if (failedJob.startup_id) startupId = failedJob.startup_id;
      const done = Object.values(passesStatus).filter(p => p.status === "completed").length;
      console.log(`[${jobId}] Resuming — ${done} passes already completed, startupId=${startupId}`);
    }

    const profile = await researchStartup({
      company,
      country,
      jobId,
      existingPassesStatus: passesStatus,

      onProgress: async (pct, note) => {
        console.log(`[${jobId}] ${pct}% — ${note}`);
        await updateJobProgress(supabase, jobId, pct, "running", startupId);
      },

      onPassComplete: async (passName, partial, updatedStatus) => {
        passesStatus = updatedStatus;

        try {
          if (!startupId && partial.brand_name) {
            // First pass with real data — create the startup record
            startupId = await writeStartupCore(
              supabase,
              { ...partial, hq_country: partial.hq_country || country },
              jobId
            );
            console.log(`[${jobId}] Startup created: ${startupId}`);
            await updateJobProgress(supabase, jobId, PASS_PROGRESS[passName], "running", startupId);
          } else if (startupId) {
            // Subsequent passes — update in place and append signals
            await writeStartupPartial(supabase, startupId, partial);
            if (partial.raw_fields?.length)  await appendRawFields(supabase, startupId, partial.raw_fields);
            if (partial.youtube?.length)     await appendYouTubeSignals(supabase, startupId, partial.youtube);
            if (partial.linkedin?.length)    await appendLinkedInSignals(supabase, startupId, partial.linkedin);
            await updateJobProgress(supabase, jobId, PASS_PROGRESS[passName], "running", startupId);
          }
        } catch (e) {
          console.warn(`[${jobId}] Pass ${passName} DB write failed (non-fatal):`, e);
        }

        await updatePassStatus(supabase, jobId, updatedStatus);
      },
    });

    // Write scores after all passes complete
    if (startupId && profile.scores) {
      await insertScores(supabase, startupId, profile);
    }

    await updateJobProgress(supabase, jobId, 100, "completed", startupId);
    console.log(`[${jobId}] ✓ Completed. Startup ID: ${startupId}`);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${jobId}] Research failed:`, msg);
    await updateJobProgress(supabase, jobId, 0, "failed", startupId, msg);
    // Persist passes_status so next attempt can resume
    if (Object.keys(passesStatus).length > 0) {
      await updatePassStatus(supabase, jobId, passesStatus);
    }
  }
}
