"use client"
import { useEffect, useState, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { getStartup, getJob, type FullProfile, type YouTubeSignal, type LinkedInSignal } from "@/lib/api"

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
    { n: "—", id: "hero", label: "Hero" },
    { n: "01", id: "s01", label: "Key Metrics" },
    { n: "02", id: "s02", label: "Corporate Structure" },
  ]},
  { group: "Intelligence", items: [
    { n: "03", id: "s03", label: "Score Card" },
    { n: "04", id: "s04", label: "Founders" },
    { n: "05", id: "s05", label: "Products" },
  ]},
  { group: "Ecosystem", items: [
    { n: "06", id: "s06", label: "Funding History" },
    { n: "07", id: "s07", label: "Partnerships" },
  ]},
  { group: "New Sources · v3", items: [
    { n: "08", id: "s08", label: "YouTube" },
    { n: "09", id: "s09", label: "LinkedIn" },
    { n: "10", id: "s10", label: "Glassdoor" },
  ]},
  { group: "Analysis", items: [
    { n: "11", id: "s11", label: "Strategic Insights" },
    { n: "12", id: "s12", label: "Recognitions" },
  ]},
]

const SEC: React.CSSProperties = {
  padding: "2.25rem 2.5rem",
  borderBottom: "1px solid var(--border)",
  background: "#fff",
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
  const [activeSection, setActiveSection] = useState("hero")
  const [activeProd, setActiveProd] = useState(0)
  const ringRef = useRef<SVGCircleElement>(null)

  const fetchProfile = () =>
    getStartup(id).then(setProfile).catch(e => setError(e.message)).finally(() => setLoading(false))

  useEffect(() => { fetchProfile() }, [id])

  useEffect(() => {
    if (!job_id || !researching) return
    const interval = setInterval(async () => {
      try {
        const [p, j] = await Promise.all([getStartup(id), getJob(job_id)])
        setProfile(p)
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
  const rv    = (name: string) => rawVal(raw, name)

  const scrollTo = (sectionId: string) => (e: React.MouseEvent) => {
    e.preventDefault()
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
    .map(n => ({ name: rv(`product_${n}_name`), type: rv(`product_${n}_type`), description: rv(`product_${n}_description`) }))
    .filter(p => p.name)
  const roundHistory = [1,2,3,4,5,6]
    .map(n => ({
      type:          rv(`round_${n}_type`),
      date:          rv(`round_${n}_date`),
      amount_usd_m:  rv(`round_${n}_amount_usd_m`),
      lead:          rv(`round_${n}_lead`),
      investors_str: rv(`round_${n}_investors`),
      context:       rv(`round_${n}_context`),
    }))
    .filter(r => r.type)
  const cxos = [1,2,3,4,5,6]
    .map(n => ({ name: rv(`cxo_${n}_name`), role: rv(`cxo_${n}_role`) }))
    .filter(c => c.name && !c.name.startsWith("not specified"))
  const partnerships = [1,2,3,4,5,6,7,8].map(n => ({
    partner:  rv(`partnership_${n}_partner`) || rv(`partnership_${n}`),
    category: rv(`partnership_${n}_category`),
    usecase:  rv(`partnership_${n}_usecase`),
    signal:   rv(`partnership_${n}_signal`),
  })).filter(p => p.partner)
  const hasStructuredPartnerships = partnerships.some(p => p.category || p.usecase)
  const clients = [1,2,3,4,5,6,7,8].map(n => ({ name: rv(`client_${n}_name`), sector: rv(`client_${n}_sector`) })).filter(c => c.name)
  const awards = [1,2,3,4,5,6,7,8,9,10].map(n => rv(`award_${n}`)).filter(Boolean)
  const insights = [1,2,3,4,5,6]
    .map(n => ({ n: String(n).padStart(2,"0"), tag: rv(`insight_${n}_tag`), title: rv(`insight_${n}_title`), body: rv(`insight_${n}_body`) }))
    .filter(i => i.title)

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

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>

      {/* ── TOPBAR ── */}
      <header style={{ position: "fixed", top: 0, left: 0, right: 0, height: 56, background: "var(--navy)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 1.5rem", zIndex: 500, boxShadow: "0 1px 0 rgba(255,255,255,0.08)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => router.push("/")} style={{ width: 32, height: 32, borderRadius: 6, background: "#fff", border: "none", cursor: "pointer", fontFamily: "var(--mono)", fontSize: 11, fontWeight: 700, color: "var(--navy)", letterSpacing: "-0.3px", flexShrink: 0 }}>
            {brandInitials}
          </button>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#fff", letterSpacing: "-0.01em" }}>{str(s.brand_name)} Intelligence Dossier</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>
              {[str(s.industry || s.auto_industry), str(s.industry_sub || s.auto_industry_sub), str(s.hq_city)].filter(Boolean).join(" · ")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {researching && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#fbbf24", display: "inline-block", animation: "pulse 1.5s infinite" }}/>
              Researching…
            </span>
          )}
          <div style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 100, padding: "4px 12px", fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500, color: "#fff" }}>
            Score: <span style={{ fontWeight: 700, color: "#fbbf24" }}>{score}</span> / 100
          </div>
        </div>
      </header>

      {/* ── SIDEBAR ── */}
      <nav style={{ position: "fixed", top: 56, left: 0, bottom: 0, width: 240, background: "#fff", borderRight: "1px solid var(--border)", overflowY: "auto", zIndex: 400 }}>
        {NAV_GROUPS.map(({ group, items }) => (
          <div key={group} style={{ paddingTop: "1.25rem" }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-xs)", padding: "0 1rem 0.4rem" }}>{group}</div>
            {items.map(({ n, id, label }) => {
              const active = activeSection === id
              return (
                <a key={id} href={`#${id}`} onClick={scrollTo(id)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 1rem", fontSize: 13, fontWeight: active ? 500 : 400, color: active ? "var(--navy)" : "var(--text-s)", borderLeft: `2px solid ${active ? "var(--navy)" : "transparent"}`, background: active ? "var(--blue-lt)" : "transparent", textDecoration: "none", transition: "all 0.12s" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 9, opacity: 0.5, minWidth: 18 }}>{n}</span>
                  {label}
                </a>
              )
            })}
          </div>
        ))}
        <div style={{ margin: "1.5rem 0 0", padding: "1rem", borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--green-lt)", border: "1px solid var(--green-bd)", borderRadius: 4, padding: "4px 8px", fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)", fontWeight: 500, marginBottom: "0.625rem" }}>
            ● DB v3 · {str(s.brand_name).slice(0,2).toUpperCase()}001
          </div>
          <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)", lineHeight: 1.9 }}>
            {sc?.data_quality_pct != null && `${sc.data_quality_pct}% data quality`}<br/>
            {sc?.fields_applicable != null && `${sc.fields_applicable} applicable fields`}<br/>
            {profile.meta.youtube_count} YT · {profile.meta.linkedin_count} LI signals<br/>
            {str(s.last_collected_at).slice(0,10)}
          </div>
        </div>
      </nav>

      {/* ── MAIN ── */}
      <main style={{ marginLeft: 240, paddingTop: 56 }}>

        {/* HERO */}
        <section data-sec="hero" id="hero" style={{ background: "#fff", borderBottom: "1px solid var(--border)", padding: "2.5rem 2.5rem 2rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2rem", alignItems: "start" }}>
            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--navy)", marginBottom: "0.625rem", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 20, height: 2, background: "var(--navy)", borderRadius: 1, display: "inline-block", flexShrink: 0 }}/>
                Intelligence Report · {str(s.industry || s.auto_industry)} · {str(s.industry_sub || s.auto_industry_sub)}
              </div>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(36px,4vw,52px)", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: "var(--navy)", marginBottom: "0.625rem" }}>
                {str(s.brand_name)}
              </h1>
              {str(s.auto_tagline) && (
                <p style={{ fontSize: 15, color: "var(--text-m)", lineHeight: 1.65, maxWidth: 540, marginBottom: "1.5rem" }}>
                  {str(s.auto_tagline)}
                </p>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: "1.75rem" }}>
                {str(s.stage || s.auto_stage) && <Badge navy>{str(s.stage || s.auto_stage).replace(/_/g," ").toUpperCase()}</Badge>}
                {Boolean(s.is_profitable) && <Badge green>✓ Profitable</Badge>}
                {str(s.industry || s.auto_industry) && <Badge blue>{str(s.industry || s.auto_industry)}</Badge>}
                {str(s.industry_sub || s.auto_industry_sub) && <Badge blue>{str(s.industry_sub || s.auto_industry_sub)}</Badge>}
                {str(s.hq_city) && <Badge gray>{str(s.hq_city)}</Badge>}
                {str(s.founded_date) && <Badge gray>Est. {str(s.founded_date).slice(0,4)}</Badge>}
                {str(s.glassdoor_rating) && <Badge amber>Glassdoor {str(s.glassdoor_rating)}/5</Badge>}
                {sc && <Badge amber blink>⊙ {sc.status === "provisional" ? "Provisional Score" : "Final Score"}</Badge>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                <HeroStat label={`Revenue ${str(s.revenue_fy) || rv("revenue_fy1_year") || "FY25"}`}
                  value={s.revenue_inr_cr ? `₹${str(s.revenue_inr_cr)} Cr` : rv("revenue_fy1_inr_cr") ? `₹${rv("revenue_fy1_inr_cr")} Cr` : "—"}
                  sub={s.revenue_yoy_pct ? `+${str(s.revenue_yoy_pct)}% YoY` : ""} border />
                <HeroStat label="Total Raised"
                  value={s.total_raised_usd_m ? `$${str(s.total_raised_usd_m)}M` : "—"}
                  sub={rv("round_count") ? `${rv("round_count")} rounds` : str(s.last_round_type)} border />
                <HeroStat label="Clients"
                  value={s.client_count ? `${str(s.client_count)}+` : "—"}
                  sub="Enterprise" border />
                <HeroStat label={volumeMetric ? "Scale" : "Team"}
                  value={volumeMetric ? (volumeMetric.split(";")[0]?.trim() || volumeMetric) : s.team_size ? str(s.team_size) : "—"}
                  sub={volumeMetric ? "" : "employees"} />
              </div>
            </div>
            {/* Score Ring */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, flexShrink: 0 }}>
              <div style={{ position: "relative", width: 148, height: 148 }}>
                <svg width="148" height="148" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)", display: "block" }}>
                  <circle cx="70" cy="70" r="60" fill="none" stroke="var(--border-md)" strokeWidth="9"/>
                  <circle ref={ringRef} cx="70" cy="70" r="60" fill="none" stroke="var(--navy)" strokeWidth="9" strokeLinecap="round"/>
                </svg>
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 40, fontWeight: 700, color: "var(--navy)", lineHeight: 1 }}>{score}</div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)", marginTop: 2 }}>/100</div>
                </div>
              </div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.08em", textAlign: "center" }}>Composite Score</div>
            </div>
          </div>
        </section>

        {/* ── S01 KEY METRICS ── */}
        <section data-sec="s01" id="s01" style={SEC}>
          <SecHeader n="01" title="Key Metrics" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "1.5rem" }}>
            <StatCard label={`Revenue ${str(s.revenue_fy) || rv("revenue_fy1_year") || ""}`}
              value={s.revenue_inr_cr ? `₹${str(s.revenue_inr_cr)} Cr` : rv("revenue_fy1_inr_cr") ? `₹${rv("revenue_fy1_inr_cr")} Cr` : "—"}
              sub={[s.revenue_yoy_pct ? `+${str(s.revenue_yoy_pct)}% YoY` : "", nextTarget ? `FY target ₹${nextTarget} Cr` : ""].filter(Boolean).join(" · ")}
              color="var(--navy)" />
            <StatCard label="Net Profit"
              value={s.net_profit_inr_cr ? `₹${str(s.net_profit_inr_cr)} Cr` : "—"}
              sub={Boolean(s.is_profitable) ? "Profitable ✓" : s.net_profit_inr_cr ? "Net Loss" : ""}
              color={Boolean(s.is_profitable) ? "var(--green)" : undefined} />
            <StatCard label={str(s.last_round_type) || "Latest Round"}
              value={s.last_round_size_inr_cr ? `₹${str(s.last_round_size_inr_cr)} Cr` : s.total_raised_usd_m ? `$${str(s.total_raised_usd_m)}M total` : "—"}
              sub={[str(s.last_round_type), str(s.last_round_date).slice(0,7)].filter(Boolean).join(" · ")} />
            <StatCard label="Total Raised"
              value={s.total_raised_usd_m ? `$${str(s.total_raised_usd_m)}M` : "—"}
              sub={rv("round_count") ? `${rv("round_count")} rounds` : ""} />
            {volumeMetric && (
              <StatCard label="Annual Scale"
                value={volumeMetric.split(";")[0]?.trim() || volumeMetric}
                sub="" />
            )}
            <StatCard label="Enterprise Clients"
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
              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 110, paddingBottom: 22, position: "relative" }}>
                <div style={{ position: "absolute", bottom: 22, left: 0, right: 0, height: 1, background: "var(--border-md)" }}/>
                {[...revenueHistory].reverse().map((r, i, arr) => {
                  const pct = maxRev > 0 ? Math.max(5, Math.round((parseFloat(r.inr) / maxRev) * 88)) : 5
                  const isCur = i === arr.length - 1
                  return (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, position: "relative" }}>
                      <div style={{ position: "absolute", top: -17, left: "50%", transform: "translateX(-50%)", fontFamily: "var(--mono)", fontSize: 9, fontWeight: isCur ? 700 : 500, color: isCur ? "var(--navy)" : "var(--text-s)", whiteSpace: "nowrap" }}>₹{r.inr}</div>
                      <div style={{ width: "100%", height: pct, background: isCur ? "var(--navy)" : "var(--blue-md)", borderRadius: "3px 3px 0 0" }}/>
                      <div style={{ marginTop: 5, fontFamily: "var(--mono)", fontSize: 9, color: isCur ? "var(--navy)" : "var(--text-xs)", fontWeight: isCur ? 500 : 400 }}>{r.year}</div>
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
                  <p style={{ fontSize: 13, color: "var(--navy)", lineHeight: 1.55, fontWeight: 500, margin: 0 }}>{latestNews}</p>
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

          {rv("sub_brands") && (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-soft)" }}>
                    {["Entity / Brand","Role","Note"].map(h => (
                      <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rv("sub_brands").split(/[,·]/).map(b => b.trim()).filter(Boolean).map((brand, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "#fff" : "var(--bg-soft)" }}>
                      <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-h)", fontWeight: 500 }}>{brand}</td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-m)" }}>—</td>
                      <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-s)" }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ── S03 SCORE CARD ── */}
        <section data-sec="s03" id="s03" style={SEC}>
          <SecHeader n="03" title="Score Card" />
          {!sc ? <Empty>No score data yet.</Empty> : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginBottom: "1.25rem" }}>
                {([
                  ["Founder Quality",    sc.dim_founder,  sc.w_founder,  "var(--navy)"],
                  ["Traction / Revenue", sc.dim_traction, sc.w_traction, "var(--green)"],
                  ["Capital / Funding",  sc.dim_capital,  sc.w_capital,  "var(--navy)"],
                  ["Product / Moat",     sc.dim_product,  sc.w_product,  "var(--green)"],
                  ["Market Opportunity", sc.dim_market,   sc.w_market,   "var(--navy)"],
                  ["Momentum",           sc.dim_momentum, sc.w_momentum, "var(--navy)"],
                ] as [string, number|undefined, number|undefined, string][]).map(([name, val, w, c]) => (
                  <div key={name} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.125rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.625rem" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-s)" }}>{name}</span>
                      <span style={{ fontFamily: "var(--serif)", fontSize: 24, fontWeight: 700, color: c }}>{val ?? "—"}</span>
                    </div>
                    <div style={{ height: 5, background: "var(--bg-soft)", borderRadius: 3, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ height: "100%", width: val ? `${val}%` : "0%", background: c, borderRadius: 3, transition: "width 1s ease" }}/>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-xs)" }}>{w != null ? `Weight: ${(w * 100).toFixed(0)}%` : "—"}</div>
                  </div>
                ))}
              </div>

              {sc.data_quality_pct != null && (
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", background: "var(--green-lt)", border: "1px solid var(--green-bd)", borderRadius: 6, padding: "0.75rem 1rem", marginBottom: "1.25rem" }}>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--green)", whiteSpace: "nowrap", fontWeight: 500 }}>Data Quality</span>
                  <div style={{ flex: 1, height: 6, background: "var(--green-bd)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${sc.data_quality_pct}%`, background: "var(--green)", borderRadius: 3 }}/>
                  </div>
                  <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 700, color: "var(--green)", whiteSpace: "nowrap" }}>{sc.data_quality_pct}%</span>
                  {sc.fields_applicable != null && (
                    <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--green)", whiteSpace: "nowrap" }}>{sc.fields_collected} of {sc.fields_applicable} fields</span>
                  )}
                </div>
              )}

              <div style={{ background: "var(--bg-soft)", border: "1px solid var(--border)", borderRadius: 8, padding: "1.125rem 1.5rem" }}>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: "0.75rem", fontWeight: 500 }}>Universal Ratios</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 2rem" }}>
                  {([
                    ["Funding Velocity",    sc.r_funding_velocity     ? `~₹${sc.r_funding_velocity} Cr/mo` : null],
                    ["Traction Velocity",   sc.r_traction_velocity    ? `~${sc.r_traction_velocity} cl/mo`  : null],
                    ["Founder-Market Fit",  sc.r_founder_mkt_fit      ? `${sc.r_founder_mkt_fit}/10`        : null],
                    ["Investor Quality",    sc.r_investor_quality     ? String(sc.r_investor_quality)       : null],
                    ["Product Surface",     sc.r_product_surface      ? String(sc.r_product_surface)        : null],
                    ["Recognition",         sc.r_recognition_momentum ? String(sc.r_recognition_momentum)   : null],
                    ["Capital Efficiency",  sc.r_capital_efficiency   ? String(sc.r_capital_efficiency)     : null],
                    ["Valuation/ARR Mult",  sc.r_valuation_arr_mult   ? `${sc.r_valuation_arr_mult}x`      : null],
                    ["Team Leverage",       sc.r_team_leverage        ? String(sc.r_team_leverage)          : null],
                    ["Round-up Ratio",      sc.r_round_up_ratio       ? String(sc.r_round_up_ratio)         : null],
                  ] as [string, string|null][]).map(([k, v]) => (
                    <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0.5rem 0", borderBottom: "1px solid var(--border)", gap: "1rem" }}>
                      <span style={{ fontSize: 12, color: "var(--text-s)" }}>{k}</span>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: v ? 500 : 400, color: v ? "var(--text-m)" : "var(--text-xs)", fontStyle: v ? "normal" : "italic", whiteSpace: "nowrap" }}>{v || "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        {/* ── S04 FOUNDERS ── */}
        <section data-sec="s04" id="s04" style={SEC}>
          <SecHeader n="04" title="Founders & Leadership" />
          {founders.length === 0 ? <Empty>No founder data collected yet.</Empty> : (
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
                    {f.bio
                      ? <p style={{ fontSize: 12, color: "var(--text-s)", lineHeight: 1.6 }}>{f.bio}</p>
                      : (f.education || f.domainYears) && (
                          <p style={{ fontSize: 12, color: "var(--text-s)", lineHeight: 1.6 }}>
                            {[f.education, f.domainYears ? `${f.domainYears}yr domain exp` : "", f.priorStartup === "yes" ? "Prior startup" : ""].filter(Boolean).join(" · ")}
                          </p>
                        )
                    }
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "0.625rem" }}>
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: f.status?.toLowerCase() === "former" ? "var(--text-xs)" : "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                        {f.status?.toLowerCase() === "former" ? "○ Former" : "● Active"}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        {f.isIitIim && f.isIitIim !== "false" && f.isIitIim !== "no" && (
                          <span style={{ fontFamily: "var(--mono)", fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "var(--blue-lt)", color: "var(--navy)", border: "1px solid var(--blue-md)" }}>IIT/IIM</span>
                        )}
                        {f.linkedinUrl && <a href={f.linkedinUrl} target="_blank" rel="noreferrer" style={{ fontFamily: "var(--mono)", fontSize: 9, color: "var(--blue)", textDecoration: "none" }}>↗ LI</a>}
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
                        <tr style={{ background: "var(--bg-soft)" }}>
                          {["Name","Role","Note"].map(h => <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "1px solid var(--border)" }}>{h}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {cxos.map((c, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "#fff" : "var(--bg-soft)" }}>
                            <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-h)", fontWeight: 500 }}>{c.name}</td>
                            <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-m)" }}>{c.role || "—"}</td>
                            <td style={{ padding: "0.75rem 1rem", fontSize: 13, color: "var(--text-s)" }}>—</td>
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

        {/* ── S05 PRODUCTS ── */}
        <section data-sec="s05" id="s05" style={SEC}>
          <SecHeader n="05" title="Products & Technology" />
          {products.length === 0 ? <Empty>No product data collected yet.</Empty> : (
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
                    {products[activeProd].type && (
                      <span style={{ display: "inline-block", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", padding: "2px 7px", borderRadius: 4, background: "var(--blue-lt)", color: "var(--navy)", border: "1px solid var(--blue-md)", marginBottom: "0.75rem" }}>
                        {products[activeProd].type}
                      </span>
                    )}
                    {products[activeProd].description && (
                      <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.7 }}>{products[activeProd].description}</p>
                    )}
                  </div>
                  <div>
                    {clients.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {clients.map((c, i) => (
                          <span key={i} style={{ fontSize: 11, fontWeight: 500, padding: "4px 9px", borderRadius: 5, background: "var(--bg-soft)", color: "var(--text-s)", border: "1px solid var(--border-md)" }}>{c.name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* ── S06 FUNDING HISTORY ── */}
        <section data-sec="s06" id="s06" style={SEC}>
          <SecHeader n="06" title="Funding History" />
          {roundHistory.length === 0 ? <Empty>No funding data collected yet.</Empty> : (
            <>
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", marginBottom: "1.5rem" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--bg-soft)" }}>
                      {["Date","Round","Amount","Lead / Investors","Context"].map(h => (
                        <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "1px solid var(--border)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {roundHistory.map((r, i) => {
                      const isLatest = i === 0
                      return (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: isLatest ? "var(--amber-lt)" : i % 2 === 0 ? "#fff" : "var(--bg-soft)" }}>
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

        {/* ── S07 PARTNERSHIPS ── */}
        <section data-sec="s07" id="s07" style={SEC}>
          <SecHeader n="07" title="Ecosystem & Partnerships" />
          {partnerships.length === 0 ? <Empty>No partnership data collected yet.</Empty> : (
            <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-soft)" }}>
                    {(hasStructuredPartnerships
                      ? ["Partner","Category","Use Case","Signal Strength"]
                      : ["#","Partnership Detail"]
                    ).map(h => (
                      <th key={h} style={{ textAlign: "left", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", fontWeight: 500, padding: "0.625rem 1rem", borderBottom: "1px solid var(--border)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {partnerships.map((p, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "#fff" : "var(--bg-soft)" }}>
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

        {/* ── S08 YOUTUBE ── */}
        <section data-sec="s08" id="s08" style={SEC}>
          <SecHeader n="08" title="YouTube Intelligence" badge="Pass 7" />
          {profile.youtube.length === 0 ? <Empty>No YouTube data collected.</Empty> : (
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

        {/* ── S09 LINKEDIN ── */}
        <section data-sec="s09" id="s09" style={SEC}>
          <SecHeader n="09" title="LinkedIn Intelligence" badge="Passes 8+9" />
          {profile.linkedin.length === 0 ? <Empty>No LinkedIn signals collected.</Empty> : (
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
                          <span>conf: {sig.confidence}{sig.post_date ? ` · ${sig.post_date}` : ""}</span>
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
          <SecHeader n="10" title="Glassdoor Culture Signal" badge="Pass 3" />
          {!s.glassdoor_rating ? <Empty>No Glassdoor data collected.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: "2rem", background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.5rem", alignItems: "start" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "var(--serif)", fontSize: 56, fontWeight: 700, color: "var(--navy)", lineHeight: 1 }}>{str(s.glassdoor_rating)}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)", marginTop: 2 }}>out of 5</div>
                <div style={{ color: "#f59e0b", fontSize: 16, letterSpacing: 2, margin: "6px 0" }}>{"★".repeat(Math.round(num(s.glassdoor_rating)))}{"☆".repeat(5 - Math.round(num(s.glassdoor_rating)))}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--text-xs)" }}>{str(s.glassdoor_reviews)} reviews</div>
              </div>
              <div>
                {!!(s.glassdoor_recommend || s.glassdoor_positive_outlook_pct || s.glassdoor_interview_positive_pct) && (
                  <div style={{ display: "flex", gap: "1.25rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                    {s.glassdoor_recommend && <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 600 }}>{str(s.glassdoor_recommend)}% Recommend</span>}
                    {s.glassdoor_positive_outlook_pct && <span style={{ fontSize: 12, color: "var(--text-m)" }}>{str(s.glassdoor_positive_outlook_pct)}% Positive Outlook</span>}
                    {s.glassdoor_interview_positive_pct && <span style={{ fontSize: 12, color: "var(--text-s)" }}>{str(s.glassdoor_interview_positive_pct)}% Positive Interviews</span>}
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
                      <span style={{ fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, display: "block", marginBottom: 4, color: "var(--amber)" }}>Nuance</span>
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

        {/* ── S11 STRATEGIC INSIGHTS ── */}
        <section data-sec="s11" id="s11" style={SEC}>
          <SecHeader n="11" title="Strategic Insights" />
          {insights.length === 0 ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-xs)", fontSize: 14 }}>
              Strategic insights require a synthesis pass. Re-profile with <code style={{ fontFamily: "var(--mono)", fontSize: 12, background: "var(--bg-soft)", padding: "1px 5px", borderRadius: 3 }}>only_passes: [&quot;insights&quot;]</code> once implemented.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "52px 1fr", gap: "1.25rem", padding: "1.25rem 1.5rem", borderBottom: i < insights.length - 1 ? "1px solid var(--border)" : "none", background: "#fff", alignItems: "start" }}>
                  <div style={{ fontFamily: "var(--serif)", fontSize: 30, fontWeight: 700, color: "var(--border-md)", lineHeight: 1 }}>{ins.n}</div>
                  <div>
                    {ins.tag && <span style={{ display: "inline-block", fontFamily: "var(--mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", padding: "2px 7px", borderRadius: 3, marginBottom: "0.5rem", background: "var(--blue-lt)", color: "var(--navy)", border: "1px solid var(--blue-md)" }}>{ins.tag}</span>}
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-h)", lineHeight: 1.45, marginBottom: "0.5rem" }}>{ins.title}</div>
                    <div style={{ fontSize: 13, color: "var(--text-s)", lineHeight: 1.7 }}>{ins.body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── S12 RECOGNITIONS ── */}
        <section data-sec="s12" id="s12" style={{ ...SEC, borderBottom: "none" }}>
          <SecHeader n="12" title="Recognitions" />
          {awards.length === 0 ? <Empty>No awards or recognitions collected yet.</Empty> : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: "1rem" }}>
              {awards.map((award, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1.125rem", display: "flex", flexDirection: "column", transition: "box-shadow 0.15s, border-color 0.15s" }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = "0 2px 10px rgba(30,58,95,0.1)"; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--blue-md)" }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)" }}>
                  <div style={{ fontFamily: "var(--mono)", fontSize: 20, color: "var(--amber)", fontWeight: 700, marginBottom: "0.625rem", lineHeight: 1 }}>★</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-h)", lineHeight: 1.4 }}>{award}</div>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}

// ── UTILITY COMPONENTS ────────────────────────────────────────────

function SecHeader({ n, title, badge }: { n: string; title: string; badge?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500, background: "var(--blue-lt)", color: "var(--navy)", border: "1px solid var(--blue-md)", borderRadius: 4, padding: "3px 8px", letterSpacing: "0.06em" }}>{n}</span>
      <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: "var(--text-h)", margin: 0 }}>{title}</h2>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }}/>
      {badge && <span style={{ fontFamily: "var(--mono)", fontSize: 10, color: "var(--amber)", background: "var(--amber-lt)", border: "1px solid var(--amber-bd)", borderRadius: 4, padding: "2px 7px" }}>{badge}</span>}
    </div>
  )
}

function HeroStat({ label, value, sub, border }: { label: string; value: string; sub: string; border?: boolean }) {
  return (
    <div style={{ padding: "1rem 1.25rem", background: "#fff", borderRight: border ? "1px solid var(--border)" : "none", transition: "background 0.15s" }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-soft)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "#fff"}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: "var(--text-h)", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-s)", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function StatCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{ background: "#fff", padding: "1.125rem 1.25rem", transition: "background 0.15s" }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = "var(--bg-soft)"}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = "#fff"}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-xs)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: "var(--serif)", fontSize: 26, fontWeight: 700, color: color || "var(--text-h)", lineHeight: 1.1, marginBottom: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--text-s)", lineHeight: 1.4 }}>{sub}</div>}
    </div>
  )
}

function Badge({ children, navy, blue, green, amber, gray, blink }: { children: React.ReactNode; navy?: boolean; blue?: boolean; green?: boolean; amber?: boolean; gray?: boolean; blink?: boolean }) {
  const bg    = navy ? "var(--blue-lt)" : blue ? "var(--blue-bg)"  : green ? "var(--green-lt)" : amber ? "var(--amber-lt)" : "var(--bg-soft)"
  const color = navy ? "var(--navy)"    : blue ? "var(--blue)"     : green ? "var(--green)"    : amber ? "var(--amber)"    : "var(--text-s)"
  const bdr   = navy ? "var(--blue-md)" : blue ? "var(--blue-bd)"  : green ? "var(--green-bd)" : amber ? "var(--amber-bd)" : "var(--border-md)"
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--mono)", fontSize: 10, fontWeight: 500, letterSpacing: "0.04em", borderRadius: 5, padding: "4px 9px", border: `1px solid ${bdr}`, background: bg, color, animation: blink ? "blink 2.5s ease-in-out infinite" : undefined }}>
      {children}
    </span>
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
