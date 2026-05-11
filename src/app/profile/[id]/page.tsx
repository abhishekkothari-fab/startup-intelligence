"use client"
import { useEffect, useState, use } from "react"
import { useRouter } from "next/navigation"
import { getStartup, getJob, type FullProfile, type YouTubeSignal, type LinkedInSignal } from "@/lib/api"

function str(v: unknown): string {
  if (v === null || v === undefined) return ""
  return String(v)
}
function num(v: unknown): number {
  return Number(v) || 0
}
function rawVal(raw: Record<string, unknown>[], name: string): string {
  const f = raw.find(r => r.field_name === name)
  if (!f || f.applicability === "not_applicable") return ""
  return str(f.raw_value)
}
function rawByPack(raw: Record<string, unknown>[], pack: string) {
  return raw.filter(r => r.field_pack === pack && r.applicability !== "not_applicable" && r.raw_value)
}

export default function ProfilePage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ job_id?: string }> }) {
  const { id } = use(params)
  const { job_id } = use(searchParams)
  const router = useRouter()
  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [activeTab, setActiveTab] = useState("overview")
  const [researching, setResearching] = useState(!!job_id)

  const fetchProfile = () => getStartup(id).then(setProfile).catch(e => setError(e.message)).finally(() => setLoading(false))

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
      } catch { /* ignore poll errors */ }
    }, 5000)
    return () => clearInterval(interval)
  }, [id, job_id, researching])

  if (loading) return <LoadingState />
  if (error)   return <ErrorState error={error} onBack={() => router.push("/")} />
  if (!profile) return null

  const s  = profile.startup
  const sc = profile.latest_score
  const score = sc?.composite_score ?? 0

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{ background: "var(--navy)", padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
        <button onClick={() => router.push("/")} style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 5, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>← Back</button>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>{str(s.brand_name)}</span>
        <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontFamily: "monospace" }}>Score: {score}/100</span>
      </header>

      {researching && (
        <div style={{ background: "var(--amber-lt)", borderBottom: "1px solid var(--amber-bd)", padding: "8px 1.5rem", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--amber)" }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "var(--amber)", animation: "pulse 1.5s infinite" }}/>
          Deep research in progress — page updates automatically every 5 seconds
        </div>
      )}

      <div style={{ display: "flex", flex: 1 }}>
        <nav style={{ width: 220, flexShrink: 0, borderRight: "1px solid var(--border)", padding: "1.25rem 0", background: "#fff", position: "sticky", top: 0, height: "calc(100vh - 56px)", overflowY: "auto" }}>
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <div style={navGroupLabel}>{label}</div>
              {items.map(({ id: tabId, title }) => (
                <button key={tabId} onClick={() => setActiveTab(tabId)} style={navItem(activeTab === tabId)}>{title}</button>
              ))}
            </div>
          ))}
          <div style={{ margin: "1.5rem 1.25rem 0", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "var(--green-lt)", border: "1px solid var(--green-bd)", borderRadius: 20, padding: "3px 10px", fontFamily: "monospace", fontSize: 10, color: "var(--green)" }}>
              ● DB v3 · {str(s.stage) || "—"}
            </div>
            <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10, color: "var(--text-xs)", lineHeight: 1.8 }}>
              {sc?.data_quality_pct}% quality<br/>
              {profile.meta.youtube_count} YT videos<br/>
              {profile.meta.linkedin_count} LI signals<br/>
              {profile.meta.fields_collected} fields
            </div>
          </div>
        </nav>

        <main style={{ flex: 1, padding: "2.5rem", overflow: "auto" }}>
          {activeTab === "overview"    && <OverviewTab s={s} sc={sc} score={score} />}
          {activeTab === "score"       && <ScoreTab sc={sc} />}
          {activeTab === "founders"    && <FoundersTab raw={profile.raw_summary} />}
          {activeTab === "funding"     && <FundingTab s={s} raw={profile.raw_summary} />}
          {activeTab === "products"    && <ProductsTab raw={profile.raw_summary} />}
          {activeTab === "youtube"     && <YouTubeTab videos={profile.youtube} />}
          {activeTab === "linkedin"    && <LinkedInTab signals={profile.linkedin} />}
          {activeTab === "glassdoor"   && <GlassdoorTab s={s} />}
          {activeTab === "regulatory"  && <RegulatoryTab raw={profile.raw_summary} />}
          {activeTab === "raw"         && <RawTab summary={profile.raw_summary} />}
        </main>
      </div>
    </div>
  )
}

