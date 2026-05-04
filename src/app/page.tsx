"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getStartups, triggerProfile, pollJob, type StartupRow } from "@/lib/api"

const STAGES    = ["", "pre_seed", "seed", "series_a", "series_b_plus", "growth"]
const INDUSTRIES = ["", "BFSI", "AI_Infra", "D2C", "Health", "Logistics", "EdTech_HRTech"]
const SORTS     = ["composite_score", "revenue_inr_cr", "total_raised_usd_m", "team_size"]

const S: Record<string, string> = {
  pre_seed: "Pre-seed", seed: "Seed", series_a: "Series A",
  series_b_plus: "Series B+", growth: "Growth"
}

export default function HomePage() {
  const router = useRouter()
  const [rows,    setRows]    = useState<StartupRow[]>([])
  const [total,   setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [page,    setPage]    = useState(1)
  const [stage,   setStage]   = useState("")
  const [industry,setIndustry]= useState("")
  const [sort,    setSort]    = useState("composite_score")

  // New profile modal state
  const [company,  setCompany]  = useState("")
  const [showModal,setShowModal]= useState(false)
  const [jobStatus,setJobStatus]= useState<string | null>(null)
  const [jobPct,   setJobPct]   = useState(0)
  const [triggering,setTriggering]=useState(false)
  const [error,    setError]    = useState("")

  useEffect(() => {
    setLoading(true)
    getStartups({ page, stage: stage||undefined, industry: industry||undefined, sort })
      .then(r => { setRows(r.data); setTotal(r.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [page, stage, industry, sort])

  async function handleTrigger() {
    if (!company.trim()) return
    setTriggering(true); setError(""); setJobStatus("queued"); setJobPct(0)
    try {
      const job = await triggerProfile(company.trim())
      if (job.cached && job.startup_id) {
        router.push(`/profile/${job.startup_id}`)
        return
      }
      const startupId = await pollJob(job.job_id, (pct, status) => {
        setJobPct(pct); setJobStatus(status)
      })
      router.push(`/profile/${startupId}?job_id=${job.job_id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Research failed")
      setJobStatus("failed")
    } finally {
      setTriggering(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Top bar */}
      <header style={{
        background: "var(--navy)", padding: "0 1.5rem",
        height: 56, display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 30, height: 30, background: "#fff", borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "monospace", fontSize: 11, color: "var(--navy)", fontWeight: 700
          }}>SI</div>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>Startup Intelligence</span>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
            color: "#fff", borderRadius: 6, padding: "6px 14px",
            fontSize: 13, cursor: "pointer", fontWeight: 500
          }}
        >+ Profile a startup</button>
      </header>

      <main style={{ flex: 1, maxWidth: 1100, margin: "0 auto", padding: "2rem 1.5rem", width: "100%" }}>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, marginBottom: "1.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <select value={stage} onChange={e => { setStage(e.target.value); setPage(1) }}
            style={selStyle}>
            {STAGES.map(s => <option key={s} value={s}>{s ? S[s]||s : "All stages"}</option>)}
          </select>
          <select value={industry} onChange={e => { setIndustry(e.target.value); setPage(1) }}
            style={selStyle}>
            {INDUSTRIES.map(i => <option key={i} value={i}>{i || "All industries"}</option>)}
          </select>
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}
            style={selStyle}>
            {SORTS.map(s => <option key={s} value={s}>Sort: {s.replace(/_/g," ")}</option>)}
          </select>
          <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-s)" }}>
            {total} startups
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-xs)", fontSize: 14 }}>
            Loading leaderboard...
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem" }}>
            <p style={{ fontSize: 15, color: "var(--text-s)", marginBottom: "1rem" }}>No startups profiled yet.</p>
            <button onClick={() => setShowModal(true)} style={btnPrimary}>Profile your first startup →</button>
          </div>
        ) : (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-soft)", borderBottom: "1.5px solid var(--border-md)" }}>
                  {["Rank","Company","Stage","Industry","Revenue","Raised","Score","DQ",""].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick={() => router.push(`/profile/${r.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-soft)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text-xs)", width: 48 }}>
                      {(page-1)*20 + i + 1}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text-h)" }}>
                      {r.brand_name}
                      {r.is_profitable && <span style={profitBadge}>✓ Profitable</span>}
                    </td>
                    <td style={tdStyle}><span style={stageBadge(r.stage)}>{S[r.stage||""]||r.stage||"—"}</span></td>
                    <td style={{ ...tdStyle, color: "var(--text-s)" }}>{r.industry||"—"}</td>
                    <td style={tdStyle}>{r.revenue_inr_cr ? `₹${r.revenue_inr_cr} Cr` : "—"}</td>
                    <td style={tdStyle}>{r.total_raised_usd_m ? `$${r.total_raised_usd_m}M` : "—"}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, fontSize: 15,
                      color: scoreColor(r.composite_score) }}>
                      {r.composite_score ?? "—"}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "monospace", fontSize: 11, color: "var(--text-xs)" }}>
                      {r.data_quality_pct ? `${r.data_quality_pct}%` : "—"}
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
              Runs 9-pass research via Claude. Takes 3–5 minutes.
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
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, color: "var(--text-s)" }}>
                    {jobStatus === "completed" ? "Complete — redirecting…" :
                     jobStatus === "running"   ? "Running 9-pass research…" : "Queued…"}
                  </span>
                  <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-xs)" }}>
                    {jobPct}%
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Styles ──────────────────────────────────────────────────────
const selStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px",
  fontSize: 13, color: "var(--text-b)", background: "#fff", cursor: "pointer"
}
const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 12px",
  fontFamily: "monospace", fontSize: 10, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "var(--text-xs)", fontWeight: 500
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
  fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.06em"
}
const stageBadge = (stage?: string): React.CSSProperties => ({
  fontSize: 10, fontFamily: "monospace", textTransform: "uppercase",
  letterSpacing: "0.06em", padding: "2px 7px", borderRadius: 4,
  background: stage === "growth" ? "var(--navy)" : "var(--blue-lt)",
  color: stage === "growth" ? "#fff" : "var(--navy)",
  border: `1px solid ${stage === "growth" ? "var(--navy)" : "var(--blue-md)"}`
})
function scoreColor(score?: number) {
  if (!score) return "var(--text-xs)"
  if (score >= 80) return "var(--green)"
  if (score >= 60) return "var(--amber)"
  return "var(--red)"
}
