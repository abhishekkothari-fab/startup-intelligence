"use client"
import { useEffect, useState, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { getStartup, getJob, rescoreStartup, upsertAnalystInputs, type FullProfile, type YouTubeSignal, type LinkedInSignal, type AnalystInput } from "@/lib/api"
import { createClient } from "@/lib/supabase-auth"

function str(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v)
}
function num(v: unknown): number { return Number(v) || 0 }
function rawVal(raw: Record<string, unknown>[], name: string): string {
  const f = raw.find(r => r.field_name === name)
  if (!f || f.applicability === "not_applicable") return ""
  return str(f.raw_value)
}

const CIRC = 2 * Math.PI * 60

const NAV_GROUPS = [
  { group: "Overview", items: [
    { n: "01", id: "s01", label: "Key Metrics" },
    { n: "02", id: "s02", label: "Corporate Structure" },
  ]},
  { group: "Intelligence", items: [
    { n: "03", id: "s04", label: "Founders & Team" },
    { n: "04", id: "s05", label: "Product" },
  ]},
  { group: "Ecosystem", items: [
    { n: "05", id: "s06", label: "Funding" },
    { n: "06", id: "s13", label: "Competitive" },
    { n: "07", id: "s07", label: "Partnerships" },
    { n: "08", id: "s12", label: "Recognitions" },
  ]},
  { group: "Social Media", items: [
    { n: "09", id: "s09", label: "LinkedIn" },
    { n: "10", id: "s10", label: "Glassdoor" },
    { n: "11", id: "s08", label: "YouTube" },
  ]},
  { group: "Analysis", items: [
    { n: "12", id: "s03", label: "Scorecard" },
    { n: "13", id: "s11", label: "Strategic Insights" },
    { n: "14", id: "s14", label: "Analyst Data" },
  ]},
]

const SEC: React.CSSProperties = {
  padding: "2.25rem 2.5rem",
  background: "#fff",
  borderRadius: 12,
  boxShadow: "var(--shadow-sm)",
  margin: "1.25rem",
}

