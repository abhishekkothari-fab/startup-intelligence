"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getStartup, type FullProfile, type YouTubeSignal, type LinkedInSignal } from "@/lib/api"

export default function ProfilePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [profile, setProfile] = useState<FullProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState("")
  const [activeTab, setActiveTab] = useState("overview")

  useEffect(() => {
    getStartup(params.id)
      .then(setProfile)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [params.id])

  if (loading) return <LoadingState />
  if (error)   return <ErrorState error={error} onBack={() => router.push("/")} />
  if (!profile) return null

  const s  = profile.startup as Record<string, unknown>
  const sc = profile.latest_score
  const score = sc?.composite_score ?? 0

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <header style={{
        background: "var(--navy)", padding: "0 1.5rem",
        height: 56, display: "flex", alignItems: "center", gap: 16, flexShrink: 0
      }}>
        <button onClick={() => router.push("/")} style={{
          background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff", borderRadius: 5, padding: "4px 12px", fontSize: 12, cursor: "pointer"
        }}>← Back</button>
        <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>
          {s.brand_name as string}
        </span>
        <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.15)",
          border: "1px solid rgba(255,255,255,0.3)", color: "#fff",
          borderRadius: 20, padding: "3px 12px", fontSize: 12, fontFamily: "monospace" }}>
          Score: {score}/100
        </span>
      </header>

      <div style={{ display: "flex", flex: 1 }}>

        {/* Sidebar nav */}
        <nav style={{
          width: 220, flexShrink: 0, borderRight: "1px solid var(--border)",
          padding: "1.25rem 0", background: "#fff",
          position: "sticky", top: 0, height: "calc(100vh - 56px)", overflowY: "auto"
        }}>
          {NAV_SECTIONS.map(({ label, items }) => (
            <div key={label}>
              <div style={navGroupLabel}>{label}</div>
              {items.map(({ id, title }) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  style={navItem(activeTab === id)}>
                  {title}
                </button>
              ))}
            </div>
          ))}
          <div style={{ margin: "1.5rem 1.25rem 0", paddingTop: "1.25rem", borderTop: "1px solid var(--border)" }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5,
              background: "var(--green-lt)", border: "1px solid var(--green-bd)",
              borderRadius: 20, padding: "3px 10px",
              fontFamily: "monospace", fontSize: 10, color: "var(--green)" }}>
              ● DB v3 · {(s.stage as string)||"—"}
            </div>
            <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: 10,
              color: "var(--text-xs)", lineHeight: 1.8 }}>
              {sc?.data_quality_pct}% quality<br/>
              {profile.meta.youtube_count} YT videos<br/>
              {profile.meta.linkedin_count} LI signals<br/>
              {profile.meta.fields_collected} fields
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main style={{ flex: 1, padding: "2.5rem", overflow: "auto" }}>

          {activeTab === "overview" && <OverviewTab s={s} sc={sc} score={score} />}
          {activeTab === "score"    && <ScoreTab sc={sc} />}
          {activeTab === "youtube"  && <YouTubeTab videos={profile.youtube} />}
          {activeTab === "linkedin" && <LinkedInTab signals={profile.linkedin} />}
          {activeTab === "glassdoor"&& <GlassdoorTab s={s} />}
          {activeTab === "funding"  && <FundingTab s={s} />}
          {activeTab === "raw"      && <RawTab summary={profile.raw_summary as Record<string, unknown>[]} />}

        </main>
      </div>
    </div>
  )
}

// ── Tab components ───────────────────────────────────────────────

