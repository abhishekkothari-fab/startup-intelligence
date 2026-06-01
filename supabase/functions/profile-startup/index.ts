// supabase/functions/profile-startup/index.ts  v3
// POST /functions/v1/profile-startup
// Body: { company: string, country?: string, requested_by?: string, only_passes?: string[] }
// Internal self-chain params (do not use externally): { job_id: string, _wave: 1|2|3 }
// Returns immediately with job_id; research runs in background across up to 3 chained invocations.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { researchStartup } from "../_shared/research.ts";
import { PASS_PROGRESS, type PassesStatus, type StartupProfile } from "../_shared/types.ts";
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
  finalizeJob,
} from "../_shared/db.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Each wave runs in its own 150s EdgeRuntime window, bypassing the free-plan limit.
const WAVE_PASSES: Record<number, string[]> = {
  1: ["overview"],
  2: ["founders", "glassdoor"],
  3: ["funding", "regulatory"],
  4: ["products"],
  5: ["youtube", "signals"],
  6: ["linkedin"],
}
const TOTAL_WAVES = 6

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: {
    company?: string;
    country?: string;
    requested_by?: string;
    only_passes?: string[];
    job_id?: string;
    _wave?: number;
    _retry?: boolean;
    force_haiku?: boolean;
  };
  try { body = await req.json(); }
  catch { return json({ error: "Invalid JSON body" }, 400); }

  const { company, country = "IN", requested_by, only_passes, job_id: existingJobId, _wave, _retry, force_haiku } = body;
  if (!company || typeof company !== "string" || company.trim().length < 2) {
    return json({ error: "company field is required (min 2 chars)" }, 400);
  }

  const supabase = getSupabaseClient();

  // ── Internal wave call ──────────────────────────────────────────────────────
  // Dispatched by the previous wave; reuses existing job, skips cache check.
  if (_wave !== undefined && existingJobId) {
    const wavePasses = WAVE_PASSES[_wave]
    if (!wavePasses) return json({ error: `Unknown wave ${_wave}` }, 400);
    console.log(`[wave ${_wave}] company=${company} job=${existingJobId}`)
    EdgeRuntime.waitUntil(runResearch(existingJobId, company.trim(), country, wavePasses, _wave, false, !!force_haiku));
    return json({ job_id: existingJobId, status: "running" }, 202);
  }

  // ── Internal targeted-rerun call (self-called for a fresh 150s window) ──────
  // User-facing only_passes calls include a job_id via the self-call below;
  // external callers never supply job_id, so this path is safe to treat as internal.
  if (existingJobId && only_passes?.length) {
    console.log(`[targeted-rerun] company=${company} job=${existingJobId} passes=[${only_passes.join(",")}] retry=${!!_retry}`)
    EdgeRuntime.waitUntil(runResearch(existingJobId, company.trim(), country, only_passes, undefined, !!_retry, !!force_haiku));
    return json({ job_id: existingJobId, status: "running" }, 202);
  }

  // ── Return cached result if profiled within 7 days ──────────────────────────
  if (!only_passes?.length) {
    const { data: existing } = await supabase
      .from("profiling_jobs")
      .select("id, status, startup_id, created_at, passes_status")
      .ilike("company_name", company.trim())
      .eq("country", country)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const age = Date.now() - new Date(existing.created_at).getTime();
      const completedCount = Object.values(existing.passes_status || {}).filter((p: any) => p.status === "completed").length;
      if (age < 7 * 24 * 60 * 60 * 1000 && completedCount >= 8) {
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

  if (only_passes?.length) {
    // User-facing targeted re-run: self-call so each pass gets a fresh 150s window.
    EdgeRuntime.waitUntil(fireOnlyPasses(jobId, company.trim(), country, only_passes, false, !!force_haiku));
  } else {
    // Fresh full run: kick off wave 1 via self-call (each wave gets a fresh 150s window).
    EdgeRuntime.waitUntil(fireWave(1, jobId, company.trim(), country, !!force_haiku));
  }

  return json({
    job_id:  jobId,
    status:  "queued",
    message: `Research started for "${company}". Poll GET /functions/v1/get-job/${jobId}`,
  }, 202);
});

async function fireWave(wave: number, jobId: string, company: string, country: string, forceHaiku = false): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/profile-startup`
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ company, country, job_id: jobId, _wave: wave, ...(forceHaiku ? { force_haiku: true } : {}) }),
    })
    console.log(`[${jobId}] Fired wave ${wave} → HTTP ${res.status}`)
  } catch (e) {
    console.error(`[${jobId}] Failed to fire wave ${wave}: ${e}`)
  }
}

async function fireOnlyPasses(jobId: string, company: string, country: string, passes: string[], isRetry = false, forceHaiku = false): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/profile-startup`
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ company, country, job_id: jobId, only_passes: passes, _retry: isRetry, ...(forceHaiku ? { force_haiku: true } : {}) }),
    })
    console.log(`[${jobId}] Fired only_passes=[${passes.join(",")}] retry=${isRetry} → HTTP ${res.status}`)
  } catch (e) {
    console.error(`[${jobId}] Failed to fire only_passes: ${e}`)
  }
}