function OverviewTab({ s, sc, score }: { s: Record<string, unknown>; sc: FullProfile["latest_score"]; score: number }) {
  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--blue)", letterSpacing: "0.1em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6, marginBottom: "0.75rem" }}>
          <span style={{ display: "block", width: 18, height: 1.5, background: "var(--blue)" }}/>
          Intelligence Report · {str(s.industry)} · {str(s.hq_country)}
        </div>
        <h1 style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 800, letterSpacing: "-0.02em", color: "var(--text-h)", lineHeight: 0.95, marginBottom: "0.625rem" }}>
          {str(s.brand_name)}
        </h1>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", marginBottom:"1rem" }}>
          {str(s.legal_name) && (
            <span style={{ fontSize: 13, color: "var(--text-s)", fontFamily: "monospace" }}>
              {str(s.legal_name)}{str(s.cin) ? ` · CIN: ${str(s.cin)}` : ""}
            </span>
          )}
          {str(s.website) && (
            <a href={str(s.website).startsWith("http") ? str(s.website) : `https://${str(s.website)}`} target="_blank" rel="noreferrer"
              style={{ fontFamily:"monospace", fontSize:11, color:"var(--blue)", textDecoration:"none", border:"1px solid var(--blue-md)", borderRadius:4, padding:"2px 8px", background:"var(--blue-lt)" }}>
              ↗ {str(s.website).replace(/^https?:\/\//,"")}
            </a>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.75rem" }}>
        <Chip navy>{str(s.stage).replace(/_/g," ").toUpperCase()}</Chip>
        {Boolean(s.is_profitable) && <Chip green>✓ Profitable</Chip>}
        {str(s.industry)         && <Chip blue>{str(s.industry)}</Chip>}
        {str(s.industry_sub)     && <Chip blue>{str(s.industry_sub)}</Chip>}
        {str(s.biz_model)        && <Chip gray>{str(s.biz_model)}</Chip>}
        {str(s.region)           && <Chip gray>{str(s.region)}</Chip>}
        {str(s.hq_city)          && <Chip gray>{str(s.hq_city)}</Chip>}
        {str(s.founded_date)     && <Chip gray>Est. {str(s.founded_date).slice(0,4)}</Chip>}
        {str(s.glassdoor_rating) && <Chip amber>Glassdoor {str(s.glassdoor_rating)}/5</Chip>}
      </div>
      <StatGrid cols={5}>
        <StatCard label="Revenue"      value={s.revenue_inr_cr     ? `₹${str(s.revenue_inr_cr)} Cr`   : "—"} sub={[str(s.revenue_fy), s.revenue_yoy_pct ? `YoY ${str(s.revenue_yoy_pct)}%` : ""].filter(Boolean).join(" · ")} />
        <StatCard label="Net Profit"   value={s.net_profit_inr_cr  ? `₹${str(s.net_profit_inr_cr)} Cr`: "—"} sub={Boolean(s.is_profitable) ? "Profitable" : s.net_profit_inr_cr ? "Loss" : ""} />
        <StatCard label="Total Raised" value={s.total_raised_usd_m ? `$${str(s.total_raised_usd_m)}M` : "—"} sub={str(s.last_round_type)} />
        <StatCard label="Clients"      value={s.client_count       ? `${str(s.client_count)}+`         : "—"} sub="Enterprise" />
        <StatCard label="Team"         value={s.team_size          ? str(s.team_size)                  : "—"} sub="employees" />
      </StatGrid>
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "1.5rem", display: "grid", gridTemplateColumns: "120px 1fr", gap: "1.5rem", alignItems: "center", background: "var(--bg-soft)", marginTop: "0.5rem" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>{score}</div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-xs)", marginTop: 4 }}>/100</div>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-h)", marginBottom: "0.5rem" }}>Composite Intelligence Score</p>
          <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.6 }}>
            {str(s.stage).replace(/_/g," ")} stage weights applied.{sc ? ` Data quality: ${sc.data_quality_pct}%.` : ""} Score status: <strong>{sc?.status ?? "provisional"}</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}

function RatioGrid({ rows }: { rows: [string, string][] }) {
  const visible = rows.filter(([,v]) => v !== "—")
  if (!visible.length) return null
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:"1.5rem" }}>
      {rows.map(([k,v], i) => (
        <div key={k} style={{ padding:"9px 14px", background:i%2===0?"#fff":"var(--bg-soft)", borderBottom:"1px solid var(--border)", display:"flex", justifyContent:"space-between", alignItems:"baseline" }}>
          <span style={{ fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-s)" }}>{k}</span>
          <span style={{ fontFamily:"monospace", fontSize:11, fontWeight:500, color:v==="—"?"var(--text-xs)":"var(--text-h)" }}>{v}</span>
        </div>
      ))}
    </div>
  )
}

