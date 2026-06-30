"use client"
import { useEffect, useState, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { getStartups, triggerProfile, pollJob, type StartupRow } from "@/lib/api"
import { createClient } from "@/lib/supabase-auth"

// ── Scorecard display ────────────────────────────────────────────
const SCORECARD_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  saas:        { label: "B2B SaaS",    color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  d2c:         { label: "D2C",         color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  marketplace: { label: "Marketplace", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  fintech:     { label: "FinTech",     color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  deeptech:    { label: "Deep Tech",   color: "#4F46E5", bg: "#EEF2FF", border: "#C7D2FE" },
  base:        { label: "General",     color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
}

// ── Stage display ────────────────────────────────────────────────
const STAGE_LABELS: Record<string, string> = {
  pre_seed:      "Pre-seed",
  seed:          "Seed",
  series_a:      "Series A",
  series_b_plus: "Series B+",
  growth:        "Growth",
  pre_ipo:       "Pre-IPO",
  ipo:           "Listed",
}

const STAGE_BADGE: Record<string, { bg: string; color: string; border: string }> = {
  pre_seed:      { bg: "#F3F4F6", color: "#4B5563", border: "#D1D5DB" },
  seed:          { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  series_a:      { bg: "#DBEAFE", color: "#1E40AF", border: "#93C5FD" },
  series_b_plus: { bg: "#1E3A5F", color: "#BFDBFE", border: "#1E3A5F" },
  growth:        { bg: "#0F172A", color: "#FFFFFF", border: "#0F172A" },
  pre_ipo:       { bg: "#F5F3FF", color: "#6D28D9", border: "#C4B5FD" },
  ipo:           { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
}

// ── Filter options ───────────────────────────────────────────────
const STAGE_OPTIONS = [
  { value: "",              label: "All stages" },
  { value: "pre_seed",      label: "Pre-seed" },
  { value: "seed",          label: "Seed" },
  { value: "series_a",      label: "Series A" },
  { value: "series_b_plus", label: "Series B+" },
  { value: "growth",        label: "Growth" },
  { value: "pre_ipo",       label: "Pre-IPO" },
  { value: "ipo",           label: "Listed / IPO" },
]

const INDUSTRY_OPTIONS = [
  { value: "",              label: "All industries" },
  { value: "BFSI",          label: "BFSI" },
  { value: "FinTech",       label: "FinTech" },
  { value: "Payments",      label: "Payments" },
  { value: "Lending",       label: "Lending" },
  { value: "NBFC",          label: "NBFC" },
  { value: "HealthTech",    label: "HealthTech" },
  { value: "MedTech",       label: "MedTech" },
  { value: "SaaS",          label: "SaaS" },
  { value: "AI_Infra",      label: "AI / Infra" },
  { value: "Cybersecurity", label: "Cybersecurity" },
  { value: "D2C",           label: "D2C" },
  { value: "Consumer",      label: "Consumer" },
  { value: "EdTech",        label: "EdTech" },
  { value: "HRTech",        label: "HRTech" },
  { value: "Logistics",     label: "Logistics" },
  { value: "EV",            label: "EV / Mobility" },
  { value: "CleanTech",     label: "CleanTech" },
  { value: "DeepTech",      label: "Deep Tech" },
  { value: "Biotech",       label: "Biotech" },
  { value: "AgriTech",      label: "AgriTech" },
  { value: "Marketplace",   label: "Marketplace" },
  { value: "Media",         label: "Media" },
  { value: "Gaming",        label: "Gaming" },
]

const SCORECARD_OPTIONS = [
  { value: "",            label: "All types" },
  { value: "saas",        label: "B2B SaaS" },
  { value: "fintech",     label: "FinTech" },
  { value: "d2c",         label: "D2C" },
  { value: "marketplace", label: "Marketplace" },
  { value: "deeptech",    label: "Deep Tech" },
  { value: "base",        label: "General" },
]

const COL_DEFS: { label: string; w: number; sortKey: string | null; tooltip?: string }[] = [
  { label: "Rank",      w: 52,  sortKey: null },
  { label: "Company",   w: 210, sortKey: "brand_name" },
  { label: "Stage",     w: 100, sortKey: null },
  { label: "Industry",  w: 120, sortKey: null },
  { label: "Revenue",   w: 105, sortKey: "revenue_inr_cr" },
  { label: "Raised",    w: 105, sortKey: "total_raised_usd_m" },
  { label: "Score",     w: 68,  sortKey: "composite_score" },
  {
    label: "DQ", w: 58, sortKey: "data_quality_pct",
    tooltip: "Data Quality: % of applicable fields with a non-unknown value. Low DQ = sparse public data, not a judgment of the company."
  },
  { label: "Scorecard", w: 160, sortKey: null },
  { label: "Refreshed", w: 95,  sortKey: "last_collected_at" },
  { label: "Scored",    w: 95,  sortKey: "last_scored_at" },
  { label: "",          w: 68,  sortKey: null },
]

export default function HomePage() {
  const router = useRouter()
  const [rows,    setRows]    = useState<StartupRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [sort,    setSort]    = useState("composite_score")
  const [dir,     setDir]     = useState<"asc"|"desc">("desc")

  // Auth
  const [userEmail, setUserEmail] = useState<string | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<"all"|"mine">("all")

  // Column filters (multi-select)
  const [filterStage,     setFilterStage]     = useState<string[]>([])
  const [filterIndustry,  setFilterIndustry]  = useState<string[]>([])
  const [filterScorecard, setFilterScorecard] = useState<string[]>([])

  // Search
  const [search,          setSearch]          = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [searchFocused,   setSearchFocused]   = useState(false)
  const [acResults,       setAcResults]       = useState<StartupRow[]>([])
  const [showAc,          setShowAc]          = useState(false)

  // New profile modal state
  const [company,    setCompany]    = useState("")
  const [showModal,  setShowModal]  = useState(false)
  const [jobStatus,  setJobStatus]  = useState<string | null>(null)
  const [jobPct,     setJobPct]     = useState(0)
  const [jobPasses,  setJobPasses]  = useState<{ completed: string[]; failed: string[]; pending: string[] } | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [error,      setError]      = useState("")
  const [colWidths,  setColWidths]  = useState(() => COL_DEFS.map(c => c.w))
  const resizingCol = useRef<{ col: number; startX: number; startW: number } | null>(null)

  // Fetch user email once
  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? null))
  }, [])

  // Column resize
  function startResize(i: number, e: React.MouseEvent) {
    e.preventDefault()
    resizingCol.current = { col: i, startX: e.clientX, startW: colWidths[i] }
    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return
      const { col, startX, startW } = resizingCol.current
      setColWidths(prev => prev.map((w, idx) => idx === col ? Math.max(44, startW + ev.clientX - startX) : w))
    }
    const onUp = () => {
      resizingCol.current = null
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
    }
    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Autocomplete: top-5 results for the search dropdown
  useEffect(() => {
    if (!debouncedSearch) { setAcResults([]); return }
    getStartups({ search: debouncedSearch, limit: 5, sort: "composite_score", dir: "desc" })
      .then(r => setAcResults(r.data))
      .catch(() => {})
  }, [debouncedSearch])

  // Main table fetch
  useEffect(() => {
    setLoading(true)
    getStartups({
      page, sort, dir,
      search:      debouncedSearch || undefined,
      stage:       filterStage.length     > 0 ? filterStage     : undefined,
      industry:    filterIndustry.length  > 0 ? filterIndustry  : undefined,
      scorecard:   filterScorecard.length > 0 ? filterScorecard : undefined,
      profiled_by: viewMode === "mine" ? (userEmail ?? undefined) : undefined,
    })
      .then(r => { setRows(r.data); setTotal(r.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, sort, dir, debouncedSearch, filterStage, filterIndustry, filterScorecard, viewMode, userEmail])

  function handleColSort(key: string) {
    if (sort === key) setDir(d => d === "desc" ? "asc" : "desc")
    else { setSort(key); setDir("desc") }
    setPage(1)
  }

  function resetFilters() {
    setFilterStage([]); setFilterIndustry([]); setFilterScorecard([]); setPage(1)
  }

  const hasFilters = filterStage.length > 0 || filterIndustry.length > 0 || filterScorecard.length > 0

  async function handleTrigger() {
    if (!company.trim()) return
    setTriggering(true); setError(""); setJobStatus("queued"); setJobPct(0); setJobPasses(null)
    try {
      const job = await triggerProfile(company.trim(), "IN", userEmail ?? undefined)
      if (job.cached && job.startup_id) {
        router.push(`/profile/${job.startup_id}`)
        return
      }
      const startupId = await pollJob(job.job_id, (pct, status, j) => {
        setJobPct(pct); setJobStatus(status); setJobPasses(j.passes ?? null)
      })
      router.push(`/profile/${startupId}?job_id=${job.job_id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Research failed")
      setJobStatus("failed")
    } finally {
      setTriggering(false)
    }
  }

  function openModalWith(prefill: string) {
    setCompany(prefill)
    setJobStatus(null)
    setShowModal(true)
    setShowAc(false)
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <header style={{
        background: "linear-gradient(135deg, #0f2d52 0%, #1e3a5f 70%, #1a3659 100%)",
        borderBottom: "1px solid rgba(251,191,36,0.2)",
        padding: "0 1.5rem",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, background: "#fff", borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--mono)", fontSize: 11, color: "var(--navy)", fontWeight: 700
          }}>SI</div>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>Startup Intelligence</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setShowModal(true)}
            style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
          >+ Profile a startup</button>
          <button
            onClick={async () => { await createClient().auth.signOut(); router.push("/login") }}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}
          >Sign out</button>
        </div>
      </header>

      {/* ── HERO SEARCH ── */}
      <section style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "2.5rem 1.5rem 2rem" }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <p style={{ fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-xs)", marginBottom: "1.25rem", textAlign: "center" }}>
            Indian startup intelligence
          </p>

          {/* Search bar with autocomplete */}
          <div style={{ position: "relative" }}>
            <svg style={{ position: "absolute", left: 22, top: "50%", transform: "translateY(-50%)", color: "var(--text-xs)", pointerEvents: "none" }}
              width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
              onFocus={() => setShowAc(true)}
              onBlur={() => setTimeout(() => setShowAc(false), 180)}
              placeholder="Find a startup — or press Enter to profile a new one"
              style={{
                width: "100%",
                border: `2px solid ${searchFocused || showAc ? "var(--navy)" : "var(--border-md)"}`,
                borderRadius: search && showAc && (acResults.length > 0) ? "12px 12px 0 0" : 999,
                padding: "15px 24px 15px 52px",
                fontSize: 16,
                outline: "none",
                boxShadow: (searchFocused || showAc) ? "0 4px 20px rgba(30,58,95,0.12)" : "0 2px 8px rgba(0,0,0,0.06)",
                transition: "border-color 0.15s, box-shadow 0.15s",
                background: "#fff",
                color: "var(--text-h)",
              }}
              onFocusCapture={() => setSearchFocused(true)}
              onBlurCapture={() => setSearchFocused(false)}
              onKeyDown={e => {
                if (e.key === "Enter" && search.trim()) {
                  if (acResults.length > 0) router.push(`/profile/${acResults[0].id}`)
                  else openModalWith(search.trim())
                }
              }}
            />

            {/* Autocomplete dropdown */}
            {showAc && search && (
              <div style={{
                position: "absolute", top: "100%", left: 0, right: 0,
                background: "#fff", border: "2px solid var(--navy)", borderTop: "none",
                borderRadius: "0 0 12px 12px",
                boxShadow: "0 8px 24px rgba(30,58,95,0.12)",
                overflow: "hidden", zIndex: 50,
              }}>
                {acResults.map((r, i) => (
                  <div key={r.id}
                    onMouseDown={() => router.push(`/profile/${r.id}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 20px", cursor: "pointer",
                      borderTop: i > 0 ? "1px solid var(--border)" : undefined,
                      background: "#fff",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-soft)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                  >
                    <span style={{ fontWeight: 600, fontSize: 14, color: "var(--text-h)", flex: 1 }}>{r.brand_name}</span>
                    {r.stage && (
                      <span style={{ ...stageBadgeStyle(r.stage), fontSize: 9, padding: "2px 6px" }}>
                        {STAGE_LABELS[r.stage] ?? r.stage}
                      </span>
                    )}
                    {r.composite_score != null && (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: scoreColor(r.composite_score), minWidth: 28, textAlign: "right" }}>
                        {r.composite_score}
                      </span>
                    )}
                  </div>
                ))}
                {/* "Profile [X]" CTA always at bottom */}
                <div
                  onMouseDown={() => openModalWith(search.trim())}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 20px", cursor: "pointer",
                    borderTop: "1px solid var(--border)",
                    background: "var(--bg-soft)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#E8EDF3")}
                  onMouseLeave={e => (e.currentTarget.style.background = "var(--bg-soft)")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--navy)" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/>
                  </svg>
                  <span style={{ fontSize: 13, color: "var(--navy)", fontWeight: 500 }}>
                    Profile &quot;{search.trim()}&quot; →
                  </span>
                </div>
              </div>
            )}
          </div>

          <p style={{ marginTop: "0.85rem", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)", textAlign: "center" }}>
            {total > 0
              ? debouncedSearch
                ? `${total} result${total !== 1 ? "s" : ""} for "${debouncedSearch}"`
                : `${total} startup${total !== 1 ? "s" : ""} indexed`
              : ""}
          </p>
        </div>
      </section>

      <main style={{ flex: 1, maxWidth: 1520, margin: "0 auto", padding: "1.25rem 1.5rem", width: "100%" }}>

        {/* ── View toggle + filters row ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "1rem", flexWrap: "wrap" }}>

          {/* View toggle */}
          <div style={{
            display: "inline-flex", border: "1px solid var(--border-md)", borderRadius: 7,
            overflow: "hidden", flexShrink: 0,
          }}>
            {(["all", "mine"] as const).map(mode => (
              <button key={mode}
                onClick={() => { setViewMode(mode); setPage(1) }}
                style={{
                  padding: "5px 14px", fontSize: 12, fontWeight: 500,
                  border: "none", cursor: "pointer",
                  background: viewMode === mode ? "var(--navy)" : "#fff",
                  color:      viewMode === mode ? "#fff"        : "var(--text-s)",
                  transition: "background 0.1s, color 0.1s",
                }}>
                {mode === "all" ? "All profiles" : "My profiles"}
              </button>
            ))}
          </div>

          <div style={{ flex: 1 }} />

          {/* Filter pills */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <FilterMultiSelect
              values={filterStage}
              onChange={v => { setFilterStage(v); setPage(1) }}
              options={STAGE_OPTIONS.filter(o => o.value)}
              label="Stage"
            />
            <FilterMultiSelect
              values={filterIndustry}
              onChange={v => { setFilterIndustry(v); setPage(1) }}
              options={INDUSTRY_OPTIONS.filter(o => o.value)}
              label="Industry"
            />
            <FilterMultiSelect
              values={filterScorecard}
              onChange={v => { setFilterScorecard(v); setPage(1) }}
              options={SCORECARD_OPTIONS.filter(o => o.value)}
              label="Scorecard"
            />
            {hasFilters && (
              <button onClick={resetFilters} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 11, color: "var(--text-xs)", padding: "4px 6px",
                fontFamily: "var(--mono)", textDecoration: "underline",
              }}>
                clear
              </button>
            )}
          </div>

          <span style={{ fontSize: 12, color: "var(--text-xs)", fontFamily: "var(--mono)" }}>
            {total} {viewMode === "mine" ? "yours" : "startups"}
          </span>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-xs)", fontSize: 14 }}>
            Loading leaderboard...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem" }}>
            {viewMode === "mine" ? (
              <>
                <p style={{ fontSize: 15, color: "var(--text-s)", marginBottom: "1rem" }}>
                  No profiles found for your account yet.
                </p>
                <p style={{ fontSize: 13, color: "var(--text-xs)", marginBottom: "1rem" }}>
                  Profiles you trigger will appear here. Older profiles show in "All".
                </p>
              </>
            ) : (
              <p style={{ fontSize: 15, color: "var(--text-s)", marginBottom: "1rem" }}>
                {hasFilters ? "No startups match the current filters." : "No startups profiled yet."}
              </p>
            )}
            <button onClick={() => setShowModal(true)} style={btnPrimary}>Profile your first startup →</button>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflowX: "auto" }}>
            <table style={{ width: colWidths.reduce((a, b) => a + b, 0), minWidth: "100%", borderCollapse: "collapse", fontSize: 13, tableLayout: "fixed" }}>
              <colgroup>
                {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr style={{ background: "var(--navy)" }}>
                  {COL_DEFS.map(({ label, sortKey, tooltip }, i) => {
                    const isActive = sortKey && sort === sortKey
                    return (
                      <th key={label || "__view"} title={tooltip}
                        style={{ ...thStyle, position: "relative", userSelect: "none", cursor: sortKey ? "pointer" : "default", whiteSpace: "nowrap" }}
                        onClick={() => sortKey && handleColSort(sortKey)}>
                        <span style={{ color: isActive ? "#fbbf24" : undefined }}>
                          {label}
                          {tooltip && <span style={{ marginLeft: 3, opacity: 0.5, fontSize: 9 }}>ⓘ</span>}
                        </span>
                        {sortKey && (
                          <span style={{ marginLeft: 4, opacity: isActive ? 1 : 0.3, fontSize: 9, color: isActive ? "#fbbf24" : undefined }}>
                            {isActive ? (dir === "desc" ? "↓" : "↑") : "↕"}
                          </span>
                        )}
                        {i < COL_DEFS.length - 1 && (
                          <div
                            onMouseDown={e => { e.stopPropagation(); startResize(i, e) }}
                            style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 5, cursor: "col-resize", zIndex: 1 }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                          />
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => router.push(`/profile/${r.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-soft)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text-xs)", textAlign: "center" }}>
                      {(page-1)*20 + i + 1}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text-h)" }}>
                      {r.brand_name}
                      {r.is_profitable && <span style={profitBadge}>✓ Profitable</span>}
                    </td>
                    <td style={tdStyle}>
                      {r.stage
                        ? <span style={{ ...stageBadgeStyle(r.stage), fontSize: 10, padding: "2px 7px" }}>
                            {STAGE_LABELS[r.stage] ?? r.stage}
                          </span>
                        : <span style={{ color: "var(--text-xs)" }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-s)" }}>{fmtIndustry(r.industry)}</td>
                    <td style={tdStyle}>{r.revenue_inr_cr ? `₹${r.revenue_inr_cr} Cr` : "—"}</td>
                    <td style={tdStyle}>{r.total_raised_usd_m ? `$${r.total_raised_usd_m}M` : "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontSize: 15, color: scoreColor(r.composite_score) }}>
                      {r.composite_score ?? "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)", fontSize: 11 }}>
                      {r.data_quality_pct != null
                        ? <span style={{ color: dqColor(r.data_quality_pct) }}>{r.data_quality_pct}%</span>
                        : <span style={{ color: "var(--text-xs)" }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {(r.scorecard_ids ?? (r.primary_scorecard ? [r.primary_scorecard] : [])).map((id: string) => {
                          const cfg = SCORECARD_STYLE[id] ?? SCORECARD_STYLE.base
                          return (
                            <span key={id} style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 600,
                              textTransform: "uppercase", letterSpacing: "0.07em",
                              padding: "2px 6px", borderRadius: 3,
                              background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
                              whiteSpace: "nowrap" }}>
                              {cfg.label}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)", whiteSpace: "nowrap" }}>
                      {relTime(r.last_collected_at)}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)", whiteSpace: "nowrap" }}>
                      {relTime(r.last_scored_at)}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--blue)" }}>View →</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {total > 20 && (
          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: "1.5rem" }}>
            <button disabled={page===1} onClick={() => setPage(p=>p-1)} style={pageBtn(page===1)}>← Prev</button>
            <span style={{ padding: "6px 12px", fontSize: 13, color: "var(--text-s)" }}>
              Page {page} of {Math.ceil(total/20)}
            </span>
            <button disabled={page*20>=total} onClick={() => setPage(p=>p+1)} style={pageBtn(page*20>=total)}>Next →</button>
          </div>
        )}
      </main>

      {/* New profile modal */}
      {showModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999
        }} onClick={e => { if(e.target===e.currentTarget && !triggering) setShowModal(false) }}>
          <div style={{
            background: "#fff", borderRadius: 12, padding: "2rem",
            width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
          }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: "0.5rem", color: "var(--text-h)" }}>
              Profile a startup
            </h2>
            <p style={{ fontSize: 13, color: "var(--text-s)", marginBottom: "1.5rem" }}>
              Runs 10-pass research via Claude. Takes 3–5 minutes.
            </p>

            {!jobStatus ? (
              <>
                <input
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleTrigger()}
                  placeholder="Company name, e.g. Nat Habit"
                  style={inputStyle}
                />
                <div style={{ display: "flex", gap: 8, marginTop: "1rem" }}>
                  <button onClick={() => setShowModal(false)} style={btnSecondary}>Cancel</button>
                  <button onClick={handleTrigger} disabled={!company.trim()} style={btnPrimary}>
                    Start research →
                  </button>
                </div>
              </>
            ) : jobStatus === "failed" ? (
              <>
                <div style={{ background: "var(--red-lt)", border: "1px solid #fca5a5", borderRadius: 6,
                  padding: "10px 14px", fontSize: 13, color: "var(--red)", marginBottom: "1rem" }}>
                  {error || "Research failed"}
                </div>
                <button onClick={() => { setJobStatus(null); setError("") }} style={btnPrimary}>
                  Try again
                </button>
              </>
            ) : (
              <div>
                <p style={{ fontSize: 14, color: "var(--text-h)", marginBottom: "1rem", fontWeight: 500 }}>
                  Researching <strong>{company}</strong>…
                </p>
                <div style={{ background: "var(--bg-soft)", borderRadius: 6, height: 6, overflow: "hidden", marginBottom: 8 }}>
                  <div style={{
                    height: "100%", background: "var(--navy)",
                    width: `${jobPct}%`, transition: "width 0.5s ease", borderRadius: 6
                  }}/>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <span style={{ fontSize: 12, color: "var(--text-s)" }}>
                    {jobStatus === "completed" ? "Complete — redirecting…" :
                     jobStatus === "running"   ? "Running 9-pass research…" : "Queued…"}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "var(--mono)", color: "var(--text-xs)" }}>
                    {jobPct}%
                  </span>
                </div>
                {jobPasses && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                    {["overview","founders","glassdoor","funding","products","regulatory","signals","youtube","linkedin"].map(p => {
                      const done = jobPasses.completed.includes(p)
                      const fail = jobPasses.failed.includes(p)
                      return (
                        <div key={p} style={{
                          fontSize: 11, fontFamily: "var(--mono)", padding: "5px 8px", borderRadius: 5,
                          textAlign: "center", textTransform: "capitalize",
                          background: done ? "var(--green-lt)" : fail ? "var(--red-lt)" : "var(--bg-soft)",
                          color: done ? "var(--green)" : fail ? "var(--red)" : "var(--text-xs)",
                          border: `1px solid ${done ? "var(--green-bd)" : fail ? "var(--red-bd)" : "var(--border)"}`,
                        }}>
                          {done ? "✓ " : fail ? "✗ " : "○ "}{p}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── FilterMultiSelect component ──────────────────────────────────
function FilterMultiSelect({ values, onChange, options, label }: {
  values: string[]
  onChange: (v: string[]) => void
  options: { value: string; label: string }[]
  label: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const closeHandler = useCallback((e: MouseEvent) => {
    if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
  }, [])

  useEffect(() => {
    if (open) document.addEventListener("mousedown", closeHandler)
    return () => document.removeEventListener("mousedown", closeHandler)
  }, [open, closeHandler])

  function toggle(value: string) {
    if (values.includes(value)) onChange(values.filter(v => v !== value))
    else onChange([...values, value])
  }

  const active = values.length > 0
  const btnLabel = active
    ? values.length === 1
      ? (options.find(o => o.value === values[0])?.label ?? values[0])
      : `${label} (${values.length})`
    : label

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          padding: "4px 10px",
          fontSize: 12, fontFamily: "var(--mono)", fontWeight: active ? 600 : 400,
          border: `1px solid ${active ? "var(--navy)" : "var(--border-md)"}`,
          borderRadius: 5,
          background: active ? "var(--navy)" : "#fff",
          color: active ? "#fff" : "var(--text-s)",
          cursor: "pointer", outline: "none",
          whiteSpace: "nowrap",
        }}
      >
        {btnLabel}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke={active ? "#fff" : "var(--text-xs)"} strokeWidth="2.5"
          style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform 0.15s" }}>
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 200,
          background: "#fff", border: "1px solid var(--border-md)", borderRadius: 7,
          boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          minWidth: 160, maxHeight: 280, overflowY: "auto",
          padding: "4px 0",
        }}>
          {options.map(o => {
            const checked = values.includes(o.value)
            return (
              <label key={o.value} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 14px", cursor: "pointer", fontSize: 13,
                color: checked ? "var(--navy)" : "var(--text-m)",
                fontWeight: checked ? 600 : 400,
                background: checked ? "var(--bg-soft)" : undefined,
              }}
                onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "var(--bg-soft)" }}
                onMouseLeave={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = "" }}
              >
                <input
                  type="checkbox" checked={checked}
                  onChange={() => toggle(o.value)}
                  style={{ accentColor: "var(--navy)", width: 13, height: 13 }}
                />
                {o.label}
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 12px",
  fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "rgba(255,255,255,0.75)", fontWeight: 500,
  borderBottom: "none"
}
const tdStyle: React.CSSProperties = {
  padding: "10px 12px", color: "var(--text-m)", verticalAlign: "middle"
}
const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border-md)", borderRadius: 6,
  padding: "10px 12px", fontSize: 14, outline: "none"
}
const btnPrimary: React.CSSProperties = {
  background: "var(--navy)", color: "#fff", border: "none", borderRadius: 6,
  padding: "8px 18px", fontSize: 13, cursor: "pointer", fontWeight: 500, flex: 1
}
const btnSecondary: React.CSSProperties = {
  background: "var(--bg-soft)", color: "var(--text-m)",
  border: "1px solid var(--border)", borderRadius: 6,
  padding: "8px 18px", fontSize: 13, cursor: "pointer"
}
const pageBtn = (disabled: boolean): React.CSSProperties => ({
  background: disabled ? "var(--bg-soft)" : "#fff",
  border: "1px solid var(--border)", borderRadius: 6,
  padding: "6px 14px", fontSize: 13, cursor: disabled ? "default" : "pointer",
  color: disabled ? "var(--text-xs)" : "var(--text-b)"
})
const profitBadge: React.CSSProperties = {
  marginLeft: 8, fontSize: 9, background: "var(--green-lt)", color: "var(--green)",
  border: "1px solid var(--green-bd)", borderRadius: 4, padding: "1px 5px",
  fontFamily: "var(--mono)", textTransform: "uppercase", letterSpacing: "0.06em"
}

function stageBadgeStyle(stage?: string): React.CSSProperties {
  const s = stage ?? ""
  const cfg = STAGE_BADGE[s] ?? { bg: "var(--blue-lt)", color: "var(--navy)", border: "var(--blue-md)" }
  return {
    display: "inline-block",
    fontFamily: "var(--mono)", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.06em",
    borderRadius: 4,
    background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`,
    whiteSpace: "nowrap" as const,
  }
}

// Raw DB industry values → readable display names
const INDUSTRY_DISPLAY: Record<string, string> = {
  EdTech_HRTech: "EdTech / HRTech",
  AI_Infra:      "AI / Infra",
}
function fmtIndustry(raw?: string) {
  if (!raw) return "—"
  return INDUSTRY_DISPLAY[raw] ?? raw
}

function scoreColor(score?: number) {
  if (!score) return "var(--text-xs)"
  if (score >= 80) return "var(--green)"
  if (score >= 60) return "var(--amber)"
  return "var(--red)"
}

function dqColor(pct: number) {
  if (pct >= 70) return "var(--green)"
  if (pct >= 45) return "var(--amber)"
  return "var(--text-xs)"
}

function relTime(iso?: string): string {
  if (!iso) return "—"
  const diff = Date.now() - new Date(iso).getTime()
  const days  = Math.floor(diff / 86400000)
  const hours = Math.floor(diff / 3600000)
  const mins  = Math.floor(diff / 60000)
  if (days > 60)  return `${Math.floor(days / 30)}mo ago`
  if (days > 0)   return `${days}d ago`
  if (hours > 0)  return `${hours}h ago`
  if (mins > 0)   return `${mins}m ago`
  return "just now"
}