async function runResearch(
  jobId: string,
  company: string,
  country: string,
  onlyPasses?: string[],
  waveNum?: number,
  isRetry = false,
  forceHaiku = false
): Promise<void> {
  const supabase = getSupabaseClient();
  let startupId: string | undefined;
  let passesStatus: PassesStatus = {};
  let initialMerged: Partial<StartupProfile> = {};
  // Tracks passes pre-marked in-memory so the batch runner skips them.
  // Must never be written to DB — future waves would see them as completed and skip their passes.
  const preMarked = new Set<string>();
  // Raw_fields written to DB per pass, for job metadata.
  const passFieldCounts: Record<string, number> = {};

  // Strip pre-marks before any DB write so future waves aren't poisoned.
  const forDB = (s: PassesStatus): PassesStatus =>
    preMarked.size === 0 ? s : Object.fromEntries(Object.entries(s).filter(([p]) => !preMarked.has(p)));

  try {
    // setStartedAt=true only on the first wave (or a fresh non-retry run) to avoid overwriting.
    const setStartedAt = waveNum === 1 || (waveNum === undefined && !isRetry);
    await updateJobProgress(supabase, jobId, 2, "running", undefined, undefined, setStartedAt);

    if (onlyPasses?.length) {
      if (waveNum !== undefined || isRetry) {
        // Internal wave call or auto-retry: get startup_id and full passes_status from this job.
        // Auto-retry must read full passes_status so non-retry passes aren't pre-marked tokenless,
        // which would cause finalizeJob to undercount total tokens and cost.
        const { data: thisJob } = await supabase
          .from("profiling_jobs")
          .select("startup_id, passes_status")
          .eq("id", jobId)
          .single();
        if (thisJob?.startup_id) startupId = thisJob.startup_id;
        if (thisJob?.passes_status) passesStatus = thisJob.passes_status as PassesStatus;
      } else {
        // User-facing only_passes: get startup_id from most recent completed/failed job.
        // Exclude "running" to avoid matching the current job itself (which has startup_id=null).
        const { data: prevJob } = await supabase
          .from("profiling_jobs")
          .select("startup_id")
          .ilike("company_name", `%${company}%`)
          .eq("country", country)
          .in("status", ["completed", "failed"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (prevJob?.startup_id) startupId = prevJob.startup_id;
      }

      // Pre-mark all non-requested passes as completed so the batch runner skips them.
      // Only mark passes not already present in DB state (from prior waves).
      const now = new Date().toISOString();
      for (const p of ["overview","founders","glassdoor","funding","products","regulatory","signals","youtube","linkedin"] as const) {
        if (!onlyPasses.includes(p) && !passesStatus[p]) {
          passesStatus[p] = { status: "completed", completed_at: now };
          preMarked.add(p);
        }
      }
      console.log(`[${jobId}] wave=${waveNum ?? "user"} passes=[${onlyPasses.join(",")}] startupId=${startupId}`);
    } else {
      // Resume from a failed job within the last 24 h for the same company.
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

    // Hard guard: never spend tokens on only_passes if there is no startup to write to.
    // Exception: overview is the pass that CREATES the startup, so it doesn't need a prior one.
    if (onlyPasses?.length && !startupId && !onlyPasses.includes("overview")) {
      await finalizeJob(supabase, jobId, {
        status: "failed",
        errorMessage: `No existing startup found for "${company}" (${country}) — cannot run only_passes without a linked startup record. Run a full profile first.`,
        passesStatus: forDB(passesStatus),
        passFieldCounts,
        wavesFired: 0,
        retryAttempted: isRetry,
      });
      console.error(`[${jobId}] Aborted — only_passes requires an existing startup, none found for "${company}"`);
      return;
    }

    // Seed initialMerged from DB so computeScores has full data on partial/wave runs.
    if (startupId) {
      const [rawRes, stRes] = await Promise.all([
        supabase.from("raw_fields")
          .select("field_name,field_pack,applicability,applicability_reason,raw_value,data_type,source_type,source_url,confidence")
          .eq("startup_id", startupId),
        supabase.from("startups")
          .select("auto_stage,auto_industry,auto_industry_sub,website,legal_name,total_raised_usd_m,revenue_inr_cr,revenue_fy,is_profitable,team_size,client_count,glassdoor_rating,founded_date")
          .eq("id", startupId)
          .single(),
      ]);
      if (rawRes.data?.length) {
        initialMerged.raw_fields = rawRes.data as StartupProfile["raw_fields"];
      }
      if (stRes.data) {
        Object.assign(initialMerged, stRes.data);
      }
      console.log(`[${jobId}] Seeded initialMerged from DB: ${rawRes.data?.length ?? 0} raw_fields`);
    }

    const profile = await researchStartup({
      company,
      country,
      jobId,
      existingPassesStatus: passesStatus,
      initialMerged,
      forceModel: forceHaiku ? "claude-haiku-4-5-20251001" : undefined,

      onProgress: async (pct, note) => {
        console.log(`[${jobId}] ${pct}% — ${note}`);
        await updateJobProgress(supabase, jobId, pct, "running", startupId);
      },

      onPassStatusUpdate: async (updatedStatus) => {
        passesStatus = updatedStatus;
        await updatePassStatus(supabase, jobId, forDB(updatedStatus));
      },

      onPassComplete: async (passName, partial, updatedStatus) => {
        passesStatus = updatedStatus;

        try {
          if (!startupId && passName === "overview") {
            startupId = await writeStartupCore(
              supabase,
              { ...partial, brand_name: partial.brand_name || company, hq_country: partial.hq_country || country },
              jobId
            );
            console.log(`[${jobId}] Startup created: ${startupId}`);
            await updateJobProgress(supabase, jobId, PASS_PROGRESS[passName], "running", startupId);
            if (partial.raw_fields?.length)  { await appendRawFields(supabase, startupId, partial.raw_fields); passFieldCounts[passName] = (passFieldCounts[passName] ?? 0) + partial.raw_fields.length; }
            if (partial.youtube?.length)     await appendYouTubeSignals(supabase, startupId, partial.youtube);
            if (partial.linkedin?.length)    await appendLinkedInSignals(supabase, startupId, partial.linkedin);
          } else if (startupId) {
            await writeStartupPartial(supabase, startupId, partial);
            await updateJobProgress(supabase, jobId, PASS_PROGRESS[passName], "running", startupId);
            if (partial.raw_fields?.length)  { await appendRawFields(supabase, startupId, partial.raw_fields); passFieldCounts[passName] = (passFieldCounts[passName] ?? 0) + partial.raw_fields.length; }
            if (partial.youtube?.length)     await appendYouTubeSignals(supabase, startupId, partial.youtube);
            if (partial.linkedin?.length)    await appendLinkedInSignals(supabase, startupId, partial.linkedin);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[${jobId}] Pass ${passName} DB write FAILED: ${msg}`);
          updatedStatus[passName] = {
            ...updatedStatus[passName],
            error: `DB write failed: ${msg}`,
          };
        }

        await updatePassStatus(supabase, jobId, forDB(updatedStatus));
      },
    });

    const isLastWave = waveNum === undefined || waveNum === TOTAL_WAVES || Deno.env.get("MOCK_ANTHROPIC") === "true"

    // Write scores after every wave — gives clients a live preview as data accumulates.
    if (startupId && profile.scores) {
      await insertScores(supabase, startupId, profile);
    }

    if (isLastWave) {
      // Auto-retry any failed passes once (isRetry prevents infinite loops).
      if (!isRetry) {
        const failedPasses = Object.entries(passesStatus)
          .filter(([p, v]) => v.status === "failed" && !preMarked.has(p))
          .map(([p]) => p)
        if (failedPasses.length > 0) {
          console.log(`[${jobId}] Auto-retrying ${failedPasses.length} failed passes: [${failedPasses.join(",")}]`);
          await fireOnlyPasses(jobId, company, country, failedPasses, true, forceHaiku);
          // Job stays "running" — the retry wave will finalize.
          return;
        }
      }
      await finalizeJob(supabase, jobId, {
        status: "completed",
        startupId,
        passesStatus: forDB(passesStatus),
        passFieldCounts,
        wavesFired: waveNum ?? 1,
        retryAttempted: isRetry,
      });
      console.log(`[${jobId}] ✓ Completed. Startup ID: ${startupId}`);
    } else {
      // Hand off to the next wave.
      console.log(`[${jobId}] Wave ${waveNum} done → firing wave ${waveNum! + 1}`);
      await fireWave(waveNum! + 1, jobId, company, country, forceHaiku);
    }

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${jobId}] Research failed:`, msg);
    const isLastWave = waveNum === undefined || waveNum === TOTAL_WAVES || Deno.env.get("MOCK_ANTHROPIC") === "true"
    const isFatal = msg.includes("ANTHROPIC_CREDITS_EXHAUSTED")
    if (Object.keys(passesStatus).length > 0) {
      await updatePassStatus(supabase, jobId, forDB(passesStatus));
    }
    if (isLastWave || isFatal) {
      await finalizeJob(supabase, jobId, {
        status: "failed",
        startupId,
        errorMessage: msg,
        passesStatus: forDB(passesStatus),
        passFieldCounts,
        wavesFired: waveNum ?? 1,
        retryAttempted: isRetry,
      });
    } else {
      // Fire next wave even on non-fatal failure so partial data keeps accumulating.
      console.log(`[${jobId}] Wave ${waveNum} errored, firing wave ${waveNum! + 1} anyway`);
      await fireWave(waveNum! + 1, jobId, company, country, forceHaiku);
    }
  }
}