export default function ProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ job_id?: string }>
}) {
  const { id } = use(params)
  const { job_id } = use(searchParams)
  const router = useRouter()
  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [researching, setResearching] = useState(!!job_id)
  const [jobPasses, setJobPasses] = useState<{ completed: string[]; failed: string[]; pending: string[] } | null>(null)
  const [activeSection, setActiveSection] = useState("s01")
  const [activeProd, setActiveProd] = useState(0)
  const [rescoring,     setRescoring]     = useState(false)
  const [analystDraft,  setAnalystDraft]  = useState<Record<string, string>>({})
  const [savingAnalyst, setSavingAnalyst] = useState(false)
  const [analystSaved,  setAnalystSaved]  = useState(false)
  const ringRef = useRef<SVGCircleElement>(null)

  const fetchProfile = () =>
    getStartup(id).then(setProfile).catch(e => setError(e.message)).finally(() => setLoading(false))

  useEffect(() => { fetchProfile() }, [id])

  useEffect(() => {
    if (!job_id) return
    getJob(job_id).then(j => { if (j.passes) setJobPasses(j.passes) }).catch(() => {})
  }, [job_id])

  useEffect(() => {
    if (!job_id || !researching) return
    const interval = setInterval(async () => {
      try {
        const [p, j] = await Promise.all([getStartup(id), getJob(job_id)])
        setProfile(p)
        if (j.passes) setJobPasses(j.passes)
        if (j.status === "completed" || j.status === "failed") {
          setResearching(false)
          clearInterval(interval)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [id, job_id, researching])

  // Scroll spy
  useEffect(() => {
    if (!profile) return
    const els = document.querySelectorAll<HTMLElement>("[data-sec]")
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActiveSection(e.target.getAttribute("data-sec") || "") }),
      { threshold: 0.2, rootMargin: "-56px 0px -55% 0px" }
    )
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [profile])

  // Pre-populate analyst draft from saved inputs
  useEffect(() => {
    if (!profile?.analyst_inputs?.length) return
    const draft: Record<string, string> = {}
    for (const ai of profile.analyst_inputs) {
      if (ai.value_num !== null && ai.value_num !== undefined) draft[ai.field_name] = String(ai.value_num)
    }
    setAnalystDraft(draft)
  }, [profile?.analyst_inputs])

  // Score ring animation
  useEffect(() => {
    if (!ringRef.current || !profile) return
    const score = profile.latest_score?.composite_score ?? 0
    const el = ringRef.current
    el.style.strokeDasharray = String(CIRC)
    el.style.strokeDashoffset = String(CIRC)
    const t = setTimeout(() => {
      el.style.transition = "stroke-dashoffset 1.4s cubic-bezier(0.4,0,0.2,1)"
      el.style.strokeDashoffset = String(CIRC * (1 - score / 100))
    }, 300)
    return () => clearTimeout(t)
  }, [profile])

  if (loading) return <Loading />
  if (error) return <ErrorPage error={error} onBack={() => router.push("/")} />
  if (!profile) return null

  const s     = profile.startup
  const sc    = profile.latest_score
  const raw   = profile.raw_summary
  const score = sc?.composite_score ?? 0
  const scoreGlowColor = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : "#ef4444"
  const rv    = (name: string) => rawVal(raw, name)

  async function handleRescore() {
    setRescoring(true)
    try {
      await rescoreStartup(id)
      await fetchProfile()
    } catch (e) {
      console.error("Rescore failed:", e)
    } finally {
      setRescoring(false)
    }
  }

  async function handleSaveAnalyst() {
    setSavingAnalyst(true)
    try {
      const inputs = Object.entries(analystDraft)
        .filter(([, v]) => v !== "" && !isNaN(parseFloat(v)))
        .map(([field_name, v]) => ({ field_name, value: parseFloat(v) }))
      if (inputs.length === 0) return
      await upsertAnalystInputs(id, inputs)
      await fetchProfile()
      setAnalystSaved(true)
      setTimeout(() => setAnalystSaved(false), 3000)
    } catch (e) {
      console.error("Save failed:", e)
    } finally {
      setSavingAnalyst(false)
    }
  }

  const scrollTo = (sectionId: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    setActiveSection(sectionId)
    const el = document.getElementById(sectionId)
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 56, behavior: "smooth" })
  }

  // Data arrays
  const revenueHistory = [1,2,3,4,5,6]
    .map(n => ({ year: rv(`revenue_fy${n}_year`), inr: rv(`revenue_fy${n}_inr_cr`) }))
    .filter(r => r.year && r.inr)
  const founders = [1,2,3,4]
    .map(n => ({
      name:         rv(`founder_${n}_name`),
      role:         rv(`founder_${n}_role`),
      bio:          rv(`founder_${n}_bio`),
      education:    rv(`founder_${n}_education`),
      domainYears:  rv(`founder_${n}_domain_years`),
      priorStartup: rv(`founder_${n}_prior_startup`),
      isIitIim:     rv(`founder_${n}_is_iit_iim`),
      linkedinUrl:  rv(`founder_${n}_linkedin_url`),
      status:       rv(`founder_${n}_status`),
    }))
    .filter(f => f.name)
  const products = [1,2,3,4,5]
    .map(n => ({ name: rv(`product_${n}_name`), type: rv(`product_${n}_type`), description: rv(`product_${n}_description`), url: rv(`product_${n}_url`) }))
    .filter(p => p.name)
  const roundHistory = [1,2,3,4,5,6]
    .map(n => {
      const lead = rv(`round_${n}_lead`)
      const allInvestors = rv(`round_${n}_investors`)
      const others = allInvestors && lead
        ? allInvestors.split(/,\s*/).filter(s => s.toLowerCase().trim() !== lead.toLowerCase().trim()).join(", ")
        : allInvestors
      return {
        type:          rv(`round_${n}_type`),
        date:          rv(`round_${n}_date`),
        amount_usd_m:  rv(`round_${n}_amount_usd_m`),
        lead,
        investors_str: others,
        context:       rv(`round_${n}_context`),
      }
    })
    .filter(r => r.type)
  const cxos = [1,2,3,4,5,6]
    .map(n => ({ name: rv(`cxo_${n}_name`), role: rv(`cxo_${n}_role`), background: rv(`cxo_${n}_background`) }))
    .filter(c => c.name && !c.name.startsWith("not specified") && c.name.toLowerCase() !== "unknown")
  const partnerships = [1,2,3,4,5,6,7,8].map(n => ({
    partner:  rv(`partnership_${n}_partner`) || rv(`partnership_${n}`),
    category: rv(`partnership_${n}_category`),
    usecase:  rv(`partnership_${n}_usecase`),
    signal:   rv(`partnership_${n}_signal`),
  })).filter(p => p.partner)
  const hasStructuredPartnerships = partnerships.some(p => p.category || p.usecase)
  const entities = [1,2,3,4,5,6].map(n => ({
    name: rv(`entity_${n}_name`),
    role: rv(`entity_${n}_role`) || rv(`entity_${n}_description`),
    note: rv(`entity_${n}_note`) || rv(`entity_${n}_type`),
  })).filter(e => e.name && !e.name.startsWith("not specified"))
  const entityFallback = !entities.length && rv("sub_brands")
    ? rv("sub_brands").split(/[,·]/).map(b => b.trim()).filter(Boolean).map(b => ({ name: b, role: "", note: "" }))
    : []
  const allEntities = entities.length ? entities : entityFallback

  const clients = [1,2,3,4,5,6,7,8].map(n => ({ name: rv(`client_${n}_name`), sector: rv(`client_${n}_sector`) })).filter(c => c.name)
  const awards = [1,2,3,4,5,6,7,8,9,10].map(n => rv(`award_${n}`)).filter(Boolean)
  const vcInsights = s.insights as {
    thesis?: string; moat?: string; comparable?: string;
    risks?: string[]; key_questions?: string[];
    bull_case?: string; bear_case?: string;
  } | null | undefined

  const competitors = [1,2,3]
    .map(n => ({
      name:    str((s as Record<string,unknown>)[`competitor_${n}_name`]),
      funding: (s as Record<string,unknown>)[`competitor_${n}_funding_usd_m`] != null ? str((s as Record<string,unknown>)[`competitor_${n}_funding_usd_m`]) : null,
      stage:   str((s as Record<string,unknown>)[`competitor_${n}_stage`]),
    }))
    .filter(c => c.name)

  const keyQuoteText    = rv("key_quote_1_text")
  const keyQuoteAuthor  = rv("key_quote_1_author")
  const keyQuote2Text   = rv("key_quote_2_text")
  const keyQuote2Author = rv("key_quote_2_author")
  const ipoSignal       = rv("ipo_signal")
  const volumeMetric    = rv("volume_metric")
  const cagr            = rv("revenue_cagr_5yr_pct")
  const nextTarget      = rv("fy_next_target_inr_cr")
  const latestNews      = rv("latest_news_headline")
  const latestNewsDate  = rv("latest_news_date")
  const marketShare     = rv("market_share")

  const maxRev = Math.max(...revenueHistory.map(r => parseFloat(r.inr) || 0))

  const brandInitials = str(s.brand_name).split(/\s+/).map(w => w[0] || "").slice(0,2).join("").toUpperCase()
  const hasProfile = !!s.last_collected_at
  const revFY = str(s.revenue_fy) || rv("revenue_fy1_year")

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* ── TOPBAR ── */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: 56, background: "linear-gradient(135deg, #0f2d52 0%, #1e3a5f 70%, #1a3659 100%)", borderBottom: "1px solid rgba(251,191,36,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", zIndex: 500 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => router.push("/")} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.75)", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            ← Leaderboard
          </button>
          <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)", flexShrink: 0 }} />
          <div style={{ width: 28, height: 28, borderRadius: 5, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 10, fontWeight: 700, color: "var(--navy)", letterSpacing: "-0.3px", flexShrink: 0 }}>
            {brandInitials}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>{str(s.brand_name)} Intelligence Dossier</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>
              {[str(s.industry || s.auto_industry), str(s.industry_sub || s.auto_industry_sub), str(s.hq_city)].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ background: "rgba(255,255,255,0.08)", border: `1px solid ${scoreGlowColor}55`, borderRadius: 100, padding: "6px 16px", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 500, color: "#fff", boxShadow: `0 0 10px ${scoreGlowColor}33` }}>
            Score: <span style={{ fontWeight: 700, color: scoreGlowColor }}>{score}</span> / 100
          </div>
          <button
            onClick={async () => { await createClient().auth.signOut(); router.push("/login") }}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.6)", borderRadius: 6, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}
          >Sign out</button>
        </div>
      </header>

      {/* ── SIDEBAR ── */}
      <nav style={{ position: "fixed", top: 56, left: 0, bottom: 0, width: 240, background: "#fff", borderRight: "1px solid var(--border)", boxShadow: "2px 0 8px rgba(17,19,24,0.04)", overflowY: "auto", zIndex: 400 }}>
        {NAV_GROUPS.map(({ group, items }) => (
          <div key={group} style={{ paddingTop: "1.25rem" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-xs)", padding: "0 1rem 0.4rem" }}>{group}</div>
            {items.map(({ n, id, label }) => {
              const active = activeSection === id
              return (
                <a key={id} href={`#${id}`} onClick={scrollTo(id)} style={{ display: "flex", alignItems: "center", gap: 8, margin: "1px 0.5rem", padding: "7px 1rem 7px 0.875rem", fontSize: 13, fontWeight: active ? 600 : 400, color: active ? "#fff" : "var(--text-s)", borderLeft: `3px solid ${active ? "#fbbf24" : "transparent"}`, background: active ? "var(--navy)" : "transparent", textDecoration: "none", transition: "all 0.12s", borderRadius: "0 6px 6px 0" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, opacity: 0.5, minWidth: 18 }}>{n}</span>
                  {label}
                </a>
              )
            })}
          </div>
        ))}
        <div style={{ margin: "1.5rem 0 0", padding: "1rem", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)", lineHeight: 1.9 }}>
            {sc?.data_quality_pct != null && `${sc.data_quality_pct}% data quality`}<br/>
            {sc?.fields_applicable != null && `${sc.fields_collected} of ${sc.fields_applicable} fields`}<br/>
            {profile.meta.youtube_count} YT · {profile.meta.linkedin_count} LI signals<br/>
            {str(s.last_collected_at).slice(0,10)}
          </div>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: 240, paddingTop: 56 }}>

        {/* ── RESEARCH PROGRESS STRIP ── */}
        {researching && (
          <div style={{ position: "sticky", top: 56, zIndex: 300, background: "var(--navy)", borderBottom: "1px solid rgba(255,255,255,0.1)", padding: "0.6rem 2.5rem", display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap", flexShrink: 0 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fbbf24", display: "inline-block", animation: "pulse 1.5s infinite" }}/>
              Researching…
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {["overview","founders","glassdoor","funding","competitive","products","regulatory","signals","youtube","linkedin"].map(p => {
                const done = jobPasses?.completed.includes(p)
                const fail = jobPasses?.failed.includes(p)
                return (
                  <span key={p} style={{
                    fontSize: 10, fontFamily: "var(--mono)", padding: "3px 7px", borderRadius: 4,
                    textTransform: "capitalize",
                    background: done ? "rgba(34,197,94,0.15)" : fail ? "rgba(239,68,68,0.15)" : "rgba(255,255,255,0.06)",
                    color: done ? "#4ade80" : fail ? "#f87171" : "rgba(255,255,255,0.35)",
                    border: `1px solid ${done ? "rgba(34,197,94,0.3)" : fail ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.12)"}`,
                  }}>
                    {done ? "✓ " : fail ? "✗ " : "○ "}{p}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        {/* ── S01 KEY METRICS ── */}
        <section data-sec="s01" id="s01" style={SEC}>
          <SecHeader n="01" title="Key Metrics" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: "1.5rem" }}>
            <StatCard label={revFY ? `Revenue ${revFY}` : "Revenue"}
              value={s.revenue_inr_cr ? `₹${str(s.revenue_inr_cr)} Cr` : rv("revenue_fy1_inr_cr") ? `₹${rv("revenue_fy1_inr_cr")} Cr` : "—"}
              sub={[s.revenue_yoy_pct ? `+${str(s.revenue_yoy_pct)}% YoY` : "", nextTarget ? `FY target ₹${nextTarget} Cr` : ""].filter(Boolean).join(" · ")}
              color="var(--navy)" />
            <StatCard label={Boolean(s.is_profitable) ? "Net Profit" : s.net_profit_inr_cr ? "Net Loss" : "Net Profit / Loss"}
              value={s.net_profit_inr_cr ? `₹${str(s.net_profit_inr_cr)} Cr` : "—"}
              sub={Boolean(s.is_profitable) ? "Profitable ✓" : ""}
              color={Boolean(s.is_profitable) ? "var(--green)" : s.net_profit_inr_cr ? "var(--red)" : undefined} />
            <StatCard label="Latest Round"
              value={s.last_round_size_inr_cr ? `₹${str(s.last_round_size_inr_cr)} Cr` : s.total_raised_usd_m ? `$${str(s.total_raised_usd_m)}M total` : "—"}
              sub={[str(s.last_round_type), str(s.last_round_date).slice(0,7)].filter(Boolean).join(" · ")} />
            <StatCard label="Total Raised"
              value={s.total_raised_usd_m ? `$${str(s.total_raised_usd_m)}M` : "—"}
              sub={rv("round_count") ? `${rv("round_count")} rounds` : ""} />
            {volumeMetric && (
              <StatCard label="Volume Metric"
                value={volumeMetric}
                sub="" />
            )}
            <StatCard label="Known Clients"
              value={s.client_count ? `${str(s.client_count)}+` : "—"}
              sub="clients" />
            <StatCard label="Team Size"
              value={s.team_size ? str(s.team_size) : "—"}
              sub="employees" />
            {str(s.founded_date) && (
              <StatCard label="Founded"
                value={str(s.founded_date).slice(0,4)}
                sub={`${new Date().getFullYear() - parseInt(str(s.founded_date).slice(0,4))} years`} />
            )}
          </div>

          {revenueHistory.length >= 2 && (
            <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
                <span style={{ fontFamily: "var(--mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-s)" }}>Revenue trajectory (₹ Cr)</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {cagr && <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 500, color: "var(--green)", background: "var(--green-lt)", border: "1px solid var(--green-bd)", borderRadius: 4, padding: "3px 8px" }}>{cagr}% CAGR</span>}
                  {nextTarget && <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--blue)", background: "var(--blue-bg)", border: "1px solid var(--blue-bd)", borderRadius: 4, padding: "3px 8px" }}>Target ₹{nextTarget} Cr</span>}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 130, paddingBottom: 22, position: "relative" }}>
                <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, height: 1, background: "var(--border-md)" }}/>
                {revenueHistory.map((r, i, arr) => {
                  const pct = maxRev > 0 ? Math.max(5, Math.round((parseFloat(r.inr) / maxRev) * 88)) : 5
                  const isCur = i === arr.length - 1
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" }}>
                      <div style={{ position: "absolute", top: -22, left: "50%", transform: "translateX(-50%) rotate(-35deg)", transformOrigin: "center bottom", fontFamily: "var(--mono)", fontSize: 9, fontWeight: isCur ? 500 : 400, color: isCur ? "var(--navy)" : "var(--text-s)", whiteSpace: "nowrap" }}>₹{r.inr}</div>
                      <div style={{ width: "100%", height: pct, background: isCur ? "var(--navy)" : "var(--blue-md)", borderRadius: "3px 3px 0 0" }}/>
                      <div style={{ marginTop: 5, fontFamily: "var(--mono)", fontSize: 9, color: isCur ? "var(--navy)" : "var(--text-s)", fontWeight: isCur ? 500 : 400 }}>{r.year}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {ipoSignal && (
            <div style={{ background: "var(--amber-lt)", borderTop: "1px solid var(--amber-bd)", borderRight: "1px solid var(--amber-bd)", borderBottom: "1px solid var(--amber-bd)", borderLeft: "3px solid var(--amber)", borderRadius: "0 8px 8px 0", padding: "1.125rem 1.375rem", marginBottom: "1.5rem", display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <div style={{ fontSize: 16, flexShrink: 0, paddingTop: 1 }}>◈</div>
              <div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--amber)", marginBottom: 5 }}>IPO Signal</div>
                <div style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.65 }}>{ipoSignal}</div>
              </div>
            </div>
          )}

          {(latestNews || marketShare) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
              {latestNews && (
                <div style={{ background: "var(--blue-lt)", border: "1px solid var(--blue-md)", borderRadius: 8, padding: "1rem 1.25rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--blue)", marginBottom: 4, display: "flex", justifyContent: "space-between" }}>
                    <span>Latest News</span>{latestNewsDate && <span>{latestNewsDate}</span>}
                  </div>
                  <p style={{ fontSize: 13, color: "var(--navy)", lineHeight: 1.55, margin: 0 }}>{latestNews}</p>
                </div>
              )}
              {marketShare && (
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.25rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-xs)", marginBottom: 4 }}>Market Position</div>
                  <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.55, margin: 0 }}>{marketShare}</p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── S02 CORPORATE STRUCTURE ── */}
        <section data-sec="s02" id="s02" style={SEC}>
          <SecHeader n="02" title="Corporate Structure" />
          <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.25rem", marginBottom: "1.5rem", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-s)", lineHeight: 2.2 }}>
            {str(s.legal_name) && <><strong style={{ color: "var(--text-m)" }}>Legal Name:</strong> {str(s.legal_name)}&nbsp;&nbsp;</>}
            {str(s.cin) && <><strong style={{ color: "var(--text-m)" }}>CIN:</strong> {str(s.cin)}&nbsp;&nbsp;</>}
            {rv("incorporation_date") && <><strong style={{ color: "var(--text-m)" }}>Incorporated:</strong> {rv("incorporation_date")}&nbsp;&nbsp;</>}
            {rv("roc") && <><strong style={{ color: "var(--text-m)" }}>RoC:</strong> {rv("roc")}<br/></>}
            {rv("registered_address") && <><strong style={{ color: "var(--text-m)" }}>Reg. Address:</strong> {rv("registered_address")}<br/></>}
            {rv("authorized_capital_cr") && <><strong style={{ color: "var(--text-m)" }}>Auth. Capital:</strong> ₹{rv("authorized_capital_cr")} Cr&nbsp;&nbsp;</>}
            {rv("paid_up_capital_cr") && <><strong style={{ color: "var(--text-m)" }}>Paid-up Capital:</strong> ₹{rv("paid_up_capital_cr")} Cr&nbsp;&nbsp;</>}
            {rv("last_agm_date") && <><strong style={{ color: "var(--text-m)" }}>Last AGM:</strong> {rv("last_agm_date")}&nbsp;&nbsp;</>}
            {rv("mca_status") && (
              <><strong style={{ color: "var(--text-m)" }}>Status:</strong>{" "}
              <span style={{ color: rv("mca_status").toLowerCase() === "active" ? "var(--green)" : "var(--amber)" }}>{rv("mca_status")}</span>&nbsp;&nbsp;</>
            )}
            {rv("sub_brands") && <><strong style={{ color: "var(--text-m)" }}>Brands:</strong> {rv("sub_brands")}</>}
          </div>

          {allEntities.length > 0 && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--navy)" }}>
                    {["Entity", "Role / Purpose", "Note"].map(h => (
                      <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.8)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "none" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {allEntities.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: "#fff" }}>
                      <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-h)", fontWeight: 600, whiteSpace: "nowrap" }}>{e.name}</td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-m)", lineHeight: 1.5 }}>{e.role || "—"}</td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: 12, color: "var(--text-s)", lineHeight: 1.5 }}>{e.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── S04 FOUNDERS & TEAM ── */}
        <section data-sec="s04" id="s04" style={SEC}>
          <SecHeader n="03" title="Founders & Team" />
          {founders.length === 0 ? <Empty>{hasProfile ? "No founder or team data was found for this company — founders may not have a public profile." : "Run a full profile to collect founder data."}</Empty> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                {founders.map((f, i) => (
                  <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.25rem", transition: "box-shadow 0.15s, border-color 0.15s" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 12px rgba(30,58,95,0.08)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--blue-md)" }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--blue-lt)", border: "1px solid var(--blue-md)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: "var(--navy)", marginBottom: "0.875rem" }}>
                      {f.name.split(/\s+/).map((w: string) => w[0] || "").slice(0,2).join("").toUpperCase()}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-h)", marginBottom: 2 }}>{f.name}</div>
                    {f.role && <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--navy)", marginBottom: "0.625rem", fontWeight: 500 }}>{f.role}</div>}
                    {(() => {
                      const bio = f.bio && !/^not specified/i.test(f.bio) ? f.bio : ""
                      const edu = f.education && !/^not specified/i.test(f.education) ? f.education : ""
                      return bio
                        ? <p style={{ fontSize: 12, color: "var(--text-s)", lineHeight: 1.6 }}>{bio}</p>
                        : (edu || f.domainYears) && (
                            <p style={{ fontSize: 12, color: "var(--text-s)", lineHeight: 1.6 }}>
                              {[edu, f.domainYears ? `${f.domainYears}yr domain exp` : "", f.priorStartup === "yes" ? "Prior startup" : ""].filter(Boolean).join(" · ")}
                            </p>
                          )
                    })()}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.625rem" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: f.status?.toLowerCase() === "former" ? "var(--text-xs)" : "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                        {f.status?.toLowerCase() === "former" ? "○ Former" : "● Active"}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {f.isIitIim && f.isIitIim !== "false" && f.isIitIim !== "no" && (() => {
                          const edu = (f.education || "").toLowerCase()
                          const label = edu.includes("isb") ? "ISB" : edu.includes("iim") ? "IIM" : edu.includes("iit") ? "IIT" : "Premier"
                          return <span style={{ fontFamily: "var(--mono)", fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--blue-lt)", color: "var(--navy)", border: "1px solid var(--blue-md)" }}>{label}</span>
                        })()}
                        {f.linkedinUrl && f.linkedinUrl.startsWith("http") && (
                          <a href={f.linkedinUrl} target="_blank" rel="noreferrer" title="LinkedIn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="#0A66C2" style={{ display: "block" }}>
                              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {keyQuoteText && <PullQuote text={keyQuoteText} cite={keyQuoteAuthor} />}

              {cxos.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-m)", marginBottom: "0.875rem", marginTop: "1.5rem" }}>CXO Team</h3>
                  <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "var(--navy)" }}>
                          {["Name","Role","Background"].map(h => <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.8)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "none" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {cxos.map((c, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: "#fff" }}>
                            <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-h)", fontWeight: 600, whiteSpace: "nowrap" }}>{c.name}</td>
                            <td style={{ padding: "0.75rem 1rem" }}>
                              <span style={{ display: "inline-block", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 4, background: "var(--bg-soft)", color: "var(--navy)", border: "1px solid var(--border-md)" }}>{c.role || "—"}</span>
                            </td>
                            <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-s)", lineHeight: 1.55 }}>{c.background || <span style={{ color: "var(--text-xs)", fontStyle: "italic" }}>—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>

        {/* ── S05 PRODUCT ── */}
        <section data-sec="s05" id="s05" style={SEC}>
          <SecHeader n="04" title="Product" />
          {products.length === 0 ? <Empty>{hasProfile ? "No product data was found for this company." : "Run a full profile to collect product data."}</Empty> : (
            <>
              <div style={{ display: "flex", borderBottom: "1px solid var(--border)", marginBottom: "1.5rem", overflowX: "auto" }}>
                {products.map((p, i) => (
                  <button key={i} onClick={() => setActiveProd(i)} style={{ fontSize: 13, fontWeight: activeProd === i ? 600 : 500, padding: "0.625rem 1.125rem", cursor: "pointer", color: activeProd === i ? "var(--navy)" : "var(--text-s)", marginBottom: -1, whiteSpace: "nowrap", background: "transparent", borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: `2px solid ${activeProd === i ? "var(--navy)" : "transparent"}`, transition: "all 0.15s" }}>
                    {p.name}
                  </button>
                ))}
              </div>
              {products[activeProd] && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "2rem" }}>
                  <div>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 700, color: "var(--text-h)", marginBottom: "0.5rem" }}>{products[activeProd].name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "0.75rem" }}>
                      {products[activeProd].type && (
                        <span style={{ display: "inline-block", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 4, background: "var(--blue-lt)", color: "var(--navy)", border: "1px solid var(--blue-md)" }}>
                          {products[activeProd].type}
                        </span>
                      )}
                      {products[activeProd].url && (
                        <a href={products[activeProd].url} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--blue)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3, border: "1px solid var(--blue-md)", borderRadius: 4, padding: "2px 7px", background: "var(--blue-lt)" }}>
                          Visit ↗
                        </a>
                      )}
                    </div>
                    {products[activeProd].description && (
                      <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.7 }}>{products[activeProd].description}</p>
                    )}
                  </div>
                  <div>
                    {clients.length > 0 ? (
                      <>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-xs)", marginBottom: 8, fontWeight: 500 }}>Key Clients</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {clients.map((c, i) => (
                            <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "4px 9px", borderRadius: 5, background: "var(--bg-soft)", color: "var(--text-s)", border: "1px solid var(--border-md)" }}>{c.name}</span>
                          ))}
                        </div>
                      </>
                    ) : hasProfile ? (
                      <div style={{ fontSize: 12, color: "var(--text-xs)", fontStyle: "italic" }}>No clients listed for this product.</div>
                    ) : null}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── S06 FUNDING ── */}
        <section data-sec="s06" id="s06" style={SEC}>
          <SecHeader n="05" title="Funding" />
          {roundHistory.length === 0 ? <Empty>{hasProfile ? "No funding rounds were found — this company may be bootstrapped or rounds are undisclosed." : "Run a full profile to collect funding data."}</Empty> : (
            <>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "1.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--navy)" }}>
                      {["Date","Round","Amount","Lead / Investors","Context"].map(h => (
                        <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.8)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "none" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roundHistory.map((r, i) => {
                      const isLatest = i === 0
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: isLatest ? "var(--amber-lt)" : "#fff" }}>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: isLatest ? "var(--amber)" : "var(--text-m)", fontWeight: isLatest ? 600 : 400 }}>{r.date || "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: isLatest ? "var(--amber)" : "var(--text-h)", fontWeight: isLatest ? 600 : 500 }}>{r.type || "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: isLatest ? "var(--amber)" : "var(--text-h)", fontWeight: isLatest ? 600 : 400 }}>{r.amount_usd_m ? `$${r.amount_usd_m}M` : "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-m)", lineHeight: 1.45 }}>{[r.lead, r.investors_str].filter(Boolean).join(" · ") || "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 12, color: "var(--text-s)", lineHeight: 1.55 }}>{r.context || "—"}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {(keyQuote2Text || keyQuoteText) && (
                <PullQuote text={keyQuote2Text || keyQuoteText} cite={keyQuote2Author || keyQuoteAuthor} />
              )}
            </>
          )}
        </section>

        {/* ── S13 COMPETITIVE LANDSCAPE ── */}
        <section data-sec="s13" id="s13" style={SEC}>
          <SecHeader n="06" title="Competitive Landscape" />
          {!str(s.competitive_density) && !competitors.length && !str(s.market_leader_name) ? (
            <Empty>{hasProfile ? "No competitive data was found. The market may be nascent or data is limited." : "Run a full profile to collect competitive data."}</Empty>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginBottom: "1.5rem" }}>
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.25rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: 6 }}>Market Density</div>
                  {str(s.competitive_density) ? (
                    <span style={{
                      fontFamily: "var(--mono)", fontSize: 14, fontWeight: 700, textTransform: "capitalize",
                      color: str(s.competitive_density) === "low" ? "var(--green)" : str(s.competitive_density) === "medium" ? "var(--amber)" : "var(--red)"
                    }}>{str(s.competitive_density)}</span>
                  ) : <span style={{ color: "var(--text-xs)", fontStyle: "italic" }}>—</span>}
                </div>
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.25rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: 6 }}>Market Leader (India)</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-h)" }}>{str(s.market_leader_name) || "—"}</div>
                </div>
                <div style={{ background: "var(--blue-lt)", border: "1px solid var(--blue-md)", borderRadius: 8, padding: "1rem 1.25rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--blue)", marginBottom: 6 }}>Global Comparable</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--navy)" }}>
                    {str(s.geo_analog_company) ? `${str(s.geo_analog_company)} (${str(s.geo_analog_country) || "—"})` : "—"}
                  </div>
                </div>
              </div>

              {competitors.length > 0 && (
                <div style={{ marginBottom: "1.5rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: "0.625rem" }}>Key Competitors</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                    {competitors.map((c, i) => (
                      <span key={i} style={{ padding: "0.375rem 0.875rem", borderRadius: 20, background: "var(--bg-soft)", border: "1px solid var(--border-md)", fontSize: 13, fontWeight: 500, color: "var(--navy)" }}>{c.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {str(s.differentiation_claim) && (
                <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: "0.5rem", fontWeight: 500 }}>Stated Differentiation</div>
                  <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.7, margin: 0 }}>{str(s.differentiation_claim)}</p>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── S07 PARTNERSHIPS ── */}
        <section data-sec="s07" id="s07" style={SEC}>
          <SecHeader n="07" title="Partnerships" />
          {partnerships.length === 0 ? <Empty>{hasProfile ? "No partnerships were found for this company." : "Run a full profile to collect partnership data."}</Empty> : (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--navy)" }}>
                    {(hasStructuredPartnerships
                      ? ["Partner","Category","Use Case","Signal Strength"]
                      : ["#","Partnership Detail"]
                    ).map(h => (
                      <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,255,255,0.8)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "none" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {partnerships.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: "#fff" }}>
                      {hasStructuredPartnerships ? (
                        <>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 13, fontWeight: 600, color: "var(--text-h)" }}>{p.partner}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 12, color: "var(--text-s)" }}>{p.category || "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-m)", lineHeight: 1.5 }}>{p.usecase || "—"}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 12, color: "var(--text-s)", lineHeight: 1.5, fontStyle: p.signal ? "italic" : "normal" }}>{p.signal || "—"}</td>
                        </>
                      ) : (
                        <>
                          <td style={{ padding: "0.75rem 1rem", fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)", width: 40 }}>{String(i+1).padStart(2,"0")}</td>
                          <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-m)", lineHeight: 1.55 }}>{p.partner}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── S12 RECOGNITIONS ── */}
        <section data-sec="s12" id="s12" style={SEC}>
          <SecHeader n="08" title="Recognitions" />
          {awards.length === 0 ? <Empty>{hasProfile ? "No awards or recognitions were found for this company." : "Run a full profile to collect awards data."}</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "1rem" }}>
              {awards.map((award, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.125rem", display: "flex", gap: "0.75rem", alignItems: "flex-start", transition: "box-shadow 0.15s, border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(30,58,95,0.1)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--blue-md)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)" }}>
                  <span style={{ color: "var(--amber)", fontWeight: 700, fontSize: 13, flexShrink: 0, marginTop: 1 }}>★</span>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-m)", lineHeight: 1.45 }}>{award}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── S09 LINKEDIN ── */}
        <section data-sec="s09" id="s09" style={SEC}>
          <SecHeader n="09" title="LinkedIn" />
          {profile.linkedin.length === 0 ? <Empty>{hasProfile ? "No LinkedIn signals were found — the founders or company may have limited LinkedIn presence." : "Run a full profile to collect LinkedIn signals."}</Empty> : (
            <>
              {[
                { label: "Founder Posts", signals: profile.linkedin.filter(sig => sig.pass === 8) },
                { label: "Third-Party Mentions", signals: profile.linkedin.filter(sig => sig.pass === 9) },
              ].map(({ label, signals }) => signals.length > 0 && (
                <div key={label} style={{ marginBottom: "1.5rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--text-xs)", fontWeight: 500, marginBottom: "0.75rem" }}>{label}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "1rem" }}>
                    {signals.map((sig, i) => (
                      <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.125rem 1.25rem" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.625rem", gap: 12 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-h)" }}>{sig.author_name || "Unknown"}</div>
                            {sig.author_role && <div style={{ fontSize: 11, color: "var(--text-s)", marginTop: 1 }}>{sig.author_role}</div>}
                            {sig.author_org  && <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-s)", marginTop: 1 }}>{sig.author_org}</div>}
                          </div>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.06em", borderRadius: 4, padding: "3px 7px", border: "1px solid var(--border)", background: "var(--bg-soft)", color: "var(--text-s)", whiteSpace: "nowrap", flexShrink: 0 }}>
                            {sig.signal_type?.replace(/_/g," ")}
                          </span>
                        </div>
                        {sig.post_text && <div style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.65, fontStyle: "italic" }}>"{sig.post_text}"</div>}
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)", marginTop: "0.5rem", display: "flex", justifyContent: "space-between" }}>
                          <span>{sig.post_date || ""}</span>
                          {sig.post_url && <a href={sig.post_url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", textDecoration: "none" }}>View ↗</a>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>

        {/* ── S10 GLASSDOOR ── */}
        <section data-sec="s10" id="s10" style={SEC}>
          <SecHeader n="10" title="Glassdoor" />
          {!s.glassdoor_rating && !s.glassdoor_wlb && !s.glassdoor_recommend && !s.glassdoor_themes ? <Empty>{hasProfile ? "No Glassdoor page was found — the company may not have enough reviews or the page may be unlisted." : "Run a full profile to collect Glassdoor data."}</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: s.glassdoor_rating ? "160px 1fr" : "1fr", gap: "2rem", background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.5rem", alignItems: "start" }}>
              {!!s.glassdoor_rating && (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 56, fontWeight: 700, color: "var(--navy)", lineHeight: 1 }}>{str(s.glassdoor_rating)}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)", marginTop: 2 }}>out of 5</div>
                <div style={{ color: "#f59e0b", fontSize: 16, letterSpacing: 2, margin: "6px 0" }}>{"★".repeat(Math.round(num(s.glassdoor_rating)))}{"☆".repeat(5 - Math.round(num(s.glassdoor_rating)))}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)" }}>{str(s.glassdoor_reviews)} reviews</div>
              </div>
              )}
              <div>
                {!!(s.glassdoor_recommend || s.glassdoor_positive_outlook_pct || s.glassdoor_interview_positive_pct) && (
                  <div style={{ display: "flex", gap: "1.25rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    {!!s.glassdoor_recommend && <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>{str(s.glassdoor_recommend)}% Recommend</span>}
                    {!!s.glassdoor_positive_outlook_pct && <span style={{ fontSize: 12, color: "var(--text-m)" }}>{str(s.glassdoor_positive_outlook_pct)}% Positive Outlook</span>}
                    {!!s.glassdoor_interview_positive_pct && <span style={{ fontSize: 12, color: "var(--text-s)" }}>{str(s.glassdoor_interview_positive_pct)}% Positive Interviews</span>}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
                  {([
                    ["Work-Life Balance",    s.glassdoor_wlb,        "var(--red)"],
                    ["Culture & Values",     s.glassdoor_culture,    "var(--amber)"],
                    ["Career Opportunities", s.glassdoor_career_opp, "var(--blue)"],
                  ] as [string, unknown, string][]).map(([l, v, c]) => (
                    <div key={l}>
                      <div style={{ fontSize: 11, color: "var(--text-xs)", marginBottom: 6 }}>{l}</div>
                      <div style={{ height: 5, background: "var(--bg-soft)", borderRadius: 3, overflow: "hidden", marginBottom: 5 }}>
                        <div style={{ height: "100%", width: v ? `${num(v)/5*100}%` : "0%", background: c, borderRadius: 3 }}/>
                      </div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, color: c }}>{v ? str(v) : "—"}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  {rv("glassdoor_review_positive") && (
                    <div style={{ borderRadius: 6, padding: "0.75rem 1rem", fontSize: 13, lineHeight: 1.6, background: "var(--green-lt)", border: "1px solid var(--green-bd)", color: "var(--text-m)" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, display: "block", marginBottom: 4, color: "var(--green)" }}>Positive</span>
                      {rv("glassdoor_review_positive")}
                    </div>
                  )}
                  {rv("glassdoor_review_neutral") && (
                    <div style={{ borderRadius: 6, padding: "0.75rem 1rem", fontSize: 13, lineHeight: 1.6, background: "var(--amber-lt)", border: "1px solid var(--amber-bd)", color: "var(--text-m)" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, display: "block", marginBottom: 4, color: "var(--amber)" }}>Mixed</span>
                      {rv("glassdoor_review_neutral")}
                    </div>
                  )}
                  {rv("glassdoor_review_negative") && (
                    <div style={{ borderRadius: 6, padding: "0.75rem 1rem", fontSize: 13, lineHeight: 1.6, background: "var(--red-lt)", border: "1px solid var(--red-bd)", color: "var(--text-m)" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, display: "block", marginBottom: 4, color: "var(--red)" }}>Risk</span>
                      {rv("glassdoor_review_negative")}
                    </div>
                  )}
                  {!rv("glassdoor_review_positive") && !rv("glassdoor_review_negative") && str(s.glassdoor_themes) && (
                    <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.65, margin: 0 }}>{str(s.glassdoor_themes)}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* ── S08 YOUTUBE ── */}
        <section data-sec="s08" id="s08" style={SEC}>
          <SecHeader n="11" title="YouTube" />
          {profile.youtube.length === 0 ? <Empty>{hasProfile ? "No YouTube content was found — the company may not have public video presence." : "Run a full profile to collect YouTube data."}</Empty> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: "8px 8px 0 0", overflow: "hidden" }}>
                {([
                  ["Videos", profile.youtube.length],
                  ["Latest",  profile.youtube[0]?.published_date?.slice(0,7) || "—"],
                  ["Own Channel", profile.youtube.some(v => v.is_own_channel) ? "Yes" : "No"],
                  ["Types", new Set(profile.youtube.map(v => v.video_type)).size],
                ] as [string, string|number][]).map(([l, v]) => (
                  <div key={l} style={{ background: "#fff", padding: "1rem 1.25rem" }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: 4 }}>{l}</div>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: "var(--text-h)" }}>{String(v)}</div>
                  </div>
                ))}
              </div>
              <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 8px 8px", overflow: "hidden" }}>
                {profile.youtube.map((v, i) => {
                  const bg:  Record<string,string> = { founder_on_camera:"var(--blue-lt)", podcast_feature:"var(--green-lt)", culture_content:"var(--amber-lt)" }
                  const clr: Record<string,string> = { founder_on_camera:"var(--navy)",    podcast_feature:"var(--green)",    culture_content:"var(--amber)" }
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "30px 1fr auto", gap: 14, alignItems: "start", padding: "0.875rem 1.25rem", borderBottom: "1px solid var(--border)", cursor: v.video_url ? "pointer" : "default", transition: "background 0.12s" }}
                      onClick={() => v.video_url && window.open(v.video_url, "_blank")}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-soft)"}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = ""}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)", paddingTop: 1 }}>{String(i+1).padStart(2,"0")}</span>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-h)", lineHeight: 1.45, marginBottom: 3 }}>{v.video_title}</div>
                        <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-s)" }}>{v.published_date} · {v.channel_name}</div>
                        {v.key_quote && <div style={{ fontSize: 12, color: "var(--text-m)", fontStyle: "italic", marginTop: 4 }}>"{v.key_quote}"</div>}
                      </div>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", padding: "3px 7px", borderRadius: 4, border: "1px solid var(--border)", whiteSpace: "nowrap", background: bg[v.video_type] || "var(--bg-soft)", color: clr[v.video_type] || "var(--text-s)" }}>
                        {v.video_type?.replace(/_/g," ")}
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>

        {/* ── S03 SCORECARD ── */}
        <section data-sec="s03" id="s03" style={SEC}>
          <SecHeader n="12" title="Scorecard" action={
            <button onClick={handleRescore} disabled={rescoring} style={{
              fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500,
              textTransform: "uppercase", letterSpacing: "0.06em",
              padding: "4px 10px", borderRadius: 5, cursor: rescoring ? "default" : "pointer",
              border: "1px solid var(--border-md)",
              background: rescoring ? "var(--bg-soft)" : "#fff",
              color: rescoring ? "var(--text-xs)" : "var(--text-s)",
              transition: "all 0.15s",
            }}>
              {rescoring ? "Rescoring…" : "↺ Rescore"}
            </button>
          } />
          {!sc ? <Empty>Scoring has not run yet for this company. Use the ↺ Rescore button above to generate a score.</Empty> : (
            <>
              {/* Ring + Data Quality side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: "2.5rem", alignItems: "start", marginBottom: "2rem" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ position: "relative", width: 144, height: 144 }}>
                    <svg width="144" height="144" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="72" cy="72" r="60" fill="none" stroke="var(--border)" strokeWidth="10" />
                      <circle ref={ringRef} cx="72" cy="72" r="60" fill="none"
                        stroke={score >= 80 ? "var(--green)" : score >= 60 ? "var(--amber)" : "var(--red)"}
                        strokeWidth="10" strokeLinecap="round" />
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontFamily: "var(--serif)", fontSize: 40, fontWeight: 700, lineHeight: 1,
                        color: score >= 80 ? "var(--green)" : score >= 60 ? "var(--amber)" : "var(--red)" }}>
                        {score}
                      </div>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>/ 100</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-s)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Composite Score</div>
                  {sc.scorecard_ids && sc.scorecard_ids.length > 0 && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap" }}>
                      {sc.scorecard_ids.map(id => {
                        const cfg = SCORECARD_STYLE[id] ?? SCORECARD_STYLE.base
                        return (
                          <span key={id} style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600,
                            textTransform: "uppercase", letterSpacing: "0.08em",
                            padding: "3px 9px", borderRadius: 4,
                            background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
                            {cfg.label}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ paddingTop: "1rem" }}>
                  {sc.data_quality_pct != null && (
                    <>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: 8, fontWeight: 500 }}>Data Quality</div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.875rem", marginBottom: "0.5rem" }}>
                        <div style={{ flex: 1, height: 8, background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${sc.data_quality_pct}%`, background: sc.data_quality_pct >= 70 ? "var(--green)" : sc.data_quality_pct >= 50 ? "var(--amber)" : "var(--red)", borderRadius: 4, transition: "width 1s ease" }}/>
                        </div>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 16, fontWeight: 700, color: sc.data_quality_pct >= 70 ? "var(--green)" : sc.data_quality_pct >= 50 ? "var(--amber)" : "var(--red)", whiteSpace: "nowrap" }}>{sc.data_quality_pct}%</span>
                      </div>
                      {sc.fields_applicable != null && (
                        <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)" }}>{sc.fields_collected} of {sc.fields_applicable} applicable fields collected</div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* All 8 dimensions — score-colored bars */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.875rem" }}>
                {([
                  ["Team Quality",       sc.dim_team,         sc.w_team],
                  ["Traction / Revenue", sc.dim_traction,     sc.w_traction],
                  ["Capital / Funding",  sc.dim_capital,      sc.w_capital],
                  ["Product / Moat",     sc.dim_product,      sc.w_product],
                  ["Market Opportunity", sc.dim_market,       sc.w_market],
                  ["Unit Economics",     sc.dim_unit_econ,    sc.w_unit_econ],
                  ["Momentum",           sc.dim_momentum,     sc.w_momentum],
                  ["Defensibility",      sc.dim_defensibility, sc.w_defensibility],
                ] as [string, number|undefined, number|undefined][]).map(([name, val, w]) => {
                  const c = dimColor(val)
                  return (
                    <div key={name} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.125rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.625rem" }}>
                        <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-s)" }}>{name}</span>
                        <span style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, color: c }}>{val ?? "—"}</span>
                      </div>
                      <div style={{ height: 5, background: "var(--bg-soft)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", width: val != null ? `${Math.min(val, 100)}%` : "0%", background: c, borderRadius: 3, transition: "width 1s ease" }}/>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-xs)" }}>{w != null ? `Weight: ${(w * 100).toFixed(0)}%` : "—"}</div>
                    </div>
                  )
                })}
              </div>

            </>
          )}
        </section>

        {/* ── S11 STRATEGIC INSIGHTS ── */}
        <section data-sec="s11" id="s11" style={SEC}>
          <SecHeader n="13" title="Strategic Insights" badge="VC Synthesis" />
          {!vcInsights?.thesis ? (
            <Empty>No strategic insights yet. Trigger an insights pass to generate VC-grade analysis.</Empty>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

              {/* Thesis */}
              <div style={{ background: "var(--navy)", borderRadius: 8, padding: "1.5rem 1.75rem" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.45)", marginBottom: "0.625rem", fontWeight: 500 }}>Investment Thesis</div>
                <p style={{ fontSize: 14, color: "#fff", lineHeight: 1.75, margin: 0, fontWeight: 400 }}>{vcInsights.thesis}</p>
              </div>

              {/* Moat + Comparable */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-xs)", marginBottom: "0.5rem", fontWeight: 500 }}>Moat</div>
                  <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.7, margin: 0 }}>{vcInsights.moat}</p>
                </div>
                <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-xs)", marginBottom: "0.5rem", fontWeight: 500 }}>Comparable</div>
                  <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.7, margin: 0 }}>{vcInsights.comparable}</p>
                </div>
              </div>

              {/* Bull / Bear */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div style={{ background: "var(--green-lt)", border: "1px solid var(--green-bd)", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--green)", marginBottom: "0.5rem", fontWeight: 500 }}>Bull Case</div>
                  <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.7, margin: 0 }}>{vcInsights.bull_case}</p>
                </div>
                <div style={{ background: "var(--red-lt)", border: "1px solid var(--red-bd)", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--red)", marginBottom: "0.5rem", fontWeight: 500 }}>Bear Case</div>
                  <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.7, margin: 0 }}>{vcInsights.bear_case}</p>
                </div>
              </div>

              {/* Risks + Key Questions */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                {vcInsights.risks && vcInsights.risks.length > 0 && (
                  <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-xs)", marginBottom: "0.875rem", fontWeight: 500 }}>Key Risks</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {vcInsights.risks.map((r, i) => (
                        <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--red)", flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                          <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.65, margin: 0 }}>{r}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {vcInsights.key_questions && vcInsights.key_questions.length > 0 && (
                  <div style={{ background: "var(--amber-lt)", border: "1px solid var(--amber-bd)", borderRadius: 8, padding: "1.25rem 1.5rem" }}>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--amber)", marginBottom: "0.875rem", fontWeight: 500 }}>Due Diligence Questions</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                      {vcInsights.key_questions.map((q, i) => (
                        <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
                          <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--amber)", flexShrink: 0, marginTop: 1 }}>Q{i + 1}</span>
                          <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.65, margin: 0 }}>{q}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}
        </section>

        {/* ── S14 ANALYST DATA ── */}
        <section data-sec="s14" id="s14" style={{ ...SEC, borderBottom: "none" }}>
          <SecHeader n="14" title="Analyst Data" badge="Private" action={
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {analystSaved && (
                <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)", background: "var(--green-lt)", border: "1px solid var(--green-bd)", borderRadius: 4, padding: "3px 8px" }}>
                  ✓ Saved & rescored
                </span>
              )}
              <button onClick={handleSaveAnalyst} disabled={savingAnalyst} style={{
                fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500,
                textTransform: "uppercase", letterSpacing: "0.06em",
                padding: "4px 12px", borderRadius: 5, cursor: savingAnalyst ? "default" : "pointer",
                border: "1px solid var(--navy)",
                background: savingAnalyst ? "var(--bg-soft)" : "var(--navy)",
                color: savingAnalyst ? "var(--text-xs)" : "#fff",
                transition: "all 0.15s",
              }}>
                {savingAnalyst ? "Saving…" : "Save & Rescore"}
              </button>
            </div>
          } />
          <p style={{ fontSize: 13, color: "var(--text-s)", marginBottom: "1.5rem", lineHeight: 1.6 }}>
            Private metrics not available on the public web. Values are analyst-verified and feed directly into scoring.
            Fields with existing data are pre-filled.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
            {ANALYST_FIELDS.map(({ name, label, unit, hint }) => {
              const saved = profile.analyst_inputs?.find(ai => ai.field_name === name)
              return (
                <div key={name} style={{ background: "#fff", border: `1px solid ${saved ? "var(--green-bd)" : "var(--border)"}`, borderRadius: 8, padding: "1rem 1.125rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <label style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-s)", fontWeight: 500 }}>
                      {label}
                    </label>
                    {saved && (
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--green)", background: "var(--green-lt)", border: "1px solid var(--green-bd)", borderRadius: 3, padding: "1px 5px", whiteSpace: "nowrap" }}>
                        ✓ Verified
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      value={analystDraft[name] ?? ""}
                      onChange={e => setAnalystDraft(d => ({ ...d, [name]: e.target.value }))}
                      placeholder="—"
                      style={{
                        flex: 1, border: "1px solid var(--border-md)", borderRadius: 5,
                        padding: "6px 8px", fontSize: 14, fontFamily: "var(--mono)",
                        outline: "none", color: "var(--text-h)", background: "#fff",
                        minWidth: 0,
                      }}
                    />
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)", whiteSpace: "nowrap" }}>{unit}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-xs)", marginTop: 4 }}>{hint}</div>
                  {saved?.updated_at && (
                    <div style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--text-xs)", marginTop: 4 }}>
                      Updated {new Date(saved.updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      {saved.entered_by ? ` by ${saved.entered_by.split("@")[0]}` : ""}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>

      </main>
    </div>
  )
}

// ── ANALYST FIELD DEFINITIONS ─────────────────────────────────────
const ANALYST_FIELDS: { name: string; label: string; unit: string; hint: string }[] = [
  { name: "nrr_pct",                 label: "Net Revenue Retention",       unit: "%",   hint: ">120% is excellent; <90% = churn problem" },
  { name: "gross_margin_pct",        label: "Gross Margin",                unit: "%",   hint: ">70% = SaaS-grade; <50% = warning" },
  { name: "cac_inr_l",               label: "Customer Acquisition Cost",   unit: "₹L",  hint: "Cost to acquire one customer (lakhs)" },
  { name: "ltv_inr_l",               label: "Lifetime Value",              unit: "₹L",  hint: "Expected revenue per customer (lakhs)" },
  { name: "monthly_burn_inr_cr",     label: "Monthly Cash Burn",           unit: "₹Cr", hint: "Current monthly net cash out (Cr)" },
  { name: "runway_months",           label: "Cash Runway",                 unit: "mo",  hint: "<6 months = critical; >18 months = safe" },
  { name: "top3_client_revenue_pct", label: "Top-3 Client Concentration",  unit: "%",   hint: ">50% = concentration risk" },
  { name: "mom_growth_pct",          label: "MoM Revenue Growth",          unit: "%",   hint: "3-month average MoM growth rate" },
  { name: "annual_churn_pct",        label: "Annual Revenue Churn",        unit: "%",   hint: "<10% = strong retention; >30% = critical" },
]

// ── UTILITY COMPONENTS ────────────────────────────────────────────

function SecHeader({ n, title, badge, action }: { n: string; title: string; badge?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500, background: "var(--blue-lt)", color: "var(--navy)", border: "1px solid var(--blue-md)", borderRadius: 4, padding: "3px 8px", letterSpacing: "0.06em" }}>{n}</span>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: "var(--text-h)", margin: 0 }}>{title}</h2>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }}/>
      {badge && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)", background: "var(--amber-lt)", border: "1px solid var(--amber-bd)", borderRadius: 4, padding: "2px 7px" }}>{badge}</span>}
      {action}
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ background: "#fff", padding: "1.25rem 1.375rem", borderRadius: 8, border: "1px solid var(--border)", transition: "box-shadow 0.15s, border-color 0.15s" }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(17,19,24,0.08)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--blue-md)" }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)" }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-s)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: value.length > 24 ? 12 : value.length > 16 ? 15 : 20, fontWeight: 500, color: color || "var(--text-h)", lineHeight: 1.2, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-s)", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