function OverviewTab({ s, sc, score }: { s: Record<string, unknown>; sc: ReturnType<typeof getStartup> extends Promise<infer T> ? T extends { latest_score: infer U } ? U : never : never; score: number }) {
  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <div style={{ fontFamily: "monospace", fontSize: 11, color: "var(--blue)",
          letterSpacing: "0.1em", textTransform: "uppercase", display: "flex",
          alignItems: "center", gap: 6, marginBottom: "0.75rem" }}>
          <span style={{ display: "block", width: 18, height: 1.5, background: "var(--blue)" }}/>
          Intelligence Report · {s.industry as string} · {s.hq_country as string}
        </div>
        <h1 style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 800,
          letterSpacing: "-0.02em", color: "var(--text-h)", lineHeight: 0.95,
          marginBottom: "0.625rem" }}>
          {s.brand_name as string}
        </h1>
        {s.legal_name && (
          <p style={{ fontSize: 13, color: "var(--text-s)", fontFamily: "monospace", marginBottom: "1rem" }}>
            {s.legal_name as string} {s.cin ? `· CIN: ${s.cin}` : ""}
          </p>
        )}
      </div>

      {/* Badges */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: "1.75rem" }}>
        <Chip navy>{(s.stage as string)?.replace(/_/g," ").toUpperCase()}</Chip>
        {s.is_profitable && <Chip green>✓ Profitable</Chip>}
        {s.industry    && <Chip blue>{s.industry as string}</Chip>}
        {s.hq_city     && <Chip gray>{s.hq_city as string}</Chip>}
        {s.glassdoor_rating && <Chip amber>Glassdoor {s.glassdoor_rating as number}/5</Chip>}
      </div>

      {/* Hero stats */}
      <StatGrid>
        <StatCard label="Revenue" value={s.revenue_inr_cr ? `₹${s.revenue_inr_cr} Cr` : "—"}
          sub={s.revenue_fy as string || ""} />
        <StatCard label="Total Raised" value={s.total_raised_usd_m ? `$${s.total_raised_usd_m}M` : "—"}
          sub={s.last_round_type as string || ""} />
        <StatCard label="Clients" value={s.client_count ? String(s.client_count)+"+" : "—"}
          sub="Enterprise" />
        <StatCard label="Team" value={s.team_size ? String(s.team_size) : "—"}
          sub="employees" />
      </StatGrid>

      {/* Score ring summary */}
      <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "1.5rem",
        display: "grid", gridTemplateColumns: "120px 1fr", gap: "1.5rem", alignItems: "center",
        background: "var(--bg-soft)", marginTop: "0.5rem" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 48, fontWeight: 700, color: scoreColor(score), lineHeight: 1 }}>
            {score}
          </div>
          <div style={{ fontFamily: "monospace", fontSize: 10, color: "var(--text-xs)", marginTop: 4 }}>
            / 100
          </div>
        </div>
        <div>
          <p style={{ fontSize: 14, fontWeight: 500, color: "var(--text-h)", marginBottom: "0.5rem" }}>
            Composite Intelligence Score
          </p>
          <p style={{ fontSize: 13, color: "var(--text-m)", lineHeight: 1.6 }}>
            {(s.stage as string)?.replace(/_/g," ")} stage weights applied.
            {sc ? ` Data quality: ${sc.data_quality_pct}%.` : ""}
            {" "}Score status: <strong>{sc?.status ?? "provisional"}</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}

