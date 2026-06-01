#!/usr/bin/env -S deno run --allow-net --allow-env
// Usage: deno run --allow-net --allow-env scripts/test-profile.ts "Razorpay" [IN]
//
// Required env vars:
//   SUPABASE_URL       https://<ref>.supabase.co
//   SUPABASE_ANON_KEY  eyJ...

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_ANON_KEY before running.")
  Deno.exit(1)
}

const company = Deno.args[0]
const country  = Deno.args[1] ?? "IN"
const extraJson = Deno.args[2] ? JSON.parse(Deno.args[2]) : {}

if (!company) {
  console.error("Usage: deno run --allow-net --allow-env scripts/test-profile.ts <company> [country] [extraJsonParams]")
  console.error('  e.g. test-profile.ts "Razorpay" IN \'{"only_passes":["overview","glassdoor"],"force_haiku":true}\'')
  Deno.exit(1)
}

// ── Trigger the job ───────────────────────────────────────────────
const label = Object.keys(extraJson).length ? ` [${JSON.stringify(extraJson)}]` : ""
console.log(`\nProfiling: ${company} (${country})${label}`)
const res = await fetch(`${SUPABASE_URL}/functions/v1/profile-startup`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ company, country, ...extraJson }),
})

if (!res.ok) {
  console.error("Failed to start job:", await res.text())
  Deno.exit(1)
}

const { job_id, status: initialStatus, cached } = await res.json()

if (cached || initialStatus === "completed") {
  console.log(`✓ Cached result — job_id: ${job_id}`)
  Deno.exit(0)
}

console.log(`job_id:  ${job_id}`)
console.log("Waiting for updates via Realtime...\n")

// ── Subscribe to Realtime ─────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const PASS_ORDER = [
  "overview", "founders", "glassdoor", "funding",
  "products", "regulatory", "signals", "youtube", "linkedin",
]

type PassEntry = {
  status: string
  tokens_in?: number
  tokens_out?: number
  error?: string
}

const seen = new Set<string>()

await new Promise<void>((resolve) => {
  const channel = supabase
    .channel("job-progress")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "profiling_jobs",
        filter: `id=eq.${job_id}`,
      },
      (payload) => {
        const job = payload.new as {
          status: string
          progress_pct: number
          passes_status: Record<string, PassEntry>
        }

        for (const pass of PASS_ORDER) {
          const p = job.passes_status?.[pass]
          if (!p || seen.has(pass)) continue
          if (p.status === "completed") {
            const tok = p.tokens_in != null ? ` (${p.tokens_in}↑ ${p.tokens_out}↓ tok)` : ""
            console.log(`  ✓ ${pass.padEnd(12)}  [${String(job.progress_pct).padStart(2)}%]${tok}`)
            seen.add(pass)
          } else if (p.status === "failed") {
            console.log(`  ✗ ${pass.padEnd(12)}  FAILED: ${p.error ?? "unknown"}`)
            seen.add(pass)
          }
        }

        if (job.status === "completed" || job.status === "failed") {
          const total = [...Object.values(job.passes_status ?? {})]
            .reduce((s, p) => ({ in: s.in + (p.tokens_in ?? 0), out: s.out + (p.tokens_out ?? 0) }), { in: 0, out: 0 })
          const icon = job.status === "completed" ? "✓" : "✗"
          console.log(`\n${icon} ${job.status}   total tokens: ${total.in.toLocaleString()}↑ ${total.out.toLocaleString()}↓`)
          console.log(`  job_id: ${job_id}`)
          channel.unsubscribe()
          resolve()
        }
      }
    )
    .subscribe()
})
