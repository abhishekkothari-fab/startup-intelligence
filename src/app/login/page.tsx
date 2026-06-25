"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase-auth"

export default function LoginPage() {
  const [email,   setEmail]   = useState("")
  const [otp,     setOtp]     = useState("")
  const [step,    setStep]    = useState<"email" | "otp">("email")
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState("")

  const supabase = createClient()

  async function handleSendOtp() {
    if (!email.trim()) return
    setLoading(true); setError("")
    try {
      const addr = email.toLowerCase().trim()

      const { data, error: dbErr } = await supabase
        .from("allowed_emails")
        .select("email")
        .eq("email", addr)
        .maybeSingle()

      if (dbErr) throw new Error("Could not verify access")
      if (!data) {
        setError("This email isn't on the access list. Ask the admin to add it.")
        setLoading(false)
        return
      }

      const { error: authErr } = await supabase.auth.signInWithOtp({
        email: addr,
        options: { shouldCreateUser: true },
      })
      if (authErr) throw authErr
      setStep("otp")
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyOtp() {
    if (!otp.trim()) return
    setLoading(true); setError("")
    try {
      const { error: authErr } = await supabase.auth.verifyOtp({
        email: email.toLowerCase().trim(),
        token: otp.trim(),
        type: "email",
      })
      if (authErr) throw authErr
      window.location.href = "/"
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Invalid code. Check your email and try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>

      {/* Topbar */}
      <header style={{ background: "var(--navy)", height: 56, display: "flex", alignItems: "center", padding: "0 1.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 30, height: 30, background: "#fff", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--mono)", fontSize: 11, color: "var(--navy)", fontWeight: 700 }}>SI</div>
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15 }}>Startup Intelligence</span>
        </div>
      </header>

      {/* Card */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem" }}>
        <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 12, padding: "2.5rem 2rem", width: "100%", maxWidth: 400, boxShadow: "0 4px 24px rgba(30,58,95,0.07)" }}>

          {step === "email" ? (
            <>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-xs)", marginBottom: "0.75rem" }}>Access required</div>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: "var(--text-h)", marginBottom: "0.5rem" }}>Sign in</h1>
              <p style={{ fontSize: 13, color: "var(--text-s)", marginBottom: "1.75rem", lineHeight: 1.6 }}>
                Enter your email and we&apos;ll send a one-time code.
              </p>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-s)", marginBottom: "0.5rem" }}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSendOtp()}
                placeholder="you@example.com"
                autoFocus
                style={{ width: "100%", border: "1px solid var(--border-md)", borderRadius: 6, padding: "10px 12px", fontSize: 14, outline: "none", marginBottom: "1rem", boxSizing: "border-box" }}
              />
              {error && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: "1rem", lineHeight: 1.5 }}>{error}</p>}
              <button
                onClick={handleSendOtp}
                disabled={loading || !email.trim()}
                style={{ width: "100%", background: loading || !email.trim() ? "var(--bg-soft)" : "var(--navy)", color: loading || !email.trim() ? "var(--text-xs)" : "#fff", border: "none", borderRadius: 6, padding: "11px", fontSize: 14, fontWeight: 500, cursor: loading || !email.trim() ? "default" : "pointer", transition: "background 0.15s" }}
              >
                {loading ? "Sending…" : "Send code →"}
              </button>
            </>
          ) : (
            <>
              <div style={{ fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--text-xs)", marginBottom: "0.75rem" }}>Check your email</div>
              <h1 style={{ fontFamily: "var(--serif)", fontSize: 22, fontWeight: 700, color: "var(--text-h)", marginBottom: "0.5rem" }}>Enter the code</h1>
              <p style={{ fontSize: 13, color: "var(--text-s)", marginBottom: "1.75rem", lineHeight: 1.6 }}>
                We sent a 6-digit code to <strong style={{ color: "var(--text-m)" }}>{email}</strong>
              </p>
              <label style={{ display: "block", fontFamily: "var(--mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-s)", marginBottom: "0.5rem" }}>One-time code</label>
              <input
                type="text"
                value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                onKeyDown={e => e.key === "Enter" && handleVerifyOtp()}
                placeholder="123456"
                autoFocus
                maxLength={6}
                style={{ width: "100%", border: "1px solid var(--border-md)", borderRadius: 6, padding: "10px 12px", fontSize: 20, fontFamily: "var(--mono)", outline: "none", letterSpacing: "0.2em", textAlign: "center", marginBottom: "1rem", boxSizing: "border-box" }}
              />
              {error && <p style={{ fontSize: 12, color: "var(--red)", marginBottom: "1rem", lineHeight: 1.5 }}>{error}</p>}
              <button
                onClick={handleVerifyOtp}
                disabled={loading || otp.length < 6}
                style={{ width: "100%", background: loading || otp.length < 6 ? "var(--bg-soft)" : "var(--navy)", color: loading || otp.length < 6 ? "var(--text-xs)" : "#fff", border: "none", borderRadius: 6, padding: "11px", fontSize: 14, fontWeight: 500, cursor: loading || otp.length < 6 ? "default" : "pointer", transition: "background 0.15s" }}
              >
                {loading ? "Verifying…" : "Verify →"}
              </button>
              <button
                onClick={() => { setStep("email"); setOtp(""); setError("") }}
                style={{ width: "100%", background: "transparent", border: "none", color: "var(--text-s)", fontSize: 12, cursor: "pointer", marginTop: "0.75rem", padding: "6px" }}
              >
                ← Use a different email
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