function ScoreTab({ sc }: { sc: FullProfile["latest_score"] }) {
  if (!sc) return <Empty>No score data yet.</Empty>
  const fmt = (n?: number | null) => n != null ? String(n) : "—"
  const pct = (n?: number | null) => n != null ? `${(n*100).toFixed(0)}%` : "—"
  const dims: [string, number, number | undefined][] = [
    ["Founder Quality",    sc.dim_founder,  sc.w_founder],
    ["Traction / Revenue", sc.dim_traction, sc.w_traction],
    ["Capital / Funding",  sc.dim_capital,  sc.w_capital],
    ["Product / Moat",     sc.dim_product,  sc.w_product],
    ["Market Opportunity", sc.dim_market,   sc.w_market],
    ["Momentum",           sc.dim_momentum, sc.w_momentum],
  ]
  const hasNbfc = sc.r_gnpa_pct || sc.r_nim_pct || sc.r_car_pct || sc.r_roe_pct
  return (
    <div>
      <SecHeader title="Score Card" tag="Scoring" />

      {/* metadata strip */}
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:"1rem" }}>
        {sc.score_version && <Chip gray>{sc.score_version}</Chip>}
        {sc.stage         && <Chip blue>{sc.stage.replace(/_/g," ")}</Chip>}
        {sc.industry      && <Chip gray>{sc.industry}</Chip>}
        {sc.industry_sub  && <Chip gray>{sc.industry_sub}</Chip>}
        <Chip gray>{sc.status}</Chip>
        {sc.scored_at     && <Chip gray>Scored {sc.scored_at.slice(0,10)}</Chip>}
      </div>

      <DQBar pct={sc.data_quality_pct} />

      {/* field count breakdown */}
      {sc.fields_applicable != null && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, background:"var(--border)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:"1.5rem" }}>
          {([["Applicable", sc.fields_applicable, "var(--green)"],["Collected", sc.fields_collected, "var(--blue)"],["Unknown", sc.fields_unknown, "var(--amber)"],["N/A", sc.fields_not_applicable, "var(--text-xs)"]] as [string,number|undefined,string][]).map(([l,v,c])=>(
            <div key={l} style={{ background:"#fff", padding:"0.75rem 1rem" }}>
              <div style={{ fontFamily:"monospace", fontSize:9, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--text-xs)", marginBottom:3 }}>{l}</div>
              <div style={{ fontSize:20, fontWeight:700, color:c }}>{v ?? "—"}</div>
            </div>
          ))}
        </div>
      )}

      {/* dimension scores */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:"1.5rem" }}>
        {dims.map(([name, val, w]) => (
          <div key={name} style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:8, padding:"1rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:8 }}>
              <span style={{ fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-s)" }}>{name}</span>
              <span style={{ fontSize:20, fontWeight:700, color:scoreColor(val) }}>{val}</span>
            </div>
            <div style={{ height:5, background:"var(--bg-soft)", borderRadius:3, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${val}%`, background:scoreColor(val), borderRadius:3 }}/>
            </div>
            <div style={{ fontSize:11, color:"var(--text-xs)", marginTop:5 }}>
              {w != null ? `Weight: ${pct(w)}` : "—"}
            </div>
          </div>
        ))}
      </div>

      <SecHeader title="Ratios" tag="Analytics" />
      <RatioGrid rows={[
        ["Funding Velocity",    sc.r_funding_velocity     ? `₹${sc.r_funding_velocity} Cr/mo`  : "—"],
        ["Traction Velocity",   sc.r_traction_velocity    ? `${sc.r_traction_velocity} cl/mo`   : "—"],
        ["Founder-Market Fit",  sc.r_founder_mkt_fit      ? `${sc.r_founder_mkt_fit}/10`        : "—"],
        ["Investor Quality",    sc.r_investor_quality     ? fmt(sc.r_investor_quality)           : "—"],
        ["Product Surface",     sc.r_product_surface      ? fmt(sc.r_product_surface)            : "—"],
        ["Recognition",         sc.r_recognition_momentum ? fmt(sc.r_recognition_momentum)       : "—"],
        ["Capital Efficiency",  sc.r_capital_efficiency   ? fmt(sc.r_capital_efficiency)         : "—"],
        ["Valuation/ARR Mult",  sc.r_valuation_arr_mult   ? `${sc.r_valuation_arr_mult}x`        : "—"],
        ["Team Leverage",       sc.r_team_leverage        ? fmt(sc.r_team_leverage)              : "—"],
        ["Grant/Equity Ratio",  sc.r_grant_equity_ratio   ? fmt(sc.r_grant_equity_ratio)         : "—"],
        ["Round-up Ratio",      sc.r_round_up_ratio       ? fmt(sc.r_round_up_ratio)             : "—"],
      ]} />

      {hasNbfc && (
        <>
          <SecHeader title="NBFC Ratios" tag="FinServ" />
          <RatioGrid rows={[
            ["GNPA %",  sc.r_gnpa_pct ? `${sc.r_gnpa_pct}%` : "—"],
            ["NIM %",   sc.r_nim_pct  ? `${sc.r_nim_pct}%`  : "—"],
            ["CAR %",   sc.r_car_pct  ? `${sc.r_car_pct}%`  : "—"],
            ["ROE %",   sc.r_roe_pct  ? `${sc.r_roe_pct}%`  : "—"],
          ]} />
        </>
      )}
    </div>
  )
}

function YouTubeTab({ videos }: { videos: YouTubeSignal[] }) {
  if (!videos.length) return <Empty>No YouTube data collected.</Empty>
  const typeBg:  Record<string,string> = { founder_on_camera:"var(--blue-lt)", podcast_feature:"var(--green-lt)", culture_content:"var(--amber-lt)" }
  const typeClr: Record<string,string> = { founder_on_camera:"var(--navy)",    podcast_feature:"var(--green)",    culture_content:"var(--amber)" }
  return (
    <div>
      <SecHeader title="YouTube Intelligence" tag="Pass 7" />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, background:"var(--border)", border:"1px solid var(--border)", borderRadius:"8px 8px 0 0", overflow:"hidden" }}>
        {([["Videos",videos.length],["Own Channel",videos.some(v=>v.is_own_channel)?"Yes":"No"],["Latest",videos[0]?.published_date?.slice(0,7)||"—"],["Types",[...new Set(videos.map(v=>v.video_type))].length]] as [string,string|number][]).map(([l,v])=>(
          <div key={l} style={{ background:"#fff", padding:"0.875rem 1.25rem" }}>
            <div style={statLabel}>{l}</div>
            <div style={{ fontSize:20, fontWeight:700, color:"var(--text-h)" }}>{String(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ border:"1px solid var(--border)", borderTop:"none", borderRadius:"0 0 8px 8px", overflow:"hidden" }}>
        {videos.map((v,i)=>(
          <div key={i} style={{ display:"grid", gridTemplateColumns:"28px 1fr auto", gap:12, padding:"10px 1.25rem", borderBottom:"1px solid var(--border)", alignItems:"start", cursor:v.video_url?"pointer":"default" }}
            onClick={()=>v.video_url&&window.open(v.video_url,"_blank")}
            onMouseEnter={e=>(e.currentTarget.style.background="var(--bg-soft)")}
            onMouseLeave={e=>(e.currentTarget.style.background="")}>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"var(--text-xs)", paddingTop:2 }}>{String(i+1).padStart(2,"0")}</span>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--text-h)", lineHeight:1.4 }}>{v.video_title}</div>
              <div style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-s)", marginTop:2 }}>
                {v.published_date} · {v.channel_name}{v.confidence!=null ? ` · conf: ${v.confidence}` : ""}
              </div>
              {v.key_quote&&<div style={{ fontSize:12, color:"var(--text-m)", fontStyle:"italic", marginTop:4 }}>"{v.key_quote}"</div>}
              {v.signal_tags?.length && (
                <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:5 }}>
                  {v.signal_tags.map((t,ti)=><span key={ti} style={{ fontFamily:"monospace", fontSize:9, padding:"1px 5px", borderRadius:3, background:"var(--bg-soft)", border:"1px solid var(--border)", color:"var(--slate)" }}>{t}</span>)}
                </div>
              )}
            </div>
            <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"3px 7px", borderRadius:4, whiteSpace:"nowrap", background:typeBg[v.video_type]||"var(--bg-soft)", color:typeClr[v.video_type]||"var(--slate)", border:"1px solid var(--border)" }}>{v.video_type?.replace(/_/g," ")}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkedInTab({ signals }: { signals: LinkedInSignal[] }) {
  if (!signals.length) return <Empty>No LinkedIn signals collected.</Empty>
  const pass8 = signals.filter(s=>s.pass===8)
  const pass9 = signals.filter(s=>s.pass===9)
  return (
    <div>
      <SecHeader title="LinkedIn Intelligence" tag="Passes 8+9" />
      {pass8.length>0&&<><div style={sectionSubLabel}>Founder posts</div><div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:"1.5rem" }}>{pass8.map((s,i)=><LiCard key={i} s={s}/>)}</div></>}
      {pass9.length>0&&<><div style={sectionSubLabel}>Third-party mentions</div><div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>{pass9.map((s,i)=><LiCard key={i} s={s}/>)}</div></>}
    </div>
  )
}

function LiCard({ s }: { s: LinkedInSignal }) {
  return (
    <div style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:8, padding:"1rem" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:8 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--text-h)" }}>{s.author_name||"Unknown"}</div>
          {s.author_role && <div style={{ fontSize:11, color:"var(--text-m)", marginTop:1 }}>{s.author_role}</div>}
          <div style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-s)", marginTop:1 }}>{s.author_org}</div>
        </div>
        <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"2px 7px", borderRadius:4, border:"1px solid var(--border)", background:"var(--bg-soft)", color:"var(--slate)", whiteSpace:"nowrap", flexShrink:0 }}>{s.signal_type?.replace(/_/g," ")}</span>
      </div>
      {s.post_text&&<div style={{ fontSize:13, color:"var(--text-m)", lineHeight:1.6, fontStyle:"italic" }}>"{s.post_text}"</div>}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
        <span style={{ fontFamily:"monospace", fontSize:9, color:"var(--text-xs)" }}>conf: {s.confidence}{s.post_date?` · ${s.post_date}`:""}</span>
        {s.post_url && <a href={s.post_url} target="_blank" rel="noreferrer" style={{ fontFamily:"monospace", fontSize:9, color:"var(--blue)", textDecoration:"none" }}>View post ↗</a>}
      </div>
    </div>
  )
}

function GlassdoorTab({ s }: { s: Record<string, unknown> }) {
  const rating = s.glassdoor_rating ? num(s.glassdoor_rating) : null
  if (!rating) return <Empty>No Glassdoor data collected.</Empty>
  return (
    <div>
      <SecHeader title="Glassdoor Culture Signal" tag="Pass 3" />
      <div style={{ border:"1px solid var(--border)", borderRadius:8, padding:"1.5rem", display:"grid", gridTemplateColumns:"180px 1fr", gap:"1.5rem", alignItems:"start" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:52, fontWeight:700, color:"var(--text-h)", lineHeight:1 }}>{rating}</div>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"var(--text-xs)", marginTop:2 }}>out of 5</div>
          <div style={{ color:"#f59e0b", fontSize:16, letterSpacing:2, margin:"6px 0" }}>{"★".repeat(Math.round(rating))}{"☆".repeat(5-Math.round(rating))}</div>
          <div style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-xs)" }}>{str(s.glassdoor_reviews)} reviews</div>
        </div>
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"1rem", marginBottom:"1rem" }}>
            {([["Work-Life Balance",s.glassdoor_wlb,"var(--red)"],["Culture & Values",s.glassdoor_culture,"var(--amber)"],["Would Recommend",s.glassdoor_recommend?`${str(s.glassdoor_recommend)}%`:null,"var(--green)"]] as [string,unknown,string][]).map(([l,v,c])=>(
              <div key={l}>
                <div style={statLabel}>{l}</div>
                <div style={{ height:5, background:"var(--bg-soft)", borderRadius:3, overflow:"hidden", margin:"5px 0" }}>
                  <div style={{ height:"100%", width:v?`${num(v)/5*100}%`:"0%", background:c, borderRadius:3 }}/>
                </div>
                <div style={{ fontFamily:"monospace", fontSize:11, fontWeight:500, color:c }}>{v?str(v):"—"}</div>
              </div>
            ))}
          </div>
          {str(s.glassdoor_themes)&&<p style={{ fontSize:13, color:"var(--text-m)", lineHeight:1.65 }}>{str(s.glassdoor_themes)}</p>}
        </div>
      </div>
    </div>
  )
}

function FundingTab({ s, raw }: { s: Record<string, unknown>; raw: Record<string, unknown>[] }) {
  const rv = (name: string) => rawVal(raw, name)
  const roundCount  = rv("round_count")
  const leadInv     = rv("lead_investor")
  const investors = [1,2,3,4,5].map(n => ({ name: rv(`investor_${n}_name`), tier: rv(`investor_${n}_tier`) })).filter(i => i.name)

  // Build round history from flat fields (round_1_type, round_1_date, etc.)
  const roundHistory = [1,2,3,4,5].map(n => ({
    type:          rv(`round_${n}_type`),
    date:          rv(`round_${n}_date`),
    amount_usd_m:  rv(`round_${n}_amount_usd_m`),
    lead:          rv(`round_${n}_lead`),
    investors_str: rv(`round_${n}_investors`),
  })).filter(r => r.type)

  return (
    <div>
      <SecHeader title="Funding" tag="Capital" />
      <StatGrid>
        <StatCard label="Total Raised"    value={s.total_raised_usd_m     ? `$${str(s.total_raised_usd_m)}M`       : "—"} sub={roundCount ? `${roundCount} rounds` : ""} />
        <StatCard label="Last Round"      value={str(s.last_round_type) || "—"} sub={str(s.last_round_date)} />
        <StatCard label="Last Round Size" value={s.last_round_size_inr_cr ? `₹${str(s.last_round_size_inr_cr)} Cr` : "—"} sub="" />
        <StatCard label="Stage"           value={str(s.stage).replace(/_/g," ") || "—"} sub={leadInv ? `Lead: ${leadInv}` : ""} />
      </StatGrid>

      {investors.length > 0 && (
        <>
          <SecHeader title="Investors" tag="Backers" />
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:8, marginBottom:"1.5rem" }}>
            {investors.map((inv, i) => (
              <div key={i} style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:8, padding:"0.875rem 1rem" }}>
                <div style={{ fontSize:13, fontWeight:600, color:"var(--text-h)" }}>{inv.name}</div>
                {inv.tier && <div style={{ marginTop:4 }}><span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"1px 6px", borderRadius:3, background: inv.tier==="tier1"?"var(--blue-lt)":inv.tier==="tier2"?"var(--green-lt)":"var(--bg-soft)", color: inv.tier==="tier1"?"var(--navy)":inv.tier==="tier2"?"var(--green)":"var(--slate)", border:"1px solid var(--border)" }}>{inv.tier}</span></div>}
              </div>
            ))}
          </div>
        </>
      )}

      {roundHistory.length > 0 && (
        <>
          <SecHeader title="Round History" tag="All Rounds" />
          <div style={{ border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
              <thead>
                <tr style={{ background:"var(--bg-soft)", borderBottom:"1.5px solid var(--border-md)" }}>
                  {["Round","Date","Amount (USD)","Lead Investor","All Investors"].map(h => (
                    <th key={h} style={{ textAlign:"left", fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-xs)", fontWeight:500, padding:"7px 12px" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roundHistory.map((r, i) => (
                  <tr key={i} style={{ borderBottom:"1px solid var(--border)", background: i%2===0?"#fff":"var(--bg-soft)" }}>
                    <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:11, fontWeight:600, color:"var(--navy)" }}>{r.type || "—"}</td>
                    <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:11, color:"var(--text-s)" }}>{r.date || "—"}</td>
                    <td style={{ padding:"8px 12px", fontFamily:"monospace", fontSize:11, color:"var(--text-h)" }}>{r.amount_usd_m ? `$${r.amount_usd_m}M` : "—"}</td>
                    <td style={{ padding:"8px 12px", fontSize:12, color:"var(--text-m)" }}>{r.lead || "—"}</td>
                    <td style={{ padding:"8px 12px", fontSize:11, color:"var(--text-s)" }}>{r.investors_str || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function RawTab({ summary }: { summary: Record<string, unknown>[] }) {
  if (!summary?.length) return <Empty>No raw field data.</Empty>
  const applicable    = summary.filter(f=>f.applicability==="applicable")
  const unknown       = summary.filter(f=>f.applicability==="unknown")
  const notApplicable = summary.filter(f=>f.applicability==="not_applicable")
  return (
    <div>
      <SecHeader title="Raw Fields" tag="Data" />
      <div style={{ display:"flex", gap:10, marginBottom:"1rem" }}>
        <Chip green>{applicable.length} applicable</Chip>
        <Chip amber>{unknown.length} unknown</Chip>
        <Chip gray>{notApplicable.length} N/A</Chip>
      </div>
      <div style={{ border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"var(--bg-soft)", borderBottom:"1.5px solid var(--border-md)" }}>
              {["Field","Pack","Type","Value","Applicability / Reason","Source","Conf"].map(h=>(
                <th key={h} style={{ textAlign:"left", fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-xs)", fontWeight:500, padding:"7px 12px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.map((f,i)=>(
              <tr key={i} style={{ borderBottom:"1px solid var(--border)", background: i%2===0?"#fff":"var(--bg-soft)" }}>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:11, color:"var(--text-h)", whiteSpace:"nowrap" }}>{str(f.field_name)}</td>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:10, color:"var(--text-xs)", whiteSpace:"nowrap" }}>{str(f.field_pack)}</td>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:10, color:"var(--text-xs)", whiteSpace:"nowrap" }}>{str(f.data_type)||"—"}</td>
                <td style={{ padding:"7px 12px", fontSize:12, color:"var(--text-m)", maxWidth:240 }} title={str(f.raw_value)}>
                  {str(f.raw_value) ? (str(f.raw_value).length > 60 ? str(f.raw_value).slice(0,60)+"…" : str(f.raw_value)) : <span style={{ color:"var(--text-xs)", fontStyle:"italic" }}>—</span>}
                </td>
                <td style={{ padding:"7px 12px", maxWidth:180 }}>
                  <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"1px 6px", borderRadius:3, background:f.applicability==="applicable"?"var(--green-lt)":f.applicability==="unknown"?"var(--amber-lt)":"var(--red-lt)", color:f.applicability==="applicable"?"var(--green)":f.applicability==="unknown"?"var(--amber)":"var(--red)" }}>{str(f.applicability)}</span>
                  {str(f.applicability_reason) && <div style={{ fontSize:10, color:"var(--text-xs)", marginTop:2, fontStyle:"italic" }}>{str(f.applicability_reason)}</div>}
                </td>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:10, color:"var(--text-s)", whiteSpace:"nowrap" }}>
                  {str(f.source_url)
                    ? <a href={str(f.source_url)} target="_blank" rel="noreferrer" style={{ color:"var(--blue)", textDecoration:"none" }} title={str(f.source_url)}>{str(f.source_type)||"link"} ↗</a>
                    : str(f.source_type)||"—"}
                </td>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:10, color:"var(--text-xs)" }}>{f.confidence?str(f.confidence):"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:8, padding:"7px 0", borderBottom:"1px solid var(--border)" }}>
      <span style={{ fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-xs)", paddingTop:1 }}>{k}</span>
      <span style={{ fontSize:13, color:"var(--text-m)" }}>{v}</span>
    </div>
  )
}

function FoundersTab({ raw }: { raw: Record<string, unknown>[] }) {
  const rv = (name: string) => rawVal(raw, name)
  const founders = [1,2,3].map(n => ({
    name:         rv(`founder_${n}_name`),
    role:         rv(`founder_${n}_role`),
    education:    rv(`founder_${n}_education`),
    domainYears:  rv(`founder_${n}_domain_years`),
    priorStartup: rv(`founder_${n}_prior_startup`),
    priorExit:    rv(`founder_${n}_prior_exit`),
    isIitIim:     rv(`founder_${n}_is_iit_iim`),
    linkedinUrl:  rv(`founder_${n}_linkedin_url`),
  })).filter(f => f.name)
  const advisorCount    = rv("advisor_count")
  const notableAdvisors = rv("notable_advisors")
  const teamComposition = rv("team_composition")
  if (!founders.length) return <Empty>No founder data collected yet. Check Raw Fields tab for any partial data.</Empty>
  return (
    <div>
      <SecHeader title="Founding Team" tag="Founders" />
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:16, marginBottom:"1.5rem" }}>
        {founders.map((f, i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:10, padding:"1.25rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1rem" }}>
              <div>
                <div style={{ fontSize:16, fontWeight:700, color:"var(--text-h)" }}>{f.name}</div>
                {f.role && <div style={{ fontFamily:"monospace", fontSize:11, color:"var(--text-s)", marginTop:2 }}>{f.role}</div>}
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"flex-end" }}>
                {f.isIitIim && f.isIitIim !== "false" && f.isIitIim !== "no" && <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"2px 7px", borderRadius:4, background:"var(--blue-lt)", color:"var(--navy)", border:"1px solid var(--blue-md)" }}>IIT/IIM</span>}
                {f.linkedinUrl && <a href={f.linkedinUrl} target="_blank" rel="noreferrer" style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"2px 7px", borderRadius:4, background:"var(--bg-soft)", color:"var(--slate)", border:"1px solid var(--border)", textDecoration:"none" }}>LinkedIn</a>}
              </div>
            </div>
            <div>
              {f.education    && <KV k="Education"       v={f.education} />}
              {f.domainYears  && <KV k="Domain Exp"      v={`${f.domainYears} years`} />}
              {f.priorStartup && <KV k="Prior Startup"   v={f.priorStartup} />}
              {f.priorExit    && <KV k="Prior Exit"      v={f.priorExit} />}
            </div>
          </div>
        ))}
      </div>
      {(advisorCount || notableAdvisors || teamComposition) && (
        <>
          <SecHeader title="Team Context" tag="Advisory" />
          <div style={{ border:"1px solid var(--border)", borderRadius:8, padding:"1rem 1.25rem", background:"#fff" }}>
            {advisorCount    && <KV k="Advisor Count"    v={advisorCount} />}
            {notableAdvisors && <KV k="Notable Advisors" v={notableAdvisors} />}
            {teamComposition && <KV k="Team Composition" v={teamComposition} />}
          </div>
        </>
      )}
    </div>
  )
}

function ProductsTab({ raw }: { raw: Record<string, unknown>[] }) {
  const rv = (name: string) => rawVal(raw, name)
  const products = [1,2,3,4,5].map(n => ({
    name:        rv(`product_${n}_name`),
    type:        rv(`product_${n}_type`),
    description: rv(`product_${n}_description`),
  })).filter(p => p.name)
  const moatType          = rv("moat_type")
  const hasTechnicalMoat  = rv("has_technical_moat")
  const hasApi            = rv("has_api")
  const hasMobileApp      = rv("has_mobile_app")
  const pricingModel      = rv("pricing_model")
  const productCount      = rv("product_count")
  const patentCount       = rv("patent_count")
  const integrationsCount = rv("integrations_count")
  const productPacks      = rawByPack(raw, "products")
  if (!products.length && !productPacks.length) return <Empty>No product data collected yet. Check Raw Fields tab.</Empty>
  return (
    <div>
      <SecHeader title="Products & Platform" tag="Products" />
      {productCount && <div style={{ marginBottom:"1rem", fontFamily:"monospace", fontSize:12, color:"var(--text-s)" }}>{productCount} product(s) catalogued</div>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:16, marginBottom:"1.5rem" }}>
        {products.map((p, i) => (
          <div key={i} style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:10, padding:"1.25rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"0.75rem" }}>
              <div style={{ fontSize:15, fontWeight:700, color:"var(--text-h)" }}>{p.name}</div>
              {p.type && <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"2px 7px", borderRadius:4, background:"var(--blue-lt)", color:"var(--navy)", border:"1px solid var(--blue-md)" }}>{p.type}</span>}
            </div>
            {p.description && <p style={{ fontSize:13, color:"var(--text-m)", lineHeight:1.6 }}>{p.description}</p>}
          </div>
        ))}
      </div>
      {(moatType || hasTechnicalMoat || hasApi || hasMobileApp || pricingModel || patentCount || integrationsCount) && (
        <>
          <SecHeader title="Platform Attributes" tag="Tech" />
          <div style={{ border:"1px solid var(--border)", borderRadius:8, padding:"1rem 1.25rem", background:"#fff" }}>
            {moatType          && <KV k="Moat Type"        v={moatType.replace(/_/g," ")} />}
            {hasTechnicalMoat  && <KV k="Technical Moat"   v={hasTechnicalMoat} />}
            {hasApi            && <KV k="Developer API"     v={hasApi} />}
            {hasMobileApp      && <KV k="Mobile App"        v={hasMobileApp} />}
            {pricingModel      && <KV k="Pricing Model"     v={pricingModel} />}
            {patentCount       && <KV k="Patents"           v={patentCount} />}
            {integrationsCount && <KV k="Integrations"      v={integrationsCount} />}
          </div>
        </>
      )}
    </div>
  )
}

function RegulatoryTab({ raw }: { raw: Record<string, unknown>[] }) {
  const rv = (name: string) => rawVal(raw, name)
  const fields = rawByPack(raw, "regulatory")
  if (!fields.length) return <Empty>No regulatory data collected yet.</Empty>
  const mcaStatus         = rv("mca_status")
  const incorporationDate = rv("incorporation_date")
  const registeredState   = rv("registered_state")
  const authorisedCap     = rv("authorized_capital_cr")
  const paidUpCap         = rv("paid_up_capital_cr")
  const registeredAddress = rv("registered_address")
  const knownFields = new Set(["mca_status","incorporation_date","registered_state","authorized_capital_cr","paid_up_capital_cr","registered_address"])
  const extraFields = fields.filter(f => !knownFields.has(str(f.field_name)) && f.raw_value)
  return (
    <div>
      <SecHeader title="Regulatory & Compliance" tag="MCA" />
      <div style={{ border:"1px solid var(--border)", borderRadius:8, padding:"1rem 1.25rem", background:"#fff", marginBottom:"1.5rem" }}>
        {mcaStatus && (
          <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:8, padding:"7px 0", borderBottom:"1px solid var(--border)" }}>
            <span style={{ fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--text-xs)", paddingTop:1 }}>MCA Status</span>
            <span style={{ fontSize:13 }}>
              <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase", padding:"2px 7px", borderRadius:3, background:mcaStatus==="active"?"var(--green-lt)":"var(--amber-lt)", color:mcaStatus==="active"?"var(--green)":"var(--amber)", border:"1px solid var(--border)" }}>{mcaStatus}</span>
            </span>
          </div>
        )}
        {incorporationDate  && <KV k="Incorporation Date"   v={incorporationDate} />}
        {registeredState    && <KV k="Registered State"     v={registeredState} />}
        {authorisedCap      && <KV k="Authorised Capital"   v={`₹${authorisedCap} Cr`} />}
        {paidUpCap          && <KV k="Paid-up Capital"      v={`₹${paidUpCap} Cr`} />}
        {registeredAddress  && <KV k="Registered Address"   v={registeredAddress} />}
        {extraFields.map((f, i) => <KV key={i} k={str(f.field_name).replace(/_/g," ")} v={str(f.raw_value)} />)}
      </div>
    </div>
  )
}

function StatGrid({ children, cols }: { children: React.ReactNode; cols?: number }) {
  return <div style={{ display:"grid", gridTemplateColumns:`repeat(${cols??4},1fr)`, gap:1, background:"var(--border)", border:"1px solid var(--border)", borderRadius:8, overflow:"hidden", marginBottom:"1.5rem" }}>{children}</div>
}
function StatCard({ label, value, sub }: { label:string; value:string; sub:string }) {
  return (
    <div style={{ background:"#fff", padding:"1rem 1.25rem" }}>
      <div style={statLabel}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color:"var(--text-h)", lineHeight:1.1 }}>{value}</div>
      {sub&&<div style={{ fontSize:11, color:"var(--text-s)", marginTop:2 }}>{sub}</div>}
    </div>
  )
}
function Chip({ children, navy, blue, green, amber, gray }: { children:React.ReactNode; navy?:boolean; blue?:boolean; green?:boolean; amber?:boolean; gray?:boolean }) {
  const bg     = navy?"var(--navy)":blue?"var(--blue-lt)":green?"var(--green-lt)":amber?"var(--amber-lt)":"var(--bg-soft)"
  const color  = navy?"#fff":blue?"var(--navy)":green?"var(--green)":amber?"var(--amber)":"var(--slate)"
  const border = navy?"var(--navy)":blue?"var(--blue-md)":green?"var(--green-bd)":amber?"var(--amber-bd)":"var(--border-md)"
  return <span style={{ display:"inline-flex", alignItems:"center", fontFamily:"monospace", fontSize:10, letterSpacing:"0.05em", textTransform:"uppercase", borderRadius:4, padding:"3px 8px", border:`1px solid ${border}`, background:bg, color }}>{children}</span>
}
function DQBar({ pct }: { pct?:number }) {
  if (!pct) return null
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12, background:"var(--green-lt)", border:"1px solid var(--green-bd)", borderRadius:8, padding:"10px 14px", marginBottom:"1.25rem" }}>
      <span style={{ fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--green)", whiteSpace:"nowrap", fontWeight:500 }}>Data Quality</span>
      <div style={{ flex:1, height:6, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:"var(--green)", borderRadius:3 }}/>
      </div>
      <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:600, color:"var(--green)" }}>{pct}%</span>
    </div>
  )
}
function SecHeader({ title, tag }: { title:string; tag?:string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:"1.5rem" }}>
      <span style={{ fontFamily:"monospace", fontSize:10, color:"var(--blue)", background:"var(--blue-lt)", border:"1px solid var(--blue-md)", borderRadius:4, padding:"2px 8px", letterSpacing:"0.05em" }}>{tag||"—"}</span>
      <h2 style={{ fontSize:18, fontWeight:700, color:"var(--text-h)" }}>{title}</h2>
      <div style={{ flex:1, height:1, background:"var(--border)" }}/>
    </div>
  )
}
function Empty({ children }: { children:React.ReactNode }) {
  return <div style={{ padding:"3rem", textAlign:"center", color:"var(--text-xs)", fontSize:14 }}>{children}</div>
}
function LoadingState() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:14, color:"var(--text-s)", marginBottom:8 }}>Loading profile…</div>
        <div style={{ width:200, height:4, background:"var(--bg-soft)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:"60%", background:"var(--navy)", borderRadius:2 }}/>
        </div>
      </div>
    </div>
  )
}
function ErrorState({ error, onBack }: { error:string; onBack:()=>void }) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", maxWidth:400 }}>
        <p style={{ fontSize:14, color:"var(--red)", marginBottom:"1rem" }}>{error}</p>
        <button onClick={onBack} style={{ background:"var(--navy)", color:"#fff", border:"none", borderRadius:6, padding:"8px 18px", fontSize:13, cursor:"pointer" }}>← Back to leaderboard</button>
      </div>
    </div>
  )
}

const NAV_SECTIONS = [
  { label:"Profile", items:[
    {id:"overview",    title:"Overview"},
    {id:"score",       title:"Score Card"},
    {id:"founders",    title:"Founders"},
    {id:"funding",     title:"Funding"},
    {id:"products",    title:"Products"},
    {id:"regulatory",  title:"Regulatory"},
  ]},
  { label:"New Sources · v3", items:[
    {id:"youtube",    title:"YouTube"},
    {id:"linkedin",   title:"LinkedIn Signals"},
    {id:"glassdoor",  title:"Glassdoor"},
  ]},
  { label:"Data", items:[{id:"raw",title:"Raw Fields"}]},
]
const navGroupLabel: React.CSSProperties = { fontFamily:"monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--text-xs)", padding:"1.25rem 1.25rem 0.375rem" }
const navItem = (active:boolean): React.CSSProperties => ({ display:"flex", alignItems:"center", gap:8, padding:"6px 1.25rem", fontSize:13, color:active?"var(--navy)":"var(--text-m)", borderLeft:`2px solid ${active?"var(--blue)":"transparent"}`, background:active?"var(--blue-lt)":"transparent", cursor:"pointer", border:"none", width:"100%", textAlign:"left", fontWeight:active?500:400, transition:"all 0.12s" })
const statLabel: React.CSSProperties = { fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--text-xs)", marginBottom:4 }
const sectionSubLabel: React.CSSProperties = { fontFamily:"monospace", fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--text-xs)", marginBottom:"0.75rem" }
function scoreColor(score:number) {
  if (score>=80) return "var(--green)"
  if (score>=60) return "var(--amber)"
  return "var(--red)"
}