function ScoreTab({ sc }: { sc: FullProfile["latest_score"] }) {
  if (!sc) return <Empty>No score data yet.</Empty>
  const dims: [string, number, string][] = [
    ["Founder Quality", sc.dim_founder, "5% at growth"],
    ["Traction / Revenue", sc.dim_traction, "40% at growth"],
    ["Capital / Funding", sc.dim_capital, "15% at growth"],
    ["Product / Moat", sc.dim_product, "15% at growth"],
    ["Market Opportunity", sc.dim_market, "15% at growth"],
    ["Momentum", sc.dim_momentum, "10% at growth"],
  ]
  return (
    <div>
      <SecHeader title="Score Card" />
      <DQBar pct={sc.data_quality_pct} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: "1.5rem" }}>
        {dims.map(([name, val, wt]) => (
          <div key={name} style={{ background: "var(--bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontFamily: "monospace", fontSize: 10, textTransform: "uppercase",
                letterSpacing: "0.06em", color: "var(--text-s)" }}>{name}</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: scoreColor(val) }}>{val}</span>
            </div>
            <div style={{ height: 5, background: "var(--bg-soft)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${val}%`, background: scoreColor(val), borderRadius: 3 }}/>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-xs)", marginTop: 5 }}>{wt}</div>
          </div>
        ))}
      </div>
      <SecHeader title="Ratios" />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
        border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
        {[
          ["Funding Velocity", sc.r_funding_velocity ? `₹${sc.r_funding_velocity} Cr/mo` : "—"],
          ["Founder-Market Fit", sc.r_founder_mkt_fit ? `${sc.r_founder_mkt_fit}/10` : "—"],
          ["Traction Velocity", sc.r_traction_velocity ? `${sc.r_traction_velocity} clients/mo` : "—"],
          ["Investor Quality", sc.r_investor_quality ?? "—"],
          ["Product Surface", sc.r_product_surface ?? "—"],
          ["Recognition Momentum", sc.r_recognition_momentum ?? "—"],
        ].map(([k, v], i) => (
          <div key={String(k)} style={{ padding: "9px 14px",
            background: i % 2 === 0 ? "#fff" : "var(--bg-soft)",
            borderBottom: "1px solid var(--border)",
            display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, textTransform: "uppercase",
              letterSpacing: "0.06em", color: "var(--text-s)" }}>{k}</span>
            <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 500,
              color: "var(--text-h)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function YouTubeTab({ videos }: { videos: YouTubeSignal[] }) {
  if (!videos.length) return <Empty>No YouTube data collected.</Empty>
  const typeBadge: Record<string, string> = {
    founder_on_camera: "var(--blue-lt)", podcast_feature: "var(--green-lt)",
    culture_content: "var(--amber-lt)", product_demo: "var(--blue-lt)", news_coverage: "var(--bg-soft)"
  }
  const typeColor: Record<string, string> = {
    founder_on_camera: "var(--navy)", podcast_feature: "var(--green)",
    culture_content: "var(--amber)", product_demo: "var(--navy)", news_coverage: "var(--slate)"
  }
  return (
    <div>
      <SecHeader title="YouTube Intelligence" tag="Pass 7" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1,
        background: "var(--border)", border: "1px solid var(--border)",
        borderRadius: "8px 8px 0 0", overflow: "hidden", marginBottom: 0 }}>
        {[["Videos", videos.length],["Own Channel", videos.some(v=>v.is_own_channel)?"Yes":"No"],
          ["Latest", videos[0]?.published_date?.slice(0,7)||"—"],
          ["Types", [...new Set(videos.map(v=>v.video_type))].length]
        ].map(([l,v])=>(
          <div key={String(l)} style={{ background:"#fff", padding:"0.875rem 1.25rem" }}>
            <div style={statLabel}>{l}</div>
            <div style={{ fontSize:20, fontWeight:700, color:"var(--text-h)" }}>{String(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ border:"1px solid var(--border)", borderTop:"none",
        borderRadius:"0 0 8px 8px", overflow:"hidden" }}>
        {videos.map((v, i) => (
          <div key={i} style={{ display:"grid", gridTemplateColumns:"28px 1fr auto",
            gap:12, padding:"10px 1.25rem", borderBottom:"1px solid var(--border)",
            alignItems:"start", cursor: v.video_url ? "pointer" : "default" }}
            onClick={() => v.video_url && window.open(v.video_url, "_blank")}
            onMouseEnter={e => (e.currentTarget.style.background="var(--bg-soft)")}
            onMouseLeave={e => (e.currentTarget.style.background="")}>
            <span style={{ fontFamily:"monospace", fontSize:11, color:"var(--text-xs)", paddingTop:2 }}>
              {String(i+1).padStart(2,"0")}
            </span>
            <div>
              <div style={{ fontSize:13, fontWeight:500, color:"var(--text-h)", lineHeight:1.4 }}>
                {v.video_title}
              </div>
              <div style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-s)", marginTop:2 }}>
                {v.published_date} · {v.channel_name}
              </div>
              {v.key_quote && (
                <div style={{ fontSize:12, color:"var(--text-m)", fontStyle:"italic", marginTop:4 }}>
                  "{v.key_quote}"
                </div>
              )}
            </div>
            <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase",
              padding:"3px 7px", borderRadius:4,
              background: typeBadge[v.video_type]||"var(--bg-soft)",
              color: typeColor[v.video_type]||"var(--slate)",
              border:"1px solid var(--border)", whiteSpace:"nowrap" }}>
              {v.video_type?.replace(/_/g," ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function LinkedInTab({ signals }: { signals: LinkedInSignal[] }) {
  if (!signals.length) return <Empty>No LinkedIn signals collected.</Empty>
  const pass8 = signals.filter(s => s.pass === 8)
  const pass9 = signals.filter(s => s.pass === 9)
  return (
    <div>
      <SecHeader title="LinkedIn Intelligence" tag="Passes 8 + 9" />
      {pass8.length > 0 && (
        <>
          <div style={sectionSubLabel}>Founder posts — self-reported confidence 0.80–0.85</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:"1.5rem" }}>
            {pass8.map((s,i) => <LiCard key={i} s={s} />)}
          </div>
        </>
      )}
      {pass9.length > 0 && (
        <>
          <div style={sectionSubLabel}>Third-party mentions — independent confidence 0.90–0.95</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            {pass9.map((s,i) => <LiCard key={i} s={s} />)}
          </div>
        </>
      )}
    </div>
  )
}

function LiCard({ s }: { s: LinkedInSignal }) {
  const typeColor: Record<string, string> = {
    ipo_signal: "var(--amber)", client_vp: "var(--green)", investor_signal: "var(--amber)",
    partner: "var(--blue)", traction_claim: "var(--green)", hiring: "var(--slate)"
  }
  return (
    <div style={{ background:"#fff", border:"1px solid var(--border)", borderRadius:8,
      padding:"1rem", transition:"border-color 0.15s" }}
      onMouseEnter={e=>(e.currentTarget.style.borderColor="var(--border-md)")}
      onMouseLeave={e=>(e.currentTarget.style.borderColor="var(--border)")}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
        gap:8, marginBottom:8 }}>
        <div>
          <div style={{ fontSize:13, fontWeight:600, color:"var(--text-h)" }}>{s.author_name||"Unknown"}</div>
          <div style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-s)" }}>{s.author_org}</div>
        </div>
        <span style={{ fontSize:9, fontFamily:"monospace", textTransform:"uppercase",
          padding:"2px 7px", borderRadius:4, border:"1px solid var(--border)",
          background:"var(--bg-soft)", color: typeColor[s.signal_type||""]||"var(--slate)",
          whiteSpace:"nowrap", flexShrink:0 }}>
          {s.signal_type?.replace(/_/g," ")}
        </span>
      </div>
      {s.post_text && (
        <div style={{ fontSize:13, color:"var(--text-m)", lineHeight:1.6, fontStyle:"italic" }}>
          "{s.post_text}"
        </div>
      )}
      <div style={{ fontFamily:"monospace", fontSize:9, color:"var(--text-xs)", marginTop:8 }}>
        conf: {s.confidence} {s.post_date ? `· ${s.post_date}` : ""}
      </div>
    </div>
  )
}

function GlassdoorTab({ s }: { s: Record<string, unknown> }) {
  const rating  = s.glassdoor_rating as number | undefined
  const reviews = s.glassdoor_reviews as number | undefined
  if (!rating) return <Empty>No Glassdoor data collected.</Empty>
  return (
    <div>
      <SecHeader title="Glassdoor Culture Signal" tag="Pass 2" />
      <div style={{ border:"1px solid var(--border)", borderRadius:8, padding:"1.5rem",
        display:"grid", gridTemplateColumns:"180px 1fr", gap:"1.5rem", alignItems:"start" }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:52, fontWeight:700, color:"var(--text-h)", lineHeight:1 }}>{rating}</div>
          <div style={{ fontFamily:"monospace", fontSize:11, color:"var(--text-xs)", marginTop:2 }}>out of 5</div>
          <div style={{ color:"#f59e0b", fontSize:16, letterSpacing:2, margin:"6px 0" }}>
            {"★".repeat(Math.round(rating))}{"☆".repeat(5-Math.round(rating))}
          </div>
          <div style={{ fontFamily:"monospace", fontSize:10, color:"var(--text-xs)" }}>
            {reviews} reviews
          </div>
        </div>
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"1rem", marginBottom:"1rem" }}>
            {[
              ["Work-Life Balance", s.glassdoor_wlb, "var(--red)"],
              ["Culture & Values", s.glassdoor_culture, "var(--amber)"],
              ["Would Recommend", s.glassdoor_recommend ? `${s.glassdoor_recommend}%` : null, "var(--green)"]
            ].map(([l,v,c])=>(
              <div key={String(l)}>
                <div style={statLabel}>{l as string}</div>
                <div style={{ height:5, background:"var(--bg-soft)", borderRadius:3, overflow:"hidden", margin:"5px 0" }}>
                  <div style={{ height:"100%", width: v ? (typeof v === "number" ? `${(v as number)/5*100}%` : v as string) : "0%",
                    background: c as string, borderRadius:3 }}/>
                </div>
                <div style={{ fontFamily:"monospace", fontSize:11, fontWeight:500,
                  color: c as string }}>{v ? String(v) : "—"}</div>
              </div>
            ))}
          </div>
          {s.glassdoor_themes && (
            <p style={{ fontSize:13, color:"var(--text-m)", lineHeight:1.65 }}>
              {s.glassdoor_themes as string}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function FundingTab({ s }: { s: Record<string, unknown> }) {
  return (
    <div>
      <SecHeader title="Funding" />
      <StatGrid>
        <StatCard label="Total Raised" value={s.total_raised_usd_m ? `$${s.total_raised_usd_m}M` : "—"} sub="" />
        <StatCard label="Last Round" value={(s.last_round_type as string)||"—"}
          sub={s.last_round_date as string||""} />
        <StatCard label="Last Round Size"
          value={s.last_round_size_inr_cr ? `₹${s.last_round_size_inr_cr} Cr` : "—"} sub="" />
        <StatCard label="Stage" value={(s.stage as string)?.replace(/_/g," ")||"—"} sub="" />
      </StatGrid>
    </div>
  )
}

function RawTab({ summary }: { summary: Record<string, unknown>[] }) {
  if (!summary?.length) return <Empty>No raw field data.</Empty>
  const applicable   = summary.filter(f => f.applicability === "applicable")
  const unknown      = summary.filter(f => f.applicability === "unknown")
  const notApplicable= summary.filter(f => f.applicability === "not_applicable")
  return (
    <div>
      <SecHeader title="Raw Fields" />
      <div style={{ display:"flex", gap:10, marginBottom:"1rem" }}>
        <Chip green>{applicable.length} applicable</Chip>
        <Chip amber>{unknown.length} unknown</Chip>
        <Chip gray>{notApplicable.length} N/A</Chip>
      </div>
      <div style={{ border:"1px solid var(--border)", borderRadius:8, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ background:"var(--bg-soft)", borderBottom:"1.5px solid var(--border-md)" }}>
              {["Field","Pack","Applicability","Source","Confidence"].map(h=>(
                <th key={h} style={{ ...thS, padding:"7px 12px" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summary.map((f,i)=>(
              <tr key={i} style={{ borderBottom:"1px solid var(--border)" }}>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:11,
                  color:"var(--text-h)" }}>{f.field_name as string}</td>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:10,
                  color:"var(--text-xs)" }}>{f.field_pack as string}</td>
                <td style={{ padding:"7px 12px" }}>
                  <span style={{
                    fontSize:9, fontFamily:"monospace", textTransform:"uppercase",
                    padding:"1px 6px", borderRadius:3,
                    background: f.applicability==="applicable" ? "var(--green-lt)" :
                                f.applicability==="unknown"    ? "var(--amber-lt)" : "var(--red-lt)",
                    color: f.applicability==="applicable" ? "var(--green)" :
                           f.applicability==="unknown"    ? "var(--amber)" : "var(--red)"
                  }}>{f.applicability as string}</span>
                </td>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:10,
                  color:"var(--text-s)" }}>{f.source_type as string}</td>
                <td style={{ padding:"7px 12px", fontFamily:"monospace", fontSize:10,
                  color:"var(--text-xs)" }}>{f.confidence ? String(f.confidence) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────

function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1,
      background:"var(--border)", border:"1px solid var(--border)",
      borderRadius:8, overflow:"hidden", marginBottom:"1.5rem" }}>
      {children}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ background:"#fff", padding:"1rem 1.25rem" }}>
      <div style={statLabel}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, color:"var(--text-h)", lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:"var(--text-s)", marginTop:2 }}>{sub}</div>}
    </div>
  )
}

