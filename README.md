# Startup Intelligence System — Supabase Backend

A fully serverless backend for the Startup Intelligence profiling system. Trigger a profile by company name, wait for research to complete, then fetch structured data to power your frontend.

---

## Architecture

```
POST /profile-startup   →  Creates job → Returns job_id immediately
                            ↓  (background)
                        Claude runs 9-pass research (2–5 min)
                            ↓
                        Writes to Postgres (6 tables)
                            ↓
                        Job status → completed

GET /get-job/{job_id}   →  Poll for progress (0–100%) and startup_id
GET /get-startup/{id}   →  Full profile: startup + scores + YouTube + LinkedIn
GET /get-startups       →  Leaderboard with filtering + pagination
```

---

## Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed: `npm install -g supabase`
- Supabase project created at [supabase.com](https://supabase.com)
- Anthropic API key (claude-sonnet-4-6 access required)

---

## Setup

### 1. Link your Supabase project

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### 2. Run the migration

```bash
supabase db push
# or manually via Supabase Dashboard → SQL Editor → paste 001_schema.sql
```

### 3. Set environment variables

In Supabase Dashboard → Project Settings → Edge Functions → Secrets, add:

| Variable | Value |
|----------|-------|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `SUPABASE_URL` | Auto-set by Supabase runtime |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-set by Supabase runtime |

For local development, create `supabase/.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=http://localhost:54321
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
```

### 4. Deploy edge functions

```bash
# Deploy all functions at once
supabase functions deploy profile-startup
supabase functions deploy get-startup
supabase functions deploy get-startups
supabase functions deploy get-job
```

---

## API Reference

### POST /functions/v1/profile-startup

Trigger a new profile research run.

**Request:**
```json
{
  "company": "IDfy",
  "country": "IN",
  "requested_by": "sneha@andmarketing.co"
}
```

**Response (202 Accepted):**
```json
{
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "message": "Research started for 'IDfy'. Poll GET /functions/v1/get-job/550e... for progress."
}
```

**Notes:**
- Returns immediately — research runs in background (2–5 minutes)
- If a completed profile exists for the same company within 7 days, returns `cached: true` with the existing `startup_id`
- `country` defaults to `"IN"` (India)

---

### GET /functions/v1/get-job/{job_id}

Poll for research progress.

**Response:**
```json
{
  "job_id": "550e8400...",
  "company_name": "IDfy",
  "status": "running",
  "progress_pct": 65,
  "created_at": "2026-04-27T10:00:00Z",
  "updated_at": "2026-04-27T10:03:20Z"
}
```

**Status values:**
| Status | Meaning |
|--------|---------|
| `queued` | Job created, research not yet started |
| `running` | Research in progress (progress_pct 2–95) |
| `completed` | All data written to DB. `startup_id` and `profile_url` are now set |
| `failed` | Research failed. `error_message` explains why |

**On completion:**
```json
{
  "status": "completed",
  "progress_pct": 100,
  "startup_id": "abc123...",
  "profile_url": "/functions/v1/get-startup/abc123..."
}
```

**Polling pattern (JavaScript):**
```javascript
async function pollJob(jobId, onProgress) {
  const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
  const ANON_KEY = "your-anon-key";

  while (true) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/get-job/${jobId}`, {
      headers: { Authorization: `Bearer ${ANON_KEY}` }
    });
    const job = await res.json();

    onProgress?.(job.progress_pct, job.status);

    if (job.status === "completed") return job.startup_id;
    if (job.status === "failed")    throw new Error(job.error_message);

    await new Promise(r => setTimeout(r, 5000)); // poll every 5s
  }
}
```

---

### GET /functions/v1/get-startup/{id}

Fetch a full startup profile.

**Response shape:**
```json
{
  "startup": {
    "id": "abc123",
    "brand_name": "IDfy",
    "stage": "growth",
    "industry": "BFSI",
    "revenue_inr_cr": 191,
    "glassdoor_rating": 3.9,
    ...
  },
  "latest_score": {
    "composite_score": 88,
    "dim_founder": 88,
    "dim_traction": 95,
    "data_quality_pct": 94.7,
    ...
  },
  "youtube": [
    {
      "video_title": "Ashok Hariharan on Building India's Identity Stack",
      "video_type": "founder_on_camera",
      "is_own_channel": false,
      ...
    }
  ],
  "linkedin": [
    {
      "pass": 9,
      "author_name": "Karthik Reddy",
      "signal_type": "ipo_signal",
      "post_text": "IDfy is IPO-ready...",
      "confidence": 0.95
    }
  ],
  "meta": {
    "youtube_count": 10,
    "linkedin_count": 8,
    "fields_collected": 36
  }
}
```

---

### GET /functions/v1/get-startups

Paginated leaderboard.

**Query params:**
| Param | Default | Options |
|-------|---------|---------|
| `page` | 1 | Any positive integer |
| `limit` | 20 | 1–50 |
| `stage` | — | pre_seed, seed, series_a, series_b_plus, growth |
| `industry` | — | BFSI, AI_Infra, D2C, Health, Logistics, EdTech_HRTech |
| `sort` | composite_score | composite_score, revenue_inr_cr, team_size, total_raised_usd_m |

**Example:** `/get-startups?stage=series_a&sort=revenue_inr_cr&page=1&limit=10`

**Response:**
```json
{
  "data": [ { ...startup with scores... } ],
  "total": 24,
  "page": 1,
  "limit": 10,
  "pages": 3
}
```

---

## Frontend Integration

### Using the anon key (public read)

All read endpoints (`get-startup`, `get-startups`, `get-job`) are publicly readable.
The `profile-startup` POST endpoint should be protected — either use a server-side proxy or the anon key with RLS.

```javascript
const SUPABASE_URL  = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_ANON = "your-anon-key"; // safe to expose in frontend

