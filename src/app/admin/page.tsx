"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase-auth"

interface UsageRow {
  email:        string
  name:         string | null
  role:         "admin" | "standard"
  bonus_pulls:  number
  pulls_used:   number
  pulls_limit:  number | null
  last_pull_at: string | null
}

interface FeedbackRow {
  id:            string
  startup_id:    string | null
  section_label: string | null
  message:       string
  submitted_by:  string
  submitted_at:  string
  startups:      { brand_name: string } | null
}

export default function AdminPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [usage,       setUsage]     = useState<UsageRow[]>([])
  const [feedback,    setFeedback]  = useState<FeedbackRow[]>([])
  const [loading,     setLoading]   = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      const email = data.user?.email
      if (!email) { router.replace("/login"); return }

      const { data: account } = await supabase.from("allowed_emails").select("role").eq("email", email).maybeSingle()
      if (account?.role !== "admin") { router.replace("/"); return }
      setAuthorized(true)

      const [usageRes, feedbackRes] = await Promise.all([
        supabase.from("user_usage_summary").select("*").order("pulls_used", { ascending: false }),
        supabase.from("startup_feedback").select("id, startup_id, section_label, message, submitted_by, submitted_at, startups(brand_name)").order("submitted_at", { ascending: false }).limit(200),
      ])
      setUsage((usageRes.data as UsageRow[]) ?? [])
      setFeedback((feedbackRes.data as unknown as FeedbackRow[]) ?? [])
      setLoading(false)
    })
  }, [router])

  if (authorized === null || (authorized && loading)) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-xs)", fontSize: 14 }}>Loading admin dashboard…</div>
  }
  if (!authorized) return null

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <header style={{
        background: "linear-gradient(135deg, #0f2d52 0%, #1e3a5f 70%, #1a3659 100%)",
        borderBottom: "1px solid rgba(251,191,36,0.2)",
        padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>Launchpad</span>
          <span style={{ color: "#fbbf24", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, fontFamily: "var(--mono)" }}>ADMIN</span>
        </div>
        <button
          onClick={() => router.push("/")}
          style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "#fff", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontWeight: 500 }}
        >← Back to dashboard</button>
      </header>

      <main style={{ flex: 1, maxWidth: 1200, margin: "0 auto", padding: "1.5rem", width: "100%", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        <section>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: "var(--text-h)", marginBottom: "0.75rem" }}>
            Profiling quota by user
          </h2>
          <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--navy)" }}>
                  <th style={thStyle}>User</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Pulls used</th>
                  <th style={thStyle}>Limit</th>
                  <th style={thStyle}>Bonus</th>
                  <th style={thStyle}>Last pull</th>
                </tr>
              </thead>
              <tbody>
                {usage.length === 0 ? (
                  <tr><td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "var(--text-xs)", padding: "2rem" }}>No users yet</td></tr>
                ) : usage.map(u => (
                  <tr key={u.email} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={tdStyle}>
                      <div style={{ color: "var(--text-h)", fontWeight: 500 }}>{u.name || u.email}</div>
                      {u.name && <div style={{ fontSize: 11, color: "var(--text-xs)" }}>{u.email}</div>}
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                        padding: "2px 8px", borderRadius: 4,
                        background: u.role === "admin" ? "var(--amber-lt)" : "var(--bg-soft)",
                        color:      u.role === "admin" ? "var(--amber)"    : "var(--text-s)",
                        border: `1px solid ${u.role === "admin" ? "var(--amber-bd)" : "var(--border-md)"}`,
                      }}>{u.role}</span>
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)" }}>
                      {u.role === "admin" ? `${u.pulls_used}` : (
                        <span style={{ color: u.pulls_limit !== null && u.pulls_used >= u.pulls_limit ? "var(--red)" : "var(--text-m)" }}>
                          {u.pulls_used}/{u.pulls_limit}
                        </span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)" }}>{u.role === "admin" ? "—" : u.pulls_limit}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--mono)" }}>{u.bonus_pulls}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: "var(--text-s)" }}>
                      {u.last_pull_at ? new Date(u.last_pull_at).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 style={{ fontFamily: "var(--serif)", fontSize: 20, fontWeight: 700, color: "var(--text-h)", marginBottom: "0.75rem" }}>
            Feedback received
            <span style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 400, color: "var(--text-xs)", marginLeft: 10 }}>
              {feedback.length} most recent
            </span>
          </h2>
          {feedback.length === 0 ? (
            <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "2rem", textAlign: "center", color: "var(--text-xs)", fontSize: 14 }}>
              No feedback received yet
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {feedback.map(f => (
                <div key={f.id} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 8, padding: "1rem 1.125rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "var(--text-h)" }}>
                        {f.startups?.brand_name ?? "General feedback"}
                      </span>
                      {f.section_label && (
                        <span style={{
                          fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.05em",
                          padding: "2px 8px", borderRadius: 4, background: "var(--blue-bg)", color: "var(--blue)", border: "1px solid var(--blue-bd)",
                        }}>{f.section_label}</span>
                      )}
                    </div>
                    <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--text-xs)" }}>
                      {f.submitted_by} · {new Date(f.submitted_at).toLocaleString()}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--text-b)", lineHeight: 1.5 }}>{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </section>

      </main>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "8px 12px",
  fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase",
  letterSpacing: "0.06em", color: "rgba(255,255,255,0.75)", fontWeight: 500,
}
const tdStyle: React.CSSProperties = {
  padding: "10px 12px", color: "var(--text-m)", verticalAlign: "middle"
}
