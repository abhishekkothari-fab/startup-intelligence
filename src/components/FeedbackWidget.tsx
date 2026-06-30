"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase-auth"

export function FeedbackWidget({ startupId, sectionId, sectionLabel }: { startupId: string | null; sectionId?: string; sectionLabel?: string }) {
  const [open,       setOpen]       = useState(false)
  const [message,    setMessage]    = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done,       setDone]       = useState(false)
  const [err,        setErr]        = useState("")

  async function handleSubmit() {
    if (!message.trim()) return
    setSubmitting(true)
    setErr("")
    try {
      const user = (await createClient().auth.getUser()).data.user
      if (!user?.email) throw new Error("Not signed in")
      const { error } = await createClient().from("startup_feedback").insert({
        startup_id: startupId,
        section_id: sectionId || null,
        section_label: sectionLabel || null,
        message: message.trim(),
        submitted_by: user.email,
      })
      if (error) throw error
      setDone(true)
      setMessage("")
      setTimeout(() => { setOpen(false); setDone(false) }, 1800)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't send feedback")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {open && (
        <div style={{ position: "fixed", bottom: 84, right: 24, width: 320, background: "#fff", borderRadius: 10, boxShadow: "0 8px 28px rgba(17,19,24,0.18)", border: "1px solid var(--border)", zIndex: 601, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--navy)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, fontWeight: 500, color: "#fff", letterSpacing: "0.04em" }}>
              Feedback{sectionLabel ? ` · ${sectionLabel}` : ""}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.8)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
          </div>
          <div style={{ padding: 14 }}>
            {done ? (
              <div style={{ fontSize: 13, color: "var(--green)", padding: "0.5rem 0" }}>Thanks — feedback sent.</div>
            ) : (
              <>
                <textarea
                  autoFocus
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="What's missing, wrong, or worth flagging here?"
                  rows={4}
                  style={{ width: "100%", resize: "none", border: "1px solid var(--border-md)", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: "var(--sans)", outline: "none", color: "var(--text-h)", boxSizing: "border-box" }}
                />
                {err && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>{err}</div>}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting || !message.trim()}
                    style={{
                      fontSize: 12, borderRadius: 6, padding: "6px 16px", border: "none", cursor: submitting || !message.trim() ? "default" : "pointer",
                      color: submitting || !message.trim() ? "var(--text-xs)" : "#fff",
                      background: submitting || !message.trim() ? "var(--bg-soft)" : "var(--navy)",
                    }}
                  >
                    {submitting ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ position: "fixed", bottom: 24, right: 24, background: "var(--navy)", color: "#fff", border: "none", borderRadius: 24, padding: "10px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer", boxShadow: "0 4px 14px rgba(17,19,24,0.2)", zIndex: 601, display: "flex", alignItems: "center", gap: 6 }}
      >
        Feedback
      </button>
    </>
  )
}
