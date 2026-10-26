// Small client for Groq's OpenAI-compatible chat API.
// Keys come from GROQ_API_KEYS (comma-separated). When one key is rate-limited
// or rejected, the next one is tried, so the free tiers add up.

const URL = "https://api.groq.com/openai/v1/chat/completions"
const FALLBACK_MODEL = "openai/gpt-oss-20b"

const keys = () => (process.env.GROQ_API_KEYS || "").split(",").map((k) => k.trim()).filter(Boolean)
let next = 0 // spread requests across keys

export const groqConfigured = () => keys().length > 0

// Groq's built-in web search only works on the gpt-oss models
const toolsFor = (model, tools) => {
  if (!tools) return null
  const list = model.startsWith("openai/gpt-oss") ? tools : tools.filter((t) => t.type === "function")
  return list.length ? list : null
}

const call = async (key, model, messages, { tools: allTools, toolChoice, maxTokens, temperature }) => {
  const tools = toolsFor(model, allTools)
  const res = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_completion_tokens: maxTokens,
      ...(tools ? { tools, tool_choice: toolChoice || "auto" } : {}),
      // gpt-oss models think before answering; keep it quick and hide the thinking
      ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low", include_reasoning: false } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, data }
}

// No em/en dashes in anything Nexa writes: number ranges get a hyphen, the rest a comma
export const tidy = (text) =>
  String(text || "")
    .replace(/\s*【[^】]*】/g, "") // web search citation marks like 【1†L4-L6】
    .replace(/(\d)\s*[–—]\s*(\d)/g, "$1-$2")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/^\s*,\s*/gm, "")

// One model turn. Returns the assistant message ({ content, tool_calls? }),
// or throws an Error with a friendly message.
// toolChoice: "auto" (default), or { type: "function", function: { name } } to require that tool
// only: use just `model` (e.g. the vision model; the others can't see images)
export const groqChat = async (messages, { tools = null, toolChoice = null, maxTokens = 700, temperature = 0.6, model: preferred = null, only = false } = {}) => {
  const all = keys()
  if (!all.length) throw new Error("Nexa isn't set up on this server yet.")
  const models = only && preferred ? [preferred] : [preferred, process.env.GROQ_MODEL || "openai/gpt-oss-120b", FALLBACK_MODEL].filter((m, i, a) => m && a.indexOf(m) === i)

  for (const model of models) {
    for (let attempt = 0; attempt < all.length; attempt++) {
      const key = all[next++ % all.length]
      try {
        const { status, data } = await call(key, model, messages, { tools, toolChoice, maxTokens, temperature })
        const message = data.choices?.[0]?.message
        if (status === 200 && message && (message.content?.trim() || message.tool_calls?.length)) return { ...message, content: tidy(String(message.content || "").replace(/<think>[\s\S]*?<\/think>\s*/g, "")) }
        // Rate limited, bad key or server trouble: try the next key
        if ([401, 403, 429].includes(status) || status >= 500 || status === 200) continue
        // Model not available: try the fallback model
        if (status === 404 || ["model_decommissioned", "model_not_found"].includes(data.error?.code)) break
        // The model wrote a broken tool call: try again
        if (data.error?.code === "tool_use_failed") continue
        // Request bigger than the plan allows (tokens per minute): the caller can shrink it
        if (status === 413 || /request too large|reduce your message size/i.test(data.error?.message || "")) {
          throw Object.assign(new Error("That conversation got too long for Nexa. Try a shorter message, or clear the chat."), { code: "too_large" })
        }
        console.log("Groq error:", status, data.error?.message)
        throw new Error("Nexa couldn't answer that. Please try again.")
      } catch (err) {
        if (["TimeoutError", "AbortError"].includes(err.name) || err.message?.startsWith("fetch failed")) continue
        throw err
      }
    }
  }
  throw new Error("Nexa is busy right now. Please try again in a minute.")
}

// Plain text answer (no tools)
export const askGroq = async (messages, options) => (await groqChat(messages, options)).content.trim()

// Speech to text with Whisper. `audio` is a Buffer; returns the transcript text.
export const groqTranscribe = async (audio, filename = "voice.webm", mimeType = "audio/webm") => {
  const all = keys()
  if (!all.length) throw new Error("Nexa isn't set up on this server yet.")
  for (let attempt = 0; attempt < all.length; attempt++) {
    const key = all[next++ % all.length]
    const form = new FormData()
    form.append("file", new Blob([audio], { type: mimeType }), filename)
    form.append("model", "whisper-large-v3-turbo")
    form.append("response_format", "json")
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(60_000),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 200) return String(data.text || "").trim()
      if ([401, 403, 429].includes(res.status) || res.status >= 500) continue
      throw new Error(data.error?.message || "Couldn't transcribe that voice note.")
    } catch (err) {
      if (["TimeoutError", "AbortError"].includes(err.name) || err.message?.startsWith("fetch failed")) continue
      throw err
    }
  }
  throw new Error("Nexa is busy right now. Please try again in a minute.")
}
