// supabase/functions/profile-startup/index.ts  v2
// POST /functions/v1/profile-startup
// Body: { company: string, country?: string, requested_by?: string, only_passes?: string[] }
// only_passes bypasses the 7-day cache and runs only the listed passes against the existing startup record.
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

  let body: { company?: string; country?: string; requested_by?: string; only_passes?: string[] };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const { company, country = "IN", requested_by, only_passes } = body;
  if (!company || typeof company !== "string" || company.trim().length < 2) {
    return json({ error: "company field is required (min 2 chars)" }, 400);
  }

  const supabase = getSupabaseClient();

  // Return cached result if profiled within 7 days — skip if only_passes is specified
  if (!only_passes?.length) {
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
  }

  let jobId: string;
  try {
    jobId = await createJob(supabase, company.trim(), country, requested_by);
  } catch (e) {
    return json({ error: `Failed to create job: ${(e as Error).message}` }, 500);
  }

  EdgeRuntime.waitUntil(runResearch(jobId, company.trim(), country, only_passes));

  return json({
    job_id:  jobId,
    status:  "queued",
    message: `Research started for "${company}". Poll GET /functions/v1/get-job/${jobId}`,
  }, 202);
});

async function runResearch(jobId: string, company: string, country: string, onlyPasses?: string[]): Promise<void> {
  const supabase = getSupabaseClient();
  let startupId: string | undefined;
  let passesStatus: PassesStatus = {};

  try {
    await updateJobProgress(supabase, jobId, 2, "running");

    if (onlyPasses?.length) {
      // Targeted re-run: load existing startup_id from the most recent job (any status),
      // then mark all passes except the requested ones as already completed.
      const { data: prevJob } = await supabase
        .from("profiling_jobs")
        .select("startup_id")
        .ilike("company_name", company)
        .eq("country", country)
        .in("status", ["completed", "failed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (prevJob?.startup_id) startupId = prevJob.startup_id;

      const now = new Date().toISOString();
      for (const p of ["overview","founders","glassdoor","funding","products","regulatory","signals","youtube","linkedin_founder","linkedin_company"] as const) {
        if (!onlyPasses.includes(p)) {
          passesStatus[p] = { status: "completed", completed_at: now };
        }
      }
      console.log(`[${jobId}] only_passes mode: running [${onlyPasses.join(",")}], startupId=${startupId}`);
    } else {
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

      onPassStatusUpdate: async (updatedStatus) => {
        passesStatus = updatedStatus;
        await updatePassStatus(supabase, jobId, updatedStatus);
      },

      onPassComplete: async (passName, partial, updatedStatus) => {
        passesStatus = updatedStatus;

        try {
          if (!startupId && passName === "overview") {
            // Create startup on overview completion; fall back to requested company name
            // if Claude returned null for brand_name (e.g. web search gave poor results)
            startupId = await writeStartupCore(
              supabase,
              { ...partial, brand_name: partial.brand_name || company, hq_country: partial.hq_country || country },
              jobId
            );
            console.log(`[${jobId}] Startup created: ${startupId}`);
            // Also write any signals that came with the first pass (e.g. mock mode)
            if (partial.raw_fields?.length)  await appendRawFields(supabase, startupId, partial.raw_fields);
            if (partial.youtube?.length)     await appendYouTubeSignals(supabase, startupId, partial.youtube);
            if (partial.linkedin?.length)    await appendLinkedInSignals(supabase, startupId, partial.linkedin);
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
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[${jobId}] Pass ${passName} DB write FAILED: ${msg}`);
          // Surface DB errors into passes_status so they're visible without logs
          updatedStatus[passName] = {
            ...updatedStatus[passName],
            error: `DB write failed: ${msg}`,
          };
        }

        await updatePassStatus(supabase, jobId, updatedStatus);
      },
    });

    // Write scores only on full runs — only_passes has incomplete merged data
    if (startupId && profile.scores && !onlyPasses?.length) {
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