function Chip({ children, navy, blue, green, amber, gray, red }:
  { children: React.ReactNode } & Record<string,boolean|undefined>) {
  const bg = navy  ? "var(--navy)"    : blue  ? "var(--blue-lt)"  : green ? "var(--green-lt)"  :
             amber ? "var(--amber-lt)": gray  ? "var(--bg-subtle)": red   ? "var(--red-lt)"    : "var(--bg-soft)"
  const color = navy ? "#fff" : blue ? "var(--navy)" : green ? "var(--green)" :
                amber ? "var(--amber)" : gray ? "var(--slate)" : red ? "var(--red)" : "var(--slate)"
  const border = navy ? "var(--navy)" : blue ? "var(--blue-md)" : green ? "var(--green-bd)" :
                 amber ? "var(--amber-bd)" : red ? "#fca5a5" : "var(--border-md)"
  return (
    <span style={{ display:"inline-flex", alignItems:"center", gap:4,
      fontFamily:"monospace", fontSize:10, letterSpacing:"0.05em", textTransform:"uppercase",
      borderRadius:4, padding:"3px 8px", border:`1px solid ${border}`,
      background: bg, color }}>
      {children}
    </span>
  )
}

function DQBar({ pct }: { pct?: number }) {
  if (!pct) return null
  return (
    <div style={{ display:"flex", alignItems:"center", gap:12,
      background:"var(--green-lt)", border:"1px solid var(--green-bd)",
      borderRadius:8, padding:"10px 14px", marginBottom:"1.25rem" }}>
      <span style={{ fontFamily:"monospace", fontSize:10, textTransform:"uppercase",
        letterSpacing:"0.08em", color:"var(--green)", whiteSpace:"nowrap", fontWeight:500 }}>
        Data Quality
      </span>
      <div style={{ flex:1, height:6, background:"var(--border)", borderRadius:3, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:"var(--green)", borderRadius:3 }}/>
      </div>
      <span style={{ fontFamily:"monospace", fontSize:12, fontWeight:600, color:"var(--green)" }}>{pct}%</span>
    </div>
  )
}

