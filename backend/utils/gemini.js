// Google Gemini for Nexa's chat (OpenAI-compatible endpoint), with web search through
// Gemini's Google Search grounding. Answers come back in the same shape as Groq's, so the
// rest of the app doesn't care which one answered.

const CHAT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
const SEARCH_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite"
const keys = () => (process.env.GEMINI_API_KEY || "").split(",").map((k) => k.trim()).filter(Boolean)
let next = 0
let searchDownUntil = 0 // grounded search refused (quota): skip it for a while
export const geminiConfigured = () => keys().length > 0

const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web for anything current or factual you aren't sure about: news, prices, weather, sports, releases, places, songs, people.",
    parameters: { type: "object", properties: { query: { type: "string", description: "What to search for" } }, required: ["query"] },
  },
}

class GeminiError extends Error {
  constructor(message, status) { super(message); this.status = status }
}

const post = async (url, body, timeout = 45_000) => {
  const all = keys()
  let last
  for (let attempt = 0; attempt < all.length; attempt++) {
    const key = all[next++ % all.length]
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) return data
    last = new GeminiError(data.error?.message || `Gemini error ${res.status}`, res.status)
    if ([401, 403, 429].includes(res.status) || res.status >= 500) continue
    throw last
  }
  throw last || new GeminiError("Gemini isn't set up", 0)
}

// Grounding links are Google redirect URLs: follow them to the real page (short timeout)
const realUrl = async (url) => {
  if (!/grounding-api-redirect|vertexaisearch/.test(url)) return url
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(3000) })
    return res.headers.get("location") || url
  } catch { return url }
}

// One grounded search: a short answer plus the pages it used
const webSearch = async (query) => {
  const data = await post(SEARCH_URL(GEMINI_MODEL()), {
    contents: [{ role: "user", parts: [{ text: `Search the web and answer briefly with the key facts (names, numbers, dates, links found): ${query}` }] }],
    tools: [{ google_search: {} }],
  }, 30_000)
  const cand = data.candidates?.[0]
  const text = (cand?.content?.parts || []).map((p) => p.text || "").join("").trim()
  const chunks = (cand?.groundingMetadata?.groundingChunks || []).map((c) => c.web).filter((w) => w?.uri).slice(0, 8)
  const results = await Promise.all(chunks.map(async (w) => ({ title: w.title || "", url: await realUrl(w.uri) })))
  return { text, results }
}

const tidyMessage = (m) => ({ ...m, content: typeof m.content === "string" ? m.content : (m.content || "") })

// Same contract as groqChat: returns { content, tool_calls?, executed_tools? }.
// "browser_search" in tools becomes our web_search, which runs here (not in the caller).
export const geminiChat = async (messages, { tools = null, toolChoice = null, maxTokens = 700, temperature = 0.6, reasoning = "low" } = {}) => {
  if (!geminiConfigured()) throw new GeminiError("Gemini isn't set up", 0)
  const wantsSearch = !!tools?.some((t) => t.type === "browser_search")
  const fnTools = [...(tools || []).filter((t) => t.type === "function"), ...(wantsSearch ? [WEB_SEARCH_TOOL] : [])]
  const convo = [...messages]
  const executed = []

  for (let round = 0; round < 3; round++) {
    const body = {
      model: GEMINI_MODEL(),
      messages: convo,
      max_tokens: Math.max(maxTokens, 400),
      temperature,
      reasoning_effort: reasoning === "high" ? "high" : reasoning === "medium" ? "medium" : "low",
      ...(fnTools.length ? { tools: fnTools, tool_choice: round === 0 && toolChoice ? toolChoice : "auto" } : {}),
    }
    const data = await post(CHAT_URL, body)
    const msg = data.choices?.[0]?.message
    if (!msg) throw new GeminiError("Empty answer from Gemini", 502)
    const calls = msg.tool_calls || []
    const searches = calls.filter((c) => c.function?.name === "web_search")
    // No search to run: hand the answer (or the other tool calls) back to the caller
    if (!searches.length) return { ...tidyMessage(msg), executed_tools: executed }
    convo.push({ role: "assistant", content: msg.content || "", tool_calls: calls })
    for (const c of calls) {
      if (c.function?.name !== "web_search") {
        // Mixed turn: let the caller run its tools; searches already done are reported
        return { ...tidyMessage(msg), tool_calls: calls.filter((x) => x.function?.name !== "web_search"), executed_tools: executed }
      }
      let args = {}
      try { args = JSON.parse(c.function.arguments || "{}") } catch { /* empty query */ }
      // Grounded search isn't on every plan (free keys often get 429): hand this turn to the
      // backup (Groq, which has its own web search) instead of answering without facts
      if (Date.now() < searchDownUntil) throw new GeminiError("Gemini web search unavailable", 429)
      let result
      try {
        result = await webSearch(String(args.query || "").slice(0, 300))
      } catch (err) {
        if ([401, 403, 429].includes(err.status)) searchDownUntil = Date.now() + 30 * 60_000
        throw new GeminiError(`Gemini web search failed: ${err.message}`, err.status || 502)
      }
      // Same shape as Groq's built-in search, so sources and link checks keep working
      executed.push({ type: "browser_search", arguments: JSON.stringify({ query: args.query }), search_results: { results: result.results } })
      convo.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify({ answer: result.text, sources: result.results }) })
    }
  }
  throw new GeminiError("Gemini kept searching without answering", 502)
}
