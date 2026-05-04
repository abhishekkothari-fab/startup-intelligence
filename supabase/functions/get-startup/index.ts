// supabase/functions/get-startup/index.ts
// GET /functions/v1/get-startup/:id

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { getSupabaseClient } from "../_shared/db.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS"
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const id  = url.pathname.split("/").pop();

  if (!id) return json({ error: "Missing startup id" }, 400);

  const supabase = getSupabaseClient();

  const [
    { data: startup,   error: e1 },
    { data: scores,    error: e2 },
    { data: youtube,   error: e3 },
    { data: linkedin,  error: e4 },
    { data: rawFields, error: e5 },
  ] = await Promise.all([
    supabase.from("startups").select("*").eq("id", id).single(),
    supabase.from("scores").select("*").eq("startup_id", id).order("scored_at", { ascending: false }),
    supabase.from("youtube_signals").select("*").eq("startup_id", id).order("published_date", { ascending: false }),
    supabase.from("linkedin_signals").select("*").eq("startup_id", id).order("post_date", { ascending: false }),
    supabase.from("raw_fields").select("field_name,field_pack,applicability,raw_value,data_type,source_type,source_url,confidence,applicability_reason").eq("startup_id", id),
  ]);

  if (e1) return json({ error: e1.message }, e1.code === "PGRST116" ? 404 : 500);
  if (e2 || e3 || e4 || e5) return json({ error: (e2 || e3 || e4 || e5)?.message }, 500);

  return json({
    startup,
    latest_score: scores?.[0] ?? null,
    all_scores:   scores ?? [],
    youtube:      youtube ?? [],
    linkedin:     linkedin ?? [],
    raw_summary:  rawFields ?? [],
    meta: {
      youtube_count:    youtube?.length  ?? 0,
      linkedin_count:   linkedin?.length ?? 0,
      fields_collected: rawFields?.filter(f => f.applicability === "applicable" && f.raw_value).length ?? 0,
    }
  });
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" }
  });
}