function SecHeader({ title, tag }: { title: string; tag?: string }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:"1.5rem" }}>
      <span style={{ fontFamily:"monospace", fontSize:10, color:"var(--blue)",
        background:"var(--blue-lt)", border:"1px solid var(--blue-md)",
        borderRadius:4, padding:"2px 8px", letterSpacing:"0.05em" }}>
        {tag || "—"}
      </span>
      <h2 style={{ fontSize:18, fontWeight:700, color:"var(--text-h)" }}>{title}</h2>
      <div style={{ flex:1, height:1, background:"var(--border)" }}/>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ padding:"3rem", textAlign:"center", color:"var(--text-xs)", fontSize:14 }}>
      {children}
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:14, color:"var(--text-s)", marginBottom:8 }}>Loading profile…</div>
        <div style={{ width:200, height:4, background:"var(--bg-soft)", borderRadius:2, overflow:"hidden" }}>
          <div style={{ height:"100%", width:"60%", background:"var(--navy)", borderRadius:2,
            animation:"slide 1.2s ease-in-out infinite" }}/>
        </div>
      </div>
      <style>{`@keyframes slide { 0%{transform:translateX(-100%)} 100%{transform:translateX(300%)} }`}</style>
    </div>
  )
}

function ErrorState({ error, onBack }: { error: string; onBack: () => void }) {
  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center", maxWidth:400 }}>
        <p style={{ fontSize:14, color:"var(--red)", marginBottom:"1rem" }}>{error}</p>
        <button onClick={onBack} style={{ background:"var(--navy)", color:"#fff",
          border:"none", borderRadius:6, padding:"8px 18px", fontSize:13, cursor:"pointer" }}>
          ← Back to leaderboard
        </button>
      </div>
    </div>
  )
}

