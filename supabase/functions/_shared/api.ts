// supabase/functions/_shared/api.ts

function timedFetch(url: string, options: RequestInit, ms: number): Promise<Response> {
  return fetch(url, { ...options, signal: AbortSignal.timeout(ms) })
}

// Extract complete JSON objects from a partially-truncated array (e.g. raw_fields, youtube, linkedin).
// Returns a valid JSON string with whatever complete items fit, plus "_tokens_exhausted": true.
function salvagePartialJson(partial: string): string | null {
  const start = partial.indexOf("{")
  if (start === -1) return null
  const json = partial.slice(start)

  const arrayKeyMatch = json.match(/"(raw_fields|youtube|linkedin)"\s*:\s*\[/)
  if (!arrayKeyMatch) return null

  const key = arrayKeyMatch[1]
  const arrayStart = json.indexOf("[", arrayKeyMatch.index!)
  const items = extractCompleteObjects(json, arrayStart)
  if (items.length === 0) return null

  console.warn(`[claudeCall] Salvaged ${items.length} complete ${key} items from truncated response`)
  return JSON.stringify({ [key]: items, _tokens_exhausted: true })
}

// Walk a JSON string starting at arrayStart, extracting every top-level complete {...} object.
// Handles nested braces and quoted strings (including escape sequences).
function extractCompleteObjects(json: string, arrayStart: number): unknown[] {
  const items: unknown[] = []
  let depth = 0, itemStart = -1
  let inString = false, escape = false

  for (let i = arrayStart + 1; i < json.length; i++) {
    const ch = json[i]
    if (escape)               { escape = false; continue }
    if (ch === "\\" && inString) { escape = true; continue }
    if (ch === '"')           { inString = !inString; continue }
    if (inString)             continue

    if (ch === "{") {
      if (depth === 0) itemStart = i
      depth++
    } else if (ch === "}") {
      depth--
      if (depth === 0 && itemStart !== -1) {
        try { items.push(JSON.parse(json.slice(itemStart, i + 1))) } catch { /* skip malformed */ }
        itemStart = -1
      }
    } else if (ch === "]" && depth === 0) {
      break
    }
  }
  return items
}

export async function claudeCall(
  apiKey: string,
  system: string,
  userMsg: string,
  maxTokens: number,
  maxSearches: number,
  deadlineMs: number,   // absolute wall-clock deadline (Date.now()-based)
  model = "claude-sonnet-4-6",
  abortSignal?: AbortSignal
): Promise<{ text: string | null; tokensIn: number; tokensOut: number } | null> {
  const messages: Array<{ role: string; content: unknown }> = [
    { role: "user", content: userMsg }
  ]
  const bodyBase: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    temperature: 0,
  }
  if (maxSearches > 0) {
    bodyBase.tools = [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches, allowed_callers: ["direct"] }]
  }

  let totalTokensIn = 0
  let totalTokensOut = 0
  let searchesDone = 0
  // Haiku supports assistant prefill; Sonnet 4+ does not (returns 400 invalid_request_error).
  const supportsPrefill = model.includes("haiku")

  // Single API call — handles rate-limit retries internally so they don't consume
  // search or synthesis attempts.
  async function call(): Promise<Record<string, unknown> | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (abortSignal?.aborted) return null
      const perFetchMs = Math.max(Math.min(120_000, deadlineMs - Date.now() - 5_000), 5_000)
      let res: Response
      try {
        res = await timedFetch(
          "https://api.anthropic.com/v1/messages",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "prompt-caching-2024-07-31",
            },
            body: JSON.stringify({ ...bodyBase, messages }),
          },
          perFetchMs
        )
      } catch (e) {
        throw new Error(`API call failed: ${e}`)
      }
      if (res.status === 429) {
        const retryAfter = Math.min(parseInt(res.headers.get("retry-after") || "10", 10), 10)
        console.warn(`Rate limited — waiting ${retryAfter}s`)
        await new Promise(r => setTimeout(r, retryAfter * 1000))
        continue
      }
      if (res.status === 400) {
        const body = await res.text()
        if (body.includes("credit balance") || body.includes("insufficient_quota") || body.includes("credit")) {
          throw new Error("ANTHROPIC_CREDITS_EXHAUSTED")
        }
        throw new Error(`Anthropic API error 400: ${body}`)
      }
      if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`)
      const data = await res.json()
      totalTokensIn += (data as Record<string, any>).usage?.input_tokens ?? 0
      totalTokensOut += (data as Record<string, any>).usage?.output_tokens ?? 0
      return data as Record<string, unknown>
    }
    return null
  }

  // ── Phase 1: Search loop ───────────────────────────────────────────
  // Runs until all searches are exhausted or the model synthesises early.
  // Rate-limit retries happen inside call() and never consume a search slot.
  let earlyData: Record<string, unknown> | null = null

  while (maxSearches > 0 && searchesDone < maxSearches) {
    if (abortSignal?.aborted) return null
    const data = await call()
    if (!data) return null

    if (data.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: data.content })
      const toolResults = (data.content as { type: string; id: string }[])
        .filter(b => b.type === "tool_use")
        .map(b => ({ type: "tool_result", tool_use_id: b.id, content: "" }))
      searchesDone += toolResults.length
      const allExhausted = searchesDone >= maxSearches
      if (allExhausted && supportsPrefill) {
        messages.push({ role: "user", content: toolResults })
        messages.push({ role: "assistant", content: [{ type: "text", text: "{" }] })
      } else if (allExhausted) {
        // Merge into one user message — two consecutive user messages are invalid
        messages.push({ role: "user", content: [...toolResults, { type: "text", text: "All searches complete. Now output ONLY the JSON object — start with { and end with }. No prose, no markdown." }] })
      } else {
        messages.push({ role: "user", content: toolResults })
      }
    } else {
      // Model synthesised before exhausting all searches — carry the response into phase 2.
      earlyData = data
      break
    }
  }

  // ── Phase 2: Synthesis loop (4 dedicated attempts) ─────────────────
  // Searches are done; this budget is independent of how many searches ran.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (abortSignal?.aborted) return null

    // Reuse a response already fetched during phase 1 (early synthesis), else make a new call.
    let data: Record<string, unknown> | null
    if (earlyData !== null) {
      data = earlyData
      earlyData = null
    } else {
      data = await call()
    }
    if (!data) return null

    const stopReason = data.stop_reason as string
    console.log(`[claudeCall] phase2 attempt=${attempt} stopReason=${stopReason} model=${model}`)

    if (stopReason === "end_turn" || stopReason === "stop_sequence") {
      console.log(`[tokens] model=${model} in=${totalTokensIn} out=${totalTokensOut} limit=${maxTokens}`)
      const text = (data.content as { type: string; text?: string }[])
        .filter(b => b.type === "text")
        .map(b => b.text || "")
        .join("")
      console.log(`[claudeCall] phase2 text_starts_with_brace=${text.trim().startsWith("{")} text_preview=${JSON.stringify(text.trim().slice(0, 80))}`)
      // Try to extract JSON even if wrapped in prose — find first { to last } and validate.
      const s = text.indexOf("{"), e = text.lastIndexOf("}")
      if (s !== -1 && e !== -1) {
        try {
          const extracted = text.slice(s, e + 1)
          JSON.parse(extracted)  // validate only — caller re-parses with full cite/markdown cleanup
          if (!text.trim().startsWith("{")) console.warn(`[claudeCall] Extracted JSON from prose wrapper (saved a correction call)`)
          return { text: extracted, tokensIn: totalTokensIn, tokensOut: totalTokensOut }
        } catch { /* fall through to correction */ }
      }
      console.warn(`[claudeCall] Response not parseable JSON, sending format correction`)
      messages.push({ role: "assistant", content: data.content })
      messages.push({ role: "user", content: "Your response must start with { and end with }. Return ONLY the JSON object with no other text, explanation, or markdown." })
      if (supportsPrefill) {
        messages.push({ role: "assistant", content: [{ type: "text", text: "{" }] })
      }
      continue
    }

    if (stopReason === "max_tokens") {
      console.log(`[tokens] TRUNCATED model=${model} in=${totalTokensIn} out=${totalTokensOut} limit=${maxTokens}`)
      const partial = (data.content as { type: string; text?: string }[])
        .filter(b => b.type === "text")
        .map(b => b.text || "")
        .join("")
      if (partial.trim()) {
        // 1. Try to close the truncated JSON at the last complete brace
        const jsonStart = partial.indexOf("{")
        let text = jsonStart > 0 ? partial.slice(jsonStart) : partial
        const lastBrace = text.lastIndexOf("}")
        let repaired = false
        if (lastBrace >= 0) {
          const base = text.slice(0, lastBrace + 1)
          for (const suffix of ["", "]}", "}}", "]}}"] as const) {
            try { JSON.parse(base + suffix); text = base + suffix; repaired = true; break } catch { /* try next */ }
          }
        }
        if (repaired) return { text, tokensIn: totalTokensIn, tokensOut: totalTokensOut }

        // 2. Extract whatever complete array items fit within the budget
        const salvaged = salvagePartialJson(partial)
        if (salvaged) return { text: salvaged, tokensIn: totalTokensIn, tokensOut: totalTokensOut }

        // 3. Last resort: ask for a minimal JSON from what was already identified
        console.warn(`[claudeCall] Truncation salvage failed, requesting minimal JSON`)
        messages.push({ role: "assistant", content: data.content })
        messages.push({ role: "user", content: "Your response was cut off. Return a minimal but valid JSON with only the scalar fields you already identified — no arrays, no nested objects, just key: value pairs you are certain of." })
        if (supportsPrefill) {
          messages.push({ role: "assistant", content: [{ type: "text", text: "{" }] })
        }
        continue
      }
    }

    if (stopReason === "tool_use") {
      // Model tried to search again in phase 2 despite instructions — return empty results and force synthesis.
      console.warn(`[claudeCall] phase2 got tool_use — returning empty results and forcing synthesis`)
      messages.push({ role: "assistant", content: data.content })
      const toolResults = (data.content as { type: string; id: string }[])
        .filter(b => b.type === "tool_use")
        .map(b => ({ type: "tool_result", tool_use_id: b.id, content: "No additional results available." }))
      if (supportsPrefill) {
        messages.push({ role: "user", content: toolResults })
        messages.push({ role: "assistant", content: [{ type: "text", text: "{" }] })
      } else {
        messages.push({ role: "user", content: [...toolResults, { type: "text", text: "All searches complete. Now output ONLY the JSON object — start with { and end with }. No prose, no markdown." }] })
      }
      continue
    }

    console.warn(`[claudeCall] phase2 unexpected stopReason=${stopReason} — breaking`)
    break  // unexpected stop_reason or empty max_tokens content
  }

  console.error(`[claudeCall] EXHAUSTED model=${model} in=${totalTokensIn} out=${totalTokensOut} maxTokens=${maxTokens} searches=${searchesDone}`)
  return { text: null, tokensIn: totalTokensIn, tokensOut: totalTokensOut }
}