// Trigger profile
const trigger = await fetch(`${SUPABASE_URL}/functions/v1/profile-startup`, {
  method:  "POST",
  headers: {
    Authorization:  `Bearer ${SUPABASE_ANON}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ company: "Nat Habit", country: "IN" })
});
const { job_id } = await trigger.json();

// Poll until complete
const startupId = await pollJob(job_id, (pct) => console.log(`${pct}%`));

// Fetch profile
const profile = await fetch(`${SUPABASE_URL}/functions/v1/get-startup/${startupId}`, {
  headers: { Authorization: `Bearer ${SUPABASE_ANON}` }
}).then(r => r.json());

// profile.startup, profile.latest_score, profile.youtube, profile.linkedin are ready
```

---

## Local Development

```bash
# Start Supabase locally
supabase start

# Serve all functions locally (hot reload)
supabase functions serve --env-file supabase/.env.local

# Test the trigger endpoint
curl -X POST http://localhost:54321/functions/v1/profile-startup \
  -H "Content-Type: application/json" \
  -d '{ "company": "Nat Habit", "country": "IN" }'
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `profiling_jobs` | Job tracking. Poll for status. |
| `startups` | Master record per company. Classification + financials. |
| `scores` | Versioned scoring rows. 6 dimensions + composite + 12 ratios. |
| `raw_fields` | Every collected data point with source, confidence, applicability. |
| `youtube_signals` | One row per video found in Pass 7. |
| `linkedin_signals` | Founder posts (Pass 8) + company mentions (Pass 9). |

**Useful views:**
- `leaderboard` — all startups ranked by composite score, pre-joined with latest score
- `startup_full` — single startup with all related data as JSON aggregates

---

## Skill Version

This backend implements **Startup Intelligence Profile Skill v3** — 9-pass research including:
- Passes 1–6: Standard web research (overview, founders, funding, products, regulatory, signals)
- Pass 7: YouTube (video count, types, candid content detection)
- Pass 8: LinkedIn founder posts (traction claims, hiring signals, founder philosophy)
- Pass 9: LinkedIn company mentions (investor validation, partner announcements)
- Pass 2 includes Glassdoor one-liner (rating, review count, culture themes from SERP)