// ── Nav config ───────────────────────────────────────────────────
const NAV_SECTIONS = [
  { label: "Profile", items: [
    { id: "overview",  title: "Overview" },
    { id: "score",     title: "Score Card" },
    { id: "funding",   title: "Funding" },
  ]},
  { label: "New Sources · v3", items: [
    { id: "youtube",   title: "YouTube" },
    { id: "linkedin",  title: "LinkedIn Signals" },
    { id: "glassdoor", title: "Glassdoor" },
  ]},
  { label: "Data", items: [
    { id: "raw",       title: "Raw Fields" },
  ]},
]

// ── Styles ───────────────────────────────────────────────────────
const navGroupLabel: React.CSSProperties = {
  fontFamily:"monospace", fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase",
  color:"var(--text-xs)", padding:"1.25rem 1.25rem 0.375rem"
}
const navItem = (active: boolean): React.CSSProperties => ({
  display:"flex", alignItems:"center", gap:8, padding:"6px 1.25rem",
  fontSize:13, color: active ? "var(--navy)" : "var(--text-m)",
  borderLeft:`2px solid ${active ? "var(--blue)" : "transparent"}`,
  background: active ? "var(--blue-lt)" : "transparent",
  cursor:"pointer", border:"none", width:"100%", textAlign:"left",
  fontWeight: active ? 500 : 400, transition:"all 0.12s"
})
const statLabel: React.CSSProperties = {
  fontFamily:"monospace", fontSize:10, textTransform:"uppercase",
  letterSpacing:"0.08em", color:"var(--text-xs)", marginBottom:4
}
const sectionSubLabel: React.CSSProperties = {
  fontFamily:"monospace", fontSize:10, textTransform:"uppercase",
  letterSpacing:"0.1em", color:"var(--text-xs)", marginBottom:"0.75rem"
}
const thS: React.CSSProperties = {
  textAlign:"left", fontFamily:"monospace", fontSize:10, textTransform:"uppercase",
  letterSpacing:"0.06em", color:"var(--text-xs)", fontWeight:500
}
function scoreColor(score: number) {
  if (score >= 80) return "var(--green)"
  if (score >= 60) return "var(--amber)"
  return "var(--red)"
}
