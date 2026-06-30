// supabase/functions/get-startups/index.ts
// GET /functions/v1/get-startups
// Query params:
//   ?page=1&limit=20            — pagination (default page=1, limit=20)
//   ?stage=series_a             — filter by stage
//   ?industry=BFSI              — filter by industry (ilike match)
//   ?scorecard=saas             — filter by primary_scorecard
//   ?profiled_by=email@x.com   — filter to startups triggered by this user
//   ?sort=composite_score       — sort field
//   ?search=razorpay            — partial match on brand_name (case-insensitive)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseClient } from "../_shared/db.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url        = new URL(req.url);
  const page       = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"));
  const limit      = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const stageRaw     = url.searchParams.get("stage");
  const industryRaw  = url.searchParams.get("industry");
  const scorecardRaw = url.searchParams.get("scorecard");
  const profiledBy   = url.searchParams.get("profiled_by");

  // Multi-value: comma-separated lists
  const stages     = stageRaw     ? stageRaw.split(",").map(s => s.trim()).filter(Boolean)     : [];
  const industries = industryRaw  ? industryRaw.split(",").map(s => s.trim()).filter(Boolean)  : [];
  const scorecards = scorecardRaw ? scorecardRaw.split(",").map(s => s.trim()).filter(Boolean) : [];
  const stage      = stageRaw;     // kept for response metadata
  const industry   = industryRaw;
  const scorecard  = scorecardRaw;
  const search     = url.searchParams.get("search");
  const sortBy     = url.searchParams.get("sort") ?? "composite_score";

  const ALLOWED_SORTS = ["composite_score", "revenue_inr_cr", "team_size", "total_raised_usd_m", "data_quality_pct", "brand_name", "last_collected_at", "last_scored_at"];
  const sort      = ALLOWED_SORTS.includes(sortBy) ? sortBy : "composite_score";
  const dirParam  = url.searchParams.get("dir") ?? "desc";
  const ascending = dirParam === "asc";

  const supabase = getSupabaseClient();

  // If filtering by profiled_by, first get the startup IDs from profiling_jobs
  let allowedIds: string[] | null = null;
  if (profiledBy) {
    const { data: jobs } = await supabase
      .from("profiling_jobs")
      .select("startup_id")
      .eq("requested_by", profiledBy)
      .not("startup_id", "is", null);
    allowedIds = (jobs ?? []).map((j: { startup_id: string }) => j.startup_id).filter(Boolean);
    if (allowedIds.length === 0) {
      return json({ data: [], total: 0, page, limit, pages: 0, filters: { stage, industry, scorecard }, sort_by: sort });
    }
  }

  let query = supabase
    .from("leaderboard")
    .select("*", { count: "exact" });

  if (stages.length > 0)     query = query.in("stage", stages);
  if (industries.length > 0) query = query.or(industries.map(i => `industry.ilike.%${i}%`).join(","));
  if (scorecards.length > 0) query = query.in("primary_scorecard", scorecards);
  if (search)                query = query.ilike("brand_name", `%${search}%`);
  if (allowedIds)            query = query.in("id", allowedIds);

  query = query
    .order(sort, { ascending, nullsFirst: false })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;

  if (error) return json({ error: error.message }, 500);

  return json({
    data:    data ?? [],
    total:   count ?? 0,
    page,
    limit,
    pages:   Math.ceil((count ?? 0) / limit),
    filters: { stage, industry, scorecard },
    sort_by: sort
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
