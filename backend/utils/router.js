import { askGroq } from "./groq.js"

// What is the user asking Nexa to do? One quick call to a small, fast model reads the message
// (with the recent chat for follow-ups like "yes" or "the second one") and picks a route, so
// Nexa gets the right tools and instructions instead of guessing from keywords.
// ("find the song Memories on YouTube" is a web search, not a request to write a song.)

export const ROUTES = {
  write: "write something NEW and original: a poem, song lyrics, shayari, story, letter, speech, caption, joke",
  image: "create or change a picture/image/drawing/logo, or edit a photo they sent",
  web: "find or look something up online: a song, video or YouTube link, a movie, news, prices, weather, scores, a place, a product, facts that change over time, any link",
  message: "send, schedule or forward a message, set a reminder, make a poll, or read/summarise one of their chats",
  calendar: "their calendar, meetings, events, Google Meet, tasks or to-dos",
  email: "their email/Gmail: read, search, reply, draft",
  business: "their business account: shop, catalog, products, orders, bookings, customers, coupons, greeting, hours, team, broadcast, sales",
  groups: "create or manage a group, community or channel",
  account: "their own profile, username, privacy, contacts, contact requests, blocking, chat settings (pin, disappearing), status",
  help: "how to use the Kova app or where something is",
  chat: "anything else: questions, explanations, advice, ideas, maths, coding, and rewriting, polishing or translating text they give",
}
const NAMES = Object.keys(ROUTES)

const SYSTEM = `You route a user's message to the right skill of an AI assistant inside a messaging app.
Pick the ONE route that matches what the user wants done with their LATEST message (earlier lines are context for short follow-ups).
${NAMES.map((n) => `${n}: ${ROUTES[n]}`).join("\n")}
Rules:
- "find", "search", "look up", "play", "link", "on YouTube/yt/Spotify", "lyrics of <existing song>", "price of" = web, even for songs or poems that already exist.
- "write/make me a song/poem/shayari" = write. Making their own text more polite/shorter/professional, or translating it = chat.
- Reminders ("remind me at 6…") = message. "How do I…" questions about the app = help.
Answer with the route name only.`

// Clear search wording always means a web search (the small model sometimes says "help" or "chat")
const SEARCH_RE = /\b(find|search|look ?up|google|play|link (to|for)|youtube|yt|spotify|jiosaavn|gaana|lyrics( of| for| to)?\b(?!.*\b(write|compose|likh)))|\b(price (of|in|for)|trailer|where can i (watch|buy|listen)|latest news|weather)\b/i
const WRITE_RE = /\b(write|compose|create|make|generate|likh|bana)\b/i

const cache = new Map() // same text + context -> route, for Regenerate / quick repeats

// Returns one of ROUTES, or null when the router couldn't decide (the caller falls back)
export const routeRequest = async (text, recent = "") => {
  const q = String(text || "").trim().slice(0, 600)
  if (!q) return null
  const key = `${q}\n${String(recent).slice(-300)}`
  if (cache.has(key)) return cache.get(key)
  try {
    const out = await askGroq([
      { role: "system", content: SYSTEM },
      { role: "user", content: `${recent ? `Recent chat:\n${String(recent).slice(-700)}\n\n` : ""}Latest message: ${q}` },
    ], { model: "openai/gpt-oss-20b", maxTokens: 300, temperature: 0, reasoning: "low" })
    // The first route name in the answer
    const first = String(out).toLowerCase().match(new RegExp(`\\b(${NAMES.join("|")})\\b`))?.[1]
    let route = first || null
    if (SEARCH_RE.test(q) && ["help", "chat", "write"].includes(route) && !/\b(write|compose)\b/i.test(q)) route = "web"
    if (!route && SEARCH_RE.test(q) && !WRITE_RE.test(q)) route = "web"
    if (route) {
      cache.set(key, route)
      if (cache.size > 500) cache.delete(cache.keys().next().value)
    }
    return route
  } catch {
    // The router didn't answer (network, busy): clear search wording still means a web search
    return SEARCH_RE.test(q) && !WRITE_RE.test(q) ? "web" : null
  }
}
