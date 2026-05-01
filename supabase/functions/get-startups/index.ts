// supabase/functions/get-startups/index.ts
// GET /functions/v1/get-startups
// Query params:
//   ?page=1&limit=20            — pagination (default page=1, limit=20)
//   ?stage=series_a             — filter by stage
//   ?industry=BFSI              — filter by industry
//   ?sort=composite_score|revenue_inr_cr|team_size  — sort field (default: composite_score)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseClient } from "../_shared/db.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url      = new URL(req.url);
  const page     = Math.max(1, parseInt(url.searchParams.get("page")  ?? "1"));
  const limit    = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") ?? "20")));
  const stage    = url.searchParams.get("stage");
  const industry = url.searchParams.get("industry");
  const sortBy   = url.searchParams.get("sort") ?? "composite_score";

  const ALLOWED_SORTS = ["composite_score", "revenue_inr_cr", "team_size", "total_raised_usd_m"];
  const sort = ALLOWED_SORTS.includes(sortBy) ? sortBy : "composite_score";

  const supabase = getSupabaseClient();

  // Use the leaderboard view — pre-joined with latest score
  let query = supabase
    .from("leaderboard")
    .select("*", { count: "exact" });

  if (stage)    query = query.eq("stage", stage);
  if (industry) query = query.eq("industry", industry);

  query = query
    .order(sort, { ascending: false, nullsFirst: false })
    .range((page - 1) * limit, page * limit - 1);

  const { data, error, count } = await query;

  if (error) return json({ error: error.message }, 500);

  return json({
    data:        data ?? [],
    total:       count ?? 0,
    page,
    limit,
    pages:       Math.ceil((count ?? 0) / limit),
    filters:     { stage, industry },
    sort_by:     sort
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