function PullQuote({ text, cite }: { text: string; cite?: string }) {
  return (
    <div style={{ borderLeft: "3px solid var(--navy)", background: "var(--blue-lt)", borderRadius: "0 8px 8px 0", padding: "1.25rem 1.5rem", margin: "1.5rem 0" }}>
      <blockquote style={{ fontFamily: "var(--serif)", fontSize: 16, fontStyle: "italic", color: "var(--text-h)", lineHeight: 1.65, marginBottom: cite ? "0.5rem" : 0 }}>
        &ldquo;{text}&rdquo;
      </blockquote>
      {cite && <cite style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--navy)", fontWeight: 500, fontStyle: "normal" }}>— {cite}</cite>}
    </div>
  )
}

const SCORECARD_STYLE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  saas:        { label: "B2B SaaS",    color: "#2563EB", bg: "#EFF6FF", border: "#BFDBFE" },
  d2c:         { label: "D2C",         color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  marketplace: { label: "Marketplace", color: "#7C3AED", bg: "#F5F3FF", border: "#DDD6FE" },
  fintech:     { label: "FinTech",     color: "#059669", bg: "#ECFDF5", border: "#A7F3D0" },
  deeptech:    { label: "Deep Tech",   color: "#4F46E5", bg: "#EEF2FF", border: "#C7D2FE" },
  base:        { label: "General",     color: "#6B7280", bg: "#F9FAFB", border: "#E5E7EB" },
}

function dimColor(val: number | undefined): string {
  if (val == null) return "var(--text-xs)"
  if (val >= 70) return "var(--green)"
  if (val >= 50) return "var(--amber)"
  return "var(--red)"
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-xs)", fontSize: 14 }}>{children}</div>
}

function Loading() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 14, color: "var(--text-s)", marginBottom: 8 }}>Loading profile…</div>
        <div style={{ width: 200, height: 4, background: "var(--bg-soft)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", width: "60%", background: "var(--navy)", borderRadius: 2 }}/>
        </div>
      </div>
    </div>
  )
}

function ErrorPage({ error, onBack }: { error: string; onBack: () => void }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <p style={{ fontSize: 14, color: "var(--red)", marginBottom: "1rem" }}>{error}</p>
        <button onClick={onBack} style={{ background: "var(--navy)", color: "#fff", border: "none", borderRadius: 6, padding: "8px 18px", fontSize: 13, cursor: "pointer" }}>← Back</button>
      </div>
    </div>
  )
}
